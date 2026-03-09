// Offload Worker entry point — runs transform/extract/build tasks in a dedicated thread.
// Tar parser and base64 helpers are duplicated here since workers can't share module state.

import { expose } from "comlink";
import type {
  OffloadWorkerEndpoint,
  TransformTask,
  TransformResult,
  ExtractTask,
  ExtractResult,
  ExtractedFile,
  BuildTask,
  BuildResult,
  BuildOutputFile,
} from "./offload-types";

let esbuildEngine: any = null;
let pakoModule: any = null;
let initialized = false;

import { CDN_ESBUILD_ESM, CDN_ESBUILD_BINARY, cdnImport } from "../constants/cdn-urls";
import { CDN_PAKO } from "../constants/config";

const ESBUILD_ESM_URL = CDN_ESBUILD_ESM;
const ESBUILD_WASM_URL = CDN_ESBUILD_BINARY;
const PAKO_URL = CDN_PAKO;

// --- Base64 helpers (duplicated from helpers/byte-encoding.ts) ---

const SEGMENT_SIZE = 8192;

function uint8ToBase64(data: Uint8Array): string {
  const segments: string[] = [];
  for (let offset = 0; offset < data.length; offset += SEGMENT_SIZE) {
    segments.push(
      String.fromCharCode.apply(
        null,
        Array.from(data.subarray(offset, offset + SEGMENT_SIZE)),
      ),
    );
  }
  return btoa(segments.join(""));
}

// --- Tar parser (duplicated from packages/archive-extractor.ts) ---

function readNullTerminated(
  buf: Uint8Array,
  start: number,
  len: number,
): string {
  const slice = buf.slice(start, start + len);
  const zeroPos = slice.indexOf(0);
  const trimmed = zeroPos >= 0 ? slice.slice(0, zeroPos) : slice;
  return new TextDecoder().decode(trimmed);
}

function readOctalField(
  buf: Uint8Array,
  start: number,
  len: number,
): number {
  const raw = readNullTerminated(buf, start, len).trim();
  return parseInt(raw, 8) || 0;
}

type EntryKind = "file" | "directory" | "link" | "other";

function classifyTypeFlag(flag: string): EntryKind {
  switch (flag) {
    case "0":
    case "\0":
    case "":
      return "file";
    case "5":
      return "directory";
    case "1":
    case "2":
      return "link";
    default:
      return "other";
  }
}

interface TarEntry {
  filepath: string;
  kind: EntryKind;
  byteSize: number;
  payload?: Uint8Array;
}

function* parseTar(raw: Uint8Array): Generator<TarEntry> {
  const BLOCK = 512;
  let cursor = 0;

  while (cursor + BLOCK <= raw.length) {
    const header = raw.slice(cursor, cursor + BLOCK);
    cursor += BLOCK;

    if (header.every((b) => b === 0)) break;

    const nameField = readNullTerminated(header, 0, 100);
    if (!nameField) continue;

    const byteSize = readOctalField(header, 124, 12);
    const typeChar = String.fromCharCode(header[156]);
    const prefixField = readNullTerminated(header, 345, 155);
    const filepath = prefixField
      ? `${prefixField}/${nameField}`
      : nameField;
    const kind = classifyTypeFlag(typeChar);

    let payload: Uint8Array | undefined;
    if (kind === "file") {
      payload =
        byteSize > 0
          ? raw.slice(cursor, cursor + byteSize)
          : new Uint8Array(0);
      if (byteSize > 0) {
        cursor += Math.ceil(byteSize / BLOCK) * BLOCK;
      }
    }

    yield { filepath, kind, byteSize, payload };
  }
}

// --- JSX detection (duplicated from module-transformer.ts) ---

function detectJsx(source: string): boolean {
  if (/<[A-Z][a-zA-Z0-9.]*[\s/>]/.test(source)) return true;
  if (/<\/[a-zA-Z]/.test(source)) return true;
  if (/\/>/.test(source)) return true;
  if (/<>|<\/>/.test(source)) return true;
  if (/React\.createElement\b/.test(source)) return true;
  if (/jsx\(|jsxs\(|jsxDEV\(/.test(source)) return true;
  return false;
}

// --- Default define map for esbuild transforms ---

const DEFAULT_DEFINE: Record<string, string> = {
  "import.meta.url": "import_meta.url",
  "import.meta.dirname": "import_meta.dirname",
  "import.meta.filename": "import_meta.filename",
  "import.meta": "import_meta",
};

// --- Worker endpoint ---

const workerEndpoint: OffloadWorkerEndpoint = {
  async init(): Promise<void> {
    if (initialized) return;

    const pakoMod = await cdnImport(PAKO_URL);
    pakoModule = pakoMod.default || pakoMod;

    const esbuildMod = await cdnImport(ESBUILD_ESM_URL);
    esbuildEngine = esbuildMod.default || esbuildMod;

    try {
      await esbuildEngine.initialize({ wasmURL: ESBUILD_WASM_URL });
    } catch (err: any) {
      if (
        !(
          err instanceof Error &&
          err.message.includes('Cannot call "initialize" more than once')
        )
      ) {
        throw err;
      }
    }

    initialized = true;
  },

  async transform(task: TransformTask): Promise<TransformResult> {
    if (!esbuildEngine) throw new Error("Worker not initialized");

    const opts = task.options || {};
    let loader: string = opts.loader || "js";
    const format = opts.format || "cjs";
    const define = opts.define || DEFAULT_DEFINE;

    if (loader === "js" && detectJsx(task.source)) loader = "jsx";

    const transformOpts = {
      loader,
      format,
      target: opts.target || "esnext",
      platform: opts.platform || "neutral",
      define,
    };

    try {
      const output = await esbuildEngine.transform(task.source, transformOpts);
      return {
        type: "transform" as const,
        id: task.id,
        code: output.code,
        warnings: (output.warnings || []).map(
          (w: any) => w.text || String(w),
        ),
      };
    } catch (err: any) {
      // Retry with fallback loaders
      const fallbacks: string[] =
        loader === "js"
          ? ["jsx", "tsx", "ts"]
          : loader === "jsx"
            ? ["tsx"]
            : [];

      for (const fb of fallbacks) {
        try {
          const output = await esbuildEngine.transform(task.source, {
            ...transformOpts,
            loader: fb,
          });
          return {
            type: "transform" as const,
            id: task.id,
            code: output.code,
            warnings: [],
          };
        } catch {
          /* try next fallback */
        }
      }

      // TLA: fall back to ESM format
      if (err?.message?.includes("Top-level await")) {
        try {
          const output = await esbuildEngine.transform(task.source, {
            ...transformOpts,
            format: "esm",
          });
          return {
            type: "transform" as const,
            id: task.id,
            code: output.code,
            warnings: [],
          };
        } catch {
          /* fall through */
        }
      }

      // All retries exhausted — return original source
      return {
        type: "transform" as const,
        id: task.id,
        code: task.source,
        warnings: [err?.message || "transform failed"],
      };
    }
  },

  async extract(task: ExtractTask): Promise<ExtractResult> {
    if (!pakoModule) throw new Error("Worker not initialized");

    const response = await fetch(task.tarballUrl);
    if (!response.ok) {
      throw new Error(
        `Archive download failed (HTTP ${response.status}): ${task.tarballUrl}`,
      );
    }

    const compressed = new Uint8Array(await response.arrayBuffer());

    // check sha1 against what the registry told us
    if (task.expectedShasum) {
      const hashBuffer = await crypto.subtle.digest("SHA-1", compressed);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (hashHex !== task.expectedShasum) {
        throw new Error(
          `Integrity check failed for ${task.tarballUrl}: ` +
            `expected shasum ${task.expectedShasum}, got ${hashHex}`,
        );
      }
    }

    const tarBytes = pakoModule.inflate(compressed) as Uint8Array;

    const files: ExtractedFile[] = [];
    for (const entry of parseTar(tarBytes)) {
      if (entry.kind !== "file" && entry.kind !== "directory") continue;

      let relative = entry.filepath;
      if (task.stripComponents > 0) {
        const segments = relative.split("/").filter(Boolean);
        if (segments.length <= task.stripComponents) continue;
        relative = segments.slice(task.stripComponents).join("/");
      }

      if (entry.kind === "file" && entry.payload) {
        let data: string;
        let isBinary = false;
        try {
          data = new TextDecoder("utf-8", { fatal: true }).decode(
            entry.payload,
          );
        } catch {
          data = uint8ToBase64(entry.payload);
          isBinary = true;
        }
        files.push({ path: relative, data, isBinary });
      }
    }

    return { type: "extract" as const, id: task.id, files };
  },

  async build(task: BuildTask): Promise<BuildResult> {
    if (!esbuildEngine) throw new Error("Worker not initialized");

    const fileMap = new Map<string, string>();
    for (const [p, content] of Object.entries(task.files)) {
      fileMap.set(p, content);
    }

    const volumePlugin = {
      name: "offload-volume",
      setup(build: any) {
        build.onLoad({ filter: /.*/ }, (args: any) => {
          const content = fileMap.get(args.path);
          if (content === undefined) return null;
          const ext = args.path.substring(args.path.lastIndexOf("."));
          const loaderMap: Record<string, string> = {
            ".ts": "ts",
            ".tsx": "tsx",
            ".js": "js",
            ".mjs": "js",
            ".cjs": "js",
            ".jsx": "jsx",
            ".json": "json",
            ".css": "css",
          };
          return {
            contents: content,
            loader: loaderMap[ext] || undefined,
          };
        });
      },
    };

    try {
      const result = await esbuildEngine.build({
        entryPoints: task.entryPoints,
        stdin: task.stdin,
        bundle: task.bundle ?? true,
        format: task.format || "esm",
        platform: task.platform || "browser",
        target: task.target || "esnext",
        minify: task.minify ?? false,
        external: task.external,
        write: false,
        plugins: [volumePlugin],
        absWorkingDir: task.absWorkingDir || "/",
      });

      const outputFiles: BuildOutputFile[] = (result.outputFiles || []).map(
        (f: any) => ({
          path: f.path,
          text: f.text || new TextDecoder().decode(f.contents),
        }),
      );

      return {
        type: "build" as const,
        id: task.id,
        outputFiles,
        errors: (result.errors || []).map(
          (e: any) => e.text || String(e),
        ),
        warnings: (result.warnings || []).map(
          (w: any) => w.text || String(w),
        ),
      };
    } catch (err: any) {
      return {
        type: "build" as const,
        id: task.id,
        outputFiles: [],
        errors: [err?.message || "build failed"],
        warnings: [],
      };
    }
  },

  ping(): boolean {
    return true;
  },
};

expose(workerEndpoint);
