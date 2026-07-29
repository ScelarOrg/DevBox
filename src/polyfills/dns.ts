// DNS via Cloudflare DNS-over-HTTPS (no inventing 0.0.0.0)

type SingleResult = (err: Error | null, addr?: string, fam?: number) => void;
type MultiResult = (
  err: Error | null,
  entries?: Array<{ address: string; family: number }>
) => void;

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

function dnsError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

async function dohQuery(name: string, type: "A" | "AAAA"): Promise<string[]> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  const resp = await fetch(url, {
    headers: { accept: "application/dns-json" },
  });
  if (!resp.ok) {
    throw dnsError("ECONNREFUSED", `DoH query failed (HTTP ${resp.status})`);
  }
  const data = (await resp.json()) as {
    Status?: number;
    Answer?: Array<{ type: number; data: string }>;
  };
  // Status 0 = NOERROR; 3 = NXDOMAIN
  if (data.Status === 3 || !data.Answer?.length) {
    throw dnsError("ENOTFOUND", `getaddrinfo ENOTFOUND ${name}`);
  }
  if (data.Status !== 0 && data.Status !== undefined) {
    throw dnsError("ENOTFOUND", `getaddrinfo ENOTFOUND ${name}`);
  }
  const wantType = type === "A" ? 1 : 28;
  const addrs = data.Answer.filter((a) => a.type === wantType).map((a) => a.data);
  if (addrs.length === 0) {
    throw dnsError("ENOTFOUND", `getaddrinfo ENOTFOUND ${name}`);
  }
  return addrs;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function lookup(
  host: string,
  cb: SingleResult
): void;
export function lookup(
  host: string,
  opts: { family?: number; all?: true },
  cb: MultiResult
): void;
export function lookup(
  host: string,
  opts: { family?: number; all?: boolean },
  cb: SingleResult | MultiResult
): void;
export function lookup(
  host: string,
  optsOrCb: { family?: number; all?: boolean } | SingleResult,
  cb?: SingleResult | MultiResult
): void {
  const handler = typeof optsOrCb === "function" ? optsOrCb : cb;
  const flags = typeof optsOrCb === "object" ? optsOrCb : {};

  if (isLocalHost(host)) {
    const ip = host === "::1" ? "::1" : "127.0.0.1";
    const family = host === "::1" ? 6 : 4;
    queueMicrotask(() => {
      if (flags.all) {
        (handler as MultiResult)(null, [{ address: ip, family }]);
      } else {
        (handler as SingleResult)(null, ip, family);
      }
    });
    return;
  }

  const prefer6 = flags.family === 6;
  const type: "A" | "AAAA" = prefer6 ? "AAAA" : "A";
  const family = prefer6 ? 6 : 4;

  dohQuery(host, type)
    .then((addrs) => {
      if (flags.all) {
        (handler as MultiResult)(
          null,
          addrs.map((address) => ({ address, family })),
        );
      } else {
        (handler as SingleResult)(null, addrs[0], family);
      }
    })
    .catch((e: Error) => {
      (handler as SingleResult)(e);
    });
}

export function resolve(
  host: string,
  cb: (err: Error | null, addrs?: string[]) => void
): void {
  resolve4(host, cb);
}

export function resolve4(
  host: string,
  cb: (err: Error | null, addrs?: string[]) => void
): void {
  if (isLocalHost(host) && host !== "::1") {
    queueMicrotask(() => cb(null, ["127.0.0.1"]));
    return;
  }
  dohQuery(host, "A")
    .then((addrs) => cb(null, addrs))
    .catch((e: Error) => cb(e));
}

export function resolve6(
  host: string,
  cb: (err: Error | null, addrs?: string[]) => void
): void {
  if (host === "localhost" || host === "::1") {
    queueMicrotask(() => cb(null, ["::1"]));
    return;
  }
  dohQuery(host, "AAAA")
    .then((addrs) => cb(null, addrs))
    .catch((e: Error) => cb(e));
}

export function reverse(
  _ip: string,
  cb: (err: Error | null, names?: string[]) => void
): void {
  // PTR via DoH is uncommon; keep a minimal stub that does not invent success for arbitrary IPs
  queueMicrotask(() =>
    cb(dnsError("ENOTFOUND", `getHostByAddr ENOTFOUND ${_ip}`)),
  );
}

export function setServers(_list: string[]): void {}
export function getServers(): string[] {
  return [DOH_ENDPOINT];
}
export function setDefaultResultOrder(_order: string): void {}
export function getDefaultResultOrder(): string {
  return "verbatim";
}

export const promises = {
  lookup(
    host: string,
    opts?: { family?: number; all?: boolean }
  ): Promise<{ address: string; family: number } | Array<{ address: string; family: number }>> {
    return new Promise((ok, fail) => {
      if (opts?.all) {
        lookup(host, opts, ((e: Error | null, a?: Array<{ address: string; family: number }>) => {
          if (e) fail(e); else ok(a ?? []);
        }) as MultiResult);
      } else {
        lookup(host, opts ?? {}, (e, addr, fam) => {
          if (e) fail(e); else ok({ address: addr!, family: fam! });
        });
      }
    });
  },

  resolve(host: string): Promise<string[]> {
    return new Promise((ok, fail) => {
      resolve(host, (e, a) => (e ? fail(e) : ok(a ?? [])));
    });
  },

  resolve4(host: string): Promise<string[]> {
    return promises.resolve(host);
  },

  resolve6(host: string): Promise<string[]> {
    return new Promise((ok, fail) => {
      resolve6(host, (e, a) => (e ? fail(e) : ok(a ?? [])));
    });
  },

  reverse(ip: string): Promise<string[]> {
    return new Promise((ok, fail) => {
      reverse(ip, (e, a) => (e ? fail(e) : ok(a ?? [])));
    });
  },

  setServers(_s: string[]): void {},
  getServers(): string[] {
    return [DOH_ENDPOINT];
  },
};

export const ADDRCONFIG = 0;
export const V4MAPPED = 0;
export const ALL = 0;

export default {
  lookup,
  resolve,
  resolve4,
  resolve6,
  reverse,
  setServers,
  getServers,
  setDefaultResultOrder,
  getDefaultResultOrder,
  promises,
  ADDRCONFIG,
  V4MAPPED,
  ALL,
};
