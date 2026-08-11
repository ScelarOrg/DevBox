/**
 * Runtime policy for the virtual shell. The defaults deliberately bound memory
 * and runaway shell-language work without limiting interactive programs such
 * as dev servers and watchers by elapsed time.
 */
export interface ShellLimits {
  maxOutputBytes: number;
  maxPipelineBufferBytes: number;
  maxExpansionBytes: number;
  maxCommandSubstitutionDepth: number;
  maxRecursionDepth: number;
  maxLoopIterations: number;
  maxFilesystemEntries: number;
  maxJobs: number;
  maxProcesses: number;
  commandTimeoutMs: number;
}

export interface ShellOptions {
  limits?: Partial<ShellLimits>;
  jobControl?: boolean;
}

export const DEFAULT_SHELL_LIMITS: ShellLimits = {
  maxOutputBytes: 4 * 1024 * 1024,
  maxPipelineBufferBytes: 1024 * 1024,
  maxExpansionBytes: 1024 * 1024,
  maxCommandSubstitutionDepth: 32,
  maxRecursionDepth: 64,
  maxLoopIterations: 100_000,
  maxFilesystemEntries: 100_000,
  maxJobs: 64,
  maxProcesses: 128,
  // 0 means that only explicit cancellation and loop/scan limits apply.
  // This keeps dev servers and watchers compatible with existing Nodepod use.
  commandTimeoutMs: 0,
};

// Runtime JavaScript callers can bypass TypeScript and pass arbitrarily large
// numbers. Hard ceilings keep a malformed override from disabling the very
// safety mechanism it is configuring.
const MAX_SHELL_LIMITS: ShellLimits = {
  maxOutputBytes: 256 * 1024 * 1024,
  maxPipelineBufferBytes: 64 * 1024 * 1024,
  maxExpansionBytes: 64 * 1024 * 1024,
  maxCommandSubstitutionDepth: 256,
  maxRecursionDepth: 256,
  maxLoopIterations: 10_000_000,
  maxFilesystemEntries: 1_000_000,
  maxJobs: 1024,
  maxProcesses: 2048,
  commandTimeoutMs: 7 * 24 * 60 * 60 * 1000,
};

export interface ResolvedShellOptions {
  limits: ShellLimits;
  jobControl: boolean;
}

export function resolveShellOptions(
  options?: ShellOptions,
  parent?: ResolvedShellOptions,
): ResolvedShellOptions {
  const base = parent?.limits ?? DEFAULT_SHELL_LIMITS;
  const requested = options?.limits ?? {};
  const limits = { ...base };
  for (const key of Object.keys(DEFAULT_SHELL_LIMITS) as Array<keyof ShellLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    const valid = Number.isFinite(value) && (key === "commandTimeoutMs" ? value >= 0 : value > 0);
    // Invalid runtime JavaScript input must never disable a safety bound.
    limits[key] = valid
      ? key === "commandTimeoutMs"
        ? (value === 0 ? 0 : Math.min(MAX_SHELL_LIMITS[key], Math.max(1, Math.floor(value))))
        : Math.min(MAX_SHELL_LIMITS[key], Math.max(1, Math.floor(value)))
      : base[key];
  }
  return {
    limits,
    jobControl: options?.jobControl ?? parent?.jobControl ?? true,
  };
}

export class ShellLimitError extends Error {
  readonly limit: keyof ShellLimits;

  constructor(limit: keyof ShellLimits, message: string) {
    super(message);
    this.name = "ShellLimitError";
    this.limit = limit;
  }
}
