import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(websiteRoot, "..");
const apiRoot = join(websiteRoot, "src", "content", "docs", "docs", "reference", "api");
const failures = [];
let sourceLinks = 0;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (extname(entry.name) === ".md") files.push(path);
  }
  return files;
}

for (const markdown of await collect(apiRoot)) {
  const contents = await readFile(markdown, "utf8");
  for (const match of contents.matchAll(/https:\/\/github\.com\/R1ck404\/Nodepod\/blob\/([a-f0-9]{40})\/([^#)]+)#L\d+/gi)) {
    sourceLinks += 1;
    const local = resolve(repositoryRoot, decodeURIComponent(match[2]));
    if (!local.startsWith(repositoryRoot) || !(await access(local).then(() => true, () => false))) {
      failures.push(`${markdown}: ${match[0]}`);
    }
  }
}

if (sourceLinks === 0) failures.push("No commit-pinned GitHub source links were generated.");

if (failures.length) {
  console.error(`Invalid generated API source links (${failures.length}):\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${sourceLinks} commit-pinned API source links against local repository files.`);
}
