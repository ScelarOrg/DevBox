// real blocking execSync/spawnSync via SharedArrayBuffer + Atomics
// worker allocates a slot, posts spawn-sync, blocks on Atomics.wait()
// main thread runs the child, writes result to the slot, calls Atomics.notify()

import { isSharedArrayBufferAvailable } from "./shared-vfs";

// shared memory layout
// per-slot (16KB = 4096 Int32s):
//   [0] status (0=pending, 1=complete, 2=error)
//   [1] exit code
//   [2] stdout byte length
//   [3..4095] stdout data
// metadata after all slots (shared free-list + generations — no %64 reuse):
//   [FREE_HEAD] free-list head index (-1 if empty)
//   [FREE_LIST_BASE .. +MAX_SLOTS) next pointers
//   [GEN_BASE .. +MAX_SLOTS) per-slot generation counters
export const SLOT_SIZE = 4096; // 4096 Int32s = 16KB per slot
export const MAX_SLOTS = 64;
const STATUS_PENDING = 0;
const STATUS_COMPLETE = 1;
const STATUS_ERROR = 2;

const FREE_HEAD_INDEX = MAX_SLOTS * SLOT_SIZE;
const FREE_LIST_BASE = FREE_HEAD_INDEX + 1;
const GEN_BASE = FREE_LIST_BASE + MAX_SLOTS;
const META_INTS = 1 + MAX_SLOTS + MAX_SLOTS;

const DEFAULT_SYNC_BUFFER_SIZE = (MAX_SLOTS * SLOT_SIZE + META_INTS) * 4;

/** Pack slot index + generation into the opaque syncSlot handle posted to main. */
export function encodeSyncSlot(slot: number, generation: number): number {
  return ((generation & 0xffff) << 16) | (slot & 0xffff);
}

/** Unpack opaque syncSlot handle into SAB index + generation. */
export function decodeSyncSlot(handle: number): { slot: number; generation: number } {
  return {
    slot: handle & 0xffff,
    generation: (handle >>> 16) & 0xffff,
  };
}

function initFreeList(int32: Int32Array): void {
  Atomics.store(int32, FREE_HEAD_INDEX, 0);
  for (let i = 0; i < MAX_SLOTS - 1; i++) {
    Atomics.store(int32, FREE_LIST_BASE + i, i + 1);
  }
  Atomics.store(int32, FREE_LIST_BASE + MAX_SLOTS - 1, -1);
  for (let i = 0; i < MAX_SLOTS; i++) {
    Atomics.store(int32, GEN_BASE + i, 0);
    Atomics.store(int32, i * SLOT_SIZE, STATUS_PENDING);
  }
}

function generationMatches(int32: Int32Array, slot: number, generation: number): boolean {
  return (Atomics.load(int32, GEN_BASE + slot) & 0xffff) === (generation & 0xffff);
}

function releaseSlot(int32: Int32Array, slot: number): void {
  for (;;) {
    const head = Atomics.load(int32, FREE_HEAD_INDEX);
    Atomics.store(int32, FREE_LIST_BASE + slot, head);
    if (Atomics.compareExchange(int32, FREE_HEAD_INDEX, head, slot) === head) {
      Atomics.notify(int32, FREE_HEAD_INDEX);
      return;
    }
  }
}

// main thread side
export class SyncChannelController {
  private _buffer: SharedArrayBuffer;
  private _int32: Int32Array;
  private _uint8: Uint8Array;

  constructor(bufferSize: number = DEFAULT_SYNC_BUFFER_SIZE) {
    if (!isSharedArrayBufferAvailable()) {
      throw new Error("SharedArrayBuffer not available. Ensure COOP/COEP headers are set.");
    }

    const minSize = (MAX_SLOTS * SLOT_SIZE + META_INTS) * 4;
    this._buffer = new SharedArrayBuffer(Math.max(bufferSize, minSize));
    this._int32 = new Int32Array(this._buffer);
    this._uint8 = new Uint8Array(this._buffer);

    initFreeList(this._int32);
  }

  get buffer(): SharedArrayBuffer {
    return this._buffer;
  }

  writeResult(syncSlot: number, exitCode: number, stdout: string): void {
    const { slot, generation } = decodeSyncSlot(syncSlot);
    if (slot < 0 || slot >= MAX_SLOTS) return;
    if (!generationMatches(this._int32, slot, generation)) return;

    const base = slot * SLOT_SIZE;

    Atomics.store(this._int32, base + 1, exitCode);

    const encoder = new TextEncoder();
    const stdoutBytes = encoder.encode(stdout);
    const maxStdoutLen = (SLOT_SIZE - 3) * 4;
    const truncatedLen = Math.min(stdoutBytes.byteLength, maxStdoutLen);

    Atomics.store(this._int32, base + 2, truncatedLen);

    const dataOffset = (base + 3) * 4;
    this._uint8.set(stdoutBytes.subarray(0, truncatedLen), dataOffset);

    // last store wakes the waiting worker
    Atomics.store(this._int32, base, STATUS_COMPLETE);
    Atomics.notify(this._int32, base);
  }

  writeError(syncSlot: number, exitCode: number, errorMessage: string): void {
    const { slot, generation } = decodeSyncSlot(syncSlot);
    if (slot < 0 || slot >= MAX_SLOTS) return;
    if (!generationMatches(this._int32, slot, generation)) return;

    const base = slot * SLOT_SIZE;

    Atomics.store(this._int32, base + 1, exitCode);

    const encoder = new TextEncoder();
    const errorBytes = encoder.encode(errorMessage);
    const maxLen = (SLOT_SIZE - 3) * 4;
    const truncatedLen = Math.min(errorBytes.byteLength, maxLen);

    Atomics.store(this._int32, base + 2, truncatedLen);
    const dataOffset = (base + 3) * 4;
    this._uint8.set(errorBytes.subarray(0, truncatedLen), dataOffset);

    Atomics.store(this._int32, base, STATUS_ERROR);
    Atomics.notify(this._int32, base);
  }
}

// worker thread side
export class SyncChannelWorker {
  private _int32: Int32Array;
  private _uint8: Uint8Array;

  constructor(buffer: SharedArrayBuffer) {
    this._int32 = new Int32Array(buffer);
    this._uint8 = new Uint8Array(buffer);
  }

  /** Allocate a free slot; returns opaque handle (slot + generation). Never reuses in-flight slots. */
  allocateSlot(): number {
    for (let attempt = 0; attempt < 100_000; attempt++) {
      const head = Atomics.load(this._int32, FREE_HEAD_INDEX);
      if (head < 0) {
        Atomics.wait(this._int32, FREE_HEAD_INDEX, -1, 1);
        continue;
      }
      const next = Atomics.load(this._int32, FREE_LIST_BASE + head);
      if (Atomics.compareExchange(this._int32, FREE_HEAD_INDEX, head, next) !== head) {
        continue;
      }
      const oldGen = Atomics.add(this._int32, GEN_BASE + head, 1);
      const generation = (oldGen + 1) & 0xffff;
      Atomics.store(this._int32, head * SLOT_SIZE, STATUS_PENDING);
      return encodeSyncSlot(head, generation);
    }
    throw new Error("SyncChannel: no free slots");
  }

  // blocks the worker until main writes the result
  waitForResult(syncSlot: number, timeoutMs: number = 120_000): { exitCode: number; stdout: string } {
    const { slot, generation } = decodeSyncSlot(syncSlot);
    if (slot < 0 || slot >= MAX_SLOTS) {
      throw new Error("SyncChannel: invalid slot handle");
    }
    const base = slot * SLOT_SIZE;
    let shouldRelease = false;

    try {
      if (!generationMatches(this._int32, slot, generation)) {
        throw new Error("SyncChannel: stale slot generation");
      }
      shouldRelease = true;

      const result = Atomics.wait(this._int32, base, STATUS_PENDING, timeoutMs);

      if (result === "timed-out") {
        // invalidate so a late main write cannot corrupt the next borrower
        Atomics.add(this._int32, GEN_BASE + slot, 1);
        throw new Error("execSync timed out");
      }

      if (!generationMatches(this._int32, slot, generation)) {
        shouldRelease = false;
        throw new Error("SyncChannel: slot reused during wait");
      }

      const status = Atomics.load(this._int32, base);
      const exitCode = Atomics.load(this._int32, base + 1);
      const stdoutLen = Atomics.load(this._int32, base + 2);

      // TextDecoder rejects SAB-backed views — copy the slice into a non-shared buffer first
      const decoder = new TextDecoder();
      const dataOffset = (base + 3) * 4;
      const stdoutCopy = new Uint8Array(stdoutLen);
      stdoutCopy.set(this._uint8.subarray(dataOffset, dataOffset + stdoutLen));
      const stdout = decoder.decode(stdoutCopy);

      if (status === STATUS_ERROR) {
        const err = new Error(`Command failed with exit code ${exitCode}\n${stdout}`);
        (err as any).status = exitCode;
        (err as any).stdout = stdout;
        throw err;
      }

      return { exitCode, stdout };
    } finally {
      if (shouldRelease) releaseSlot(this._int32, slot);
    }
  }
}
