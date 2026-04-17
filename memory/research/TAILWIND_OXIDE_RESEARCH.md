# Tailwind CSS Oxide Engine - Deep Source-Level Research

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Repository Structure](#repository-structure)
3. [Architecture Overview](#architecture-overview)
4. [The Rust Crates](#the-rust-crates)
5. [Extractor / Scanner Architecture](#extractor--scanner-architecture)
6. [napi-rs Integration](#napi-rs-integration)
7. [WASM Build](#wasm-build)
8. [Performance Architecture](#performance-architecture)
9. [Content Detection & Scanning](#content-detection--scanning)
10. [Build System](#build-system)
11. [Implications for nodepod](#implications-for-nodepod)

---

## Executive Summary

Tailwind CSS v4's "Oxide" engine is **not** a full CSS-generation engine in Rust. It is specifically:

1. **A candidate extractor** - a high-performance state-machine-based parser that scans source files (HTML, JS, Vue, etc.) to find Tailwind utility class names
2. **A file system scanner** - walks directories respecting `.gitignore` rules to discover source files
3. **A glob optimizer** - optimizes glob patterns for efficient file watching

The actual CSS generation (turning candidates like `flex`, `bg-red-500`, `hover:text-white` into CSS rules) remains in **TypeScript** in the `tailwindcss` package. Oxide's Rust code bridges to JS via **napi-rs v3** and is published as `@tailwindcss/oxide`.

Lightning CSS (by the Parcel team) handles CSS parsing and minification but is a separate dependency used by the TypeScript side, **not** part of the Oxide Rust crate itself.

---

## Repository Structure

```
tailwindcss/
├── Cargo.toml                    # Workspace root
├── Cargo.lock
├── rust-toolchain.toml           # Rust 1.85.0
├── crates/
│   ├── oxide/                    # Core Rust library - extractor + scanner
│   ├── node/                     # napi-rs bridge (cdylib) + npm packaging
│   ├── ignore/                   # Forked from ripgrep's `ignore` crate
│   └── classification-macros/    # Proc-macro for byte classification tables
├── packages/
│   ├── tailwindcss/              # Main TypeScript package (CSS generation)
│   ├── @tailwindcss-vite/        # Vite plugin
│   ├── @tailwindcss-postcss/     # PostCSS plugin
│   ├── @tailwindcss-cli/         # CLI tool
│   ├── @tailwindcss-webpack/     # Webpack plugin
│   ├── @tailwindcss-browser/     # Browser build (no Oxide - pure JS)
│   ├── @tailwindcss-standalone/  # Standalone CLI (bundled with Bun)
│   ├── @tailwindcss-node/        # Node.js utilities
│   └── @tailwindcss-upgrade/     # v3→v4 migration tool
└── .github/workflows/
    ├── ci.yml
    └── release.yml
```

---

## Architecture Overview

### What Oxide Does (and Does NOT Do)

**Oxide IS responsible for:**
- Scanning the file system to discover source files (respecting `.gitignore`, auto-source-detection rules)
- Extracting candidate utility class names from source file content (e.g., finding `flex`, `hover:bg-red-500`, `[color:red]` in HTML/JS/etc.)
- Extracting CSS variable references (e.g., `--my-variable`)
- Pre-processing language-specific syntax (Vue, Svelte, Pug, Haml, etc.) before extraction
- Optimizing glob patterns for file watching
- Providing glob information back to JS for setting up watchers

**Oxide is NOT responsible for:**
- CSS parsing or generation
- Resolving utilities to CSS rules
- Theme/config processing
- CSS minification or optimization
- PostCSS processing

### Data Flow

```
                    RUST (Oxide)                    |        TYPESCRIPT (tailwindcss)
                                                    |
Source Files ──> Scanner.scan() ──> Candidates ─────┼──> compile().build(candidates) ──> CSS
  (HTML,JS,     - walk filesystem                   |    - resolve utilities
   Vue,etc.)    - read files                        |    - apply theme
                - pre-process                       |    - generate CSS rules
                - extract candidates                |    - use Lightning CSS
                - return string[]                   |    - output final CSS
```

### How JS Integrations Use Oxide

All integrations (Vite, PostCSS, CLI, Webpack) follow the same pattern:

```typescript
import { Scanner } from '@tailwindcss/oxide'
import { compile } from '@tailwindcss/node'  // or 'tailwindcss'

// 1. Compile CSS (TypeScript side - parses @source directives, config, theme)
const compiler = await compile(inputCss, { base, ... })

// 2. Create scanner with sources from compiler
const scanner = new Scanner({ sources: compiler.sources })

// 3. Scan filesystem and extract candidates (Rust side)
const candidates = scanner.scan()

// 4. Build CSS from candidates (TypeScript side)
const css = compiler.build(candidates)

// 5. For watch mode - incremental updates:
const newCandidates = scanner.scanFiles([{ file: changedPath, extension: 'html' }])
```

---

## The Rust Crates

### 1. `tailwindcss-oxide` (crates/oxide)

**The core library.** ~6,400 lines of Rust code (excluding tests). No external CSS dependencies.

**Key dependencies:**
```toml
[dependencies]
bstr = "1.11.3"              # Byte string utilities
globwalk = "0.9.1"           # Glob pattern walking
rayon = "1.10.0"             # Data parallelism (parallel iterators)
fxhash = "2.1.1"             # Fast hash maps (FxHashMap/FxHashSet)
tracing = "0.1.40"           # Structured logging
tracing-subscriber = "0.3.18"
walkdir = "2.5.0"            # Directory walking
dunce = "1.0.5"              # Windows path canonicalization (strips \\?\)
bexpand = "1.2.0"            # Brace expansion ({a,b} → a, b)
fast-glob = "0.4.3"          # Fast glob matching
regex = "1.11.1"             # Regular expressions
classification-macros = { path = "../classification-macros" }
ignore = { path = "../ignore" }
```

**Notable: NO tokio, NO async runtime, NO lightningcss, NO CSS parser.**

The crate is purely synchronous with parallelism via rayon.

### 2. `tailwind-oxide` (crates/node)

**The napi-rs bridge.** Thin wrapper exposing the oxide crate to Node.js.

```toml
[lib]
crate-type = ["cdylib"]       # Compiles to .node native addon (or .wasm)

[dependencies]
napi = { version = "3.3.0", features = ["napi4"] }
napi-derive = "3.2.5"
tailwindcss-oxide = { path = "../oxide" }
rayon = "1.10.0"

[build-dependencies]
napi-build = "2.2.3"
```

### 3. `ignore` (crates/ignore)

**Forked from [ripgrep's ignore crate](https://github.com/BurntSushi/ripgrep/tree/master/crates/ignore).** ~6,571 lines.

Provides `.gitignore`-aware file walking with:
- `WalkBuilder` - configurable directory walker
- `GitignoreBuilder` - programmatic gitignore rule construction
- Parallel walking via `build_parallel()` (uses crossbeam-deque)
- Symlink following
- Hidden file handling

Key dependencies: `crossbeam-deque`, `globset`, `walkdir`, `regex-automata`, `memchr`

### 4. `classification-macros` (crates/classification-macros)

**A proc-macro crate** that generates 256-entry lookup tables for byte classification. Used throughout the extractor for fast character classification without branching.

Example usage in extractor code:
```rust
#[derive(ClassifyBytes)]
enum Class {
    #[bytes_range(b'a'..=b'z')]
    AlphaLower,
    #[bytes(b'-')]
    Dash,
    #[fallback]
    Other,
}
// Generates: impl From<u8> for Class via a 256-entry const TABLE
```

This generates a `const TABLE: [Class; 256]` and `From<u8>` implementation, enabling O(1) byte classification with no branching.

---

## Extractor / Scanner Architecture

### The State Machine Design

The extractor is built as a hierarchy of composable **state machines**. Each machine implements the `Machine` trait:

```rust
// crates/oxide/src/extractor/machine.rs
pub trait Machine: Sized + Default {
    fn reset(&mut self);
    fn next(&mut self, cursor: &mut Cursor<'_>) -> MachineState;
}

pub enum MachineState {
    Idle,           // Not matched
    Done(Span),     // Matched: start..=end byte positions
}
```

The `Cursor` is a lightweight byte-level cursor over `&[u8]` input:
```rust
pub struct Cursor<'a> {
    pub input: &'a [u8],
    pub pos: usize,
}
```

### Machine Hierarchy

```
Extractor
├── CandidateMachine           # Top-level: extracts full candidates with variants
│   ├── VariantMachine         # Matches variant prefixes like "hover:", "[&:hover]:"
│   │   ├── NamedVariantMachine    # e.g., "hover:", "sm:", "group-hover/named:"
│   │   └── ArbitraryValueMachine  # e.g., "[&:hover]" in "[&:hover]:"
│   └── UtilityMachine         # Matches utilities like "flex", "bg-[#0088cc]"
│       ├── NamedUtilityMachine    # e.g., "flex", "bg-red-500", "bg-(--my-color)"
│       │   ├── ArbitraryValueMachine   # e.g., "[#0088cc]" in "bg-[#0088cc]"
│       │   └── ArbitraryVariableMachine # e.g., "(--my-color)" in "bg-(--my-color)"
│       ├── ArbitraryPropertyMachine    # e.g., "[color:red]", "![color:red]/20"
│       └── ModifierMachine     # e.g., "/20", "/[20%]", "/(--my-opacity)"
└── CssVariableMachine         # Extracts CSS variable references like "--my-variable"
```

### The Extractor (mod.rs)

The top-level `Extractor` runs two passes over input:
1. **CSS Variable pass** - scans for `--variable-name` patterns
2. **Candidate pass** - scans for utility class candidates

Both run on the same input line. The candidate pass also handles "sub-candidates" - when a larger span is matched, it checks if smaller valid candidates exist within the unmatched prefix.

### Pre-processors

Before extraction, language-specific pre-processors transform file content to normalize syntax. They **must preserve byte length** (same input length = same output length) so that position information remains valid.

Supported languages:
| Extension | Pre-processor | Transformation |
|-----------|--------------|----------------|
| `.vue` | Vue | Processes `<template lang="pug">` blocks through Pug processor |
| `.svelte` | Svelte | Converts `class:flex` → `class flex` |
| `.pug` | Pug | Converts `.bg-red-500.text-white` dot-class syntax |
| `.haml` | Haml | Handles `%div.class` syntax |
| `.rb`, `.erb` | Ruby | Handles Ruby string interpolation |
| `.rs` | Rust | Handles Rust-specific syntax |
| `.json` | Json | Strips JSON structure, keeps values |
| `.md`, `.mdx` | Markdown | Handles markdown syntax |
| `.slim`, `.slang` | Slim | Handles Slim template syntax |
| `.cshtml`, `.razor` | Razor | Handles ASP.NET Razor syntax |
| `.clj`, `.cljs`, `.cljc` | Clojure | Handles Clojure vector syntax |
| `.heex`, `.eex`, `.ex`, `.exs` | Elixir | Handles Elixir syntax |

### fast_skip Module

An auto-vectorizable whitespace skipper. Operates on 16-byte strides, checking if all 16 bytes are ASCII whitespace using SIMD-friendly primitives. This allows the scanner to quickly skip large whitespace regions.

```rust
const STRIDE: usize = 16;
// Uses array operations designed to be auto-vectorized by LLVM
fn is_ascii_whitespace(value: [u8; STRIDE]) -> [bool; STRIDE] { ... }
```

---

## napi-rs Integration

### Exported API

The `crates/node/src/lib.rs` exports via `#[napi]`:

**Classes:**
```rust
#[napi]
pub struct Scanner {
    scanner: tailwindcss_oxide::Scanner,
}

#[napi]
impl Scanner {
    #[napi(constructor)]
    pub fn new(opts: ScannerOptions) -> Self;

    #[napi]
    pub fn scan(&mut self) -> Vec<String>;

    #[napi]
    pub fn scan_files(&mut self, input: Vec<ChangedContent>) -> Vec<String>;

    #[napi]
    pub fn get_candidates_with_positions(&mut self, input: ChangedContent) -> Vec<CandidateWithPosition>;

    #[napi(getter)]
    pub fn files(&mut self) -> Vec<String>;

    #[napi(getter)]
    pub fn globs(&mut self) -> Vec<GlobEntry>;

    #[napi(getter)]
    pub fn normalized_sources(&mut self) -> Vec<GlobEntry>;
}
```

**Data objects crossing the Rust↔JS boundary:**
```rust
#[napi(object)]
pub struct ChangedContent {
    pub file: Option<String>,       // File path (for file-based scanning)
    pub content: Option<String>,    // Raw content (for content-based scanning)
    pub extension: String,          // File extension (determines pre-processor)
}

#[napi(object)]
pub struct GlobEntry {
    pub base: String,
    pub pattern: String,
}

#[napi(object)]
pub struct SourceEntry {
    pub base: String,
    pub pattern: String,
    pub negated: bool,
}

#[napi(object)]
pub struct ScannerOptions {
    pub sources: Option<Vec<SourceEntry>>,
}

#[napi(object)]
pub struct CandidateWithPosition {
    pub candidate: String,
    pub position: i64,           // UTF-16 character offset (for JS compatibility)
}
```

### UTF-16 Position Conversion

The `utf16.rs` module converts Rust's UTF-8 byte offsets to JavaScript's UTF-16 character indices. This is necessary because JavaScript strings use UTF-16 encoding internally, while Rust operates on UTF-8 bytes. The converter is incremental and tracks its position to avoid re-scanning.

### napi-rs Version

Uses **napi-rs v3** (napi 3.3.0, napi-derive 3.2.5). This is the version that added WASM target support. The napi4 feature maps to Node-API version 4 (available since Node.js 8.6.0).

---

## WASM Build

### Target

Oxide supports compilation to **`wasm32-wasip1-threads`** via napi-rs v3.

### Package Structure

The WASM build produces `@tailwindcss/oxide-wasm32-wasi` (in `crates/node/npm/wasm32-wasi/`):

```json
{
  "name": "@tailwindcss/oxide-wasm32-wasi",
  "main": "tailwindcss-oxide.wasi.cjs",
  "browser": "tailwindcss-oxide.wasi-browser.js",
  "files": [
    "tailwindcss-oxide.wasm32-wasi.wasm",
    "tailwindcss-oxide.wasi.cjs",
    "tailwindcss-oxide.wasi-browser.js",
    "wasi-worker.mjs",
    "wasi-worker-browser.mjs"
  ],
  "dependencies": {
    "@napi-rs/wasm-runtime": "^1.1.1",
    "@emnapi/core": "^1.8.1",
    "@emnapi/runtime": "^1.8.1",
    "@tybys/wasm-util": "^0.10.1",
    "@emnapi/wasi-threads": "^1.1.0",
    "tslib": "^2.8.1"
  }
}
```

### Build Commands

```json
{
  "build:platform": "napi build --platform --release",
  "build:wasm": "napi build --release --target wasm32-wasip1-threads"
}
```

### WASM Runtime Dependencies

The WASM build uses the **emnapi** ecosystem to provide Node-API in WASM:

| Package | Purpose |
|---------|---------|
| `@napi-rs/wasm-runtime` | WASM runtime for napi-rs, loads and instantiates the WASM module |
| `@emnapi/core` | Core Node-API implementation for WASM (provides `napi_*` functions) |
| `@emnapi/runtime` | Runtime helpers for emnapi |
| `@tybys/wasm-util` | WASM utility functions |
| `@emnapi/wasi-threads` | Thread support via Web Workers (simulates `pthread_create`) |
| `tslib` | TypeScript runtime helpers |

### WASM Configuration in package.json

```json
"napi": {
  "wasm": {
    "initialMemory": 16384,
    "browser": {
      "fs": true
    }
  }
}
```

The `initialMemory: 16384` sets 16384 pages (1 GB) of initial WebAssembly memory. The `browser.fs: true` enables filesystem polyfill for browser environments.

### Threading in WASM

The WASM build uses `wasm32-wasip1-threads` which supports:
- **SharedArrayBuffer** for shared memory between workers
- **pthread emulation** via `@emnapi/wasi-threads` (spawns Web Workers)
- **rayon parallelism** works because rayon's thread pool maps to pthreads, which map to Web Workers

This means rayon's `par_iter()`, `par_sort_unstable()`, and `into_par_iter()` all work in the WASM build.

### WASI Imports Required

Based on the `wasm32-wasip1-threads` target, the WASM module needs:
- **WASI filesystem** (`fd_read`, `fd_write`, `path_open`, etc.) - for file scanning
- **WASI environment** (`environ_get`, `environ_sizes_get`) - for DEBUG env var
- **WASI clock** (`clock_time_get`) - for mtime tracking
- **Thread support** (`thread-spawn`) - for rayon parallelism
- **SharedArrayBuffer** - for thread communication

### Known Limitations

From the PR discussion (#17558):
- Filesystem reads were not terminating on macOS in some cases (Node.js WASI container limitation)
- Node.js WASI container doesn't properly support Windows
- Mac AArch64 and Windows users should use native modules instead

---

## Performance Architecture

### Parallelism Strategy

Oxide uses **rayon** for data-parallel processing at multiple levels:

1. **File reading**: `read_all_files()` uses `into_par_iter()` to read files in parallel
2. **Content extraction**: `parse_all_blobs()` splits blobs by newline using `par_split()`, then extracts candidates from each line in parallel
3. **Result sorting**: `par_sort_unstable()` for sorting candidate lists
4. **Candidate position extraction**: `into_par_iter()` for position mapping

```rust
// Parallel extraction across all lines of all files
blobs
    .par_iter()
    .flat_map(|blob| blob.par_split(|x| *x == b'\n'))
    .filter_map(|blob| {
        let extracted = handle(Extractor::new(blob));
        if extracted.is_empty() { return None; }
        Some(FxHashSet::from_iter(extracted...))
    })
    .reduce(Default::default, |mut a, b| { a.extend(b); a })
```

### Synchronous vs Parallel Walking

```rust
// Initial build: synchronous walk (lower overhead)
if !self.has_scanned_once {
    walk_synchronous(walker)
}
// Watch mode rebuilds: parallel walk (amortized overhead)
else {
    walk_parallel(walker)
}
```

The parallel walker uses `crossbeam-deque` (via the `ignore` crate) with a flush-on-drop pattern to batch entries per thread.

### Incremental Scanning (mtime tracking)

After the first full scan, subsequent scans track file modification times:

```rust
// Skip mtime tracking on first scan for speed
let changed = if self.has_scanned_once {
    let current_mtime = std::fs::metadata(&path).ok().and_then(|m| m.modified().ok());
    match current_mtime {
        Some(mtime) => {
            let prev = self.mtimes.insert(path.clone(), mtime);
            prev.is_none_or(|prev| prev != mtime)
        }
        None => true,
    }
} else {
    true  // First scan: process everything
};
```

### Hash-Based Deduplication

Uses `FxHashSet` (fast hash set from `rustc-hash`) for:
- Tracking seen candidates (avoid re-processing)
- Tracking seen files (avoid re-scanning)
- Deduplicating parallel walk results

### Zero-Copy Extraction

The extractor works on `&[u8]` slices, producing `&[u8]` spans that point directly into the input buffer. String allocation only happens at the boundary when returning results to JS.

### Vectorizable Whitespace Skipping

The `fast_skip` module uses 16-byte strides with operations designed for LLVM auto-vectorization to rapidly skip whitespace regions.

---

## Content Detection & Scanning

### Auto Source Detection

Oxide has sophisticated auto-source-detection that determines which files to scan. Defined via static fixture files:

**Ignored directories** (`fixtures/ignored-content-dirs.txt`):
```
.git, .hg, .jj, .next, .parcel-cache, .pnpm-store, .svelte-kit,
.svn, .turbo, .venv, .vercel, .yarn, __pycache__, node_modules, venv
```

**Ignored extensions** (`fixtures/ignored-extensions.txt`):
```
less, lock, sass, scss, styl, log
```

**Binary extensions** (extensive list in `fixtures/binary-extensions.txt`) - images, archives, fonts, etc.

**Ignored files** (`fixtures/ignored-files.txt`) - lock files, etc.

**Known template extensions** (`fixtures/template-extensions.txt`):
```
html, pug, gjs, gts, astro, cjs, cts, jade, js, jsx, mjs, mts,
svelte, ts, tsx, vue, md, mdx, aspx, razor, handlebars, hbs,
mustache, php, twig, rb, erb, haml, slim, ...
```

### Source Entry Types

The scanner supports four source entry types:

```rust
pub enum SourceEntry {
    Auto { base: PathBuf },           // @source "src" — full auto-detection
    Pattern { base: PathBuf, pattern: String },  // @source "src/**/*.html"
    Ignored { base: PathBuf, pattern: String },   // @source not "src"
    External { base: PathBuf },        // @source "../node_modules/my-lib"
}
```

External sources (inside `node_modules` or outside git root) get special handling - they bypass gitignore rules.

### Glob Optimization

The glob optimizer performs brace expansion and static part hoisting:

```
Input:  { base: "/", pattern: "{pages,components}/**/*.js" }
Output: { base: "/pages", pattern: "**/*.js" }
        { base: "/components", pattern: "**/*.js" }
```

This dramatically reduces the scope of filesystem walking.

### CSS File Special Handling

CSS files are treated differently from other source files:
- They are NOT scanned for candidates
- They ARE scanned for CSS variable references (via `CssVariableMachine`)
- This prevents CSS syntax from being mistakenly interpreted as utility classes

---

## Build System

### Rust Toolchain

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.85.0"
profile = "default"
```

### Workspace Configuration

```toml
# Cargo.toml (root)
[workspace]
resolver = "2"
members = ["crates/*"]

[profile.release]
lto = true    # Link-Time Optimization for smaller, faster binaries
```

### Platform Targets

Native builds target 11 platforms plus WASM:

| Target | Package |
|--------|---------|
| `aarch64-apple-darwin` | `@tailwindcss/oxide-darwin-arm64` |
| `x86_64-apple-darwin` | `@tailwindcss/oxide-darwin-x64` |
| `x86_64-unknown-linux-gnu` | `@tailwindcss/oxide-linux-x64-gnu` |
| `x86_64-unknown-linux-musl` | `@tailwindcss/oxide-linux-x64-musl` |
| `aarch64-unknown-linux-gnu` | `@tailwindcss/oxide-linux-arm64-gnu` |
| `aarch64-unknown-linux-musl` | `@tailwindcss/oxide-linux-arm64-musl` |
| `armv7-unknown-linux-gnueabihf` | `@tailwindcss/oxide-linux-arm-gnueabihf` |
| `i686-pc-windows-msvc` | `@tailwindcss/oxide-win32-x64-msvc` |
| `aarch64-pc-windows-msvc` | `@tailwindcss/oxide-win32-arm64-msvc` |
| `x86_64-unknown-freebsd` | `@tailwindcss/oxide-freebsd-x64` |
| `aarch64-linux-android` | `@tailwindcss/oxide-android-arm64` |
| `wasm32-wasip1-threads` | `@tailwindcss/oxide-wasm32-wasi` |

### napi-rs CLI

Built using `@napi-rs/cli` v3.4.1:
- `napi build --platform --release` for native builds
- `napi build --release --target wasm32-wasip1-threads` for WASM
- Post-build script (`scripts/move-artifacts.mjs`) moves artifacts to per-platform npm packages

### CI Configuration

From `.github/workflows/ci.yml`:
```yaml
- name: Setup WASM target
  run: rustup target add wasm32-wasip1-threads
```

The CI uses `ghcr.io/napi-rs/napi-rs/nodejs-rust:lts-debian` Docker images for cross-compilation.

### Platform-Specific Linker Configuration

```toml
# crates/node/.cargo/config.toml
[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"

[target.x86_64-pc-windows-msvc]
rustflags = ["-C", "target-feature=+crt-static"]

[target.'cfg(target_env = "gnu")']
rustflags = ["-C", "link-args=-Wl,-z,nodelete"]
```

---

## Implications for nodepod

### What nodepod Needs to Support for @tailwindcss/oxide

#### Option A: Native napi-rs Module (Preferred)

If running the native `.node` binary:
1. **Node-API v4+** - Oxide uses `napi4` feature
2. **Standard filesystem operations** - `std::fs::read`, `std::fs::metadata`, directory walking
3. **Thread support** - rayon spawns threads for parallel processing
4. **Environment variables** - `std::env::var("DEBUG")` for tracing
5. **Path canonicalization** - `dunce::canonicalize` (uses OS APIs)
6. **Symlink resolution** - `follow_links(true)` in walker
7. **Git detection** - checks for `.git` directory existence

#### Option B: WASM Module (@tailwindcss/oxide-wasm32-wasi)

If running the WASM build:
1. **WASI filesystem** - Full WASI FS API needed (`path_open`, `fd_read`, `fd_readdir`, `fd_filestat_get`, etc.)
2. **SharedArrayBuffer** - Required for thread communication
3. **WASI threads** (`thread-spawn`) - Or emnapi's Web Worker-based thread emulation
4. **WASI clock** - For mtime tracking (`clock_time_get`)
5. **WASI environment** - For env vars

#### Key Filesystem Operations Used

The oxide scanner performs these filesystem operations extensively:
- **Directory walking** - recursive, following symlinks, respecting gitignore
- **File reading** - `std::fs::read()` (bulk parallel reads)
- **Metadata access** - `std::fs::metadata()` for mtime tracking
- **Path canonicalization** - `dunce::canonicalize()`
- **Existence checks** - `.exists()`, `.is_dir()`, `.is_file()`

#### Data Crossing the JS↔Rust Boundary

All data is simple types - no buffers, no callbacks, no async:
- **JS → Rust**: `SourceEntry[]` (strings + bool), `ChangedContent[]` (strings)
- **Rust → JS**: `String[]` (candidates), `GlobEntry[]` (strings), `CandidateWithPosition[]` (string + i64)

The API is entirely **synchronous** from JS's perspective. No async operations, no callbacks, no streaming.

#### Performance Considerations

- The initial scan uses synchronous walking (lower overhead)
- Subsequent scans use parallel walking + mtime-based skip
- File reads are parallelized via rayon
- Candidate extraction is parallelized per-line across all files
- For a typical project, the scanner processes thousands of files in milliseconds

---

## Sources

- [Tailwind CSS v4.0 Alpha Blog Post](https://tailwindcss.com/blog/tailwindcss-v4-alpha)
- [PR #17558: Add experimental @tailwindcss/oxide-wasm32-wasi](https://github.com/tailwindlabs/tailwindcss/pull/17558)
- [@tailwindcss/oxide on npm](https://www.npmjs.com/package/@tailwindcss/oxide)
- [@tailwindcss/oxide-wasm32-wasi on npm](https://www.npmjs.com/package/@tailwindcss/oxide-wasm32-wasi)
- [Oxide Discussion #11610](https://github.com/tailwindlabs/tailwindcss/discussions/11610)
- [napi-rs WebAssembly docs](https://napi.rs/docs/concepts/webassembly)
- [emnapi GitHub](https://github.com/toyobayashi/emnapi)
- [Exploring Tailwind Oxide - LogRocket](https://blog.logrocket.com/exploring-tailwind-oxide/)
- [Tailwind v4.0: Rust enters the chat](https://medium.com/@hichemfantar/tailwind-v4-0-lightning-fast-ae2f7358e242)
- [DeepWiki: tailwindlabs/tailwindcss](https://deepwiki.com/tailwindlabs/tailwindcss/1-overview)
