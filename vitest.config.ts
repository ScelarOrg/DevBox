import { defineConfig } from "vitest/config";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/__tests__/e2e/**"],
    benchmark: {
      include: ["src/**/*.bench.ts"],
    },
  },
});
