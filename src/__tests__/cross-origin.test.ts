import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setAllowedDomains,
  setProxy,
  resolveProxyUrl,
  isDomainAllowed,
} from "../cross-origin";
import { RegistryClient } from "../packages/registry-client";

describe("cross-origin allowlist", () => {
  beforeEach(() => {
    setProxy(null);
    setAllowedDomains([]);
    (globalThis as any).localStorage = {
      _store: {} as Record<string, string>,
      getItem(k: string) {
        return this._store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this._store[k] = v;
      },
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows subdomain of a real domain", () => {
    setAllowedDomains(["example.com"]);
    setProxy("https://proxy.test/?url=");
    expect(resolveProxyUrl("https://api.example.com/x")).toContain("proxy.test");
  });

  it("blocks domains not on the allowlist", () => {
    setAllowedDomains(["example.com"]);
    setProxy("https://proxy.test/?url=");
    expect(() => resolveProxyUrl("https://evil.com/x")).toThrow(/Fetch blocked/);
  });

  it("rejects evil.localhost when only localhost is allowed", () => {
    setProxy("https://proxy.test/?url=");
    expect(() => resolveProxyUrl("https://evil.localhost/x")).toThrow(/Fetch blocked/);
  });

  it("allows exact localhost match", () => {
    setProxy("https://proxy.test/?url=");
    expect(resolveProxyUrl("http://localhost/x")).toContain("proxy.test");
  });

  it("allows all when allowlist is null", () => {
    setAllowedDomains(null);
    setProxy("https://proxy.test/?url=");
    expect(resolveProxyUrl("https://anything.example/x")).toContain("proxy.test");
  });

  it("returns url unchanged when no proxy configured", () => {
    expect(resolveProxyUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("isDomainAllowed rejects evil.localhost", () => {
    expect(isDomainAllowed("https://evil.localhost/x")).toBe(false);
  });

  it("retries a registry 404 from the configured proxy directly", async () => {
    setAllowedDomains(null);
    setProxy("https://proxy.test/?url=");
    const metadata = {
      name: "react",
      "dist-tags": { latest: "1.0.0" },
      versions: {},
    };
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).startsWith("https://proxy.test/")
        ? new Response("proxy unavailable", { status: 404 })
        : new Response(JSON.stringify(metadata), {
            headers: { "content-type": "application/json" },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RegistryClient({
      endpoint: "https://registry.example.test",
    });
    await expect(client.fetchManifest("react")).resolves.toEqual(metadata);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://registry.example.test/react",
    );
  });

});
