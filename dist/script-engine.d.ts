import { MemoryVolume } from "./memory-volume";
import type { ExecutionOutcome } from "./engine-types";
import { ProcessObject } from "./polyfills/process";
export declare function setChildProcessPolyfill(mod: any): void;
export interface ModuleRecord {
    id: string;
    filename: string;
    exports: unknown;
    loaded: boolean;
    children: ModuleRecord[];
    paths: string[];
    parent: ModuleRecord | null;
}
export interface EngineOptions {
    cwd?: string;
    env?: Record<string, string>;
    onConsole?: (method: string, args: unknown[]) => void;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    workerThreadsOverride?: {
        isMainThread: boolean;
        parentPort: unknown;
        workerData: unknown;
        threadId: number;
    };
    handler?: import("./memory-handler").MemoryHandler;
}
export interface ResolverFn {
    (id: string): unknown;
    resolve: (id: string, options?: {
        paths?: string[];
    }) => string;
    cache: Record<string, ModuleRecord>;
    extensions: Record<string, unknown>;
    main: ModuleRecord | null;
    _ownerRecord?: ModuleRecord;
}
export declare class ScriptEngine {
    private vol;
    private fsBridge;
    private proc;
    private moduleRegistry;
    private opts;
    private transformCache;
    constructor(vol: MemoryVolume, opts?: EngineOptions);
    private patchTextDecoder;
    private patchStackTraceApi;
    execute(code: string, filename?: string): {
        exports: unknown;
        module: ModuleRecord;
    };
    executeSync: (code: string, filename?: string) => {
        exports: unknown;
        module: ModuleRecord;
    };
    executeAsync(code: string, filename?: string): Promise<ExecutionOutcome>;
    runFile(filename: string): {
        exports: unknown;
        module: ModuleRecord;
    };
    runFileSync: (filename: string) => {
        exports: unknown;
        module: ModuleRecord;
    };
    runFileTLA(filename: string): Promise<{
        exports: unknown;
        module: ModuleRecord;
    }>;
    runFileAsync(filename: string): Promise<ExecutionOutcome>;
    clearCache(): void;
    /** Evict one node_modules entry when module cache exceeds soft limit. */
    private _trimModuleCache;
    getVolume(): MemoryVolume;
    getProcess(): ProcessObject;
    createREPL(): {
        eval: (code: string) => unknown;
    };
}
export declare function executeCode(code: string, vol: MemoryVolume, opts?: EngineOptions): {
    exports: unknown;
    module: ModuleRecord;
};
export type { IScriptEngine, ExecutionOutcome, EngineConfig, } from "./engine-types";
export default ScriptEngine;
