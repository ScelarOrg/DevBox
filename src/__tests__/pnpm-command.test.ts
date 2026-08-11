import { describe, expect, it, vi } from "vitest";
import { createPnpmCommand } from "../shell/commands/pnpm";
import type { PmDeps } from "../shell/commands/pm-types";
import type { ShellContext } from "../shell/shell-types";
import { MemoryVolume } from "../memory-volume";

function makeContext(): ShellContext {
  const volume = new MemoryVolume();
  volume.mkdirSync("/project", { recursive: true });
  return {
    cwd: "/project",
    env: {},
    volume,
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
  };
}

describe("pnpm script shorthand", () => {
  it("maps pnpm typecheck to pnpm run typecheck", async () => {
    const runScript = vi.fn(async () => ({ stdout: "ok", stderr: "", exitCode: 0 }));
    const deps = {
      hasFile: () => true,
      runScript,
    } as unknown as PmDeps;

    const result = await createPnpmCommand(deps).execute(
      ["typecheck"],
      makeContext(),
    );

    expect(result.exitCode).toBe(0);
    expect(runScript).toHaveBeenCalledWith(["typecheck"], expect.anything());
  });
});
