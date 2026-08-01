/**
 * Mirrors examples/ts-inline-generic-optional — ensures the demo files
 * actually load/run under ScriptEngine (the smoking-gun strip case).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScriptEngine } from "../script-engine";
import { MemoryVolume } from "../memory-volume";

function extractDemoFile(html: string, id: string): string {
  const re = new RegExp(
    `<script id="${id}" type="text/plain">([\\s\\S]*?)</script>`,
  );
  const m = html.match(re);
  if (!m) throw new Error(`missing demo file script#${id}`);
  return m[1].replace(/^\n/, "");
}

const CELLS_PATH =
  "/app/server/api/databases/cells/" + "[rowId].[columnId].ts";

describe("examples/ts-inline-generic-optional", () => {
  it("loads [rowId].[columnId].ts and runs PATCH (no Unexpected token '?')", async () => {
    const html = readFileSync(
      resolve(
        __dirname,
        "../../examples/ts-inline-generic-optional/index.html",
      ),
      "utf8",
    );

    const vol = new MemoryVolume();
    vol.mkdirSync("/app", { recursive: true });
    vol.writeFileSync("/app/http.ts", extractDemoFile(html, "file-http"));
    vol.writeFileSync("/app/schema.ts", extractDemoFile(html, "file-schema"));
    vol.writeFileSync(
      "/app/fake-drizzle.ts",
      extractDemoFile(html, "file-fake-drizzle"),
    );
    vol.writeFileSync(
      "/app/fake-nanoid.ts",
      extractDemoFile(html, "file-fake-nanoid"),
    );
    vol.mkdirSync("/app/server/api/databases/cells", { recursive: true });
    vol.writeFileSync(CELLS_PATH, extractDemoFile(html, "file-cells"));
    vol.writeFileSync("/app/main.ts", extractDemoFile(html, "file-main"));

    const logs: string[] = [];
    const engine = new ScriptEngine(vol, {
      cwd: "/app",
      onConsole: (_method, args) => {
        logs.push(args.map(String).join(" "));
      },
    });

    await engine.runFileTLA("/app/main.ts");

    const joined = logs.join("\n");
    expect(joined).not.toMatch(/SyntaxError: Unexpected token '\?'/);
    expect(joined).toContain(
      "PASS: inline generic optional stripped and PATCH ran",
    );
  });

  it("runs the broader matrix file from the demo", async () => {
    const html = readFileSync(
      resolve(
        __dirname,
        "../../examples/ts-inline-generic-optional/index.html",
      ),
      "utf8",
    );
    const logs: string[] = [];
    const vol = new MemoryVolume();
    vol.mkdirSync("/app", { recursive: true });
    vol.writeFileSync("/app/matrix.ts", extractDemoFile(html, "file-matrix"));
    const engine = new ScriptEngine(vol, {
      cwd: "/app",
      onConsole: (_method, args) => {
        logs.push(args.map(String).join(" "));
      },
    });
    await engine.runFileTLA("/app/matrix.ts");
    expect(logs.join("\n")).toContain("PASS: broader TS strip matrix ok");
  });
});
