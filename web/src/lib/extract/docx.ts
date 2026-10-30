// Word (.docx) extraction: paragraphs, heading styles, numbered lists, tables
// and embedded pictures, read straight from the ZIP/XML with no converter.
import { strFromU8, unzipSync } from 'fflate'
import { findCandidates } from '@/lib/vin'
import { hasArabic, norm, type Line } from './layout'
import { titleFacts } from './pdf'
import { structure } from './structure'
import type { Extraction, ImageCandidate } from './types'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m,
  )
}

/** Top-level children of <w:body> (or a cell) that are paragraphs or tables, with nesting respected. */
function blocks(xml: string): { tag: 'p' | 'tbl'; xml: string }[] {
  const out: { tag: 'p' | 'tbl'; xml: string }[] = []
  const re = /<w:(p|tbl)(?=[\s>/])[^>]*?(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const tag = m[1] as 'p' | 'tbl'
    const start = m.index
    if (m[2] === '/') {
      out.push({ tag, xml: m[0] })
      continue
    }
    // Find the matching close tag, counting nested opens of the same tag.
    const open = new RegExp(`<w:${tag}(?=[\\s>/])[^>]*?(/?)>|</w:${tag}>`, 'g')
    open.lastIndex = re.lastIndex
    let depth = 1
    let mm: RegExpExecArray | null
    while (depth && (mm = open.exec(xml))) {
      if (mm[0].startsWith('</')) depth--
      else if (mm[1] !== '/') depth++
    }
    const end = open.lastIndex || xml.length
    out.push({ tag, xml: xml.slice(start, end) })
    re.lastIndex = end
  }
  return out
}

function paragraphText(p: string): string {
  let out = ''
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:(?:br|cr)\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(p))) {
    if (m[1] !== undefined) out += decode(m[1])
    else if (m[0].startsWith('<w:tab')) out += '\t'
    else out += '\n'
  }
  return out
}

function styleOf(p: string) {
  return p.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1] ?? null
}

function cellsOfRow(tr: string): string[] {
  const cells: string[] = []
  const re = /<w:tc(?=[\s>])[\s\S]*?<\/w:tc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tr))) {
    const text = blocks(m[0])
      .map((b) => (b.tag === 'p' ? paragraphText(b.xml) : b.xml.replace(/<[^>]+>/g, ' ')))
      .join(' ')
    cells.push(norm(text))
  }
  return cells
}

export function extractDocx(data: Uint8Array, fileKey = 'file'): Extraction {
  const zip = unzipSync(data, { filter: (f) => f.name === 'word/document.xml' })
  const xml = zip['word/document.xml'] ? strFromU8(zip['word/document.xml']) : ''
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? ''

  const lines: Line[] = []
  let title: string | null = null
  let firstPlain: string | null = null
  for (const b of blocks(body)) {
    if (b.tag === 'tbl') {
      const rows = b.xml.match(/<w:tr(?=[\s>])[\s\S]*?<\/w:tr>/g) ?? []
      for (const tr of rows) {
        const cells = cellsOfRow(tr).filter(Boolean)
        if (!cells.length) continue
        lines.push({ text: cells.join(' '), cells, page: null, fontSize: null, indent: null, y: null, stream: null, rtl: hasArabic(cells.join('')) })
      }
      continue
    }
    const raw = paragraphText(b.xml)
    for (const part of raw.split('\n')) {
      const cells = part.split(/\t+/).map(norm).filter(Boolean)
      const text = cells.join(' ')
      if (!text) continue
      const style = styleOf(b.xml) ?? ''
      if (/^(title)$/i.test(style) && !title) {
        title = text
        continue
      }
      firstPlain ??= text
      lines.push({
        text,
        cells: cells.length > 1 ? cells : [text],
        page: null,
        fontSize: null,
        indent: null,
        y: null,
        stream: null,
        rtl: hasArabic(text),
        heading: /^(subtitle|heading\s?\d*)$/i.test(style),
        bullet: /<w:numPr>/.test(b.xml),
      })
    }
  }
  if (!title && firstPlain && !/[:：]/.test(firstPlain) && firstPlain.split(' ').length <= 10) {
    title = firstPlain
    const i = lines.findIndex((l) => l.text === firstPlain)
    if (i >= 0) lines.splice(i, 1)
  }
  const { facts, unstructured } = structure(lines, fileKey)
  const text = [title, ...lines.map((l) => l.text)].filter(Boolean).join('\n')
  return {
    kind: 'docx',
    pages: [text],
    hasText: text.replace(/\s/g, '').length > 0,
    facts: [...(title ? titleFacts(title, fileKey, null) : []), ...facts],
    unstructured,
    title,
    chassisCandidates: findCandidates([text]),
    imageOnlyPages: [],
    inventorySheet: null,
  }
}

const IMAGE_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

/** Pictures embedded in a .docx (browser: needs createImageBitmap for size). */
export async function docxImages(data: Uint8Array, fileKey: string): Promise<ImageCandidate[]> {
  const zip = unzipSync(data, { filter: (f) => f.name.startsWith('word/media/') })
  const out: ImageCandidate[] = []
  for (const [name, bytes] of Object.entries(zip)) {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const type = IMAGE_EXT[ext]
    if (!type) continue // EMF/WMF vector drawings are not photos
    const blob = new Blob([bytes as BlobPart], { type })
    let width = 0
    let height = 0
    try {
      const bmp = await createImageBitmap(blob)
      width = bmp.width
      height = bmp.height
      bmp.close()
    } catch {
      continue
    }
    if (Math.min(width, height) < 200 || width * height < 200 * 300) continue
    out.push({ id: `${fileKey}:${name}`, fileKey, page: null, blob, width, height, origin: 'embedded' })
  }
  return out
}
