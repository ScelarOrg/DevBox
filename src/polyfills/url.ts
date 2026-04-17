// URL module with legacy parse/format/resolve and fileURLToPath/pathToFileURL

export interface Url {
  protocol?: string | null;
  slashes?: boolean | null;
  auth?: string | null;
  host?: string | null;
  port?: string | null;
  hostname?: string | null;
  hash?: string | null;
  search?: string | null;
  query?: string | Record<string, string | string[]> | null;
  pathname?: string | null;
  path?: string | null;
  href?: string;
}

export function parse(
  raw: string,
  parseQuery: boolean = false,
  _slashesHost: boolean = false,
): Url {
  try {
    const u = new globalThis.URL(raw, "http://localhost");
    const authPart = u.username ? `${u.username}:${u.password}` : null;
    const queryVal = parseQuery
      ? Object.fromEntries(u.searchParams)
      : u.search
        ? u.search.substring(1)
        : null;

    return {
      protocol: u.protocol,
      slashes: u.protocol.endsWith(":"),
      auth: authPart,
      host: u.host,
      port: u.port || null,
      hostname: u.hostname,
      hash: u.hash || null,
      search: u.search || null,
      query: queryVal,
      pathname: u.pathname,
      path: u.pathname + u.search,
      href: u.href,
    };
  } catch {
    return {
      protocol: null,
      slashes: null,
      auth: null,
      host: null,
      port: null,
      hostname: null,
      hash: null,
      search: null,
      query: null,
      pathname: raw,
      path: raw,
      href: raw,
    };
  }
}

export function format(obj: Url): string {
  if (obj.href) return obj.href;

  let result = "";

  if (obj.protocol) {
    result += obj.protocol.endsWith(":") ? obj.protocol : obj.protocol + ":";
  }

  if (obj.slashes || obj.protocol === "http:" || obj.protocol === "https:") {
    result += "//";
  }

  if (obj.auth) result += obj.auth + "@";

  if (obj.hostname) {
    result += obj.hostname;
  } else if (obj.host) {
    result += obj.host;
  }

  if (obj.port) result += ":" + obj.port;
  if (obj.pathname) result += obj.pathname;

  if (obj.search) {
    result += obj.search;
  } else if (obj.query) {
    if (typeof obj.query === "string") {
      result += "?" + obj.query;
    } else {
      const params = new globalThis.URLSearchParams();
      for (const [key, val] of Object.entries(obj.query)) {
        if (Array.isArray(val)) {
          for (const item of val) params.append(key, item);
        } else {
          params.set(key, val);
        }
      }
      const qs = params.toString();
      if (qs) result += "?" + qs;
    }
  }

  if (obj.hash) result += obj.hash;

  return result;
}

export function resolve(base: string, target: string): string {
  try {
    return new globalThis.URL(target, base).href;
  } catch {
    return target;
  }
}

// Re-export the native browser URL and URLSearchParams
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export function fileURLToPath(input: string | URL): string {
  if (typeof input === "string") {
    // Bare filesystem path — return as-is
    if (input.startsWith("/")) return input;
    try {
      const urlObj = new globalThis.URL(input);
      if (urlObj.protocol === "file:") {
        return decodeURIComponent(urlObj.pathname);
      }
      // Non-file URL (http:, blob:, etc.) — return the pathname portion
      return decodeURIComponent(urlObj.pathname);
    } catch {
      // Not a valid URL at all — return as-is
      return input;
    }
  }
  // URL object
  if (input.protocol === "file:") {
    return decodeURIComponent(input.pathname);
  }
  return decodeURIComponent(input.pathname);
}

export function pathToFileURL(fsPath: string): URL {
  // already a file:// URL, don't double-prefix
  if (fsPath.startsWith("file://")) {
    return new globalThis.URL(fsPath);
  }
  const encoded = encodeURIComponent(fsPath).replace(/%2F/g, "/");
  return new globalThis.URL("file://" + encoded);
}

export function domainToASCII(domain: string): string {
  try {
    return new globalThis.URL(`http://${domain}`).hostname;
  } catch {
    return domain;
  }
}

export function domainToUnicode(domain: string): string {
  return domain;
}

export default {
  parse,
  format,
  resolve,
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
  domainToASCII,
  domainToUnicode,
};
