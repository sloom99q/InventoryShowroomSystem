// Cars: chassis first, where each car is (stage), and what needs attention.
import { useQuery } from '@tanstack/react-query'
import { Archive, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStages } from '@/api/journey'
import { useStageName } from '@/lib/stageName'
import { buttonVariants } from '@/components/ui/button'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { attentionTags, daysInStock, EmptyState, StagePill, Tag } from '@/components/v3/bits'
import { VehicleThumb } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'
import { normalizeChassis } from '@/lib/vin'

type Car = VehicleOverview

function useCars(archived: boolean) {
  return useQuery({
    queryKey: ['vehicles', 'list', archived],
    queryFn: async () => {
      let q = supabase.from('vehicle_overview').select('*')
      q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
      const { data, error } = await q.order('arrival_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      return data as Car[]
    },
  })
}

/** Matches the full chassis number or any part of it (last 6 included), or brand/model. */
export function matchesSearch(v: Car, term: string) {
  const q = term.trim()
  if (!q) return true
  const c = normalizeChassis(q)
  if (c && (v.chassis_normalized ?? '').includes(c)) return true
  const words = q.toLowerCase().split(/\s+/)
  const text = `${v.brand ?? ''} ${v.model ?? ''} ${v.year ?? ''} ${v.trim_level ?? ''}`.toLowerCase()
  return words.every((w) => text.includes(w))
}

export default function CarsPage() {
  const { t } = useTranslation('cars')
  const { canWrite } = useCompany()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const stage = params.get('stage') ?? 'all'
  const archived = params.get('archived') === '1'
  const q = params.get('q') ?? ''
  const cars = useCars(archived)
  const stages = useStages()
  const stageName = useStageName()

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v === null) next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  const searched = useMemo(() => (cars.data ?? []).filter((v) => matchesSearch(v, q)), [cars.data, q])
  const shown = stage === 'all' ? searched : searched.filter((v) => v.stage_id === stage)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of searched) if (v.stage_id) m.set(v.stage_id, (m.get(v.stage_id) ?? 0) + 1)
    return m
  }, [searched])
  const attention = (cars.data ?? []).filter((v) => attentionTags(v).length).length

  if (cars.isLoading || stages.isLoading) return <PageLoader />
  if (cars.error) return <ErrorNote error={cars.error} />
  const total = cars.data?.length ?? 0

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{archived ? t('list.archivedTitle') : t('list.title')}</h1>
          <p className="mt-0.5 text-[14.5px] text-ink-3">
            {t('list.count', { count: total })}{!archived && attention > 0 && <> · {t('list.attention', { count: attention })}</>}
          </p>
        </div>
        {canWrite && !archived && (
          <Link to="/vehicles/new" className={buttonVariants({ variant: 'primary', size: 'lg' })} data-testid="add-car"><Plus /> {t('list.add')}</Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('list.filter')}>
        <Chip on={stage === 'all'} onClick={() => set('stage', null)} label={t('list.all')} count={searched.length} />
        {(stages.data ?? []).map((s) => (
          <Chip key={s.id} on={stage === s.id} onClick={() => set('stage', s.id)} label={stageName(s)} count={counts.get(s.id) ?? 0} color={s.color} />
        ))}
        <button onClick={() => { set('archived', archived ? null : '1'); }} className={cn('ms-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-3 hover:text-ink', archived && 'text-ink')}>
          <Archive className="size-3.5" /> {archived ? t('list.backToCars') : t('list.archived')}
        </button>
      </div>

      {q && (
        <p className="mb-3 text-[13.5px] text-ink-2">
          {t('list.searching', { q })} <button className="underline" onClick={() => set('q', null)}>{t('list.clearSearch')}</button>
        </p>
      )}

      {total === 0 && !archived ? (
        <div className="card">
          <EmptyState anim="empty-cars" title={t('list.emptyTitle')} action={canWrite && <Link to="/vehicles/new" className={buttonVariants({ variant: 'primary', size: 'lg' })}><Plus /> {t('list.add')}</Link>}>
            {t('list.emptyBody')}
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="card px-6 py-10 text-center text-[14px] text-ink-2">{t('list.noMatch')}</div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-start text-[14px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                  <th className="w-24 py-3 ps-4" />
                  <th className="py-3 text-start">{t('list.colChassis')}</th>
                  <th className="py-3 text-start">{t('list.colStatus')}</th>
                  <th className="py-3 text-start">{t('list.colArrived')}</th>
                  <th className="py-3 text-start">{t('list.colDays')}</th>
                  <th className="py-3 pe-4 text-start">{t('list.colAttention')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-raised" onClick={() => nav(`/vehicles/${v.id}`)} data-car={v.chassis_number}>
                    <td className="py-3 ps-4"><VehicleThumb path={v.cover_thumbnail_path} className="h-12 w-[72px] rounded-lg" /></td>
                    <td className="py-3 pe-4">
                      <Link to={`/vehicles/${v.id}`} className="vin block text-[15px] font-bold tracking-[0.04em] text-ink" onClick={(e) => e.stopPropagation()}>{v.chassis_number}</Link>
                      <span className="block text-[13.5px] text-ink-2">{carName(v)}</span>
                    </td>
                    <td className="py-3 pe-4"><StagePill name={stageName(v)} color={v.stage_color} /></td>
                    <td className="py-3 pe-4 text-ink-3">{arrived(v, t('list.today'))}</td>
                    <td className="tnum py-3 pe-4 text-ink-3">{daysInStock(v) ?? '—'}</td>
                    <td className="py-3 pe-4"><Tags v={v} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: cards, no sideways scrolling */}
          <ul className="space-y-2.5 md:hidden">
            {shown.map((v) => (
              <li key={v.id}>
                <Link to={`/vehicles/${v.id}`} className="card flex gap-3 p-3" data-car={v.chassis_number}>
                  <VehicleThumb path={v.cover_thumbnail_path} className="h-16 w-20 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="vin block truncate text-[14.5px] font-bold tracking-[0.03em]">{v.chassis_number}</span>
                    <span className="block truncate text-[13px] text-ink-2">{carName(v)}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StagePill name={stageName(v)} color={v.stage_color} />
                      <Tags v={v} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Chip({ on, onClick, label, count, color }: { on: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors',
        on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3')}>
      {color && !on && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {label}<span className={cn('tnum text-[12px]', on ? 'text-white/70' : 'text-ink-3')}>{count}</span>
    </button>
  )
}

function Tags({ v }: { v: Car }) {
  useTranslation('cars') // re-render on language change
  const tags = attentionTags(v)
  if (!tags.length && !v.labels?.length) return null
  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((g) => <Tag key={g.key} tone={g.tone}>{g.text}</Tag>)}
      {(v.labels ?? []).map((l) => <Tag key={l} tone="neutral">{l}</Tag>)}
    </span>
  )
}

export function carName(v: { brand?: string | null; model?: string | null; year?: number | null; trim_level?: string | null }) {
  const name = [v.brand?.toUpperCase(), v.model, v.year].filter(Boolean).join(' ')
  return [name, v.trim_level].filter(Boolean).join(' · ') || '—'
}

function arrived(v: Car, today: string) {
  const at = v.arrival_at ?? v.created_at
  if (!at) return '—'
  return new Date(at).toDateString() === new Date().toDateString() ? today : fmtDate(at).replace(/ \d{4}$/, '')
}
