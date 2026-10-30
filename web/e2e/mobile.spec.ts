import { expect, test } from '@playwright/test'
import path from 'node:path'
import { FIXTURES, login } from './helpers'

// Arrival photos are taken on a phone in the yard: this flow must work at phone width.
test('phone: find a car and add arrival photos', async ({ page }) => {
  await login(page)
  await page.screenshot({ path: 'e2e/screens/phone-dashboard.png', fullPage: true })
  await page.goto('/vehicles')
  await page.locator('main a[href^="/vehicles/"]:not([href$="/new"])').first().click()
  await page.getByRole('tab', { name: /Photos/ }).click()
  await page.getByRole('button', { name: 'Add' }).first().click()
  await page.getByRole('dialog').locator('input[type=file]').first().setInputFiles(path.join(FIXTURES, 'd_listing_card.png'))
  await page.getByRole('dialog').getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 })
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(hasHScroll).toBe(false)
  await page.screenshot({ path: 'e2e/screens/phone-photos.png', fullPage: true })
})
