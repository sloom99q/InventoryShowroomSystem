import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
// @ts-expect-error plain JS helper
import { refusePilot } from './scripts/guard.mjs'

// Tests must never touch the pilot (real data): check the app URL and the Supabase URL the app uses.
const envUrl = (() => { try { return /VITE_SUPABASE_URL=(.*)/.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() } catch { return undefined } })()
refusePilot(envUrl, 'The test suite')
refusePilot(process.env.APP_URL, 'The test suite')

// Runs against the local dev server and local Supabase (`supabase start`).
// Seed an admin first: see README "Local development".
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // tests share one account (and its language setting)
  use: { baseURL: 'http://127.0.0.1:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: { command: 'npx vite --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
})
