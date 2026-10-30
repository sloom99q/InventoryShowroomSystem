import { Car } from 'lucide-react'
import { useSignedUrl } from '@/lib/files'
import { cn } from '@/lib/cn'
import { STATUS_LABEL } from '@/lib/labels'
import type { VehicleStatus } from '@/lib/types'
import { groupChassis } from '@/lib/vin'

const STATUS_STYLE: Record<VehicleStatus, string> = {
  in_stock: 'text-ok bg-ok/10 ring-ok/25',
  in_garage: 'text-warn bg-warn/10 ring-warn/25',
  reserved: 'text-info bg-info/10 ring-info/25',
  sold: 'text-ink-2 bg-ink-2/10 ring-ink-2/20',
  delivered: 'text-violet bg-violet/10 ring-violet/25',
}

export function StatusBadge({ status, className }: { status: VehicleStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap', STATUS_STYLE[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Chassis number set in grouped mono, so it can be read off a document character by character. */
export function Chassis({ value, className, highlight }: { value: string; className?: string; highlight?: string }) {
  const groups = groupChassis(value)
  if (highlight) {
    const n = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    const i = n.indexOf(highlight.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    if (i >= 0 && highlight) {
      const h = highlight.replace(/[^A-Za-z0-9]/g, '').length
      return (
        <span className={cn('vin', className)}>
          {n.slice(0, i)}
          <mark className="rounded-sm bg-accent-soft text-accent">{n.slice(i, i + h)}</mark>
          {n.slice(i + h)}
        </span>
      )
    }
  }
  return (
    <span className={cn('vin whitespace-nowrap', className)} title={value}>
      {groups.map((g, i) => (
        <span key={i} className={i > 0 ? 'ms-[0.35em]' : undefined}>{g}</span>
      ))}
    </span>
  )
}

export function VehicleThumb({ path, className, alt = '' }: { path: string | null | undefined; className?: string; alt?: string }) {
  const url = useSignedUrl(path)
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-raised text-ink-3', className)}>
      {url.data ? (
        <img src={url.data} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <Car className="size-[40%] max-h-8 max-w-8" strokeWidth={1.5} aria-hidden />
      )}
    </div>
  )
}

export function vehicleTitle(v: { brand?: string | null; model?: string | null; year?: number | null }) {
  const name = [v.brand, v.model].filter(Boolean).join(' ')
  return name ? (v.year ? `${name} ${v.year}` : name) : 'Unnamed vehicle'
}
