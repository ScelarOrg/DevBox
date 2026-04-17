# Tailwind CSS WASM Research Report

## Executive Summary

Tailwind CSS v4 has two distinct mechanisms for running outside native environments:

1. **`@tailwindcss/oxide-wasm32-wasi`** -- A WebAssembly build of the Oxide scanner (the Rust part that walks the filesystem and extracts candidate class names from source files). This is used by build tools (PostCSS plugin, Vite plugin, CLI) in environments like StackBlitz/WebContainers where native `.node` binaries cannot run.

2. **`@tailwindcss/browser`** -- A pure JavaScript browser build that bypasses Oxide entirely. It uses DOM MutationObserver to detect class names on the page and feeds them into the TypeScript-based CSS compiler. This is the "Play CDN" used via `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>`.

These are completely different approaches. For a custom JS runtime like **nodepod**, the relevant target is `@tailwindcss/oxide-wasm32-wasi`, since nodepod needs to run the full Tailwind build pipeline (PostCSS/Vite plugin -> Oxide Scanner -> CSS compiler).

---

## 1. Architecture Overview

### How Tailwind CSS v4 Works (Build-time)

```
Source Files (.html, .jsx, .vue, etc.)
        |
        v
  @tailwindcss/oxide (Rust/napi-rs)
  - Scanner walks filesystem via glob patterns
  - Extracts candidate class names using Rust parser
  - Uses rayon for parallel file reading/extraction
        |
        v
  tailwindcss (TypeScript)
  - compile() creates CSS compiler from @import "tailwindcss"
  - build(candidates) generates CSS for found class names
        |
        v
  Output CSS
```

The Oxide scanner is used by:
- `@tailwindcss/postcss` (PostCSS plugin)
- `@tailwindcss/vite` (Vite plugin)
- `@tailwindcss/cli` (CLI tool)
- `@tailwindcss/webpack` (Webpack plugin)

All of these import `{ Scanner } from '@tailwindcss/oxide'`.

### Native vs WASM Loading

The `@tailwindcss/oxide` package has a generated `index.js` that implements this resolution order:

1. Check `NAPI_RS_NATIVE_LIBRARY_PATH` env var
2. Try loading local `.node` binary (e.g., `tailwindcss-oxide.win32-x64-msvc.node`)
3. Try loading platform-specific npm package (e.g., `@tailwindcss/oxide-win32-x64-msvc`)
4. **If all native bindings fail OR `NAPI_RS_FORCE_WASI` is set**, fall back to WASM:
   - Try local `tailwindcss-oxide.wasi.cjs`
   - Try `@tailwindcss/oxide-wasm32-wasi` package

Key code from the generated `index.js`:
```js
nativeBinding = requireNative()

if (!nativeBinding || process.env.NAPI_RS_FORCE_WASI) {
  try {
    wasiBinding = require('./tailwindcss-oxide.wasi.cjs')
    nativeBinding = wasiBinding
  } catch (err) { ... }
  if (!nativeBinding) {
    try {
      wasiBinding = require('@tailwindcss/oxide-wasm32-wasi')
      nativeBinding = wasiBinding
    } catch (err) { ... }
  }
}
```

---

## 2. WASM Build Configuration

### Target

- **Rust target**: `wasm32-wasip1-threads`
- **Rust toolchain**: 1.85.0 (stable)
- Built via napi-rs v3 CLI: `napi build --release --target wasm32-wasip1-threads`

### napi Configuration (from `crates/node/package.json`)

```json
{
  "napi": {
    "binaryName": "tailwindcss-oxide",
    "packageName": "@tailwindcss/oxide",
    "targets": [
      "aarch64-apple-darwin",
      "x86_64-unknown-linux-gnu",
      "wasm32-wasip1-threads"
    ],
    "wasm": {
      "initialMemory": 16384,
      "browser": {
        "fs": true
      }
    }
  }
}
```

- `wasm.initialMemory: 16384` sets the initial WebAssembly.Memory to 16,384 pages (1 GB).
- `wasm.browser.fs: true` enables filesystem proxy support in the browser build.

### Build Scripts

```json
{
  "build": "pnpm run build:platform && pnpm run build:wasm",
  "build:platform": "napi build --platform --release",
  "build:wasm": "napi build --release --target wasm32-wasip1-threads"
}
```

### CI Setup

The CI workflow adds the WASM target before building:
```yaml
- name: Setup WASM target
  run: rustup target add wasm32-wasip1-threads
```

### No Special RUSTFLAGS for WASM

The `.cargo/config.toml` in `crates/node` has NO WASM-specific RUSTFLAGS. The napi-rs CLI handles all WASM-specific build configuration internally.

### Release LTO

The workspace `Cargo.toml` enables LTO for release builds (`lto = true`), but CI overrides this for faster builds: `CARGO_PROFILE_RELEASE_LTO: 'off'`

---

## 3. Generated Artifacts

The `napi build --target wasm32-wasip1-threads` command generates these files:

| File | Purpose | Size |
|------|---------|------|
| `tailwindcss-oxide.wasm32-wasi.wasm` | The compiled WASM binary | 1.7 MB |
| `tailwindcss-oxide.wasi.cjs` | Node.js WASI loader (CJS) | 3.5 KB |
| `tailwindcss-oxide.wasi-browser.js` | Browser WASI loader (ESM) | 1.7 KB |
| `wasi-worker.mjs` | Node.js worker thread script | 1.5 KB |
| `wasi-worker-browser.mjs` | Browser Web Worker script | 1.0 KB |

Total published package size (with bundled deps): **~11 MB** (including bundled `node_modules`).

---

## 4. The Loading Mechanism (Node.js)

### `tailwindcss-oxide.wasi.cjs` -- Complete Analysis

This is the auto-generated Node.js WASI loader created by napi-rs:

```js
// 1. Create WASI instance with filesystem access
const __wasi = new __nodeWASI({
  version: 'preview1',
  env: process.env,
  preopens: {
    [__rootDir]: __rootDir,  // e.g., '/' on Linux, 'C:\\' on Windows
  }
})

// 2. Create shared memory (1GB initial, 4GB max)
const __sharedMemory = new WebAssembly.Memory({
  initial: 16384,   // 16384 * 64KB = 1 GB
  maximum: 65536,   // 65536 * 64KB = 4 GB
  shared: true,
})

// 3. Load WASM binary from disk
let __wasmFilePath = __nodePath.join(__dirname, 'tailwindcss-oxide.wasm32-wasi.wasm')

// 4. Instantiate via emnapi
const { instance, module, napiModule } = __emnapiInstantiateNapiModuleSync(
  __nodeFs.readFileSync(__wasmFilePath),
  {
    context: __emnapiContext,
    asyncWorkPoolSize: 4,  // Default thread pool size
    reuseWorker: true,
    wasi: __wasi,

    onCreateWorker() {
      const worker = new Worker(path.join(__dirname, 'wasi-worker.mjs'), {
        env: process.env,
      })
      worker.onmessage = ({ data }) => {
        __wasmCreateOnMessageForFsProxy(__nodeFs)(data)
      }
      worker.unref();
      return worker
    },

    overwriteImports(importObject) {
      importObject.env = {
        ...importObject.env,
        ...importObject.napi,
        ...importObject.emnapi,
        memory: __sharedMemory,
      }
    },

    beforeInit({ instance }) {
      for (const name of Object.keys(instance.exports)) {
        if (name.startsWith('__napi_register__')) {
          instance.exports[name]()
        }
      }
    },
  }
)

module.exports = __napiModule.exports
module.exports.Scanner = __napiModule.exports.Scanner
```

### Worker unref hack

The loader hacks Node.js internals to prevent workers from keeping the process alive:

```js
const kPublicPort = Object.getOwnPropertySymbols(worker)
  .find(s => s.toString().includes("kPublicPort"));
if (kPublicPort) worker[kPublicPort].ref = () => {};
const kHandle = Object.getOwnPropertySymbols(worker)
  .find(s => s.toString().includes("kHandle"));
if (kHandle) worker[kHandle].ref = () => {};
worker.unref();
```

### Worker Thread Script (`wasi-worker.mjs`)

Each worker:
1. Sets up browser-like `globalThis` (self, postMessage, importScripts)
2. Creates its own WASI instance with the same preopens
3. Uses `MessageHandler` from `@napi-rs/wasm-runtime`
4. On `onLoad`, instantiates the WASM module with `childThread: true`
5. Shares the same `WebAssembly.Memory` across all threads

```js
const handler = new MessageHandler({
  onLoad({ wasmModule, wasmMemory }) {
    const wasi = new WASI({
      version: 'preview1',
      env: process.env,
      preopens: { [__rootDir]: __rootDir },
    });
    return instantiateNapiModuleSync(wasmModule, {
      childThread: true,
      wasi,
      context: emnapiContext,
      overwriteImports(importObject) {
        importObject.env = {
          ...importObject.env,
          ...importObject.napi,
          ...importObject.emnapi,
          memory: wasmMemory
        };
      },
    });
  },
});
```

---

## 5. The Loading Mechanism (Browser)

### `tailwindcss-oxide.wasi-browser.js`

```js
import { memfs } from '@napi-rs/wasm-runtime/fs'

export const { fs: __fs, vol: __volume } = memfs()

const __wasi = new __WASI({
  version: 'preview1',
  fs: __fs,           // memfs, not real fs
  preopens: { '/': '/' },
})

const __wasmUrl = new URL('./tailwindcss-oxide.wasm32-wasi.wasm', import.meta.url).href
const __wasmFile = await fetch(__wasmUrl).then((res) => res.arrayBuffer())

const __sharedMemory = new WebAssembly.Memory({
  initial: 16384, maximum: 65536, shared: true,
})

const { napiModule } = __emnapiInstantiateNapiModuleSync(__wasmFile, {
  asyncWorkPoolSize: 4,
  wasi: __wasi,
  onCreateWorker() {
    const worker = new Worker(
      new URL('./wasi-worker-browser.mjs', import.meta.url),
      { type: 'module' }
    )
    worker.addEventListener('message', __wasmCreateOnMessageForFsProxy(__fs))
    return worker
  },
})

export default __napiModule.exports
export const Scanner = __napiModule.exports.Scanner
```

### Browser Worker (`wasi-worker-browser.mjs`)

```js
import { instantiateNapiModuleSync, MessageHandler, WASI, createFsProxy }
  from '@napi-rs/wasm-runtime'
import { memfsExported as __memfsExported }
  from '@napi-rs/wasm-runtime/fs'

const fs = createFsProxy(__memfsExported)

const handler = new MessageHandler({
  onLoad({ wasmModule, wasmMemory }) {
    const wasi = new WASI({
      fs,
      preopens: { '/': '/' },
    })
    return instantiateNapiModuleSync(wasmModule, {
      childThread: true,
      wasi,
      overwriteImports(importObject) {
        importObject.env = {
          ...importObject.env,
          ...importObject.napi,
          ...importObject.emnapi,
          memory: wasmMemory,
        }
      },
    })
  },
})
```

---

## 6. The Filesystem Proxy Mechanism

WASM worker threads cannot directly access the filesystem. Workers use `createFsProxy`:

1. Creates a `SharedArrayBuffer` of 10,240 + 16 bytes
2. Posts a message to main thread with fs operation name and args
3. Blocks via `Atomics.wait()` until main thread responds
4. Main thread executes the fs operation and writes result back

```js
// Worker side (createFsProxy)
return function (...args) {
  const sab = new SharedArrayBuffer(16 + 10240)
  const i32arr = new Int32Array(sab)
  Atomics.store(i32arr, 0, 21)  // waiting
  postMessage({ __fs__: { sab: i32arr, type: methodName, payload: args } })
  Atomics.wait(i32arr, 0, 21)   // block
  const status = Atomics.load(i32arr, 0)  // 0=success, 1=error
  // ... decode and return
}

// Main thread side (createOnMessage)
function onMessage(e) {
  if (e.data.__fs__) {
    const { sab, type, payload } = e.data.__fs__
    try {
      const ret = fs[type].apply(fs, payload)
      Atomics.store(sab, 0, 0)  // success
    } catch (err) {
      Atomics.store(sab, 0, 1)  // error
    } finally {
      Atomics.notify(sab, 0)
    }
  }
}
```

### SharedArrayBuffer Layout

```
Bytes 0-3:    status (int32)  - 21=waiting, 0=success, 1=error
Bytes 4-7:    type (int32)    - napi_valuetype enum
Bytes 8-15:   payload_size (uint32)
Bytes 16+:    payload_content (up to 10,240 bytes)
```

---

## 7. Threading Model

### In Native

Oxide uses **rayon** for parallel processing:
- `par_iter()` for parallel candidate extraction
- `par_sort_unstable()` for parallel sorting
- `into_par_iter()` for parallel file reading
- `walk_parallel()` for parallel filesystem walking (watch mode)

### In WASM

- Compiled with `wasm32-wasip1-threads` -- threads work via Web Workers
- `rayon` works because this target supports `std::thread`
- All threads share the same `WebAssembly.Memory` (with `shared: true`)
- Default async work pool size: **4 workers**
- Configurable via `NAPI_RS_ASYNC_WORK_POOL_SIZE` or `UV_THREADPOOL_SIZE`

### SharedArrayBuffer Requirements

- Required for:
  1. Shared WebAssembly.Memory across main + worker threads
  2. The fs-proxy mechanism (Atomics.wait/notify pattern)
- Browser deployment requires CORS headers:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`

---

## 8. The Oxide Scanner API Surface

The WASM build exposes the exact same API as native:

```typescript
class Scanner {
  constructor(opts: ScannerOptions)
  scan(): Array<string>
  scanFiles(input: Array<ChangedContent>): Array<string>
  getCandidatesWithPositions(input: ChangedContent): Array<CandidateWithPosition>
  get files(): Array<string>
  get globs(): Array<GlobEntry>
  get normalizedSources(): Array<GlobEntry>
}

interface ScannerOptions { sources?: Array<SourceEntry> }
interface SourceEntry { base: string; pattern: string; negated: boolean }
interface ChangedContent { file?: string; content?: string; extension: string }
```

When `ChangedContent.file` is provided, Rust reads via `std::fs::read_to_string` through WASI:
- **Node.js**: `node:wasi` preopened directories -> real filesystem
- **Browser**: fs-proxy mechanism -> memfs

---

## 9. Dependency Stack

```
@tailwindcss/oxide-wasm32-wasi
+-- @napi-rs/wasm-runtime@1.1.1    (5.0 MB)  Glue: emnapi + WASI + fs-proxy
|   +-- @emnapi/core@1.8.1         (1.8 MB)  Node-API implementation for WASM
|   +-- @emnapi/runtime@1.8.1      (462 KB)  napi runtime helpers
|   +-- @tybys/wasm-util@0.10.1    (851 KB)  WASI preview1 polyfill (browser)
+-- @emnapi/wasi-threads@1.1.0     (257 KB)  wasi-threads proposal in JS
+-- tslib@2.8.1
```

---

## 10. What Nodepod Needs to Support

### Tier 1: Essential

1. **`WebAssembly.Memory` with `shared: true`** -- Without SharedArrayBuffer, nothing works.
2. **`Atomics.wait()` and `Atomics.notify()`** -- Required by fs-proxy and emnapi.
3. **`worker_threads` module** -- Creates 4 workers sharing WebAssembly.Memory.
4. **`node:wasi` module** -- WASI preview1 with preopens mapping filesystem root.
5. **Synchronous filesystem operations** -- Rust uses `std::fs` through WASI.
6. **`node:path`** and **`node:fs`** -- Used by the loader.

### Tier 2: Important

7. **Worker `unref()` support** -- Prevents process hanging.
8. **Worker `kPublicPort`/`kHandle` symbol access** -- Node.js internal hack for clean exit.
9. **Environment variable pass-through** -- Workers need `process.env`.

### Tier 3: Nice to Have

10. **`NAPI_RS_FORCE_WASI` env var** -- Forces WASM loading for testing.
11. **`UV_THREADPOOL_SIZE`** -- Controls worker pool size.

### Alternative: Browser-style Loading

If `node:wasi` is too complex, nodepod could use the browser loader which:
- Uses `@tybys/wasm-util` WASI class (pure JS) instead of `node:wasi`
- Uses `memfs` instead of real filesystem
- Uses Web Workers instead of `worker_threads`
- Requires populating memfs with project source files

---

## 11. WASM vs Native: Differences and Limitations

### Feature Parity

The WASM build exposes the **exact same API** as native. The `Scanner` class has identical methods.

### Known Limitations

| Issue | Description |
|-------|-------------|
| **Windows** | Node.js WASI does not properly support Windows |
| **macOS AArch64** | FS reads may not terminate (Node.js bug) |
| **Linux only (tests)** | Integration test only runs on Linux |
| **SharedArrayBuffer** | Requires cross-origin isolation in browsers |
| **Performance** | WASM ~2-5x slower than native |
| **Memory** | 1 GB initial; 4 GB maximum |
| **File size** | 1.7 MB WASM + ~9 MB deps vs ~5 MB native |
| **Startup** | WASM instantiation + worker creation adds latency |

### Not Applicable

- **No `tokio` usage** -- Oxide uses rayon, not tokio
- **No `tokio_unstable`**

---

## 12. The `@tailwindcss/browser` Package

The browser build takes a completely different approach:

- Does NOT use Oxide or WASM
- Uses `tailwindcss.compile()` (pure TypeScript)
- Scans the DOM via `MutationObserver`
- Cannot handle file-based source scanning or `@source` directives
- Only works with `<style type="text/tailwindcss">` tags
- NOT suitable for build-tool integration

---

## 13. Key File Paths

### Rust Source
- `crates/oxide/src/scanner/mod.rs` -- Scanner (rayon parallelism)
- `crates/oxide/src/extractor/mod.rs` -- Candidate extraction
- `crates/node/src/lib.rs` -- napi-rs bindings

### WASM Build
- `crates/node/package.json` -- napi WASM config
- `crates/node/npm/wasm32-wasi/package.json` -- Published package

### CI/CD
- `.github/workflows/ci.yml` -- CI
- `.github/workflows/release.yml` -- Release

### Consumers
- `packages/@tailwindcss-postcss/src/index.ts`
- `packages/@tailwindcss-vite/src/index.ts`
- `packages/@tailwindcss-cli/src/commands/build/index.ts`
- `packages/@tailwindcss-browser/src/index.ts` (no oxide)

---

## 14. Summary for Nodepod

### Minimum Viable Support

1. WASM fallback must load: needs `node:wasi`, `worker_threads`, `WebAssembly.Memory({shared: true})`, `Atomics`
2. Worker threads must share memory via SharedArrayBuffer
3. WASI filesystem must work through preopened directories

### Alternative: Browser-mode

Use browser loader with `@tybys/wasm-util` WASI, `memfs`, and Web Workers.

---

## Sources

- [PR #17558: Add experimental @tailwindcss/oxide-wasm32-wasi](https://github.com/tailwindlabs/tailwindcss/pull/17558)
- [@tailwindcss/oxide-wasm32-wasi on npm](https://www.npmjs.com/package/@tailwindcss/oxide-wasm32-wasi)
- [NAPI-RS WebAssembly docs](https://napi.rs/docs/concepts/webassembly)
- [NAPI-RS V3 Announcement](https://napi.rs/blog/announce-v3)
- [emnapi project](https://github.com/toyobayashi/emnapi)
- [Oxide as WASM Module discussion](https://github.com/tailwindlabs/tailwindcss/discussions/11610)
- [Tailwind CSS Play CDN docs](https://tailwindcss.com/docs/installation/play-cdn)
- [StackBlitz WASM test](https://stackblitz.com/edit/vitejs-vite-uks3gt5p)
