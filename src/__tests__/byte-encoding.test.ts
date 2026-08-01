import { describe, it, expect } from "vitest";
import {
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
  bytesToLatin1,
} from "../helpers/byte-encoding";

const textEncoder = new TextEncoder();

describe("bytesToBase64 / base64ToBytes", () => {
  it("round-trips an ASCII string", () => {
    const data = textEncoder.encode("Hello World");
    const b64 = bytesToBase64(data);
    const back = base64ToBytes(b64);
    expect(back).toEqual(data);
  });

  it("round-trips an empty array", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToBytes("")).toEqual(new Uint8Array(0));
  });

  it("round-trips all 256 byte values", () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const b64 = bytesToBase64(data);
    const back = base64ToBytes(b64);
    expect(back).toEqual(data);
  });

  it("round-trips a large buffer (> SEGMENT_SIZE 8192 bytes)", () => {
    const data = new Uint8Array(20000);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    const b64 = bytesToBase64(data);
    const back = base64ToBytes(b64);
    expect(back).toEqual(data);
  });

  it("handles binary data with null bytes", () => {
    const data = new Uint8Array([0, 0, 0, 255, 0, 128]);
    const back = base64ToBytes(bytesToBase64(data));
    expect(back).toEqual(data);
  });

  it("matches native btoa output for ASCII", () => {
    const str = "test string 123";
    const data = textEncoder.encode(str);
    expect(bytesToBase64(data)).toBe(btoa(str));
  });
});

describe("bytesToHex", () => {
  it("converts empty array to empty string", () => {
    expect(bytesToHex(new Uint8Array(0))).toBe("");
  });

  it("converts known byte values correctly", () => {
    expect(bytesToHex(new Uint8Array([0, 255, 128, 1]))).toBe("00ff8001");
  });

  it("produces lowercase hex digits", () => {
    const hex = bytesToHex(new Uint8Array([0xab, 0xcd, 0xef]));
    expect(hex).toBe("abcdef");
    expect(hex).toBe(hex.toLowerCase());
  });

  it("handles single byte", () => {
    expect(bytesToHex(new Uint8Array([10]))).toBe("0a");
  });
});

describe("bytesToLatin1", () => {
  it("converts empty array to empty string", () => {
    expect(bytesToLatin1(new Uint8Array(0))).toBe("");
  });

  it("converts byte values to latin1 code points", () => {
    expect(bytesToLatin1(new Uint8Array([72, 101, 108, 108, 111]))).toBe(
      "Hello",
    );
  });

  it("preserves high bytes (128-255) as single chars", () => {
    const data = new Uint8Array([0xe9]);
    const result = bytesToLatin1(data);
    expect(result).toBe("\xe9");
    expect(result.charCodeAt(0)).toBe(0xe9);
  });

  it("handles large buffer (> SEGMENT_SIZE)", () => {
    const data = new Uint8Array(10000);
    for (let i = 0; i < data.length; i++) data[i] = 65;
    const result = bytesToLatin1(data);
    expect(result.length).toBe(10000);
    expect(result).toBe("A".repeat(10000));
  });
});
