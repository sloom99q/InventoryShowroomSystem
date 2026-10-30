// Generic mapping of document labels onto vehicle fields, plus value/unit and
// date handling. Only LABEL words and UNITS live here — never brands, models,
// trims or values.
import type { CoreField } from './types'
import { norm } from './layout'

/** Lower-case, NFKC, no punctuation, Arabic letter variants unified. */
export function normLabel(s: string): string {
  return norm(s)
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْ]/g, '') // harakat
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SYNONYMS: Record<Exclude<CoreField, 'vehicle_name'>, string[]> = {
  chassis_number: [
    'vin', 'v i n', 'vin number', 'vin no', 'chassis', 'chassis no', 'chassis number', 'chassis #', 'frame', 'frame no',
    'frame number', 'vehicle identification number', 'رقم الشاصي', 'الشاصي', 'رقم الهيكل', 'رقم القاعده',
  ],
  brand: ['make', 'brand', 'manufacturer', 'marque', 'الماركه', 'الصانع', 'الشركه المصنعه', 'العلامه التجاريه', 'الشركه'],
  model: ['model', 'model name', 'vehicle model', 'الموديل', 'الطراز', 'اسم الموديل'],
  year: ['model year', 'year', 'year of manufacture', 'manufacturing year', 'سنه الصنع', 'سنه الموديل', 'سنه التصنيع', 'السنه'],
  trim_level: ['trim', 'trim level', 'grade', 'variant', 'version', 'edition', 'الفئه', 'الطراز الفرعي', 'النسخه', 'الاصدار'],
  exterior_color: [
    'exterior colour', 'exterior color', 'colour', 'color', 'body colour', 'body color', 'paint', 'اللون', 'اللون الخارجي', 'لون الهيكل',
  ],
  interior_color: ['interior colour', 'interior color', 'interior', 'upholstery', 'trim colour', 'اللون الداخلي', 'الفرش', 'لون المقصوره'],
  mileage_km: ['mileage', 'odometer', 'km driven', 'kilometres', 'kilometers', 'distance driven', 'الممشي', 'عداد المسافه', 'المسافه المقطوعه'],
  listing_price: [
    'price', 'asking price', 'retail price', 'selling price', 'list price', 'msrp', 'price aed', 'price incl vat', 'السعر', 'سعر البيع',
    'السعر المطلوب', 'سعر التجزئه',
  ],
  document_date: ['date', 'document date', 'issue date', 'date of issue', 'issued', 'التاريخ', 'تاريخ الاصدار', 'تاريخ المستند'],
}

const INDEX = new Map<string, CoreField>()
for (const [field, words] of Object.entries(SYNONYMS)) for (const w of words) INDEX.set(normLabel(w), field as CoreField)

/** The field a label names, ignoring its value. */
export function labelField(label: string): CoreField | null {
  return INDEX.get(normLabel(label)) ?? null
}

/** A day-month-year or year-month-day date (not a bare year). */
export const FULL_DATE = /\b(\d{1,2}[/.-]\d{1,2}[/.-](\d{2}|\d{4})|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}\s+\p{L}{3,}\.?\s+\d{4})\b/u
const YEAR = /^(19|20)\d{2}$/

/** Core field for a label/value pair, applying the year/date rules. */
export function coreFor(label: string, value: string): CoreField | null {
  const f = INDEX.get(normLabel(label)) ?? null
  if (!f) return null
  const v = norm(value)
  if (f === 'year') {
    if (FULL_DATE.test(v)) return 'document_date'
    return YEAR.test(v.replace(/\s/g, '')) ? 'year' : null
  }
  if (f === 'document_date') return FULL_DATE.test(v) || /\d/.test(v) ? 'document_date' : null
  if (f === 'mileage_km' || f === 'listing_price') return /\d/.test(v) ? f : null
  return f
}

const UNITS = [
  'km/h', 'kmh', 'mph', 'kwh/100km', 'kwh', 'kw', 'hp', 'bhp', 'ps', 'nm', 'mm', 'cm', 'm', 'km', 'kg', 't', 'l', 'litre', 'liter', 'litres',
  'liters', 'cc', 's', 'sec', 'seconds', '%', 'inch', 'inches', 'in', '"', 'v', 'a', 'ah', 'w', 'kw·h', 'mah', 'gb', 'min', 'h', 'hrs',
  'كم', 'كم/س', 'كم/ساعه', 'كم/ساعة', 'ث', 'ثانيه', 'ثانية', 'كغ', 'كجم', 'كلغ', 'ملم', 'مم', 'سم', 'لتر', 'حصان', 'نيوتن متر', 'بوصه', 'بوصة',
  'انش', 'إنش', 'كيلوواط', 'كيلوواط ساعه', 'كيلوواط ساعة', 'فولت', 'دقيقه', 'دقيقة', 'ساعه', 'ساعة',
]
const CURRENCIES = ['aed', 'usd', 'eur', 'gbp', 'sar', 'qar', 'kwd', 'omr', 'bhd', 'cny', 'rmb', 'jpy', 'درهم', 'د.إ', 'دإ', 'ريال', 'دولار', 'يورو']
const UNIT_SET = new Set(UNITS.map((u) => u.toLowerCase()))
const CUR_SET = new Set(CURRENCIES.map((c) => c.toLowerCase()))
const NUM = '[+-]?\\d[\\d,]*(?:\\.\\d+)?'

/** "100 km" → { value: "100", unit: "km" }; "AED 1,000" → { value: "1,000", unit: "AED" }. */
export function splitUnit(value: string): { value: string; unit: string | null } {
  const v = norm(value)
  let m = v.match(new RegExp(`^(${NUM})\\s*(.{1,14})$`, 'u'))
  if (m && (UNIT_SET.has(m[2].toLowerCase()) || CUR_SET.has(m[2].toLowerCase()))) return { value: m[1], unit: m[2] }
  m = v.match(new RegExp(`^(.{1,6}?)\\s*(${NUM})$`, 'u'))
  if (m && CUR_SET.has(m[1].toLowerCase())) return { value: m[2], unit: m[1] }
  return { value: v, unit: null }
}

// Arabic and alternative spellings of the same unit, for comparison only.
const UNIT_CANON: Record<string, string> = {
  كم: 'km', 'كم/س': 'km/h', 'كم/ساعه': 'km/h', kmh: 'km/h', ث: 's', ثانيه: 's', sec: 's', seconds: 's', كغ: 'kg', كجم: 'kg', كلغ: 'kg',
  ملم: 'mm', مم: 'mm', سم: 'cm', لتر: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', حصان: 'hp', بوصه: 'inch', انش: 'inch',
  inches: 'inch', in: 'inch', '"': 'inch', كيلوواط: 'kw', 'كيلوواط ساعه': 'kwh', درهم: 'aed', 'د.إ': 'aed', دا: 'aed', 'د إ': 'aed',
}

export function canonUnit(unit: string | null): string | null {
  if (!unit) return null
  const u = normLabel(unit)
  return UNIT_CANON[u] ?? UNIT_CANON[norm(unit).toLowerCase()] ?? u
}

/** Value used to decide whether two values are "the same". */
export function normValue(value: string, unit: string | null): string {
  const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
  const v = digits(normLabel(value)).replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/\s+/g, '')
  return unit ? `${v}|${canonUnit(unit)}` : v
}

/** The numbers in a value, for pairing English and Arabic versions of the same fact. */
export function numbersOf(s: string): string[] {
  return (norm(s).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''))
}

// Words that make a heading a document title rather than a vehicle name.
const DOC_WORDS = new Set(
  [
    'technical', 'specification', 'specifications', 'spec', 'specs', 'sheet', 'data', 'datasheet', 'brochure', 'catalogue', 'catalog',
    'price', 'list', 'pricelist', 'summary', 'overview', 'details', 'vehicle', 'information', 'info', 'features', 'equipment', 'quotation',
    'quote', 'invoice', 'report', 'inspection', 'certificate', 'document', 'and', 'of', 'the', 'مواصفات', 'المواصفات', 'الفنيه', 'فنيه',
    'كتيب', 'قائمه', 'الاسعار', 'اسعار', 'ملخص', 'معلومات', 'السياره', 'سياره', 'المميزات', 'عرض', 'سعر', 'فاتوره', 'تقرير', 'شهاده', 'و',
  ].map((w) => normLabel(w)),
)

/** True when a heading is only document vocabulary ("Technical specifications"), not a vehicle name. */
export function isDocumentHeading(title: string): boolean {
  const ws = normLabel(title).split(' ').filter(Boolean)
  return ws.length > 0 && ws.every((w) => DOC_WORDS.has(w))
}

/** Split a title such as "<name> 2024" or "2024 <name>" into the name and its model year. */
export function parseTitle(title: string): { name: string; year: string | null } {
  const t = norm(title)
  let m = t.match(/^(.+?)[\s,–—-]+((?:19|20)\d{2})$/)
  if (m) return { name: m[1].trim(), year: m[2] }
  m = t.match(/^((?:19|20)\d{2})[\s,–—-]+(.+)$/)
  if (m) return { name: m[2].trim(), year: m[1] }
  return { name: t, year: null }
}

/**
 * Suggest brand / model from a vehicle name. The brand is the longest known
 * brand at the start of the name; unknown brands fall back to the first word
 * (marked brandKnown=false so the UI asks the user to confirm).
 */
export function suggestName(title: string, knownBrands: string[]): { brand: string | null; model: string | null; year: string | null; brandKnown: boolean } {
  const { name, year } = parseTitle(title)
  if (!name) return { brand: null, model: null, year, brandKnown: false }
  const lower = name.toLowerCase()
  const known = knownBrands
    .map((b) => norm(b))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((b) => lower === b.toLowerCase() || lower.startsWith(b.toLowerCase() + ' '))
  if (known) {
    const rest = name.slice(known.length).trim()
    return { brand: name.slice(0, known.length), model: rest || null, year, brandKnown: true }
  }
  const [first, ...rest] = name.split(' ')
  return { brand: first, model: rest.join(' ') || null, year, brandKnown: false }
}
