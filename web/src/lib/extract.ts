// Very small label → value extractor for digital vehicle PDFs.
// Everything it returns is a suggestion that the user sees and can edit.

export type ExtractedFields = Partial<Record<'brand' | 'model' | 'year' | 'exterior_color' | 'mileage_km' | 'trim_level', string>>

const LABELS: Record<keyof ExtractedFields, RegExp> = {
  brand: /^(?:make|brand|manufacturer|الماركة|الصانع)\s*[:-]?\s*(.+)$/i,
  model: /^(?:model(?!\s*year)|الطراز|الموديل)\s*[:-]?\s*(.+)$/i,
  year: /^(?:model\s*year|year(?:\s+of\s+manufacture)?|سنة\s*الصنع)\s*[:-]?\s*(\d{4})\b/i,
  exterior_color: /^(?:(?:exterior\s+)?colou?r|اللون)\s*[:-]?\s*(.+)$/i,
  mileage_km: /^(?:mileage|odometer|kilometres|kilometers|km)\s*(?:\(km\))?\s*[:-]?\s*([\d,. ]+)/i,
  trim_level: /^(?:trim|grade|variant|specification)\s*[:-]?\s*(.+)$/i,
}

export function extractFields(pages: string[]): ExtractedFields {
  const out: ExtractedFields = {}
  for (const line of pages.join('\n').split('\n').map((l) => l.trim())) {
    for (const [k, re] of Object.entries(LABELS) as [keyof ExtractedFields, RegExp][]) {
      if (out[k]) continue
      const m = line.match(re)
      if (!m) continue
      let v = m[1].trim().replace(/\s{2,}.*$/, '')
      if (k === 'mileage_km') v = v.replace(/[^\d]/g, '')
      if (v && v.length <= 60) out[k] = v
    }
  }
  return out
}
