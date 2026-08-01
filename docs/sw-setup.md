# Service worker setup

Nodepod routes preview iframes (`nodepod.port(3000)`) and virtual HTTP
servers through a service worker. The SW intercepts same-origin fetches
and hands them off to Nodepod's in-browser Node runtime.

Unlike the rest of the package, the SW **cannot be bundled into your app
JS**. Browsers impose two hard requirements:

1. A service worker must be served from the **same origin** as the page
   that registers it.
2. It must be served with a **JavaScript `Content-Type`** (e.g.
   `application/javascript`). Serving it as `text/html`, which is what
   SPA dev servers fall back to for unknown routes, silently breaks
   registration.

So: a file has to sit on your host at `/__sw__.js`, answering with a JS
`Content-Type`. This doc shows how to make that happen in every common
framework, and what error you'll see if you don't.

## The one-liners

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import nodepod from '@scelar/nodepod/vite';

export default defineConfig({
  plugins: [nodepod()],
});
```

- **Dev**: the plugin adds middleware that serves `/__sw__.js` from the
  in-memory source.
- **Build**: the plugin emits `__sw__.js` as an asset next to your other
  build output, so your production host serves it automatically.

Optional: `nodepod({ path: '/foo/__sw__.js' })` to mount under a custom
path. Pair with `Nodepod.boot({ swUrl: '/foo/__sw__.js' })`.

### Next.js (App Router)

Works the same across Next 13 through 16. Route handlers weren't touched
by the Next 16 rename.

```ts
// app/__sw__.js/route.ts
export { GET } from '@scelar/nodepod/next';
```

Next matches this file at `GET /__sw__.js` because the folder name is
literally `__sw__.js`. No other config required.

#### Next 16+ (`proxy.ts`)

[Next 16 renamed `middleware.ts` to `proxy.ts`](https://nextjs.org/docs/app/getting-started/proxy).
If you already have a `proxy.ts`, compose `nodepodProxy`:

```ts
// proxy.ts
import { nodepodProxy, nodepodMatcher } from '@scelar/nodepod/next';

export async function proxy(req) {
  const sw = await nodepodProxy(req);
  if (sw) return sw;
  // ...your own proxy logic
}

export const config = { matcher: [nodepodMatcher /*, your paths */] };
```

#### Next <=15 (`middleware.ts`)

`nodepodMiddleware` is a back-compat alias of `nodepodProxy`, for projects
still on `middleware.ts`:

```ts
// middleware.ts
import { nodepodMiddleware, nodepodMatcher } from '@scelar/nodepod/next';

export async function middleware(req) {
  const sw = await nodepodMiddleware(req);
  if (sw) return sw;
  // ...your own middleware
}

export const config = { matcher: [nodepodMatcher /*, your paths */] };
```

> Upgrading to Next 16? Run `npx @next/codemod@canary middleware-to-proxy .`
> to rename your file + function, then swap `nodepodMiddleware` for
> `nodepodProxy`. They're the same function re-exported under both names.

### Any Fetch-style framework (Hono, Bun, Cloudflare, Elysia, etc.)

```ts
import { serveSW } from '@scelar/nodepod/server';

app.get('/__sw__.js', () => serveSW());
```

### Express / Fastify / bare `http`

```ts
import { serveSWNode } from '@scelar/nodepod/server';

app.get('/__sw__.js', async (_req, res) => {
  const { body, headers } = await serveSWNode();
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(200).send(body);
});
```

### Static host (copy once)

No server to edit? Copy the file into your public/static directory and
let the host serve it:

```bash
cp node_modules/@scelar/nodepod/dist/__sw__.js public/__sw__.js
```

Re-run the copy when you upgrade `@scelar/nodepod`.

## What the error looks like

Starting in 1.2, `Nodepod.boot()` registers the service worker by
default. If the SW can't be reached or is served as HTML, boot throws:

```
NodepodSWSetupError: service worker at /__sw__.js returned HTTP 404

  Requested:    /__sw__.js
  HTTP status:  404

Detected Vite. Add the nodepod plugin to serve __sw__.js automatically:

  // vite.config.ts
  import nodepod from '@scelar/nodepod/vite';
  export default defineConfig({ plugins: [nodepod()] });
```

The framework hint is picked automatically by sniffing the runtime
(`import.meta.hot`, `window.__NEXT_DATA__`, etc.).

## Opting out

Two knobs:

```ts
await Nodepod.boot({
  // Skip SW registration entirely (SSR, Node tests, hosts without a SW).
  serviceWorker: false,

  // Or: keep SW on, but skip the HEAD preflight (use if your host
  // disallows HEAD, requires auth, or trips the check some other way).
  skipSWPreflight: true,
});
```

With `serviceWorker: false` you keep the rest of Nodepod (filesystem,
spawn, packages) but preview iframes and `nodepod.request()` to virtual
ports won't work.

## Customising the URL

If you can't use `/__sw__.js` (maybe it's already taken), serve the SW
somewhere else and tell the SDK:

```ts
await Nodepod.boot({ swUrl: '/assets/nodepod-sw.js' });
```

Framework integrations support this too:

```ts
// Vite
nodepod({ path: '/assets/nodepod-sw.js' });

// Fetch-style
app.get('/assets/nodepod-sw.js', () => serveSW());
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `NodepodSWSetupError: HTTP 404` | No handler mounted | Add the plugin / route for your framework above |
| `NodepodSWSetupError: wrong Content-Type (text/html)` | SPA fallback catching `/__sw__.js` | Ensure your router serves the SW *before* the fallback |
| `NodepodSWSetupError: could not be reached` | CORS, network error, or timeout | Check devtools → Network; make sure the URL is same-origin |
| SW registers but preview iframes are blank | Nodepod's `Cross-Origin-*` headers missing | Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on HTML responses |
