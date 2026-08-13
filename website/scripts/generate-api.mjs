import { execFileSync } from "node:child_process";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { Application } from "typedoc";
import { MarkdownPageEvent } from "typedoc-plugin-markdown";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(websiteRoot, "..");
const output = join(websiteRoot, "src", "content", "docs", "docs", "reference", "api");
const relativeOutput = relative(websiteRoot, output);

if (!relativeOutput || relativeOutput.startsWith("..")) {
  throw new Error(`Refusing to recreate API output outside website: ${output}`);
}

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();

if (!/^[a-f0-9]{40}$/i.test(revision)) {
  throw new Error(`Could not resolve a full Git revision: ${revision}`);
}

await rm(output, { recursive: true, force: true });

const entryPoints = [
  join(repositoryRoot, "src", "index.ts"),
  join(repositoryRoot, "src", "headless.ts"),
  join(repositoryRoot, "src", "integrations", "server.ts"),
  join(repositoryRoot, "src", "integrations", "vite.ts"),
  join(repositoryRoot, "src", "integrations", "next.ts"),
];

const app = await Application.bootstrapWithPlugins({
  name: "Nodepod API",
  entryPoints: entryPoints.map((entryPoint) => entryPoint.replaceAll("\\", "/")),
  tsconfig: join(repositoryRoot, "tsconfig.json"),
  basePath: repositoryRoot,
  markdown: output,
  plugin: ["typedoc-plugin-markdown", "typedoc-plugin-frontmatter"],
  theme: "markdown",
  readme: "none",
  entryFileName: "index.md",
  fileExtension: ".md",
  router: "kind-dir",
  categorizeByGroup: true,
  excludePrivate: true,
  excludeInternal: true,
  excludeExternals: true,
  hideGenerator: true,
  githubPages: false,
  gitRevision: revision,
  sourceLinkTemplate: "https://github.com/R1ck404/Nodepod/blob/{gitRevision}/{path}#L{line}",
  frontmatterGlobals: {
    description: "Generated from Nodepod's public TypeScript exports.",
  },
  indexFrontmatter: {
    title: "API reference",
    sidebar: { order: 2 },
  },
  validation: {
    notExported: false,
    invalidLink: true,
    notDocumented: false,
  },
});

app.renderer.on(MarkdownPageEvent.BEGIN, (page) => {
  page.frontmatter = {
    ...(page.frontmatter ?? {}),
    title: page.model === page.project ? "API reference" : page.model.name,
  };
});

const project = await app.convert();
if (!project) {
  throw new Error("TypeDoc could not convert the Nodepod entry points.");
}

await app.generateOutputs(project);
if (app.logger.hasErrors()) {
  throw new Error("TypeDoc reported errors while generating API documentation.");
}

async function normalizeMarkdownRoutes(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizeMarkdownRoutes(path);
    } else if (entry.name.endsWith(".md")) {
      const contents = await readFile(path, "utf8");
      const normalized = contents.replace(/\]\(([^)]+)\)/g, (link, target) => {
        if (/^(?:[a-z]+:|\/|#)/i.test(target)) return link;
        const [pathPart, fragment] = target.split("#", 2);
        let route = pathPart
          .replace(/\/index\.md$/, "/")
          .replace(/\.md$/, "/");
        route = route
          .split("/")
          .map((segment) => segment === "." || segment === ".."
            ? segment
            : segment.toLowerCase().replaceAll(".", ""))
          .join("/");
        return `](${route}${fragment ? `#${fragment}` : ""})`;
      });
      if (normalized !== contents) await writeFile(path, normalized, "utf8");
    }
  }
}

await normalizeMarkdownRoutes(output);

console.log(`Generated API documentation from ${entryPoints.length} public entry points at ${revision.slice(0, 12)}.`);
