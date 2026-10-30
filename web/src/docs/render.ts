// Spec sheet and brochure, rendered in the browser with Typst. The data
// rules mirror kit/templates/templates.js exactly; the layouts are in
// ./templates.ts. Fields come from the fixed catalogue (kit/fields.json).
//
// Images are passed as files: DocData.photos.cover/pages and
// DocData.company.banner/watermark are virtual paths (e.g. "/photos/1.jpg")
// whose bytes are in `files` under the same key.
//
// Overflow: each template measures its own content with Typst's measure()
// and exposes the result as `#metadata(...) <layout>`, which is read back with
// a query. Spec sheet: content taller than the page minus the kit's 15 pt
// bottom margin. Brochure: a spec slide whose tallest column ends within
// 6 pt (8 px) of the slide bottom, like kit/templates/render.mjs.
import { compileWithQuery } from '@/pdf/engine'
import { FIELDS } from '@/lib/fields'
import { BROCHURE, SPEC_SHEET } from './templates'
import type { Bi, DocData, RenderResult } from './types'

const val = (d: DocData, key: string, lang: 'en' | 'ar' = 'en'): string => {
  const id = d.identity as Record<string, unknown>
  const v = (d.values ?? {})[key] ?? id[key]
  if (v == null) return ''
  if (typeof v === 'object') return String((v as Bi)[lang] ?? '').trim()
  return lang === 'en' ? String(v).trim() : ''
}

const fmtMoney = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtDate = (iso?: string) => {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date()
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })
}

export type RenderOptions = { currencyName?: string }

export function specSheetData(data: DocData, opts: RenderOptions = {}) {
  const id = data.identity
  const c = data.company ?? {}
  const rows = FIELDS.spec_sheet_rows
    .map((r) => {
      let v = val(data, r.value)
      if (r.append) {
        const a = val(data, r.append)
        if (a) v = v ? v + (r.joiner ?? ' ') + a : a
      }
      return v ? { k: r.label_en, v, a: r.label_ar } : null
    })
    .filter((x): x is { k: string; v: string; a: string } => !!x)
  const kf = (data.lists?.key_features ?? []).filter(Boolean).slice(0, FIELDS.key_features.max)
  const half = Math.ceil(kf.length / 2) // column-major, like the original
  const hasPrice = id.listing_price != null && (id.listing_price as unknown) !== ''
  const cur = id.currency || 'AED'
  return {
    title: [[id.brand, id.model].filter(Boolean).join(' '), id.year].filter(Boolean).join(' ') + ' spec sheet',
    banner: c.banner ?? null,
    date: fmtDate(data.doc_date),
    name: [id.brand, id.model].filter(Boolean).join(' '),
    year: id.year ?? '',
    subtitle: [id.description, id.trim].filter(Boolean).join(' · '),
    price: hasPrice ? { currency: `${opts.currencyName || 'UAE Dirhams'} (${cur})`, amount: `${cur} ${fmtMoney(Number(id.listing_price))}` } : null,
    rows,
    features: kf.length ? [kf.slice(0, half), kf.slice(half)] : [],
    signature: c.signature ?? '',
    legal: c.legal_name ?? '',
    disclaimer: c.disclaimer ?? '',
  }
}

/** Bilingual bullet sections, as brochureSections() in the kit. */
export function brochureSections(data: DocData) {
  return FIELDS.sections
    .map((s) => {
      const en: string[] = []
      const ar: string[] = []
      for (const f of s.fields ?? []) {
        if (f.in_brochure === false) continue
        const ve = val(data, f.key, 'en')
        const va = val(data, f.key, 'ar')
        if (ve) en.push(`${f.label_en}: ${ve}`)
        if (va) ar.push(`${f.label_ar}: ${va}`)
      }
      if (s.list) {
        const items = ((data.lists as Record<string, Bi[] | undefined>)?.[s.list] ?? [])
        if (s.key === 'drive_modes') {
          const e = items.map((i) => i.en).filter(Boolean)
          const a = items.map((i) => i.ar).filter(Boolean)
          if (e.length) en.push(e.join(' / '))
          if (a.length) ar.push(a.join(' / '))
        } else {
          for (const i of items) {
            if (i.en) en.push(i.en)
            if (i.ar) ar.push(i.ar)
          }
        }
      }
      return { slide: s.brochure_slide, title: s.title_en, en, ar }
    })
    .filter((s) => s.en.length || s.ar.length)
}

export function brochureData(data: DocData) {
  const id = data.identity
  const c = data.company ?? {}
  const name = [id.brand, id.model].filter(Boolean).join(' ')
  const secs = brochureSections(data)
  const slideNos = [...new Set(secs.map((s) => s.slide))].sort((a, b) => a - b)
  return {
    title: `${name} ${id.year ?? ''}`.trim(),
    name,
    year: id.year ?? '',
    cover: data.photos?.cover ?? null,
    cover_color: c.cover_title_color || '#C5E0B4',
    watermark: c.watermark ?? null,
    slides: slideNos.map((n) => secs.filter((s) => s.slide === n).map(({ title, en, ar }) => ({ title, en, ar }))),
    photos: data.photos?.pages ?? [],
  }
}

/**
 * Typst's PDF writer records each font's Ascent/Descent from the OS/2 "typo"
 * metrics; Chromium (and the kit's reference PDFs) record the hhea metrics,
 * which is what text extraction and selection boxes use. Rewrite them to the
 * hhea values (per 1000 units) in place, padding with spaces so every byte
 * offset in the file stays valid.
 */
const HHEA: [RegExp, number, number][] = [
  [/LiberationSans/, 905, -212],
  [/Carlito/, 952, -269],
  [/NotoNaskhArabic/, 1069, -634],
]
export function fixFontMetrics(pdf: Uint8Array): Uint8Array {
  const text = new TextDecoder('latin1').decode(pdf)
  const out = pdf.slice()
  const re = /\/FontName\s*\/[A-Z]{6}\+([A-Za-z-]+)[\s\S]*?\/Ascent\s+(-?[\d.]+)\s+\/Descent\s+(-?[\d.]+)/g
  for (let m; (m = re.exec(text)); ) {
    const metrics = HHEA.find(([r]) => r.test(m![1]))
    if (!metrics) continue
    const put = (value: number, old: string, at: number) => {
      const s = String(value)
      if (s.length > old.length) return
      const padded = s.padEnd(old.length, ' ')
      for (let i = 0; i < padded.length; i++) out[at + i] = padded.charCodeAt(i)
    }
    const block = m[0]
    const aAt = m.index + block.lastIndexOf(m[2], block.indexOf('/Descent'))
    const dAt = m.index + block.lastIndexOf(m[3])
    put(metrics[1], m[2], aAt)
    put(metrics[2], m[3], dAt)
  }
  return out
}

type Layout = { doc: 'specsheet'; height: number; limit: number } | { doc: 'brochure'; slide: number; bottom: number; limit: number }

async function countPages(pdf: Uint8Array) {
  // Page objects in the PDF ("/Type /Page" not followed by "s").
  const text = new TextDecoder('latin1').decode(pdf)
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

export async function renderSpecSheet(data: DocData, files: Record<string, Uint8Array> = {}, opts: RenderOptions = {}): Promise<RenderResult> {
  const res = await compileWithQuery<Layout>(SPEC_SHEET, specSheetData(data, opts), files, '<layout>')
  const pdf = fixFontMetrics(res.pdf)
  const values = res.values
  const pages = await countPages(pdf)
  const l = values.find((v) => v.doc === 'specsheet') as Extract<Layout, { doc: 'specsheet' }> | undefined
  const problems: RenderResult['problems'] = pages > 1 || (l && l.height > l.limit) ? [{ code: 'specsheet_overflow' }] : []
  return { pdf, pages, problems }
}

export async function renderBrochure(data: DocData, files: Record<string, Uint8Array> = {}): Promise<RenderResult> {
  const res = await compileWithQuery<Layout>(BROCHURE, brochureData(data), files, '<layout>')
  const pdf = fixFontMetrics(res.pdf)
  const values = res.values
  const problems: RenderResult['problems'] = values
    .filter((v): v is Extract<Layout, { doc: 'brochure' }> => v.doc === 'brochure' && v.bottom > v.limit)
    .map((v) => ({ code: 'brochure_slide_overflow' as const, slide: v.slide }))
  return { pdf, pages: await countPages(pdf), problems }
}
