// optional CORS proxy for APIs that don't allow browser origins

let activeProxy: string | null = null;
let allowedDomains: Set<string> | null = null;

const DEFAULT_ALLOWED_DOMAINS = [
  'registry.npmjs.org',
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'esm.sh',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'localhost',
  '127.0.0.1',
];

export function setProxy(url: string | null): void {
  activeProxy = url;
}

export function getProxy(): string | null {
  return activeProxy;
}

export function isProxyActive(): boolean {
  return activeProxy !== null;
}

// set allowed domains for proxied fetches. extra domains get merged with defaults.
// pass null to turn off the whitelist
export function setAllowedDomains(domains: string[] | null): void {
  if (domains === null) {
    allowedDomains = null;
    return;
  }
  allowedDomains = new Set([...DEFAULT_ALLOWED_DOMAINS, ...domains]);
}

export function getAllowedDomains(): string[] | null {
  return allowedDomains ? [...allowedDomains] : null;
}

function isDomainAllowed(url: string): boolean {
  if (!allowedDomains) return true;
  try {
    const hostname = new URL(url).hostname;
    for (const allowed of allowedDomains) {
      if (hostname === allowed || hostname.endsWith('.' + allowed)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function proxiedFetch(url: string, init?: RequestInit): Promise<Response> {
  if (activeProxy) {
    if (!isDomainAllowed(url)) {
      throw new Error(`Fetch blocked: "${new URL(url).hostname}" is not in the allowedFetchDomains whitelist`);
    }
    return fetch(activeProxy + encodeURIComponent(url), init);
  }
  return fetch(url, init);
}

export function resolveProxyUrl(url: string): string {
  if (activeProxy && !isDomainAllowed(url)) {
    throw new Error(`Fetch blocked: "${new URL(url).hostname}" is not in the allowedFetchDomains whitelist`);
  }
  return activeProxy ? activeProxy + encodeURIComponent(url) : url;
}
