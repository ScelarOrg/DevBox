import type { MemoryVolume } from "../../memory-volume";
import type { GitCommand, GitRequest, GitProgress } from "./types";

export class CloneApi implements GitCommand {
  constructor(
    private apiBase: string,
    private rawBase: string,
  ) {}

  async execute(vol: MemoryVolume, request: GitRequest, progress: GitProgress) {
    const ghMatch = request.url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!ghMatch) {
      progress.error(`'${request.url}' is not a GitHub URL`);
      return;
    }
    const [, owner, repo] = ghMatch;
    const token = request.token;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "nodepod-git",
    };
    if (token) headers.Authorization = `token ${token}`;

    progress.send("Fetching repository info...\n");
    const repoResp = await fetch(`${this.apiBase}/repos/${owner}/${repo}`, { headers });
    if (!repoResp.ok) {
      if (repoResp.status === 404) { progress.error(`repository '${request.url}' not found`); return; }
      if (repoResp.status === 403) { progress.error("GitHub API rate limit exceeded. Set GITHUB_TOKEN for higher limits."); return; }
      progress.error(`GitHub API error: ${repoResp.status}`); return;
    }
    const repoData = await repoResp.json();
    let branch = request.branch;
    if (branch === "main" && repoData.default_branch !== "main") branch = repoData.default_branch;

    progress.send(`Fetching file tree (${branch})...\n`);
    const treeResp = await fetch(`${this.apiBase}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
    if (!treeResp.ok) { progress.error(`Remote branch '${branch}' not found`); return; }
    const treeData = await treeResp.json();

    const files: string[] = [];
    for (const item of treeData.tree) {
      if (item.type === "blob") files.push(item.path);
    }

    if (!vol.existsSync(request.targetDir)) vol.mkdirSync(request.targetDir, { recursive: true });

    let fileCount = 0;
    const BATCH = 10;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (fp) => {
          try {
            const r = await fetch(`${this.rawBase}/${owner}/${repo}/${branch}/${fp}`);
            if (!r.ok) return null;
            return { path: fp, data: new Uint8Array(await r.arrayBuffer()) };
          } catch { return null; }
        }),
      );
      for (const res of results) {
        if (!res) continue;
        const fullPath = request.targetDir + "/" + res.path;
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (dir && !vol.existsSync(dir)) vol.mkdirSync(dir, { recursive: true });
        vol.writeFileSync(fullPath, res.data);
        fileCount++;
      }
      progress.send(`\rReceiving objects: ${Math.min(i + BATCH, files.length)}/${files.length}`);
    }
    progress.send("\n");
    progress.done(fileCount);
  }
}