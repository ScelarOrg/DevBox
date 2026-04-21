// TCP / net polyfill -- all networking is simulated, no real kernel sockets

import { EventEmitter, type EventHandler } from "./events";
import { Duplex } from "./stream";
import { Buffer } from "./buffer";
import { PORT_RANGE } from "../constants/config";
import { getRegistry, type Handle } from "../helpers/event-loop";


export interface NetAddress {
  address: string;
  family: string;
  port: number;
}

export interface SocketConfig {
  allowHalfOpen?: boolean;
  readable?: boolean;
  writable?: boolean;
}

export interface ServerConfig {
  allowHalfOpen?: boolean;
  pauseOnConnect?: boolean;
}

export interface BindOptions {
  port?: number;
  host?: string;
  backlog?: number;
}


export interface TcpSocket extends Duplex {
  localAddress: string;
  localPort: number;
  remoteAddress?: string;
  remotePort?: number;
  remoteFamily?: string;
  connecting: boolean;
  pending: boolean;
  destroyed: boolean;
  encrypted: boolean;
  readyState: string;
  bytesRead: number;
  bytesWritten: number;
  connect(portOrOpts: any, hostOrCb?: any, cb?: any): this;
  address(): NetAddress | null;
  setEncoding(enc: BufferEncoding): this;
  setTimeout(ms: number, handler?: () => void): this;
  setNoDelay(v?: boolean): this;
  setKeepAlive(on?: boolean, delay?: number): this;
  ref(): this;
  unref(): this;
  destroy(err?: Error): this;
  _feedData(chunk: Buffer | string): void;
  _feedEnd(): void;
}

export interface TcpSocketConstructor {
  new (cfg?: SocketConfig): TcpSocket;
  (this: any, cfg?: SocketConfig): void;
  prototype: any;
}

export const TcpSocket = function TcpSocket(this: any, _cfg?: SocketConfig) {
  if (!this) return;
  Duplex.call(this);

  this._isConnecting = false;
  this._isConnected = false;
  this._isDestroyed = false;
  this._peerAddr = "";
  this._peerPort = 0;
  this._selfAddr = "127.0.0.1";
  this._selfPort = 0;

  this.localAddress = "127.0.0.1";
  this.localPort = 0;
  this.remoteAddress = undefined;
  this.remotePort = undefined;
  this.remoteFamily = undefined;
  this.connecting = false;
  this.pending = false;
  this.destroyed = false;
  this.encrypted = false;
  this.readyState = "closed";
  this.bytesRead = 0;
  this.bytesWritten = 0;
} as unknown as TcpSocketConstructor;

Object.setPrototypeOf(TcpSocket.prototype, Duplex.prototype);

TcpSocket.prototype.connect = function connect(
  portOrOpts: number | { port: number; host?: string },
  hostOrCb?: string | (() => void),
  cb?: () => void,
): any {
  let port: number;
  let host = "127.0.0.1";
  let done: (() => void) | undefined;

  if (typeof portOrOpts === "number") {
    port = portOrOpts;
    if (typeof hostOrCb === "string") {
      host = hostOrCb;
      done = cb;
    } else done = hostOrCb;
  } else {
    port = portOrOpts.port;
    host = portOrOpts.host ?? "127.0.0.1";
    done = typeof hostOrCb === "function" ? hostOrCb : cb;
  }

  this._isConnecting = true;
  this.connecting = true;
  this._peerAddr = host;
  this._peerPort = port;
  this.remoteAddress = host;
  this.remotePort = port;
  this.remoteFamily = "IPv4";
  this.readyState = "opening";

  // keep the loop alive while connected, released on destroy
  if (!this._elHandle) this._elHandle = getRegistry().register("TCPSocketWrap");

  const self = this;
  queueMicrotask(() => {
    self._isConnecting = false;
    self._isConnected = true;
    self.connecting = false;
    self.readyState = "open";
    self.emit("connect");
    if (done) done();
  });

  return this;
};

TcpSocket.prototype.address = function address(): NetAddress | null {
  if (!this._isConnected) return null;
  return { address: this._selfAddr, family: "IPv4", port: this._selfPort };
};

TcpSocket.prototype.setEncoding = function setEncoding(_enc: BufferEncoding): any {
  return this;
};

TcpSocket.prototype.setTimeout = function setTimeout(ms: number, handler?: () => void): any {
  if (handler) this.once("timeout", handler);
  return this;
};

TcpSocket.prototype.setNoDelay = function setNoDelay(_v?: boolean): any {
  return this;
};

TcpSocket.prototype.setKeepAlive = function setKeepAlive(_on?: boolean, _delay?: number): any {
  return this;
};

TcpSocket.prototype.ref = function ref(): any {
  (this._elHandle as Handle | null)?.ref();
  return this;
};

TcpSocket.prototype.unref = function unref(): any {
  (this._elHandle as Handle | null)?.unref();
  return this;
};

TcpSocket.prototype.destroy = function destroy(err?: Error): any {
  if (this._isDestroyed) return this;
  this._isDestroyed = true;
  this._isConnected = false;
  this.destroyed = true;
  this.readyState = "closed";
  (this._elHandle as Handle | null)?.close();
  this._elHandle = null;
  if (err) this.emit("error", err);
  const self = this;
  queueMicrotask(() => self.emit("close", !!err));
  return this;
};

TcpSocket.prototype._feedData = function _feedData(chunk: Buffer | string): void {
  const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
  this.push(buf);
};

TcpSocket.prototype._feedEnd = function _feedEnd(): void {
  this.push(null);
};


export interface TcpServer extends EventEmitter {
  listening: boolean;
  maxConnections?: number;
  listen(portOrOpts?: any, hostOrCb?: any, backlogOrCb?: any, cb?: any): this;
  address(): (NetAddress & { host?: string }) | null;
  close(cb?: (err?: Error) => void): this;
  getConnections(cb?: (err: Error | null, n: number) => void): void;
  ref(): this;
  unref(): this;
  _acceptConnection(sock: TcpSocket): void;
}

export interface TcpServerConstructor {
  new (cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void), handler?: (sock: TcpSocket) => void): TcpServer;
  (this: any, cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void), handler?: (sock: TcpSocket) => void): void;
  prototype: any;
}

export const TcpServer = function TcpServer(
  this: any,
  cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void),
  handler?: (sock: TcpSocket) => void,
) {
  if (!this) return;
  EventEmitter.call(this);

  this._bound = false;
  this._addr = null;
  this._peers = new Set();
  this._cap = Infinity;
  this.listening = false;
  this.maxConnections = undefined;

  let fn: ((s: TcpSocket) => void) | undefined;
  if (typeof cfgOrHandler === "function") fn = cfgOrHandler;
  else fn = handler;
  if (fn) this.on("connection", fn as EventHandler);
} as unknown as TcpServerConstructor;

Object.setPrototypeOf(TcpServer.prototype, EventEmitter.prototype);

TcpServer.prototype.listen = function listen(
  portOrOpts?: number | BindOptions,
  hostOrCb?: string | number | (() => void),
  backlogOrCb?: number | (() => void),
  cb?: () => void,
): any {
  let port = 0;
  let host = "0.0.0.0";
  let done: (() => void) | undefined;

  if (typeof portOrOpts === "number") {
    port = portOrOpts;
    if (typeof hostOrCb === "string") {
      host = hostOrCb;
      done = typeof backlogOrCb === "function" ? backlogOrCb : cb;
    } else if (typeof hostOrCb === "function") {
      done = hostOrCb;
    } else {
      done = typeof backlogOrCb === "function" ? backlogOrCb : cb;
    }
  } else if (portOrOpts) {
    port = portOrOpts.port ?? 0;
    host = portOrOpts.host ?? "0.0.0.0";
    done = typeof hostOrCb === "function" ? hostOrCb : cb;
  }

  if (port === 0) port = PORT_RANGE.BASE + Math.floor(Math.random() * PORT_RANGE.RANGE);

  this._addr = { address: host, family: "IPv4", port };
  this._bound = true;
  this.listening = true;

  // keep the loop alive while listening, released on close
  if (!this._elHandle) this._elHandle = getRegistry().register("TCPServerWrap");

  const self = this;
  queueMicrotask(() => {
    self.emit("listening");
    if (done) done();
  });

  return this;
};

TcpServer.prototype.address = function address(): (NetAddress & { host?: string }) | null {
  if (!this._addr) return null;
  return { ...this._addr, host: this._addr.address };
};

TcpServer.prototype.close = function close(cb?: (err?: Error) => void): any {
  this._bound = false;
  this.listening = false;
  for (const s of this._peers) s.destroy();
  this._peers.clear();
  (this._elHandle as Handle | null)?.close();
  this._elHandle = null;
  const self = this;
  queueMicrotask(() => {
    self.emit("close");
    if (cb) cb();
  });
  return this;
};

TcpServer.prototype.getConnections = function getConnections(
  cb?: (err: Error | null, n: number) => void,
): void {
  if (typeof cb === "function") cb(null, this._peers.size);
};

TcpServer.prototype.ref = function ref(): any {
  (this._elHandle as Handle | null)?.ref();
  return this;
};

TcpServer.prototype.unref = function unref(): any {
  (this._elHandle as Handle | null)?.unref();
  return this;
};

TcpServer.prototype._acceptConnection = function _acceptConnection(sock: TcpSocket): void {
  if (!this._bound) {
    sock.destroy();
    return;
  }
  this._peers.add(sock);
  const self = this;
  sock.on("close", function onClose() { self._peers.delete(sock); });
  this.emit("connection", sock);
};


export function createServer(
  cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void),
  handler?: (sock: TcpSocket) => void,
): TcpServer {
  return new TcpServer(cfgOrHandler, handler);
}

export function createConnection(
  portOrOpts: number | { port: number; host?: string },
  hostOrCb?: string | (() => void),
  cb?: () => void,
): TcpSocket {
  return new TcpSocket().connect(portOrOpts, hostOrCb as string, cb);
}

export const connect = createConnection;

export function isIP(addr: string): number {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(addr)) return 4;
  if (/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(addr)) return 6;
  return 0;
}

export function isIPv4(addr: string): boolean {
  return isIP(addr) === 4;
}
export function isIPv6(addr: string): boolean {
  return isIP(addr) === 6;
}

export default {
  Socket: TcpSocket,
  Server: TcpServer,
  createServer,
  createConnection,
  connect,
  isIP,
  isIPv4,
  isIPv6,
};
