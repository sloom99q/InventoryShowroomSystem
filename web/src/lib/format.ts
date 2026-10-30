import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import i18n, { intlLocale } from '@/i18n'

export const TZ = 'Asia/Dubai'

const dtCache = new Map<string, Intl.DateTimeFormat>()
function dtf(opts: Intl.DateTimeFormatOptions, zone = TZ) {
  const key = `${intlLocale()}|${zone}|${JSON.stringify(opts)}`
  let f = dtCache.get(key)
  if (!f) dtCache.set(key, (f = new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: zone })))
  return f
}

/** "12 Oct 2026, 15:30" / "12 أكتوبر 2026، 15:30" in UAE time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return dtf({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  // Plain dates (yyyy-mm-dd) have no zone; don't shift them.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dtf({ day: 'numeric', month: 'short', year: 'numeric' }, 'UTC').format(new Date(`${iso}T12:00:00Z`))
  return dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return i18n.t('time.justNow')
  if (min < 60) return i18n.t('time.minAgo', { count: min })
  const h = Math.round(min / 60)
  if (h < 24) return i18n.t('time.hAgo', { count: h })
  const d = Math.round(h / 24)
  if (d < 7) return i18n.t('time.dAgo', { count: d })
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

export function fmtMoney(v: number | string | null | undefined, currency = 'AED', short = false): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'string' ? Number(v) : v
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency,
    currencyDisplay: i18n.language === 'ar' ? 'symbol' : 'code',
    minimumFractionDigits: short ? 0 : 2,
    maximumFractionDigits: short ? 0 : 2,
  }).format(n).replace(/\u00a0/g, ' ')
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
  return i18n.t('terms.km', { value: new Intl.NumberFormat(intlLocale()).format(v) })
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
