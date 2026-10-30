// Turns lines (from any file type) into facts: sections from headings,
// "Label: value" lines, list items, and table rows. Bilingual side-by-side
// columns are paired so each fact carries both languages.
import { coreFor, normValue, numbersOf, splitUnit } from './core'
import { hasArabic, norm, type Line } from './layout'
import type { Fact } from './types'

const BULLET = /^\s*(?:[•●▪■◦○◆►▶✓✔·*–—-]|\(?\d{1,2}[.)])\s+/
const COLON = /^(.{1,60}?)\s*[:：﹕]\s*(.+)$/u

export type StructureResult = {
  facts: Fact[]
  unstructured: { text: string; page: number | null }[]
}

type Meta = { stream: Line['stream']; y: number | null; page: number | null }

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length
}

function colonSplit(text: string): { label: string; value: string } | null {
  const m = text.match(COLON)
  if (!m) return null
  const label = m[1].trim()
  const value = m[2].trim()
  if (!value || !label || words(label) > 8 || /^\d+$/.test(label) || /https?$/i.test(label)) return null
  return { label, value }
}

function script(s: string): 'ar' | 'lat' | null {
  const a = (s.match(/[؀-ۿ]/g) ?? []).length
  const l = (s.match(/[A-Za-z]/g) ?? []).length
  if (!a && !l) return null
  return a > l ? 'ar' : 'lat'
}

/**
 * @param lines   lines in reading order (streams kept contiguous)
 * @param fileKey for SourceRef
 */
export function structure(lines: Line[], fileKey: string): StructureResult {
  const facts: Fact[] = []
  const meta = new Map<Fact, Meta>()
  const unstructured: StructureResult['unstructured'] = []
  const body = median(lines.map((l) => l.fontSize ?? 0).filter(Boolean))

  let section: string | null = null
  let sectionIndent: number | null = null
  let stream: Line['stream'] | undefined

  const push = (f: Omit<Fact, 'source' | 'core' | 'unit'> & { unit?: string | null }, line: Line) => {
    let value = f.value
    let unit = f.unit ?? null
    if (f.kind === 'value' && unit === null) ({ value, unit } = splitUnit(f.value))
    const core = f.kind === 'value' ? coreFor(f.label, f.value) ?? (f.labelAlt ? coreFor(f.labelAlt, f.value) : null) : null
    const fact: Fact = { ...f, value, unit, core, source: { fileKey, page: line.page } }
    facts.push(fact)
    meta.set(fact, { stream: line.stream, y: line.y, page: line.page })
  }

  lines.forEach((line, i) => {
    if (line.stream !== stream) {
      stream = line.stream
      section = null
      sectionIndent = null
    }
    const raw = line.text
    let text = norm(raw)
    if (!text) return
    const bullet = !!line.bullet || BULLET.test(text)
    if (BULLET.test(text)) text = text.replace(BULLET, '').trim()
    const next = lines.slice(i + 1).find((l) => l.stream === line.stream && norm(l.text))

    // Table-like row: label | value [| translated label]
    if (line.cells.length >= 2 && !line.heading) {
      const cells = line.cells.map((c) => norm(c).replace(/[:：]\s*$/, '')).filter(Boolean)
      if (cells.length >= 2) {
        let label = cells[0]
        let labelAlt: string | null = null
        let rest = cells.slice(1)
        const last = rest[rest.length - 1]
        if (rest.length >= 2 && script(last) && script(last) !== script(label) && !/\d/.test(last)) {
          labelAlt = last
          rest = rest.slice(0, -1)
        }
        // Right-to-left two-cell rows written visually as [value, label].
        if (cells.length === 2 && hasArabic(cells[1]) && !hasArabic(cells[0]) && /\d/.test(cells[0])) {
          label = cells[1]
          rest = [cells[0]]
        }
        push({ section, label, labelAlt, value: rest.join(' · '), kind: 'value', raw }, line)
        return
      }
    }

    const kv = colonSplit(text)
    if (kv) {
      push({ section, label: kv.label, labelAlt: null, value: kv.value, kind: 'value', raw }, line)
      return
    }

    const short = words(text) <= 12 && !/[.!?]$/.test(text)
    const bigger = !!(line.fontSize && body && line.fontSize > body * 1.12)
    const nextIsChild =
      !!next &&
      (!!next.bullet || BULLET.test(norm(next.text)) || !!colonSplit(norm(next.text)) || next.cells.length >= 2 ||
        (next.indent !== null && line.indent !== null && next.indent > line.indent + 3))
    if (line.heading || (!bullet && short && (bigger || (nextIsChild && words(text) <= 6 && !/\d{3,}/.test(text))))) {
      section = text
      sectionIndent = line.indent
      return
    }

    const indented = line.indent !== null && sectionIndent !== null && line.indent > sectionIndent + 3
    if ((bullet || (section && (indented || line.rtl))) && words(text) <= 20) {
      push({ section, label: section ?? '', labelAlt: null, value: text, kind: 'item', raw }, line)
      return
    }

    unstructured.push({ text, page: line.page })
  })

  const merged = pairBilingual(facts, meta)
  return { facts: facts.filter((f) => !merged.has(f)), unstructured }
}

/**
 * In two-column bilingual pages, attach each Arabic-column fact to its
 * Latin-column twin (same core field, same numbers, or same line) so the
 * fact appears once with both languages.
 */
function pairBilingual(facts: Fact[], meta: Map<Fact, Meta>): Set<Fact> {
  const merged = new Set<Fact>()
  const pages = new Set(facts.map((f) => meta.get(f)?.page))
  for (const page of pages) {
    const onPage = facts.filter((f) => meta.get(f)?.page === page)
    const left = onPage.filter((f) => meta.get(f)?.stream === 'left')
    const right = onPage.filter((f) => meta.get(f)?.stream === 'right')
    if (!left.length || !right.length) continue
    const leftAr = left.filter((f) => hasArabic(f.label + f.value)).length > left.length / 2
    const [lat, ar] = leftAr ? [right, left] : [left, right]
    const free = new Set(lat)
    const take = (pred: (l: Fact) => boolean, a: Fact) => {
      const cands = [...free].filter((l) => l.kind === a.kind && pred(l))
      if (!cands.length) return null
      const ay = meta.get(a)?.y ?? 0
      cands.sort((x, y) => Math.abs((meta.get(x)?.y ?? 0) - ay) - Math.abs((meta.get(y)?.y ?? 0) - ay))
      return cands[0]
    }
    const sectionMap = new Map<string, string>()
    for (const a of ar) {
      const nums = numbersOf(a.value + ' ' + (a.unit ?? '')).join(' ')
      const ay = meta.get(a)?.y
      const partner =
        (a.core ? take((l) => l.core === a.core, a) : null) ??
        (nums ? take((l) => numbersOf(l.value + ' ' + (l.unit ?? '')).join(' ') === nums, a) : null) ??
        (ay !== null && ay !== undefined ? take((l) => Math.abs((meta.get(l)?.y ?? Infinity) - ay) <= 3, a) : null)
      if (!partner) continue
      free.delete(partner)
      if (a.kind === 'value') {
        partner.labelAlt = partner.labelAlt ?? a.label
        if (normValue(a.value, a.unit) !== normValue(partner.value, partner.unit)) partner.valueAlt = [a.value, a.unit].filter(Boolean).join(' ')
        if (!partner.core && a.core) partner.core = a.core
      } else {
        partner.valueAlt = a.value
      }
      if (a.section && partner.section) sectionMap.set(a.section, partner.section)
      merged.add(a)
    }
    // Unpaired Arabic facts move into the English name of their section when known.
    for (const a of ar) if (a.section && sectionMap.has(a.section) && !merged.has(a)) a.section = sectionMap.get(a.section)!
  }
  return merged
}
