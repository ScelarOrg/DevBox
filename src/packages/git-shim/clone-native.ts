import type { MemoryVolume } from "../../memory-volume";
import type { GitCommand, GitRequest, GitProgress } from "./types";
import { createFsAdapter } from "./fs-adapter";

export class CloneNative implements GitCommand {
  constructor(private corsProxy: string | undefined) {}

  async execute(vol: MemoryVolume, request: GitRequest, progress: GitProgress) {
    const git = await import("isomorphic-git");
    const http = await import("isomorphic-git/http/web");
    const fs = createFsAdapter(vol);

    let cloneUrl = request.url;
    if (!cloneUrl.endsWith(".git")) cloneUrl += ".git";

    let lastPhase = "";

    await git.clone({
      fs,
      http: (http as any).default || http,
      dir: request.targetDir,
      url: cloneUrl,
      singleBranch: true,
      depth: 1,
      noCheckout: true,
      corsProxy: this.corsProxy,
      ...(request.token ? { onAuth: () => ({ username: request.token! }) } : {}),
      onProgress: (evt: { phase: string; loaded: number; total: number }) => {
        if (evt.phase !== lastPhase) {
          if (lastPhase) progress.send("\n");
          lastPhase = evt.phase;
        }
        if (evt.total > 0) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          progress.send(`\r${evt.phase}: ${pct}% (${evt.loaded}/${evt.total})`);
        } else {
          progress.send(`\r${evt.phase}: ${evt.loaded}`);
        }
      },
      onMessage: (msg: string) => { progress.send(msg); },
    });

    if (lastPhase) progress.send("\n");

    // Checkout working tree
    progress.send("Checking out files...\n");
    try {
      await git.checkout({ fs, dir: request.targetDir, force: true });
    } catch (checkoutErr: any) {
      console.error("[nodepod:git] checkout failed:", checkoutErr?.message || checkoutErr);
      try {
        const files = await git.listFiles({ fs, dir: request.targetDir, ref: "HEAD" });
        const headOid = await git.resolveRef({ fs, dir: request.targetDir, ref: "HEAD" });
        for (const filepath of files) {
          try {
            const { blob } = await git.readBlob({ fs, dir: request.targetDir, oid: headOid, filepath });
            const fullPath = request.targetDir + "/" + filepath;
            const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
            if (dir && !vol.existsSync(dir)) vol.mkdirSync(dir, { recursive: true });
            vol.writeFileSync(fullPath, new Uint8Array(blob));
          } catch {}
        }
      } catch {}
    }
  }
}