// The fixed field catalogue (kit/fields.json, copied here; a test keeps them
// identical). The car page, the import mapping and both PDFs use this list.
import catalogue from './fields.json'
import synonyms from './synonyms.json'

export type FieldDef = { key: string; label_en: string; label_ar: string; in_brochure?: boolean; required?: boolean; hint?: string; type?: string }
export type SectionDef = {
  key: string
  title_en: string
  title_ar: string
  brochure_slide: number
  fields?: FieldDef[]
  list?: string
  list_hint?: string
}
export type SpecSheetRow = {
  label_en: string
  label_ar: string
  value: string
  append?: string
  joiner?: string
  /** Print alternative labels when another field matches (e.g. "Range extender" for an EREV). */
  label_if?: { field: string; pattern: string; label_en: string; label_ar: string }
}

export const FIELDS = catalogue as unknown as {
  identity: FieldDef[]
  sections: SectionDef[]
  key_features: { label_en: string; max: number; hint: string }
  spec_sheet_rows: SpecSheetRow[]
  rules: string[]
}

/** Identity fields that live as columns on `vehicles`. The others are stored like any field. */
export const VEHICLE_COLUMNS = { brand: 'brand', model: 'model', year: 'year', trim: 'trim_level', listing_price: 'listing_price' } as const
export type VehicleColumnKey = keyof typeof VEHICLE_COLUMNS

/** Lists: ordered items, each { en, ar }. key_features is English-only. */
export const LIST_KEYS = [...FIELDS.sections.filter((s) => s.list).map((s) => s.list!), 'key_features'] as const
export type ListKey = string

export const SECTION_FIELDS: FieldDef[] = FIELDS.sections.flatMap((s) => s.fields ?? [])
/** Every single-value field stored in vehicle_specs (identity extras + section fields). */
export const STORED_FIELDS: FieldDef[] = [
  ...FIELDS.identity.filter((f) => !(f.key in VEHICLE_COLUMNS)),
  ...SECTION_FIELDS,
]
export const FIELD_BY_KEY = new Map<string, FieldDef>([...FIELDS.identity, ...SECTION_FIELDS].map((f) => [f.key, f]))
export const SECTION_OF = new Map<string, SectionDef>(FIELDS.sections.flatMap((s) => [
  ...(s.fields ?? []).map((f) => [f.key, s] as const),
  ...(s.list ? [[s.list, s] as const] : []),
]))

export function isListKey(key: string | null | undefined) {
  return !!key && (LIST_KEYS as readonly string[]).includes(key)
}

// ---------------------------------------------------------------------------
// Label matching (import and migration of old rows)
// ---------------------------------------------------------------------------

export function normLabel(s: string) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}×]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A short list of alternative labels seen in showroom documents. Labels only —
 * never brands, models or values. Keep it small; unmatched facts go to "Other".
 */
export const SYNONYMS: Record<string, string[]> = synonyms

const INDEX = (() => {
  const m = new Map<string, string>()
  for (const f of [...FIELDS.identity, ...SECTION_FIELDS]) {
    m.set(normLabel(f.label_en), f.key)
    m.set(normLabel(f.label_ar), f.key)
  }
  for (const r of FIELDS.spec_sheet_rows) {
    if (!m.has(normLabel(r.label_en))) m.set(normLabel(r.label_en), r.value)
    if (!m.has(normLabel(r.label_ar))) m.set(normLabel(r.label_ar), r.value)
  }
  for (const [key, list] of Object.entries(SYNONYMS)) for (const s of list) if (!m.has(normLabel(s))) m.set(normLabel(s), key)
  return m
})()

/** Field key for a document label (English or Arabic), or null → "Other". */
export function matchField(label: string | null | undefined): string | null {
  if (!label) return null
  return INDEX.get(normLabel(label)) ?? null
}

const SECTION_INDEX = new Map<string, string>(FIELDS.sections.filter((s) => s.list).flatMap((s) => [
  [normLabel(s.title_en), s.list!], [normLabel(s.title_ar), s.list!],
  ...(s.key === 'interior' ? [[normLabel('interior features'), s.list!], [normLabel('comfort features'), s.list!], [normLabel('features'), s.list!]] as [string, string][] : []),
  ...(s.key === 'smart_driving' ? [[normLabel('driver assistance'), s.list!], [normLabel('safety'), s.list!], [normLabel('adas'), s.list!]] as [string, string][] : []),
]))
/** List a bullet belongs to, from its section heading. */
export function matchList(section: string | null | undefined): string | null {
  if (!section) return null
  return SECTION_INDEX.get(normLabel(section)) ?? null
}

/** Label shown for a stored key (fields, lists and key features). */
export function labelFor(key: string, lang: 'en' | 'ar' = 'en') {
  const f = FIELD_BY_KEY.get(key)
  if (f) return lang === 'en' ? f.label_en : f.label_ar
  const s = FIELDS.sections.find((x) => x.list === key)
  if (s) return lang === 'en' ? s.title_en : s.title_ar
  if (key === 'key_features') return FIELDS.key_features.label_en
  return key
}
