import { AlertTriangle, CarFront, FileWarning, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDashboard } from '@/api/vehicles'
import { PageHeader } from '@/components/AppShell'
import { buttonVariants } from '@/components/ui/button'
import { Empty, ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDateTime, fmtMoney, fmtRelative } from '@/lib/format'
import { EXPENSE_LABEL, STATUS_LABEL } from '@/lib/labels'
import type { VehicleStatus } from '@/lib/types'

const SEGMENTS: { key: 'in_stock' | 'in_garage' | 'reserved' | 'sold'; status: VehicleStatus | 'closed'; color: string; label: string }[] = [
  { key: 'in_stock', status: 'in_stock', color: 'bg-ok', label: 'In stock' },
  { key: 'reserved', status: 'reserved', color: 'bg-info', label: 'Reserved' },
  { key: 'in_garage', status: 'in_garage', color: 'bg-warn', label: 'In garage' },
  { key: 'sold', status: 'closed', color: 'bg-ink-3', label: 'Sold or delivered' },
]

export function Dashboard() {
  const { company, canWrite } = useCompany()
  const q = useDashboard()
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const { stats, added, sold, events, expenses } = q.data!
  const total = stats.total

  if (total === 0)
    return (
      <Panel>
        <Empty
          icon={<CarFront />}
          title="No vehicles yet"
          action={canWrite && (
            <div className="flex gap-2">
              <Link to="/vehicles/new" className={buttonVariants({ variant: 'primary' })}><Plus /> Add vehicle</Link>
              <Link to="/import" className={buttonVariants()}>Import from Excel</Link>
            </div>
          )}
        >
          Add your first car by its chassis number, or import your existing Excel sheet.
        </Empty>
      </Panel>
    )

  return (
    <>
      <PageHeader title="Dashboard" />

      <Panel className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="text-[13.5px] text-ink-2">
            <span className="tnum me-2 text-[32px] font-semibold tracking-tight text-ink">{total}</span>
            vehicles on record
          </p>
          <p className="text-[13.5px] text-ink-2">
            Expenses across inventory <span className="tnum ms-2 text-[15px] font-semibold text-ink">{fmtMoney(stats.expense_total, company.currency)}</span>
          </p>
        </div>
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label="Inventory by status">
          {SEGMENTS.map((s) => (stats[s.key] ? <div key={s.key} className={cn(s.color, 'h-full')} style={{ width: `${(stats[s.key] / total) * 100}%` }} /> : null))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {SEGMENTS.map((s) => (
            <Link key={s.key} to={`/vehicles?status=${s.status}`} className="group flex items-center gap-2.5 rounded-md">
              <span className={cn('size-2.5 rounded-sm', s.color)} aria-hidden />
              <span className="text-[13px] text-ink-2 group-hover:text-ink">{s.label}</span>
              <span className="tnum ms-auto text-[15px] font-semibold sm:ms-1">{stats[s.key]}</span>
            </Link>
          ))}
        </div>
      </Panel>

      {(stats.unverified_chassis > 0 || stats.unverified_documents > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {stats.unverified_chassis > 0 && (
            <Link to="/vehicles?unverified=1" className="flex items-center gap-3 rounded-lg border border-warn/25 bg-warn/[0.06] px-4 py-3 hover:bg-warn/10">
              <AlertTriangle className="size-4 text-warn" aria-hidden />
              <span className="text-[13.5px]"><b className="tnum">{stats.unverified_chassis}</b> chassis numbers not yet checked against the documents</span>
            </Link>
          )}
          {stats.unverified_documents > 0 && (
            <Link to="/documents?status=unverified" className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 hover:bg-raised">
              <FileWarning className="size-4 text-ink-2" aria-hidden />
              <span className="text-[13.5px]"><b className="tnum">{stats.unverified_documents}</b> documents awaiting verification</span>
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title="Recently added">
            <Link to="/vehicles" className="text-[13px] text-ink-2 hover:text-ink">All vehicles</Link>
          </PanelHeader>
          <ul className="divide-y divide-line-soft">
            {added.map((v) => (
              <li key={v.id}>
                <Link to={`/vehicles/${v.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised/50">
                  <VehicleThumb path={v.cover_thumbnail_path} className="h-10 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{vehicleTitle(v)}</p>
                    <Chassis value={v.chassis_number!} className="text-[12.5px] text-ink-2" />
                  </div>
                  <span className="hidden text-[12.5px] text-ink-3 sm:block">{fmtRelative(v.created_at!)}</span>
                  <StatusBadge status={v.status!} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Recently sold" />
          {sold.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">No sales recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {sold.map((v) => (
                <li key={v.id}>
                  <Link to={`/vehicles/${v.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{vehicleTitle(v)}</p>
                      <Chassis value={v.chassis_number!} className="text-[12.5px] text-ink-2" />
                    </div>
                    <span className="text-end text-[12.5px] text-ink-2">{fmtDateTime(v.sold_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Recent activity" />
          <ul className="divide-y divide-line-soft">
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/vehicles/${e.vehicle_id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-raised/50">
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p>
                      {e.event_type === 'registered' ? 'Registered' : e.event_type === 'status_change' ? <>Marked <b className="font-medium">{STATUS_LABEL[e.to_status!].toLowerCase()}</b></> : e.event_type === 'note' ? 'Note added' : e.event_type}
                      {' · '}
                      <span className="text-ink-2">{e.vehicles ? vehicleTitle(e.vehicles) : ''}</span>
                    </p>
                    {e.description && e.event_type !== 'registered' && <p className="truncate text-ink-3">{e.description}</p>}
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-3">{fmtRelative(e.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Recent expenses">
            <Link to="/expenses" className="text-[13px] text-ink-2 hover:text-ink">All expenses</Link>
          </PanelHeader>
          {expenses.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">No expenses recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {expenses.map((x) => (
                <li key={x.id}>
                  <Link to={`/vehicles/${x.vehicle_id}?tab=expenses`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px]">{x.title}</p>
                      <p className="truncate text-[12.5px] text-ink-3">{EXPENSE_LABEL[x.category]} · {x.vehicles ? vehicleTitle(x.vehicles) : ''}</p>
                    </div>
                    <span className="tnum text-[13.5px] font-medium">{fmtMoney(x.amount, x.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
