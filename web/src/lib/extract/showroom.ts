// Dedicated readers for the showroom's own two documents (kit/README.md §6):
// the A4 spec sheet and the 16:9 brochure. They put every value straight into
// the catalogue field it came from, so exporting reproduces the document.
//
// Generic: everything is driven by the catalogue (fields.json labels, section
// titles, spec-sheet rows). No brand, model or value appears here.
import type { DocData } from '@/docs/types'
import { FIELD_BY_KEY, FIELDS, matchField, normLabel, SECTION_OF } from '@/lib/fields'
import { parseTitle } from './core'
import { applyLigatureFixes } from './ligatures'
import { norm, pageLines, type Line, type TextItem } from './layout'
import type { CoreField, Fact } from './types'

export type PdfPage = { page: number; items: TextItem[]; width: number; height: number; fixes?: Map<string, string> }

const squash = (s: string) => s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}&]+/gu, '')
const ARABIC = /[؀-ۿ]/
/** Text extracted from a font without a Unicode map (e.g. "\u0000" runs) is not usable. */
const garbled = (s: string) => s.includes(String.fromCharCode(0)) || s.includes(String.fromCharCode(0xfffd))

function fact(p: Partial<Fact> & Pick<Fact, 'value'>, fileKey: string, page: number | null): Fact {
  return { section: null, label: '', labelAlt: null, unit: null, kind: 'value', core: null, source: { fileKey, page }, raw: p.value, ...p }
}

function fieldFact(key: string, en: string | null, ar: string | null, fileKey: string, page: number | null, raw: string): Fact {
  const def = FIELD_BY_KEY.get(key)
  return fact({ fieldKey: key, label: def?.label_en ?? key, labelAlt: def?.label_ar ?? null, section: SECTION_OF.get(key)?.title_en ?? null, value: en ?? '', valueAlt: ar, raw }, fileKey, page)
}

function listFact(list: string, position: number, en: string | null, ar: string | null, fileKey: string, page: number | null, raw: string): Fact {
  const section = SECTION_OF.get(list)?.title_en ?? (list === 'key_features' ? FIELDS.key_features.label_en : list)
  return fact({ listKey: list, position, kind: 'item', label: section, section, value: en ?? '', valueAlt: ar, raw }, fileKey, page)
}

function coreFact(core: CoreField, label: string, value: string, fileKey: string, page: number | null): Fact {
  return fact({ core, label, value }, fileKey, page)
}

/** Brand + model from a title: the first word is the brand (a suggestion the review lets the user change). */
function nameFacts(name: string, year: string | null, fileKey: string, page: number | null): Fact[] {
  const words = name.trim().split(/\s+/)
  const out: Fact[] = []
  if (words[0]) out.push(coreFact('brand', 'Brand', words[0], fileKey, page))
  if (words.length > 1) out.push(coreFact('model', 'Model', words.slice(1).join(' '), fileKey, page))
  if (year) out.push(coreFact('year', 'Model year', year, fileKey, page))
  return out
}

/** The same text drawn again at the same spot (shadow or outline effects) counts once. */
function dedupe(items: TextItem[]): TextItem[] {
  const seen = new Set<string>()
  return items.filter((i) => {
    const k = `${i.str}|${Math.round(i.x)}|${Math.round(i.y)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function fixed(text: string, fixes?: Map<string, string>) {
  return fixes?.size ? applyLigatureFixes(text, fixes) : text
}

// ---------------------------------------------------------------------------
// Embedded vehicle data (the app's own exports carry their data as data.json)
// ---------------------------------------------------------------------------

export function isDocData(x: unknown): x is DocData {
  const d = x as DocData
  return !!d && typeof d === 'object' && !!d.identity && typeof d.identity === 'object' && !!d.values && typeof d.values === 'object'
}

/** Facts from the vehicle data embedded in an exported document. Exact, including Arabic. */
export function docDataFacts(d: DocData, fileKey: string): Fact[] {
  const id = d.identity
  // Brand and model are stated separately in the data: no guessing at the split.
  const out: Fact[] = []
  if (id.brand) out.push(coreFact('brand', 'Brand', id.brand, fileKey, null))
  if (id.model) out.push(coreFact('model', 'Model', id.model, fileKey, null))
  if (id.year) out.push(coreFact('year', 'Model year', String(id.year), fileKey, null))
  if (id.trim) out.push(coreFact('trim_level', 'Trim', id.trim, fileKey, null))
  if (id.listing_price !== null && id.listing_price !== undefined) out.push(coreFact('listing_price', 'Asking price', String(id.listing_price), fileKey, null))
  if (id.description) out.push(fieldFact('description', id.description, null, fileKey, null, id.description))
  if (id.regional_specs?.en || id.regional_specs?.ar) out.push(fieldFact('regional_specs', id.regional_specs.en ?? null, id.regional_specs.ar ?? null, fileKey, null, id.regional_specs.en ?? ''))
  for (const [k, v] of Object.entries(d.values ?? {})) if (v.en || v.ar) out.push(fieldFact(k, v.en ?? null, v.ar ?? null, fileKey, null, v.en ?? v.ar ?? ''))
  for (const list of ['drive_modes', 'interior_features', 'smart_features'] as const)
    (d.lists?.[list] ?? []).forEach((it, i) => out.push(listFact(list, i + 1, it.en ?? null, it.ar ?? null, fileKey, null, it.en ?? it.ar ?? '')))
  ;(d.lists?.key_features ?? []).forEach((t, i) => out.push(listFact('key_features', i + 1, t, null, fileKey, null, t)))
  return out
}

// ---------------------------------------------------------------------------
// Spec sheet (A4)
// ---------------------------------------------------------------------------

export function isSpecSheet(pages: PdfPage[]) {
  if (!pages.length || pages[0].width > pages[0].height) return false
  const t = squash(pages[0].items.map((i) => i.str).join(' '))
  return t.includes('VEHICLESPECSHEET') && t.includes('SPECIFICATIONS') && t.includes('KEYFEATURES')
}

const PRICE = /^([A-Z]{3})\s*(\d[\d,]*(?:\.\d+)?)$/
const TORQUE_TAIL = /^(.*?)\s*\/\s*(\d[\d,.]*\s*Nm)\s*$/i

export function readSpecSheet(page: PdfPage, fileKey: string): { facts: Fact[]; title: string | null } {
  const lines = pageLines(dedupe(page.items)).map((l) => ({ ...l, text: fixed(l.text, page.fixes), cells: l.cells.map((c) => fixed(c, page.fixes)) }))
  const p = page.page
  const facts: Fact[] = []
  const at = (word: string) => lines.findIndex((l) => squash(l.text).startsWith(word))

  // Title: the largest text is brand + model, the 4-digit number after it the year.
  const big = lines.filter((l) => l.fontSize && !/^DATE/i.test(l.text)).sort((a, b) => b.fontSize! - a.fontSize!)[0]
  let title: string | null = null
  if (big) {
    const { name, year } = parseTitle(norm(big.text))
    title = norm(big.text)
    facts.push(...nameFacts(name, year, fileKey, p))
    // Subtitle: the line just below the title. "description · trim".
    const below = lines.filter((l) => l.y !== null && big.y !== null && l.y < big.y && big.y - l.y < big.fontSize! * 1.2)
      .sort((a, b) => b.y! - a.y!)[0]
    if (below && !PRICE.test(below.text) && !squash(below.text).startsWith('PRICE')) {
      const parts = below.text.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean)
      if (parts.length) facts.push(coreFact('trim_level', 'Trim', parts[parts.length - 1], fileKey, p))
      if (parts.length > 1) facts.push(fieldFact('description', parts.slice(0, -1).join(' · '), null, fileKey, p, below.text))
    }
  }

  // Price: a currency code and an amount, e.g. "AED 1,000".
  for (const l of lines) {
    const cell = l.cells.map((c) => c.trim()).find((c) => PRICE.test(c))
    if (cell) {
      facts.push(coreFact('listing_price', 'Asking price', cell, fileKey, p))
      break
    }
  }

  // Specification rows: English label → field through spec_sheet_rows; the Arabic column is a label only.
  const specAt = at('SPECIFICATIONS')
  const keyAt = at('KEYFEATURES')
  const rowFor = new Map<string, (typeof FIELDS.spec_sheet_rows)[number]>()
  for (const r of FIELDS.spec_sheet_rows) {
    rowFor.set(normLabel(r.label_en), r)
    if (r.label_if) rowFor.set(normLabel(r.label_if.label_en), r)
  }
  if (specAt >= 0) {
    for (const l of lines.slice(specAt + 1, keyAt >= 0 ? keyAt : undefined)) {
      const cells = l.cells.map((c) => c.trim()).filter((c) => c && !(ARABIC.test(c) && !/[A-Za-z]/.test(c)))
      if (cells.length < 2) continue
      const row = rowFor.get(normLabel(cells[0]))
      if (!row) {
        facts.push(fact({ label: cells[0], value: cells.slice(1).join(' '), section: 'SPECIFICATIONS' }, fileKey, p))
        continue
      }
      let value = cells.slice(1).join(' ')
      if (row.append) {
        const m = value.match(TORQUE_TAIL)
        if (m && row.append === 'max_torque') {
          facts.push(fieldFact(row.append, m[2].trim(), null, fileKey, p, value))
          value = m[1].trim()
        }
      }
      facts.push(fieldFact(row.value, value, null, fileKey, p, l.text))
    }
  }

  // Key features: two columns, column-major (left top→bottom, then right).
  if (keyAt >= 0) {
    const rows: Line[] = []
    let prevY = lines[keyAt].y ?? 0
    for (const l of lines.slice(keyAt + 1)) {
      const gap = prevY - (l.y ?? prevY)
      if (rows.length && gap > 25) break
      if (!rows.length && gap > 40) break
      rows.push(l)
      prevY = l.y ?? prevY
    }
    const clean = (c: string) => c.replace(/^[\s✓✔☑•]+/u, '').trim()
    const left = rows.map((r) => clean(r.cells[0] ?? '')).filter(Boolean)
    const right = rows.map((r) => clean(r.cells.slice(1).join(' '))).filter(Boolean)
    ;[...left, ...right].forEach((t, i) => facts.push(listFact('key_features', i + 1, t, null, fileKey, p, t)))
  }
  return { facts, title }
}

// ---------------------------------------------------------------------------
// Brochure (16:9)
// ---------------------------------------------------------------------------

const SECTIONS = FIELDS.sections.map((s) => ({ ...s, sq: squash(s.title_en) }))
const sectionOfHeading = (text: string) => SECTIONS.find((s) => s.sq === squash(text)) ?? null

export function isBrochure(pages: PdfPage[]) {
  const wide = pages.length > 1 && pages.every((p) => Math.abs(p.width / p.height - 16 / 9) < 0.05)
  if (!wide) return false
  return pages.some((p) => {
    const lines = pageLines(p.items.filter((i) => i.x < p.width / 2))
    return lines.filter((l) => sectionOfHeading(l.text)).length >= 2
  })
}

type Bullet = { text: string; garbled: boolean; page: number }

/** Bullets per section for one column of the spec slides. Lines without a bullet continue the previous one. */
function columnBullets(lines: Line[], page: number, rtl: boolean, into: Map<string, Bullet[]>, current: { key: string | null }) {
  for (const l of lines) {
    if ((l.fontSize ?? 0) >= 30) continue // the slide title
    const sec = sectionOfHeading(l.text)
    if (sec) {
      current.key = sec.key
      if (!into.has(sec.key)) into.set(sec.key, [])
      continue
    }
    if (!current.key) continue
    let t = l.text.trim()
    if (!t) continue
    const bulletAt = rtl ? /\s*[•●▪]\s*$/ : /^\s*[•●▪]\s*/
    const isBullet = bulletAt.test(t) || /^\s*[•●▪]\s*/.test(t)
    t = t.replace(/^\s*[•●▪]\s*/, '').replace(/\s*[•●▪]\s*$/, '').trim()
    const list = into.get(current.key)!
    if (!t) {
      if (isBullet) list.push({ text: '', garbled: false, page })
      continue
    }
    if (isBullet || !list.length) list.push({ text: t, garbled: garbled(t), page })
    else {
      const last = list[list.length - 1]
      last.text = `${last.text} ${t}`.trim()
      last.garbled ||= garbled(t)
    }
  }
}

const afterColon = (s: string) => {
  const m = s.match(/^(.*?)\s*[:：]\s*(.*)$/u)
  return m && m[2].trim() ? m[2].trim() : s.trim()
}

export function readBrochure(pages: PdfPage[], fileKey: string): { facts: Fact[]; title: string | null; photoPages: number[]; coverPage: number | null } {
  const facts: Fact[] = []
  let title: string | null = null

  // Page 1: the name on one line, the year (4 digits) on the next.
  const first = pages[0]
  if (first) {
    const lines = pageLines(dedupe(first.items)).filter((l) => l.text.trim())
    const big = lines.filter((l) => (l.fontSize ?? 0) >= 20)
    const yearLine = big.find((l) => /^\d{4}$/.test(l.text.trim()))
    const nameLine = big.find((l) => l !== yearLine && /\p{L}/u.test(l.text))
    if (nameLine) {
      const parsed = parseTitle(norm(nameLine.text))
      const year = yearLine?.text.trim() ?? parsed.year
      title = [parsed.name, year].filter(Boolean).join(' ')
      facts.push(...nameFacts(parsed.name, year, fileKey, first.page))
    }
  }

  // Spec slides: English column left, Arabic column right, grouped by section.
  const en = new Map<string, Bullet[]>()
  const ar = new Map<string, Bullet[]>()
  const curEn = { key: null as string | null }
  const curAr = { key: null as string | null }
  const textPages = pages.filter((p) => p.items.some((i) => i.str.trim()))
  for (const p of textPages.slice(1)) {
    const mid = p.width / 2
    const fix = (ls: Line[]) => ls.map((l) => ({ ...l, text: fixed(l.text, p.fixes) }))
    const items = dedupe(p.items)
    columnBullets(fix(pageLines(items.filter((i) => i.x < mid))), p.page, false, en, curEn)
    columnBullets(fix(pageLines(items.filter((i) => i.x >= mid))), p.page, true, ar, curAr)
  }

  for (const s of FIELDS.sections) {
    const E = (en.get(s.key) ?? []).filter((b) => b.text)
    const A = (ar.get(s.key) ?? []).filter((b) => b.text || b.garbled)
    const arText = (i: number) => (A[i] && !A[i].garbled ? A[i].text : null)
    let pos = 0
    const listItem = (enText: string | null, arValue: string | null, page: number, raw: string) => {
      if (s.list) facts.push(listFact(s.list, ++pos, enText, arValue, fileKey, page, raw))
    }
    if (s.key === 'drive_modes' && s.list) {
      // One bullet, modes separated by "/". Pair the Arabic modes by position.
      const modes = (E[0]?.text ?? '').split('/').map((x) => x.trim()).filter(Boolean)
      const arModes = (arText(0) ?? '').replace(/[.。]\s*$/, '').split('/').map((x) => x.trim()).filter(Boolean)
      const n = Math.max(modes.length, arModes.length)
      for (let i = 0; i < n; i++) listItem(modes[i] ?? null, arModes[i] ?? null, E[0]?.page ?? 1, modes[i] ?? arModes[i])
      continue
    }
    E.forEach((b, i) => {
      const m = b.text.match(/^(.*?)\s*[:：]\s*(.+)$/u)
      const key = m ? matchField(m[1]) : null
      const a = arText(i)
      if (m && key && SECTION_OF.has(key)) {
        facts.push(fieldFact(key, m[2].trim(), a ? afterColon(a) : null, fileKey, b.page, b.text))
      } else if (s.list) {
        listItem(b.text, a ? afterColon(a) : null, b.page, b.text)
      } else {
        facts.push(fact({ label: m ? m[1].trim() : s.title_en, value: m ? m[2].trim() : b.text, labelAlt: null, valueAlt: a, section: s.title_en }, fileKey, b.page))
      }
    })
    // Extra Arabic bullets (more Arabic than English): kept as Arabic-only list items.
    for (let i = E.length; i < A.length; i++) {
      const a = arText(i)
      if (a && s.list) listItem(null, afterColon(a), A[i].page, a)
    }
  }

  // Pictures: page 1's picture is the cover; text-less pages are photo pages.
  const photoPages = pages.filter((p) => !p.items.some((i) => i.str.trim())).map((p) => p.page)
  return { facts, title, photoPages: [1, ...photoPages.filter((n) => n !== 1)], coverPage: pages.length ? 1 : null }
}
