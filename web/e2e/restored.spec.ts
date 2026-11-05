// Things the v3 rebuild must keep: spec sheet & brochure from the car page (regression found
// in the pilot), chassis check, Excel export, timeline notes, expense dates.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { addCarByHand, login } from './helpers'

const OUT = path.resolve(import.meta.dirname, '../test-results/restored')

test('a car\'s page opens the spec sheet & brochure; both PDFs export and download', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const url = await addCarByHand(page, { brand: 'VOYAH', model: 'FREE', year: '2025', photos: [path.resolve(import.meta.dirname, 'fixtures/car-photo.png')] })
  // From the Cars list, like a person would.
  await page.goto('/vehicles')
  await page.locator(`[data-car]`).filter({ has: page.locator(`a[href="${url.replace(/^.*\/vehicles\//, '/vehicles/')}"]`) }).first().click()
  await expect(page.getByTestId('sheet-button')).toBeVisible()
  await expect(page.getByTestId('sheet-button')).toHaveText('Spec sheet & brochure')
  await page.getByTestId('sheet-button').click()
  await page.waitForURL(/\/documents$/)
  for (const [tab, saved] of [['Spec sheet', /Spec sheet downloaded/], ['Brochure', /Brochure downloaded/]] as const) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.locator('img[data-page]').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled({ timeout: 30_000 })
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF' }).click()
    const file = path.join(OUT, `${tab}.pdf`)
    await (await download).saveAs(file)
    const bytes = readFileSync(file)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(20_000)
    await expect(page.getByText(saved)).toBeVisible({ timeout: 30_000 })
  }
  // Also from ⋯ and from the Documents tab.
  await page.goto(url)
  await page.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Spec sheet & brochure' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(`${url}?tab=documents`)
  await expect(page.getByRole('tabpanel').getByRole('link', { name: /Spec sheet & brochure/ }).first()).toBeVisible()
})

test('chassis check, timeline note, expense date and Excel export are back', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const url = await addCarByHand(page, { brand: 'XPENG', model: 'G6' })
  const check = page.getByTestId('chassis-check')
  await expect(check).toHaveAttribute('data-checked', 'no')
  await check.getByRole('button', { name: 'Mark as checked' }).click()
  await expect(check).toHaveAttribute('data-checked', 'yes')
  await expect(check).toContainText('Checked against the documents')

  await page.goto(`${url}?tab=journey`)
  await page.getByLabel('Note', { exact: true }).fill('Customer called about the tint')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.locator('[data-journey-note="Customer called about the tint"]')).toBeVisible()

  await page.goto(`${url}?tab=expenses`)
  await page.getByRole('button', { name: 'Garage', exact: true }).click()
  await page.getByLabel('Amount (AED)').fill('300')
  await page.getByRole('button', { name: /Add a title, supplier/ }).click()
  await page.getByLabel('Date', { exact: true }).fill('2026-10-20')
  await page.getByTestId('exp-save').click()
  await expect(page.getByTestId('expense-date').first()).toHaveValue('2026-10-20')

  await page.goto('/vehicles')
  const download = page.waitForEvent('download')
  await page.getByTestId('export-excel').click()
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/)
})
