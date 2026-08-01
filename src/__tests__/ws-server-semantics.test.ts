import { describe, it, expect, afterEach } from "vitest";
import {
  WebSocket,
  WebSocketServer,
  OPEN,
  CLOSED,
  CONNECTING,
} from "../polyfills/ws";

describe("ws server semantics", () => {
  let servers: WebSocketServer[] = [];

  afterEach(() => {
    for (const s of servers) {
      try {
        s.close();
      } catch {
        /* */
      }
    }
    servers = [];
  });

  it("handleUpgrade does not auto-emit connection", async () => {
    const wss = new WebSocketServer({ noServer: true });
    servers.push(wss);

    let connectionCount = 0;
    wss.on("connection", () => {
      connectionCount++;
    });

    let doneCalled = false;
    await new Promise<void>((resolve) => {
      wss.handleUpgrade({}, {}, Buffer.alloc(0), (_ws) => {
        doneCalled = true;
        resolve();
      });
    });

    // allow any stray emit microtask
    await new Promise((r) => setTimeout(r, 20));
    expect(doneCalled).toBe(true);
    expect(connectionCount).toBe(0);
  });

  it("BC connect only accepts matching path", async () => {
    if (typeof BroadcastChannel === "undefined") return;

    const wss = new WebSocketServer({ path: "/socket", noServer: false });
    servers.push(wss);

    let got = 0;
    wss.on("connection", () => {
      got++;
    });

    const wrong = new WebSocket("/other");
    await new Promise<void>((resolve) => {
      wrong.on("error", () => resolve());
      wrong.on("close", () => resolve());
      setTimeout(resolve, 150);
    });
    expect(got).toBe(0);
    expect(wrong.readyState).toBe(CLOSED);

    const right = new WebSocket("/socket");
    await new Promise<void>((resolve, reject) => {
      right.on("open", () => resolve());
      right.on("error", () => reject(new Error("expected open")));
      setTimeout(() => reject(new Error("timeout")), 200);
    });
    expect(got).toBe(1);
    expect(right.readyState).toBe(OPEN);
    right.close();
  });

  it("does not force-OPEN without server ack", async () => {
    if (typeof BroadcastChannel === "undefined") return;

    // No server listening on this path
    const client = new WebSocket("/no-server-here");
    expect(client.readyState).toBe(CONNECTING);

    await new Promise<void>((resolve) => {
      client.on("error", () => resolve());
      client.on("close", () => resolve());
      setTimeout(resolve, 200);
    });

    expect(client.readyState).toBe(CLOSED);
  });

  it("server send delivers to client without local echo", async () => {
    if (typeof BroadcastChannel === "undefined") return;

    const wss = new WebSocketServer({ path: "/echo-test" });
    servers.push(wss);

    const serverSockP = new Promise<InstanceType<typeof WebSocket>>((resolve) => {
      wss.on("connection", (sock) => resolve(sock as InstanceType<typeof WebSocket>));
    });

    const client = new WebSocket("/echo-test");
    await new Promise<void>((resolve, reject) => {
      client.on("open", () => resolve());
      client.on("error", (e) => reject(e));
    });

    const serverSock = await serverSockP;
    let clientMsgs = 0;
    let serverEcho = 0;
    client.on("message", () => {
      clientMsgs++;
    });
    serverSock.on("message", () => {
      serverEcho++;
    });

    serverSock.send("from-server");
    await new Promise((r) => setTimeout(r, 30));

    expect(clientMsgs).toBe(1);
    expect(serverEcho).toBe(0);
    client.close();
  });
});
