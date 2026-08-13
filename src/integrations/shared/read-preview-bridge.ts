import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export type PreviewBridgeAsset = "html" | "script";

const RELATIVE_PATHS: Record<PreviewBridgeAsset, string[]> = {
  html: [
    "../__nodepod_bridge__.html",
    "../../static/__nodepod_bridge__.html",
    "../../dist/__nodepod_bridge__.html",
  ],
  script: [
    "../__nodepod_bridge__.js",
    "../../static/__nodepod_bridge__.js",
    "../../dist/__nodepod_bridge__.js",
  ],
};

const cached = new Map<PreviewBridgeAsset, Promise<string>>();

export function readPreviewBridgeSource(
  fromFileUrl: string,
  asset: PreviewBridgeAsset,
): Promise<string> {
  let value = cached.get(asset);
  if (!value) {
    value = (async () => {
      const baseDir = dirname(fileURLToPath(fromFileUrl));
      const errors: string[] = [];
      for (const rel of RELATIVE_PATHS[asset]) {
        const candidate = resolve(baseDir, rel);
        try {
          return await readFile(candidate, "utf8");
        } catch (error) {
          errors.push(
            `  ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      throw new Error(
        `[nodepod] could not locate preview bridge ${asset}. Tried:\n${errors.join("\n")}`,
      );
    })();
    cached.set(asset, value);
  }
  return value;
}

export function __resetPreviewBridgeSourceCacheForTests(): void {
  cached.clear();
}
