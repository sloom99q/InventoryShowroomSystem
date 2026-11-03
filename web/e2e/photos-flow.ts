// Add car → Photos with real-phone-sized photos: 5 × 12 MP JPEG plus a HEIC, one upload failing once.
import { expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomChassis } from './helpers'

/** Five 4032×3024 JPEGs (a 12 MP phone camera), drawn in the browser so they're realistic in size. */
async function bigPhotos(page: Page) {
  const dir = path.resolve(import.meta.dirname, '../test-results/big-photos')
  mkdirSync(dir, { recursive: true })
  const blobs = await page.evaluate(async () => {
    const out: string[] = []
    for (let n = 0; n < 5; n++) {
      const c = new OffscreenCanvas(4032, 3024)
      const g = c.getContext('2d')!
      const grad = g.createLinearGradient(0, 0, 4032, 3024)
      grad.addColorStop(0, `hsl(${n * 70}, 60%, 55%)`); grad.addColorStop(1, `hsl(${n * 70 + 40}, 50%, 25%)`)
      g.fillStyle = grad; g.fillRect(0, 0, 4032, 3024)
      for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255},0.35)`; g.fillRect((i * 677) % 4032, (i * 431) % 3024, 40, 40) }
      g.fillStyle = 'white'; g.font = 'bold 400px sans-serif'; g.fillText(String(n + 1), 1700, 1700)
      const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
      const bytes = new Uint8Array(await b.arrayBuffer())
      let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      out.push(btoa(s))
    }
    return out
  })
  return blobs.map((b64, i) => { const f = path.join(dir, `IMG_000${i + 1}.JPG`); writeFileSync(f, Buffer.from(b64, 'base64')); return f })
}

export async function addCarWithPhonePhotos(page: Page, shot?: string) {
  test_setTimeout(page)
  const photos = [...await bigPhotos(page), path.resolve(import.meta.dirname, 'fixtures/car-photo.heic')]
  await page.goto('/vehicles/new')
  await page.locator('#chassis-input').fill(randomChassis())
  await expect(page.getByText('Not in the system yet')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Brand').fill('XPENG')
  await page.getByLabel('Model').fill('G6')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Save car' }).click()
  await expect(page.getByRole('heading', { name: 'Arrival photos' })).toBeVisible()

  // The 2nd storage upload fails once (as on a weak connection).
  let uploads = 0
  await page.route('**/storage/v1/object/vehicle-files/**', (route) => {
    if (route.request().method() === 'POST' && ++uploads === 2) return route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' })
    return route.continue()
  })

  const t0 = Date.now()
  await page.getByTestId('photo-input').setInputFiles(photos)
  const tiles = page.locator('[data-photo-state]')
  await expect(tiles).toHaveCount(6)
  // Previews from the local files, at once (the HEIC shows "Converting…" until it's JPEG).
  await expect(tiles.locator('img')).toHaveCount(5, { timeout: 3_000 })
  console.log(`previews shown after ${Date.now() - t0} ms`)
  const names = async () => tiles.evaluateAll((els) => els.map((e) => e.getAttribute('title')?.replace(/^.*?(IMG_\d+|car-photo)/, '$1')))
  const firstOrder = await names()
  if (shot) await page.screenshot({ path: shot })

  // One failed: retry it.
  const failed = page.locator('[data-photo-state=failed]')
  await expect(failed).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByTestId('photo-status')).toContainText(/Uploading|didn’t upload/)
  await failed.getByRole('button', { name: /^Try .* again$/ }).click()
  expect(await names(), 'nothing jumps or re-orders while uploading').toEqual(firstOrder)

  // Continue while uploads may still be running; they finish in the background.
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Car added' })).toBeVisible()
  await expect(page.getByTestId('done-photos')).toHaveText('All 6 photos uploaded', { timeout: 90_000 })
  console.log(`6 photos (5 × 12 MP + HEIC) uploaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`)

  await page.getByRole('button', { name: 'Open the car' }).click()
  await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  const stored = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data } = await supabase.from('vehicle_images').select('storage_path, mime_type, file_size, original_filename').eq('vehicle_id', id)
    return data!
  }, id)
  expect(stored).toHaveLength(6)
  for (const s of stored) {
    expect(s.mime_type, s.original_filename).toBe('image/jpeg') // HEIC converted, nothing stored as HEIC
    expect(s.file_size, 'scaled down for upload').toBeLessThan(3_000_000)
  }
  expect(stored.map((s) => s.original_filename)).toContain('car-photo.jpg')
  return { firstOrder, names }
}

function test_setTimeout(_p: Page) { /* the calling test sets its own timeout */ }
