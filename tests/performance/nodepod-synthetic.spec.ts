import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

test.setTimeout(30 * 60 * 1000);

type PerfResult = {
  scenario: string;
  mode: string;
  diagnostic: boolean;
  workers: number | null;
  bootMs: number;
  wallMs: number;
  scenarioResult: Record<string, unknown>;
  memory: Record<string, unknown>;
  reportJson: string;
  traceJson: string;
  error?: string;
};

type MetricMap = Record<string, number>;

declare global {
  interface Window {
    __nodepodPerfReady?: boolean;
    __nodepodPerfStart?: () => Promise<void>;
    __nodepodPerfResult?: PerfResult;
  }
}

const allScenarios = [
  "vfs-lookups",
  "lazy-hardlink-eviction",
  "binary-write-notifications",
  "snapshot-mount",
  "transform-throughput",
  "archive-extraction",
];
const scenarios = (process.env.NODEPOD_PERF_SCENARIOS || allScenarios.join(","))
  .split(",").map((value) => value.trim()).filter(Boolean);
const modes = (process.env.NODEPOD_PERF_MODES || "cold,warm,diagnostic")
  .split(",").map((value) => value.trim()).filter(Boolean);
const runs = Math.max(1, Number(process.env.NODEPOD_PERF_RUNS || 5));

function metricMap(metrics: Array<{ name: string; value: number }>): MetricMap {
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

function delta(after: MetricMap, before: MetricMap, name: string): number {
  return Math.max(0, (after[name] || 0) - (before[name] || 0));
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function runOne(
  page: Page,
  context: BrowserContext,
  scenario: string,
  mode: string,
  workerCount: number | null,
  testInfo: TestInfo,
  runIndex: number,
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ scenario, mode });
  if (mode === "diagnostic") query.set("diagnostic", "1");
  if (workerCount !== null) query.set("workers", String(workerCount));

  const url = `/tests/performance/nodepod-perf.html?${query.toString()}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__nodepodPerfReady === true, undefined, { timeout: 120_000 });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = metricMap((await cdp.send("Performance.getMetrics")).metrics);
  let cpuProfile: unknown = null;
  const captureCpu = new Set(["vfs-lookups", "lazy-hardlink-eviction", "snapshot-mount"])
    .has(scenario);
  if (captureCpu) {
    try {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    } catch {
      cpuProfile = { unavailable: true };
    }
  }

  await page.evaluate(() => window.__nodepodPerfStart!());
  await page.waitForFunction(() => window.__nodepodPerfResult !== undefined, undefined, { timeout: 240_000 });
  const after = metricMap((await cdp.send("Performance.getMetrics")).metrics);
  if (captureCpu && !cpuProfile) {
    try {
      cpuProfile = (await cdp.send("Profiler.stop")).profile;
      await cdp.send("Profiler.disable");
    } catch {
      cpuProfile = { unavailable: true };
    }
  }

  const result = await page.evaluate(() => window.__nodepodPerfResult!);
  expect(result.error, `${scenario}/${mode} failed`).toBeUndefined();
  expect(result.scenarioResult).toBeDefined();
  expect(result.reportJson).toBeTruthy();
  expect(result.traceJson).toBeTruthy();

  const metrics = {
    scriptDurationMs: delta(after, before, "ScriptDuration") * 1000,
    taskDurationMs: delta(after, before, "TaskDuration") * 1000,
    heapUsedBytes: after.JSHeapUsedSize || 0,
    heapTotalBytes: after.JSHeapTotalSize || 0,
    layoutCount: delta(after, before, "LayoutCount"),
  };
  const label = `${scenario}-${mode}-${workerCount ?? "default"}-run-${runIndex}`;
  await testInfo.attach(`${label}.json`, {
    body: JSON.stringify({ result, metrics, mainThreadCpuProfile: cpuProfile }, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(`${label}.trace.json`, {
    body: result.traceJson,
    contentType: "application/json",
  });
  if (cpuProfile) {
    await testInfo.attach(`${label}.main-thread.cpuprofile.json`, {
      body: JSON.stringify(cpuProfile),
      contentType: "application/json",
    });
  }
  return { ...result, metrics, mainThreadCpuProfile: cpuProfile };
}

test("Nodepod synthetic Chromium performance suite", async ({ browser }, testInfo) => {
  const summaries: Record<string, unknown> = {};
  for (const scenario of scenarios) {
    const workerCounts = scenario === "transform-throughput" ? [1, 2, 4] : [null];
    for (const mode of modes) {
      for (const workerCount of workerCounts) {
        const measurements: Record<string, unknown>[] = [];
        for (let runIndex = 1; runIndex <= runs; runIndex++) {
          const context = await browser.newContext();
          const page = await context.newPage();
          try {
            measurements.push(await runOne(page, context, scenario, mode, workerCount, testInfo, runIndex));
          } finally {
            await context.close();
          }
        }
        const wallTimes = measurements.map((value) => Number(value.wallMs));
        const scriptTimes = measurements.map((value) => Number((value.metrics as Record<string, unknown>).scriptDurationMs));
        const taskTimes = measurements.map((value) => Number((value.metrics as Record<string, unknown>).taskDurationMs));
        const heapPeaks = measurements.map((value) => Number((value.metrics as Record<string, unknown>).heapUsedBytes));
        const key = `${scenario}/${mode}/${workerCount ?? "default"}`;
        const summary = {
          runs,
          medianWallMs: percentile(wallTimes, 0.5),
          p95WallMs: percentile(wallTimes, 0.95),
          medianScriptMs: percentile(scriptTimes, 0.5),
          p95TaskMs: percentile(taskTimes, 0.95),
          peakHeapBytes: Math.max(...heapPeaks, 0),
          measurements,
        };
        summaries[key] = summary;
        const representative = measurements[wallTimes.indexOf(summary.medianWallMs)] || measurements[0];
        const scenarioNumbers = Object.fromEntries(
          Object.entries((representative?.scenarioResult || {}) as Record<string, unknown>)
            .filter(([, value]) => typeof value === "number"),
        );
        const report = JSON.parse(String(representative?.reportJson || "{}")) as {
          spans?: Array<{ name?: string; durationMs?: number }>;
          summary?: { longTasks?: Record<string, unknown> };
        };
        const workerSpans = Object.fromEntries(
          ["workers.queue", "workers.transfer.to", "workers.transfer.from", "workers.execution"]
            .map((name) => [name, (report.spans || [])
              .filter((span) => span.name === name)
              .reduce((total, span) => total + Number(span.durationMs || 0), 0)]),
        );
        console.log(`[nodepod-perf] ${key} ${JSON.stringify({
          medianWallMs: summary.medianWallMs,
          p95WallMs: summary.p95WallMs,
          medianScriptMs: summary.medianScriptMs,
          p95TaskMs: summary.p95TaskMs,
          peakHeapBytes: summary.peakHeapBytes,
          scenario: scenarioNumbers,
          workerSpans,
          longTasks: report.summary?.longTasks || {},
        })}`);
      }
    }
  }

  await testInfo.attach("nodepod-synthetic-summary.json", {
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      chromium: true,
      runs,
      scenarios,
      modes,
      summaries,
      baselineOnly: true,
    }, null, 2),
    contentType: "application/json",
  });
});
