import { defineConfig, devices } from '@playwright/test'

// Locally, PWEXE can point at a native Chromium when Playwright's bundled build doesn't run.
const executablePath = process.env.PWEXE || undefined

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', launchOptions: { executablePath } },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } }],
})
