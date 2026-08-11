import { beforeEach, describe, expect, it, vi } from "vitest";

const lightningcssMock = vi.hoisted(() => {
  let ready = false;
  const init = vi.fn(async () => {
    await Promise.resolve();
    ready = true;
  });
  const transform = vi.fn(() => ({ code: new Uint8Array([1, 2, 3]) }));
  const isReady = vi.fn(() => ready);
  const reset = () => {
    ready = false;
    init.mockClear();
    transform.mockClear();
    isReady.mockClear();
  };
  return { init, transform, isReady, reset };
});

vi.mock("../polyfills/lightningcss", () => ({
  ...lightningcssMock,
  default: lightningcssMock,
}));

import { ScriptEngine } from "../script-engine";
import { MemoryVolume } from "../memory-volume";

describe("ScriptEngine asynchronous native polyfill initialization", () => {
  beforeEach(() => lightningcssMock.reset());

  it("awaits Lightning CSS initialization before retrying a sync require", async () => {
    const volume = new MemoryVolume();
    volume.mkdirSync("/project/node_modules/lightningcss", { recursive: true });
    volume.writeFileSync(
      "/project/node_modules/lightningcss/package.json",
      JSON.stringify({ name: "lightningcss", main: "index.js" }),
    );
    volume.writeFileSync(
      "/project/node_modules/lightningcss/index.js",
      'module.exports = require("./native.node");',
    );
    volume.writeFileSync("/project/node_modules/lightningcss/native.node", "native");
    volume.writeFileSync(
      "/project/entry.js",
      'const css = require("lightningcss"); module.exports = css.transform({}).code.length;',
    );

    const engine = new ScriptEngine(volume, { cwd: "/project" });
    const result = await engine.runFileTLA("/project/entry.js");

    expect(result.exports).toBe(3);
    expect(lightningcssMock.init).toHaveBeenCalledTimes(1);
    expect(lightningcssMock.transform).toHaveBeenCalledTimes(1);
    expect(lightningcssMock.isReady).toHaveBeenCalled();
  });

  it("awaits initialization at a late dynamic-import boundary", async () => {
    const volume = new MemoryVolume();
    volume.mkdirSync("/project/node_modules/lightningcss", { recursive: true });
    volume.writeFileSync(
      "/project/node_modules/lightningcss/package.json",
      JSON.stringify({ name: "lightningcss", main: "index.js" }),
    );
    volume.writeFileSync(
      "/project/node_modules/lightningcss/index.js",
      'module.exports = require("./native.node");',
    );
    volume.writeFileSync("/project/node_modules/lightningcss/native.node", "native");
    volume.writeFileSync(
      "/project/entry.js",
      `module.exports = (async () => {
        await Promise.resolve();
        const css = await import("lightningcss");
        return css.transform({}).code.length;
      })();`,
    );

    const engine = new ScriptEngine(volume, { cwd: "/project" });
    const result = await engine.runFileTLA("/project/entry.js");

    await expect(result.exports).resolves.toBe(3);
    expect(lightningcssMock.init).toHaveBeenCalledTimes(1);
    expect(lightningcssMock.transform).toHaveBeenCalledTimes(1);
  });
});
