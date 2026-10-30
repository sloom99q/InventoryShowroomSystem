import { expect, type Page } from '@playwright/test'
import path from 'node:path'

export const FIXTURES = path.resolve(import.meta.dirname, '../../worker/tests/fixtures')
export const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@showroom.local', password: process.env.E2E_PASSWORD ?? 'Showroom!2026' }

export async function login(page: Page) {
  await page.goto('/')
  await page.locator('input[type=email]').fill(ADMIN.email)
  await page.locator('input[type=password]').fill(ADMIN.password)
  await page.locator('button[type=submit]').click()
  await expect(page.locator('main')).toBeVisible()
  // Tests are written against the English UI; reset the account's language if a previous run left it in Arabic.
  if ((await page.locator('html').getAttribute('lang')) !== 'en') {
    const menu = page.locator('header button').first()
    if (!(await page.locator('aside button[lang=en]').first().isVisible())) await menu.click()
    await page.locator('aside button[lang=en]').last().click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  }
}

/** A random VIN-shaped chassis so tests can run repeatedly against the same database. */
export function randomChassis() {
  const a = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  let s = 'TST'
  for (let i = 0; i < 14; i++) s += a[Math.floor(Math.random() * a.length)]
  return s.slice(0, 11) + String(Math.floor(Math.random() * 900000) + 100000)
}
