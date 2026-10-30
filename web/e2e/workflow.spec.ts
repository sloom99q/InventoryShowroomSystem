import { expect, test } from '@playwright/test'
import path from 'node:path'
import { FIXTURES, login, randomChassis } from './helpers'

test('secretary workflow: add, document, photos, expenses, sell, find', async ({ page }) => {
  await login(page)
  const chassis = randomChassis()

  // Add vehicle with only the chassis + a few details.
  await page.getByRole('link', { name: 'Add vehicle' }).first().click()
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(chassis)
  await page.getByLabel('Brand').fill('Zeekr')
  await page.getByLabel('Model').fill('001 FR')
  await page.getByLabel('Year').fill('2025')
  await page.getByLabel('Physical keys').fill('1')
  await page.getByLabel('NFC key cards').fill('2')
  await page.getByLabel('Charger').selectOption('missing')
  await page.locator('input[type=file][accept="image/*"]').first().setInputFiles(path.join(FIXTURES, 'd_listing_card.png'))
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await expect(page.getByRole('heading', { name: 'Zeekr 001 FR 2025' })).toBeVisible()
  await page.screenshot({ path: 'e2e/screens/vehicle.png', fullPage: true })

  // Duplicate chassis is blocked on the add form.
  await page.goto('/vehicles/new')
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(chassis.toLowerCase().replace(/(.{3})/, '$1-'))
  await expect(page.getByText('This chassis is already registered')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save vehicle' })).toBeDisabled()
  await page.goBack()

  // Accessories: missing charger is flagged.
  await page.getByRole('tab', { name: /Accessories/ }).click()
  await expect(page.getByText(/Missing before delivery: Charger/)).toBeVisible()

  // Expenses add up exactly.
  await page.getByRole('tab', { name: /Expenses/ }).click()
  for (const [title, amount] of [['Bumper repair', '1,200.10'], ['Tyres', '850.20'], ['Transport', '0.10']]) {
    await page.getByRole('button', { name: 'Add expense' }).first().click()
    await page.getByLabel('What was it for?').fill(title)
    await page.getByLabel('Amount (AED)').fill(amount)
    await page.getByRole('dialog').getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByText(title)).toBeVisible()
  }
  await expect(page.getByText('AED 2,050.40').first()).toBeVisible()

  // Upload a document whose chassis differs: must warn and require confirmation.
  await page.getByRole('tab', { name: /Documents/ }).click()
  await page.getByRole('button', { name: 'Upload document' }).first().click()
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles(path.join(FIXTURES, 'a_digital_certificate.pdf'))
  await expect(page.getByText('This document may belong to a different vehicle')).toBeVisible()
  const upload = page.getByRole('dialog').getByRole('button', { name: 'Upload', exact: true })
  await expect(upload).toBeDisabled()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  // Mark sold with a specific date/time.
  await page.getByRole('button', { name: 'Change status' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sold' }).click()
  await page.getByLabel('Sale date and time').fill('2026-10-29T16:45')
  await page.getByLabel('Note (optional)').fill('Sold to walk-in customer')
  await page.getByRole('button', { name: 'Save status' }).click()
  await expect(page.getByText('29 Oct 2026, 16:45').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Timeline' }).click()
  await expect(page.getByText('Sold to walk-in customer')).toBeVisible()
  await page.getByRole('tab', { name: 'Change history' }).click()
  await expect(page.getByText(/Vehicle changed/).first()).toBeVisible()

  // Global search by the last 6 characters finds it.
  await page.getByRole('combobox', { name: 'Search vehicles' }).fill(chassis.slice(-6))
  await expect(page.getByRole('option').first()).toContainText('Zeekr')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/vehicles\//)
})

test('reads the chassis number from a digital PDF', async ({ page }) => {
  await login(page)
  await page.goto('/vehicles/new')
  await page.locator('input[type=file][accept="application/pdf,image/*"]').setInputFiles(path.join(FIXTURES, 'a_digital_certificate.pdf'))
  await expect(page.getByPlaceholder('LVVDB21B9PD012345')).toHaveValue('1GNSKCKD7PR123456')
  await expect(page.getByLabel('Brand')).toHaveValue('Chevrolet')
  await page.screenshot({ path: 'e2e/screens/add-from-pdf.png', fullPage: true })
})

test('dashboard and list screenshots', async ({ page }) => {
  await login(page)
  await page.screenshot({ path: 'e2e/screens/dashboard.png', fullPage: true })
  await page.goto('/vehicles')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screens/vehicles.png' })
})
