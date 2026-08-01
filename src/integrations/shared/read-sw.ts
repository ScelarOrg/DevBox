// Finds and reads static/__sw__.js from disk. Used by all the framework
// integrations. The file lives in different places depending on whether
// we're running from the shipped package or straight from src/, so we
// just try each candidate path and take the first one that exists.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SW_RELATIVE_PATHS = [
  "../__sw__.js",           // dist/integrations/*.mjs -> dist/__sw__.js
  "../../static/__sw__.js", // src/integrations/*.ts  -> static/__sw__.js
  "../../dist/__sw__.js",   // src/integrations/*.ts  -> dist/__sw__.js (if built)
];

let cached: Promise<string> | null = null;

async function locateSW(fromFileUrl: string): Promise<string> {
  const baseDir = dirname(fileURLToPath(fromFileUrl));
  const errors: string[] = [];
  for (const rel of SW_RELATIVE_PATHS) {
    const candidate = resolve(baseDir, rel);
    try {
      await readFile(candidate);
      return candidate;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`  ${candidate}: ${msg}`);
    }
  }
  throw new Error(
    `[nodepod] could not locate __sw__.js. Tried:\n${errors.join("\n")}`,
  );
}

/**
 * Read the SW source. Pass `import.meta.url` from the caller so we can
 * resolve paths whether we're running from src/ or dist/.
 */
export async function readServiceWorkerSource(
  fromFileUrl: string,
): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const path = await locateSW(fromFileUrl);
      return readFile(path, "utf8");
    })();
  }
  return cached;
}

/** Test-only: reset the module cache between cases. */
export function __resetServiceWorkerSourceCacheForTests(): void {
  cached = null;
}
