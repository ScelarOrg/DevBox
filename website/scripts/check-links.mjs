import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(websiteRoot, "dist");
const base = "/Nodepod";
const origin = "https://r1ck404.github.io";
const failures = [];

async function collect(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path, extension));
    else if (extname(entry.name) === extension) files.push(path);
  }
  return files;
}

function candidateFor(pathname) {
  let path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  path = decodeURIComponent(path).replace(/^\/+/, "");
  if (path === "404" || path === "404/") return join(dist, "404.html");
  if (!path || path.endsWith("/")) return join(dist, path, "index.html");
  if (extname(path)) return join(dist, path);
  return join(dist, path, "index.html");
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

for (const htmlFile of await collect(dist, ".html")) {
  const html = await readFile(htmlFile, "utf8");
  const documentUrl = new URL(relative(dist, htmlFile).replaceAll("\\", "/"), `${origin}${base}/`);
  const attributes = html.matchAll(/\b(?:href|src)=(?:"([^"]+)"|'([^']+)')/g);
  for (const match of attributes) {
    const value = match[1] ?? match[2];
    if (!value || value.startsWith("#") || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) continue;

    let url;
    try { url = new URL(value, documentUrl); } catch { continue; }
    if (url.origin !== origin || (!url.pathname.startsWith(`${base}/`) && url.pathname !== base)) continue;

    const candidate = candidateFor(url.pathname);
    if (!await exists(candidate)) {
      failures.push(`${relative(dist, htmlFile)} -> ${value} (expected ${relative(dist, candidate)})`);
    }
  }
}

if (failures.length) {
  console.error(`Broken internal links/assets (${failures.length}):\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Internal link check passed with zero broken routes or assets.");
}
