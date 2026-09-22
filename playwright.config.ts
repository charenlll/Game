import { defineConfig } from '@playwright/test';

process.env.PLAYWRIGHT_RUN_ID ??= String(Date.now());

export default defineConfig({
  testDir: './e2e',
  outputDir: `artifacts/browser/run-${process.env.PLAYWRIGHT_RUN_ID}`,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge', headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'off' },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
