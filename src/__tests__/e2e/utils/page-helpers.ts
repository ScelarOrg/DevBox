import type { Page } from '@playwright/test';

export async function boot(page: Page) {
  return page.evaluate(() => (window as any).__nodepodTest.boot());
}

export async function gitClone(page: Page, url: string, dir?: string) {
  return page.evaluate(([u, d]) => (window as any).__nodepodTest.gitClone(u, d), [url, dir] as const);
}

export async function listFiles(page: Page, dir: string) {
  return page.evaluate((d) => (window as any).__nodepodTest.listFiles(d), dir);
}

export async function readFile(page: Page, path: string) {
  return page.evaluate((p) => (window as any).__nodepodTest.readFile(p), path);
}

export async function fileExists(page: Page, path: string) {
  return page.evaluate((p) => (window as any).__nodepodTest.fileExists(p), path);
}