// Warranty certificates: upload, versions, preview/download, send to the customer, logged.
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { loginAs, randomChassis } from './helpers'

const FX = path.resolve(import.meta.dirname, 'fixtures')

/** A delivered car with an English-speaking owner, made through the API (fast). */
async function soldCar(page: Page) {
  return page.evaluate(async (chassis) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data: v } = await supabase.from('vehicles').insert({ chassis_number: chassis, brand: 'BYD', model: 'SEAL', year: 2025, mileage_km: 20 }).select('id').single()
    const { data: st } = await supabase.from('stages').select('id').eq('status', 'delivered').limit(1).single()
    await supabase.rpc('move_vehicle_stage', { p_vehicle_id: v!.id, p_stage_id: st!.id, p_event_at: new Date().toISOString() })
    const { data: c } = await supabase.from('customers').insert({ full_name: 'Omar Haddad', phone: '+971501112233', language: 'en' }).select('id').single()
    await supabase.from('vehicle_owners').insert({ vehicle_id: v!.id, customer_id: c!.id })
    return v!.id as string
  }, randomChassis())
}

async function logged(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data } = await supabase.from('message_log').select('kind, phone, text').eq('vehicle_id', id)
    return data!
  }, id)
}

test('desktop: upload, new version with history, send = download + WhatsApp with the message; logged', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const w = window as unknown as { opened: string[] }
    w.opened = []
    window.open = ((u: string) => { w.opened.push(u); return null }) as typeof window.open
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) // a desktop browser without the share sheet
  })
  await loginAs(page, 'sales_manager')
  const id = await soldCar(page)
  await page.goto(`/aftersales/${id}?tab=warranty`)
  const docs = page.getByTestId('warranty-docs')
  await expect(docs.getByText('No warranty documents yet')).toBeVisible()
  await page.screenshot({ path: path.resolve(import.meta.dirname, '../../verify-out/aftersales/warranty-docs-empty.png'), fullPage: true })
  await docs.getByRole('button', { name: 'Upload certificate' }).first().click()
  await page.getByTestId('warranty-upload').setInputFiles(path.join(FX, 'b-spec-table.pdf'))
  const row = docs.locator('[data-warranty-doc=warranty_certificate]')
  await expect(row).toContainText('b-spec-table.pdf · v1')
  // A new version keeps the earlier one.
  await row.getByRole('button', { name: 'Upload a new version' }).click()
  await page.getByTestId('warranty-upload').setInputFiles(path.join(FX, 'f-ligatures-arial.pdf'))
  await expect(row).toContainText('f-ligatures-arial.pdf · v2')
  await row.getByRole('button', { name: 'Earlier versions' }).click()
  await expect(page.getByTestId('doc-history')).toContainText('v1')
  await expect(page.getByTestId('doc-history')).toContainText('b-spec-table.pdf')
  await expect(row.locator('img')).toBeVisible({ timeout: 20_000 }) // first-page preview
  await page.screenshot({ path: path.resolve(import.meta.dirname, '../../verify-out/aftersales/warranty-docs.png'), fullPage: true })

  await row.getByTestId('send-warranty').click()
  await expect(page.getByText(/attach it to the message/)).toBeVisible()
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened)
  expect(opened[0]).toMatch(/^https:\/\/wa\.me\/971501112233\?text=/)
  expect(decodeURIComponent(opened[0].split('text=')[1])).toContain('Your warranty certificate for your BYD SEAL is attached')
  await expect.poll(() => logged(page, id)).toEqual([expect.objectContaining({ kind: 'warranty', phone: '+971501112233' })])
})

test('phone: send hands the real PDF to the share sheet (WhatsApp); logged', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const w = window as unknown as { shared: { name: string; type: string; size: number }[] }
    w.shared = []
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: async (d: { files: File[] }) => { for (const f of d.files) w.shared.push({ name: f.name, type: f.type, size: f.size }) }, configurable: true })
  })
  await loginAs(page, 'sales_manager')
  const id = await soldCar(page)
  await page.goto(`/aftersales/${id}?tab=warranty`)
  await page.getByTestId('warranty-docs').getByRole('button', { name: 'Upload certificate' }).first().click()
  await page.getByTestId('warranty-upload').setInputFiles(path.join(FX, 'b-spec-table.pdf'))
  await page.getByTestId('send-warranty').click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared)).toEqual([{ name: 'b-spec-table.pdf', type: 'application/pdf', size: expect.any(Number) }])
  await expect.poll(() => logged(page, id)).toHaveLength(1)
})
