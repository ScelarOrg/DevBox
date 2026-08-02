import { describe, expect, it } from "vitest";
import { MemoryVolume } from "../memory-volume";
import { discoverWorkspaces, readWorkspacePatterns } from "../packages/workspace";
import { DependencyInstaller } from "../packages/installer";

function volumeWithFiles(files: Record<string, string>): MemoryVolume {
  const volume = new MemoryVolume();
  for (const [file, content] of Object.entries(files)) {
    const parent = file.slice(0, file.lastIndexOf("/")) || "/";
    volume.mkdirSync(parent, { recursive: true });
    volume.writeFileSync(file, content);
  }
  return volume;
}

describe("npm workspace discovery", () => {
  it("supports array and object package declarations", () => {
    const arrayManifest = { workspaces: ["apps/*", "packages/*"] };
    const objectManifest = { workspaces: { packages: ["modules/*"] } };
    expect(readWorkspacePatterns(arrayManifest)).toEqual(["apps/*", "packages/*"]);
    expect(readWorkspacePatterns(objectManifest)).toEqual(["modules/*"]);
  });

  it("discovers generic nested workspace roots and rejects duplicates", () => {
    const volume = volumeWithFiles({
      "/package.json": JSON.stringify({ workspaces: ["services/*", "shared/**"] }),
      "/services/api/package.json": JSON.stringify({ name: "@example/api", version: "1.0.0" }),
      "/shared/types/package.json": JSON.stringify({ name: "@example/types", version: "1.0.0" }),
    });
    const graph = discoverWorkspaces(volume);
    expect(graph.packages.map((item) => item.name)).toEqual(["@example/api", "@example/types"]);
    expect(graph.byName.get("@example/types")?.root).toBe("/shared/types");

    const duplicate = volumeWithFiles({
      "/package.json": JSON.stringify({ workspaces: ["one", "two"] }),
      "/one/package.json": JSON.stringify({ name: "same" }),
      "/two/package.json": JSON.stringify({ name: "same" }),
    });
    expect(() => discoverWorkspaces(duplicate)).toThrow("Duplicate workspace package name");
  });

  it("fails when a matching directory is not a package", () => {
    const volume = volumeWithFiles({
      "/package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "/packages/not-a-package/readme.md": "no manifest",
    });
    expect(() => discoverWorkspaces(volume)).toThrow("has no package.json");
  });

  it("installs external manifests and links local workspace packages", async () => {
    const volume = volumeWithFiles({
      "/package.json": JSON.stringify({ workspaces: ["apps/*", "packages/*"] }),
      "/apps/client/package.json": JSON.stringify({ name: "@example/client", dependencies: { "@example/shared": "workspace:*" } }),
      "/packages/shared/package.json": JSON.stringify({ name: "@example/shared", version: "1.0.0" }),
      "/packages/shared/src/index.ts": "export const value = 1;",
    });
    await new DependencyInstaller(volume).installWorkspace();
    expect(volume.readlinkSync("/apps/client/node_modules/@example/shared")).toBe("/packages/shared");
  });
});
