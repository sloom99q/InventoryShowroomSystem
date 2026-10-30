// Arabic ligature repair for PDFs.
//
// Arabic text in a PDF is drawn glyph by glyph in visual (right-to-left)
// order. Some fonts draw a ligature such as lam-alef (لا) as ONE glyph whose
// Unicode mapping is the two letters in logical order. Plain text extraction
// can't see glyph boundaries, so reversing the visual string turns "سلامة"
// into "السالمة". The operator list does keep one entry per glyph, so for each
// Arabic word we compare the character-wise reversal (what text extraction
// produces) with a glyph-wise reversal (correct) and record the fix.

import { norm } from './layout'

type Glyph = { unicode?: string } | number | null
type OperatorList = { fnArray: number[]; argsArray: unknown[][] }

const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

/** Pure: given glyph runs (visual order), map wrongly-ordered words to their correct spelling. */
export function ligatureFixesFromRuns(runs: string[][]): Map<string, string> {
  const fixes = new Map<string, string>()
  const genuine = new Set<string>()
  for (const run of runs) {
    let word: string[] = []
    const flush = () => {
      if (word.length) {
        const naive = norm([...word.join('')].reverse().join(''))
        const correct = norm([...word].reverse().map((g) => g.normalize('NFKC')).join(''))
        if (naive !== correct) fixes.set(naive, correct)
        else genuine.add(naive)
      }
      word = []
    }
    for (const g of run) {
      if (g && ARABIC_LETTER.test(g) && !/\s/.test(g)) word.push(g)
      else flush()
    }
    flush()
  }
  // Never "fix" a spelling that also appears correctly drawn on the same page.
  for (const w of genuine) fixes.delete(w)
  return fixes
}

/** Glyph runs from a page's operator list. Runs break at text blocks and non-Arabic glyphs. */
export function glyphRuns(ops: OperatorList, OPS: Record<string, number>): string[][] {
  const showOps = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  const runs: string[][] = []
  let cur: string[] = []
  ops.fnArray.forEach((fn, i) => {
    if (fn === OPS.endText || fn === OPS.beginText) {
      if (cur.length) runs.push(cur)
      cur = []
      return
    }
    if (!showOps.has(fn)) return
    const glyphs = (ops.argsArray[i]?.find((a) => Array.isArray(a)) ?? []) as Glyph[]
    for (const g of glyphs) {
      if (typeof g === 'number' || !g) continue
      cur.push(g.unicode ?? '')
    }
  })
  if (cur.length) runs.push(cur)
  return runs
}

/** Apply word fixes to a text, matching whole Arabic words only. */
export function applyLigatureFixes(text: string, fixes: Map<string, string>): string {
  if (!fixes.size || !ARABIC_LETTER.test(text)) return text
  return text.replace(/[؀-ۿݐ-ݿࢠ-ࣿ]+/g, (w) => fixes.get(w) ?? w)
}
