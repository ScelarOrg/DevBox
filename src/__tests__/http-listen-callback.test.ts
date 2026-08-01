import { describe, it, expect } from "vitest";
import { createServer } from "../polyfills/http";

describe("http.Server.listen callback arity", () => {
  it("invokes callback for listen(port, cb)", async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    expect(server.listening).toBe(true);
    server.close();
  });

  it("invokes callback for listen(port, undefined, cb) — Expo/Metro shape", async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    let called = false;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("listen callback was never invoked")),
        2000,
      );
      server.listen(0, undefined as unknown as string, () => {
        called = true;
        clearTimeout(t);
        resolve();
      });
    });
    expect(called).toBe(true);
    expect(server.listening).toBe(true);
    server.close();
  });

  it("invokes callback for listen(port, host, cb)", async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    expect(server.listening).toBe(true);
    server.close();
  });
});
