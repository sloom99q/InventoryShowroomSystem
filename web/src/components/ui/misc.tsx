import { Loader2 } from 'lucide-react'
import i18n from '@/i18n'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-ink-3', className)} aria-label="…" />
}

export function PageLoader() {
  return (
    <div className="flex h-60 items-center justify-center">
      <Spinner />
    </div>
  )
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-lg border border-line-soft bg-surface', className)} {...props} />
}

export function PanelHeader({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 border-b border-line-soft px-4 py-2', className)}>
      <h2 className="text-[14px] font-semibold">{title}</h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-ink-3 [&_svg]:size-6">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-[13px] text-ink-2">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : (error as { message?: string })?.message ?? i18n.t('errors.load')
  return <div className="m-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{msg}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-raised px-1.5 py-px font-sans text-[11px] text-ink-3">{children}</kbd>
}

export function Tabs<T extends string>({ value, onChange, items, className }: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string; count?: number | null }[]
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-line-soft [scrollbar-width:none]', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            '-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] transition-colors',
            value === it.value ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink',
          )}
        >
          {it.label}
          {it.count ? <span className="tnum rounded bg-raised px-1.5 text-[11.5px] text-ink-2">{it.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
