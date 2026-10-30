import { describe, expect, it } from 'vitest'
import type { MergedFact } from '@/lib/extract/types'
import { buildCandidates, chosenValue, coerce, defaultChoice, defaultSpecDecision, needsDecision } from './session'

const src = (fileKey: string, page: number | null = 1) => ({ fileKey, page })
const fact = (p: Partial<MergedFact> & Pick<MergedFact, 'values'>): MergedFact => ({
  id: Math.random().toString(36), section: null, label: 'x', labelAlt: null, kind: 'value', core: null, conflict: p.values.length > 1, ...p,
})
const noSplit = () => ({ brand: null, model: null, year: null, brandKnown: false })

describe('review defaults', () => {
  it('pre-selects a value that only one document states', () => {
    const c = buildCandidates([fact({ core: 'exterior_color', values: [{ value: 'Ink Blue', unit: null, sources: [src('a')], raw: '' }] })], [], noSplit)
    expect(defaultChoice('exterior_color', c.exterior_color, null, true)).toEqual({ kind: 'candidate', index: 0 })
  })

  it('never picks between conflicting documents', () => {
    const c = buildCandidates([fact({ core: 'mileage_km', values: [
      { value: '12 km', unit: null, sources: [src('a')], raw: '' },
      { value: '40 km', unit: null, sources: [src('b')], raw: '' },
    ] })], [], noSplit)
    expect(defaultChoice('mileage_km', c.mileage_km, null, true)).toBeNull()
    expect(needsDecision('mileage_km', c.mileage_km, null, true)).toBe(true)
  })

  it('asks before overwriting what is already saved on the vehicle', () => {
    const c = buildCandidates([fact({ core: 'trim_level', values: [{ value: 'Sport', unit: null, sources: [src('a')], raw: '' }] })], [], noSplit)
    expect(defaultChoice('trim_level', c.trim_level, 'Comfort', false)).toBeNull()
    expect(defaultChoice('trim_level', c.trim_level, 'sport', false)).toEqual({ kind: 'candidate', index: 0 })
  })

  it('offers a brand/model split from a title only as an unselected suggestion', () => {
    const c = buildCandidates([], [{ name: 'Nimbus Arc 2031', source: src('a') }], () => ({ brand: 'Nimbus', model: 'Arc', year: 2031, brandKnown: false }))
    expect(c.brand[0]).toMatchObject({ value: 'Nimbus', suggested: true })
    expect(defaultChoice('brand', c.brand, null, true)).toEqual({ kind: 'keep' })
    expect(needsDecision('brand', c.brand, null, true)).toBe(false)
  })

  it('merges equal values from different files', () => {
    const c = buildCandidates([fact({ core: 'listing_price', values: [{ value: 'AED 99,500', unit: null, sources: [src('a')], raw: '' }] }),
      fact({ core: 'listing_price', values: [{ value: '99500', unit: null, sources: [src('b')], raw: '' }] })], [], noSplit)
    expect(c.listing_price).toHaveLength(1)
    expect(c.listing_price[0].sources).toHaveLength(2)
  })

  it('keeps chassis untouched on an existing vehicle by default', () => {
    const c = buildCandidates([fact({ core: 'chassis_number', values: [{ value: 'TSTZZ123456789012', unit: null, sources: [src('a')], raw: '' }] })], [], noSplit)
    expect(defaultChoice('chassis_number', c.chassis_number, 'TSTAA123456789012', false)).toEqual({ kind: 'keep' })
  })

  it('leaves spec conflicts undecided', () => {
    const d = defaultSpecDecision(fact({ values: [{ value: '1', unit: null, sources: [], raw: '' }, { value: '2', unit: null, sources: [], raw: '' }] }))
    expect(d.include).toBeNull()
  })
})

describe('field coercion', () => {
  it('reads a year but never from a full date', () => {
    expect(coerce('year', '2031')).toBe('2031')
    expect(coerce('year', 'TBA')).toBeNull()
    expect(coerce('year', '14/03/2029')).toBeNull()
    expect(coerce('year', '2029-03-14')).toBeNull()
    expect(coerce('year', '19 October 2026')).toBeNull()
    expect(coerce('year', '19 أكتوبر 2026')).toBeNull()
    expect(coerce('year', 'October 2026')).toBe('2026')
  })
  it('reads prices and mileage as exact numbers', () => {
    expect(coerce('listing_price', 'AED 1,234,500')).toBe('1234500.00')
    expect(coerce('mileage_km', '12,450 km')).toBe('12450')
    expect(coerce('listing_price', 'on request')).toBeNull()
  })
  it('returns nothing for "keep"', () => {
    expect(chosenValue('brand', { kind: 'keep' }, [])).toBeNull()
  })
})

import { matchField, matchList } from '@/lib/fields'
import { biNeedsDecision, chosenBi, defaultBiChoice, placeFacts } from './session'

describe('placing facts on the fixed fields', () => {
  const v = (value: string, unit: string | null, fileKey: string, valueAlt: string | null = null) => ({ value, unit, valueAlt, sources: [src(fileKey)], raw: value })
  const cols = new Set(['brand', 'model', 'year', 'trim', 'listing_price'])

  it('maps English, Arabic and synonym labels to one field and reports the conflict', () => {
    const merged = [
      fact({ label: 'Combined Power', values: [v('490', 'HP', 'a')], conflict: false }),
      fact({ label: 'Total output', values: [v('483', 'hp', 'b')], conflict: false }),
      fact({ label: 'سعة البطارية', labelAlt: null, values: [v('38', 'kWh', 'c', '38 كيلوواط ساعة')], conflict: false }),
    ]
    const p = placeFacts(merged, matchField, matchList, cols)
    expect(p.fields.get('total_output')!.map((c) => c.en)).toEqual(['490 HP', '483 hp'])
    expect(biNeedsDecision(p.fields.get('total_output')!, undefined)).toBe(true)
    expect(defaultBiChoice(p.fields.get('total_output')!, undefined)).toBeNull()
    expect(p.fields.get('battery')![0]).toMatchObject({ en: '38 kWh', ar: '38 كيلوواط ساعة' })
  })

  it('puts bullets under their list and unmatched facts in Other', () => {
    const merged = [
      fact({ kind: 'item', section: 'SMART DRIVING', label: 'SMART DRIVING', values: [v('Lane Keeping Assist', null, 'a', 'مساعد البقاء في المسار')], conflict: false }),
      fact({ label: 'Warranty', values: [v('5 years', null, 'a')], conflict: false }),
    ]
    const p = placeFacts(merged, matchField, matchList, cols)
    expect(p.lists.get('smart_features')![0]).toMatchObject({ en: 'Lane Keeping Assist', ar: 'مساعد البقاء في المسار' })
    expect(p.other.map((m) => m.label)).toEqual(['Warranty'])
  })

  it('same value in two files is one candidate with both sources; Arabic is borrowed when missing', () => {
    const merged = [fact({ label: 'Top Speed', values: [v('210', 'km/h', 'a'), v('210', 'km/h', 'b', '210 كم/ساعة')], conflict: true })]
    const p = placeFacts(merged, matchField, matchList, cols)
    const c = p.fields.get('top_speed')!
    expect(c).toHaveLength(1)
    expect(c[0].sources).toHaveLength(2)
    expect(chosenBi({ kind: 'candidate', index: 0 }, c)).toEqual({ en: '210 km/h', ar: '210 كم/ساعة' })
  })

  it('asks before replacing a different saved value', () => {
    const c = [{ en: '640 Nm', ar: null, sources: [], raw: '', unit: null }]
    expect(defaultBiChoice(c, { en: '600 Nm' })).toBeNull()
    expect(defaultBiChoice(c, { en: '640 nm' })).toEqual({ kind: 'candidate', index: 0 })
  })
})

describe('field catalogue', () => {
  it('matches the kit exactly', async () => {
    const { readFileSync } = await import('node:fs')
    const kit = JSON.parse(readFileSync(new URL('../../../../kit/fields.json', import.meta.url), 'utf8'))
    const app = JSON.parse(readFileSync(new URL('../../lib/fields/fields.json', import.meta.url), 'utf8'))
    expect(app).toEqual(kit)
  })
  it('matches labels in English, Arabic, with notes in brackets and by synonym', () => {
    expect(matchField('Maximum Torque')).toBe('max_torque')
    expect(matchField('عزم الدوران الأقصى')).toBe('max_torque')
    expect(matchField('Seats')).toBe('seating')
    expect(matchField('0-100 km/h (s)')).toBe('acceleration')
    expect(matchField('L × W × H')).toBe('dimensions')
    expect(matchField('Warranty')).toBeNull()
    expect(matchList('Drive Modes')).toBe('drive_modes')
  })
})
