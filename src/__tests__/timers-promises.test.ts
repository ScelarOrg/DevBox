import { describe, it, expect } from "vitest";
import { promises as timersPromises } from "../polyfills/timers";

describe("timers/promises.setInterval", () => {
  it("is an async iterable that yields values", async () => {
    const iter = timersPromises.setInterval(10, "tick");
    expect(typeof iter[Symbol.asyncIterator]).toBe("function");

    const values: unknown[] = [];
    for await (const v of iter) {
      values.push(v);
      if (values.length >= 2) break;
    }
    expect(values).toEqual(["tick", "tick"]);
  });

  it("rejects on abort", async () => {
    const ac = new AbortController();
    const iter = timersPromises.setInterval(50, 1, { signal: ac.signal });
    const it = iter[Symbol.asyncIterator]();
    const pending = it.next();
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
