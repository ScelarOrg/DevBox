import type { CompletedResponse } from "./polyfills/http";
import { Server } from "./polyfills/http";
import { EventEmitter } from "./polyfills/events";
export interface IVirtualServer {
    listening: boolean;
    address(): {
        port: number;
        address: string;
        family: string;
    } | null;
    dispatchRequest(method: string, url: string, headers: Record<string, string>, body?: Buffer | string): Promise<CompletedResponse>;
}
export interface RegisteredServer {
    server: Server | IVirtualServer;
    port: number;
    hostname: string;
}
export interface ProxyOptions {
    baseUrl?: string;
    onServerReady?: (port: number, url: string) => void;
}
export interface ServiceWorkerConfig {
    swUrl?: string;
}
export { CompletedResponse };
export declare class RequestProxy extends EventEmitter {
    static DEBUG: boolean;
    private registry;
    private baseUrl;
    private opts;
    private channel;
    private swReady;
    private heartbeat;
    private _processManager;
    private _workerWsConns;
    private _previewScript;
    private _swAuthToken;
    private _wsBridgeToken;
    constructor(opts?: ProxyOptions);
    setProcessManager(pm: any): void;
    register(server: Server | IVirtualServer, port: number, hostname?: string): void;
    unregister(port: number): void;
    setPreviewScript(script: string | null): void;
    setWatermark(enabled: boolean): void;
    private _sendPreviewScriptToSW;
    private _sendWsTokenToSW;
    serverUrl(port: number): string;
    activePorts(): number[];
    handleRequest(port: number, method: string, url: string, headers: Record<string, string>, body?: ArrayBuffer): Promise<CompletedResponse>;
    initServiceWorker(config?: ServiceWorkerConfig): Promise<void>;
    private _normalizeSwUrl;
    private onSWMessage;
    private handleStreaming;
    private _wsBridge;
    private _wsConns;
    private _startWsBridge;
    private _handleWsConnect;
    private _handleWorkerWsFrame;
    private _handleWsSend;
    private _handleWsClose;
    private notifySW;
    createFetchHandler(): (req: Request) => Promise<Response>;
}
export declare function getProxyInstance(opts?: ProxyOptions): RequestProxy;
export declare function resetProxy(): void;
export default RequestProxy;
