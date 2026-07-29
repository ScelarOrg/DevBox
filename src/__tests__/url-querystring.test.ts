import { describe, it, expect } from "vitest";

import { parse, fileURLToPath } from "../polyfills/url";
import { parse as qsParse } from "../polyfills/querystring";
import { Console } from "../polyfills/console";
import { DEFAULT_ENV, MOCK_OS } from "../constants/config";
import { WriteStream } from "../polyfills/tty";

describe("url.parse", () => {
  it("keeps path-only URLs hostless", () => {
    const u = parse("/foo");
    expect(u.hostname).toBeNull();
    expect(u.host).toBeNull();
    expect(u.protocol).toBeNull();
    expect(u.pathname).toBe("/foo");
    expect(u.href).toBe("/foo");
  });

  it("parses absolute URLs", () => {
    const u = parse("https://example.com/a?b=1");
    expect(u.hostname).toBe("example.com");
    expect(u.pathname).toBe("/a");
    expect(u.query).toBe("b=1");
  });
});

describe("url.fileURLToPath", () => {
  it("converts file: URLs", () => {
    expect(fileURLToPath("file:///home/user/x")).toBe("/home/user/x");
  });

  it("throws on non-file schemes", () => {
    expect(() => fileURLToPath("https://example.com/x")).toThrow(/file:/);
    try {
      fileURLToPath("https://example.com/x");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("ERR_INVALID_URL_SCHEME");
    }
  });
});

describe("querystring.parse", () => {
  it("does not throw on invalid percent escapes", () => {
    expect(() => qsParse("a=%ZZ")).not.toThrow();
    expect(qsParse("a=%ZZ").a).toBe("%ZZ");
  });

  it("still decodes valid escapes", () => {
    expect(qsParse("a=%20").a).toBe(" ");
  });
});

describe("Console formatting", () => {
  it("formats circular objects without throwing", () => {
    const chunks: string[] = [];
    const c = new Console({
      write(s: string) {
        chunks.push(s);
      },
    } as any);
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => c.log(obj)).not.toThrow();
    expect(chunks.join("").length).toBeGreaterThan(0);
  });

  it("formats BigInt without throwing", () => {
    const chunks: string[] = [];
    const c = new Console({
      write(s: string) {
        chunks.push(s);
      },
    } as any);
    expect(() => c.log(1n)).not.toThrow();
    expect(chunks.join("")).toContain("1n");
  });
});

describe("tty / HOME", () => {
  it("hasColors is false when not a TTY", () => {
    const ws = new WriteStream();
    expect(ws.isTTY).toBe(false);
    expect(ws.hasColors()).toBe(false);
    expect(ws.getColorDepth()).toBe(1);
  });

  it("HOME matches os.homedir mock", () => {
    expect(DEFAULT_ENV.HOME).toBe(MOCK_OS.HOMEDIR);
  });
});
