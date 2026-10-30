// PDF text-layer extraction (no OCR) and picture extraction.
import { findCandidates } from '@/lib/vin'
import { isDocumentHeading, parseTitle } from './core'
import { norm, pageLines, type Line, type TextItem } from './layout'
import { applyLigatureFixes, glyphRuns, ligatureFixesFromRuns } from './ligatures'
import { docDataFacts, isBrochure, isDocData, isSpecSheet, type PdfPage, readBrochure, readSpecSheet } from './showroom'
import { structure } from './structure'
import type { Extraction, Fact, ImageCandidate } from './types'

type PdfJs = typeof import('pdfjs-dist')
type PdfDoc = Awaited<ReturnType<PdfJs['getDocument']>['promise']>

const MIN_PAGE_CHARS = 20

async function pageItems(doc: PdfDoc, p: number): Promise<TextItem[]> {
  const page = await doc.getPage(p)
  const tc = await page.getTextContent()
  const out: TextItem[] = []
  for (const it of tc.items) {
    if (!('str' in it)) continue
    const t = it.transform as number[]
    out.push({
      str: it.str,
      x: t[4],
      y: t[5],
      width: it.width,
      height: it.height,
      fontSize: Math.hypot(t[2], t[3]) || it.height,
      page: p,
      dir: it.dir as TextItem['dir'],
    })
  }
  return out
}

function readable(s: string) {
  return s.replace(/[^\p{L}\p{N}]/gu, '').length
}

/** Most prominent line(s) on the first page that aren't label/value pairs. */
function findTitle(lines: Line[]): Line[] {
  const first = lines.filter((l) => l.page === 1 && !/[:：]/.test(l.text) && l.fontSize)
  if (!first.length) return []
  const sizes = lines.map((l) => l.fontSize ?? 0).filter(Boolean).sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0
  const max = Math.max(...first.map((l) => l.fontSize!))
  if (max < median * 1.3) return []
  return first.filter((l) => Math.abs(l.fontSize! - max) < 0.5).slice(0, 2)
}

export function titleFacts(title: string, fileKey: string, page: number | null): Fact[] {
  const { name, year } = parseTitle(title)
  if (isDocumentHeading(name)) return []
  const src = { fileKey, page }
  const facts: Fact[] = []
  if (name) facts.push({ section: null, label: 'Vehicle name', labelAlt: null, value: name, unit: null, kind: 'value', core: 'vehicle_name', source: src, raw: title })
  if (year) facts.push({ section: null, label: 'Model year', labelAlt: null, value: year, unit: null, kind: 'value', core: 'year', source: src, raw: title })
  return facts
}

/** Vehicle data embedded by the app's own exports (data.json), if any. */
async function embeddedData(doc: PdfDoc) {
  try {
    type Att = { filename?: string; content?: Uint8Array }
    const att = (await doc.getAttachments()) as Map<string, Att> | Record<string, Att> | null
    // pdf.js returns a Map (contents fetched separately) in recent versions, a plain object in older ones.
    const entries: [string, Att][] = att instanceof Map ? [...att.entries()] : Object.entries(att ?? {})
    const getContent = (doc as unknown as { getAttachmentContent?: (id: string) => Promise<{ content?: Uint8Array } | Uint8Array> }).getAttachmentContent
    for (const [id, a] of entries) {
      if (!/\.json$/i.test(a.filename ?? '')) continue
      let bytes = a.content
      if (!bytes && getContent) {
        const c = await getContent.call(doc, id)
        bytes = c instanceof Uint8Array ? c : c?.content
      }
      if (!bytes) continue
      const data = JSON.parse(new TextDecoder().decode(bytes))
      if (isDocData(data)) return data
    }
  } catch {
    /* no or unreadable attachments */
  }
  return null
}

export async function extractPdf(data: Uint8Array, pdfjs: PdfJs, fileKey = 'file'): Promise<Extraction> {
  const task = pdfjs.getDocument({ data: data.slice() })
  const doc = await task.promise
  try {
    const all: Line[] = []
    const pages: string[] = []
    const imageOnlyPages: number[] = []
    const raw: PdfPage[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const items = await pageItems(doc, p)
      const page = await doc.getPage(p)
      const [x0, y0, x1, y1] = page.view
      const lines = pageLines(items)
      const fixes = ligatureFixesFromRuns(glyphRuns(await page.getOperatorList(), pdfjs.OPS as unknown as Record<string, number>))
      raw.push({ page: p, items, width: x1 - x0, height: y1 - y0, fixes })
      if (fixes.size) for (const l of lines) {
        l.text = applyLigatureFixes(l.text, fixes)
        l.cells = l.cells.map((c) => applyLigatureFixes(c, fixes))
      }
      all.push(...lines)
      const text = lines.map((l) => l.text).join('\n')
      pages.push(text)
      if (readable(text) < MIN_PAGE_CHARS) imageOnlyPages.push(p)
    }
    const base = {
      kind: 'pdf' as const,
      pages,
      hasText: pages.some((t) => readable(t) >= MIN_PAGE_CHARS),
      chassisCandidates: findCandidates(pages),
      imageOnlyPages,
      inventorySheet: null,
    }

    // The showroom's own documents: exact data first, then the two known layouts.
    const embedded = await embeddedData(doc)
    if (embedded) {
      const brochure = isBrochure(raw)
      const b = brochure ? readBrochure(raw, fileKey) : null
      return { ...base, facts: docDataFacts(embedded, fileKey), unstructured: [], layout: 'embedded',
        title: [embedded.identity.brand, embedded.identity.model, embedded.identity.year].filter(Boolean).join(' '),
        photoPages: b?.photoPages ?? (brochure ? null : []), coverPage: b?.coverPage ?? null }
    }
    if (isSpecSheet(raw)) {
      const r = readSpecSheet(raw[0], fileKey)
      return { ...base, facts: r.facts, unstructured: [], title: r.title, layout: 'spec_sheet', photoPages: [] }
    }
    if (isBrochure(raw)) {
      const r = readBrochure(raw, fileKey)
      return { ...base, facts: r.facts, unstructured: [], title: r.title, layout: 'brochure', photoPages: r.photoPages, coverPage: r.coverPage }
    }

    const titleLines = findTitle(all)
    const title = titleLines.length ? norm(titleLines.map((l) => l.text).join(' ')) : null
    const { facts, unstructured } = structure(all.filter((l) => !titleLines.includes(l)), fileKey)
    return { ...base, facts: [...(title ? titleFacts(title, fileKey, 1) : []), ...facts], unstructured, title }
  } finally {
    await task.destroy()
  }
}

// ---------------------------------------------------------------------------
// Pictures (browser only: needs canvas)
// ---------------------------------------------------------------------------

const MIN_SIDE = 200
const MIN_AREA = 200 * 300

function canvasOf(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

async function toBlob(c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92))
}

type PdfImage = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; kind?: number }

function drawImage(img: PdfImage): OffscreenCanvas | HTMLCanvasElement | null {
  const c = canvasOf(img.width, img.height)
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) return null
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0)
    return c
  }
  if (!img.data) return null
  const px = img.width * img.height
  const rgba = new Uint8ClampedArray(px * 4)
  const src = img.data
  if (src.length === px * 4) rgba.set(src)
  else if (src.length === px * 3) for (let i = 0; i < px; i++) { rgba[i * 4] = src[i * 3]; rgba[i * 4 + 1] = src[i * 3 + 1]; rgba[i * 4 + 2] = src[i * 3 + 2]; rgba[i * 4 + 3] = 255 }
  else if (src.length === px) for (let i = 0; i < px; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = src[i]; rgba[i * 4 + 3] = 255 }
  else return null // 1-bit masks and other packed formats are not photos
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0)
  return c
}

/**
 * Candidate photos from a PDF: embedded pictures at their original
 * resolution, and a rendered image of text-less pages that hold no large
 * embedded picture. Logos and icons (small images) are skipped.
 */
export async function pdfImageCandidates(
  data: Uint8Array,
  pdfjs: PdfJs,
  fileKey: string,
  imageOnlyPages: number[] = [],
  /** Only these pages, one picture each (the largest), e.g. a brochure's cover + photo pages. */
  photoPages: number[] | null = null,
  coverPage: number | null = null,
): Promise<ImageCandidate[]> {
  const task = pdfjs.getDocument({ data: data.slice() })
  const doc = await task.promise
  const out: ImageCandidate[] = []
  const seen = new Set<string>()
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      if (photoPages && !photoPages.includes(p)) continue
      const role = photoPages ? (p === coverPage ? 'cover' as const : 'photo' as const) : undefined
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      let bigOnPage = false
      let best: { img: PdfImage; id: string | null } | null = null
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintInlineImageXObject) continue
        const arg = ops.argsArray[i][0]
        let img: PdfImage | null = null
        let id: string | null = null
        if (typeof arg === 'string') {
          id = arg
          const objs = arg.startsWith('g_') ? page.commonObjs : page.objs
          img = await new Promise<PdfImage | null>((res) => {
            try { objs.get(arg, (o: PdfImage) => res(o)) } catch { res(null) }
          })
        } else img = arg as PdfImage
        if (!img || img.width < MIN_SIDE || img.height < MIN_SIDE || img.width * img.height < MIN_AREA) continue
        bigOnPage = true
        if (photoPages) {
          if (!best || img.width * img.height > best.img.width * best.img.height) best = { img, id }
          continue
        }
        const key = `${id ?? 'inline'}:${img.width}x${img.height}`
        if (id && seen.has(key)) continue
        seen.add(key)
        const canvas = drawImage(img)
        if (!canvas) continue
        out.push({ id: `${fileKey}:p${p}:${out.length}`, fileKey, page: p, blob: await toBlob(canvas), width: img.width, height: img.height, origin: 'embedded' })
      }
      if (best) {
        const canvas = drawImage(best.img)
        if (canvas) out.push({ id: `${fileKey}:p${p}:0`, fileKey, page: p, blob: await toBlob(canvas), width: best.img.width, height: best.img.height, origin: 'embedded', role })
        continue
      }
      if (!bigOnPage && (imageOnlyPages.includes(p) || (photoPages && p !== coverPage))) {
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: 1600 / base.width })
        const c = canvasOf(Math.round(viewport.width), Math.round(viewport.height))
        await page.render({ canvas: c as HTMLCanvasElement, viewport }).promise
        out.push({ id: `${fileKey}:p${p}:page`, fileKey, page: p, blob: await toBlob(c), width: c.width, height: c.height, origin: 'page', role })
      }
    }
  } finally {
    await task.destroy()
  }
  return out
}
