import type { BuiltinFn, ShellContext } from "../shell-types";
import {
  ok,
  fail,
  resolvePath,
  parseArgs,
  pathModule,
} from "../shell-helpers";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCat(
  content: string,
  numberAll: boolean,
  numberNonBlank: boolean,
  squeeze: boolean,
  showEnds: boolean,
  showTabs: boolean,
): string {
  let lines = content.split("\n");
  if (squeeze) {
    const squeezed: string[] = [];
    let prevBlank = false;
    for (const line of lines) {
      const blank = line.length === 0;
      if (blank && prevBlank) continue;
      squeezed.push(line);
      prevBlank = blank;
    }
    lines = squeezed;
  }
  let lineNum = 1;
  const result = lines.map((line, idx) => {
    let l = line;
    if (showTabs) l = l.replace(/\t/g, "^I");
    if (showEnds && idx < lines.length - 1) l += "$";
    if (numberNonBlank) {
      if (line.length > 0) l = `${String(lineNum++).padStart(6)}\t${l}`;
    } else if (numberAll) {
      l = `${String(lineNum++).padStart(6)}\t${l}`;
    }
    return l;
  });
  return result.join("\n");
}

function copyTree(ctx: ShellContext, src: string, dst: string): void {
  ctx.volume.mkdirSync(dst, { recursive: true });
  for (const name of ctx.volume.readdirSync(src)) {
    const s = `${src}/${name}`;
    const d = `${dst}/${name}`;
    const st = ctx.volume.statSync(s);
    if (st.isDirectory()) {
      copyTree(ctx, s, d);
    } else {
      ctx.volume.writeFileSync(d, ctx.volume.readFileSync(s));
    }
  }
}

function removeTree(ctx: ShellContext, dir: string): void {
  for (const name of ctx.volume.readdirSync(dir)) {
    const full = `${dir}/${name}`;
    const st = ctx.volume.statSync(full);
    if (st.isDirectory()) removeTree(ctx, full);
    else ctx.volume.unlinkSync(full);
  }
  ctx.volume.rmdirSync(dir);
}

/* ------------------------------------------------------------------ */
/*  Commands                                                           */
/* ------------------------------------------------------------------ */

const cat: BuiltinFn = (args, ctx, stdin) => {
  const { flags, positional } = parseArgs(args, [
    "n",
    "b",
    "s",
    "E",
    "T",
    "A",
    "e",
    "t",
    "v",
  ]);
  const numberAll = flags.has("n") || flags.has("A");
  const numberNonBlank = flags.has("b");
  const squeeze = flags.has("s");
  const showEnds = flags.has("E") || flags.has("A") || flags.has("e");
  const showTabs = flags.has("T") || flags.has("A") || flags.has("t");

  if (positional.length === 0 && stdin !== undefined) {
    return ok(
      formatCat(stdin, numberAll, numberNonBlank, squeeze, showEnds, showTabs),
    );
  }
  if (positional.length === 0) return fail("cat: missing operand\n");

  let out = "";
  for (const file of positional) {
    if (file === "-" && stdin !== undefined) {
      out += formatCat(
        stdin,
        numberAll,
        numberNonBlank,
        squeeze,
        showEnds,
        showTabs,
      );
      continue;
    }
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      out += formatCat(
        content,
        numberAll,
        numberNonBlank,
        squeeze,
        showEnds,
        showTabs,
      );
    } catch {
      return fail(`cat: ${file}: No such file or directory\n`);
    }
  }
  return ok(out);
};

const head: BuiltinFn = (args, ctx, stdin) => {
  let n = 10;
  let byteMode = false;
  let bytes = 0;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && i + 1 < args.length) {
      n = parseInt(args[++i], 10) || 10;
    } else if (args[i] === "-c" && i + 1 < args.length) {
      bytes = parseInt(args[++i], 10) || 0;
      byteMode = true;
    } else if (args[i].startsWith("-") && /^\d+$/.test(args[i].slice(1))) {
      n = parseInt(args[i].slice(1), 10);
    } else if (!args[i].startsWith("-")) {
      files.push(args[i]);
    }
  }

  const doHead = (content: string) => {
    if (byteMode) return content.slice(0, bytes);
    return content.split("\n").slice(0, n).join("\n") + "\n";
  };

  if (files.length === 0 && stdin !== undefined) return ok(doHead(stdin));
  if (files.length === 0) return fail("head: missing operand\n");

  let out = "";
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      if (files.length > 1) out += `==> ${file} <==\n`;
      out += doHead(content);
    } catch {
      return fail(`head: ${file}: No such file or directory\n`);
    }
  }
  return ok(out);
};

const tail: BuiltinFn = (args, ctx, stdin) => {
  let n = 10;
  let byteMode = false;
  let bytes = 0;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && i + 1 < args.length) {
      n = parseInt(args[++i], 10) || 10;
    } else if (args[i] === "-c" && i + 1 < args.length) {
      bytes = parseInt(args[++i], 10) || 0;
      byteMode = true;
    } else if (args[i] === "-f") {
      // -f (follow) can't work in VFS, ignore
    } else if (args[i].startsWith("-") && /^\d+$/.test(args[i].slice(1))) {
      n = parseInt(args[i].slice(1), 10);
    } else if (!args[i].startsWith("-")) {
      files.push(args[i]);
    }
  }

  const doTail = (content: string) => {
    if (byteMode) return content.slice(-bytes);
    const lines = content.split("\n");
    const start = Math.max(
      0,
      lines.length - n - (content.endsWith("\n") ? 1 : 0),
    );
    return lines.slice(start).join("\n");
  };

  if (files.length === 0 && stdin !== undefined) return ok(doTail(stdin));
  if (files.length === 0) return fail("tail: missing operand\n");

  let out = "";
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      if (files.length > 1) out += `==> ${file} <==\n`;
      out += doTail(content);
    } catch {
      return fail(`tail: ${file}: No such file or directory\n`);
    }
  }
  return ok(out);
};

const touch: BuiltinFn = (args, ctx) => {
  if (args.length === 0) return fail("touch: missing operand\n");
  for (const file of args) {
    if (file.startsWith("-")) continue;
    const p = resolvePath(file, ctx.cwd);
    if (!ctx.volume.existsSync(p)) {
      ctx.volume.writeFileSync(p, "");
    }
  }
  return ok();
};

const cpCmd: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["r", "R", "f", "n", "v"]);
  const recursive = flags.has("r") || flags.has("R") || flags.has("recursive");
  const verbose = flags.has("v");

  if (positional.length < 2) return fail("cp: missing operand\n");

  const dest = positional[positional.length - 1];
  const sources = positional.slice(0, -1);
  const dstPath = resolvePath(dest, ctx.cwd);
  let out = "";

  for (const src of sources) {
    const srcPath = resolvePath(src, ctx.cwd);
    try {
      const st = ctx.volume.statSync(srcPath);
      if (st.isDirectory()) {
        if (!recursive)
          return fail(`cp: -r not specified; omitting directory '${src}'\n`);
        copyTree(ctx, srcPath, dstPath);
        if (verbose) out += `'${src}' -> '${dest}'\n`;
      } else {
        let destFinal = dstPath;
        if (ctx.volume.existsSync(dstPath)) {
          try {
            if (ctx.volume.statSync(dstPath).isDirectory()) {
              destFinal = `${dstPath}/${pathModule.basename(srcPath)}`;
            }
          } catch {
            /* */
          }
        }
        ctx.volume.writeFileSync(destFinal, ctx.volume.readFileSync(srcPath));
        if (verbose) out += `'${src}' -> '${dest}'\n`;
      }
    } catch {
      return fail(`cp: cannot stat '${src}': No such file or directory\n`);
    }
  }
  return ok(out);
};

const mv: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["f", "n", "v"]);
  const verbose = flags.has("v");
  if (positional.length < 2) return fail("mv: missing operand\n");

  const dest = positional[positional.length - 1];
  const sources = positional.slice(0, -1);
  const dstPath = resolvePath(dest, ctx.cwd);
  let out = "";

  for (const src of sources) {
    const srcPath = resolvePath(src, ctx.cwd);
    try {
      let destFinal = dstPath;
      if (ctx.volume.existsSync(dstPath)) {
        try {
          if (ctx.volume.statSync(dstPath).isDirectory()) {
            destFinal = `${dstPath}/${pathModule.basename(srcPath)}`;
          }
        } catch {
          /* */
        }
      }
      ctx.volume.renameSync(srcPath, destFinal);
      if (verbose) out += `renamed '${src}' -> '${dest}'\n`;
    } catch {
      return fail(
        `mv: cannot move '${src}' to '${dest}': No such file or directory\n`,
      );
    }
  }
  return ok(out);
};

const rm: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["r", "R", "f", "v"]);
  const recursive = flags.has("r") || flags.has("R") || flags.has("recursive");
  const force = flags.has("f") || flags.has("force");
  const verbose = flags.has("v");

  if (positional.length === 0 && !force) return fail("rm: missing operand\n");

  let out = "";
  for (const target of positional) {
    const p = resolvePath(target, ctx.cwd);
    if (!ctx.volume.existsSync(p)) {
      if (force) continue;
      return fail(`rm: cannot remove '${target}': No such file or directory\n`);
    }
    const st = ctx.volume.statSync(p);
    if (st.isDirectory()) {
      if (!recursive)
        return fail(`rm: cannot remove '${target}': Is a directory\n`);
      removeTree(ctx, p);
      if (verbose) out += `removed directory '${target}'\n`;
    } else {
      ctx.volume.unlinkSync(p);
      if (verbose) out += `removed '${target}'\n`;
    }
  }
  return ok(out);
};

const mkdir_cmd: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["p", "v"]);
  const recursive = flags.has("p");
  const verbose = flags.has("v");

  if (positional.length === 0) return fail("mkdir: missing operand\n");

  let out = "";
  for (const dir of positional) {
    const p = resolvePath(dir, ctx.cwd);
    try {
      ctx.volume.mkdirSync(p, { recursive });
      if (verbose) out += `mkdir: created directory '${dir}'\n`;
    } catch (e) {
      if (!recursive)
        return fail(
          `mkdir: cannot create directory '${dir}': ${e instanceof Error ? e.message : String(e)}\n`,
        );
    }
  }
  return ok(out);
};

const rmdir_cmd: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["p", "v"]);
  const parents = flags.has("p");
  const verbose = flags.has("v");

  if (positional.length === 0) return fail("rmdir: missing operand\n");

  let out = "";
  for (const dir of positional) {
    let p = resolvePath(dir, ctx.cwd);
    try {
      ctx.volume.rmdirSync(p);
      if (verbose) out += `rmdir: removing directory, '${dir}'\n`;
      if (parents) {
        while (p !== "/") {
          p = pathModule.dirname(p);
          if (p === "/") break;
          try {
            ctx.volume.rmdirSync(p);
          } catch {
            break;
          }
        }
      }
    } catch {
      return fail(
        `rmdir: failed to remove '${dir}': Directory not empty or not found\n`,
      );
    }
  }
  return ok(out);
};

const chmod: BuiltinFn = (args, ctx) => {
  if (args.length < 2) return fail("chmod: missing operand\n");
  const modeStr = args[0];
  const files = args.slice(1);
  if (!/^[0-7]{3,4}$/.test(modeStr)) {
    return fail(`chmod: invalid mode: '${modeStr}'\n`);
  }
  const mode = parseInt(modeStr, 8);
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      ctx.volume.chmodSync(p, mode);
    } catch (e: any) {
      return fail(`chmod: ${file}: ${e?.message || "failed"}\n`);
    }
  }
  return ok();
};

const wc: BuiltinFn = (args, ctx, stdin) => {
  const { flags, positional } = parseArgs(args, ["l", "w", "c", "m", "L"]);
  const showLines = flags.has("l");
  const showWords = flags.has("w");
  const showBytes = flags.has("c");
  const showChars = flags.has("m");
  const showMaxLine = flags.has("L");
  const showAll =
    !showLines && !showWords && !showBytes && !showChars && !showMaxLine;

  const doWc = (content: string, label?: string) => {
    const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
    const words = content.split(/\s+/).filter(Boolean).length;
    const bytes = new TextEncoder().encode(content).length;
    const chars = [...content].length;
    const maxLine = content
      .split("\n")
      .reduce((mx, l) => Math.max(mx, l.length), 0);

    const parts: string[] = [];
    if (showAll || showLines) parts.push(String(lines).padStart(7));
    if (showAll || showWords) parts.push(String(words).padStart(7));
    if (showChars) parts.push(String(chars).padStart(7));
    if (showAll || showBytes) parts.push(String(bytes).padStart(7));
    if (showMaxLine) parts.push(String(maxLine).padStart(7));

    const suffix = label ? ` ${label}` : "";
    return parts.join("") + suffix + "\n";
  };

  if (positional.length === 0 && stdin !== undefined) return ok(doWc(stdin));
  if (positional.length === 0) return fail("wc: missing operand\n");

  let out = "";
  let totalLines = 0,
    totalWords = 0,
    totalBytes = 0;
  for (const file of positional) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      out += doWc(content, file);
      totalLines +=
        content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
      totalWords += content.split(/\s+/).filter(Boolean).length;
      totalBytes += new TextEncoder().encode(content).length;
    } catch {
      return fail(`wc: ${file}: No such file or directory\n`);
    }
  }
  if (positional.length > 1) {
    const parts: string[] = [];
    if (showAll || showLines) parts.push(String(totalLines).padStart(7));
    if (showAll || showWords) parts.push(String(totalWords).padStart(7));
    if (showAll || showBytes) parts.push(String(totalBytes).padStart(7));
    out += parts.join("") + " total\n";
  }
  return ok(out);
};

const tee: BuiltinFn = (args, ctx, stdin) => {
  const { flags, positional } = parseArgs(args, ["a"]);
  const append = flags.has("a");
  const content = stdin ?? "";

  for (const file of positional) {
    const p = resolvePath(file, ctx.cwd);
    if (append && ctx.volume.existsSync(p)) {
      const existing = ctx.volume.readFileSync(p, "utf8");
      ctx.volume.writeFileSync(p, existing + content);
    } else {
      ctx.volume.writeFileSync(p, content);
    }
  }
  return ok(content);
};

const readlink_cmd: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["f", "e", "m", "n", "q", "z"]);
  if (positional.length === 0) return fail("readlink: missing operand\n");
  const p = resolvePath(positional[0], ctx.cwd);
  try {
    if (flags.has("f") || flags.has("e") || flags.has("m")) {
      return ok(ctx.volume.realpathSync(p) + "\n");
    }
    return ok(ctx.volume.readlinkSync(p) + "\n");
  } catch (e: any) {
    return fail(`readlink: ${positional[0]}: ${e?.message || "failed"}\n`);
  }
};

const ln_cmd: BuiltinFn = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["s", "f"]);
  if (positional.length < 2) return fail("ln: missing operand\n");
  const src = positional[0];
  const dst = resolvePath(positional[1], ctx.cwd);
  const srcPath = resolvePath(src, ctx.cwd);
  try {
    if (flags.has("f") && ctx.volume.existsSync(dst)) {
      ctx.volume.unlinkSync(dst);
    }
    if (flags.has("s")) {
      // store the original target string (relative targets are valid)
      ctx.volume.symlinkSync(src, dst);
      return ok();
    }
    ctx.volume.linkSync(srcPath, dst);
    return ok();
  } catch (e: any) {
    return fail(
      `ln: cannot create link '${positional[1]}': ${e?.message || "failed"}\n`,
    );
  }
};

const writeFile: BuiltinFn = (args, ctx) => {
  if (args.length < 2) return fail("write: missing arguments\n");
  const path = resolvePath(args[0], ctx.cwd);
  ctx.volume.writeFileSync(path, args.slice(1).join(" "));
  return ok();
};

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

export const fileOpsCommands: [string, BuiltinFn][] = [
  ["cat", cat],
  ["head", head],
  ["tail", tail],
  ["touch", touch],
  ["cp", cpCmd],
  ["mv", mv],
  ["rm", rm],
  ["mkdir", mkdir_cmd],
  ["rmdir", rmdir_cmd],
  ["chmod", chmod],
  ["wc", wc],
  ["tee", tee],
  ["ln", ln_cmd],
  ["readlink", readlink_cmd],
  ["write", writeFile],
];
