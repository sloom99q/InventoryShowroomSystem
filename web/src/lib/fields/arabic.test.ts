import { describe, expect, it } from 'vitest'
import { arabicFor, autoArabic, printsArabic } from './arabic'

describe('Arabic follows the PDFs', () => {
  it('is printed only for brochure fields and lists', () => {
    for (const k of ['engine', 'top_speed', 'seating', 'drive_modes', 'smart_features']) expect(printsArabic(k), k).toBe(true)
    for (const k of ['description', 'regional_specs', 'dimensions', 'wheels', 'key_features', 'brand']) expect(printsArabic(k), k).toBe(false)
  })

  it('translates numbers and units mechanically', () => {
    expect(autoArabic('210 km/h')).toBe('210 كم/ساعة')
    expect(autoArabic('640 Nm')).toBe('640 نيوتن متر')
    expect(autoArabic('Approximately 5.1 seconds')).toBe('حوالي 5.1 ثانية')
    expect(autoArabic('Up to 1,120 km (WLTP)')).toBe('يصل إلى 1,120 كم (WLTP)')
    expect(autoArabic('300 kW / 402 HP')).toBe('300 كيلوواط / 402 حصان')
    expect(autoArabic('2900mm')).toBe('2900 ملم')
    expect(autoArabic('43 kWh')).toBe('43 كيلوواط ساعة')
    expect(autoArabic('Approximately 1.2 L/100 km')).toBe('حوالي 1.2 لتر لكل 100 كم')
    expect(autoArabic('60 Liters')).toBe('60 لتر')
  })

  it('leaves anything with real words to a person (null), keeps codes', () => {
    expect(autoArabic('Single Rear Electric Motor')).toBeNull()
    expect(autoArabic('AWD (All-Wheel Drive)')).toBeNull()
    expect(autoArabic('AWD')).toBeNull() // nothing to translate: prints as is
    expect(autoArabic('')).toBeNull()
  })

  it('prints typed Arabic, else the translation, else the English as it is', () => {
    expect(arabicFor('210 km/h', 'مكتوب')).toBe('مكتوب')
    expect(arabicFor('210 km/h', null)).toBe('210 كم/ساعة')
    expect(arabicFor('MacPherson Strut', '')).toBe('MacPherson Strut')
  })
})
