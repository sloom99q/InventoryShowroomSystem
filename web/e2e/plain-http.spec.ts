// The pilot is opened over plain http on the showroom Wi-Fi (http://<mac>.local:5180). Browsers
// leave out secure-context APIs there, crypto.randomUUID among them; tests run on localhost,
// which counts as secure, so take it away by hand.
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { addCarByHand, importFictionalCar, login } from './helpers'

test('adding a vehicle from documents works without secure-context APIs', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => { delete (Crypto.prototype as { randomUUID?: unknown }).randomUUID })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page)
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined')
  // Add car with a photo (the stepper's upload), then an import into it (admin).
  await addCarByHand(page, { photos: [path.resolve(import.meta.dirname, 'fixtures/car-photo.png')] })
  await expect(page.getByTestId('chassis-hero')).toBeVisible()
  await importFictionalCar(page, [path.resolve(import.meta.dirname, 'fixtures/car-photo.png')])
  await expect(page.getByTestId('chassis-hero')).toBeVisible()
  await expect(page.locator('main')).toContainText('VALTREN')
  expect(errors).toEqual([])
})
