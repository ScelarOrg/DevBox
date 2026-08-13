import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.05,
    },
  },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4321/Nodepod/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "corepack pnpm run preview:test",
    url: "http://127.0.0.1:4321/Nodepod/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
