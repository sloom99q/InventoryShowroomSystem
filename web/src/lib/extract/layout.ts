// Layout-aware line building from positioned text (PDF text layers).
//
// PDF text comes as positioned fragments in *visual* order. For right-to-left
// scripts the fragments are often single glyphs in Arabic presentation forms,
// and pdf.js has already reversed multi-character RTL fragments. This module
// turns them back into logical, NFKC-normalised text, keeps side-by-side
// columns in separate streams, and splits table-like lines into cells.

export type TextItem = {
  str: string
  x: number
  /** Baseline, PDF coordinates (grows upwards). */
  y: number
  width: number
  height: number
  fontSize: number
  page: number
  /** Direction pdf.js assigned to the fragment, if known. */
  dir?: 'ltr' | 'rtl' | 'ttb'
}

export type Line = {
  text: string
  /** Cell texts when the line has large horizontal gaps (tables); otherwise [text]. */
  cells: string[]
  page: number | null
  fontSize: number | null
  /** Left edge relative to its column (PDF), for list/heading detection. */
  indent: number | null
  y: number | null
  stream: 'full' | 'left' | 'right' | null
  rtl: boolean
  /** Set by sources that know it (DOCX heading styles, single-cell sheet rows). */
  heading?: boolean
  /** Set by sources that know it (DOCX numbering). */
  bullet?: boolean
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const LATIN = /[A-Za-zÀ-ɏ]/

export function hasArabic(s: string) {
  return ARABIC.test(s)
}
export function hasLatin(s: string) {
  return LATIN.test(s)
}

/** NFKC + tidy whitespace. Turns Arabic presentation forms into base letters. */
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‎‏‪-‮⁦-⁩ـ]/g, '')
    // Fonts often map Arabic glyphs to their Persian look-alikes (ی ھ ک); use the Arabic letters.
    .replace(/ی/g, 'ي')
    .replace(/ھ/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/\s+/g, ' ')
    .trim()
}

type Token = { t: string; k: 'R' | 'L' | 'EN' | 'N' }

function tokenize(visual: string): Token[] {
  const out: Token[] = []
  const re = /([A-Za-zÀ-ɏ]+)|([0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)*)|([\s\S])/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(visual))) {
    if (m[1]) out.push({ t: m[1], k: 'L' })
    else if (m[2]) out.push({ t: m[2], k: 'EN' })
    else out.push({ t: m[3], k: ARABIC.test(m[3]) ? 'R' : 'N' })
  }
  return out
}

/** Reverse the order of maximal runs of `kind` tokens (allowing single spaces inside a run). */
function reverseRuns(tokens: Token[], isRun: (t: Token) => boolean): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < tokens.length) {
    if (!isRun(tokens[i])) {
      out.push(tokens[i++])
      continue
    }
    let j = i
    // A space or a joiner between two words of the run keeps it one run ("Multi-Link", "km/h").
    while (j + 1 < tokens.length && (isRun(tokens[j + 1]) || (/^[ \-‐–/.'’&+]$/.test(tokens[j + 1].t) && j + 2 < tokens.length && isRun(tokens[j + 2])))) j++
    out.push(...tokens.slice(i, j + 1).reverse())
    i = j + 1
  }
  return out
}

/**
 * Visual-order text → logical order. RTL lines: reverse everything, then put
 * Latin word runs back in reading order. Numbers stay intact as tokens.
 */
export function visualToLogical(visual: string): { text: string; rtl: boolean } {
  const tokens = tokenize(visual)
  const r = tokens.filter((t) => t.k === 'R').length
  const l = tokens.filter((t) => t.k === 'L').reduce((n, t) => n + t.t.length, 0)
  if (r === 0) return { text: visual, rtl: false }
  if (r > l) {
    const rev = tokens.slice().reverse()
    // Mirror paired brackets that flipped with the reversal.
    const mirrored = rev.map((t) => (t.k === 'N' ? { ...t, t: ({ '(': ')', ')': '(', '[': ']', ']': '[' } as Record<string, string>)[t.t] ?? t.t } : t))
    return { text: reverseRuns(mirrored, (t) => t.k === 'L').map((t) => t.t).join(''), rtl: true }
  }
  // Mostly left-to-right line with embedded Arabic: only the Arabic runs are reversed.
  return { text: reverseRuns(tokens, (t) => t.k === 'R').map((t) => t.t).join(''), rtl: false }
}

/** Glyphs of one item in visual order (undoing pdf.js's own reversal of RTL fragments). */
function visualOf(it: TextItem): string {
  const s = it.str
  const chars = [...s]
  if (it.dir === 'rtl' && chars.length > 1 && ARABIC.test(s)) return chars.reverse().join('')
  return s
}

/** NFKC per visual glyph; ligatures that expand (e.g. lam-alef) are emitted in visual order. */
function normalizeVisual(s: string): string {
  return [...s]
    .map((c) => {
      const n = c.normalize('NFKC')
      return n.length > 1 && ARABIC.test(n) ? [...n].reverse().join('') : n
    })
    .join('')
}

/** Join items on one baseline (sorted left→right) into visual text, inserting spaces at gaps. */
function joinVisual(items: TextItem[]): string {
  let out = ''
  let prevEnd: number | null = null
  for (const it of items) {
    const fs = it.fontSize || it.height || 10
    if (prevEnd !== null && it.x - prevEnd > fs * 0.22 && !out.endsWith(' ')) out += ' '
    out += visualOf(it)
    prevEnd = Math.max(prevEnd ?? -Infinity, it.x + it.width)
  }
  return normalizeVisual(out)
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Group items into baselines (top to bottom), each sorted left to right. */
function baselines(items: TextItem[]): TextItem[][] {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextItem[][] = []
  for (const it of sorted) {
    const tol = Math.max(2, (it.fontSize || it.height || 10) * 0.45)
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= tol)
    if (row) row.push(it)
    else rows.push([it])
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x)
  return rows.sort((a, b) => b[0].y - a[0].y)
}

/** Split a baseline into cells at gaps wider than ~1.2em. */
function cellsOf(row: TextItem[]): TextItem[][] {
  const cells: TextItem[][] = []
  let cur: TextItem[] = []
  let end = -Infinity
  for (const it of row) {
    const fs = it.fontSize || it.height || 10
    if (cur.length && it.x - end > fs * 1.2) {
      cells.push(cur)
      cur = []
    }
    cur.push(it)
    end = Math.max(end, it.x + it.width)
  }
  if (cur.length) cells.push(cur)
  return cells
}

function makeLine(row: TextItem[], stream: Line['stream'], columnLeft: number): Line {
  const cellItems = cellsOf(row)
  const logical = cellItems.map((c) => visualToLogical(joinVisual(c)))
  const rtl = logical.filter((c) => c.rtl).length > logical.length / 2
  // In a right-to-left line, cells read right to left.
  const cells = (rtl ? logical.slice().reverse() : logical).map((c) => norm(c.text)).filter(Boolean)
  return {
    text: cells.join(' '),
    cells,
    page: row[0].page,
    fontSize: median(row.map((i) => i.fontSize || i.height)),
    indent: rtl ? null : row[0].x - columnLeft,
    y: row[0].y,
    stream,
    rtl,
  }
}

type Gutter = { x: number; width: number }

/** Widest vertical band that no item crosses, with text on both sides. */
function findGutter(items: TextItem[]): Gutter | null {
  if (items.length < 6) return null
  const iv = items.map((i) => [i.x, i.x + i.width] as const).sort((a, b) => a[0] - b[0])
  const minX = iv[0][0]
  const maxX = Math.max(...iv.map((i) => i[1]))
  let best: Gutter | null = null
  let end = iv[0][1]
  for (const [s, e] of iv.slice(1)) {
    if (s > end) {
      const g = { x: (end + s) / 2, width: s - end }
      const left = items.filter((i) => i.x + i.width <= g.x).length
      const right = items.filter((i) => i.x >= g.x).length
      if (left >= 3 && right >= 3 && (!best || g.width > best.width)) best = g
    }
    end = Math.max(end, e)
  }
  if (!best || best.width < (maxX - minX) * 0.06) return null
  return best
}

function looksLikeFact(text: string) {
  return /[:：]/.test(text) || /\d/.test(text)
}

/**
 * Lines for one page. If a vertical gutter separates two columns written in
 * different scripts and each side carries its own label/value text, the
 * columns become separate streams (full-width lines first, then left, then
 * right). Otherwise the page is one stream and wide gaps become table cells.
 */
export function pageLines(items: TextItem[]): Line[] {
  const clean = items.filter((i) => i.str && i.str.trim() && i.dir !== 'ttb')
  if (!clean.length) return []
  const minX = Math.min(...clean.map((i) => i.x))
  const g = findGutter(clean)
  if (g) {
    const leftItems = clean.filter((i) => i.x + i.width <= g.x)
    const rightItems = clean.filter((i) => i.x >= g.x)
    const leftRows = baselines(leftItems)
    const rightRows = baselines(rightItems)
    const script = (rows: TextItem[][]) => {
      const txt = rows.map((r) => r.map((i) => i.str).join('')).join('')
      const a = (txt.match(new RegExp(ARABIC, 'g')) ?? []).length
      const l = (txt.match(new RegExp(LATIN, 'g')) ?? []).length
      return a > l ? 'ar' : 'lat'
    }
    const factShare = (rows: TextItem[][]) =>
      rows.length ? rows.filter((r) => looksLikeFact(norm(r.map((i) => i.str).join('')))).length / rows.length : 0
    const bilingual =
      script(leftRows) !== script(rightRows) && leftRows.length >= 3 && rightRows.length >= 3 && factShare(leftRows) >= 0.3 && factShare(rightRows) >= 0.3
    if (bilingual) {
      // Lines above both columns that don't cross the gutter still belong to a column;
      // only items spanning the gutter would be "full", and findGutter guarantees there are none.
      const leftMin = Math.min(...leftItems.map((i) => i.x))
      const rightMin = Math.min(...rightItems.map((i) => i.x))
      return [...leftRows.map((r) => makeLine(r, 'left', leftMin)), ...rightRows.map((r) => makeLine(r, 'right', rightMin))]
    }
  }
  return baselines(clean).map((r) => makeLine(r, null, minX))
}
