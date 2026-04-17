import { describe, it, expect } from "vitest";
import {
  getServiceWorkerSource,
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
});
