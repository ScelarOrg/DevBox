# nodepod

[![npm version](https://img.shields.io/npm/v/@scelar/nodepod.svg)](https://www.npmjs.com/package/@scelar/nodepod)
[![license](https://img.shields.io/npm/l/@scelar/nodepod.svg)](https://github.com/ScelarOrg/Nodepod/blob/main/LICENSE)

Browser-native Node.js runtime. Run real Node.js code — filesystem, modules, `require()`, npm packages, HTTP servers — entirely inside the browser.

No backend. No containers. No WASM Node binary. Just polyfills, an in-memory filesystem, and a JavaScript execution engine.

Built by [@R1ck404](https://github.com/R1ck404) — powering [Scelar](https://scelar.com), the AI app builder that actually COMPLETELY builds your apps, from idea to production in a matter of minutes.

## Features

- **Virtual Filesystem** — Full in-memory `fs` API (read, write, watch, streams, symlinks, glob)
- **Module System** — `require()`, `import`, `module.exports`, `package.json` resolution, conditional exports
- **npm Packages** — Install real packages from the npm registry, extracted and resolved in-browser
- **HTTP Servers** — Run Express, Hono, Elysia, vite and other frameworks with real request/response routing
- **Shell** — Built-in bash-like shell with 35+ commands (ls, cat, grep, find, sed, etc.), pipes, redirections, variable expansion
- **Process Model** — Web Worker-based processes with `child_process.exec/spawn/fork`, `worker_threads`, and IPC
- **Terminal** — Drop-in xterm.js integration with line editing, history, raw mode, Ctrl+C
- **Preview** — Service Worker-based iframe preview with script injection and WebSocket bridging
- **Snapshots** — Save and restore the entire filesystem state

## Install

```bash
npm install @scelar/nodepod
```

## Quick Start

```typescript
import { Nodepod } from '@scelar/nodepod';

// Boot a nodepod instance with some files
const nodepod = await Nodepod.boot({
  files: {
    '/index.js': 'console.log("Hello from the browser!")',
  },
});

// Run a script
const proc = await nodepod.spawn('node', ['index.js']);
proc.on('output', (text) => console.log(text));
await proc.completion;

// Read/write files
await nodepod.fs.writeFile('/data.json', JSON.stringify({ hello: 'world' }));
const content = await nodepod.fs.readFile('/data.json', 'utf8');
```

## Terminal Integration

nodepod provides built-in xterm.js terminal support:

```typescript
import { Nodepod } from '@scelar/nodepod';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const nodepod = await Nodepod.boot();
const terminal = nodepod.createTerminal({ Terminal, FitAddon });
terminal.attach('#terminal-container');
```

The terminal handles line editing, command history, prompt rendering, raw/cooked mode, and streaming output out of the box.

## Running an Express Server

```typescript
const nodepod = await Nodepod.boot({
  files: {
    '/server.js': `
      const express = require('express');
      const app = express();
      app.get('/', (req, res) => res.json({ status: 'ok' }));
      app.listen(3000, () => console.log('Server running on port 3000'));
    `,
  },
});

// Install express
await nodepod.install(['express']);

// Run the server
const proc = await nodepod.spawn('node', ['server.js']);

// Dispatch requests to the virtual server
const response = await nodepod.request(3000, 'GET', '/');
console.log(response.body); // { status: 'ok' }
```

## Preview Script Injection

Inject scripts into preview iframes before any page content loads — useful for setting up bridges between the main window and the iframe:

```typescript
await nodepod.setPreviewScript(`
  window.__bridge = {
    sendToParent(msg) { window.parent.postMessage(msg, '*'); }
  };
`);

// Remove it later
await nodepod.clearPreviewScript();
```

## SDK API

### `Nodepod.boot(options?)`

Creates a fully wired nodepod instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `files` | `Record<string, string>` | — | Initial files to populate the filesystem |
| `workdir` | `string` | `"/"` | Working directory |
| `env` | `Record<string, string>` | — | Environment variables |
| `swUrl` | `string` | — | Service Worker URL (enables preview iframes) |
| `watermark` | `boolean` | `true` | Show a small "nodepod" badge in preview iframes |
| `onServerReady` | `(port, url) => void` | — | Callback when a virtual server starts listening |
| `allowedFetchDomains` | `string[] \| null` | npm/github defaults | Extra domains allowed through the CORS proxy. Pass `null` to allow all |

### Instance Methods

| Method | Description |
|--------|-------------|
| `spawn(cmd, args?)` | Run a command, returns `NodepodProcess` |
| `createTerminal(opts)` | Create an interactive terminal |
| `install(packages)` | Install npm packages |
| `fs.readFile(path, enc?)` | Read a file |
| `fs.writeFile(path, data)` | Write a file |
| `fs.readdir(path)` | List directory contents |
| `fs.stat(path)` | Get file stats |
| `fs.mkdir(path, opts?)` | Create a directory |
| `fs.rm(path, opts?)` | Remove files/directories |
| `snapshot()` | Capture filesystem state |
| `restore(snapshot)` | Restore filesystem from snapshot |
| `setPreviewScript(script)` | Inject JS into preview iframes |
| `clearPreviewScript()` | Remove injected preview script |
| `port(num)` | Get preview URL for a virtual server port |

### `NodepodProcess`

Returned by `spawn()`. An EventEmitter with:

| Event | Payload | Description |
|-------|---------|-------------|
| `output` | `string` | stdout data |
| `error` | `string` | stderr data |
| `exit` | `number` | exit code |

Property: `completion` — a `Promise<void>` that resolves when the process exits.

## Security

nodepod includes several security measures for running untrusted code:

- **CORS proxy domain whitelist** — Proxied fetch requests only go through to whitelisted domains (npm registry, GitHub, esm.sh, etc by default). Extend via the `allowedFetchDomains` boot option or pass `null` to disable
- **Service Worker auth** — Control messages to the SW require a random token generated at boot, so other scripts on the same origin can't inject preview content
- **WebSocket bridge auth** — The BroadcastChannel used for WS bridging between preview iframes and the main thread is token-authenticated
- **Package integrity** — Downloaded npm tarballs are checked against the registry's `shasum` before extraction
- **Iframe sandbox** — The cross-origin iframe mode uses `sandbox="allow-scripts"` to prevent top-frame navigation, popups, and form submissions
- **Origin-checked messaging** — The sandbox page validates `event.origin` on incoming messages and only responds to the configured parent origin

## Architecture

```
nodepod
├── src/
│   ├── script-engine.ts       # JavaScript execution engine (require, ESM→CJS, REPL)
│   ├── memory-volume.ts       # In-memory virtual filesystem
│   ├── syntax-transforms.ts   # ESM-to-CJS conversion via acorn
│   ├── module-transformer.ts  # esbuild-wasm code transforms
│   ├── polyfills/             # Node.js built-in module polyfills
│   │   ├── fs.ts              #   Filesystem (read, write, watch, streams, glob)
│   │   ├── http.ts            #   HTTP server/client
│   │   ├── stream.ts          #   Readable, Writable, Transform, Duplex
│   │   ├── events.ts          #   EventEmitter
│   │   ├── path.ts            #   Path operations
│   │   ├── crypto.ts          #   Hashing, randomBytes, randomUUID
│   │   ├── child_process.ts   #   exec, spawn, fork, execSync
│   │   ├── net.ts             #   TCP Socket, Server
│   │   └── ...                #   40+ more polyfills
│   ├── shell/                 # Bash-like shell interpreter
│   │   ├── shell-parser.ts    #   Tokenizer + recursive-descent parser
│   │   ├── shell-builtins.ts  #   35+ built-in commands
│   │   └── shell-interpreter.ts # AST executor, pipes, redirections
│   ├── packages/              # npm package management
│   │   ├── installer.ts       #   Package installer
│   │   ├── registry-client.ts #   npm registry client
│   │   └── version-resolver.ts #  Semver resolution
│   ├── threading/             # Worker-based process model
│   │   ├── process-manager.ts #   Process lifecycle management
│   │   └── process-handle.ts  #   Process I/O handle
│   └── sdk/                   # Public SDK layer
│       ├── nodepod.ts          #   Nodepod.boot() entry point
│       ├── nodepod-fs.ts       #   Async filesystem facade
│       ├── nodepod-process.ts  #   Process handle
│       └── nodepod-terminal.ts #   xterm.js terminal integration
└── static/
    └── __sw__.js              # Service Worker for HTTP request interception
```

## Supported Node.js Modules

**Full implementations:** fs, path, events, stream, buffer, process, http, https, net, crypto, zlib, url, querystring, util, os, tty, child_process, assert, readline, module, timers, string_decoder, perf_hooks, constants, punycode

**Shims/stubs:** dns, worker_threads, vm, v8, tls, dgram, cluster, http2, inspector, domain, diagnostics_channel, async_hooks

## CDN Usage
Once published to npm, nodepod is automatically available on CDNs:

```html
<!-- unpkg -->
<script src="https://unpkg.com/@scelar/nodepod"></script>

<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/@scelar/nodepod"></script>
```

## Development

```bash
git clone https://github.com/ScelarOrg/Nodepod.git
cd Nodepod
npm install
npm run type-check    # TypeScript validation
npm run build:lib     # Build ESM + CJS bundles
npm test              # Run tests
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and guidelines.

## Author

Created by [@R1ck404](https://github.com/R1ck404). Part of the [Scelar](https://scelar.com) ecosystem.

## License

[MIT + Commons Clause](./LICENSE)

This project uses the MIT license with the [Commons Clause](https://commonsclause.com/) restriction. In plain terms:

- **Use it** freely in your own projects, including commercial ones
- **Modify it**, fork it, learn from it
- **Ship products** built with nodepod — that's totally fine
- **Don't resell nodepod itself** as a standalone product or hosted service

Basically, build whatever you want with it — just don't take nodepod, rebrand it, and sell it as your own thing.
