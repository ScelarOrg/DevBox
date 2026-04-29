import type { MemoryVolume } from "../../memory-volume";

export type GitMode = "api" | "native";

// --- Worker ↔ Main thread message protocol ---

export const GitMessageType = {
  REQUEST: "git-clone-request",
  PROGRESS: "git-clone-progress",
  DONE: "git-clone-done",
  ERROR: "git-clone-error",
} as const;

export interface GitCloneRequestMessage {
  type: typeof GitMessageType.REQUEST;
  url: string;
  targetDir: string;
  branch: string;
  token: string | null;
}

export interface GitCloneProgressMessage {
  type: typeof GitMessageType.PROGRESS;
  data: string;
}

export interface GitCloneDoneMessage {
  type: typeof GitMessageType.DONE;
  fileCount: number;
}

export interface GitCloneErrorMessage {
  type: typeof GitMessageType.ERROR;
  data: string;
}

export type GitWorkerMessage = GitCloneProgressMessage | GitCloneDoneMessage | GitCloneErrorMessage;

// --- Git command abstraction ---

export interface GitRequest {
  url: string;
  targetDir: string;
  branch: string;
  token: string | null;
}

export interface GitProgress {
  send(msg: string): void;
  done(fileCount: number): void;
  error(msg: string): void;
}

export interface GitShimOptions {
  mode: GitMode;
  corsProxy?: string;
  apiBase?: string;
  rawBase?: string;
}

export interface GitCommand {
  execute(
    vol: MemoryVolume,
    request: GitRequest,
    progress: GitProgress,
  ): Promise<void>;
}