import { describe, it, expect } from "vitest";
import { MemoryVolume } from "../memory-volume";
import { NodepodShell } from "../shell/shell-interpreter";
import { createGitCommand } from "../shell/commands/git";

function createGitShell(cwd = "/repo") {
  const vol = new MemoryVolume();
  vol.mkdirSync(cwd, { recursive: true });
  const shell = new NodepodShell(vol, {
    cwd,
    env: {
      HOME: "/home/user",
      PATH: "/usr/bin",
      PWD: cwd,
    },
  });
  shell.registerCommand(createGitCommand());
  return { vol, shell };
}

async function g(shell: NodepodShell, cmd: string) {
  return shell.exec(cmd);
}

describe("git shell commands", () => {
  it("init, commit, tag, show", async () => {
    const { vol, shell } = createGitShell();
    expect((await g(shell, "git init")).exitCode).toBe(0);
    await g(shell, "git config user.name Tester");
    await g(shell, "git config user.email t@example.com");
    vol.writeFileSync("/repo/a.txt", "hello\n");
    await g(shell, "git add a.txt");
    expect((await g(shell, 'git commit -m "first"')).exitCode).toBe(0);

    expect((await g(shell, "git tag v1.0.0")).exitCode).toBe(0);
    const tags = await g(shell, "git tag");
    expect(tags.stdout).toContain("v1.0.0");

    const show = await g(shell, "git show HEAD");
    expect(show.stdout).toContain("first");
    expect(show.exitCode).toBe(0);

    expect((await g(shell, "git tag -d v1.0.0")).exitCode).toBe(0);
  });

  it("restore and clean", async () => {
    const { vol, shell } = createGitShell();
    await g(shell, "git init");
    await g(shell, "git config user.name Tester");
    await g(shell, "git config user.email t@example.com");
    vol.writeFileSync("/repo/a.txt", "v1\n");
    await g(shell, "git add a.txt");
    await g(shell, 'git commit -m "base"');

    vol.writeFileSync("/repo/a.txt", "dirty\n");
    await g(shell, "git restore a.txt");
    expect(vol.readFileSync("/repo/a.txt", "utf8")).toBe("v1\n");

    vol.writeFileSync("/repo/junk.txt", "x");
    await g(shell, "git clean -f");
    expect(vol.existsSync("/repo/junk.txt")).toBe(false);
  });

  it("merge with conflict markers", async () => {
    const { vol, shell } = createGitShell();
    await g(shell, "git init");
    await g(shell, "git config user.name Tester");
    await g(shell, "git config user.email t@example.com");
    vol.writeFileSync("/repo/f.txt", "base\n");
    await g(shell, "git add f.txt");
    await g(shell, 'git commit -m "base"');

    await g(shell, "git branch feature");
    vol.writeFileSync("/repo/f.txt", "main-change\n");
    await g(shell, "git add f.txt");
    await g(shell, 'git commit -m "main"');

    await g(shell, "git checkout feature");
    vol.writeFileSync("/repo/f.txt", "feature-change\n");
    await g(shell, "git add f.txt");
    await g(shell, 'git commit -m "feature"');

    const merge = await g(shell, "git merge main");
    expect(merge.exitCode).toBe(1);
    const content = vol.readFileSync("/repo/f.txt", "utf8") as string;
    expect(content).toContain("<<<<<<<");
    expect(content).toContain(">>>>>>>");
  });

  it("cherry-pick and rebase linear", async () => {
    const { vol, shell } = createGitShell();
    await g(shell, "git init");
    await g(shell, "git config user.name Tester");
    await g(shell, "git config user.email t@example.com");
    vol.writeFileSync("/repo/a.txt", "1\n");
    await g(shell, "git add a.txt");
    await g(shell, 'git commit -m "c1"');

    await g(shell, "git branch other");
    vol.writeFileSync("/repo/a.txt", "1\n2\n");
    await g(shell, "git add a.txt");
    await g(shell, 'git commit -m "c2-main"');

    await g(shell, "git checkout other");
    vol.writeFileSync("/repo/b.txt", "only-other\n");
    await g(shell, "git add b.txt");
    const commitOther = await g(shell, 'git commit -m "c2-other"');
    expect(commitOther.exitCode).toBe(0);

    await g(shell, "git checkout main");
    // get other tip via log on other
    await g(shell, "git checkout other");
    const log = await g(shell, "git log --format=%H -1");
    const otherHash = log.stdout.trim();
    expect(otherHash.length).toBe(40);
    await g(shell, "git checkout main");

    const cp = await g(shell, `git cherry-pick ${otherHash}`);
    expect(cp.exitCode).toBe(0);
    expect(vol.existsSync("/repo/b.txt")).toBe(true);

    // rebase: branch from oldest commit, add a commit, rebase onto main
    const logAll = await g(shell, "git log --format=%H");
    const hashes = logAll.stdout.trim().split("\n").filter(Boolean);
    const oldest = hashes[hashes.length - 1];
    await g(shell, "git checkout -b rebase-me");
    await g(shell, `git reset --hard ${oldest}`);
    vol.writeFileSync("/repo/c.txt", "rebased\n");
    await g(shell, "git add c.txt");
    await g(shell, 'git commit -m "on-old"');
    const rebase = await g(shell, "git rebase main");
    expect(rebase.exitCode).toBe(0);
    expect(vol.existsSync("/repo/c.txt")).toBe(true);
  });

  it("blame attributes lines", async () => {
    const { vol, shell } = createGitShell();
    await g(shell, "git init");
    await g(shell, "git config user.name Alice");
    await g(shell, "git config user.email a@example.com");
    vol.writeFileSync("/repo/x.txt", "line1\n");
    await g(shell, "git add x.txt");
    await g(shell, 'git commit -m "add"');
    const blame = await g(shell, "git blame x.txt");
    expect(blame.exitCode).toBe(0);
    expect(blame.stdout).toContain("line1");
  });

  it("stash pop accepts stash@{N} and bare N", async () => {
    const { vol, shell } = createGitShell();
    await g(shell, "git init");
    await g(shell, "git config user.name Tester");
    await g(shell, "git config user.email t@example.com");
    vol.writeFileSync("/repo/a.txt", "v1\n");
    await g(shell, "git add a.txt");
    await g(shell, 'git commit -m "base"');

    vol.writeFileSync("/repo/a.txt", "stash0\n");
    expect((await g(shell, "git stash push")).exitCode).toBe(0);
    vol.writeFileSync("/repo/a.txt", "stash1\n");
    expect((await g(shell, "git stash push")).exitCode).toBe(0);

    const list = await g(shell, "git stash list");
    expect(list.stdout).toContain("stash@{0}");
    expect(list.stdout).toContain("stash@{1}");

    const apply = await g(shell, "git stash apply stash@{1}");
    expect(apply.exitCode).toBe(0);
    expect(vol.readFileSync("/repo/a.txt", "utf8")).toBe("stash0\n");

    const drop = await g(shell, "git stash drop 1");
    expect(drop.exitCode).toBe(0);
  });
});
