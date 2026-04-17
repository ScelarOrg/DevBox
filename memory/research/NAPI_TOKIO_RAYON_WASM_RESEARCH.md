# napi-rs, Tokio, and Rayon in WASM: Complete Research
## For nodepod Compatibility

**Date:** 2026-04-15
**Source:** Deep analysis of cloned repos: napi-rs/napi-rs, tokio-rs/tokio, rayon-rs/rayon, toyobayashi/emnapi, GoogleChromeLabs/wasm-bindgen-rayon, WebAssembly/wasi-threads

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [napi-rs WASM Builds](#napi-rs)
3. [Tokio in WASM](#tokio)
4. [Rayon in WASM](#rayon)
5. [The WASM Threading Ecosystem](#ecosystem)
6. [What nodepod Needs](#nodepod)

---

## 1. Executive Summary <a id="executive-summary"></a>

Three Rust libraries are at the heart of tools like rolldown and lightningcss that we want to run in nodepod:

| Library | Role | WASM Target | Threading Model |
|---------|------|-------------|-----------------|
| **napi-rs** | Rust↔JS bridge via Node-API | `wasm32-wasip1-threads` | emnapi + Web Workers |
| **Tokio** | Async runtime (I/O, timers, tasks) | `wasm32-wasip1-threads` | current-thread scheduler, blocks via `Condvar` |
| **Rayon** | CPU parallelism (work-stealing) | `wasm32-wasip1-threads` | Thread pool via `std::thread::spawn` → `wasi_thread_spawn` |

**The critical chain:** Rust code → napi-rs `#[napi]` macro → napi-sys FFI → emnapi C lib (statically linked) → `@emnapi/core` JS → `WebAssembly.instantiate` with `SharedArrayBuffer`-backed memory.

**The thread spawn chain:** `std::thread::spawn()` → `pthread_create()` (wasi-libc) → `wasi_thread_spawn()` (WASI import) → JS `threadSpawn()` → creates Web Worker → posts `{wasmModule, wasmMemory}` → worker calls `wasi_thread_start(tid, arg)`.

---

## 2. napi-rs WASM Builds <a id="napi-rs"></a>

### 2.1 Architecture

napi-rs compiles Rust to WASM through a multi-layered bridge:

```
Rust code (#[napi] functions)
    ↓
napi crate (high-level Rust API: Env, JsValue, bindgen_runtime)
    ↓
napi-sys (raw N-API FFI: extern "C" imports from "napi" WASM import module)
    ↓  [statically linked as libemnapi-basic-mt.a]
emnapi C library (implements Node-API in C, compiled to WASM)
    ↓  [WASM exports: napi_register_wasm_v1, __napi_register__*, malloc, free]
@emnapi/core JS (instantiateNapiModuleSync - provides napi/emnapi imports)
    ↓
@tybys/wasm-util (WASI polyfill - provides WASI preview1 imports)
    ↓
WebAssembly.instantiate()
```

### 2.2 Crate Structure

| Crate | Purpose |
|-------|---------|
| `napi` (`crates/napi/`) | High-level Rust API. `Env`, `JsValue`, `bindgen_runtime` |
| `napi-derive` (`crates/macro/`) | The `#[napi]` proc macro |
| `napi-derive-backend` (`crates/backend/`) | Code generation backend |
| `napi-sys` (`crates/sys/`) | Raw N-API FFI. On WASM: `extern "C"` imports |
| `napi-build` (`crates/build/`) | Build script. On WASI: sets linker args + links emnapi |
| `@napi-rs/cli` (`cli/`) | JS build tool. Generates glue code |
| `@napi-rs/wasm-runtime` (`wasm-runtime/`) | Re-exports emnapi + WASI polyfill + fs-proxy |

### 2.3 How `#[napi]` Macro Expands — Native vs WASM

The macro generates **two conditional variants** for registration:

**Native (non-WASM):** Uses `#[ctor]` to auto-run at shared library load:
```rust
#[cfg(all(not(test), not(target_family = "wasm")))]
#[napi::ctor::ctor(crate_path=::napi::ctor)]
fn __napi_register__plus_100_0() {
    napi::bindgen_prelude::register_module_export(None, "plus100\0", __napi_cb__plus_100);
}
```

**WASM:** Uses `#[no_mangle] extern "C"` so it becomes a WASM export:
```rust
#[cfg(all(not(test), target_family = "wasm"))]
#[no_mangle]
extern "C" fn __napi_register__plus_100_0() {
    napi::bindgen_prelude::register_module_export(None, "plus100\0", __napi_cb__plus_100);
}
```

**Critical difference:** On native, `#[ctor]` runs at library load. On WASM, the JS glue calls them explicitly:
```javascript
beforeInit({ instance }) {
  for (const name of Object.keys(instance.exports)) {
    if (name.startsWith('__napi_register__')) {
      instance.exports[name]()  // Call each registration function
    }
  }
}
```

### 2.4 The WASM Entry Point

```rust
// crates/napi/src/bindgen_runtime/module_register.rs, line 250
#[cfg(all(target_family = "wasm", not(feature = "noop")))]
#[no_mangle]
unsafe extern "C" fn napi_register_wasm_v1(
  env: sys::napi_env,
  exports: sys::napi_value,
) -> sys::napi_value {
  unsafe { napi_register_module_v1(env, exports) }
}
```

Boot sequence:
1. JS calls `instantiateNapiModuleSync(wasmBytes, options)`
2. emnapi instantiates WASM with imports
3. `beforeInit` calls all `__napi_register__*` exports (populates registries)
4. emnapi calls `napi_register_wasm_v1(env, exports)` (reads registries, creates JS bindings)
5. `napiModule.exports` now has all registered functions/classes

### 2.5 Build Process — Critical Linker Flags

From `crates/build/src/wasi.rs`:
```rust
// Static linking to emnapi
println!("cargo:rustc-link-lib=static=emnapi-basic-mt");

// Required exports
println!("cargo:rustc-link-arg=--export=malloc");
println!("cargo:rustc-link-arg=--export=free");
println!("cargo:rustc-link-arg=--export=napi_register_wasm_v1");
println!("cargo:rustc-link-arg=--export-table");

// Memory: JS provides it, not WASM
println!("cargo:rustc-link-arg=--import-memory");
println!("cargo:rustc-link-arg=--max-memory=4294967296");  // 4GB
println!("cargo:rustc-link-arg=-zstack-size=64000000");    // 64MB stack
```

Key: `--import-memory` means WASM does NOT create its own memory. JS creates `SharedArrayBuffer`-backed `WebAssembly.Memory` and passes it in.

### 2.6 JS Glue Code (Generated `.wasi.cjs`)

```javascript
// 1. Create shared memory (SharedArrayBuffer-backed)
const __sharedMemory = new WebAssembly.Memory({
  initial: 4000,    // ~256MB
  maximum: 65536,   // 4GB
  shared: true,     // REQUIRES SharedArrayBuffer
})

// 2. Instantiate with emnapi
const { instance, module, napiModule } = __emnapiInstantiateNapiModuleSync(
  __nodeFs.readFileSync(__wasmFilePath),
  {
    context: __emnapiContext,
    asyncWorkPoolSize: 4,
    wasi: __wasi,
    onCreateWorker() {
      const worker = new Worker(__nodePath.join(__dirname, 'wasi-worker.mjs'), { env: process.env })
      worker.onmessage = ({ data }) => __wasmCreateOnMessageForFsProxy(__nodeFs)(data)
      worker.unref()
      return worker
    },
    overwriteImports(importObject) {
      importObject.env = {
        ...importObject.env,
        ...importObject.napi,      // N-API functions
        ...importObject.emnapi,    // emnapi internals
        memory: __sharedMemory,
      }
      return importObject
    },
    beforeInit({ instance }) {
      for (const name of Object.keys(instance.exports)) {
        if (name.startsWith('__napi_register__')) instance.exports[name]()
      }
    },
  }
)
module.exports = napiModule.exports
```

### 2.7 Worker Script (wasi-worker.mjs)

Each "thread" is a Worker that instantiates the SAME WASM module with SAME shared memory:

```javascript
const handler = new MessageHandler({
  onLoad({ wasmModule, wasmMemory }) {
    const wasi = new WASI({ version: 'preview1', env: process.env, preopens: { '/': '/' } })
    return instantiateNapiModuleSync(wasmModule, {
      childThread: true,     // KEY: tells emnapi this is a worker
      wasi,
      context: emnapiContext,
      overwriteImports(importObject) {
        importObject.env = {
          ...importObject.env, ...importObject.napi, ...importObject.emnapi,
          memory: wasmMemory   // Same SharedArrayBuffer memory
        }
      },
    })
  },
})
globalThis.onmessage = function (e) { handler.handle(e) }
```

### 2.8 Filesystem Proxy (SharedArrayBuffer RPC)

Workers can't directly access `fs`. A blocking RPC mechanism bridges the gap:

```
Worker: postMessage({ __fs__: { sab, type: 'readFileSync', payload: ['/foo.js'] } })
Worker: Atomics.wait(sab, 0, 21)  // BLOCKS
Main:   fs.readFileSync('/foo.js')
Main:   encode result into SharedArrayBuffer
Main:   Atomics.store(sab, 0, 0) + Atomics.notify(sab, 0)
Worker: [WAKES] decode result → return
```

**Buffer layout:** `[0..4]=status(21=waiting,0=ok,1=err) [4..8]=type [8..16]=size [16..]=payload`
**Limitation:** 10240 byte payload max. Large reads fail with `RangeError: payload overflow`.

### 2.9 WASM-Specific Behavioral Differences

| What | Native | WASM |
|------|--------|------|
| Module registration | `#[ctor]` at load time | `extern "C"` exports called by JS |
| `napi_adjust_external_memory` | Works | Returns 0 (no-op) |
| `napi_get_uv_event_loop` | Works | Not available |
| Error from Unknown | Creates reference | Extracts message string manually |
| Memory tracking | Full debug assertions | Disabled |
| Tokio cleanup hook | `napi_add_env_cleanup_hook` | `napi_wrap` on exports object |

### 2.10 Gotchas for Custom Runtimes

1. **Import merging**: All napi/emnapi/env imports get merged into `importObject.env`. If your runtime provides imports differently, this breaks.
2. **`beforeInit` ordering**: `__napi_register__*` MUST run BEFORE `napi_register_wasm_v1`.
3. **Worker globals required**: `globalThis.self`, `globalThis.postMessage`, `Worker` constructor, `importScripts` function.
4. **Worker unref hack**: Uses `Object.getOwnPropertySymbols` to find Node.js internal `kPublicPort`/`kHandle`. Node.js-specific, won't work elsewhere.
5. **`tokio_unstable`**: Without `--cfg tokio_unstable`, tokio is single-threaded and async work spawns OS threads via `std::thread::spawn`.
6. **`crt1-reactor.o`**: Required for `wasm32-wasip1-threads` multi-thread initialization.

---

## 3. Tokio in WASM <a id="tokio"></a>

### 3.1 Architecture

Tokio (v1.52.0) bundles: scheduler + I/O driver (mio) + time driver (hierarchical wheel) + blocking pool.

```rust
pub struct Runtime {
    scheduler: Scheduler,        // CurrentThread or MultiThread
    handle: Handle,              // Driver handles (IO, time, signal)
    blocking_pool: BlockingPool, // Thread pool for spawn_blocking
}
```

The driver is a layered stack:
```
ParkThread (condvar-based parking)
  └── IoStack (mio-based I/O, or disabled ParkThread)
    └── SignalDriver (Unix signals, or passthrough)
      └── ProcessDriver (child reaping, or passthrough)
        └── TimeDriver (hierarchical timing wheel)
```

### 3.2 Feature Compatibility on WASM

| Feature | `wasm32-unknown-unknown` | `wasm32-wasip1` | `wasm32-wasip1-threads` |
|---------|--------------------------|-----------------|-------------------------|
| `rt` (current-thread) | Park panics when idle | Works | Works |
| `rt-multi-thread` | No | No | Possible (not yet official) |
| `sync` (all primitives) | **Full** | **Full** | **Full** |
| `time` | PANICS (`Instant::now()`) | **Full** | **Full** |
| `io-util` | **Full** | **Full** | **Full** |
| `net` | No | Unstable | Unstable |
| `fs` | No | Needs spawn_blocking | Works |
| `process` / `signal` | No | No | No |
| `spawn_blocking` | No threads | No threads | Works |
| `macros` | **Full** | **Full** | **Full** |

Compile-time enforcement:
```rust
#[cfg(all(not(tokio_unstable), target_family = "wasm",
    any(feature = "fs", feature = "net", feature = "rt-multi-thread", ...)))]
compile_error!("Only features sync,macros,io-util,rt,time are supported on wasm.");
```

### 3.3 The `block_on` Loop (Heart of the Runtime)

```rust
fn block_on<F: Future>(self, future: F) -> F::Output {
    'outer: loop {
        // 1. Poll the block_on future if woken
        if handle.reset_woken() {
            let res = crate::task::coop::budget(|| future.as_mut().poll(&mut cx));
            if let Ready(v) = res { return v; }
        }
        // 2. Process spawned tasks (up to event_interval times)
        for _ in 0..handle.shared.config.event_interval {
            match core.next_task(handle) {
                Some(task) => { /* run task */ }
                None => {
                    // No tasks: PARK (block the thread)
                    core = context.park(core, handle);
                    continue 'outer;
                }
            }
        }
        // 3. Yield to driver for timer and I/O events
        core = context.park_yield(core, handle);
    }
}
```

**For WASM:** This loop is what needs special handling. The `park()` call is where the thread blocks.

### 3.4 The Parking Mechanism (THE Fundamental WASM Blocker)

```rust
struct Inner {
    state: AtomicUsize,  // EMPTY=0, PARKED=1, NOTIFIED=2
    mutex: Mutex<()>,
    condvar: Condvar,
}
```

- `park()`: CAS NOTIFIED→EMPTY (fast path) or `condvar.wait()` (blocking)
- `park_timeout()`: Same but with `condvar.wait_timeout()`
- `unpark()`: Swap to NOTIFIED, if was PARKED → `condvar.notify_one()`

**On `wasm32-wasip1-threads` in a Worker:** `Condvar::wait()` → `memory.atomic.wait32` → `Atomics.wait()`. This **works** because Workers can block.

**On browser main thread:** `Atomics.wait()` is **FORBIDDEN**. The runtime would deadlock.

**Special WASM handling without atomics:**
```rust
#[cfg(all(target_family = "wasm", not(target_feature = "atomics")))]
{
    std::thread::sleep(dur);  // Falls back to thread::sleep (which panics on wasm32-unknown-unknown)
}
```

### 3.5 Time Driver

Hierarchical timing wheel (Varghese-Lauck):
```
Level 0: 64 slots × 1ms = 64ms range
Level 1: 64 slots × 64ms = ~4s range
...
Level 5: 64 slots × ~12d = ~2 year range
```

`tokio::time::sleep(duration)`:
1. Creates `TimerEntry`, registered with wheel on first poll
2. Driver calculates `next_expiration_time()`
3. Parks thread for that duration
4. On wake, fires expired timers → wakes their futures

**Time source:** `std::time::Instant::now()` → **PANICS** on `wasm32-unknown-unknown`, **works** on `wasm32-wasi*` (WASI provides `clock_time_get`).

### 3.6 `tokio::sync` — Fully WASM-Compatible

All async sync primitives work perfectly in WASM:
- `Mutex`, `RwLock`, `Semaphore`, `Notify`
- `mpsc`, `oneshot`, `broadcast`, `watch` channels
- `Barrier`, `OnceCell`

They're purely async (waker-based), no OS threads needed. Internal `AtomicWaker` uses only `AtomicPtr`.

### 3.7 `tokio::spawn` in WASM

Works fine — just adds tasks to scheduler's local `VecDeque`:
```rust
fn schedule(&self, task: Notified) {
    context::with_scheduler(|cx| match cx {
        Some(CurrentThread(cx)) if same_runtime => core.push_task(task),
        _ => { shared.inject.push(task); driver.unpark(); }
    });
}
```

Task fairness: every 31 ticks, prioritize global queue over local.

### 3.8 I/O Driver on WASI

- Without `net` feature: I/O driver is just a `ParkThread` (no mio)
- `mio::Waker` not available on WASI (`#[cfg(not(target_os = "wasi"))]`)
- `unpark()` is a no-op on WASI
- `mio::Poll::poll()` can return `InvalidInput` when no subscriptions (special-cased)

### 3.9 napi-rs Tokio Configuration

```rust
// With tokio_unstable: multi-thread
tokio::runtime::Builder::new_multi_thread().enable_all().build()

// Without tokio_unstable: single-thread only
tokio::runtime::Builder::new_current_thread().enable_all().build()
```

Without `tokio_unstable`, async futures spawn real OS threads:
```rust
#[cfg(all(target_family = "wasm", not(tokio_unstable)))]
{
    std::thread::spawn(|| { block_on(inner); });
}
```

### 3.10 Key Insight for nodepod

The parking mechanism is the fundamental issue. Solutions:

**A. Run WASM in a Worker (RECOMMENDED)**
- `Atomics.wait()` works in Workers
- `Condvar::wait()` → `memory.atomic.wait32` works
- This is what rolldown does

**B. Provide `clock_time_get` → `performance.now()`**
- Makes `Instant::now()` work
- Enables the entire time subsystem

**C. `poll_oneoff` implementation**
- What `mio::Poll::poll()` calls on WASI
- Needs: clock subscriptions (wait for timeout) + FD subscriptions (wait for I/O)
- Maps to: `Atomics.wait()` with timeout for clock, `SharedArrayBuffer` for I/O notifications

---

## 4. Rayon in WASM <a id="rayon"></a>

### 4.1 Architecture

Two crates:
- **`rayon`** (v1.12.0) — Public API: `par_iter()`, `join()`, `scope()`, `spawn()`
- **`rayon-core`** (v1.13.0) — Engine: thread pool, work-stealing, sleep system

Key dependencies:
```toml
crossbeam-deque = "0.8.1"    # Work-stealing deque (Chase-Lev)
crossbeam-utils = "0.8.0"    # Cache padding, etc.
wasm_sync = "0.1.0"          # WASM-safe sync primitives (optional)
```

### 4.2 The Registry (Thread Pool Core)

```rust
pub(super) struct Registry {
    thread_infos: Vec<ThreadInfo>,       // Per-thread: stealers, latches
    sleep: Sleep,                        // Thread sleep/wake management
    injected_jobs: Injector<JobRef>,     // Global job queue
    broadcasts: Mutex<Vec<Worker<JobRef>>>,
    terminate_count: AtomicUsize,        // Ref count for graceful shutdown
}
```

Thread count: `RAYON_NUM_THREADS` env → `thread::available_parallelism()` → max 65535 (64-bit) or 255 (32-bit)

### 4.3 Work-Stealing Algorithm

Chase-Lev deque per worker. Each has a `Worker<JobRef>` (push/pop) and `Stealer<JobRef>` (steal).

```rust
fn find_work(&self) -> Option<JobRef> {
    self.take_local_job()                    // 1. Own deque
        .or_else(|| self.steal())            // 2. Random victim stealing
        .or_else(|| self.registry.pop_injected_job()) // 3. Global queue
}
```

Steal uses randomized victim selection with XorShift64Star RNG. Retries on CAS conflicts.

### 4.4 `join()` — The Core Fork-Join Primitive

```rust
pub fn join_context<A, B>(oper_a: A, oper_b: B) -> (RA, RB) {
    // 1. Create StackJob for B with SpinLatch
    let job_b = StackJob::new(call_b(oper_b), SpinLatch::new(worker_thread));
    // 2. Push B onto local deque (available for stealing)
    worker_thread.push(job_b.as_job_ref());
    // 3. Execute A on current thread
    let result_a = call_a(oper_a);
    // 4. Try to pop B (maybe not stolen yet)
    while !job_b.latch.probe() {
        if let Some(job) = worker_thread.take_local_job() {
            if job == job_b { return (result_a, job_b.run_inline()); }
            worker_thread.execute(job); // Execute other work while waiting
        } else {
            worker_thread.wait_until(&job_b.latch); // Wait, but keep stealing!
            break;
        }
    }
}
```

**Key:** Zero allocation (StackJob), adaptive (B is parallel only if stolen), work-conserving (steals while waiting).

### 4.5 Synchronization: Latches & Sleep

**Latches** (signaling mechanism): States `UNSET(0) → SLEEPY(1) → SLEEPING(2) → SET(3)`
- `SpinLatch`: Used in `join()`. Polls via `probe()` while doing work.
- `LockLatch`: Uses `Mutex<bool>` + `Condvar`. For non-pool threads.
- `CountLatch`: Tracks outstanding tasks in `scope()`.

**Sleep system (progressive backoff):**
1. Rounds 0..32: `thread::yield_now()`
2. Round 32: Announce sleepy (increment JEC counter)
3. Round 33: Actually sleep: `condvar.wait()`

**For WASM:** Sleep uses `Mutex`/`Condvar` → `memory.atomic.wait`/`notify`. The `web_spin_lock` feature provides spin-lock alternatives for browser main thread.

### 4.6 WASM Compatibility Matrix

| Target | Threads | std::thread | Atomics | Rayon Behavior |
|--------|---------|-------------|---------|----------------|
| `wasm32-unknown-unknown` | No | `Unsupported` | Optional | **Fallback: single-threaded** |
| `wasm32-wasip1` | No | `Unsupported` | No | **Fallback: single-threaded** |
| `wasm32-wasip1-threads` | **Yes** | **Works** | **Yes** | **Full parallel execution** |

### 4.7 The WASM Fallback

When threading is unsupported, rayon gracefully degrades:
```rust
fn default_global_registry() -> Result<Arc<Registry>, ThreadPoolBuildError> {
    let result = Registry::new(ThreadPoolBuilder::new());
    let unsupported = matches!(&result, Err(e) if e.is_unsupported());
    if unsupported && WorkerThread::current().is_null() {
        // Fallback: single-threaded pool on current thread
        let builder = ThreadPoolBuilder::new().num_threads(1).use_current_thread();
        return Registry::new(builder);
    }
    result
}
```

In single-threaded mode: `join()` executes sequentially, `par_iter()` runs as regular iter.

### 4.8 What Rayon Needs from the Platform

| Rust Primitive | WASM Primitive | Notes |
|---------------|---------------|-------|
| `std::thread::spawn()` | `wasi_thread_spawn` → Web Worker | Instance-per-thread model |
| `Mutex::lock()` | `memory.atomic.wait32` | **Forbidden on browser main thread!** |
| `Condvar::wait()` | `memory.atomic.wait32` | Same restriction |
| `Condvar::notify_one()` | `memory.atomic.notify` | Works everywhere |
| `AtomicUsize` (SeqCst) | `i32.atomic.load/store/cmpxchg` | Works with shared memory |
| `thread_local!` | `__tls_base` per-instance globals | Each WASM instance has own TLS |
| `thread::yield_now()` | Busy loop / cooperative yield | No OS scheduler |

### 4.9 The `spawn_handler` Extension Point

**This is the key to WASM compatibility:**
```rust
pub fn spawn_handler<F>(self, spawn: F) -> ThreadPoolBuilder<CustomSpawn<F>>
where F: FnMut(ThreadBuilder) -> io::Result<()>
```

Both `wasm-bindgen-rayon` and `@emnapi/wasi-threads` use this to redirect thread creation to Web Workers.

### 4.10 wasm-bindgen-rayon (Browser Approach)

Uses SPMC (Single-Producer Multi-Consumer) channel in shared WASM memory:
```rust
rayon::ThreadPoolBuilder::new()
    .num_threads(self.num_threads)
    .spawn_handler(move |thread| {
        self.sender.send(thread).unwrap(); // Send ThreadBuilder via channel
        Ok(())
    })
    .build_global()
```

Workers block on `receiver.recv()` (Atomics.wait) waiting for work. Near-native performance.

### 4.11 Browser Main Thread Restriction

`memory.atomic.wait32` (backing `Mutex::lock()`) throws `TypeError` on browser main thread.

**Rayon's solution:** `web_spin_lock` feature replaces `Mutex`/`Condvar` with spin-locks:
```rust
#[cfg(not(feature = "web_spin_lock"))]
use std::sync;           // Real locks (work in Workers)
#[cfg(feature = "web_spin_lock")]
use wasm_sync as sync;   // Spin locks (work on main thread too)
```

**In Node.js/nodepod:** `Atomics.wait()` works on main thread, so `web_spin_lock` is NOT needed.

---

## 5. The WASM Threading Ecosystem <a id="ecosystem"></a>

### 5.1 Instance-Per-Thread Model

```
Main Thread                    Worker Thread 1              Worker Thread 2
┌─────────────────┐           ┌─────────────────┐          ┌─────────────────┐
│ WASM Instance 0 │           │ WASM Instance 1 │          │ WASM Instance 2 │
│ Globals (own)   │           │ Globals (own)   │          │ Globals (own)   │
│ TLS (own)       │           │ TLS (own)       │          │ TLS (own)       │
│ Table (own)     │           │ Table (own)     │          │ Table (own)     │
│    ┌────────────┴───────────┴────────────┐    │          │                 │
│    │      Shared Linear Memory           │    │          │                 │
│    │  (WebAssembly.Memory shared:true)   ├────┴──────────┘                 │
│    │  heap, stacks, atomics, data        │                                 │
│    └─────────────────────────────────────┘                                 │
└─────────────────┘                                                          │
```

Each thread: own WASM instance (globals, function table, call stack, TLS). **Shared:** linear memory (heap, atomics).

### 5.2 wasi-threads Proposal

One single function:
```wit
thread-spawn: func(start-arg: start-arg) -> thread-spawn-result  // s32: positive=tid, negative=error
```

Module must export:
```wat
(export "wasi_thread_start" (func $wasi_thread_start))
;; Signature: (param $thread_id i32) (param $start_arg i32)
```

### 5.3 Thread-Local Storage in WASM

TLS works via per-instance globals:
- `__tls_base`: Global pointing to TLS block start
- `__tls_size`, `__tls_align`: Size and alignment
- `__wasm_init_tls(ptr)`: Copies `.tdata` segment via `memory.init`

Since each thread gets its own instance, `__tls_base` is naturally per-thread.

### 5.4 emnapi Architecture

| Component | Package | Role |
|-----------|---------|------|
| C library | `emnapi` npm (libemnapi-basic-mt.a) | Implements N-API in C, statically linked into WASM |
| JS core | `@emnapi/core` | `instantiateNapiModuleSync`, `MessageHandler` |
| JS runtime | `@emnapi/runtime` | N-API context, `getDefaultContext` |
| Threading | `@emnapi/wasi-threads` | `WASIThreads`, `ThreadManager`, `ThreadMessageHandler` |
| WASI polyfill | `@tybys/wasm-util` | `WASI` class for browsers |

### 5.5 emnapi ThreadManager

```typescript
class ThreadManager {
    unusedWorkers: WorkerLike[] = [];   // Pool
    runningWorkers: WorkerLike[] = [];  // Active
    pthreads: Record<number, WorkerLike> = {};  // tid → worker

    getNewWorker(): WorkerLike;
    loadWasmModuleToWorker(worker): Promise<WorkerLike>;
    returnWorkerToPool(worker): void;
    markId(worker): number;  // TID = nextWorkerID + 43
}
```

### 5.6 Message Protocol

Messages use `{ __emnapi__: { type, payload } }` format:

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `load` | Main→Worker | `{ wasmModule, wasmMemory, sab }` | Initialize worker |
| `loaded` | Worker→Main | `{}` | Worker ready |
| `start` | Main→Worker | `{ tid, arg, sab }` | Start thread |
| `cleanup-thread` | Worker→Main | `{ tid }` | Thread finished |
| `spawn-thread` | Worker→Main | `{ startArg, errorOrTid }` | Sub-thread spawn |

FS proxy uses separate `{ __fs__: { sab, type, payload } }` format.

### 5.7 Full Initialization Sequence

```
Phase 1: Fetch .wasm → create WASI → instantiateNapiModule() → build import object → WebAssembly.instantiate
Phase 2: WASIThreads.initialize(instance, module, memory) → setup ThreadManager → wasi.initialize()
Phase 3: Pre-load worker pool (if configured) → post 'load' → workers instantiate WASM → 'loaded'
Phase 4: napiModule.init() → call napi_register_module_v1 → register exports → ready
Phase 5: On demand: std::thread::spawn → pthread_create → wasi_thread_spawn → JS threadSpawn → Worker
Phase 6: FS access: Worker posts __fs__ → Atomics.wait → Main does fs op → Atomics.notify → Worker wakes
```

### 5.8 Required JS APIs

**Threading:**
- `SharedArrayBuffer` — shared WASM memory
- `Atomics.wait/notify/store/load/compareExchange/waitAsync` — synchronization
- `Worker` / `worker_threads` — thread execution
- `WebAssembly.Module` (must be postMessage-transferable)
- `WebAssembly.Memory` with `shared: true`
- `postMessage()` — worker communication

**WASI:**
- `TextEncoder` / `TextDecoder` — string encoding
- `crypto.getRandomValues()` — random generation
- `performance.now()` — high-resolution timing

**N-API runtime:**
- `WeakMap`, `WeakRef`, `FinalizationRegistry` — GC integration
- `BigInt` — 64-bit integers
- `Proxy` — instance proxying in child threads

### 5.9 shared-everything-threads (The Future)

Currently active proposal that would eliminate the instance-per-thread model:
- Shared functions, globals, tables across threads
- Thread-local globals for TLS
- Native `thread.spawn` instruction
- Would dramatically simplify everything

**Status:** Active development, not in any production engine yet.

---

## 6. What nodepod Needs <a id="nodepod"></a>

### 6.1 Critical Requirements

| Requirement | Why | Maps To |
|------------|-----|---------|
| `SharedArrayBuffer` | Shared WASM memory across threads | Already partially done |
| `Atomics.wait()` in workers | Thread blocking (Mutex, Condvar) | `memory.atomic.wait32` |
| `Atomics.notify()` | Wake sleeping threads | `memory.atomic.notify` |
| `WebAssembly.Memory shared:true` | Memory.buffer returns SharedArrayBuffer | WebAssembly integration |
| Worker threads | Thread execution contexts | `onCreateWorker` factory |
| `wasi_thread_spawn` | Rayon + tokio thread creation | `@emnapi/wasi-threads` handles this |
| `clock_time_get` → `performance.now()` | Tokio time driver | WASI polyfill |
| `poll_oneoff` | Tokio I/O driver | WASI polyfill |
| `fd_*` operations | File system access | WASI polyfill → VFS bridge |

### 6.2 Recommended Architecture

```
┌────────────────────────────────────────────────┐
│  nodepod JavaScript Host                        │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │  Web Worker (dedicated thread)        │      │
│  │                                       │      │
│  │  ┌─────────────────────────────┐     │      │
│  │  │  WASM Module                 │     │      │
│  │  │  (wasm32-wasip1-threads)    │     │      │
│  │  │                              │     │      │
│  │  │  tokio runtime              │     │      │
│  │  │  ├── current_thread scheduler│     │      │
│  │  │  ├── timer driver (wheel)    │     │      │
│  │  │  ├── blocking pool ─────────│─────│──→ Worker Threads
│  │  │  └── I/O driver (optional)   │     │      │
│  │  │                              │     │      │
│  │  │  rayon thread pool          │     │      │
│  │  │  ├── work-stealing deques    │     │      │
│  │  │  └── N worker threads ──────│─────│──→ Worker Threads
│  │  └─────────────────────────────┘     │      │
│  │                │                      │      │
│  │  WASI Polyfill │                      │      │
│  │  ├── clock_time_get → perf.now()     │      │
│  │  ├── fd_* → VFS bridge               │      │
│  │  ├── poll_oneoff → Atomics.wait       │      │
│  │  └── thread_spawn → new Worker()      │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│  SharedArrayBuffer (shared linear memory)       │
└────────────────────────────────────────────────┘
```

### 6.3 The Critical Path

```
1. SharedArrayBuffer must work ✓ (previous work)
2. Worker creation (onCreateWorker factory)
3. WebAssembly.Module transferable via postMessage
4. WebAssembly.Memory with shared:true
5. Atomics.wait() blocks in workers
6. wasi_thread_start callable in worker instances
7. FS proxy via SharedArrayBuffer for WASI operations
```

### 6.4 Key Gotchas to Watch For

1. **Import namespace merging:** emnapi provides imports in `napi`/`emnapi`/`env` namespaces that get merged into `env`
2. **Registration ordering:** `__napi_register__*` before `napi_register_wasm_v1`
3. **FS proxy payload limit:** 10240 bytes max response
4. **Tokio parking:** `Condvar::wait()` blocks forever in single-threaded WASM — must run in Worker
5. **Rayon fallback:** Without threads, degrades to single-threaded (functional but slow)
6. **TLS per instance:** Each Worker's WASM instance has separate TLS — this is correct behavior
7. **Worker pool sizing:** `asyncWorkPoolSize` controls emnapi workers; rayon separately determines thread count via `available_parallelism()`
8. **The `tokio_unstable` flag:** Required for multi-thread runtime on WASM
9. **Memory limits:** Default 4000 pages initial (~256MB), 65536 max (4GB)
10. **`NAPI_RS_FORCE_WASI` env var:** Forces WASI binary even when native exists
