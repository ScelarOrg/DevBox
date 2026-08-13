---
title: Snapshots
description: Capture and restore a Nodepod filesystem.
sidebar:
  order: 4
---

```ts
const snapshot = await nodepod.snapshot();

// Store the serializable snapshot in application-controlled storage.

await nodepod.restore(snapshot);
```

Snapshots capture project filesystem state. Shallow snapshots exclude reinstallable package data by default to reduce size. Restoring can reinstall dependencies from `package.json` when that option is enabled.

Treat imported snapshots as untrusted input. Validate their source and size before restoring them, and do not place secrets in a browser-side project filesystem.
