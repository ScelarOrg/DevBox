import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rewriteTerminalServerUrlsInText,
  TerminalServerUrlOutputStream,
  type TerminalServerUrlResolver,
} from "../sdk/server-url-output";

const ready: TerminalServerUrlResolver = (port) =>
  port === 5173
    ? "https://podabc-5173.preview.example.com/"
    : undefined;

describe("terminal server URL presentation", () => {
  it("rewrites loopback aliases generically and preserves paths", () => {
    const input = [
      "http://localhost:5173/",
      "http://127.0.0.1:5173/docs?q=1",
      "http://0.0.0.0:5173/api",
      "http://[::1]:5173/ipv6",
    ].join(" ");

    expect(rewriteTerminalServerUrlsInText(input, ready)).toEqual({
      pending: false,
      text: [
        "https://podabc-5173.preview.example.com/",
        "https://podabc-5173.preview.example.com/docs?q=1",
        "https://podabc-5173.preview.example.com/api",
        "https://podabc-5173.preview.example.com/ipv6",
      ].join(" "),
    });
  });

  it("maps WebSocket schemes to ws/wss preview URLs", () => {
    expect(
      rewriteTerminalServerUrlsInText(
        "ws://localhost:5173/socket wss://127.0.0.1:5173/hmr",
        ready,
      ).text,
    ).toBe(
      "wss://podabc-5173.preview.example.com/socket " +
        "wss://podabc-5173.preview.example.com/hmr",
    );
  });

  it("handles ANSI styling inside the URL", () => {
    const input =
      "\x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m";
    expect(rewriteTerminalServerUrlsInText(input, ready).text).toBe(
      "\x1b[36mhttps://podabc-5173.preview.example.com\x1b[22m/\x1b[39m",
    );
  });

  it("rewrites both OSC-8 hyperlink targets and visible labels", () => {
    const input =
      "\x1b]8;;http://localhost:5173/docs\x1b\\" +
      "http://localhost:5173/docs" +
      "\x1b]8;;\x1b\\";
    const output = rewriteTerminalServerUrlsInText(input, ready).text;
    expect(output).not.toContain("localhost");
    expect(output.match(/podabc-5173/g)).toHaveLength(2);
  });

  it("does not touch external or inactive-port URLs", () => {
    const input =
      "https://example.com:5173/ http://localhost:3000/ not-a-url";
    expect(rewriteTerminalServerUrlsInText(input, ready).text).toBe(input);
  });

  it("uses the path-based fallback URL unchanged when that is what resolved", () => {
    const output = rewriteTerminalServerUrlsInText(
      "Local: http://localhost:5173/",
      (port) =>
        port === 5173
          ? "http://localhost:3333/__virtual__/podabc/5173"
          : undefined,
    ).text;
    expect(output).toBe(
      "Local: http://localhost:3333/__virtual__/podabc/5173/",
    );
  });
});

describe("TerminalServerUrlOutputStream", () => {
  afterEach(() => vi.useRealTimers());

  it("buffers a pending preview and emits after resolution", () => {
    let preview: string | null = null;
    const chunks: string[] = [];
    const stream = new TerminalServerUrlOutputStream(
      (port) => (port === 5173 ? preview : undefined),
      (text) => chunks.push(text),
    );

    stream.push("Local: http://localhost:5173/\n");
    expect(chunks).toEqual([]);

    preview = "https://podabc-5173.preview.example.com/";
    stream.notifyResolution();
    expect(chunks).toEqual([
      "Local: https://podabc-5173.preview.example.com/\n",
    ]);
    stream.end();
  });

  it("reassembles a URL split across output chunks", () => {
    const chunks: string[] = [];
    const stream = new TerminalServerUrlOutputStream(
      ready,
      (text) => chunks.push(text),
    );
    stream.push("Local: http://local");
    expect(chunks).toEqual([]);
    stream.push("host:5173/\n");
    expect(chunks.join("")).toBe(
      "Local: https://podabc-5173.preview.example.com/\n",
    );
    stream.end();
  });

  it("flushes unresolved output unchanged when the terminal stream ends", () => {
    const chunks: string[] = [];
    const stream = new TerminalServerUrlOutputStream(
      () => null,
      (text) => chunks.push(text),
    );
    stream.push("Local: http://localhost:5173/\n");
    stream.end();
    expect(chunks).toEqual(["Local: http://localhost:5173/\n"]);
  });

  it("never stalls unresolved terminal output for more than one second", () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const stream = new TerminalServerUrlOutputStream(
      () => null,
      (text) => chunks.push(text),
    );

    stream.push("Local: http://localhost:5173/\nserver is still logging\n");
    vi.advanceTimersByTime(999);
    expect(chunks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(chunks).toEqual([
      "Local: http://localhost:5173/\nserver is still logging\n",
    ]);
  });

  it("bounds buffered output while a preview bridge is pending", () => {
    const chunks: string[] = [];
    const stream = new TerminalServerUrlOutputStream(
      () => null,
      (text) => chunks.push(text),
    );

    const input = "Local: http://localhost:5173/\n" + "x".repeat(64 * 1024);
    stream.push(input);
    expect(chunks).toEqual([input]);
  });

  it("is an exact pass-through when rewriting is disabled", () => {
    const chunks: string[] = [];
    const stream = new TerminalServerUrlOutputStream(
      ready,
      (text) => chunks.push(text),
      false,
    );
    stream.push("http://local");
    stream.push("host:5173/");
    stream.end();
    expect(chunks).toEqual(["http://local", "host:5173/"]);
  });
});
