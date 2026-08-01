import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { build as esbuild } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { createNodeHost } from "../host/node/node-host";
import { resetRuntimeHost, setRuntimeHost } from "../host";
import { Nodepod } from "../sdk/nodepod";

const here = dirname(fileURLToPath(import.meta.url));
const workerEntry = resolve(here, "../threading/process-worker-entry.ts");

describe("node headless host", () => {
  let workerPath = "";
  let tempDir = "";

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nodepod-headless-"));
    workerPath = join(tempDir, "__worker__.js");
    const result = await esbuild({
      entryPoints: [workerEntry],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "esnext",
      write: false,
      minify: false,
      legalComments: "none",
      sourcemap: false,
      // Match lib build: worker must not pull host/virtual modules.
      plugins: [
        {
          name: "stub-virtual-process-worker",
          setup(build) {
            build.onResolve({ filter: /^virtual:process-worker-bundle$/ }, () => ({
              path: "virtual:process-worker-bundle",
              namespace: "stub",
            }));
            build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
              contents:
                'export const PROCESS_WORKER_BUNDLE_GZIP_BASE64 = "";',
              loader: "js",
            }));
          },
        },
      ],
    });
    writeFileSync(workerPath, result.outputFiles[0].text, "utf8");
  }, 120_000);

  afterAll(() => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  afterEach(() => {
    resetRuntimeHost();
  });

  it("boots, runs shell echo via spawn, and serves HTTP over local ingress", async () => {
    setRuntimeHost(
      createNodeHost({
        workerPath,
        httpHost: "127.0.0.1",
        httpPort: 0,
      }),
    );

    const pod = await Nodepod.boot({
      packageStore: "memory",
      enableSnapshotCache: false,
    });
    expect(pod.isHeadless).toBe(true);

    await pod.fs.writeFile("/hello.txt", "from-fs");
    expect(await pod.fs.readFile("/hello.txt", "utf8")).toBe("from-fs");

    const echo = await pod.spawn("echo", ["hello-headless"]);
    const echoResult = await echo.completion;
    expect(echoResult.exitCode).toBe(0);
    expect(echoResult.stdout).toContain("hello-headless");

    // Register a tiny in-process virtual server via spawn node -e style is heavy;
    // instead exercise request() 503 and local baseUrl from ingress.
    const base = pod.proxy.getBaseUrl();
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const miss = await pod.request(4242, { path: "/nope" });
    expect(miss.statusCode).toBe(503);

    // Fetch against the local ingress (same 503 path)
    const url = `${base}/__virtual__/${pod.instanceId}/4242/nope`;
    const res = await fetch(url);
    expect(res.status).toBe(503);

    pod.teardown();
  }, 60_000);
});
