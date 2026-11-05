// After-Sales "done when": owner → warranty + first service, service moves the due date,
// technician parts without prices/phones, arrived part → needs a message, WhatsApp logged.
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { addCarByHand, loginAs } from './helpers'

const SHOTS = path.resolve(import.meta.dirname, '../../verify-out/aftersales')
const iso = (d: Date) => d.toISOString().slice(0, 10)
const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }).format(d).replace('Sept', 'Sep')
const inYears = (n: number) => { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d }

test.describe.configure({ mode: 'serial' })
let carUrl = ''

test('sales manager: deliver → owner → warranty and first service; log a service', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAs(page, 'sales_manager')
  carUrl = await addCarByHand(page, { brand: 'VOYAH', model: 'FREE', year: '2025' })
  // Delivered, with the handover check.
  await page.locator('[data-stage="Delivered"]').click()
  await expect(page.getByTestId('handover-check')).toBeChecked()
  await page.getByTestId('confirm-move').click()
  await expect(page.getByText('Moved to Delivered')).toBeVisible()
  await page.getByTestId('to-aftersales').click()
  await page.waitForURL(/\/aftersales\/[0-9a-f-]{36}$/)

  // Owner (Arabic messages) → warranty from defaults.
  const owner = page.getByTestId('new-owner')
  await owner.getByLabel('Full name').fill('Ahmed Al Mansoori')
  await owner.getByLabel('Mobile (WhatsApp)').fill('050 555 0142')
  await owner.getByRole('button', { name: 'Save customer' }).click()
  await expect(page.getByTestId('owner-card')).toContainText('+971 50 555 0142 · Arabic')
  await expect(page.getByText(/Checked at delivery · /)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/as-2-customer.png`, fullPage: true })
  await page.getByRole('tab', { name: /Warranty/ }).click()
  await expect(page.locator('[data-warranty=vehicle] [data-testid=covered-until]')).toContainText(`${fmt(inYears(5))} or 150,000 km`)
  await expect(page.locator('[data-warranty=battery] [data-testid=covered-until]')).toContainText(`${fmt(inYears(8))} or 160,000 km`)
  await page.screenshot({ path: `${SHOTS}/as-3-warranty.png`, fullPage: true })

  // First service: 12 months from delivery.
  await page.getByRole('tab', { name: /Service/ }).click()
  const next = page.getByTestId('next-service')
  await expect(next).toContainText(/First service in 3(64|65|66) days/)
  await expect(next).toContainText(`Due ${fmt(inYears(1))} or 10,000 km`)
  // A service 2 months on moves the due date forward to 12 months after it.
  await page.getByTestId('log-service').click()
  const twoMonthsAgo = new Date(); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
  await page.getByLabel('Date').fill(iso(twoMonthsAgo))
  await page.getByLabel('Odometer (km)').fill('3400')
  await page.getByLabel('What was it?').fill('Check-up')
  await page.getByLabel('Cost (AED, 0 = free)').fill('0')
  await page.getByTestId('save-service').click()
  const due = new Date(twoMonthsAgo); due.setFullYear(due.getFullYear() + 1)
  await expect(next).toContainText(`Due ${fmt(due)} or 13,400 km`)
  await expect(next).toContainText('Next service in')
  await expect(page.locator('[data-visit="Check-up"]')).toContainText('Free')
  await page.screenshot({ path: `${SHOTS}/as-4-service.png`, fullPage: true })
})

test('technician: requests a part and moves it to Arrived — no phone numbers, no prices', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAs(page, 'technician')
  await page.goto(carUrl.replace('/vehicles/', '/aftersales/'))
  await expect(page.getByTestId('chassis-hero')).toBeVisible()
  await expect(page.locator('main')).toContainText('Ahmed Al Mansoori') // the owner's name only
  await expect(page.getByRole('tab')).toHaveText([/Service/, /Parts/])
  await page.getByRole('tab', { name: /Parts/ }).click()
  await page.getByTestId('request-part').click()
  await page.getByLabel('Part', { exact: true }).fill('Front brake pads (set)')
  await page.getByLabel('Part number').fill('VY-BP-2201')
  await page.getByLabel('Supplier').fill('Al Futtaim Parts')
  await expect(page.getByLabel('Cost (AED)')).toHaveCount(0)
  await page.getByTestId('save-part').click()
  const part = page.locator('[data-part="Front brake pads (set)"]')
  await expect(part).toHaveAttribute('data-part-status', 'requested')
  // A board: tap the card's button to move it on.
  await expect(page.locator('[data-column=requested] [data-part="Front brake pads (set)"]')).toBeVisible()
  await part.locator('[data-move-to=ordered]').click()
  await expect(page.locator('[data-column=ordered] [data-part="Front brake pads (set)"]')).toBeVisible()
  await part.locator('[data-move-to=arrived]').click()
  await expect(part).toHaveAttribute('data-part-status', 'arrived')
  await expect(page.locator('[data-column=arrived] [data-part="Front brake pads (set)"]')).toBeVisible()
  const text = await page.locator('main').innerText()
  expect(text).not.toMatch(/\+971|050 555|AED/)
  await page.screenshot({ path: `${SHOTS}/as-5-parts-technician.png`, fullPage: true })
})

async function stubWindowOpen(page: Page) {
  await page.addInitScript(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((u: string) => { (window as unknown as { opened: string[] }).opened.push(u); return null }) as typeof window.open })
}

test('manager: the arrived part needs a message; WhatsApp opens wa.me with the Arabic text and is logged', async ({ page }) => {
  test.setTimeout(120_000)
  await stubWindowOpen(page)
  await loginAs(page, 'sales_manager')
  await page.goto('/aftersales')
  const row = page.getByTestId('needs-message').locator(`[data-reminder=part][data-vehicle="${carUrl.split('/').pop()}"]`).filter({ hasText: 'Front brake pads (set)' })
  await expect(row).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/as-1-home.png`, fullPage: true })
  await row.getByRole('button', { name: 'Notify' }).click()
  const text = page.getByTestId('wa-text')
  await expect(text).toHaveValue(/^مرحباً Ahmed،\nوصلت قطعة الغيار \(Front brake pads \(set\)\)/)
  await page.screenshot({ path: `${SHOTS}/as-7-whatsapp.png` })
  await page.getByTestId('open-whatsapp').click()
  await expect(page.getByText('WhatsApp opened — logged on the car')).toBeVisible()
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened)
  expect(opened).toHaveLength(1)
  expect(opened[0]).toMatch(/^https:\/\/wa\.me\/971505550142\?text=/)
  expect(decodeURIComponent(opened[0].split('text=')[1])).toContain('وصلت قطعة الغيار')
  const logged = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data } = await supabase.from('message_log').select('kind, phone').eq('vehicle_id', id)
    return data
  }, carUrl.split('/').pop()!)
  expect(logged).toEqual([{ kind: 'part', phone: '+971505550142' }])

  // Offers: add from the catalogue, accept.
  await page.goto(carUrl.replace('/vehicles/', '/aftersales/') + '?tab=offers')
  await page.getByTestId('add-offer').click()
  await page.getByRole('button', { name: /Wall charger \+ installation/ }).click()
  const offer = page.locator('[data-offer="Wall charger + installation"]')
  await expect(offer).toContainText('AED 3,200')
  await offer.getByRole('button', { name: 'Accepted' }).click()
  await expect(offer.getByRole('button', { name: 'Accepted' })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: `${SHOTS}/as-6-offers.png`, fullPage: true })
})
