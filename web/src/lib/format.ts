import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const TZ = 'Asia/Dubai'

/** "12 Oct 2026, 15:30" in UAE time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatInTimeZone(new Date(iso), TZ, 'd MMM yyyy, HH:mm')
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Plain dates (yyyy-mm-dd) have no zone; don't shift them.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatInTimeZone(new Date(`${iso}T12:00:00Z`), 'UTC', 'd MMM yyyy')
  return formatInTimeZone(new Date(iso), TZ, 'd MMM yyyy')
}

export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return fmtDate(iso)
}

/** Value for <input type="datetime-local"> showing UAE time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return formatInTimeZone(new Date(iso), TZ, "yyyy-MM-dd'T'HH:mm")
}

/** Interpret a datetime-local value as UAE time and return an ISO instant. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  return fromZonedTime(v, TZ).toISOString()
}

export function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString())
}

export function todayDubai(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
}

const money = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneyShort = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 })

export function fmtMoney(v: number | string | null | undefined, currency = 'AED', short = false): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'string' ? Number(v) : v
  return `${currency} ${(short ? moneyShort : money).format(n)}`
}

/** Sum money in integer fils so 0.1 + 0.2 never shows up as 0.30000000004. */
export function sumMoney(values: Array<number | string>): number {
  return values.reduce<number>((acc, v) => acc + Math.round(Number(v) * 100), 0) / 100
}

/** Validate a typed amount. Returns a normalised "1234.50" string or null. */
export function parseAmount(input: string): string | null {
  const s = input.replace(/[,\s]/g, '').replace(/^AED/i, '')
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null
  return Number(s).toFixed(2)
}

export function fmtKm(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${new Intl.NumberFormat('en-AE').format(v)} km`
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
