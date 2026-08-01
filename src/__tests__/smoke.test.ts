import { describe, it, expect } from "vitest";
import { MemoryVolume } from "../memory-volume";

describe("smoke", () => {
  it("MemoryVolume read/write round-trip", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/tmp", { recursive: true });
    vol.writeFileSync("/tmp/hello.txt", "world");
    expect(vol.readFileSync("/tmp/hello.txt", "utf8")).toBe("world");
  });
});
