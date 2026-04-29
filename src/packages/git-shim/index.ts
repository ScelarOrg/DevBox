import type { MemoryVolume } from "../../memory-volume";
import type { ProcessManager } from "../../threading/process-manager";
import type { GitShimOptions, GitRequest, GitProgress, GitCommand, GitCloneRequestMessage } from "./types";
import { GitMessageType } from "./types";
import { CloneNative } from "./clone-native";
import { CloneApi } from "./clone-api";

export type { GitShimOptions, GitRequest, GitProgress, GitCommand } from "./types";
export { GitMessageType } from "./types";
export { createFsAdapter } from "./fs-adapter";

/**
 * GitShim — abstraction layer for git operations in Nodepod.
 *
 * Supports two modes:
 * - 'native': uses isomorphic-git (real Git Smart HTTP protocol)
 * - 'api': uses GitHub REST API + raw.githubusercontent.com
 *
 * Extensible — add new commands (pull, push, etc.) by implementing GitCommand.
 */
export class GitShim {
  private commands = new Map<string, GitCommand>();

  constructor(private opts: GitShimOptions) {
    if (opts.mode === "native") {
      this.commands.set("clone", new CloneNative(opts.corsProxy));
    } else {
      this.commands.set("clone", new CloneApi(
        opts.apiBase ?? "https://api.github.com",
        opts.rawBase ?? "https://raw.githubusercontent.com",
      ));
    }
  }

  registerCommand(name: string, command: GitCommand) {
    this.commands.set(name, command);
  }

  getCommand(name: string): GitCommand | undefined {
    return this.commands.get(name);
  }

  attach(vol: MemoryVolume, pm: ProcessManager) {
    pm.on("spawn", (pid: number) => {
      const handle = pm.getProcess(pid) as any;
      if (!handle) return;

      handle.on(GitMessageType.REQUEST, (msg: GitCloneRequestMessage) => {
        const worker = handle.worker as Worker;
        const clone = this.commands.get("clone");
        if (!clone) return;

        const progress: GitProgress = {
          send: (data) => worker.postMessage({ type: GitMessageType.PROGRESS, data }),
          done: (fileCount) => worker.postMessage({ type: GitMessageType.DONE, fileCount }),
          error: (data) => worker.postMessage({ type: GitMessageType.ERROR, data }),
        };

        clone.execute(vol, msg, progress).then(() => {
          let fileCount = 0;
          const count = (dir: string) => {
            try {
              for (const entry of vol.readdirSync(dir) as string[]) {
                if (entry === ".git") continue;
                const full = dir === "/" ? `/${entry}` : `${dir}/${entry}`;
                try {
                  if (vol.statSync(full).isDirectory) count(full);
                  else fileCount++;
                } catch {}
              }
            } catch {}
          };
          count(msg.targetDir);
          progress.done(fileCount);
        }).catch((e: any) => {
          const errMsg = e?.message || String(e);
          if (errMsg.includes("404")) progress.error(`repository '${msg.url}' not found`);
          else if (errMsg.includes("401") || errMsg.includes("403")) progress.error(`authentication failed for '${msg.url}'`);
          else progress.error(errMsg);
        });
      });
    });
  }
}