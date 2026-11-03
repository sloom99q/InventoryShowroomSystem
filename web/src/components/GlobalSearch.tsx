import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import { searchCustomers, useAftersalesRole } from '@/api/aftersales'
import { useChassisSearch } from '@/api/vehicles'
import { formatPhone } from '@/lib/whatsapp'
import { cn } from '@/lib/cn'
import { Kbd } from './ui/misc'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from './vehicle-bits'

/** Type part of a chassis number, press Enter, land on the car. */
export function GlobalSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const { t } = useTranslation()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const res = useChassisSearch(term)
  const role = useAftersalesRole()
  const people = useQuery({
    queryKey: ['customer-search', term],
    enabled: role.seesCustomers && term.trim().length >= 2,
    queryFn: () => searchCustomers(term),
  })
  const cars = term.trim().length >= 2 ? res.data ?? [] : []
  const owners = term.trim().length >= 2 && role.seesCustomers ? people.data ?? [] : []
  // One list for the keyboard: cars first, then customers (they open the After-Sales page).
  const rows: { key: string; to: string }[] = [
    ...cars.map((v) => ({ key: `v${v.id}`, to: `/vehicles/${v.id}` })),
    ...owners.map((o) => ({ key: `c${o.customer_id}${o.vehicle_id}`, to: `/aftersales/${o.vehicle_id}` })),
  ]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement).tagName))) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (to: string) => {
    setOpen(false)
    setTerm('')
    input.current?.blur()
    nav(to)
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        ref={input}
        autoFocus={autoFocus}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter' && rows[active]) go(rows[active].to)
          if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
        }}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls="global-search-results"
        autoComplete="off"
        spellCheck={false}
        className="h-[42px] w-full rounded-xl border border-line bg-surface ps-10 pe-14 text-[15px] placeholder:text-ink-3 focus:border-ink focus:outline-none"
      />
      <span className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 sm:block"><Kbd>⌘K</Kbd></span>
      {open && term.trim().length >= 2 && (
        <div id="global-search-results" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/15">
          {rows.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-ink-2">{res.isFetching || people.isFetching ? t('search.searching') : t('search.noMatch', { term })}</p>
          ) : (<>
            {cars.map((v, i) => (
              <button
                key={v.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(`/vehicles/${v.id}`)}
                onMouseEnter={() => setActive(i)}
                className={cn('flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start', i === active && 'bg-raised')}
              >
                <VehicleThumb path={v.cover_thumbnail_path} className="h-9 w-12" />
                <div className="min-w-0 flex-1">
                  <Chassis value={v.chassis_number!} highlight={term} className="block text-[13px]" />
                  <span className="block truncate text-[12.5px] text-ink-2">{vehicleTitle(v)}{v.archived_at ? ` · ${t('search.archived')}` : ''}</span>
                </div>
                <StatusBadge status={v.status!} />
              </button>
            ))}
            {owners.map((o, j) => {
              const i = cars.length + j
              return (
                <button key={`${o.customer_id}${o.vehicle_id}`} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(`/aftersales/${o.vehicle_id}`)} onMouseEnter={() => setActive(i)}
                  className={cn('flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start', i === active && 'bg-raised')}>
                  <span className="flex h-9 w-12 items-center justify-center rounded-md bg-hover text-ink-3"><UserRound className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{o.customer.full_name} <span className="font-normal text-ink-3" dir="ltr">{formatPhone(o.customer.phone)}</span></span>
                    <span className="block truncate text-[12.5px] text-ink-2"><span className="vin">{o.vehicles.chassis_number}</span> · {vehicleTitle(o.vehicles)}</span>
                  </div>
                </button>
              )
            })}
          </>)}
        </div>
      )}
    </div>
  )
}
