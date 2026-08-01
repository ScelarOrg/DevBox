import { describe, it, expect } from "vitest";
import { quickDigest } from "../helpers/digest";

describe("quickDigest", () => {
  it("returns a string", () => {
    expect(typeof quickDigest("hello")).toBe("string");
  });

  it("returns consistent results for same input", () => {
    expect(quickDigest("hello")).toBe(quickDigest("hello"));
    expect(quickDigest("test/path/file.js")).toBe(
      quickDigest("test/path/file.js"),
    );
  });

  it("returns different results for different inputs", () => {
    expect(quickDigest("hello")).not.toBe(quickDigest("world"));
    expect(quickDigest("a")).not.toBe(quickDigest("b"));
  });

  it("handles empty string", () => {
    const result = quickDigest("");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles very long strings", () => {
    const long = "x".repeat(100_000);
    const result = quickDigest(long);
    expect(typeof result).toBe("string");
  });

  it("handles unicode", () => {
    const result = quickDigest("🎉🚀日本語");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns base-36 encoded string", () => {
    const result = quickDigest("some input");
    // djb2 can go negative, hence the -?
    expect(result).toMatch(/^-?[0-9a-z]+$/);
  });
});
