// Accessories: one tile per item. −/+ sets the quantity; 1 or more is Present, 0 is Missing.
import { BookOpen, Cable, CreditCard, KeyRound, Package, Plug, Plus, RectangleVertical, Smartphone, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tr } from '@/components/v3/bits'
import { toast } from 'sonner'
import { ACCESSORY_CATALOGUE, useSetQuantity } from '@/api/journey'
import { useAccessories, useDeleteAccessory } from '@/api/records'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import type { Database } from '@/lib/database.types'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'

type Row = Database['public']['Tables']['accessories']['Row']
const ICONS: Record<string, LucideIcon> = { remote: Smartphone, key: KeyRound, card: CreditCard, plug: Plug, cable: Cable, mats: RectangleVertical, book: BookOpen, triangle: TriangleAlert }

type Tile = { key: string; type: Row['item_type']; name: string; hint: string; icon: LucideIcon; row?: Row; custom: boolean }

function useTiles(rows: Row[]) {
  const { t } = useTranslation('cars')
  const used = new Set<string>()
  const tiles: Tile[] = ACCESSORY_CATALOGUE.map((c) => {
    const row = rows.find((r) => r.item_type === c.type && !used.has(r.id))
    if (row) used.add(row.id)
    return { key: c.type, type: c.type, name: tr(t, `acc.item.${c.type}`), hint: tr(t, `acc.hint.${c.type}`), icon: ICONS[c.icon], row, custom: false }
  })
  for (const r of rows) if (!used.has(r.id)) tiles.push({ key: r.id, type: r.item_type, name: r.item_name, hint: t('acc.custom'), icon: Package, row: r, custom: true })
  return tiles
}

/** Summary for the tab badge and the ring. */
export function accessorySummary(rows: Row[]) {
  const catalogue = new Set(ACCESSORY_CATALOGUE.map((c) => c.type))
  const seen = new Set<string>()
  const relevant = rows.filter((r) => {
    if (r.item_type === 'other') return true
    if (!catalogue.has(r.item_type) || seen.has(r.item_type)) return false
    seen.add(r.item_type)
    return true
  })
  const total = ACCESSORY_CATALOGUE.length + relevant.filter((r) => r.item_type === 'other').length
  const present = relevant.filter((r) => r.status === 'present').length
  const missing = relevant.filter((r) => r.status === 'missing')
  return { total, present, missing, checked: relevant.filter((r) => r.status !== 'unknown').length }
}

export function AccessoriesPane({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const q = useAccessories(v.id!)
  const { canWrite } = useCompany()
  const tiles = useTiles(q.data ?? [])
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const present = tiles.filter((x) => x.row?.status === 'present').length
  const missing = tiles.filter((x) => x.row?.status === 'missing')
  const unchecked = tiles.filter((x) => !x.row || x.row.status === 'unknown').length
  const pct = tiles.length ? present / tiles.length : 0
  const tone = missing.length ? 'var(--warn)' : unchecked ? 'var(--ink-3)' : 'var(--ok)'
  return (
    <div className="space-y-4">
      <section className="card flex items-center gap-5 p-5">
        <svg viewBox="0 0 44 44" className="size-14 shrink-0 -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" strokeWidth="5" />
          <circle cx="22" cy="22" r="18" fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${pct * 113.1} 113.1`} className="transition-[stroke-dasharray] duration-500" />
        </svg>
        <div>
          <p className="text-[17px] font-semibold" data-testid="acc-summary">{t('acc.summary', { present, total: tiles.length })}</p>
          <p className="text-[14px] text-ink-2">
            {missing.length ? t('acc.missingList', { items: missing.map((m) => m.name).join(', ') })
              : unchecked ? t('acc.unchecked', { count: unchecked }) : t('acc.allPresent')}
          </p>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((x) => <AccessoryTile key={x.key} v={v} tile={x} canWrite={canWrite} />)}
        {canWrite && <AddTile v={v} />}
      </div>
    </div>
  )
}

function AccessoryTile({ v, tile, canWrite }: { v: VehicleOverview; tile: Tile; canWrite: boolean }) {
  const { t } = useTranslation('cars')
  const set = useSetQuantity(v.id!)
  const del = useDeleteAccessory(v.id!)
  const qty = tile.row?.quantity
  const status = tile.row?.status ?? 'unknown'
  const change = (n: number) => set.mutate({ id: tile.row?.id?.startsWith('tmp-') ? undefined : tile.row?.id, type: tile.type, name: tile.row?.item_name ?? tile.name, quantity: n },
    { onError: (e) => toast.error(friendlyError(e)) })
  const Icon = tile.icon
  return (
    <div className={cn('card relative flex flex-col p-4 transition-colors', status === 'missing' && 'border-danger/40 bg-danger/[0.03]')} data-accessory={tile.type === 'other' ? tile.name : tile.type}>
      <span className={cn('mb-3 flex size-12 items-center justify-center rounded-xl', status === 'missing' ? 'bg-danger/10 text-danger' : status === 'present' ? 'bg-ok/10 text-ok' : 'bg-hover text-ink-3')}>
        <Icon className="size-5" />
      </span>
      <p className="font-semibold leading-tight">{tile.name}</p>
      <p className="mt-0.5 text-[13px] text-ink-3">{tile.hint}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-9 items-center rounded-lg border border-line" role="group" aria-label={t('acc.quantityOf', { item: tile.name })}>
          <button disabled={!canWrite || (qty ?? 0) <= 0 && qty !== null && qty !== undefined} onClick={() => change((qty ?? 1) - 1)} aria-label={t('acc.less', { item: tile.name })}
            className="flex h-full w-8 items-center justify-center text-[18px] text-ink-2 hover:text-ink disabled:opacity-30">−</button>
          <span className="tnum w-6 text-center text-[15px] font-semibold" aria-live="polite">{qty ?? '–'}</span>
          <button disabled={!canWrite || (qty ?? 0) >= 99} onClick={() => change((qty ?? 0) + 1)} aria-label={t('acc.more', { item: tile.name })}
            className="flex h-full w-8 items-center justify-center text-[18px] text-ink-2 hover:text-ink disabled:opacity-30">+</button>
        </div>
        <span className={cn('rounded-md px-2 py-1 text-[12px] font-semibold', status === 'present' ? 'bg-ok/10 text-ok' : status === 'missing' ? 'bg-danger/10 text-danger' : 'bg-hover text-ink-3')}>
          {t(`acc.status.${status}`)}
        </span>
      </div>
      {tile.custom && canWrite && tile.row && (
        <button onClick={() => del.mutate(tile.row!.id, { onError: (e) => toast.error(friendlyError(e)) })} aria-label={t('acc.remove', { item: tile.name })}
          className="absolute end-2 top-2 flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-danger"><Trash2 className="size-4" /></button>
      )}
    </div>
  )
}

function AddTile({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const set = useSetQuantity(v.id!)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (n) set.mutate({ type: 'other', name: n, quantity: 1 }, { onError: (e) => toast.error(friendlyError(e)) })
    setName('')
    setOpen(false)
  }
  return open ? (
    <form className="card flex flex-col justify-center gap-2 p-4" onSubmit={(e) => { e.preventDefault(); add() }}>
      <label className="text-[13px] font-semibold text-ink-2" htmlFor="new-accessory">{t('acc.newName')}</label>
      <input id="new-accessory" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={add} maxLength={60}
        onKeyDown={(e) => { if (e.key === 'Escape') { setName(''); setOpen(false) } }}
        className="h-10 rounded-lg border border-accent px-2.5 outline-none" placeholder={t('acc.newPh')} />
    </form>
  ) : (
    <button onClick={() => setOpen(true)} className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-line text-[15px] font-medium text-ink-3 hover:border-ink-3 hover:text-ink-2">
      <Plus className="size-6" />{t('acc.addItem')}
    </button>
  )
}
