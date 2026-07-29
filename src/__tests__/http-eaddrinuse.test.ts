import { describe, it, expect } from "vitest";
import { createServer } from "../polyfills/http";

function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onErr = (e: unknown) => reject(e);
    server.once("error", onErr);
    server.listen(port, () => {
      server.removeListener("error", onErr);
      resolve();
    });
  });
}

describe("HTTP port registry EADDRINUSE", () => {
  it("second listen on the same port emits EADDRINUSE", async () => {
    const a = createServer((_req, res) => { res.end("a"); });
    const b = createServer((_req, res) => { res.end("b"); });
    await listen(a, 18765);

    const err = await new Promise<NodeJS.ErrnoException>((resolve) => {
      b.once("error", (e) => resolve(e as NodeJS.ErrnoException));
      b.listen(18765);
    });

    expect(err.code).toBe("EADDRINUSE");
    a.close();
  });

  it("allows re-listen after close", async () => {
    const a = createServer((_req, res) => { res.end("a"); });
    const b = createServer((_req, res) => { res.end("b"); });
    await listen(a, 18766);
    await new Promise<void>((resolve) => a.close(() => resolve()));
    await listen(b, 18766);
    b.close();
  });
});
