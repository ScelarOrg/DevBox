import { describe, it, expect, vi } from "vitest";
import { MemoryVolume } from "../memory-volume";
import { createNodeCommand } from "../shell/commands/node";
import type { PmDeps } from "../shell/commands/pm-types";
import type { ShellContext } from "../shell/shell-types";

function makeDeps(): PmDeps {
  return {
    executeNodeBinary: vi.fn(async () => ({
      stdout: "RAN\n",
      stderr: "",
      exitCode: 0,
    })),
    evalCode: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    printCode: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    hasFile: () => true,
    readFile: () => "",
    writeFile: () => {},
  } as unknown as PmDeps;
}

function makeCtx(files: Record<string, string>): ShellContext {
  const vol = new MemoryVolume();
  for (const [path, content] of Object.entries(files)) {
    const dir = path.substring(0, path.lastIndexOf("/")) || "/";
    if (dir !== "/") vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(path, content);
  }
  return {
    cwd: "/",
    env: { PWD: "/" },
    volume: vol,
  } as unknown as ShellContext;
}

describe("node --check", () => {
  it("syntax-checks a valid file without executing", async () => {
    const deps = makeDeps();
    const cmd = createNodeCommand(deps);
    const ctx = makeCtx({ "/ok.js": "const x = 1;\n" });
    const result = await cmd.execute(["--check", "/ok.js"], ctx);
    expect(result.exitCode).toBe(0);
    expect(deps.executeNodeBinary).not.toHaveBeenCalled();
  });

  it("returns exit 1 for invalid syntax without executing", async () => {
    const deps = makeDeps();
    const cmd = createNodeCommand(deps);
    const ctx = makeCtx({ "/bad.js": "const x = ;\n" });
    const result = await cmd.execute(["-c", "/bad.js"], ctx);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(deps.executeNodeBinary).not.toHaveBeenCalled();
  });
});
