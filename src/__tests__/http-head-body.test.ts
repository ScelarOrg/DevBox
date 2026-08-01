import { describe, it, expect } from "vitest";
import { createServer, request } from "../polyfills/http";
import { Buffer } from "../polyfills/buffer";

describe("HEAD response body stripping", () => {
  it("dispatchRequest returns empty body for HEAD even if handler writes", async () => {
    const server = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Length", "5");
      res.end("hello");
    });
    server.listen(0);

    const result = await server.dispatchRequest("HEAD", "/", {});
    server.close();

    expect(result.statusCode).toBe(200);
    expect(result.headers["content-length"]).toBe("5");
    expect(result.body.length).toBe(0);
  });

  it("client IncomingMessage for HEAD has no body bytes", async () => {
    const server = createServer((_req, res) => {
      res.end("secret-body");
    });
    await new Promise<void>((resolve) => server.listen(19801, () => resolve()));

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = request(
        { hostname: "127.0.0.1", port: 19801, path: "/", method: "HEAD" },
        (res) => {
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.end();
    });

    server.close();
    expect(Buffer.concat(chunks).length).toBe(0);
  });
});
