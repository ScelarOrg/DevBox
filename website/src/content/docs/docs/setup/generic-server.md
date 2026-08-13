---
title: Generic server
description: Serve Nodepod assets from Fetch-style and Node-style frameworks.
sidebar:
  order: 3
---

## Fetch-style frameworks

Use the response helpers with Hono, Bun, Cloudflare Workers, Elysia, or any framework that accepts a standard `Response`:

```ts
import {
  serveSW,
  servePreviewBridge,
  servePreviewBridgeScript,
} from '@scelar/nodepod/server';

app.get('/__sw__.js', () => serveSW());
app.get('/__nodepod_bridge__.html', (context) =>
  servePreviewBridge(context.req.raw));
app.get('/__nodepod_bridge__.js', () => servePreviewBridgeScript());
```

## Express, Fastify, or `node:http`

Node-native helpers return a body and header map:

```ts
import { serveSWNode, servePreviewBridgeNode } from '@scelar/nodepod/server';

app.get('/__sw__.js', async (_request, response) => {
  const { body, headers } = await serveSWNode();
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  response.status(200).send(body);
});
```

Route the HTML and script bridge paths in the same way with `servePreviewBridgeNode('html')` and `servePreviewBridgeNode('script')`.

Only route the documented Nodepod paths to these handlers. Your application remains responsible for authentication, caching policy outside those paths, and wildcard preview-host routing.
