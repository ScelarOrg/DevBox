import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ensureRuntimeHost,
  getRuntimeHost,
  resetRuntimeHost,
  registerDefaultHostFactory,
  createBrowserHost,
} from "../host";

describe("default RuntimeHost registration", () => {
  beforeEach(() => {
    resetRuntimeHost();
    registerDefaultHostFactory(null);
  });

  afterEach(() => {
    resetRuntimeHost();
    registerDefaultHostFactory(null);
  });

  it("getRuntimeHost() works after browser factory registration without setRuntimeHost", () => {
    registerDefaultHostFactory(createBrowserHost);
    const host = getRuntimeHost();
    expect(host.kind).toBe("browser");
    expect(host.canCreateWorkers()).toBeTypeOf("boolean");
  });

  it("getRuntimeHost() falls back to globalThis factory hook", () => {
    // Simulate minify dropping registerDefaultHostFactory() but keeping the
    // globalThis assignment from the browser entry / browser-host module.
    (globalThis as Record<string, unknown>).__NODEPOD_CREATE_BROWSER_HOST__ =
      createBrowserHost;
    const host = getRuntimeHost();
    expect(host.kind).toBe("browser");
  });

  it("ensureRuntimeHost() waits for a late globalThis factory hook", async () => {
    queueMicrotask(() => {
      (globalThis as Record<string, unknown>).__NODEPOD_CREATE_BROWSER_HOST__ =
        createBrowserHost;
    });
    // First macrotask: hook still missing; ensureRuntimeHost loops with setTimeout(0).
    setTimeout(() => {
      (globalThis as Record<string, unknown>).__NODEPOD_CREATE_BROWSER_HOST__ =
        createBrowserHost;
    }, 0);
    const host = await ensureRuntimeHost();
    expect(host.kind).toBe("browser");
  });
});
