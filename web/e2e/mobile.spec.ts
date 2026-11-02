// The secretary must be able to do everything on her phone, without sideways scrolling
// (only the journey track may scroll).
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { addCarByHand, login } from './helpers'

const SHOTS = path.resolve(import.meta.dirname, '../../verify-out/v3')
const noSideScroll = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

test('phone: cars list, add a car, the car page and its tabs', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.goto('/vehicles')
  await expect(page.locator('a[data-car]').first()).toBeVisible()
  expect(await noSideScroll(page)).toBe(true)
  await page.screenshot({ path: `${SHOTS}/10-phone-list.png` })

  await page.goto('/vehicles/new')
  await page.locator('#chassis-input').fill('LMGHT1S8XS1000123')
  expect(await noSideScroll(page)).toBe(true)
  await page.screenshot({ path: `${SHOTS}/phone-add-chassis.png` })

  const url = await addCarByHand(page, { brand: 'XPENG', model: 'G6', photos: [path.resolve(import.meta.dirname, 'fixtures/car-photo.png')] })
  await expect(page.getByTestId('chassis-hero')).toBeVisible()
  expect(await noSideScroll(page)).toBe(true)
  await page.screenshot({ path: `${SHOTS}/9-phone-car.png` })
  for (const tab of ['photos', 'accessories', 'expenses', 'journey']) {
    await page.goto(`${url}?tab=${tab}`)
    await page.waitForTimeout(800)
    expect(await noSideScroll(page), tab).toBe(true)
    await page.screenshot({ path: `${SHOTS}/phone-${tab}.png`, fullPage: true })
  }
  await page.goto(`${url}?tab=photos`)
  await expect(page.getByRole('button', { name: 'Camera' })).toBeVisible()
})
