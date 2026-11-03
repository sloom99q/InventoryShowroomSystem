// Rebuild v3 "done when" #2: the secretary's own flow, timed, on the running app.
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { FIXTURES, loginSecretary, randomChassis } from './helpers'

const PHOTOS = [path.resolve(import.meta.dirname, 'fixtures/car-photo.png'), path.join(FIXTURES, 'd_listing_card.png')]

test('secretary: add a car with 2 photos in under a minute, then RTA, NFC missing, RTA expense, 5 specs by keyboard', async ({ page }) => {
  test.setTimeout(180_000)
  await loginSecretary(page)
  const chassis = randomChassis()
  const t0 = Date.now()

  // 1. Add car: chassis, brand/model/year, arrival, 2 photos.
  await page.goto('/vehicles')
  await expect(page.getByRole('link', { name: 'Add car' })).toHaveCount(1) // one Add car button, on the Cars page only
  await page.getByRole('link', { name: 'Add car' }).click()
  await page.locator('#chassis-input').fill(chassis)
  await expect(page.getByText('17 characters')).toBeVisible()
  await expect(page.getByText('Not in the system yet')).toBeVisible()
  await page.keyboard.press('Enter')
  await page.getByLabel('Brand').fill('XPENG')
  await page.getByLabel('Model').fill('G6')
  await page.getByLabel('Year').selectOption('2025')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel(/Where is it now/).fill('Showroom')
  await page.getByLabel('Mileage (km)').fill('12')
  await page.getByRole('button', { name: 'Save car' }).click()
  await page.getByTestId('photo-input').setInputFiles(PHOTOS)
  await expect(page.locator('[data-photo-state=done]')).toHaveCount(2, { timeout: 60_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Car added' })).toBeVisible({ timeout: 30_000 })
  const addSeconds = (Date.now() - t0) / 1000
  await page.screenshot({ path: path.resolve(import.meta.dirname, '../../verify-out/v3/4-add-done.png') })
  await page.getByRole('button', { name: 'Open the car' }).click()
  await expect(page.getByTestId('chassis-hero')).toHaveText(chassis)
  console.log(`add car (chassis, car, arrival, 2 photos): ${addSeconds.toFixed(1)} s`)
  expect(addSeconds).toBeLessThan(60)
  const carUrl = page.url()

  // 2. Move it to At RTA (skipping In garage).
  await page.locator('[data-stage="At RTA"]').click()
  await page.getByLabel('Note (optional)').fill('Inspection booked')
  await page.getByTestId('confirm-move').click()
  await expect(page.getByText('Moved to At RTA')).toBeVisible()
  await expect(page.locator('section').filter({ hasText: 'Where is this car?' })).toContainText('Skipped')
  await page.getByRole('tab', { name: /Journey/ }).click()
  await expect(page.locator('[data-journey-stage]')).toHaveCount(2)
  await expect(page.locator('[data-journey-stage="At RTA"]')).toContainText('note: Inspection booked')
  await expect(page.locator('[data-journey-stage="At RTA"]')).toContainText('Moved by E2E Secretary')

  // 3. NFC card missing (− on an unchecked tile sets it to 0).
  await page.getByRole('tab', { name: /Accessories/ }).click()
  const nfc = page.locator('[data-accessory=nfc_card]')
  await nfc.getByRole('button', { name: 'One less NFC card' }).click()
  await expect(nfc).toContainText('Missing')
  await page.getByRole('button', { name: 'One more Smart key' }).click()
  await page.getByRole('button', { name: 'One more Smart key' }).click()
  await expect(page.locator('[data-accessory=smart_key]')).toContainText('Present')
  await expect(page.getByTestId('acc-summary')).toHaveText('1 of 8 items present')
  await expect(page.getByText('Missing: NFC card. Check before delivery.')).toBeVisible()
  await expect(page.getByText('1 accessory missing').first()).toBeVisible()

  // 4. A 500 AED RTA expense with one chip.
  await page.getByRole('tab', { name: /Expenses/ }).click()
  await page.getByRole('button', { name: 'RTA / registration' }).click()
  await page.getByLabel('Amount (AED)').fill('500')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('exp-total')).toHaveText('AED 500')
  await expect(page.locator('[data-expense="RTA / registration"]')).toContainText('AED 500')

  // 5. Five specs with the keyboard only: click the first, then type + Enter.
  await page.getByRole('tab', { name: /Specs/ }).click()
  await page.locator('button[data-inline="spec-engine"]').click()
  for (const v of ['Electric (no engine)', 'Dual motor', '358 kW / 487 HP', '660 Nm', '87.5 kWh LFP']) {
    await page.keyboard.type(v)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Escape')
  for (const [k, v] of [['engine', 'Electric (no engine)'], ['electric_motors', 'Dual motor'], ['total_output', '358 kW / 487 HP'], ['max_torque', '660 Nm'], ['battery', '87.5 kWh LFP']]) {
    await expect(page.locator(`[data-field=${k}]`)).toContainText(v)
  }
  await expect(page.getByText('This already exists')).toHaveCount(0)
  // Stored, not just shown: once every save is done (no saving marker), a reload keeps everything.
  await expect(page.locator('html[data-saving]')).toHaveCount(0)
  await page.goto(carUrl)
  await expect(page.locator('[data-field=battery]')).toContainText('87.5 kWh LFP')
  await expect(page.getByRole('tab', { name: /Expenses/ })).toContainText('AED 500')
  console.log(`whole flow: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
})

test('chassis checks: I/O/Q warning, duplicate links to the existing car, search by last 6', async ({ page }) => {
  await loginSecretary(page)
  await page.goto('/vehicles')
  const first = page.locator('[data-car]').first()
  const existing = (await first.getAttribute('data-car'))!
  await page.goto('/vehicles/new')
  await page.locator('#chassis-input').fill('LVVDB21B9PD0I2345')
  await expect(page.getByText(/I, O or Q at position 13/)).toBeVisible()
  await page.locator('#chassis-input').fill(existing.toLowerCase())
  await expect(page.getByText('Already in the system.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByRole('link', { name: 'Open it' }).click()
  await expect(page.getByTestId('chassis-hero')).toHaveText(existing)

  await page.getByRole('combobox', { name: 'Search vehicles' }).fill(existing.slice(-6))
  await expect(page.getByRole('option').first()).toContainText(existing.slice(-6))
})
