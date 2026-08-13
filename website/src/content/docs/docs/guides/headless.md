---
title: Headless mode
description: Run Nodepod without terminal or preview UI in browsers, Node.js, or Bun.
sidebar:
  order: 5
---

## Browser

```ts
import { Nodepod } from '@scelar/nodepod';

const pod = await Nodepod.boot({ headless: true });
```

Headless browser mode defaults the service worker and watermark off. Filesystem, packages, spawning, and programmatic HTTP remain available within the limits of the browser environment.

## Node.js and Bun

```ts
import { Nodepod } from '@scelar/nodepod/headless';

const pod = await Nodepod.boot();
```

The headless entry uses worker threads and exposes virtual server ingress on loopback. It does not need a browser DOM, xterm.js, or service-worker setup.

Always call `pod.teardown()` in application shutdown and test cleanup.
