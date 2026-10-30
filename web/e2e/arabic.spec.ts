import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('Arabic: right-to-left layout, chassis stays left-to-right, choice is remembered', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  const vehiclesLink = page.locator('aside nav a[href="/vehicles"]')
  await expect(vehiclesLink).toHaveText('السيارات')
  await page.screenshot({ path: 'e2e/screens/ar-dashboard.png', fullPage: true })

  await vehiclesLink.click()
  await page.locator('tbody tr').first().click()
  const plate = page.locator('.vin').first()
  await expect(plate).toHaveCSS('direction', 'ltr')
  await page.screenshot({ path: 'e2e/screens/ar-vehicle.png', fullPage: true })

  // The language is saved on the profile, so it survives a reload.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

  // Back to English for the other tests.
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.goto('/')
  await page.screenshot({ path: 'e2e/screens/en-dashboard.png', fullPage: true })
})
