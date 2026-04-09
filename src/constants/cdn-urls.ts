// Pinned CDN versions and URLs

export const PINNED_ESBUILD_WASM = '0.20.0';
export const PINNED_ROLLUP_BROWSER = '4.9.0';
export const PINNED_BROTLI_WASM = '3.0.1';
export const PINNED_LIGHTNINGCSS_WASM = '1.31.1';

export const CDN_ESBUILD_ESM = `https://esm.sh/esbuild-wasm@${PINNED_ESBUILD_WASM}`;
export const CDN_ESBUILD_BINARY = `https://esm.sh/esbuild-wasm@${PINNED_ESBUILD_WASM}/esbuild.wasm`;
export const CDN_ESBUILD_BROWSER = `https://esm.sh/esbuild-wasm@${PINNED_ESBUILD_WASM}/esm/browser.min.js`;
export const CDN_ROLLUP_BROWSER = `https://esm.sh/@rollup/browser@${PINNED_ROLLUP_BROWSER}`;
// Use the web entry point explicitly — esm.sh's default resolution picks
// the `browser` / `pkg.bundler` variant whose circular WASM ↔ JS-glue
// dependency isn't correctly linked after esm.sh re-bundles it, causing
// `(void 0) is not a function` at runtime.  The web variant has a proper
// `init()` that fetches + instantiates the WASM with correct imports.
export const CDN_BROTLI_WASM = `https://esm.sh/brotli-wasm@${PINNED_BROTLI_WASM}/index.web.js`;
export const CDN_LIGHTNINGCSS_WASM = `https://esm.sh/lightningcss-wasm@${PINNED_LIGHTNINGCSS_WASM}`;

// new Function hides import() from bundler static analysis so CDN URLs work at runtime
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const _dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<any>;
export { _dynamicImport as cdnImport };
