// After-Sales on a phone: no sideways scrolling, every tab reachable.
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { loginAs } from './helpers'

const SHOTS = path.resolve(import.meta.dirname, '../../verify-out/aftersales')
const fits = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

test('phone: After-Sales home and a customer car', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAs(page, 'sales_manager')
  await page.goto('/aftersales')
  await expect(page.getByTestId('needs-message')).toBeVisible()
  expect(await fits(page)).toBe(true)
  await page.screenshot({ path: `${SHOTS}/as-8-phone-home.png`, fullPage: true })
  const first = page.locator('[data-recent]').first()
  await first.click()
  await expect(page.getByTestId('chassis-hero')).toBeVisible()
  for (const tab of ['customer', 'warranty', 'service', 'parts', 'offers']) {
    await page.goto(`${page.url().replace(/\?.*$/, '')}?tab=${tab}`)
    await page.waitForTimeout(600)
    expect(await fits(page), tab).toBe(true)
  }
  await page.goto(page.url().replace(/\?.*$/, ''))
  await expect(page.getByTestId('chassis-hero')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/as-9-phone-cust.png`, fullPage: true })
  await page.goto('/aftersales/settings')
  await expect(page.getByRole('heading', { name: 'Warranty, service & offers' })).toBeVisible()
})
