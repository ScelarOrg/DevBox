// SharedVFS — SharedArrayBuffer-backed VFS for synchronous cross-thread reads.
//
// When SAB is available (requires COOP/COEP headers), workers can do
// fs.readFileSync() directly from shared memory without async IPC.
// Falls back to snapshot-based approach when SAB is unavailable.
//
// Layout: file table (paths -> offset+length) + data region, all in one SAB.
// Main thread owns the canonical table; workers read from it.

/* ------------------------------------------------------------------ */
/*  Feature detection                                                  */
/* ------------------------------------------------------------------ */
export function isSharedArrayBufferAvailable(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined'
    );
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Shared memory layout                                               */
/* ------------------------------------------------------------------ */

// Per entry, 264 bytes:
//   [0..3] flags  [4..7] contentOffset  [8..11] contentLength
//   [12..15] modified  [16..263] null-terminated path
const ENTRY_SIZE = 264;
const ENTRY_FLAGS_OFFSET = 0;
const ENTRY_CONTENT_OFFSET = 4;
const ENTRY_CONTENT_LENGTH = 8;
const ENTRY_MODIFIED_OFFSET = 12;
const ENTRY_PATH_OFFSET = 16;
const ENTRY_PATH_MAX = 248;

const FLAG_ACTIVE = 1;
const FLAG_DIRECTORY = 2;
const FLAG_SYMLINK = 4;

// Header: [0] version, [1] entry count, [2] data used, [3] lock
const HEADER_SIZE = 16;
const MAX_ENTRIES = 16384;
const TABLE_SIZE = MAX_ENTRIES * ENTRY_SIZE;
const DATA_OFFSET = HEADER_SIZE + TABLE_SIZE;

const DEFAULT_BUFFER_SIZE = 64 * 1024 * 1024; // 64MB

export interface SharedVFSStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  /** ms since epoch. resolution is seconds, the SAB only stores seconds. */
  mtime: number;
}

/* ------------------------------------------------------------------ */
/*  FNV-1a hash                                                        */
/* ------------------------------------------------------------------ */

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/* ------------------------------------------------------------------ */
/*  SharedVFSController (main thread)                                  */
/* ------------------------------------------------------------------ */

// Main-thread controller. Owns the SAB and manages the file table.
export class SharedVFSController {
  private _buffer: SharedArrayBuffer;
  private _view: DataView;
  private _int32: Int32Array;
  private _uint8: Uint8Array;
  private _pathEncoder = new TextEncoder();
  private _pathDecoder = new TextDecoder();

  constructor(bufferSize: number = DEFAULT_BUFFER_SIZE) {
    if (!isSharedArrayBufferAvailable()) {
      throw new Error('SharedArrayBuffer not available. Ensure COOP/COEP headers are set.');
    }

    this._buffer = new SharedArrayBuffer(bufferSize);
    this._view = new DataView(this._buffer);
    this._int32 = new Int32Array(this._buffer);
    this._uint8 = new Uint8Array(this._buffer);

    Atomics.store(this._int32, 0, 0);
    Atomics.store(this._int32, 1, 0);
    this._view.setUint32(8, 0);
    Atomics.store(this._int32, 3, 0);
  }

  get buffer(): SharedArrayBuffer {
    return this._buffer;
  }

  writeFile(path: string, content: Uint8Array): boolean {
    this._lock();
    try {
      const entryCount = Atomics.load(this._int32, 1);
      const dataUsed = this._view.getUint32(8);

      const existingIdx = this._findEntry(path);
      if (existingIdx !== -1) {
        return this._updateEntry(existingIdx, content, dataUsed);
      }

      if (entryCount >= MAX_ENTRIES) return false;
      if (DATA_OFFSET + dataUsed + content.byteLength > this._buffer.byteLength) return false;

      const contentOffset = dataUsed;
      this._uint8.set(content, DATA_OFFSET + contentOffset);

      const entryOffset = HEADER_SIZE + entryCount * ENTRY_SIZE;
      this._view.setUint32(entryOffset + ENTRY_FLAGS_OFFSET, FLAG_ACTIVE);
      this._view.setUint32(entryOffset + ENTRY_CONTENT_OFFSET, contentOffset);
      this._view.setUint32(entryOffset + ENTRY_CONTENT_LENGTH, content.byteLength);
      this._view.setUint32(entryOffset + ENTRY_MODIFIED_OFFSET, (Date.now() / 1000) | 0);

      const pathBytes = this._pathEncoder.encode(path);
      const pathLen = Math.min(pathBytes.byteLength, ENTRY_PATH_MAX - 1);
      this._uint8.set(pathBytes.subarray(0, pathLen), entryOffset + ENTRY_PATH_OFFSET);
      this._uint8[entryOffset + ENTRY_PATH_OFFSET + pathLen] = 0;

      Atomics.store(this._int32, 1, entryCount + 1);
      this._view.setUint32(8, dataUsed + content.byteLength);

      Atomics.add(this._int32, 0, 1);
      Atomics.notify(this._int32, 0);

      return true;
    } finally {
      this._unlock();
    }
  }

  writeDirectory(path: string): boolean {
    this._lock();
    try {
      const entryCount = Atomics.load(this._int32, 1);
      if (entryCount >= MAX_ENTRIES) return false;
      if (this._findEntry(path) !== -1) return true;

      const entryOffset = HEADER_SIZE + entryCount * ENTRY_SIZE;
      this._view.setUint32(entryOffset + ENTRY_FLAGS_OFFSET, FLAG_ACTIVE | FLAG_DIRECTORY);
      this._view.setUint32(entryOffset + ENTRY_CONTENT_OFFSET, 0);
      this._view.setUint32(entryOffset + ENTRY_CONTENT_LENGTH, 0);
      this._view.setUint32(entryOffset + ENTRY_MODIFIED_OFFSET, (Date.now() / 1000) | 0);

      const pathBytes = this._pathEncoder.encode(path);
      const pathLen = Math.min(pathBytes.byteLength, ENTRY_PATH_MAX - 1);
      this._uint8.set(pathBytes.subarray(0, pathLen), entryOffset + ENTRY_PATH_OFFSET);
      this._uint8[entryOffset + ENTRY_PATH_OFFSET + pathLen] = 0;

      Atomics.store(this._int32, 1, entryCount + 1);
      Atomics.add(this._int32, 0, 1);
      Atomics.notify(this._int32, 0);

      return true;
    } finally {
      this._unlock();
    }
  }

  deleteFile(path: string): boolean {
    this._lock();
    try {
      const idx = this._findEntry(path);
      if (idx === -1) return false;

      const entryOffset = HEADER_SIZE + idx * ENTRY_SIZE;
      this._view.setUint32(entryOffset + ENTRY_FLAGS_OFFSET, 0);

      Atomics.add(this._int32, 0, 1);
      Atomics.notify(this._int32, 0);

      return true;
    } finally {
      this._unlock();
    }
  }

  readFile(path: string): Uint8Array | null {
    const idx = this._findEntry(path);
    if (idx === -1) return null;

    const entryOffset = HEADER_SIZE + idx * ENTRY_SIZE;
    const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
    if (!(flags & FLAG_ACTIVE) || (flags & FLAG_DIRECTORY)) return null;

    const contentOffset = this._view.getUint32(entryOffset + ENTRY_CONTENT_OFFSET);
    const contentLength = this._view.getUint32(entryOffset + ENTRY_CONTENT_LENGTH);

    // Copy, not view, to avoid races
    return new Uint8Array(this._uint8.slice(
      DATA_OFFSET + contentOffset,
      DATA_OFFSET + contentOffset + contentLength,
    ));
  }

  exists(path: string): boolean {
    return this._findEntry(path) !== -1;
  }

  get version(): number {
    return Atomics.load(this._int32, 0);
  }

  /* ---- Internal ---- */

  private _findEntry(path: string): number {
    const entryCount = Atomics.load(this._int32, 1);
    const pathBytes = this._pathEncoder.encode(path);

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = HEADER_SIZE + i * ENTRY_SIZE;
      const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
      if (!(flags & FLAG_ACTIVE)) continue;

      let match = true;
      for (let j = 0; j < pathBytes.byteLength; j++) {
        if (this._uint8[entryOffset + ENTRY_PATH_OFFSET + j] !== pathBytes[j]) {
          match = false;
          break;
        }
      }
      if (match && this._uint8[entryOffset + ENTRY_PATH_OFFSET + pathBytes.byteLength] === 0) {
        return i;
      }
    }
    return -1;
  }

  private _updateEntry(idx: number, content: Uint8Array, dataUsed: number): boolean {
    if (DATA_OFFSET + dataUsed + content.byteLength > this._buffer.byteLength) return false;

    const entryOffset = HEADER_SIZE + idx * ENTRY_SIZE;

    // Append-only — don't reuse old space to avoid races
    const contentOffset = dataUsed;
    this._uint8.set(content, DATA_OFFSET + contentOffset);

    this._view.setUint32(entryOffset + ENTRY_CONTENT_OFFSET, contentOffset);
    this._view.setUint32(entryOffset + ENTRY_CONTENT_LENGTH, content.byteLength);
    this._view.setUint32(entryOffset + ENTRY_MODIFIED_OFFSET, (Date.now() / 1000) | 0);

    this._view.setUint32(8, dataUsed + content.byteLength);
    Atomics.add(this._int32, 0, 1);
    Atomics.notify(this._int32, 0);

    return true;
  }

  private _lock(): void {
    while (Atomics.compareExchange(this._int32, 3, 0, 1) !== 0) {
      Atomics.wait(this._int32, 3, 1, 1);
    }
  }

  private _unlock(): void {
    Atomics.store(this._int32, 3, 0);
    Atomics.notify(this._int32, 3);
  }
}

/* ------------------------------------------------------------------ */
/*  SharedVFSReader (worker thread)                                    */
/* ------------------------------------------------------------------ */

// Worker-thread reader. Synchronous read access to shared memory.
export class SharedVFSReader {
  private _buffer: SharedArrayBuffer;
  private _view: DataView;
  private _int32: Int32Array;
  private _uint8: Uint8Array;
  private _pathEncoder = new TextEncoder();
  private _pathDecoder = new TextDecoder();

  constructor(buffer: SharedArrayBuffer) {
    this._buffer = buffer;
    this._view = new DataView(buffer);
    this._int32 = new Int32Array(buffer);
    this._uint8 = new Uint8Array(buffer);
  }

  readFileSync(path: string): Uint8Array | null {
    const idx = this._findEntry(path);
    if (idx === -1) return null;

    const entryOffset = HEADER_SIZE + idx * ENTRY_SIZE;
    const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
    if (!(flags & FLAG_ACTIVE) || (flags & FLAG_DIRECTORY)) return null;

    const contentOffset = this._view.getUint32(entryOffset + ENTRY_CONTENT_OFFSET);
    const contentLength = this._view.getUint32(entryOffset + ENTRY_CONTENT_LENGTH);

    const result = new Uint8Array(contentLength);
    result.set(this._uint8.subarray(
      DATA_OFFSET + contentOffset,
      DATA_OFFSET + contentOffset + contentLength,
    ));
    return result;
  }

  existsSync(path: string): boolean {
    return this._findEntry(path) !== -1;
  }

  isDirectorySync(path: string): boolean {
    const idx = this._findEntry(path);
    if (idx === -1) return false;
    const entryOffset = HEADER_SIZE + idx * ENTRY_SIZE;
    const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
    return (flags & FLAG_ACTIVE) !== 0 && (flags & FLAG_DIRECTORY) !== 0;
  }

  statSync(path: string): SharedVFSStat | null {
    const idx = this._findEntry(path);
    if (idx === -1) return null;
    const entryOffset = HEADER_SIZE + idx * ENTRY_SIZE;
    const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
    if (!(flags & FLAG_ACTIVE)) return null;
    const isDirectory = (flags & FLAG_DIRECTORY) !== 0;
    const contentLength = this._view.getUint32(entryOffset + ENTRY_CONTENT_LENGTH);
    const modified = this._view.getUint32(entryOffset + ENTRY_MODIFIED_OFFSET);
    return {
      isFile: !isDirectory,
      isDirectory,
      size: isDirectory ? 0 : contentLength,
      mtime: modified * 1000,
    };
  }

  // immediate children only, basenames, O(n) over the entry table.
  // returns [] for missing paths.
  readdirSync(dir: string): string[] {
    const prefix = dir === "/" ? "/" : dir.endsWith("/") ? dir : dir + "/";
    const entryCount = Atomics.load(this._int32, 1);
    const names: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = HEADER_SIZE + i * ENTRY_SIZE;
      const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
      if (!(flags & FLAG_ACTIVE)) continue;

      const path = this._readPath(entryOffset);
      if (!path.startsWith(prefix) || path === prefix) continue;

      // strip prefix then take up to the next slash, skip nested entries
      const rest = path.slice(prefix.length);
      const slashIdx = rest.indexOf("/");
      const name = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }

    return names;
  }

  get version(): number {
    return Atomics.load(this._int32, 0);
  }

  // Blocks until version changes. Returns new version or -1 on timeout.
  waitForChange(currentVersion: number, timeoutMs: number = 5000): number {
    const result = Atomics.wait(this._int32, 0, currentVersion, timeoutMs);
    if (result === 'timed-out') return -1;
    return Atomics.load(this._int32, 0);
  }

  /* ---- Internal ---- */

  private _findEntry(path: string): number {
    const entryCount = Atomics.load(this._int32, 1);
    const pathBytes = this._pathEncoder.encode(path);

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = HEADER_SIZE + i * ENTRY_SIZE;
      const flags = this._view.getUint32(entryOffset + ENTRY_FLAGS_OFFSET);
      if (!(flags & FLAG_ACTIVE)) continue;

      let match = true;
      for (let j = 0; j < pathBytes.byteLength; j++) {
        if (this._uint8[entryOffset + ENTRY_PATH_OFFSET + j] !== pathBytes[j]) {
          match = false;
          break;
        }
      }
      if (match && this._uint8[entryOffset + ENTRY_PATH_OFFSET + pathBytes.byteLength] === 0) {
        return i;
      }
    }
    return -1;
  }

  // decode a null-terminated path from an entry. needs a non-shared copy
  // because TextDecoder throws on SAB views.
  private _readPath(entryOffset: number): string {
    let end = 0;
    while (end < ENTRY_PATH_MAX && this._uint8[entryOffset + ENTRY_PATH_OFFSET + end] !== 0) {
      end++;
    }
    if (end === 0) return "";
    const copy = new Uint8Array(end);
    copy.set(this._uint8.subarray(entryOffset + ENTRY_PATH_OFFSET, entryOffset + ENTRY_PATH_OFFSET + end));
    return this._pathDecoder.decode(copy);
  }
}
