import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("virtual:process-worker-bundle", () => ({
  PROCESS_WORKER_BUNDLE_GZIP_BASE64: "H4sIAAAAAAAAEwMAAAAAAAAAAAA=",
}));

import { Nodepod } from "../sdk/nodepod";
import { Buffer } from "../polyfills/buffer";
import {
  createBrowserHost,
  resetRuntimeHost,
  setRuntimeHost,
} from "../host";

class DisplayTerminal {
  static instances: DisplayTerminal[] = [];
  readonly writes: string[] = [];

  constructor(_options: unknown) {
    DisplayTerminal.instances.push(this);
  }

  open(): void {}
  loadAddon(): void {}
  focus(): void {}
  dispose(): void {}

  write(text: string): void {
    this.writes.push(text);
  }

  onData(): { dispose(): void } {
    return { dispose() {} };
  }
}

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

  it("installs SDK dependencies under the configured workdir", async () => {
    const pod = await Nodepod.boot({
      headless: true,
      workdir: "/workspace",
      packageStore: "memory",
      files: {
        "/workspace/package.json": JSON.stringify({
          name: "cwd-probe",
          version: "1.0.0",
        }),
      },
    });
    await pod.packages.installFromManifest();
    expect(await pod.fs.exists("/workspace/node_modules/.package-lock.json")).toBe(true);
    expect(await pod.fs.exists("/node_modules/.package-lock.json")).toBe(false);
    pod.teardown();
  });

  it("rewrites an owned server URL only in terminal presentation", async () => {
    DisplayTerminal.instances = [];
    const pod = await Nodepod.boot({ headless: true });
    pod.proxy.register(
      pod.instanceId,
      {
        listening: true,
        address: () => ({ port: 5173, address: "0.0.0.0", family: "IPv4" }),
        dispatchRequest: async () => ({
          statusCode: 200,
          statusMessage: "OK",
          headers: {},
          body: Buffer.from(""),
        }),
      },
      5173,
    );
    const previewUrl = pod.port(5173);
    expect(previewUrl).toBeTruthy();

    const terminal = pod.createTerminal({
      Terminal: DisplayTerminal,
      customCommands: {
        show: () => "Local: http://localhost:5173/\n",
      },
    });
    terminal.attach({} as HTMLElement);
    await (terminal as any)._wiring.onCommand("show");

    const displayed = DisplayTerminal.instances[0].writes.join("");
    expect(displayed).toContain(`Local: ${previewUrl}/`);
    expect(displayed).not.toContain("http://localhost:5173/");
    pod.teardown();
  });
});
