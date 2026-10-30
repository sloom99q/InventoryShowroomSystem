// Pull the existing text layer out of a digital PDF, in the browser.
// No OCR: scanned PDFs simply return little or no text, and the UI says so.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfText = { pages: string[]; hasTextLayer: boolean }

export async function extractPdfText(file: Blob, maxPages = 20): Promise<PdfText> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // Rebuild lines from the item positions so "VIN:" and its value stay together.
    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = Math.round(item.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(line)
        line = ''
      }
      line += (line && !line.endsWith(' ') ? ' ' : '') + item.str
      lastY = y
    }
    if (line) lines.push(line)
    pages.push(lines.join('\n'))
  }
  await task.destroy()
  const chars = pages.join('').replace(/\s/g, '').length
  return { pages, hasTextLayer: chars > 40 }
}

/** Render the first pages of a PDF to PNG data URLs for an inline preview. */
export async function renderPdfPages(data: ArrayBuffer, maxPages = 4, width = 900): Promise<string[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  const out: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    out.push(canvas.toDataURL('image/png'))
  }
  await task.destroy()
  return out
}
