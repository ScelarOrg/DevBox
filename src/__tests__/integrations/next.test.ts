import { describe, it, expect } from "vitest";

// next/server is a peer dep. Skip the suite if it isn't installed.
let nextAvailable = true;
try {
  await import("next/server");
} catch {
  nextAvailable = false;
}

describe.skipIf(!nextAvailable)("integrations/next", () => {
  it("GET() returns a 200 response with SW body and headers", async () => {
    const mod = await import("../../integrations/next");
    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    expect(res.headers.get("service-worker-allowed")).toBe("/");
    const body = await res.text();
    expect(body.length).toBeGreaterThan(1000);
  });

  it("nodepodProxy returns null for non-SW paths", async () => {
    const mod = await import("../../integrations/next");
    const fakeReq = {
      nextUrl: { pathname: "/some-other-route" },
    } as unknown as import("next/server").NextRequest;
    const res = await mod.nodepodProxy(fakeReq);
    expect(res).toBeNull();
  });

  it("nodepodProxy returns a response for /__sw__.js", async () => {
    const mod = await import("../../integrations/next");
    const fakeReq = {
      nextUrl: { pathname: mod.nodepodMatcher },
    } as unknown as import("next/server").NextRequest;
    const res = await mod.nodepodProxy(fakeReq);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  // Next 16 renamed middleware.ts -> proxy.ts. Verify both names point at
  // the same function so docs for either version behave identically.
  it("nodepodMiddleware is an alias of nodepodProxy", async () => {
    const mod = await import("../../integrations/next");
    expect(mod.nodepodMiddleware).toBe(mod.nodepodProxy);
  });

  it("nodepodMiddleware still works for Next <=15 users", async () => {
    const mod = await import("../../integrations/next");
    const fakeReq = {
      nextUrl: { pathname: mod.nodepodMatcher },
    } as unknown as import("next/server").NextRequest;
    const res = await mod.nodepodMiddleware(fakeReq);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

describe.skipIf(nextAvailable)("integrations/next (skipped)", () => {
  it("next/server not installed, skipping", () => {
    expect(true).toBe(true);
  });
});
