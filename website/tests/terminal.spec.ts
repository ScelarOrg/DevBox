import { expect, test } from "@playwright/test";

test("terminal runtime stays lazy and never requests a service worker", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Full runtime boot is covered once in desktop Chromium.");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("./");
  await expect(page.locator("[data-terminal-demo]")).toHaveAttribute("data-state", "idle");
  expect(requests.some((url) => url.includes("terminal-client"))).toBeFalsy();
  expect(requests.some((url) => url.includes("/__sw__.js"))).toBeFalsy();

  await page.getByRole("button", { name: "Start terminal" }).click();
  await expect(page.locator("[data-terminal-demo]")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  expect(requests.some((url) => url.includes("terminal-client"))).toBeTruthy();
  expect(requests.some((url) => url.includes("/__sw__.js"))).toBeFalsy();

  await page.getByRole("button", { name: "node hello.js" }).click();
  await expect(page.locator(".xterm-rows")).toContainText("Hello from Node.js, inside the browser.", { timeout: 30_000 });

  await page.getByRole("button", { name: "npx cowsay hi" }).click();
  await expect(page.locator(".xterm-rows")).toContainText("< hi >", { timeout: 60_000 });

  await page.getByRole("button", { name: "Reset runtime" }).click();
  await expect(page.locator("[data-terminal-demo]")).toHaveAttribute("data-teardown-count", "1");
  await expect(page.locator("[data-terminal-demo]")).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
  expect(requests.some((url) => url.includes("/__sw__.js"))).toBeFalsy();
});

test("terminal reports a recoverable lazy-load failure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Failure fallback is viewport-independent.");
  await page.route("**/*terminal-client*.js", (route) => route.abort());
  await page.goto("./");
  await page.getByRole("button", { name: "Start terminal" }).click();

  await expect(page.locator("[data-terminal-demo]")).toHaveAttribute("data-state", "failed");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
