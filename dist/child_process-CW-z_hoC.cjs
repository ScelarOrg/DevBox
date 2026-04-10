'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const index = require('./index-lVFpjksc.cjs');

function expandVariables(raw, env, lastExit) {
  let result = "";
  let i = 0;
  if (raw === "~" || raw.startsWith("~/")) {
    const home = env.HOME || "/home/user";
    return home + raw.slice(1);
  }
  while (i < raw.length) {
    if (raw[i] === "\\") {
      i++;
      if (i < raw.length) result += raw[i++];
      continue;
    }
    if (raw[i] === "$") {
      i++;
      if (i >= raw.length) {
        result += "$";
        break;
      }
      if (raw[i] === "?") {
        result += String(lastExit);
        i++;
        continue;
      }
      if (raw[i] === "$") {
        result += "1";
        i++;
        continue;
      }
      if (raw[i] === "0") {
        result += "nodepod";
        i++;
        continue;
      }
      if (raw[i] === "#") {
        result += "0";
        i++;
        continue;
      }
      if (raw[i] === "{") {
        i++;
        let name2 = "";
        while (i < raw.length && raw[i] !== "}" && raw[i] !== ":" && raw[i] !== "-" && raw[i] !== "=") {
          name2 += raw[i++];
        }
        let defaultVal = "";
        let useDefault = false;
        if (i < raw.length && (raw[i] === ":" || raw[i] === "-")) {
          useDefault = true;
          if (raw[i] === ":") i++;
          if (i < raw.length && (raw[i] === "-" || raw[i] === "=")) i++;
          while (i < raw.length && raw[i] !== "}") {
            defaultVal += raw[i++];
          }
        }
        if (i < raw.length && raw[i] === "}") i++;
        const val = env[name2];
        if (val !== void 0 && val !== "") {
          result += val;
        } else if (useDefault) {
          result += defaultVal;
        }
        continue;
      }
      let name = "";
      while (i < raw.length && /[a-zA-Z0-9_]/.test(raw[i])) {
        name += raw[i++];
      }
      if (name) {
        result += env[name] ?? "";
      } else {
        result += "$";
      }
      continue;
    }
    result += raw[i++];
  }
  return result;
}
function expandGlob(pattern, cwd, volume) {
  if (!pattern.includes("*") && !pattern.includes("?")) return [pattern];
  const lastSlash = pattern.lastIndexOf("/");
  let dir;
  let filePattern;
  if (lastSlash === -1) {
    dir = cwd;
    filePattern = pattern;
  } else {
    dir = pattern.slice(0, lastSlash) || "/";
    if (!dir.startsWith("/")) dir = `${cwd}/${dir}`.replace(/\/+/g, "/");
    filePattern = pattern.slice(lastSlash + 1);
  }
  try {
    const entries = volume.readdirSync(dir);
    const regex = globToRegex$1(filePattern);
    const matches = entries.filter((e) => regex.test(e));
    if (matches.length === 0) return [pattern];
    return matches.sort().map(
      (m) => lastSlash === -1 ? m : `${dir}/${m}`.replace(/\/+/g, "/")
    );
  } catch {
    return [pattern];
  }
}
function globToRegex$1(pattern) {
  let regex = "^";
  for (const ch of pattern) {
    if (ch === "*") regex += ".*";
    else if (ch === "?") regex += ".";
    else if (".+^${}()|[]\\".includes(ch)) regex += "\\" + ch;
    else regex += ch;
  }
  regex += "$";
  return new RegExp(regex);
}
function tokenize(input, env, lastExit) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === " " || input[i] === "	") {
      i++;
      continue;
    }
    if (input[i] === "\n") {
      tokens.push({ type: "newline", value: "\n" });
      i++;
      continue;
    }
    if (input[i] === "#") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (input.slice(i, i + 4) === "2>&1") {
      tokens.push({ type: "redirect-2to1", value: "2>&1" });
      i += 4;
      continue;
    }
    if (input[i] === ">" && input[i + 1] === ">") {
      tokens.push({ type: "redirect-app", value: ">>" });
      i += 2;
      continue;
    }
    if (input[i] === ">") {
      tokens.push({ type: "redirect-out", value: ">" });
      i++;
      continue;
    }
    if (input[i] === "<") {
      tokens.push({ type: "redirect-in", value: "<" });
      i++;
      continue;
    }
    if (input[i] === "&" && input[i + 1] === "&") {
      tokens.push({ type: "and", value: "&&" });
      i += 2;
      continue;
    }
    if (input[i] === "|" && input[i + 1] === "|") {
      tokens.push({ type: "or", value: "||" });
      i += 2;
      continue;
    }
    if (input[i] === "|") {
      tokens.push({ type: "pipe", value: "|" });
      i++;
      continue;
    }
    if (input[i] === ";") {
      tokens.push({ type: "semi", value: ";" });
      i++;
      continue;
    }
    let word = "";
    while (i < input.length) {
      const ch = input[i];
      if (ch === " " || ch === "	" || ch === "\n") break;
      if (ch === "|" || ch === "&" || ch === ";" || ch === ">" || ch === "<") break;
      if (ch === "2" && input.slice(i, i + 4) === "2>&1") break;
      if (ch === "\\") {
        i++;
        if (i < input.length) word += input[i++];
        continue;
      }
      if (ch === "'") {
        i++;
        while (i < input.length && input[i] !== "'") {
          word += input[i++];
        }
        if (i < input.length) i++;
        continue;
      }
      if (ch === '"') {
        i++;
        let dqContent = "";
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < input.length) {
            const next = input[i + 1];
            if (next === '"' || next === "\\" || next === "$" || next === "`") {
              dqContent += next;
              i += 2;
              continue;
            }
          }
          dqContent += input[i++];
        }
        if (i < input.length) i++;
        word += expandVariables(dqContent, env, lastExit);
        continue;
      }
      word += ch;
      i++;
    }
    if (word.length > 0) {
      const expanded = expandVariables(word, env, lastExit);
      tokens.push({ type: "word", value: expanded });
    }
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}
class Parser {
  tokens;
  pos = 0;
  constructor(tokens) {
    this.tokens = tokens;
  }
  peek() {
    return this.tokens[this.pos] ?? { type: "eof", value: "" };
  }
  advance() {
    return this.tokens[this.pos++] ?? { type: "eof", value: "" };
  }
  skipNewlines() {
    while (this.peek().type === "newline") this.advance();
  }
  parseList() {
    this.skipNewlines();
    const entries = [];
    while (this.peek().type !== "eof") {
      this.skipNewlines();
      if (this.peek().type === "eof") break;
      const pipeline = this.parsePipeline();
      const op = this.peek();
      if (op.type === "and" || op.type === "or" || op.type === "semi") {
        this.advance();
        const operator = op.type === "and" ? "&&" : op.type === "or" ? "||" : ";";
        entries.push({ pipeline, next: operator });
      } else {
        entries.push({ pipeline });
        break;
      }
    }
    return { kind: "list", entries };
  }
  parsePipeline() {
    const commands = [];
    commands.push(this.parseCommand());
    while (this.peek().type === "pipe") {
      this.advance();
      commands.push(this.parseCommand());
    }
    return { kind: "pipeline", commands };
  }
  parseCommand() {
    const args = [];
    const redirects = [];
    const assignments = {};
    while (this.peek().type === "word") {
      const val = this.peek().value;
      const eqIdx = val.indexOf("=");
      if (eqIdx > 0 && args.length === 0 && /^[a-zA-Z_]/.test(val)) {
        this.advance();
        assignments[val.slice(0, eqIdx)] = val.slice(eqIdx + 1);
      } else {
        break;
      }
    }
    while (true) {
      const tok = this.peek();
      if (tok.type === "word") {
        this.advance();
        args.push(tok.value);
        continue;
      }
      if (tok.type === "redirect-out" || tok.type === "redirect-app" || tok.type === "redirect-in") {
        this.advance();
        const target = this.peek();
        if (target.type === "word") {
          this.advance();
          const rtype = tok.type === "redirect-out" ? "write" : tok.type === "redirect-app" ? "append" : "read";
          redirects.push({ type: rtype, target: target.value });
        }
        continue;
      }
      if (tok.type === "redirect-2to1") {
        this.advance();
        redirects.push({ type: "stderr-to-stdout", target: "" });
        continue;
      }
      break;
    }
    return { kind: "command", args, redirects, assignments };
  }
}
function parse(input, env, lastExit = 0) {
  const tokens = tokenize(input, env, lastExit);
  const parser = new Parser(tokens);
  return parser.parseList();
}

const RESET = "\x1B[0m";
const DIM = "\x1B[2m";
const GREEN = "\x1B[32m";
const MAGENTA = "\x1B[35m";
const CYAN = "\x1B[36m";
const BOLD_BLUE = "\x1B[1;34m";
const BOLD_RED = "\x1B[1;31m";
const ok = (stdout = "") => ({
  stdout,
  stderr: "",
  exitCode: 0
});
const fail = (stderr, code = 1) => ({
  stdout: "",
  stderr,
  exitCode: code
});
const EXIT_OK = { stdout: "", stderr: "", exitCode: 0 };
const EXIT_FAIL = { stdout: "", stderr: "", exitCode: 1 };
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
const DAYS_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat"
];
const DAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
function resolvePath(p, cwd) {
  if (p.startsWith("/")) return index.normalize(p);
  return index.normalize(`${cwd}/${p}`);
}
function parseArgs(args, knownFlags, knownOpts = []) {
  const flags = /* @__PURE__ */ new Set();
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        opts[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        flags.add(a.slice(2));
      }
    } else if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (knownOpts.includes(ch) && j + 1 < a.length) {
          opts[ch] = a.slice(j + 1);
          break;
        } else if (knownOpts.includes(ch) && i + 1 < args.length) {
          opts[ch] = args[++i];
          break;
        } else if (knownFlags.includes(ch)) {
          flags.add(ch);
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, opts, positional };
}
function expandCharClass(s) {
  return s.replace(/\[:upper:\]/g, "ABCDEFGHIJKLMNOPQRSTUVWXYZ").replace(/\[:lower:\]/g, "abcdefghijklmnopqrstuvwxyz").replace(
    /\[:alpha:\]/g,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  ).replace(/\[:digit:\]/g, "0123456789").replace(
    /\[:alnum:\]/g,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  ).replace(/\[:space:\]/g, " 	\n\r\v\f").replace(/\[:blank:\]/g, " 	").replace(/\[:punct:\]/g, "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~").replace(
    /\[:print:\]/g,
    (() => {
      let r = "";
      for (let i = 32; i < 127; i++) r += String.fromCharCode(i);
      return r;
    })()
  ).replace(
    /\[:graph:\]/g,
    (() => {
      let r = "";
      for (let i = 33; i < 127; i++) r += String.fromCharCode(i);
      return r;
    })()
  ).replace(
    /\[:cntrl:\]/g,
    (() => {
      let r = "";
      for (let i = 0; i < 32; i++) r += String.fromCharCode(i);
      r += String.fromCharCode(127);
      return r;
    })()
  );
}
function processEscapes(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const c = s[i + 1];
      if (c === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (c === "t") {
        out += "	";
        i++;
        continue;
      }
      if (c === "r") {
        out += "\r";
        i++;
        continue;
      }
      if (c === "a") {
        out += "\x07";
        i++;
        continue;
      }
      if (c === "b") {
        out += "\b";
        i++;
        continue;
      }
      if (c === "f") {
        out += "\f";
        i++;
        continue;
      }
      if (c === "v") {
        out += "\v";
        i++;
        continue;
      }
      if (c === "\\") {
        out += "\\";
        i++;
        continue;
      }
      if (c === "0") {
        let oct = "";
        let j = i + 2;
        while (j < s.length && j < i + 5 && s[j] >= "0" && s[j] <= "7")
          oct += s[j++];
        out += String.fromCharCode(parseInt(oct || "0", 8));
        i = j - 1;
        continue;
      }
      if (c === "x") {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{1,2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 1 + hex.length;
          continue;
        }
      }
      out += s[i];
    } else {
      out += s[i];
    }
  }
  return out;
}
function humanSize(bytes) {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let size = bytes;
  for (const u of units) {
    size /= 1024;
    if (size < 1024 || u === "T") return size.toFixed(size < 10 ? 1 : 0) + u;
  }
  return String(bytes);
}
function globToRegex(pattern) {
  return pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
}

function formatCat(content, numberAll, numberNonBlank, squeeze, showEnds, showTabs) {
  let lines = content.split("\n");
  if (squeeze) {
    const squeezed = [];
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
      if (line.length > 0) l = `${String(lineNum++).padStart(6)}	${l}`;
    } else if (numberAll) {
      l = `${String(lineNum++).padStart(6)}	${l}`;
    }
    return l;
  });
  return result.join("\n");
}
function copyTree(ctx, src, dst) {
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
function removeTree(ctx, dir) {
  for (const name of ctx.volume.readdirSync(dir)) {
    const full = `${dir}/${name}`;
    const st = ctx.volume.statSync(full);
    if (st.isDirectory()) removeTree(ctx, full);
    else ctx.volume.unlinkSync(full);
  }
  ctx.volume.rmdirSync(dir);
}
const cat = (args, ctx, stdin) => {
  const { flags, positional } = parseArgs(args, [
    "n",
    "b",
    "s",
    "E",
    "T",
    "A",
    "e",
    "t",
    "v"
  ]);
  const numberAll = flags.has("n") || flags.has("A");
  const numberNonBlank = flags.has("b");
  const squeeze = flags.has("s");
  const showEnds = flags.has("E") || flags.has("A") || flags.has("e");
  const showTabs = flags.has("T") || flags.has("A") || flags.has("t");
  if (positional.length === 0 && stdin !== void 0) {
    return ok(
      formatCat(stdin, numberAll, numberNonBlank, squeeze, showEnds, showTabs)
    );
  }
  if (positional.length === 0) return fail("cat: missing operand\n");
  let out = "";
  for (const file of positional) {
    if (file === "-" && stdin !== void 0) {
      out += formatCat(
        stdin,
        numberAll,
        numberNonBlank,
        squeeze,
        showEnds,
        showTabs
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
        showTabs
      );
    } catch {
      return fail(`cat: ${file}: No such file or directory
`);
    }
  }
  return ok(out);
};
const head = (args, ctx, stdin) => {
  let n = 10;
  let byteMode = false;
  let bytes = 0;
  const files = [];
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
  const doHead = (content) => {
    if (byteMode) return content.slice(0, bytes);
    return content.split("\n").slice(0, n).join("\n") + "\n";
  };
  if (files.length === 0 && stdin !== void 0) return ok(doHead(stdin));
  if (files.length === 0) return fail("head: missing operand\n");
  let out = "";
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      if (files.length > 1) out += `==> ${file} <==
`;
      out += doHead(content);
    } catch {
      return fail(`head: ${file}: No such file or directory
`);
    }
  }
  return ok(out);
};
const tail = (args, ctx, stdin) => {
  let n = 10;
  let byteMode = false;
  let bytes = 0;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && i + 1 < args.length) {
      n = parseInt(args[++i], 10) || 10;
    } else if (args[i] === "-c" && i + 1 < args.length) {
      bytes = parseInt(args[++i], 10) || 0;
      byteMode = true;
    } else if (args[i] === "-f") ; else if (args[i].startsWith("-") && /^\d+$/.test(args[i].slice(1))) {
      n = parseInt(args[i].slice(1), 10);
    } else if (!args[i].startsWith("-")) {
      files.push(args[i]);
    }
  }
  const doTail = (content) => {
    if (byteMode) return content.slice(-bytes);
    const lines = content.split("\n");
    const start = Math.max(
      0,
      lines.length - n - (content.endsWith("\n") ? 1 : 0)
    );
    return lines.slice(start).join("\n");
  };
  if (files.length === 0 && stdin !== void 0) return ok(doTail(stdin));
  if (files.length === 0) return fail("tail: missing operand\n");
  let out = "";
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      if (files.length > 1) out += `==> ${file} <==
`;
      out += doTail(content);
    } catch {
      return fail(`tail: ${file}: No such file or directory
`);
    }
  }
  return ok(out);
};
const touch = (args, ctx) => {
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
const cpCmd = (args, ctx) => {
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
          return fail(`cp: -r not specified; omitting directory '${src}'
`);
        copyTree(ctx, srcPath, dstPath);
        if (verbose) out += `'${src}' -> '${dest}'
`;
      } else {
        let destFinal = dstPath;
        if (ctx.volume.existsSync(dstPath)) {
          try {
            if (ctx.volume.statSync(dstPath).isDirectory()) {
              destFinal = `${dstPath}/${index.basename(srcPath)}`;
            }
          } catch {
          }
        }
        ctx.volume.writeFileSync(destFinal, ctx.volume.readFileSync(srcPath));
        if (verbose) out += `'${src}' -> '${dest}'
`;
      }
    } catch {
      return fail(`cp: cannot stat '${src}': No such file or directory
`);
    }
  }
  return ok(out);
};
const mv = (args, ctx) => {
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
            destFinal = `${dstPath}/${index.basename(srcPath)}`;
          }
        } catch {
        }
      }
      ctx.volume.renameSync(srcPath, destFinal);
      if (verbose) out += `renamed '${src}' -> '${dest}'
`;
    } catch {
      return fail(
        `mv: cannot move '${src}' to '${dest}': No such file or directory
`
      );
    }
  }
  return ok(out);
};
const rm = (args, ctx) => {
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
      return fail(`rm: cannot remove '${target}': No such file or directory
`);
    }
    const st = ctx.volume.statSync(p);
    if (st.isDirectory()) {
      if (!recursive)
        return fail(`rm: cannot remove '${target}': Is a directory
`);
      removeTree(ctx, p);
      if (verbose) out += `removed directory '${target}'
`;
    } else {
      ctx.volume.unlinkSync(p);
      if (verbose) out += `removed '${target}'
`;
    }
  }
  return ok(out);
};
const mkdir_cmd = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["p", "v"]);
  const recursive = flags.has("p");
  const verbose = flags.has("v");
  if (positional.length === 0) return fail("mkdir: missing operand\n");
  let out = "";
  for (const dir of positional) {
    const p = resolvePath(dir, ctx.cwd);
    try {
      ctx.volume.mkdirSync(p, { recursive });
      if (verbose) out += `mkdir: created directory '${dir}'
`;
    } catch (e) {
      if (!recursive)
        return fail(
          `mkdir: cannot create directory '${dir}': ${e instanceof Error ? e.message : String(e)}
`
        );
    }
  }
  return ok(out);
};
const rmdir_cmd = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["p", "v"]);
  const parents = flags.has("p");
  const verbose = flags.has("v");
  if (positional.length === 0) return fail("rmdir: missing operand\n");
  let out = "";
  for (const dir of positional) {
    let p = resolvePath(dir, ctx.cwd);
    try {
      ctx.volume.rmdirSync(p);
      if (verbose) out += `rmdir: removing directory, '${dir}'
`;
      if (parents) {
        while (p !== "/") {
          p = index.dirname(p);
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
        `rmdir: failed to remove '${dir}': Directory not empty or not found
`
      );
    }
  }
  return ok(out);
};
const chmod = (args, _ctx) => {
  if (args.length < 2) return fail("chmod: missing operand\n");
  return ok();
};
const wc = (args, ctx, stdin) => {
  const { flags, positional } = parseArgs(args, ["l", "w", "c", "m", "L"]);
  const showLines = flags.has("l");
  const showWords = flags.has("w");
  const showBytes = flags.has("c");
  const showChars = flags.has("m");
  const showMaxLine = flags.has("L");
  const showAll = !showLines && !showWords && !showBytes && !showChars && !showMaxLine;
  const doWc = (content, label) => {
    const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
    const words = content.split(/\s+/).filter(Boolean).length;
    const bytes = new TextEncoder().encode(content).length;
    const chars = [...content].length;
    const maxLine = content.split("\n").reduce((mx, l) => Math.max(mx, l.length), 0);
    const parts = [];
    if (showAll || showLines) parts.push(String(lines).padStart(7));
    if (showAll || showWords) parts.push(String(words).padStart(7));
    if (showChars) parts.push(String(chars).padStart(7));
    if (showAll || showBytes) parts.push(String(bytes).padStart(7));
    if (showMaxLine) parts.push(String(maxLine).padStart(7));
    const suffix = label ? ` ${label}` : "";
    return parts.join("") + suffix + "\n";
  };
  if (positional.length === 0 && stdin !== void 0) return ok(doWc(stdin));
  if (positional.length === 0) return fail("wc: missing operand\n");
  let out = "";
  let totalLines = 0, totalWords = 0, totalBytes = 0;
  for (const file of positional) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      out += doWc(content, file);
      totalLines += content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
      totalWords += content.split(/\s+/).filter(Boolean).length;
      totalBytes += new TextEncoder().encode(content).length;
    } catch {
      return fail(`wc: ${file}: No such file or directory
`);
    }
  }
  if (positional.length > 1) {
    const parts = [];
    if (showAll || showLines) parts.push(String(totalLines).padStart(7));
    if (showAll || showWords) parts.push(String(totalWords).padStart(7));
    if (showAll || showBytes) parts.push(String(totalBytes).padStart(7));
    out += parts.join("") + " total\n";
  }
  return ok(out);
};
const tee = (args, ctx, stdin) => {
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
const readlink_cmd = (args, ctx) => {
  const { positional } = parseArgs(args, ["f", "e", "m", "n", "q", "z"]);
  if (positional.length === 0) return fail("readlink: missing operand\n");
  const p = resolvePath(positional[0], ctx.cwd);
  return ok(p + "\n");
};
const ln_cmd = (args, ctx) => {
  const { positional } = parseArgs(args, ["s", "f"]);
  if (positional.length < 2) return fail("ln: missing operand\n");
  const src = resolvePath(positional[0], ctx.cwd);
  const dst = resolvePath(positional[1], ctx.cwd);
  try {
    const content = ctx.volume.readFileSync(src);
    ctx.volume.writeFileSync(dst, content);
    return ok();
  } catch {
    return fail(
      `ln: cannot create link '${positional[1]}': source not found
`
    );
  }
};
const writeFile = (args, ctx) => {
  if (args.length < 2) return fail("write: missing arguments\n");
  const path = resolvePath(args[0], ctx.cwd);
  ctx.volume.writeFileSync(path, args.slice(1).join(" "));
  return ok();
};
const fileOpsCommands = [
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
  ["write", writeFile]
];

function colorName(name, isDir) {
  if (isDir) return `${BOLD_BLUE}${name}${RESET}`;
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  if (ext === ".sh" || ext === ".bin") return `${GREEN}${name}${RESET}`;
  return name;
}
function lsDate(d) {
  const mon = MONTHS_SHORT[d.getMonth()];
  const day = String(d.getDate()).padStart(2, " ");
  const now = /* @__PURE__ */ new Date();
  const sixMonthsAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 6,
    now.getDate()
  );
  if (d < sixMonthsAgo || d > now) {
    return `${mon} ${day}  ${d.getFullYear()}`;
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mon} ${day} ${hh}:${mm}`;
}
function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}
const ls = (args, ctx) => {
  const { flags, positional } = parseArgs(args, [
    "l",
    "a",
    "A",
    "R",
    "1",
    "h",
    "S",
    "t",
    "r",
    "F",
    "d",
    "i"
  ]);
  const showAll = flags.has("a");
  const showAlmostAll = flags.has("A");
  const longForm = flags.has("l");
  const recursive = flags.has("R");
  const onePerLine = flags.has("1") || longForm;
  const humanReadable = flags.has("h");
  const sortBySize = flags.has("S");
  const sortByTime = flags.has("t");
  const reverseSort = flags.has("r");
  const classify = flags.has("F");
  const dirOnly = flags.has("d");
  const showInode = flags.has("i");
  const dir = positional.length > 0 ? resolvePath(positional[0], ctx.cwd) : ctx.cwd;
  const lsDir = (d, prefix) => {
    if (dirOnly) {
      const name = positional[0] || d;
      if (longForm) {
        const st = ctx.volume.statSync(d);
        const isDir = st.isDirectory();
        const mode = isDir ? `${CYAN}drwxr-xr-x${RESET}` : `${DIM}-rw-r--r--${RESET}`;
        return `${mode} 1 user user ${String(0).padStart(6)} ${lsDate(new Date(st.mtimeMs || Date.now()))} ${colorName(name, isDir)}
`;
      }
      return colorName(name, true) + "\n";
    }
    let entries;
    try {
      entries = ctx.volume.readdirSync(d);
    } catch {
      return `ls: cannot access '${d}': No such file or directory
`;
    }
    if (showAll) ; else if (showAlmostAll)
      entries = entries.filter((e) => e !== "." && e !== "..");
    else entries = entries.filter((e) => !e.startsWith("."));
    const infos = entries.map((name) => {
      const full = d === "/" ? `/${name}` : `${d}/${name}`;
      try {
        const st = ctx.volume.statSync(full);
        const isDir = st.isDirectory();
        let size = 0;
        if (!isDir) {
          try {
            size = ctx.volume.readFileSync(full).length;
          } catch {
          }
        }
        return { name, isDir, size, mtime: st.mtimeMs || 0 };
      } catch {
        return { name, isDir: false, size: 0, mtime: 0 };
      }
    });
    if (sortBySize) infos.sort((a, b) => b.size - a.size);
    else if (sortByTime) infos.sort((a, b) => b.mtime - a.mtime);
    else infos.sort((a, b) => a.name.localeCompare(b.name));
    if (reverseSort) infos.reverse();
    let out = prefix ? `${BOLD_BLUE}${prefix}${RESET}:
` : "";
    if (longForm) {
      const totalBlocks = infos.reduce(
        (s, e) => s + Math.ceil(e.size / index.LS_BLOCK_SIZE),
        0
      );
      out += `total ${totalBlocks}
`;
      for (const info of infos) {
        const mode = info.isDir ? `${CYAN}drwxr-xr-x${RESET}` : `${DIM}-rw-r--r--${RESET}`;
        const sizeStr = humanReadable ? humanSize(info.size).padStart(5) : String(info.size).padStart(6);
        const date = lsDate(new Date(info.mtime || Date.now()));
        const colored = colorName(info.name, info.isDir);
        const suffix = classify ? info.isDir ? "/" : "" : info.isDir ? "/" : "";
        const inode = showInode ? `${String(Math.abs(hashCode(d + "/" + info.name))).padStart(7)} ` : "";
        out += `${inode}${mode} 1 user user ${sizeStr} ${date} ${colored}${suffix}
`;
      }
    } else if (onePerLine) {
      for (const info of infos) {
        const inode = showInode ? `${String(Math.abs(hashCode(d + "/" + info.name))).padStart(7)} ` : "";
        const suffix = classify ? info.isDir ? "/" : "" : "";
        out += `${inode}${colorName(info.name, info.isDir)}${suffix}
`;
      }
    } else {
      const colored = infos.map((info) => {
        const suffix = classify ? info.isDir ? "/" : "" : "";
        return colorName(info.name, info.isDir) + suffix;
      });
      out += colored.join("  ") + "\n";
    }
    if (recursive) {
      for (const info of infos) {
        if (info.isDir) {
          const full = d === "/" ? `/${info.name}` : `${d}/${info.name}`;
          out += "\n" + lsDir(full, full);
        }
      }
    }
    return out;
  };
  try {
    const st = ctx.volume.statSync(dir);
    if (st.isFile() && !dirOnly) {
      if (longForm) {
        let size = 0;
        try {
          size = ctx.volume.readFileSync(dir).length;
        } catch {
        }
        const sizeStr = humanReadable ? humanSize(size).padStart(5) : String(size).padStart(6);
        const date = lsDate(new Date(st.mtimeMs || Date.now()));
        return ok(
          `${DIM}-rw-r--r--${RESET} 1 user user ${sizeStr} ${date} ${positional[0]}
`
        );
      }
      return ok(positional[0] + "\n");
    }
  } catch {
    return fail(
      `ls: cannot access '${positional[0] || dir}': No such file or directory
`
    );
  }
  return ok(lsDir(dir, positional.length > 1 ? dir : ""));
};
const cd = (args, ctx) => {
  const target = args[0] || ctx.env.HOME || "/";
  let newDir;
  if (target === "-") {
    newDir = ctx.env.OLDPWD || ctx.cwd;
  } else {
    newDir = resolvePath(target, ctx.cwd);
  }
  try {
    const st = ctx.volume.statSync(newDir);
    if (!st.isDirectory()) return fail(`cd: not a directory: ${target}
`);
    ctx.env.OLDPWD = ctx.cwd;
    ctx.cwd = newDir;
    ctx.env.PWD = newDir;
    try {
      globalThis.process?.chdir?.(newDir);
    } catch {
    }
    return ok();
  } catch {
    return fail(`cd: no such file or directory: ${target}
`);
  }
};
const pwd = (_args, ctx) => {
  return ok(ctx.cwd + "\n");
};
const basename_cmd = (args) => {
  const { positional } = parseArgs(args, ["a", "z"], ["s"]);
  if (positional.length === 0) return fail("basename: missing operand\n");
  const suffix = positional[1] || "";
  let result = index.basename(positional[0]);
  if (suffix && result.endsWith(suffix)) {
    result = result.slice(0, -suffix.length);
  }
  return ok(result + "\n");
};
const dirname_cmd = (args) => {
  if (args.length === 0) return fail("dirname: missing operand\n");
  return ok(index.dirname(args[0]) + "\n");
};
const realpath_cmd = (args, ctx) => {
  if (args.length === 0) return fail("realpath: missing operand\n");
  const p = resolvePath(args[0], ctx.cwd);
  if (!ctx.volume.existsSync(p))
    return fail(`realpath: ${args[0]}: No such file or directory
`);
  return ok(p + "\n");
};
const directoryCommands = [
  ["ls", ls],
  ["cd", cd],
  ["pwd", pwd],
  ["basename", basename_cmd],
  ["dirname", dirname_cmd],
  ["realpath", realpath_cmd]
];

const echo = (args) => {
  let noNewline = false;
  let enableEscapes = false;
  let start = 0;
  while (start < args.length) {
    const a = args[start];
    if (a === "-n") {
      noNewline = true;
      start++;
    } else if (a === "-e") {
      enableEscapes = true;
      start++;
    } else if (a === "-E") {
      enableEscapes = false;
      start++;
    } else if (a === "-ne" || a === "-en") {
      noNewline = true;
      enableEscapes = true;
      start++;
    } else if (a === "-nE" || a === "-En") {
      noNewline = true;
      start++;
    } else break;
  }
  let output = args.slice(start).join(" ");
  if (enableEscapes) output = processEscapes(output);
  return ok(output + (noNewline ? "" : "\n"));
};
const printf_cmd = (args) => {
  if (args.length === 0) return ok();
  const fmt = args[0];
  const vals = args.slice(1);
  let out = "";
  let vi = 0;
  let i = 0;
  while (i < fmt.length) {
    if (fmt[i] === "\\" && i + 1 < fmt.length) {
      const c = fmt[i + 1];
      if (c === "n") {
        out += "\n";
        i += 2;
        continue;
      }
      if (c === "t") {
        out += "	";
        i += 2;
        continue;
      }
      if (c === "r") {
        out += "\r";
        i += 2;
        continue;
      }
      if (c === "a") {
        out += "\x07";
        i += 2;
        continue;
      }
      if (c === "b") {
        out += "\b";
        i += 2;
        continue;
      }
      if (c === "f") {
        out += "\f";
        i += 2;
        continue;
      }
      if (c === "v") {
        out += "\v";
        i += 2;
        continue;
      }
      if (c === "\\") {
        out += "\\";
        i += 2;
        continue;
      }
      if (c === "0") {
        let oct = "";
        let j = i + 2;
        while (j < fmt.length && j < i + 5 && fmt[j] >= "0" && fmt[j] <= "7")
          oct += fmt[j++];
        out += String.fromCharCode(parseInt(oct || "0", 8));
        i = j;
        continue;
      }
      if (c === "x") {
        const hex = fmt.slice(i + 2, i + 4).match(/^[0-9a-fA-F]+/)?.[0] ?? "";
        if (hex) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2 + hex.length;
          continue;
        }
      }
      out += fmt[i];
      i++;
      continue;
    }
    if (fmt[i] === "%" && i + 1 < fmt.length) {
      i++;
      let fmtFlags = "";
      while ("-+ 0#".includes(fmt[i])) fmtFlags += fmt[i++];
      let width = "";
      if (fmt[i] === "*") {
        width = vals[vi++] ?? "0";
        i++;
      } else {
        while (fmt[i] >= "0" && fmt[i] <= "9") width += fmt[i++];
      }
      let prec = "";
      if (fmt[i] === ".") {
        i++;
        if (fmt[i] === "*") {
          prec = vals[vi++] ?? "0";
          i++;
        } else {
          while (fmt[i] >= "0" && fmt[i] <= "9") prec += fmt[i++];
        }
      }
      const spec = fmt[i++];
      const val = vals[vi++] ?? "";
      if (spec === "%") {
        out += "%";
        vi--;
        continue;
      }
      if (spec === "s") {
        let s = val;
        if (prec) s = s.slice(0, parseInt(prec));
        const w = parseInt(width) || 0;
        if (fmtFlags.includes("-")) out += s.padEnd(w);
        else out += s.padStart(w);
        continue;
      }
      if (spec === "d" || spec === "i") {
        const n = parseInt(val) || 0;
        let s = (fmtFlags.includes("+") && n >= 0 ? "+" : "") + String(n);
        if (fmtFlags.includes(" ") && n >= 0 && !fmtFlags.includes("+")) s = " " + s;
        const w = parseInt(width) || 0;
        const pad = fmtFlags.includes("0") && !fmtFlags.includes("-") ? "0" : " ";
        if (fmtFlags.includes("-")) out += s.padEnd(w);
        else if (pad === "0" && s[0] === "-") out += "-" + s.slice(1).padStart(w - 1, "0");
        else out += s.padStart(w, pad);
        continue;
      }
      if (spec === "f") {
        const n = parseFloat(val) || 0;
        const p = prec !== "" ? parseInt(prec) : 6;
        let s = n.toFixed(p);
        if (fmtFlags.includes("+") && n >= 0) s = "+" + s;
        const w = parseInt(width) || 0;
        if (fmtFlags.includes("-")) out += s.padEnd(w);
        else out += s.padStart(w, fmtFlags.includes("0") ? "0" : " ");
        continue;
      }
      if (spec === "x") {
        const n = (parseInt(val) || 0) >>> 0;
        let s = n.toString(16);
        if (fmtFlags.includes("#") && n !== 0) s = "0x" + s;
        out += s.padStart(parseInt(width) || 0, fmtFlags.includes("0") ? "0" : " ");
        continue;
      }
      if (spec === "X") {
        const n = (parseInt(val) || 0) >>> 0;
        let s = n.toString(16).toUpperCase();
        if (fmtFlags.includes("#") && n !== 0) s = "0X" + s;
        out += s.padStart(parseInt(width) || 0, fmtFlags.includes("0") ? "0" : " ");
        continue;
      }
      if (spec === "o") {
        const n = (parseInt(val) || 0) >>> 0;
        let s = n.toString(8);
        if (fmtFlags.includes("#") && n !== 0) s = "0" + s;
        out += s.padStart(parseInt(width) || 0, fmtFlags.includes("0") ? "0" : " ");
        continue;
      }
      if (spec === "e" || spec === "E") {
        const n = parseFloat(val) || 0;
        const p = prec !== "" ? parseInt(prec) : 6;
        let s = spec === "E" ? n.toExponential(p).toUpperCase() : n.toExponential(p);
        if (fmtFlags.includes("+") && n >= 0) s = "+" + s;
        out += s.padStart(parseInt(width) || 0);
        continue;
      }
      if (spec === "g" || spec === "G") {
        const n = parseFloat(val) || 0;
        const p = prec !== "" ? parseInt(prec) : 6;
        let s = spec === "G" ? n.toPrecision(p).toUpperCase() : n.toPrecision(p);
        if (fmtFlags.includes("+") && n >= 0) s = "+" + s;
        out += s.padStart(parseInt(width) || 0);
        continue;
      }
      if (spec === "c") {
        out += val ? val[0] : "";
        continue;
      }
      out += "%" + spec;
      vi--;
      continue;
    }
    out += fmt[i++];
  }
  return ok(out);
};
function grepLines(content, opts, label) {
  const {
    regex,
    highlightRe,
    patternStr,
    ignoreCase,
    invert,
    countOnly,
    filesOnly,
    lineNumbers,
    onlyMatching,
    quiet,
    beforeCtx,
    afterCtx,
    maxCount
  } = opts;
  const lines = content.split("\n");
  const matchedIndices = /* @__PURE__ */ new Set();
  let matchCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i]) !== invert) {
      matchedIndices.add(i);
      matchCount++;
      if (matchCount >= maxCount) break;
    }
  }
  if (countOnly) {
    return (label ? `${MAGENTA}${label}${RESET}${CYAN}:${RESET}` : "") + matchedIndices.size + "\n";
  }
  if (filesOnly && matchedIndices.size > 0) {
    return `${MAGENTA}${label ?? ""}${RESET}
`;
  }
  if (quiet) return matchedIndices.size > 0 ? "\0" : "";
  const showLines = /* @__PURE__ */ new Set();
  for (const idx of matchedIndices) {
    for (let j = Math.max(0, idx - beforeCtx); j <= Math.min(lines.length - 1, idx + afterCtx); j++) {
      showLines.add(j);
    }
  }
  let out = "";
  let prevShown = -2;
  for (let i = 0; i < lines.length; i++) {
    if (!showLines.has(i)) continue;
    if (prevShown >= 0 && i > prevShown + 1 && (beforeCtx > 0 || afterCtx > 0)) {
      out += "--\n";
    }
    prevShown = i;
    const isMatch = matchedIndices.has(i);
    const sep = isMatch ? `${CYAN}:${RESET}` : `${CYAN}-${RESET}`;
    const prefix = label ? `${MAGENTA}${label}${RESET}${sep}` : "";
    const num = lineNumbers ? `${GREEN}${i + 1}${RESET}${sep}` : "";
    if (onlyMatching && isMatch && !invert) {
      const gRe = new RegExp(patternStr, ignoreCase ? "gi" : "g");
      let m;
      while ((m = gRe.exec(lines[i])) !== null) {
        out += `${prefix}${num}${BOLD_RED}${m[0]}${RESET}
`;
      }
    } else {
      const hl = isMatch && !invert ? lines[i].replace(highlightRe, (m) => `${BOLD_RED}${m}${RESET}`) : lines[i];
      out += `${prefix}${num}${hl}
`;
    }
  }
  return out;
}
function grepDirFull(ctx, dir, opts) {
  let out = "";
  try {
    for (const name of ctx.volume.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      const st = ctx.volume.statSync(full);
      if (st.isDirectory()) {
        out += grepDirFull(ctx, full, opts);
      } else {
        try {
          const content = ctx.volume.readFileSync(full, "utf8");
          out += grepLines(content, opts, full);
        } catch {
        }
      }
    }
  } catch {
  }
  return out;
}
const grep_cmd = (args, ctx, stdin) => {
  const { flags, opts: parsedOpts, positional } = parseArgs(
    args,
    [
      "i",
      "v",
      "c",
      "l",
      "n",
      "r",
      "R",
      "o",
      "w",
      "x",
      "E",
      "F",
      "P",
      "H",
      "h",
      "q",
      "s",
      "z"
    ],
    ["A", "B", "C", "m", "e", "f"]
  );
  const ignoreCase = flags.has("i");
  const invert = flags.has("v");
  const countOnly = flags.has("c");
  const filesOnly = flags.has("l");
  const lineNumbers = flags.has("n");
  const recursive = flags.has("r") || flags.has("R");
  const onlyMatching = flags.has("o");
  const wordRegex = flags.has("w");
  const lineRegex = flags.has("x");
  const fixedStrings = flags.has("F");
  const quiet = flags.has("q");
  const suppressErrors = flags.has("s");
  const afterCtx = parseInt(parsedOpts["A"] || parsedOpts["C"] || "0");
  const beforeCtx = parseInt(parsedOpts["B"] || parsedOpts["C"] || "0");
  const maxCount = parsedOpts["m"] ? parseInt(parsedOpts["m"]) : Infinity;
  let patternStr;
  if (parsedOpts["e"] !== void 0) {
    patternStr = parsedOpts["e"];
  } else if (positional.length === 0) {
    return fail("grep: missing pattern\n");
  } else {
    patternStr = positional.shift();
  }
  if (fixedStrings)
    patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (wordRegex) patternStr = `\\b${patternStr}\\b`;
  if (lineRegex) patternStr = `^${patternStr}$`;
  let regex;
  let highlightRe;
  try {
    regex = new RegExp(patternStr, ignoreCase ? "im" : "m");
    highlightRe = new RegExp(patternStr, ignoreCase ? "gi" : "g");
  } catch {
    return fail(`grep: Invalid regular expression: '${patternStr}'
`);
  }
  const grepOpts = {
    regex,
    highlightRe,
    patternStr,
    ignoreCase,
    invert,
    countOnly,
    filesOnly,
    lineNumbers,
    onlyMatching,
    quiet,
    beforeCtx,
    afterCtx,
    maxCount
  };
  const files = positional;
  if (files.length === 0 && stdin !== void 0) {
    const result = grepLines(stdin, grepOpts);
    if (quiet) return result ? EXIT_OK : EXIT_FAIL;
    return result ? ok(result) : EXIT_FAIL;
  }
  if (files.length === 0) {
    return fail("grep: missing file operand\n");
  }
  let out = "";
  const multiFile = files.length > 1 || recursive;
  let anyMatch = false;
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const st = ctx.volume.statSync(p);
      if (st.isDirectory()) {
        if (recursive) {
          const r = grepDirFull(ctx, p, grepOpts);
          out += r;
          if (r) anyMatch = true;
        } else if (!suppressErrors) {
          out += `grep: ${file}: Is a directory
`;
        }
        continue;
      }
      const content = ctx.volume.readFileSync(p, "utf8");
      const result = grepLines(content, grepOpts, multiFile ? file : void 0);
      out += result;
      if (result) anyMatch = true;
    } catch {
      if (!suppressErrors)
        return fail(`grep: ${file}: No such file or directory
`);
    }
  }
  if (quiet) return anyMatch ? EXIT_OK : EXIT_FAIL;
  return anyMatch ? ok(out) : { stdout: out, stderr: "", exitCode: 1 };
};
function parseSedScript(script) {
  const cmds = [];
  const parts = script.split(/\s*;\s*|\n/).filter(Boolean);
  for (const part of parts) {
    let rest = part.trim();
    if (!rest) continue;
    let addr;
    if (rest[0] === "$") {
      addr = { type: "last" };
      rest = rest.slice(1);
    } else if (/^\d/.test(rest)) {
      const m = rest.match(/^(\d+)(?:,(\d+|\$))?/);
      if (m) {
        rest = rest.slice(m[0].length);
        if (m[2]) {
          const to = m[2] === "$" ? Infinity : parseInt(m[2]);
          addr = { type: "range", from: parseInt(m[1]), to };
        } else {
          addr = { type: "line", n: parseInt(m[1]) };
        }
      }
    } else if (rest[0] === "/") {
      const end = rest.indexOf("/", 1);
      if (end > 0) {
        const pattern = rest.slice(1, end);
        try {
          addr = { type: "regex", re: new RegExp(pattern) };
        } catch {
          return `invalid regular expression: ${pattern}`;
        }
        rest = rest.slice(end + 1);
      }
    }
    const cmd = rest[0];
    rest = rest.slice(1);
    if (cmd === "s") {
      const delim = rest[0];
      if (!delim) return `unsupported expression: ${part}`;
      const parts2 = rest.slice(1).split(delim);
      if (parts2.length < 2) return `unsupported expression: ${part}`;
      const printAfter = parts2[2]?.includes("p") ?? false;
      const sFlags = (parts2[2] ?? "").replace("p", "") || void 0;
      cmds.push({ addr, type: "s", pattern: parts2[0], replacement: parts2[1], sFlags, printAfter });
    } else if (cmd === "d") {
      cmds.push({ addr, type: "d" });
    } else if (cmd === "p") {
      cmds.push({ addr, type: "p" });
    } else if (cmd === "q") {
      cmds.push({ addr, type: "q" });
    } else if (cmd === "a") {
      cmds.push({ addr, type: "a", text: rest.replace(/^\\?\s*/, "") });
    } else if (cmd === "i") {
      cmds.push({ addr, type: "i", text: rest.replace(/^\\?\s*/, "") });
    } else if (cmd === "c") {
      cmds.push({ addr, type: "c", text: rest.replace(/^\\?\s*/, "") });
    } else if (cmd === "y") {
      const delim2 = rest[0];
      const parts2 = rest.slice(1).split(delim2);
      if (parts2.length < 2) return `unsupported expression: ${part}`;
      cmds.push({ addr, type: "y", pattern: parts2[0], replacement: parts2[1] });
    } else if (cmd === "=") {
      cmds.push({ addr, type: "=" });
    } else {
      return `unsupported command: ${cmd}`;
    }
  }
  return cmds;
}
function sedAddressMatch(addr, lineNum, totalLines, _line) {
  if (!addr) return true;
  if (addr.type === "line") return lineNum === addr.n;
  if (addr.type === "range")
    return lineNum >= addr.from && lineNum <= (addr.to === Infinity ? totalLines : addr.to);
  if (addr.type === "last") return lineNum === totalLines;
  if (addr.type === "regex") return addr.re.test(_line);
  return true;
}
const sed_cmd = (args, ctx, stdin) => {
  const { flags, positional } = parseArgs(args, ["i", "n", "r", "E"]);
  const inPlace = flags.has("i");
  const quietMode = flags.has("n");
  if (positional.length === 0) return fail("sed: missing expression\n");
  const expressions = positional[0];
  const files = positional.slice(1);
  const cmds = parseSedScript(expressions);
  if (typeof cmds === "string") return fail(`sed: ${cmds}
`);
  const doSed = (content) => {
    const lines = content.split("\n");
    let out2 = "";
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const isLast = i === lines.length - 1;
      let line = lines[i];
      let suppress = quietMode;
      let deleted = false;
      for (const cmd of cmds) {
        if (deleted) break;
        if (!sedAddressMatch(cmd.addr, lineNum, lines.length, line)) continue;
        switch (cmd.type) {
          case "s": {
            let re;
            try {
              re = new RegExp(cmd.pattern, cmd.sFlags || void 0);
            } catch {
              break;
            }
            line = line.replace(re, cmd.replacement);
            if (cmd.printAfter && re.test(lines[i])) suppress = false;
            break;
          }
          case "d":
            deleted = true;
            break;
          case "p":
            out2 += line + "\n";
            break;
          case "q": {
            if (!suppress) out2 += line + "\n";
            return out2;
          }
          case "a":
            out2 += line + "\n" + cmd.text + "\n";
            suppress = true;
            break;
          case "i":
            out2 += cmd.text + "\n";
            break;
          case "c":
            out2 += cmd.text + "\n";
            deleted = true;
            break;
          case "y": {
            const from = cmd.pattern;
            const to = cmd.replacement;
            let result = "";
            for (const ch of line) {
              const idx = from.indexOf(ch);
              result += idx >= 0 ? to[idx] : ch;
            }
            line = result;
            break;
          }
          case "=":
            out2 += lineNum + "\n";
            break;
        }
      }
      if (!deleted && !suppress) {
        out2 += line + (isLast && !content.endsWith("\n") ? "" : "\n");
      }
    }
    return out2;
  };
  if (files.length === 0 && stdin !== void 0) return ok(doSed(stdin));
  if (files.length === 0) return fail("sed: missing input\n");
  let out = "";
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      const content = ctx.volume.readFileSync(p, "utf8");
      const result = doSed(content);
      if (inPlace) {
        ctx.volume.writeFileSync(p, result);
      } else {
        out += result;
      }
    } catch {
      return fail(`sed: ${file}: No such file or directory
`);
    }
  }
  return ok(out);
};
const sort_cmd = (args, ctx, stdin) => {
  const { flags, opts, positional } = parseArgs(
    args,
    ["r", "n", "u", "f", "h", "V", "b", "s"],
    ["k", "t", "o"]
  );
  const reverse = flags.has("r");
  const numeric = flags.has("n");
  const unique = flags.has("u");
  const ignoreCase = flags.has("f");
  const humanNumeric = flags.has("h");
  const versionSort = flags.has("V");
  const stable = flags.has("s");
  const keySpec = opts["k"];
  const fieldSep = opts["t"];
  const outputFile = opts["o"];
  let content = stdin ?? "";
  if (positional.length > 0) {
    const p = resolvePath(positional[0], ctx.cwd);
    try {
      content = ctx.volume.readFileSync(p, "utf8");
    } catch {
      return fail(`sort: ${positional[0]}: No such file or directory
`);
    }
  }
  let lines = content.split("\n").filter(Boolean);
  const getKey = (line) => {
    if (!keySpec) return line;
    const sep = fieldSep || /\s+/;
    const fields = line.split(sep);
    const [startSpec, endSpec] = keySpec.split(",");
    const startField = parseInt(startSpec) - 1;
    const endField = endSpec ? parseInt(endSpec) - 1 : startField;
    return fields.slice(startField, endField + 1).join(typeof sep === "string" ? sep : " ");
  };
  const parseHumanSize = (s) => {
    const m = s.trim().match(/^([\d.]+)([KMGTPE]i?)?$/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = (m[2] || "").toUpperCase().replace("I", "");
    const mult = {
      "": 1,
      K: 1024,
      M: 1048576,
      G: 1073741824,
      T: 1099511627776
    };
    return n * (mult[u] || 1);
  };
  const compare = (a, b) => {
    let ka = getKey(a), kb = getKey(b);
    if (ignoreCase) {
      ka = ka.toLowerCase();
      kb = kb.toLowerCase();
    }
    if (numeric) return parseFloat(ka) - parseFloat(kb);
    if (humanNumeric) return parseHumanSize(ka) - parseHumanSize(kb);
    if (versionSort)
      return ka.localeCompare(kb, void 0, { numeric: true, sensitivity: "base" });
    return ka.localeCompare(kb);
  };
  if (stable) {
    const indexed = lines.map((l, i) => ({ l, i }));
    indexed.sort((a, b) => compare(a.l, b.l) || a.i - b.i);
    lines = indexed.map((x) => x.l);
  } else {
    lines.sort(compare);
  }
  if (reverse) lines.reverse();
  if (unique) {
    const seen = /* @__PURE__ */ new Set();
    lines = lines.filter((l) => {
      const k = ignoreCase ? getKey(l).toLowerCase() : getKey(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const result = lines.join("\n") + (lines.length ? "\n" : "");
  if (outputFile) {
    const p = resolvePath(outputFile, ctx.cwd);
    try {
      ctx.volume.writeFileSync(p, result);
    } catch {
    }
  }
  return ok(result);
};
const uniq_cmd = (args, ctx, stdin) => {
  const { flags, opts, positional } = parseArgs(
    args,
    ["c", "d", "u", "i"],
    ["f", "s", "w"]
  );
  const count = flags.has("c");
  const dupsOnly = flags.has("d");
  const uniqueOnly = flags.has("u");
  const ignoreCase = flags.has("i");
  const skipFields = parseInt(opts["f"] || "0");
  const skipChars = parseInt(opts["s"] || "0");
  const checkChars = opts["w"] ? parseInt(opts["w"]) : Infinity;
  let content = stdin ?? "";
  if (positional.length > 0) {
    const p = resolvePath(positional[0], ctx.cwd);
    try {
      content = ctx.volume.readFileSync(p, "utf8");
    } catch {
      return fail(`uniq: ${positional[0]}: No such file or directory
`);
    }
  }
  const getKey = (line) => {
    let l = line;
    if (skipFields > 0) {
      const parts = l.split(/\s+/);
      l = parts.slice(skipFields).join(" ");
    }
    if (skipChars > 0) l = l.slice(skipChars);
    if (checkChars < Infinity) l = l.slice(0, checkChars);
    if (ignoreCase) l = l.toLowerCase();
    return l;
  };
  const lines = content.split("\n");
  const result = [];
  let prev = "";
  let prevLine = "";
  let prevCount = 0;
  for (const line of lines) {
    const key = getKey(line);
    if (key === prev) {
      prevCount++;
    } else {
      if (prevCount > 0) {
        const show = dupsOnly ? prevCount > 1 : uniqueOnly ? prevCount === 1 : true;
        if (show)
          result.push(count ? `${String(prevCount).padStart(7)} ${prevLine}` : prevLine);
      }
      prev = key;
      prevLine = line;
      prevCount = 1;
    }
  }
  if (prevCount > 0 && prevLine !== "") {
    const show = dupsOnly ? prevCount > 1 : uniqueOnly ? prevCount === 1 : true;
    if (show)
      result.push(count ? `${String(prevCount).padStart(7)} ${prevLine}` : prevLine);
  }
  return ok(result.join("\n") + (result.length ? "\n" : ""));
};
function expandRange(s) {
  return s.replace(/(.)-(.)/g, (_, a, b) => {
    let result = "";
    const start = a.charCodeAt(0);
    const end = b.charCodeAt(0);
    for (let i = start; i <= end; i++) result += String.fromCharCode(i);
    return result;
  });
}
function squeezeDups(s, chars) {
  let out = "";
  let prev = "";
  for (const ch of s) {
    if (ch === prev && chars.has(ch)) continue;
    out += ch;
    prev = ch;
  }
  return out;
}
function buildComplement(set) {
  const setChars = new Set(set);
  let result = "";
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    if (!setChars.has(ch)) result += ch;
  }
  return result;
}
const tr_cmd = (args, _ctx, stdin) => {
  const { flags, positional } = parseArgs(args, ["d", "s", "c", "C"]);
  const deleteMode = flags.has("d");
  const squeeze = flags.has("s");
  const complement = flags.has("c") || flags.has("C");
  if (positional.length === 0) return fail("tr: missing operand\n");
  const content = stdin ?? "";
  let set1 = expandCharClass(positional[0]);
  const set2 = positional.length > 1 ? expandCharClass(positional[1]) : "";
  set1 = expandRange(set1);
  const expandedSet2 = set2 ? expandRange(set2) : "";
  if (deleteMode) {
    const chars = complement ? null : new Set(set1);
    let out2 = "";
    for (const ch of content) {
      const inSet = chars ? chars.has(ch) : set1.includes(ch);
      if (complement ? inSet : !inSet) out2 += ch;
    }
    if (squeeze && expandedSet2) {
      const squeezeSet = new Set(expandedSet2);
      out2 = squeezeDups(out2, squeezeSet);
    }
    return ok(out2);
  }
  if (positional.length < 2 && !squeeze) return fail("tr: missing operand\n");
  if (squeeze && positional.length === 1) {
    const squeezeSet = new Set(set1);
    return ok(squeezeDups(content, squeezeSet));
  }
  let out = "";
  const s1 = complement ? buildComplement(set1) : set1;
  for (const ch of content) {
    const idx = s1.indexOf(ch);
    if (idx >= 0) {
      const replacement = idx < expandedSet2.length ? expandedSet2[idx] : expandedSet2[expandedSet2.length - 1] || ch;
      out += replacement;
    } else {
      out += ch;
    }
  }
  if (squeeze) {
    const squeezeSet = new Set(expandedSet2);
    out = squeezeDups(out, squeezeSet);
  }
  return ok(out);
};
function parseRangeSpec(spec) {
  const result = [];
  for (const part of spec.split(",")) {
    const range = part.match(/^(\d+)-(\d*)$/);
    if (range) {
      const start = parseInt(range[1]);
      const end = range[2] ? parseInt(range[2]) : start + 100;
      for (let i = start; i <= end; i++) result.push(i);
    } else {
      result.push(parseInt(part));
    }
  }
  return result.filter((n) => !isNaN(n));
}
const cut_cmd = (args, ctx, stdin) => {
  let delimiter = "	";
  let fields = [];
  let bytes = [];
  let chars = [];
  let outputDelimiter = null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-d" && i + 1 < args.length) delimiter = args[++i];
    else if (args[i] === "-f" && i + 1 < args.length)
      fields = parseRangeSpec(args[++i]);
    else if (args[i] === "-b" && i + 1 < args.length)
      bytes = parseRangeSpec(args[++i]);
    else if (args[i] === "-c" && i + 1 < args.length)
      chars = parseRangeSpec(args[++i]);
    else if (args[i] === "--output-delimiter" && i + 1 < args.length)
      outputDelimiter = args[++i];
    else if (!args[i].startsWith("-")) files.push(args[i]);
  }
  const outDelim = outputDelimiter ?? delimiter;
  const doCut = (content) => {
    return content.split("\n").map((line) => {
      if (bytes.length > 0 || chars.length > 0) {
        const indices = bytes.length > 0 ? bytes : chars;
        return indices.map((idx) => line[idx - 1] ?? "").join("");
      }
      const parts = line.split(delimiter);
      return fields.map((f) => parts[f - 1] ?? "").join(outDelim);
    }).join("\n");
  };
  if (files.length === 0) return ok(doCut(stdin ?? ""));
  let out = "";
  for (const file of files) {
    const p = resolvePath(file, ctx.cwd);
    try {
      out += doCut(ctx.volume.readFileSync(p, "utf8"));
    } catch {
      return fail(`cut: ${file}: No such file or directory
`);
    }
  }
  return ok(out);
};
const rev_cmd = (args, ctx, stdin) => {
  let content = stdin ?? "";
  if (args.length > 0) {
    const p = resolvePath(args[0], ctx.cwd);
    try {
      content = ctx.volume.readFileSync(p, "utf8");
    } catch {
      return fail(`rev: ${args[0]}: No such file or directory
`);
    }
  }
  return ok(
    content.split("\n").map((l) => [...l].reverse().join("")).join("\n")
  );
};
const paste_cmd = (args, ctx, stdin) => {
  const { opts, positional } = parseArgs(args, ["s"], ["d"]);
  const delim = opts["d"] || "	";
  const contents = [];
  for (const file of positional) {
    if (file === "-" && stdin) {
      contents.push(stdin.split("\n"));
      continue;
    }
    const p = resolvePath(file, ctx.cwd);
    try {
      contents.push(ctx.volume.readFileSync(p, "utf8").split("\n"));
    } catch {
      return fail(`paste: ${file}: No such file or directory
`);
    }
  }
  if (contents.length === 0 && stdin) contents.push(stdin.split("\n"));
  const maxLen = Math.max(...contents.map((c) => c.length));
  let out = "";
  for (let i = 0; i < maxLen; i++) {
    out += contents.map((c) => c[i] ?? "").join(delim) + "\n";
  }
  return ok(out);
};
const comm_cmd = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["1", "2", "3"]);
  if (positional.length < 2) return fail("comm: missing operand\n");
  const readFile = (f) => {
    const p = resolvePath(f, ctx.cwd);
    return ctx.volume.readFileSync(p, "utf8").split("\n").filter(Boolean);
  };
  try {
    const a = readFile(positional[0]);
    const b = readFile(positional[1]);
    let out = "";
    let ai = 0, bi = 0;
    while (ai < a.length || bi < b.length) {
      if (ai >= a.length) {
        if (!flags.has("2"))
          out += "	" + (flags.has("1") ? "" : "	") + b[bi] + "\n";
        bi++;
      } else if (bi >= b.length) {
        if (!flags.has("1")) out += a[ai] + "\n";
        ai++;
      } else if (a[ai] < b[bi]) {
        if (!flags.has("1")) out += a[ai] + "\n";
        ai++;
      } else if (a[ai] > b[bi]) {
        if (!flags.has("2"))
          out += "	" + (flags.has("1") ? "" : "	") + b[bi] + "\n";
        bi++;
      } else {
        if (!flags.has("3")) out += "		" + a[ai] + "\n";
        ai++;
        bi++;
      }
    }
    return ok(out);
  } catch (e) {
    return fail(`comm: ${e instanceof Error ? e.message : String(e)}
`);
  }
};
function simpleLCS(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from(
    { length: m + 1 },
    () => new Array(n + 1).fill(0)
  );
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      dp[i2][j2] = a[i2 - 1] === b[j2 - 1] ? dp[i2 - 1][j2 - 1] + 1 : Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}
const diff_cmd = (args, ctx) => {
  const { flags, positional } = parseArgs(args, ["u", "q", "r", "N"]);
  if (positional.length < 2) return fail("diff: missing operand\n");
  const brief = flags.has("q");
  const unified = flags.has("u");
  const p1 = resolvePath(positional[0], ctx.cwd);
  const p2 = resolvePath(positional[1], ctx.cwd);
  try {
    const a = ctx.volume.readFileSync(p1, "utf8").split("\n");
    const b = ctx.volume.readFileSync(p2, "utf8").split("\n");
    if (a.join("\n") === b.join("\n")) return ok();
    if (brief)
      return {
        stdout: `Files ${positional[0]} and ${positional[1]} differ
`,
        stderr: "",
        exitCode: 1
      };
    let out = "";
    if (unified) {
      out += `--- ${positional[0]}
+++ ${positional[1]}
`;
      out += `@@ -1,${a.length} +1,${b.length} @@
`;
      const lcs = simpleLCS(a, b);
      let ai = 0, bi = 0, li = 0;
      while (ai < a.length || bi < b.length) {
        if (li < lcs.length && ai < a.length && a[ai] === lcs[li] && bi < b.length && b[bi] === lcs[li]) {
          out += ` ${a[ai]}
`;
          ai++;
          bi++;
          li++;
        } else if (ai < a.length && (li >= lcs.length || a[ai] !== lcs[li])) {
          out += `-${a[ai]}
`;
          ai++;
        } else if (bi < b.length) {
          out += `+${b[bi]}
`;
          bi++;
        }
      }
    } else {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i >= a.length) out += `> ${b[i]}
`;
        else if (i >= b.length) out += `< ${a[i]}
`;
        else if (a[i] !== b[i]) {
          out += `< ${a[i]}
---
> ${b[i]}
`;
        }
      }
    }
    return { stdout: out, stderr: "", exitCode: 1 };
  } catch (e) {
    return fail(`diff: ${e instanceof Error ? e.message : String(e)}
`);
  }
};
const seq_cmd = (args) => {
  if (args.length === 0) return fail("seq: missing operand\n");
  let first = 1, increment = 1, last = 1;
  if (args.length === 1) {
    last = parseFloat(args[0]);
  } else if (args.length === 2) {
    first = parseFloat(args[0]);
    last = parseFloat(args[1]);
  } else {
    first = parseFloat(args[0]);
    increment = parseFloat(args[1]);
    last = parseFloat(args[2]);
  }
  const lines = [];
  if (increment > 0) {
    for (let i = first; i <= last; i += increment) lines.push(String(i));
  } else if (increment < 0) {
    for (let i = first; i >= last; i += increment) lines.push(String(i));
  }
  return ok(lines.join("\n") + (lines.length ? "\n" : ""));
};
const yes_cmd = (args) => {
  const text = args.length > 0 ? args.join(" ") : "y";
  return ok((text + "\n").repeat(index.YES_REPEAT_COUNT));
};
const textProcessingCommands = [
  ["echo", echo],
  ["printf", printf_cmd],
  ["grep", grep_cmd],
  ["egrep", grep_cmd],
  ["fgrep", grep_cmd],
  ["sed", sed_cmd],
  ["sort", sort_cmd],
  ["uniq", uniq_cmd],
  ["tr", tr_cmd],
  ["cut", cut_cmd],
  ["rev", rev_cmd],
  ["paste", paste_cmd],
  ["comm", comm_cmd],
  ["diff", diff_cmd],
  ["seq", seq_cmd],
  ["yes", yes_cmd]
];

function matchSize(fileSize, spec) {
  const m = spec.match(/^([+-]?)(\d+)([cwbkMG]?)$/);
  if (!m) return true;
  const op = m[1];
  let n = parseInt(m[2]);
  const unit = m[3];
  if (unit === "c") ; else if (unit === "w") n *= 2;
  else if (unit === "k") n *= 1024;
  else if (unit === "M") n *= 1048576;
  else if (unit === "G") n *= 1073741824;
  else n *= index.LS_BLOCK_SIZE;
  if (op === "+") return fileSize > n;
  if (op === "-") return fileSize < n;
  return fileSize === n;
}
function matchMtime(mtimeMs, spec) {
  const m = spec.match(/^([+-]?)(\d+)$/);
  if (!m) return true;
  const op = m[1];
  const days = parseInt(m[2]);
  const age = (Date.now() - mtimeMs) / 864e5;
  if (op === "+") return age > days;
  if (op === "-") return age < days;
  return Math.floor(age) === days;
}
const find_cmd = async (args, ctx) => {
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
  let execArgs = [];
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
    } else if (a === "-path" || a === "-wholename" && i + 1 < args.length) {
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
      const cmdParts = [];
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
  const nameRe = namePattern ? new RegExp("^" + globToRegex(namePattern) + "$") : null;
  const inameRe = inamePattern ? new RegExp("^" + globToRegex(inamePattern) + "$", "i") : null;
  const pathRe = pathPattern ? new RegExp(globToRegex(pathPattern)) : null;
  const results = [];
  let execOut = "";
  const walk = (dir, depth) => {
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
        }
      }
    } catch {
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
      }
    }
    return ok();
  }
  if (execCmd) {
    for (const path of results) {
      const expandedArgs = execArgs.map((a) => a === "{}" ? path : a);
      const fullCmd = [execCmd, ...expandedArgs].join(" ");
      const result = await ctx.exec(fullCmd, { cwd: ctx.cwd, env: ctx.env });
      execOut += result.stdout;
    }
    return ok(execOut);
  }
  if (print0) return ok(results.join("\0"));
  if (printMode) return ok(results.join("\n") + (results.length ? "\n" : ""));
  return ok();
};
const xargs_cmd = async (args, ctx, stdin) => {
  if (!stdin) return ok();
  let maxArgs = Infinity;
  let placeholder = "";
  let nullDelim = false;
  const cmdParts = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && i + 1 < args.length)
      maxArgs = parseInt(args[++i]) || 1;
    else if (args[i] === "-I" && i + 1 < args.length) placeholder = args[++i];
    else if (args[i] === "-0" || args[i] === "--null") nullDelim = true;
    else if (args[i] === "-t") ; else cmdParts.push(args[i]);
  }
  if (cmdParts.length === 0) cmdParts.push("echo");
  const delim = nullDelim ? "\0" : /\s+/;
  const items = stdin.trim().split(delim).filter(Boolean);
  const cmd = cmdParts.join(" ");
  let out = "";
  let err = "";
  let lastCode = 0;
  if (placeholder) {
    for (const item of items) {
      const expanded = cmd.replace(
        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        item
      );
      const result = await ctx.exec(expanded, { cwd: ctx.cwd, env: ctx.env });
      out += result.stdout;
      err += result.stderr;
      lastCode = result.exitCode;
    }
  } else if (maxArgs < Infinity) {
    for (let i = 0; i < items.length; i += maxArgs) {
      const batch = items.slice(i, i + maxArgs).join(" ");
      const result = await ctx.exec(`${cmd} ${batch}`, {
        cwd: ctx.cwd,
        env: ctx.env
      });
      out += result.stdout;
      err += result.stderr;
      lastCode = result.exitCode;
    }
  } else {
    const result = await ctx.exec(`${cmd} ${items.join(" ")}`, {
      cwd: ctx.cwd,
      env: ctx.env
    });
    out += result.stdout;
    err += result.stderr;
    lastCode = result.exitCode;
  }
  return { stdout: out, stderr: err, exitCode: lastCode };
};
const searchCommands = [
  ["find", find_cmd],
  ["xargs", xargs_cmd]
];

let _builtins = null;
function setBuiltinsRef(b) {
  _builtins = b;
}
const exportCmd = (args, ctx) => {
  if (args.length === 0) {
    let out = "";
    for (const [k, v] of Object.entries(ctx.env)) {
      out += `declare -x ${k}="${v}"
`;
    }
    return ok(out);
  }
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq > 0) {
      ctx.env[arg.slice(0, eq)] = arg.slice(eq + 1);
    }
  }
  return ok();
};
const unset = (args, ctx) => {
  for (const name of args) delete ctx.env[name];
  return ok();
};
const envCmd = (_args, ctx) => {
  let out = "";
  for (const [k, v] of Object.entries(ctx.env)) out += `${k}=${v}
`;
  return ok(out);
};
const which = (args, ctx) => {
  if (args.length === 0) return fail("which: missing argument\n");
  const { flags } = parseArgs(args, ["a"]);
  const showAll = flags.has("a");
  const names = args.filter((a) => !a.startsWith("-"));
  let out = "";
  for (const name of names) {
    const found = [];
    if (_builtins?.has(name)) found.push(`${name}: shell built-in command`);
    const knownBins = {
      node: "/usr/local/bin/node",
      npm: "/usr/local/bin/npm",
      npx: "/usr/local/bin/npx",
      pnpm: "/usr/local/bin/pnpm",
      yarn: "/usr/local/bin/yarn",
      bun: "/usr/local/bin/bun",
      bunx: "/usr/local/bin/bunx"
    };
    if (knownBins[name]) found.push(knownBins[name]);
    const binPath = `/node_modules/.bin/${name}`;
    if (ctx.volume.existsSync(binPath)) found.push(binPath);
    const pathDirs = (ctx.env.PATH || "").split(":").filter(Boolean);
    for (const dir of pathDirs) {
      const candidate = `${dir}/${name}`;
      if (ctx.volume.existsSync(candidate)) {
        if (!found.includes(candidate)) found.push(candidate);
      }
    }
    if (found.length === 0) {
      out += `${name} not found
`;
    } else if (showAll) {
      for (const f of found) out += f + "\n";
    } else {
      out += found[0] + "\n";
    }
  }
  return out.includes("not found") ? { stdout: out, stderr: "", exitCode: 1 } : ok(out);
};
const typeCmd = (args, ctx) => {
  if (args.length === 0) return fail("type: missing argument\n");
  const name = args[0];
  if (_builtins?.has(name)) return ok(`${name} is a shell builtin
`);
  const w = which([name], ctx);
  if (typeof w === "object" && "exitCode" in w && w.exitCode === 0) {
    return ok(`${name} is ${w.stdout.trim()}
`);
  }
  return fail(`type: ${name}: not found
`);
};
const trueCmd = () => ok();
const falseCmd = () => EXIT_FAIL;
const exitCmd = (args) => {
  const code = args[0] ? parseInt(args[0], 10) : 0;
  return { stdout: "", stderr: "", exitCode: code };
};
const clear = () => ok("\x1B[2J\x1B[H");
function evalTest(args, ctx) {
  if (args.length === 0) return false;
  if (args[0] === "!") return !evalTest(args.slice(1), ctx);
  if (args[0] === "(" && args[args.length - 1] === ")") {
    return evalTest(args.slice(1, -1), ctx);
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o") {
      return evalTest(args.slice(0, i), ctx) || evalTest(args.slice(i + 1), ctx);
    }
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-a") {
      return evalTest(args.slice(0, i), ctx) && evalTest(args.slice(i + 1), ctx);
    }
  }
  if (args.length === 1) return args[0].length > 0;
  if (args.length === 2) {
    const [flag, val] = args;
    const p = resolvePath(val, ctx.cwd);
    if (flag === "-f") {
      try {
        return ctx.volume.statSync(p).isFile();
      } catch {
        return false;
      }
    }
    if (flag === "-d") {
      try {
        return ctx.volume.statSync(p).isDirectory();
      } catch {
        return false;
      }
    }
    if (flag === "-e") return ctx.volume.existsSync(p);
    if (flag === "-L" || flag === "-h") return ctx.volume.existsSync(p);
    if (flag === "-s") {
      try {
        return ctx.volume.readFileSync(p).length > 0;
      } catch {
        return false;
      }
    }
    if (flag === "-r" || flag === "-w") return ctx.volume.existsSync(p);
    if (flag === "-x") {
      if (ctx.volume.existsSync(p)) {
        const ext = index.extname(p);
        return ext === ".sh" || ext === "" || p.includes("/bin/");
      }
      return false;
    }
    if (flag === "-n") return val.length > 0;
    if (flag === "-z") return val.length === 0;
    if (flag === "-t") return false;
  }
  if (args.length === 3) {
    const [left, op, right] = args;
    if (op === "=" || op === "==") return left === right;
    if (op === "!=") return left !== right;
    if (op === "-eq") return parseInt(left) === parseInt(right);
    if (op === "-ne") return parseInt(left) !== parseInt(right);
    if (op === "-lt") return parseInt(left) < parseInt(right);
    if (op === "-le") return parseInt(left) <= parseInt(right);
    if (op === "-gt") return parseInt(left) > parseInt(right);
    if (op === "-ge") return parseInt(left) >= parseInt(right);
    if (op === "-nt" || op === "-ot" || op === "-ef") {
      try {
        const sl = ctx.volume.statSync(resolvePath(left, ctx.cwd));
        const sr = ctx.volume.statSync(resolvePath(right, ctx.cwd));
        if (op === "-nt") return (sl.mtimeMs || 0) > (sr.mtimeMs || 0);
        if (op === "-ot") return (sl.mtimeMs || 0) < (sr.mtimeMs || 0);
        if (op === "-ef")
          return resolvePath(left, ctx.cwd) === resolvePath(right, ctx.cwd);
      } catch {
        return false;
      }
    }
  }
  return false;
}
const test_cmd = (args, ctx) => {
  const testArgs = [...args];
  if (testArgs[testArgs.length - 1] === "]") testArgs.pop();
  return { stdout: "", stderr: "", exitCode: evalTest(testArgs, ctx) ? 0 : 1 };
};
function getTimezoneAbbr(d) {
  const str = d.toTimeString();
  const m = str.match(/\((.+?)\)/);
  if (m) {
    const words = m[1].split(" ");
    if (words.length === 1) return words[0];
    return words.map((w) => w[0]).join("");
  }
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const min = String(Math.abs(off) % 60).padStart(2, "0");
  return `${sign}${h}${min}`;
}
function formatDate(d, fmt, utc) {
  const g = utc ? {
    Y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    H: d.getUTCHours(),
    M: d.getUTCMinutes(),
    S: d.getUTCSeconds(),
    w: d.getUTCDay()
  } : {
    Y: d.getFullYear(),
    m: d.getMonth(),
    d: d.getDate(),
    H: d.getHours(),
    M: d.getMinutes(),
    S: d.getSeconds(),
    w: d.getDay()
  };
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] === "%" && i + 1 < fmt.length) {
      const s = fmt[++i];
      if (s === "Y") out += g.Y;
      else if (s === "y") out += String(g.Y).slice(-2);
      else if (s === "m") out += String(g.m + 1).padStart(2, "0");
      else if (s === "d") out += String(g.d).padStart(2, "0");
      else if (s === "e") out += String(g.d).padStart(2, " ");
      else if (s === "H") out += String(g.H).padStart(2, "0");
      else if (s === "M") out += String(g.M).padStart(2, "0");
      else if (s === "S") out += String(g.S).padStart(2, "0");
      else if (s === "I") out += String(g.H % 12 || 12).padStart(2, "0");
      else if (s === "p") out += g.H < 12 ? "AM" : "PM";
      else if (s === "P") out += g.H < 12 ? "am" : "pm";
      else if (s === "a") out += DAYS_SHORT[g.w];
      else if (s === "A") out += DAYS_LONG[g.w];
      else if (s === "b" || s === "h") out += MONTHS_SHORT[g.m];
      else if (s === "B") out += MONTHS_LONG[g.m];
      else if (s === "w") out += g.w;
      else if (s === "u") out += g.w === 0 ? 7 : g.w;
      else if (s === "j") {
        const jan1 = new Date(g.Y, 0, 1);
        const diff = d.getTime() - jan1.getTime();
        out += String(Math.floor(diff / 864e5) + 1).padStart(3, "0");
      } else if (s === "s") out += Math.floor(d.getTime() / 1e3);
      else if (s === "N") out += String(d.getMilliseconds() * 1e6).padStart(9, "0");
      else if (s === "n") out += "\n";
      else if (s === "t") out += "	";
      else if (s === "T")
        out += `${String(g.H).padStart(2, "0")}:${String(g.M).padStart(2, "0")}:${String(g.S).padStart(2, "0")}`;
      else if (s === "R")
        out += `${String(g.H).padStart(2, "0")}:${String(g.M).padStart(2, "0")}`;
      else if (s === "F")
        out += `${g.Y}-${String(g.m + 1).padStart(2, "0")}-${String(g.d).padStart(2, "0")}`;
      else if (s === "D")
        out += `${String(g.m + 1).padStart(2, "0")}/${String(g.d).padStart(2, "0")}/${String(g.Y).slice(-2)}`;
      else if (s === "Z") out += utc ? "UTC" : getTimezoneAbbr(d);
      else if (s === "%") out += "%";
      else out += "%" + s;
    } else {
      out += fmt[i];
    }
  }
  return out;
}
const date_cmd = (args) => {
  const { flags, opts, positional } = parseArgs(args, ["u", "R", "I"], ["d"]);
  const utc = flags.has("u");
  const rfc = flags.has("R");
  const iso = flags.has("I");
  const dateStr = opts["d"];
  const d = dateStr ? new Date(dateStr) : /* @__PURE__ */ new Date();
  if (isNaN(d.getTime())) return fail(`date: invalid date '${dateStr}'
`);
  const fmt = positional.find((a) => a.startsWith("+"));
  if (fmt) return ok(formatDate(d, fmt.slice(1), utc) + "\n");
  if (rfc) return ok(d.toUTCString() + "\n");
  if (iso) return ok(d.toISOString().slice(0, 10) + "\n");
  const day = DAYS_SHORT[utc ? d.getUTCDay() : d.getDay()];
  const mon = MONTHS_SHORT[utc ? d.getUTCMonth() : d.getMonth()];
  const date = utc ? d.getUTCDate() : d.getDate();
  const hh = String(utc ? d.getUTCHours() : d.getHours()).padStart(2, "0");
  const mm = String(utc ? d.getUTCMinutes() : d.getMinutes()).padStart(2, "0");
  const ss = String(utc ? d.getUTCSeconds() : d.getSeconds()).padStart(2, "0");
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const tz = utc ? "UTC" : getTimezoneAbbr(d);
  return ok(
    `${day} ${mon} ${String(date).padStart(2, " ")} ${hh}:${mm}:${ss} ${tz} ${year}
`
  );
};
const sleep_cmd = async (args) => {
  const seconds = parseFloat(args[0] || "0");
  if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1e3));
  return ok();
};
const shellEnvCommands = [
  ["export", exportCmd],
  ["unset", unset],
  ["env", envCmd],
  ["which", which],
  ["type", typeCmd],
  ["true", trueCmd],
  ["false", falseCmd],
  [":", trueCmd],
  ["exit", exitCmd],
  ["clear", clear],
  ["test", test_cmd],
  ["[", test_cmd],
  ["date", date_cmd],
  ["sleep", sleep_cmd]
];

const builtins = new Map([
  ...fileOpsCommands,
  ...directoryCommands,
  ...textProcessingCommands,
  ...searchCommands,
  ...shellEnvCommands
]);
setBuiltinsRef(builtins);

class NodepodShell {
  volume;
  cwd;
  env;
  commands = /* @__PURE__ */ new Map();
  lastExit = 0;
  aliases = /* @__PURE__ */ new Map();
  // serializes concurrent exec() calls to prevent cwd save/restore races
  _execQueue = Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
  _spawnChild = null;
  constructor(volume, opts) {
    this.volume = volume;
    this.cwd = opts?.cwd ?? "/";
    this.env = opts?.env ? { ...opts.env } : {};
    this.env.PWD = this.cwd;
  }
  registerCommand(cmd) {
    this.commands.set(cmd.name, cmd);
  }
  setSpawnChildCallback(cb) {
    this._spawnChild = cb;
  }
  getSpawnChildCallback() {
    return this._spawnChild;
  }
  getCwd() {
    return this.cwd;
  }
  setCwd(cwd) {
    this.cwd = cwd;
    this.env.PWD = cwd;
  }
  getEnv() {
    return this.env;
  }
  async exec(command, opts) {
    if (opts?.cwd || opts?.env) {
      const prev = this._execQueue;
      let resolve;
      this._execQueue = new Promise((r) => {
        resolve = r;
      });
      await prev.catch(() => {
      });
      try {
        const r = await this._execInner(command, opts);
        resolve(r);
        return r;
      } catch (e) {
        const err = {
          stdout: "",
          stderr: `shell: ${e instanceof Error ? e.message : String(e)}
`,
          exitCode: 1
        };
        resolve(err);
        return err;
      }
    }
    return this._execInner(command, opts);
  }
  async _execInner(command, opts) {
    const prevCwd = this.cwd;
    const prevEnv = { ...this.env };
    if (opts?.cwd) {
      this.cwd = opts.cwd;
      this.env.PWD = opts.cwd;
    }
    if (opts?.env) {
      Object.assign(this.env, opts.env);
    }
    try {
      const expanded = await this.expandCommandSubstitution(command);
      const ast = parse(expanded, this.env, this.lastExit);
      return await this.execList(ast);
    } catch (e) {
      return {
        stdout: "",
        stderr: `shell: ${e instanceof Error ? e.message : String(e)}
`,
        exitCode: 1
      };
    } finally {
      if (opts?.cwd && this.cwd === opts.cwd) {
        this.cwd = prevCwd;
        this.env.PWD = prevCwd;
      }
      if (opts?.env) {
        for (const key of Object.keys(opts.env)) {
          if (key in prevEnv) {
            this.env[key] = prevEnv[key];
          } else {
            delete this.env[key];
          }
        }
      }
    }
  }
  /* ---------------------------------------------------------------- */
  /*  AST execution                                                    */
  /* ---------------------------------------------------------------- */
  async execList(list) {
    let result = { stdout: "", stderr: "", exitCode: 0 };
    for (let i = 0; i < list.entries.length; i++) {
      const entry = list.entries[i];
      const pipeResult = await this.execPipeline(entry.pipeline);
      result = {
        stdout: result.stdout + pipeResult.stdout,
        stderr: result.stderr + pipeResult.stderr,
        exitCode: pipeResult.exitCode
      };
      this.lastExit = pipeResult.exitCode;
      if (entry.next === "&&" && pipeResult.exitCode !== 0) break;
      if (entry.next === "||" && pipeResult.exitCode === 0) break;
    }
    return result;
  }
  async execPipeline(pipeline) {
    if (pipeline.commands.length === 1) {
      return this.execCommand(pipeline.commands[0]);
    }
    let stdin;
    let lastResult = { stdout: "", exitCode: 0 };
    let allStderr = "";
    for (const cmd of pipeline.commands) {
      const result = await this.execCommand(cmd, stdin);
      allStderr += result.stderr;
      stdin = result.stdout;
      lastResult = result;
    }
    return {
      stdout: lastResult.stdout,
      stderr: allStderr,
      exitCode: lastResult.exitCode
    };
  }
  async execCommand(cmd, stdin) {
    if (cmd.args.length === 0) {
      for (const [k, v] of Object.entries(cmd.assignments)) {
        this.env[k] = v;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    let expandedArgs = [];
    for (const arg of cmd.args) {
      expandedArgs.push(...expandGlob(arg, this.cwd, this.volume));
    }
    const alias = this.aliases.get(expandedArgs[0]);
    if (alias) {
      const aliasArgs = alias.split(/\s+/);
      expandedArgs = [...aliasArgs, ...expandedArgs.slice(1)];
    }
    const name = expandedArgs[0];
    const args = expandedArgs.slice(1);
    if (stdin === void 0) {
      for (const r of cmd.redirects) {
        if (r.type === "read") {
          const p = this.resolvePath(r.target);
          try {
            stdin = this.volume.readFileSync(p, "utf8");
          } catch {
            return {
              stdout: "",
              stderr: `shell: ${r.target}: No such file or directory
`,
              exitCode: 1
            };
          }
        }
      }
    }
    const savedEnv = {};
    for (const [k, v] of Object.entries(cmd.assignments)) {
      savedEnv[k] = this.env[k];
      this.env[k] = v;
    }
    const ctx = this.buildContext();
    let result;
    const builtin = builtins.get(name);
    if (builtin) {
      const r = builtin(args, ctx, stdin);
      result = r instanceof Promise ? await r : r;
      if (name === "cd") {
        this.cwd = ctx.cwd;
        this.env = ctx.env;
      }
      if (name === "export" || name === "unset") {
        this.env = ctx.env;
      }
    } else if (name === "alias") {
      result = this.handleAlias(args);
    } else if (name === "source" || name === ".") {
      result = await this.handleSource(args);
    } else if (name === "history") {
      result = { stdout: "", stderr: "", exitCode: 0 };
    } else if (this.commands.has(name)) {
      try {
        result = await this.commands.get(name).execute(args, ctx);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result = {
          stdout: "",
          stderr: `${name}: ${msg}
`,
          exitCode: 1
        };
      }
      this.cwd = ctx.cwd;
      this.env = ctx.env;
    } else {
      const resolvedBin = this.resolveFromPath(name);
      if (resolvedBin && this.commands.has("node")) {
        try {
          result = await this.commands.get("node").execute([resolvedBin, ...args], ctx);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result = {
            stdout: "",
            stderr: `${name}: ${msg}
`,
            exitCode: 1
          };
        }
        this.cwd = ctx.cwd;
        this.env = ctx.env;
      } else {
        result = {
          stdout: "",
          stderr: `${name}: command not found
`,
          exitCode: 127
        };
      }
    }
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === void 0) delete this.env[k];
      else this.env[k] = v;
    }
    result = await this.applyRedirects(result, cmd);
    this.lastExit = result.exitCode;
    return result;
  }
  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */
  buildContext() {
    return {
      cwd: this.cwd,
      env: { ...this.env },
      volume: this.volume,
      exec: (cmd, opts) => this.exec(cmd, opts)
    };
  }
  resolvePath(p) {
    if (p.startsWith("/")) return this.normalizePath(p);
    return this.normalizePath(`${this.cwd}/${p}`);
  }
  // Search PATH for a command. Parses .bin stubs to find the real JS entry point.
  resolveFromPath(name) {
    const pathStr = this.env.PATH || "";
    const dirs = pathStr.split(":");
    for (const dir of dirs) {
      if (!dir) continue;
      const candidate = `${dir}/${name}`;
      if (!this.volume.existsSync(candidate)) continue;
      try {
        const content = this.volume.readFileSync(candidate, "utf8");
        const match = content.match(/node\s+"([^"]+)"/);
        if (match && this.volume.existsSync(match[1])) {
          return match[1];
        }
        if (content.startsWith("#!/") || content.startsWith("'use strict'") || content.startsWith('"use strict"') || content.startsWith("var ") || content.startsWith("const ") || content.startsWith("import ") || content.startsWith("module.")) {
          return candidate;
        }
      } catch {
      }
    }
    return null;
  }
  normalizePath(raw) {
    const parts = raw.split("/").filter(Boolean);
    const stack = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part !== ".") stack.push(part);
    }
    return "/" + stack.join("/");
  }
  async applyRedirects(result, cmd) {
    let { stdout, stderr, exitCode } = result;
    for (const r of cmd.redirects) {
      if (r.type === "stderr-to-stdout") {
        stdout += stderr;
        stderr = "";
        continue;
      }
      if (r.type === "write" || r.type === "append") {
        const p = this.resolvePath(r.target);
        try {
          if (r.type === "append" && this.volume.existsSync(p)) {
            const existing = this.volume.readFileSync(p, "utf8");
            this.volume.writeFileSync(p, existing + stdout);
          } else {
            const dir = this.normalizePath(p.substring(0, p.lastIndexOf("/")));
            if (dir && dir !== "/" && !this.volume.existsSync(dir)) {
              this.volume.mkdirSync(dir, { recursive: true });
            }
            this.volume.writeFileSync(p, stdout);
          }
          stdout = "";
        } catch (e) {
          stderr += `shell: ${r.target}: ${e instanceof Error ? e.message : "Cannot write"}
`;
          exitCode = 1;
        }
      }
    }
    return { stdout, stderr, exitCode };
  }
  async expandCommandSubstitution(input) {
    let result = "";
    let i = 0;
    while (i < input.length) {
      if (input[i] === "'") {
        result += "'";
        i++;
        while (i < input.length && input[i] !== "'") {
          result += input[i++];
        }
        if (i < input.length) result += input[i++];
        continue;
      }
      if (input[i] === "$" && input[i + 1] === "(") {
        i += 2;
        let depth = 1;
        let subCmd = "";
        while (i < input.length && depth > 0) {
          if (input[i] === "(") depth++;
          if (input[i] === ")") depth--;
          if (depth > 0) subCmd += input[i];
          i++;
        }
        const subResult = await this.exec(subCmd);
        result += subResult.stdout.replace(/\n$/, "");
        continue;
      }
      if (input[i] === "`") {
        i++;
        let subCmd = "";
        while (i < input.length && input[i] !== "`") {
          subCmd += input[i++];
        }
        if (i < input.length) i++;
        const subResult = await this.exec(subCmd);
        result += subResult.stdout.replace(/\n$/, "");
        continue;
      }
      result += input[i++];
    }
    return result;
  }
  handleAlias(args) {
    if (args.length === 0) {
      let out = "";
      for (const [k, v] of this.aliases) out += `alias ${k}='${v}'
`;
      return { stdout: out, stderr: "", exitCode: 0 };
    }
    for (const arg of args) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        let val = arg.slice(eq + 1);
        if (val.startsWith("'") && val.endsWith("'") || val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        this.aliases.set(arg.slice(0, eq), val);
      } else {
        const val = this.aliases.get(arg);
        if (val)
          return { stdout: `alias ${arg}='${val}'
`, stderr: "", exitCode: 0 };
        return {
          stdout: "",
          stderr: `alias: ${arg}: not found
`,
          exitCode: 1
        };
      }
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  }
  async handleSource(args) {
    if (args.length === 0) {
      return {
        stdout: "",
        stderr: "source: missing file argument\n",
        exitCode: 1
      };
    }
    const p = this.resolvePath(args[0]);
    try {
      const content = this.volume.readFileSync(p, "utf8");
      return this.exec(content);
    } catch {
      return {
        stdout: "",
        stderr: `source: ${args[0]}: No such file or directory
`,
        exitCode: 1
      };
    }
  }
}

const A_RESET$5 = "\x1B[0m";
const A_BOLD$5 = "\x1B[1m";
const A_CYAN$4 = "\x1B[36m";
function createNpmCommand(deps) {
  return {
    name: "npm",
    async execute(params, ctx) {
      if (!deps.hasFile("/"))
        return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
      const sub = params[0];
      if (!sub || sub === "help" || sub === "--help") {
        return {
          stdout: `${A_BOLD$5}Usage:${A_RESET$5} npm <command>

${A_BOLD$5}Commands:${A_RESET$5}
  ${A_CYAN$4}run${A_RESET$5} <script>      Run a package.json script
  ${A_CYAN$4}start${A_RESET$5}             Alias for npm run start
  ${A_CYAN$4}test${A_RESET$5}              Alias for npm run test
  ${A_CYAN$4}install${A_RESET$5} [pkg]     Install packages
  ${A_CYAN$4}uninstall${A_RESET$5} <pkg>   Remove a package
  ${A_CYAN$4}ls${A_RESET$5}                List installed packages
  ${A_CYAN$4}init${A_RESET$5}              Create a package.json
  ${A_CYAN$4}create${A_RESET$5} <pkg>      Create a project (runs create-<pkg>)
  ${A_CYAN$4}version${A_RESET$5}           Show version info
  ${A_CYAN$4}info${A_RESET$5} <pkg>        Show package info
  ${A_CYAN$4}exec${A_RESET$5} <cmd>        Execute a package binary
  ${A_CYAN$4}prefix${A_RESET$5}            Show prefix
  ${A_CYAN$4}root${A_RESET$5}              Show node_modules path
  ${A_CYAN$4}bin${A_RESET$5}               Show bin directory
  ${A_CYAN$4}config${A_RESET$5}            Manage configuration
`,
          stderr: "",
          exitCode: 0
        };
      }
      switch (sub) {
        case "run":
        case "run-script":
          return deps.runScript(params.slice(1), ctx);
        case "start":
          return deps.runScript(["start"], ctx);
        case "test":
        case "t":
        case "tst":
          return deps.runScript(["test"], ctx);
        case "install":
        case "i":
        case "add":
          return deps.installPackages(params.slice(1), ctx);
        case "ci":
          try {
            deps.removeNodeModules(ctx.cwd);
          } catch {
          }
          return deps.installPackages([], ctx);
        case "uninstall":
        case "remove":
        case "rm":
        case "un":
          return deps.uninstallPackages(params.slice(1), ctx);
        case "ls":
        case "list":
          return deps.listPackages(ctx);
        case "init":
        case "create":
          return deps.npmInitOrCreate(params.slice(1), sub, ctx);
        case "version":
        case "-v":
        case "--version":
          return { stdout: index.VERSIONS.NPM + "\n", stderr: "", exitCode: 0 };
        case "info":
        case "view":
        case "show":
          return deps.npmInfo(params.slice(1), ctx);
        case "exec":
          return deps.npxExecute(params.slice(1), ctx);
        case "prefix":
          return { stdout: ctx.cwd + "\n", stderr: "", exitCode: 0 };
        case "root":
          return {
            stdout: ctx.cwd + "/node_modules\n",
            stderr: "",
            exitCode: 0
          };
        case "bin":
          return {
            stdout: ctx.cwd + "/node_modules/.bin\n",
            stderr: "",
            exitCode: 0
          };
        case "pack":
          return deps.npmPack(ctx);
        case "config":
        case "c":
          return deps.npmConfig(params.slice(1), ctx);
        case "outdated":
          return {
            stdout: "",
            stderr: deps.formatWarn(
              "outdated check not available in nodepod",
              "npm"
            ),
            exitCode: 0
          };
        case "audit":
          return {
            stdout: "found 0 vulnerabilities\n",
            stderr: "",
            exitCode: 0
          };
        case "fund":
          return {
            stdout: "0 packages are looking for funding\n",
            stderr: "",
            exitCode: 0
          };
        case "cache":
          if (params[1] === "clean" || params[1] === "clear") {
            return { stdout: "Cache cleared.\n", stderr: "", exitCode: 0 };
          }
          return {
            stdout: "",
            stderr: deps.formatErr(
              `cache: unknown subcommand ${params[1] ?? ""}`,
              "npm"
            ),
            exitCode: 1
          };
        case "whoami":
          return { stdout: "nodepod-user\n", stderr: "", exitCode: 0 };
        case "ping":
          return {
            stdout: `PING ${index.NPM_REGISTRY_URL_SLASH} - ok
`,
            stderr: "",
            exitCode: 0
          };
        case "set-script": {
          const scriptName = params[1];
          const scriptCmd = params.slice(2).join(" ");
          if (!scriptName || !scriptCmd) {
            return {
              stdout: "",
              stderr: deps.formatErr(
                "Usage: npm set-script <name> <command>",
                "npm"
              ),
              exitCode: 1
            };
          }
          try {
            const pkgPath = ctx.cwd + "/package.json";
            const raw = deps.readFile(pkgPath);
            const pkg = JSON.parse(raw);
            if (!pkg.scripts) pkg.scripts = {};
            pkg.scripts[scriptName] = scriptCmd;
            deps.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
            return {
              stdout: "",
              stderr: deps.formatWarn(
                '`set-script` is deprecated. Use `npm pkg set scripts.${scriptName}="${scriptCmd}"` instead.',
                "npm"
              ),
              exitCode: 0
            };
          } catch (e) {
            return {
              stdout: "",
              stderr: deps.formatErr(
                e.message || "Failed to update package.json",
                "npm"
              ),
              exitCode: 1
            };
          }
        }
        case "pkg":
          return deps.npmPkg ? deps.npmPkg(params.slice(1), ctx) : {
            stdout: "",
            stderr: deps.formatErr("npm pkg not implemented", "npm"),
            exitCode: 1
          };
        default:
          return {
            stdout: "",
            stderr: deps.formatErr(`Unknown command "${sub}"`, "npm"),
            exitCode: 1
          };
      }
    }
  };
}

const A_RESET$4 = "\x1B[0m";
const A_BOLD$4 = "\x1B[1m";
const A_CYAN$3 = "\x1B[36m";
function createPnpmCommand(deps) {
  return {
    name: "pnpm",
    async execute(params, ctx) {
      if (!deps.hasFile("/"))
        return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
      const sub = params[0];
      if (!sub || sub === "help" || sub === "--help") {
        return {
          stdout: `${A_BOLD$4}Usage:${A_RESET$4} pnpm <command>

${A_BOLD$4}Manage your dependencies:${A_RESET$4}
  ${A_CYAN$3}add${A_RESET$4} [pkg]         Install packages
  ${A_CYAN$3}install${A_RESET$4}           Install from manifest
  ${A_CYAN$3}remove${A_RESET$4} <pkg>      Remove a package
  ${A_CYAN$3}list${A_RESET$4}              List installed packages

${A_BOLD$4}Run your scripts:${A_RESET$4}
  ${A_CYAN$3}run${A_RESET$4} <script>      Run a script
  ${A_CYAN$3}exec${A_RESET$4} <cmd>        Execute a package binary
  ${A_CYAN$3}dlx${A_RESET$4} <pkg>         Download and execute a package

${A_BOLD$4}Create a project:${A_RESET$4}
  ${A_CYAN$3}init${A_RESET$4}              Create a package.json
  ${A_CYAN$3}create${A_RESET$4} <pkg>      Create a project

  ${A_CYAN$3}version${A_RESET$4}           Show version info
`,
          stderr: "",
          exitCode: 0
        };
      }
      switch (sub) {
        case "add":
          return deps.installPackages(params.slice(1), ctx, "pnpm");
        case "install":
        case "i":
          return deps.installPackages(params.slice(1), ctx, "pnpm");
        case "remove":
        case "rm":
        case "uninstall":
        case "un":
          return deps.uninstallPackages(params.slice(1), ctx, "pnpm");
        case "list":
        case "ls":
          return deps.listPackages(ctx, "pnpm");
        case "run":
          return deps.runScript(params.slice(1), ctx);
        case "start":
          return deps.runScript(["start"], ctx);
        case "test":
        case "t":
          return deps.runScript(["test"], ctx);
        case "exec":
          return deps.npxExecute(params.slice(1), ctx);
        case "dlx":
          return deps.npxExecute(params.slice(1), ctx);
        case "init":
        case "create":
          return deps.npmInitOrCreate(params.slice(1), sub, ctx);
        case "version":
        case "-v":
        case "--version":
          return { stdout: index.VERSIONS.PNPM + "\n", stderr: "", exitCode: 0 };
        case "audit":
          return { stdout: "No known vulnerabilities found\n", stderr: "", exitCode: 0 };
        case "outdated":
          return { stdout: "", stderr: "", exitCode: 0 };
        case "why":
          return { stdout: "", stderr: deps.formatWarn("why: not available in nodepod", "pnpm"), exitCode: 0 };
        default:
          return { stdout: "", stderr: deps.formatErr(`Unknown command "${sub}"`, "pnpm"), exitCode: 1 };
      }
    }
  };
}

const A_RESET$3 = "\x1B[0m";
const A_BOLD$3 = "\x1B[1m";
const A_CYAN$2 = "\x1B[36m";
function createYarnCommand(deps) {
  return {
    name: "yarn",
    async execute(params, ctx) {
      if (!deps.hasFile("/"))
        return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
      const sub = params[0];
      if (!sub) return deps.installPackages([], ctx, "yarn");
      if (sub === "help" || sub === "--help") {
        return {
          stdout: `${A_BOLD$3}Usage:${A_RESET$3} yarn <command>

${A_BOLD$3}Commands:${A_RESET$3}
  ${A_CYAN$2}add${A_RESET$3} [pkg]         Install packages
  ${A_CYAN$2}install${A_RESET$3}           Install from manifest
  ${A_CYAN$2}remove${A_RESET$3} <pkg>      Remove a package
  ${A_CYAN$2}list${A_RESET$3}              List installed packages
  ${A_CYAN$2}run${A_RESET$3} <script>      Run a script
  ${A_CYAN$2}dlx${A_RESET$3} <pkg>         Download and execute a package
  ${A_CYAN$2}init${A_RESET$3}              Create a package.json
  ${A_CYAN$2}create${A_RESET$3} <pkg>      Create a project
  ${A_CYAN$2}version${A_RESET$3}           Show version info
`,
          stderr: "",
          exitCode: 0
        };
      }
      switch (sub) {
        case "add":
          return deps.installPackages(params.slice(1), ctx, "yarn");
        case "install":
        case "i":
          return deps.installPackages(params.slice(1), ctx, "yarn");
        case "remove":
        case "rm":
        case "uninstall":
          return deps.uninstallPackages(params.slice(1), ctx, "yarn");
        case "list":
        case "ls":
          return deps.listPackages(ctx, "yarn");
        case "run":
          return deps.runScript(params.slice(1), ctx);
        case "start":
          return deps.runScript(["start"], ctx);
        case "test":
        case "t":
          return deps.runScript(["test"], ctx);
        case "exec":
          return deps.npxExecute(params.slice(1), ctx);
        case "dlx":
          return deps.npxExecute(params.slice(1), ctx);
        case "init":
        case "create":
          return deps.npmInitOrCreate(params.slice(1), sub, ctx);
        case "version":
        case "-v":
        case "--version":
          return { stdout: index.VERSIONS.YARN + "\n", stderr: "", exitCode: 0 };
        case "info":
          return deps.npmInfo(params.slice(1), ctx);
        case "audit":
          return { stdout: "0 vulnerabilities found\n", stderr: "", exitCode: 0 };
        case "outdated":
          return { stdout: "", stderr: "", exitCode: 0 };
        case "why":
          return { stdout: "", stderr: deps.formatWarn("why: not available in nodepod", "yarn"), exitCode: 0 };
        case "global":
          return { stdout: "", stderr: deps.formatWarn("global: not available in nodepod", "yarn"), exitCode: 0 };
        default:
          return deps.runScript(params, ctx);
      }
    }
  };
}

const A_RESET$2 = "\x1B[0m";
const A_BOLD$2 = "\x1B[1m";
const A_DIM$1 = "\x1B[2m";
const A_GREEN$1 = "\x1B[32m";
const A_CYAN$1 = "\x1B[36m";
function createBunCommand(deps) {
  return {
    name: "bun",
    async execute(params, ctx) {
      if (!deps.hasFile("/"))
        return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
      const sub = params[0];
      if (!sub || sub === "help" || sub === "--help") {
        return {
          stdout: `${A_BOLD$2}Bun${A_RESET$2} is a fast JavaScript runtime, package manager, and bundler.

${A_DIM$1}Usage:${A_RESET$2} bun <command> [...flags] [...args]

${A_BOLD$2}Commands:${A_RESET$2}
  ${A_CYAN$1}run${A_RESET$2}       ${A_DIM$1}Run a package.json script or file${A_RESET$2}
  ${A_CYAN$1}install${A_RESET$2}   ${A_DIM$1}Install dependencies from package.json${A_RESET$2}
  ${A_CYAN$1}add${A_RESET$2}       ${A_DIM$1}Add a dependency${A_RESET$2}
  ${A_CYAN$1}remove${A_RESET$2}    ${A_DIM$1}Remove a dependency${A_RESET$2}
  ${A_CYAN$1}init${A_RESET$2}      ${A_DIM$1}Start an empty Bun project${A_RESET$2}
  ${A_CYAN$1}create${A_RESET$2}    ${A_DIM$1}Create a new project from a template${A_RESET$2}
  ${A_CYAN$1}test${A_RESET$2}      ${A_DIM$1}Run unit tests${A_RESET$2}
  ${A_CYAN$1}x${A_RESET$2}         ${A_DIM$1}Execute a package binary (bunx)${A_RESET$2}
  ${A_CYAN$1}pm${A_RESET$2}        ${A_DIM$1}Package manager utilities${A_RESET$2}
`,
          stderr: "",
          exitCode: 0
        };
      }
      switch (sub) {
        case "run":
          if (params[1] && (params[1].endsWith(".js") || params[1].endsWith(".ts") || params[1].endsWith(".mjs") || params[1].endsWith(".tsx") || params[1].endsWith(".jsx"))) {
            return deps.executeNodeBinary(params[1], params.slice(2), ctx);
          }
          return deps.runScript(params.slice(1), ctx);
        case "start":
          return deps.runScript(["start"], ctx);
        case "test":
        case "t":
          return deps.runScript(["test"], ctx);
        case "install":
        case "i":
          return deps.installPackages(params.slice(1), ctx, "bun");
        case "add":
          return deps.installPackages(params.slice(1), ctx, "bun");
        case "remove":
        case "rm":
          return deps.uninstallPackages(params.slice(1), ctx, "bun");
        case "x":
          return deps.npxExecute(params.slice(1), ctx);
        case "init":
        case "create":
          return deps.npmInitOrCreate(params.slice(1), sub, ctx);
        case "pm": {
          const pmSub = params[1];
          if (pmSub === "ls" || pmSub === "list")
            return deps.listPackages(ctx, "bun");
          if (pmSub === "cache")
            return { stdout: "Cache path: /tmp/bun-cache\n", stderr: "", exitCode: 0 };
          return {
            stdout: `${A_DIM$1}bun pm: available subcommands: ls, cache${A_RESET$2}
`,
            stderr: "",
            exitCode: 0
          };
        }
        case "version":
        case "-v":
        case "--version":
          return { stdout: index.VERSIONS.BUN + "\n", stderr: "", exitCode: 0 };
        case "upgrade":
          return {
            stdout: `${A_GREEN$1}Bun is already up to date.${A_RESET$2}
`,
            stderr: "",
            exitCode: 0
          };
        default: {
          if (params[0] && !params[0].startsWith("-")) {
            const filePath = params[0].startsWith("/") ? params[0] : `${ctx.cwd}/${params[0]}`.replace(/\/+/g, "/");
            if (deps.hasFile(filePath)) {
              return deps.executeNodeBinary(params[0], params.slice(1), ctx);
            }
            return deps.runScript(params, ctx);
          }
          return {
            stdout: "",
            stderr: `error: unknown command "${sub}"
`,
            exitCode: 1
          };
        }
      }
    }
  };
}
function createBunxCommand(deps) {
  return {
    name: "bunx",
    async execute(params, ctx) {
      return deps.npxExecute(params, ctx);
    }
  };
}

const A_RESET$1 = "\x1B[0m";
const A_BOLD$1 = "\x1B[1m";
function createNodeCommand(deps) {
  return {
    name: "node",
    async execute(params, ctx) {
      if (!deps.hasFile("/"))
        return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
      let target = null;
      let evalCode = null;
      let printCode = null;
      const scriptArgs = [];
      let collectingArgs = false;
      for (let i = 0; i < params.length; i++) {
        if (collectingArgs) {
          scriptArgs.push(params[i]);
          continue;
        }
        if (params[i] === "-e" || params[i] === "--eval") {
          evalCode = params[++i] ?? "";
        } else if (params[i] === "-p" || params[i] === "--print") {
          printCode = params[++i] ?? "";
        } else if (params[i] === "--version" || params[i] === "-v") {
          return { stdout: index.VERSIONS.NODE + "\n", stderr: "", exitCode: 0 };
        } else if (params[i] === "--help" || params[i] === "-h") {
          return {
            stdout: `${A_BOLD$1}Usage:${A_RESET$1} node [options] [script.js] [arguments]
`,
            stderr: "",
            exitCode: 0
          };
        } else if (params[i] === "-r" || params[i] === "--require" || params[i] === "--experimental-specifier-resolution" || params[i] === "--loader" || params[i] === "--import") {
          i++;
        } else if (params[i].startsWith("-")) ; else {
          target = params[i];
          collectingArgs = true;
        }
      }
      if (evalCode !== null) {
        return deps.evalCode(evalCode, ctx);
      }
      if (printCode !== null) {
        return deps.printCode(printCode, ctx);
      }
      if (!target)
        return {
          stdout: "",
          stderr: `${A_BOLD$1}Usage:${A_RESET$1} node <file> [args...]
`,
          exitCode: 1
        };
      return deps.executeNodeBinary(target, scriptArgs, ctx);
    }
  };
}
function createNpxCommand(deps) {
  return {
    name: "npx",
    async execute(params, ctx) {
      return deps.npxExecute(params, ctx);
    }
  };
}

const RED = "\x1B[31m";
const YELLOW = "\x1B[33m";
const BOLD = "\x1B[1m";
function myersDiff(oldLines, newLines) {
  const N = oldLines.length;
  const M = newLines.length;
  const MAX = N + M;
  if (MAX === 0) return [];
  const vHistory = [];
  const v = /* @__PURE__ */ new Map();
  v.set(1, 0);
  let foundD = -1;
  outer:
    for (let d = 0; d <= MAX; d++) {
      vHistory.push(new Map(v));
      for (let k = -d; k <= d; k += 2) {
        let x2;
        if (k === -d || k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0)) {
          x2 = v.get(k + 1) ?? 0;
        } else {
          x2 = (v.get(k - 1) ?? 0) + 1;
        }
        let y2 = x2 - k;
        while (x2 < N && y2 < M && oldLines[x2] === newLines[y2]) {
          x2++;
          y2++;
        }
        v.set(k, x2);
        if (x2 >= N && y2 >= M) {
          foundD = d;
          break outer;
        }
      }
    }
  if (foundD < 0) foundD = MAX;
  let x = N;
  let y = M;
  const ops = [];
  for (let d = foundD; d > 0; d--) {
    const vPrev = vHistory[d];
    const k = x - y;
    let prevK;
    if (k === -d || k !== d && (vPrev.get(k - 1) ?? 0) < (vPrev.get(k + 1) ?? 0)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vPrev.get(prevK) ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({ kind: "equal", oldIdx: x, newIdx: y, line: oldLines[x] });
    }
    if (d > 0) {
      if (x === prevX) {
        y--;
        ops.push({ kind: "insert", oldIdx: -1, newIdx: y, line: newLines[y] });
      } else {
        x--;
        ops.push({ kind: "delete", oldIdx: x, newIdx: -1, line: oldLines[x] });
      }
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    ops.push({ kind: "equal", oldIdx: x, newIdx: y, line: oldLines[x] });
  }
  ops.reverse();
  return ops;
}
function buildHunks(ops, contextLines = 3) {
  const hunks = [];
  if (ops.length === 0) return hunks;
  const changeIndices = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].kind !== "equal") changeIndices.push(i);
  }
  if (changeIndices.length === 0) return hunks;
  let groupStart = changeIndices[0];
  let groupEnd = changeIndices[0];
  const groups = [];
  for (let i = 1; i < changeIndices.length; i++) {
    if (changeIndices[i] - groupEnd <= contextLines * 2) {
      groupEnd = changeIndices[i];
    } else {
      groups.push([groupStart, groupEnd]);
      groupStart = changeIndices[i];
      groupEnd = changeIndices[i];
    }
  }
  groups.push([groupStart, groupEnd]);
  for (const [gStart, gEnd] of groups) {
    const hunkOpsStart = Math.max(0, gStart - contextLines);
    const hunkOpsEnd = Math.min(ops.length - 1, gEnd + contextLines);
    const hunkOps = ops.slice(hunkOpsStart, hunkOpsEnd + 1);
    let oldStart = Infinity;
    let newStart = Infinity;
    let oldCount = 0;
    let newCount = 0;
    for (const op of hunkOps) {
      if (op.kind === "equal") {
        if (op.oldIdx < oldStart) oldStart = op.oldIdx;
        if (op.newIdx < newStart) newStart = op.newIdx;
        oldCount++;
        newCount++;
      } else if (op.kind === "delete") {
        if (op.oldIdx < oldStart) oldStart = op.oldIdx;
        oldCount++;
      } else {
        if (op.newIdx < newStart) newStart = op.newIdx;
        newCount++;
      }
    }
    hunks.push({
      oldStart: (oldStart === Infinity ? 0 : oldStart) + 1,
      oldCount,
      newStart: (newStart === Infinity ? 0 : newStart) + 1,
      newCount,
      lines: hunkOps
    });
  }
  return hunks;
}
function countChanges(ops) {
  let insertions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.kind === "insert") insertions++;
    else if (op.kind === "delete") deletions++;
  }
  return { insertions, deletions };
}
class GitRepo {
  vol;
  gitDir;
  workDir;
  constructor(vol, workDir, gitDir) {
    this.vol = vol;
    this.workDir = workDir;
    this.gitDir = gitDir;
  }
  /* -- object store -- */
  readStore() {
    try {
      const raw = this.vol.readFileSync(this.gitDir + "/objects/store.json", "utf8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  writeStore(store) {
    this.vol.writeFileSync(this.gitDir + "/objects/store.json", JSON.stringify(store));
  }
  hashContent(type, content) {
    const header = `${type} ${content.length}\0`;
    return index.createHash("sha1").update(header + content).digest("hex");
  }
  writeObject(type, content) {
    const hash = this.hashContent(type, content);
    const store = this.readStore();
    if (!store[hash]) {
      store[hash] = { type, data: content };
      this.writeStore(store);
    }
    return hash;
  }
  readObject(hash) {
    const store = this.readStore();
    return store[hash] ?? null;
  }
  /* -- index (staging area) -- */
  readIndex() {
    try {
      const raw = this.vol.readFileSync(this.gitDir + "/index", "utf8");
      return JSON.parse(raw).entries ?? [];
    } catch {
      return [];
    }
  }
  writeIndex(entries) {
    this.vol.writeFileSync(this.gitDir + "/index", JSON.stringify({ entries }));
  }
  addToIndex(relPath, content) {
    const hash = this.writeObject("blob", content);
    const entries = this.readIndex();
    const idx = entries.findIndex((e) => e.path === relPath);
    const entry = { path: relPath, hash, mode: 100644, mtime: Date.now() };
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    this.writeIndex(entries);
  }
  removeFromIndex(relPath) {
    const entries = this.readIndex().filter((e) => e.path !== relPath);
    this.writeIndex(entries);
  }
  /* -- refs -- */
  getHEAD() {
    try {
      return this.vol.readFileSync(this.gitDir + "/HEAD", "utf8").trim();
    } catch {
      return "ref: refs/heads/main";
    }
  }
  setHEAD(value) {
    this.vol.writeFileSync(this.gitDir + "/HEAD", value + "\n");
  }
  getCurrentBranch() {
    const head = this.getHEAD();
    if (head.startsWith("ref: refs/heads/")) return head.slice(16);
    return null;
  }
  resolveRef(ref) {
    if (/^[0-9a-f]{40}$/.test(ref)) return ref;
    if (ref.startsWith("ref: ")) {
      const target = ref.slice(5);
      try {
        return this.vol.readFileSync(this.gitDir + "/" + target, "utf8").trim();
      } catch {
        return null;
      }
    }
    try {
      return this.vol.readFileSync(this.gitDir + "/refs/heads/" + ref, "utf8").trim();
    } catch {
    }
    try {
      return this.vol.readFileSync(this.gitDir + "/refs/tags/" + ref, "utf8").trim();
    } catch {
    }
    return null;
  }
  resolveHEAD() {
    return this.resolveRef(this.getHEAD());
  }
  updateBranchRef(branch, hash) {
    const refPath = this.gitDir + "/refs/heads/" + branch;
    const dir = refPath.substring(0, refPath.lastIndexOf("/"));
    if (!this.vol.existsSync(dir)) this.vol.mkdirSync(dir, { recursive: true });
    this.vol.writeFileSync(refPath, hash + "\n");
  }
  listBranches() {
    try {
      return this.vol.readdirSync(this.gitDir + "/refs/heads");
    } catch {
      return [];
    }
  }
  deleteBranch(name) {
    try {
      const refPath = this.gitDir + "/refs/heads/" + name;
      if (this.vol.existsSync(refPath)) {
        this.vol.unlinkSync(refPath);
        return true;
      }
    } catch {
    }
    return false;
  }
  /* -- config -- */
  readConfig() {
    try {
      return this.vol.readFileSync(this.gitDir + "/config", "utf8");
    } catch {
      return "";
    }
  }
  writeConfig(content) {
    this.vol.writeFileSync(this.gitDir + "/config", content);
  }
  getConfigValue(key) {
    const config = this.readConfig();
    const parts = key.split(".");
    if (parts.length < 2) return null;
    let sectionName;
    let subSection = null;
    let propName;
    if (parts.length === 3) {
      sectionName = parts[0];
      subSection = parts[1];
      propName = parts[2];
    } else {
      sectionName = parts[0];
      propName = parts[1];
    }
    const lines = config.split("\n");
    let inSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[")) {
        if (subSection) {
          const pat = `[${sectionName} "${subSection}"]`;
          inSection = trimmed === pat;
        } else {
          inSection = trimmed === `[${sectionName}]`;
        }
        continue;
      }
      if (inSection) {
        const match = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
        if (match && match[1] === propName) return match[2].trim();
      }
    }
    return null;
  }
  setConfigValue(key, value) {
    const parts = key.split(".");
    let sectionHeader;
    let propName;
    if (parts.length === 3) {
      sectionHeader = `[${parts[0]} "${parts[1]}"]`;
      propName = parts[2];
    } else if (parts.length === 2) {
      sectionHeader = `[${parts[0]}]`;
      propName = parts[1];
    } else {
      return;
    }
    const config = this.readConfig();
    const lines = config.split("\n");
    let sectionIdx = -1;
    let propIdx = -1;
    let inSection = false;
    let lastLineInSection = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("[")) {
        if (inSection && propIdx === -1) lastLineInSection = i - 1;
        inSection = trimmed === sectionHeader;
        if (inSection) sectionIdx = i;
        continue;
      }
      if (inSection) {
        lastLineInSection = i;
        const match = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
        if (match && match[1] === propName) propIdx = i;
      }
    }
    if (inSection && lastLineInSection === -1) lastLineInSection = sectionIdx;
    if (propIdx >= 0) {
      lines[propIdx] = `	${propName} = ${value}`;
    } else if (sectionIdx >= 0) {
      lines.splice(lastLineInSection + 1, 0, `	${propName} = ${value}`);
    } else {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      lines.push(sectionHeader);
      lines.push(`	${propName} = ${value}`);
    }
    this.writeConfig(lines.join("\n"));
  }
  /* -- tree building -- */
  buildTree(entries) {
    const root = [];
    const subdirs = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const slashIdx = e.path.indexOf("/");
      if (slashIdx === -1) {
        root.push({ name: e.path, mode: String(e.mode), type: "blob", hash: e.hash });
      } else {
        const dir = e.path.substring(0, slashIdx);
        const rest = { ...e, path: e.path.substring(slashIdx + 1) };
        if (!subdirs.has(dir)) subdirs.set(dir, []);
        subdirs.get(dir).push(rest);
      }
    }
    for (const [dir, subEntries] of subdirs) {
      const treeHash = this.buildTree(subEntries);
      root.push({ name: dir, mode: "40000", type: "tree", hash: treeHash });
    }
    root.sort((a, b) => a.name.localeCompare(b.name));
    const treeContent = JSON.stringify(root);
    return this.writeObject("tree", treeContent);
  }
  /* -- commits -- */
  createCommit(message, parent, tree, parent2) {
    const author = `${this.getConfigValue("user.name") ?? "nodepod-user"} <${this.getConfigValue("user.email") ?? "user@nodepod.dev"}>`;
    const data = {
      tree,
      parent,
      author,
      committer: author,
      timestamp: Date.now(),
      message
    };
    if (parent2) data.parent2 = parent2;
    return this.writeObject("commit", JSON.stringify(data));
  }
  readCommit(hash) {
    const obj = this.readObject(hash);
    if (!obj || obj.type !== "commit") return null;
    return JSON.parse(obj.data);
  }
  walkLog(startHash, limit) {
    const result = [];
    let current = startHash;
    while (current && result.length < limit) {
      const commit = this.readCommit(current);
      if (!commit) break;
      result.push({ hash: current, ...commit });
      current = commit.parent;
    }
    return result;
  }
  /* -- working tree helpers -- */
  getCommitTree(commitHash) {
    const commit = this.readCommit(commitHash);
    if (!commit) return /* @__PURE__ */ new Map();
    return this.flattenTree(commit.tree, "");
  }
  flattenTree(treeHash, prefix) {
    const obj = this.readObject(treeHash);
    if (!obj || obj.type !== "tree") return /* @__PURE__ */ new Map();
    const entries = JSON.parse(obj.data);
    const result = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const fullPath = prefix ? prefix + "/" + e.name : e.name;
      if (e.type === "blob") {
        result.set(fullPath, e.hash);
      } else {
        for (const [k, v] of this.flattenTree(e.hash, fullPath)) {
          result.set(k, v);
        }
      }
    }
    return result;
  }
  getBlobContent(hash) {
    const obj = this.readObject(hash);
    if (!obj || obj.type !== "blob") return null;
    return obj.data;
  }
  /* -- diff helpers -- */
  diffWorkingVsIndex() {
    const index = this.readIndex();
    const indexMap = new Map(index.map((e) => [e.path, e.hash]));
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    this.walkWorkTree(this.workDir, "", (relPath, content) => {
      seen.add(relPath);
      const currentHash = this.hashContent("blob", content);
      const indexHash = indexMap.get(relPath);
      if (!indexHash) ; else if (currentHash !== indexHash) {
        result.push({ path: relPath, status: "modified", oldContent: this.getBlobContent(indexHash) ?? "", newContent: content });
      }
    });
    for (const e of index) {
      if (!seen.has(e.path)) {
        result.push({ path: e.path, status: "deleted", oldContent: this.getBlobContent(e.hash) ?? "" });
      }
    }
    return result;
  }
  diffIndexVsHEAD() {
    const index = this.readIndex();
    const headHash = this.resolveHEAD();
    const headTree = headHash ? this.getCommitTree(headHash) : /* @__PURE__ */ new Map();
    const result = [];
    const indexMap = new Map(index.map((e) => [e.path, e.hash]));
    for (const e of index) {
      const headBlobHash = headTree.get(e.path);
      if (!headBlobHash) {
        result.push({ path: e.path, status: "added" });
      } else if (headBlobHash !== e.hash) {
        result.push({ path: e.path, status: "modified" });
      }
    }
    for (const [path] of headTree) {
      if (!indexMap.has(path)) {
        result.push({ path, status: "deleted" });
      }
    }
    return result;
  }
  getUntrackedFiles() {
    const index = this.readIndex();
    const indexPaths = new Set(index.map((e) => e.path));
    const untracked = [];
    this.walkWorkTree(this.workDir, "", (relPath) => {
      if (!indexPaths.has(relPath)) untracked.push(relPath);
    });
    return untracked.sort();
  }
  /* -- file tree walker -- */
  walkWorkTree(dir, prefix, cb) {
    let entries;
    try {
      entries = this.vol.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === ".git" || name === "node_modules") continue;
      const fullPath = dir + "/" + name;
      try {
        const stat = this.vol.statSync(fullPath);
        if (stat.isDirectory()) {
          this.walkWorkTree(fullPath, prefix ? prefix + "/" + name : name, cb);
        } else if (stat.isFile()) {
          const relPath = prefix ? prefix + "/" + name : name;
          const content = this.vol.readFileSync(fullPath, "utf8");
          cb(relPath, content);
        }
      } catch {
      }
    }
  }
  /* -- stash -- */
  readStashList() {
    try {
      const raw = this.vol.readFileSync(this.gitDir + "/refs/stash", "utf8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  writeStashList(list) {
    const dir = this.gitDir + "/refs";
    if (!this.vol.existsSync(dir)) this.vol.mkdirSync(dir, { recursive: true });
    this.vol.writeFileSync(this.gitDir + "/refs/stash", JSON.stringify(list));
  }
  /* -- remote helpers -- */
  getRemoteUrl(name) {
    return this.getConfigValue(`remote.${name}.url`);
  }
  parseGitHubUrl(url) {
    let m = url.match(/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2] };
    m = url.match(/github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2] };
    return null;
  }
}
async function githubApi(path, token, method = "GET", body) {
  const url = `https://api.github.com${path}`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `token ${token}`,
    "User-Agent": "nodepod-git"
  };
  if (body) headers["Content-Type"] = "application/json";
  const resp = await index.proxiedFetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
  let data;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  return { ok: resp.ok, status: resp.status, data };
}
function findGitDir(vol, cwd) {
  let dir = cwd;
  while (true) {
    const gitPath = dir + "/.git";
    try {
      if (vol.existsSync(gitPath)) return { gitDir: gitPath, workDir: dir };
    } catch {
    }
    const parent = dir.substring(0, dir.lastIndexOf("/")) || "/";
    if (parent === dir) break;
    dir = parent;
  }
  if (vol.existsSync("/.git")) return { gitDir: "/.git", workDir: "/" };
  return null;
}
function requireRepo(vol, cwd) {
  const found = findGitDir(vol, cwd);
  if (!found) {
    return { error: fail("fatal: not a git repository (or any of the parent directories): .git\n", 128) };
  }
  return { repo: new GitRepo(vol, found.workDir, found.gitDir) };
}
function gitInit(args, ctx) {
  let target = ctx.cwd;
  for (const a of args) {
    if (!a.startsWith("-")) {
      target = index.resolve(ctx.cwd, a);
      break;
    }
  }
  const gitDir = target + "/.git";
  if (ctx.volume.existsSync(gitDir)) {
    return ok(`Reinitialized existing Git repository in ${gitDir}/
`);
  }
  const dirs = [
    gitDir,
    gitDir + "/objects",
    gitDir + "/refs",
    gitDir + "/refs/heads",
    gitDir + "/refs/tags"
  ];
  for (const d of dirs) {
    if (!ctx.volume.existsSync(d)) ctx.volume.mkdirSync(d, { recursive: true });
  }
  ctx.volume.writeFileSync(gitDir + "/HEAD", "ref: refs/heads/main\n");
  ctx.volume.writeFileSync(
    gitDir + "/config",
    "[core]\n	bare = false\n	filemode = false\n[user]\n	name = nodepod-user\n	email = user@nodepod.dev\n"
  );
  ctx.volume.writeFileSync(gitDir + "/objects/store.json", "{}");
  ctx.volume.writeFileSync(gitDir + "/index", '{"entries":[]}');
  if (!ctx.volume.existsSync(target)) ctx.volume.mkdirSync(target, { recursive: true });
  return ok(`Initialized empty Git repository in ${gitDir}/
`);
}
function gitAdd(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const addAll = args.includes("-A") || args.includes("--all") || args.includes(".");
  const pathspecs = addAll ? [] : args.filter((a) => !a.startsWith("-"));
  if (!addAll && pathspecs.length === 0) {
    return fail("Nothing specified, nothing added.\n");
  }
  if (addAll) {
    repo.walkWorkTree(repo.workDir, "", (relPath, content) => {
      repo.addToIndex(relPath, content);
    });
    const index = repo.readIndex();
    const toRemove = [];
    for (const e of index) {
      const fullPath = repo.workDir + "/" + e.path;
      if (!ctx.volume.existsSync(fullPath)) toRemove.push(e.path);
    }
    for (const p of toRemove) repo.removeFromIndex(p);
  } else {
    for (const spec of pathspecs) {
      const absPath = index.resolve(ctx.cwd, spec);
      const relPath = index.relative(repo.workDir, absPath);
      if (relPath.startsWith("..")) continue;
      if (ctx.volume.existsSync(absPath)) {
        try {
          const stat = ctx.volume.statSync(absPath);
          if (stat.isDirectory()) {
            repo.walkWorkTree(absPath, relPath, (rp, content) => {
              repo.addToIndex(rp, content);
            });
          } else {
            const content = ctx.volume.readFileSync(absPath, "utf8");
            repo.addToIndex(relPath, content);
          }
        } catch {
        }
      } else {
        repo.removeFromIndex(relPath);
      }
    }
  }
  return ok("");
}
function gitStatus(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const short = args.includes("-s") || args.includes("--short");
  const porcelain = args.includes("--porcelain");
  const staged = repo.diffIndexVsHEAD();
  const unstaged = repo.diffWorkingVsIndex();
  const untracked = repo.getUntrackedFiles();
  if (short || porcelain) {
    let out2 = "";
    for (const d of staged) {
      const code = d.status === "added" ? "A" : d.status === "deleted" ? "D" : "M";
      out2 += `${code}  ${d.path}
`;
    }
    for (const d of unstaged) {
      const code = d.status === "deleted" ? "D" : "M";
      out2 += ` ${code} ${d.path}
`;
    }
    for (const p of untracked) {
      out2 += `?? ${p}
`;
    }
    return ok(out2);
  }
  const branch = repo.getCurrentBranch() ?? "(HEAD detached)";
  let out = `On branch ${branch}
`;
  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
    out += "nothing to commit, working tree clean\n";
    return ok(out);
  }
  if (staged.length > 0) {
    out += `
Changes to be committed:
`;
    out += `  (use "git restore --staged <file>..." to unstage)
`;
    for (const d of staged) {
      const label = d.status === "added" ? "new file" : d.status === "deleted" ? "deleted" : "modified";
      out += `	${GREEN}${label}:   ${d.path}${RESET}
`;
    }
  }
  if (unstaged.length > 0) {
    out += `
Changes not staged for commit:
`;
    out += `  (use "git add <file>..." to update what will be committed)
`;
    for (const d of unstaged) {
      const label = d.status === "deleted" ? "deleted" : "modified";
      out += `	${RED}${label}:   ${d.path}${RESET}
`;
    }
  }
  if (untracked.length > 0) {
    out += `
Untracked files:
`;
    out += `  (use "git add <file>..." to include in what will be committed)
`;
    for (const p of untracked) {
      out += `	${RED}${p}${RESET}
`;
    }
  }
  return ok(out);
}
function gitCommit(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  let message = null;
  let autoStage = false;
  let allowEmpty = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" || args[i] === "--message") {
      message = args[++i] ?? "";
    } else if (args[i] === "-a" || args[i] === "--all") {
      autoStage = true;
    } else if (args[i] === "--allow-empty") {
      allowEmpty = true;
    } else if (args[i] === "--allow-empty-message") ; else if (args[i].startsWith("-m")) {
      message = args[i].slice(2);
    }
  }
  if (message === null) {
    return fail("error: switch `m' requires a value\n");
  }
  if (autoStage) {
    const index = repo.readIndex();
    for (const e of index) {
      const fullPath = repo.workDir + "/" + e.path;
      if (ctx.volume.existsSync(fullPath)) {
        try {
          const content = ctx.volume.readFileSync(fullPath, "utf8");
          repo.addToIndex(e.path, content);
        } catch {
        }
      } else {
        repo.removeFromIndex(e.path);
      }
    }
  }
  const entries = repo.readIndex();
  const staged = repo.diffIndexVsHEAD();
  if (staged.length === 0 && !allowEmpty) {
    return fail("nothing to commit, working tree clean\n");
  }
  const treeHash = repo.buildTree(entries);
  const parent = repo.resolveHEAD();
  const commitHash = repo.createCommit(message, parent, treeHash);
  const branch = repo.getCurrentBranch();
  if (branch) {
    repo.updateBranchRef(branch, commitHash);
  } else {
    repo.setHEAD(commitHash);
  }
  const shortHash = commitHash.slice(0, 7);
  const branchLabel = branch ?? "HEAD";
  const isRoot = !parent;
  const out = `[${branchLabel}${isRoot ? " (root-commit)" : ""} ${shortHash}] ${message}
 ${staged.length} file${staged.length !== 1 ? "s" : ""} changed
`;
  return ok(out);
}
function gitLog(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  let limit = 50;
  let oneline = false;
  let format = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--oneline") {
      oneline = true;
    } else if (args[i] === "-n" || args[i] === "--max-count") {
      limit = parseInt(args[++i], 10) || 50;
    } else if (args[i].startsWith("-") && /^-\d+$/.test(args[i])) {
      limit = parseInt(args[i].slice(1), 10) || 50;
    } else if (args[i].startsWith("--format=")) {
      format = args[i].slice(9);
    } else if (args[i].startsWith("--pretty=format:")) {
      format = args[i].slice(16);
    } else if (args[i].startsWith("--pretty=")) {
      format = args[i].slice(9);
    }
  }
  const head = repo.resolveHEAD();
  if (!head) return ok("");
  const commits = repo.walkLog(head, limit);
  if (commits.length === 0) return ok("");
  const currentBranch = repo.getCurrentBranch();
  let out = "";
  for (const c of commits) {
    if (format !== null) {
      let line = format.replace(/%H/g, c.hash).replace(/%h/g, c.hash.slice(0, 7)).replace(/%s/g, c.message.split("\n")[0]).replace(/%an/g, c.author.split(" <")[0]).replace(/%ae/g, (c.author.match(/<(.+?)>/) ?? ["", ""])[1]).replace(/%d/g, c.hash === head && currentBranch ? ` (HEAD -> ${currentBranch})` : "").replace(/%n/g, "\n");
      out += line + "\n";
    } else if (oneline) {
      const decoration = c.hash === head && currentBranch ? ` ${YELLOW}(HEAD -> ${CYAN}${currentBranch}${YELLOW})${RESET}` : "";
      out += `${YELLOW}${c.hash.slice(0, 7)}${RESET}${decoration} ${c.message.split("\n")[0]}
`;
    } else {
      const decoration = c.hash === head && currentBranch ? ` ${YELLOW}(HEAD -> ${CYAN}${currentBranch}${YELLOW})${RESET}` : "";
      out += `${YELLOW}commit ${c.hash}${RESET}${decoration}
`;
      out += `Author: ${c.author}
`;
      out += `Date:   ${new Date(c.timestamp).toUTCString()}
`;
      out += `
    ${c.message}

`;
    }
  }
  return ok(out);
}
function gitDiff(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const staged = args.includes("--staged") || args.includes("--cached");
  const stat = args.includes("--stat");
  let diffs;
  if (staged) {
    diffs = repo.diffIndexVsHEAD();
    const headHash = repo.resolveHEAD();
    const headTree = headHash ? repo.getCommitTree(headHash) : /* @__PURE__ */ new Map();
    const index = repo.readIndex();
    const indexMap = new Map(index.map((e) => [e.path, e.hash]));
    for (const d of diffs) {
      const oldHash = headTree.get(d.path);
      const newHash = indexMap.get(d.path);
      d.oldContent = oldHash ? repo.getBlobContent(oldHash) ?? "" : "";
      d.newContent = newHash ? repo.getBlobContent(newHash) ?? "" : "";
    }
  } else {
    diffs = repo.diffWorkingVsIndex();
  }
  if (diffs.length === 0) return ok("");
  if (stat) {
    let out2 = "";
    let totalIns = 0;
    let totalDel = 0;
    for (const d of diffs) {
      const oldLines = d.oldContent ? d.oldContent.split("\n") : [];
      const newLines = d.newContent ? d.newContent.split("\n") : [];
      const ops = myersDiff(oldLines, newLines);
      const { insertions: ins, deletions: del } = countChanges(ops);
      totalIns += ins;
      totalDel += del;
      out2 += ` ${d.path} | ${ins + del} ${GREEN}${"+".repeat(ins)}${RED}${"-".repeat(del)}${RESET}
`;
    }
    out2 += ` ${diffs.length} file${diffs.length !== 1 ? "s" : ""} changed`;
    if (totalIns > 0) out2 += `, ${totalIns} insertion${totalIns !== 1 ? "s" : ""}(+)`;
    if (totalDel > 0) out2 += `, ${totalDel} deletion${totalDel !== 1 ? "s" : ""}(-)`;
    out2 += "\n";
    return ok(out2);
  }
  let out = "";
  for (const d of diffs) {
    const oldLines = d.oldContent ? d.oldContent.split("\n") : [];
    const newLines = d.newContent ? d.newContent.split("\n") : [];
    out += `${BOLD}diff --git a/${d.path} b/${d.path}${RESET}
`;
    if (d.status === "added") out += "new file mode 100644\n";
    if (d.status === "deleted") out += "deleted file mode 100644\n";
    out += `--- ${d.status === "added" ? "/dev/null" : "a/" + d.path}
`;
    out += `+++ ${d.status === "deleted" ? "/dev/null" : "b/" + d.path}
`;
    const ops = myersDiff(oldLines, newLines);
    const hunks = buildHunks(ops, 3);
    for (const hunk of hunks) {
      out += `${CYAN}@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${RESET}
`;
      for (const op of hunk.lines) {
        if (op.kind === "equal") {
          out += ` ${op.line}
`;
        } else if (op.kind === "delete") {
          out += `${RED}-${op.line}${RESET}
`;
        } else {
          out += `${GREEN}+${op.line}${RESET}
`;
        }
      }
    }
  }
  return ok(out);
}
function gitBranch(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  if (args.includes("--show-current")) {
    const branch = repo.getCurrentBranch();
    return ok(branch ? branch + "\n" : "\n");
  }
  const deleteIdx = args.indexOf("-d") !== -1 ? args.indexOf("-d") : args.indexOf("-D");
  if (deleteIdx >= 0) {
    const name = args[deleteIdx + 1];
    if (!name) return fail("error: branch name required\n");
    if (name === repo.getCurrentBranch()) {
      return fail(`error: Cannot delete branch '${name}' checked out.
`);
    }
    if (repo.deleteBranch(name)) {
      return ok(`Deleted branch ${name}.
`);
    }
    return fail(`error: branch '${name}' not found.
`);
  }
  const renameIdx = args.indexOf("-m");
  if (renameIdx >= 0) {
    const oldName = args[renameIdx + 1];
    const newName = args[renameIdx + 2];
    if (!oldName || !newName) return fail("error: too few arguments to rename\n");
    const hash = repo.resolveRef(oldName);
    if (!hash) return fail(`error: refname ${oldName} not a valid ref
`);
    repo.updateBranchRef(newName, hash);
    repo.deleteBranch(oldName);
    if (repo.getCurrentBranch() === oldName) {
      repo.setHEAD("ref: refs/heads/" + newName);
    }
    return ok(`Branch '${oldName}' renamed to '${newName}'.
`);
  }
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  if (nonFlags.length > 0) {
    const name = nonFlags[0];
    const startPoint = nonFlags[1];
    const hash = startPoint ? repo.resolveRef(startPoint) : repo.resolveHEAD();
    if (!hash) return fail(`fatal: not a valid object name: '${startPoint ?? "HEAD"}'
`, 128);
    repo.updateBranchRef(name, hash);
    return ok("");
  }
  const branches = repo.listBranches();
  const current = repo.getCurrentBranch();
  let out = "";
  for (const b of branches.sort()) {
    if (b === current) {
      out += `* ${GREEN}${b}${RESET}
`;
    } else {
      out += `  ${b}
`;
    }
  }
  return ok(out);
}
function gitCheckout(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const createNew = args.includes("-b");
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  if (nonFlags.length === 0) return fail("error: you must specify a branch to checkout\n");
  let target;
  let newBranchName = null;
  if (createNew) {
    const bIdx = args.indexOf("-b");
    newBranchName = args[bIdx + 1];
    if (!newBranchName) return fail("error: switch 'b' requires a value\n");
    target = args[bIdx + 2] ?? repo.getCurrentBranch() ?? "HEAD";
  } else {
    target = nonFlags[0];
  }
  let commitHash = repo.resolveRef(target);
  if (createNew) {
    if (!commitHash) commitHash = repo.resolveHEAD();
    if (!commitHash) return fail(`fatal: not a valid object name: '${target}'
`, 128);
    repo.updateBranchRef(newBranchName, commitHash);
    repo.setHEAD("ref: refs/heads/" + newBranchName);
    return ok(`Switched to a new branch '${newBranchName}'
`);
  }
  const branches = repo.listBranches();
  const isBranch = branches.includes(target);
  if (!commitHash) {
    return fail(`error: pathspec '${target}' did not match any file(s) known to git.
`);
  }
  const currentHead = repo.resolveHEAD();
  if (commitHash !== currentHead) {
    const targetTree = repo.getCommitTree(commitHash);
    const currentTree = currentHead ? repo.getCommitTree(currentHead) : /* @__PURE__ */ new Map();
    for (const [path, blobHash] of targetTree) {
      const content = repo.getBlobContent(blobHash);
      if (content !== null) {
        const fullPath = repo.workDir + "/" + path;
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (dir && !ctx.volume.existsSync(dir)) {
          ctx.volume.mkdirSync(dir, { recursive: true });
        }
        ctx.volume.writeFileSync(fullPath, content);
      }
    }
    for (const [path] of currentTree) {
      if (!targetTree.has(path)) {
        const fullPath = repo.workDir + "/" + path;
        try {
          ctx.volume.unlinkSync(fullPath);
        } catch {
        }
      }
    }
    const newIndex = [];
    for (const [path, blobHash] of targetTree) {
      newIndex.push({ path, hash: blobHash, mode: 100644, mtime: Date.now() });
    }
    newIndex.sort((a, b) => a.path.localeCompare(b.path));
    repo.writeIndex(newIndex);
  }
  if (isBranch) {
    repo.setHEAD("ref: refs/heads/" + target);
    return ok(`Switched to branch '${target}'
`);
  } else {
    repo.setHEAD(commitHash);
    return ok(`HEAD is now at ${commitHash.slice(0, 7)}
`);
  }
}
function gitSwitch(args, ctx) {
  const newArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-c" || args[i] === "--create") {
      newArgs.push("-b");
    } else {
      newArgs.push(args[i]);
    }
  }
  return gitCheckout(newArgs, ctx);
}
function gitRevParse(args, ctx) {
  const found = findGitDir(ctx.volume, ctx.cwd);
  for (const arg of args) {
    switch (arg) {
      case "--show-toplevel":
        if (!found) return fail("fatal: not a git repository\n", 128);
        return ok(found.workDir + "\n");
      case "--is-inside-work-tree":
        return ok(found ? "true\n" : "false\n");
      case "--git-dir":
        if (!found) return fail("fatal: not a git repository\n", 128);
        return ok(".git\n");
      case "--is-bare-repository":
        return ok("false\n");
      case "--abbrev-ref": {
        const refArg = args[args.indexOf(arg) + 1];
        if (refArg === "HEAD" && found) {
          const repo = new GitRepo(ctx.volume, found.workDir, found.gitDir);
          const branch = repo.getCurrentBranch();
          return ok((branch ?? "HEAD") + "\n");
        }
        return ok("HEAD\n");
      }
      case "--short": {
        const refArg = args[args.indexOf(arg) + 1];
        if (refArg === "HEAD" && found) {
          const repo = new GitRepo(ctx.volume, found.workDir, found.gitDir);
          const hash = repo.resolveHEAD();
          return ok(hash ? hash.slice(0, 7) + "\n" : "\n");
        }
        return ok("\n");
      }
      case "--verify": {
        const refArg = args[args.indexOf(arg) + 1];
        if (!found) return fail("fatal: not a git repository\n", 128);
        const repo = new GitRepo(ctx.volume, found.workDir, found.gitDir);
        if (refArg === "HEAD") {
          const hash = repo.resolveHEAD();
          if (hash) return ok(hash + "\n");
          return fail("fatal: Needed a single revision\n", 128);
        }
        const resolved = repo.resolveRef(refArg ?? "");
        if (resolved) return ok(resolved + "\n");
        return fail(`fatal: Needed a single revision
`, 128);
      }
    }
  }
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  if (nonFlags.length > 0 && found) {
    const repo = new GitRepo(ctx.volume, found.workDir, found.gitDir);
    for (const ref of nonFlags) {
      if (ref === "HEAD") {
        const hash = repo.resolveHEAD();
        if (hash) return ok(hash + "\n");
      } else {
        const hash = repo.resolveRef(ref);
        if (hash) return ok(hash + "\n");
      }
    }
  }
  return ok("\n");
}
function gitConfig(args, ctx) {
  const found = findGitDir(ctx.volume, ctx.cwd);
  if (args.includes("--list") || args.includes("-l")) {
    if (!found) return fail("fatal: not a git repository\n", 128);
    const repo2 = new GitRepo(ctx.volume, found.workDir, found.gitDir);
    const config = repo2.readConfig();
    const lines = config.split("\n");
    let section = "";
    let subSection = "";
    let out = "";
    for (const line of lines) {
      const trimmed = line.trim();
      const secMatch = trimmed.match(/^\[(\w+)\s*(?:"([^"]*)")?\]$/);
      if (secMatch) {
        section = secMatch[1];
        subSection = secMatch[2] ?? "";
        continue;
      }
      const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
      if (kvMatch && section) {
        const key2 = subSection ? `${section}.${subSection}.${kvMatch[1]}` : `${section}.${kvMatch[1]}`;
        out += `${key2}=${kvMatch[2].trim()}
`;
      }
    }
    return ok(out);
  }
  const filtered = args.filter((a) => a !== "--global" && a !== "--local" && a !== "--get");
  if (filtered.length === 0) return fail("error: key required\n");
  const key = filtered[0];
  const value = filtered[1];
  if (!found) {
    if (value !== void 0) return fail("fatal: not a git repository\n", 128);
    return ok("\n");
  }
  const repo = new GitRepo(ctx.volume, found.workDir, found.gitDir);
  if (value !== void 0) {
    repo.setConfigValue(key, value);
    return ok("");
  }
  const val = repo.getConfigValue(key);
  if (val !== null) return ok(val + "\n");
  return fail("");
}
function gitRemote(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const sub = args[0];
  if (sub === "add") {
    const name = args[1];
    const url = args[2];
    if (!name || !url) return fail("usage: git remote add <name> <url>\n");
    repo.setConfigValue(`remote.${name}.url`, url);
    repo.setConfigValue(`remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`);
    return ok("");
  }
  if (sub === "remove" || sub === "rm") {
    const name = args[1];
    if (!name) return fail("usage: git remote remove <name>\n");
    const config2 = repo.readConfig();
    const lines2 = config2.split("\n");
    const out2 = [];
    let skip = false;
    for (const line of lines2) {
      if (line.trim() === `[remote "${name}"]`) {
        skip = true;
        continue;
      }
      if (line.trim().startsWith("[") && skip) skip = false;
      if (!skip) out2.push(line);
    }
    repo.writeConfig(out2.join("\n"));
    return ok("");
  }
  if (sub === "get-url") {
    const name = args[1] ?? "origin";
    const url = repo.getRemoteUrl(name);
    if (url) return ok(url + "\n");
    return fail(`fatal: No such remote '${name}'
`, 2);
  }
  const verbose = args.includes("-v") || args.includes("--verbose");
  const config = repo.readConfig();
  const remotes = [];
  const lines = config.split("\n");
  let currentRemote = "";
  for (const line of lines) {
    const match = line.trim().match(/^\[remote\s+"([^"]+)"\]$/);
    if (match) {
      currentRemote = match[1];
      continue;
    }
    if (currentRemote) {
      const kvMatch = line.trim().match(/^url\s*=\s*(.+)$/);
      if (kvMatch) {
        remotes.push({ name: currentRemote, url: kvMatch[1].trim() });
        currentRemote = "";
      }
    }
  }
  let out = "";
  for (const r2 of remotes) {
    if (verbose) {
      out += `${r2.name}	${r2.url} (fetch)
`;
      out += `${r2.name}	${r2.url} (push)
`;
    } else {
      out += r2.name + "\n";
    }
  }
  return ok(out);
}
function gitMerge(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  if (args.includes("--abort")) {
    try {
      ctx.volume.unlinkSync(repo.gitDir + "/MERGE_HEAD");
      ctx.volume.unlinkSync(repo.gitDir + "/MERGE_MSG");
    } catch {
    }
    return ok("Merge aborted.\n");
  }
  const target = args.filter((a) => !a.startsWith("-"))[0];
  if (!target) return fail("error: specify a branch to merge\n");
  const targetHash = repo.resolveRef(target);
  if (!targetHash) return fail(`merge: ${target} - not something we can merge
`);
  const currentHash = repo.resolveHEAD();
  if (!currentHash) {
    const branch2 = repo.getCurrentBranch();
    if (branch2) repo.updateBranchRef(branch2, targetHash);
    return ok(`Fast-forward
`);
  }
  if (currentHash === targetHash) {
    return ok("Already up to date.\n");
  }
  let walker = targetHash;
  let isFF = false;
  for (let i = 0; i < 1e3; i++) {
    if (walker === currentHash) {
      isFF = true;
      break;
    }
    const commit = repo.readCommit(walker);
    if (!commit || !commit.parent) break;
    walker = commit.parent;
  }
  if (isFF) {
    const branch2 = repo.getCurrentBranch();
    if (branch2) repo.updateBranchRef(branch2, targetHash);
    else repo.setHEAD(targetHash);
    const targetTree = repo.getCommitTree(targetHash);
    for (const [path, blobHash] of targetTree) {
      const content = repo.getBlobContent(blobHash);
      if (content !== null) {
        const fullPath = repo.workDir + "/" + path;
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (dir && !ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
        ctx.volume.writeFileSync(fullPath, content);
      }
    }
    const newIndex = [];
    for (const [path, blobHash] of targetTree) {
      newIndex.push({ path, hash: blobHash, mode: 100644, mtime: Date.now() });
    }
    repo.writeIndex(newIndex);
    return ok(`Updating ${currentHash.slice(0, 7)}..${targetHash.slice(0, 7)}
Fast-forward
`);
  }
  const entries = repo.readIndex();
  const treeHash = repo.buildTree(entries);
  const mergeMessage = `Merge branch '${target}'`;
  const mergeHash = repo.createCommit(mergeMessage, currentHash, treeHash, targetHash);
  const branch = repo.getCurrentBranch();
  if (branch) repo.updateBranchRef(branch, mergeHash);
  else repo.setHEAD(mergeHash);
  return ok(`Merge made by the 'recursive' strategy.
`);
}
function gitStash(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const sub = args[0] ?? "push";
  if (sub === "list") {
    const list = repo.readStashList();
    let out = "";
    for (let i = 0; i < list.length; i++) {
      out += `stash@{${i}}: ${list[i].message}
`;
    }
    return ok(out);
  }
  if (sub === "push" || sub === "save" || !args[0]) {
    const message = args.find((a) => !a.startsWith("-")) && args[0] !== "push" && args[0] !== "save" ? args.join(" ") : "WIP on " + (repo.getCurrentBranch() ?? "HEAD");
    const unstaged = repo.diffWorkingVsIndex();
    const staged = repo.diffIndexVsHEAD();
    if (unstaged.length === 0 && staged.length === 0) {
      return ok("No local changes to save\n");
    }
    const entries = repo.readIndex();
    repo.walkWorkTree(repo.workDir, "", (relPath, content) => {
      repo.addToIndex(relPath, content);
    });
    const allEntries = repo.readIndex();
    const treeHash = repo.buildTree(allEntries);
    const parent = repo.resolveHEAD();
    const stashHash = repo.createCommit("stash: " + message, parent, treeHash);
    repo.writeIndex(entries);
    const headHash = repo.resolveHEAD();
    if (headHash) {
      const headTree = repo.getCommitTree(headHash);
      for (const [path, blobHash] of headTree) {
        const content = repo.getBlobContent(blobHash);
        if (content !== null) {
          const fullPath = repo.workDir + "/" + path;
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
          if (dir && !ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
          ctx.volume.writeFileSync(fullPath, content);
        }
      }
    }
    const list = repo.readStashList();
    list.unshift({ message, commitHash: stashHash });
    repo.writeStashList(list);
    return ok(`Saved working directory and index state ${message}
`);
  }
  if (sub === "pop" || sub === "apply") {
    const idxArg = args[1] ? parseInt(args[1], 10) : 0;
    const list = repo.readStashList();
    if (idxArg >= list.length) return fail(`error: stash@{${idxArg}} does not exist
`);
    const entry = list[idxArg];
    const stashTree = repo.getCommitTree(entry.commitHash);
    for (const [path, blobHash] of stashTree) {
      const content = repo.getBlobContent(blobHash);
      if (content !== null) {
        const fullPath = repo.workDir + "/" + path;
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (dir && !ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
        ctx.volume.writeFileSync(fullPath, content);
      }
    }
    if (sub === "pop") {
      list.splice(idxArg, 1);
      repo.writeStashList(list);
    }
    return ok(`Applied stash@{${idxArg}}
`);
  }
  if (sub === "drop") {
    const idxArg = args[1] ? parseInt(args[1], 10) : 0;
    const list = repo.readStashList();
    if (idxArg >= list.length) return fail(`error: stash@{${idxArg}} does not exist
`);
    list.splice(idxArg, 1);
    repo.writeStashList(list);
    return ok(`Dropped stash@{${idxArg}}
`);
  }
  return fail(`error: unknown stash subcommand '${sub}'
`);
}
function gitRm(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const cached = args.includes("--cached");
  const paths = args.filter((a) => !a.startsWith("-"));
  if (paths.length === 0) return fail("usage: git rm [--cached] <file>...\n");
  for (const p of paths) {
    const absPath = index.resolve(ctx.cwd, p);
    const relPath = index.relative(repo.workDir, absPath);
    repo.removeFromIndex(relPath);
    if (!cached) {
      try {
        ctx.volume.unlinkSync(absPath);
      } catch {
      }
    }
  }
  return ok("");
}
function gitReset(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const hard = args.includes("--hard");
  const soft = args.includes("--soft");
  const paths = args.filter((a) => !a.startsWith("-"));
  if (paths.length > 0 && !hard && !soft) {
    const headHash = repo.resolveHEAD();
    const headTree = headHash ? repo.getCommitTree(headHash) : /* @__PURE__ */ new Map();
    for (const p of paths) {
      const absPath = index.resolve(ctx.cwd, p);
      const relPath = index.relative(repo.workDir, absPath);
      const headBlobHash = headTree.get(relPath);
      if (headBlobHash) {
        const entries = repo.readIndex();
        const idx = entries.findIndex((e) => e.path === relPath);
        if (idx >= 0) {
          entries[idx].hash = headBlobHash;
          repo.writeIndex(entries);
        }
      } else {
        repo.removeFromIndex(relPath);
      }
    }
    return ok("");
  }
  const targetRef = paths[0] ?? "HEAD";
  const targetHash = repo.resolveRef(targetRef) ?? repo.resolveHEAD();
  if (!targetHash) return fail("fatal: Failed to resolve HEAD\n", 128);
  if (!soft) {
    const tree = repo.getCommitTree(targetHash);
    const newIndex = [];
    for (const [path, blobHash] of tree) {
      newIndex.push({ path, hash: blobHash, mode: 100644, mtime: Date.now() });
    }
    newIndex.sort((a, b) => a.path.localeCompare(b.path));
    repo.writeIndex(newIndex);
  }
  if (hard) {
    const tree = repo.getCommitTree(targetHash);
    for (const [path, blobHash] of tree) {
      const content = repo.getBlobContent(blobHash);
      if (content !== null) {
        const fullPath = repo.workDir + "/" + path;
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (dir && !ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
        ctx.volume.writeFileSync(fullPath, content);
      }
    }
  }
  const branch = repo.getCurrentBranch();
  if (branch) repo.updateBranchRef(branch, targetHash);
  return ok(`HEAD is now at ${targetHash.slice(0, 7)}
`);
}
function requireToken(env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || null;
}
async function gitClone(args, ctx) {
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  const url = nonFlags[0];
  if (!url) return fail("usage: git clone <repository> [<directory>]\n");
  let branch = "main";
  const bIdx = args.indexOf("-b");
  if (bIdx >= 0 && args[bIdx + 1]) branch = args[bIdx + 1];
  const tmpRepo = new GitRepo(ctx.volume, "/", "/");
  const gh = tmpRepo.parseGitHubUrl(url);
  if (!gh) {
    return fail(`fatal: repository '${url}' is not a GitHub URL
`, 128);
  }
  const token = requireToken(ctx.env);
  if (!token) {
    return fail("fatal: authentication required. Set GITHUB_TOKEN environment variable.\n", 128);
  }
  let targetDir = nonFlags[1] ?? gh.repo;
  if (!targetDir.startsWith("/")) targetDir = index.resolve(ctx.cwd, targetDir);
  const repoInfo = await githubApi(`/repos/${gh.owner}/${gh.repo}`, token);
  if (!repoInfo.ok) {
    if (repoInfo.status === 404) return fail(`fatal: repository '${url}' not found
`, 128);
    return fail(`fatal: GitHub API error: ${repoInfo.status} ${repoInfo.data?.message ?? ""}
`, 128);
  }
  const defaultBranch = repoInfo.data.default_branch ?? "main";
  if (branch === "main" && defaultBranch !== "main") branch = defaultBranch;
  const refResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/ref/heads/${branch}`, token);
  if (!refResp.ok) {
    return fail(`fatal: Remote branch '${branch}' not found
`, 128);
  }
  const commitSha = refResp.data.object.sha;
  const commitResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/commits/${commitSha}`, token);
  if (!commitResp.ok) return fail(`fatal: could not fetch commit
`, 128);
  const treeSha = commitResp.data.tree.sha;
  const treeResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/trees/${treeSha}?recursive=1`, token);
  if (!treeResp.ok) return fail(`fatal: could not fetch tree
`, 128);
  if (!ctx.volume.existsSync(targetDir)) ctx.volume.mkdirSync(targetDir, { recursive: true });
  let fileCount = 0;
  const blobs = [];
  for (const item of treeResp.data.tree) {
    if (item.type === "blob") {
      blobs.push({ path: item.path, sha: item.sha });
    }
  }
  const BATCH_SIZE = 10;
  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const batch = blobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((b) => githubApi(`/repos/${gh.owner}/${gh.repo}/git/blobs/${b.sha}`, token))
    );
    for (let j = 0; j < batch.length; j++) {
      const blobResp = results[j];
      if (!blobResp.ok) continue;
      const filePath = targetDir + "/" + batch[j].path;
      const dir = filePath.substring(0, filePath.lastIndexOf("/"));
      if (dir && !ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
      let content;
      if (blobResp.data.encoding === "base64") {
        content = atob(blobResp.data.content.replace(/\n/g, ""));
      } else {
        content = blobResp.data.content;
      }
      ctx.volume.writeFileSync(filePath, content);
      fileCount++;
    }
  }
  gitInit([], { ...ctx, cwd: targetDir });
  const clonedRepo = new GitRepo(ctx.volume, targetDir, targetDir + "/.git");
  clonedRepo.setConfigValue("remote.origin.url", url);
  clonedRepo.setConfigValue("remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
  clonedRepo.setConfigValue("branch." + branch + ".remote", "origin");
  clonedRepo.setConfigValue("branch." + branch + ".merge", "refs/heads/" + branch);
  clonedRepo.setHEAD("ref: refs/heads/" + branch);
  clonedRepo.walkWorkTree(targetDir, "", (relPath, content) => {
    clonedRepo.addToIndex(relPath, content);
  });
  const entries = clonedRepo.readIndex();
  const treeHash = clonedRepo.buildTree(entries);
  const cloneCommitHash = clonedRepo.createCommit(`Clone of ${url}`, null, treeHash);
  clonedRepo.updateBranchRef(branch, cloneCommitHash);
  return ok(`Cloning into '${nonFlags[1] ?? gh.repo}'...
remote: Enumerating objects: ${fileCount}
Receiving objects: 100% (${fileCount}/${fileCount}), done.
`);
}
async function gitPush(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const token = requireToken(ctx.env);
  if (!token) return fail("fatal: authentication required. Set GITHUB_TOKEN environment variable.\n", 128);
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  const remoteName = nonFlags[0] ?? "origin";
  const localBranch = repo.getCurrentBranch();
  if (!localBranch) return fail("fatal: not on a branch\n", 128);
  const remoteBranch = nonFlags[1] ?? localBranch;
  const remoteUrl = repo.getRemoteUrl(remoteName);
  if (!remoteUrl) return fail(`fatal: '${remoteName}' does not appear to be a git repository
`, 128);
  const gh = repo.parseGitHubUrl(remoteUrl);
  if (!gh) return fail(`fatal: remote '${remoteName}' is not a GitHub URL
`, 128);
  const headHash = repo.resolveHEAD();
  if (!headHash) return fail("fatal: nothing to push\n", 128);
  const commitTree = repo.getCommitTree(headHash);
  const blobShas = /* @__PURE__ */ new Map();
  for (const [path, localHash] of commitTree) {
    const content = repo.getBlobContent(localHash);
    if (content === null) continue;
    const blobResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/blobs`, token, "POST", {
      content: btoa(content),
      encoding: "base64"
    });
    if (!blobResp.ok) return fail(`fatal: failed to create blob for ${path}: ${blobResp.data?.message}
`, 128);
    blobShas.set(path, blobResp.data.sha);
  }
  const treeEntries = Array.from(blobShas).map(([path, sha]) => ({
    path,
    mode: "100644",
    type: "blob",
    sha
  }));
  const treeResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/trees`, token, "POST", {
    tree: treeEntries
  });
  if (!treeResp.ok) return fail(`fatal: failed to create tree: ${treeResp.data?.message}
`, 128);
  let parentSha = null;
  const refResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/ref/heads/${remoteBranch}`, token);
  if (refResp.ok) parentSha = refResp.data.object.sha;
  const commit = repo.readCommit(headHash);
  const commitBody = {
    message: commit?.message ?? "Push from nodepod",
    tree: treeResp.data.sha
  };
  if (parentSha) commitBody.parents = [parentSha];
  const commitResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/commits`, token, "POST", commitBody);
  if (!commitResp.ok) return fail(`fatal: failed to create commit: ${commitResp.data?.message}
`, 128);
  if (parentSha) {
    const force = args.includes("-f") || args.includes("--force");
    const updateResp = await githubApi(
      `/repos/${gh.owner}/${gh.repo}/git/refs/heads/${remoteBranch}`,
      token,
      "PATCH",
      { sha: commitResp.data.sha, force }
    );
    if (!updateResp.ok) return fail(`fatal: failed to update ref: ${updateResp.data?.message}
`, 128);
  } else {
    const createResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/refs`, token, "POST", {
      ref: `refs/heads/${remoteBranch}`,
      sha: commitResp.data.sha
    });
    if (!createResp.ok) return fail(`fatal: failed to create ref: ${createResp.data?.message}
`, 128);
  }
  return ok(`To ${remoteUrl}
   ${(parentSha ?? "000000").slice(0, 7)}..${commitResp.data.sha.slice(0, 7)}  ${localBranch} -> ${remoteBranch}
`);
}
async function gitPull(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const token = requireToken(ctx.env);
  if (!token) return fail("fatal: authentication required. Set GITHUB_TOKEN environment variable.\n", 128);
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  const remoteName = nonFlags[0] ?? "origin";
  const currentBranch = repo.getCurrentBranch();
  if (!currentBranch) return fail("fatal: not on a branch\n", 128);
  const remoteBranch = nonFlags[1] ?? currentBranch;
  const remoteUrl = repo.getRemoteUrl(remoteName);
  if (!remoteUrl) return fail(`fatal: '${remoteName}' does not appear to be a git repository
`, 128);
  const gh = repo.parseGitHubUrl(remoteUrl);
  if (!gh) return fail(`fatal: remote '${remoteName}' is not a GitHub URL
`, 128);
  const refResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/ref/heads/${remoteBranch}`, token);
  if (!refResp.ok) return fail(`fatal: couldn't find remote ref refs/heads/${remoteBranch}
`, 128);
  const remoteCommitSha = refResp.data.object.sha;
  const localHead = repo.resolveHEAD();
  if (localHead === remoteCommitSha) return ok("Already up to date.\n");
  const commitResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/commits/${remoteCommitSha}`, token);
  if (!commitResp.ok) return fail("fatal: could not fetch remote commit\n", 128);
  const treeSha = commitResp.data.tree.sha;
  const treeResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/git/trees/${treeSha}?recursive=1`, token);
  if (!treeResp.ok) return fail("fatal: could not fetch tree\n", 128);
  let updated = 0;
  const blobs = [];
  for (const item of treeResp.data.tree) {
    if (item.type === "blob") blobs.push({ path: item.path, sha: item.sha });
  }
  const BATCH_SIZE = 10;
  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const batch = blobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((b) => githubApi(`/repos/${gh.owner}/${gh.repo}/git/blobs/${b.sha}`, token))
    );
    for (let j = 0; j < batch.length; j++) {
      const blobResp = results[j];
      if (!blobResp.ok) continue;
      const filePath = repo.workDir + "/" + batch[j].path;
      const dir = filePath.substring(0, filePath.lastIndexOf("/"));
      if (dir && !ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
      let content;
      if (blobResp.data.encoding === "base64") {
        content = atob(blobResp.data.content.replace(/\n/g, ""));
      } else {
        content = blobResp.data.content;
      }
      ctx.volume.writeFileSync(filePath, content);
      updated++;
    }
  }
  repo.walkWorkTree(repo.workDir, "", (relPath, content) => {
    repo.addToIndex(relPath, content);
  });
  const entries = repo.readIndex();
  const treeHash = repo.buildTree(entries);
  const pullCommit = repo.createCommit(`Pull from ${remoteName}/${remoteBranch}`, localHead, treeHash);
  repo.updateBranchRef(currentBranch, pullCommit);
  return ok(`From ${remoteUrl}
Updating ${(localHead ?? "000000").slice(0, 7)}..${remoteCommitSha.slice(0, 7)}
Fast-forward
 ${updated} file${updated !== 1 ? "s" : ""} changed
`);
}
async function gitFetch(args, ctx) {
  const r = requireRepo(ctx.volume, ctx.cwd);
  if ("error" in r) return r.error;
  const { repo } = r;
  const token = requireToken(ctx.env);
  if (!token) return fail("fatal: authentication required. Set GITHUB_TOKEN environment variable.\n", 128);
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  const remoteName = nonFlags[0] ?? "origin";
  const remoteUrl = repo.getRemoteUrl(remoteName);
  if (!remoteUrl) return fail(`fatal: '${remoteName}' does not appear to be a git repository
`, 128);
  const gh = repo.parseGitHubUrl(remoteUrl);
  if (!gh) return fail(`fatal: remote '${remoteName}' is not a GitHub URL
`, 128);
  const branchesResp = await githubApi(`/repos/${gh.owner}/${gh.repo}/branches`, token);
  if (!branchesResp.ok) return fail(`fatal: could not list remote branches
`, 128);
  let out = `From ${remoteUrl}
`;
  for (const b of branchesResp.data) {
    const refPath = repo.gitDir + "/refs/remotes/" + remoteName + "/" + b.name;
    const dir = refPath.substring(0, refPath.lastIndexOf("/"));
    if (!ctx.volume.existsSync(dir)) ctx.volume.mkdirSync(dir, { recursive: true });
    ctx.volume.writeFileSync(refPath, b.commit.sha + "\n");
    out += ` * [updated]    ${b.name} -> ${remoteName}/${b.name}
`;
  }
  return ok(out);
}
function createGitCommand() {
  return {
    name: "git",
    async execute(args, ctx) {
      if (args.length === 0) {
        return ok(`usage: git [--version] <command> [<args>]
`);
      }
      let effectiveCtx = ctx;
      if (args[0] === "-C" && args[1]) {
        const newCwd = index.resolve(ctx.cwd, args[1]);
        effectiveCtx = { ...ctx, cwd: newCwd };
        args = args.slice(2);
      }
      const sub = args[0];
      const subArgs = args.slice(1);
      switch (sub) {
        case "--version":
        case "-v":
          return ok(`git version ${index.VERSIONS.GIT}
`);
        case "--help":
        case "help":
          return ok(
            `usage: git <command> [<args>]

Available commands:
  init       Create an empty Git repository
  clone      Clone a repository from GitHub
  add        Add file contents to the index
  status     Show the working tree status
  commit     Record changes to the repository
  log        Show commit logs
  diff       Show changes
  branch     List, create, or delete branches
  checkout   Switch branches or restore files
  switch     Switch branches
  merge      Join two development histories together
  remote     Manage set of tracked repositories
  push       Update remote refs (GitHub)
  pull       Fetch and integrate remote changes (GitHub)
  fetch      Download objects from remote (GitHub)
  stash      Stash the changes in a dirty working directory
  reset      Reset current HEAD to the specified state
  rm         Remove files from the working tree and index
  rev-parse  Ancillary plumbing command
  config     Get and set repository options
`
          );
        case "init":
          return gitInit(subArgs, effectiveCtx);
        case "clone":
          return gitClone(subArgs, effectiveCtx);
        case "add":
          return gitAdd(subArgs, effectiveCtx);
        case "status":
          return gitStatus(subArgs, effectiveCtx);
        case "commit":
          return gitCommit(subArgs, effectiveCtx);
        case "log":
          return gitLog(subArgs, effectiveCtx);
        case "diff":
          return gitDiff(subArgs, effectiveCtx);
        case "branch":
          return gitBranch(subArgs, effectiveCtx);
        case "checkout":
          return gitCheckout(subArgs, effectiveCtx);
        case "switch":
          return gitSwitch(subArgs, effectiveCtx);
        case "merge":
          return gitMerge(subArgs, effectiveCtx);
        case "remote":
          return gitRemote(subArgs, effectiveCtx);
        case "push":
          return gitPush(subArgs, effectiveCtx);
        case "pull":
          return gitPull(subArgs, effectiveCtx);
        case "fetch":
          return gitFetch(subArgs, effectiveCtx);
        case "stash":
          return gitStash(subArgs, effectiveCtx);
        case "reset":
          return gitReset(subArgs, effectiveCtx);
        case "rm":
          return gitRm(subArgs, effectiveCtx);
        case "rev-parse":
          return gitRevParse(subArgs, effectiveCtx);
        case "config":
          return gitConfig(subArgs, effectiveCtx);
        default:
          return fail(`git: '${sub}' is not a git command. See 'git --help'.
`);
      }
    }
  };
}

let _shell = null;
let _vol = null;
let _syncChannel = null;
let _stdoutSink = null;
let _stderrSink = null;
let _haltSignal = null;
let _termCols = null;
let _termRows = null;
let _rawModeChangeCb = null;
function getStdoutSink() {
  const ctx = index.getActiveContext();
  return ctx?.stdoutSink ?? _stdoutSink;
}
function getStderrSink() {
  const ctx = index.getActiveContext();
  return ctx?.stderrSink ?? _stderrSink;
}
function getHaltSignal() {
  const ctx = index.getActiveContext();
  return ctx ? ctx.abortController.signal : _haltSignal;
}
function getLiveStdin() {
  const ctx = index.getActiveContext();
  return ctx?.liveStdin ?? _liveStdin;
}
function getTermCols() {
  const ctx = index.getActiveContext();
  return ctx?.termCols?.() ?? _termCols?.() ?? 80;
}
function getTermRows() {
  const ctx = index.getActiveContext();
  return ctx?.termRows?.() ?? _termRows?.() ?? 24;
}
function formatThrown(e) {
  if (e instanceof Error) {
    const prefix = e.constructor?.name && e.constructor.name !== "Error" ? `${e.constructor.name}: ` : "";
    let msg = prefix + (e.message || e.name || "Unknown error");
    if (e.stack) msg += "\n" + e.stack;
    return msg;
  }
  if (e === null || e === void 0) return "Script threw a falsy value";
  return String(e) || "Unknown error (non-Error object thrown)";
}
function setStreamingCallbacks(cfg) {
  _stdoutSink = cfg.onStdout ?? null;
  _stderrSink = cfg.onStderr ?? null;
  _haltSignal = cfg.signal ?? null;
  _termCols = cfg.getCols ?? null;
  _termRows = cfg.getRows ?? null;
  _rawModeChangeCb = cfg.onRawModeChange ?? null;
  const ctx = index.getActiveContext();
  if (ctx) {
    ctx.stdoutSink = cfg.onStdout ?? null;
    ctx.stderrSink = cfg.onStderr ?? null;
    if (cfg.signal) {
      cfg.signal.addEventListener("abort", () => ctx.abortController.abort(), { once: true });
    }
    ctx.termCols = cfg.getCols ?? null;
    ctx.termRows = cfg.getRows ?? null;
  }
}
function clearStreamingCallbacks() {
  _stdoutSink = null;
  _stderrSink = null;
  _haltSignal = null;
  _termCols = null;
  _termRows = null;
  _rawModeChangeCb = null;
  const ctx = index.getActiveContext();
  if (ctx) {
    ctx.stdoutSink = null;
    ctx.stderrSink = null;
    ctx.termCols = null;
    ctx.termRows = null;
  }
}
function setSyncChannel(channel) {
  _syncChannel = channel;
}
let _spawnChildFn = null;
function setSpawnChildCallback(fn) {
  _spawnChildFn = fn;
}
let _forkChildFn = null;
function setForkChildCallback(fn) {
  _forkChildFn = fn;
}
let _ipcSendFn = null;
let _ipcReceiveHandler = null;
let _ipcQueue = [];
function setIPCSend(fn) {
  _ipcSendFn = fn;
}
function setIPCReceiveHandler(fn) {
  _ipcReceiveHandler = fn;
  if (_ipcQueue.length > 0) {
    const queued = _ipcQueue;
    _ipcQueue = [];
    for (const msg of queued) fn(msg);
  }
}
function handleIPCFromParent(data) {
  if (_ipcReceiveHandler) {
    _ipcReceiveHandler(data);
  } else {
    _ipcQueue.push(data);
  }
}
function getShellCwd() {
  return _shell?.getCwd() ?? "/";
}
function setShellCwd(dir) {
  if (_shell) _shell.setCwd(dir);
}
function shellExec(cmd, opts, callback) {
  if (!_shell) {
    callback(new Error("[Nodepod] Shell not initialized"), "", "");
    return;
  }
  _shell.exec(cmd, opts).then(
    (result) => {
      if (result.exitCode !== 0) {
        const e = new Error(`Command failed: ${cmd}`);
        e.code = result.exitCode;
        callback(e, result.stdout, result.stderr);
      } else {
        callback(null, result.stdout, result.stderr);
      }
    },
    (e) => {
      callback(e instanceof Error ? e : new Error(String(e)), "", "");
    }
  );
}
let _liveStdin = null;
function isStdinRaw() {
  const stdin = getLiveStdin();
  if (!stdin) return false;
  return !!stdin.isRaw;
}
function sendStdin(text) {
  const stdin = getLiveStdin();
  if (!stdin) {
    return;
  }
  stdin.emit("data", text);
}
function initShellExec(volume, opts) {
  _vol = volume;
  _shell = new NodepodShell(volume, {
    cwd: opts?.cwd ?? "/",
    env: {
      HOME: "/home/user",
      USER: "user",
      PATH: "/usr/local/bin:/usr/bin:/bin:/node_modules/.bin",
      NODE_ENV: "development",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      npm_config_user_agent: index.DEFAULT_ENV.npm_config_user_agent,
      npm_execpath: index.DEFAULT_ENV.npm_execpath,
      npm_node_execpath: index.DEFAULT_ENV.npm_node_execpath,
      ...opts?.env
    }
  });
  const pmDeps = {
    installPackages,
    uninstallPackages,
    listPackages,
    runScript,
    npmInitOrCreate,
    npmInfo,
    npmPack,
    npmConfig,
    npxExecute,
    executeNodeBinary,
    evalCode: (code, ctx) => evalNodeCode(code, ctx),
    printCode: (code, ctx) => printNodeCode(code, ctx),
    removeNodeModules: (cwd) => {
      const dir = `${cwd}/node_modules`.replace(/\/+/g, "/");
      if (_vol.existsSync(dir)) removeDir(_vol, dir);
    },
    formatErr,
    formatWarn,
    hasFile: (p) => !!_vol && _vol.existsSync(p),
    readFile: (p) => _vol.readFileSync(p, "utf8"),
    writeFile: (p, data) => _vol.writeFileSync(p, data)
  };
  _shell.registerCommand(createNodeCommand(pmDeps));
  _shell.registerCommand(createNpxCommand(pmDeps));
  _shell.registerCommand(createNpmCommand(pmDeps));
  _shell.registerCommand(createPnpmCommand(pmDeps));
  _shell.registerCommand(createYarnCommand(pmDeps));
  _shell.registerCommand(createBunCommand(pmDeps));
  _shell.registerCommand(createBunxCommand(pmDeps));
  _shell.registerCommand(createGitCommand());
}
function evalNodeCode(code, ctx) {
  let out = "";
  let err = "";
  const sandbox = new index.ScriptEngine(_vol, {
    cwd: ctx.cwd,
    env: ctx.env,
    onConsole: (m, args) => {
      const line = index.format(args[0], ...args.slice(1)) + "\n";
      m === "error" ? err += line : out += line;
    },
    onStdout: (s) => {
      out += s;
    },
    onStderr: (s) => {
      err += s;
    }
  });
  try {
    sandbox.execute(code, "/<eval>.js");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Process exited with code"))
      return { stdout: out, stderr: err, exitCode: 0 };
    err += `Error: ${e instanceof Error ? e.message : String(e)}
`;
    return { stdout: out, stderr: err, exitCode: 1 };
  }
  return { stdout: out, stderr: err, exitCode: 0 };
}
function printNodeCode(code, ctx) {
  let out = "";
  let err = "";
  const sandbox = new index.ScriptEngine(_vol, {
    cwd: ctx.cwd,
    env: ctx.env,
    onConsole: (m, args) => {
      const line = index.format(args[0], ...args.slice(1)) + "\n";
      m === "error" ? err += line : out += line;
    },
    onStdout: (s) => {
      out += s;
    },
    onStderr: (s) => {
      err += s;
    }
  });
  try {
    const result = sandbox.execute(code, "/<print>.js");
    out += String(result.exports) + "\n";
  } catch (e) {
    err += `Error: ${e instanceof Error ? e.message : String(e)}
`;
    return { stdout: out, stderr: err, exitCode: 1 };
  }
  return { stdout: out, stderr: err, exitCode: 0 };
}
function removeDir(vol, dir) {
  for (const name of vol.readdirSync(dir)) {
    const full = `${dir}/${name}`;
    const st = vol.statSync(full);
    if (st.isDirectory()) removeDir(vol, full);
    else vol.unlinkSync(full);
  }
  vol.rmdirSync(dir);
}
function loadManifest(cwd) {
  const p = `${cwd}/package.json`.replace(/\/+/g, "/");
  if (!_vol.existsSync(p))
    return {
      fail: {
        stdout: "",
        stderr: formatErr("package.json not found", "npm"),
        exitCode: 1
      }
    };
  try {
    return {
      pkg: JSON.parse(_vol.readFileSync(p, "utf8"))
    };
  } catch {
    return {
      fail: {
        stdout: "",
        stderr: formatErr("Malformed package.json", "npm"),
        exitCode: 1
      }
    };
  }
}
async function runScript(args, ctx) {
  const name = args[0];
  if (!name) {
    const r2 = loadManifest(ctx.cwd);
    if ("fail" in r2) return r2.fail;
    const scripts2 = r2.pkg.scripts ?? {};
    const keys = Object.keys(scripts2);
    if (keys.length === 0) return { stdout: "", stderr: "", exitCode: 0 };
    let text = `Scripts in ${r2.pkg.name ?? ""}:
`;
    for (const k of keys) text += `  ${k}
    ${scripts2[k]}
`;
    return { stdout: text, stderr: "", exitCode: 0 };
  }
  const dashIdx = args.indexOf("--");
  const extraArgs = dashIdx >= 0 ? args.slice(dashIdx + 1) : [];
  const r = loadManifest(ctx.cwd);
  if ("fail" in r) return r.fail;
  const scripts = r.pkg.scripts ?? {};
  let cmd = scripts[name];
  if (!cmd) {
    let msg = formatErr(`Missing script: "${name}"`, "npm");
    const avail = Object.keys(scripts);
    if (avail.length) {
      msg += "\nAvailable:\n";
      for (const s of avail)
        msg += `  ${A_CYAN}${s}${A_RESET}: ${A_DIM}${scripts[s]}${A_RESET}
`;
    }
    return { stdout: "", stderr: msg, exitCode: 1 };
  }
  if (extraArgs.length > 0) {
    cmd += " " + extraArgs.map((a) => a.includes(" ") ? `"${a}"` : a).join(" ");
  }
  const binDir = `${ctx.cwd}/node_modules/.bin`.replace(/\/+/g, "/");
  const existingPath = ctx.env.PATH || "";
  const pathWithBin = existingPath.includes(binDir) ? existingPath : `${binDir}:${existingPath}`;
  const env = {
    ...ctx.env,
    PATH: pathWithBin,
    npm_lifecycle_event: name
  };
  if (r.pkg.name) env.npm_package_name = r.pkg.name;
  if (r.pkg.version) env.npm_package_version = r.pkg.version;
  let allOut = "";
  let allErr = "";
  const label = `${r.pkg.name ?? ""}@${r.pkg.version ?? ""}`;
  const pre = scripts[`pre${name}`];
  if (pre) {
    const hdr = `
> ${label} pre${name}
> ${pre}

`;
    allErr += hdr;
    if (_stderrSink) _stderrSink(hdr);
    const pr = await ctx.exec(pre, { cwd: ctx.cwd, env });
    allOut += pr.stdout;
    allErr += pr.stderr;
    if (pr.exitCode !== 0)
      return { stdout: allOut, stderr: allErr, exitCode: pr.exitCode };
  }
  const mainHdr = `
> ${label} ${name}
> ${cmd}

`;
  allErr += mainHdr;
  if (_stderrSink) _stderrSink(mainHdr);
  const mr = await ctx.exec(cmd, { cwd: ctx.cwd, env });
  allOut += mr.stdout;
  allErr += mr.stderr;
  if (mr.exitCode !== 0)
    return { stdout: allOut, stderr: allErr, exitCode: mr.exitCode };
  const post = scripts[`post${name}`];
  if (post) {
    const hdr = `
> ${label} post${name}
> ${post}

`;
    allErr += hdr;
    if (_stderrSink) _stderrSink(hdr);
    const po = await ctx.exec(post, { cwd: ctx.cwd, env });
    allOut += po.stdout;
    allErr += po.stderr;
    if (po.exitCode !== 0)
      return { stdout: allOut, stderr: allErr, exitCode: po.exitCode };
  }
  return { stdout: allOut, stderr: allErr, exitCode: 0 };
}
const A_RESET = "\x1B[0m";
const A_BOLD = "\x1B[1m";
const A_DIM = "\x1B[2m";
const A_RED = "\x1B[31m";
const A_GREEN = "\x1B[32m";
const A_YELLOW = "\x1B[33m";
const A_BLUE = "\x1B[34m";
const A_CYAN = "\x1B[36m";
const A_WHITE = "\x1B[37m";
const ERASE_LINE = "\x1B[2K";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function createSpinner(text, writeFn) {
  let frame = 0;
  let current = text;
  const id = setInterval(() => {
    writeFn(
      `${ERASE_LINE}\r${A_CYAN}${SPINNER_FRAMES[frame]}${A_RESET} ${current}`
    );
    frame = (frame + 1) % SPINNER_FRAMES.length;
  }, 80);
  return {
    update(t) {
      current = t;
    },
    succeed(t) {
      clearInterval(id);
      writeFn(`${ERASE_LINE}\r${A_GREEN}✔${A_RESET} ${t}
`);
    },
    fail(t) {
      clearInterval(id);
      writeFn(`${ERASE_LINE}\r${A_RED}✖${A_RESET} ${t}
`);
    },
    stop() {
      clearInterval(id);
    }
  };
}
const PM_COLORS = {
  npm: A_RED,
  pnpm: A_YELLOW,
  yarn: A_BLUE,
  bun: A_WHITE
};
function formatProgress(msg, pm = "npm") {
  const accent = PM_COLORS[pm];
  const resolving = msg.match(/^Resolving\s+(.+?)\.{3}$/);
  if (resolving)
    return `${A_DIM}Resolving${A_RESET} ${accent}${resolving[1]}${A_RESET}${A_DIM}...${A_RESET}`;
  const downloading = msg.match(/^Downloading\s+(\d+)\s+package/);
  if (downloading)
    return `${A_DIM}Downloading${A_RESET} ${A_YELLOW}${downloading[1]}${A_RESET} ${A_DIM}packages...${A_RESET}`;
  const fetching = msg.match(/^(?:\s*)?Fetching\s+(.+?)\.{3}$/);
  if (fetching)
    return `${A_DIM}Fetching${A_RESET} ${accent}${fetching[1]}${A_RESET}${A_DIM}...${A_RESET}`;
  const transformed = msg.match(/^(?:\s*)?Transformed\s+(\d+)\s+file/);
  if (transformed) return `${A_DIM}${msg.trim()}${A_RESET}`;
  const installed = msg.match(/^Installed\s+(\d+)/);
  if (installed) return `${A_GREEN}${msg}${A_RESET}`;
  const skipping = msg.match(/^Skipping\s+(.+?)\s+\(up to date\)$/);
  if (skipping)
    return `${A_DIM}Skipping${A_RESET} ${accent}${skipping[1]}${A_RESET} ${A_DIM}(up to date)${A_RESET}`;
  return msg;
}
function formatInstallSummary(totalAdded, elapsed, pm) {
  const pkgs = `${totalAdded} package${totalAdded !== 1 ? "s" : ""}`;
  switch (pm) {
    case "npm":
      return `${A_BOLD}added ${pkgs}${A_RESET} ${A_DIM}in ${elapsed}s${A_RESET}`;
    case "pnpm":
      return `${A_BOLD}packages:${A_RESET} ${A_GREEN}+${totalAdded}${A_RESET}
${A_DIM}Done in ${elapsed}s${A_RESET}`;
    case "yarn":
      return `${A_BOLD}${pkgs} added${A_RESET} ${A_DIM}in ${elapsed}s${A_RESET}`;
    case "bun":
      return `${A_BOLD}${pkgs} installed${A_RESET} ${A_DIM}[${elapsed}s]${A_RESET}`;
  }
}
function formatErr(msg, pm) {
  switch (pm) {
    case "npm":
      return `${A_RED}npm ERR!${A_RESET} ${msg}
`;
    case "pnpm":
      return `${A_RED} ERR_PNPM${A_RESET}  ${msg}
`;
    case "yarn":
      return `${A_RED}error${A_RESET} ${msg}
`;
    case "bun":
      return `${A_RED}error:${A_RESET} ${msg}
`;
  }
}
function formatWarn(msg, pm) {
  switch (pm) {
    case "npm":
      return `${A_YELLOW}npm WARN${A_RESET} ${msg}
`;
    case "pnpm":
      return `${A_YELLOW} WARN${A_RESET}  ${msg}
`;
    case "yarn":
      return `${A_YELLOW}warning${A_RESET} ${msg}
`;
    case "bun":
      return `${A_YELLOW}warn:${A_RESET} ${msg}
`;
  }
}
async function installPackages(args, ctx, pm = "npm") {
  const { DependencyInstaller } = await Promise.resolve().then(() => require('./index-lVFpjksc.cjs')).then(n => n.installer);
  const installer = new DependencyInstaller(_vol, { cwd: ctx.cwd });
  let out = "";
  const write = _stdoutSink ?? ((_s) => {
  });
  const startTime = Date.now();
  const spinnerText = pm === "bun" ? `${A_DIM}bun install${A_RESET} ${A_DIM}${index.VERSIONS.BUN_V}${A_RESET}` : `${A_DIM}Resolving dependencies...${A_RESET}`;
  const spinner = createSpinner(spinnerText, write);
  try {
    const names = args.filter((a) => !a.startsWith("-"));
    const onProgress = (m) => {
      const colored = formatProgress(m, pm);
      out += m + "\n";
      spinner.update(colored);
    };
    let totalAdded = 0;
    if (names.length === 0) {
      const ir = await installer.installFromManifest(void 0, {
        withDevDeps: true,
        onProgress
      });
      totalAdded = ir.newPackages.length;
    } else {
      for (const n of names) {
        const ir = await installer.install(n, void 0, { onProgress });
        totalAdded += ir.newPackages.length;
      }
    }
    const elapsed = ((Date.now() - startTime) / 1e3).toFixed(1);
    const summary = formatInstallSummary(totalAdded, elapsed, pm);
    spinner.succeed(summary);
    out += `added ${totalAdded} packages in ${elapsed}s
`;
    return { stdout: out, stderr: "", exitCode: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    spinner.fail(`${A_RED}${msg}${A_RESET}`);
    return {
      stdout: out,
      stderr: formatErr(msg, pm),
      exitCode: 1
    };
  }
}
async function uninstallPackages(args, ctx, pm = "npm") {
  const names = args.filter((a) => !a.startsWith("-"));
  if (names.length === 0)
    return {
      stdout: "",
      stderr: formatErr("Must specify package to remove", pm),
      exitCode: 1
    };
  const write = _stdoutSink ?? ((_s) => {
  });
  let out = "";
  for (const name of names) {
    const pkgDir = `${ctx.cwd}/node_modules/${name}`.replace(/\/+/g, "/");
    if (_vol.existsSync(pkgDir)) {
      try {
        removeDir(_vol, pkgDir);
        const msg = pm === "bun" ? `${A_DIM}-${A_RESET} ${name}` : pm === "pnpm" ? `${A_RED}-${A_RESET} ${name}` : `removed ${name}`;
        out += msg + "\n";
        write(msg + "\n");
      } catch (e) {
        return {
          stdout: out,
          stderr: formatErr(
            `Failed to remove ${name}: ${e instanceof Error ? e.message : String(e)}`,
            pm
          ),
          exitCode: 1
        };
      }
    } else {
      out += formatWarn(`${name} not installed`, pm);
    }
    const r = loadManifest(ctx.cwd);
    if (!("fail" in r)) {
      const pkg = r.pkg;
      let changed = false;
      if (pkg.dependencies?.[name]) {
        delete pkg.dependencies[name];
        changed = true;
      }
      if (pkg.devDependencies?.[name]) {
        delete pkg.devDependencies[name];
        changed = true;
      }
      if (changed) {
        const p = `${ctx.cwd}/package.json`.replace(/\/+/g, "/");
        _vol.writeFileSync(p, JSON.stringify(pkg, null, 2));
      }
    }
  }
  return { stdout: out, stderr: "", exitCode: 0 };
}
async function listPackages(ctx, pm = "npm") {
  const { DependencyInstaller } = await Promise.resolve().then(() => require('./index-lVFpjksc.cjs')).then(n => n.installer);
  const installer = new DependencyInstaller(_vol, { cwd: ctx.cwd });
  const pkgs = installer.listInstalled();
  const entries = Object.entries(pkgs);
  if (entries.length === 0)
    return { stdout: `${A_DIM}(empty)${A_RESET}
`, stderr: "", exitCode: 0 };
  const r = loadManifest(ctx.cwd);
  const label = !("fail" in r) ? `${r.pkg.name ?? "project"}@${r.pkg.version ?? "0.0.0"}` : ctx.cwd;
  let text = "";
  switch (pm) {
    case "npm":
      text += `${label} ${ctx.cwd}
`;
      for (let i = 0; i < entries.length; i++) {
        const [n, v] = entries[i];
        const isLast = i === entries.length - 1;
        text += `${isLast ? "└──" : "├──"} ${n}@${A_DIM}${v}${A_RESET}
`;
      }
      break;
    case "pnpm":
      text += `${A_DIM}Legend: production dependency, optional only, dev only${A_RESET}

`;
      text += `${label} ${ctx.cwd}

`;
      text += `${A_BOLD}dependencies:${A_RESET}
`;
      for (const [n, v] of entries) text += `${n} ${A_DIM}${v}${A_RESET}
`;
      break;
    case "yarn":
      text += `${A_BOLD}${label}${A_RESET}
`;
      for (let i = 0; i < entries.length; i++) {
        const [n, v] = entries[i];
        const isLast = i === entries.length - 1;
        text += `${isLast ? "└─" : "├─"} ${n}@${A_CYAN}${v}${A_RESET}
`;
      }
      break;
    case "bun":
      for (const [n, v] of entries) text += `${n}@${A_DIM}${v}${A_RESET}
`;
      text += `
${A_DIM}${entries.length} packages installed${A_RESET}
`;
      break;
  }
  return { stdout: text, stderr: "", exitCode: 0 };
}
async function npmInitOrCreate(args, sub, ctx) {
  const flags = args.filter((a) => a.startsWith("-"));
  const positional = args.filter((a) => !a.startsWith("-"));
  if (sub === "create" || sub === "init" && positional.length > 0) {
    const initializer = positional[0];
    let pkgSpec;
    if (initializer.startsWith("@")) {
      pkgSpec = initializer;
    } else {
      const atIdx = initializer.indexOf("@");
      if (atIdx > 0) {
        const name2 = initializer.slice(0, atIdx);
        const ver = initializer.slice(atIdx);
        pkgSpec = `create-${name2}${ver}`;
      } else {
        pkgSpec = `create-${initializer}`;
      }
    }
    return npxExecute(["-y", pkgSpec, ...positional.slice(1), ...flags], ctx);
  }
  const p = `${ctx.cwd}/package.json`.replace(/\/+/g, "/");
  if (_vol.existsSync(p)) {
    return {
      stdout: "",
      stderr: formatWarn("package.json already exists", "npm"),
      exitCode: 0
    };
  }
  const isYes = flags.includes("-y") || flags.includes("--yes");
  const name = ctx.cwd.split("/").filter(Boolean).pop() || "my-project";
  const pkg = {
    name,
    version: "1.0.0",
    description: "",
    main: "index.js",
    scripts: {
      test: 'echo "Error: no test specified" && exit 1',
      start: "node index.js"
    },
    keywords: [],
    author: "",
    license: "ISC"
  };
  _vol.writeFileSync(p, JSON.stringify(pkg, null, 2));
  const out = isYes ? `Wrote to ${p}
` : `Wrote to ${p}

${JSON.stringify(pkg, null, 2)}
`;
  return { stdout: out, stderr: "", exitCode: 0 };
}
async function npmInfo(args, ctx) {
  const name = args[0];
  if (!name)
    return {
      stdout: "",
      stderr: formatErr("Usage: npm info <package>", "npm"),
      exitCode: 1
    };
  const pkgJsonPath = `/node_modules/${name}/package.json`;
  if (_vol.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(
        _vol.readFileSync(pkgJsonPath, "utf8")
      );
      let out = `${pkg.name}@${pkg.version}
`;
      if (pkg.description) out += `${pkg.description}
`;
      if (pkg.license) out += `license: ${pkg.license}
`;
      if (pkg.homepage) out += `homepage: ${pkg.homepage}
`;
      if (pkg.dependencies) {
        out += "\ndependencies:\n";
        for (const [k, v] of Object.entries(pkg.dependencies))
          out += `  ${k}: ${v}
`;
      }
      return { stdout: out, stderr: "", exitCode: 0 };
    } catch {
    }
  }
  try {
    const { RegistryClient } = await Promise.resolve().then(() => require('./index-lVFpjksc.cjs')).then(n => n.registryClient);
    const client = new RegistryClient();
    const meta = await client.fetchManifest(name);
    const latest = meta["dist-tags"]?.latest;
    let out = `${name}@${latest ?? "unknown"}
`;
    if (latest && meta.versions[latest]) {
      const ver = meta.versions[latest];
      if (ver.description) out += `${ver.description}
`;
      if (ver.license) out += `license: ${ver.license}
`;
      if (ver.homepage) out += `homepage: ${ver.homepage}
`;
    }
    return { stdout: out, stderr: "", exitCode: 0 };
  } catch (e) {
    return {
      stdout: "",
      stderr: formatErr(`Not found: ${name}`, "npm"),
      exitCode: 1
    };
  }
}
function npmPack(ctx) {
  const r = loadManifest(ctx.cwd);
  if ("fail" in r) return r.fail;
  const notice = `${A_DIM}npm notice${A_RESET}`;
  let out = `${notice}
`;
  out += `${notice} ${A_BOLD}package:${A_RESET} ${r.pkg.name}@${r.pkg.version}
`;
  const files = [];
  const walk = (dir) => {
    try {
      for (const name of _vol.readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = `${dir}/${name}`;
        const st = _vol.statSync(full);
        if (st.isDirectory()) walk(full);
        else files.push(full);
      }
    } catch {
    }
  };
  walk(ctx.cwd);
  for (const f of files) out += `${notice} ${f}
`;
  out += `${notice} ${A_BOLD}total files:${A_RESET} ${files.length}
`;
  return { stdout: out, stderr: "", exitCode: 0 };
}
function npmConfig(args, ctx) {
  const sub = args[0];
  if (!sub || sub === "list") {
    let out = "; nodepod project config\n";
    out += `prefix = "${ctx.cwd}"
`;
    out += `registry = "${index.NPM_REGISTRY_URL_SLASH}"
`;
    return { stdout: out, stderr: "", exitCode: 0 };
  }
  if (sub === "get") {
    const key = args[1];
    if (key === "prefix")
      return { stdout: ctx.cwd + "\n", stderr: "", exitCode: 0 };
    if (key === "registry")
      return {
        stdout: index.NPM_REGISTRY_URL_SLASH + "\n",
        stderr: "",
        exitCode: 0
      };
    return { stdout: "undefined\n", stderr: "", exitCode: 0 };
  }
  if (sub === "set") {
    return {
      stdout: "",
      stderr: formatWarn("config set: not supported in nodepod", "npm"),
      exitCode: 0
    };
  }
  return {
    stdout: "",
    stderr: formatErr(`config: unknown subcommand "${sub}"`, "npm"),
    exitCode: 1
  };
}
async function executeNodeBinary(filePath, args, ctx, opts) {
  if (!_vol) return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
  const rawPath = filePath.startsWith("/") ? filePath : `${ctx.cwd}/${filePath}`.replace(/\/+/g, "/");
  let resolved = "";
  if (_vol.existsSync(rawPath) && !_vol.statSync(rawPath).isDirectory()) {
    resolved = rawPath;
  } else {
    const exts = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
    for (const ext of exts) {
      if (_vol.existsSync(rawPath + ext)) {
        resolved = rawPath + ext;
        break;
      }
    }
    if (!resolved) {
      const dirPath = rawPath.endsWith("/") ? rawPath : rawPath + "/";
      for (const idx of ["index.js", "index.mjs", "index.ts", "index.cjs"]) {
        if (_vol.existsSync(dirPath + idx)) {
          resolved = dirPath + idx;
          break;
        }
      }
    }
  }
  if (!resolved) {
    const errMsg = `Cannot locate module '${rawPath}'
`;
    const errSink = getStderrSink();
    if (errSink) errSink(errMsg);
    return {
      stdout: "",
      stderr: errMsg,
      exitCode: 1
    };
  }
  let out = "";
  let err = "";
  let didExit = false;
  let code = 0;
  const pushOut = (s) => {
    out += s;
    const sink = getStdoutSink();
    if (sink) sink(s);
    return true;
  };
  const pushErr = (s) => {
    err += s;
    const sink = getStderrSink();
    if (sink) sink(s);
    return true;
  };
  const savedProcess = globalThis.process;
  const sandbox = new index.ScriptEngine(_vol, {
    cwd: ctx.cwd,
    env: ctx.env,
    onConsole: (m, cArgs) => {
      if (cArgs.length === 1) {
        const a = cArgs[0];
        if (a instanceof Error && a.message.startsWith("Process exited with code")) return;
        if (typeof a === "string" && a.startsWith("Error: Process exited with code")) return;
      }
      const line = index.format(cArgs[0], ...cArgs.slice(1)) + "\n";
      m === "error" ? pushErr(line) : pushOut(line);
    },
    onStdout: pushOut,
    onStderr: pushErr,
    workerThreadsOverride: opts?.workerThreadsOverride
  });
  const proc = sandbox.getProcess();
  proc._chdirHook = (dir) => {
    if (_shell) _shell.setCwd(dir);
  };
  proc.exit = (c = 0) => {
    if (index.getAllServers().size > 0 && c !== 0) {
      return;
    }
    if (!didExit) {
      didExit = true;
      code = c;
      proc.emit("exit", c);
    }
    throw new Error(`Process exited with code ${c}`);
  };
  proc.argv = ["node", resolved, ...args];
  if (_ipcSendFn) {
    proc.send = (msg, _cb) => {
      if (_ipcSendFn) {
        _ipcSendFn(msg);
        if (typeof _cb === "function") _cb(null);
        return true;
      }
      return false;
    };
    proc.connected = true;
    proc.disconnect = () => {
      proc.connected = false;
    };
    setIPCReceiveHandler((data) => {
      proc.emit("message", data);
    });
  }
  const prevLiveStdin = _liveStdin;
  const myHaltSignal = getHaltSignal();
  if (myHaltSignal) {
    proc.stdout.isTTY = true;
    proc.stderr.isTTY = true;
    proc.stdin.isTTY = true;
    const cols = getTermCols();
    const rows = getTermRows();
    proc.stdout.columns = cols;
    proc.stdout.rows = rows;
    proc.stderr.columns = cols;
    proc.stderr.rows = rows;
    proc.stdin.setRawMode = (flag) => {
      proc.stdin.isRaw = flag;
      if (_rawModeChangeCb) _rawModeChangeCb(flag);
      return proc.stdin;
    };
    _liveStdin = proc.stdin;
    const ctx2 = index.getActiveContext();
    if (ctx2) ctx2.liveStdin = proc.stdin;
  }
  const isFork = !!opts?.isFork;
  if (isFork) {
    index.ref();
    const origDisconnect = proc.disconnect;
    proc.disconnect = () => {
      origDisconnect?.call(proc);
      index.unref();
    };
  }
  let scriptError = null;
  let tlaSettled = false;
  try {
    const tlaPromise = sandbox.runFileTLA(resolved);
    tlaPromise.catch((e) => {
      if (e instanceof Error && e.message.startsWith("Process exited with code")) {
        return;
      }
      const msg = formatThrown(e);
      pushErr(`Error: ${msg}
`);
      if (!didExit) {
        didExit = true;
        code = 1;
      }
    }).finally(() => {
      tlaSettled = true;
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Process exited with code")) ; else {
      const msg = formatThrown(e);
      scriptError = e instanceof Error ? e : new Error(msg);
    }
  }
  const cleanup = () => {
    if (savedProcess) globalThis.process = savedProcess;
  };
  if (scriptError) {
    cleanup();
    const errMsg = scriptError.message || scriptError.name || "Unknown error";
    const errStack = scriptError.stack || "";
    const fullMsg = errStack && !errStack.includes(errMsg) ? `${errMsg}
${errStack}` : errStack || errMsg;
    return { stdout: out, stderr: err + `Error: ${fullMsg}
`, exitCode: 1 };
  }
  if (didExit) {
    cleanup();
    return { stdout: out, stderr: err, exitCode: code };
  }
  await new Promise((r) => setTimeout(r, 0));
  const shouldStayAlive = () => {
    if (!tlaSettled) return true;
    if (index.getRefCount() > 0) return true;
    if (index.getAllServers().size > 0) return true;
    return false;
  };
  if (!myHaltSignal && !shouldStayAlive()) {
    cleanup();
    return { stdout: out, stderr: err, exitCode: 0 };
  }
  const handledErrors = /* @__PURE__ */ new WeakSet();
  const rejHandler = (ev) => {
    ev.preventDefault();
    const r = ev.reason;
    if (r instanceof Error && r.message.startsWith("Process exited with code")) {
      return;
    }
    if (r != null && typeof r === "object") handledErrors.add(r);
    try {
      const hasHandler = proc.listenerCount ? proc.listenerCount("unhandledRejection") > 0 : false;
      proc.emit("unhandledRejection", r, ev.promise);
      if (hasHandler) return;
    } catch {
    }
    const rejMsg = r instanceof Error ? `Unhandled rejection: ${r.message}
${r.stack ?? ""}
` : `Unhandled rejection: ${String(r)}
`;
    pushErr(rejMsg);
  };
  const errHandler = (ev) => {
    ev.preventDefault();
    const e = ev.error ?? new Error(ev.message || "Unknown error");
    if (e != null && typeof e === "object" && handledErrors.has(e)) return;
    if (e != null && typeof e === "object") handledErrors.add(e);
    try {
      const hasUncaught = proc.listenerCount ? proc.listenerCount("uncaughtException") > 0 : false;
      proc.emit("uncaughtException", e);
      if (hasUncaught) return;
    } catch {
    }
    try {
      const hasRej = proc.listenerCount ? proc.listenerCount("unhandledRejection") > 0 : false;
      if (hasRej) return;
    } catch {
    }
    const msg = e instanceof Error ? `${e.stack || e.message}
` : `Uncaught: ${String(e)}
`;
    pushErr(msg);
  };
  globalThis.addEventListener("unhandledrejection", rejHandler);
  globalThis.addEventListener("error", errHandler);
  try {
    const haltPromise = myHaltSignal ? new Promise((r) => {
      if (myHaltSignal.aborted) {
        r();
        return;
      }
      myHaltSignal.addEventListener("abort", () => r(), { once: true });
    }) : null;
    let consecutiveEmpty = 0;
    let everNonEmpty = false;
    while (!didExit) {
      if (myHaltSignal?.aborted) {
        break;
      }
      let wakeResolve;
      const wakePromise = new Promise((r) => {
        wakeResolve = r;
      });
      const removeDrain = index.addDrainListener(wakeResolve);
      const tickMs = !everNonEmpty && myHaltSignal && !out && !err ? index.TIMEOUTS.WAIT_LOOP_TICK : 50;
      const racers = [
        wakePromise,
        new Promise((r) => setTimeout(r, tickMs))
      ];
      if (haltPromise) racers.push(haltPromise);
      await Promise.race(racers);
      removeDrain();
      if (myHaltSignal?.aborted) {
        break;
      }
      if (didExit) {
        break;
      }
      if (!shouldStayAlive()) {
        await new Promise((r) => queueMicrotask(r));
        if (didExit || myHaltSignal?.aborted) break;
        if (shouldStayAlive()) {
          everNonEmpty = true;
          consecutiveEmpty = 0;
          continue;
        }
        consecutiveEmpty++;
        if (myHaltSignal) {
          if (!everNonEmpty && !out && !err) {
            if (consecutiveEmpty >= 50) {
              break;
            }
          } else if (!everNonEmpty) {
            if (consecutiveEmpty >= Math.ceil(2e3 / tickMs)) {
              break;
            }
          } else {
            if (consecutiveEmpty >= 100) {
              break;
            }
          }
        } else {
          break;
        }
      } else {
        consecutiveEmpty = 0;
        everNonEmpty = true;
      }
    }
    return { stdout: out, stderr: err, exitCode: didExit ? code : 0 };
  } finally {
    cleanup();
    proc.exit = () => {
    };
    globalThis.removeEventListener("unhandledrejection", rejHandler);
    globalThis.removeEventListener("error", errHandler);
    _liveStdin = prevLiveStdin;
    const ctxRestore = index.getActiveContext();
    if (ctxRestore) ctxRestore.liveStdin = prevLiveStdin;
    index.closeAllServers();
    index.resetRefCount();
    index.resetActiveInterfaceCount();
  }
}
async function npxExecute(params, ctx) {
  if (!_vol) return { stdout: "", stderr: "Volume unavailable\n", exitCode: 1 };
  let autoInstall = true;
  let installPkg = null;
  const filteredParams = [];
  let separatorSeen = false;
  for (let i = 0; i < params.length; i++) {
    if (separatorSeen) {
      filteredParams.push(params[i]);
      continue;
    }
    if (params[i] === "--") {
      separatorSeen = true;
      continue;
    }
    if (params[i] === "-y" || params[i] === "--yes") {
      autoInstall = true;
      continue;
    }
    if (params[i] === "-n" || params[i] === "--no") {
      autoInstall = false;
      continue;
    }
    if ((params[i] === "-p" || params[i] === "--package") && i + 1 < params.length) {
      installPkg = params[++i];
      continue;
    }
    if (params[i] === "--help" || params[i] === "-h") {
      return {
        stdout: `${A_BOLD}Usage:${A_RESET} npx [options] <command> [args...]

${A_BOLD}Options:${A_RESET}
  ${A_CYAN}-y${A_RESET}, ${A_CYAN}--yes${A_RESET}       Auto-confirm install
  ${A_CYAN}-n${A_RESET}, ${A_CYAN}--no${A_RESET}        Don't install if not found
  ${A_CYAN}-p${A_RESET}, ${A_CYAN}--package${A_RESET}   Specify package to install
  ${A_CYAN}--${A_RESET}              Separator for command args
`,
        stderr: "",
        exitCode: 0
      };
    }
    filteredParams.push(params[i]);
  }
  let pkgSpec = filteredParams[0];
  if (!pkgSpec) {
    return {
      stdout: "",
      stderr: formatErr("missing command", "npm"),
      exitCode: 1
    };
  }
  let cmdName;
  if (pkgSpec.startsWith("@")) {
    const rest = pkgSpec.slice(1);
    const atIdx = rest.indexOf("@");
    if (atIdx > 0 && rest.indexOf("/") < atIdx) {
      cmdName = "@" + rest.slice(0, atIdx);
      rest.slice(atIdx + 1);
    } else {
      cmdName = pkgSpec;
    }
  } else {
    const atIdx = pkgSpec.indexOf("@");
    if (atIdx > 0) {
      cmdName = pkgSpec.slice(0, atIdx);
      pkgSpec.slice(atIdx + 1);
    } else {
      cmdName = pkgSpec;
    }
  }
  const actualPkg = installPkg || pkgSpec;
  installPkg ? installPkg.replace(/@[^@/]+$/, "").replace(/^@/, "") : cmdName;
  let resolvedBin = findBinary(cmdName, _vol, ctx.cwd);
  if (!resolvedBin && autoInstall) {
    const installResult = await installPackages([actualPkg], ctx);
    if (installResult.exitCode !== 0) return installResult;
    resolvedBin = findBinary(cmdName, _vol, ctx.cwd);
  }
  if (!resolvedBin) {
    return {
      stdout: "",
      stderr: `npx: command '${cmdName}' not found
`,
      exitCode: 1
    };
  }
  return executeNodeBinary(resolvedBin, filteredParams.slice(1), ctx);
}
function findBinary(name, vol, cwd) {
  const cleanName = name.startsWith("@") ? name : name;
  const shortName = cleanName.includes("/") ? cleanName.split("/").pop() : cleanName;
  const searchRoots = cwd && cwd !== "/" ? [`${cwd}/node_modules`, `/node_modules`] : [`/node_modules`];
  for (const nmDir of searchRoots) {
    const pkgJsonPath = `${nmDir}/${cleanName}/package.json`;
    if (vol.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(
          vol.readFileSync(pkgJsonPath, "utf8")
        );
        if (pkg.bin) {
          if (typeof pkg.bin === "string") {
            return `${nmDir}/${cleanName}/${pkg.bin}`;
          }
          if (typeof pkg.bin === "object") {
            const binMap = pkg.bin;
            const binEntry = binMap[shortName] || binMap[cleanName] || Object.values(binMap)[0];
            if (binEntry) return `${nmDir}/${cleanName}/${binEntry}`;
          }
        }
        if (pkg.main) return `${nmDir}/${cleanName}/${pkg.main}`;
      } catch {
      }
    }
    const binPath = `${nmDir}/.bin/${name}`;
    if (vol.existsSync(binPath)) {
      try {
        const stub = vol.readFileSync(binPath, "utf8");
        const match = stub.match(/node\s+"([^"]+)"/);
        if (match && vol.existsSync(match[1])) return match[1];
      } catch {
      }
    }
  }
  return null;
}
function exec(command, optsOrCb, cb) {
  let options = {};
  let done;
  if (typeof optsOrCb === "function") {
    done = optsOrCb;
  } else if (optsOrCb) {
    options = optsOrCb;
    done = cb;
  }
  const child = new ShellProcess();
  if (!_shell) {
    const e = new Error("[Nodepod] exec requires shell. Call initShellExec() first.");
    setTimeout(() => {
      child.emit("error", e);
      if (done) done(e, "", "");
    }, 0);
    return child;
  }
  const cwd = options.cwd ?? getShellCwd();
  const env = options.env ?? void 0;
  _shell.exec(command, { cwd, env }).then(
    (result) => {
      const { stdout, stderr, exitCode } = result;
      if (stdout) child.stdout?.push(index.Buffer.from(stdout));
      if (stderr) child.stderr?.push(index.Buffer.from(stderr));
      child.stdout?.push(null);
      child.stderr?.push(null);
      child.exitCode = exitCode;
      child.emit("close", exitCode, null);
      child.emit("exit", exitCode, null);
      if (done) {
        if (exitCode !== 0) {
          const e = new Error(`Command failed: ${command}`);
          e.code = exitCode;
          done(e, stdout ?? "", stderr ?? "");
        } else {
          done(null, stdout ?? "", stderr ?? "");
        }
      }
    },
    (e) => {
      child.emit("error", e instanceof Error ? e : new Error(String(e)));
      if (done) done(e instanceof Error ? e : new Error(String(e)), "", "");
    }
  );
  return child;
}
function execSync(cmd, opts) {
  const trimmed = cmd.trim();
  const encoding = opts?.encoding;
  const result = handleSyncCommand(trimmed, opts);
  if (result !== null) {
    if (encoding === "buffer") return index.Buffer.from(result);
    return result;
  }
  if (!_syncChannel) {
    throw new Error(
      "[Nodepod] execSync requires SyncChannel (worker mode with SharedArrayBuffer). Ensure Nodepod is running in worker mode with COOP/COEP headers."
    );
  }
  const slot = _syncChannel.allocateSlot();
  const cwd = opts?.cwd ?? globalThis.process?.cwd?.() ?? "/";
  const env = opts?.env ?? {};
  self.postMessage({
    type: "spawn-sync",
    requestId: _nextSyncRequestId++,
    command: trimmed.split(/\s+/)[0],
    args: trimmed.split(/\s+/).slice(1),
    cwd,
    env,
    syncSlot: slot,
    shellCommand: trimmed
  });
  const { exitCode, stdout } = _syncChannel.waitForResult(slot, 12e4);
  if (exitCode !== 0) {
    const err = new Error(`Command failed: ${trimmed}
${stdout}`);
    err.status = exitCode;
    err.stderr = index.Buffer.from("");
    err.stdout = index.Buffer.from(stdout);
    err.output = [null, err.stdout, err.stderr];
    throw err;
  }
  if (encoding === "buffer") return index.Buffer.from(stdout);
  return stdout;
}
let _nextSyncRequestId = 1;
const KNOWN_BINS = {
  node: "/usr/local/bin/node",
  npm: "/usr/local/bin/npm",
  npx: "/usr/local/bin/npx",
  pnpm: "/usr/local/bin/pnpm",
  yarn: "/usr/local/bin/yarn",
  bun: "/usr/local/bin/bun",
  bunx: "/usr/local/bin/bunx",
  git: "/usr/bin/git"
};
function isBinaryAvailable(name) {
  if (KNOWN_BINS[name]) return KNOWN_BINS[name];
  if (_vol) {
    const binPath = `/node_modules/.bin/${name}`;
    if (_vol.existsSync(binPath)) return binPath;
  }
  return null;
}
function throwCommandNotFound(cmd) {
  const err = new Error(
    `Command failed: ${cmd}
/bin/sh: 1: ${cmd.split(/\s+/)[0]}: not found
`
  );
  err.status = 127;
  err.stderr = index.Buffer.from(`/bin/sh: 1: ${cmd.split(/\s+/)[0]}: not found
`);
  err.stdout = index.Buffer.from("");
  throw err;
}
function _findGitDir(cwd) {
  if (!_vol) return null;
  let dir = cwd;
  while (true) {
    const gitPath = dir + "/.git";
    try {
      if (_vol.existsSync(gitPath)) return { gitDir: gitPath, workDir: dir };
    } catch {
    }
    const parent = dir.substring(0, dir.lastIndexOf("/")) || "/";
    if (parent === dir) break;
    dir = parent;
  }
  try {
    if (_vol.existsSync("/.git")) return { gitDir: "/.git", workDir: "/" };
  } catch {
  }
  return null;
}
function _readHeadBranch(gitDir) {
  try {
    const head = _vol.readFileSync(gitDir + "/HEAD", "utf8").trim();
    if (head.startsWith("ref: refs/heads/")) return head.slice(16);
    return head.slice(0, 7);
  } catch {
    return "main";
  }
}
function _resolveHeadHash(gitDir) {
  try {
    const head = _vol.readFileSync(gitDir + "/HEAD", "utf8").trim();
    if (head.startsWith("ref: ")) {
      const refPath = gitDir + "/" + head.slice(5);
      return _vol.readFileSync(refPath, "utf8").trim();
    }
    return head;
  } catch {
    return null;
  }
}
function _readGitConfigKey(gitDir, key) {
  try {
    const config = _vol.readFileSync(gitDir + "/config", "utf8");
    const parts = key.split(".");
    let sectionName, subSection = null, propName;
    if (parts.length === 3) {
      sectionName = parts[0];
      subSection = parts[1];
      propName = parts[2];
    } else if (parts.length === 2) {
      sectionName = parts[0];
      propName = parts[1];
    } else return null;
    const lines = config.split("\n");
    let inSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[")) {
        inSection = subSection ? trimmed === `[${sectionName} "${subSection}"]` : trimmed === `[${sectionName}]`;
        continue;
      }
      if (inSection) {
        const m = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
        if (m && m[1] === propName) return m[2].trim();
      }
    }
  } catch {
  }
  return null;
}
function handleSyncCommand(cmd, opts) {
  if (/^node\s+(--version|-v)\s*$/.test(cmd)) return index.VERSIONS.NODE + "\n";
  if (/^npm\s+(--version|-v)\s*$/.test(cmd)) return index.VERSIONS.NPM + "\n";
  if (/^pnpm\s+(--version|-v)\s*$/.test(cmd)) return index.VERSIONS.PNPM + "\n";
  if (/^yarn\s+(--version|-v)\s*$/.test(cmd)) return index.VERSIONS.YARN + "\n";
  if (/^bun\s+(--version|-v)\s*$/.test(cmd)) return index.VERSIONS.BUN + "\n";
  const whichMatch = cmd.match(/^(?:which|command\s+-v)\s+(\S+)\s*$/);
  if (whichMatch) {
    const binName = whichMatch[1];
    const binPath = isBinaryAvailable(binName);
    if (binPath) return binPath + "\n";
    throwCommandNotFound(cmd);
  }
  const versionMatch = cmd.match(/^(\S+)\s+(--version|-v)\s*$/);
  if (versionMatch) {
    const binName = versionMatch[1];
    if (binName === "node" || binName === "npm" || binName === "pnpm" || binName === "yarn" || binName === "bun")
      return null;
    if (!isBinaryAvailable(binName)) throwCommandNotFound(cmd);
  }
  if (/^(?:npm|yarn|pnpm)\s+config\s+get\s+registry\s*$/.test(cmd)) {
    return index.NPM_REGISTRY_URL_SLASH.replace(/\/$/, "") + "\n";
  }
  const echoMatch = cmd.match(/^echo\s+["']?(.*?)["']?\s*$/);
  if (echoMatch) return echoMatch[1] + "\n";
  if (/^uname\s+-s\s*$/.test(cmd)) return "Linux\n";
  if (/^uname\s+-m\s*$/.test(cmd)) return "x86_64\n";
  if (/^uname\s+-a\s*$/.test(cmd))
    return "Linux nodepod 5.10.0 #1 SMP x86_64 GNU/Linux\n";
  if (/^git\s+(--version|-v)\s*$/.test(cmd) || cmd === "git --version") {
    return "git version " + index.VERSIONS.GIT + "\n";
  }
  if (_vol) {
    const gitRevParseMatch = cmd.match(/^git\s+rev-parse\s+(.+)$/);
    if (gitRevParseMatch) {
      const gitArgs = gitRevParseMatch[1].trim();
      const cwd = opts?.cwd || "/";
      const gd = _findGitDir(cwd);
      if (gitArgs === "--show-toplevel") return gd ? gd.workDir + "\n" : "";
      if (gitArgs === "--is-inside-work-tree") return gd ? "true\n" : "false\n";
      if (gitArgs === "--git-dir") return gd ? ".git\n" : "";
      if (gitArgs === "--is-bare-repository") return "false\n";
      if (gitArgs === "--abbrev-ref HEAD" && gd) return _readHeadBranch(gd.gitDir) + "\n";
      if ((gitArgs === "HEAD" || gitArgs === "--verify HEAD") && gd) {
        const h = _resolveHeadHash(gd.gitDir);
        return h ? h + "\n" : "";
      }
      if (gitArgs === "--short HEAD" && gd) {
        const h = _resolveHeadHash(gd.gitDir);
        return h ? h.slice(0, 7) + "\n" : "";
      }
    }
    if (/^git\s+branch\s+--show-current\s*$/.test(cmd)) {
      const cwd = opts?.cwd || "/";
      const gd = _findGitDir(cwd);
      if (gd) return _readHeadBranch(gd.gitDir) + "\n";
    }
    const gitConfigGetMatch = cmd.match(/^git\s+config\s+(?:--get\s+)?(\S+)\s*$/);
    if (gitConfigGetMatch) {
      const cwd = opts?.cwd || "/";
      const gd = _findGitDir(cwd);
      if (gd) {
        const val = _readGitConfigKey(gd.gitDir, gitConfigGetMatch[1]);
        return val !== null ? val + "\n" : "";
      }
      return "";
    }
  }
  if (/^git\s/.test(cmd)) return "";
  if (cmd === "true" || cmd === ":") return "";
  if (cmd === "pwd") return (opts?.cwd || "/") + "\n";
  if (cmd.startsWith("cat ") && _vol) {
    const path = cmd.slice(4).trim().replace(/['"]/g, "");
    try {
      return _vol.readFileSync(path, "utf8");
    } catch {
      return "";
    }
  }
  if ((cmd === "ls" || cmd.startsWith("ls ")) && _vol) {
    const dir = cmd === "ls" ? opts?.cwd || "/" : cmd.slice(3).trim().replace(/['"]/g, "");
    try {
      return _vol.readdirSync(dir).join("\n") + "\n";
    } catch {
      return "";
    }
  }
  const testMatch = cmd.match(
    /^(?:test|\[)\s+(-[fd])\s+["']?(.*?)["']?\s*\]?\s*$/
  );
  if (testMatch && _vol) {
    const flag = testMatch[1];
    const path = testMatch[2];
    try {
      const st = _vol.statSync(path);
      if (flag === "-f" && st.isFile()) return "";
      if (flag === "-d" && st.isDirectory()) return "";
    } catch {
    }
    return "";
  }
  return null;
}
function spawn(command, argsOrOpts, opts) {
  let spawnArgs = [];
  let cfg = {};
  if (Array.isArray(argsOrOpts)) {
    spawnArgs = argsOrOpts;
    cfg = opts ?? {};
  } else if (argsOrOpts) cfg = argsOrOpts;
  const child = new ShellProcess();
  if (_spawnChildFn) {
    const cwd = cfg.cwd ?? getShellCwd();
    const env = cfg.env ?? {};
    spawnArgs.length ? `${command} ${spawnArgs.join(" ")}` : command;
    index.ref();
    _spawnChildFn(command, spawnArgs, {
      cwd,
      env,
      stdio: "pipe",
      onStdout: (data) => {
        child.stdout?.push(index.Buffer.from(data));
        const sink = getStdoutSink();
        if (sink) sink(data);
      },
      onStderr: (data) => {
        child.stderr?.push(index.Buffer.from(data));
        const sink = getStderrSink();
        if (sink) sink(data);
      }
    }).then(({ exitCode }) => {
      index.unref();
      child.stdout?.push(null);
      child.stderr?.push(null);
      child.exitCode = exitCode;
      child.emit("close", exitCode, null);
      child.emit("exit", exitCode, null);
    }).catch((e) => {
      index.unref();
      child.emit("error", e instanceof Error ? e : new Error(String(e)));
    });
  } else if (_shell) {
    const cwd = cfg.cwd ?? getShellCwd();
    const env = cfg.env ?? void 0;
    const fullCmd = spawnArgs.length ? `${command} ${spawnArgs.map((a) => a.includes(" ") ? `"${a}"` : a).join(" ")}` : command;
    _shell.exec(fullCmd, { cwd, env }).then(
      (result) => {
        const { stdout, stderr, exitCode } = result;
        if (stdout) child.stdout?.push(index.Buffer.from(stdout));
        if (stderr) child.stderr?.push(index.Buffer.from(stderr));
        child.stdout?.push(null);
        child.stderr?.push(null);
        child.exitCode = exitCode;
        child.emit("close", exitCode, null);
        child.emit("exit", exitCode, null);
      },
      (e) => {
        child.emit("error", e instanceof Error ? e : new Error(String(e)));
      }
    );
  } else {
    setTimeout(() => {
      child.emit("error", new Error("[Nodepod] spawn requires shell or worker mode."));
    }, 0);
  }
  queueMicrotask(() => child.emit("spawn"));
  return child;
}
function spawnSync(cmd, args, opts) {
  let spawnArgs = [];
  let cfg = {};
  if (Array.isArray(args)) {
    spawnArgs = args;
    cfg = opts ?? {};
  } else if (args) {
    cfg = args;
  }
  const full = spawnArgs.length ? `${cmd} ${spawnArgs.join(" ")}` : cmd;
  const syncResult = handleSyncCommand(full, { cwd: cfg.cwd, env: cfg.env });
  if (syncResult !== null) {
    const stdout = index.Buffer.from(syncResult);
    const stderr = index.Buffer.from("");
    return {
      stdout,
      stderr,
      status: 0,
      signal: null,
      pid: index.MOCK_PID.BASE + Math.floor(Math.random() * index.MOCK_PID.RANGE),
      output: [null, stdout, stderr]
    };
  }
  if (!_syncChannel) {
    throw new Error(
      "[Nodepod] spawnSync requires SyncChannel (worker mode with SharedArrayBuffer). Ensure Nodepod is running in worker mode with COOP/COEP headers."
    );
  }
  const slot = _syncChannel.allocateSlot();
  const cwd = cfg.cwd ?? globalThis.process?.cwd?.() ?? "/";
  const env = cfg.env ?? {};
  self.postMessage({
    type: "spawn-sync",
    requestId: _nextSyncRequestId++,
    command: full.split(/\s+/)[0],
    args: full.split(/\s+/).slice(1),
    cwd,
    env,
    syncSlot: slot,
    shellCommand: full
  });
  try {
    const { exitCode, stdout: stdoutStr } = _syncChannel.waitForResult(slot, 12e4);
    const stdout = index.Buffer.from(stdoutStr);
    const stderr = index.Buffer.from("");
    return {
      stdout,
      stderr,
      status: exitCode,
      signal: null,
      pid: index.MOCK_PID.BASE + Math.floor(Math.random() * index.MOCK_PID.RANGE),
      output: [null, stdout, stderr]
    };
  } catch (e) {
    const stdout = index.Buffer.from(e?.stdout ?? "");
    const stderr = index.Buffer.from(e?.message ?? "");
    return {
      stdout,
      stderr,
      status: e?.status ?? 1,
      signal: null,
      pid: index.MOCK_PID.BASE + Math.floor(Math.random() * index.MOCK_PID.RANGE),
      output: [null, stdout, stderr],
      error: e instanceof Error ? e : new Error(String(e))
    };
  }
}
function execFileSync(file, args, opts) {
  const cmd = args?.length ? `${file} ${args.join(" ")}` : file;
  return execSync(cmd, opts);
}
function execFile(file, argsOrOpts, optsOrCb, cb) {
  let fileArgs = [];
  let options = {};
  let done;
  if (Array.isArray(argsOrOpts)) {
    fileArgs = argsOrOpts;
    if (typeof optsOrCb === "function") done = optsOrCb;
    else if (optsOrCb) {
      options = optsOrCb;
      done = cb;
    }
  } else if (typeof argsOrOpts === "function") {
    done = argsOrOpts;
  } else if (argsOrOpts) {
    options = argsOrOpts;
    done = optsOrCb;
  }
  const cmd = fileArgs.length ? `${file} ${fileArgs.join(" ")}` : file;
  return exec(cmd, options, done);
}
function fork(modulePath, argsOrOpts, opts) {
  let args = [];
  let cfg = {};
  if (Array.isArray(argsOrOpts)) {
    args = argsOrOpts;
    cfg = opts ?? {};
  } else if (argsOrOpts) cfg = argsOrOpts;
  const cwd = cfg.cwd || getShellCwd();
  const env = cfg.env || (_shell?.getEnv() ?? {});
  const resolved = modulePath.startsWith("/") ? modulePath : `${cwd}/${modulePath}`.replace(/\/+/g, "/");
  const child = new ShellProcess();
  child.connected = true;
  child.spawnargs = ["node", resolved, ...args];
  child.spawnfile = "node";
  if (!_forkChildFn) {
    setTimeout(() => {
      child.emit("error", new Error("[Nodepod] fork requires worker mode. No forkChild callback set."));
    }, 0);
    return child;
  }
  index.ref();
  const handle = _forkChildFn(resolved, args, {
    cwd,
    env,
    onStdout: (data) => {
      child.stdout?.emit("data", data);
      const sink = getStdoutSink();
      if (sink) sink(data);
    },
    onStderr: (data) => {
      child.stderr?.emit("data", data);
      const sink = getStderrSink();
      if (sink) sink(data);
    },
    onIPC: (data) => {
      child.emit("message", data);
    },
    onExit: (exitCode) => {
      index.unref();
      child.exitCode = exitCode;
      child.connected = false;
      child.emit("exit", exitCode, null);
      child.emit("close", exitCode, null);
    }
  });
  child.send = (msg, _cb) => {
    if (!child.connected) return false;
    handle.sendIPC(msg);
    return true;
  };
  child.kill = (sig) => {
    child.killed = true;
    child.connected = false;
    handle.disconnect();
    child.emit("exit", null, sig ?? "SIGTERM");
    child.emit("close", null, sig ?? "SIGTERM");
    return true;
  };
  child.disconnect = () => {
    child.connected = false;
    handle.disconnect();
    child.emit("disconnect");
  };
  return child;
}
const ShellProcess = function ShellProcess2() {
  if (!this) return;
  index.EventEmitter.call(this);
  this.pid = index.MOCK_PID.BASE + Math.floor(Math.random() * index.MOCK_PID.RANGE);
  this.connected = false;
  this.killed = false;
  this.exitCode = null;
  this.signalCode = null;
  this.spawnargs = [];
  this.spawnfile = "";
  this.stdin = new index.Writable();
  this.stdout = new index.Readable();
  this.stderr = new index.Readable();
};
Object.setPrototypeOf(ShellProcess.prototype, index.EventEmitter.prototype);
ShellProcess.prototype.kill = function kill(sig) {
  this.killed = true;
  this.emit("exit", null, sig ?? "SIGTERM");
  return true;
};
ShellProcess.prototype.disconnect = function disconnect() {
  this.connected = false;
};
ShellProcess.prototype.send = function send(msg, cb) {
  if (cb) cb(new Error("IPC unavailable"));
  return false;
};
ShellProcess.prototype.ref = function ref2() {
  return this;
};
ShellProcess.prototype.unref = function unref2() {
  return this;
};
const child_process = {
  exec,
  execSync,
  execFile,
  execFileSync,
  spawn,
  spawnSync,
  fork,
  ShellProcess,
  initShellExec,
  shellExec,
  setStreamingCallbacks,
  clearStreamingCallbacks,
  sendStdin,
  setSyncChannel,
  setSpawnChildCallback,
  setForkChildCallback,
  setIPCSend,
  setIPCReceiveHandler,
  handleIPCFromParent,
  executeNodeBinary
};

exports.ShellProcess = ShellProcess;
exports.clearStreamingCallbacks = clearStreamingCallbacks;
exports.default = child_process;
exports.exec = exec;
exports.execFile = execFile;
exports.execFileSync = execFileSync;
exports.execSync = execSync;
exports.executeNodeBinary = executeNodeBinary;
exports.fork = fork;
exports.getShellCwd = getShellCwd;
exports.handleIPCFromParent = handleIPCFromParent;
exports.initShellExec = initShellExec;
exports.isStdinRaw = isStdinRaw;
exports.sendStdin = sendStdin;
exports.setForkChildCallback = setForkChildCallback;
exports.setIPCReceiveHandler = setIPCReceiveHandler;
exports.setIPCSend = setIPCSend;
exports.setShellCwd = setShellCwd;
exports.setSpawnChildCallback = setSpawnChildCallback;
exports.setStreamingCallbacks = setStreamingCallbacks;
exports.setSyncChannel = setSyncChannel;
exports.shellExec = shellExec;
exports.spawn = spawn;
exports.spawnSync = spawnSync;
//# sourceMappingURL=child_process-CW-z_hoC.cjs.map
