// ScriptEngine — JS execution engine with require(), module resolution,
// ESM-to-CJS conversion, and Node.js polyfills. Runs in the browser.

import { MemoryVolume } from "./memory-volume";
import type {
  IScriptEngine,
  ExecutionOutcome,
  EngineConfig,
  LoadedModule,
} from "./engine-types";
import type { PackageManifest } from "./types/manifest";
import { quickDigest } from "./helpers/digest";
import { bytesToBase64, bytesToHex } from "./helpers/byte-encoding";
import { buildFileSystemBridge, FsBridge } from "./polyfills/fs";
import * as pathPolyfill from "./polyfills/path";
import {
  RESOLVE_EXTENSIONS,
  MAIN_FIELD_EXTENSIONS,
  INDEX_FILES,
  IMPORTS_FIELD_EXTENSIONS,
  LIMITS,
} from "./constants/config";
import { buildProcessEnv, ProcessObject } from "./polyfills/process";
import * as httpPolyfill from "./polyfills/http";
import * as httpsPolyfill from "./polyfills/https";
import * as tcpPolyfill from "./polyfills/net";
import eventBusPolyfill from "./polyfills/events";
import streamPolyfill from "./polyfills/stream";
import * as urlPolyfill from "./polyfills/url";
import * as qsPolyfill from "./polyfills/querystring";
import * as helpersPolyfill from "./polyfills/util";
import * as ttyPolyfill from "./polyfills/tty";
import * as osPolyfill from "./polyfills/os";
import * as hashingPolyfill from "./polyfills/crypto";
import * as compressionPolyfill from "./polyfills/zlib";
import * as dnsPolyfill from "./polyfills/dns";
import bufferPolyfill from "./polyfills/buffer";
// child_process is lazy-loaded to avoid pulling in the shell at import time
let _shellExecPolyfill: any = null;
let _initShellExec: ((vol: any) => void) | null = null;
const shellExecProxy = new Proxy({} as any, {
  get(_target, prop) {
    if (!_shellExecPolyfill) return undefined;
    return _shellExecPolyfill[prop];
  },
  ownKeys() {
    if (!_shellExecPolyfill) return [];
    return Reflect.ownKeys(_shellExecPolyfill);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (!_shellExecPolyfill) return undefined;
    return Object.getOwnPropertyDescriptor(_shellExecPolyfill, prop);
  },
  has(_target, prop) {
    if (!_shellExecPolyfill) return false;
    return prop in _shellExecPolyfill;
  },
});

// Set eagerly so require('child_process') works sync in workers.
// The async .then() in the constructor fires too late for top-level require() calls.
export function setChildProcessPolyfill(mod: any): void {
  _shellExecPolyfill = mod;
  _initShellExec = mod.initShellExec;
}
import { getProxyInstance } from "./request-proxy";
import * as watcherPolyfill from "./polyfills/chokidar";
import * as wsPolyfill from "./polyfills/ws";
import * as macEventsPolyfill from "./polyfills/fsevents";
import * as scannerPolyfill from "./polyfills/readdirp";
import * as moduleSysPolyfill from "./polyfills/module";
import * as perfPolyfill from "./polyfills/perf_hooks";
import * as threadPoolPolyfill from "./polyfills/worker_threads";
import * as esbuildPolyfill from "./polyfills/esbuild";
import * as rollupPolyfill from "./polyfills/rollup";
import * as v8Polyfill from "./polyfills/v8";
import * as lineReaderPolyfill from "./polyfills/readline";
import * as tlsPolyfill from "./polyfills/tls";
import * as http2Polyfill from "./polyfills/http2";
import * as clusterPolyfill from "./polyfills/cluster";
import * as udpPolyfill from "./polyfills/dgram";
import * as vmPolyfill from "./polyfills/vm";
import * as debugPolyfill from "./polyfills/inspector";
import * as asyncCtxPolyfill from "./polyfills/async_hooks";
import * as domainPolyfill from "./polyfills/domain";
import * as tracePolyfill from "./polyfills/diagnostics_channel";
import * as consolePolyfill from "./polyfills/console";
import * as replPolyfill from "./polyfills/repl";
import * as testPolyfill from "./polyfills/test";
import * as traceEventsPolyfill from "./polyfills/trace_events";
import * as wasiPolyfill from "./polyfills/wasi";
import * as seaPolyfill from "./polyfills/sea";
import * as sqlitePolyfill from "./polyfills/sqlite";
import * as quicPolyfill from "./polyfills/quic";
import * as lightningcssPolyfill from "./polyfills/lightningcss";
import * as tailwindOxidePolyfill from "./polyfills/tailwindcss-oxide";
import {
  promises as streamPromises,
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
} from "./polyfills/stream";
import { promises as dnsPromises } from "./polyfills/dns";
import { promises as readlinePromises } from "./polyfills/readline";

import assertPolyfill from "./polyfills/assert";
import stringDecoderPolyfill from "./polyfills/string_decoder";
import timersPolyfill from "./polyfills/timers";
import { promises as timersPromises } from "./polyfills/timers";
import * as punycodePolyfill from "./polyfills/punycode";
import constantsPolyfill from "./polyfills/constants";
import {
  resolve as resolveExports,
  imports as resolveImports,
} from "resolve.exports";
import {
  esmToCjs,
  stripTopLevelAwait,
  hasTopLevelAwait,
} from "./syntax-transforms";
import { getCachedModule, precompileWasm, compileWasmInWorker } from "./helpers/wasm-cache";
import * as acorn from "acorn";

// ── TypeScript type stripper ──
// Regex-based stripping of TS syntax so acorn/eval can handle it at runtime.

function stripTypeScript(source: string): string {
  let s = source;

  s = s.replace(
    /^\s*declare\s+(module|namespace|global)\s+[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/gm,
    "",
  );
  s = s.replace(
    /^\s*declare\s+(?:const|let|var|function|class|enum|type|interface)\s+[^;\n]+[;\n]/gm,
    "",
  );

  s = s.replace(
    /^\s*(?:export\s+)?interface\s+\w+(?:\s+extends\s+[^{]+)?\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/gm,
    "",
  );

  s = s.replace(/^\s*(?:export\s+)?type\s+\w+(?:<[^>]*>)?\s*=\s*[^;]+;/gm, "");

  s = s.replace(
    /^\s*export\s+type\s*\{[^}]*\}\s*(?:from\s*['"][^'"]*['"])?\s*;?/gm,
    "",
  );
  s = s.replace(
    /^\s*import\s+type\s+(?:\{[^}]*\}|\w+)\s*(?:from\s*['"][^'"]*['"])?\s*;?/gm,
    "",
  );

  s = s.replace(/\bas\s+const\b/g, "");
  s = s.replace(/\s+as\s+(?:[A-Z][\w.<>,\s|&\[\]]*)/g, "");

  s = s.replace(
    /(function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function\s*)?)\s*<[^(]*?>\s*\(/g,
    "$1(",
  );

  // Strip type annotations from params and return types
  s = s.replace(
    /:\s*(?:readonly\s+)?(?:[A-Z][\w.<>,\s|&\[\]]*|string|number|boolean|void|any|never|unknown|null|undefined|object|bigint)(?:\s*\|\s*(?:[A-Z][\w.<>,\s|&\[\]]*|string|number|boolean|void|any|never|unknown|null|undefined|object|bigint))*/g,
    (match, offset) => {
      // Heuristic: only strip if we're in a signature context, not object literals
      const before = s.slice(Math.max(0, offset - 40), offset);
      if (/[,(?]\s*\w+\s*\??$/.test(before)) return "";
      if (/\)\s*$/.test(before)) return "";
      if (/\(\s*\w+\s*\??$/.test(before)) return "";
      if (/\b(?:const|let|var)\s+\w+$/.test(before)) return "";
      return match;
    },
  );

  s = s.replace(/(\w)!\./g, "$1.");
  s = s.replace(/(\w)!\)/g, "$1)");
  s = s.replace(/(\w)!\,/g, "$1,");

  s = s.replace(
    /(?<!=)\s*<(?:string|number|boolean|any|unknown|never|void|object|bigint|Record|Partial|Required|Readonly|Pick|Omit|Extract|Exclude|Array|Promise|Set|Map)\b[^>]*>/g,
    "",
  );

  // Convert enums to plain objects
  s = s.replace(
    /^\s*(?:export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{([^}]*)\}/gm,
    (_, name, body) => {
      const entries = body
        .split(",")
        .map((e: string) => e.trim())
        .filter(Boolean);
      const obj: string[] = [];
      let autoVal = 0;
      for (const entry of entries) {
        const eqIdx = entry.indexOf("=");
        if (eqIdx !== -1) {
          const key = entry.slice(0, eqIdx).trim();
          const val = entry.slice(eqIdx + 1).trim();
          obj.push(`${JSON.stringify(key)}: ${val}`);
          const numVal = Number(val);
          if (!isNaN(numVal)) autoVal = numVal + 1;
        } else {
          obj.push(`${JSON.stringify(entry)}: ${autoVal}`);
          autoVal++;
        }
      }
      return `var ${name} = {${obj.join(", ")}};`;
    },
  );

  s = s.replace(/^\s*(public|private|protected)?\s*readonly\s+/gm, "$1 ");
  s = s.replace(/\b(public|private|protected)\s+(?=\w+[\s,):])/g, "");
  s = s.replace(/\babstract\s+(class|extends)/g, "$1");
  s = s.replace(/\bimplements\s+[\w.,\s<>]+(?=\s*\{)/g, "");
  s = s.replace(/\boverride\s+(?=\w)/g, "");

  return s;
}

function isTypeScriptFile(filename: string): boolean {
  const clean = filename.split("?")[0];
  if (
    clean.endsWith(".ts") ||
    clean.endsWith(".tsx") ||
    clean.endsWith(".mts")
  ) return true;
  // Vite SFC query params like ?type=script&lang.ts
  if (filename.includes("lang.ts") || filename.includes("lang=ts")) return true;
  return false;
}

// CSS files must never go through stripTypeScript
function isCSSFile(filename: string): boolean {
  const clean = filename.split("?")[0];
  if (
    clean.endsWith(".css") ||
    clean.endsWith(".scss") ||
    clean.endsWith(".sass") ||
    clean.endsWith(".less") ||
    clean.endsWith(".styl") ||
    clean.endsWith(".stylus") ||
    clean.endsWith(".postcss")
  ) return true;
  if (filename.includes("type=style")) return true;
  if (/lang[.=](?:css|scss|sass|less|styl|stylus|postcss)/.test(filename)) return true;
  return false;
}

// Fallback heuristic when filename doesn't indicate TS
function looksLikeTypeScript(source: string): boolean {
  return (
    /\b(?:interface|type)\s+\w+/.test(source) ||
    /:\s*(?:string|number|boolean|void|any|never|unknown|Record|Array|Promise)\b/.test(source) ||
    /(?:as\s+(?:string|number|boolean|any|const)\b)/.test(source)
  );
}

// ── AST walk helper ──
function traverseAst(node: any, visitor: (n: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visitor(node);
  for (const key of Object.keys(node)) {
    if (
      key === "type" ||
      key === "start" ||
      key === "end" ||
      key === "loc" ||
      key === "range"
    )
      continue;
    const val = node[key];
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && typeof item.type === "string")
            traverseAst(item, visitor);
        }
      } else if (typeof val.type === "string") {
        traverseAst(val, visitor);
      }
    }
  }
}

// ── Dynamic import regex fallback ──
function rewriteDynamicImportsRegex(source: string): string {
  return source.replace(/(?<![.$\w])import\s*\(/g, "__asyncLoad(");
}

// ── ESM → CJS conversion ──
function convertModuleSyntax(source: string, filePath: string): string {
  if (!/\bimport\b|\bexport\b/.test(source)) return source;
  try {
    return convertViaAst(source, filePath);
  } catch (astErr) {
    _nativeConsole.warn("[convertModuleSyntax] AST parse failed for", filePath, "falling back to regex:", astErr instanceof Error ? astErr.message : String(astErr));
    return convertViaRegex(source, filePath);
  }
}

function convertViaAst(source: string, filePath: string): string {
  const ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
  }) as any;
  const patches: Array<[number, number, string]> = [];

  traverseAst(ast, (node: any) => {
    if (
      node.type === "MetaProperty" &&
      node.meta?.name === "import" &&
      node.property?.name === "meta"
    ) {
      patches.push([node.start, node.end, "import_meta"]);
    }
    if (node.type === "ImportExpression") {
      patches.push([node.start, node.start + 6, "__asyncLoad"]);
    }
  });

  const hasImportDecl = ast.body.some(
    (n: any) => n.type === "ImportDeclaration",
  );
  const hasExportDecl = ast.body.some((n: any) => n.type?.startsWith("Export"));

  let output = source;
  patches.sort((a, b) => b[0] - a[0]);
  for (const [s, e, r] of patches)
    output = output.slice(0, s) + r + output.slice(e);

  if (hasImportDecl || hasExportDecl) {
    output = esmToCjs(output);
    if (hasExportDecl) {
      output =
        'Object.defineProperty(exports, "__esModule", { value: true });\n' +
        output;
    }
  }

  // .mjs files with `const require = createRequire(...)` hit TDZ after esmToCjs
  output = demoteLexicalRequire(output);

  return output;
}

// Demote `const/let require =` to plain assignment to avoid TDZ with esmToCjs-generated require() calls
function demoteLexicalRequire(code: string): string {
  if (!/\b(?:const|let)\s+require\s*=/.test(code)) return code;
  return code.replace(
    /\b(const|let)\s+(require)\s*=/g,
    "require =",
  );
}

// Builds the IIFE wrapper that sandboxes user code with shimmed globals
function buildModuleWrapper(
  code: string,
  opts: {
    async?: boolean;
    useNativePromise?: boolean;
    includeViteVars?: boolean;
    hideBrowserGlobals?: boolean;
    wasmHelpers?: boolean;
  } = {},
): string {
  const {
    async: isAsync = false,
    useNativePromise = false,
    includeViteVars = true,
    hideBrowserGlobals = true,
    wasmHelpers = false,
  } = opts;

  const promiseVar = useNativePromise ? "globalThis.Promise" : "$SyncPromise";
  const fnKeyword = isAsync ? "async function" : "function";

  let vars = `var exports = $exports;
var require = $require;
var module = $module;
var __filename = $filename;
var __dirname = $dirname;
`;
  if (includeViteVars) {
    vars += `var __vite_injected_original_filename = $filename;
var __vite_injected_original_dirname = $dirname;
var __vite_injected_original_import_meta_url = "file://" + $filename;
`;
  }
  vars += `var process = $process;
var console = $console;
var import_meta = $importMeta;
var __asyncLoad = $asyncLoad;
var __syncAwait = $syncAwait;
var Promise = ${promiseVar};
var global = globalThis;
`;
  if (hideBrowserGlobals) {
    vars += `var document = undefined;
var window = undefined;
var HTMLElement = undefined;
`;
  }
  vars += `globalThis.process = $process;
globalThis.console = $console;
globalThis.require = $require;
global.process = $process;
global.console = $console;
global.require = $require;
`;
  if (wasmHelpers) {
    vars += `async function __wasmCompile(bytes) { return WebAssembly.compile(bytes); }
async function __wasmInstantiate(moduleOrBytes, imports) {
  var mod = moduleOrBytes;
  if (moduleOrBytes instanceof ArrayBuffer || ArrayBuffer.isView(moduleOrBytes)) {
    mod = await WebAssembly.compile(moduleOrBytes);
  }
  var result = await WebAssembly.instantiate(mod, imports);
  return result.instance || result;
}
`;
  }

  return `(function($exports, $require, $module, $filename, $dirname, $process, $console, $importMeta, $asyncLoad, $syncAwait, $SyncPromise) {
${vars}return (${fnKeyword}() {
${code}
}).call(this);
})`;
}

function convertViaRegex(source: string, filePath: string): string {
  let output = source;
  output = output.replace(/\bimport\.meta\.url\b/g, `"file://${filePath}"`);
  output = output.replace(
    /\bimport\.meta\.dirname\b/g,
    `"${pathPolyfill.dirname(filePath)}"`,
  );
  output = output.replace(/\bimport\.meta\.filename\b/g, `"${filePath}"`);
  output = output.replace(
    /\bimport\.meta\b/g,
    `({ url: "file://${filePath}", dirname: "${pathPolyfill.dirname(filePath)}", filename: "${filePath}" })`,
  );
  output = rewriteDynamicImportsRegex(output);

  const hasImport = /\bimport\s+[\w{*'"]/m.test(source);
  const hasExport =
    /\bexport\s+(?:default|const|let|var|function|class|{|\*)/m.test(source);
  if (hasImport || hasExport) {
    output = esmToCjs(output);
    if (hasExport) {
      output =
        'Object.defineProperty(exports, "__esModule", { value: true });\n' +
        output;
    }
  }

  output = demoteLexicalRequire(output);

  return output;
}

// ── Sync promise infrastructure ──
// SyncThenable and SyncPromise let __syncAwait unwrap values without hitting
// the microtask queue. This is how require() can work synchronously even when
// modules use async patterns internally.

// .then() fires synchronously when value is already resolved
class SyncThenable<T> {
  private _value: T;
  constructor(value: T) {
    this._value = value;
  }
  then<R>(
    onFulfilled?: ((v: T) => R) | null,
    _onRejected?: ((e: any) => R) | null,
  ): SyncThenable<R> | this {
    if (onFulfilled) return new SyncThenable(onFulfilled(this._value));
    return this;
  }
  catch(_onRejected?: ((e: any) => unknown) | null): this {
    return this;
  }
  finally(onFinally?: (() => void) | null): this {
    if (onFinally) onFinally();
    return this;
  }
}

// Try to synchronously unwrap a thenable. Returns the value if .then() fires sync,
// otherwise returns the original value (possibly a native Promise).
function syncAwait(val: unknown): unknown {
  if (val && typeof (val as any).then === "function") {
    let resolved: unknown;
    let gotSync = false;
    (val as any).then((v: unknown) => {
      resolved = v;
      gotSync = true;
    });
    if (gotSync) return resolved;
  }
  return val;
}

// Promise subclass that resolves .then() synchronously when the executor resolves sync.
// Needed because async functions always return native Promises, but when their body
// resolves synchronously we want __syncAwait to unwrap the result.
// Injected as `Promise` inside module wrappers.
function createSyncPromise(): typeof Promise {
  const NativePromise = Promise;

  class SyncPromise<T> extends NativePromise<T> {
    private _syncValue: T | undefined;
    private _syncResolved = false;
    private _syncRejected = false;
    private _syncError: any;

    constructor(
      executor: (
        resolve: (value: T | PromiseLike<T>) => void,
        reject: (reason?: any) => void,
      ) => void,
    ) {
      let syncVal: T | undefined;
      let syncResolved = false;
      let syncRejected = false;
      let syncErr: any;

      super((resolve, reject) => {
        executor(
          (value) => {
            // Try sync unwrap. If it can't resolve sync, let native handle it.
            // Without this, p-limit's resolve(asyncPromise) gets treated as
            // sync-resolved with the Promise object as the value.
            if (
              value &&
              typeof value === "object" &&
              typeof (value as any).then === "function"
            ) {
              let innerResolved = false;
              let innerVal: T | undefined;
              let innerRejected = false;
              let innerErr: any;
              (value as any).then(
                (v: T) => {
                  innerVal = v;
                  innerResolved = true;
                },
                (e: any) => {
                  innerErr = e;
                  innerRejected = true;
                },
              );
              if (innerResolved) {
                syncVal = innerVal;
                syncResolved = true;
                resolve(innerVal!);
                return;
              }
              if (innerRejected) {
                syncRejected = true;
                syncErr = innerErr;
                reject(innerErr);
                return;
              }
              resolve(value);
              return;
            }
            syncVal = value as T;
            syncResolved = true;
            resolve(value);
          },
          (reason) => {
            syncRejected = true;
            syncErr = reason;
            reject(reason);
          },
        );
      });

      this._syncValue = syncVal;
      this._syncResolved = syncResolved;
      this._syncRejected = syncRejected;
      this._syncError = syncErr;

      // Suppress native unhandledrejection — our .then() handles these sync
      if (syncRejected) {
        NativePromise.prototype.catch.call(this, () => {});
      }
    }

    then<TResult1 = T, TResult2 = never>(
      onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      if (this._syncResolved && onFulfilled) {
        try {
          const result = onFulfilled(this._syncValue as T);
          if (
            result &&
            typeof result === "object" &&
            typeof (result as any).then === "function"
          ) {
            let innerVal: any;
            let innerResolved = false;
            let innerRejected = false;
            let innerErr: any;
            (result as any).then(
              (v: any) => {
                innerVal = v;
                innerResolved = true;
              },
              (e: any) => {
                innerErr = e;
                innerRejected = true;
              },
            );
            if (innerResolved) {
              return new SyncPromise<TResult1>((res) => res(innerVal)) as any;
            }
            if (innerRejected) {
              if (onRejected) {
                return new SyncPromise<TResult2>((res) =>
                  res(onRejected(innerErr) as TResult2),
                ) as any;
              }
              return new SyncPromise<TResult2>((_, rej) => rej(innerErr)) as any;
            }
            return NativePromise.resolve(result).then(null, onRejected) as any;
          }
          return new SyncPromise<TResult1>((res) =>
            res(result as TResult1),
          ) as any;
        } catch (e) {
          if (onRejected) {
            return new SyncPromise<TResult2>((res) =>
              res(onRejected(e) as TResult2),
            ) as any;
          }
          // Must be SyncPromise so downstream .catch() fires sync (p-locate depends on this)
          return new SyncPromise<TResult2>((_, rej) => rej(e)) as any;
        }
      }
      if (this._syncRejected && onRejected) {
        try {
          const result = onRejected(this._syncError);
          return new SyncPromise<TResult2>((res) =>
            res(result as TResult2),
          ) as any;
        } catch (e) {
          return new SyncPromise<TResult2>((_, rej) => rej(e)) as any;
        }
      }
      if (this._syncRejected && !onRejected) {
        return new SyncPromise<TResult2>((_, rej) =>
          rej(this._syncError),
        ) as any;
      }
      return super.then(onFulfilled, onRejected);
    }
  }

  // instanceof must work for native Promises too since we inject SyncPromise as `Promise`
  Object.defineProperty(SyncPromise, Symbol.hasInstance, {
    value: (instance: any) =>
      instance instanceof NativePromise,
    configurable: true,
  });

  (SyncPromise as any).resolve = (value: any) => {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as any).then === "function"
    ) {
      return new SyncPromise((res) => res(value));
    }
    return new SyncPromise((res) => res(value));
  };
  (SyncPromise as any).reject = (reason: any) =>
    new SyncPromise((_, rej) => rej(reason));

  // all/race/allSettled/any return SyncPromise so __syncAwait can unwrap them
  (SyncPromise as any).all = (iterable: Iterable<any>) => {
    const arr = Array.from(iterable);
    const results: any[] = new Array(arr.length);
    let allSync = true;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v instanceof SyncPromise) {
        if ((v as any)._syncResolved) {
          results[i] = (v as any)._syncValue;
        } else if ((v as any)._syncRejected) {
          return new SyncPromise((_, rej) => rej((v as any)._syncError));
        } else {
          allSync = false;
          break;
        }
      } else if (
        v && typeof v === "object" && typeof v.then === "function"
      ) {
        let probed = false, pVal: any;
        v.then((x: any) => { pVal = x; probed = true; });
        if (probed) {
          results[i] = pVal;
        } else {
          allSync = false;
          break;
        }
      } else {
        results[i] = v;
      }
    }
    if (allSync) {
      return new SyncPromise((res: any) => res(results));
    }
    return new SyncPromise((res: any, rej: any) => {
      NativePromise.all(arr).then(res, rej);
    });
  };

  (SyncPromise as any).allSettled = (iterable: Iterable<any>) => {
    const arr = Array.from(iterable);
    const results: any[] = new Array(arr.length);
    let allSync = true;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v instanceof SyncPromise) {
        if ((v as any)._syncResolved) {
          results[i] = { status: "fulfilled", value: (v as any)._syncValue };
        } else if ((v as any)._syncRejected) {
          results[i] = { status: "rejected", reason: (v as any)._syncError };
        } else {
          allSync = false;
          break;
        }
      } else if (
        v && typeof v === "object" && typeof v.then === "function"
      ) {
        allSync = false;
        break;
      } else {
        results[i] = { status: "fulfilled", value: v };
      }
    }
    if (allSync) {
      return new SyncPromise((res: any) => res(results));
    }
    return new SyncPromise((res: any, rej: any) => {
      NativePromise.allSettled(arr).then(res, rej);
    });
  };

  (SyncPromise as any).race = (iterable: Iterable<any>) => {
    const arr = Array.from(iterable);
    for (const v of arr) {
      if (v instanceof SyncPromise) {
        if ((v as any)._syncResolved) {
          return new SyncPromise((res: any) => res((v as any)._syncValue));
        }
        if ((v as any)._syncRejected) {
          return new SyncPromise((_, rej: any) => rej((v as any)._syncError));
        }
      } else if (
        !(v && typeof v === "object" && typeof v.then === "function")
      ) {
        return new SyncPromise((res: any) => res(v));
      }
    }
    return new SyncPromise((res: any, rej: any) => {
      NativePromise.race(arr).then(res, rej);
    });
  };

  (SyncPromise as any).any = (iterable: Iterable<any>) => {
    const arr = Array.from(iterable);
    for (const v of arr) {
      if (v instanceof SyncPromise && (v as any)._syncResolved) {
        return new SyncPromise((res: any) => res((v as any)._syncValue));
      }
      if (
        !(v && typeof v === "object" && typeof v.then === "function")
      ) {
        return new SyncPromise((res: any) => res(v));
      }
    }
    let allSyncRejected = true;
    const errors: any[] = [];
    for (const v of arr) {
      if (v instanceof SyncPromise && (v as any)._syncRejected) {
        errors.push((v as any)._syncError);
      } else {
        allSyncRejected = false;
        break;
      }
    }
    if (allSyncRejected && arr.length > 0) {
      return new SyncPromise((_, rej: any) =>
        rej(new AggregateError(errors, "All promises were rejected")),
      );
    }
    return new SyncPromise((res: any, rej: any) => {
      NativePromise.any(arr).then(res, rej);
    });
  };

  return SyncPromise as any;
}

const SyncPromiseClass = createSyncPromise();

function makeDynamicLoader(
  resolver: ResolverFn,
): (specifier: string) => SyncThenable<unknown> {
  return (specifier: string): SyncThenable<unknown> => {
    const loaded = resolver(specifier);
    // Functions can have named exports as properties (e.g. Module.createRequire)
    if (
      loaded &&
      (typeof loaded === "object" || typeof loaded === "function") &&
      ("default" in (loaded as object) || "__esModule" in (loaded as object))
    ) {
      return new SyncThenable(loaded);
    }
    const spread = loaded && (typeof loaded === "object" || typeof loaded === "function")
      ? Object.getOwnPropertyNames(loaded as object).reduce((acc, key) => {
          acc[key] = (loaded as any)[key];
          return acc;
        }, {} as Record<string, unknown>)
      : {};
    return new SyncThenable({
      default: loaded,
      ...spread,
    });
  };
}

// ── Types ──
export interface ModuleRecord {
  id: string;
  filename: string;
  exports: unknown;
  loaded: boolean;
  children: ModuleRecord[];
  paths: string[];
  parent: ModuleRecord | null;
}

export interface EngineOptions {
  cwd?: string;
  env?: Record<string, string>;
  onConsole?: (method: string, args: unknown[]) => void;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  workerThreadsOverride?: {
    isMainThread: boolean;
    parentPort: unknown;
    workerData: unknown;
    threadId: number;
  };
}

export interface ResolverFn {
  (id: string): unknown;
  resolve: (id: string, options?: { paths?: string[] }) => string;
  cache: Record<string, ModuleRecord>;
  extensions: Record<string, unknown>;
  main: ModuleRecord | null;
  _ownerRecord?: ModuleRecord;
}

// Mutable copy so packages can monkey-patch frozen polyfill namespaces
function shallowCopy(source: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const k of Object.keys(source)) copy[k] = source[k];
  return copy;
}

// ── Core module registry ──
const CORE_MODULES: Record<string, unknown> = {
  path: pathPolyfill,
  http: shallowCopy(httpPolyfill as unknown as Record<string, unknown>),
  https: shallowCopy(httpsPolyfill as unknown as Record<string, unknown>),
  net: tcpPolyfill,
  events: eventBusPolyfill,
  stream: streamPolyfill,
  buffer: bufferPolyfill,
  url: urlPolyfill,
  querystring: qsPolyfill,
  util: helpersPolyfill,
  tty: ttyPolyfill,
  os: osPolyfill,
  crypto: shallowCopy(hashingPolyfill as unknown as Record<string, unknown>),
  zlib: compressionPolyfill,
  dns: dnsPolyfill,
  child_process: shellExecProxy,
  assert: assertPolyfill,
  string_decoder: stringDecoderPolyfill,
  timers: timersPolyfill,
  constants: constantsPolyfill,
  punycode: punycodePolyfill,
  _http_common: {},
  _http_incoming: {},
  _http_outgoing: {},
  chokidar: watcherPolyfill,
  ws: wsPolyfill,
  fsevents: macEventsPolyfill,
  readdirp: scannerPolyfill,
  module: moduleSysPolyfill.Module,
  perf_hooks: perfPolyfill,
  worker_threads: threadPoolPolyfill,
  esbuild: esbuildPolyfill,
  rollup: rollupPolyfill,
  v8: v8Polyfill,
  readline: lineReaderPolyfill,
  tls: tlsPolyfill,
  http2: http2Polyfill,
  cluster: clusterPolyfill,
  dgram: udpPolyfill,
  vm: vmPolyfill,
  inspector: debugPolyfill,
  "inspector/promises": debugPolyfill,
  async_hooks: asyncCtxPolyfill,
  domain: domainPolyfill,
  diagnostics_channel: tracePolyfill,
  console: { ...console, Console: consolePolyfill.Console },
  repl: replPolyfill,
  test: testPolyfill,
  trace_events: traceEventsPolyfill,
  wasi: wasiPolyfill,
  sea: seaPolyfill,
  sqlite: sqlitePolyfill,
  quic: quicPolyfill,
  lightningcss: lightningcssPolyfill,
  "@tailwindcss/oxide": tailwindOxidePolyfill,
  sys: helpersPolyfill,
  "util/types": helpersPolyfill.types,
  "path/posix": pathPolyfill,
  "path/win32": pathPolyfill.win32,
  "timers/promises": timersPromises,
  "stream/promises": streamPromises,
  "stream/web": {
    ReadableStream: globalThis.ReadableStream,
    WritableStream: globalThis.WritableStream,
    TransformStream: globalThis.TransformStream,
    ByteLengthQueuingStrategy: globalThis.ByteLengthQueuingStrategy,
    CountQueuingStrategy: globalThis.CountQueuingStrategy,
  },
  "stream/consumers": {
    async arrayBuffer(stream: any): Promise<ArrayBuffer> {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
        );
      }
      let len = 0;
      for (const c of chunks) len += c.byteLength;
      const buf = new Uint8Array(len);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
      }
      return buf.buffer;
    },
    async blob(stream: any): Promise<Blob> {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
        );
      }
      return new Blob(chunks as unknown as BlobPart[]);
    },
    async buffer(stream: any): Promise<Uint8Array> {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
        );
      }
      let len = 0;
      for (const c of chunks) len += c.byteLength;
      const buf = new Uint8Array(len);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
      }
      return buf;
    },
    async json(stream: any): Promise<unknown> {
      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
        );
      }
      return JSON.parse(chunks.join(""));
    },
    async text(stream: any): Promise<string> {
      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
        );
      }
      return chunks.join("");
    },
  },
  "dns/promises": dnsPromises,
  "assert/strict": assertPolyfill,
  "readline/promises": readlinePromises,
  _stream_readable: Readable,
  _stream_writable: Writable,
  _stream_duplex: Duplex,
  _stream_transform: Transform,
  _stream_passthrough: PassThrough,
  // Vite imports rollup/parseAst which normally uses native bindings
  "rollup/parseAst": {
    parseAst: rollupPolyfill.parseAst,
    parseAstAsync: rollupPolyfill.parseAstAsync,
  },
};

// ── Console wrapper ──
// Captured at module load time to avoid infinite recursion when globalThis.console is overridden
const _nativeConsole = console;

function wrapConsole(
  onConsole?: (method: string, args: unknown[]) => void,
): Console {
  // Route through onConsole callback exclusively when provided, else fall back to browser console
  const nc = _nativeConsole;
  const wrapped = {
    log: (...args: unknown[]) => {
      if (onConsole) onConsole("log", args);
      else nc.log(...args);
    },
    error: (...args: unknown[]) => {
      if (onConsole) onConsole("error", args);
      else nc.error(...args);
    },
    warn: (...args: unknown[]) => {
      if (onConsole) onConsole("warn", args);
      else nc.warn(...args);
    },
    info: (...args: unknown[]) => {
      if (onConsole) onConsole("info", args);
      else nc.info(...args);
    },
    debug: (...args: unknown[]) => {
      if (onConsole) onConsole("debug", args);
      else nc.debug(...args);
    },
    trace: (...args: unknown[]) => {
      if (onConsole) onConsole("trace", args);
      else nc.trace(...args);
    },
    dir: (obj: unknown) => {
      if (onConsole) onConsole("dir", [obj]);
      else nc.dir(obj);
    },
    time: nc.time.bind(nc),
    timeEnd: nc.timeEnd.bind(nc),
    timeLog: nc.timeLog.bind(nc),
    assert: (...args: unknown[]) => {
      const [v, ...rest] = args;
      if (!v) {
        if (onConsole) onConsole("error", ["Assertion failed:", ...rest]);
        else nc.assert(v as boolean, ...rest);
      }
    },
    clear: nc.clear.bind(nc),
    count: nc.count.bind(nc),
    countReset: nc.countReset.bind(nc),
    group: nc.group.bind(nc),
    groupCollapsed: nc.groupCollapsed.bind(nc),
    groupEnd: nc.groupEnd.bind(nc),
    table: (...args: unknown[]) => {
      if (onConsole) onConsole("log", args);
      else nc.table(...args);
    },
    timeStamp: nc.timeStamp ? nc.timeStamp.bind(nc) : () => {},
    profile: nc.profile ? nc.profile.bind(nc) : () => {},
    profileEnd: nc.profileEnd ? nc.profileEnd.bind(nc) : () => {},
  };
  return wrapped as unknown as Console;
}

// ── Module resolver & loader ──
function buildResolver(
  vol: MemoryVolume,
  fsBridge: FsBridge,
  proc: ProcessObject,
  baseDir: string,
  cache: Record<string, ModuleRecord>,
  opts: EngineOptions,
  codeCache?: Map<string, string>,
  deAsyncImports = false,
): ResolverFn {
  // Shared across all resolvers — avoids re-resolving the same paths/manifests per module
  const resolveCache: Map<string, string | null> =
    (cache as any).__resolveCache ?? ((cache as any).__resolveCache = new Map());
  const manifestCache: Map<string, PackageManifest | null> =
    (cache as any).__manifestCache ?? ((cache as any).__manifestCache = new Map());
  // Shared across all resolvers — deduplicates same-version packages from nested node_modules
  const _pkgIdentityMap: Record<string, string> =
    (cache as any).__pkgIdentityMap ?? ((cache as any).__pkgIdentityMap = {});

  const readManifest = (manifestPath: string): PackageManifest | null => {
    if (manifestCache.has(manifestPath))
      return manifestCache.get(manifestPath)!;
    try {
      const raw = vol.readFileSync(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as PackageManifest;
      manifestCache.set(manifestPath, parsed);
      return parsed;
    } catch {
      manifestCache.set(manifestPath, null);
      return null;
    }
  };

  const resolveId = (
    id: string,
    fromDir: string,
    preferEsm: boolean = false,
  ): string => {
    if (typeof id !== "string") {
      throw new TypeError(
        `The "id" argument must be of type string. Received ${typeof id}`,
      );
    }
    if (id.startsWith("node:")) id = id.slice(5);

    if (id.startsWith("file:///")) {
      id = decodeURIComponent(id.slice(7));
      if (/^[A-Za-z]:[\\/]/.test(id)) {
        id = "/" + id.slice(2).replace(/\\/g, "/");
      }
    } else if (id.startsWith("file://")) {
      id = decodeURIComponent(id.slice(7));
      if (/^[A-Za-z]:[\\/]/.test(id)) {
        id = "/" + id.slice(2).replace(/\\/g, "/");
      }
    }

    const qIdx = id.indexOf("?");
    if (qIdx !== -1) id = id.slice(0, qIdx);

    const hashIdx = id.indexOf("#");
    if (hashIdx !== -1 && !id.startsWith("#")) id = id.slice(0, hashIdx);

    if (id.includes("\\")) id = id.replace(/\\/g, "/");

    if (
      CORE_MODULES[id] ||
      id === "fs" ||
      id === "process" ||
      id === "url" ||
      id === "querystring" ||
      id === "util"
    ) {
      return id;
    }

    // Native Rust bindings can't run in browser — provide JS stubs
    if (id.startsWith("@rollup/rollup-")) {
      if (!CORE_MODULES[id]) {
        CORE_MODULES[id] = {
          parse: rollupPolyfill.parseAst,
          parseAsync: rollupPolyfill.parseAstAsync,
        };
      }
      return id;
    }

    if (id.startsWith("@rolldown/binding-")) {
      if (!CORE_MODULES[id]) {
        const makeParseResult = (source: string, opts?: any) => {
          const lang = opts?.lang || "js";
          const useJsx = lang === "jsx" || lang === "tsx";
          const ast = rollupPolyfill.parseAst(source, { jsx: useJsx });
          return {
            program: JSON.stringify({ node: ast, fixes: [] }),
            module: {
              hasModuleSyntax: false,
              staticImports: [],
              staticExports: [],
              dynamicImports: [],
              importMetas: [],
            },
            comments: [],
            errors: [],
          };
        };
        const applyDefineReplacements = (
          code: string,
          define?: Record<string, string>,
        ): string => {
          if (!define || typeof define !== "object") return code;
          for (const [key, value] of Object.entries(define)) {
            if (!key) continue;
            const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`\\b${escaped}\\b`, "g");
            code = code.replace(re, value);
          }
          return code;
        };
        const noop = () => {};
        const noopAsync = async () => {};
        CORE_MODULES[id] = {
          // Parser
          parseSync: (_filename: string, source: string, opts?: any) =>
            makeParseResult(source, opts),
          parse: async (_filename: string, source: string, opts?: any) =>
            makeParseResult(source, opts),
          initTraceSubscriber: noop,
          shutdownAsyncRuntime: noop,
          startAsyncRuntime: noop,
          createTokioRuntime: noop,
          registerPlugins: noop,
          rawTransferSupported: () => false,
          sync: noop,
          transform: async (filename: string, code: string, opts?: any) => {
            code = applyDefineReplacements(code, opts?.define);
            if (!isCSSFile(filename) && (isTypeScriptFile(filename) || looksLikeTypeScript(code)))
              code = stripTypeScript(code);
            return { code, map: null, errors: [], warnings: [] };
          },
          transformSync: (filename: string, code: string, opts?: any) => {
            code = applyDefineReplacements(code, opts?.define);
            if (!isCSSFile(filename) && (isTypeScriptFile(filename) || looksLikeTypeScript(code)))
              code = stripTypeScript(code);
            return { code, map: null, errors: [], warnings: [] };
          },
          enhancedTransform: async (
            filename: string,
            code: string,
            opts?: any,
          ) => {
            code = applyDefineReplacements(code, opts?.define);
            if (!isCSSFile(filename) && (isTypeScriptFile(filename) || looksLikeTypeScript(code)))
              code = stripTypeScript(code);
            return {
              code,
              map: null,
              errors: [],
              warnings: [],
              helpersUsed: {},
              tsconfigFilePaths: [],
            };
          },
          enhancedTransformSync: (
            filename: string,
            code: string,
            opts?: any,
          ) => {
            code = applyDefineReplacements(code, opts?.define);
            if (!isCSSFile(filename) && (isTypeScriptFile(filename) || looksLikeTypeScript(code)))
              code = stripTypeScript(code);
            return {
              code,
              map: null,
              errors: [],
              warnings: [],
              helpersUsed: {},
              tsconfigFilePaths: [],
            };
          },
          minify: async (_filename: string, code: string) => ({
            code,
            map: null,
            errors: [],
            warnings: [],
          }),
          minifySync: (_filename: string, code: string) => ({
            code,
            map: null,
            errors: [],
            warnings: [],
          }),
          isolatedDeclaration: async (_filename: string, code: string) => ({
            code,
            map: null,
            errors: [],
            warnings: [],
          }),
          isolatedDeclarationSync: (_filename: string, code: string) => ({
            code,
            map: null,
            errors: [],
            warnings: [],
          }),
          moduleRunnerTransform: async (filename: string, code: string) => {
            if (!isCSSFile(filename) && (isTypeScriptFile(filename) || looksLikeTypeScript(code)))
              code = stripTypeScript(code);
            return { code, map: null, deps: [], dynamicDeps: [], errors: [] };
          },
          moduleRunnerTransformSync: (filename: string, code: string) => {
            if (!isCSSFile(filename) && (isTypeScriptFile(filename) || looksLikeTypeScript(code)))
              code = stripTypeScript(code);
            return { code, map: null, deps: [], dynamicDeps: [], errors: [] };
          },
          Severity: { Error: "Error", Warning: "Warning", Advice: "Advice" },
          ParseResult: class {},
          ResolverFactory: class {},
          EnforceExtension: { Auto: 0, Enabled: 1, Disabled: 2 },
          ModuleType: {},
          HelperMode: {},
          TraceSubscriberGuard: class {},
          BindingBundler: class {
            closed = false;
            #watchFiles: string[] = [];
            async generate(opts: any) {
              return this.#bundle(opts);
            }
            async write(opts: any) {
              const result = await this.#bundle(opts);
              const outputOpts = opts?.outputOptions ?? {};
              const dir = outputOpts.dir || "/dist";
              try {
                if (!vol.existsSync(dir)) {
                  vol.mkdirSync(dir, { recursive: true });
                }
              } catch {
                /* best effort */
              }
              for (const chunk of result.chunks) {
                const outPath = pathPolyfill.join(dir, chunk.getFileName());
                try {
                  const outDir = pathPolyfill.dirname(outPath);
                  if (!vol.existsSync(outDir)) {
                    vol.mkdirSync(outDir, { recursive: true });
                  }
                  const code = chunk.getCode();
                  vol.writeFileSync(outPath, code);
                } catch {
                  /* best effort */
                }
              }
              return result;
            }
            // Dependency scanning for Vite's dep optimizer — invokes plugin resolveId hooks
            // so Vite's scan plugin discovers bare imports to pre-bundle
            async scan(opts?: any) {
              try {
                const inputOpts = opts?.inputOptions ?? {};
                const plugins: any[] = (inputOpts.plugins ?? []).filter(
                  Boolean,
                );
                const entries: { name?: string; import: string }[] =
                  Array.isArray(inputOpts.input) ? inputOpts.input : [];
                const cwd = inputOpts.cwd || "/";
                if (!entries.length || !plugins.length) return;

                const mockCtx = {
                  resolve: async () => null,
                  load: async () => ({}),
                  emitFile: () => "",
                  getFileName: () => "",
                  getModuleInfo: () => null,
                  getModuleIds: () => [],
                  addWatchFile: () => {},
                  parse: (code: string) =>
                    acorn.parse(code, {
                      ecmaVersion: "latest" as any,
                      sourceType: "module",
                    }),
                };

                const extractImports = (code: string): string[] => {
                  const specs: string[] = [];
                  try {
                    const ast: any = acorn.parse(code, {
                      ecmaVersion: "latest" as any,
                      sourceType: "module",
                      allowImportExportEverywhere: true,
                    });
                    for (const node of ast.body) {
                      if (
                        node.type === "ImportDeclaration" &&
                        node.source?.value
                      )
                        specs.push(node.source.value);
                      if (
                        node.type === "ExportNamedDeclaration" &&
                        node.source?.value
                      )
                        specs.push(node.source.value);
                      if (
                        node.type === "ExportAllDeclaration" &&
                        node.source?.value
                      )
                        specs.push(node.source.value);
                    }
                  } catch { /* fallback to regex */ }
                  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
                  let m;
                  while ((m = dynRe.exec(code)) !== null) specs.push(m[1]);
                  return [...new Set(specs)];
                };

                for (const p of plugins) {
                  if (p.buildStart) {
                    try {
                      await p.buildStart(mockCtx, {});
                    } catch (hookErr) {
                      const msg = hookErr instanceof Error ? hookErr.message : String(hookErr);
                      _nativeConsole.warn("[rolldown scan] buildStart hook error:", msg);
                    }
                  }
                }

                // BFS: load files, extract imports, call resolveId, follow local files
                const visitedSpecs = new Set<string>();
                const visitedFiles = new Set<string>();
                const queue: string[] = [];

                for (const entry of entries) {
                  const ep = entry.import?.startsWith("/")
                    ? entry.import
                    : pathPolyfill.resolve(cwd, entry.import);
                  queue.push(ep);
                }

                const loadFile = async (
                  filePath: string,
                  usePlugins: boolean,
                ): Promise<string> => {
                  if (usePlugins) {
                    for (const p of plugins) {
                      if (p.load) {
                        try {
                          const r = await p.load(mockCtx, filePath);
                          if (r && typeof r === "object" && r.code)
                            return r.code;
                        } catch (loadErr) {
                          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
                          _nativeConsole.warn("[rolldown scan] load hook error:", filePath, msg);
                        }
                      }
                    }
                  }
                  return vol.readFileSync(filePath, "utf8");
                };

                const MAX_DEPTH = LIMITS.MAX_RESOLVE_DEPTH;
                let processed = 0;
                const entryPaths = new Set(queue);
                while (queue.length > 0 && processed < MAX_DEPTH) {
                  const filePath = queue.shift()!;
                  if (visitedFiles.has(filePath)) continue;
                  visitedFiles.add(filePath);
                  processed++;

                  let code: string;
                  try {
                    code = await loadFile(filePath, entryPaths.has(filePath));
                  } catch {
                    continue;
                  }

                  const specifiers = extractImports(code);

                  for (const spec of specifiers) {
                    const key = `${spec}\0${filePath}`;
                    if (visitedSpecs.has(key)) continue;
                    visitedSpecs.add(key);

                    for (const p of plugins) {
                      if (p.resolveId) {
                        try {
                          await p.resolveId(mockCtx, spec, filePath, {
                            isEntry: false,
                            kind: "import-statement",
                            custom: undefined,
                          });
                        } catch (resolveErr) {
                          const msg = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
                          _nativeConsole.warn("[rolldown scan] resolveId hook error:", spec, msg);
                        }
                      }
                    }

                    // Follow local files to discover deeper imports
                    if (spec.startsWith(".") || spec.startsWith("/")) {
                      const dir = pathPolyfill.dirname(filePath);
                      let resolved = "";
                      try {
                        resolved = resolveId(spec, dir, true);
                      } catch {
                        /* not found */
                      }
                      // Vite treats absolute paths as project-root-relative
                      if (!resolved && spec.startsWith("/")) {
                        try {
                          const cwdSpec = pathPolyfill.join(cwd, spec);
                          resolved = resolveId(cwdSpec, cwd, true);
                        } catch {
                          /* not found */
                        }
                      }
                      if (
                        resolved &&
                        !resolved.includes("/node_modules/") &&
                        !visitedFiles.has(resolved)
                      ) {
                        queue.push(resolved);
                      }
                    }
                  }
                }

                for (const p of plugins) {
                  if (p.buildEnd) {
                    try {
                      await p.buildEnd(mockCtx);
                    } catch (endErr) {
                      const msg = endErr instanceof Error ? endErr.message : String(endErr);
                      _nativeConsole.warn("[rolldown scan] buildEnd hook error:", msg);
                    }
                  }
                }
              } catch (scanErr) {
                const msg = scanErr instanceof Error ? scanErr.message : String(scanErr);
                const detail = scanErr instanceof Error && scanErr.stack ? `\n${scanErr.stack}` : "";
                _nativeConsole.warn("[rolldown scan]", msg);
              }
            }
            async close() {
              this.closed = true;
            }
            getWatchFiles() {
              return this.#watchFiles;
            }
            async #bundle(opts: any) {
              const inputOpts = opts?.inputOptions ?? {};
              const entries: { name: string; import: string }[] = Array.isArray(
                inputOpts.input,
              )
                ? inputOpts.input
                : [];
              const cwd = inputOpts.cwd || "/";
              const outputOpts = opts?.outputOptions ?? {};
              const format = outputOpts.format ?? "esm";
              const entryFileNames = outputOpts.entryFileNames || "[name].js";

              const extractExports = (src: string): string[] => {
                try {
                  const ast = acorn.parse(src, {
                    ecmaVersion: "latest",
                    sourceType: "module",
                    allowImportExportEverywhere: true,
                  }) as any;
                  const names: string[] = [];
                  for (const node of ast.body) {
                    if (
                      node.type === "ExportNamedDeclaration" &&
                      node.specifiers
                    ) {
                      for (const s of node.specifiers) {
                        if (s.exported?.name) names.push(s.exported.name);
                      }
                      if (node.declaration) {
                        if (node.declaration.id?.name) {
                          names.push(node.declaration.id.name);
                        } else if (node.declaration.declarations) {
                          for (const d of node.declaration.declarations) {
                            if (d.id?.name) names.push(d.id.name);
                          }
                        }
                      }
                    } else if (node.type === "ExportDefaultDeclaration") {
                      names.push("default");
                    } else if (node.type === "ExportAllDeclaration") {
                      // Can't statically enumerate re-exports
                    }
                  }
                  return names;
                } catch {
                  return [];
                }
              };

              // Re-resolve using browser ESM conditions when esbuild produces empty output
              // (happens with thin ESM re-exports pointing at CJS like vue/index.mjs)
              const reResolveEntry = (origPath: string): string | null => {
                // Only applicable inside node_modules
                const nmIdx = origPath.lastIndexOf("/node_modules/");
                if (nmIdx === -1) return null;
                const afterNm = origPath.slice(nmIdx + "/node_modules/".length);
                const parts = afterNm.split("/");
                const scoped = parts[0].startsWith("@");
                const pkgName = scoped ? parts.slice(0, 2).join("/") : parts[0];
                const pkgRoot = origPath.slice(0, nmIdx) + "/node_modules/" + pkgName;
                const pkgJsonPath = pkgRoot + "/package.json";
                try {
                  if (!vol.existsSync(pkgJsonPath)) return null;
                  const manifest = JSON.parse(vol.readFileSync(pkgJsonPath, "utf8"));
                  for (const conds of [
                    { browser: true, import: true },
                    { import: true },
                  ] as const) {
                    try {
                      const resolved = resolveExports(manifest, ".", conds);
                      if (resolved?.length) {
                        const full = pathPolyfill.join(pkgRoot, resolved[0]);
                        if (vol.existsSync(full) && full !== origPath) return full;
                      }
                    } catch { /* try next */ }
                  }
                } catch { /* can't re-resolve */ }
                return null;
              };

              const esbuildMod = CORE_MODULES["esbuild"] as any;
              const chunks: any[] = [];
              for (const entry of entries) {
                let entryPath = entry.import.startsWith("/")
                  ? entry.import
                  : pathPolyfill.resolve(cwd, entry.import);
                let code: string;
                const esbuildPlatform =
                  inputOpts.platform === "browser" ? "browser" : "node";
                const esbuildFormat = format === "cjs" ? "cjs" : "esm";

                const doBuild = async (ep: string) => {
                  const result = await esbuildMod.build({
                    entryPoints: [ep],
                    bundle: true,
                    write: false,
                    format: esbuildFormat,
                    platform: esbuildPlatform,
                    sourcemap: outputOpts.sourcemap ? "inline" : false,
                    target: "esnext",
                    logLevel: "warning",
                  });
                  return result.outputFiles?.[0]?.text ?? vol.readFileSync(ep, "utf8");
                };

                try {
                  code = await doBuild(entryPath);

                  // Empty output = thin ESM re-export of CJS; try browser-ESM re-resolve
                  if (
                    esbuildFormat === "esm" &&
                    esbuildPlatform === "browser" &&
                    code.length < 300 &&
                    extractExports(code).length === 0
                  ) {
                    const alt = reResolveEntry(entryPath);
                    if (alt) {
                      const altCode = await doBuild(alt);
                      if (altCode.length > code.length) {
                        code = altCode;
                        entryPath = alt;
                      }
                    }
                  }
                } catch (buildErr) {
                  const buildMsg = buildErr instanceof Error ? buildErr.message : String(buildErr);
                  _nativeConsole.warn("[rolldown bundle] esbuild failed for", entryPath, buildMsg);
                  try {
                    code = vol.readFileSync(entryPath, "utf8");
                  } catch {
                    code = "";
                  }
                }
                const name =
                  entry.name ||
                  pathPolyfill.basename(
                    entryPath,
                    pathPolyfill.extname(entryPath),
                  );
                const fileName =
                  typeof entryFileNames === "string"
                    ? entryFileNames.replace("[name]", name)
                    : name + ".js";
                const exports = extractExports(code);
                this.#watchFiles.push(entryPath);
                chunks.push({
                  dropInner: () => ({ freed: true }),
                  getFileName: () => fileName,
                  getName: () => name,
                  getCode: () => code,
                  getExports: () => exports,
                  getIsEntry: () => true,
                  getIsDynamicEntry: () => false,
                  getFacadeModuleId: () => entryPath,
                  getSourcemapFileName: () => null,
                  getPreliminaryFileName: () => fileName,
                  getModules: () => ({ values: [], keys: [] }),
                  getImports: () => [],
                  getDynamicImports: () => [],
                  getModuleIds: () => [entryPath],
                  getMap: () => null,
                });
              }
              return { chunks, assets: [] };
            }
          },
          // Constructor (not class) so methods are own-enumerable — Vite iterates with for...in
          BindingCallableBuiltinPlugin: function (this: any, _opts: any) {
            this.resolveId = async function (
              specifier: string,
              importer?: string | null,
            ) {
              if (!specifier || typeof specifier !== "string") return null;
              if (specifier.startsWith("\0")) return null;
              if (
                specifier.includes(":") &&
                !specifier.startsWith("/") &&
                !specifier.startsWith(".")
              )
                return null;

              // Preserve query/hash (Vue SFC virtual modules need them)
              let cleanSpec = specifier;
              let querySuffix = "";
              const qIdx = cleanSpec.indexOf("?");
              if (qIdx !== -1) {
                querySuffix = cleanSpec.slice(qIdx);
                cleanSpec = cleanSpec.slice(0, qIdx);
              }
              const hIdx = cleanSpec.indexOf("#");
              if (hIdx !== -1) {
                querySuffix = cleanSpec.slice(hIdx) + querySuffix;
                cleanSpec = cleanSpec.slice(0, hIdx);
              }

              // Strip Vite dev server prefixes like /@fs/ and /@id/
              let stripped = cleanSpec;
              if (
                stripped.startsWith("/@") &&
                stripped.length > 2 &&
                stripped[2] !== "/"
              ) {
                const secondSlash = stripped.indexOf("/", 2);
                if (secondSlash !== -1) {
                  stripped = stripped.slice(secondSlash);
                }
              }

              const fromDir = importer
                ? pathPolyfill.dirname(
                    importer.startsWith("/@")
                      ? importer.slice(importer.indexOf("/", 2))
                      : importer,
                  )
                : (typeof globalThis !== "undefined" &&
                    (globalThis as any).process?.cwd?.()) ||
                  "/";

              for (const candidate of stripped !== cleanSpec
                ? [stripped, cleanSpec]
                : [cleanSpec]) {
                try {
                  const resolved = resolveId(candidate, fromDir, true);
                  if (resolved) {
                    return { id: resolved + querySuffix };
                  }
                } catch (_e) { /* not found */ }

                if (candidate.startsWith("/")) {
                  if (vol.existsSync(candidate)) return { id: candidate + querySuffix };
                  const cwd =
                    (typeof globalThis !== "undefined" &&
                      (globalThis as any).process?.cwd?.()) ||
                    "/";
                  if (cwd !== "/") {
                    const abs = cwd + candidate;
                    if (vol.existsSync(abs)) return { id: abs + querySuffix };
                    for (const ext of RESOLVE_EXTENSIONS) {
                      if (vol.existsSync(abs + ext)) return { id: abs + ext + querySuffix };
                    }
                  }
                }
              }
              return null;
            };
            this.load = async function () {
              return null;
            };
            this.transform = async function () {
              return null;
            };
            this.watchChange = async function () {};
            this.buildStart = function () {};
            this.buildEnd = function () {};
            this.renderChunk = function () {
              return null;
            };
            this.generateBundle = function () {};
            this.moduleParsed = function () {};
          },
          resolveTsconfig: () => ({
            tsconfig: {
              compilerOptions: {},
            },
            tsconfigFilePaths: [],
          }),
          collapseSourcemaps: () => null,
          freeExternalMemory: noop,
          scan: noopAsync,
          BindingWatcher: class {
            constructor(_options?: any, _notifyOption?: any) {}
            async close() {}
            async start(_listener: any) {}
          },
          BindingWatcherBundler: class {
            async close() {}
          },
          BindingDevEngine: class {
            constructor(_options?: any, _devOptions?: any) {}
            async run() {}
            async ensureCurrentBuildFinish() {}
            async getBundleState() {
              return { lastFullBuildFailed: false, hasStaleOutput: false };
            }
            async ensureLatestBuildOutput() {}
            async invalidate() {
              return [];
            }
            async registerModules() {}
            async removeClient() {}
            async close() {}
            async compileEntry() {
              return "";
            }
          },
          BindingPluginContext: class {},
          BindingTransformPluginContext: class {},
          BindingLoadPluginContext: class {},
          BindingChunkingContext: class {},
          BindingOutputChunk: class {},
          BindingOutputAsset: class {},
          BindingRenderedChunk: class {},
          BindingRenderedChunkMeta: class {},
          BindingRenderedModule: class {},
          BindingModuleInfo: class {},
          BindingNormalizedOptions: class {},
          BindingSourceMap: class {},
          BindingDecodedMap: class {},
          BindingBundleEndEventData: class {},
          BindingBundleErrorEventData: class {},
          BindingWatcherChangeData: class {},
          BindingWatcherEvent: class {},
          TsconfigCache: class {},
          ParallelJsPluginRegistry: class {},
          ScheduledBuild: class {},
          ExportExportNameKind: {},
          ExportImportNameKind: {},
          ExportLocalNameKind: {},
          ImportNameKind: {},
          FilterTokenKind: {},
          BindingChunkModuleOrderBy: { ModuleId: 0, ExecOrder: 1 },
          BindingPluginOrder: { Pre: 0, Post: 1 },
          BindingAttachDebugInfo: { None: 0, Simple: 1, Full: 2 },
          BindingLogLevel: { Silent: 0, Debug: 1, Warn: 2, Info: 3 },
          BindingPropertyReadSideEffects: { Always: 0, False: 1 },
          BindingPropertyWriteSideEffects: { Always: 0, False: 1 },
          BindingBuiltinPluginName: {},
          BindingRebuildStrategy: { Always: 0, Auto: 1, Never: 2 },
          BindingMagicString: class {
            _str: string;
            _original: string;
            _changed: boolean;
            _filename: string | null;
            constructor(source?: string, opts?: any) {
              this._str = source ?? "";
              this._original = this._str;
              this._changed = false;
              this._filename = opts?.filename ?? null;
            }
            get filename() {
              return this._filename;
            }
            replace(from: string, to: string) {
              this._str = this._str.replace(from, to);
              if (this._str !== this._original) this._changed = true;
              return this;
            }
            replaceAll(from: string, to: string) {
              this._str = this._str.split(from).join(to);
              if (this._str !== this._original) this._changed = true;
              return this;
            }
            prepend(content: string) {
              this._str = content + this._str;
              this._changed = true;
              return this;
            }
            append(content: string) {
              this._str += content;
              this._changed = true;
              return this;
            }
            prependLeft(idx: number, content: string) {
              this._str =
                this._str.slice(0, idx) + content + this._str.slice(idx);
              this._changed = true;
              return this;
            }
            prependRight(idx: number, content: string) {
              this._str =
                this._str.slice(0, idx) + content + this._str.slice(idx);
              this._changed = true;
              return this;
            }
            appendLeft(idx: number, content: string) {
              this._str =
                this._str.slice(0, idx) + content + this._str.slice(idx);
              this._changed = true;
              return this;
            }
            appendRight(idx: number, content: string) {
              this._str =
                this._str.slice(0, idx) + content + this._str.slice(idx);
              this._changed = true;
              return this;
            }
            overwrite(start: number, end: number, content: string) {
              this._str =
                this._str.slice(0, start) + content + this._str.slice(end);
              this._changed = true;
              return this;
            }
            update(start: number, end: number, content: string) {
              return this.overwrite(start, end, content);
            }
            remove(start: number, end: number) {
              return this.overwrite(start, end, "");
            }
            toString() {
              return this._str;
            }
            hasChanged() {
              return this._changed;
            }
            length() {
              return this._str.length;
            }
            isEmpty() {
              return this._str.length === 0;
            }
            insert(_index: number, _content: string): never {
              throw new Error(
                "magicString.insert(...) is deprecated. Use prependRight(...) or appendLeft(...) instead",
              );
            }
            indent(indentor?: string) {
              const ind = indentor ?? "\t";
              this._str = this._str.replace(/^/gm, ind);
              this._changed = true;
              return this;
            }
            trim(_charType?: string) {
              this._str = this._str.trim();
              if (this._str !== this._original) this._changed = true;
              return this;
            }
            trimStart(_charType?: string) {
              this._str = this._str.trimStart();
              if (this._str !== this._original) this._changed = true;
              return this;
            }
            trimEnd(_charType?: string) {
              this._str = this._str.trimEnd();
              if (this._str !== this._original) this._changed = true;
              return this;
            }
            trimLines() {
              this._str = this._str.replace(/^\n+/, "").replace(/\n+$/, "");
              if (this._str !== this._original) this._changed = true;
              return this;
            }
            clone() {
              const c = new (this.constructor as any)(this._str);
              c._original = this._original;
              c._changed = this._changed;
              return c;
            }
            lastChar() {
              return this._str[this._str.length - 1] || "";
            }
            lastLine() {
              const idx = this._str.lastIndexOf("\n");
              return idx === -1 ? this._str : this._str.slice(idx + 1);
            }
            snip(start: number, end: number) {
              return new (this.constructor as any)(this._str.slice(start, end));
            }
            reset(start: number, end: number) {
              const s = start < 0 ? this._original.length + start : start;
              const e = end < 0 ? this._original.length + end : end;
              const original = this._original.slice(s, e);
              this._str = this._str.slice(0, s) + original + this._str.slice(e);
              return this;
            }
            slice(start?: number, end?: number) {
              return this._str.slice(start, end);
            }
            relocate(start: number, end: number, to: number) {
              const chunk = this._str.slice(start, end);
              const without = this._str.slice(0, start) + this._str.slice(end);
              const adjustedTo = to > end ? to - (end - start) : to;
              this._str =
                without.slice(0, adjustedTo) +
                chunk +
                without.slice(adjustedTo);
              this._changed = true;
              return this;
            }
            move(start: number, end: number, index: number) {
              return this.relocate(start, end, index);
            }
            generateMap(_opts?: any) {
              return { version: 3, sources: [], mappings: "", names: [] };
            }
            generateDecodedMap(_opts?: any) {
              return { version: 3, sources: [], mappings: [], names: [] };
            }
          },
        };
      }
      return id;
    }

    if (id.startsWith("#")) {
      let dir = fromDir;
      while (dir !== "/" && dir) {
        const mf = readManifest(pathPolyfill.join(dir, "package.json"));
        if (mf?.imports) {
          for (const conds of [
            { browser: true, require: true },
            { require: true },
            { browser: true, import: true },
            {},
          ] as const) {
            try {
              const resolved = resolveImports(mf, id, conds);
              if (resolved?.length) {
                const full = pathPolyfill.join(dir, resolved[0]);
                if (vol.existsSync(full)) return full;
                for (const ext of IMPORTS_FIELD_EXTENSIONS) {
                  if (vol.existsSync(full + ext)) return full + ext;
                }
              }
            } catch {
              /* try next condition set */
            }
          }
        }
        const parent = pathPolyfill.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      // Unresolvable # imports get a stub (many are just feature-detection flags)
      const stubPath = `/node_modules/.nodepod-stubs/${id.slice(1)}.js`;
      if (!vol.existsSync(stubPath)) {
        vol.mkdirSync(pathPolyfill.dirname(stubPath), { recursive: true });
        vol.writeFileSync(stubPath, "module.exports = {};");
      }
      return stubPath;
    }

    const cacheKey = `${fromDir}|${id}`;
    const cached = resolveCache.get(cacheKey);
    if (cached !== undefined) {
      if (cached === null) {
        const e = new Error(`Cannot find module '${id}'`) as Error & { code: string };
        e.code = "MODULE_NOT_FOUND";
        throw e;
      }
      return cached;
    }

    const tryFile = (base: string): string | null => {
      if (vol.existsSync(base)) {
        const s = vol.statSync(base);
        if (s.isFile()) return base;
        const localMf = readManifest(pathPolyfill.join(base, "package.json"));
        if (localMf?.main) {
          const mainPath = pathPolyfill.join(base, localMf.main);
          if (vol.existsSync(mainPath)) {
            const ms = vol.statSync(mainPath);
            if (ms.isFile()) return mainPath;
          }
          for (const ext of MAIN_FIELD_EXTENSIONS) {
            const withExt = mainPath + ext;
            if (vol.existsSync(withExt)) return withExt;
          }
        }
        for (const idx of INDEX_FILES) {
          const idxPath = pathPolyfill.join(base, idx);
          if (vol.existsSync(idxPath)) return idxPath;
        }
      }
      for (const ext of [...MAIN_FIELD_EXTENSIONS, ".node"]) {
        const withExt = base + ext;
        if (vol.existsSync(withExt)) return withExt;
      }
      return null;
    };

    if (id === "." || id === "..") id = id + "/";
    if (id.startsWith("./") || id.startsWith("../") || id.startsWith("/")) {
      const abs = id.startsWith("/") ? id : pathPolyfill.resolve(fromDir, id);
      const found = tryFile(abs);
      if (found) {
        resolveCache.set(cacheKey, found);
        return found;
      }

      resolveCache.set(cacheKey, null);
      const e = new Error(`Cannot find module '${id}' from '${fromDir}'`) as Error & { code: string };
      e.code = "MODULE_NOT_FOUND";
      throw e;
    }

    const applyBrowserRemap = (
      resolved: string,
      manifest: PackageManifest,
      pkgRoot: string,
    ): string | null => {
      if (!manifest.browser || typeof manifest.browser !== "object")
        return resolved;
      const map = manifest.browser as Record<string, string | false>;
      const rel = "./" + pathPolyfill.relative(pkgRoot, resolved);
      const relNoExt = rel.replace(/\.(js|json|cjs|mjs)$/, "");
      for (const k of [rel, relNoExt]) {
        if (k in map) {
          if (map[k] === false) return null;
          return tryFile(pathPolyfill.join(pkgRoot, map[k] as string));
        }
      }
      return resolved;
    };

    const tryNodeModules = (nmDir: string, moduleId: string): string | null => {
      const parts = moduleId.split("/");
      const pkgName =
        parts[0].startsWith("@") && parts.length > 1
          ? `${parts[0]}/${parts[1]}`
          : parts[0];

      const pkgRoot = pathPolyfill.join(nmDir, pkgName);
      const mfPath = pathPolyfill.join(pkgRoot, "package.json");
      const manifest = readManifest(mfPath);

      if (manifest) {
        let exportsResolved = false;
        if (manifest.exports) {
          const subpath =
            moduleId === pkgName
              ? "."
              : "./" + moduleId.slice(pkgName.length + 1);

          // Custom export conditions from --conditions flag / NODE_OPTIONS
          const extraConditions: string[] = [];
          const execArgv: string[] = proc.execArgv || [];
          for (let ai = 0; ai < execArgv.length; ai++) {
            const arg = execArgv[ai];
            if (arg === "--conditions" || arg === "-C") {
              if (ai + 1 < execArgv.length) extraConditions.push(execArgv[++ai]);
            } else if (arg.startsWith("--conditions=")) {
              extraConditions.push(arg.slice("--conditions=".length));
            }
          }
          const nodeOpts = proc.env?.NODE_OPTIONS || "";
          const condMatch = nodeOpts.matchAll(/(?:--conditions[= ]|-C )(\S+)/g);
          for (const m of condMatch) extraConditions.push(m[1]);
          const condExtra = extraConditions.length > 0
            ? { conditions: extraConditions }
            : {};

          const baseSets: Record<string, unknown>[] = preferEsm
            ? [
                { node: true, import: true, ...condExtra },
                { browser: true, import: true, ...condExtra },
                { import: true, ...condExtra },
                { node: true, require: true, ...condExtra },
                { browser: true, require: true, ...condExtra },
                { require: true, ...condExtra },
              ]
            : [
                { node: true, require: true, ...condExtra },
                { browser: true, require: true, ...condExtra },
                { require: true, ...condExtra },
                { node: true, import: true, ...condExtra },
                { browser: true, import: true, ...condExtra },
                { import: true, ...condExtra },
              ];

          for (const conds of baseSets) {
            try {
              const resolved = resolveExports(manifest, subpath, conds);
              if (resolved?.length) {
                const full = pathPolyfill.join(pkgRoot, resolved[0]);
                const found = tryFile(full);
                if (found) {
                  if (found.endsWith(".cjs")) {
                    try {
                      const content = vol.readFileSync(found, "utf8");
                      if (content.trimStart().startsWith("throw ")) continue;
                    } catch {
                      /* proceed */
                    }
                  }
                  exportsResolved = true;
                  return found;
                }
              }
            } catch {
              /* try next */
            }
          }
        }

        if (!exportsResolved && pkgName === moduleId) {
          let entry: string | undefined;
          if (typeof manifest.browser === "string") entry = manifest.browser;
          if (!entry && manifest.module) entry = manifest.module as string;
          if (!entry) entry = manifest.main || "index.js";
          const found = tryFile(pathPolyfill.join(pkgRoot, entry));
          if (found) return found;
        }
      }

      const directPath = pathPolyfill.join(nmDir, moduleId);
      return tryFile(directPath);
    };

    let searchDir = fromDir;
    while (searchDir !== "/") {
      const nmDir = pathPolyfill.join(searchDir, "node_modules");
      const found = tryNodeModules(nmDir, id);
      if (found) {
        resolveCache.set(cacheKey, found);
        return found;
      }
      searchDir = pathPolyfill.dirname(searchDir);
    }

    const rootFound = tryNodeModules("/node_modules", id);
    if (rootFound) {
      resolveCache.set(cacheKey, rootFound);
      return rootFound;
    }

    // Fallback: resolve from cwd (handles modules loaded from temp/bundled locations)
    const cwd = proc.cwd();
    if (cwd !== fromDir && cwd !== "/") {
      let fallbackDir = cwd;
      while (fallbackDir !== "/" && fallbackDir !== fromDir) {
        const nmDir = pathPolyfill.join(fallbackDir, "node_modules");
        const found = tryNodeModules(nmDir, id);
        if (found) {
          resolveCache.set(cacheKey, found);
          return found;
        }
        fallbackDir = pathPolyfill.dirname(fallbackDir);
      }
    }

    resolveCache.set(cacheKey, null);
    const e = new Error(`Cannot find module '${id}' from '${fromDir}'`) as Error & { code: string };
    e.code = "MODULE_NOT_FOUND";
    throw e;
  };

  const loadModule = (resolved: string, parentRecord?: ModuleRecord): ModuleRecord => {
    if (cache[resolved]) return cache[resolved];

    // Package dedup: reuse first instance of name@version:path to prevent
    // "Cannot use X from another module or realm" errors
    const nmIdx = resolved.lastIndexOf("/node_modules/");
    if (nmIdx !== -1) {
      const afterNm = resolved.slice(nmIdx + "/node_modules/".length);
      const parts = afterNm.split("/");
      const pkgName = parts[0].startsWith("@") ? parts[0] + "/" + parts[1] : parts[0];
      const pkgDir = resolved.slice(0, nmIdx) + "/node_modules/" + pkgName;
      try {
        const pkgJson = JSON.parse(vol.readFileSync(pkgDir + "/package.json", "utf8"));
        // Include file path so different subpath exports (svelte vs svelte/compiler) aren't deduped
        const identity = pkgName + "@" + (pkgJson.version || "0.0.0") + ":" + afterNm;
        if (!_pkgIdentityMap[identity]) {
          _pkgIdentityMap[identity] = resolved;
        } else if (_pkgIdentityMap[identity] !== resolved) {
          // Only reuse fully-loaded modules — returning mid-execution ones causes "X is not a function"
          const canonical = _pkgIdentityMap[identity];
          if (cache[canonical] && cache[canonical].loaded) {
            cache[resolved] = cache[canonical];
            return cache[canonical];
          }
        }
      } catch { /* no package.json */ }
    }

    const _loadDepth = ((globalThis as any).__loadModuleDepth ?? 0) + 1;
    (globalThis as any).__loadModuleDepth = _loadDepth;

    const record: ModuleRecord = {
      id: resolved,
      filename: resolved,
      exports: {},
      loaded: false,
      children: [],
      paths: [],
      parent: parentRecord ?? null,
    };
    if (parentRecord) parentRecord.children.push(record);

    cache[resolved] = record;

    const keys = Object.keys(cache);
    if (keys.length > LIMITS.MODULE_CACHE_MAX) delete cache[keys[0]];

    if (resolved.endsWith(".json")) {
      const raw = vol.readFileSync(resolved, "utf8");
      record.exports = JSON.parse(raw);
      record.loaded = true;
      return record;
    }

    // Native addons can't run in browser — return empty module for fallback
    if (resolved.endsWith(".node")) {
      record.exports = {};
      record.loaded = true;
      return record;
    }

    const rawSource = vol.readFileSync(resolved, "utf8");
    const dir = pathPolyfill.dirname(resolved);

    const codeCacheKey = `${resolved}|${quickDigest(rawSource)}`;
    let processedCode = codeCache?.get(codeCacheKey);

    if (!processedCode) {
      processedCode = rawSource;
      if (processedCode.startsWith("#!")) {
        processedCode = processedCode.slice(processedCode.indexOf("\n") + 1);
      }
      if (isTypeScriptFile(resolved)) {
        processedCode = stripTypeScript(processedCode);
      }
      if (resolved.endsWith(".cjs")) {
        // CJS: only rewrite import()/import.meta via AST, skip full ESM conversion
        try {
          const cjsAst = acorn.parse(processedCode, {
            ecmaVersion: "latest",
            sourceType: "script",
            allowImportExportEverywhere: true,
          });
          const cjsPatches: Array<[number, number, string]> = [];
          const walkCjs = (node: any) => {
            if (!node || typeof node !== "object") return;
            if (Array.isArray(node)) { for (const c of node) walkCjs(c); return; }
            if (typeof node.type !== "string") return;
            if (node.type === "ImportExpression") {
              cjsPatches.push([node.start, node.start + 6, "__asyncLoad"]);
            }
            if (node.type === "MetaProperty" && node.meta?.name === "import" && node.property?.name === "meta") {
              cjsPatches.push([
                node.start,
                node.end,
                `({ url: "file://${resolved}", dirname: "${pathPolyfill.dirname(resolved)}", filename: "${resolved}" })`,
              ]);
            }
            for (const key of Object.keys(node)) {
              if (key === "type" || key === "start" || key === "end") continue;
              const val = node[key];
              if (val && typeof val === "object") walkCjs(val);
            }
          };
          walkCjs(cjsAst);
          if (cjsPatches.length > 0) {
            cjsPatches.sort((a, b) => b[0] - a[0]);
            for (const [start, end, replacement] of cjsPatches) {
              processedCode = processedCode.slice(0, start) + replacement + processedCode.slice(end);
            }
          }
        } catch { /* can't parse — leave untransformed */ }
      } else {
        processedCode = convertModuleSyntax(processedCode, resolved);
      }
      codeCache?.set(codeCacheKey, processedCode);
    }

    // "full" de-async strips async from all functions so cross-module calls work with __syncAwait
    // "topLevelOnly" preserves genuine async behavior for non-TLA modules
    const moduleHasTLA = resolved.endsWith(".cjs") ? false : hasTopLevelAwait(processedCode);
    const useFullDeAsync = deAsyncImports || moduleHasTLA;

    const childResolver = buildResolver(
      vol,
      fsBridge,
      proc,
      dir,
      cache,
      opts,
      codeCache,
      useFullDeAsync,
    );
    childResolver.cache = cache;
    childResolver._ownerRecord = record;

    const wrappedConsole = wrapConsole(opts.onConsole);

    try {
      const metaUrl = "file://" + resolved;
      // CJS files: skip — would corrupt await inside async functions
      if (!resolved.endsWith(".cjs")) {
        processedCode = stripTopLevelAwait(
          processedCode,
          useFullDeAsync ? "full" : "topLevelOnly",
        );
      }
      const wrapper = buildModuleWrapper(processedCode);

      let fn;
      try {
        fn = (0, eval)(wrapper);
      } catch (syntaxErr) {
        const msg =
          syntaxErr instanceof Error ? syntaxErr.message : String(syntaxErr);
        throw new SyntaxError(`${msg} (in ${resolved})`);
      }

      {
        const srcMap = (globalThis as any).__dbgSrcMap || ((globalThis as any).__dbgSrcMap = new Map());
        srcMap.set(resolved, wrapper);
      }

      const asyncLoader = makeDynamicLoader(childResolver);
      fn(
        record.exports,
        childResolver,
        record,
        resolved,
        dir,
        proc,
        wrappedConsole,
        { url: metaUrl, dirname: dir, filename: resolved },
        asyncLoader,
        syncAwait,
        SyncPromiseClass,
      );

      record.loaded = true;
      (globalThis as any).__loadModuleDepth = _loadDepth - 1;
    } catch (err) {
      (globalThis as any).__loadModuleDepth = _loadDepth - 1;
      delete cache[resolved];
      // >8MB WASM: retry with async compilation APIs
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes("disallowed on the main thread") ||
        errMsg.includes("buffer size is larger than") ||
        errMsg.includes("__WASM_COMPILE_PENDING__")
      ) {
        let asyncCode = processedCode!;
        asyncCode = asyncCode.replace(
          /new\s+WebAssembly\.Module\b/g,
          "await __wasmCompile",
        );
        asyncCode = asyncCode.replace(
          /new\s+WebAssembly\.Instance\b/g,
          "await __wasmInstantiate",
        );

        const asyncWrapper = buildModuleWrapper(asyncCode, {
          async: true,
          useNativePromise: true,
          includeViteVars: false,
          hideBrowserGlobals: false,
          wasmHelpers: true,
        });
        try {
          const asyncFn = (0, eval)(asyncWrapper);
          const asyncLoader = makeDynamicLoader(childResolver);
          const wasmReady = asyncFn(
            record.exports,
            childResolver,
            record,
            resolved,
            dir,
            proc,
            wrappedConsole,
            { url: "file://" + resolved, dirname: dir, filename: resolved },
            asyncLoader,
            syncAwait,
            SyncPromiseClass,
          );
          record.loaded = true;
          (record as any).__wasmReady = wasmReady;
          cache[resolved] = record;
        } catch (retryErr) {
          if (err instanceof Error && !err.message.includes("(in /")) {
            err.message = `${err.message} (in ${resolved})`;
          }
          throw err;
        }
        return record;
      }

      if (err instanceof Error && !err.message.includes("(in /")) {
        err.message = `${err.message} (in ${resolved})`;
      }
      throw err;
    }

    return record;
  };

  const resolver: ResolverFn = (id: string): unknown => {
    if (typeof id !== "string") {
      // Match real Node.js error: TypeError with ERR_INVALID_ARG_TYPE code
      const err: any = new TypeError(
        `The "id" argument must be of type string. Received ${id === null ? "null" : typeof id}`
      );
      err.code = "ERR_INVALID_ARG_TYPE";
      throw err;
    }
    if (id.startsWith("node:")) id = id.slice(5);

    if (id === "fs") return fsBridge;
    if (id === "fs/promises") return fsBridge.promises;
    if (id === "process") return proc;
    if (id === "console") return wrapConsole(opts.onConsole);
    if (id === "worker_threads") {
      if (opts.workerThreadsOverride) {
        const base = CORE_MODULES["worker_threads"];
        const override = Object.assign(Object.create(null), base, opts.workerThreadsOverride);
        override.default = override;
        return override;
      }
      return CORE_MODULES["worker_threads"];
    }
    if (id === "module") {
      // Per-engine Module so fork() doesn't clobber parent's _resolveFilename
      const OrigModule = moduleSysPolyfill.Module;

      function PerEngineModule(this: any, mid?: string, parent?: any) {
        OrigModule.call(this, mid, parent);
      }
      PerEngineModule.prototype = OrigModule.prototype;

      const liveCreateRequire = (from: string) => {
        let fromPath = from;
        if (from.startsWith("file://")) {
          fromPath = decodeURIComponent(from.slice(7));
          if (fromPath.startsWith("/") && fromPath[2] === ":")
            fromPath = fromPath.slice(1);
        }
        const childDir = pathPolyfill.dirname(fromPath);
        const child = buildResolver(vol, fsBridge, proc, childDir, cache, opts, codeCache, deAsyncImports);
        child.cache = cache;
        return child;
      };

      PerEngineModule.createRequire = liveCreateRequire;
      PerEngineModule._cache = cache;
      PerEngineModule._resolveFilename = (
        request: string,
        parent?: any,
        isMain?: boolean,
        options?: any,
      ) => {
        if (typeof request !== "string") {
          const err: any = new Error(
            `Cannot find module '${request}'`,
          );
          err.code = "MODULE_NOT_FOUND";
          throw err;
        }
        if (options?.paths && Array.isArray(options.paths)) {
          for (const p of options.paths) {
            try {
              return resolveId(request, p);
            } catch {
              /* try next */
            }
          }
        }
        if (parent?.paths && Array.isArray(parent.paths)) {
          for (const p of parent.paths) {
            try {
              const dir = p.endsWith("/node_modules")
                ? pathPolyfill.dirname(p)
                : p;
              return resolveId(request, dir);
            } catch {
              /* try next */
            }
          }
        }
        const fromDir = parent?.filename
          ? pathPolyfill.dirname(parent.filename)
          : baseDir;
        try {
          return resolveId(request, fromDir);
        } catch {
          const err: any = new Error(
            `Cannot find module '${request}'`,
          );
          err.code = "MODULE_NOT_FOUND";
          throw err;
        }
      };
      PerEngineModule._load = (request: string, parent?: any, isMain?: boolean) => {
        try {
          return resolver(request);
        } catch {
          return moduleSysPolyfill._load(request, parent, isMain);
        }
      };

      PerEngineModule.builtinModules = moduleSysPolyfill.builtinModules;
      PerEngineModule.isBuiltin = moduleSysPolyfill.isBuiltin;
      PerEngineModule._extensions = moduleSysPolyfill._extensions;
      PerEngineModule._pathCache = moduleSysPolyfill._pathCache;
      PerEngineModule._nodeModulePaths = moduleSysPolyfill._nodeModulePaths;
      PerEngineModule._findPath = moduleSysPolyfill._findPath;
      PerEngineModule.syncBuiltinESMExports =
        moduleSysPolyfill.syncBuiltinESMExports;
      PerEngineModule.wrap = moduleSysPolyfill.wrap;
      PerEngineModule.wrapper = moduleSysPolyfill.wrapper;
      PerEngineModule.Module = PerEngineModule;
      PerEngineModule.runMain = OrigModule.runMain;
      PerEngineModule._preloadModules = OrigModule._preloadModules;
      PerEngineModule._initPaths = OrigModule._initPaths;
      PerEngineModule.globalPaths = OrigModule.globalPaths;
      (PerEngineModule as any).default = PerEngineModule;
      return PerEngineModule;
    }
    if (CORE_MODULES[id]) return CORE_MODULES[id];

    const resolved = resolveId(id, baseDir);
    if (CORE_MODULES[resolved]) return CORE_MODULES[resolved];

    const rec = loadModule(resolved, resolver._ownerRecord);
    // Proxy for async WASM — reads from rec.exports at access time so
    // reassigned module.exports is picked up after compilation finishes
    if ((rec as any).__wasmReady) {
      return new Proxy(Object.create(null), {
        get(_t, prop) {
          const ex = rec.exports as any;
          if (ex && prop in ex) return ex[prop];
          return undefined;
        },
        set(_t, prop, val) {
          (rec.exports as any)[prop] = val;
          return true;
        },
        has(_t, prop) {
          return rec.exports ? prop in (rec.exports as any) : false;
        },
        ownKeys() {
          return rec.exports ? Reflect.ownKeys(rec.exports as any) : [];
        },
        getOwnPropertyDescriptor(_t, prop) {
          if (!rec.exports) return undefined;
          return Object.getOwnPropertyDescriptor(rec.exports as any, prop);
        },
      });
    }
    return rec.exports;
  };

  resolver.resolve = (id: string, options?: { paths?: string[] }): string => {
    if (id === "fs" || id === "process" || CORE_MODULES[id]) return id;
    if (options?.paths && Array.isArray(options.paths)) {
      for (const p of options.paths) {
        try {
          return resolveId(id, p);
        } catch {
          /* try next */
        }
      }
    }
    return resolveId(id, baseDir);
  };

  resolver.cache = cache;
  resolver.extensions = {
    ".js": () => {},
    ".json": () => {},
    ".node": () => {},
    ".ts": () => {},
    ".tsx": () => {},
    ".mjs": () => {},
    ".cjs": () => {},
  };
  resolver.main = null;
  return resolver;
}

// ── ScriptEngine class ──
export class ScriptEngine {
  private vol: MemoryVolume;
  private fsBridge: FsBridge;
  private proc: ProcessObject;
  private moduleRegistry: Record<string, ModuleRecord> = {};
  private opts: EngineOptions;
  private transformCache: Map<string, string> = new Map();

  constructor(vol: MemoryVolume, opts: EngineOptions = {}) {
    this.vol = vol;
    this.proc = buildProcessEnv({
      cwd: opts.cwd || "/",
      env: opts.env,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    });
    this.fsBridge = buildFileSystemBridge(vol, () => this.proc.cwd());
    this.opts = opts;

    // Don't call initShellExec here — Nodepod.boot() sets up the shell with correct cwd
    import("./polyfills/child_process")
      .then((mod) => {
        _shellExecPolyfill = mod;
        _initShellExec = mod.initShellExec;
      })
      .catch(() => {
        /* shell unavailable in this environment */
      });
    watcherPolyfill.setVolume(vol);
    scannerPolyfill.setVolume(vol);
    esbuildPolyfill.setVolume(vol);

    (globalThis as any).__nodepodVolume = vol;

    if (typeof globalThis.setImmediate === "undefined") {
      (globalThis as any).setImmediate = (
        fn: (...a: unknown[]) => void,
        ...a: unknown[]
      ) => setTimeout(fn, 0, ...a);
      (globalThis as any).clearImmediate = (id: number) => clearTimeout(id);
    }

    // Browsers disallow sync WebAssembly.Module() for >8MB buffers — serve from cache
    if (
      typeof WebAssembly !== "undefined" &&
      !(WebAssembly.Module as any).__nodepodPatched
    ) {
      const OrigModule = WebAssembly.Module;
      const PatchedModule = function WebAssemblyModule(
        this: any,
        bytes: BufferSource,
      ) {
        const cached = getCachedModule(bytes);
        if (cached) return cached;
        try {
          return new OrigModule(bytes);
        } catch (e: any) {
          if (
            e &&
            (e.message?.includes("disallowed on the main thread") ||
              e.message?.includes("buffer size is larger than"))
          ) {
            const cached2 = getCachedModule(bytes);
            if (cached2) return cached2;
            const compilePromise = compileWasmInWorker(
              bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes as Uint8Array,
            );
            (globalThis as any).__wasmCompilePromise = compilePromise;
          }
          throw e;
        }
      } as any;
      PatchedModule.prototype = OrigModule.prototype;
      PatchedModule.__nodepodPatched = true;
      PatchedModule.imports = OrigModule.imports?.bind(OrigModule);
      PatchedModule.exports = OrigModule.exports?.bind(OrigModule);
      PatchedModule.customSections =
        OrigModule.customSections?.bind(OrigModule);
      (globalThis as any).WebAssembly.Module = PatchedModule;
    }

    // Timers need .ref()/.unref() to match Node.js API
    if (!(globalThis.setTimeout as any).__nodepodPatched) {
      const origST = globalThis.setTimeout.bind(globalThis);
      const origSI = globalThis.setInterval.bind(globalThis);
      const origCT = globalThis.clearTimeout.bind(globalThis);
      const origCI = globalThis.clearInterval.bind(globalThis);

      const wrapTimeout = (id: ReturnType<typeof origST>) => {
        const obj = {
          _id: id,
          _ref: true,
          ref() { obj._ref = true; return obj; },
          unref() { obj._ref = false; return obj; },
          hasRef() { return obj._ref; },
          refresh() { return obj; },
          [Symbol.toPrimitive]() { return id; },
        };
        return obj;
      };

      const wrapInterval = (id: ReturnType<typeof origSI>) => {
        const obj = {
          _id: id,
          _ref: true,
          ref() { obj._ref = true; return obj; },
          unref() { obj._ref = false; return obj; },
          hasRef() { return obj._ref; },
          refresh() { return obj; },
          [Symbol.toPrimitive]() { return id; },
        };
        return obj;
      };

      (globalThis as any).setTimeout = Object.assign(
        (...a: Parameters<typeof origST>) => wrapTimeout(origST(...a)),
        { __nodepodPatched: true },
      );
      (globalThis as any).setInterval = Object.assign(
        (...a: Parameters<typeof origSI>) => wrapInterval(origSI(...a)),
        { __nodepodPatched: true },
      );
      (globalThis as any).clearTimeout = (t: any) => origCT(t?._id ?? t);
      (globalThis as any).clearInterval = (t: any) => origCI(t?._id ?? t);
    }

    this.patchStackTraceApi();
    this.patchTextDecoder();
  }

  private patchTextDecoder(): void {
    const Original = globalThis.TextDecoder;

    class ExtendedDecoder {
      private enc: string;
      private inner: TextDecoder | null = null;

      constructor(encoding: string = "utf-8", options?: TextDecoderOptions) {
        this.enc = encoding.toLowerCase();
        const textEncodings = [
          "utf-8",
          "utf8",
          "utf-16le",
          "utf-16be",
          "utf-16",
          "ascii",
          "iso-8859-1",
          "latin1",
          "windows-1252",
        ];
        if (textEncodings.includes(this.enc)) {
          try {
            this.inner = new Original(encoding, options);
          } catch {
            this.inner = new Original("utf-8", options);
          }
        }
      }

      decode(input?: BufferSource, options?: TextDecodeOptions): string {
        if (this.inner) return this.inner.decode(input, options);
        if (!input) return "";
        const bytes =
          input instanceof ArrayBuffer
            ? new Uint8Array(input)
            : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

        if (this.enc === "base64") return bytesToBase64(bytes);
        if (this.enc === "base64url")
          return bytesToBase64(bytes)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        if (this.enc === "hex") return bytesToHex(bytes);
        return new Original("utf-8").decode(input, options);
      }

      get fatal(): boolean {
        return this.inner?.fatal ?? false;
      }
      get ignoreBOM(): boolean {
        return this.inner?.ignoreBOM ?? false;
      }
    }

    globalThis.TextDecoder = ExtendedDecoder as unknown as typeof TextDecoder;
  }

  // Override even in Chrome — eval produces stack frames the native V8 API can't map to VFS paths
  private patchStackTraceApi(): void {
    if ((Error as any).stackTraceLimit === undefined)
      (Error as any).stackTraceLimit = 10;

    function parseFrames(stack: string) {
      if (!stack) return [];
      const frames: Array<{
        fn: string;
        file: string;
        line: number;
        col: number;
      }> = [];
      for (const raw of stack.split("\n")) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (/^\w*Error\b/.test(trimmed) && !trimmed.startsWith("at ")) continue;

        const safari = trimmed.match(/^(.*)@(.*?):(\d+):(\d+)$/);
        if (safari) {
          frames.push({
            fn: safari[1] || "",
            file: safari[2],
            line: +safari[3],
            col: +safari[4],
          });
          continue;
        }

        const chrome = trimmed.match(
          /^at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?$/,
        );
        if (chrome) {
          frames.push({
            fn: chrome[1] || "",
            file: chrome[2],
            line: +chrome[3],
            col: +chrome[4],
          });
          continue;
        }

        const chromePlain = trimmed.match(/^at\s+(?:(.+?)\s+\()?(.*?)\)?$/);
        if (chromePlain) {
          frames.push({
            fn: chromePlain[1] || "",
            file: chromePlain[2] || "<anonymous>",
            line: 0,
            col: 0,
          });
        }
      }
      return frames;
    }

    function makeCallSite(f: {
      fn: string;
      file: string;
      line: number;
      col: number;
    }) {
      return {
        getFileName: () => f.file || null,
        getLineNumber: () => f.line || null,
        getColumnNumber: () => f.col || null,
        getFunctionName: () => f.fn || null,
        getMethodName: () => f.fn || null,
        getTypeName: () => null,
        getThis: () => undefined,
        getFunction: () => undefined,
        getEvalOrigin: () => undefined,
        isNative: () => false,
        isConstructor: () => false,
        isToplevel: () => !f.fn,
        isEval: () => false,
        toString: () =>
          f.fn
            ? `${f.fn} (${f.file}:${f.line}:${f.col})`
            : `${f.file}:${f.line}:${f.col}`,
      };
    }

    function buildSites(stack: string, ctorOpt?: Function) {
      const frames = parseFrames(stack);
      let start = 0;
      if (ctorOpt?.name) {
        for (let i = 0; i < frames.length; i++) {
          if (frames[i].fn === ctorOpt.name) {
            start = i + 1;
            break;
          }
        }
      }
      return frames.slice(start).map(makeCallSite);
    }

    const sym = Symbol("rawStack");
    const symProcessed = Symbol("stackProcessed");

    const nativeCapture = (Error as any).captureStackTrace;

    Object.defineProperty(Error.prototype, "stack", {
      get() {
        if ((this as any)[symProcessed]) return (this as any)[sym];
        const raw = (this as any)[sym];
        if (
          typeof raw === "string" &&
          typeof (Error as any).prepareStackTrace === "function"
        ) {
          try {
            const sites = buildSites(raw);
            if (sites.length > 0) {
              return (Error as any).prepareStackTrace(this, sites);
            }
          } catch {
            return raw;
          }
        }
        return raw;
      },
      set(val: any) {
        (this as any)[sym] = val;
      },
      configurable: true,
      enumerable: false,
    });

    (Error as any).captureStackTrace = function (
      target: any,
      ctorOpt?: Function,
    ) {
      const saved = (Error as any).prepareStackTrace;
      (Error as any).prepareStackTrace = undefined;

      let raw: string;
      if (nativeCapture) {
        const tmp = {} as any;
        nativeCapture(tmp);
        raw = tmp.stack || "";
      } else {
        raw = new Error().stack || "";
      }
      (Error as any).prepareStackTrace = saved;

      if (typeof saved === "function") {
        try {
          const result = saved(target, buildSites(raw, ctorOpt));
          (target as any)[symProcessed] = true;
          target.stack = result;
        } catch {
          target.stack = raw;
        }
      } else {
        target.stack = raw;
      }
    };
  }

  execute(
    code: string,
    filename: string = "/index.js",
  ): { exports: unknown; module: ModuleRecord } {
    const dir = pathPolyfill.dirname(filename);
    // Only write when the content differs to avoid triggering file watchers
    // (e.g. nodemon/chokidar) with a no-op write that causes restart loops.
    try {
      const existing = this.vol.readFileSync(filename, "utf8");
      if (existing !== code) this.vol.writeFileSync(filename, code);
    } catch {
      this.vol.writeFileSync(filename, code);
    }

    const mod: ModuleRecord = {
      id: filename,
      filename,
      exports: {},
      loaded: false,
      children: [],
      paths: [],
      parent: null,
    };
    this.moduleRegistry[filename] = mod;

    const consoleProxy = wrapConsole(this.opts.onConsole);

    let processed = code;
    if (processed.startsWith("#!"))
      processed = processed.slice(processed.indexOf("\n") + 1);
    if (isTypeScriptFile(filename)) {
      processed = stripTypeScript(processed);
    }
    if (filename.endsWith(".cjs")) {
      try {
        const cjsAst = acorn.parse(processed, {
          ecmaVersion: "latest",
          sourceType: "script",
          allowImportExportEverywhere: true,
        });
        const cjsPatches: Array<[number, number, string]> = [];
        const walkCjs = (node: any) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) { for (const c of node) walkCjs(c); return; }
          if (typeof node.type !== "string") return;
          if (node.type === "ImportExpression") {
            cjsPatches.push([node.start, node.start + 6, "__asyncLoad"]);
          }
          if (node.type === "MetaProperty" && node.meta?.name === "import" && node.property?.name === "meta") {
            cjsPatches.push([
              node.start,
              node.end,
              `({ url: "file://${filename}", dirname: "${pathPolyfill.dirname(filename)}", filename: "${filename}" })`,
            ]);
          }
          for (const key of Object.keys(node)) {
            if (key === "type" || key === "start" || key === "end") continue;
            const val = node[key];
            if (val && typeof val === "object") walkCjs(val);
          }
        };
        walkCjs(cjsAst);
        if (cjsPatches.length > 0) {
          cjsPatches.sort((a, b) => b[0] - a[0]);
          for (const [start, end, replacement] of cjsPatches) {
            processed = processed.slice(0, start) + replacement + processed.slice(end);
          }
        }
      } catch { /* can't parse */ }
    } else {
      processed = convertModuleSyntax(processed, filename);
    }

    const fileHasTLA = filename.endsWith(".cjs") ? false : hasTopLevelAwait(processed);
    const resolver = buildResolver(
      this.vol,
      this.fsBridge,
      this.proc,
      dir,
      this.moduleRegistry,
      this.opts,
      this.transformCache,
      fileHasTLA,
    );
    resolver._ownerRecord = mod;

    try {
      const metaUrl = "file://" + filename;
      if (!filename.endsWith(".cjs")) {
        processed = stripTopLevelAwait(
          processed,
          fileHasTLA ? "full" : "topLevelOnly",
        );
      }
      const wrapper = buildModuleWrapper(processed);

      const asyncLoader = makeDynamicLoader(resolver);
      let fn;
      try {
        fn = (0, eval)(wrapper);
      } catch (syntaxErr) {
        throw syntaxErr;
      }

      fn(
        mod.exports,
        resolver,
        mod,
        filename,
        dir,
        this.proc,
        consoleProxy,
        { url: metaUrl, dirname: dir, filename },
        asyncLoader,
        syncAwait,
        SyncPromiseClass,
      );

      mod.loaded = true;
    } catch (err) {
      delete this.moduleRegistry[filename];
      throw err;
    }

    return { exports: mod.exports, module: mod };
  }

  executeSync = this.execute;

  async executeAsync(
    code: string,
    filename: string = "/index.js",
  ): Promise<ExecutionOutcome> {
    return Promise.resolve(this.execute(code, filename));
  }

  runFile(filename: string): { exports: unknown; module: ModuleRecord } {
    const source = this.vol.readFileSync(filename, "utf8");
    return this.execute(source, filename);
  }

  runFileSync = this.runFile;

  // Wraps in async IIFE when TLA is detected, falls back to sync otherwise
  async runFileTLA(
    filename: string,
  ): Promise<{ exports: unknown; module: ModuleRecord }> {
    const source = this.vol.readFileSync(filename, "utf8");
    const dir = pathPolyfill.dirname(filename);
    // No need to write — source was just read from the same volume.
    // Writing it back triggers file watchers (nodemon restart loops).

    const mod: ModuleRecord = {
      id: filename,
      filename,
      exports: {},
      loaded: false,
      children: [],
      paths: [],
      parent: null,
    };
    this.moduleRegistry[filename] = mod;

    const consoleProxy = wrapConsole(this.opts.onConsole);

    let processed = source as string;
    if (processed.startsWith("#!"))
      processed = processed.slice(processed.indexOf("\n") + 1);
    if (isTypeScriptFile(filename)) {
      processed = stripTypeScript(processed);
    }
    if (filename.endsWith(".cjs")) {
      processed = rewriteDynamicImportsRegex(processed);
      processed = processed.replace(
        /\bimport\.meta\.url\b/g,
        `"file://${filename}"`,
      );
      processed = processed.replace(
        /\bimport\.meta\b/g,
        `({ url: "file://${filename}" })`,
      );
    } else {
      processed = convertModuleSyntax(processed, filename);
    }
    const tla = hasTopLevelAwait(processed);

    // Don't propagate deAsyncImports from entry — it uses native await (async IIFE),
    // so deps don't need de-async. loadModule handles individual TLA modules.
    const resolver = buildResolver(
      this.vol,
      this.fsBridge,
      this.proc,
      dir,
      this.moduleRegistry,
      this.opts,
      this.transformCache,
      false,
    );
    resolver._ownerRecord = mod;

    if (!tla) {
      try {
        processed = stripTopLevelAwait(processed);
        const wrapper = buildModuleWrapper(processed);
        const asyncLoader = makeDynamicLoader(resolver);
        const fn = (0, eval)(wrapper);

        fn(
          mod.exports,
          resolver,
          mod,
          filename,
          dir,
          this.proc,
          consoleProxy,
          { url: "file://" + filename, dirname: dir, filename },
          asyncLoader,
          syncAwait,
          SyncPromiseClass,
        );
        mod.loaded = true;
      } catch (err) {
        delete this.moduleRegistry[filename];
        throw err;
      }
      return { exports: mod.exports, module: mod };
    }

    try {
      const metaUrl = "file://" + filename;
      const wrapper = buildModuleWrapper(processed, { async: true });
      const asyncLoader = makeDynamicLoader(resolver);
      const fn = (0, eval)(wrapper);
      await fn(
        mod.exports,
        resolver,
        mod,
        filename,
        dir,
        this.proc,
        consoleProxy,
        { url: metaUrl, dirname: dir, filename },
        asyncLoader,
        syncAwait,
        SyncPromiseClass,
      );
      mod.loaded = true;
    } catch (err) {
      delete this.moduleRegistry[filename];
      throw err;
    }
    return { exports: mod.exports, module: mod };
  }

  async runFileAsync(filename: string): Promise<ExecutionOutcome> {
    return Promise.resolve(this.runFile(filename));
  }

  clearCache(): void {
    for (const k of Object.keys(this.moduleRegistry))
      delete this.moduleRegistry[k];
    // Also clear shared resolver/manifest caches
    (this.moduleRegistry as any).__resolveCache?.clear();
    (this.moduleRegistry as any).__manifestCache?.clear();
    delete (this.moduleRegistry as any).__pkgIdentityMap;
  }

  getVolume(): MemoryVolume {
    return this.vol;
  }
  getProcess(): ProcessObject {
    return this.proc;
  }

  createREPL(): { eval: (code: string) => unknown } {
    const resolver = buildResolver(
      this.vol,
      this.fsBridge,
      this.proc,
      "/",
      this.moduleRegistry,
      this.opts,
      this.transformCache,
    );
    const consoleProxy = wrapConsole(this.opts.onConsole);
    const proc = this.proc;
    const buf = bufferPolyfill.Buffer;

    const GenFn = Object.getPrototypeOf(function* () {}).constructor;
    const gen = new GenFn(
      "require",
      "console",
      "process",
      "Buffer",
      `var __code, __result;
while (true) {
  __code = yield;
  try {
    __result = eval(__code);
    yield { value: __result, error: null };
  } catch (e) {
    yield { value: undefined, error: e };
  }
}`,
    )(resolver, consoleProxy, proc, buf);
    gen.next();

    return {
      eval(code: string): unknown {
        const normalized = code.replace(/^\s*(const|let)\s+/gm, "var ");
        const exprResult = gen.next("(" + normalized + ")").value as {
          value: unknown;
          error: unknown;
        };
        if (!exprResult.error) {
          gen.next();
          return exprResult.value;
        }
        gen.next();
        const stmtResult = gen.next(normalized).value as {
          value: unknown;
          error: unknown;
        };
        if (stmtResult.error) {
          gen.next();
          throw stmtResult.error;
        }
        gen.next();
        return stmtResult.value;
      },
    };
  }
}

export function executeCode(
  code: string,
  vol: MemoryVolume,
  opts?: EngineOptions,
): { exports: unknown; module: ModuleRecord } {
  const engine = new ScriptEngine(vol, opts);
  return engine.execute(code);
}

export type {
  IScriptEngine,
  ExecutionOutcome,
  EngineConfig,
} from "./engine-types";
export default ScriptEngine;
