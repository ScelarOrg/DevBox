// Shared utilities for shell builtins: colors, arg parsing, path helpers, result builders.

import type { ShellResult } from "./shell-types";
import * as pathModule from "../polyfills/path";

/* ------------------------------------------------------------------ */
/*  ANSI color helpers                                                 */
/* ------------------------------------------------------------------ */

export const RESET = "\x1b[0m";
export const DIM = "\x1b[2m";
export const GREEN = "\x1b[32m";
export const MAGENTA = "\x1b[35m";
export const CYAN = "\x1b[36m";
export const BOLD_BLUE = "\x1b[1;34m";
export const BOLD_RED = "\x1b[1;31m";

/* ------------------------------------------------------------------ */
/*  ShellResult builders                                               */
/* ------------------------------------------------------------------ */

export const ok = (stdout = ""): ShellResult => ({
  stdout,
  stderr: "",
  exitCode: 0,
});

export const fail = (stderr: string, code = 1): ShellResult => ({
  stdout: "",
  stderr,
  exitCode: code,
});

export const EXIT_OK: ShellResult = { stdout: "", stderr: "", exitCode: 0 };
export const EXIT_FAIL: ShellResult = { stdout: "", stderr: "", exitCode: 1 };

/* ------------------------------------------------------------------ */
/*  Date / time constants                                              */
/* ------------------------------------------------------------------ */

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const DAYS_SHORT = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;

export const DAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
] as const;

/* ------------------------------------------------------------------ */
/*  Path resolution                                                    */
/* ------------------------------------------------------------------ */

export function resolvePath(p: string, cwd: string): string {
  if (p.startsWith("/")) return pathModule.normalize(p);
  return pathModule.normalize(`${cwd}/${p}`);
}

export { pathModule };

/* ------------------------------------------------------------------ */
/*  Argument parsing                                                   */
/* ------------------------------------------------------------------ */

export function parseArgs(
  args: string[],
  knownFlags: string[],
  knownOpts: string[] = [],
): { flags: Set<string>; opts: Record<string, string>; positional: string[] } {
  const flags = new Set<string>();
  const opts: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        opts[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        flags.add(a.slice(2));
      }
    } else if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (knownOpts.includes(ch) && j + 1 < a.length) {
          opts[ch] = a.slice(j + 1);
          break;
        } else if (knownOpts.includes(ch) && i + 1 < args.length) {
          opts[ch] = args[++i];
          break;
        } else if (knownFlags.includes(ch)) {
          flags.add(ch);
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, opts, positional };
}

/* ------------------------------------------------------------------ */
/*  String processing                                                  */
/* ------------------------------------------------------------------ */

// Expand POSIX character classes like [:upper:], [:lower:], etc. for `tr`
export function expandCharClass(s: string): string {
  return s
    .replace(/\[:upper:\]/g, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    .replace(/\[:lower:\]/g, "abcdefghijklmnopqrstuvwxyz")
    .replace(
      /\[:alpha:\]/g,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    )
    .replace(/\[:digit:\]/g, "0123456789")
    .replace(
      /\[:alnum:\]/g,
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    )
    .replace(/\[:space:\]/g, " \t\n\r\x0b\x0c")
    .replace(/\[:blank:\]/g, " \t")
    .replace(/\[:punct:\]/g, "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
    .replace(
      /\[:print:\]/g,
      (() => {
        let r = "";
        for (let i = 32; i < 127; i++) r += String.fromCharCode(i);
        return r;
      })(),
    )
    .replace(
      /\[:graph:\]/g,
      (() => {
        let r = "";
        for (let i = 33; i < 127; i++) r += String.fromCharCode(i);
        return r;
      })(),
    )
    .replace(
      /\[:cntrl:\]/g,
      (() => {
        let r = "";
        for (let i = 0; i < 32; i++) r += String.fromCharCode(i);
        r += String.fromCharCode(127);
        return r;
      })(),
    );
}

export function processEscapes(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const c = s[i + 1];
      if (c === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (c === "t") {
        out += "\t";
        i++;
        continue;
      }
      if (c === "r") {
        out += "\r";
        i++;
        continue;
      }
      if (c === "a") {
        out += "\x07";
        i++;
        continue;
      }
      if (c === "b") {
        out += "\b";
        i++;
        continue;
      }
      if (c === "f") {
        out += "\f";
        i++;
        continue;
      }
      if (c === "v") {
        out += "\x0b";
        i++;
        continue;
      }
      if (c === "\\") {
        out += "\\";
        i++;
        continue;
      }
      if (c === "0") {
        let oct = "";
        let j = i + 2;
        while (j < s.length && j < i + 5 && s[j] >= "0" && s[j] <= "7")
          oct += s[j++];
        out += String.fromCharCode(parseInt(oct || "0", 8));
        i = j - 1;
        continue;
      }
      if (c === "x") {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{1,2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 1 + hex.length;
          continue;
        }
      }
      out += s[i];
    } else {
      out += s[i];
    }
  }
  return out;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let size = bytes;
  for (const u of units) {
    size /= 1024;
    if (size < 1024 || u === "T") return size.toFixed(size < 10 ? 1 : 0) + u;
  }
  return String(bytes);
}

export function globToRegex(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
}
