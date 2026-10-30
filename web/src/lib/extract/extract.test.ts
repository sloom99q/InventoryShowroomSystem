/// <reference types="node" />
// Runs the real extraction engine on generated fixtures for a fictional car
// (see e2e/fixtures/generate.mjs). Expected strings live only in this test.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { splitUnit, suggestName } from './core'
import { extractDocx } from './docx'
import { detectKind, mergeFacts } from './index'
import { visualToLogical } from './layout'
import { extractPdf } from './pdf'
import { extractSheet } from './sheet'
import type { Extraction, Fact } from './types'

const FIX = resolve(import.meta.dirname, '../../../e2e/fixtures')
const bytes = (f: string) => new Uint8Array(readFileSync(`${FIX}/${f}`))
type Pdf = typeof import('pdfjs-dist')

let a: Extraction, b: Extraction, c: Extraction, d: Extraction, e: Extraction
beforeAll(async () => {
  a = await extractPdf(bytes('a-brochure-bilingual.pdf'), pdfjs as unknown as Pdf, 'a')
  b = await extractPdf(bytes('b-spec-table.pdf'), pdfjs as unknown as Pdf, 'b')
  c = extractDocx(bytes('c-summary.docx'), 'c')
  d = extractSheet(bytes('d-spec-sheet.xlsx'), 'd')
  e = extractSheet(bytes('e-inventory.xlsx'), 'e')
})

const find = (x: Extraction, label: RegExp) => x.facts.find((f) => label.test(f.label) || (f.labelAlt ? label.test(f.labelAlt) : false))
const core = (x: Extraction, field: Fact['core']) => x.facts.filter((f) => f.core === field)
const PRESENTATION = /[ﭐ-﷿ﹰ-﻿]/
const ARABIC = /[؀-ۿ]/
const LATIN_WORD = /[A-Za-z]{3,}/

describe('bilingual two-column PDF', () => {
  it('reads the title and model year, not the document date', () => {
    expect(a.title).toBe('Valtren Orisa X5 2024')
    expect(core(a, 'year').map((f) => f.value)).toEqual(['2024'])
    expect(core(a, 'document_date').map((f) => f.value)).toEqual(['14/03/2023'])
    expect(core(a, 'vehicle_name')[0].value).toBe('Valtren Orisa X5')
  })

  it('keeps English and Arabic apart and readable', () => {
    for (const page of a.pages) {
      for (const line of page.split('\n')) {
        expect(line).not.toMatch(PRESENTATION)
        // A line is either an English line (Arabic-free) or an Arabic line whose only
        // Latin text is units/abbreviations — never English sentences mixed in.
        if (ARABIC.test(line)) expect(line.replace(/\b(kWh|kW|km|inch|AED)\b/g, '')).not.toMatch(LATIN_WORD)
      }
    }
    expect(a.pages[0]).toContain('قوة المحرك: 310 kW')
    expect(a.pages[0]).toContain('اللون الخارجي: أزرق جليدي')
  })

  it('pairs each English fact with its Arabic twin', () => {
    const power = find(a, /^Motor power$/)!
    expect(power.labelAlt).toBe('قوة المحرك')
    expect([power.value, power.unit]).toEqual(['310', 'kW'])
    expect(power.section).toBe('Powertrain')
    const colour = core(a, 'exterior_color')
    expect(colour).toHaveLength(1)
    expect(colour[0].value).toBe('Glacier Teal')
    expect(colour[0].valueAlt).toBe('أزرق جليدي')
    // No Arabic duplicates left over once paired.
    expect(a.facts.filter((f) => f.kind === 'value' && ARABIC.test(f.label))).toHaveLength(0)
  })

  it('reads price, list items, sources and the picture-only page', () => {
    const price = core(a, 'listing_price')
    expect(price.map((f) => [f.value, f.unit])).toEqual([['189,900', 'AED']])
    const items = a.facts.filter((f) => f.kind === 'item').map((f) => f.value)
    expect(items).toContain('Panoramic glass roof')
    expect(a.facts.every((f) => f.source.fileKey === 'a' && f.source.page === 1)).toBe(true)
    expect(a.imageOnlyPages).toEqual([2])
    expect(a.chassisCandidates).toHaveLength(0)
    expect(core(a, 'chassis_number')).toHaveLength(0)
  })
})

describe('spec table PDF', () => {
  it('reads label | value | Arabic label rows', () => {
    const range = find(b, /^Range$/)!
    expect([range.value, range.unit, range.labelAlt]).toEqual(['525', 'km', 'المدى'])
    expect(range.section).toBe('Vehicle details')
    expect(core(b, 'trim_level')[0].value).toBe('Signature AWD')
    expect(core(b, 'interior_color')[0].value).toBe('Sand Beige')
    expect(core(b, 'year')[0].value).toBe('2024')
    expect(b.chassisCandidates).toHaveLength(0)
    expect(b.imageOnlyPages).toEqual([])
    // A document heading is not a vehicle name.
    expect(core(b, 'vehicle_name')).toHaveLength(0)
  })
})

describe('DOCX', () => {
  it('reads title, labelled paragraphs, Arabic labels, tables and lists', () => {
    expect(c.title).toBe('Valtren Orisa X5 Signature')
    expect(core(c, 'year')[0].value).toBe('2024')
    expect(core(c, 'exterior_color')[0]).toMatchObject({ label: 'اللون الخارجي', value: 'أزرق جليدي' })
    expect(core(c, 'mileage_km')[0]).toMatchObject({ value: '12', unit: 'كم' })
    const dc = find(c, /^DC fast charging$/)!
    expect([dc.value, dc.unit, dc.section]).toEqual(['150', 'kW', 'Charging'])
    const items = c.facts.filter((f) => f.kind === 'item')
    expect(items.map((f) => f.value)).toEqual(['Heated front seats', 'Wireless phone charger'])
    expect(items[0].section).toBe('Comfort features')
    expect(c.facts.every((f) => f.source.fileKey === 'c' && f.source.page === null)).toBe(true)
  })
})

describe('spreadsheets', () => {
  it('reads a label/value spec sheet with sections', () => {
    expect(d.inventorySheet).toBeNull()
    expect(core(d, 'brand')[0].value).toBe('Valtren')
    expect(core(d, 'model')[0].value).toBe('Orisa X5')
    expect(find(d, /^Airbags$/)).toMatchObject({ value: '8', section: 'Safety' })
    expect(find(d, /^Range$/)).toMatchObject({ value: '540', unit: 'km', labelAlt: 'المدى' })
  })

  it('recognises an inventory list (one vehicle per row)', () => {
    expect(e.inventorySheet).toEqual({ rows: 4 })
    expect(e.facts).toHaveLength(0)
  })
})

describe('merging files', () => {
  it('merges agreeing values, reports conflicts, never picks one', () => {
    const merged = mergeFacts([a, b, c, d].map((x, i) => ({ fileKey: 'abcd'[i], facts: x.facts })))
    const range = merged.find((m) => m.label === 'Range')!
    expect(range.conflict).toBe(true)
    expect(range.values.map((v) => v.value).sort()).toEqual(['525', '540'])
    expect(range.values.find((v) => v.value === '540')!.sources.map((s) => s.fileKey).sort()).toEqual(['a', 'd'])

    const year = merged.find((m) => m.core === 'year')!
    expect(year.conflict).toBe(false)
    expect(year.values[0].sources.map((s) => s.fileKey).sort()).toEqual(['a', 'b', 'c'])

    // English name in one file, Arabic name in another: the same colour, not a conflict.
    const colour = merged.find((m) => m.core === 'exterior_color')!
    expect(colour.conflict).toBe(false)
    expect(colour.values[0].sources.map((s) => s.fileKey).sort()).toEqual(['a', 'c', 'd'])

    expect(merged.find((m) => m.core === 'interior_color')!.conflict).toBe(false)
    expect(merged.find((m) => m.core === 'trim_level')!.conflict).toBe(false)
    expect(merged.find((m) => m.core === 'document_date')!.values[0].value).toBe('14/03/2023')
    expect(merged.some((m) => m.core === 'chassis_number')).toBe(false)

    const features = merged.filter((m) => m.kind === 'item')
    expect(features.every((m) => !m.conflict)).toBe(true)
  })
})

describe('helpers', () => {
  it('splits units and currencies', () => {
    expect(splitUnit('4,860 mm')).toEqual({ value: '4,860', unit: 'mm' })
    expect(splitUnit('AED 189,900')).toEqual({ value: '189,900', unit: 'AED' })
    expect(splitUnit('189,900 درهم')).toEqual({ value: '189,900', unit: 'درهم' })
    expect(splitUnit('Sand Beige')).toEqual({ value: 'Sand Beige', unit: null })
  })

  it('suggests brand and model, with and without a known brand list', () => {
    expect(suggestName('Valtren Orisa X5 2024', [])).toEqual({ brand: 'Valtren', model: 'Orisa X5', year: '2024', brandKnown: false })
    expect(suggestName('Nova Terra Ridge 2023', ['Nova Terra'])).toEqual({ brand: 'Nova Terra', model: 'Ridge', year: '2023', brandKnown: true })
  })

  it('turns visual-order Arabic into reading order', () => {
    // Visual order as a PDF stores it: number and unit swapped, letters reversed.
    expect(visualToLogical('kW 310 :كرحملا').text).toBe('المحرك: 310 kW')
  })

  it('detects file kinds by content', async () => {
    const blob = (f: string, name: string) => Object.assign(new Blob([bytes(f)]), { name })
    expect((await detectKind(blob('a-brochure-bilingual.pdf', 'x.bin')))?.kind).toBe('pdf')
    expect((await detectKind(blob('c-summary.docx', 'c.docx')))?.kind).toBe('docx')
    expect((await detectKind(blob('d-spec-sheet.xlsx', 'd.xlsx')))?.kind).toBe('spreadsheet')
    expect((await detectKind(blob('car-photo.png', 'p.png')))?.kind).toBe('image')
    expect(await detectKind(Object.assign(new Blob(['hello']), { name: 'notes.txt' }))).toBeNull()
  })
})
