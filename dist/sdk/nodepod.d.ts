import { MemoryVolume } from "../memory-volume";
import { DependencyInstaller } from "../packages/installer";
import { RequestProxy } from "../request-proxy";
import type { NodepodOptions, TerminalOptions, Snapshot, SnapshotOptions, SpawnOptions } from "./types";
import { NodepodFS } from "./nodepod-fs";
import { NodepodProcess } from "./nodepod-process";
import { NodepodTerminal } from "./nodepod-terminal";
import { ProcessManager } from "../threading/process-manager";
export declare class Nodepod {
    readonly fs: NodepodFS;
    private _volume;
    private _packages;
    private _proxy;
    private _cwd;
    private _env;
    private _processManager;
    private _vfsBridge;
    private _sharedVFS;
    private _syncChannel;
    private _unwatchVFS;
    private _handler;
    private constructor();
    static boot(opts?: NodepodOptions): Promise<Nodepod>;
    spawn(cmd: string, args?: string[], opts?: SpawnOptions): Promise<NodepodProcess>;
    private _resolveCommand;
    createTerminal(opts: TerminalOptions): NodepodTerminal;
    setPreviewScript(script: string): Promise<void>;
    clearPreviewScript(): Promise<void>;
    port(num: number): string | null;
    /** Directory names excluded from snapshots at any depth when shallow=true. */
    private static readonly SHALLOW_EXCLUDE_DIRS;
    snapshot(opts?: SnapshotOptions): Snapshot;
    restore(snapshot: Snapshot, opts?: SnapshotOptions): Promise<void>;
    teardown(): void;
    memoryStats(): {
        vfs: {
            fileCount: number;
            totalBytes: number;
            dirCount: number;
            watcherCount: number;
        };
        engine: {
            moduleCacheSize: number;
            transformCacheSize: number;
        };
        heap: {
            usedMB: number;
            totalMB: number;
            limitMB: number;
        } | null;
    };
    get volume(): MemoryVolume;
    /** @deprecated Main-thread engine removed for security. all code now runs in isolated Web Workers via spawn() <-- this removes fatal security flaws. */
    get engine(): never;
    get packages(): DependencyInstaller;
    get proxy(): RequestProxy;
    get processManager(): ProcessManager;
    get cwd(): string;
}
