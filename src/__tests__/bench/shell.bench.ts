import { describe, bench, beforeEach } from "vitest";
import { parse, expandVariables } from "../../shell/shell-parser";
import { NodepodShell } from "../../shell/shell-interpreter";
import { MemoryVolume } from "../../memory-volume";

const ENV = {
  HOME: "/home/user",
  PATH: "/usr/bin",
  PWD: "/",
  NODE_ENV: "production",
};

describe("Shell parser", () => {
  bench("simple: echo hello", () => {
    parse("echo hello", ENV, 0);
  });

  bench("pipe: ls | grep foo | wc -l", () => {
    parse("ls | grep foo | wc -l", ENV, 0);
  });

  bench("compound: cd /tmp && ls -la && echo done", () => {
    parse("cd /tmp && ls -la && echo done", ENV, 0);
  });

  bench("redirects: cat file.txt > output.txt 2>&1", () => {
    parse("cat file.txt > output.txt 2>&1", ENV, 0);
  });

  bench("variable expansion: echo $HOME $PWD $NODE_ENV", () => {
    parse("echo $HOME $PWD $NODE_ENV", ENV, 0);
  });

  bench("complex: VAR=hello echo ${VAR:-default} | cat && echo $?", () => {
    parse("VAR=hello echo ${VAR:-default} | cat && echo $?", ENV, 0);
  });

  bench("quoted strings: echo 'hello world' \"$HOME/path\"", () => {
    parse(`echo 'hello world' "$HOME/path"`, ENV, 0);
  });
});

describe("Shell expandVariables", () => {
  bench("simple $VAR", () => {
    expandVariables("$HOME", ENV, 0);
  });

  bench("${VAR:-default}", () => {
    expandVariables("${MISSING:-fallback}", ENV, 0);
  });

  bench("multiple vars in string", () => {
    expandVariables("$HOME/.config/$NODE_ENV/settings", ENV, 0);
  });
});

describe("Shell interpreter - builtins", () => {
  let shell: NodepodShell;

  beforeEach(() => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/project/src", { recursive: true });
    for (let i = 0; i < 20; i++) {
      vol.writeFileSync(
        `/project/src/file-${i}.ts`,
        `export const x = ${i};`,
      );
    }
    vol.writeFileSync(
      "/project/readme.md",
      "# Project\nThis is a readme.\nLine 3.\n",
    );
    shell = new NodepodShell(vol, { cwd: "/project", env: { ...ENV } });
  });

  bench("echo hello world", async () => {
    await shell.exec("echo hello world");
  });

  bench("ls /project/src (20 files)", async () => {
    await shell.exec("ls /project/src");
  });

  bench("cat readme.md", async () => {
    await shell.exec("cat /project/readme.md");
  });

  bench("pwd", async () => {
    await shell.exec("pwd");
  });

  bench("pipe: echo hello | cat", async () => {
    await shell.exec("echo hello | cat");
  });

  bench("mkdir -p + echo redirect + rm", async () => {
    await shell.exec(
      "mkdir -p /tmp/bench && echo test > /tmp/bench/f.txt && rm /tmp/bench/f.txt",
    );
  });
});
