// Pilot feedback: one "Fill specs" page per car, "Copy from a previous car" and "Paste specs".
// Copies from the fictional kit sample car (scripts/seed-sample-car.mjs).
import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { login, randomChassis } from './helpers'

const SAMPLE = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../kit/sample/sample-data.json'), 'utf8'))
const SAMPLE_CHASSIS = 'LVTDB21B9RD012345' // fictional, seeded by seed-sample-car.mjs
const SHOTS = path.resolve(import.meta.dirname, '../../verify-out')
const value = (id: string) => (p: import('@playwright/test').Page) => p.locator(`#${id}`)

test('new car → copy specs from an earlier one → change price → export, in under a minute', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(SHOTS, { recursive: true })
  await login(page)
  const started = Date.now()

  await page.goto('/vehicles/new?mode=manual')
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(randomChassis())
  await page.getByLabel('Brand').fill('Valtren')
  await page.getByLabel('Model').fill('Orisa X5')
  await page.getByLabel('Year').fill('2024')
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await page.getByRole('link', { name: 'Fill specs' }).click()
  await page.waitForURL(/\/specs$/)

  // The picker lists earlier cars with the same brand + model; nothing is chosen for her.
  await page.getByRole('button', { name: /Copy from a previous car/ }).click()
  const dialog = page.getByRole('dialog')
  const sample = dialog.locator('label', { hasText: SAMPLE_CHASSIS })
  await expect(sample).toBeVisible()
  await expect(dialog.locator('input[type=radio]:checked')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Copy specs' })).toBeDisabled()
  await expect(dialog).toContainText('Not copied: chassis number, price, photos')
  await sample.click()
  await page.screenshot({ path: path.join(SHOTS, '13-copy-picker.png') })
  await dialog.getByRole('button', { name: 'Copy specs' }).click()
  await expect(page.getByText(/Copied \d+ fields and \d+ list items/)).toBeVisible()

  // Every spec field, Arabic included, is now filled and marked as copied.
  for (const k of ['engine', 'max_torque', 'top_speed']) {
    await expect(value(`fill-${k}-en`)(page)).toHaveValue(SAMPLE.values[k].en)
    if (SAMPLE.values[k].ar) await expect(value(`fill-${k}-ar`)(page)).toHaveValue(SAMPLE.values[k].ar)
  }
  await expect(page.locator('#fill-top_speed')).toContainText(`Copied from 2024 ${SAMPLE.identity.trim} (…${SAMPLE_CHASSIS.slice(-6)})`)
  const keyFeatures = await page.locator('#fill-section-key_features input[id^=fill-item]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  expect(keyFeatures).toEqual(SAMPLE.lists.key_features)
  // Not copied: the price (and trim, which is the car's own identity).
  await expect(value('fill-listing_price-en')(page)).toHaveValue('')

  // Price: type and press Enter (saves by itself).
  await value('fill-listing_price-en')(page).fill('176000')
  await value('fill-listing_price-en')(page).press('Enter')
  await expect(page.locator('#fill-listing_price [aria-live] svg')).toBeVisible()

  // Editing a copied value removes its mark.
  await value('fill-top_speed-en')(page).fill('205 km/h')
  await value('fill-top_speed-en')(page).press('Enter')
  await expect(page.locator('#fill-top_speed')).not.toContainText('Copied from', { timeout: 10_000 })
  await expect(page.locator('#fill-max_torque')).toContainText('Copied from')

  // Live spec sheet preview on the right (desktop).
  await expect(page.getByRole('img', { name: 'Spec sheet preview' })).toBeVisible({ timeout: 30_000 })
  await page.locator('#fill-section-identity').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(SHOTS, '11-fill-specs-desktop.png') })

  // Export the spec sheet.
  await page.goto(page.url().replace(/\/specs$/, '/documents'))
  await expect(page.locator('img[data-page]').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled({ timeout: 30_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF' }).click()
  await download
  await expect(page.getByText(/Spec sheet downloaded/)).toBeVisible({ timeout: 30_000 })
  const seconds = (Date.now() - started) / 1000
  console.log(`fill → copy → price → export: ${seconds.toFixed(1)} s`)
  expect(seconds).toBeLessThan(60)
})

test('paste specs: empty fields are suggested, filled fields that differ need her choice', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await page.goto('/vehicles/new?mode=manual')
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(randomChassis())
  await page.getByLabel('Brand').fill('Valtren')
  await page.getByLabel('Model').fill('Orisa X5')
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await page.getByRole('link', { name: 'Fill specs' }).click()

  await value('fill-top_speed-en')(page).fill('190 km/h')
  await value('fill-top_speed-en')(page).press('Enter')
  await expect(page.locator('#fill-top_speed [aria-live] svg')).toBeVisible()

  await page.getByRole('button', { name: 'Paste specs' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('Top speed: 200 km/h\nMax torque\t640 Nm\nSMART DRIVING\n• Adaptive Cruise Control\n• Lane Keeping Assist')
  await dialog.getByRole('button', { name: 'Read the text' }).click()

  // The conflicting field shows both values and blocks saving until she picks.
  const speed = dialog.locator('fieldset[data-field=top_speed]')
  await expect(speed).toContainText('190 km/h')
  await expect(speed).toContainText('200 km/h')
  await expect(dialog.getByRole('button', { name: 'Save chosen values' })).toBeDisabled()
  await expect(dialog).toContainText('1 specification conflict to resolve')
  await speed.locator('label', { hasText: '190 km/h' }).click()
  await dialog.getByRole('button', { name: 'Save chosen values' }).click()
  await expect(page.getByText(/Saved \d+ values?/)).toBeVisible()

  await expect(value('fill-top_speed-en')(page)).toHaveValue('190 km/h')
  await expect(value('fill-max_torque-en')(page)).toHaveValue('640 Nm')
  // Arabic isn't a separate value to fill: empty, it prints the English translated (or as it is).
  await expect(value('fill-max_torque-ar')(page)).toHaveValue('')
  await expect(value('fill-max_torque-ar')(page)).toHaveAttribute('placeholder', '640 نيوتن متر')
  await expect(page.locator('#fill-description-ar')).toHaveCount(0)
  await expect(page.getByText('This already exists')).toHaveCount(0) // Enter + leaving the cell saved once
  await page.locator('#fill-section-engine_performance').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.resolve(import.meta.dirname, '../../verify-out/14-fill-arabic-follows-english.png') })
  const smart = await page.locator('#fill-section-smart_driving input[id^=fill-item][id$=-en]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  expect(smart).toEqual(['Adaptive Cruise Control', 'Lane Keeping Assist'])

  // The car page no longer counts Arabic as missing.
  await page.goto(page.url().replace(/\/specs$/, ''))
  await expect(page.getByText(/Documents \d+% ready/)).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/Arabic (value|missing)/)
})
