import { describe, it, expect } from "vitest";
import { expandVariables, tokenize, parse, expandGlob } from "../shell/shell-parser";
import { MemoryVolume } from "../memory-volume";

const ENV = { HOME: "/home/user", PATH: "/usr/bin", PWD: "/", FOO: "bar" };

describe("expandVariables", () => {
  it("expands $VAR to its value", () => {
    expect(expandVariables("$HOME", ENV, 0)).toBe("/home/user");
  });

  it("expands ${VAR} braced syntax", () => {
    expect(expandVariables("${HOME}", ENV, 0)).toBe("/home/user");
  });

  it("expands ${VAR:-default} when VAR is unset", () => {
    expect(expandVariables("${MISSING:-fallback}", ENV, 0)).toBe("fallback");
  });

  it("expands ${VAR:-default} returns value when VAR is set", () => {
    expect(expandVariables("${FOO:-fallback}", ENV, 0)).toBe("bar");
  });

  it("${VAR-default} keeps empty value; ${VAR:-default} substitutes", () => {
    const env = { ...ENV, EMPTY: "" };
    expect(expandVariables("${EMPTY-fallback}", env, 0)).toBe("");
    expect(expandVariables("${EMPTY:-fallback}", env, 0)).toBe("fallback");
    expect(expandVariables("${MISSING-fallback}", env, 0)).toBe("fallback");
  });

  it("expands $? to last exit code", () => {
    expect(expandVariables("$?", ENV, 42)).toBe("42");
  });

  it("expands $$ to stub PID", () => {
    const result = expandVariables("$$", ENV, 0);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("expands $0 to shell name", () => {
    const result = expandVariables("$0", ENV, 0);
    expect(typeof result).toBe("string");
  });

  it("handles tilde ~ expansion", () => {
    expect(expandVariables("~", ENV, 0)).toBe("/home/user");
    expect(expandVariables("~/dir", ENV, 0)).toBe("/home/user/dir");
  });

  it("handles undefined variables as empty string", () => {
    expect(expandVariables("$UNDEFINED_VAR", ENV, 0)).toBe("");
  });

  it("handles consecutive variables", () => {
    expect(expandVariables("$FOO$FOO", ENV, 0)).toBe("barbar");
  });
});

describe("tokenize", () => {
  it("splits simple command into word tokens", () => {
    const tokens = tokenize("echo hello world", ENV, 0);
    const words = tokens.filter((t) => t.type === "word").map((t) => t.value);
    expect(words).toEqual(["echo", "hello", "world"]);
  });

  it("handles single-quoted strings without expansion", () => {
    const tokens = tokenize("echo '$FOO'", ENV, 0);
    const words = tokens.filter((t) => t.type === "word").map((t) => t.value);
    expect(words).toContain("$FOO");
    expect(words).not.toContain("bar");
  });

  it("treats bare & as a command separator (does not hang)", () => {
    const tokens = tokenize("echo a & echo b", ENV, 0);
    expect(tokens.some((t) => t.type === "semi" && t.value === "&")).toBe(true);
    const words = tokens.filter((t) => t.type === "word").map((t) => t.value);
    expect(words).toEqual(["echo", "a", "echo", "b"]);
  });

  it("handles double-quoted strings (with expansion)", () => {
    const tokens = tokenize('echo "$FOO"', ENV, 0);
    const words = tokens.filter((t) => t.type === "word").map((t) => t.value);
    expect(words).toContain("bar");
  });

  it("recognizes pipe operator |", () => {
    const tokens = tokenize("echo hello | cat", ENV, 0);
    expect(tokens.some((t) => t.type === "pipe")).toBe(true);
  });

  it("recognizes && and ||", () => {
    const tokens = tokenize("true && echo yes || echo no", ENV, 0);
    expect(tokens.some((t) => t.type === "and")).toBe(true);
    expect(tokens.some((t) => t.type === "or")).toBe(true);
  });

  it("recognizes ; semicolon", () => {
    const tokens = tokenize("echo a; echo b", ENV, 0);
    expect(tokens.some((t) => t.type === "semi")).toBe(true);
  });

  it("recognizes > redirection", () => {
    const tokens = tokenize("echo hello > file.txt", ENV, 0);
    expect(tokens.some((t) => t.type === "redirect-out")).toBe(true);
  });

  it("handles empty input", () => {
    const tokens = tokenize("", ENV, 0);
    expect(tokens.some((t) => t.type === "eof")).toBe(true);
  });

  it("produces eof token at end", () => {
    const tokens = tokenize("echo hello", ENV, 0);
    expect(tokens[tokens.length - 1].type).toBe("eof");
  });
});

describe("parse", () => {
  it("parses simple command", () => {
    const ast = parse("echo hello", ENV, 0);
    expect(ast.kind).toBe("list");
    expect(ast.entries.length).toBe(1);
    expect(ast.entries[0].pipeline.commands[0].args).toEqual(["echo", "hello"]);
  });

  it('parses pipe: "echo hello | cat"', () => {
    const ast = parse("echo hello | cat", ENV, 0);
    expect(ast.entries[0].pipeline.commands.length).toBe(2);
    expect(ast.entries[0].pipeline.commands[0].args[0]).toBe("echo");
    expect(ast.entries[0].pipeline.commands[1].args[0]).toBe("cat");
  });

  it('parses AND: "true && echo yes"', () => {
    const ast = parse("true && echo yes", ENV, 0);
    expect(ast.entries.length).toBe(2);
    expect(ast.entries[0].next).toBe("&&");
  });

  it('parses OR: "false || echo no"', () => {
    const ast = parse("false || echo no", ENV, 0);
    expect(ast.entries[0].next).toBe("||");
  });

  it('parses semicolons: "echo a; echo b"', () => {
    const ast = parse("echo a; echo b", ENV, 0);
    expect(ast.entries.length).toBe(2);
    expect(ast.entries[0].next).toBe(";");
  });

  it('parses redirections: "echo hello > file.txt"', () => {
    const ast = parse("echo hello > file.txt", ENV, 0);
    const cmd = ast.entries[0].pipeline.commands[0];
    expect(cmd.redirects.length).toBeGreaterThan(0);
    expect(cmd.redirects[0].type).toBe("write");
    expect(cmd.redirects[0].target).toBe("file.txt");
  });

  it("parses append redirect >>", () => {
    const ast = parse("echo hello >> file.txt", ENV, 0);
    const cmd = ast.entries[0].pipeline.commands[0];
    expect(cmd.redirects[0].type).toBe("append");
  });

  it("parses input redirect <", () => {
    const ast = parse("cat < input.txt", ENV, 0);
    const cmd = ast.entries[0].pipeline.commands[0];
    expect(cmd.redirects[0].type).toBe("read");
  });

  it("parses 2>&1", () => {
    const ast = parse("echo hello 2>&1", ENV, 0);
    const cmd = ast.entries[0].pipeline.commands[0];
    expect(cmd.redirects.some((r) => r.type === "stderr-to-stdout")).toBe(true);
  });

  it("parses 2> and 2>>", () => {
    const a = parse("cmd 2> err.txt", ENV, 0);
    expect(a.entries[0].pipeline.commands[0].redirects[0]).toEqual({
      type: "stderr-write",
      target: "err.txt",
    });
    const b = parse("cmd 2>> err.txt", ENV, 0);
    expect(b.entries[0].pipeline.commands[0].redirects[0]).toEqual({
      type: "stderr-append",
      target: "err.txt",
    });
  });

  it("parses VAR=value assignments before command", () => {
    const ast = parse("FOO=hello echo test", ENV, 0);
    const cmd = ast.entries[0].pipeline.commands[0];
    expect(cmd.assignments).toHaveProperty("FOO", "hello");
  });
});

describe("expandGlob", () => {
  it("returns pattern as-is when no wildcards", () => {
    const vol = new MemoryVolume();
    expect(expandGlob("file.txt", "/", vol)).toEqual(["file.txt"]);
  });

  it("expands * to matching files", () => {
    const vol = new MemoryVolume();
    vol.writeFileSync("/test.txt", "");
    vol.writeFileSync("/test.js", "");
    vol.writeFileSync("/readme.md", "");

    const matches = expandGlob("*.txt", "/", vol);
    expect(matches).toContain("test.txt");
    expect(matches).not.toContain("test.js");
  });

  it("returns original pattern when no matches", () => {
    const vol = new MemoryVolume();
    const result = expandGlob("*.xyz", "/", vol);
    expect(result).toEqual(["*.xyz"]);
  });

  it("sorts results alphabetically", () => {
    const vol = new MemoryVolume();
    vol.writeFileSync("/c.txt", "");
    vol.writeFileSync("/a.txt", "");
    vol.writeFileSync("/b.txt", "");

    const matches = expandGlob("*.txt", "/", vol);
    const sorted = [...matches].sort();
    expect(matches).toEqual(sorted);
  });
});
