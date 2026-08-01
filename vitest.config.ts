import { defineConfig } from "vitest/config";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    {
      name: "test-process-worker-bundle",
      resolveId(id) {
        return id === "virtual:process-worker-bundle" ? "\0virtual:process-worker-bundle" : null;
      },
      load(id) {
        return id === "\0virtual:process-worker-bundle"
          ? 'export const PROCESS_WORKER_BUNDLE_GZIP_BASE64 = "";'
          : null;
      },
    },
  ],
  test: {
    include: ["src/**/*.test.ts"],
    // CI runners OOM / hang when fork fan-out is high; wasi/native workers also
    // need a bounded pool so teardown does not time out into a false failure.
    pool: "forks",
    maxWorkers: 2,
    teardownTimeout: 20_000,
    benchmark: {
      include: ["src/**/*.bench.ts"],
    },
  },
});
