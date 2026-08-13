import { describe, it, expect } from "vitest";
import {
  DEFAULT_BRIDGE_HTML_PATH,
  DEFAULT_BRIDGE_SCRIPT_PATH,
  getServiceWorkerSource,
  servePreviewBridge,
  servePreviewBootstrap,
  servePreviewBridgeNode,
  servePreviewBridgeScript,
  serveSW,
  serveSWNode,
} from "../../integrations/server";

describe("integrations/server", () => {
  it("getServiceWorkerSource returns the __sw__.js source", async () => {
    const src = await getServiceWorkerSource();
    expect(typeof src).toBe("string");
    // Sanity check we got the real SW, not an empty placeholder.
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toMatch(/self\.addEventListener\(['"](install|fetch)['"]/);
    expect(src).toMatch(/bind-origin/);
    expect(src).toMatch(/origin-bound/);
    expect(src).toMatch(/nodepodInstanceId/);
    expect(src).toMatch(/registeredOriginPod/);
    expect(src).toMatch(/attach-preview-bridge/);
    expect(src).toMatch(/targetClient\.postMessage/);
    expect(src).toMatch(/statusPort/);
  });

  it("serveSW() returns a 200 Response with correct headers", async () => {
    const res = await serveSW();
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toMatch(/javascript/);
    expect(res.headers.get("service-worker-allowed")).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    const body = await res.text();
    expect(body.length).toBeGreaterThan(1000);
  });

  it("serveSW() ignores the request object", async () => {
    const req = new Request("http://example.test/somewhere-else");
    const res = await serveSW(req);
    expect(res.status).toBe(200);
  });

  it("serveSWNode() returns a Buffer + header map", async () => {
    const { body, headers, contentType } = await serveSWNode();
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.length).toBeGreaterThan(1000);
    expect(headers["Service-Worker-Allowed"]).toBe("/");
    expect(contentType).toMatch(/javascript/);
  });

  it("caches repeated reads (same source string returned)", async () => {
    const [a, b] = await Promise.all([
      getServiceWorkerSource(),
      getServiceWorkerSource(),
    ]);
    expect(a).toBe(b);
  });

  it("serves both hostname-preview bridge assets", async () => {
    expect(DEFAULT_BRIDGE_HTML_PATH).toBe("/__nodepod_bridge__.html");
    expect(DEFAULT_BRIDGE_SCRIPT_PATH).toBe("/__nodepod_bridge__.js");

    const html = await servePreviewBridge();
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toMatch(/text\/html/i);
    expect(html.headers.get("cross-origin-resource-policy")).toBe(
      "cross-origin",
    );
    expect(await html.text()).toMatch(/__nodepod_bridge__\.js/);

    const bootstrap = await servePreviewBootstrap();
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.headers.get("cross-origin-opener-policy")).toBe(
      "same-origin-allow-popups",
    );

    const parentBridge = await servePreviewBridge(
      new Request("https://app.example/__nodepod_bridge__.html?mode=parent"),
    );
    expect(parentBridge.headers.get("cross-origin-opener-policy")).toBe(
      "unsafe-none",
    );

    const script = await servePreviewBridgeScript();
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toMatch(/javascript/i);
    const scriptText = await script.text();
    expect(scriptText).toMatch(/serviceWorker\.register/);
    expect(scriptText).toMatch(/nodepod-bridge-stage/);
    expect(scriptText).toMatch(/nodepod-bridge-reconnect/);
    expect(scriptText).toMatch(/sw-needs-init/);
    expect(scriptText).toMatch(/nodepod-preview-attach/);
    expect(scriptText).toMatch(/nodepod-parent-bridge-ready/);
    expect(scriptText).toMatch(/attach-preview-bridge/);
    expect(scriptText).toMatch(/nodepod-parent-bridge-accepted/);
    expect(scriptText).toMatch(/statusChannel/);
    expect(scriptText).toMatch(/nodepod-status-card/);
    expect(scriptText).toMatch(/nodepod-status-panel/);
    expect(scriptText).toMatch(/nodepod-status-actions/);
    expect(scriptText).toMatch(/Go back/);
    expect(scriptText).not.toMatch(/nodepod-status-brand/);
    expect(scriptText).toMatch(/automatic popup handoff run in parallel/);
    expect(scriptText).toMatch(/}, 5_000\);/);
    expect(scriptText).not.toMatch(/}, 2500\);/);
    expect(scriptText).toMatch(/prefers-reduced-motion/);

    const node = await servePreviewBridgeNode("script");
    expect(Buffer.isBuffer(node.body)).toBe(true);
    expect(node.contentType).toMatch(/javascript/i);
    expect(node.headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
  });
});
