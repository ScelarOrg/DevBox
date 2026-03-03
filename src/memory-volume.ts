// in-memory VFS with POSIX-like semantics

import type { VolumeSnapshot, VolumeEntry } from './engine-types';
import { bytesToBase64, base64ToBytes } from './helpers/byte-encoding';
import { MOCK_IDS, MOCK_FS } from './constants/config';

export interface VolumeNode {
  kind: 'file' | 'directory' | 'symlink';
  content?: Uint8Array;
  children?: Map<string, VolumeNode>;
  target?: string;
  modified: number;
}

type FileChangeHandler = (filePath: string, content: string) => void;
type FileDeleteHandler = (filePath: string) => void;
type VolumeEventHandler = FileChangeHandler | FileDeleteHandler;

export interface FileStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  size: number;
  mode: number;
  mtime: Date;
  atime: Date;
  ctime: Date;
  birthtime: Date;
  mtimeMs: number;
  atimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  nlink: number;
  uid: number;
  gid: number;
  dev: number;
  ino: number;
  rdev: number;
  blksize: number;
  blocks: number;
  atimeNs: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  birthtimeNs: bigint;
}

export type WatchEventKind = 'change' | 'rename';
export type WatchCallback = (event: WatchEventKind, name: string | null) => void;

export interface FileWatchHandle {
  close(): void;
  ref(): this;
  unref(): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  addListener(event: string, listener: (...args: unknown[]) => void): this;
  removeAllListeners(event?: string): this;
  emit(event: string, ...args: unknown[]): boolean;
}

// minimal EventEmitter-based FSWatcher for fs.watch()
class FSWatcher implements FileWatchHandle {
  private _listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  private _closeFn: (() => void) | null = null;

  constructor(closeFn: () => void) {
    this._closeFn = closeFn;
  }

  close(): void {
    if (this._closeFn) { this._closeFn(); this._closeFn = null; }
    this._listeners.clear();
  }
  ref(): this { return this; }
  unref(): this { return this; }

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(listener);
    return this;
  }
  addListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }
  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapped = (...args: unknown[]) => {
      this.removeListener(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }
  off(event: string, listener: (...args: unknown[]) => void): this {
    return this.removeListener(event, listener);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    const list = this._listeners.get(event);
    if (list) {
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    }
    return this;
  }
  removeAllListeners(event?: string): this {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
    return this;
  }
  emit(event: string, ...args: unknown[]): boolean {
    const list = this._listeners.get(event);
    if (!list || list.length === 0) return false;
    for (const fn of [...list]) {
      try { fn(...args); } catch (e) { console.error('[FSWatcher] listener error:', e); }
    }
    return true;
  }
}

interface ActiveWatcher {
  callback: WatchCallback;
  recursive: boolean;
  active: boolean;
}

export interface SystemError extends Error {
  code: string;
  errno: number;
  syscall: string;
  path?: string;
}

export function makeSystemError(
  code: 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EEXIST' | 'ENOTEMPTY',
  syscall: string,
  targetPath: string,
  detail?: string
): SystemError {
  const errnoTable: Record<string, number> = {
    ENOENT: -2,
    ENOTDIR: -20,
    EISDIR: -21,
    EEXIST: -17,
    ENOTEMPTY: -39,
  };

  const descriptions: Record<string, string> = {
    ENOENT: 'no such file or directory',
    ENOTDIR: 'not a directory',
    EISDIR: 'is a directory',
    EEXIST: 'file already exists',
    ENOTEMPTY: 'directory not empty',
  };

  const err = new Error(
    detail || `${code}: ${descriptions[code]}, ${syscall} '${targetPath}'`
  ) as SystemError;
  err.code = code;
  err.errno = errnoTable[code];
  err.syscall = syscall;
  err.path = targetPath;
  return err;
}

export class MemoryVolume {
  private tree: VolumeNode;
  private textEncoder = new TextEncoder();
  private textDecoder = new TextDecoder();
  private activeWatchers = new Map<string, Set<ActiveWatcher>>();
  private subscribers = new Map<string, Set<VolumeEventHandler>>();

  constructor() {
    this.tree = {
      kind: 'directory',
      children: new Map(),
      modified: Date.now(),
    };
  }

  // ---- Event subscription ----

  on(event: 'change', handler: FileChangeHandler): this;
  on(event: 'delete', handler: FileDeleteHandler): this;
  on(event: string, handler: VolumeEventHandler): this {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event)!.add(handler);
    return this;
  }

  off(event: 'change', handler: FileChangeHandler): this;
  off(event: 'delete', handler: FileDeleteHandler): this;
  off(event: string, handler: VolumeEventHandler): this {
    const handlers = this.subscribers.get(event);
    if (handlers) handlers.delete(handler);
    return this;
  }

  private broadcast(event: 'change', path: string, content: string): void;
  private broadcast(event: 'delete', path: string): void;
  private broadcast(event: string, ...args: unknown[]): void {
    const handlers = this.subscribers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as (...a: unknown[]) => void)(...args);
        } catch (e) {
          console.error('Volume event handler error:', e);
        }
      }
    }
  }

  // ---- Snapshot serialization ----

  toSnapshot(): VolumeSnapshot {
    const entries: VolumeEntry[] = [];
    this.collectEntries('/', this.tree, entries);
    return { entries };
  }

  private collectEntries(currentPath: string, node: VolumeNode, result: VolumeEntry[]): void {
    if (node.kind === 'file') {
      let data = '';
      if (node.content && node.content.length > 0) {
        data = bytesToBase64(node.content);
      }
      result.push({ path: currentPath, kind: 'file', data });
    } else if (node.kind === 'symlink') {
      result.push({ path: currentPath, kind: 'file', data: `symlink:${node.target}` });
    } else if (node.kind === 'directory') {
      result.push({ path: currentPath, kind: 'directory' });
      if (node.children) {
        for (const [name, child] of node.children) {
          const childPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
          this.collectEntries(childPath, child, result);
        }
      }
    }
  }

  // restore from a binary snapshot (flat ArrayBuffer + offset manifest, used by workers)
  static fromBinarySnapshot(snapshot: { manifest: Array<{ path: string; offset: number; length: number; isDirectory: boolean }>; data: ArrayBuffer }): MemoryVolume {
    const vol = new MemoryVolume();
    const fullData = new Uint8Array(snapshot.data);

    // directories first, then by depth
    const sorted = [...snapshot.manifest].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.path.split("/").length - b.path.split("/").length;
    });

    for (const entry of sorted) {
      if (entry.path === "/") continue;
      if (entry.isDirectory) {
        if (!vol.existsSync(entry.path)) vol.mkdirSync(entry.path, { recursive: true });
      } else {
        const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/")) || "/";
        if (parentDir !== "/" && !vol.existsSync(parentDir)) {
          vol.mkdirSync(parentDir, { recursive: true });
        }
        const content = fullData.slice(entry.offset, entry.offset + entry.length);
        vol.writeInternal(entry.path, content, false);
      }
    }

    return vol;
  }

  static fromSnapshot(snapshot: VolumeSnapshot): MemoryVolume {
    const vol = new MemoryVolume();

    const sorted = snapshot.entries
      .map((entry, idx) => ({ entry, depth: entry.path.split('/').length, idx }))
      .sort((a, b) => a.depth - b.depth || a.idx - b.idx)
      .map(x => x.entry);

    for (const entry of sorted) {
      if (entry.path === '/') continue;

      if (entry.kind === 'directory') {
        vol.mkdirSync(entry.path, { recursive: true });
      } else if (entry.kind === 'file') {
        let content: Uint8Array;
        if (entry.data) {
          content = base64ToBytes(entry.data);
        } else {
          content = new Uint8Array(0);
        }
        const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/';
        if (parentDir !== '/' && !vol.existsSync(parentDir)) {
          vol.mkdirSync(parentDir, { recursive: true });
        }
        vol.writeInternal(entry.path, content, false);
      }
    }

    return vol;
  }

  // ---- Path utilities ----

  private normalize(p: string): string {
    if (!p.startsWith('/')) p = '/' + p;
    const parts = p.split('/').filter(Boolean);
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') resolved.pop();
      else if (part !== '.') resolved.push(part);
    }
    return '/' + resolved.join('/');
  }

  private segments(p: string): string[] {
    return this.normalize(p).split('/').filter(Boolean);
  }

  private parentOf(p: string): string {
    const norm = this.normalize(p);
    const idx = norm.lastIndexOf('/');
    return idx <= 0 ? '/' : norm.slice(0, idx);
  }

  private nameOf(p: string): string {
    const norm = this.normalize(p);
    const idx = norm.lastIndexOf('/');
    return norm.slice(idx + 1);
  }

  private locateRaw(p: string): VolumeNode | undefined {
    const segs = this.segments(p);
    let current = this.tree;
    for (const seg of segs) {
      if (current.kind === 'symlink') {
        const resolved = this.locateRaw(current.target!);
        if (!resolved || resolved.kind !== 'directory') return undefined;
        current = resolved;
      }
      if (current.kind !== 'directory' || !current.children) return undefined;
      const child = current.children.get(seg);
      if (!child) return undefined;
      current = child;
    }
    return current;
  }

  private locate(p: string): VolumeNode | undefined {
    const node = this.locateRaw(p);
    if (!node) return undefined;
    // follow final symlink
    if (node.kind === 'symlink') {
      return this.locate(node.target!);
    }
    return node;
  }

  private ensureDir(p: string): VolumeNode {
    const segs = this.segments(p);
    let current = this.tree;
    for (const seg of segs) {
      if (!current.children) current.children = new Map();
      let child = current.children.get(seg);
      if (!child) {
        child = { kind: 'directory', children: new Map(), modified: Date.now() };
        current.children.set(seg, child);
      } else if (child.kind !== 'directory') {
        throw new Error(`ENOTDIR: not a directory, '${p}'`);
      }
      current = child;
    }
    return current;
  }

  // ---- Internal write ----

  private writeInternal(p: string, data: string | Uint8Array, notify: boolean): void {
    const norm = this.normalize(p);
    // Derive parent/name directly — norm is already normalized, no need to re-normalize
    const lastSlash = norm.lastIndexOf('/');
    const parentPath = lastSlash <= 0 ? '/' : norm.slice(0, lastSlash);
    const name = norm.slice(lastSlash + 1);

    if (!name) {
      throw new Error(`EISDIR: illegal operation on a directory, '${p}'`);
    }

    const parent = this.ensureDir(parentPath);
    const existed = parent.children!.has(name);
    const bytes = typeof data === 'string' ? this.textEncoder.encode(data) : data;

    parent.children!.set(name, {
      kind: 'file',
      content: bytes,
      modified: Date.now(),
    });

    if (notify) {
      this.triggerWatchers(norm, existed ? 'change' : 'rename');
      this.broadcast('change', norm, typeof data === 'string' ? data : this.textDecoder.decode(data));
      this.notifyGlobalListeners(norm, existed ? 'change' : 'add');
    }
  }

  // ---- Public synchronous API ----

  existsSync(p: string): boolean {
    return this.locate(p) !== undefined;
  }

  statSync(p: string): FileStat {
    const node = this.locate(p);
    if (!node) throw makeSystemError('ENOENT', 'stat', p);

    const fileSize = node.kind === 'file' ? (node.content?.length || 0) : 0;
    const ts = node.modified;

    return {
      isFile: () => node.kind === 'file',
      isDirectory: () => node.kind === 'directory',
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      size: fileSize,
      mode: node.kind === 'directory' ? 0o755 : 0o644,
      mtime: new Date(ts),
      atime: new Date(ts),
      ctime: new Date(ts),
      birthtime: new Date(ts),
      mtimeMs: ts,
      atimeMs: ts,
      ctimeMs: ts,
      birthtimeMs: ts,
      nlink: 1,
      uid: MOCK_IDS.UID,
      gid: MOCK_IDS.GID,
      dev: 0,
      ino: 0,
      rdev: 0,
      blksize: MOCK_FS.BLOCK_SIZE,
      blocks: Math.ceil(fileSize / MOCK_FS.BLOCK_CALC_SIZE),
      atimeNs: BigInt(ts) * 1000000n,
      mtimeNs: BigInt(ts) * 1000000n,
      ctimeNs: BigInt(ts) * 1000000n,
      birthtimeNs: BigInt(ts) * 1000000n,
    };
  }

  lstatSync(p: string): FileStat {
    const node = this.locateRaw(p);
    if (!node) throw makeSystemError('ENOENT', 'lstat', p);

    if (node.kind === 'symlink') {
      const ts = node.modified;
      return {
        isFile: () => false,
        isDirectory: () => false,
        isSymbolicLink: () => true,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        size: (node.target || '').length,
        mode: 0o120777,
        mtime: new Date(ts),
        atime: new Date(ts),
        ctime: new Date(ts),
        birthtime: new Date(ts),
        mtimeMs: ts,
        atimeMs: ts,
        ctimeMs: ts,
        birthtimeMs: ts,
        nlink: 1,
        uid: 1000,
        gid: 1000,
        dev: 0,
        ino: 0,
        rdev: 0,
        blksize: MOCK_FS.BLOCK_SIZE,
        blocks: 0,
        atimeNs: BigInt(ts) * 1000000n,
        mtimeNs: BigInt(ts) * 1000000n,
        ctimeNs: BigInt(ts) * 1000000n,
        birthtimeNs: BigInt(ts) * 1000000n,
      };
    }
    return this.statSync(p);
  }

  readFileSync(p: string): Uint8Array;
  readFileSync(p: string, encoding: 'utf8' | 'utf-8'): string;
  readFileSync(p: string, encoding?: 'utf8' | 'utf-8'): Uint8Array | string {
    const node = this.locate(p);
    if (!node) throw makeSystemError('ENOENT', 'open', p);
    if (node.kind !== 'file') throw makeSystemError('EISDIR', 'read', p);

    const bytes = node.content || new Uint8Array(0);
    if (encoding === 'utf8' || encoding === 'utf-8') {
      return this.textDecoder.decode(bytes);
    }
    return bytes;
  }

  writeFileSync(p: string, data: string | Uint8Array): void {
    const norm = this.normalize(p);
    const existed = this.locate(norm) !== undefined;
    this.writeInternal(p, data, true);
  }

  mkdirSync(p: string, options?: { recursive?: boolean }): void {
    const norm = this.normalize(p);

    if (options?.recursive) {
      this.ensureDir(norm);
      return;
    }

    const parentPath = this.parentOf(norm);
    const name = this.nameOf(norm);
    if (!name) return;

    const parent = this.locate(parentPath);
    if (!parent) throw makeSystemError('ENOENT', 'mkdir', parentPath);
    if (parent.kind !== 'directory') throw makeSystemError('ENOTDIR', 'mkdir', parentPath);
    if (parent.children!.has(name)) throw makeSystemError('EEXIST', 'mkdir', p);

    parent.children!.set(name, {
      kind: 'directory',
      children: new Map(),
      modified: Date.now(),
    });
  }

  readdirSync(p: string): string[] {
    const node = this.locate(p);
    if (!node) throw makeSystemError('ENOENT', 'scandir', p);
    if (node.kind !== 'directory') throw makeSystemError('ENOTDIR', 'scandir', p);
    return Array.from(node.children!.keys());
  }

  unlinkSync(p: string): void {
    const norm = this.normalize(p);
    const parentPath = this.parentOf(norm);
    const name = this.nameOf(norm);

    const parent = this.locate(parentPath);
    if (!parent || parent.kind !== 'directory') throw makeSystemError('ENOENT', 'unlink', p);

    const target = parent.children!.get(name);
    if (!target) throw makeSystemError('ENOENT', 'unlink', p);
    if (target.kind !== 'file') throw makeSystemError('EISDIR', 'unlink', p);

    parent.children!.delete(name);
    this.triggerWatchers(norm, 'rename');
    this.broadcast('delete', norm);
    this.notifyGlobalListeners(norm, 'unlink');
  }

  rmdirSync(p: string): void {
    const norm = this.normalize(p);
    const parentPath = this.parentOf(norm);
    const name = this.nameOf(norm);

    if (!name) throw new Error(`EPERM: operation not permitted, '${p}'`);

    const parent = this.locate(parentPath);
    if (!parent || parent.kind !== 'directory') throw makeSystemError('ENOENT', 'rmdir', p);

    const target = parent.children!.get(name);
    if (!target) throw makeSystemError('ENOENT', 'rmdir', p);
    if (target.kind !== 'directory') throw makeSystemError('ENOTDIR', 'rmdir', p);
    if (target.children!.size > 0) throw makeSystemError('ENOTEMPTY', 'rmdir', p);

    parent.children!.delete(name);
  }

  renameSync(from: string, to: string): void {
    const normFrom = this.normalize(from);
    const normTo = this.normalize(to);

    const fromParent = this.locate(this.parentOf(normFrom));
    if (!fromParent || fromParent.kind !== 'directory') throw makeSystemError('ENOENT', 'rename', from);

    const fromName = this.nameOf(normFrom);
    const node = fromParent.children!.get(fromName);
    if (!node) throw makeSystemError('ENOENT', 'rename', from);

    const toParent = this.ensureDir(this.parentOf(normTo));
    const toName = this.nameOf(normTo);

    fromParent.children!.delete(fromName);
    toParent.children!.set(toName, node);

    this.triggerWatchers(normFrom, 'rename');
    this.triggerWatchers(normTo, 'rename');
    this.notifyGlobalListeners(normFrom, 'unlink');
    this.notifyGlobalListeners(normTo, 'add');
  }

  accessSync(p: string, _mode?: number): void {
    if (!this.existsSync(p)) throw makeSystemError('ENOENT', 'access', p);
  }

  copyFileSync(src: string, dest: string): void {
    const data = this.readFileSync(src);
    this.writeFileSync(dest, data);
  }

  realpathSync(p: string): string {
    const norm = this.normalize(p);
    const node = this.locateRaw(norm);
    if (!node) throw makeSystemError('ENOENT', 'realpath', p);
    if (node.kind === 'symlink') {
      return this.realpathSync(node.target!);
    }
    return norm;
  }

  symlinkSync(target: string, linkPath: string, _type?: string): void {
    const normLink = this.normalize(linkPath);
    const parentPath = this.parentOf(normLink);
    const name = this.nameOf(normLink);

    if (!name) throw new Error(`EISDIR: invalid symlink path, '${linkPath}'`);
    const parent = this.ensureDir(parentPath);

    parent.children!.set(name, {
      kind: 'symlink',
      target: this.normalize(target),
      modified: Date.now(),
    });
  }

  readlinkSync(p: string): string {
    const norm = this.normalize(p);
    const node = this.locateRaw(norm);
    if (!node) throw makeSystemError('ENOENT', 'readlink', p);
    if (node.kind !== 'symlink') {
      const err = new Error(`EINVAL: invalid argument, readlink '${p}'`) as SystemError;
      err.code = 'EINVAL';
      err.errno = -22;
      err.syscall = 'readlink';
      err.path = p;
      throw err;
    }
    return node.target!;
  }

  linkSync(existingPath: string, newPath: string): void {
    // hard links share the same content reference
    const existing = this.locate(existingPath);
    if (!existing) throw makeSystemError('ENOENT', 'link', existingPath);
    if (existing.kind !== 'file') throw makeSystemError('EISDIR', 'link', existingPath);

    const normNew = this.normalize(newPath);
    const parentPath = this.parentOf(normNew);
    const name = this.nameOf(normNew);
    const parent = this.ensureDir(parentPath);

    parent.children!.set(name, {
      kind: 'file',
      content: existing.content,
      modified: existing.modified,
    });
  }

  chmodSync(_p: string, _mode: number): void {
    // no-op besides existence check, VFS doesn't track permissions
    const norm = this.normalize(_p);
    if (!this.locate(norm)) throw makeSystemError('ENOENT', 'chmod', _p);
  }

  chownSync(_p: string, _uid: number, _gid: number): void {
    const norm = this.normalize(_p);
    if (!this.locate(norm)) throw makeSystemError('ENOENT', 'chown', _p);
  }

  appendFileSync(p: string, data: string | Uint8Array): void {
    const norm = this.normalize(p);
    let existing: Uint8Array = new Uint8Array(0);
    try {
      existing = new Uint8Array(this.readFileSync(norm));
    } catch { /* file doesn't exist yet */ }
    const bytes = typeof data === 'string' ? this.textEncoder.encode(data) : data;
    const combined = new Uint8Array(existing.length + bytes.length);
    combined.set(existing);
    combined.set(bytes, existing.length);
    this.writeFileSync(norm, combined);
  }

  truncateSync(p: string, len: number = 0): void {
    const norm = this.normalize(p);
    const node = this.locate(norm);
    if (!node) throw makeSystemError('ENOENT', 'truncate', p);
    if (node.kind !== 'file') throw makeSystemError('EISDIR', 'truncate', p);
    const content = node.content || new Uint8Array(0);
    if (len < content.length) {
      node.content = content.slice(0, len);
    } else if (len > content.length) {
      const bigger = new Uint8Array(len);
      bigger.set(content);
      node.content = bigger;
    }
    node.modified = Date.now();
  }

  // ---- Async wrappers ----

  readFile(
    p: string,
    optionsOrCb?: { encoding?: string } | ((err: Error | null, data?: Uint8Array | string) => void),
    cb?: (err: Error | null, data?: Uint8Array | string) => void
  ): void {
    const actualCb = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
    const opts = typeof optionsOrCb === 'object' ? optionsOrCb : undefined;
    try {
      const data = opts?.encoding
        ? this.readFileSync(p, opts.encoding as 'utf8')
        : this.readFileSync(p);
      if (actualCb) setTimeout(() => actualCb(null, data), 0);
    } catch (err) {
      if (actualCb) setTimeout(() => actualCb(err as Error), 0);
    }
  }

  stat(p: string, cb?: (err: Error | null, stats?: FileStat) => void): void {
    try {
      const stats = this.statSync(p);
      if (cb) setTimeout(() => cb(null, stats), 0);
    } catch (err) {
      if (cb) setTimeout(() => cb(err as Error), 0);
    }
  }

  lstat(p: string, cb?: (err: Error | null, stats?: FileStat) => void): void {
    this.stat(p, cb);
  }

  readdir(
    p: string,
    optionsOrCb?: { withFileTypes?: boolean } | ((err: Error | null, files?: string[]) => void),
    cb?: (err: Error | null, files?: string[]) => void
  ): void {
    const actualCb = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
    try {
      const files = this.readdirSync(p);
      if (actualCb) setTimeout(() => actualCb(null, files), 0);
    } catch (err) {
      if (actualCb) setTimeout(() => actualCb(err as Error), 0);
    }
  }

  realpath(p: string, cb?: (err: Error | null, resolved?: string) => void): void {
    try {
      const resolved = this.realpathSync(p);
      if (cb) setTimeout(() => cb(null, resolved), 0);
    } catch (err) {
      if (cb) setTimeout(() => cb(err as Error), 0);
    }
  }

  access(p: string, modeOrCb?: number | ((err: Error | null) => void), cb?: (err: Error | null) => void): void {
    const actualCb = typeof modeOrCb === 'function' ? modeOrCb : cb;
    try {
      this.accessSync(p);
      if (actualCb) setTimeout(() => actualCb(null), 0);
    } catch (err) {
      if (actualCb) setTimeout(() => actualCb(err as Error), 0);
    }
  }

  // ---- File watchers ----

  watch(
    target: string,
    optionsOrCb?: { persistent?: boolean; recursive?: boolean; encoding?: string } | WatchCallback,
    cb?: WatchCallback
  ): FileWatchHandle {
    const norm = this.normalize(target);

    let opts: { persistent?: boolean; recursive?: boolean } = {};
    let actualCb: WatchCallback | undefined;

    if (typeof optionsOrCb === 'function') {
      actualCb = optionsOrCb;
    } else if (optionsOrCb) {
      opts = optionsOrCb;
      actualCb = cb;
    } else {
      actualCb = cb;
    }

    const handle = new FSWatcher(() => {
      watcher.active = false;
      const set = this.activeWatchers.get(norm);
      if (set) {
        set.delete(watcher);
        if (set.size === 0) this.activeWatchers.delete(norm);
      }
    });

    const watcher: ActiveWatcher = {
      callback: (event, filename) => {
        if (actualCb) actualCb(event, filename);
        handle.emit('change', event, filename);
      },
      recursive: opts.recursive || false,
      active: true,
    };

    if (!this.activeWatchers.has(norm)) {
      this.activeWatchers.set(norm, new Set());
    }
    this.activeWatchers.get(norm)!.add(watcher);

    return handle;
  }

  private triggerWatchers(changedPath: string, event: WatchEventKind): void {
    // changedPath is already normalized by the caller — no need to re-normalize
    const norm = changedPath;
    const lastSlash = norm.lastIndexOf('/');
    const fileName = norm.slice(lastSlash + 1);
    const directParent = lastSlash <= 0 ? '/' : norm.slice(0, lastSlash);

    const direct = this.activeWatchers.get(norm);
    if (direct) {
      for (const w of direct) {
        if (w.active) {
          try { w.callback(event, fileName); } catch (e) { console.error('Watcher error:', e); }
        }
      }
    }

    // walk up the tree to notify parent/recursive watchers
    let current = directParent;
    let relative = fileName;

    while (current) {
      const parentWatchers = this.activeWatchers.get(current);
      if (parentWatchers) {
        for (const w of parentWatchers) {
          if (w.active) {
            if (w.recursive || current === directParent) {
              try { w.callback(event, relative); } catch (e) { console.error('Watcher error:', e); }
            }
          }
        }
      }

      if (current === '/') break;
      const idx = current.lastIndexOf('/');
      const currentName = current.slice(idx + 1);
      relative = currentName + '/' + relative;
      current = idx <= 0 ? '/' : current.slice(0, idx);
    }

  }

  // ---- Global change listeners (for chokidar/HMR bridging) ----
  private globalChangeListeners = new Set<(path: string, event: string) => void>();

  onGlobalChange(cb: (path: string, event: string) => void): () => void {
    this.globalChangeListeners.add(cb);
    return () => { this.globalChangeListeners.delete(cb); };
  }

  private notifyGlobalListeners(path: string, event: string): void {
    for (const cb of this.globalChangeListeners) {
      try { cb(path, event); } catch (e) { console.error('Global VFS listener error:', e); }
    }
  }

  // ---- Stream-like APIs ----

  createReadStream(p: string): {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    pipe: (dest: unknown) => unknown;
  } {
    const self = this;
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

    const readable = {
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(cb);
        return readable;
      },
      pipe(dest: unknown) { return dest; },
    };

    setTimeout(() => {
      try {
        const data = self.readFileSync(p);
        handlers['data']?.forEach(cb => cb(data));
        handlers['end']?.forEach(cb => cb());
      } catch (err) {
        handlers['error']?.forEach(cb => cb(err));
      }
    }, 0);

    return readable;
  }

  createWriteStream(p: string): {
    write: (data: string | Uint8Array) => boolean;
    end: (data?: string | Uint8Array) => void;
    on: (event: string, cb: (...args: unknown[]) => void) => void;
  } {
    const self = this;
    const pending: Uint8Array[] = [];
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const enc = new TextEncoder();

    return {
      write(data: string | Uint8Array): boolean {
        pending.push(typeof data === 'string' ? enc.encode(data) : data);
        return true;
      },
      end(data?: string | Uint8Array): void {
        if (data) pending.push(typeof data === 'string' ? enc.encode(data) : data);
        const totalLen = pending.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Uint8Array(totalLen);
        let pos = 0;
        for (const chunk of pending) {
          merged.set(chunk, pos);
          pos += chunk.length;
        }
        self.writeFileSync(p, merged);
        handlers['finish']?.forEach(cb => cb());
        handlers['close']?.forEach(cb => cb());
      },
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(cb);
        return this;
      },
    };
  }
}
