---
title: Compatibility and browser requirements
description: Understand Nodepod's browser, Node.js, cross-origin isolation, and package compatibility requirements.
sidebar:
  order: 2
---

## Baseline

Nodepod targets current evergreen browsers with WebAssembly, Web Workers, modules, and modern browser storage. The package build toolchain requires Node.js 20 or newer. The documentation site uses Node.js 22.12 or newer.

## Shared memory

Cross-origin isolation enables `SharedArrayBuffer`, synchronous child-process APIs, lean worker filesystem snapshots, and threaded WASI modules. Configure these response headers on the host page:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without isolation, set `enableSharedArrayBuffer: false` or let feature detection choose the reduced path. `execSync()` and `spawnSync()` throw, lean worker snapshots fall back to full snapshots, and threaded packages such as native-style bundler toolchains may refuse to load.

## Package compatibility

Pure JavaScript packages and packages with compatible WebAssembly builds work best. Native `.node` add-ons, kernel interfaces, arbitrary binaries, and assumptions about a full operating system are not supported merely because an npm package installs.

Test the exact packages and browser versions your product promises. Nodepod emulates useful Node.js surfaces; it is not a complete operating system or a bit-for-bit Node.js replacement.
