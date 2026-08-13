import { afterEach, describe, expect, it } from "vitest";
import {
  Worker,
  setWorkerConstructorOverride,
  setWorkerThreadForkCallback,
} from "../polyfills/worker_threads";

describe("worker_threads stdio parity", () => {
  afterEach(() => setWorkerConstructorOverride(null));

  it("exposes pipeable stdout and stderr streams", async () => {
    setWorkerConstructorOverride(null);
    setWorkerThreadForkCallback((_modulePath, options) => {
      queueMicrotask(() => {
        options.onStdout?.("worker output\n");
        options.onStderr?.("worker warning\n");
        options.onExit(0);
      });
      return {
        requestId: 1,
        postMessage() {},
        sendStdin() {},
        endStdin() {},
        terminate() {},
      };
    });

    const worker = new Worker("worker.js", { stdout: true, stderr: true });
    const stdout: string[] = [];
    const stderr: string[] = [];
    worker.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
    worker.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
    expect(typeof worker.stdout.pipe).toBe("function");
    expect(typeof worker.stderr.pipe).toBe("function");
    await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
    expect(stdout).toEqual(["worker output\n"]);
    expect(stderr).toEqual(["worker warning\n"]);
  });

  it("pipes opted-in stdin to the worker handle", async () => {
    const stdin: string[] = [];
    let ended = false;
    setWorkerThreadForkCallback(() => ({
      requestId: 2,
      postMessage() {},
      sendStdin(data) { stdin.push(data); },
      endStdin() { ended = true; },
      terminate() {},
    }));

    const worker = new Worker("worker.js", { stdin: true });
    expect(worker.stdin).not.toBeNull();
    worker.stdin!.write("hello");
    worker.stdin!.end();
    await Promise.resolve();
    expect(stdin).toEqual(["hello"]);
    expect(ended).toBe(true);
    await worker.terminate();
  });

  it("closes output streams when explicitly terminated", async () => {
    setWorkerThreadForkCallback(() => ({
      requestId: 3,
      postMessage() {},
      sendStdin() {},
      endStdin() {},
      terminate() {},
    }));
    const worker = new Worker("worker.js");
    const stdoutEnded = new Promise<void>((resolve) => {
      worker.stdout.once("end", resolve);
      worker.stdout.resume();
    });
    const stderrEnded = new Promise<void>((resolve) => {
      worker.stderr.once("end", resolve);
      worker.stderr.resume();
    });

    await worker.terminate();
    await Promise.all([stdoutEnded, stderrEnded]);
  });
});
