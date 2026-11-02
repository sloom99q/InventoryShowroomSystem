import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('stages are listed in Settings; branding preset previews live and is discarded when not saved', async ({ page }) => {
  await login(page)
  await page.goto('/settings')
  await expect(page.getByTestId('stages-editor').locator('[data-stage-row]')).toHaveCount(7)
  const brand = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())
  const saved = (await page.getByLabel('Brand colour', { exact: true }).first().inputValue()).toLowerCase()
  await expect.poll(brand).toBe(saved)
  await page.getByRole('button', { name: 'Cobalt' }).click()
  await expect.poll(brand).toBe('#2f5bd3')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light') // v3: one light theme
  await page.screenshot({ path: 'e2e/screens/settings-preview.png', fullPage: true })
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect.poll(brand).toBe(saved)
  await page.screenshot({ path: 'e2e/screens/settings.png', fullPage: true })
})
