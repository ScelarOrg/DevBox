import { describe, it, expect } from "vitest";
import { NodepodShell } from "../shell/shell-interpreter";
import { MemoryVolume } from "../memory-volume";

function createShell(files?: Record<string, string>, cwd = "/") {
  const vol = new MemoryVolume();
  if (files) {
    for (const [path, content] of Object.entries(files)) {
      const dir = path.substring(0, path.lastIndexOf("/")) || "/";
      if (dir !== "/") vol.mkdirSync(dir, { recursive: true });
      vol.writeFileSync(path, content);
    }
  }
  const shell = new NodepodShell(vol, {
    cwd,
    env: { HOME: "/home/user", PATH: "/usr/bin", PWD: cwd },
  });
  return { vol, shell };
}

describe("NodepodShell", () => {
  describe("simple command execution", () => {
    it("executes echo and captures stdout", async () => {
      const { shell } = createShell();
      const result = await shell.exec("echo hello");
      expect(result.stdout).toBe("hello\n");
      expect(result.exitCode).toBe(0);
    });

    it("returns exit code from builtin", async () => {
      const { shell } = createShell();
      const result = await shell.exec("false");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("pipe chains", () => {
    it("pipes stdout of one command to stdin of next", async () => {
      const { shell } = createShell();
      const result = await shell.exec("echo hello world | wc -w");
      expect(result.stdout.trim()).toBe("2");
    });

    it("multi-stage pipe: echo | cat | cat", async () => {
      const { shell } = createShell();
      const result = await shell.exec("echo test | cat | cat");
      expect(result.stdout).toBe("test\n");
    });
  });

  describe("AND/OR chains", () => {
    it("&& runs second command only on success", async () => {
      const { shell } = createShell();
      const result = await shell.exec("true && echo yes");
      expect(result.stdout).toBe("yes\n");
    });

    it("&& skips second command on failure", async () => {
      const { shell } = createShell();
      const result = await shell.exec("false && echo no");
      expect(result.stdout).toBe("");
    });

    it("|| runs second command only on failure", async () => {
      const { shell } = createShell();
      const result = await shell.exec("false || echo fallback");
      expect(result.stdout).toBe("fallback\n");
    });

    it("|| skips second command on success", async () => {
      const { shell } = createShell();
      const result = await shell.exec("true || echo no");
      expect(result.stdout).toBe("");
    });

    it("mixed chains work correctly", async () => {
      const { shell } = createShell();
      const result = await shell.exec("false || true && echo ok");
      expect(result.stdout).toBe("ok\n");
    });
  });

  describe("semicolons", () => {
    it("runs both commands regardless of exit code", async () => {
      const { shell } = createShell();
      const result = await shell.exec("echo a; echo b");
      expect(result.stdout).toBe("a\nb\n");
    });
  });

  describe("redirections", () => {
    it("> writes stdout to file", async () => {
      const { vol, shell } = createShell();
      await shell.exec("echo hello > /out.txt");
      expect(vol.readFileSync("/out.txt", "utf8")).toBe("hello\n");
    });

    it(">> appends to file", async () => {
      const { vol, shell } = createShell({ "/out.txt": "first\n" });
      await shell.exec("echo second >> /out.txt");
      expect(vol.readFileSync("/out.txt", "utf8")).toBe("first\nsecond\n");
    });

    it("< reads stdin from file", async () => {
      const { shell } = createShell({ "/in.txt": "file content" });
      const result = await shell.exec("cat < /in.txt");
      expect(result.stdout).toBe("file content");
    });
  });

  describe("environment variables", () => {
    it("export VAR=value persists in env", async () => {
      const { shell } = createShell();
      await shell.exec("export X=42");
      expect(shell.getEnv().X).toBe("42");
    });
  });

  describe("cd integration", () => {
    it("cd changes shell cwd", async () => {
      const { vol, shell } = createShell();
      vol.mkdirSync("/mydir", { recursive: true });
      await shell.exec("cd /mydir");
      expect(shell.getCwd()).toBe("/mydir");
    });

    it("pwd reflects cd", async () => {
      const { vol, shell } = createShell();
      vol.mkdirSync("/mydir", { recursive: true });
      await shell.exec("cd /mydir");
      const result = await shell.exec("pwd");
      expect(result.stdout).toBe("/mydir\n");
    });
  });

  describe("compound operations", () => {
    it("mkdir -p + echo redirect + cat", async () => {
      const { vol, shell } = createShell();
      await shell.exec("mkdir -p /tmp/test && echo hello > /tmp/test/f.txt");
      expect(vol.readFileSync("/tmp/test/f.txt", "utf8")).toBe("hello\n");
    });
  });

  describe("glob expansion", () => {
    it("* is expanded to matching files", async () => {
      const { shell } = createShell({
        "/a.txt": "",
        "/b.txt": "",
        "/c.js": "",
      });
      const result = await shell.exec("echo *.txt");
      expect(result.stdout).toContain("a.txt");
      expect(result.stdout).toContain("b.txt");
      expect(result.stdout).not.toContain("c.js");
    });
  });

  describe("sh -c support", () => {
    it("sh -c executes simple command", async () => {
      const { shell } = createShell();
      const result = await shell.exec("sh -c 'echo hello'");
      expect(result.stdout).toBe("hello\n");
      expect(result.exitCode).toBe(0);
    });

    it("sh -c handles pipes correctly", async () => {
      const { shell } = createShell();
      const result = await shell.exec("sh -c 'echo hello world | wc -w'");
      expect(result.stdout.trim()).toBe("2");
      expect(result.exitCode).toBe(0);
    });

    it("sh -c handles chained commands", async () => {
      const { shell } = createShell();
      const result = await shell.exec("sh -c 'echo a && echo b'");
      expect(result.stdout).toBe("a\nb\n");
    });
  });
});
