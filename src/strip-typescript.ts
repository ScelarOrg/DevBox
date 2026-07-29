// Fast TypeScript → JS stripping for the sync module loader.
// Same cost class as the previous regex stripper, plus a linear scan that
// removes call-site generics like `readJson<{ value?: string | null }>()`.

export function isTypeScriptFile(filename: string): boolean {
  const clean = filename.split("?")[0];
  if (
    clean.endsWith(".ts") ||
    clean.endsWith(".tsx") ||
    clean.endsWith(".mts") ||
    clean.endsWith(".cts")
  ) {
    return true;
  }
  if (filename.includes("lang.ts") || filename.includes("lang=ts")) return true;
  return false;
}

/** Apply a regex replace only outside string/template literals. */
function replaceOutsideStrings(
  source: string,
  re: RegExp,
  replacer: string | ((...args: any[]) => string),
): string {
  const parts: string[] = [];
  let last = 0;
  let inStr: '"' | "'" | "`" | null = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // flush code segment before string
      if (i > last) {
        const chunk = source.slice(last, i);
        parts.push(
          typeof replacer === "string"
            ? chunk.replace(re, replacer)
            : chunk.replace(re, replacer),
        );
      }
      last = i;
      inStr = c;
      // find end of string
      for (let k = i + 1; k < source.length; k++) {
        if (source[k] === "\\") {
          k++;
          continue;
        }
        if (source[k] === inStr) {
          parts.push(source.slice(last, k + 1));
          last = k + 1;
          i = k;
          inStr = null;
          break;
        }
      }
    }
  }
  if (last < source.length) {
    const chunk = source.slice(last);
    parts.push(
      typeof replacer === "string"
        ? chunk.replace(re, replacer)
        : chunk.replace(re, replacer),
    );
  }
  return parts.join("");
}

/** Remove `type` / `export type` aliases, including multiline `{ ... }` bodies. */
function stripTypeAliases(source: string): string {
  let s = source;
  const re = /^[ \t]*(?:export\s+)?type\s+[A-Za-z_$][\w$]*(?:\s*<[^>]*>)?\s*=\s*/gm;
  let m: RegExpExecArray | null;
  const removals: Array<[number, number]> = [];
  while ((m = re.exec(s)) !== null) {
    let i = m.index + m[0].length;
    let depthBrace = 0;
    let depthAngle = 0;
    let depthParen = 0;
    let depthBracket = 0;
    let inStr: '"' | "'" | "`" | null = null;
    for (; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inStr = c;
        continue;
      }
      if (c === "{") depthBrace++;
      else if (c === "}") depthBrace--;
      else if (c === "<") depthAngle++;
      else if (c === ">" && depthAngle) depthAngle--;
      else if (c === "(") depthParen++;
      else if (c === ")" && depthParen) depthParen--;
      else if (c === "[") depthBracket++;
      else if (c === "]" && depthBracket) depthBracket--;
      else if (
        c === ";" &&
        !depthBrace &&
        !depthAngle &&
        !depthParen &&
        !depthBracket
      ) {
        i++;
        break;
      }
    }
    removals.push([m.index, i]);
  }
  for (let r = removals.length - 1; r >= 0; r--) {
    const [a, b] = removals[r];
    s = s.slice(0, a) + s.slice(b);
  }
  return s;
}

/**
 * Strip `<...>` type-argument lists after identifiers / `>` / `)`.
 * Handles nested `<>` and `{}` so object types with `?:` are removed.
 */
function stripTypeArguments(source: string): string {
  const n = source.length;
  let out = "";
  let i = 0;

  while (i < n) {
    if (source.charCodeAt(i) !== 60 /* < */) {
      out += source[i];
      i++;
      continue;
    }

    const next = i + 1 < n ? source.charCodeAt(i + 1) : 0;
    if (next === 61 /* = */ || next === 60 /* < */) {
      out += source[i];
      i++;
      continue;
    }

    let j = i - 1;
    while (j >= 0 && /\s/.test(source[j])) j--;
    const prev = j >= 0 ? source[j] : "";
    if (!/[\w$)>]/.test(prev)) {
      out += source[i];
      i++;
      continue;
    }

    let depthAngle = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    let depthParen = 0;
    let k = i;
    let inStr: '"' | "'" | "`" | null = null;
    let closed = false;

    for (; k < n; k++) {
      const c = source[k];
      if (inStr) {
        if (c === "\\") {
          k++;
          continue;
        }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inStr = c;
        continue;
      }
      if (c === "{") {
        depthBrace++;
        continue;
      }
      if (c === "}") {
        if (depthBrace) depthBrace--;
        continue;
      }
      if (c === "[") {
        depthBracket++;
        continue;
      }
      if (c === "]") {
        if (depthBracket) depthBracket--;
        continue;
      }
      if (c === "(") {
        depthParen++;
        continue;
      }
      if (c === ")") {
        if (depthParen) depthParen--;
        continue;
      }
      if (depthBrace || depthBracket || depthParen) continue;

      if (c === "<") {
        depthAngle++;
        continue;
      }
      if (c === ">") {
        depthAngle--;
        if (depthAngle === 0) {
          closed = true;
          k++;
          break;
        }
      }
    }

    if (!closed) {
      out += source[i];
      i++;
      continue;
    }

    const inner = source.slice(i + 1, k - 1);
    const after = k < n ? source[k] : "";

    // Reject value comparisons: `a < b && b > c`
    if (/&&|\|\||\+\+|--/.test(inner) || /^\s*\d/.test(inner)) {
      out += source[i];
      i++;
      continue;
    }

    const looksLikeType =
      /[{?:|=|]/.test(inner) ||
      /\[/.test(inner) ||
      /^\s*(?:readonly\s+|keyof\s+|typeof\s+|infer\s+)?(?:[A-Za-z_$]|string|number|boolean|any|unknown|never|void|object|bigint|null|undefined|['"`])/.test(
        inner,
      );

    const afterOk =
      after === "" ||
      /[\s(),.;:?\[\]|&!]/.test(after) ||
      after === "`" ||
      after === "'" ||
      after === '"';

    if (looksLikeType && afterOk) {
      i = k;
      continue;
    }

    out += source[i];
    i++;
  }

  return out;
}

const NAMED_TYPE =
  "(?:[A-Z][\\w.$]*|string|number|boolean|void|any|never|unknown|null|undefined|object|bigint)";

export function stripTypeScript(
  source: string,
  _filename: string = "module.ts",
): string {
  let s = source;

  s = s.replace(
    /^\s*declare\s+(module|namespace|global)\s+[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/gm,
    "",
  );
  s = s.replace(
    /^\s*declare\s+(?:const|let|var|function|class|enum|type|interface)\s+[^;\n]+[;\n]/gm,
    "",
  );

  s = s.replace(
    /^\s*(?:export\s+)?interface\s+\w+(?:\s+extends\s+[^{]+)?\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/gm,
    "",
  );

  s = stripTypeAliases(s);

  s = s.replace(
    /^\s*export\s+type\s*\{[^}]*\}\s*(?:from\s*['"][^'"]*['"])?\s*;?/gm,
    "",
  );
  s = s.replace(
    /^\s*import\s+type\s+(?:\{[^}]*\}|\w+)\s*(?:from\s*['"][^'"]*['"])?\s*;?/gm,
    "",
  );

  s = replaceOutsideStrings(s, /\bas\s+const\b/g, "");
  s = replaceOutsideStrings(
    s,
    /\s+as\s+(?:[A-Za-z_$][\w.<>,\s|&\[\]]*|string|number|boolean|any|unknown|never|void|object|bigint|null|undefined)/g,
    "",
  );
  s = replaceOutsideStrings(
    s,
    /\s+satisfies\s+(?:[A-Za-z_$][\w.<>,\s|&\[\]]*|string|number|boolean|any|unknown|never|void|object|bigint)/g,
    "",
  );

  // Optional binding before type: `opts?: T` → `opts: T` (not inside strings)
  s = replaceOutsideStrings(s, /(\w)\?(\s*:)/g, "$1$2");

  s = s.replace(
    /(function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function\s*)?)\s*<[^(]*?>\s*\(/g,
    "$1(",
  );

  // Call-site / instantiation generics (incl. `{ value?: ... }` and `T = unknown`)
  s = stripTypeArguments(s);

  // Named utility generics leftover
  s = s.replace(
    /(?<!=)\s*<(?:string|number|boolean|any|unknown|never|void|object|bigint|Record|Partial|Required|Readonly|Pick|Omit|Extract|Exclude|Array|Promise|Set|Map)\b[^>]*>/g,
    "",
  );

  // `: Type` / `: Type[]` / unions in signature contexts
  const colonTypeRe = new RegExp(
    String.raw`:\s*(?:readonly\s+)?${NAMED_TYPE}(?:\s*\|\s*${NAMED_TYPE})*(?:\s*\[\])*`,
    "g",
  );
  const isTypeAnnotationSite = (before: string) =>
    /[,(]\s*(?:\.\.\.)?\w+\s*$/.test(before) ||
    /\)\s*$/.test(before) ||
    /\(\s*(?:\.\.\.)?\w+\s*$/.test(before) ||
    /\b(?:const|let|var)\s+\w+$/.test(before);

  s = s.replace(colonTypeRe, (match, offset) => {
    const before = s.slice(Math.max(0, offset - 40), offset);
    return isTypeAnnotationSite(before) ? "" : match;
  });

  // Object inline type annotations: `x: { a?: string }`
  // Do NOT strip value object literals: `params: { rowId: "row1" }`
  s = s.replace(
    /:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
    (match, offset) => {
      const before = s.slice(Math.max(0, offset - 40), offset);
      if (!isTypeAnnotationSite(before)) return match;
      if (/:\s*(?:['"`]|\d|true|false|null|\[)/.test(match)) return match;
      return "";
    },
  );

  s = s.replace(/(\w)!\./g, "$1.");
  s = s.replace(/(\w)!\)/g, "$1)");
  s = s.replace(/(\w)!\,/g, "$1,");
  s = s.replace(/(\w)!;/g, "$1;");
  s = s.replace(/(\w)!$/gm, "$1");

  s = s.replace(
    /^\s*(?:export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{([^}]*)\}/gm,
    (_, name, body) => {
      const entries = body
        .split(",")
        .map((e: string) => e.trim())
        .filter(Boolean);
      const obj: string[] = [];
      let autoVal = 0;
      for (const entry of entries) {
        const eqIdx = entry.indexOf("=");
        if (eqIdx !== -1) {
          const key = entry.slice(0, eqIdx).trim();
          const val = entry.slice(eqIdx + 1).trim();
          obj.push(`${JSON.stringify(key)}: ${val}`);
          const numVal = Number(val);
          if (!isNaN(numVal)) autoVal = numVal + 1;
        } else {
          obj.push(`${JSON.stringify(entry)}: ${autoVal}`);
          autoVal++;
        }
      }
      return `var ${name} = {${obj.join(", ")}};`;
    },
  );

  s = s.replace(/^\s*(public|private|protected)?\s*readonly\s+/gm, "$1 ");
  s = s.replace(/\b(public|private|protected)\s+(?=\w+[\s,):])/g, "");
  s = s.replace(/\babstract\s+(class|extends)/g, "$1");
  s = s.replace(/\bimplements\s+[\w.,\s<>]+(?=\s*\{)/g, "");
  s = s.replace(/\boverride\s+(?=\w)/g, "");
  s = s.replace(/\baccessor\s+/g, "");

  return s;
}
