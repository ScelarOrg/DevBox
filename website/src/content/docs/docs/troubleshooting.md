---
title: Troubleshooting
description: Diagnose Nodepod boot, service-worker, shared-memory, package, preview, and cleanup problems.
---

## `NodepodSWSetupError` during boot

The browser entry expected `/__sw__.js`, but the asset was missing, returned the wrong content type, or could not claim the expected scope. Install the framework integration, copy the static assets, or pass `serviceWorker: false` when previews are not required.

## The service worker loads but previews do not

Verify the preview bridge HTML and script paths, service-worker scope, preview-origin wildcard DNS/TLS, and response isolation headers. A static host generally cannot provide the complete clean-host preview setup.

## `SharedArrayBuffer` is unavailable

Check `globalThis.crossOriginIsolated` and your COOP/COEP headers. Third-party assets must also satisfy the embedder policy. If reduced mode is intentional, pass `enableSharedArrayBuffer: false` and avoid sync process APIs and threaded WASI packages.

## A package installs but fails when required

The package may depend on a native add-on, unsupported Node API, operating-system binary, dynamic code pattern, or missing browser CORS permission. Test a browser/WasM-compatible alternative and inspect the complete process error.

## The terminal survives navigation or reset

Call `terminal.detach()` before removing its container, terminate application listeners, and call `nodepod.teardown()`. A reset should tear down the old instance before booting another.

## Memory grows during repeated runs

Reuse one runtime where appropriate, release completed process listeners, avoid keeping old snapshots, close preview inspection sessions, and call `teardown()` for abandoned instances. Enable profiling only while collecting a diagnostic.

If you can reproduce a runtime defect, open a public GitHub issue with a minimal project, browser version, isolation status, and the full error message. Do not include secrets.
