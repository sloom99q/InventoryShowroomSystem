// Pilot feedback: one "Fill specs" page per car, typed by hand, and "Paste specs".
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { login, randomChassis } from './helpers'

const SHOTS = path.resolve(import.meta.dirname, '../../verify-out')
const value = (id: string) => (p: import('@playwright/test').Page) => p.locator(`#${id}`)

test('new car → type specs with the keyboard → price → export, in under a minute', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(SHOTS, { recursive: true })
  await login(page)
  const started = Date.now()

  await page.goto('/vehicles/new')
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(randomChassis())
  await page.getByLabel('Brand').fill('Valtren')
  await page.getByLabel('Model').fill('Orisa X5')
  await page.getByLabel('Year').fill('2024')
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await page.getByRole('link', { name: 'Fill specs' }).click()
  await page.waitForURL(/\/specs$/)
  await expect(page.getByRole('button', { name: /Copy from a previous car/ })).toHaveCount(0)

  // Enter saves and moves on: English, then Arabic, then the next field.
  await value('fill-engine-en')(page).click()
  for (const v of ['1.5L range extender', '', 'Single rear motor', '', '300 kW / 402 HP', '', '640 Nm']) {
    if (v) await page.keyboard.type(v)
    await page.keyboard.press('Enter')
  }
  await expect(value('fill-max_torque-en')(page)).toHaveValue('640 Nm')

  await value('fill-listing_price-en')(page).fill('176000')
  await value('fill-listing_price-en')(page).press('Enter')
  await expect(page.locator('#fill-listing_price [aria-live] svg')).toBeVisible()
  await expect(page.getByText('This already exists')).toHaveCount(0)

  // Live spec sheet preview on the right (desktop).
  await expect(page.getByRole('img', { name: 'Spec sheet preview' })).toBeVisible({ timeout: 30_000 })
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
  console.log(`add → specs → price → export: ${seconds.toFixed(1)} s`)
  expect(seconds).toBeLessThan(60)
})

test('paste specs: empty fields are suggested, filled fields that differ need her choice', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await page.goto('/vehicles/new')
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
