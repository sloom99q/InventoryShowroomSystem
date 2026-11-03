import { expect, test } from '@playwright/test'
import path from 'node:path'
import { login } from './helpers'
import { addCarWithPhonePhotos } from './photos-flow'

test('Add car photos (phone): 5 × 12 MP + HEIC, instant previews, steady order, retry, background finish', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)
  const r = await addCarWithPhonePhotos(page, path.resolve(import.meta.dirname, '../../verify-out/v3/photos-step-phone.png'))
  expect(r.firstOrder).toHaveLength(6)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})
