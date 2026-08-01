import { describe, bench } from "vitest";
import { MemoryVolume } from "../../memory-volume";
import { ScriptEngine } from "../../script-engine";

function createEngine(files?: Record<string, string>): ScriptEngine {
  const vol = new MemoryVolume();
  vol.mkdirSync("/project", { recursive: true });
  if (files) {
    for (const [path, content] of Object.entries(files)) {
      const dir = path.substring(0, path.lastIndexOf("/")) || "/";
      if (dir !== "/") vol.mkdirSync(dir, { recursive: true });
      vol.writeFileSync(path, content);
    }
  }
  return new ScriptEngine(vol, { cwd: "/project" });
}

describe("ScriptEngine - execute", () => {
  bench("simple expression", () => {
    const engine = createEngine();
    engine.execute("module.exports = 1 + 1;", "/index.js");
  });

  bench("console.log", () => {
    const engine = createEngine();
    engine.execute('console.log("hello");', "/index.js");
  });

  bench("require('path')", () => {
    const engine = createEngine();
    engine.execute(
      'const path = require("path"); module.exports = path.join("/a", "b");',
      "/index.js",
    );
  });

  bench("require('events') + use", () => {
    const engine = createEngine();
    engine.execute(
      'const { EventEmitter } = require("events"); const ee = new EventEmitter(); ee.on("x", () => {}); ee.emit("x");',
      "/index.js",
    );
  });
});

describe("ScriptEngine - module resolution", () => {
  bench("require local file", () => {
    const engine = createEngine({
      "/project/lib.js": "module.exports = { value: 42 };",
      "/project/index.js":
        'const lib = require("./lib"); module.exports = lib.value;',
    });
    engine.runFile("/project/index.js");
  });

  bench("require chain - 3 modules deep", () => {
    const engine = createEngine({
      "/project/a.js": "module.exports = { a: 1 };",
      "/project/b.js":
        'const a = require("./a"); module.exports = { ...a, b: 2 };',
      "/project/c.js":
        'const b = require("./b"); module.exports = { ...b, c: 3 };',
    });
    engine.runFile("/project/c.js");
  });

  bench("require with index.js resolution", () => {
    const engine = createEngine({
      "/project/mylib/index.js": "module.exports = { ok: true };",
      "/project/index.js": 'module.exports = require("./mylib");',
    });
    engine.runFile("/project/index.js");
  });

  bench("require 10 builtins", () => {
    const engine = createEngine();
    engine.execute(
      [
        'require("path");',
        'require("fs");',
        'require("events");',
        'require("util");',
        'require("os");',
        'require("url");',
        'require("querystring");',
        'require("buffer");',
        'require("stream");',
        'require("crypto");',
      ].join("\n"),
      "/index.js",
    );
  });
});

describe("ScriptEngine - cache", () => {
  bench("execute + clearCache + re-execute", () => {
    const engine = createEngine({
      "/project/mod.js": "module.exports = Date.now();",
    });
    engine.runFile("/project/mod.js");
    engine.clearCache();
    engine.runFile("/project/mod.js");
  });
});
