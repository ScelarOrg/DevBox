export type ProfilerLevel = "counters" | "timings" | "detailed";

export type ProfilePathDetail = "none" | "basename" | "hash" | "full";

export type ProfileCategory =
  | "boot"
  | "packages"
  | "filesystem"
  | "modules"
  | "workers"
  | "processes"
  | "snapshots"
  | "http"
  | "browser";

export interface ProfilerOptions {
  enabled?: boolean;
  level?: ProfilerLevel;
  maxSpans?: number;
  maxSamples?: number;
  slowSpanThresholdMs?: number;
  memorySampleIntervalMs?: number;
  captureMemory?: boolean;
  captureLongTasks?: boolean;
  pathDetail?: ProfilePathDetail;
  includeUrls?: boolean;
}

export interface ProfileSpanOptions {
  category?: ProfileCategory;
  parentId?: number;
  thread?: string;
  processId?: number;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface ProfileSpan {
  id: number;
  parentId?: number;
  name: string;
  category: ProfileCategory;
  startTime: number;
  durationMs: number;
  thread: string;
  processId?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface ProfileAggregate {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface ProfileSummary {
  wallDurationMs: number;
  instrumentedBusyDurationMs: number;
  categories: Record<ProfileCategory, ProfileAggregate>;
  operations: Record<string, ProfileAggregate>;
  topSpans: ProfileSpan[];
  droppedSpans: number;
  droppedSamples: number;
  longTasks: {
    count: number;
    totalMs: number;
    longestMs: number;
  };
  peakMemory?: ProfileMemorySample;
}

export interface ProfileEnvironment {
  host: "browser" | "node" | "unknown";
  userAgent?: string;
  hardwareConcurrency?: number;
  crossOriginIsolated?: boolean;
  sharedArrayBuffer?: boolean;
  level: ProfilerLevel;
}

export interface ProfileMemorySample {
  type: "memory";
  timestamp: number;
  deterministic: Record<string, unknown>;
  browserHeap?: {
    bytes?: number;
    usedBytes?: number;
    totalBytes?: number;
    limitBytes?: number;
    source: "measureUserAgentSpecificMemory" | "performance.memory";
    confidence: "estimated";
  };
}

export interface ProfileLongTaskSample {
  type: "long-task";
  timestamp: number;
  durationMs: number;
  name?: string;
  overlapSpanIds?: number[];
}

export type ProfileSample = ProfileMemorySample | ProfileLongTaskSample;

export interface ProfileWarning {
  code: string;
  message: string;
  timestamp?: number;
}

export type ProfileExportFormat = "json" | "chrome-trace";

export interface NodepodProfileReport {
  version: 1;
  id: string;
  name: string;
  startedAt: number;
  durationMs: number;
  environment: ProfileEnvironment;
  summary: ProfileSummary;
  spans: readonly ProfileSpan[];
  counters: Record<string, number>;
  gauges: Record<string, number>;
  samples: readonly ProfileSample[];
  warnings: readonly ProfileWarning[];
  export(format: ProfileExportFormat): string;
}

export interface ProfileSession {
  readonly id: string;
  readonly name: string;
  readonly startedAt: number;
  stop(): Promise<NodepodProfileReport>;
}

export interface NodepodProfiler {
  readonly enabled: boolean;
  readonly level: ProfilerLevel;
  start(name: string): ProfileSession;
  profile<T>(
    name: string,
    operation: () => T | Promise<T>,
  ): Promise<{ result: T; report: NodepodProfileReport }>;
}
