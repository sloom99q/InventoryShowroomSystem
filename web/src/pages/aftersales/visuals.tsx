// After-Sales visuals: gauges, sparklines, avatars, part icons, progress bars, guided empty states.
import { Battery, CircleDot, Disc3, Droplets, Filter, KeyRound, Lightbulb, Package, Wind, Wrench, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Green until 75 % used, amber until full, red when passed. */
export function toneFor(fraction: number) {
  return fraction >= 1 ? 'var(--danger)' : fraction >= 0.75 ? 'var(--warn)' : 'var(--ok)'
}

/** A round gauge: the share used, with a value in the middle. */
export function Gauge({ fraction, center, sub, label, size = 132, color }: { fraction: number; center: ReactNode; sub?: ReactNode; label: string; size?: number; color?: string }) {
  const r = 52, c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <figure className="flex flex-col items-center gap-1.5" aria-label={`${label}: ${Math.round(f * 100)}%`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={color ?? toneFor(fraction)} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${f * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="text-[14px] leading-tight font-bold">{center}</span>
          {sub && <span className="mt-0.5 text-[11.5px] leading-tight text-ink-3">{sub}</span>}
        </div>
      </div>
      <figcaption className="text-[13px] font-medium text-ink-2">{label}</figcaption>
    </figure>
  )
}

/** A small trend line (last weeks), last point marked. */
export function Sparkline({ values, color = 'currentColor', className }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null
  const w = 96, h = 28, max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - (v / max) * (h - 6)] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts.at(-1)!
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('h-7 w-24', className)} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  // A steady colour per person.
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)
  return (
    <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white', className)}
      style={{ background: `hsl(${hue} 38% 42%)` }} aria-hidden>{initials || '?'}</span>
  )
}

/** A horizontal progress bar that turns amber near due and red past it. */
export function DueBar({ label, fraction, text }: { label: string; fraction: number; text: string }) {
  const f = Math.max(0, fraction)
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="font-medium text-ink-2">{label}</span><span className="tnum text-ink-3">{text}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label} aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(1, f) * 100}%`, background: toneFor(f >= 1 ? 1 : f >= 0.8 ? 0.8 : 0) }} />
      </div>
    </div>
  )
}

/** A clear icon for a part from its name. */
export function partIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (/brake|pad|disc|rotor|فرامل|فحمات/.test(n)) return Disc3
  if (/tyre|tire|wheel|rim|إطار/.test(n)) return CircleDot
  if (/oil|fluid|coolant|زيت/.test(n)) return Droplets
  if (/filter|فلتر/.test(n)) return Filter
  if (/wiper|مساحات/.test(n)) return Wind
  if (/battery|بطارية/.test(n)) return Battery
  if (/lamp|light|bulb|ضوء|لمبة/.test(n)) return Lightbulb
  if (/key|مفتاح/.test(n)) return KeyRound
  if (/sensor|module|camera|حساس/.test(n)) return Wrench
  return Package
}

/** An empty section that says how it fills and offers the first action. */
export function Guide({ icon: Icon, title, body, action, className, children }: { icon: LucideIcon; title: string; body: string; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)} data-empty-state={title}>
      <span className="relative mb-4 flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-[ping_2.4s_ease-out_infinite] rounded-full bg-accent/10 motion-reduce:animate-none" />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-accent/10 text-accent"><Icon className="size-7" /></span>
      </span>
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-[14px] text-ink-2">{body}</p>
      {children}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
