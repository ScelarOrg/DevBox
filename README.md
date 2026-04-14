# nodepod

[![npm](https://img.shields.io/npm/v/@scelar/nodepod.svg)](https://www.npmjs.com/package/@scelar/nodepod)
[![license](https://img.shields.io/npm/l/@scelar/nodepod.svg)](./LICENSE)

Run Node.js in the browser. Filesystem, shell, npm packages, HTTP servers, no backend required.

```bash
npm install @scelar/nodepod
```

## Usage

```typescript
import { Nodepod } from '@scelar/nodepod';

const nodepod = await Nodepod.boot({
  files: {
    '/index.js': 'console.log("Hello from the browser!")',
  },
});

const proc = await nodepod.spawn('node', ['index.js']);
proc.on('output', (text) => console.log(text));
await proc.completion;
```

### Terminal

Plug in xterm.js for an interactive shell:

```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const terminal = nodepod.createTerminal({ Terminal, FitAddon });
terminal.attach('#terminal-container');
```

### npm packages

```typescript
await nodepod.install(['express']);
const proc = await nodepod.spawn('node', ['server.js']);
```

### HTTP servers

Works with Express, Hono, Vite, and anything that calls `listen()`:

```typescript
const nodepod = await Nodepod.boot({
  files: {
    '/server.js': `
      const express = require('express');
      const app = express();
      app.get('/', (req, res) => res.json({ ok: true }));
      app.listen(3000);
    `,
  },
});

await nodepod.install(['express']);
await nodepod.spawn('node', ['server.js']);

const response = await nodepod.request(3000, 'GET', '/');
console.log(response.body); // { ok: true }
```

### Snapshots

Save and restore the filesystem:

```typescript
const snapshot = await nodepod.snapshot();
// ... later
await nodepod.restore(snapshot);
```

## API

### `Nodepod.boot(options?)`

| Option | Type | Description |
|--------|------|-------------|
| `files` | `Record<string, string \| Uint8Array>` | Initial files |
| `workdir` | `string` | Working directory (default `"/"`) |
| `env` | `Record<string, string>` | Environment variables |
| `swUrl` | `string` | Service Worker URL for preview iframes |
| `watermark` | `boolean` | Show nodepod badge in previews (default `true`) |
| `onServerReady` | `(port, url) => void` | Called when a virtual server starts |
| `allowedFetchDomains` | `string[] \| null` | Extra CORS proxy domains. `null` = allow all |

### Instance methods

| Method | Description |
|--------|-------------|
| `spawn(cmd, args?, opts?)` | Run a command |
| `install(packages)` | Install npm packages |
| `createTerminal(opts)` | Create an xterm.js terminal |
| `fs.readFile(path, enc?)` | Read a file |
| `fs.writeFile(path, data)` | Write a file |
| `fs.readdir(path)` | List directory |
| `fs.stat(path)` | File stats |
| `fs.mkdir(path, opts?)` | Create directory |
| `fs.rm(path, opts?)` | Remove file/directory |
| `snapshot()` | Capture filesystem state |
| `restore(snapshot)` | Restore from snapshot |
| `request(port, method, path)` | Send request to virtual server |
| `port(num)` | Get preview URL for a port |
| `setPreviewScript(js)` | Inject JS into preview iframes |
| `clearPreviewScript()` | Remove injected script |

### Process events

`spawn()` returns a `NodepodProcess`:

```typescript
proc.on('output', (text) => { }); // stdout
proc.on('error', (text) => { });  // stderr
proc.on('exit', (code) => { });   // exit code
await proc.completion;             // wait for exit
```

## Polyfills

**Full:** fs, path, events, stream, buffer, process, http, https, net, crypto, zlib, url, querystring, util, os, tty, child_process, assert, readline, module, timers, string_decoder, perf_hooks, constants, punycode

**Stubs:** dns, worker_threads, vm, v8, tls, dgram, cluster, http2, inspector, domain, diagnostics_channel, async_hooks

**In development:** Native WASI/WASM loading for napi-rs based packages (rolldown, lightningcss, etc.)

## Why nodepod?

We built nodepod for [Scelar](https://scelar.com), an AI app builder that takes you from idea to production in minutes. Scelar needed a way to run real Node.js code directly in the browser so users could build, preview, and interact with their apps instantly without waiting for remote servers to spin up. No containers, no cold starts, no infrastructure to manage.

We open-sourced it because we think running Node in the browser shouldn't be a proprietary black box. If you're building a web IDE, coding playground, AI dev tool, or anything that needs server-side JS in the browser, nodepod is for you.

## Development

```bash
git clone https://github.com/ScelarOrg/Nodepod.git
cd Nodepod
npm install
npm run build:publish   # build library + types
npm test                # run tests
```

### Publishing a new version

```bash
npm version patch       # or minor / major
npm publish             # auto-builds before publishing
git push && git push --tags
```

### Contributing

Contributions are really appreciated. This is a big project and it's hard to maintain and push updates on my own. If you want to help out, feel free to open a PR.

Note that nodepod is not my main focus, [Scelar](https://scelar.com) is. I work on nodepod when I have time for it, so responses to issues and PRs might take a bit.

Before opening a PR, make sure these pass:

```bash
npm run type-check      # 0 TypeScript errors
npm run build:publish   # builds cleanly
npm test                # tests pass
```

**Code style:**

- Files are **kebab-case** (`shell-parser.ts`, `memory-volume.ts`). Polyfills match their Node.js module name (`fs.ts`, `crypto.ts`).
- Classes and types are **PascalCase** (`MemoryVolume`, `ShellResult`). Functions and variables are **camelCase**.
- Private properties and internal helpers use a **leading underscore** (`_registry`, `_ensureSlot()`).
- Use **named exports**. Default exports only for polyfills that need to match Node's `module.exports` shape.

**Commit messages** follow conventional commits:

```
feat: add readline support
fix: resolve path edge case in fs.watch
chore: bump dependencies
```

**If you're writing a polyfill:**

- Polyfill files live in `src/polyfills/` and must be named after the Node.js module they replace.
- EventEmitter methods must use `_reg()` for lazy init, never access `this._registry` directly.
- Polyfills registered in `CORE_MODULES` must not use `async` functions.
- ESM-to-CJS replacement strings must include trailing semicolons.

## License

[MIT + Commons Clause](./LICENSE). Use it in anything, just don't resell nodepod itself.

Built by [@R1ck404](https://github.com/R1ck404), part of [Scelar](https://scelar.com).
