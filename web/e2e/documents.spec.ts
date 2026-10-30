import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { importFictionalCar, login } from './helpers'

const FX = path.resolve(import.meta.dirname, 'fixtures')
const OUT = path.resolve(import.meta.dirname, '../test-results/documents')

async function readPdf(file: string) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array((await import('node:fs')).readFileSync(file)) }).promise
  const pages: { text: string; outside: string[] }[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const [x0, y0, x1, y1] = page.view
    const tc = await page.getTextContent()
    const outside: string[] = []
    let text = ''
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue
      text += it.str + ' '
      const [, , , , x, y] = it.transform as number[]
      if (x < x0 - 1 || x + it.width > x1 + 1 || y < y0 - 1 || y + it.height > y1 + 1) outside.push(it.str)
    }
    pages.push({ text, outside })
  }
  return pages
}


async function exportDoc(page: Page, name: string, saved: RegExp) {
  await expect(page.locator('img[data-page]').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled({ timeout: 30_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const file = path.join(OUT, name)
  await (await download).saveAs(file)
  await expect(page.getByText(saved)).toBeVisible({ timeout: 30_000 }).catch(async (e) => {
    throw new Error(`${e.message}\nToasts: ${(await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | ')}`)
  })
  return file
}

test.describe.configure({ mode: 'serial' })

test('generates the spec sheet and brochure for the fictional car', async ({ page }) => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  await login(page)

  // Company document assets (fictional banner and watermark).
  await page.goto('/settings')
  await page.getByLabel('Fallback banner').setInputFiles(path.join(FX, 'doc-banner.png'))
  await page.getByLabel('Brochure watermark').setInputFiles(path.join(FX, 'watermark.png'))
  await page.getByLabel('Company legal name').fill('Northwind Auto House LLC')
  await page.getByLabel('Disclaimer').fill('Specifications are indicative and may change without notice. Images are for illustration only.')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  const vehicleUrl = await importFictionalCar(page, [path.join(FX, 'car-photo.png')])
  // Key features are written on the car page (English only), not imported.
  for (const f of ['Panoramic glass roof', 'Heated front seats']) {
    await page.getByLabel('Add key feature').fill(f)
    await page.getByLabel('Add key feature').press('Enter')
    await expect(page.getByText(f, { exact: true }).first()).toBeVisible()
  }
  await page.goto(`${vehicleUrl}/documents`)

  // ---- Spec sheet --------------------------------------------------------
  await expect(page.getByText('1 page', { exact: true })).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: path.join(OUT, 'specsheet-screen.png'), fullPage: true })
  const ss = await exportDoc(page, 'specsheet.pdf', /Spec sheet downloaded/)
  const ssPages = await readPdf(ss)
  expect(ssPages).toHaveLength(1)
  expect(ssPages[0].outside).toEqual([])
  const flat = ssPages[0].text.replace(/\s+/g, '')
  for (const v of ['VALTREN ORISA X5', '2024', 'AED 189,900', 'SPECIFICATIONS', 'KEY FEATURES', 'Northwind Auto House LLC']) expect(flat).toContain(v.replace(/\s+/g, ''))
  expect(ssPages[0].text).not.toContain('14/03/2023') // the source document's date is not a spec

  // ---- Brochure ------------------------------------------------------------
  await page.getByRole('tab', { name: 'Brochure' }).click()
  await expect(page.locator('[data-issue=few_photos]')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: path.join(OUT, 'brochure-screen.png'), fullPage: true })
  const br = await exportDoc(page, 'brochure.pdf', /Brochure downloaded/)
  const brPages = await readPdf(br)
  expect(brPages.length).toBeGreaterThanOrEqual(3) // cover + specs + photo(s)
  for (const p of brPages) expect(p.outside).toEqual([])
  const all = brPages.map((p) => p.text).join(' ')
  expect(all).toContain('VALTREN ORISA X5')
  expect(all.replace(/\s+/g, '')).toMatch(/ENGINE&PERFORMANCE/)
  expect(all).not.toContain('14/03/2023')

  // ---- Saved with the vehicle ----------------------------------------------
  await page.goto(`${vehicleUrl}?tab=documents`)
  await expect(page.getByText(/-brochure\.pdf/).first()).toBeVisible() // generated documents: the brochure
  await expect(page.getByText(/spec-sheet\.pdf/).first()).toBeVisible() // generated documents: the spec sheet
})

test('missing data blocks or warns before export', async ({ page }) => {
  await login(page)
  await page.goto('/vehicles/new?mode=manual')
  const chassis = `TSTMISS${Date.now().toString().slice(-10)}`
  await page.getByPlaceholder('LVVDB21B9PD012345').fill(chassis)
  await page.getByRole('button', { name: 'Save vehicle' }).click()
  await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/)
  await page.goto(`${page.url()}/documents`)
  await expect(page.locator('[data-issue=missing_brand]')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-issue=no_price]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeDisabled()
  await page.getByRole('tab', { name: 'Brochure' }).click()
  await expect(page.locator('[data-issue=few_photos]')).toContainText('Only 0 photos')
  // Fix the blocking item inline: export becomes possible.
  for (const f of ['Brand', 'Model', 'Model year']) {
    const input = page.getByLabel(f, { exact: true })
    await input.fill(f === 'Model year' ? '2031' : `Test${f}`)
    await input.press('Enter')
  }
  await expect(page.locator('[data-issue^=missing_]')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled({ timeout: 30_000 })
})
