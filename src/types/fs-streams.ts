// Types for fs ReadStream/WriteStream. These are old-style function constructors
// (not classes) because graceful-fs uses .apply(this, arguments) which breaks classes.

/* ---- ReadableState ---- */

export interface FsReadableState {
  readonly objectMode: boolean;
  readonly highWaterMark: number;
  readonly ended: boolean;
  endEmitted: boolean;
  flowing: boolean | null;
  readonly reading: boolean;
  readonly length: number;
  readonly destroyed: boolean;
  readonly errored: Error | null;
  readonly closed: boolean;
  pipes: unknown[];
  awaitDrainWriters: unknown;
  multiAwaitDrain: boolean;
  readableListening: boolean;
  resumeScheduled: boolean;
  paused: boolean;
  emitClose: boolean;
  readonly autoDestroy: boolean;
  defaultEncoding: string;
  needReadable: boolean;
  emittedReadable: boolean;
  readingMore: boolean;
  dataEmitted: boolean;
}

/* ---- WritableState ---- */

export interface FsWritableState {
  readonly objectMode: boolean;
  readonly highWaterMark: number;
  finished: boolean;
  ended: boolean;
  readonly destroyed: boolean;
  readonly errored: Error | null;
  readonly closed: boolean;
  readonly corked: number;
  readonly length: number;
  readonly needDrain: boolean;
  writing: boolean;
  errorEmitted: boolean;
  emitClose: boolean;
  readonly autoDestroy: boolean;
  defaultEncoding: string;
  finalCalled: boolean;
  ending: boolean;
  bufferedIndex: number;
}

/* ---- FsReadStream ---- */

export interface FsReadStreamInstance {
  _queue: Array<Buffer | null>;
  _active: boolean;
  _terminated: boolean;
  _endFired: boolean;
  _endEmitted: boolean;
  _objectMode: boolean;
  _reading: boolean;
  _highWaterMark: number;
  _autoDestroy: boolean;
  _encoding: string | null;
  _readableByteLength: number;
  _draining: boolean;

  readable: boolean;
  readableEnded: boolean;
  readableFlowing: boolean | null;
  destroyed: boolean;
  closed: boolean;
  errored: Error | null;
  readableObjectMode: boolean;
  readableHighWaterMark: number;
  readableDidRead: boolean;
  readableAborted: boolean;

  _readableState: FsReadableState;

  path: string;
  fd: number | null;
  flags: string;
  mode: number;
  autoClose: boolean;

  open(): void;
  _read(): void;
  close(cb?: (err?: Error | null) => void): void;

  push(chunk: unknown): boolean;
  destroy(err?: unknown): void;
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, fn: (...args: unknown[]) => void): this;
  pipe(dest: unknown): unknown;
}

/* ---- FsWriteStream ---- */

export interface FsWriteStreamInstance {
  _parts: Uint8Array[];
  _closed: boolean;
  _objectMode: boolean;
  _highWaterMark: number;
  _autoDestroy: boolean;
  _corked: number;
  _corkedWrites: Array<{ chunk: unknown; encoding: string; cb: (err?: Error | null) => void }>;
  _writableByteLength: number;

  writable: boolean;
  writableEnded: boolean;
  writableFinished: boolean;
  writableNeedDrain: boolean;
  destroyed: boolean;
  closed: boolean;
  errored: Error | null;
  writableObjectMode: boolean;
  writableHighWaterMark: number;
  writableCorked: number;

  _writableState: FsWritableState;

  path: string;
  fd: number | null;
  flags: string;
  mode: number;
  autoClose: boolean;
  bytesWritten: number;
  _chunks: Uint8Array[];
  _enc: TextEncoder;

  open(): void;
  close(cb?: (err?: Error | null) => void): void;

  destroy(err?: unknown): void;
  emit(event: string, ...args: unknown[]): boolean;
  end(chunk?: unknown, encoding?: string, cb?: () => void): void;
  write(chunk: unknown, encoding?: string, cb?: (err?: Error | null) => void): boolean;
}
