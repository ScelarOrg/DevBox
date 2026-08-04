import { describe, expect, it } from "vitest";
import { NodepodProfilerImpl } from "../profiling/profiler";
import { MemoryVolume } from "../memory-volume";
import { NodepodFS } from "../sdk/nodepod-fs";

describe("Nodepod profiler", () => {
  it("records bounded spans, counters, and portable exports", async () => {
    const profiler = new NodepodProfilerImpl({
      enabled: true,
      level: "timings",
      pathDetail: "basename",
    });
    const session = profiler.start("install");
    const parent = profiler.begin("packages.install", {
      category: "packages",
      metadata: { path: "/workspace/node_modules/vite/index.js" },
    });
    const child = profiler.begin("packages.extract", {
      category: "packages",
      parentId: parent?.id,
      metadata: {
        path: "/workspace/node_modules/vite/index.js",
        tarballUrl: "https://registry.example.test/vite.tgz?token=secret",
      },
    });
    profiler.count("packages.downloads");
    profiler.end(child);
    profiler.end(parent);

    const report = await session.stop();
    expect(report.version).toBe(1);
    expect(report.counters["packages.downloads"]).toBe(1);
    expect(report.spans).toHaveLength(2);
    expect(report.spans[0]?.metadata?.path).toBe("index.js");
    expect(report.spans[1]?.metadata?.tarballUrl).toBeUndefined();
    expect(report.export("json")).toContain('"version": 1');

    const trace = JSON.parse(report.export("chrome-trace")) as { traceEvents: unknown[] };
    expect(trace.traceEvents).toHaveLength(2);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it("keeps only the slowest span after the cap", async () => {
    const profiler = new NodepodProfilerImpl({
      enabled: true,
      maxSpans: 1,
      slowSpanThresholdMs: 0,
    });
    const session = profiler.start("bounded");
    const first = profiler.begin("first", { category: "workers" });
    profiler.end(first);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = profiler.begin("second", { category: "workers" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    profiler.end(second);

    const report = await session.stop();
    expect(report.spans).toHaveLength(1);
    expect(report.summary.droppedSpans).toBe(0);
    expect(report.summary.operations["workers:first"]?.count).toBe(1);
    expect(report.summary.operations["workers:second"]?.count).toBe(1);
  });

  it("returns an inert report when disabled", async () => {
    const profiler = new NodepodProfilerImpl({ enabled: false, captureMemory: true });
    const report = await profiler.start("disabled").stop();
    expect(report.spans).toHaveLength(0);
    expect(report.samples).toHaveLength(0);
    expect(report.warnings.some((warning) => warning.code === "profiler-disabled")).toBe(true);
  });

  it("rejects overlapping sessions and supports profile helper", async () => {
    const profiler = new NodepodProfilerImpl({ enabled: true });
    const first = profiler.start("first");
    expect(() => profiler.start("second")).toThrow(/active session/);
    await first.stop();

    const profiled = await profiler.profile("success", () => 42);
    expect(profiled.result).toBe(42);
    expect(profiled.report.name).toBe("success");
  });

  it("profiles public filesystem boundaries without changing MemoryVolume internals", async () => {
    const profiler = new NodepodProfilerImpl({ enabled: true, level: "detailed" });
    const session = profiler.start("filesystem");
    const fs = new NodepodFS(new MemoryVolume(), profiler);
    await fs.writeFile("/tmp/example.txt", "hello");
    await fs.readFile("/tmp/example.txt", "utf8");
    await fs.stat("/tmp/example.txt");

    const report = await session.stop();
    expect(report.spans.map((span) => span.name)).toEqual(
      expect.arrayContaining([
        "filesystem.writeFile",
        "filesystem.readFile",
        "filesystem.stat",
      ]),
    );
    expect(report.counters["fs.writes"]).toBe(1);
    expect(report.counters["fs.reads"]).toBe(1);
  });
});
