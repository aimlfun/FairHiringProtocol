import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests for Fair Hiring Protocol.
 * Requires:
 *   - Static file server on port 9999 (serves *.html from repo root)
 *   - API server on port 3000 (`cd api && npm run dev`)
 *   - Running PostgreSQL with migrations applied
 *
 * Start both with: ./start-dev.ps1 (Windows PowerShell)
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: 1, // retry once on transient API/network errors
  workers: 1, // sequential — tests share the same DB

  use: {
    baseURL: 'http://localhost:9999',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: './test-results',
});
