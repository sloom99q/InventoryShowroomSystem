import { expect, test } from '@playwright/test'
import path from 'node:path'
import { login, randomChassis } from './helpers'

const FX = path.resolve(import.meta.dirname, 'fixtures')
const files = ['a-brochure-bilingual.pdf', 'b-spec-table.pdf', 'c-summary.docx', 'd-spec-sheet.xlsx'].map((f) => path.join(FX, f))

test('imports four mixed-format files for one new car, with conflicts, Arabic and photos', async ({ page }) => {
  await login(page)
  await page.goto('/vehicles/import')
  await page.locator('input[type=file][multiple]').setInputFiles([...files, path.join(FX, 'notes.txt.fake')].filter((f) => !f.endsWith('.fake')))

  // Every file is read; nothing is saved yet.
  await expect(page.getByText(/details found/)).toHaveCount(4, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Save to vehicle|Create vehicle/ })).toBeDisabled()

  // No chassis in any file and we came from "Add vehicle": it starts as a new vehicle (switchable).
  await expect(page.getByText('New vehicle').first()).toBeVisible()

  // The conflicting value is shown, not resolved.
  const conflict = page.locator('li', { hasText: 'The files disagree' }).first()
  await expect(conflict).toBeVisible()
  await expect(page.getByText(/conflict.* to resolve/)).toBeVisible()

  // Model year comes from the vehicle name, not the 2023 document date.
  const year = page.locator('fieldset[data-field=year]')
  await expect(year).toContainText('2024')
  await expect(year).not.toContainText('2023')

  // Arabic text is readable (no presentation-form glyphs) on the review screen.
  const body = await page.locator('main').innerText()
  expect(body).toMatch(/[؀-ۿ]/)
  expect(body).not.toMatch(/[ﭐ-﷿ﹰ-﻿]/)

  // Pictures inside the PDF / DOCX are offered, unticked.
  const photos = page.locator('[data-photo]')
  await expect(photos.first()).toBeVisible({ timeout: 30_000 })
  await expect(photos.first().locator('input[type=checkbox]')).not.toBeChecked()
  await photos.first().locator('input[type=checkbox]').check()

  await page.screenshot({ path: 'e2e/screens/import-review.png', fullPage: true })

  // Resolve: chassis typed by hand, conflict picked, brand/model suggestion accepted.
  const chassis = randomChassis()
  const chassisField = page.locator('fieldset[data-field=chassis_number]')
  await chassisField.getByText('Type a value').click()
  await chassisField.getByPlaceholder('LVVDB21B9PD012345').fill(chassis)
  for (const c of await page.locator('li', { hasText: 'The files disagree' }).all()) await c.locator('input[type=radio]').first().check()
  for (const f of ['brand', 'model', 'year']) {
    const fs = page.locator(`fieldset[data-field=${f}]`)
    const radios = fs.locator('input[type=radio]:not([disabled])')
    if ((await radios.count()) > 2) await radios.first().check()
  }
  for (const fs of await page.locator('fieldset').all()) {
    if (await fs.getByText('Choose one').isVisible()) await fs.locator('input[type=radio]:not([disabled])').first().check()
  }

  const save = page.getByRole('button', { name: 'Create vehicle and save' })
  await expect(save).toBeEnabled()
  await save.click()
  await page.waitForURL(/tab=specs/, { timeout: 30_000 }).catch(async () => {
    throw new Error('Save failed: ' + (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | '))
  })

  // Specifications saved by section, with sources; documents and the picked photo attached.
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await expect(page.locator('main')).toContainText('a-brochure-bilingual.pdf')
  await page.screenshot({ path: 'e2e/screens/specs-tab.png', fullPage: true })
  await page.getByRole('tab', { name: /Documents/ }).click()
  await expect(page.getByText('c-summary.docx').first()).toBeVisible()
  await expect(page.getByText('d-spec-sheet.xlsx').first()).toBeVisible()
  await page.getByRole('tab', { name: /Photos/ }).click()
  await expect(page.locator('button[aria-label="Open a-brochure-bilingual-p1.jpg"], button[aria-label^="Open a-brochure"], button[aria-label^="Open c-summary"]').first()).toBeVisible()
})

test('an inventory spreadsheet is routed to bulk import', async ({ page }) => {
  await login(page)
  await page.goto('/vehicles/import')
  await page.locator('input[type=file][multiple]').setInputFiles(path.join(FX, 'e-inventory.xlsx'))
  await page.getByRole('button', { name: 'Open in bulk import' }).click()
  await expect(page).toHaveURL(/\/import$/)
  await expect(page.getByText(/ready/).first()).toBeVisible({ timeout: 15_000 })
})

test('unsupported files are rejected with a clear message', async ({ page }) => {
  await login(page)
  await page.goto('/vehicles/import')
  await page.locator('input[type=file][multiple]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByText(/notes\.txt: this file type is not supported/)).toBeVisible()
})
