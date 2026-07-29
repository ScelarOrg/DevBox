import { describe, it, expect } from "vitest";

import { Buffer } from "../polyfills/buffer";
import {
  isBuffer,
  isDeepStrictEqual,
  types,
} from "../polyfills/util";

describe("util.isBuffer", () => {
  it("returns true only for Buffer instances", () => {
    expect(isBuffer(Buffer.from("x"))).toBe(true);
    expect(isBuffer(new Uint8Array(1))).toBe(false);
  });
});

describe("util.isDeepStrictEqual", () => {
  it("treats NaN as equal", () => {
    expect(isDeepStrictEqual(NaN, NaN)).toBe(true);
  });

  it("treats +0 and -0 as unequal", () => {
    expect(isDeepStrictEqual(0, -0)).toBe(false);
  });

  it("compares Dates by time", () => {
    const t = Date.UTC(2020, 0, 1);
    expect(isDeepStrictEqual(new Date(t), new Date(t))).toBe(true);
    expect(isDeepStrictEqual(new Date(t), new Date(t + 1))).toBe(false);
  });

  it("compares Maps and Sets by contents", () => {
    expect(
      isDeepStrictEqual(new Map([["a", 1]]), new Map([["a", 1]])),
    ).toBe(true);
    expect(
      isDeepStrictEqual(new Map([["a", 1]]), new Map([["a", 2]])),
    ).toBe(false);
    expect(isDeepStrictEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(isDeepStrictEqual(new Set([1]), new Set([1, 2]))).toBe(false);
  });

  it("handles cyclic structures", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const b: Record<string, unknown> = {};
    b.self = b;
    expect(isDeepStrictEqual(a, b)).toBe(true);
  });
});

describe("util.types", () => {
  it("exposes Node-shaped type helpers", () => {
    expect(types.isMap(new Map())).toBe(true);
    expect(types.isSet(new Set())).toBe(true);
    expect(types.isTypedArray(new Uint8Array(1))).toBe(true);
    expect(types.isUint8Array(new Uint8Array(1))).toBe(true);
    expect(types.isArrayBuffer(new ArrayBuffer(1))).toBe(true);
    expect(types.isDataView(new DataView(new ArrayBuffer(1)))).toBe(true);
    expect(types.isPromise(Promise.resolve(1))).toBe(true);
    expect(types.isDate(new Date())).toBe(true);
    expect(types.isRegExp(/x/)).toBe(true);
    expect(types.isNativeError(new Error("x"))).toBe(true);
    expect(types.isAsyncFunction(async () => {})).toBe(true);
    expect(types.isBoxedPrimitive(Object(true))).toBe(true);
  });
});
