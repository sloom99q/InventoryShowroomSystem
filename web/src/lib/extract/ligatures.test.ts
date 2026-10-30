// Regression for Arabic ligatures drawn as one glyph (lam-alef etc.).
// Fixtures: Chrome "Save as PDF" of a small bilingual table in Geeza Pro (ligature
// glyphs mapped to two letters) and Arial (separate glyphs). See e2e/fixtures/f-ligatures-*.pdf.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { applyLigatureFixes, ligatureFixesFromRuns } from './ligatures'
import { extractPdf } from './pdf'

const FX = path.resolve(import.meta.dirname, '../../../e2e/fixtures')
const WORDS = ['السلامة', 'الإطلاق', 'لاسلكي', 'الألوان', 'سلام', 'وكلام', 'وعلامة']

describe('Arabic ligatures', () => {
  for (const f of ['f-ligatures-geeza.pdf', 'f-ligatures-arial.pdf']) {
    it(`reads lam-alef words in the right order (${f})`, async () => {
      const x = await extractPdf(new Uint8Array(readFileSync(path.join(FX, f))), pdfjs as never, 'f')
      const text = x.pages.join('\n')
      for (const w of WORDS) expect(text).toContain(w)
      expect(text).not.toMatch(/السالمة|اإلطالق|األلوان|سالم و/)
    })
  }

  it('turns a written-out date into the document date, not the year', async () => {
    const x = await extractPdf(new Uint8Array(readFileSync(path.join(FX, 'f-ligatures-geeza.pdf'))), pdfjs as never, 'f')
    const date = x.facts.find((f) => f.label === 'Date')
    expect(date?.core).toBe('document_date')
    expect(x.facts.some((f) => f.core === 'year')).toBe(false)
  })

  it('never rewrites a word that also appears correctly drawn', () => {
    // Visual-order glyph runs: "سلام" drawn with a ligature, and the real name "سالم" drawn letter by letter.
    const fixes = ligatureFixesFromRuns([['م', 'لا', 'س'], ['م', 'ل', 'ا', 'س']])
    expect(fixes.size).toBe(0)
    const only = ligatureFixesFromRuns([['م', 'لا', 'س']])
    expect(applyLigatureFixes('كلمة سالم هنا', only)).toBe('كلمة سلام هنا')
  })
})

describe('labels with notes in brackets', () => {
  it('maps "Mileage (km)" and "Chassis No. (VIN)" to vehicle fields', async () => {
    const { coreFor, isDocumentHeading } = await import('./core')
    expect(coreFor('Mileage (km)', '18,450')).toBe('mileage_km')
    expect(coreFor('Chassis No. (VIN)', '1GNSKCKD7PR123456')).toBe('chassis_number')
    expect(coreFor('Engine (cc)', '1998')).toBeNull()
    expect(isDocumentHeading('VEHICLE EXPORT CERTIFICATE')).toBe(true)
  })
})
