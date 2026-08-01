import { describe, it, expect } from "vitest";
import { createServer, request } from "../polyfills/http";

describe("Client IncomingMessage.complete ordering", () => {
  it("complete is false during response event, true after body ends", async () => {
    const server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(19802, () => resolve()));

    let completeAtResponse: boolean | undefined;
    let completeAtEnd: boolean | undefined;

    await new Promise<void>((resolve, reject) => {
      const req = request(
        { hostname: "127.0.0.1", port: 19802, path: "/", method: "GET" },
        (res) => {
          completeAtResponse = res.complete;
          res.on("end", () => {
            completeAtEnd = res.complete;
            resolve();
          });
          res.resume();
        },
      );
      req.on("error", reject);
      req.end();
    });

    server.close();
    expect(completeAtResponse).toBe(false);
    expect(completeAtEnd).toBe(true);
  });

  it("writeHead sets headersSent", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(201, { "X-Test": "1" });
      expect(res.headersSent).toBe(true);
      expect(() => res.setHeader("X-Late", "no")).toThrow(/already dispatched/i);
      res.end();
    });
    server.listen(0);
    const result = await server.dispatchRequest("GET", "/", {});
    server.close();
    expect(result.statusCode).toBe(201);
  });
});
