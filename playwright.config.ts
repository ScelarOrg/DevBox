import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/e2e',
  timeout: 60000,
  projects: [
    {
      name: 'git-clone',
      testDir: './src/__tests__/e2e/git-clone',
      testMatch: '*.test.ts',
      use: { baseURL: 'http://localhost:4567' },
    },
    {
      name: 'git-clone-api',
      testDir: './src/__tests__/e2e/git-clone-api',
      testMatch: '*.test.ts',
      use: { baseURL: 'http://localhost:4568' },
    },
  ],
  webServer: [
    {
      command: 'npx vite --config src/__tests__/e2e/git-clone/vite.config.ts',
      port: 4567,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'npx vite --config src/__tests__/e2e/git-clone-api/vite.config.ts',
      port: 4568,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});