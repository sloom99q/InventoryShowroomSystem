// Arabic follows the showroom's PDFs: only the brochure prints Arabic values, and only
// for its spec fields and lists. An Arabic value is the English one translated; when
// nobody typed it, the brochure prints a mechanical translation (numbers and units)
// or, if the text can't be translated that way, the English value as it is.
import { FIELDS } from './index'

/** Field and list keys whose Arabic value the brochure prints. */
export const ARABIC_KEYS = new Set(FIELDS.sections.flatMap((s) => [
  ...(s.fields ?? []).filter((f) => f.in_brochure !== false).map((f) => f.key),
  ...(s.list ? [s.list] : []),
]))

export const printsArabic = (key: string) => ARABIC_KEYS.has(key)

// Longest first, so "km/h" wins over "km" and "L/100 km" over "L".
const TERMS: [RegExp, string][] = ([
  ['L/100\\s?km', 'لتر لكل 100 كم'],
  ['kWh/100\\s?km', 'كيلوواط ساعة لكل 100 كم'],
  ['km/h', 'كم/ساعة'],
  ['kWh', 'كيلوواط ساعة'],
  ['kW', 'كيلوواط'],
  ['hp', 'حصان'],
  ['ps', 'حصان'],
  ['Nm', 'نيوتن متر'],
  ['km', 'كم'],
  ['mm', 'ملم'],
  ['kg', 'كغ'],
  ['liters?', 'لتر'],
  ['litres?', 'لتر'],
  ['l', 'لتر'],
  ['seconds?', 'ثانية'],
  ['secs?', 'ثانية'],
  ['s', 'ثانية'],
  ['inch(?:es)?', 'بوصة'],
  ['approximately', 'حوالي'],
  ['approx\\.?', 'حوالي'],
  ['about', 'حوالي'],
  ['up to', 'يصل إلى'],
  ['seats', 'مقاعد'],
  ['seater', 'مقاعد'],
] as [string, string][]).map(([en, ar]) => [new RegExp(`(?<![\\p{L}])${en}(?![\\p{L}])`, 'giu'), ar])

/**
 * The Arabic of a value made only of numbers, units and a few fixed words
 * ("Approximately 5.1 seconds" → "حوالي 5.1 ثانية"). Codes in capitals (WLTP, AWD)
 * stay as they are. Returns null when any other word is left: that needs a person.
 */
export function autoArabic(en: string | null | undefined): string | null {
  let s = (en ?? '').trim()
  if (!s) return null
  // "21-inch" → "21 inch"
  s = s.replace(/(\d)-(?=\p{L})/gu, '$1 ')
  for (const [re, ar] of TERMS) s = s.replace(re, ar)
  s = s.replace(/(\d)(?=\p{Script=Arabic})/gu, '$1 ')
  const left = s.match(/\p{Script=Latin}+/gu) ?? []
  if (left.some((w) => w !== w.toUpperCase() || w.length < 2)) return null
  return s === en ? null : s
}

/** What the brochure prints on the Arabic side for this value. */
export function arabicFor(en: string | null | undefined, ar: string | null | undefined): string {
  return ar?.trim() || autoArabic(en) || (en ?? '').trim()
}
