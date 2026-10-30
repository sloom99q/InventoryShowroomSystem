import { defineConfig, devices } from '@playwright/test'

// Runs against the local dev server and local Supabase (`supabase start`).
// Seed an admin first: see README "Local development".
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: { command: 'npx vite --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
})
