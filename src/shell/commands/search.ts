import type { BuiltinFn } from "../shell-types";
import { ok, fail, resolvePath, globToRegex } from "../shell-helpers";
import { LS_BLOCK_SIZE } from "../../constants/config";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

function matchSize(fileSize: number, spec: string): boolean {
  const m = spec.match(/^([+-]?)(\d+)([cwbkMG]?)$/);
  if (!m) return true;
  const op = m[1];
  let n = parseInt(m[2]);
  const unit = m[3];
  if (unit === "c") {
    /* bytes */
  } else if (unit === "w") n *= 2;
  else if (unit === "k") n *= 1024;
  else if (unit === "M") n *= 1048576;
  else if (unit === "G") n *= 1073741824;
  else n *= LS_BLOCK_SIZE;

  if (op === "+") return fileSize > n;
  if (op === "-") return fileSize < n;
  return fileSize === n;
}

function matchMtime(mtimeMs: number, spec: string): boolean {
  const m = spec.match(/^([+-]?)(\d+)$/);
  if (!m) return true;
  const op = m[1];
  const days = parseInt(m[2]);
  const age = (Date.now() - mtimeMs) / 86400000;
  if (op === "+") return age > days;
  if (op === "-") return age < days;
  return Math.floor(age) === days;
}

/* ------------------------------------------------------------------ */
/*  Commands                                                           */
/* ------------------------------------------------------------------ */

const find_cmd: BuiltinFn = async (args, ctx) => {
  let searchDir = ctx.cwd;
  let namePattern = "";
  let inamePattern = "";
  let pathPattern = "";
  let typeFilter = "";
  let maxDepth = Infinity;
  let minDepth = 0;
  let sizeFilter = "";
  let mtimeFilter = "";
  let execCmd = "";
  let execArgs: string[] = [];
  let deleteMode = false;
  let print0 = false;
  let printMode = true;
  let emptyFilter = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-name" && i + 1 < args.length) {
      namePattern = args[++i];
    } else if (a === "-iname" && i + 1 < args.length) {
      inamePattern = args[++i];
    } else if (a === "-path" || (a === "-wholename" && i + 1 < args.length)) {
      pathPattern = args[++i];
    } else if (a === "-type" && i + 1 < args.length) {
      typeFilter = args[++i];
    } else if (a === "-maxdepth" && i + 1 < args.length) {
      maxDepth = parseInt(args[++i]);
    } else if (a === "-mindepth" && i + 1 < args.length) {
      minDepth = parseInt(args[++i]);
    } else if (a === "-size" && i + 1 < args.length) {
      sizeFilter = args[++i];
    } else if (a === "-mtime" && i + 1 < args.length) {
      mtimeFilter = args[++i];
    } else if (a === "-empty") {
      emptyFilter = true;
    } else if (a === "-delete") {
      deleteMode = true;
      printMode = false;
    } else if (a === "-print0") {
      print0 = true;
    } else if (a === "-print") {
      printMode = true;
    } else if (a === "-exec") {
      const cmdParts: string[] = [];
      i++;
      while (i < args.length && args[i] !== ";") {
        cmdParts.push(args[i]);
        i++;
      }
      if (cmdParts.length > 0) {
        execCmd = cmdParts[0];
        execArgs = cmdParts.slice(1);
        printMode = false;
      }
    } else if (!a.startsWith("-")) {
      searchDir = resolvePath(a, ctx.cwd);
    }
  }

  const nameRe = namePattern
    ? new RegExp("^" + globToRegex(namePattern) + "$")
    : null;
  const inameRe = inamePattern
    ? new RegExp("^" + globToRegex(inamePattern) + "$", "i")
    : null;
  const pathRe = pathPattern ? new RegExp(globToRegex(pathPattern)) : null;

  const results: string[] = [];
  let execOut = "";

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    try {
      for (const name of ctx.volume.readdirSync(dir)) {
        const full = dir === "/" ? `/${name}` : `${dir}/${name}`;
        try {
          const st = ctx.volume.statSync(full);
          const isDir = st.isDirectory();
          const isFile = st.isFile();

          if (depth >= minDepth) {
            let match = true;
            if (typeFilter) {
              if (typeFilter === "f" && !isFile) match = false;
              if (typeFilter === "d" && !isDir) match = false;
            }
            if (nameRe && !nameRe.test(name)) match = false;
            if (inameRe && !inameRe.test(name)) match = false;
            if (pathRe && !pathRe.test(full)) match = false;
            if (sizeFilter && isFile) {
              const fileSize = ctx.volume.readFileSync(full).length;
              if (!matchSize(fileSize, sizeFilter)) match = false;
            }
            if (mtimeFilter) {
              const mtime = st.mtimeMs || Date.now();
              if (!matchMtime(mtime, mtimeFilter)) match = false;
            }
            if (emptyFilter) {
              if (isDir) {
                try {
                  if (ctx.volume.readdirSync(full).length > 0) match = false;
                } catch {
                  match = false;
                }
              } else if (isFile) {
                if (ctx.volume.readFileSync(full).length > 0) match = false;
              } else match = false;
            }
            if (match) results.push(full);
          }
          if (isDir) walk(full, depth + 1);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  };

  walk(searchDir, 1);

  if (deleteMode) {
    for (const path of results.reverse()) {
      try {
        const st = ctx.volume.statSync(path);
        if (st.isDirectory()) ctx.volume.rmdirSync(path);
        else ctx.volume.unlinkSync(path);
      } catch {
        /* */
      }
    }
    return ok();
  }

  if (execCmd) {
    for (const path of results) {
      const expandedArgs = execArgs.map((a) => (a === "{}" ? path : a));
      const fullCmd = [execCmd, ...expandedArgs].map(shellQuote).join(" ");
      const result = await ctx.exec(fullCmd, { cwd: ctx.cwd, env: ctx.env });
      execOut += result.stdout;
    }
    return ok(execOut);
  }

  if (print0) return ok(results.join("\0"));
  if (printMode) return ok(results.join("\n") + (results.length ? "\n" : ""));
  return ok();
};

const xargs_cmd: BuiltinFn = async (args, ctx, stdin) => {
  if (!stdin) return ok();

  let maxArgs = Infinity;
  let placeholder = "";
  let nullDelim = false;
  const cmdParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && i + 1 < args.length)
      maxArgs = parseInt(args[++i]) || 1;
    else if (args[i] === "-I" && i + 1 < args.length) placeholder = args[++i];
    else if (args[i] === "-0" || args[i] === "--null") nullDelim = true;
    else if (args[i] === "-t") {
      /* */
    } else cmdParts.push(args[i]);
  }

  if (cmdParts.length === 0) cmdParts.push("echo");

  const delim = nullDelim ? "\0" : /\s+/;
  const items = stdin.trim().split(delim).filter(Boolean);
  const cmd = cmdParts.map(shellQuote).join(" ");
  let out = "";
  let err = "";
  let lastCode = 0;

  if (placeholder) {
    for (const item of items) {
      const expanded = cmdParts
        .map((part) => (part.includes(placeholder) ? part.split(placeholder).join(item) : part))
        .map(shellQuote)
        .join(" ");
      const result = await ctx.exec(expanded, { cwd: ctx.cwd, env: ctx.env });
      out += result.stdout;
      err += result.stderr;
      lastCode = result.exitCode;
    }
  } else if (maxArgs < Infinity) {
    for (let i = 0; i < items.length; i += maxArgs) {
      const batch = items.slice(i, i + maxArgs).map(shellQuote).join(" ");
      const result = await ctx.exec(`${cmd} ${batch}`, {
        cwd: ctx.cwd,
        env: ctx.env,
      });
      out += result.stdout;
      err += result.stderr;
      lastCode = result.exitCode;
    }
  } else {
    const result = await ctx.exec(`${cmd} ${items.map(shellQuote).join(" ")}`, {
      cwd: ctx.cwd,
      env: ctx.env,
    });
    out += result.stdout;
    err += result.stderr;
    lastCode = result.exitCode;
  }

  return { stdout: out, stderr: err, exitCode: lastCode };
};

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

export const searchCommands: [string, BuiltinFn][] = [
  ["find", find_cmd],
  ["xargs", xargs_cmd],
];
