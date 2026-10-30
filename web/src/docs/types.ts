// What the app passes to the two document templates. Same shape as
// kit/sample/sample-data.json (the kit is the specification).
export type Bi = { en?: string; ar?: string }

export type DocData = {
  /** yyyy-mm-dd; the export date. */
  doc_date: string
  identity: {
    brand: string
    model: string
    year: string
    trim?: string
    description?: string
    regional_specs?: Bi
    listing_price?: number | null
    currency?: string
  }
  /** fields.json keys → { en, ar }. */
  values: Record<string, Bi>
  lists: {
    drive_modes?: Bi[]
    interior_features?: Bi[]
    smart_features?: Bi[]
    key_features?: string[]
  }
  /** Paths inside the compiler's virtual file system (the renderer maps the bytes). */
  photos?: { cover?: string | null; pages?: string[] }
  company?: {
    banner?: string | null
    watermark?: string | null
    signature?: string
    legal_name?: string
    disclaimer?: string
    cover_title_color?: string
  }
}

export type RenderResult = {
  pdf: Uint8Array
  pages: number
  /** Layout problems found while rendering (spec sheet longer than a page, a brochure slide that overflows). */
  problems: { code: 'specsheet_overflow' | 'brochure_slide_overflow'; slide?: number }[]
}
