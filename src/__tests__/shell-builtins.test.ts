import { describe, it, expect } from "vitest";
import { builtins } from "../shell/shell-builtins";
import { MemoryVolume } from "../memory-volume";
import type { ShellContext } from "../shell/shell-types";

function makeCtx(
  files?: Record<string, string>,
  cwd = "/",
): ShellContext {
  const vol = new MemoryVolume();
  if (files) {
    for (const [path, content] of Object.entries(files)) {
      const dir = path.substring(0, path.lastIndexOf("/")) || "/";
      if (dir !== "/") vol.mkdirSync(dir, { recursive: true });
      vol.writeFileSync(path, content);
    }
  }
  return {
    cwd,
    env: { HOME: "/home/user", PATH: "/usr/bin", PWD: cwd },
    volume: vol,
  } as unknown as ShellContext;
}

async function run(name: string, args: string[], ctx: ShellContext, stdin?: string) {
  const fn = builtins.get(name);
  if (!fn) throw new Error(`builtin "${name}" not found`);
  return fn(args, ctx, stdin);
}

describe("shell builtins", () => {
  describe("echo", () => {
    it("outputs arguments joined by space with trailing newline", async () => {
      const ctx = makeCtx();
      const result = await run("echo", ["hello", "world"], ctx);
      expect(result.stdout).toBe("hello world\n");
      expect(result.exitCode).toBe(0);
    });

    it("-n suppresses trailing newline", async () => {
      const ctx = makeCtx();
      const result = await run("echo", ["-n", "hello"], ctx);
      expect(result.stdout).toBe("hello");
    });

    it("with no args outputs just newline", async () => {
      const ctx = makeCtx();
      const result = await run("echo", [], ctx);
      expect(result.stdout).toBe("\n");
    });
  });

  describe("cat", () => {
    it("outputs file contents", async () => {
      const ctx = makeCtx({ "/f.txt": "hello world" });
      const result = await run("cat", ["/f.txt"], ctx);
      expect(result.stdout).toBe("hello world");
    });

    it("reads from stdin when no files given", async () => {
      const ctx = makeCtx();
      const result = await run("cat", [], ctx, "stdin data");
      expect(result.stdout).toBe("stdin data");
    });

    it("reads multiple files concatenated", async () => {
      const ctx = makeCtx({ "/a.txt": "AAA", "/b.txt": "BBB" });
      const result = await run("cat", ["/a.txt", "/b.txt"], ctx);
      expect(result.stdout).toBe("AAABBB");
    });
  });

  describe("ls", () => {
    it("lists files in directory", async () => {
      const ctx = makeCtx({
        "/project/a.txt": "a",
        "/project/b.txt": "b",
      });
      const result = await run("ls", ["/project"], ctx);
      expect(result.stdout).toContain("a.txt");
      expect(result.stdout).toContain("b.txt");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("pwd", () => {
    it("outputs current directory with newline", async () => {
      const ctx = makeCtx({}, "/home/user");
      const result = await run("pwd", [], ctx);
      expect(result.stdout).toBe("/home/user\n");
    });
  });

  describe("mkdir", () => {
    it("creates directory", async () => {
      const ctx = makeCtx();
      await run("mkdir", ["/newdir"], ctx);
      expect(ctx.volume.statSync("/newdir").isDirectory()).toBe(true);
    });

    it("-p creates nested directories", async () => {
      const ctx = makeCtx();
      await run("mkdir", ["-p", "/a/b/c"], ctx);
      expect(ctx.volume.statSync("/a/b/c").isDirectory()).toBe(true);
    });
  });

  describe("rm", () => {
    it("removes a file", async () => {
      const ctx = makeCtx({ "/f.txt": "data" });
      await run("rm", ["/f.txt"], ctx);
      expect(ctx.volume.existsSync("/f.txt")).toBe(false);
    });

    it("-r removes directory recursively", async () => {
      const ctx = makeCtx({ "/dir/f.txt": "data" });
      await run("rm", ["-r", "/dir"], ctx);
      expect(ctx.volume.existsSync("/dir")).toBe(false);
    });

    it("-f ignores nonexistent files", async () => {
      const ctx = makeCtx();
      const result = await run("rm", ["-f", "/nonexistent"], ctx);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("cp", () => {
    it("copies file content", async () => {
      const ctx = makeCtx({ "/src.txt": "content" });
      await run("cp", ["/src.txt", "/dst.txt"], ctx);
      expect(ctx.volume.readFileSync("/dst.txt", "utf8")).toBe("content");
    });
  });

  describe("mv", () => {
    it("moves a file", async () => {
      const ctx = makeCtx({ "/old.txt": "data" });
      await run("mv", ["/old.txt", "/new.txt"], ctx);
      expect(ctx.volume.readFileSync("/new.txt", "utf8")).toBe("data");
      expect(ctx.volume.existsSync("/old.txt")).toBe(false);
    });
  });

  describe("grep", () => {
    // strip ansi colors so we can assert on the actual text
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

    it("matches lines containing pattern", async () => {
      const ctx = makeCtx({ "/f.txt": "apple\nbanana\napricot\n" });
      const result = await run("grep", ["ap", "/f.txt"], ctx);
      const plain = strip(result.stdout);
      expect(plain).toContain("apple");
      expect(plain).toContain("apricot");
      expect(plain).not.toContain("banana");
    });

    it("-i case insensitive matching", async () => {
      const ctx = makeCtx({ "/f.txt": "Hello\nworld\n" });
      const result = await run("grep", ["-i", "hello", "/f.txt"], ctx);
      expect(strip(result.stdout)).toContain("Hello");
    });

    it("-v inverts match", async () => {
      const ctx = makeCtx({ "/f.txt": "apple\nbanana\napricot\n" });
      const result = await run("grep", ["-v", "ap", "/f.txt"], ctx);
      const plain = strip(result.stdout);
      expect(plain).toContain("banana");
      expect(plain).not.toContain("apple");
    });

    it("returns exit code 1 on no match", async () => {
      const ctx = makeCtx({ "/f.txt": "hello\n" });
      const result = await run("grep", ["xyz", "/f.txt"], ctx);
      expect(result.exitCode).toBe(1);
    });

    it("-c with zero matches prints 0 and exits 1", async () => {
      const ctx = makeCtx({ "/f.txt": "hello\n" });
      const result = await run("grep", ["-c", "xyz", "/f.txt"], ctx);
      expect(strip(result.stdout).trim()).toBe("0");
      expect(result.exitCode).toBe(1);
    });

    it("-c with matches exits 0", async () => {
      const ctx = makeCtx({ "/f.txt": "hello\nhello\n" });
      const result = await run("grep", ["-c", "hello", "/f.txt"], ctx);
      expect(strip(result.stdout).trim()).toBe("2");
      expect(result.exitCode).toBe(0);
    });

    it("reads from stdin when no files", async () => {
      const ctx = makeCtx();
      const result = await run("grep", ["hello"], ctx, "hello world\nfoo\n");
      expect(strip(result.stdout)).toContain("hello");
    });
  });

  describe("sed", () => {
    it("$ addresses the last real line when file ends with newline", async () => {
      const ctx = makeCtx({ "/f.txt": "one\ntwo\nthree\n" });
      const result = await run("sed", ["$s/three/LAST/", "/f.txt"], ctx);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("LAST");
      expect(result.stdout).not.toMatch(/three/);
    });
  });

  describe("head", () => {
    it("outputs first 10 lines by default", async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n") + "\n";
      const ctx = makeCtx({ "/f.txt": lines });
      const result = await run("head", ["/f.txt"], ctx);
      const outputLines = result.stdout.trim().split("\n");
      expect(outputLines.length).toBe(10);
      expect(outputLines[0]).toBe("line0");
    });

    it("-n 5 outputs first 5 lines", async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n") + "\n";
      const ctx = makeCtx({ "/f.txt": lines });
      const result = await run("head", ["-n", "5", "/f.txt"], ctx);
      const outputLines = result.stdout.trim().split("\n");
      expect(outputLines.length).toBe(5);
    });
  });

  describe("tail", () => {
    it("outputs last 10 lines by default", async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n") + "\n";
      const ctx = makeCtx({ "/f.txt": lines });
      const result = await run("tail", ["/f.txt"], ctx);
      const outputLines = result.stdout.trim().split("\n");
      expect(outputLines.length).toBe(10);
      expect(outputLines[outputLines.length - 1]).toBe("line19");
    });
  });

  describe("wc", () => {
    it("-l counts lines", async () => {
      const ctx = makeCtx({ "/f.txt": "one\ntwo\nthree\n" });
      const result = await run("wc", ["-l", "/f.txt"], ctx);
      expect(result.stdout).toContain("3");
    });

    it("reads from stdin", async () => {
      const ctx = makeCtx();
      const result = await run("wc", ["-l"], ctx, "a\nb\nc\n");
      expect(result.stdout).toContain("3");
    });
  });

  describe("sort", () => {
    it("sorts lines alphabetically", async () => {
      const ctx = makeCtx();
      const result = await run("sort", [], ctx, "cherry\napple\nbanana\n");
      expect(result.stdout.trim()).toBe("apple\nbanana\ncherry");
    });

    it("-r reverses sort", async () => {
      const ctx = makeCtx();
      const result = await run("sort", ["-r"], ctx, "a\nb\nc\n");
      expect(result.stdout.trim()).toBe("c\nb\na");
    });
  });

  describe("uniq", () => {
    it("removes consecutive duplicate lines", async () => {
      const ctx = makeCtx();
      const result = await run("uniq", [], ctx, "a\na\nb\nb\na\n");
      expect(result.stdout.trim()).toBe("a\nb\na");
    });
  });

  describe("touch", () => {
    it("creates empty file if not exists", async () => {
      const ctx = makeCtx();
      await run("touch", ["/new.txt"], ctx);
      expect(ctx.volume.existsSync("/new.txt")).toBe(true);
    });

    it("does not modify existing file content", async () => {
      const ctx = makeCtx({ "/f.txt": "data" });
      await run("touch", ["/f.txt"], ctx);
      expect(ctx.volume.readFileSync("/f.txt", "utf8")).toBe("data");
    });
  });

  describe("true / false", () => {
    it("true returns exit code 0", async () => {
      const ctx = makeCtx();
      const result = await run("true", [], ctx);
      expect(result.exitCode).toBe(0);
    });

    it("false returns exit code 1", async () => {
      const ctx = makeCtx();
      const result = await run("false", [], ctx);
      expect(result.exitCode).toBe(1);
    });
  });

  describe("which", () => {
    it("finds builtin commands", async () => {
      const ctx = makeCtx();
      const result = await run("which", ["echo"], ctx);
      expect(result.stdout).toContain("echo");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("test / [", () => {
    it("-f returns 0 for existing file", async () => {
      const ctx = makeCtx({ "/f.txt": "data" });
      const result = await run("test", ["-f", "/f.txt"], ctx);
      expect(result.exitCode).toBe(0);
    });

    it("-d returns 0 for existing directory", async () => {
      const ctx = makeCtx();
      ctx.volume.mkdirSync("/dir");
      const result = await run("test", ["-d", "/dir"], ctx);
      expect(result.exitCode).toBe(0);
    });

    it("-e returns 0 for existing path", async () => {
      const ctx = makeCtx({ "/f.txt": "" });
      const result = await run("test", ["-e", "/f.txt"], ctx);
      expect(result.exitCode).toBe(0);
    });

    it("-z returns 0 for empty string", async () => {
      const ctx = makeCtx();
      const result = await run("test", ["-z", ""], ctx);
      expect(result.exitCode).toBe(0);
    });

    it("-n returns 0 for non-empty string", async () => {
      const ctx = makeCtx();
      const result = await run("test", ["-n", "hello"], ctx);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("find", () => {
    it("finds files by name pattern", async () => {
      const ctx = makeCtx({
        "/project/a.txt": "",
        "/project/b.js": "",
        "/project/sub/c.txt": "",
      });
      const result = await run("find", ["/project", "-name", "*.txt"], ctx);
      expect(result.stdout).toContain("a.txt");
      expect(result.stdout).toContain("c.txt");
      expect(result.stdout).not.toContain("b.js");
    });

    it("-type f finds only files", async () => {
      const ctx = makeCtx({ "/project/f.txt": "" });
      ctx.volume.mkdirSync("/project/dir");
      const result = await run("find", ["/project", "-type", "f"], ctx);
      expect(result.stdout).toContain("f.txt");
      expect(result.stdout).not.toContain("dir");
    });

    it("-type d finds only directories", async () => {
      const ctx = makeCtx({ "/project/f.txt": "" });
      ctx.volume.mkdirSync("/project/dir");
      const result = await run("find", ["/project", "-type", "d"], ctx);
      expect(result.stdout).toContain("dir");
    });
  });

  describe("export", () => {
    it("sets environment variable", async () => {
      const ctx = makeCtx();
      await run("export", ["FOO=bar"], ctx);
      expect(ctx.env.FOO).toBe("bar");
    });
  });

  describe("find -exec quoting", () => {
    it("quotes paths with spaces so -exec does not retokenize", async () => {
      const ctx = makeCtx({ "/my file.txt": "data" });
      ctx.exec = async (cmd) => {
        // Without quoting this would be: echo /my file.txt → 2 args after echo
        const words = cmd.match(/(?:'[^']*'|"[^"]*"|[^\s]+)/g) ?? [];
        return {
          stdout: words.slice(1).join("|") + "\n",
          stderr: "",
          exitCode: 0,
        };
      };
      const result = await run(
        "find",
        ["/", "-name", "*.txt", "-exec", "echo", "{}", ";"],
        ctx,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("'/my file.txt'");
    });
  });

  describe("chmod ln readlink", () => {
    it("chmod stores file mode", async () => {
      const ctx = makeCtx({ "/f.txt": "x" });
      const result = await run("chmod", ["755", "/f.txt"], ctx);
      expect(result.exitCode).toBe(0);
      expect(ctx.volume.statSync("/f.txt").mode & 0o777).toBe(0o755);
    });

    it("ln -s creates a symlink", async () => {
      const ctx = makeCtx({ "/target.txt": "data" });
      const result = await run("ln", ["-s", "/target.txt", "/link.txt"], ctx);
      expect(result.exitCode).toBe(0);
      expect(ctx.volume.lstatSync("/link.txt").isSymbolicLink()).toBe(true);
      expect(ctx.volume.readlinkSync("/link.txt")).toBe("/target.txt");
    });

    it("ln creates a hard link", async () => {
      const ctx = makeCtx({ "/a.txt": "shared" });
      const result = await run("ln", ["/a.txt", "/b.txt"], ctx);
      expect(result.exitCode).toBe(0);
      expect(ctx.volume.readFileSync("/b.txt", "utf8")).toBe("shared");
    });

    it("readlink returns symlink target", async () => {
      const ctx = makeCtx({ "/target.txt": "data" });
      ctx.volume.symlinkSync("/target.txt", "/link.txt");
      const result = await run("readlink", ["/link.txt"], ctx);
      expect(result.stdout).toBe("/target.txt\n");
    });

    it("test -h detects symlink", async () => {
      const ctx = makeCtx({ "/target.txt": "data" });
      ctx.volume.symlinkSync("/target.txt", "/link.txt");
      const yes = await run("test", ["-h", "/link.txt"], ctx);
      const no = await run("test", ["-h", "/target.txt"], ctx);
      expect(yes.exitCode).toBe(0);
      expect(no.exitCode).toBe(1);
    });
  });
});
