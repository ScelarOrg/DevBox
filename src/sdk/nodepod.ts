import { MemoryVolume } from "../memory-volume";
import { DependencyInstaller } from "../packages/installer";
import {
  RequestProxy,
  getProxyInstance,
  type IVirtualServer,
} from "../request-proxy";
import type { VolumeSnapshot } from "../engine-types";
import { Buffer } from "../polyfills/buffer";
import type {
  NodepodOptions,
  TerminalOptions,
  Snapshot,
  SnapshotOptions,
  SpawnOptions,
} from "./types";
import { NodepodFS } from "./nodepod-fs";
import { NodepodProcess } from "./nodepod-process";
import { NodepodTerminal } from "./nodepod-terminal";
import { ProcessManager } from "../threading/process-manager";
import { setAllowedDomains } from "../cross-origin";
import type { ProcessHandle } from "../threading/process-handle";
import { VFSBridge } from "../threading/vfs-bridge";
import {
  isSharedArrayBufferAvailable,
  SharedVFSController,
} from "../threading/shared-vfs";
import { SyncChannelController } from "../threading/sync-channel";
import { MemoryHandler } from "../memory-handler";
import { openSnapshotCache } from "../persistence/idb-cache";

export class Nodepod {
  readonly fs: NodepodFS;

  private _volume: MemoryVolume;
  private _packages: DependencyInstaller;
  private _proxy: RequestProxy;
  private _cwd: string;
  private _env: Record<string, string>;

  private _processManager: ProcessManager;
  private _vfsBridge: VFSBridge;
  private _sharedVFS: SharedVFSController | null = null;
  private _syncChannel: SyncChannelController | null = null;
  private _unwatchVFS: (() => void) | null = null;
  private _handler: MemoryHandler;

  /* ---- Construction (use Nodepod.boot()) ---- */

  private constructor(
    volume: MemoryVolume,
    packages: DependencyInstaller,
    proxy: RequestProxy,
    cwd: string,
    handler: MemoryHandler,
    env: Record<string, string>,
  ) {
    this._volume = volume;
    this._packages = packages;
    this._proxy = proxy;
    this._cwd = cwd;
    this._env = env;
    this._handler = handler;
    this.fs = new NodepodFS(volume);
    this._processManager = new ProcessManager(volume);
    this._vfsBridge = new VFSBridge(volume);

    this._vfsBridge.setBroadcaster((path, content, excludePid) => {
      const isDirectory = content !== null && content.byteLength === 0;
      this._processManager.broadcastVFSChange(
        path,
        content,
        isDirectory,
        excludePid,
      );
    });

    this._processManager.setVFSBridge(this._vfsBridge);

    // VFS watcher broadcasts main-thread file changes to workers (needed for HMR)
    this._unwatchVFS = this._vfsBridge.watch();

    if (isSharedArrayBufferAvailable()) {
      try {
        this._sharedVFS = new SharedVFSController();
        this._processManager.setSharedBuffer(this._sharedVFS.buffer);
        this._vfsBridge.setSharedVFS(this._sharedVFS);
      } catch (e) {
        // COOP/COEP headers probably missing
      }

      try {
        this._syncChannel = new SyncChannelController();
        this._processManager.setSyncBuffer(this._syncChannel.buffer);
      } catch (e) {
        // SyncChannel init failed
      }
    }

    // Bridge worker HTTP servers to the RequestProxy for preview URLs
    this._processManager.on(
      "server-listen",
      (_pid: number, port: number, _hostname: string) => {
        const proxyServer: IVirtualServer = {
          listening: true,
          address: () => ({ port, address: "0.0.0.0", family: "IPv4" }),
          dispatchRequest: async (method, url, headers, body) => {
            const bodyStr = body
              ? typeof body === "string"
                ? body
                : body.toString("utf8")
              : null;
            const result = await this._processManager.dispatchHttpRequest(
              port,
              method,
              url,
              headers,
              bodyStr,
            );
            // Body can be ArrayBuffer (binary) or string (text)
            const respBody =
              result.body instanceof ArrayBuffer
                ? Buffer.from(new Uint8Array(result.body))
                : Buffer.from(result.body);
            return {
              statusCode: result.statusCode,
              statusMessage: result.statusMessage,
              headers: result.headers,
              body: respBody,
            };
          },
        };
        this._proxy.register(proxyServer, port);
      },
    );

    this._processManager.on("server-close", (_pid: number, port: number) => {
      this._proxy.unregister(port);
    });

    this._proxy.setProcessManager(this._processManager);
  }

  /* ---- Static factory ---- */

  static async boot(opts: NodepodOptions = {}): Promise<Nodepod> {
    if (typeof Worker === "undefined") {
      throw new Error(
        "[Nodepod] Web Workers are required. Nodepod cannot run without Web Worker support.",
      );
    }
    if (typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "[Nodepod] SharedArrayBuffer is required. Ensure Cross-Origin-Isolation headers are set (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: credentialless).",
      );
    }

    const cwd = opts.workdir ?? "/";
    const env = opts.env ?? {};

    const handler = new MemoryHandler(opts.memory);
    handler.startMonitoring();
    const volume = new MemoryVolume(handler);

    // Open IDB snapshot cache for faster re-boots (opt-out via enableSnapshotCache: false)
    let snapshotCache = null;
    if (opts.enableSnapshotCache !== false) {
      try {
        snapshotCache = await openSnapshotCache();
      } catch {
        /* IDB unavailable */
      }
    }

    const packages = new DependencyInstaller(volume, { snapshotCache });
    const proxy = getProxyInstance({
      onServerReady: opts.onServerReady,
    });

    // set up fetch domain whitelist (null = allow everything)
    if (opts.allowedFetchDomains === null) {
      setAllowedDomains(null);
    } else {
      setAllowedDomains(opts.allowedFetchDomains ?? []);
    }

    const nodepod = new Nodepod(volume, packages, proxy, cwd, handler, env);

    if (opts.files) {
      for (const [path, content] of Object.entries(opts.files)) {
        const dir = path.substring(0, path.lastIndexOf("/")) || "/";
        if (dir !== "/" && !volume.existsSync(dir)) {
          volume.mkdirSync(dir, { recursive: true });
        }
        volume.writeFileSync(path, content as any);
      }
    }

    if (cwd !== "/" && !volume.existsSync(cwd)) {
      volume.mkdirSync(cwd, { recursive: true });
    }

    for (const dir of ["/tmp", "/home"]) {
      if (!volume.existsSync(dir)) {
        volume.mkdirSync(dir, { recursive: true });
      }
    }

    if (
      opts.swUrl &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      try {
        await proxy.initServiceWorker({ swUrl: opts.swUrl });
        // Watermark is on by default — only disable if explicitly set to false
        if (opts.watermark === false) {
          proxy.setWatermark(false);
        }
      } catch (e) {
        // SW registration failed, non-fatal
      }
    }

    return nodepod;
  }

  /* ---- spawn() ---- */

  // Each spawn gets a dedicated worker with its own engine + shell
  async spawn(
    cmd: string,
    args?: string[],
    opts?: SpawnOptions,
  ): Promise<NodepodProcess> {
    const proc = new NodepodProcess();
    const execCwd = opts?.cwd ?? this._cwd;
    const combinedEnv = { ...this._env, ...(opts?.env ?? {}) };

    const handle = this._processManager.spawn({
      command: cmd,
      args: args ?? [],
      cwd: execCwd,
      env: combinedEnv,
    });

    handle.on("stdout", (data: string) => {
      if (!proc.exited) proc._pushStdout(data);
    });

    handle.on("stderr", (data: string) => {
      if (!proc.exited) proc._pushStderr(data);
    });

    handle.on("exit", (exitCode: number) => {
      if (!proc.exited) proc._finish(exitCode);
    });

    handle.on("worker-error", (message: string) => {
      if (!proc.exited) {
        proc._pushStderr(`Worker error: ${message}\n`);
        proc._finish(1);
      }
    });

    proc._setSendStdin((data: string) => handle.sendStdin(data));
    proc._setKillFn(() => handle.kill("SIGINT"));

    if (opts?.signal) {
      opts.signal.addEventListener(
        "abort",
        () => {
          handle.kill("SIGINT");
        },
        { once: true },
      );
    }

    await new Promise<void>((resolve) => {
      if (handle.state === "running") {
        resolve();
      } else {
        handle.on("ready", () => resolve());
      }
    });

    const isNodeCmd = cmd === "node" && args?.length;
    if (isNodeCmd) {
      const filePath = this._resolveCommand(cmd, args);
      handle.exec({
        type: "exec",
        filePath,
        args: args ?? [],
        cwd: execCwd,
        env: opts?.env,
        isShell: false,
      });
    } else {
      const fullCmd = args?.length ? `${cmd} ${args.join(" ")}` : cmd;
      handle.exec({
        type: "exec",
        filePath: "",
        args: args ?? [],
        cwd: execCwd,
        env: opts?.env,
        isShell: true,
        shellCommand: fullCmd,
      });
    }

    return proc;
  }

  private _resolveCommand(cmd: string, args?: string[]): string {
    if (cmd === "node" && args?.length) {
      const filePath = args[0];
      if (filePath.startsWith("/")) return filePath;
      return `${this._cwd}/${filePath}`.replace(/\/+/g, "/");
    }
    return cmd;
  }

  /* ---- createTerminal() ---- */

  createTerminal(opts: TerminalOptions): NodepodTerminal {
    const terminal = new NodepodTerminal(opts);
    terminal.setCwd(this._cwd);

    let activeAbort: AbortController | null = null;
    let currentSendStdin: ((data: string) => void) | null = null;
    let activeCommandId = 0;
    const nextCommandId = () => {
      activeCommandId = (activeCommandId + 1) % Number.MAX_SAFE_INTEGER;
      return activeCommandId;
    };
    let isStdinRaw = false;

    // Persistent shell worker -- reused across commands so VFS state persists
    // and we skip the ~1s worker creation overhead per command
    let shellHandle: ProcessHandle | null = null;
    let shellReady: Promise<void> | null = null;

    const ensureShellWorker = (): Promise<void> => {
      if (shellHandle && shellHandle.state !== "exited") {
        return shellReady!;
      }
      shellHandle = this._processManager.spawn({
        command: "shell",
        args: [],
        cwd: this._cwd,
        env: this._env,
      });
      shellReady = new Promise<void>((resolve) => {
        if (shellHandle!.state === "running") {
          resolve();
        } else {
          shellHandle!.on("ready", () => resolve());
        }
      });

      shellHandle.on("cwd-change", (cwd: string) => {
        this._cwd = cwd;
        terminal.setCwd(cwd);
      });

      shellHandle.on("stdin-raw-status", (raw: boolean) => {
        isStdinRaw = raw;
      });

      // Worker died -- next command will spawn a fresh one
      shellHandle.on("exit", () => {
        shellHandle = null;
        shellReady = null;
      });

      return shellReady;
    };

    terminal._wireExecution({
      onCommand: async (cmd: string) => {
        const myAbort = new AbortController();
        activeAbort = myAbort;
        const myCommandId = nextCommandId();

        let streamed = false;
        let wroteNewline = false;

        function ensureNewline() {
          if (!wroteNewline) {
            wroteNewline = true;
            terminal.write("\r\n");
          }
        }

        // Ensure persistent shell worker is running
        await ensureShellWorker();
        const handle = shellHandle!;

        // Ignore output from previous commands or before exec is sent (stale child output)
        let execSent = false;
        const onStdout = (data: string) => {
          if (myCommandId !== activeCommandId) return;
          if (!execSent) return;
          streamed = true;
          ensureNewline();
          terminal._writeOutput(data);
        };
        const onStderr = (data: string) => {
          if (myCommandId !== activeCommandId) return;
          if (!execSent) return;
          streamed = true;
          ensureNewline();
          terminal._writeOutput(data, true);
        };

        handle.on("stdout", onStdout);
        handle.on("stderr", onStderr);

        currentSendStdin = (data: string) => handle.sendStdin(data);

        // PM.kill() recursively kills descendants + cleans up server ports
        myAbort.signal.addEventListener(
          "abort",
          () => {
            this._processManager.kill(handle.pid, "SIGINT");
          },
          { once: true },
        );

        handle.exec({
          type: "exec",
          filePath: "",
          args: [],
          cwd: this._cwd,
          isShell: true,
          shellCommand: cmd,
          persistent: true,
        });
        execSent = true;

        return new Promise<void>((resolve) => {
          const cleanup = () => {
            handle.removeListener("shell-done", onDone);
            handle.removeListener("exit", onExit);
            handle.removeListener("stdout", onStdout);
            handle.removeListener("stderr", onStderr);
          };

          const onDone = (exitCode: number, stdout: string, stderr: string) => {
            cleanup();
            const isStale = myCommandId !== activeCommandId;
            if (!isStale) {
              currentSendStdin = null;
            }

            const aborted = myAbort.signal.aborted;

            if (!aborted && !streamed && !isStale) {
              const outStr = String(stdout ?? "");
              const errStr = String(stderr ?? "");
              if (outStr || errStr) ensureNewline();
              if (outStr) terminal._writeOutput(outStr);
              if (errStr) terminal._writeOutput(errStr, true);
            }

            if (activeAbort === myAbort) activeAbort = null;

            if (!aborted && !isStale) {
              if (!wroteNewline) terminal.write("\r\n");
              terminal._setRunning(false);
              terminal._writePrompt();
            }
            resolve();
          };

          const onExit = (exitCode: number, stdout: string, stderr: string) => {
            cleanup();
            const isStale = myCommandId !== activeCommandId;
            if (!isStale) currentSendStdin = null;
            const aborted = myAbort.signal.aborted;
            if (!aborted && !streamed && !isStale) {
              const outStr = String(stdout ?? "");
              const errStr = String(stderr ?? "");
              if (outStr || errStr) ensureNewline();
              if (outStr) terminal._writeOutput(outStr);
              if (errStr) terminal._writeOutput(errStr, true);
            }
            if (activeAbort === myAbort) activeAbort = null;
            if (!aborted && !isStale) {
              if (!wroteNewline) terminal.write("\r\n");
              terminal._setRunning(false);
              terminal._writePrompt();
            }
            resolve();
          };

          handle.on("shell-done", onDone);
          handle.on("exit", onExit);
        });
      },

      getSendStdin: () => currentSendStdin,
      getIsStdinRaw: () => isStdinRaw,
      getActiveAbort: () => activeAbort,
      setActiveAbort: (ac) => {
        activeAbort = ac;
      },
    });

    return terminal;
  }

  /* ---- setPreviewScript() ---- */

  // Inject a script into every preview iframe before any page content loads.
  // Useful for setting up a communication bridge between the main window and
  // the preview iframe, injecting polyfills, analytics, etc.
  async setPreviewScript(script: string): Promise<void> {
    this._proxy.setPreviewScript(script);
  }

  async clearPreviewScript(): Promise<void> {
    this._proxy.setPreviewScript(null);
  }

  /* ---- port() ---- */

  // Returns the preview URL for a server on this port, or null
  port(num: number): string | null {
    if (this._proxy.activePorts().includes(num)) {
      return this._proxy.serverUrl(num);
    }
    return null;
  }

  /* ---- snapshot / restore ---- */

  /** Directory names excluded from snapshots at any depth when shallow=true. */
  private static readonly SHALLOW_EXCLUDE_DIRS = new Set([
    "node_modules",
    ".cache",
    ".npm",
  ]);

  snapshot(opts?: SnapshotOptions): Snapshot {
    const shallow = opts?.shallow ?? true;
    return this._volume.toSnapshot(
      undefined,
      shallow ? Nodepod.SHALLOW_EXCLUDE_DIRS : undefined,
    );
  }

  async restore(snapshot: Snapshot, opts?: SnapshotOptions): Promise<void> {
    const autoInstall = opts?.autoInstall ?? true;

    // Swap the internal tree
    const fresh = MemoryVolume.fromSnapshot(snapshot);
    (this._volume as any).tree = (fresh as any).tree;

    // Auto-install deps from package.json if requested and manifest exists
    if (autoInstall && this._volume.existsSync("/package.json")) {
      await this._packages.installFromManifest();
    }
  }

  /* ---- teardown ---- */

  teardown(): void {
    if (this._unwatchVFS) {
      this._unwatchVFS();
      this._unwatchVFS = null;
    }
    this._processManager.teardown();
    this._volume.dispose();
    this._handler.destroy();
  }

  /* ---- Performance stats ---- */

  memoryStats(): {
    vfs: {
      fileCount: number;
      totalBytes: number;
      dirCount: number;
      watcherCount: number;
    };
    engine: { moduleCacheSize: number; transformCacheSize: number };
    heap: { usedMB: number; totalMB: number; limitMB: number } | null;
  } {
    const vfs = this._volume.getStats();
    // Engine stats are per-worker; main thread no longer runs a ScriptEngine
    const engine = { moduleCacheSize: 0, transformCacheSize: 0 };
    let heap: { usedMB: number; totalMB: number; limitMB: number } | null =
      null;
    const perf =
      typeof performance !== "undefined" ? (performance as any) : null;
    if (perf?.memory) {
      heap = {
        usedMB: Math.round((perf.memory.usedJSHeapSize / 1048576) * 10) / 10,
        totalMB: Math.round((perf.memory.totalJSHeapSize / 1048576) * 10) / 10,
        limitMB: Math.round((perf.memory.jsHeapSizeLimit / 1048576) * 10) / 10,
      };
    }
    return { vfs, engine, heap };
  }

  /* ---- Escape hatches ---- */

  get volume(): MemoryVolume {
    return this._volume;
  }
  /** @deprecated Main-thread engine removed for security. all code now runs in isolated Web Workers via spawn() <-- this removes fatal security flaws. */
  get engine(): never {
    throw new Error(
      "[Nodepod] Main-thread engine removed for security. " +
        "All code now runs in isolated Web Workers via spawn().",
    );
  }
  get packages(): DependencyInstaller {
    return this._packages;
  }
  get proxy(): RequestProxy {
    return this._proxy;
  }
  get processManager(): ProcessManager {
    return this._processManager;
  }
  get cwd(): string {
    return this._cwd;
  }
}
