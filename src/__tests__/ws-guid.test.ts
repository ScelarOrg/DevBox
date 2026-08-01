import { describe, it, expect } from "vitest";
import { createHash } from "../polyfills/crypto";
import { WS_GUID } from "../polyfills/http";

describe("WebSocket RFC6455 GUID", () => {
  it("matches the RFC 6455 magic GUID", () => {
    expect(WS_GUID).toBe("258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
  });

  it("computes Sec-WebSocket-Accept for a fixed key", () => {
    // Example from RFC 6455 §1.3 / §4.2.2
    const key = "dGhlIHNhbXBsZSBub25jZQ==";
    const accept = createHash("sha1")
      .update(key + WS_GUID)
      .digest("base64");
    expect(accept).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });
});
