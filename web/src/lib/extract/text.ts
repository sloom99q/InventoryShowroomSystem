// Pasted text (from an email, a website copied by hand, Excel or Word) → facts,
// through the same structure reader as files. Tabs (Excel/Word tables) or wide
// gaps separate cells; everything else is "Label: value" lines, headings and bullets.
import { hasArabic, norm, type Line } from './layout'
import { structure } from './structure'
import type { Fact } from './types'

export function textLines(text: string): Line[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => raw.replace(/ /g, ' ').trimEnd())
    .filter((raw) => raw.trim() !== '')
    .map((raw) => {
      const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(/ {3,}/)).map((c) => norm(c)).filter(Boolean)
      const text = norm(raw.replace(/\t+/g, ' '))
      return { text, cells: cells.length > 1 ? cells : [text], page: null, fontSize: null, indent: null, y: null, stream: null, rtl: hasArabic(text) && !/[A-Za-z]/.test(text) }
    })
}

/** Facts from pasted text. Source file key is the caller's (e.g. "paste"). */
export function extractText(text: string, fileKey: string): Fact[] {
  return structure(textLines(text), fileKey).facts
}
