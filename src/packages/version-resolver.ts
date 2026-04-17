// Version Resolver — semver parsing, range matching, and dependency tree resolution.

import { RegistryClient, VersionDetail } from "./registry-client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolvedDependency {
  name: string;
  version: string;
  tarballUrl: string;
  dependencies: Record<string, string>;
  shasum?: string;
}

export interface ResolutionConfig {
  registry?: RegistryClient;
  devDependencies?: boolean;
  optionalDependencies?: boolean;
  onProgress?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Semver data structures
// ---------------------------------------------------------------------------

export interface SemverComponents {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

// ---------------------------------------------------------------------------
// Semver parsing and comparison
// ---------------------------------------------------------------------------

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

// Returns null for unparseable strings
export function parseSemver(raw: string): SemverComponents | null {
  const m = raw.match(SEMVER_PATTERN);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4],
  };
}

// Standard three-way comparison: negative if left < right, 0 if equal, positive if left > right
export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);

  if (!a || !b) return left.localeCompare(right);

  const majorDiff = a.major - b.major;
  if (majorDiff !== 0) return majorDiff;

  const minorDiff = a.minor - b.minor;
  if (minorDiff !== 0) return minorDiff;

  const patchDiff = a.patch - b.patch;
  if (patchDiff !== 0) return patchDiff;

  // pre-release has lower precedence than release
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Range satisfaction
// ---------------------------------------------------------------------------

// Supports: exact, ^, ~, *, x-ranges, comparators, compound, hyphen, || unions
export function satisfiesRange(version: string, range: string): boolean {
  const sv = parseSemver(version);
  if (!sv) return false;

  // pre-release versions only match ranges that explicitly include one
  if (sv.prerelease && !range.includes("-")) return false;

  range = range.trim();

  if (range === "*" || range === "latest" || range === "") return true;

  if (range.includes("||")) {
    return range.split("||").some((sub) => satisfiesRange(version, sub.trim()));
  }

  if (range.includes(" - ")) {
    const [lo, hi] = range.split(" - ").map((s) => s.trim());
    return compareSemver(version, lo) >= 0 && compareSemver(version, hi) <= 0;
  }

  // compound comparators like ">=1.2.0 <3.0.0"
  const comparatorSegments = range.match(
    /(>=|<=|>|<|=)\s*(\d+(?:\.\d+)?(?:\.\d+)?(?:-[^\s]*)?)/g,
  );
  if (comparatorSegments && comparatorSegments.length > 1) {
    return comparatorSegments.every((seg) => {
      const parts = seg.match(
        /^(>=|<=|>|<|=)\s*(\d+(?:\.\d+)?(?:\.\d+)?(?:-[^\s]*)?)$/,
      );
      if (!parts) return true;
      const op = parts[1];
      let target = parts[2];
      // pad partial versions: "3" -> "3.0.0"
      const dots = (target.match(/\./g) || []).length;
      if (dots === 0) target += ".0.0";
      else if (dots === 1) target += ".0";
      return applyOperator(version, op, target);
    });
  }

  if (range.startsWith("^")) {
    const base = padVersion(range.slice(1));
    const bv = parseSemver(base);
    if (!bv) return false;

    if (sv.major !== bv.major) return false;
    if (bv.major === 0) {
      if (bv.minor !== 0 && sv.minor !== bv.minor) return false;
      if (bv.minor === 0 && sv.minor !== 0) return false;
    }
    return compareSemver(version, base) >= 0;
  }

  if (range.startsWith("~")) {
    const base = padVersion(range.slice(1));
    const bv = parseSemver(base);
    if (!bv) return false;
    return (
      sv.major === bv.major &&
      sv.minor === bv.minor &&
      compareSemver(version, base) >= 0
    );
  }

  if (range.startsWith(">="))
    return compareSemver(version, padVersion(range.slice(2).trim())) >= 0;
  if (range.startsWith(">"))
    return compareSemver(version, padVersion(range.slice(1).trim())) > 0;
  if (range.startsWith("<="))
    return compareSemver(version, padVersion(range.slice(2).trim())) <= 0;
  if (range.startsWith("<"))
    return compareSemver(version, padVersion(range.slice(1).trim())) < 0;
  if (range.startsWith("="))
    return compareSemver(version, padVersion(range.slice(1).trim())) === 0;

  if (
    range.includes("x") ||
    range.includes("X") ||
    /^\d+$/.test(range) ||
    /^\d+\.\d+$/.test(range)
  ) {
    const segments = range.replace(/[xX]/g, "").split(".").filter(Boolean);
    if (segments.length === 1) return sv.major === Number(segments[0]);
    if (segments.length === 2) {
      return (
        sv.major === Number(segments[0]) && sv.minor === Number(segments[1])
      );
    }
  }

  if (range.includes(" ")) {
    return range
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => satisfiesRange(version, part));
  }

  if (/^\d+\.\d+\.\d+/.test(range)) {
    const exact = range.match(/^(\d+\.\d+\.\d+(?:-[^\s]+)?)/);
    if (exact) return compareSemver(version, exact[1]) === 0;
  }

  return compareSemver(version, range) === 0;
}

// "3" -> "3.0.0", "0.10.x" -> "0.10.0"
function padVersion(v: string): string {
  const parts = v.replace(/[xX*]/g, "0").split(".");
  while (parts.length < 3) parts.push("0");
  return parts.join(".");
}

function applyOperator(ver: string, op: string, target: string): boolean {
  const cmp = compareSemver(ver, target);
  switch (op) {
    case ">=":
      return cmp >= 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case "<":
      return cmp < 0;
    default:
      return cmp === 0;
  }
}

// Pick the highest version satisfying the range, or null
export function pickBestMatch(
  available: string[],
  range: string,
): string | null {
  const descending = [...available].sort((a, b) => compareSemver(b, a));
  for (const candidate of descending) {
    if (satisfiesRange(candidate, range)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// npm alias handling
// ---------------------------------------------------------------------------

// Parse "npm:strip-ansi@^6.0.1" into { realName, realRange }
function parseNpmAlias(range: string): { realName: string; realRange: string } | null {
  if (!range.startsWith("npm:")) return null;
  const rest = range.slice(4);
  let atIdx: number;
  if (rest.startsWith("@")) {
    // scoped: find the second @ after the scope
    atIdx = rest.indexOf("@", 1);
  } else {
    atIdx = rest.indexOf("@");
  }
  if (atIdx === -1) {
    return { realName: rest, realRange: "latest" };
  }
  return {
    realName: rest.slice(0, atIdx),
    realRange: rest.slice(atIdx + 1),
  };
}

// ---------------------------------------------------------------------------
// Full dependency tree resolution
// ---------------------------------------------------------------------------

interface TreeWalkState {
  registry: RegistryClient;
  completed: Map<string, ResolvedDependency>;
  inFlight: Set<string>;
  config: ResolutionConfig;
}

export async function resolveDependencyTree(
  rootName: string,
  versionRange: string = "latest",
  config: ResolutionConfig = {},
): Promise<Map<string, ResolvedDependency>> {
  const client = config.registry || new RegistryClient();
  const state: TreeWalkState = {
    registry: client,
    completed: new Map(),
    inFlight: new Set(),
    config,
  };

  await walkDependency(rootName, versionRange, state);
  return state.completed;
}

export async function resolveFromManifest(
  manifest: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
  config: ResolutionConfig = {},
): Promise<Map<string, ResolvedDependency>> {
  const client = config.registry || new RegistryClient();
  const state: TreeWalkState = {
    registry: client,
    completed: new Map(),
    inFlight: new Set(),
    config,
  };

  const allDeps: Record<string, string> = { ...manifest.dependencies };
  if (config.devDependencies && manifest.devDependencies) {
    Object.assign(allDeps, manifest.devDependencies);
  }

  for (const [depName, depRange] of Object.entries(allDeps)) {
    await walkDependency(depName, depRange, state);
  }

  return state.completed;
}

// Recursively resolve a package and its transitive deps. Uses `inFlight` to break cycles.
async function walkDependency(
  pkgName: string,
  versionConstraint: string,
  state: TreeWalkState,
): Promise<void> {
  const { registry, completed, inFlight, config } = state;

  // npm aliases: fetch the real package but install under the alias name
  const alias = parseNpmAlias(versionConstraint);
  const installName = pkgName;
  const fetchName = alias?.realName ?? pkgName;
  versionConstraint = alias?.realRange ?? versionConstraint;

  const trackingKey = `${installName}@${versionConstraint}`;

  if (inFlight.has(trackingKey)) return;

  if (completed.has(installName)) {
    const existing = completed.get(installName)!;
    if (satisfiesRange(existing.version, versionConstraint)) return;
    // flat node_modules — accept what we have even if not perfect
    return;
  }

  inFlight.add(trackingKey);

  try {
    config.onProgress?.(`Resolving ${fetchName}@${versionConstraint}`);

    const metadata = await registry.fetchManifest(fetchName);
    const allVersions = Object.keys(metadata.versions);

    let chosenVersion: string;
    if (versionConstraint === "latest" || versionConstraint === "*") {
      chosenVersion = metadata["dist-tags"].latest;
    } else if (metadata["dist-tags"][versionConstraint]) {
      chosenVersion = metadata["dist-tags"][versionConstraint];
    } else {
      const best = pickBestMatch(allVersions, versionConstraint);
      if (!best) {
        throw new Error(
          `Could not find a version of "${fetchName}" matching "${versionConstraint}"`,
        );
      }
      chosenVersion = best;
    }

    const versionInfo: VersionDetail = metadata.versions[chosenVersion];

    completed.set(installName, {
      name: installName,
      version: chosenVersion,
      tarballUrl: versionInfo.dist.tarball,
      dependencies: versionInfo.dependencies || {},
      shasum: versionInfo.dist.shasum,
    });

    // non-optional peers are included (npm v7+ behaviour)
    const edges: Record<string, string> = {};

    if (versionInfo.peerDependencies) {
      const peerMeta = versionInfo.peerDependenciesMeta || {};
      for (const [peer, peerRange] of Object.entries(
        versionInfo.peerDependencies,
      )) {
        if (!peerMeta[peer]?.optional) {
          edges[peer] = peerRange;
        }
      }
    }

    // regular deps take precedence over peers
    if (versionInfo.dependencies) {
      Object.assign(edges, versionInfo.dependencies);
    }

    if (versionInfo.optionalDependencies) {
      if (config.optionalDependencies) {
        Object.assign(edges, versionInfo.optionalDependencies);
      } else {
        // Always include wasm32-wasi optional deps — they're WASM alternatives
        // to native bindings and are the only variant that can run in-browser
        const optNames = Object.keys(versionInfo.optionalDependencies);
        let hasWasmVariant = false;
        for (const [optName, optRange] of Object.entries(versionInfo.optionalDependencies)) {
          if (optName.includes("wasm32-wasi") || optName.includes("wasm")) {
            edges[optName] = optRange as string;
            hasWasmVariant = true;
          }
        }

        // generic napi-rs detection: if ALL optional deps are platform-specific
        // native bindings (contain OS/arch tags) but no WASM variant exists, try
        // {pkg}-wasm32-wasi and {pkg}-wasm as alternatives. covers packages like
        // lightningcss that ship a separate -wasm package. errors are swallowed
        // since these may not exist on the registry
        if (!hasWasmVariant && optNames.length >= 2) {
          const platformRe = /-(darwin|linux|win32|freebsd|android|sunos)-(x64|x86|arm64|arm|ia32|s390x|ppc64|mips|riscv)/;
          const allPlatform = optNames.every(n => platformRe.test(n));
          if (allPlatform) {
            const wasmAltsToTry = [installName + "-wasm32-wasi", installName + "-wasm"];
            await Promise.all(wasmAltsToTry.map(async (alt) => {
              try { await walkDependency(alt, "*", state); } catch { /* package may not exist */ }
            }));
          }
        }
      }
    }

    const edgeList = Object.entries(edges);
    const PARALLEL_LIMIT = 8;

    for (let start = 0; start < edgeList.length; start += PARALLEL_LIMIT) {
      const chunk = edgeList.slice(start, start + PARALLEL_LIMIT);
      await Promise.all(
        chunk.map(([childName, childRange]) =>
          walkDependency(childName, childRange, state),
        ),
      );
    }
  } finally {
    inFlight.delete(trackingKey);
  }
}

// ---------------------------------------------------------------------------
// Class facade
// ---------------------------------------------------------------------------

export class VersionResolver {
  parse = parseSemver;
  compare = compareSemver;
  satisfies = satisfiesRange;
  pickBest = pickBestMatch;
  resolveTree = resolveDependencyTree;
  resolveManifest = resolveFromManifest;
}

export default VersionResolver;
