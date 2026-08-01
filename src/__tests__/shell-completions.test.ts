import { describe, it, expect } from "vitest";
import {
  getCompletions,
  longestCommonPrefix,
} from "../shell/shell-completions";
import { MemoryVolume } from "../memory-volume";

function makeVol(files: string[], dirs: string[] = []): MemoryVolume {
  const vol = new MemoryVolume();
  for (const d of dirs) vol.mkdirSync(d, { recursive: true });
  for (const f of files) {
    const dir = f.substring(0, f.lastIndexOf("/")) || "/";
    if (dir !== "/" && !vol.existsSync(dir)) vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(f, "");
  }
  return vol;
}

const BUILTINS: string[] = ["cd", "ls", "echo", "cat", "pwd"];

describe("longestCommonPrefix", () => {
  it("returns empty for empty input", () => {
    expect(longestCommonPrefix([])).toBe("");
  });

  it("returns the string itself for single input", () => {
    expect(longestCommonPrefix(["home/"])).toBe("home/");
  });

  it("finds shared prefix of multiple strings", () => {
    expect(longestCommonPrefix(["home/", "horses/"])).toBe("ho");
    expect(longestCommonPrefix(["home", "home_assistant"])).toBe("home");
  });

  it("returns empty when no prefix shared", () => {
    expect(longestCommonPrefix(["foo", "bar"])).toBe("");
  });
});

describe("getCompletions - command completion (first word)", () => {
  it("completes builtin names from empty buffer", () => {
    const vol = makeVol([]);
    const res = getCompletions("", 0, "/", vol, BUILTINS);
    expect(res.token).toBe("");
    expect(res.tokenStart).toBe(0);
    const names = res.matches.map((m) => m.trim());
    for (const b of BUILTINS) expect(names).toContain(b);
  });

  it("filters builtins by prefix", () => {
    const vol = makeVol([]);
    const res = getCompletions("c", 1, "/", vol, BUILTINS);
    expect(res.token).toBe("c");
    const names = res.matches.map((m) => m.trim());
    expect(names).toEqual(expect.arrayContaining(["cd", "cat"]));
    expect(names).not.toContain("ls");
  });

  it("completes 'cd' exactly from 'c' if only cd matches", () => {
    const vol = makeVol([]);
    const res = getCompletions("c", 1, "/", vol, ["cd"]);
    expect(res.matches).toEqual(["cd "]);
  });

  it("completion appends a space for commands", () => {
    const vol = makeVol([]);
    const res = getCompletions("ec", 2, "/", vol, BUILTINS);
    expect(res.matches).toContain("echo ");
  });

  it("does not offer command completion when token contains '/'", () => {
    const vol = makeVol([], ["/bin"]);
    const res = getCompletions("./c", 3, "/", vol, BUILTINS);
    // cd shouldn't show up once there's a '/' in the token
    expect(res.matches.some((m) => m.trim() === "cd")).toBe(false);
  });
});

describe("getCompletions - path completion", () => {
  it("completes directories with trailing slash", () => {
    const vol = makeVol([], ["/home", "/horses"]);
    const res = getCompletions("cd ho", 5, "/", vol, BUILTINS);
    expect(res.token).toBe("ho");
    expect(res.tokenStart).toBe(3);
    expect(res.matches).toEqual(expect.arrayContaining(["home/", "horses/"]));
  });

  it("completes files with trailing space", () => {
    const vol = makeVol(["/readme.md", "/readme.txt"]);
    const res = getCompletions("cat re", 6, "/", vol, BUILTINS);
    expect(res.token).toBe("re");
    expect(res.matches).toEqual(
      expect.arrayContaining(["readme.md ", "readme.txt "]),
    );
  });

  it("resolves relative paths against cwd", () => {
    const vol = makeVol([], ["/project/src", "/project/dist"]);
    const res = getCompletions("cd s", 4, "/project", vol, BUILTINS);
    expect(res.matches).toEqual(["src/"]);
  });

  it("handles nested path tokens like 'src/sh'", () => {
    const vol = makeVol([], ["/src/shell", "/src/sdk"]);
    const res = getCompletions("ls src/sh", 9, "/", vol, BUILTINS);
    expect(res.token).toBe("src/sh");
    expect(res.matches).toEqual(["src/shell/"]);
  });

  it("handles absolute path tokens", () => {
    const vol = makeVol([], ["/usr/bin", "/usr/lib"]);
    const res = getCompletions("ls /usr/b", 9, "/", vol, BUILTINS);
    expect(res.token).toBe("/usr/b");
    expect(res.matches).toEqual(["/usr/bin/"]);
  });

  it("lists everything in cwd for empty arg token", () => {
    const vol = makeVol(["/a.txt"], ["/b", "/c"]);
    const res = getCompletions("ls ", 3, "/", vol, BUILTINS);
    expect(res.token).toBe("");
    expect(res.matches).toEqual(
      expect.arrayContaining(["a.txt ", "b/", "c/"]),
    );
  });

  it("returns empty on nonexistent dir", () => {
    const vol = makeVol([]);
    const res = getCompletions("ls does/not/exist/x", 19, "/", vol, BUILTINS);
    expect(res.matches).toEqual([]);
  });

  it("hides dotfiles unless prefix starts with '.'", () => {
    const vol = makeVol(["/visible.txt", "/.hidden"]);
    const visible = getCompletions("ls ", 3, "/", vol, BUILTINS);
    expect(visible.matches).not.toContain(".hidden ");
    expect(visible.matches).toContain("visible.txt ");

    const explicit = getCompletions("ls .", 4, "/", vol, BUILTINS);
    expect(explicit.matches).toContain(".hidden ");
  });
});

describe("getCompletions - tokenization", () => {
  it("tokenStart points to start of current token", () => {
    const vol = makeVol([], ["/foo"]);
    const res = getCompletions("ls  foo", 7, "/", vol, BUILTINS);
    expect(res.token).toBe("foo");
    expect(res.tokenStart).toBe(4);
  });

  it("cursor on whitespace => empty token at cursor", () => {
    const vol = makeVol([], ["/a"]);
    const res = getCompletions("ls ", 3, "/", vol, BUILTINS);
    expect(res.token).toBe("");
    expect(res.tokenStart).toBe(3);
  });

  it("cursor mid-line uses only text before cursor", () => {
    const vol = makeVol([], ["/home", "/horses"]);
    const res = getCompletions("cd ho extra", 5, "/", vol, BUILTINS);
    expect(res.token).toBe("ho");
    expect(res.tokenStart).toBe(3);
    expect(res.matches).toEqual(expect.arrayContaining(["home/", "horses/"]));
  });
});

describe("getCompletions - extra commands", () => {
  it("includes extraCommands in first-word completion", () => {
    const vol = makeVol([]);
    const res = getCompletions("gi", 2, "/", vol, BUILTINS, {
      extraCommands: ["git", "gist"],
    });
    const names = res.matches.map((m) => m.trim());
    expect(names).toEqual(expect.arrayContaining(["git", "gist"]));
  });

  it("deduplicates overlap between builtins and extras", () => {
    const vol = makeVol([]);
    const res = getCompletions("c", 1, "/", vol, ["cd"], {
      extraCommands: ["cd"],
    });
    const cdCount = res.matches.filter((m) => m.trim() === "cd").length;
    expect(cdCount).toBe(1);
  });
});
