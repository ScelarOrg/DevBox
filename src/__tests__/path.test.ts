import { describe, it, expect } from "vitest";
import * as path from "../polyfills/path";

describe("path.normalize", () => {
  it("resolves . and ..", () => {
    expect(path.normalize("/foo/bar/../baz")).toBe("/foo/baz");
    expect(path.normalize("/foo/./bar")).toBe("/foo/bar");
  });

  it("removes duplicate slashes", () => {
    expect(path.normalize("/foo//bar///baz")).toBe("/foo/bar/baz");
  });

  it('returns "." for empty input', () => {
    expect(path.normalize("")).toBe(".");
  });

  it("handles relative paths with ..", () => {
    expect(path.normalize("a/b/../../c")).toBe("c");
  });

  it("does not go above root", () => {
    expect(path.normalize("/../../foo")).toBe("/foo");
  });
});

describe("path.join", () => {
  it("joins segments with /", () => {
    expect(path.join("/foo", "bar", "baz")).toBe("/foo/bar/baz");
  });

  it("normalizes result", () => {
    expect(path.join("/foo", "../bar")).toBe("/bar");
  });

  it('returns "." for no args', () => {
    expect(path.join()).toBe(".");
  });

  it("handles empty strings", () => {
    expect(path.join("", "foo", "")).toBe("foo");
  });
});

describe("path.resolve", () => {
  it("resolves relative to absolute base", () => {
    expect(path.resolve("/foo", "bar")).toBe("/foo/bar");
  });

  it("right-to-left resolution stops at absolute path", () => {
    expect(path.resolve("a", "/b", "c")).toBe("/b/c");
  });

  it("normalizes the result", () => {
    expect(path.resolve("/foo", "bar", "..", "baz")).toBe("/foo/baz");
  });

  // jiti / tailwind config loaders pass URL-strings back into path.resolve.
  // without scheme stripping these become "/app/http://localhost/..." nonsense
  it("treats http://localhost-rooted URLs as absolute pathnames", () => {
    expect(path.resolve("/app", "http://localhost/app/tailwind.config.js")).toBe(
      "/app/tailwind.config.js",
    );
  });

  it("treats file:// URLs as absolute pathnames", () => {
    expect(path.resolve("/cwd", "file:///app/tailwind.config.js")).toBe(
      "/app/tailwind.config.js",
    );
  });

  it("handles a bare URL string passed alone", () => {
    expect(path.resolve("http://localhost/app/foo.js")).toBe("/app/foo.js");
  });
});

describe("path.dirname", () => {
  it("returns parent directory", () => {
    expect(path.dirname("/foo/bar.txt")).toBe("/foo");
  });

  it('returns "/" for root-level file', () => {
    expect(path.dirname("/file.txt")).toBe("/");
  });

  it('returns "." for bare filename', () => {
    expect(path.dirname("file.txt")).toBe(".");
  });

  // glob-parent (used by tailwind, fast-glob etc) walks dirname to find the
  // static base of a glob and slices the suffix by the base byte length. if
  // we normalize first the leading "./" goes away and the slice is off by 2.
  it("preserves leading ./ in relative paths (glob-parent contract)", () => {
    expect(path.dirname("./src/**/*.js")).toBe("./src/**");
    expect(path.dirname("./src/**")).toBe("./src");
    expect(path.dirname("./src")).toBe(".");
  });

  it('returns "." for "./foo" (no normalize-then-slice)', () => {
    expect(path.dirname("./foo")).toBe(".");
  });

  it("does not mutate `..` segments", () => {
    expect(path.dirname("../foo/bar")).toBe("../foo");
  });
});

describe("path.basename", () => {
  it("returns filename from path", () => {
    expect(path.basename("/foo/bar.txt")).toBe("bar.txt");
  });

  it("strips suffix when provided", () => {
    expect(path.basename("/foo/bar.txt", ".txt")).toBe("bar");
  });

  it("returns empty for empty string", () => {
    expect(path.basename("")).toBe("");
  });

  it("returns last segment for directory path", () => {
    expect(path.basename("/foo/bar/")).toBe("bar");
  });

  it("preserves literal segments (no pre-normalize)", () => {
    expect(path.basename("./src/main.tsx")).toBe("main.tsx");
    expect(path.basename("./src/")).toBe("src");
  });
});

describe("path.extname", () => {
  it("returns extension with dot", () => {
    expect(path.extname("file.txt")).toBe(".txt");
  });

  it("returns empty for no extension", () => {
    expect(path.extname("Makefile")).toBe("");
  });

  it("returns last extension for multiple dots", () => {
    expect(path.extname("file.test.js")).toBe(".js");
  });

  it("returns empty for leading dot only", () => {
    expect(path.extname(".gitignore")).toBe("");
  });
});

describe("path.relative", () => {
  it("computes relative path between two absolute paths", () => {
    expect(path.relative("/a/b", "/a/c")).toBe("../c");
  });

  it("returns empty string for same path", () => {
    expect(path.relative("/a/b", "/a/b")).toBe("");
  });

  it("handles deeply nested paths", () => {
    expect(path.relative("/a/b/c", "/a/b/c/d/e")).toBe("d/e");
  });
});

describe("path.isAbsolute", () => {
  it("returns true for paths starting with /", () => {
    expect(path.isAbsolute("/foo")).toBe(true);
    expect(path.isAbsolute("/")).toBe(true);
  });

  it("returns false for relative paths", () => {
    expect(path.isAbsolute("foo")).toBe(false);
    expect(path.isAbsolute("./foo")).toBe(false);
    expect(path.isAbsolute("../foo")).toBe(false);
  });

  it("treats stringified file/http URLs as absolute", () => {
    expect(path.isAbsolute("file:///foo")).toBe(true);
    expect(path.isAbsolute("http://localhost/foo")).toBe(true);
  });
});

describe("path.parse", () => {
  it("decomposes path into parts", () => {
    const result = path.parse("/home/user/file.txt");
    expect(result.root).toBe("/");
    expect(result.dir).toBe("/home/user");
    expect(result.base).toBe("file.txt");
    expect(result.ext).toBe(".txt");
    expect(result.name).toBe("file");
  });

  it("handles root path", () => {
    const result = path.parse("/");
    expect(result.root).toBe("/");
  });

  it("handles relative path", () => {
    const result = path.parse("foo/bar.js");
    expect(result.root).toBe("");
    expect(result.dir).toBe("foo");
    expect(result.base).toBe("bar.js");
  });
});

describe("path.format", () => {
  it("reconstructs path from components", () => {
    expect(path.format({ dir: "/home/user", base: "file.txt" })).toBe(
      "/home/user/file.txt",
    );
  });

  it("uses name + ext when base is missing", () => {
    expect(path.format({ dir: "/home", name: "file", ext: ".txt" })).toBe(
      "/home/file.txt",
    );
  });
});

describe("path constants", () => {
  it('sep is "/"', () => {
    expect(path.sep).toBe("/");
  });

  it('delimiter is ":"', () => {
    expect(path.delimiter).toBe(":");
  });
});
