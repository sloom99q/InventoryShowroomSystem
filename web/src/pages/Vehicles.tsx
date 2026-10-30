import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, LayoutGrid, List, PackageX, Plus, SearchX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useVehicles, type VehicleFilters } from '@/api/vehicles'
import { PageHeader } from '@/components/AppShell'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel, Spinner } from '@/components/ui/misc'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'

import { fmtDate, fmtMoney, fromLocalInput } from '@/lib/format'
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'

type Column = { id: string; header: ReactNode; sort?: string; align?: 'end'; cell: (v: VehicleOverview) => ReactNode }
const PAGE_SIZE = 25

export function Vehicles() {
  const { company, canWrite } = useCompany()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try { return (localStorage.getItem('vehicles-view') as 'grid') ?? 'list' } catch { return 'list' }
  })
  const [exporting, setExporting] = useState(false)

  const filters: VehicleFilters = {
    q: params.get('q') ?? '',
    status: (params.get('status') as VehicleFilters['status']) ?? 'all',
    archived: params.get('archived') === '1',
    unverified: params.get('unverified') === '1',
    from: params.get('from') ? fromLocalInput(`${params.get('from')}T00:00`) ?? undefined : undefined,
    to: params.get('to') ? fromLocalInput(`${params.get('to')}T23:59`) ?? undefined : undefined,
    sort: { id: params.get('sort') ?? 'created_at', desc: params.get('dir') !== 'asc' },
    page: Number(params.get('page') ?? 0),
    pageSize: PAGE_SIZE,
  }
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }
  const q = useVehicles(filters)

  const columns: Column[] = [
    { id: 'thumb', header: <span className="sr-only">Photo</span>, cell: (v) => <VehicleThumb path={v.cover_thumbnail_path} className="h-10 w-14" /> },
    {
      id: 'vehicle', header: 'Vehicle', sort: 'brand',
      cell: (v) => (
        <Link to={`/vehicles/${v.id}`} onClick={(e) => e.stopPropagation()} className="block min-w-36 hover:underline">
          <p className="font-medium">{vehicleTitle(v)}</p>
          {v.trim_level && <p className="text-[12.5px] text-ink-3">{v.trim_level}</p>}
        </Link>
      ),
    },
    {
      id: 'chassis', header: 'Chassis number', sort: 'chassis_normalized',
      cell: (v) => (
        <span className="inline-flex items-center gap-2">
          <Chassis value={v.chassis_number!} highlight={filters.q || undefined} className="text-[13px]" />
          {!v.chassis_verified && <span className="size-1.5 rounded-full bg-warn" title="Chassis not yet verified against documents" />}
        </span>
      ),
    },
    { id: 'arrival', header: 'Arrived', sort: 'arrival_at', cell: (v) => <span className="tnum text-ink-2">{fmtDate(v.arrival_at)}</span> },
    { id: 'status', header: 'Status', sort: 'status', cell: (v) => <StatusBadge status={v.status!} /> },
    {
      id: 'expenses', header: 'Expenses', sort: 'expense_total', align: 'end',
      cell: (v) => <span className={cn('tnum', Number(v.expense_total) ? '' : 'text-ink-3')}>{fmtMoney(v.expense_total, company.currency, true)}</span>,
    },
    {
      id: 'accessories', header: 'Accessories',
      cell: (v) => {
        if (!v.accessory_count) return <span className="text-ink-3">Not recorded</span>
        if (v.missing_accessories) return <span className="inline-flex items-center gap-1.5 text-danger"><PackageX className="size-4" aria-hidden />{v.missing_accessories} missing</span>
        if (v.unknown_accessories) return <span className="text-warn">{v.unknown_accessories} to check</span>
        return <span className="text-ok">Complete</span>
      },
    },
  ]
  const toggleSort = (col: string) =>
    set({ sort: col, dir: filters.sort.id === col ? (filters.sort.desc ? 'asc' : null) : col === 'brand' || col === 'chassis_normalized' ? 'asc' : null })

  const count = q.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const anyFilter = filters.q || filters.status !== 'all' || filters.from || filters.to || filters.archived || filters.unverified

  async function doExport() {
    setExporting(true)
    try {
      let query = supabase.from('vehicle_overview').select('*').order('created_at', { ascending: false })
      query = filters.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
      if (filters.status === 'available') query = query.in('status', ['in_stock', 'reserved'])
      else if (filters.status === 'closed') query = query.in('status', ['sold', 'delivered'])
      else if (filters.status !== 'all') query = query.eq('status', filters.status)
      const { data, error } = await query.limit(10000)
      if (error) throw error
      const { exportVehicles } = await import('@/lib/excel')
      await exportVehicles(data as VehicleOverview[], company.currency)
      toast.success(`Exported ${data.length} vehicles`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const switchView = (v: 'list' | 'grid') => {
    setView(v)
    try { localStorage.setItem('vehicles-view', v) } catch { /* ignore */ }
  }

  return (
    <>
      <PageHeader
        title="Vehicles"
        description={q.data ? `${count} ${count === 1 ? 'vehicle' : 'vehicles'}${anyFilter ? ' match' : ''}` : undefined}
        actions={
          <>
            <Button onClick={doExport} loading={exporting}><Download /> Export to Excel</Button>
            {canWrite && <Link to="/vehicles/new" className={buttonVariants({ variant: 'primary' })}><Plus /> Add vehicle</Link>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          defaultValue={filters.q}
          key={filters.q === '' ? 'empty' : 'q'}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Filter by chassis, brand or model"
          className="w-full sm:w-72"
          aria-label="Filter vehicles"
          spellCheck={false}
        />
        <Select value={filters.status} onChange={(e) => set({ status: e.target.value === 'all' ? null : e.target.value })} className="w-auto" aria-label="Status">
          <option value="all">All statuses</option>
          <option value="available">Available (stock + reserved)</option>
          <option value="closed">Sold or delivered</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Arrived
          <Input type="date" value={params.get('from') ?? ''} onChange={(e) => set({ from: e.target.value })} className="w-auto" aria-label="Arrived from" />
          to
          <Input type="date" value={params.get('to') ?? ''} onChange={(e) => set({ to: e.target.value })} className="w-auto" aria-label="Arrived to" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 px-1 text-[13px] text-ink-2">
          <input type="checkbox" checked={filters.archived} onChange={(e) => set({ archived: e.target.checked ? '1' : null })} className="accent-[#cdb07a]" />
          Archived
        </label>
        {filters.unverified && (
          <button onClick={() => set({ unverified: null })} className="rounded-full bg-warn/10 px-3 py-1 text-[12.5px] text-warn hover:bg-warn/20">Unverified chassis only ✕</button>
        )}
        {anyFilter && <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
        <div className="ms-auto flex rounded-md border border-line p-0.5" role="group" aria-label="View">
          <Button variant="ghost" size="icon-sm" aria-pressed={view === 'list'} className={cn(view === 'list' && 'bg-raised text-ink')} onClick={() => switchView('list')} aria-label="Table view"><List /></Button>
          <Button variant="ghost" size="icon-sm" aria-pressed={view === 'grid'} className={cn(view === 'grid' && 'bg-raised text-ink')} onClick={() => switchView('grid')} aria-label="Grid view"><LayoutGrid /></Button>
        </div>
      </div>

      {q.isLoading ? <PageLoader /> : q.error ? <ErrorNote error={q.error} /> : count === 0 ? (
        <Panel>
          <Empty icon={<SearchX />} title={anyFilter ? 'No vehicles match these filters' : 'No vehicles yet'}
            action={anyFilter ? <Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : canWrite && <Link to="/vehicles/new" className={buttonVariants({ variant: 'primary' })}><Plus /> Add vehicle</Link>}>
            {filters.q ? `Nothing found for “${filters.q}”. Check the characters, or search only the last 6 digits.` : undefined}
          </Empty>
        </Panel>
      ) : view === 'list' ? (
        <>
        <Panel className="sm:hidden">
          <ul className={cn('divide-y divide-line-soft', q.isPlaceholderData && 'opacity-60')}>
            {q.data!.rows.map((v) => (
              <li key={v.id}>
                <Link to={`/vehicles/${v.id}`} className="flex items-center gap-3 px-3 py-2.5">
                  <VehicleThumb path={v.cover_thumbnail_path} className="h-12 w-16" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{vehicleTitle(v)}</p>
                    <Chassis value={v.chassis_number!} className="block truncate text-[12.5px] text-ink-2" />
                    {v.missing_accessories ? <p className="text-[12px] text-danger">{v.missing_accessories} accessories missing</p> : null}
                  </div>
                  <StatusBadge status={v.status!} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="hidden overflow-x-auto sm:block">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line-soft text-[12.5px] text-ink-3">
                {columns.map((c) => {
                  const active = c.sort && filters.sort.id === c.sort
                  return (
                    <th key={c.id} className={cn('h-10 px-3 font-medium first:ps-4', c.align === 'end' ? 'text-end' : 'text-start')}
                      aria-sort={active ? (filters.sort.desc ? 'descending' : 'ascending') : undefined}>
                      {c.sort ? (
                        <button className="inline-flex cursor-pointer items-center gap-1 hover:text-ink" onClick={() => toggleSort(c.sort!)}>
                          {c.header}
                          {active && (filters.sort.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)}
                        </button>
                      ) : c.header}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className={cn(q.isPlaceholderData && 'opacity-60')}>
              {q.data!.rows.map((v) => (
                <tr key={v.id} onClick={() => nav(`/vehicles/${v.id}`)} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-raised/50">
                  {columns.map((c) => (
                    <td key={c.id} className={cn('px-3 py-2 first:ps-4', c.align === 'end' && 'text-end')}>{c.cell(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        </>
      ) : (
        <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', q.isPlaceholderData && 'opacity-60')}>
          {q.data!.rows.map((v) => (
            <Link key={v.id} to={`/vehicles/${v.id}`} className="group overflow-hidden rounded-lg border border-line-soft bg-surface hover:border-line">
              <VehicleThumb path={v.cover_thumbnail_path} className="aspect-[16/10] w-full rounded-none" alt={vehicleTitle(v)} />
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{vehicleTitle(v)}</p>
                  <StatusBadge status={v.status!} />
                </div>
                <Chassis value={v.chassis_number!} className="mt-1 block text-[12.5px] text-ink-2" />
                <div className="mt-3 flex justify-between text-[12.5px] text-ink-3">
                  <span>Arrived {fmtDate(v.arrival_at)}</span>
                  <span className="tnum">{fmtMoney(v.expense_total, company.currency, true)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {count > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-end gap-3 text-[13px] text-ink-2">
          {q.isFetching && <Spinner className="size-4" />}
          <span className="tnum">Page {filters.page + 1} of {pages}</span>
          <Button size="icon-sm" disabled={filters.page === 0} onClick={() => set({ page: String(filters.page - 1) })} aria-label="Previous page"><ChevronLeft /></Button>
          <Button size="icon-sm" disabled={filters.page + 1 >= pages} onClick={() => set({ page: String(filters.page + 1) })} aria-label="Next page"><ChevronRight /></Button>
        </div>
      )}
    </>
  )
}
