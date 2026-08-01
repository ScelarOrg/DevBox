import { describe, it, expect } from "vitest";
import { parseTarArchive, safeJoin } from "../packages/archive-extractor";

describe("safeJoin", () => {
  it("joins a normal relative path", () => {
    expect(safeJoin("/node_modules/pkg", "index.js")).toBe("/node_modules/pkg/index.js");
  });

  it("joins a nested path", () => {
    expect(safeJoin("/node_modules/pkg", "lib/a.js")).toBe("/node_modules/pkg/lib/a.js");
  });

  it("rejects path traversal to parent", () => {
    expect(safeJoin("/node_modules/pkg", "../../package.json")).toBeNull();
  });

  it("rejects sibling escape", () => {
    expect(safeJoin("/node_modules/pkg", "../pkg-evil/x.js")).toBeNull();
  });

  it("allows empty relative (base dir)", () => {
    expect(safeJoin("/node_modules/pkg", "")).toBe("/node_modules/pkg");
  });

  it("allows benign .. that normalizes inside", () => {
    expect(safeJoin("/node_modules/pkg", "sub/../ok.js")).toBe("/node_modules/pkg/ok.js");
  });
});

function writeOctal(header: Uint8Array, offset: number, value: number, size: number): void {
  const s = value.toString(8).padStart(size - 1, "0") + "\0";
  for (let i = 0; i < size; i++) header[offset + i] = s.charCodeAt(i) || 0;
}

function makeHeader(name: string, size: number, typeflag: number): Uint8Array {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  header.set(enc.encode(name.slice(0, 100)), 0);
  writeOctal(header, 100, 0o644, 8);
  writeOctal(header, 108, 0, 8);
  writeOctal(header, 116, 0, 8);
  writeOctal(header, 124, size, 12);
  writeOctal(header, 136, 0, 12);
  header.set(enc.encode("        "), 148);
  header[156] = typeflag;
  header.set(enc.encode("ustar\0"), 257);
  header.set(enc.encode("00"), 263);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  const sumStr = sum.toString(8).padStart(6, "0") + "\0 ";
  header.set(enc.encode(sumStr.slice(0, 8)), 148);
  return header;
}

describe("parseTarArchive cursor alignment", () => {
  it("skips sized non-file entries without desyncing the next file", () => {
    const paxPayload = new TextEncoder().encode("path=./long-name.txt\n");
    const filePayload = new TextEncoder().encode("hello-after-pax");
    const paxPad = (512 - (paxPayload.length % 512)) % 512;
    const filePad = (512 - (filePayload.length % 512)) % 512;

    const parts = [
      makeHeader("./PaxHeader", paxPayload.length, 120), // 'x' PAX
      paxPayload,
      new Uint8Array(paxPad),
      makeHeader("pkg/index.js", filePayload.length, 48), // '0' file
      filePayload,
      new Uint8Array(filePad),
      new Uint8Array(1024),
    ];
    let total = 0;
    for (const p of parts) total += p.length;
    const raw = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      raw.set(p, off);
      off += p.length;
    }

    const entries = [...parseTarArchive(raw)];
    const file = entries.find((e) => e.kind === "file" && e.filepath === "pkg/index.js");
    expect(file).toBeDefined();
    expect(new TextDecoder().decode(file!.payload)).toBe("hello-after-pax");
  });
});
