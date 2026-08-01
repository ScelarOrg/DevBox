/**
 * One-shot Playwright check: boot Notion Navigator in Nodepod, sign up, confirm session.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.NODEPOD_EXAMPLES_URL || "http://127.0.0.1:3333";
const email = `nav-${Date.now()}@nodepod.local`;
const password = "demo-password-123";
const name = "Navigator Demo";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(240_000);

const authTraffic = [];
page.on("response", async (res) => {
  const url = res.url();
  if (!/\/api\/auth\//.test(url)) return;
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "<unreadable>";
  }
  const setCookie = await res.headerValues("set-cookie").catch(() => []);
  authTraffic.push({
    url,
    status: res.status(),
    setCookie,
    body: body.slice(0, 1200),
  });
});

try {
  console.log(`Opening ${BASE}/examples/notion-navigator/`);
  await page.goto(`${BASE}/examples/notion-navigator/`);
  await page.getByRole("button", { name: "Boot + install + start" }).click();

  await page.waitForFunction(
    () => /Live|Error/.test(document.querySelector("#status")?.textContent ?? ""),
    null,
    { timeout: 210_000 },
  );

  const status = await page.locator("#status").textContent();
  const log = (await page.locator("#output").textContent()) ?? "";
  if (status?.includes("Error")) {
    throw new Error(`Boot failed:\n${status}\n${log}`);
  }
  console.log("Vite live:", status);

  // Wait until Vite client optimizer finishes (otherwise preview stays blank/partial).
  await page.waitForFunction(
    () => {
      const out = document.querySelector("#output")?.textContent ?? "";
      return (
        out.includes("bundling dependencies") === false ||
        /optimizer.*done|ready in|\[vite\].*page reload|Sign in|Create account/i.test(out) ||
        document.querySelector("#preview")?.contentDocument?.body?.innerText?.length > 20
      );
    },
    null,
    { timeout: 120_000 },
  ).catch(() => {});

  // Extra settle for first dependency optimize + React hydrate.
  await page.waitForTimeout(8000);

  const preview = page.frameLocator("#preview");
  const dump = async (label) => {
    const html = await page.evaluate(() => {
      const iframe = document.querySelector("#preview");
      try {
        return {
          href: iframe?.contentWindow?.location?.href,
          text: iframe?.contentDocument?.body?.innerText?.slice(0, 1500),
          html: iframe?.contentDocument?.body?.innerHTML?.slice(0, 2000),
        };
      } catch (e) {
        return { error: String(e), src: iframe?.src };
      }
    });
    console.log(label, JSON.stringify(html, null, 2));
  };

  await dump("Preview before auth");

  // Prefer concrete inputs over heading roles (CardTitle may not be a heading).
  await preview.locator("#login-email, #signup-email").first().waitFor({ timeout: 120_000 });

  if (await preview.locator("#signup-email").count()) {
    console.log("Already on signup");
  } else {
    await preview.getByRole("link", { name: /Sign up/i }).click();
    await preview.locator("#signup-email").waitFor({ timeout: 30_000 });
  }

  await preview.locator("#signup-name").fill(name);
  await preview.locator("#signup-email").fill(email);
  await preview.locator("#signup-password").fill(password);

  console.log("Submitting signup for", email);
  const signupRespPromise = page.waitForResponse(
    (r) => /\/api\/auth\/sign-up/.test(r.url()),
    { timeout: 60_000 },
  );
  await preview.locator('button[type="submit"]').click();
  const signupResp = await signupRespPromise.catch((e) => {
    console.log("No sign-up response:", e.message);
    return null;
  });
  if (signupResp) {
    console.log("sign-up status", signupResp.status());
    console.log("sign-up set-cookie", await signupResp.headerValues("set-cookie").catch(() => []));
    console.log("sign-up body", (await signupResp.text().catch(() => "")).slice(0, 800));
  }

  await page.waitForTimeout(3000);
  await dump("Preview after signup");
  console.log("Auth traffic:", JSON.stringify(authTraffic, null, 2));

  const cookies = await page.context().cookies();
  console.log(
    "Browser cookies:",
    cookies.map((c) => ({
      name: c.name,
      path: c.path,
      domain: c.domain,
      value: (c.value || "").slice(0, 16) + "…",
    })),
  );

  const sessionOk = await page.evaluate(async () => {
    const iframe = document.querySelector("#preview");
    const win = iframe?.contentWindow;
    if (!win) return { ok: false, reason: "no iframe window" };
    const res = await win.fetch("/api/auth/get-session", { credentials: "include" });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return {
      ok: res.ok && !!json?.user,
      status: res.status,
      json,
      documentCookie: win.document.cookie,
    };
  });

  console.log("get-session:", JSON.stringify(sessionOk, null, 2));
  if (!sessionOk.ok) {
    throw new Error(`Session cookie not working: ${JSON.stringify(sessionOk)}`);
  }

  console.log("PASS: signup + session cookie works for", email);
  process.exitCode = 0;
} catch (err) {
  console.error("FAIL:", err);
  console.error("Auth traffic dump:", JSON.stringify(authTraffic, null, 2));
  const log = await page.locator("#output").textContent().catch(() => "");
  console.error("Host log tail:\n", (log || "").slice(-2500));
  process.exitCode = 1;
} finally {
  await browser.close();
}
