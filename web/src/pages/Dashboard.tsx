import { AlertTriangle, CarFront, FileWarning, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useDashboard } from '@/api/vehicles'
import { PageHeader } from '@/components/AppShell'
import { buttonVariants } from '@/components/ui/button'
import { Empty, ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { intlLocale } from '@/i18n'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDateTime, fmtMoney, fmtRelative } from '@/lib/format'
import { EXPENSE_LABEL, STATUS_LABEL } from '@/lib/labels'
import type { VehicleStatus } from '@/lib/types'

const SEGMENTS: { key: 'in_stock' | 'reserved' | 'in_garage' | 'sold'; status: VehicleStatus | 'closed'; color: string }[] = [
  { key: 'in_stock', status: 'in_stock', color: 'bg-ok' },
  { key: 'reserved', status: 'reserved', color: 'bg-info' },
  { key: 'in_garage', status: 'in_garage', color: 'bg-warn' },
  { key: 'sold', status: 'closed', color: 'bg-neutral' },
]

export function Dashboard() {
  const { t, i18n } = useTranslation(['pages', 'common'])
  const { company, canWrite } = useCompany()
  const q = useDashboard()
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const { stats, added, sold, events, expenses } = q.data!
  const total = stats.total
  const pct = (n: number) => new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(total ? n / total : 0)

  if (total === 0)
    return (
      <Panel>
        <Empty
          icon={<CarFront />}
          title={t('dashboard.emptyTitle')}
          action={canWrite && (
            <div className="flex gap-2">
              <Link to="/vehicles/new" className={buttonVariants({ variant: 'primary' })}><Plus /> {t('common:actions.addVehicle')}</Link>
              <Link to="/import" className={buttonVariants()}>{t('dashboard.importExcel')}</Link>
            </div>
          )}
        >
          {t('dashboard.emptyBody')}
        </Empty>
      </Panel>
    )

  return (
    <>
      <PageHeader title={t('dashboard.title')} description={t('dashboard.onRecord', { count: total })} />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title={t('dashboard.inventory')}>
            <Link to="/vehicles" className="text-[13px] text-ink-2 hover:text-ink">{t('dashboard.allVehicles')}</Link>
          </PanelHeader>
          <div className="px-4 pt-4">
            <div className="flex h-2 overflow-hidden rounded-sm bg-raised" role="img" aria-label={t('dashboard.inventoryByStatus')}>
              {SEGMENTS.map((s) => (stats[s.key] ? <div key={s.key} className={cn(s.color, 'h-full')} style={{ width: `${(stats[s.key] / total) * 100}%` }} /> : null))}
            </div>
          </div>
          <table className="mt-2 w-full text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-ink-3">
                <th className="h-9 px-4 text-start font-medium">{t('dashboard.status')}</th>
                <th className="px-4 text-end font-medium">{t('dashboard.vehicles')}</th>
                <th className="px-4 text-end font-medium">{t('dashboard.share')}</th>
              </tr>
            </thead>
            <tbody>
              {SEGMENTS.map((s) => (
                <tr key={s.key} className="border-t border-line-soft">
                  <td className="px-4 py-2">
                    <Link to={`/vehicles?status=${s.status}`} className="inline-flex items-center gap-2.5 hover:underline">
                      <span className={cn('size-2.5 rounded-[2px]', s.color)} aria-hidden />
                      {t(`dashboard.segment.${s.key}`)}
                    </Link>
                  </td>
                  <td className="tnum px-4 text-end font-medium">{stats[s.key]}</td>
                  <td className="tnum px-4 text-end text-ink-2">{pct(stats[s.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="flex items-center justify-between gap-4 px-4 py-3.5">
            <span className="text-[13.5px] text-ink-2">{t('dashboard.expensesTotal')}</span>
            <Link to="/expenses" className="tnum text-[16px] font-semibold hover:underline">{fmtMoney(stats.expense_total, company.currency)}</Link>
          </Panel>
          {stats.unverified_chassis > 0 && (
            <Link to="/vehicles?unverified=1" className="flex items-center gap-3 rounded-lg border border-line-soft border-s-[3px] border-s-warn bg-surface px-4 py-3 hover:bg-hover">
              <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
              <span className="text-[13.5px]">{t('dashboard.unverifiedChassis', { count: stats.unverified_chassis })}</span>
            </Link>
          )}
          {stats.unverified_documents > 0 && (
            <Link to="/documents?status=unverified" className="flex items-center gap-3 rounded-lg border border-line-soft border-s-[3px] border-s-info bg-surface px-4 py-3 hover:bg-hover">
              <FileWarning className="size-4 shrink-0 text-info" aria-hidden />
              <span className="text-[13.5px]">{t('dashboard.unverifiedDocs', { count: stats.unverified_documents })}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader title={t('dashboard.recentlyAdded')}>
            <Link to="/vehicles" className="text-[13px] text-ink-2 hover:text-ink">{t('dashboard.allVehicles')}</Link>
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
          <PanelHeader title={t('dashboard.recentlySold')} />
          {sold.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">{t('dashboard.noSales')}</p>
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
          <PanelHeader title={t('dashboard.recentActivity')} />
          <ul className="divide-y divide-line-soft">
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/vehicles/${e.vehicle_id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-raised/50">
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p>
                      {e.event_type === 'registered' ? t('dashboard.registered') : e.event_type === 'status_change' ? t('dashboard.markedAs', { status: i18n.language === 'en' ? STATUS_LABEL[e.to_status!].toLowerCase() : STATUS_LABEL[e.to_status!] }) : e.event_type === 'note' ? t('dashboard.noteAdded') : e.event_type}
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
          <PanelHeader title={t('dashboard.recentExpenses')}>
            <Link to="/expenses" className="text-[13px] text-ink-2 hover:text-ink">{t('dashboard.allExpenses')}</Link>
          </PanelHeader>
          {expenses.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-3">{t('dashboard.noExpenses')}</p>
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
