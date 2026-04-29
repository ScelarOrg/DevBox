// Vite plugin that serves /__sw__.js in dev and emits it as an asset at
// build time, so the user never has to copy the file into public/.
//
//   // vite.config.ts
//   import nodepod from '@scelar/nodepod/vite';
//   export default defineConfig({ plugins: [nodepod()] });
//
// Vite's types are imported as `type` only so `vite` stays an optional
// peer dep at runtime.

import type { Plugin } from "vite";
import { readServiceWorkerSource } from "./shared/read-sw";
import { swResponseHeaders, DEFAULT_SW_PATH } from "./shared/headers";

export interface NodepodVitePluginOptions {
  /** Path to serve the SW from. Same origin as the page, must end in .js. Defaults to /__sw__.js. */
  path?: string;
  /** Git mode. `'native'` uses real Git Smart HTTP protocol (CORS proxy auto-configured). Defaults to `'api'` (GitHub REST API). */
  git?: 'api' | 'native';
}

export default function nodepod(
  opts: NodepodVitePluginOptions = {},
): Plugin {
  const swPath = opts.path ?? DEFAULT_SW_PATH;
  // Rollup asset names are relative to outDir, so drop the leading slash.
  const assetFileName = swPath.replace(/^\/+/, "");

  const gitProxyPath = opts.git === "native" ? "/__nodepod_git_proxy__" : undefined;

  return {
    name: "nodepod",
    config() {
      if (!gitProxyPath) return;

      // Resolve Nodepod's crypto polyfill for isomorphic-git.
      // isomorphic-git does require('crypto').createHash which doesn't exist in browser.
      let cryptoPath = "";
      try {
        const nodepodMain = require.resolve("@scelar/nodepod");
        cryptoPath = nodepodMain.replace(/\/dist\/.*/, "/src/polyfills/crypto.ts");
      } catch { /* isomorphic-git will fail with createHash error */ }

      return {
        resolve: {
          alias: cryptoPath ? { crypto: cryptoPath } : {},
        },
        optimizeDeps: {
          esbuildOptions: {
            plugins: cryptoPath ? [{
              name: "nodepod-crypto-shim",
              setup(build: any) {
                build.onResolve({ filter: /^crypto$/ }, () => ({
                  path: cryptoPath,
                }));
              },
            }] : [],
          },
        },
        server: {
          proxy: {
            [gitProxyPath]: {
              target: "https://github.com",
              changeOrigin: true,
              rewrite: (path: string) => path.replace(new RegExp(`^${gitProxyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/github\\.com`), ""),
            },
          },
        },
      };
    },
    configureServer(server) {
      // Match on the path alone so the SDK's `?v=${Date.now()}` cache-buster
      // still hits this handler.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== swPath) return next();
        try {
          const source = await readServiceWorkerSource(import.meta.url);
          const headers = swResponseHeaders();
          for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
          res.statusCode = 200;
          res.end(source);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain");
          const msg = err instanceof Error ? err.message : String(err);
          res.end(`[nodepod/vite] failed to read __sw__.js: ${msg}`);
        }
      });
    },
    async generateBundle() {
      const source = await readServiceWorkerSource(import.meta.url);
      this.emitFile({
        type: "asset",
        fileName: assetFileName,
        source,
      });
    },
  };
}

// Also expose as named for `import { nodepod } from '@scelar/nodepod/vite'`.
export { nodepod };
