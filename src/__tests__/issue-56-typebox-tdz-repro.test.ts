// Throwaway repro for https://github.com/ScelarOrg/Nodepod/issues/56
// Pattern: an ESM module imports a name that shadows a JS global ("Object",
// "Array", "Promise", etc.). Typebox 1.x exports its type factories under those
// exact names, so any consumer that imports typebox triggers a TDZ during
// module evaluation in nodepod's loader: "Cannot access 'Object' before
// initialization".
//
// Three repros, smallest to largest:
//   1. directly: `export function Object(){}; export const x = Object;` (one file)
//   2. multi-file: import { Object } from './types/object.mjs' (mirrors typebox)
//   3. shape-faithful: full named-import set used by typebox/engine/instantiate
//
// Run with:
//   npx vitest run src/__tests__/issue-56-typebox-tdz-repro.test.ts

import { describe, it } from "vitest";
import { ScriptEngine } from "../script-engine";
import { MemoryVolume } from "../memory-volume";

function createEngine(files: Record<string, string>) {
  const vol = new MemoryVolume();
  vol.mkdirSync("/project", { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const dir = path.substring(0, path.lastIndexOf("/")) || "/";
    if (dir !== "/") vol.mkdirSync(dir, { recursive: true });
    vol.writeFileSync(path, content);
  }
  return new ScriptEngine(vol, { cwd: "/project" });
}

function tryRun(label: string, engine: ScriptEngine, entrySrc: string) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${label} ===`);
  try {
    const r = engine.execute(entrySrc, "/project/__entry.js");
    // eslint-disable-next-line no-console
    console.log(`  PASS - exports=${JSON.stringify(r.exports)}`);
    return { ok: true as const };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.log(`  THREW - ${e?.message ?? e}`);
    if (e?.stack) {
      const stack = String(e.stack)
        .split("\n")
        .slice(0, 6)
        .map((l) => "    " + l)
        .join("\n");
      // eslint-disable-next-line no-console
      console.log(stack);
    }
    return { ok: false as const, err: e };
  }
}

describe("issue 56 typebox 1.x TDZ repro", () => {
  it("repro 1: single file `export function Object` then references it", () => {
    const engine = createEngine({
      "/project/single.mjs": [
        "export function Object(properties) { return { kind: 'Object', properties }; }",
        "export const SAMPLE = Object({});",
      ].join("\n"),
    });
    tryRun(
      "repro 1: single file 'export function Object'",
      engine,
      "const m = require('./single.mjs'); module.exports = m.SAMPLE;",
    );
  });

  it("repro 2: cross-file `import { Object } from './types/object.mjs'`", () => {
    const engine = createEngine({
      "/project/types/object.mjs": [
        "export function Object(properties) {",
        "  return { '~kind': 'Object', type: 'object', properties };",
        "}",
        "export function IsObject(v) { return v && v['~kind'] === 'Object'; }",
        "export function ObjectOptions(t) { const { properties, ...rest } = t; return rest; }",
      ].join("\n"),
      "/project/engine/instantiate.mjs": [
        "// mirrors typebox/build/type/engine/instantiate.mjs line 20",
        "import { Object, IsObject, ObjectOptions } from '../types/object.mjs';",
        "export function Instantiate(t) {",
        "  if (IsObject(t)) return Object(t.properties);",
        "  return t;",
        "}",
      ].join("\n"),
    });
    tryRun(
      "repro 2: import { Object } shadowing global",
      engine,
      [
        "const m = require('./engine/instantiate.mjs');",
        "module.exports = m.Instantiate({ '~kind': 'Object', properties: {} });",
      ].join("\n"),
    );
  });

  it("repro 3: shape-faithful set of typebox imports (Object, Array, Promise, Function, ...)", () => {
    const mk = (name: string) =>
      `export function ${name}(x) { return { '~kind': '${name}', body: x }; }\n` +
      `export function Is${name}(v) { return v && v['~kind'] === '${name}'; }\n`;
    const engine = createEngine({
      "/project/types/object.mjs": mk("Object"),
      "/project/types/array.mjs": mk("Array"),
      "/project/types/promise.mjs": mk("Promise"),
      "/project/types/function.mjs": mk("Function"),
      "/project/types/iterator.mjs": mk("Iterator"),
      "/project/engine/instantiate.mjs": [
        "// mirrors typebox/build/type/engine/instantiate.mjs imports verbatim",
        "import { Object, IsObject } from '../types/object.mjs';",
        "import { Array, IsArray } from '../types/array.mjs';",
        "import { Promise, IsPromise } from '../types/promise.mjs';",
        "import { Function, IsFunction } from '../types/function.mjs';",
        "import { Iterator, IsIterator } from '../types/iterator.mjs';",
        "export function Instantiate(t) {",
        "  if (IsObject(t)) return Object(t);",
        "  if (IsArray(t))  return Array(t);",
        "  if (IsPromise(t)) return Promise(t);",
        "  if (IsFunction(t)) return Function(t);",
        "  if (IsIterator(t)) return Iterator(t);",
        "  return t;",
        "}",
      ].join("\n"),
    });
    tryRun(
      "repro 3: full typebox-style named-import shadow set",
      engine,
      [
        "const m = require('./engine/instantiate.mjs');",
        "module.exports = m.Instantiate({ '~kind': 'Object' });",
      ].join("\n"),
    );
  });

  it("repro 4: same but with class-style exports (typebox internally uses functions, but other libs use classes)", () => {
    const engine = createEngine({
      "/project/types/object.mjs": [
        "export class Object {",
        "  constructor(props) { this.props = props; this.kind = 'Object'; }",
        "  static is(v) { return v && v.kind === 'Object'; }",
        "}",
      ].join("\n"),
      "/project/main.mjs": [
        "import { Object } from './types/object.mjs';",
        "export const sample = new Object({ a: 1 });",
      ].join("\n"),
    });
    tryRun(
      "repro 4: export class Object",
      engine,
      "const m = require('./main.mjs'); module.exports = m.sample.props;",
    );
  });
});
