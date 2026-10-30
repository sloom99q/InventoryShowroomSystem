// kit/README.md §6: importing the showroom's own documents fills the fixed fields.
// The real files in kit/real-fixtures are TEST INPUTS ONLY; their values live in
// the *.expected.json files, never in app code.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { matchField, matchList } from '@/lib/fields'
import { buildCandidates, chosenValue, coerce, defaultChoice, placeFacts } from '@/pages/import/session'
import { mergeFacts } from './index'
import { extractPdf } from './pdf'
import type { Extraction } from './types'

const KIT = path.resolve(import.meta.dirname, '../../../../kit')
const json = (p: string) => JSON.parse(readFileSync(path.join(KIT, p), 'utf8'))
const read = (p: string, key: string) => extractPdf(new Uint8Array(readFileSync(path.join(KIT, p))), pdfjs as never, key)

const COLS = new Set(['brand', 'model', 'year', 'trim', 'listing_price'])
const fold = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** What the review screen would fill in, taking the first value for any conflict. */
function imported(files: { key: string; x: Extraction }[]) {
  const merged = mergeFacts(files.map((f) => ({ fileKey: f.key, facts: f.x.facts })))
  const placed = placeFacts(merged, matchField, matchList, COLS)
  const cands = buildCandidates(merged, [], () => ({ brand: null, model: null, year: null, brandKnown: false }))
  const ident = (f: 'brand' | 'model' | 'year' | 'trim_level' | 'listing_price') => {
    const c = cands[f].filter((x) => !x.suggested)
    return c.length ? chosenValue(f, defaultChoice(f, cands[f], null, true) ?? { kind: 'candidate', index: 0 }, cands[f]) : null
  }
  const values: Record<string, { en?: string; ar?: string }> = {}
  const conflicts: string[] = []
  for (const [k, c] of placed.fields) {
    if (c.length > 1) conflicts.push(k)
    values[k] = { ...(c[0].en ? { en: c[0].en } : {}), ...(c[0].ar ?? c.find((x) => x.ar)?.ar ? { ar: (c[0].ar ?? c.find((x) => x.ar)?.ar)! } : {}) }
  }
  const lists = Object.fromEntries([...placed.lists].map(([k, items]) => [k, items.map((i) => ({ en: i.en, ar: i.ar }))]))
  const { description, regional_specs, ...rest } = values
  return {
    identity: {
      brand: ident('brand'), model: ident('model'), year: ident('year'), trim: ident('trim_level'),
      listing_price: ident('listing_price') === null ? null : Number(ident('listing_price')),
      description: description?.en ?? null, regional_specs,
    },
    values: rest,
    lists,
    other: placed.other,
    conflicts,
    candidates: placed.fields,
  }
}

describe('§6 test 1: the showroom spec sheet', async () => {
  const want = json('real-fixtures/spec-sheet.expected.json')
  const x = await read('real-fixtures/14_VOYAH_FREE_Spec_Sheet.pdf', 'spec')
  const got = imported([{ key: 'spec', x }])

  it('is recognised as the spec-sheet layout', () => expect(x.layout).toBe('spec_sheet'))
  it('fills identity (title, subtitle, price) without taking the document date as the year', () => {
    expect(got.identity).toEqual({ ...want.identity, currency: undefined, listing_price: want.identity.listing_price })
  })
  it('fills every spec row, splitting the torque out of "Total output" and ignoring the Arabic label column', () => {
    expect(got.values).toEqual(want.values)
  })
  it('reads key features left column first, then right', () => {
    expect(got.lists.key_features.map((i) => i.en)).toEqual(want.lists.key_features)
  })
  it('leaves nothing in Other', () => expect(got.other).toEqual([]))
})

describe('§6 test 2: the showroom brochure', async () => {
  const want = json('real-fixtures/brochure.expected.json')
  const x = await read('real-fixtures/VOYAH_FREE.pdf', 'brochure')
  const got = imported([{ key: 'brochure', x }])

  it('is recognised as the brochure layout', () => expect(x.layout).toBe('brochure'))
  it('reads name and year from page 1', () => {
    expect({ brand: got.identity.brand, model: got.identity.model, year: got.identity.year }).toEqual(want.identity)
  })
  it('fills the English values exactly as written', () => {
    expect(Object.fromEntries(Object.entries(got.values).map(([k, v]) => [k, v.en]))).toEqual(
      Object.fromEntries(Object.entries(want.values as Record<string, { en: string }>).map(([k, v]) => [k, v.en])))
  })
  it('pairs Arabic by position: each value contains its tokens', () => {
    for (const [k, v] of Object.entries(want.values as Record<string, { ar_contains: string[] }>)) {
      const ar = fold(got.values[k]?.ar ?? '')
      for (const token of v.ar_contains) expect(ar, `${k}: ${ar}`).toContain(fold(token))
    }
  })
  it('reads the lists (drive modes split on "/", wrapped lines joined, extra Arabic kept)', () => {
    expect(got.lists.drive_modes.filter((i) => i.en).map((i) => i.en)).toEqual(want.lists.drive_modes_en)
    expect(got.lists.interior_features.filter((i) => i.en).map((i) => i.en)).toEqual(want.lists.interior_features_en)
    expect(got.lists.smart_features.filter((i) => i.en).map((i) => i.en)).toEqual(want.lists.smart_features_en)
    expect(got.lists.interior_features.filter((i) => i.ar).length).toBe(want.lists.interior_features_ar_count)
    expect(got.lists.smart_features.filter((i) => i.ar).length).toBe(want.lists.smart_features_ar_count)
  })
  it('offers the cover (page 1) and every picture-only page', () => {
    expect(x.coverPage).toBe(want.photos.cover_photo_from_page)
    expect(x.photoPages![0]).toBe(want.photos.cover_photo_from_page)
    expect(x.photoPages!.slice(1).length).toBe(want.photos.pages_with_photos)
  })
  it('leaves nothing in Other', () => expect(got.other).toEqual([]))
})

describe('§6 test 3: both files together', async () => {
  const spec = json('real-fixtures/spec-sheet.expected.json')
  const bro = json('real-fixtures/brochure.expected.json')
  const got = imported([
    { key: 'spec', x: await read('real-fixtures/14_VOYAH_FREE_Spec_Sheet.pdf', 'spec') },
    { key: 'brochure', x: await read('real-fixtures/VOYAH_FREE.pdf', 'brochure') },
  ])
  const same = (a: string, b: string) => a.toLowerCase().replace(/^(approximately|about)\s+/, '').replace(/[\s,]+/g, '') ===
    b.toLowerCase().replace(/^(approximately|about)\s+/, '').replace(/[\s,]+/g, '')

  it('reports a conflict only where the two files really disagree', () => {
    const both = Object.keys(spec.values).filter((k) => k in bro.values)
    const disagree = both.filter((k) => !same(spec.values[k].en, bro.values[k].en))
    expect(got.conflicts.sort()).toEqual(disagree.sort())
    expect(got.conflicts).toContain('total_output')
    for (const k of ['max_torque', 'top_speed', 'wheelbase', 'acceleration']) expect(got.conflicts).not.toContain(k)
  })
  it('keeps every value from either file as a candidate (nothing lost)', () => {
    for (const [k, v] of [...Object.entries(spec.values), ...Object.entries(bro.values)] as [string, { en: string }][]) {
      const cands = got.candidates.get(k)!.map((c) => c.en)
      expect(cands.some((c) => same(c, v.en)), `${k}: ${v.en}`).toBe(true)
    }
    expect(got.lists.key_features.map((i) => i.en)).toEqual(spec.lists.key_features)
    expect(got.lists.smart_features.filter((i) => i.en).map((i) => i.en)).toEqual(bro.lists.smart_features_en)
  })
})

describe('§6 test 4: round trip of the app\'s own output (kit reference = our renderer\'s target)', async () => {
  const sample = json('sample/sample-data.json')
  const got = imported([
    { key: 'spec', x: await read('reference/spec-sheet.pdf', 'spec') },
    { key: 'brochure', x: await read('reference/brochure.pdf', 'brochure') },
  ])

  it('identity, every English value, list item and key feature come back identical', () => {
    expect(got.identity).toMatchObject({
      brand: sample.identity.brand, model: sample.identity.model, year: sample.identity.year, trim: sample.identity.trim,
      description: sample.identity.description, listing_price: sample.identity.listing_price,
    })
    expect(got.identity.regional_specs?.en).toBe(sample.identity.regional_specs.en)
    expect(Object.fromEntries(Object.entries(got.values).map(([k, v]) => [k, v.en]))).toEqual(
      Object.fromEntries(Object.entries(sample.values as Record<string, { en: string }>).map(([k, v]) => [k, v.en])))
    for (const list of ['drive_modes', 'interior_features', 'smart_features'])
      expect(got.lists[list].map((i) => i.en)).toEqual(sample.lists[list].map((i: { en: string }) => i.en))
    expect(got.lists.key_features.map((i) => i.en)).toEqual(sample.lists.key_features)
    expect(got.conflicts).toEqual([])
    expect(got.other).toEqual([])
  })
  it('stores no garbage when the Arabic text layer is unusable (Chromium/Noto subsets)', () => {
    for (const v of Object.values(got.values)) expect((v.ar ?? '').includes('\u0000')).toBe(false)
  })
})

it('price coercion keeps exact numbers', () => expect(coerce('listing_price', 'AED 140,000')).toBe('140000.00'))

describe('exports that carry their data (data.json attachment)', () => {
  it('restores every field, list item and key feature exactly, Arabic included', async () => {
    const { docDataFacts } = await import('./showroom')
    const sample = json('sample/sample-data.json')
    const facts = docDataFacts(sample, 'spec')
    const x = { facts } as unknown as Extraction
    const got = imported([{ key: 'spec', x }, { key: 'bro', x: { facts: docDataFacts(sample, 'bro') } as unknown as Extraction }])
    expect(got.identity).toMatchObject({ brand: sample.identity.brand, model: sample.identity.model, year: sample.identity.year, trim: sample.identity.trim,
      description: sample.identity.description, listing_price: sample.identity.listing_price })
    expect(got.values).toEqual(sample.values)
    for (const list of ['drive_modes', 'interior_features', 'smart_features'])
      expect(got.lists[list]).toEqual(sample.lists[list].map((i: { en: string; ar?: string }) => ({ en: i.en, ar: i.ar ?? null })))
    expect(got.lists.key_features.map((i) => i.en)).toEqual(sample.lists.key_features)
    expect(got.conflicts).toEqual([])
    expect(got.other).toEqual([])
  })
})
