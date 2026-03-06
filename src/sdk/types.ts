import type { VolumeSnapshot } from "../engine-types";
import type { MemoryHandlerOptions } from "../memory-handler";

/* ---- Boot options ---- */

export interface NodepodOptions {
  files?: Record<string, string | Uint8Array>;
  env?: Record<string, string>;
  workdir?: string;
  swUrl?: string;
  onServerReady?: (port: number, url: string) => void;
  /** Show a small "nodepod" watermark link in preview iframes. Defaults to true. */
  watermark?: boolean;
  /** Memory optimization settings. Omit to use defaults. */
  memory?: MemoryHandlerOptions;
  /** Cache installed node_modules in IndexedDB for faster re-boots. Default: true. */
  enableSnapshotCache?: boolean;
}

/* ---- Terminal ---- */

export interface TerminalTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface TerminalOptions {
  // xterm.js classes are peer deps, passed in as constructors
  Terminal: any;
  FitAddon?: any;
  WebglAddon?: any;
  theme?: TerminalTheme;
  fontSize?: number;
  fontFamily?: string;
  prompt?: (cwd: string) => string;
}

/* ---- Filesystem ---- */

export interface StatResult {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

/* ---- Snapshot ---- */

export type Snapshot = VolumeSnapshot;

export interface SnapshotOptions {
  /** Exclude node_modules and other auto-installable dirs. Default: true */
  shallow?: boolean;
  /** Auto-install deps from package.json after restoring a shallow snapshot. Default: true */
  autoInstall?: boolean;
}

/* ---- Spawn ---- */

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
}
