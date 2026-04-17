// bridges Service Worker HTTP requests to virtual servers.
// intercepts browser fetches via SW and routes them to the http polyfill's server registry.

import type { CompletedResponse } from "./polyfills/http";
import {
  Server,
  setServerListenCallback,
  setServerCloseCallback,
  getServer,
  encodeFrame,
  decodeFrame,
} from "./polyfills/http";
import { EventEmitter } from "./polyfills/events";
import { Buffer } from "./polyfills/buffer";
import { bytesToBase64 } from "./helpers/byte-encoding";
import { TIMEOUTS, WS_OPCODE } from "./constants/config";
import { createHash } from "./polyfills/crypto";

const _enc = new TextEncoder();

export interface IVirtualServer {
  listening: boolean;
  address(): { port: number; address: string; family: string } | null;
  dispatchRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer | string,
  ): Promise<CompletedResponse>;
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

export class RequestProxy extends EventEmitter {
  static DEBUG = false;
  private registry = new Map<number, RegisteredServer>();
  private baseUrl: string;
  private opts: ProxyOptions;
  private channel: MessageChannel | null = null;
  private swReady = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private _processManager: any | null = null;
  private _workerWsConns = new Map<string, { pid: number }>();
  private _previewScript: string | null = null;
  private _swAuthToken: string | null = null;
  private _wsBridgeToken: string | null = null;

  constructor(opts: ProxyOptions = {}) {
    super();
    this.opts = opts;
    this.baseUrl =
      typeof location !== "undefined"
        ? opts.baseUrl || `${location.protocol}//${location.host}`
        : opts.baseUrl || "http://localhost";

    setServerListenCallback((port, srv) => this.register(srv, port));
    setServerCloseCallback((port) => this.unregister(port));
  }

  setProcessManager(pm: any): void {
    this._processManager = pm;
    pm.on("ws-frame", (msg: any) => {
      this._handleWorkerWsFrame(msg);
    });
  }

  register(
    server: Server | IVirtualServer,
    port: number,
    hostname = "0.0.0.0",
  ): void {
    this.registry.set(port, { server, port, hostname });
    const url = this.serverUrl(port);
    this.emit("server-ready", port, url);
    this.opts.onServerReady?.(port, url);
    this.notifySW("server-registered", { port, hostname });
  }

  unregister(port: number): void {
    this.registry.delete(port);
    this.notifySW("server-unregistered", { port });
  }

  // Sends a script to the Service Worker that gets injected into every HTML
  // response served to preview iframes. Runs before any page content.
  setPreviewScript(script: string | null): void {
    this._previewScript = script;
    this._sendPreviewScriptToSW();
  }

  setWatermark(enabled: boolean): void {
    if (
      typeof navigator !== "undefined" &&
      navigator.serviceWorker?.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "set-watermark",
        enabled,
        token: this._swAuthToken,
      });
    }
  }

  private _sendPreviewScriptToSW(): void {
    if (
      typeof navigator !== "undefined" &&
      navigator.serviceWorker?.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "set-preview-script",
        script: this._previewScript,
        token: this._swAuthToken,
      });
    }
  }

  private _sendWsTokenToSW(): void {
    if (
      typeof navigator !== "undefined" &&
      navigator.serviceWorker?.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "set-ws-token",
        wsToken: this._wsBridgeToken,
        token: this._swAuthToken,
      });
    }
  }

  serverUrl(port: number): string {
    return `${this.baseUrl}/__virtual__/${port}`;
  }

  activePorts(): number[] {
    return [...this.registry.keys()];
  }

  async handleRequest(
    port: number,
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: ArrayBuffer,
  ): Promise<CompletedResponse> {
    const entry = this.registry.get(port);
    if (!entry) {
      return {
        statusCode: 503,
        statusMessage: "Service Unavailable",
        headers: { "Content-Type": "text/plain" },
        body: Buffer.from(`No server on port ${port}`),
      };
    }
    try {
      const buf = body ? Buffer.from(new Uint8Array(body)) : undefined;
      return await entry.server.dispatchRequest(method, url, headers, buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal Server Error";
      return {
        statusCode: 500,
        statusMessage: "Internal Server Error",
        headers: { "Content-Type": "text/plain" },
        body: Buffer.from(msg),
      };
    }
  }

  async initServiceWorker(config?: ServiceWorkerConfig): Promise<void> {
    if (!("serviceWorker" in navigator))
      throw new Error("Service Workers not supported");

    const swPath = config?.swUrl ?? "/__sw__.js";
    // unregister old SWs and re-register with cache-busting to ensure latest __sw__.js
    const existingRegs = await navigator.serviceWorker.getRegistrations();
    for (const r of existingRegs) {
      await r.unregister();
    }
    await new Promise(r => setTimeout(r, 100));

    const controllerReady = new Promise<void>((res) => {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => res(),
        { once: true },
      );
    });

    const swUrl = `${swPath}?v=${Date.now()}`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope: "/", updateViaCache: "none" });

    const sw = reg.installing || reg.waiting || reg.active;
    if (!sw) throw new Error("Service Worker registration failed");

    await new Promise<void>((resolve) => {
      if (sw.state === "activated") return resolve();
      const check = () => {
        if (sw.state === "activated") {
          sw.removeEventListener("statechange", check);
          resolve();
        }
      };
      sw.addEventListener("statechange", check);
    });

    this._swAuthToken = crypto.randomUUID();

    this.channel = new MessageChannel();
    this.channel.port1.onmessage = this.onSWMessage.bind(this);
    sw.postMessage({ type: "init", port: this.channel.port2, token: this._swAuthToken }, [
      this.channel.port2,
    ]);

    await controllerReady;

    const reinit = () => {
      if (navigator.serviceWorker.controller) {
        this.channel = new MessageChannel();
        this.channel.port1.onmessage = this.onSWMessage.bind(this);
        navigator.serviceWorker.controller.postMessage(
          { type: "init", port: this.channel.port2, token: this._swAuthToken },
          [this.channel.port2],
        );
        // Resend preview script to the new SW controller
        if (this._previewScript !== null) {
          this._sendPreviewScriptToSW();
        }
        // re-send ws bridge token too
        if (this._wsBridgeToken) {
          this._sendWsTokenToSW();
        }
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", reinit);
    navigator.serviceWorker.addEventListener("message", (ev) => {
      if (ev.data?.type === "sw-needs-init") reinit();
    });

    this.heartbeat = setInterval(() => {
      this.channel?.port1.postMessage({ type: "keepalive" });
    }, TIMEOUTS.SW_HEARTBEAT);

    this.swReady = true;
    this.emit("sw-ready");

    this._startWsBridge();
  }

  // strip /__preview__/{port} prefix from SW URLs if present
  private _normalizeSwUrl(url: string, headers: Record<string, string>): string | null {
    // Strip /__preview__/{port} prefix (fixes RSC HMR .rsc requests etc.)
    const ppMatch = url.match(/^\/__preview__\/\d+(.*)?$/);
    if (ppMatch) {
      let stripped = ppMatch[1] || "/";
      if (stripped[0] !== "/") stripped = "/" + stripped;
      const qIdx = url.indexOf("?");
      if (qIdx >= 0 && !stripped.includes("?")) {
        stripped += url.slice(qIdx);
      }
      return stripped;
    }
    return url;
  }

  private async onSWMessage(event: MessageEvent): Promise<void> {
    const { type, id, data } = event.data;
    RequestProxy.DEBUG &&
      console.log("[RequestProxy] SW:", type, id, data?.url);

    if (type === "request") {
      const { port, method, headers, body, streaming, originalUrl } = data;
      let url: string = data.url;

      const normalized = this._normalizeSwUrl(url, headers);
      if (normalized !== null && normalized !== url) {
        url = normalized;
      }

      try {
        if (streaming) {
          await this.handleStreaming(id, port, method, url, headers, body);
        } else {
          const resp = await this.handleRequest(
            port,
            method,
            url,
            headers,
            body,
          );
          // 404 + original URL = try fetching from the real network as fallback
          // (handles cross-origin resources like Google Fonts, CDN assets, etc.)
          if (resp.statusCode === 404 && originalUrl) {
            try {
              const origUrl = new URL(originalUrl);
              const isLocalhost = origUrl.hostname === "localhost" ||
                origUrl.hostname === "127.0.0.1" ||
                origUrl.hostname === "0.0.0.0";
              if (!isLocalhost) {
                const fallbackResp = await fetch(originalUrl);
                const fallbackBody = await fallbackResp.arrayBuffer();
                const fallbackHeaders: Record<string, string> = {};
                fallbackResp.headers.forEach((v, k) => {
                  fallbackHeaders[k] = v;
                });
                const fallbackB64 = fallbackBody.byteLength > 0
                  ? bytesToBase64(new Uint8Array(fallbackBody))
                  : "";
                this.channel?.port1.postMessage({
                  type: "response",
                  id,
                  data: {
                    statusCode: fallbackResp.status,
                    statusMessage: fallbackResp.statusText || "OK",
                    headers: fallbackHeaders,
                    bodyBase64: fallbackB64,
                  },
                });
                return;
              }
            } catch (fallbackErr) {
            }
          }

          let bodyB64 = "";
          if (resp.body?.length) {
            const bytes =
              resp.body instanceof Uint8Array ? resp.body : new Uint8Array(0);
            bodyB64 = bytesToBase64(bytes);
          }
          this.channel?.port1.postMessage({
            type: "response",
            id,
            data: {
              statusCode: resp.statusCode,
              statusMessage: resp.statusMessage,
              headers: resp.headers,
              bodyBase64: bodyB64,
            },
          });
        }
      } catch (err) {
        this.channel?.port1.postMessage({
          type: "response",
          id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  private async handleStreaming(
    id: number,
    port: number,
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: ArrayBuffer,
  ): Promise<void> {
    const entry = this.registry.get(port);
    if (!entry) {
      this.channel?.port1.postMessage({
        type: "stream-start",
        id,
        data: {
          statusCode: 503,
          statusMessage: "Service Unavailable",
          headers: {},
        },
      });
      this.channel?.port1.postMessage({ type: "stream-end", id });
      return;
    }

    const srv = entry.server as any;
    if (typeof srv.handleStreamingRequest === "function") {
      const buf = body ? Buffer.from(new Uint8Array(body)) : undefined;
      await srv.handleStreamingRequest(
        method,
        url,
        headers,
        buf,
        (
          statusCode: number,
          statusMessage: string,
          h: Record<string, string>,
        ) => {
          this.channel?.port1.postMessage({
            type: "stream-start",
            id,
            data: { statusCode, statusMessage, headers: h },
          });
        },
        (chunk: string | Uint8Array) => {
          const bytes = typeof chunk === "string" ? _enc.encode(chunk) : chunk;
          this.channel?.port1.postMessage({
            type: "stream-chunk",
            id,
            data: { chunkBase64: bytesToBase64(bytes) },
          });
        },
        () => {
          this.channel?.port1.postMessage({ type: "stream-end", id });
        },
      );
    } else {
      const buf = body ? Buffer.from(new Uint8Array(body)) : undefined;
      const resp = await entry.server.dispatchRequest(
        method,
        url,
        headers,
        buf,
      );
      this.channel?.port1.postMessage({
        type: "stream-start",
        id,
        data: {
          statusCode: resp.statusCode,
          statusMessage: resp.statusMessage,
          headers: resp.headers,
        },
      });
      if (resp.body?.length) {
        const bytes =
          resp.body instanceof Uint8Array ? resp.body : new Uint8Array(0);
        this.channel?.port1.postMessage({
          type: "stream-chunk",
          id,
          data: { chunkBase64: bytesToBase64(bytes) },
        });
      }
      this.channel?.port1.postMessage({ type: "stream-end", id });
    }
  }

  // ---- WebSocket bridge ----

  private _wsBridge: BroadcastChannel | null = null;
  private _wsConns = new Map<
    string,
    { socket: import("./polyfills/net").TcpSocket; cleanup: () => void }
  >();

  // listens on BroadcastChannel "nodepod-ws" for connect/send/close from preview
  // iframes, dispatches WS upgrade events on the virtual server, relays frames.
  private _startWsBridge(): void {
    if (typeof BroadcastChannel === "undefined") return;
    if (this._wsBridge) return;

    this._wsBridgeToken = crypto.randomUUID();

    this._wsBridge = new BroadcastChannel("nodepod-ws");
    this._wsBridge.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || !d.kind) return;

      // check token
      if (this._wsBridgeToken && d.token !== this._wsBridgeToken) return;

      if (d.kind === "ws-connect") {
        this._handleWsConnect(d.uid, d.port, d.path, d.protocols);
      } else if (d.kind === "ws-send") {
        this._handleWsSend(d.uid, d.data, d.type);
      } else if (d.kind === "ws-close") {
        this._handleWsClose(d.uid, d.code, d.reason);
      }
    };

    // Send the WS bridge token to the Service Worker so it can embed it in the WS shim
    this._sendWsTokenToSW();
  }

  private _handleWsConnect(
    uid: string,
    port: number,
    path: string,
    protocols?: string,
  ): void {
    const server = getServer(port);

    const wsKey = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
    );

    const headers: Record<string, string> = {
      upgrade: "websocket",
      connection: "Upgrade",
      "sec-websocket-key": wsKey,
      "sec-websocket-version": "13",
      host: `localhost:${port}`,
    };
    if (protocols) headers["sec-websocket-protocol"] = protocols;

    // no local server -- try routing through ProcessManager (worker mode)
    if (!server) {
      if (this._processManager) {
        const pid = this._processManager.dispatchWsUpgrade(port, uid, path || "/", headers);
        if (pid >= 0) {
          this._workerWsConns.set(uid, { pid });
          return;
        }
      }
      this._wsBridge?.postMessage({
        kind: "ws-error",
        uid,
        message: `No server on port ${port}`,
        token: this._wsBridgeToken,
      });
      return;
    }

    const { socket } = server.dispatchUpgrade(path || "/", headers);
    const bridge = this._wsBridge!;

    let outboundBuf = new Uint8Array(0);
    let handshakeDone = false;

    // intercept socket.write to decode WS frames from server and relay to iframe
    socket.write = ((
      chunk: Uint8Array | string,
      encOrCb?: BufferEncoding | ((err?: Error | null) => void),
      cb?: (err?: Error | null) => void,
    ): boolean => {
      const raw =
        typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
      const fn = typeof encOrCb === "function" ? encOrCb : cb;

      if (!handshakeDone) {
        const text = new TextDecoder().decode(raw);
        if (text.startsWith("HTTP/1.1 101")) {
          handshakeDone = true;
          bridge.postMessage({ kind: "ws-open", uid, token: this._wsBridgeToken });
          if (fn) queueMicrotask(() => fn(null));
          return true;
        }
      }

      const merged = new Uint8Array(outboundBuf.length + raw.length);
      merged.set(outboundBuf, 0);
      merged.set(raw, outboundBuf.length);
      outboundBuf = merged;

      while (outboundBuf.length >= 2) {
        const frame = decodeFrame(outboundBuf);
        if (!frame) break;
        outboundBuf = outboundBuf.slice(frame.consumed);

        switch (frame.op) {
          case WS_OPCODE.TEXT: {
            const text = new TextDecoder().decode(frame.data);
            bridge.postMessage({
              kind: "ws-message",
              uid,
              data: text,
              type: "text",
              token: this._wsBridgeToken,
            });
            break;
          }
          case WS_OPCODE.BINARY:
            bridge.postMessage({
              kind: "ws-message",
              uid,
              data: Array.from(frame.data),
              type: "binary",
              token: this._wsBridgeToken,
            });
            break;
          case WS_OPCODE.CLOSE: {
            const code =
              frame.data.length >= 2
                ? (frame.data[0] << 8) | frame.data[1]
                : 1000;
            bridge.postMessage({ kind: "ws-closed", uid, code, token: this._wsBridgeToken });
            break;
          }
          case WS_OPCODE.PING:
            socket._feedData(
              Buffer.from(encodeFrame(WS_OPCODE.PONG, frame.data, true)),
            );
            break;
        }
      }

      if (fn) queueMicrotask(() => fn(null));
      return true;
    }) as any;

    const cleanup = () => {
      outboundBuf = new Uint8Array(0);
      try { socket.destroy(); } catch { /* */ }
    };
    this._wsConns.set(uid, { socket, cleanup });
  }

  private _handleWorkerWsFrame(msg: any): void {
    const bridge = this._wsBridge;
    if (!bridge) return;
    const uid = msg.uid;

    switch (msg.kind) {
      case "open":
        bridge.postMessage({ kind: "ws-open", uid, token: this._wsBridgeToken });
        break;
      case "text":
        bridge.postMessage({ kind: "ws-message", uid, data: msg.data, type: "text", token: this._wsBridgeToken });
        break;
      case "binary":
        bridge.postMessage({ kind: "ws-message", uid, data: msg.bytes, type: "binary", token: this._wsBridgeToken });
        break;
      case "close":
        bridge.postMessage({ kind: "ws-closed", uid, code: msg.code || 1000, token: this._wsBridgeToken });
        this._workerWsConns.delete(uid);
        break;
      case "error":
        bridge.postMessage({ kind: "ws-error", uid, message: msg.message, token: this._wsBridgeToken });
        this._workerWsConns.delete(uid);
        break;
    }
  }

  private _handleWsSend(
    uid: string,
    data: unknown,
    type?: string,
  ): void {
    const workerConn = this._workerWsConns.get(uid);
    if (workerConn && this._processManager) {
      let payload: Uint8Array;
      let op: number;
      if (type === "binary" && Array.isArray(data)) {
        payload = new Uint8Array(data);
        op = WS_OPCODE.BINARY;
      } else {
        payload = new TextEncoder().encode(String(data));
        op = WS_OPCODE.TEXT;
      }
      const frame = encodeFrame(op, payload, true);
      this._processManager.dispatchWsData(workerConn.pid, uid, Array.from(new Uint8Array(frame)));
      return;
    }

    const conn = this._wsConns.get(uid);
    if (!conn) return;

    let payload: Uint8Array;
    let op: number;
    if (type === "binary" && Array.isArray(data)) {
      payload = new Uint8Array(data);
      op = WS_OPCODE.BINARY;
    } else {
      payload = new TextEncoder().encode(String(data));
      op = WS_OPCODE.TEXT;
    }
    const frame = encodeFrame(op, payload, true);
    conn.socket._feedData(Buffer.from(frame));
  }

  private _handleWsClose(uid: string, code?: number, reason?: string): void {
    const workerConn = this._workerWsConns.get(uid);
    if (workerConn && this._processManager) {
      this._processManager.dispatchWsClose(workerConn.pid, uid, code ?? 1000);
      this._workerWsConns.delete(uid);
      return;
    }

    const conn = this._wsConns.get(uid);
    if (!conn) return;

    const codeBuf = new Uint8Array(2);
    codeBuf[0] = ((code ?? 1000) >> 8) & 0xff;
    codeBuf[1] = (code ?? 1000) & 0xff;
    const frame = encodeFrame(WS_OPCODE.CLOSE, codeBuf, true);
    try { conn.socket._feedData(Buffer.from(frame)); } catch { /* */ }

    conn.cleanup();
    this._wsConns.delete(uid);
  }

  private notifySW(type: string, data: unknown): void {
    if (this.swReady && this.channel)
      this.channel.port1.postMessage({ type, data });
  }

  createFetchHandler(): (req: Request) => Promise<Response> {
    return async (req: Request): Promise<Response> => {
      const parsed = new URL(req.url);
      const match = parsed.pathname.match(/^\/__virtual__\/(\d+)(\/.*)?$/);
      if (!match) throw new Error("Not a virtual server request");

      const port = parseInt(match[1], 10);
      const path = match[2] || "/";
      const hdrs: Record<string, string> = {};
      req.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
      let reqBody: ArrayBuffer | undefined;
      if (req.method !== "GET" && req.method !== "HEAD")
        reqBody = await req.arrayBuffer();

      const resp = await this.handleRequest(
        port,
        req.method,
        path + parsed.search,
        hdrs,
        reqBody,
      );
      let body: BodyInit | null = null;
      if (resp.body instanceof Uint8Array) {
        body = new Uint8Array(resp.body.buffer as ArrayBuffer, resp.body.byteOffset, resp.body.byteLength) as Uint8Array<ArrayBuffer>;
      } else if (typeof resp.body === "string") {
        body = resp.body;
      }
      return new Response(body, {
        status: resp.statusCode,
        statusText: resp.statusMessage,
        headers: resp.headers,
      });
    };
  }
}

// ── Singleton ──

let instance: RequestProxy | null = null;

export function getProxyInstance(opts?: ProxyOptions): RequestProxy {
  if (!instance) instance = new RequestProxy(opts);
  return instance;
}

export function resetProxy(): void {
  instance = null;
}

export default RequestProxy;
