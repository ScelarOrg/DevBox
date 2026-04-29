import { GitMessageType } from "./types";
import type { GitWorkerMessage } from "./types";

/**
 * Send a git clone request from the worker to the main thread
 * and stream progress back to the caller.
 */
export function requestGitClone(
  url: string,
  targetDir: string,
  branch: string,
  token: string | null,
  onProgress: (msg: string) => void,
): Promise<{ fileCount: number }> {
  return new Promise((resolve, reject) => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as GitWorkerMessage;
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case GitMessageType.PROGRESS:
          onProgress(msg.data);
          break;
        case GitMessageType.DONE:
          self.removeEventListener("message", handler);
          resolve({ fileCount: msg.fileCount });
          break;
        case GitMessageType.ERROR:
          self.removeEventListener("message", handler);
          reject(new Error(msg.data));
          break;
      }
    };

    self.addEventListener("message", handler);

    (postMessage as any)({
      type: GitMessageType.REQUEST,
      url,
      targetDir,
      branch,
      token,
    });
  });
}