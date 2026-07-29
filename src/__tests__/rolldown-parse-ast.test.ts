import { describe, expect, it } from "vitest";
import { MemoryVolume } from "../memory-volume";
import { ScriptEngine } from "../script-engine";
import { parseAst, parseAstAsync } from "../polyfills/rollup";

describe("rolldown/parseAst polyfill", () => {
  it("parseAst returns a Program AST", () => {
    const ast = parseAst("export const x = 1;") as {
      type: string;
      body: unknown[];
    };
    expect(ast.type).toBe("Program");
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it("parseAstAsync matches rolldown signature (source, opts, filename)", async () => {
    const ast = (await parseAstAsync(
      "const y = 2;",
      { lang: "js" },
      "/virtual/file.js",
    )) as { type: string };
    expect(ast.type).toBe("Program");
  });

  it("throws PARSE_ERROR on syntax failure", () => {
    try {
      parseAst("const =", null, "/bad.js");
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe("PARSE_ERROR");
    }
  });

  it("resolves bare rolldown/parseAst to the polyfill (not binding.parse)", async () => {
    const vol = new MemoryVolume();
    // decoy package so a real resolve would prefer node_modules if we didn't stub
    vol.mkdirSync("/node_modules/rolldown/dist", { recursive: true });
    vol.writeFileSync(
      "/node_modules/rolldown/package.json",
      JSON.stringify({
        name: "rolldown",
        exports: { "./parseAst": "./dist/parse-ast-index.mjs" },
      }),
    );
    vol.writeFileSync(
      "/node_modules/rolldown/dist/parse-ast-index.mjs",
      `
        export function parseAst() { throw new Error("real rolldown parseAst should not run"); }
        export async function parseAstAsync() { throw new Error("real rolldown parseAstAsync should not run"); }
      `,
    );
    const logs: string[] = [];
    vol.writeFileSync(
      "/app/main.mjs",
      `
        import { parseAst, parseAstAsync } from "rolldown/parseAst";
        const a = parseAst("export default 1");
        const b = await parseAstAsync("const z = 3");
        console.log(JSON.stringify({ aType: a.type, bType: b.type, bodyLen: a.body.length }));
      `,
    );

    const engine = new ScriptEngine(vol, {
      cwd: "/app",
      onConsole: (_m, args) => {
        logs.push(String(args[0]));
      },
    });
    await engine.runFileTLA("/app/main.mjs");
    expect(logs.length).toBeGreaterThan(0);
    const result = JSON.parse(logs[0]!);
    expect(result.aType).toBe("Program");
    expect(result.bType).toBe("Program");
    expect(result.bodyLen).toBeGreaterThan(0);
  });

  it("short-circuits resolved parse-ast-index.mjs path", async () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/node_modules/rolldown/dist", { recursive: true });
    vol.writeFileSync(
      "/node_modules/rolldown/package.json",
      JSON.stringify({
        name: "rolldown",
        exports: { "./parseAst": "./dist/parse-ast-index.mjs" },
      }),
    );
    vol.writeFileSync(
      "/node_modules/rolldown/dist/parse-ast-index.mjs",
      `export function parseAst() { throw new Error("should not load real file"); }
       export async function parseAstAsync() { throw new Error("should not load real file"); }`,
    );
    const logs: string[] = [];
    vol.writeFileSync(
      "/app/via-path.mjs",
      `
        const mod = await import("/node_modules/rolldown/dist/parse-ast-index.mjs");
        const ast = await mod.parseAstAsync("let ok = true");
        console.log(ast.type);
      `,
    );

    const engine = new ScriptEngine(vol, {
      cwd: "/app",
      onConsole: (_m, args) => {
        logs.push(String(args[0]));
      },
    });
    await engine.runFileTLA("/app/via-path.mjs");
    expect(logs[0]).toBe("Program");
  });
});
