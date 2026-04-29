import { test, expect } from '@playwright/test';
import { boot, gitClone, listFiles, readFile, fileExists } from '../utils/page-helpers';

test.describe('git clone e2e', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4567');
    expect(await boot(page)).toBe(true);
  });

  test('clones ScelarOrg/Nodepod and checks out files', async ({ page }) => {
    const result = await gitClone(page, 'https://github.com/ScelarOrg/Nodepod');
    expect(result.exitCode).toBe(0);

    const files = await listFiles(page, '/workspace/Nodepod');
    expect(files).toContain('package.json');
    expect(files).toContain('README.md');

    const pkgContent = await readFile(page, '/workspace/Nodepod/package.json');
    expect(pkgContent).toBeTruthy();
    const pkg = JSON.parse(pkgContent);
    expect(pkg.name).toBe('@scelar/nodepod');
  });

  test('README.md contains nodepod description', async ({ page }) => {
    await gitClone(page, 'https://github.com/ScelarOrg/Nodepod');
    const readme = await readFile(page, '/workspace/Nodepod/README.md');
    expect(readme).toBeTruthy();
    expect(readme.toLowerCase()).toContain('nodepod');
  });

  test('.git directory is created', async ({ page }) => {
    await gitClone(page, 'https://github.com/ScelarOrg/Nodepod');
    expect(await fileExists(page, '/workspace/Nodepod/.git')).toBe(true);
    expect(await fileExists(page, '/workspace/Nodepod/.git/HEAD')).toBe(true);
  });

  test('clone non-existent repo returns error', async ({ page }) => {
    const result = await gitClone(page, 'https://github.com/xyd-js/this-repo-does-not-exist-12345');
    expect(result.exitCode).not.toBe(0);
  });
});