// The app's vehicle record → document data and checks, with the kit's fictional car.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { splitSpecs, type SpecRow } from '@/api/fields'
import { brochurePhotos, type Img, inspect, toDocData } from './docdata'

const sample = JSON.parse(readFileSync(new URL('../../../../kit/sample/sample-data.json', import.meta.url), 'utf8'))
let n = 0
const row = (p: Partial<SpecRow>): SpecRow => ({
  id: `r${++n}`, company_id: 'c', vehicle_id: 'v', field_key: null, position: null, section: null, label: 'x', label_alt: null, value_en: null, value_ar: null,
  unit: null, source_document_id: null, source_page: null, verified: true, sort_order: n, created_at: '', updated_at: '', ...p,
})
const img = (p: Partial<Img>): Img => ({
  id: `i${++n}`, company_id: 'c', vehicle_id: 'v', image_type: 'arrival', storage_path: `p${n}.jpg`, thumbnail_path: null, original_filename: `photo${n}.jpg`,
  mime_type: 'image/jpeg', file_size: 1, caption: null, captured_at: null, superseded_at: null, deleted_at: null, uploaded_by: null, uploaded_at: '', ...p,
})

/** The sample car as the database would hold it. */
function sampleRows(): SpecRow[] {
  const rows: SpecRow[] = []
  for (const [k, v] of Object.entries(sample.values) as [string, { en?: string; ar?: string }][]) rows.push(row({ field_key: k, value_en: v.en ?? null, value_ar: v.ar ?? null }))
  rows.push(row({ field_key: 'description', value_en: sample.identity.description }))
  rows.push(row({ field_key: 'regional_specs', value_en: sample.identity.regional_specs.en }))
  for (const list of ['drive_modes', 'interior_features', 'smart_features'])
    sample.lists[list].forEach((it: { en: string; ar: string }, i: number) => rows.push(row({ field_key: list, position: i + 1, value_en: it.en, value_ar: it.ar })))
  sample.lists.key_features.forEach((t: string, i: number) => rows.push(row({ field_key: 'key_features', position: i + 1, value_en: t })))
  rows.push(row({ label: 'Warranty', value_en: '5 years' })) // Other: never printed
  return rows
}
const car = { brand: 'Valtren', model: 'Orisa X5', year: 2024, trim_level: sample.identity.trim, listing_price: sample.identity.listing_price, doc_settings: {} }
const company = { name: 'Fictional Motors', legal_name: null, signature_line: 'Management', disclaimer: null, currency: 'AED', doc_banner_path: null, doc_watermark_path: null, doc_banner_left_path: null, doc_banner_text_path: null }
const paths = { cover: null, pages: [], banner: null, watermark: null }

describe('vehicle → document data', () => {
  it('reproduces the kit sample from stored rows', () => {
    const d = toDocData(car, company, splitSpecs(sampleRows()), paths, new Date('2026-11-02T08:00:00Z'))
    expect(d.doc_date).toBe(sample.doc_date)
    expect(d.identity).toMatchObject({ brand: 'VALTREN', model: 'ORISA X5', year: '2024', trim: sample.identity.trim, description: sample.identity.description, listing_price: 189500 })
    expect(d.values).toEqual(sample.values)
    expect(d.lists).toEqual(sample.lists)
    expect(JSON.stringify(d)).not.toContain('Warranty')
  })

  it('passes the per-car banner settings (defaults: centred, no zoom)', () => {
    const d = toDocData({ ...car, doc_settings: { banner: { pos: '30% 60%', zoom: 1.4 } } }, company, splitSpecs(sampleRows()),
      { ...paths, bannerLeft: '/l.png', bannerText: '/t.png', bannerPhoto: '/p.jpg' })
    expect(d.photos).toMatchObject({ banner: '/p.jpg', banner_pos: '30% 60%', banner_zoom: 1.4 })
    expect(d.company).toMatchObject({ banner_left: '/l.png', banner_text: '/t.png' })
    expect(toDocData(car, company, splitSpecs(sampleRows()), paths).photos).toMatchObject({ banner_pos: '50% 50%', banner_zoom: 1 })
  })
})

describe('inspection', () => {
  const full = splitSpecs(sampleRows())
  it('blocks missing brand/model/year and render problems', () => {
    const codes = inspect('specsheet', { ...car, brand: '', year: null }, full, [], { render: { problems: [{ code: 'specsheet_overflow' }] } }).filter((i) => i.level === 'block').map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['missing_brand', 'missing_year', 'overflow']))
  })
  it('warns about no price, empty fields, missing Arabic and few photos', () => {
    const rows = sampleRows().filter((r) => r.field_key !== 'wheelbase').map((r) => (r.field_key === 'engine' ? { ...r, value_ar: null } : r))
    const issues = inspect('brochure', { ...car, listing_price: null }, splitSpecs(rows), [img({})])
    const codes = issues.map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['no_price', 'empty_field', 'no_arabic', 'few_photos']))
    expect(issues.every((i) => i.level === 'warn')).toBe(true)
    expect(issues.find((i) => i.code === 'empty_field')?.params?.label).toBe('Wheelbase')
  })
  it('brochure photos: arrival and current by default, saved order wins', () => {
    const ps = [img({}), img({ image_type: 'current' }), img({ image_type: 'garage' })]
    expect(brochurePhotos(ps, {}).photos.map((p) => p.id)).toEqual([ps[0].id, ps[1].id])
    expect(brochurePhotos(ps, { brochure: { photoIds: [ps[2].id, ps[0].id], coverId: ps[1].id } })).toMatchObject({ photos: [ps[2], ps[0]], cover: ps[1] })
  })
})
