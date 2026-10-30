// Review-screen logic, kept free of React so it can be unit-tested.
import type { CoreField, Extraction, ImageCandidate, MergedFact, SourceRef } from '@/lib/extract/types'
import { checkChassis, normalizeChassis } from '@/lib/vin'

export type SessionFile = {
  key: string
  file: File
  kind: Extraction['kind'] | null
  mime: string
  ext: string
  status: 'reading' | 'ready' | 'error' | 'routed'
  error?: string
  extraction?: Extraction
  images: ImageCandidate[]
}

/** Fields the review screen can fill on the vehicle. */
export const EDITABLE: Exclude<CoreField, 'vehicle_name' | 'document_date'>[] = [
  'chassis_number', 'brand', 'model', 'year', 'trim_level', 'exterior_color', 'interior_color', 'mileage_km', 'listing_price',
]
export type EditableField = (typeof EDITABLE)[number]

export type FieldCandidate = {
  value: string
  sources: SourceRef[]
  /** Derived (e.g. brand/model split of a document title) rather than written in a labelled field. */
  suggested: boolean
  raw: string
  /** Value can't be stored in this field as-is (e.g. "TBA" for a price). */
  invalid: boolean
}

export type FieldChoice =
  | { kind: 'candidate'; index: number }
  | { kind: 'custom'; text: string }
  | { kind: 'keep' }
  | null

/** Turn a document value into what the database column accepts, or null if it can't be. */
export function coerce(field: EditableField, value: string): string | null {
  const v = value.trim()
  if (!v) return null
  switch (field) {
    case 'year': {
      // A full date is a document date, never a model year.
      if (/\d{1,4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,4}/.test(v)) return null
      const m = v.match(/\b(19|20)\d{2}\b/)
      return m ? m[0] : null
    }
    case 'mileage_km': {
      const digits = v.replace(/[,\s.]/g, '').match(/^\d+/)
      return digits ? String(Number(digits[0])) : null
    }
    case 'listing_price': {
      const n = v.replace(/[^\d.,]/g, '').replace(/,/g, '')
      return /^\d+(\.\d{1,2})?$/.test(n) ? Number(n).toFixed(2) : null
    }
    case 'chassis_number':
      return checkChassis(v).errors.length ? null : v
    default:
      return v.slice(0, 120)
  }
}

function same(field: EditableField, a: string, b: string) {
  if (field === 'chassis_number') return normalizeChassis(a) === normalizeChassis(b)
  const ca = coerce(field, a)
  const cb = coerce(field, b)
  if (ca !== null && cb !== null) return ca.toLowerCase() === cb.toLowerCase()
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export type NameSuggestion = { brand: string | null; model: string | null; year: string | number | null; brandKnown: boolean }

/**
 * Candidate values per vehicle field: labelled facts first, then suggestions
 * derived from document titles. Equal values are merged with all their sources.
 */
export function buildCandidates(
  merged: MergedFact[],
  titles: { name: string; source: SourceRef }[],
  split: (name: string) => NameSuggestion,
): Record<EditableField, FieldCandidate[]> {
  const out = Object.fromEntries(EDITABLE.map((f) => [f, [] as FieldCandidate[]])) as Record<EditableField, FieldCandidate[]>
  const push = (field: EditableField, value: string, sources: SourceRef[], suggested: boolean, raw: string) => {
    const list = out[field]
    const hit = list.find((c) => same(field, c.value, value))
    if (hit) {
      for (const s of sources) if (!hit.sources.some((x) => x.fileKey === s.fileKey && x.page === s.page)) hit.sources.push(s)
      hit.suggested &&= suggested
      return
    }
    list.push({ value: value.trim(), sources: [...sources], suggested, raw, invalid: coerce(field, value) === null })
  }
  for (const m of merged) {
    if (!m.core || !(EDITABLE as string[]).includes(m.core)) continue
    for (const v of m.values) push(m.core as EditableField, v.value, v.sources, false, v.raw)
  }
  const names = [...titles]
  for (const m of merged) if (m.core === 'vehicle_name') for (const v of m.values) for (const s of v.sources) names.push({ name: v.value, source: s })
  for (const n of names) {
    const s = split(n.name)
    if (s.brand) push('brand', s.brand, [n.source], true, n.name)
    if (s.model) push('model', s.model, [n.source], true, n.name)
    if (s.year) push('year', String(s.year), [n.source], true, n.name)
  }
  return out
}

/** Starting choice for a field. Conflicts and pure suggestions are never pre-selected. */
export function defaultChoice(field: EditableField, cands: FieldCandidate[], current: string | null, isNew: boolean): FieldChoice {
  const stated = cands.filter((c) => !c.suggested && !c.invalid)
  const hasCurrent = !isNew && current !== null && current !== ''
  if (field === 'chassis_number' && !isNew) return { kind: 'keep' }
  if (stated.length === 1 && cands.filter((c) => !c.suggested).length === 1) {
    if (hasCurrent && !same(field, stated[0].value, current!)) return null
    return { kind: 'candidate', index: cands.indexOf(stated[0]) }
  }
  if (cands.filter((c) => !c.suggested).length > 1) return null
  return { kind: 'keep' }
}

/** A field needs a decision when documents disagree with each other or with what's saved. */
export function needsDecision(field: EditableField, cands: FieldCandidate[], current: string | null, isNew: boolean) {
  const stated = cands.filter((c) => !c.suggested)
  if (stated.length > 1) return true
  if (!isNew && stated.length === 1 && current && !same(field, stated[0].value, current)) return true
  return false
}

export function chosenValue(field: EditableField, choice: FieldChoice, cands: FieldCandidate[]): string | null {
  if (!choice || choice.kind === 'keep') return null
  const raw = choice.kind === 'candidate' ? cands[choice.index]?.value ?? '' : choice.text
  return coerce(field, raw)
}

export type SpecDecision = { include: boolean | null; valueIndex: number; custom: string | null; unit: string | null }

export function defaultSpecDecision(m: MergedFact): SpecDecision {
  return m.conflict
    ? { include: null, valueIndex: -1, custom: null, unit: null }
    : { include: true, valueIndex: 0, custom: null, unit: m.values[0]?.unit ?? null }
}

/** Facts shown as specifications (everything not used as a vehicle field). */
export function specFacts(merged: MergedFact[]) {
  return merged.filter((m) => !m.core || m.core === 'document_date')
}

export function groupBySection<T extends { section: string | null }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = r.section ?? ''
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return [...map.entries()]
}
