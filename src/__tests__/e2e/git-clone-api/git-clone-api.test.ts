import { test, expect } from '@playwright/test';
import { startMockGithub } from './mock-github';
import { boot, gitClone, listFiles, readFile } from '../utils/page-helpers';
import type { Server } from 'node:http';

let mockServer: Server;

test.beforeAll(async () => {
  mockServer = await startMockGithub(4569);
});

test.afterAll(async () => {
  mockServer?.close();
});

test.describe('git clone API mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4568');
    expect(await boot(page)).toBe(true);
  });

  test('clones mock repo and checks out files', async ({ page }) => {
    const result = await gitClone(page, 'https://github.com/test-org/test-repo');
    expect(result.exitCode).toBe(0);

    const files = await listFiles(page, '/workspace/test-repo');
    expect(files).toContain('package.json');
    expect(files).toContain('README.md');

    const pkgContent = await readFile(page, '/workspace/test-repo/package.json');
    expect(pkgContent).toBeTruthy();
    const pkg = JSON.parse(pkgContent);
    expect(pkg.name).toBe('test-repo');
  });

  test('clones mock repo with subdirectories', async ({ page }) => {
    const result = await gitClone(page, 'https://github.com/test-org/test-repo');
    expect(result.exitCode).toBe(0);

    const content = await readFile(page, '/workspace/test-repo/src/index.ts');
    expect(content).toBeTruthy();
    expect(content).toContain('hello');
  });

  test('README.md has expected content', async ({ page }) => {
    await gitClone(page, 'https://github.com/test-org/test-repo');
    const readme = await readFile(page, '/workspace/test-repo/README.md');
    expect(readme).toContain('mock repository');
  });

  test('clone non-existent repo returns error', async ({ page }) => {
    const result = await gitClone(page, 'https://github.com/test-org/nonexistent-repo');
    expect(result.exitCode).not.toBe(0);
  });
});