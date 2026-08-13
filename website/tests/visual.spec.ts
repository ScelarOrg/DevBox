import { expect, test } from "@playwright/test";

test("landing page visual snapshot", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.CI), "Visual baselines are reviewed from the local production preview.");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page).toHaveScreenshot(`${testInfo.project.name}-landing.png`, { fullPage: true });
});

test("terminal visual snapshot", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.CI), "Visual baselines are reviewed from the local production preview.");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByRole("button", { name: "Start terminal" }).click();
  await expect(page.locator("[data-terminal-demo]")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  await expect(page.locator("[data-terminal-demo]")).toHaveScreenshot(`${testInfo.project.name}-terminal.png`);
});
