// Spreadsheet extraction (xlsx, xls, csv) with SheetJS. A sheet with one
// vehicle per row is an inventory list (handled by the bulk importer); a
// sheet of label/value rows describes one car and becomes facts.
import * as XLSX from 'xlsx'
import { findCandidates } from '@/lib/vin'
import { labelField } from './core'
import { hasArabic, norm, type Line } from './layout'
import { structure } from './structure'
import type { Extraction } from './types'

function isZipOrOle(d: Uint8Array) {
  return (d[0] === 0x50 && d[1] === 0x4b) || (d[0] === 0xd0 && d[1] === 0xcf && d[2] === 0x11 && d[3] === 0xe0)
}

function readWorkbook(data: Uint8Array): XLSX.WorkBook {
  if (isZipOrOle(data)) return XLSX.read(data, { type: 'array', cellDates: false })
  // CSV/text: decode as UTF-8 ourselves so Arabic survives.
  const text = new TextDecoder('utf-8').decode(data).replace(/^﻿/, '')
  return XLSX.read(text, { type: 'string', raw: false })
}

function rowsOf(ws: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
  return rows.map((r) => r.map((c) => norm(String(c ?? ''))))
}

/** One vehicle per row: a header row with several columns and at least three similar data rows. */
export function inventoryRows(rows: string[][]): number | null {
  const filled = (r: string[]) => r.filter(Boolean).length
  const h = rows.findIndex((r) => filled(r) >= 3)
  if (h < 0) return null
  const header = rows[h]
  const data = rows.slice(h + 1).filter((r) => filled(r) >= 3)
  if (data.length < 3) return null
  const chassisCol = header.some((c) => labelField(c) === 'chassis_number')
  const labelish = header.filter((c) => c && !/^\d/.test(c)).length
  const consistent = data.filter((r) => Math.abs(filled(r) - filled(header)) <= 1).length >= data.length * 0.7
  return chassisCol || (labelish >= 4 && consistent) ? data.length : null
}

export function extractSheet(data: Uint8Array, fileKey = 'file'): Extraction {
  const wb = readWorkbook(data)
  const lines: Line[] = []
  const pages: string[] = []
  let inventory = 0
  for (const name of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[name])
    pages.push(rows.map((r) => r.filter(Boolean).join(' | ')).filter(Boolean).join('\n'))
    const inv = inventoryRows(rows)
    if (inv) {
      inventory += inv
      continue
    }
    for (const r of rows) {
      const cells = r.filter(Boolean)
      if (!cells.length) continue
      lines.push({
        text: cells.join(' '),
        cells,
        page: null,
        fontSize: null,
        indent: null,
        y: null,
        stream: null,
        rtl: hasArabic(cells[0]),
        heading: cells.length === 1 && cells[0].split(' ').length <= 8 && !/[:：]/.test(cells[0]),
      })
    }
  }
  const { facts, unstructured } = structure(lines, fileKey)
  const text = pages.join('\n\n')
  return {
    kind: 'spreadsheet',
    pages: [text],
    hasText: text.replace(/\s/g, '').length > 0,
    facts,
    unstructured,
    title: null,
    chassisCandidates: inventory ? [] : findCandidates([text]),
    imageOnlyPages: [],
    inventorySheet: inventory ? { rows: inventory } : null,
  }
}
