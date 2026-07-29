import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("virtual:process-worker-bundle", () => ({
  PROCESS_WORKER_BUNDLE_GZIP_BASE64: "H4sIAAAAAAAAEwMAAAAAAAAAAAA=",
}));

import { Nodepod } from "../sdk/nodepod";
import {
  createBrowserHost,
  resetRuntimeHost,
  setRuntimeHost,
} from "../host";

describe("browser headless Nodepod.boot", () => {
  let workerWasSet = false;

  beforeEach(() => {
    resetRuntimeHost();
    setRuntimeHost(createBrowserHost());
    if (typeof (globalThis as any).Worker === "undefined") {
      (globalThis as any).Worker = function MockWorker() {} as any;
      workerWasSet = true;
    }
  });

  afterEach(() => {
    resetRuntimeHost();
    if (workerWasSet) {
      delete (globalThis as any).Worker;
      workerWasSet = false;
    }
  });

  it("applies headless defaults (no SW, watermark off)", async () => {
    const pod = await Nodepod.boot({ headless: true });
    expect(pod.isHeadless).toBe(true);
    expect(pod.proxy.isServiceWorkerReady).toBe(false);
    await pod.fs.writeFile("/hello.txt", "hi");
    expect(await pod.fs.readFile("/hello.txt", "utf8")).toBe("hi");
    const miss = await pod.request(9999, { path: "/" });
    expect(miss.statusCode).toBe(503);
    pod.teardown();
  });

  it("exposes request() without requiring a listening server", async () => {
    const pod = await Nodepod.boot({ headless: true });
    const res = await pod.request(1, { method: "POST", path: "/x", body: "y" });
    expect(res.statusCode).toBe(503);
    expect(pod.port(1)).toBeNull();
    pod.teardown();
  });
});
