import { expect, test, type Page } from "@playwright/test";

async function waitForGuest(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: "Clean preview ready" });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (await heading.isVisible().catch(() => false)) return;
    const button = page.getByRole("button", { name: /continue|try again/i });
    if (await button.isVisible().catch(() => false)) await button.click();
    try {
      await heading.waitFor({ state: "visible", timeout: 10_000 });
      return;
    } catch {
      // The automatic popup may have consumed the first click while finishing.
    }
  }
  await heading.waitFor({ state: "visible", timeout: 20_000 });
}

test("clean preview works embedded, top-level, on deep links, and after reload", async ({
  page,
  context,
}) => {
  await page.goto("/tests/browser/clean-preview.html");
  await expect(page.locator("#status")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });

  const cleanUrl = (await page.locator("#status").textContent())!;
  expect(cleanUrl).toMatch(/^http:\/\/pod[\w-]*-3000\.localhost:3333\/$/);
  expect(cleanUrl).not.toContain("/__virtual__/");

  const frame = page.frameLocator("#preview");
  await expect(frame.getByRole("heading", { name: "Clean preview ready" })).toBeVisible();

  const previewPromise = context.waitForEvent("page");
  await page.locator("#open").click();
  const preview = await previewPromise;
  await waitForGuest(preview);
  expect(preview.url()).toBe(cleanUrl);

  await preview.goto(`${cleanUrl}nested/route?from=browser-test`);
  await waitForGuest(preview);
  await expect(preview.locator("#request-path")).toHaveText(
    "/nested/route?from=browser-test",
  );

  await preview.reload();
  await waitForGuest(preview);
  await expect(preview.locator("#request-path")).toHaveText(
    "/nested/route?from=browser-test",
  );
});
