// After-Sales home: what needs a message today (service, warranty, parts), and recently delivered cars.
import { ArrowRight, Check, Package, Settings2, ShieldCheck, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { type Reminder, useAftersalesHome, useAftersalesRole } from '@/api/aftersales'
import { buttonVariants } from '@/components/ui/button'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { EmptyState, StagePill } from '@/components/v3/bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDate, fmtMoney } from '@/lib/format'
import { useStageName } from '@/lib/stageName'
import { messageText } from '@/lib/whatsapp'
import { carName } from '@/pages/cars/CarsPage'
import { WaButton, type WaTarget, WhatsAppDialog } from './WhatsApp'

export default function AftersalesHome() {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const { company } = useCompany()
  const q = useAftersalesHome()
  const stageName = useStageName()
  const [wa, setWa] = useState<WaTarget | null>(null)
  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const { reminders, cars, owner, contact, hasWarranty, parts, offers } = q.data
  const car = new Map(cars.map((c) => [c.id!, c]))
  const service = reminders.filter((r) => r.kind === 'service')
  const warranty = reminders.filter((r) => r.kind === 'warranty')
  const arrived = reminders.filter((r) => r.kind === 'part')
  const offersTotal = offers.reduce((n, o) => n + Number(o.price ?? 0), 0)
  // Most urgent first: overdue service, then by days.
  const list = [...reminders].sort((a, b) => rank(a) - rank(b) || (a.days ?? 0) - (b.days ?? 0))

  const message = (r: Reminder) => {
    const c = car.get(r.vehicle_id!)
    const p = contact.get(r.vehicle_id!)
    if (!c || !p?.phone) return null
    const lang = p.language === 'en' ? 'en' : 'ar'
    return {
      vehicleId: c.id!, customerId: null, name: p.full_name, phone: p.phone, language: lang as 'ar' | 'en',
      kind: r.kind as 'service' | 'warranty' | 'part',
      text: messageText(r.kind as 'service', lang, {
        firstName: p.full_name.split(' ')[0], car: [c.brand, c.model].filter(Boolean).join(' '), chassis6: c.chassis_number!.slice(-6),
        company: company.name, days: r.days, dueDate: r.due_date ? fmtDate(r.due_date) : null, part: r.part_name,
      }),
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t('home.title')}</h1>
          <p className="mt-0.5 text-[14.5px] text-ink-3">{t('home.sub')}</p>
        </div>
        {role.manager && <Link to="/aftersales/settings" className={buttonVariants()}><Settings2 />{t('home.settings')}</Link>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('home.kpiService')} value={service.length} tone="warn" note={service.some((s) => s.status === 'overdue') ? t('home.overdue', { count: service.filter((s) => s.status === 'overdue').length }) : null} />
        <Kpi label={t('home.kpiWarranty')} value={warranty.length} tone="violet" note={warranty.length ? t('home.offerExtension') : null} />
        <Kpi label={t('home.kpiParts')} value={parts.length} tone="info" note={arrived.length ? t('home.arrived', { count: arrived.length }) : null} />
        {role.seesCustomers && <Kpi label={t('home.kpiOffers')} value={offers.length} tone="ok" note={offers.length ? fmtMoney(offersTotal) : null} />}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden" data-testid="needs-message">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
            <h2 className="text-[16px] font-semibold">{t('home.needs')}</h2>
            <span className="text-[13px] text-ink-3">{t('home.needsHint')}</span>
          </header>
          {list.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-ink-2">{t('home.nothing')}</p> : (
            <ul className="divide-y divide-line-soft">
              {list.map((r) => {
                const c = car.get(r.vehicle_id!)
                if (!c) return null
                const target = role.manager ? message(r) : null
                const Icon = r.kind === 'service' ? Wrench : r.kind === 'warranty' ? ShieldCheck : Package
                return (
                  <li key={`${r.kind}${r.vehicle_id}${r.part_id ?? r.warranty_kind ?? ''}`} className="flex items-center gap-3.5 px-5 py-3.5" data-reminder={r.kind} data-vehicle={c.id}>
                    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl',
                      r.kind === 'service' ? 'bg-warn/10 text-warn' : r.kind === 'warranty' ? 'bg-violet/10 text-violet' : 'bg-info/10 text-info')}><Icon className="size-4" /></span>
                    <Link to={`/aftersales/${c.id}`} className="min-w-0 flex-1">
                      <p className="font-semibold">{reminderTitle(r, t as never)}</p>
                      <p className="truncate text-[13.5px] text-ink-2">
                        {owner.get(c.id!) ?? t('home.noCustomer')} · {r.kind === 'part' ? t('home.bookFitting') : <>{carName(c)} · <span className="vin">…{c.chassis_number!.slice(-6)}</span></>}
                      </p>
                    </Link>
                    {target ? <WaButton label={t(`home.btn.${r.kind as 'service'}`)} onClick={() => setWa(target)} />
                      : role.manager && <Link to={`/aftersales/${c.id}`} className="text-[13px] font-semibold text-warn">{t('home.addCustomer')}</Link>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
            <h2 className="text-[16px] font-semibold">{t('home.recent')}</h2>
            <span className="text-[13px] text-ink-3">{t('home.recentHint')}</span>
          </header>
          {cars.length === 0 ? <EmptyState anim="empty-cars" title={t('home.noneSold')}>{t('home.noneSoldBody')}</EmptyState> : (
            <ul className="divide-y divide-line-soft">
              {cars.slice(0, 8).map((c) => {
                const who = owner.get(c.id!)
                const delivered = c.status === 'delivered'
                const at = delivered ? c.delivered_at : c.sold_at
                return (
                  <li key={c.id}>
                    <Link to={`/aftersales/${c.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-raised sm:grid-cols-[minmax(0,1fr)_auto_150px]" data-recent={c.chassis_number}>
                      <span className="min-w-0">
                        <span className="vin block truncate text-[15px] font-bold tracking-[0.03em]">{c.chassis_number}</span>
                        <span className="block truncate text-[13.5px] text-ink-2">{who ?? t('home.noCustomer')}</span>
                      </span>
                      <StagePill name={`${stageName(c)}${at ? ` ${fmtDate(at).replace(/ \d{4}$/, '')}` : ''}`} color={c.stage_color} />
                      <span className="col-span-2 text-[13px] font-semibold sm:col-span-1 sm:text-end">
                        {!role.seesCustomers ? null : !who ? <span className="inline-flex items-center gap-1 text-warn">{t('home.addCustomer')}<ArrowRight className="size-3.5 flip-rtl" /></span>
                          : !hasWarranty.has(c.id!) ? <span className="text-warn">{t('home.warrantyNotSet')}</span>
                            : <span className="inline-flex items-center gap-1 text-ok"><Check className="size-3.5" />{t('home.complete')}</span>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
      {wa && <WhatsAppDialog target={wa} onClose={() => setWa(null)} />}
    </div>
  )
}

const rank = (r: Reminder) => (r.kind === 'service' && r.status === 'overdue' ? 0 : r.kind === 'part' ? 1 : r.kind === 'service' ? 2 : 3)

export function reminderTitle(r: Pick<Reminder, 'kind' | 'days' | 'status' | 'part_name'>, t: (k: string, o?: Record<string, unknown>) => string) {
  if (r.kind === 'part') return t('home.partArrived', { part: r.part_name })
  if (r.kind === 'warranty') return t('home.warrantyEnds', { count: r.days ?? 0 })
  if (r.status === 'overdue') return (r.days ?? 0) < 0 ? t('home.serviceOverdueDays', { count: -(r.days ?? 0) }) : t('home.serviceOverdueKm')
  return t('home.serviceDueIn', { count: r.days ?? 0 })
}

function Kpi({ label, value, note, tone }: { label: string; value: number; note: string | null; tone: 'warn' | 'violet' | 'info' | 'ok' }) {
  const tones = { warn: 'bg-warn/10 text-warn', violet: 'bg-violet/10 text-violet', info: 'bg-info/10 text-info', ok: 'bg-ok/10 text-ok' }
  return (
    <div className="card p-5">
      <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{label}</p>
      <p className="tnum mt-1.5 text-[30px] font-bold" data-kpi={label}>{value}</p>
      {note && <span className={cn('mt-2 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold', tones[tone])}><span className="size-1.5 rounded-full bg-current" />{note}</span>}
    </div>
  )
}
