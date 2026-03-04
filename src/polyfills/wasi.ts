const ERRNO_SUCCESS = 0;
const ERRNO_2BIG = 1;
const ERRNO_ACCES = 2;
const ERRNO_BADF = 8;
const ERRNO_EXIST = 20;
const ERRNO_FAULT = 21;
const ERRNO_INVAL = 28;
const ERRNO_IO = 29;
const ERRNO_ISDIR = 31;
const ERRNO_NOENT = 44;
const ERRNO_NOSYS = 52;
const ERRNO_NOTDIR = 54;
const ERRNO_NOTEMPTY = 55;
const ERRNO_PERM = 63;
const ERRNO_PIPE = 64;
const ERRNO_SPIPE = 70;

const CLOCKID_REALTIME = 0;
const CLOCKID_MONOTONIC = 1;
const CLOCKID_PROCESS_CPUTIME_ID = 2;
const CLOCKID_THREAD_CPUTIME_ID = 3;

const FILETYPE_UNKNOWN = 0;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;
const FILETYPE_SYMBOLIC_LINK = 7;

const FDFLAGS_APPEND = 0x0001;

const FSTFLAGS_ATIM = 0x0001;
const FSTFLAGS_ATIM_NOW = 0x0002;
const FSTFLAGS_MTIM = 0x0004;
const FSTFLAGS_MTIM_NOW = 0x0008;

const OFLAGS_CREAT = 0x0001;
const OFLAGS_DIRECTORY = 0x0002;
const OFLAGS_EXCL = 0x0004;
const OFLAGS_TRUNC = 0x0008;

const WHENCE_SET = 0;
const WHENCE_CUR = 1;
const WHENCE_END = 2;

const PREOPENTYPE_DIR = 0;

const RIGHTS_FD_READ = 0x0000000000000002n;
const RIGHTS_FD_WRITE = 0x0000000000000040n;
const RIGHTS_FD_SEEK = 0x0000000000000004n;
const RIGHTS_FD_TELL = 0x0000000000000020n;
const RIGHTS_FD_READDIR = 0x0000000000004000n;
const RIGHTS_PATH_OPEN = 0x0000000000002000n;
const RIGHTS_PATH_CREATE_DIRECTORY = 0x0000000000000200n;
const RIGHTS_PATH_CREATE_FILE = 0x0000000000000400n;
const RIGHTS_PATH_UNLINK_FILE = 0x0000000004000000n;
const RIGHTS_PATH_REMOVE_DIRECTORY = 0x0000000002000000n;
const RIGHTS_PATH_RENAME_SOURCE = 0x0000000000010000n;
const RIGHTS_PATH_RENAME_TARGET = 0x0000000000020000n;
const RIGHTS_PATH_FILESTAT_GET = 0x0000000000040000n;
const RIGHTS_PATH_SYMLINK = 0x0000000001000000n;
const RIGHTS_PATH_READLINK = 0x0000000000008000n;
const RIGHTS_FD_FILESTAT_GET = 0x0000000000200000n;
const RIGHTS_FD_FILESTAT_SET_SIZE = 0x0000000000400000n;

const RIGHTS_ALL = 0x1fffffffn;
const RIGHTS_DIR_BASE =
  RIGHTS_FD_READ |
  RIGHTS_FD_READDIR |
  RIGHTS_PATH_OPEN |
  RIGHTS_PATH_CREATE_DIRECTORY |
  RIGHTS_PATH_CREATE_FILE |
  RIGHTS_PATH_UNLINK_FILE |
  RIGHTS_PATH_REMOVE_DIRECTORY |
  RIGHTS_PATH_RENAME_SOURCE |
  RIGHTS_PATH_RENAME_TARGET |
  RIGHTS_PATH_FILESTAT_GET |
  RIGHTS_PATH_SYMLINK |
  RIGHTS_PATH_READLINK |
  RIGHTS_FD_FILESTAT_GET;
const RIGHTS_FILE_BASE =
  RIGHTS_FD_READ |
  RIGHTS_FD_WRITE |
  RIGHTS_FD_SEEK |
  RIGHTS_FD_TELL |
  RIGHTS_FD_FILESTAT_GET |
  RIGHTS_FD_FILESTAT_SET_SIZE;

const EVENTTYPE_CLOCK = 0;
const EVENTTYPE_FD_READ = 1;
const EVENTTYPE_FD_WRITE = 2;

/* ------------------------------------------------------------------ */
/*  Filesystem interface (subset of our MemoryVolume / fs bridge)     */
/* ------------------------------------------------------------------ */

interface WasiFileStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
  atimeMs: number;
  ctimeMs: number;
  ino?: number;
  nlink?: number;
}

interface WasiFS {
  readFileSync(p: string): Uint8Array;
  writeFileSync(p: string, data: string | Uint8Array): void;
  mkdirSync(p: string, options?: { recursive?: boolean }): void;
  statSync(p: string): WasiFileStat;
  readdirSync(p: string): string[];
  unlinkSync(p: string): void;
  rmdirSync(p: string): void;
  renameSync(from: string, to: string): void;
  existsSync(p: string): boolean;
  symlinkSync?(target: string, linkPath: string): void;
  readlinkSync?(p: string): string;
}

/* ------------------------------------------------------------------ */
/*  File descriptor table                                             */
/* ------------------------------------------------------------------ */

const enum FdKind {
  Stdin,
  Stdout,
  Stderr,
  PreopenDir,
  File,
}

interface FdEntry {
  kind: FdKind;
  path: string; // real path (for dirs and files)
  rights: bigint;
  // file-specific
  data?: Uint8Array;
  offset?: number;
  dirty?: boolean; // needs flush on close
  flags?: number; // O_APPEND etc
}

/* ------------------------------------------------------------------ */
/*  ExitStatus                                                         */
/* ---------------------------------------------------------------- */
export class ExitStatus extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`WASI exit(${code})`);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/*  syscall wrapper                                                    */
/* ---------------------------------------------------------------- */
function syscall(target: Function): Function {
  return function (this: unknown, ...args: unknown[]): number {
    try {
      return target.apply(this, args);
    } catch (err: any) {
      if (err instanceof ExitStatus) throw err;
      // map common fs errors to WASI errno
      const code = err?.code;
      if (code === "ENOENT") return ERRNO_NOENT;
      if (code === "EEXIST") return ERRNO_EXIST;
      if (code === "EISDIR") return ERRNO_ISDIR;
      if (code === "ENOTDIR") return ERRNO_NOTDIR;
      if (code === "ENOTEMPTY") return ERRNO_NOTEMPTY;
      if (code === "EACCES" || code === "EPERM") return ERRNO_ACCES;
      return ERRNO_IO;
    }
  };
}

/*  Path helpers */

function joinPath(base: string, rel: string): string {
  if (rel.startsWith("/")) return normalizePath(rel);
  const combined = base.endsWith("/") ? base + rel : base + "/" + rel;
  return normalizePath(combined);
}

function normalizePath(p: string): string {
  const parts = p.split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return "/" + out.join("/");
}

/*  Text encoder / decoder (cached)*/
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/*  WASI class (matches Nodejs `wasi` module API) */

export interface WASIOptions {
  version?: "preview1" | "unstable";
  args?: string[];
  env?: Record<string, string>;
  preopens?: Record<string, string>;
  returnOnExit?: boolean;
  stdin?: number;
  stdout?: number;
  stderr?: number;
  // extensions for our environment
  fs?: WasiFS;
}

export interface WASI {
  readonly wasiImport: Record<string, Function>;
  start(instance: object): number;
  initialize(instance: object): void;
  getImportObject(): Record<string, Record<string, Function>>;
}

interface WASIConstructor {
  new (options?: WASIOptions): WASI;
  (this: any, options?: WASIOptions): void;
  prototype: any;
}

export const WASI = function WASI(this: any, options?: WASIOptions) {
  if (!(this instanceof WASI)) {
    throw new TypeError(
      "Class constructor WASI cannot be invoked without 'new'",
    );
  }

  const opts = options ?? {};
  const args = opts.args ?? [];
  const envVars = opts.env ?? {};
  const preopens = opts.preopens ?? {};
  const returnOnExit = opts.returnOnExit ?? false;
  const fs = opts.fs ?? null;

  /* file descriptor table */

  const fds = new Map<number, FdEntry>();
  let nextFd = 3;

  // fd 0 = stdin, fd 1 = stdout, fd 2 = stderr
  fds.set(0, { kind: FdKind.Stdin, path: "", rights: RIGHTS_FD_READ });
  fds.set(1, { kind: FdKind.Stdout, path: "", rights: RIGHTS_FD_WRITE });
  fds.set(2, { kind: FdKind.Stderr, path: "", rights: RIGHTS_FD_WRITE });

  // preopened directories
  const preopenEntries: Array<{
    fd: number;
    virtualPath: string;
    realPath: string;
  }> = [];
  for (const [virtualPath, realPath] of Object.entries(preopens)) {
    const fd = nextFd++;
    fds.set(fd, {
      kind: FdKind.PreopenDir,
      path: realPath,
      rights: RIGHTS_DIR_BASE,
    });
    preopenEntries.push({ fd, virtualPath, realPath });
  }

  /* wasm memory ref */

  let memory: WebAssembly.Memory | null = null;
  let instance: WebAssembly.Instance | null = null;

  const getMemory = (): WebAssembly.Memory => {
    if (memory) return memory;
    if (instance) {
      memory = instance.exports.memory as WebAssembly.Memory;
      if (memory) return memory;
    }
    throw new Error("WASI: WebAssembly.Memory not available");
  };

  const view = () => new DataView(getMemory().buffer);
  const bytes = () => new Uint8Array(getMemory().buffer);

  /* stdout / stderr text buffers */

  let stdoutBuf = "";
  let stderrBuf = "";

  const flushLine = (fd: number, buf: string): string => {
    const nl = buf.lastIndexOf("\n");
    if (nl < 0) return buf;
    const lines = buf.substring(0, nl);
    if (fd === 1) console.log(lines);
    else console.error(lines);
    return buf.substring(nl + 1);
  };

  /* helpers */

  const readString = (ptr: number, len: number): string => {
    return decoder.decode(new Uint8Array(getMemory().buffer, ptr, len));
  };

  const writeString = (ptr: number, str: string): number => {
    const encoded = encoder.encode(str + "\0");
    bytes().set(encoded, ptr);
    return encoded.length;
  };

  const flushFile = (entry: FdEntry): void => {
    if (entry.dirty && fs && entry.path && entry.data) {
      fs.writeFileSync(entry.path, entry.data);
      entry.dirty = false;
    }
  };

  /* Build the wasi_snapshot_preview1 import object */
  const wasiImport: Record<string, Function> = {
    /* args */
    args_get: syscall((argv_ptr: number, argv_buf_ptr: number): number => {
      const dv = view();
      const mem = bytes();
      for (const arg of args) {
        dv.setUint32(argv_ptr, argv_buf_ptr, true);
        argv_ptr += 4;
        const encoded = encoder.encode(arg + "\0");
        mem.set(encoded, argv_buf_ptr);
        argv_buf_ptr += encoded.length;
      }
      return ERRNO_SUCCESS;
    }),

    args_sizes_get: syscall(
      (argc_out: number, argv_buf_size_out: number): number => {
        const dv = view();
        dv.setUint32(argc_out, args.length, true);
        let bufSize = 0;
        for (const arg of args) bufSize += encoder.encode(arg + "\0").length;
        dv.setUint32(argv_buf_size_out, bufSize, true);
        return ERRNO_SUCCESS;
      },
    ),

    /* environ */

    environ_get: syscall(
      (environ_ptr: number, environ_buf_ptr: number): number => {
        const entries = Object.entries(envVars);
        const dv = view();
        const mem = bytes();
        for (const [key, value] of entries) {
          dv.setUint32(environ_ptr, environ_buf_ptr, true);
          environ_ptr += 4;
          const encoded = encoder.encode(`${key}=${value}\0`);
          mem.set(encoded, environ_buf_ptr);
          environ_buf_ptr += encoded.length;
        }
        return ERRNO_SUCCESS;
      },
    ),

    environ_sizes_get: syscall(
      (environc_out: number, environ_buf_size_out: number): number => {
        const entries = Object.entries(envVars);
        const dv = view();
        dv.setUint32(environc_out, entries.length, true);
        let bufSize = 0;
        for (const [key, value] of entries)
          bufSize += encoder.encode(`${key}=${value}\0`).length;
        dv.setUint32(environ_buf_size_out, bufSize, true);
        return ERRNO_SUCCESS;
      },
    ),

    /* clock */

    clock_res_get: syscall((id: number, resolution_out: number): number => {
      const dv = view();
      switch (id) {
        case CLOCKID_REALTIME:
          dv.setBigUint64(resolution_out, BigInt(1e6), true);
          break;
        case CLOCKID_MONOTONIC:
        case CLOCKID_PROCESS_CPUTIME_ID:
        case CLOCKID_THREAD_CPUTIME_ID:
          dv.setBigUint64(resolution_out, BigInt(1e3), true);
          break;
        default:
          return ERRNO_INVAL;
      }
      return ERRNO_SUCCESS;
    }),

    clock_time_get: syscall(
      (id: number, _precision: bigint, time_out: number): number => {
        const dv = view();
        switch (id) {
          case CLOCKID_REALTIME: {
            const time = BigInt(Date.now()) * BigInt(1e6);
            dv.setBigUint64(time_out, time, true);
            break;
          }
          case CLOCKID_MONOTONIC:
          case CLOCKID_PROCESS_CPUTIME_ID:
          case CLOCKID_THREAD_CPUTIME_ID: {
            const t = performance.now();
            const s = Math.trunc(t);
            const ms = Math.floor((t - s) * 1e3);
            const time = BigInt(s) * BigInt(1e9) + BigInt(ms) * BigInt(1e6);
            dv.setBigUint64(time_out, time, true);
            break;
          }
          default:
            return ERRNO_INVAL;
        }
        return ERRNO_SUCCESS;
      },
    ),

    /* ---- fd operations ------------------------------------------- */

    fd_advise: syscall(
      (_fd: number, _offset: bigint, _len: bigint, _advice: number): number => {
        return ERRNO_SUCCESS; // advisory, can be a no-op
      },
    ),

    fd_allocate: syscall(
      (_fd: number, _offset: bigint, _len: bigint): number => {
        return ERRNO_NOSYS;
      },
    ),

    fd_close: syscall((fd: number): number => {
      const entry = fds.get(fd);
      if (!entry) return ERRNO_BADF;
      if (entry.kind === FdKind.File) flushFile(entry);
      fds.delete(fd);
      return ERRNO_SUCCESS;
    }),

    fd_datasync: syscall((fd: number): number => {
      const entry = fds.get(fd);
      if (!entry) return ERRNO_BADF;
      if (entry.kind === FdKind.File) flushFile(entry);
      return ERRNO_SUCCESS;
    }),

    fd_fdstat_get: syscall((fd: number, stat_out: number): number => {
      const entry = fds.get(fd);
      if (!entry) return ERRNO_BADF;
      const dv = view();

      let filetype = FILETYPE_UNKNOWN;
      let fdflags = 0;
      let rightsBase = entry.rights;
      let rightsInheriting = 0n;

      switch (entry.kind) {
        case FdKind.Stdin:
        case FdKind.Stdout:
        case FdKind.Stderr:
          filetype = FILETYPE_UNKNOWN; // character device, but WASI doesnt have that in snapshot1 for this
          break;
        case FdKind.PreopenDir:
          filetype = FILETYPE_DIRECTORY;
          rightsInheriting = RIGHTS_ALL;
          break;
        case FdKind.File:
          filetype = FILETYPE_REGULAR_FILE;
          if (entry.flags && entry.flags & FDFLAGS_APPEND)
            fdflags |= FDFLAGS_APPEND;
          break;
      }

      // fdstat layout: u8 filetype, u16 fdflags, u64 rights_base, u64 rights_inheriting
      dv.setUint8(stat_out, filetype);
      dv.setUint16(stat_out + 2, fdflags, true);
      dv.setBigUint64(stat_out + 8, rightsBase, true);
      dv.setBigUint64(stat_out + 16, rightsInheriting, true);
      return ERRNO_SUCCESS;
    }),

    fd_fdstat_set_flags: syscall((_fd: number, _flags: number): number => {
      return ERRNO_NOSYS;
    }),

    fd_fdstat_set_rights: syscall(
      (
        _fd: number,
        _rights_base: bigint,
        _rights_inheriting: bigint,
      ): number => {
        return ERRNO_NOSYS;
      },
    ),

    fd_filestat_get: syscall((fd: number, buf_out: number): number => {
      const entry = fds.get(fd);
      if (!entry) return ERRNO_BADF;

      const dv = view();
      let size = 0n;
      let filetype = FILETYPE_UNKNOWN;
      let mtimeNs = 0n;
      let atimeNs = 0n;
      let ctimeNs = 0n;
      let ino = 0n;
      let nlink = 1n;

      if (entry.kind === FdKind.File) {
        size = BigInt(entry.data ? entry.data.length : 0);
        filetype = FILETYPE_REGULAR_FILE;
        if (fs && entry.path) {
          try {
            const stat = fs.statSync(entry.path);
            mtimeNs = BigInt(Math.floor(stat.mtimeMs)) * BigInt(1e6);
            atimeNs = BigInt(Math.floor(stat.atimeMs)) * BigInt(1e6);
            ctimeNs = BigInt(Math.floor(stat.ctimeMs)) * BigInt(1e6);
            if (stat.ino) ino = BigInt(stat.ino);
            if (stat.nlink) nlink = BigInt(stat.nlink);
          } catch {
            /* ignore */
          }
        }
      } else if (entry.kind === FdKind.PreopenDir) {
        filetype = FILETYPE_DIRECTORY;
      }

      // filestat layout: u64 dev, u64 ino, u8 filetype (at +16), u64 nlink, u64 size,
      //                  u64 atim, u64 mtim, u64 ctim
      dv.setBigUint64(buf_out, 0n, true); // dev
      dv.setBigUint64(buf_out + 8, ino, true); // ino
      dv.setUint8(buf_out + 16, filetype); // filetype
      dv.setBigUint64(buf_out + 24, nlink, true); // nlink
      dv.setBigUint64(buf_out + 32, size, true); // size
      dv.setBigUint64(buf_out + 40, atimeNs, true);
      dv.setBigUint64(buf_out + 48, mtimeNs, true);
      dv.setBigUint64(buf_out + 56, ctimeNs, true);
      return ERRNO_SUCCESS;
    }),

    fd_filestat_set_size: syscall((fd: number, size: bigint): number => {
      const entry = fds.get(fd);
      if (!entry || entry.kind !== FdKind.File) return ERRNO_BADF;
      const newSize = Number(size);
      if (!entry.data) {
        entry.data = new Uint8Array(newSize);
      } else if (entry.data.length !== newSize) {
        const newData = new Uint8Array(newSize);
        newData.set(
          entry.data.subarray(0, Math.min(entry.data.length, newSize)),
        );
        entry.data = newData;
      }
      entry.dirty = true;
      return ERRNO_SUCCESS;
    }),

    fd_filestat_set_times: syscall(
      (
        _fd: number,
        _atim: bigint,
        _mtim: bigint,
        _fst_flags: number,
      ): number => {
        return ERRNO_SUCCESS; // no-op, our MemoryVolume auto timestamps
      },
    ),

    fd_pread: syscall(
      (
        fd: number,
        iovs_ptr: number,
        iovs_len: number,
        offset: bigint,
        nread_out: number,
      ): number => {
        const entry = fds.get(fd);
        if (!entry || entry.kind !== FdKind.File) return ERRNO_BADF;
        if (!entry.data) {
          view().setUint32(nread_out, 0, true);
          return ERRNO_SUCCESS;
        }

        const dv = view();
        let pos = Number(offset);
        let totalRead = 0;

        for (let i = 0; i < iovs_len; i++) {
          const bufPtr = dv.getUint32(iovs_ptr + i * 8, true);
          const bufLen = dv.getUint32(iovs_ptr + i * 8 + 4, true);
          const toRead = Math.min(bufLen, entry.data.length - pos);
          if (toRead <= 0) break;
          bytes().set(entry.data.subarray(pos, pos + toRead), bufPtr);
          pos += toRead;
          totalRead += toRead;
        }

        dv.setUint32(nread_out, totalRead, true);
        return ERRNO_SUCCESS;
      },
    ),

    fd_prestat_get: syscall((fd: number, buf_out: number): number => {
      const entry = fds.get(fd);
      if (!entry || entry.kind !== FdKind.PreopenDir) return ERRNO_BADF;

      const preopen = preopenEntries.find((p) => p.fd === fd);
      if (!preopen) return ERRNO_BADF;

      const dv = view();
      const nameLen = encoder.encode(preopen.virtualPath).length;
      // prestat: u8 type (0 = dir), then u32 name_len at +4
      dv.setUint8(buf_out, PREOPENTYPE_DIR);
      dv.setUint32(buf_out + 4, nameLen, true);
      return ERRNO_SUCCESS;
    }),

    fd_prestat_dir_name: syscall(
      (fd: number, path_ptr: number, path_len: number): number => {
        const entry = fds.get(fd);
        if (!entry || entry.kind !== FdKind.PreopenDir) return ERRNO_BADF;

        const preopen = preopenEntries.find((p) => p.fd === fd);
        if (!preopen) return ERRNO_BADF;

        const encoded = encoder.encode(preopen.virtualPath);
        const toCopy = Math.min(encoded.length, path_len);
        bytes().set(encoded.subarray(0, toCopy), path_ptr);
        return ERRNO_SUCCESS;
      },
    ),

    fd_pwrite: syscall(
      (
        fd: number,
        iovs_ptr: number,
        iovs_len: number,
        offset: bigint,
        nwritten_out: number,
      ): number => {
        const entry = fds.get(fd);
        if (!entry || entry.kind !== FdKind.File) return ERRNO_BADF;

        const dv = view();
        let pos = Number(offset);
        let totalWritten = 0;

        for (let i = 0; i < iovs_len; i++) {
          const bufPtr = dv.getUint32(iovs_ptr + i * 8, true);
          const bufLen = dv.getUint32(iovs_ptr + i * 8 + 4, true);
          const chunk = new Uint8Array(getMemory().buffer, bufPtr, bufLen);

          // grow data if needed
          const needed = pos + bufLen;
          if (!entry.data || entry.data.length < needed) {
            const newData = new Uint8Array(needed);
            if (entry.data) newData.set(entry.data);
            entry.data = newData;
          }
          entry.data.set(chunk, pos);
          pos += bufLen;
          totalWritten += bufLen;
        }

        entry.dirty = true;
        dv.setUint32(nwritten_out, totalWritten, true);
        return ERRNO_SUCCESS;
      },
    ),

    fd_read: syscall(
      (
        fd: number,
        iovs_ptr: number,
        iovs_len: number,
        nread_out: number,
      ): number => {
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;

        const dv = view();

        if (entry.kind === FdKind.Stdin) {
          // stdin - no interactive input in browser, return 0 bytes (EOF)
          dv.setUint32(nread_out, 0, true);
          return ERRNO_SUCCESS;
        }

        if (entry.kind !== FdKind.File) return ERRNO_BADF;
        if (!entry.data) {
          dv.setUint32(nread_out, 0, true);
          return ERRNO_SUCCESS;
        }

        let totalRead = 0;
        let pos = entry.offset ?? 0;

        for (let i = 0; i < iovs_len; i++) {
          const bufPtr = dv.getUint32(iovs_ptr + i * 8, true);
          const bufLen = dv.getUint32(iovs_ptr + i * 8 + 4, true);
          const toRead = Math.min(bufLen, entry.data.length - pos);
          if (toRead <= 0) break;
          bytes().set(entry.data.subarray(pos, pos + toRead), bufPtr);
          pos += toRead;
          totalRead += toRead;
        }

        entry.offset = pos;
        dv.setUint32(nread_out, totalRead, true);
        return ERRNO_SUCCESS;
      },
    ),

    fd_readdir: syscall(
      (
        fd: number,
        buf_ptr: number,
        buf_len: number,
        cookie: bigint,
        bufused_out: number,
      ): number => {
        const entry = fds.get(fd);
        if (
          !entry ||
          (entry.kind !== FdKind.PreopenDir && entry.kind !== FdKind.File)
        )
          return ERRNO_BADF;
        if (!fs) return ERRNO_NOSYS;

        let entries: string[];
        try {
          entries = fs.readdirSync(entry.path);
        } catch {
          return ERRNO_IO;
        }

        const dv = view();
        const mem = bytes();
        let offset = buf_ptr;
        const end = buf_ptr + buf_len;
        let idx = 0;
        const start = Number(cookie);

        for (let i = start; i < entries.length; i++) {
          const name = entries[i];
          const nameBytes = encoder.encode(name);

          // dirent: u64 d_next, u64 d_ino, u32 d_namlen, u8 d_type, then name
          const direntSize = 24 + nameBytes.length;
          if (offset + 24 > end) break; // not enough space for header

          dv.setBigUint64(offset, BigInt(i + 1), true); // d_next
          dv.setBigUint64(offset + 8, BigInt(i + 1), true); // d_ino (fake)

          dv.setUint32(offset + 16, nameBytes.length, true); // d_namlen

          // determine type
          let dtype = FILETYPE_REGULAR_FILE;
          try {
            const st = fs.statSync(joinPath(entry.path, name));
            if (st.isDirectory()) dtype = FILETYPE_DIRECTORY;
            else if (st.isSymbolicLink()) dtype = FILETYPE_SYMBOLIC_LINK;
          } catch {
            /* default to regular */
          }
          dv.setUint8(offset + 20, dtype); // d_type

          // write name (may be partial if buf too small)
          const nameCopy = Math.min(nameBytes.length, end - (offset + 24));
          if (nameCopy > 0)
            mem.set(nameBytes.subarray(0, nameCopy), offset + 24);

          offset += 24 + nameCopy;
          idx++;
        }

        dv.setUint32(bufused_out, offset - buf_ptr, true);
        return ERRNO_SUCCESS;
      },
    ),

    fd_renumber: syscall((fd: number, to: number): number => {
      const entry = fds.get(fd);
      if (!entry) return ERRNO_BADF;
      if (fds.has(to)) {
        const toEntry = fds.get(to)!;
        if (toEntry.kind === FdKind.File) flushFile(toEntry);
      }
      fds.set(to, entry);
      fds.delete(fd);
      return ERRNO_SUCCESS;
    }),

    fd_seek: syscall(
      (
        fd: number,
        offset: bigint,
        whence: number,
        newoffset_out: number,
      ): number => {
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;

        if (
          entry.kind === FdKind.Stdin ||
          entry.kind === FdKind.Stdout ||
          entry.kind === FdKind.Stderr
        ) {
          return ERRNO_SPIPE;
        }
        if (entry.kind === FdKind.PreopenDir) return ERRNO_BADF;

        const dataLen = entry.data ? entry.data.length : 0;
        let pos = entry.offset ?? 0;
        const off = Number(offset);

        switch (whence) {
          case WHENCE_SET:
            pos = off;
            break;
          case WHENCE_CUR:
            pos += off;
            break;
          case WHENCE_END:
            pos = dataLen + off;
            break;
          default:
            return ERRNO_INVAL;
        }

        if (pos < 0) pos = 0;
        entry.offset = pos;
        view().setBigUint64(newoffset_out, BigInt(pos), true);
        return ERRNO_SUCCESS;
      },
    ),

    fd_sync: syscall((fd: number): number => {
      const entry = fds.get(fd);
      if (!entry) return ERRNO_BADF;
      if (entry.kind === FdKind.File) flushFile(entry);
      return ERRNO_SUCCESS;
    }),

    fd_tell: syscall((fd: number, offset_out: number): number => {
      const entry = fds.get(fd);
      if (!entry || entry.kind !== FdKind.File) return ERRNO_BADF;
      view().setBigUint64(offset_out, BigInt(entry.offset ?? 0), true);
      return ERRNO_SUCCESS;
    }),

    fd_write: syscall(
      (
        fd: number,
        iovs_ptr: number,
        iovs_len: number,
        nwritten_out: number,
      ): number => {
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;

        const dv = view();

        // stdout / stderr
        if (entry.kind === FdKind.Stdout || entry.kind === FdKind.Stderr) {
          let totalWritten = 0;
          for (let i = 0; i < iovs_len; i++) {
            const bufPtr = dv.getUint32(iovs_ptr + i * 8, true);
            const bufLen = dv.getUint32(iovs_ptr + i * 8 + 4, true);
            const data = new Uint8Array(getMemory().buffer, bufPtr, bufLen);
            const text = decoder.decode(data);
            if (entry.kind === FdKind.Stdout) {
              stdoutBuf += text;
              stdoutBuf = flushLine(1, stdoutBuf);
            } else {
              stderrBuf += text;
              stderrBuf = flushLine(2, stderrBuf);
            }
            totalWritten += bufLen;
          }
          dv.setUint32(nwritten_out, totalWritten, true);
          return ERRNO_SUCCESS;
        }

        if (entry.kind !== FdKind.File) return ERRNO_BADF;

        let totalWritten = 0;
        let pos =
          entry.flags && entry.flags & FDFLAGS_APPEND
            ? entry.data
              ? entry.data.length
              : 0
            : (entry.offset ?? 0);

        for (let i = 0; i < iovs_len; i++) {
          const bufPtr = dv.getUint32(iovs_ptr + i * 8, true);
          const bufLen = dv.getUint32(iovs_ptr + i * 8 + 4, true);
          const chunk = new Uint8Array(getMemory().buffer, bufPtr, bufLen);

          const needed = pos + bufLen;
          if (!entry.data || entry.data.length < needed) {
            const newData = new Uint8Array(needed);
            if (entry.data) newData.set(entry.data);
            entry.data = newData;
          }
          entry.data.set(chunk, pos);
          pos += bufLen;
          totalWritten += bufLen;
        }

        entry.offset = pos;
        entry.dirty = true;
        dv.setUint32(nwritten_out, totalWritten, true);
        return ERRNO_SUCCESS;
      },
    ),

    /* path operations */

    path_create_directory: syscall(
      (fd: number, path_ptr: number, path_len: number): number => {
        if (!fs) return ERRNO_NOSYS;
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;
        const rel = readString(path_ptr, path_len);
        const fullPath = joinPath(entry.path, rel);
        fs.mkdirSync(fullPath, { recursive: true });
        return ERRNO_SUCCESS;
      },
    ),

    path_filestat_get: syscall(
      (
        fd: number,
        _flags: number,
        path_ptr: number,
        path_len: number,
        buf_out: number,
      ): number => {
        if (!fs) return ERRNO_NOSYS;
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;
        const rel = readString(path_ptr, path_len);
        const fullPath = joinPath(entry.path, rel);

        const stat = fs.statSync(fullPath);
        const dv = view();

        let filetype = FILETYPE_REGULAR_FILE;
        if (stat.isDirectory()) filetype = FILETYPE_DIRECTORY;
        else if (stat.isSymbolicLink()) filetype = FILETYPE_SYMBOLIC_LINK;

        const mtimeNs = BigInt(Math.floor(stat.mtimeMs)) * BigInt(1e6);
        const atimeNs = BigInt(Math.floor(stat.atimeMs)) * BigInt(1e6);
        const ctimeNs = BigInt(Math.floor(stat.ctimeMs)) * BigInt(1e6);

        dv.setBigUint64(buf_out, 0n, true); // dev
        dv.setBigUint64(buf_out + 8, BigInt(stat.ino ?? 0), true); // ino
        dv.setUint8(buf_out + 16, filetype); // filetype
        dv.setBigUint64(buf_out + 24, BigInt(stat.nlink ?? 1), true);
        dv.setBigUint64(buf_out + 32, BigInt(stat.size), true);
        dv.setBigUint64(buf_out + 40, atimeNs, true);
        dv.setBigUint64(buf_out + 48, mtimeNs, true);
        dv.setBigUint64(buf_out + 56, ctimeNs, true);
        return ERRNO_SUCCESS;
      },
    ),

    path_filestat_set_times: syscall(
      (
        _fd: number,
        _flags: number,
        _path_ptr: number,
        _path_len: number,
        _atim: bigint,
        _mtim: bigint,
        _fst_flags: number,
      ): number => {
        return ERRNO_SUCCESS; // no-op
      },
    ),

    path_link: syscall(
      (
        _old_fd: number,
        _old_flags: number,
        _old_path_ptr: number,
        _old_path_len: number,
        _new_fd: number,
        _new_path_ptr: number,
        _new_path_len: number,
      ): number => {
        return ERRNO_NOSYS;
      },
    ),

    path_open: syscall(
      (
        fd: number,
        _dirflags: number,
        path_ptr: number,
        path_len: number,
        oflags: number,
        _fs_rights_base: bigint,
        _fs_rights_inheriting: bigint,
        fdflags: number,
        opened_fd_out: number,
      ): number => {
        if (!fs) return ERRNO_NOSYS;
        const dirEntry = fds.get(fd);
        if (!dirEntry) return ERRNO_BADF;

        const rel = readString(path_ptr, path_len);
        const fullPath = joinPath(dirEntry.path, rel);

        const wantDir = (oflags & OFLAGS_DIRECTORY) !== 0;
        const wantCreate = (oflags & OFLAGS_CREAT) !== 0;
        const wantExcl = (oflags & OFLAGS_EXCL) !== 0;
        const wantTrunc = (oflags & OFLAGS_TRUNC) !== 0;

        let exists = fs.existsSync(fullPath);

        if (wantExcl && exists) return ERRNO_EXIST;

        if (wantDir) {
          if (!exists) {
            if (wantCreate) {
              fs.mkdirSync(fullPath, { recursive: true });
            } else {
              return ERRNO_NOENT;
            }
          }
          // open directory fd
          const newFd = nextFd++;
          fds.set(newFd, {
            kind: FdKind.PreopenDir,
            path: fullPath,
            rights: RIGHTS_DIR_BASE,
          });
          view().setUint32(opened_fd_out, newFd, true);
          return ERRNO_SUCCESS;
        }

        // regular file
        let data: Uint8Array;
        if (exists && !wantTrunc) {
          data = fs.readFileSync(fullPath);
          // make a copy so mutations dont affect the volume until flush
          const copy = new Uint8Array(data.length);
          copy.set(data);
          data = copy;
        } else if (wantCreate || wantTrunc) {
          if (!exists) {
            fs.writeFileSync(fullPath, new Uint8Array(0));
          }
          data = new Uint8Array(0);
        } else {
          if (!exists) return ERRNO_NOENT;
          data = fs.readFileSync(fullPath);
          const copy = new Uint8Array(data.length);
          copy.set(data);
          data = copy;
        }

        const newFd = nextFd++;
        fds.set(newFd, {
          kind: FdKind.File,
          path: fullPath,
          rights: RIGHTS_FILE_BASE,
          data,
          offset: 0,
          dirty: false,
          flags: fdflags,
        });
        view().setUint32(opened_fd_out, newFd, true);
        return ERRNO_SUCCESS;
      },
    ),

    path_readlink: syscall(
      (
        fd: number,
        path_ptr: number,
        path_len: number,
        buf_ptr: number,
        buf_len: number,
        bufused_out: number,
      ): number => {
        if (!fs || !fs.readlinkSync) return ERRNO_NOSYS;
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;
        const rel = readString(path_ptr, path_len);
        const fullPath = joinPath(entry.path, rel);
        const target = fs.readlinkSync(fullPath);
        const encoded = encoder.encode(target);
        const toCopy = Math.min(encoded.length, buf_len);
        bytes().set(encoded.subarray(0, toCopy), buf_ptr);
        view().setUint32(bufused_out, toCopy, true);
        return ERRNO_SUCCESS;
      },
    ),

    path_remove_directory: syscall(
      (fd: number, path_ptr: number, path_len: number): number => {
        if (!fs) return ERRNO_NOSYS;
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;
        const rel = readString(path_ptr, path_len);
        const fullPath = joinPath(entry.path, rel);
        fs.rmdirSync(fullPath);
        return ERRNO_SUCCESS;
      },
    ),

    path_rename: syscall(
      (
        fd: number,
        old_path_ptr: number,
        old_path_len: number,
        new_fd: number,
        new_path_ptr: number,
        new_path_len: number,
      ): number => {
        if (!fs) return ERRNO_NOSYS;
        const oldEntry = fds.get(fd);
        const newEntry = fds.get(new_fd);
        if (!oldEntry || !newEntry) return ERRNO_BADF;
        const oldRel = readString(old_path_ptr, old_path_len);
        const newRel = readString(new_path_ptr, new_path_len);
        const oldPath = joinPath(oldEntry.path, oldRel);
        const newPath = joinPath(newEntry.path, newRel);
        fs.renameSync(oldPath, newPath);
        return ERRNO_SUCCESS;
      },
    ),

    path_symlink: syscall(
      (
        old_path_ptr: number,
        old_path_len: number,
        fd: number,
        new_path_ptr: number,
        new_path_len: number,
      ): number => {
        if (!fs || !fs.symlinkSync) return ERRNO_NOSYS;
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;
        const target = readString(old_path_ptr, old_path_len);
        const linkRel = readString(new_path_ptr, new_path_len);
        const linkPath = joinPath(entry.path, linkRel);
        fs.symlinkSync(target, linkPath);
        return ERRNO_SUCCESS;
      },
    ),

    path_unlink_file: syscall(
      (fd: number, path_ptr: number, path_len: number): number => {
        if (!fs) return ERRNO_NOSYS;
        const entry = fds.get(fd);
        if (!entry) return ERRNO_BADF;
        const rel = readString(path_ptr, path_len);
        const fullPath = joinPath(entry.path, rel);
        fs.unlinkSync(fullPath);
        return ERRNO_SUCCESS;
      },
    ),

    /* ---- misc ---------------------------------------------------- */

    poll_oneoff: syscall(
      (
        in_ptr: number,
        out_ptr: number,
        nsubscriptions: number,
        nevents_out: number,
      ): number => {
        // uhm this is a very minimal implementation: handle clock subscriptions as immediate,
        // report all fd subscriptions as ready
        const dv = view();
        let nevents = 0;

        for (let i = 0; i < nsubscriptions; i++) {
          const subPtr = in_ptr + i * 48;
          const eventPtr = out_ptr + nevents * 32;

          const userdata = dv.getBigUint64(subPtr, true);
          const eventType = dv.getUint8(subPtr + 8);

          dv.setBigUint64(eventPtr, userdata, true); // userdata
          dv.setUint16(eventPtr + 8, ERRNO_SUCCESS, true); // error
          dv.setUint8(eventPtr + 10, eventType); // type

          if (
            eventType === EVENTTYPE_FD_READ ||
            eventType === EVENTTYPE_FD_WRITE
          ) {
            // report some available bytes
            dv.setBigUint64(eventPtr + 16, BigInt(1), true); // nbytes
            dv.setUint16(eventPtr + 24, 0, true); // flags
          }

          nevents++;
        }

        dv.setUint32(nevents_out, nevents, true);
        return ERRNO_SUCCESS;
      },
    ),

    proc_exit: syscall((rval: number): never => {
      // flush remaining output
      if (stdoutBuf) {
        console.log(stdoutBuf);
        stdoutBuf = "";
      }
      if (stderrBuf) {
        console.error(stderrBuf);
        stderrBuf = "";
      }
      throw new ExitStatus(rval);
    }),

    proc_raise: syscall((_sig: number): number => {
      return ERRNO_NOSYS;
    }),

    sched_yield: syscall((): number => {
      return ERRNO_SUCCESS;
    }),

    random_get: syscall((buf_ptr: number, buf_len: number): number => {
      const slice = new Uint8Array(getMemory().buffer, buf_ptr, buf_len);
      crypto.getRandomValues(slice);
      return ERRNO_SUCCESS;
    }),

    sock_recv: syscall((): number => ERRNO_NOSYS),
    sock_send: syscall((): number => ERRNO_NOSYS),
    sock_shutdown: syscall((): number => ERRNO_NOSYS),
    sock_accept: syscall((): number => ERRNO_NOSYS),
  };

  /* public api */

  const self: any = this;
  self.wasiImport = wasiImport;

  self.start = function start(wasmInstance: any): number {
    instance = wasmInstance;
    memory = wasmInstance.exports.memory as WebAssembly.Memory;

    const _start = wasmInstance.exports._start;
    if (typeof _start !== "function") {
      throw new Error("WASI: instance has no _start export");
    }

    try {
      _start();
    } catch (err) {
      if (err instanceof ExitStatus) {
        if (returnOnExit) return err.code;
        throw err;
      }
      throw err;
    } finally {
      // flush remaining output
      if (stdoutBuf) {
        console.log(stdoutBuf);
        stdoutBuf = "";
      }
      if (stderrBuf) {
        console.error(stderrBuf);
        stderrBuf = "";
      }
    }
    return 0;
  };

  self.initialize = function initialize(wasmInstance: any): void {
    instance = wasmInstance;
    memory = wasmInstance.exports.memory as WebAssembly.Memory;

    const _initialize = wasmInstance.exports._initialize;
    if (typeof _initialize === "function") {
      _initialize();
    }
  };

  self.getImportObject = function getImportObject(): Record<
    string,
    Record<string, Function>
  > {
    return { wasi_snapshot_preview1: wasiImport };
  };
} as unknown as WASIConstructor;

/*  matches Node.js `require('wasi')` */
export default {
  WASI,
};
