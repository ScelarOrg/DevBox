// Minimal ustar tar builder + gzip for npm pack.

import pako from "pako";

export interface TarEntry {
  path: string;
  content: Uint8Array | string;
  mode?: number;
  mtime?: number;
}

function pad(buf: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(buf.subarray(0, Math.min(buf.length, size)));
  return out;
}

function encodeOctal(n: number, size: number): string {
  const s = n.toString(8);
  return s.padStart(size - 1, "0") + "\0";
}

function checksum(header: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  return sum;
}

function writeHeader(name: string, size: number, mode: number, mtime: number): Uint8Array {
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  const nameBytes = enc.encode(name.slice(0, 100));
  header.set(nameBytes, 0);
  header.set(enc.encode(encodeOctal(mode, 8)), 100);
  header.set(enc.encode(encodeOctal(0, 8)), 108); // uid
  header.set(enc.encode(encodeOctal(0, 8)), 116); // gid
  header.set(enc.encode(encodeOctal(size, 12)), 124);
  header.set(enc.encode(encodeOctal(Math.floor(mtime / 1000), 12)), 136);
  header.set(enc.encode("        "), 148); // checksum placeholder
  header[156] = 48; // '0' regular file
  header.set(enc.encode("ustar\0"), 257);
  header.set(enc.encode("00"), 263);
  // compute checksum
  const sum = checksum(header);
  const sumStr = encodeOctal(sum, 7) + " ";
  header.set(enc.encode(sumStr.slice(0, 8)), 148);
  return header;
}

export function packTar(entries: TarEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const now = Date.now();
  for (const entry of entries) {
    const data =
      typeof entry.content === "string"
        ? new TextEncoder().encode(entry.content)
        : entry.content;
    const name = entry.path.replace(/^\//, "");
    chunks.push(writeHeader(name, data.length, entry.mode ?? 0o644, entry.mtime ?? now));
    chunks.push(data);
    const padLen = (512 - (data.length % 512)) % 512;
    if (padLen) chunks.push(new Uint8Array(padLen));
  }
  // two zero blocks end the archive
  chunks.push(new Uint8Array(1024));
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function packTarGz(entries: TarEntry[]): Uint8Array {
  return pako.gzip(packTar(entries));
}

// silence unused in case of tree-shaking quirks
void pad;
