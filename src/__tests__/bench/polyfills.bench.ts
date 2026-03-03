import { describe, bench } from "vitest";
import { EventEmitter } from "../../polyfills/events";
import { Buffer } from "../../polyfills/buffer";
import * as pathPolyfill from "../../polyfills/path";
import {
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
} from "../../helpers/byte-encoding";
import { quickDigest } from "../../helpers/digest";

describe("EventEmitter", () => {
  bench("on + emit (1 listener, 100 emits)", () => {
    const ee = new EventEmitter();
    ee.on("data", () => {});
    for (let i = 0; i < 100; i++) ee.emit("data", i);
  });

  bench("on + emit (10 listeners, 100 emits)", () => {
    const ee = new EventEmitter();
    for (let i = 0; i < 10; i++) ee.on("data", () => {});
    for (let i = 0; i < 100; i++) ee.emit("data", i);
  });

  bench("once + emit (100 cycles)", () => {
    const ee = new EventEmitter();
    for (let i = 0; i < 100; i++) {
      ee.once("event", () => {});
      ee.emit("event");
    }
  });

  bench("removeListener (10 listeners)", () => {
    const ee = new EventEmitter();
    const handlers = Array.from({ length: 10 }, () => () => {});
    handlers.forEach((h) => ee.on("data", h));
    handlers.forEach((h) => ee.removeListener("data", h));
  });
});

describe("Buffer", () => {
  bench("Buffer.from(string, 'utf8') - 1KB", () => {
    Buffer.from("x".repeat(1024));
  });

  bench("Buffer.from(string, 'base64') - 1KB", () => {
    const b64 = bytesToBase64(new Uint8Array(768));
    Buffer.from(b64, "base64");
  });

  bench("Buffer.from(string, 'hex') - 1KB", () => {
    const hex = bytesToHex(new Uint8Array(512));
    Buffer.from(hex, "hex");
  });

  bench("Buffer.alloc(4096)", () => {
    Buffer.alloc(4096);
  });

  bench("Buffer.concat (10 x 1KB)", () => {
    const chunks = Array.from({ length: 10 }, () => Buffer.alloc(1024));
    Buffer.concat(chunks);
  });

  bench("Buffer.toString('utf8') - 4KB", () => {
    const buf = Buffer.alloc(4096, 0x61);
    buf.toString("utf8");
  });

  bench("Buffer.toString('base64') - 4KB", () => {
    const buf = Buffer.alloc(4096, 0x61);
    buf.toString("base64");
  });
});

describe("path polyfill", () => {
  bench("join (3 segments)", () => {
    pathPolyfill.join("/usr", "local", "bin");
  });

  bench("resolve (relative)", () => {
    pathPolyfill.resolve("src", "index.ts");
  });

  bench("resolve (absolute)", () => {
    pathPolyfill.resolve("/home/user", "project", "src");
  });

  bench("dirname", () => {
    pathPolyfill.dirname("/home/user/project/src/index.ts");
  });

  bench("basename", () => {
    pathPolyfill.basename("/home/user/project/src/index.ts");
  });

  bench("extname", () => {
    pathPolyfill.extname("/home/user/project/src/index.ts");
  });

  bench("normalize (complex)", () => {
    pathPolyfill.normalize("/home/user/../user/./project//src/./index.ts");
  });

  bench("parse", () => {
    pathPolyfill.parse("/home/user/project/src/index.ts");
  });
});

describe("Byte encoding", () => {
  const small = new Uint8Array(256);
  const medium = new Uint8Array(10_000);
  const large = new Uint8Array(100_000);

  bench("bytesToBase64 - 256B", () => {
    bytesToBase64(small);
  });
  bench("bytesToBase64 - 10KB", () => {
    bytesToBase64(medium);
  });
  bench("bytesToBase64 - 100KB", () => {
    bytesToBase64(large);
  });

  bench("base64ToBytes - 10KB", () => {
    const encoded = bytesToBase64(medium);
    base64ToBytes(encoded);
  });

  bench("bytesToHex - 10KB", () => {
    bytesToHex(medium);
  });
});

describe("quickDigest", () => {
  bench("short string (50 chars)", () => {
    quickDigest("a".repeat(50));
  });

  bench("medium string (5KB)", () => {
    quickDigest("a".repeat(5_000));
  });

  bench("long string (50KB)", () => {
    quickDigest("a".repeat(50_000));
  });
});
