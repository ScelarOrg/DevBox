import { test } from "@playwright/test";

test("Vite 8 + Tailwind CSS 4 waits for Lightning CSS WASM", async ({ page }, testInfo) => {
  page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));

  await page.goto("/examples/vite8-tailwind-build/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => document.querySelector("#output")?.textContent?.includes("PASS:"),
    undefined,
    { timeout: 180_000 },
  );

  const output = (await page.locator("#output").textContent()) ?? "";
  await testInfo.attach("vite8-tailwind-output.txt", {
    body: output,
    contentType: "text/plain",
  });
});
