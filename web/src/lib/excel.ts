// Excel import/export for the vehicle list.
import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { fromZonedTime } from 'date-fns-tz'
import { STATUS_LABEL } from './labels'
import { TZ, fmtDateTime } from './format'
import type { VehicleOverview, VehicleStatus } from './types'
import { checkChassis } from './vin'

export type ImportField =
  | 'chassis_number' | 'brand' | 'model' | 'year' | 'trim_level' | 'exterior_color' | 'interior_color'
  | 'mileage_km' | 'location' | 'status' | 'arrival_at' | 'sold_at' | 'acquisition_price' | 'sale_price' | 'notes'

export const IMPORT_FIELDS: { key: ImportField; label: string; aliases: string[] }[] = [
  { key: 'chassis_number', label: 'Chassis number', aliases: ['chassis', 'chassis no', 'chassis number', 'vin', 'frame', 'frame no', 'رقم الشاصي', 'الشاصي', 'رقم الهيكل'] },
  { key: 'brand', label: 'Brand', aliases: ['brand', 'make', 'manufacturer', 'الماركة', 'الشركة'] },
  { key: 'model', label: 'Model', aliases: ['model', 'الموديل', 'الطراز'] },
  { key: 'year', label: 'Year', aliases: ['year', 'model year', 'سنة الصنع', 'السنة'] },
  { key: 'trim_level', label: 'Trim', aliases: ['trim', 'spec', 'specification', 'variant', 'الفئة'] },
  { key: 'exterior_color', label: 'Exterior colour', aliases: ['color', 'colour', 'exterior', 'exterior color', 'exterior colour', 'اللون'] },
  { key: 'interior_color', label: 'Interior colour', aliases: ['interior', 'interior color', 'interior colour'] },
  { key: 'mileage_km', label: 'Mileage (km)', aliases: ['mileage', 'km', 'odometer', 'kilometers', 'kilometres', 'الممشى'] },
  { key: 'location', label: 'Location', aliases: ['location', 'yard', 'الموقع'] },
  { key: 'status', label: 'Status', aliases: ['status', 'الحالة'] },
  { key: 'arrival_at', label: 'Arrival date', aliases: ['arrival', 'arrival date', 'arrived', 'date in', 'received', 'تاريخ الوصول'] },
  { key: 'sold_at', label: 'Sale date', aliases: ['sold', 'sale date', 'sold date', 'date sold', 'تاريخ البيع'] },
  { key: 'acquisition_price', label: 'Purchase price', aliases: ['cost', 'purchase price', 'buy price', 'acquisition', 'سعر الشراء'] },
  { key: 'sale_price', label: 'Sale price', aliases: ['sale price', 'sold price', 'selling price', 'سعر البيع'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'remarks', 'comments', 'ملاحظات'] },
]

export type Sheet = { headers: string[]; rows: unknown[][] }

export async function readSheet(file: File): Promise<Sheet> {
  const sheets = await readXlsxFile(file)
  const all = (sheets[0]?.data ?? []) as unknown[][]
  // First non-empty row is the header row.
  const start = all.findIndex((r) => r.some((c) => c !== null && String(c).trim() !== ''))
  if (start < 0) return { headers: [], rows: [] }
  const headers = all[start].map((c) => String(c ?? '').trim())
  const rows = all.slice(start + 1).filter((r) => r.some((c) => c !== null && String(c).trim() !== ''))
  return { headers, rows }
}

export function guessMapping(headers: string[]): Record<ImportField, number | null> {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
  const out = {} as Record<ImportField, number | null>
  const used = new Set<number>()
  for (const f of IMPORT_FIELDS) {
    let idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.includes(norm(h)))
    if (idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.some((a) => a.length > 3 && norm(h).includes(a)))
    out[f.key] = idx >= 0 ? idx : null
    if (idx >= 0) used.add(idx)
  }
  return out
}

const STATUS_WORDS: Record<string, VehicleStatus> = {
  'in stock': 'in_stock', stock: 'in_stock', available: 'in_stock', showroom: 'in_stock',
  garage: 'in_garage', 'in garage': 'in_garage', repair: 'in_garage', workshop: 'in_garage',
  reserved: 'reserved', booked: 'reserved', hold: 'reserved',
  sold: 'sold', delivered: 'delivered',
}

function toDate(v: unknown): string | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    // Excel dates have no zone; read the wall-clock value as UAE time.
    const wall = new Date(v.getTime() + v.getTimezoneOffset() * 60000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const s = `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}T${pad(wall.getHours())}:${pad(wall.getMinutes())}:00`
    return fromZonedTime(s, TZ).toISOString()
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/) // UAE: day/month/year
  if (m) return fromZonedTime(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '12').padStart(2, '0')}:${m[5] ?? '00'}:00`, TZ).toISOString()
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (m) return fromZonedTime(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '12'}:${m[5] ?? '00'}:00`, TZ).toISOString()
  return 'invalid'
}

export type ImportRow = {
  line: number
  values: Partial<Record<ImportField, string | number | null>>
  errors: string[]
  warnings: string[]
}

export function buildRows(sheet: Sheet, mapping: Record<ImportField, number | null>): ImportRow[] {
  const seen = new Map<string, number>()
  return sheet.rows.map((r, i) => {
    const line = i + 2
    const errors: string[] = []
    const warnings: string[] = []
    const get = (k: ImportField) => {
      const idx = mapping[k]
      if (idx === null || idx === undefined) return null
      const v = r[idx]
      return v === null || v === undefined || String(v).trim() === '' ? null : v
    }
    const text = (k: ImportField) => {
      const v = get(k)
      return v === null ? null : String(v).trim()
    }
    const values: ImportRow['values'] = {}
    const chassis = text('chassis_number')
    if (!chassis) errors.push('Missing chassis number')
    else {
      const c = checkChassis(chassis)
      errors.push(...c.errors)
      if (c.suggestion) warnings.push(`Contains I/O/Q; did you mean ${c.suggestion}?`)
      if (c.kind === 'nonstandard') warnings.push('Not a 17-character VIN')
      if (seen.has(c.normalized)) errors.push(`Same chassis as row ${seen.get(c.normalized)}`)
      else seen.set(c.normalized, line)
      values.chassis_number = chassis
    }
    for (const k of ['brand', 'model', 'trim_level', 'exterior_color', 'interior_color', 'location', 'notes'] as const) values[k] = text(k)
    const year = get('year')
    if (year !== null) {
      const y = Number(year instanceof Date ? year.getFullYear() : year)
      if (Number.isInteger(y) && y >= 1900 && y <= 2100) values.year = y
      else warnings.push(`Year “${year}” ignored`)
    }
    const km = get('mileage_km')
    if (km !== null) {
      const n = Number(String(km).replace(/[,\s]|km/gi, ''))
      if (Number.isFinite(n) && n >= 0) values.mileage_km = Math.round(n)
      else warnings.push(`Mileage “${km}” ignored`)
    }
    for (const k of ['acquisition_price', 'sale_price'] as const) {
      const v = get(k)
      if (v === null) continue
      const n = String(v).replace(/[,\s]|AED/gi, '')
      if (/^\d+(\.\d{1,2})?$/.test(n)) values[k] = Number(n).toFixed(2)
      else warnings.push(`${k === 'sale_price' ? 'Sale' : 'Purchase'} price “${v}” ignored`)
    }
    for (const k of ['arrival_at', 'sold_at'] as const) {
      const d = toDate(get(k))
      if (d === 'invalid') warnings.push(`Date “${get(k)}” not understood; use day/month/year`)
      else values[k] = d
    }
    const st = text('status')
    if (st) {
      const s = STATUS_WORDS[st.toLowerCase()]
      if (s) values.status = s
      else warnings.push(`Status “${st}” not recognised; set to In stock`)
    }
    if (!values.status && values.sold_at) values.status = 'sold'
    if ((values.status === 'sold' || values.status === 'delivered') && !values.sold_at) {
      warnings.push('Marked sold without a sale date; imported as In stock')
      values.status = 'in_stock'
    }
    return { line, values, errors, warnings }
  })
}

export async function exportVehicles(rows: VehicleOverview[], currency: string) {
  const header = ['Chassis number', 'Brand', 'Model', 'Year', 'Trim', 'Exterior colour', 'Interior colour', 'Mileage (km)',
    'Location', 'Status', 'Arrival (UAE time)', 'Sold (UAE time)', 'Delivered (UAE time)', `Expenses (${currency})`,
    'Missing accessories', `Purchase price (${currency})`, `Sale price (${currency})`, 'Chassis verified', 'Notes']
  const cell = (value: string | number | null | undefined, type?: typeof Number) =>
    value === null || value === undefined || value === '' ? null : type ? { type, value: Number(value) } : { type: String, value: String(value) }
  const data = [
    header.map((h) => ({ value: h, fontWeight: 'bold' as const })),
    ...rows.map((v) => [
      cell(v.chassis_number), cell(v.brand), cell(v.model), cell(v.year, Number), cell(v.trim_level), cell(v.exterior_color),
      cell(v.interior_color), cell(v.mileage_km, Number), cell(v.location), cell(STATUS_LABEL[v.status!]),
      cell(v.arrival_at ? fmtDateTime(v.arrival_at) : null), cell(v.sold_at ? fmtDateTime(v.sold_at) : null),
      cell(v.delivered_at ? fmtDateTime(v.delivered_at) : null), cell(v.expense_total, Number), cell(v.missing_accessories, Number),
      cell(v.acquisition_price, Number), cell(v.sale_price, Number), cell(v.chassis_verified ? 'Yes' : 'No'), cell(v.notes),
    ]),
  ]
  await writeXlsxFile(data as never, { columns: header.map((_, i) => ({ width: i === 0 ? 24 : 16 })), stickyRowsCount: 1 })
    .toFile(`vehicles-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
