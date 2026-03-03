import { describe, bench } from "vitest";
import { MemoryVolume } from "../../memory-volume";
import { ScriptEngine } from "../../script-engine";

describe("Integration - end to end", () => {
  bench("volume + engine + write + execute", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/app", { recursive: true });
    vol.writeFileSync(
      "/app/index.js",
      `
      const path = require('path');
      const result = path.join('/home', 'user', 'project');
      module.exports = result;
    `,
    );
    const engine = new ScriptEngine(vol, { cwd: "/app" });
    engine.runFile("/app/index.js");
  });

  bench("5-module project with require chain", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/app/src", { recursive: true });

    vol.writeFileSync(
      "/app/src/config.js",
      "module.exports = { port: 3000, host: 'localhost' };",
    );
    vol.writeFileSync(
      "/app/src/utils.js",
      `
      const path = require('path');
      module.exports = {
        resolve: (...args) => path.resolve(...args),
        join: (...args) => path.join(...args),
      };
    `,
    );
    vol.writeFileSync(
      "/app/src/logger.js",
      `
      const util = require('util');
      module.exports = {
        info: (...args) => util.format(...args),
        error: (...args) => util.format('ERROR:', ...args),
      };
    `,
    );
    vol.writeFileSync(
      "/app/src/router.js",
      `
      const { EventEmitter } = require('events');
      class Router extends EventEmitter {
        constructor() { super(); this.routes = []; }
        add(method, path, handler) { this.routes.push({ method, path, handler }); }
      }
      module.exports = Router;
    `,
    );
    vol.writeFileSync(
      "/app/src/index.js",
      `
      const config = require('./config');
      const utils = require('./utils');
      const logger = require('./logger');
      const Router = require('./router');

      const router = new Router();
      router.add('GET', '/', () => 'hello');
      module.exports = { config, utils, logger, router };
    `,
    );

    const engine = new ScriptEngine(vol, { cwd: "/app" });
    engine.runFile("/app/src/index.js");
  });

  bench("ESM project with import/export conversion", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/esm", { recursive: true });

    vol.writeFileSync(
      "/esm/math.js",
      `
      export function add(a, b) { return a + b; }
      export function multiply(a, b) { return a * b; }
      export default { add, multiply };
    `,
    );
    vol.writeFileSync(
      "/esm/index.js",
      `
      import math, { add, multiply } from './math.js';
      const result = add(multiply(3, 4), 5);
      export default result;
    `,
    );

    const engine = new ScriptEngine(vol, { cwd: "/esm" });
    engine.runFile("/esm/index.js");
  });

  bench("snapshot round-trip: 100 files + save + restore + verify", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/proj/src", { recursive: true });
    for (let i = 0; i < 100; i++) {
      vol.writeFileSync(
        `/proj/src/mod${i}.js`,
        `module.exports = { id: ${i} };`,
      );
    }

    const snapshot = vol.toSnapshot();
    const restored = MemoryVolume.fromSnapshot(snapshot);
    restored.readFileSync("/proj/src/mod50.js", "utf8");
  });
});
