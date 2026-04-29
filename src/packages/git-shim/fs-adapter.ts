import type { MemoryVolume } from "../../memory-volume";

/**
 * Creates an fs adapter for isomorphic-git from Nodepod's MemoryVolume.
 */
export function createFsAdapter(vol: MemoryVolume) {
  function makeStat(fp: string) {
    try {
      const s = vol.statSync(fp);
      const mt = typeof s.mtime === "number" ? s.mtime : Date.now();
      return {
        isFile: () => s.isFile, isDirectory: () => s.isDirectory, isSymbolicLink: () => false,
        size: s.size || 0,
        mtimeMs: mt, ctimeMs: mt, atimeMs: mt, birthtimeMs: mt,
        mtime: new Date(mt), ctime: new Date(mt), atime: new Date(mt), birthtime: new Date(mt),
        mode: s.isDirectory ? 0o40755 : 0o100644,
        uid: 1, gid: 1, ino: 0, dev: 0, nlink: 1, rdev: 0, blksize: 4096, blocks: 0,
      };
    } catch {
      const err: any = new Error(`ENOENT: '${fp}'`);
      err.code = "ENOENT";
      throw err;
    }
  }

  return {
    promises: {
      readFile: async (fp: string, opts?: any) => {
        try {
          const enc = typeof opts === "string" ? opts : opts?.encoding;
          if (enc) return vol.readFileSync(fp, enc);
          const data = vol.readFileSync(fp);
          return data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(data as string);
        } catch {
          const err: any = new Error(`ENOENT: '${fp}'`);
          err.code = "ENOENT";
          throw err;
        }
      },
      writeFile: async (fp: string, data: any) => {
        const dir = fp.substring(0, fp.lastIndexOf("/"));
        if (dir && dir !== "/" && !vol.existsSync(dir)) vol.mkdirSync(dir, { recursive: true });
        if (typeof data === "string") vol.writeFileSync(fp, data);
        else vol.writeFileSync(fp, new Uint8Array(data));
      },
      unlink: async (fp: string) => { try { vol.unlinkSync(fp); } catch {} },
      readdir: async (fp: string) => vol.readdirSync(fp) as string[],
      mkdir: async (fp: string, opts?: any) => { if (!vol.existsSync(fp)) vol.mkdirSync(fp, opts); },
      rmdir: async (fp: string) => { try { vol.rmdirSync(fp); } catch {} },
      stat: async (fp: string) => makeStat(fp),
      lstat: async (fp: string) => makeStat(fp),
      readlink: async () => { const e: any = new Error("ENOENT"); e.code = "ENOENT"; throw e; },
      symlink: async () => {},
      chmod: async () => {},
    },
  };
}