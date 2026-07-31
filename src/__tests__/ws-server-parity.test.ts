import { describe, it, expect } from "vitest";
import { ScriptEngine } from "../script-engine";
import { MemoryVolume } from "../memory-volume";

describe("ws polyfill Server parity", () => {
  it("exposes Server on default export like the npm ws package", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/project", { recursive: true });
    const engine = new ScriptEngine(vol, { cwd: "/project" });
    const r = engine.execute(
      `
      const ws = require("ws");
      function _interop_require_default(obj) {
        return obj && obj.__esModule ? obj : { default: obj };
      }
      const _ws = _interop_require_default(require("ws"));
      const Server = _ws.default.Server;
      const wss = new Server({ noServer: true });
      module.exports = {
        hasServer: typeof ws.Server === "function",
        defaultServer: typeof Server === "function",
        handleUpgrade: typeof wss.handleUpgrade === "function",
        keys: Object.keys(ws),
        esModule: !!ws.__esModule,
      };
      `,
      "/project/probe.js",
    );
    expect(r.exports).toMatchObject({
      hasServer: true,
      defaultServer: true,
      handleUpgrade: true,
    });
  });
});
