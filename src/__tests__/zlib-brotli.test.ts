/**
 * Integration tests for the brotli compression polyfill.
 *
 * Reproduces the exact scenarios from:
 *   https://github.com/ScelarOrg/Nodepod/issues/17
 *
 * These tests import the zlib polyfill directly (the same module that
 * ScriptEngine exposes as `require('zlib')`) and exercise the sync / async
 * brotli paths in the order described in the bug report.
 *
 * The brotli WASM engine is loaded through the real `ensureBrotli()` path
 * (Node.js CJS fallback — identical to the CDN path in the browser, just
 * resolved from node_modules instead of esm.sh).
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  brotliCompress,
  brotliDecompress,
  brotliCompressSync,
  brotliDecompressSync,
  preloadBrotli,
} from "../polyfills/zlib";
import { Buffer } from "../polyfills/buffer";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Promisify the callback-based brotliCompress */
function compressAsync(input: string | Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    brotliCompress(input, (err: Error | null, result: Buffer) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/** Promisify the callback-based brotliDecompress */
function decompressAsync(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    brotliDecompress(input, (err: Error | null, result: Buffer) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Issue #17 — exact reproduction scenarios                           */
/* ------------------------------------------------------------------ */

describe("brotli (issue #17)", () => {
  // Load brotli through the real ensureBrotli() path.
  // In vitest this hits the Node.js CJS fallback; in the browser it
  // would hit the CDN import — same engine either way.
  beforeAll(async () => {
    const ok = await preloadBrotli();
    expect(ok).toBe(true);
  });

  /* ---- Scenario 1: sync compress works after preload --------------- */

  it("brotliCompressSync works when WASM is preloaded", () => {
    const compressed = brotliCompressSync("ensure");
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);
  });

  /* ---- Scenario 2: async compress works on its own ------------------ */

  it("brotliCompress (async) completes correctly", async () => {
    const compressed = await compressAsync("ensure");
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);
  });

  /* ---- Scenario 3: sync AFTER async (the (void 0) crash) ----------- */

  it("brotliCompressSync works after brotliCompress", async () => {
    // Step 1: async compress (this was the workaround that loaded WASM)
    const asyncResult = await compressAsync("ensure");
    expect(asyncResult.length).toBeGreaterThan(0);

    // Step 2: sync compress — previously threw "(void 0) is not a function"
    const syncResult = brotliCompressSync("ensure");
    expect(syncResult.length).toBeGreaterThan(0);
  });

  /* ---- Roundtrip: compress -> decompress (sync) --------------------- */

  it("sync roundtrip: compress then decompress", () => {
    const original = "Hello, brotli roundtrip!";
    const compressed = brotliCompressSync(original);
    const decompressed = brotliDecompressSync(compressed);
    expect(decompressed.toString()).toBe(original);
  });

  /* ---- Roundtrip: compress -> decompress (async) -------------------- */

  it("async roundtrip: compress then decompress", async () => {
    const original = "Hello, async brotli roundtrip!";
    const compressed = await compressAsync(original);
    const decompressed = await decompressAsync(compressed);
    expect(decompressed.toString()).toBe(original);
  });

  /* ---- Mixed: async compress -> sync decompress --------------------- */

  it("async compress -> sync decompress roundtrip", async () => {
    const original = "Mixed mode roundtrip";
    const compressed = await compressAsync(original);
    const decompressed = brotliDecompressSync(compressed);
    expect(decompressed.toString()).toBe(original);
  });

  /* ---- Mixed: sync compress -> async decompress --------------------- */

  it("sync compress -> async decompress roundtrip", async () => {
    const original = "Reverse mixed mode roundtrip";
    const compressed = brotliCompressSync(original);
    const decompressed = await decompressAsync(compressed);
    expect(decompressed.toString()).toBe(original);
  });

  /* ---- Multiple sequential sync calls don't corrupt state ----------- */

  it("multiple sequential sync calls work correctly", () => {
    const inputs = ["first", "second", "third", "a longer string for good measure"];
    for (const input of inputs) {
      const compressed = brotliCompressSync(input);
      const decompressed = brotliDecompressSync(compressed);
      expect(decompressed.toString()).toBe(input);
    }
  });
});
