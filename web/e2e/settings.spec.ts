import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('branding: preset previews live and is discarded when not saved', async ({ page }) => {
  await login(page)
  await page.goto('/settings')
  const brand = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())
  const saved = (await page.getByLabel('Brand colour', { exact: true }).first().inputValue()).toLowerCase()
  await expect.poll(brand).toBe(saved)
  await page.getByRole('button', { name: 'Midnight' }).click()
  await expect.poll(brand).toBe('#e4572e')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: 'e2e/screens/settings-preview.png', fullPage: true })
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect.poll(brand).toBe(saved)
  await page.screenshot({ path: 'e2e/screens/settings.png', fullPage: true })
})
