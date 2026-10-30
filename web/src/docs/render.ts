// Spec sheet and brochure, rendered in the browser with Typst. The data
// rules mirror kit/templates/templates.js exactly; the layouts are in
// ./templates.ts. Fields come from the fixed catalogue (kit/fields.json).
//
// Images are passed as files: DocData.photos.cover/pages/banner and
// DocData.company.banner/banner_left/banner_text/watermark are virtual paths
// (e.g. "/photos/1.jpg") whose bytes are in `files` under the same key.
// With banner_left + banner_text + a banner (or cover) photo, the spec sheet's
// header is the layered per-car banner; otherwise company.banner is used.
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
      if (!v) return null
      // label_if: an alternative label when another field matches (e.g. a range-extender powertrain).
      if (r.label_if && new RegExp(r.label_if.pattern, 'i').test(val(data, r.label_if.field))) return { k: r.label_if.label_en, v, a: r.label_if.label_ar }
      return { k: r.label_en, v, a: r.label_ar }
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

// ---------------------------------------------------------------------------
// Layered header banner (kit bannerHTML): the company's logo side and slogans
// over THIS car's photo, darkened. Composited on a canvas exactly as the CSS
// lays it out, then placed in the template as one image.
// ---------------------------------------------------------------------------

const BANNER_W = 595.32
const BANNER_H = 114
const PX_PER_PT = 6 // ~430 dpi

/** CSS object-position ("50% 40%", keywords) → fractions; unsupported parts default to centre. */
export function parsePosition(pos?: string): [number, number] {
  const words = (pos || '50% 50%').trim().toLowerCase().split(/\s+/)
  const kw: Record<string, [number, 'x' | 'y' | 'any']> = {
    left: [0, 'x'], right: [1, 'x'], top: [0, 'y'], bottom: [1, 'y'], center: [0.5, 'any'],
  }
  let x = 0.5
  let y = 0.5
  const pct = (w: string) => (/^-?[\d.]+%$/.test(w) ? parseFloat(w) / 100 : null)
  if (words.length === 1) {
    const p = pct(words[0])
    if (p !== null) x = p
    else if (kw[words[0]]?.[1] === 'y') y = kw[words[0]][0]
    else if (kw[words[0]]) x = kw[words[0]][0]
    return [x, y]
  }
  const [a, b] = words
  const pa = pct(a)
  const pb = pct(b)
  // Keyword pairs may come in either order ("top left").
  if (kw[a]?.[1] === 'y' || kw[b]?.[1] === 'x') {
    y = pa ?? kw[a]?.[0] ?? 0.5
    x = pb ?? kw[b]?.[0] ?? 0.5
  } else {
    x = pa ?? kw[a]?.[0] ?? 0.5
    y = pb ?? kw[b]?.[0] ?? 0.5
  }
  return [x, y]
}

/** Where the banner photo is drawn inside its panel (CSS object-fit: cover + object-position + scale()). */
export function bannerPhotoRect(iw: number, ih: number, w: number, h: number, pos?: string, zoom = 1) {
  const [px, py] = parsePosition(pos)
  const s0 = Math.max(w / iw, h / ih)
  const dw = iw * s0
  const dh = ih * s0
  const x = (w - dw) * px
  const y = (h - dh) * py
  // transform: scale(z) about the transform-origin (the same position, relative to the element box)
  const ox = w * px
  const oy = h * py
  const z = zoom > 0 ? zoom : 1
  return { x: ox + z * (x - ox), y: oy + z * (y - oy), w: dw * z, h: dh * z }
}

async function bitmap(bytes: Uint8Array) {
  return createImageBitmap(new Blob([bytes.slice()]))
}

export async function composeBanner(files: Record<string, Uint8Array>, data: DocData): Promise<Uint8Array | null> {
  const c = data.company ?? {}
  const photo = data.photos?.banner || data.photos?.cover
  if (!c.banner_left || !c.banner_text || !photo || !files[c.banner_left] || !files[c.banner_text] || !files[photo]) return null
  const k = PX_PER_PT
  const W = Math.round(BANNER_W * k)
  const H = Math.round(BANNER_H * k)
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')!
  // .ph: left 47.9%, width 52.1%, height 97.1%, clip-path polygon(16.3% 0, 100% 0, 100% 100%, 0 100%)
  const pl = 0.479 * BANNER_W * k
  const pw = 0.521 * BANNER_W * k
  const ph = 0.971 * BANNER_H * k
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(pl + 0.163 * pw, 0)
  ctx.lineTo(pl + pw, 0)
  ctx.lineTo(pl + pw, ph)
  ctx.lineTo(pl, ph)
  ctx.closePath()
  ctx.clip()
  const img = await bitmap(files[photo])
  const r = bannerPhotoRect(img.width, img.height, pw, ph, data.photos?.banner_pos, Number(data.photos?.banner_zoom || 1))
  ctx.drawImage(img, pl + r.x, r.y, r.w, r.h)
  img.close()
  // .dk: rgba(8,10,12,.68) over the panel
  ctx.fillStyle = 'rgba(8,10,12,0.68)'
  ctx.fillRect(pl, 0, pw, ph)
  ctx.restore()
  // .dv: divider at left 85.67%, width 0.13%, height 74%
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.fillRect(0.8567 * W, 0, 0.0013 * W, 0.74 * H)
  // .ly layers, stretched to the banner box: slogans, then the logo side.
  for (const layer of [c.banner_text, c.banner_left]) {
    const b = await bitmap(files[layer])
    ctx.drawImage(b, 0, 0, W, H)
    b.close()
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/** The car's data (kit sample-data shape) travels inside the PDF as an attachment, without image bytes or file paths. */
function withVehicleData(files: Record<string, Uint8Array>, data: DocData) {
  const { photos: _photos, company: _company, ...vehicle } = data
  return { ...files, '/vehicle.json': new TextEncoder().encode(JSON.stringify(vehicle)) }
}

export async function renderSpecSheet(data: DocData, files: Record<string, Uint8Array> = {}, opts: RenderOptions = {}): Promise<RenderResult> {
  const fields = specSheetData(data, opts)
  const composed = typeof OffscreenCanvas !== 'undefined' ? await composeBanner(files, data) : null
  if (composed) {
    files = { ...files, '/assets/banner-composed.png': composed }
    fields.banner = '/assets/banner-composed.png'
  }
  const res = await compileWithQuery<Layout>(SPEC_SHEET, fields, withVehicleData(files, data), '<layout>')
  const pdf = fixFontMetrics(res.pdf)
  const values = res.values
  const pages = await countPages(pdf)
  const l = values.find((v) => v.doc === 'specsheet') as Extract<Layout, { doc: 'specsheet' }> | undefined
  const problems: RenderResult['problems'] = pages > 1 || (l && l.height > l.limit) ? [{ code: 'specsheet_overflow' }] : []
  return { pdf, pages, problems }
}

export async function renderBrochure(data: DocData, files: Record<string, Uint8Array> = {}): Promise<RenderResult> {
  const res = await compileWithQuery<Layout>(BROCHURE, brochureData(data), withVehicleData(files, data), '<layout>')
  const pdf = fixFontMetrics(res.pdf)
  const values = res.values
  const problems: RenderResult['problems'] = values
    .filter((v): v is Extract<Layout, { doc: 'brochure' }> => v.doc === 'brochure' && v.bottom > v.limit)
    .map((v) => ({ code: 'brochure_slide_overflow' as const, slide: v.slide }))
  return { pdf, pages: await countPages(pdf), problems }
}
