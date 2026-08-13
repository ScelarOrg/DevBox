import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["line"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3333",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node examples/serve.js",
    url: "http://localhost:3333/tests/browser/clean-preview.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
