import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: true,
  retries: 0,
  timeout: 40_000,
  expect: { timeout: 5000 },
  outputDir: '../../test-results/h5',
  reporter: [['line'], ['html', { outputFolder: '../../playwright-report/h5', open: 'never' }]],
  use: {
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: 'node e2e/h5/server.mjs taro-app 4181', url: 'http://127.0.0.1:4181', cwd: '../..', reuseExistingServer: false },
    { command: 'node e2e/h5/server.mjs taro-app-vue3 4182', url: 'http://127.0.0.1:4182', cwd: '../..', reuseExistingServer: false },
    { command: 'node e2e/h5/server.mjs uni-app-vue3 4183', url: 'http://127.0.0.1:4183', cwd: '../..', reuseExistingServer: false },
  ],
})
