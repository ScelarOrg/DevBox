import { describe, expect, it } from "vitest";
import { LRUCache, MemoryHandler } from "../memory-handler";

describe("byte-aware transform cache", () => {
  it("evicts by approximate bytes while retaining the newest entry", () => {
    const cache = new LRUCache<string, string>(10, 10, (value) => value.length);
    cache.set("old", "123456");
    cache.set("new", "123456");

    expect(cache.has("old")).toBe(false);
    expect(cache.has("new")).toBe(true);
    expect(cache.approxBytes).toBe(6);
  });

  it("reports UTF-16 transform cache usage and honors the additive byte option", () => {
    const handler = new MemoryHandler({
      transformCacheSize: 10,
      transformCacheMaxBytes: 20,
    });
    handler.transformCache.set("a", "1234567890");
    handler.transformCache.set("b", "abcdefghij");

    expect(handler.transformCache.approxBytes).toBe(20);
    handler.transformCache.set("c", "z");
    expect(handler.transformCache.approxBytes).toBeLessThanOrEqual(20);
    expect(handler.transformCache.has("c")).toBe(true);
  });
});
