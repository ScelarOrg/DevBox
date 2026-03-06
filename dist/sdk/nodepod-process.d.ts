import { EventEmitter } from "../polyfills/events";
export declare class NodepodProcess extends EventEmitter {
    private _abortController;
    private _resolve;
    private _stdout;
    private _stderr;
    private _exitCode;
    private _sendStdinFn;
    private _killFn;
    private _maxOutputBytes;
    readonly completion: Promise<{
        stdout: string;
        stderr: string;
        exitCode: number;
    }>;
    constructor(maxOutputBytes?: number);
    _setSendStdin(fn: (data: string) => void): void;
    _setKillFn(fn: () => void): void;
    _pushStdout(chunk: string): void;
    _pushStderr(chunk: string): void;
    _finish(exitCode: number): void;
    get signal(): AbortSignal;
    get exited(): boolean;
    write(data: string): void;
    kill(): void;
    on(event: "output", handler: (chunk: string) => void): this;
    on(event: "error", handler: (chunk: string) => void): this;
    on(event: "exit", handler: (code: number) => void): this;
}
