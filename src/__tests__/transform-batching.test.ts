import { describe, expect, it } from "vitest";
import { chunkTransformFiles } from "../threading/transform-batching";
import { taskId } from "../threading/offload";

describe("transform batching", () => {
  it("chunks by file count and preserves order", () => {
    const files = Array.from({ length: 130 }, (_, index) => ({
      filePath: `/file-${index}.js`,
      source: `export const value${index} = ${index};`,
    }));
    const batches = chunkTransformFiles(files);

    expect(batches.map((batch) => batch.length)).toEqual([64, 64, 2]);
    expect(batches.flat().map((file) => file.filePath)).toEqual(
      files.map((file) => file.filePath),
    );
  });

  it("chunks by source size without splitting a file", () => {
    const files = [
      { filePath: "/a.js", source: "a".repeat(6) },
      { filePath: "/b.js", source: "b".repeat(6) },
      { filePath: "/c.js", source: "c".repeat(2) },
    ];
    const batches = chunkTransformFiles(files, 64, 10);

    expect(batches.map((batch) => batch.map((file) => file.filePath))).toEqual([
      ["/a.js"],
      ["/b.js", "/c.js"],
    ]);
  });

  it("generates unique numeric task ids", () => {
    const ids = Array.from({ length: 1000 }, () => taskId());
    expect(ids.every((id) => typeof id === "number")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
