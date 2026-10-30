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

/** Create the fictional test car through the document import, the way a user would. Returns its URL. */
export async function importFictionalCar(page: Page, extraFiles: string[] = []) {
  const FX = path.resolve(import.meta.dirname, 'fixtures')
  await page.goto('/vehicles/new?mode=documents')
  await expect(page.getByText('Drop files here, or click to choose')).toBeVisible()
  await page.locator('input[type=file][multiple][accept*=".docx"]').setInputFiles(
    [...['a-brochure-bilingual.pdf', 'b-spec-table.pdf', 'c-summary.docx', 'd-spec-sheet.xlsx'].map((f) => path.join(FX, f)), ...extraFiles])
  await expect(page.getByText(/details found/)).toHaveCount(4, { timeout: 30_000 })
  const chassisField = page.locator('fieldset[data-field=chassis_number]')
  await chassisField.getByText('Type a value').click()
  await chassisField.getByPlaceholder('LVVDB21B9PD012345').fill(randomChassis())
  for (const f of ['brand', 'model', 'year']) {
    const radios = page.locator(`fieldset[data-field=${f}] input[type=radio]:not([disabled])`)
    if ((await radios.count()) > 2) await radios.first().check()
  }
  for (const fs of await page.locator('fieldset').all()) {
    if (await fs.getByText('Choose one').isVisible()) await fs.locator('input[type=radio]:not([disabled])').first().check()
  }
  await page.getByRole('button', { name: 'Create vehicle and save' }).click()
  await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  return page.url().replace(/\?.*$/, '')
}
