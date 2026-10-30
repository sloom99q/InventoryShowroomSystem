// Entry point for reading vehicle files in the browser, and for merging what
// several files say about one car.
import { normLabel, normValue } from './core'
import { extractDocx, docxImages } from './docx'
import { extractPdf, pdfImageCandidates } from './pdf'
import { extractSheet } from './sheet'
import type { Extraction, Fact, FileKind, ImageCandidate, MergedFact } from './types'

export type { Extraction, Fact, FileKind, ImageCandidate, MergedFact } from './types'
export { suggestName, parseTitle, splitUnit } from './core'

type PdfJs = typeof import('pdfjs-dist')

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}

/** Supported file kinds, identified by content (not by name or browser MIME). */
export async function detectKind(file: Blob & { name?: string }): Promise<{ kind: FileKind; mime: string; ext: string } | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const at = (o: number, ...xs: number[]) => xs.every((x, i) => head[o + i] === x)
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? ''
  const r = (kind: FileKind, e: string) => ({ kind, mime: MIME[e], ext: e })
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return r('pdf', 'pdf')
  if (at(0, 0xff, 0xd8, 0xff)) return r('image', 'jpg')
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return r('image', 'png')
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return r('image', 'webp')
  if (at(4, 0x66, 0x74, 0x79, 0x70) && /^(heic|heix|mif1|msf1|hevc)$/.test(String.fromCharCode(...head.slice(8, 12)))) return r('image', 'heic')
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) {
    const { unzipSync } = await import('fflate')
    const names: string[] = []
    try {
      unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => (names.push(f.name), false) })
    } catch {
      return null
    }
    if (names.includes('word/document.xml')) return r('docx', 'docx')
    if (names.includes('xl/workbook.xml')) return r('spreadsheet', 'xlsx')
    return null
  }
  // OLE2 container: only legacy Excel is supported (not .doc/.ppt).
  if (at(0, 0xd0, 0xcf, 0x11, 0xe0) && ext === 'xls') return r('spreadsheet', 'xls')
  if (ext === 'csv') {
    const sample = new Uint8Array(await file.slice(0, 4096).arrayBuffer())
    if (sample.includes(0)) return null
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, Math.max(0, sample.length - 4)))
    } catch {
      return null
    }
    return r('spreadsheet', 'csv')
  }
  return null
}

let pdfjsPromise: Promise<PdfJs> | null = null
function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })
  return pdfjsPromise
}

const EMPTY = (kind: FileKind): Extraction => ({
  kind,
  pages: [],
  hasText: false,
  facts: [],
  unstructured: [],
  title: null,
  chassisCandidates: [],
  imageOnlyPages: [],
  inventorySheet: null,
})

/** Read one file in the browser: text facts plus candidate photos. */
export async function extractFile(file: File, fileKey: string, opts: { pdfjs?: PdfJs } = {}): Promise<{ extraction: Extraction; images: ImageCandidate[] }> {
  const kind = await detectKind(file)
  if (!kind) throw new Error(`Unsupported file: ${file.name}`)
  const data = new Uint8Array(await file.arrayBuffer())
  switch (kind.kind) {
    case 'pdf': {
      const pdfjs = opts.pdfjs ?? (await loadPdfjs())
      const extraction = await extractPdf(data, pdfjs, fileKey)
      let images: ImageCandidate[] = []
      try {
        images = await pdfImageCandidates(data, pdfjs, fileKey, extraction.imageOnlyPages)
      } catch {
        /* pictures are optional; text still counts */
      }
      return { extraction, images }
    }
    case 'docx': {
      const extraction = extractDocx(data, fileKey)
      let images: ImageCandidate[] = []
      try {
        images = await docxImages(data, fileKey)
      } catch {
        /* ignore */
      }
      return { extraction, images }
    }
    case 'spreadsheet':
      return { extraction: extractSheet(data, fileKey), images: [] }
    case 'image': {
      let width = 0
      let height = 0
      try {
        const bmp = await createImageBitmap(file)
        width = bmp.width
        height = bmp.height
        bmp.close()
      } catch {
        /* e.g. HEIC outside Safari: still offered, without size */
      }
      return { extraction: EMPTY('image'), images: [{ id: `${fileKey}:file`, fileKey, page: null, blob: file, width, height, origin: 'file' }] }
    }
  }
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/** Union-find over label spellings so "Range" and its Arabic twin share one key. */
function labelGroups(facts: Fact[]) {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  for (const f of facts) {
    if (f.kind !== 'value' || f.core) continue
    const a = normLabel(f.label)
    parent.set(a, parent.get(a) ?? a)
    if (f.labelAlt) union(a, normLabel(f.labelAlt))
  }
  return find
}

const isArabic = (s: string) => /[؀-ۿ]/.test(s)

/**
 * Merge facts from several files. Same field + same value → one value with
 * every source. Same field + different values → conflict (never resolved
 * here). List items are unioned per section.
 */
export function mergeFacts(perFile: { fileKey: string; facts: Fact[] }[]): MergedFact[] {
  const all = perFile.flatMap((p) => p.facts.map((f) => ({ ...f, source: { ...f.source, fileKey: p.fileKey } })))
  const find = labelGroups(all)
  const groups = new Map<string, Fact[]>()
  for (const f of all) {
    const key = f.core ? `core:${f.core}` : f.kind === 'item' ? `item:${normLabel(f.section ?? '')}` : `label:${find(normLabel(f.label))}`
    const g = groups.get(key)
    if (g) g.push(f)
    else groups.set(key, [f])
  }

  const out: MergedFact[] = []
  for (const [key, facts] of groups) {
    const values: MergedFact['values'] = []
    const keysOf = (f: Fact) => [normValue(f.value, f.unit), f.valueAlt ? normValue(f.valueAlt, null) : null].filter(Boolean) as string[]
    const seen: { keys: Set<string>; entry: MergedFact['values'][number] }[] = []
    for (const f of facts) {
      const ks = keysOf(f)
      // Values compare without units too when only one side has a unit ("100" vs "100 km").
      const loose = normValue(f.value, null)
      const hit = seen.find((s) => ks.some((k) => s.keys.has(k)) || s.keys.has(`loose:${loose}`))
      if (hit) {
        if (!hit.entry.sources.some((s) => s.fileKey === f.source.fileKey && s.page === f.source.page)) hit.entry.sources.push(f.source)
        hit.entry.valueAlt ??= f.valueAlt ?? null
        hit.entry.unit ??= f.unit
        ks.forEach((k) => hit.keys.add(k))
        continue
      }
      const entry = { value: f.value, unit: f.unit, valueAlt: f.valueAlt ?? null, sources: [f.source], raw: f.raw }
      seen.push({ keys: new Set([...ks, `loose:${loose}`]), entry })
      values.push(entry)
    }
    const first = facts[0]
    const latin = facts.find((f) => !isArabic(f.label)) ?? first
    const altLabel = facts.map((f) => (isArabic(f.label) ? f.label : f.labelAlt)).find((l) => l && l !== latin.label) ?? null
    out.push({
      id: key,
      section: (facts.find((f) => f.section && !isArabic(f.section)) ?? first).section,
      label: first.kind === 'item' ? first.section ?? '' : latin.label,
      labelAlt: first.kind === 'item' ? null : altLabel,
      kind: first.kind,
      core: first.core,
      values,
      conflict: first.kind === 'value' && values.length > 1,
    })
  }
  return out
}
