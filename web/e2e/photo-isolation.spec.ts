// Pilot bug: an XPeng showed BYD Seal photos. Root cause: its brochure was a slide deck re-used
// from a BYD deck; each slide still held the BYD photo *underneath* the XPeng photo, and the
// importer took the largest picture of a page instead of the one the page shows.
// hidden-photo.pdf (fictional) is built the same way: page 1 paints a big red picture, then a
// smaller blue one over the whole page; page 2 holds a green and a grey picture side by side.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FIXTURES, login, randomChassis } from './helpers'

const HIDDEN = path.resolve(import.meta.dirname, 'fixtures/hidden-photo.pdf')

/** Colour names of the pictures the importer offers for a PDF (photo-page mode and general mode). */
async function offered(page: Page) {
  const b64 = readFileSync(HIDDEN).toString('base64')
  return page.evaluate(async (b64) => {
    const x = await import('/src/lib/extract/index.ts')
    const pdf = await import('/src/lib/extract/pdf.ts')
    const pdfjs = await x.loadPdfjs()
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const colour = async (blob: Blob) => {
      const bmp = await createImageBitmap(blob)
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      const [r, gr, b] = g.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data
      return r > 150 && gr < 80 ? 'red' : b > 150 && r < 80 ? 'blue' : gr > 130 && r < 80 ? 'green' : Math.abs(r - b) < 20 && r > 90 ? 'grey' : `rgb(${r},${gr},${b})`
    }
    const photoMode = await pdf.pdfImageCandidates(data, pdfjs, 'f', [], [1, 2], 1)
    const general = await pdf.pdfImageCandidates(data, pdfjs, 'f', [1, 2])
    return {
      photoMode: await Promise.all(photoMode.map(async (c) => `p${c.page}:${await colour(c.blob)}`)),
      general: await Promise.all(general.map(async (c) => `p${c.page}:${await colour(c.blob)}`)),
    }
  }, b64)
}

test('a picture hidden under another one is never offered', async ({ page }) => {
  await page.goto('/')
  const got = await offered(page)
  // Photo pages: one picture each; page 1 is the blue one on top, page 2 is the page as it looks.
  expect(got.photoMode).toHaveLength(2)
  expect(got.photoMode[0]).toBe('p1:blue')
  expect(got.general.sort()).toEqual(['p1:blue', 'p2:green', 'p2:grey'])
  expect([...got.photoMode, ...got.general].join()).not.toContain('red')
})

/** Create a car by hand; returns its id. */
async function newCar(page: Page, brand: string, model: string) {
  await page.goto('/vehicles/new')
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(randomChassis())
  await page.getByLabel('Brand').fill(brand)
  await page.getByLabel('Model').fill(model)
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

async function uploadPhoto(page: Page, id: string, file: string) {
  await page.goto(`/vehicles/${id}?tab=photos`)
  await page.getByRole('button', { name: 'Add' }).first().click()
  await page.getByRole('dialog').locator('input[type=file]').first().setInputFiles(file)
  await page.getByRole('dialog').getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 })
}

test('two cars each show only their own photos (upload and import)', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const a = await newCar(page, 'Valtren', 'Orisa X5')
  const b = await newCar(page, 'Northwind', 'Tarsel')
  await uploadPhoto(page, a, path.join(FIXTURES, 'd_listing_card.png'))
  await uploadPhoto(page, b, path.resolve(import.meta.dirname, 'fixtures/car-photo.png'))

  // Import the re-used slide deck into car B.
  await page.goto(`/vehicles/${b}/import`)
  await page.locator('input[type=file][multiple]').first().setInputFiles(HIDDEN)
  await expect(page.locator('[data-photo]').first()).toBeVisible({ timeout: 30_000 })
  for (const box of await page.locator('[data-photo] input[type=checkbox]').all()) await box.check()
  for (const fs of await page.locator('fieldset').all()) {
    if (await fs.getByText('Choose one').isVisible()) await fs.locator('input[type=radio]:not([disabled])').first().check()
  }
  await page.getByRole('button', { name: 'Save to vehicle' }).click()
  await page.waitForURL(new RegExp(`/vehicles/${b}$`), { timeout: 30_000 })

  const files = await page.evaluate(async ([a, b]) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const out: Record<string, { path: string; sha: string; red: boolean }[]> = {}
    for (const id of [a, b]) {
      const { data } = await supabase.from('vehicle_images').select('storage_path').eq('vehicle_id', id).is('deleted_at', null)
      out[id] = []
      for (const r of data ?? []) {
        const { data: blob } = await supabase.storage.from('vehicle-files').download(r.storage_path)
        const buf = await blob!.arrayBuffer()
        const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join('')
        const bmp = await createImageBitmap(blob!)
        const c = new OffscreenCanvas(bmp.width, bmp.height)
        const g = c.getContext('2d')!
        g.drawImage(bmp, 0, 0)
        const [r0, g0] = g.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data
        out[id].push({ path: r.storage_path, sha, red: r0 > 150 && g0 < 80 })
      }
    }
    return out
  }, [a, b])

  expect(files[a]).toHaveLength(1)
  expect(files[b].length).toBeGreaterThanOrEqual(2) // its upload + the imported slide photos
  for (const id of [a, b]) for (const f of files[id]) expect(f.path, 'stored in its own car\'s folder').toMatch(new RegExp(`^[0-9a-f-]{36}/${id}/`))
  const shaA = new Set(files[a].map((f) => f.sha))
  expect(files[b].filter((f) => shaA.has(f.sha))).toEqual([])
  expect(files[b].filter((f) => f.red), 'the hidden picture was not stored').toEqual([])
})
