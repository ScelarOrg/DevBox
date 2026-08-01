// Chunked to avoid blowing the call stack on large buffers
const SEGMENT_SIZE = 8192;

export function bytesToBase64(data: Uint8Array): string {
  const segments: string[] = [];
  for (let offset = 0; offset < data.length; offset += SEGMENT_SIZE) {
    const end = Math.min(offset + SEGMENT_SIZE, data.length);
    let chunk = '';
    for (let i = offset; i < end; i++) {
      chunk += String.fromCharCode(data[i]);
    }
    segments.push(chunk);
  }
  return btoa(segments.join(''));
}

export function base64ToBytes(encoded: string): Uint8Array {
  const raw = atob(encoded);
  const result = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    result[i] = raw.charCodeAt(i);
  }
  return result;
}

// Pre-computed hex lookup table
const HEX_TABLE: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = (i < 16 ? '0' : '') + i.toString(16);
}

export function bytesToHex(data: Uint8Array): string {
  const chars = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    chars[i] = HEX_TABLE[data[i]];
  }
  return chars.join('');
}

export function bytesToLatin1(data: Uint8Array): string {
  const segments: string[] = [];
  for (let offset = 0; offset < data.length; offset += SEGMENT_SIZE) {
    const end = Math.min(offset + SEGMENT_SIZE, data.length);
    let chunk = '';
    for (let i = offset; i < end; i++) {
      chunk += String.fromCharCode(data[i]);
    }
    segments.push(chunk);
  }
  return segments.join('');
}
