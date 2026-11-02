// Rebuild v3 "done when" #3: a change on one device shows on another without a refresh.
import { expect, test } from '@playwright/test'
import { addCarByHand, login, loginSecretary } from './helpers'

test('two devices: stage, spec, accessory, expense and label changes appear on the other within seconds', async ({ browser }) => {
  test.setTimeout(120_000)
  const a = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage() // admin's Mac
  const b = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage() // secretary's device
  await login(a)
  const url = await addCarByHand(a, { brand: 'Valtren', model: 'Orisa X5' })
  await loginSecretary(b)
  await b.goto(url)
  await expect(b.getByTestId('chassis-hero')).toBeVisible()
  let reloads = 0
  b.on('load', () => reloads++)
  const soon = { timeout: 5_000 }

  // Stage
  await a.locator('[data-stage="In garage"]').click()
  await a.getByTestId('confirm-move').click()
  await expect(b.locator('[data-stage="In garage"]')).toHaveAttribute('aria-label', 'Now at In garage', soon)

  // Spec value
  await a.locator('button[data-inline="spec-top_speed"]').click()
  await a.keyboard.type('205 km/h')
  await a.keyboard.press('Enter')
  await expect(b.locator('[data-field=top_speed]')).toContainText('205 km/h', soon)

  // Label
  await a.getByRole('button', { name: 'Label' }).click()
  await a.getByRole('combobox', { name: 'Label' }).fill('Tint pending')
  await a.keyboard.press('Enter')
  await expect(b.getByText('Tint pending')).toBeVisible(soon)

  // Accessory and expense, while B looks at those tabs
  await b.getByRole('tab', { name: /Accessories/ }).click()
  await a.goto(`${url}?tab=accessories`)
  await a.getByRole('button', { name: 'One less NFC card' }).click()
  await expect(b.locator('[data-accessory=nfc_card]')).toContainText('Missing', soon)
  await b.getByRole('tab', { name: /Expenses/ }).click()
  await a.goto(`${url}?tab=expenses`)
  await a.getByRole('button', { name: 'Garage', exact: true }).click()
  await a.getByLabel('Amount (AED)').fill('750')
  await a.keyboard.press('Enter')
  await expect(b.getByTestId('exp-total')).toHaveText('AED 750', soon)

  expect(reloads, 'the second device never reloaded').toBe(0)
})
