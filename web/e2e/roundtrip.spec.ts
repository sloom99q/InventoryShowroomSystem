// kit/README.md §6, tests 2 (photos) and 4 (round trip of the app's own output).
// Real showroom files are TEST INPUTS ONLY (kit/real-fixtures).
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { login } from './helpers'

const KIT = path.resolve(import.meta.dirname, '../../kit')

/** The kit sample car with its pictures mapped into the renderer's file system (base64 for transfer). */
function sample() {
  const data = JSON.parse(readFileSync(path.join(KIT, 'sample/sample-data.json'), 'utf8'))
  const files: Record<string, string> = {}
  const add = (src: string, virtual: string) => { files[virtual] = readFileSync(src).toString('base64'); return virtual }
  data.company.banner = add(path.join(KIT, 'assets/spec-header-banner.jpg'), '/assets/banner.jpg')
  data.company.banner_left = add(path.join(KIT, 'assets/banner-left.png'), '/assets/banner-left.png')
  data.company.banner_text = add(path.join(KIT, 'assets/banner-text.png'), '/assets/banner-text.png')
  data.company.watermark = add(path.join(KIT, 'assets/watermark-logo.png'), '/assets/watermark.png')
  const pages: string[] = data.photos.pages
  data.photos.cover = add(path.join(KIT, 'sample', data.photos.cover), '/photos/cover.jpg')
  data.photos.pages = pages.map((p, i) => add(path.join(KIT, 'sample', p), `/photos/${i + 1}.jpg`))
  data.photos.banner = '/photos/1.jpg'
  return { data, files }
}

type Imported = {
  layouts: (string | null)[]
  identity: Record<string, string | null>
  values: Record<string, { en: string | null; ar: string | null; candidates: number }>
  lists: Record<string, { en: string | null; ar: string | null }[]>
  other: number
}

/** Render both documents in the browser, then import them the way the review screen does. */
async function renderAndImport(page: Page): Promise<Imported> {
  const { data, files } = sample()
  return page.evaluate(async ({ data, files }) => {
    const r = await import('/src/docs/render.ts')
    const x = await import('/src/lib/extract/index.ts')
    const s = await import('/src/pages/import/session.ts')
    const f = await import('/src/lib/fields/index.ts')
    const bin = Object.fromEntries(Object.entries(files).map(([k, b64]) => [k, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
    const spec = await r.renderSpecSheet(data as never, bin)
    const bro = await r.renderBrochure(data as never, bin)
    const read = async (pdf: Uint8Array, name: string, key: string) =>
      ({ key, ...(await x.extractFile(new File([pdf.slice()], name, { type: 'application/pdf' }), key)) })
    const got = [await read(spec.pdf, 'spec-sheet.pdf', 'spec'), await read(bro.pdf, 'brochure.pdf', 'bro')]
    const merged = x.mergeFacts(got.map((g) => ({ fileKey: g.key, facts: g.extraction.facts })))
    const placed = s.placeFacts(merged, f.matchField, f.matchList, new Set(['brand', 'model', 'year', 'trim', 'listing_price']))
    const cands = s.buildCandidates(merged, [], () => ({ brand: null, model: null, year: null, brandKnown: false }))
    const pick = (k: 'brand' | 'model' | 'year' | 'trim_level' | 'listing_price') =>
      s.chosenValue(k, s.defaultChoice(k, cands[k], null, true), cands[k])
    return {
      layouts: got.map((g) => g.extraction.layout ?? null),
      identity: { brand: pick('brand'), model: pick('model'), year: pick('year'), trim: pick('trim_level'), listing_price: pick('listing_price') },
      values: Object.fromEntries([...placed.fields].map(([k, c]) => [k, { en: c[0].en || null, ar: c[0].ar ?? null, candidates: c.length }])),
      lists: Object.fromEntries([...placed.lists].map(([k, items]) => [k, items.map((i) => ({ en: i.en || null, ar: i.ar ?? null }))])),
      other: placed.other.length,
    }
  }, { data, files })
}

test('round trip: export the sample car, import both exports → identical fields, lists and key features; Other empty', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  const want = JSON.parse(readFileSync(path.join(KIT, 'sample/sample-data.json'), 'utf8'))
  const got = await renderAndImport(page)

  expect(got.identity).toEqual({ brand: want.identity.brand, model: want.identity.model, year: want.identity.year, trim: want.identity.trim,
    listing_price: Number(want.identity.listing_price).toFixed(2) })
  expect(got.values.description?.en).toBe(want.identity.description)
  expect(got.values.regional_specs?.en).toBe(want.identity.regional_specs.en)
  for (const [k, v] of Object.entries(want.values as Record<string, { en?: string; ar?: string }>)) {
    expect(got.values[k]?.en ?? undefined, k).toBe(v.en)
    expect(got.values[k]?.candidates, `${k}: both documents agree`).toBe(1)
  }
  for (const list of ['drive_modes', 'interior_features', 'smart_features'])
    expect(got.lists[list].map((i) => i.en), list).toEqual(want.lists[list].map((i: { en: string }) => i.en))
  expect(got.lists.key_features.map((i) => i.en)).toEqual(want.lists.key_features)
  expect(got.other).toBe(0)

  // Arabic: exact only when the export carries its data (data.json attachment). The visible Arabic
  // text layer of Noto Naskh in a PDF can't be read back reliably, so it is never trusted for this.
  expect(got.layouts.every((l) => l === 'embedded'), `exports carry their data (layouts: ${got.layouts.join(', ')})`).toBe(true)
  for (const [k, v] of Object.entries(want.values as Record<string, { ar?: string }>)) expect(got.values[k]?.ar ?? undefined, `${k} (ar)`).toBe(v.ar)
  for (const list of ['drive_modes', 'interior_features', 'smart_features'])
    expect(got.lists[list].map((i) => i.ar), `${list} (ar)`).toEqual(want.lists[list].map((i: { ar?: string }) => i.ar ?? null))
})

test('importing the real brochure offers its cover and all 17 photo pages, pre-selected', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await page.goto('/vehicles/new?mode=documents')
  await expect(page.getByText('Drop files here, or click to choose')).toBeVisible()
  await page.locator('input[type=file][multiple][accept*=".docx"]').setInputFiles(path.join(KIT, 'real-fixtures/VOYAH_FREE.pdf'))
  const photos = page.locator('[data-photo]')
  await expect(photos).toHaveCount(18, { timeout: 120_000 })
  await expect(photos.locator('input[type=checkbox]:checked')).toHaveCount(18)
  await expect(photos.first()).toContainText('p. 1')
  // The fields land in the catalogue's sections.
  await expect(page.locator('fieldset[data-field=total_output]')).toBeVisible()
  await expect(page.locator('[data-section=smart_driving]')).toBeVisible()
})
