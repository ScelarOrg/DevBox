import { expect, test } from "@playwright/test";

test("runs the Nodepod profiler smoke test in Chromium", async ({ page }, testInfo) => {
  await page.goto("/examples/profiler-smoke/");
  await expect(page.locator("#status")).toHaveText("PASS", { timeout: 120_000 });

  const result = await page.evaluate(() => (window as Window & {
    __nodepodProfilerSmoke?: {
      enabled: boolean;
      level: string;
      spanCount: number;
      spans: string[];
      counters: Record<string, number>;
      sampleCount: number;
      traceEventCount: number;
      warnings: string[];
      performanceStats: unknown;
    };
  }).__nodepodProfilerSmoke);

  expect(result?.enabled).toBe(true);
  expect(result?.spanCount).toBeGreaterThan(0);
  expect(result?.spans).toContain("filesystem.writeFile");
  expect(result?.spans).toContain("process.spawn");
  expect(result?.traceEventCount).toBeGreaterThan(0);
  expect(result?.performanceStats).toBeDefined();

  await testInfo.attach("nodepod-profiler-smoke.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
});
