/**
 * Rewrites loopback server URLs in terminal display text without changing
 * raw process output, the process environment, or the server itself.
 *
 * Resolver contract:
 *   string    preview URL is ready
 *   null      this is a Nodepod server, but its preview bridge is pending
 *   undefined the port is not owned by this Nodepod
 */
export type TerminalServerUrlResolver = (
  port: number,
) => string | null | undefined;

const LOOPBACK_URL_RE =
  /\b(https?|wss?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::(\d{1,5}))?(?![\w.:-])/gi;

interface VisibleText {
  text: string;
  starts: number[];
  ends: number[];
}

interface Replacement {
  start: number;
  end: number;
  value: string;
}

export interface ServerUrlRewriteResult {
  text: string;
  pending: boolean;
}

function skipAnsiSequence(input: string, start: number): number {
  const first = input.charCodeAt(start);
  let i = start;

  // CSI can begin with ESC [ or the single-byte C1 CSI character.
  if (first === 0x9b || (first === 0x1b && input[start + 1] === "[")) {
    i += first === 0x9b ? 1 : 2;
    while (i < input.length) {
      const code = input.charCodeAt(i++);
      if (code >= 0x40 && code <= 0x7e) break;
    }
    return i;
  }

  if (first !== 0x1b) return start + 1;

  // OSC (including OSC-8 terminal hyperlinks): ESC ] ... BEL / ESC \
  if (input[start + 1] === "]") {
    i = start + 2;
    while (i < input.length) {
      if (input.charCodeAt(i) === 0x07) return i + 1;
      if (input.charCodeAt(i) === 0x1b && input[i + 1] === "\\") {
        return i + 2;
      }
      i++;
    }
    return input.length;
  }

  // Other two-byte terminal escape sequences.
  return Math.min(start + 2, input.length);
}

function toVisibleText(input: string): VisibleText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (let i = 0; i < input.length;) {
    const code = input.charCodeAt(i);
    if (code === 0x1b || code === 0x9b) {
      i = skipAnsiSequence(input, i);
      continue;
    }
    text += input[i];
    starts.push(i);
    ends.push(i + 1);
    i++;
  }

  return { text, starts, ends };
}

function replacementUrl(protocol: string, readyUrl: string): string {
  let value = readyUrl.replace(/\/$/, "");
  if (protocol.toLowerCase().startsWith("ws")) {
    value = value.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  }
  return value;
}

function collectMatches(
  source: string,
  mapRange: (start: number, end: number) => { start: number; end: number },
  resolve: TerminalServerUrlResolver,
  replacements: Replacement[],
): boolean {
  let pending = false;
  LOOPBACK_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOOPBACK_URL_RE.exec(source)) !== null) {
    const protocol = match[1];
    const explicitPort = match[3] ? Number(match[3]) : undefined;
    const port = explicitPort ??
      (protocol.toLowerCase().endsWith("s") ? 443 : 80);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

    const resolved = resolve(port);
    if (resolved === null) {
      pending = true;
      continue;
    }
    if (resolved === undefined) continue;

    const range = mapRange(match.index, match.index + match[0].length);
    replacements.push({
      ...range,
      value: replacementUrl(protocol, resolved),
    });
  }
  return pending;
}

export function rewriteTerminalServerUrlsInText(
  input: string,
  resolve: TerminalServerUrlResolver,
): ServerUrlRewriteResult {
  if (!input) return { text: input, pending: false };

  const replacements: Replacement[] = [];
  let pending = collectMatches(
    input,
    (start, end) => ({ start, end }),
    resolve,
    replacements,
  );

  // Match again against ANSI-free visible text. This catches output such as
  // Vite's `localhost:\x1b[1m5173\x1b[22m` while preserving surrounding color.
  const visible = toVisibleText(input);
  pending = collectMatches(
    visible.text,
    (start, end) => ({
      start: visible.starts[start],
      end: visible.ends[end - 1],
    }),
    resolve,
    replacements,
  ) || pending;

  if (pending) return { text: input, pending: true };
  if (replacements.length === 0) return { text: input, pending: false };

  // Raw and visible matching can discover the same range. Keep one, then
  // apply from right to left so earlier offsets remain valid.
  const unique = new Map<string, Replacement>();
  for (const item of replacements) {
    unique.set(`${item.start}:${item.end}`, item);
  }
  const ordered = [...unique.values()].sort((a, b) => b.start - a.start);
  let output = input;
  for (const item of ordered) {
    output = output.slice(0, item.start) + item.value + output.slice(item.end);
  }
  return { text: output, pending: false };
}

function mayEndWithPartialUrl(input: string): boolean {
  const visible = toVisibleText(input).text;
  const token = visible.match(/(?:^|\s)((?:https?|wss?):\/\/\S*)$/i)?.[1];
  if (!token) return false;

  LOOPBACK_URL_RE.lastIndex = 0;
  const match = LOOPBACK_URL_RE.exec(token);
  if (!match || match.index !== 0) return true;

  // A chunk ending in port digits may have split `5173` after `51`.
  return match[0].length === token.length && /:\d+$/.test(token);
}

/** Stateful presentation adapter for terminal output split across chunks. */
export class TerminalServerUrlOutputStream {
  private static readonly MAX_BUFFERED_OUTPUT = 64 * 1024;
  private static readonly PENDING_URL_WAIT_MS = 1_000;
  private static readonly PARTIAL_URL_WAIT_MS = 25;

  private buffer = "";
  private partialTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;

  constructor(
    private readonly resolve: TerminalServerUrlResolver,
    private readonly emit: (text: string) => void,
    private readonly enabled = true,
  ) {}

  push(chunk: string): void {
    if (this.ended || !chunk) return;
    if (!this.enabled) {
      this.emit(chunk);
      return;
    }
    this.buffer += chunk;
    if (this.buffer.length > TerminalServerUrlOutputStream.MAX_BUFFERED_OUTPUT) {
      // URL presentation must never be able to stall an application's output.
      // If a bridge is unusually slow, release the original text and continue.
      this.drain(true, true);
      return;
    }
    this.drain(false, false);
  }

  /** Retry buffered output after a preview URL becomes ready. */
  notifyResolution(): void {
    if (this.ended || !this.enabled) return;
    this.drain(false, false);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (!this.enabled) return;
    this.clearTimers();
    this.drain(true, true);
  }

  private drain(forcePartial: boolean, forcePending: boolean): void {
    if (!this.buffer) return;
    const resolver = forcePending
      ? (port: number) => this.resolve(port) ?? undefined
      : this.resolve;
    const result = rewriteTerminalServerUrlsInText(this.buffer, resolver);

    if (result.pending) {
      if (this.pendingTimer === null) {
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          this.drain(true, true);
        }, TerminalServerUrlOutputStream.PENDING_URL_WAIT_MS);
      }
      return;
    }

    if (!forcePartial && mayEndWithPartialUrl(this.buffer)) {
      if (this.partialTimer === null) {
        this.partialTimer = setTimeout(() => {
          this.partialTimer = null;
          this.drain(true, false);
        }, TerminalServerUrlOutputStream.PARTIAL_URL_WAIT_MS);
      }
      return;
    }

    const output = result.text;
    this.buffer = "";
    this.clearTimers();
    this.emit(output);
  }

  private clearTimers(): void {
    if (this.partialTimer !== null) clearTimeout(this.partialTimer);
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.partialTimer = null;
    this.pendingTimer = null;
  }
}
