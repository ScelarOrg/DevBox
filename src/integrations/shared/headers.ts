// One place for the headers used when serving __sw__.js, so Vite, Next and
// the generic server handler can't drift apart.

export const DEFAULT_SW_PATH = "/__sw__.js";
export const DEFAULT_BRIDGE_HTML_PATH = "/__nodepod_bridge__.html";
export const DEFAULT_BRIDGE_SCRIPT_PATH = "/__nodepod_bridge__.js";

/**
 * Headers for the nodepod service worker response.
 *
 * Content-Type must be a JS type or browsers silently refuse to register
 * the SW (the common failure mode is SPA dev servers serving text/html
 * as a fallback and quietly breaking things).
 *
 * Service-Worker-Allowed: / lets the SW control the whole origin even if
 * the script itself lives under a nested path.
 *
 * Cache-Control: no-cache pairs with the `?v=${Date.now()}` cache-buster
 * the SDK appends on register(), so upgrades don't get a stale SW.
 */
export function swResponseHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/javascript; charset=utf-8",
    "Service-Worker-Allowed": "/",
    "Cache-Control": "no-cache",
  };
}

export function previewBridgeResponseHeaders(
  contentType: string,
  mode?: "top" | "parent" | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "no-store",
  };
  if (mode === "top") {
    headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups";
  } else if (mode === "parent") {
    headers["Cross-Origin-Opener-Policy"] = "unsafe-none";
  }
  return headers;
}
