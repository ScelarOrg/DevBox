// emnapi keeps Node alive during napi async work via MessageChannel.port1.ref().
// In the browser, host MessagePort has no ref/unref — installHostMessagePortKeepAlive
// adds Node-shaped methods without replacing a working implementation.

import { afterEach, describe, expect, it } from "vitest";
import { getGlobalRegistry } from "../helpers/event-loop";
import { installHostMessagePortKeepAlive } from "../polyfills/worker_threads";
import { MemoryVolume } from "../memory-volume";
import {
  executeNodeBinary,
  initShellExec,
} from "../polyfills/child_process";
import type { ShellContext } from "../shell/shell-types";

describe("installHostMessagePortKeepAlive", () => {
  const proto = globalThis.MessagePort?.prototype as {
    ref?: () => void;
    unref?: () => void;
    __nodepodRefPatched?: boolean;
  };
  const origRef = proto?.ref;
  const origUnref = proto?.unref;
  const origPatched = proto?.__nodepodRefPatched;

  afterEach(() => {
    if (!proto) return;
    if (origRef) proto.ref = origRef;
    else delete proto.ref;
    if (origUnref) proto.unref = origUnref;
    else delete proto.unref;
    if (origPatched) proto.__nodepodRefPatched = origPatched;
    else delete proto.__nodepodRefPatched;
  });

  it("no-ops when host MessagePort already has ref/unref (Node)", () => {
    if (!proto || typeof proto.ref !== "function") return;
    const before = proto.ref;
    installHostMessagePortKeepAlive();
    expect(proto.ref).toBe(before);
    expect(proto.__nodepodRefPatched).toBeFalsy();
  });

  it("adds ref/unref that bump the handle registry when missing", () => {
    if (!proto || typeof MessageChannel !== "function") return;

    delete proto.ref;
    delete proto.unref;
    delete proto.__nodepodRefPatched;

    installHostMessagePortKeepAlive({ force: true });
    expect(typeof proto.ref).toBe("function");
    expect(typeof proto.unref).toBe("function");
    expect(proto.__nodepodRefPatched).toBe(true);

    // MessagePort.ref uses getRegistry() which falls back to global.
    const globalReg = getGlobalRegistry();
    const before = globalReg.activeRefedCount();

    const { port1 } = new MessageChannel();
    const port = port1 as MessagePort & { ref(): void; unref(): void };
    port.ref();
    expect(globalReg.activeRefedCount()).toBe(before + 1);
    port.unref();
    expect(globalReg.activeRefedCount()).toBe(before);
    // second ref after unref re-refs the same handle
    port.ref();
    expect(globalReg.activeRefedCount()).toBe(before + 1);
    port.unref();
    expect(globalReg.activeRefedCount()).toBe(before);
  });
});

describe("emnapi-style MessagePort keep-alive (exit semantics)", () => {
  function setup(files: Record<string, string>) {
    const vol = new MemoryVolume();
    for (const [path, content] of Object.entries(files)) {
      const dir = path.substring(0, path.lastIndexOf("/")) || "/";
      if (dir !== "/") vol.mkdirSync(dir, { recursive: true });
      vol.writeFileSync(path, content);
    }
    initShellExec(vol, { cwd: "/" });
    const ctx: ShellContext = {
      cwd: "/",
      env: { HOME: "/home", PATH: "/usr/bin", PWD: "/" },
      volume: vol,
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    };
    return { ctx };
  }

  it("MessageChannel.port1.ref keeps the loop alive until unref (emnapi WaitingRequestCounter)", async () => {
    // mirrors @emnapi/runtime NodejsWaitingRequestCounter: hold via port.ref
    // while "async work" runs, then unref so the process can drain.
    const { ctx } = setup({
      "/emnapi-keepalive.js": `
        const { port1 } = new MessageChannel();
        let count = 0;
        function increase() {
          if (count === 0) port1.ref();
          count++;
        }
        function decrease() {
          if (count === 1) port1.unref();
          count--;
        }
        // floating work — no top-level await, same shape as vite bin + cac
        increase();
        setTimeout(() => {
          console.log("work-done");
          decrease();
        }, 150);
      `,
    });
    const t0 = performance.now();
    const r = await executeNodeBinary("/emnapi-keepalive.js", [], ctx);
    const elapsed = performance.now() - t0;
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("work-done");
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it("unref'd MessagePort alone does not keep the loop alive", async () => {
    const { ctx } = setup({
      "/port-unref.js": `
        const { port1 } = new MessageChannel();
        port1.ref();
        port1.unref();
        console.log("after-unref");
      `,
    });
    const t0 = performance.now();
    const r = await executeNodeBinary("/port-unref.js", [], ctx);
    const elapsed = performance.now() - t0;
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("after-unref");
    expect(elapsed).toBeLessThan(500);
  });
});
