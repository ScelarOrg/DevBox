import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryVolume } from "../memory-volume";
import {
  installPackageNames,
  shellQuote,
  shellCommandFromArgv,
  spawn,
  setSpawnChildCallback,
  promises as cpPromises,
  initShellExec,
} from "../polyfills/child_process";

describe("installPackageNames", () => {
  it("excludes --registry value from package names", () => {
    expect(
      installPackageNames([
        "--registry",
        "https://registry.example.com/",
        "lodash",
      ]),
    ).toEqual(["lodash"]);
  });

  it("excludes --registry=value form", () => {
    expect(
      installPackageNames(["--registry=https://registry.example.com/", "left-pad"]),
    ).toEqual(["left-pad"]);
  });

  it("keeps packages and skips boolean flags", () => {
    expect(installPackageNames(["-D", "typescript", "--no-save"])).toEqual([
      "typescript",
    ]);
  });
});

describe("shellQuote / shellCommandFromArgv", () => {
  it("quotes args with spaces and metacharacters", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
    expect(shellQuote("a;b")).toBe("'a;b'");
    expect(shellQuote("plain")).toBe("plain");
  });

  it("preserves spaces in argv when building a shell command", () => {
    expect(shellCommandFromArgv("node", ["script.js", "arg with spaces"])).toBe(
      "node script.js 'arg with spaces'",
    );
  });
});

describe("spawn env inheritance", () => {
  const prevEnv = { ...(globalThis as any).process?.env };

  beforeEach(() => {
    if (!(globalThis as any).process) {
      (globalThis as any).process = { env: {} };
    }
    (globalThis as any).process.env = { ...prevEnv, NODEPOD_TEST_ENV: "1" };
  });

  afterEach(() => {
    setSpawnChildCallback(null);
    if ((globalThis as any).process) {
      (globalThis as any).process.env = prevEnv;
    }
  });

  it("inherits process.env when env is omitted", async () => {
    let captured: Record<string, string> | undefined;
    setSpawnChildCallback(async (_cmd, _args, opts) => {
      captured = opts?.env;
      return { pid: 1, exitCode: 0, stdout: "", stderr: "" };
    });

    const child = spawn("true", []);
    await new Promise<void>((resolve, reject) => {
      child.once("exit", () => resolve());
      child.once("error", reject);
    });

    expect(captured?.NODEPOD_TEST_ENV).toBe("1");
  });

  it("uses explicit empty env when provided", async () => {
    let captured: Record<string, string> | undefined;
    setSpawnChildCallback(async (_cmd, _args, opts) => {
      captured = opts?.env;
      return { pid: 1, exitCode: 0, stdout: "", stderr: "" };
    });

    const child = spawn("true", [], { env: {} });
    await new Promise<void>((resolve, reject) => {
      child.once("exit", () => resolve());
      child.once("error", reject);
    });

    expect(captured).toEqual({});
  });
});

describe("child_process/promises", () => {
  beforeEach(() => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/", { recursive: true });
    initShellExec(vol, { cwd: "/" });
  });

  afterEach(() => {
    setSpawnChildCallback(null);
  });

  it("exposes exec/execFile/spawn", () => {
    expect(typeof cpPromises.exec).toBe("function");
    expect(typeof cpPromises.execFile).toBe("function");
    expect(typeof cpPromises.spawn).toBe("function");
  });

  it("promises.spawn resolves on exit 0", async () => {
    setSpawnChildCallback(async () => ({
      pid: 2,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));
    const result = await cpPromises.spawn("echo", ["hi"]);
    expect(result.stdout).toContain("ok");
  });
});

describe("npx persist flag intent", () => {
  it("installPackageNames alone does not imply save (covered by persist:false call site)", () => {
    // Behavioral contract: names used for install; persist is a separate option.
    // Regression guard — registry URL must never appear as a name.
    const names = installPackageNames([
      "-y",
      "--registry",
      "https://example.com/npm/",
      "create-vite@latest",
    ]);
    expect(names).toEqual(["create-vite@latest"]);
    expect(names.some((n) => n.includes("https://"))).toBe(false);
  });
});
