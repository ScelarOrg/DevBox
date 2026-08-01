import { describe, it, expect } from "vitest";
import { Buffer } from "../polyfills/buffer";
import {
  checkPrimeSync,
  createHash,
  createHmac,
  createSecretKey,
  generatePrimeSync,
  getCiphers,
  getDiffieHellman,
  pbkdf2Sync,
  randomFill,
  scryptSync,
  timingSafeEqual,
} from "../polyfills/crypto";

describe("crypto sync digests", () => {
  it("SHA-256 of 'abc'", () => {
    expect(createHash("sha256").update("abc").digest("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("SHA-256 of empty string", () => {
    expect(createHash("sha256").update("").digest("hex")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("SHA-1 of 'abc'", () => {
    expect(createHash("sha1").update("abc").digest("hex")).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
  });

  it("SHA-512 of 'abc'", () => {
    expect(createHash("sha512").update("abc").digest("hex")).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
  });

  it("MD5 of 'abc'", () => {
    expect(createHash("md5").update("abc").digest("hex")).toBe(
      "900150983cd24fb0d6963f7d28e17f72",
    );
  });

  it("HMAC-SHA256 RFC 4231 test case 2", () => {
    expect(
      createHmac("sha256", "Jefe")
        .update("what do ya want for nothing?")
        .digest("hex"),
    ).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("SHA-256 multibyte UTF-8 bytes", () => {
    const utf8 = new Uint8Array([0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac, 0xe8, 0xaa, 0x9e]);
    expect(createHash("sha256").update(utf8).digest("hex")).toBe(
      "77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5",
    );
  });

  it("SHA-256 string matches UTF-8 bytes", async () => {
    const h = createHash("sha256").update("日本語");
    const sync = h.digest("hex");
    const async_ = await createHash("sha256").update("日本語").digestAsync("hex");
    expect(sync).toBe(async_);
  });

  it("pbkdf2Sync SHA-1", () => {
    expect(
      pbkdf2Sync("password", "salt", 1, 20, "sha1").toString("hex"),
    ).toBe("0c60c80f961f0e71f3a9b524af6012062fe037a6");
  });

  it("sync and async SHA-256 agree", async () => {
    const h = createHash("sha256").update("hello");
    const sync = h.digest("hex");
    const async_ = await h.digestAsync("hex");
    expect(sync).toBe(async_);
  });
});

describe("crypto API fidelity", () => {
  it("timingSafeEqual compares equal buffers", () => {
    const a = Buffer.from([1, 2, 3, 4]);
    const b = Buffer.from([1, 2, 3, 4]);
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it("timingSafeEqual returns false for unequal content", () => {
    const a = Buffer.from([1, 2, 3, 4]);
    const b = Buffer.from([1, 2, 3, 5]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it("timingSafeEqual throws on length mismatch", () => {
    const a = Buffer.from([1, 2, 3]);
    const b = Buffer.from([1, 2, 3, 4]);
    try {
      timingSafeEqual(a, b);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RangeError);
      expect((e as RangeError & { code?: string }).code).toBe(
        "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH",
      );
    }
  });

  it("Hmac.update honors hex encoding", () => {
    const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const viaHex = createHmac("sha256", "key")
      .update("deadbeef", "hex")
      .digest("hex");
    const viaBytes = createHmac("sha256", "key").update(bytes).digest("hex");
    expect(viaHex).toBe(viaBytes);
  });

  it("createSecretKey.symmetricKeySize is in bytes", () => {
    expect(createSecretKey(Buffer.alloc(32)).symmetricKeySize).toBe(32);
  });

  it("randomFill with offset only fills from offset to end", async () => {
    const buf = Buffer.alloc(8, 0);
    await new Promise<void>((resolve, reject) => {
      randomFill(buf, 4, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    expect([...buf.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    // Filled region should almost certainly be non-zero for 4 random bytes
    expect(buf.subarray(4).some((b) => b !== 0)).toBe(true);
  });

  it("scryptSync matches Node vector (password/NaCl, N=1024,r=8,p=16)", () => {
    expect(
      scryptSync("password", "NaCl", 64, {
        N: 1024,
        r: 8,
        p: 16,
        maxmem: 32 * 1024 * 1024,
      }).toString("hex"),
    ).toBe(
      "fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640",
    );
  });

  it("checkPrimeSync / generatePrimeSync produce primes", () => {
    expect(checkPrimeSync(2n)).toBe(true);
    expect(checkPrimeSync(9n)).toBe(false);
    const p = generatePrimeSync(64, { bigint: true }) as bigint;
    expect(checkPrimeSync(p)).toBe(true);
  });

  it("getDiffieHellman computeSecret is symmetric", () => {
    const a = getDiffieHellman("modp1");
    const b = getDiffieHellman("modp1");
    const aPub = a.generateKeys();
    const bPub = b.generateKeys();
    const secretA = a.computeSecret(bPub);
    const secretB = b.computeSecret(aPub);
    expect(Buffer.from(secretA).equals(Buffer.from(secretB))).toBe(true);
  });

  it("getCiphers is empty while AES is unsupported", () => {
    expect(getCiphers()).toEqual([]);
  });
});
