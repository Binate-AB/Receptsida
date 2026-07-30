// ============================================
// Playwright config — browser smoke test
// Runs against a served instance (local `next start`
// on :3000 with the backend on :4000, or a deployed
// URL). No app code is mocked.
//
//   BASE_URL=https://www.nisse.io npx playwright test
//   (default: http://localhost:3000)
// ============================================

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    // Chromium is pre-provisioned in CI via PLAYWRIGHT_BROWSERS_PATH.
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
