// Chassis / VIN rules. Ported from worker/src/showroom_scanner/vin.py.
//
// We NEVER silently correct a chassis number. Detected problems become flags
// and suggestions that a person confirms.

import i18n from '@/i18n'

export const VIN_LENGTH = 17
const VIN_ALPHABET = new Set('ABCDEFGHJKLMNPRSTUVWXYZ0123456789')
const FORBIDDEN: Record<string, string> = { I: '1', O: '0', Q: '0' }
const CONFUSABLE: Record<string, string> = { S: '5', '5': 'S', B: '8', '8': 'B', Z: '2', '2': 'Z', G: '6', '6': 'G' }
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789'

/** Upper-case and strip separators. Must match public.normalize_chassis(). */
export function normalizeChassis(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export function checkDigit(vin: string): string | null {
  if (vin.length !== VIN_LENGTH) return null
  let total = 0
  for (let i = 0; i < VIN_LENGTH; i++) {
    const c = vin[i]
    const v = /\d/.test(c) ? Number(c) : TRANSLIT[c]
    if (v === undefined) return null
    total += v * WEIGHTS[i]
  }
  const r = total % 11
  return r === 10 ? 'X' : String(r)
}

export function isIso3779(vin: string): boolean {
  return vin.length === VIN_LENGTH && [...vin].every((c) => VIN_ALPHABET.has(c))
}

export function modelYears(vin: string, now = new Date()): number[] {
  if (vin.length !== VIN_LENGTH) return []
  const idx = YEAR_CODES.indexOf(vin[9])
  if (idx < 0) return []
  const limit = now.getFullYear() + 1
  return [0, 1, 2].map((k) => 1980 + idx + 30 * k).filter((y) => y <= limit).reverse()
}

export type ChassisCheck = {
  normalized: string
  kind: 'vin17' | 'nonstandard' | 'invalid'
  /** Blocking problems: can't be saved. */
  errors: string[]
  /** Things a person should double-check before confirming. */
  warnings: string[]
  /** 1-based positions of characters OCR/typing often confuses. */
  confusable: number[]
  suggestion: string | null
  checkDigitValid: boolean | null
  years: number[]
}

export function checkChassis(raw: string): ChassisCheck {
  const v = normalizeChassis(raw)
  const errors: string[] = []
  const warnings: string[] = []
  const confusable: number[] = []
  let suggestion: string | null = null
  let checkDigitValid: boolean | null = null

  if (v.length < 5) errors.push(i18n.t('chassisCheck.tooShort'))
  if (v.length > 30) errors.push(i18n.t('chassisCheck.tooLong'))

  const kind: ChassisCheck['kind'] = errors.length ? 'invalid' : v.length === VIN_LENGTH ? 'vin17' : 'nonstandard'

  if (kind === 'vin17') {
    const forbidden = [...v].map((c, i) => (c in FORBIDDEN ? i : -1)).filter((i) => i >= 0)
    if (forbidden.length) {
      warnings.push(i18n.t('chassisCheck.forbidden', { positions: forbidden.map((i) => i + 1).join(', ') }))
      suggestion = [...v].map((c) => FORBIDDEN[c] ?? c).join('')
    }
    const cd = checkDigit(suggestion ?? v)
    if (cd !== null) {
      checkDigitValid = (suggestion ?? v)[8] === cd
      if (!checkDigitValid)
        warnings.push(i18n.t('chassisCheck.checkDigit'))
    }
  } else if (kind === 'nonstandard') {
    warnings.push(i18n.t('chassisCheck.nonstandard', { count: v.length }))
  }
  ;[...v].forEach((c, i) => {
    if (c in CONFUSABLE || c in FORBIDDEN) confusable.push(i + 1)
  })

  return { normalized: v, kind, errors, warnings, confusable, suggestion, checkDigitValid, years: kind === 'vin17' ? modelYears(suggestion ?? v) : [] }
}

/** Split a VIN into WMI / VDS / VIS for display: "LVV DB21B9 PD012345". */
export function groupChassis(raw: string): string[] {
  const v = normalizeChassis(raw)
  if (v.length !== VIN_LENGTH) return [raw]
  return [v.slice(0, 3), v.slice(3, 9), v.slice(9)]
}

// ---------------------------------------------------------------------------
// Candidate detection in free text (PDF text layer, pasted text).
// ---------------------------------------------------------------------------
const LABEL_RE =
  /\b(v\.?\s?i\.?\s?n\.?|vehicle\s+identification(?:\s+number|\s+no\.?)?|chassis(?:\s+(?:no\.?|number|#))?|frame(?:\s+(?:no\.?|number|#))?)|رقم\s*الشاص[يى]|رقم\s*الهيكل|الشاصي/i
const TOKEN_SPLIT = /[\s|:;,()[\]{}<>"'`*#=]+/
const CODE_TOKEN = /^[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/

export type Candidate = {
  value: string
  raw: string
  kind: 'vin17' | 'nonstandard'
  page: number
  labelAnchored: boolean
  occurrences: number
  check: ChassisCheck
  confidence: number
}

function looksLikeVin(v: string): boolean {
  if (v.length !== VIN_LENGTH || !/^[A-Z0-9]+$/.test(v)) return false
  const digits = [...v].filter((c) => /\d/.test(c)).length
  return digits >= 4 && digits < VIN_LENGTH
}

function score(c: Omit<Candidate, 'confidence'>): number {
  let s = 0.45
  if (c.kind === 'vin17') {
    if (isIso3779(c.value)) s += 0.15
    if (c.check.checkDigitValid) s += 0.15
    if (c.check.suggestion) s -= 0.2
  } else s -= 0.1
  if (c.labelAnchored) s += 0.2
  if (c.raw.includes(' ')) s -= 0.05
  if (c.occurrences > 1) s += 0.05
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100))
}

export function findCandidates(pages: string[]): Candidate[] {
  const found = new Map<string, Omit<Candidate, 'confidence'>>()
  const add = (value: string, raw: string, kind: Candidate['kind'], page: number, anchored: boolean) => {
    const prev = found.get(value)
    if (prev) {
      prev.occurrences++
      prev.labelAnchored ||= anchored
      return
    }
    found.set(value, { value, raw, kind, page, labelAnchored: anchored, occurrences: 1, check: checkChassis(value) })
  }

  pages.forEach((text, pi) => {
    const page = pi + 1
    const lines = text.split(/\r?\n/)
    lines.forEach((line, li) => {
      const anchored = LABEL_RE.test(line) || (li > 0 && LABEL_RE.test(lines[li - 1]))
      const toks = line.split(TOKEN_SPLIT).filter(Boolean)
      for (let start = 0; start < toks.length; start++) {
        if (!CODE_TOKEN.test(toks[start])) continue
        let joined = ''
        const parts: string[] = []
        for (let j = start; j < Math.min(start + 6, toks.length) && CODE_TOKEN.test(toks[j]); j++) {
          // Printed VIN groups are upper case; joining ordinary words ("Issue Date 2026…") is noise.
          if (j > start && (/[a-z]/.test(toks[j]) || /[a-z]/.test(toks[start]))) break
          parts.push(toks[j])
          joined += normalizeChassis(toks[j])
          if (joined.length >= VIN_LENGTH) break
        }
        if (joined.length === VIN_LENGTH && looksLikeVin(joined)) add(joined, parts.join(' '), 'vin17', page, anchored)
        const t = normalizeChassis(toks[start])
        if (t.length > VIN_LENGTH && t.startsWith('VIN') && looksLikeVin(t.slice(3))) add(t.slice(3), toks[start], 'vin17', page, true)
      }
      // Label-anchored non-standard frame numbers (e.g. URJ202-4012345).
      const m = LABEL_RE.exec(line)
      if (m) {
        for (const target of [line.slice(m.index + m[0].length), lines[li + 1] ?? '']) {
          const tok = [...target.replace(/\|/g, ' ').matchAll(/[A-Za-z0-9][A-Za-z0-9-]{4,24}/g)]
            .map((x) => x[0])
            .find((x) => !['number', 'chassis', 'frame'].includes(x.toLowerCase()))
          if (!tok) continue
          const v = normalizeChassis(tok)
          const digits = [...v].filter((c) => /\d/.test(c)).length
          if ([...found.keys()].some((k) => k.includes(v))) break
          if (v.length >= 6 && v.length <= 16 && digits >= 3) add(v, tok, 'nonstandard', page, true)
          break
        }
      }
    })
  })

  return [...found.values()]
    .map((c) => ({ ...c, confidence: score(c) }))
    .sort((a, b) => Number(a.kind !== 'vin17') - Number(b.kind !== 'vin17') || b.confidence - a.confidence)
}
