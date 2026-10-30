// Contract between the extraction engine (src/lib/extract/*) and the import
// review UI. Nothing here is specific to any brand, model or document.
import type { Candidate } from '@/lib/vin'

/** Where a value came from. page is 1-based for PDFs; null for DOCX/sheets/images. */
export type SourceRef = { fileKey: string; page: number | null }

/** Vehicle fields a fact can fill. vehicle_name is the title, split into brand/model later. */
export type CoreField =
  | 'chassis_number' | 'vehicle_name' | 'brand' | 'model' | 'year' | 'trim_level'
  | 'exterior_color' | 'interior_color' | 'mileage_km' | 'listing_price' | 'document_date'

export type Fact = {
  section: string | null
  /** Label as written (NFKC-normalised). For list items without a label, the item text. */
  label: string
  /** Same label in the other language when a bilingual layout pairs them (e.g. Arabic beside English). */
  labelAlt: string | null
  value: string
  unit: string | null
  /** The same value as written in the other language column, when it differs (e.g. a colour name in Arabic). */
  valueAlt?: string | null
  /** 'value' = label/value pair (conflicts possible); 'item' = list entry such as a feature (no conflicts). */
  kind: 'value' | 'item'
  core: CoreField | null
  source: SourceRef
  /** Exact source line(s). */
  raw: string
}

export type FileKind = 'pdf' | 'docx' | 'spreadsheet' | 'image'

/** Result of reading one file. Produced without any network or OCR. */
export type Extraction = {
  kind: FileKind
  /** Text per page (PDF) or a single entry (DOCX/sheet), already layout-ordered, for documents.extracted_text. */
  pages: string[]
  /** False when nothing readable (scan, photo, image-only PDF). */
  hasText: boolean
  facts: Fact[]
  /** Readable lines that are not facts or headings; kept so nothing is lost. */
  unstructured: { text: string; page: number | null }[]
  /** Most prominent text on the first page / title paragraph; a suggestion only. */
  title: string | null
  chassisCandidates: Candidate[]
  /** 1-based PDF pages with no meaningful text (likely photos). */
  imageOnlyPages: number[]
  /** Set when a spreadsheet is a multi-vehicle inventory list rather than one car's spec sheet. */
  inventorySheet: { rows: number } | null
}

/** A picture that could become a vehicle photo (browser only). */
export type ImageCandidate = {
  id: string
  fileKey: string
  page: number | null
  blob: Blob
  width: number
  height: number
  origin: 'embedded' | 'page' | 'file'
}

/** Facts from all files, grouped by what they describe. */
export type MergedFact = {
  id: string
  section: string | null
  label: string
  labelAlt: string | null
  kind: 'value' | 'item'
  core: CoreField | null
  /** One entry per distinct value; more than one entry for a 'value' fact = conflict. */
  values: { value: string; unit: string | null; valueAlt?: string | null; sources: SourceRef[]; raw: string }[]
  conflict: boolean
}
