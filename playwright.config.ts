import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 120000, expect: { timeout: 15000 }, workers: 1,
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:5173', channel: 'msedge', headless: true, viewport: { width: 1280, height: 800 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list']],
});
