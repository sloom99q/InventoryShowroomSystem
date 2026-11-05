// A sold car in After-Sales: chassis first, the owner, and five tabs —
// customer & handover, warranty, service, parts, what they may need.
import { ArrowLeft, ArrowRight, Box, Camera, Check, ChevronLeft, Copy, Droplet, Package, Phone, Plug, Plus, RectangleVertical, ShieldCheck, Sparkles, Sun, Tag, UserRound, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import {
  type CatalogueItem, type Customer, type PartRequest, useAftersalesCar, useAftersalesRole, useCatalogue, useFindCustomerByPhone, useLogService,
  useOffers, useRequestPart, useSaveCustomer, useSaveWarranty, useSetOwner, useSetPartStatus, type Warranty,
} from '@/api/aftersales'
import { useAccessories, useImages, useUploadImages } from '@/api/records'
import { useVehicle } from '@/api/vehicles'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { InlineText, StagePill, Tag as Pill, tr } from '@/components/v3/bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useSignedUrl } from '@/lib/files'
import { fmtDate, fmtDateTime, fmtMoney, parseAmount, todayDubai } from '@/lib/format'
import { useStageName } from '@/lib/stageName'
import { friendlyError, supabase } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'
import { formatPhone, messageText, normalizePhone } from '@/lib/whatsapp'
import { Avatar, DueBar, Gauge, Guide, partIcon } from './visuals'
import { WarrantyDocs } from './WarrantyDocs'
import { WaButton, type WaTarget, WhatsAppDialog } from './WhatsApp'

const TABS = ['customer', 'warranty', 'service', 'parts', 'offers'] as const
type Tab = (typeof TABS)[number]
const ICON: Record<string, LucideIcon> = { plug: Plug, shield: ShieldCheck, sparkles: Sparkles, sun: Sun, droplet: Droplet, mats: RectangleVertical, box: Box, tag: Tag }

/** Names of staff (technician, who sold it). */
function useStaffNames() {
  return useQuery({
    queryKey: ['staff-names'],
    staleTime: 300_000,
    queryFn: async () => new Map(((await supabase.from('profiles').select('id, full_name')).data ?? []).map((p) => [p.id, p.full_name ?? ''])),
  })
}

export default function AftersalesCar() {
  const { t } = useTranslation('aftersales')
  const { id } = useParams<{ id: string }>()
  const role = useAftersalesRole()
  const car = useVehicle(id)
  const q = useAftersalesCar(id!)
  const [params, setParams] = useSearchParams()
  const tabs = role.seesCustomers ? TABS : (['service', 'parts'] as const)
  const tab = ((tabs as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab') : tabs[0]) as Tab
  const [wa, setWa] = useState<WaTarget | null>(null)
  const { company } = useCompany()
  if (car.isLoading || q.isLoading) return <PageLoader />
  if (car.error || !car.data) return <ErrorNote error={car.error} />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const v = car.data
  const d = q.data
  const c = d.customer
  const lang: 'ar' | 'en' = c?.language === 'en' ? 'en' : 'ar'
  const say = (kind: WaTarget['kind'], extra: { days?: number | null; dueDate?: string | null; part?: string | null; offer?: string | null } = {}) => {
    if (!c?.phone) { toast.error(t('wa.noPhone')); return }
    setWa({
      vehicleId: v.id!, customerId: c.id, name: c.full_name, phone: c.phone, language: lang, kind,
      text: messageText(kind, lang, { firstName: c.full_name.split(' ')[0], car: [v.brand, v.model].filter(Boolean).join(' '), chassis6: v.chassis_number!.slice(-6), company: company.name, ...extra }),
    })
  }
  const open = d.parts.filter((p) => !['fitted', 'cancelled'].includes(p.status)).length
  const mainWarranty = d.warranties.find((w) => w.kind === 'vehicle') ?? d.warranties[0]
  const left = mainWarranty ? timeLeft(mainWarranty) : null
  const badges: Record<Tab, React.ReactNode> = {
    customer: null,
    warranty: left ? <Badge>{left.label(t as never)}</Badge> : null,
    service: d.next?.status === 'overdue' ? <Badge tone="danger">{t('service.overdue')}</Badge> : d.next?.status === 'due_soon' ? <Badge tone="warn">{t('service.dueSoon')}</Badge> : null,
    parts: open ? <Badge>{t('parts.open', { count: open })}</Badge> : null,
    offers: d.offers.length ? <Badge>{d.offers.length}</Badge> : null,
  }

  return (
    <div className="mx-auto max-w-[1240px]">
      <Link to="/aftersales" className="mb-5 inline-flex items-center gap-1.5 text-[14.5px] text-ink-2 hover:text-ink"><ChevronLeft className="size-4 flip-rtl" />{t('home.title')}</Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Hero v={v} d={d} left={left} />
        {role.seesCustomers
          ? (c ? <OwnerCard c={c} onWhatsApp={() => say('free')} /> : role.manager ? <NewOwner vehicleId={v.id!} /> : <section className="card p-6 text-[14px] text-ink-2">{t('owner.none')}</section>)
          : <section className="card p-6"><p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('owner.label')}</p><p className="mt-1.5 text-[20px] font-semibold">{d.ownerName ?? '—'}</p></section>}
      </div>

      <div role="tablist" className="mt-7 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}
            className={cn('-mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 px-3.5 text-[15px] font-medium whitespace-nowrap',
              tab === k ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink-2')}>
            {t(`tab.${k}`)}{badges[k]}
          </button>
        ))}
      </div>
      <div className="pt-5" role="tabpanel">
        {tab === 'customer' && c && <CustomerTab v={v} c={c} soldBy={(d as { soldBy?: string | null }).soldBy ?? null} />}
        {tab === 'customer' && !c && <div className="card"><Guide icon={UserRound} title={t('empty.customerTitle')} body={t('empty.customerBody')} /></div>}
        {tab === 'warranty' && <WarrantyTab v={v} warranties={d.warranties} customer={c} lastKm={d.next?.last_km ?? v.mileage_km ?? 0} />}
        {tab === 'service' && <ServiceTab v={v} d={d} onRemind={() => say('service', { days: d.next?.days_left, dueDate: d.next?.due_date ? fmtDate(d.next.due_date) : null })} />}
        {tab === 'parts' && <PartsTab v={v} parts={d.parts} onNotify={(p) => say('part', { part: p.name })} />}
        {tab === 'offers' && <OffersTab v={v} offers={d.offers} onOffer={(name) => say('offer', { offer: name })} />}
      </div>
      {wa && <WhatsAppDialog target={wa} onClose={() => setWa(null)} />}
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'danger' | 'warn' }) {
  return <span className={cn('tnum rounded-md px-1.5 py-px text-[12px] font-semibold', tone === 'danger' ? 'bg-danger/10 text-danger' : tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-hover text-ink-2')}>{children}</span>
}

export function warrantyEnd(w: Pick<Warranty, 'start_date' | 'years'>) {
  const d = new Date(w.start_date + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + w.years)
  return d.toISOString().slice(0, 10)
}
function timeLeft(w: Warranty) {
  const end = new Date(warrantyEnd(w) + 'T00:00:00Z').getTime()
  const now = new Date(todayDubai() + 'T00:00:00Z').getTime()
  const days = Math.round((end - now) / 86_400_000)
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30.44)
  return { days, label: (t: (k: string, o?: object) => string) => (days < 0 ? t('warranty.ended') : y ? t('warranty.leftYM', { y, m }) : t('warranty.leftDays', { count: days })) }
}

// --- Hero and owner ---------------------------------------------------------------------

function Hero({ v, d, left }: { v: VehicleOverview; d: NonNullable<ReturnType<typeof useAftersalesCar>['data']>; left: ReturnType<typeof timeLeft> | null }) {
  const { t } = useTranslation('aftersales')
  const stageName = useStageName()
  const [copied, setCopied] = useState(false)
  const cover = useSignedUrl(v.cover_thumbnail_path)
  const handed = v.delivered_at ?? v.sold_at
  return (
    <section className="card flex flex-col overflow-hidden sm:flex-row">
      <Link to={`/vehicles/${v.id}?tab=photos`} className="relative block h-48 shrink-0 bg-gradient-to-br from-[#c5ccd6] to-[#8f99a8] sm:h-auto sm:w-[300px]" aria-label={t('hero.photos')}>
        {cover.data ? <img src={cover.data} alt="" className="absolute inset-0 size-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-white/80"><Camera className="size-8" /></span>}
      </Link>
      <div className="min-w-0 flex-1 p-6 sm:p-7">
        <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('hero.chassis')}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="vin text-[24px] font-bold tracking-[0.08em] break-all sm:text-[30px]" data-testid="chassis-hero">{v.chassis_number}</h1>
          <button onClick={async () => { try { await navigator.clipboard.writeText(v.chassis_number!) } catch { /* plain http */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-hover" aria-label={t('hero.copy')}>
            {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
          </button>
          <Link to={`/vehicles/${v.id}`} className="ms-auto text-[13.5px] font-medium text-ink-2 hover:text-ink">{t('hero.inventory')}</Link>
        </div>
        <p className="mt-3 text-[18px] sm:text-[20px]">
          <span className="font-semibold">{[v.brand?.toUpperCase(), v.model, v.year].filter(Boolean).join(' ')}</span>
          <span className="text-ink-3">{[v.trim_level, handed ? t(v.status === 'delivered' ? 'hero.delivered' : 'hero.sold', { date: fmtDate(handed) }) : null].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StagePill name={stageName(v)} color={v.stage_color} />
          {left && (left.days >= 0 ? <Pill tone="ok">● {t('hero.underWarranty')}</Pill> : <Pill tone="neutral">{t('warranty.ended')}</Pill>)}
          {d.next?.status === 'overdue' && <Pill tone="warn">{t('hero.serviceOverdue')}</Pill>}
          {d.next?.status === 'due_soon' && <Pill tone="warn">{t('hero.serviceDueSoon')}</Pill>}
        </div>
      </div>
    </section>
  )
}

function OwnerCard({ c, onWhatsApp }: { c: Customer; onWhatsApp: () => void }) {
  const { t } = useTranslation('aftersales')
  return (
    <section className="card p-6" data-testid="owner-card">
      <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('owner.label')}</p>
      <div className="mt-3 flex items-center gap-3.5">
        <Avatar name={c.full_name} />
        <div className="min-w-0">
          <p className="truncate text-[20px] font-bold">{c.full_name}</p>
          <p className="text-[14px] text-ink-2"><span dir="ltr">{formatPhone(c.phone) || t('owner.noPhone')}</span> · {t(`lang.${c.language as 'ar'}`)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {c.phone && <WaButton solid label={t('owner.whatsapp')} onClick={onWhatsApp} />}
        {c.phone && <a href={`tel:${c.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3.5 text-[14px] font-semibold hover:bg-hover"><Phone className="size-4" />{t('owner.call')}</a>}
      </div>
    </section>
  )
}

function NewOwner({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation('aftersales')
  const set = useSetOwner(vehicleId)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const p = normalizePhone(phone)
  const existing = useFindCustomerByPhone(p)
  const INPUT = 'h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink'
  const save = (customerId?: string) => set.mutate(customerId ? { customerId } : { customer: { full_name: name.trim(), phone: p, language: lang } }, {
    onSuccess: () => toast.success(t('owner.added')),
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <section className="card p-6" data-testid="new-owner">
      <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('owner.label')}</p>
      <p className="mt-1 text-[14px] text-ink-2">{t('owner.addHint')}</p>
      <form className="mt-3 space-y-2.5" onSubmit={(e) => { e.preventDefault(); if (name.trim() && (!phone || p)) save() }}>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('owner.name')} aria-label={t('owner.name')} />
        <input className={cn(INPUT, phone && !p && 'border-danger')} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050 555 0142" aria-label={t('owner.mobile')} inputMode="tel" dir="ltr" />
        {existing.data && (
          <button type="button" onClick={() => save(existing.data!.id)} className="w-full rounded-xl bg-info/10 px-3 py-2 text-start text-[13.5px] text-info">
            {t('owner.useExisting', { name: existing.data.full_name })}
          </button>
        )}
        <div className="flex gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value as 'ar' | 'en')} className={cn(INPUT, 'w-auto')} aria-label={t('customer.language')}>
            <option value="ar">{t('lang.ar')}</option><option value="en">{t('lang.en')}</option>
          </select>
          <Button variant="primary" size="lg" type="submit" className="flex-1" loading={set.isPending} disabled={!name.trim() || (!!phone && !p)}>{t('owner.save')}</Button>
        </div>
      </form>
    </section>
  )
}

// --- Customer & handover ---------------------------------------------------------------------

function Section({ title, titleAr, children, className }: { title: string; titleAr: string; children: React.ReactNode; className?: string }) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  return (
    <section className={cn('card overflow-hidden', className)}>
      <h3 className="flex items-baseline justify-between gap-3 border-b border-line bg-raised px-5 py-3.5 text-[12.5px] font-semibold tracking-[0.1em] text-ink-2 uppercase">
        <span>{ar ? titleAr : title}</span><span className="text-[13px] font-medium tracking-normal normal-case text-ink-3">{ar ? title : titleAr}</span>
      </h3>
      {children}
    </section>
  )
}
const ROW = 'grid gap-x-6 px-5 py-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center'

function CustomerTab({ v, c, soldBy }: { v: VehicleOverview; c: Customer; soldBy: string | null }) {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const save = useSaveCustomer(v.id!)
  const names = useStaffNames()
  const set = (patch: Partial<Customer>) => save.mutateAsync({ id: c.id, patch })
  const rows: { key: keyof Customer; label: string; display?: string; validate?: (x: string) => string | null; transform?: (x: string) => string | null; dir?: 'ltr' }[] = [
    { key: 'full_name', label: t('customer.name'), validate: (x) => (x ? null : t('customer.nameRequired')) },
    { key: 'phone', label: t('customer.mobile'), display: formatPhone(c.phone), dir: 'ltr', validate: (x) => (!x || normalizePhone(x) ? null : t('customer.badPhone')), transform: (x) => normalizePhone(x) },
    { key: 'email', label: t('customer.email'), dir: 'ltr' },
    { key: 'id_number', label: t('customer.idNumber'), dir: 'ltr' },
    { key: 'emirate', label: t('customer.emirate') },
  ]
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Section title="Customer" titleAr="العميل">
        <div className="divide-y divide-line-soft" data-testid="customer-fields">
          {rows.map((r) => (
            <div key={r.key} className={ROW}>
              <span className="text-[14px] text-ink-2">{r.label}</span>
              <InlineText id={`cust-${r.key}`} label={r.label} value={String(c[r.key] ?? '')} display={r.display} dir={r.dir} disabled={!role.manager} validate={r.validate}
                onSave={(x) => set({ [r.key]: x ? (r.transform ? r.transform(x) : x) : (r.key === 'full_name' ? c.full_name : null) } as Partial<Customer>)} />
            </div>
          ))}
          <div className={ROW}>
            <span className="text-[14px] text-ink-2">{t('customer.language')}</span>
            <select value={c.language} disabled={!role.manager} onChange={(e) => void set({ language: e.target.value })} aria-label={t('customer.language')}
              className="h-9 w-40 rounded-lg border border-line bg-surface px-2 text-[14px]">
              <option value="ar">{t('lang.ar')}</option><option value="en">{t('lang.en')}</option>
            </select>
          </div>
          <div className={ROW}><span className="text-[14px] text-ink-2">{t('customer.soldBy')}</span><span className="text-[14.5px]">{(soldBy && names.data?.get(soldBy)) || '—'}</span></div>
        </div>
      </Section>
      <div className="space-y-5">
        <Handover v={v} />
        <DeliveryPhoto v={v} />
      </div>
    </div>
  )
}

function Handover({ v }: { v: VehicleOverview & { handover_checked_at?: string | null; handover_checked_by?: string | null } }) {
  const { t } = useTranslation(['aftersales', 'cars'])
  const acc = useAccessories(v.id!)
  const names = useStaffNames()
  const { canWrite } = useCompany()
  const items = (acc.data ?? []).filter((a) => a.status === 'present')
  const check = async () => {
    const { error } = await supabase.rpc('check_handover', { p_vehicle_id: v.id! })
    if (error) toast.error(friendlyError(error)); else toast.success(t('handover.checked'))
  }
  return (
    <Section title="Handed over with the car" titleAr="ما تم تسليمه">
      <div className="flex flex-wrap gap-2 p-5" data-testid="handover-items">
        {items.length ? items.map((a) => (
          <span key={a.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ok/10 px-3 text-[14px] font-semibold text-ok">
            {a.item_type === 'other' ? a.item_name : tr(t, `cars:acc.item.${a.item_type}`)}{(a.quantity ?? 1) > 1 ? ` ×${a.quantity}` : ''}
          </span>
        )) : <span className="text-[14px] text-ink-3">{t('handover.none')}</span>}
      </div>
      <div className="border-t border-line-soft px-5 py-3.5 text-[14px]">
        {v.handover_checked_at
          ? <span className="inline-flex items-center gap-1.5 font-semibold text-ok"><Check className="size-4" />{t('handover.checkedLine', { date: fmtDateTime(v.handover_checked_at), name: (v.handover_checked_by && names.data?.get(v.handover_checked_by)) || '—' })}</span>
          : canWrite ? <Button size="sm" onClick={check}><Check />{t('handover.check')}</Button> : <span className="text-ink-3">{t('handover.notChecked')}</span>}
      </div>
    </Section>
  )
}

function DeliveryPhoto({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('aftersales')
  const { company, canWrite } = useCompany()
  const imgs = useImages(v.id!)
  const up = useUploadImages(company.id, v.id!)
  const photo = (imgs.data ?? []).find((i) => (i.image_type as string) === 'delivery' && !i.superseded_at)
  const url = useSignedUrl(photo?.thumbnail_path ?? photo?.storage_path)
  return (
    <Section title="Delivery photo" titleAr="صورة التسليم">
      <div className="p-5">
        {photo ? (
          <div className="relative aspect-[16/7] overflow-hidden rounded-xl bg-hover">
            {url.data && <img src={url.data} alt={t('handover.photoAlt')} className="size-full object-cover" />}
            <span className="absolute start-3 bottom-3 rounded-lg bg-surface/95 px-2.5 py-1 text-[13px] font-semibold">{t('handover.photoCaption', { date: fmtDate(photo.uploaded_at) })}</span>
          </div>
        ) : canWrite ? (
          <label className="flex aspect-[16/7] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line text-[14px] text-ink-2 hover:border-ink-3">
            <Plus className="size-5" />{up.isPending ? t('handover.uploading') : t('handover.addPhoto')}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (f) up.mutate({ files: [f], type: 'delivery' as never }, { onError: (err) => toast.error(friendlyError(err)) })
            }} />
          </label>
        ) : <p className="text-[14px] text-ink-3">{t('handover.noPhoto')}</p>}
      </div>
    </Section>
  )
}

// --- Warranty ----------------------------------------------------------------------------

function WarrantyTab({ v, warranties, customer, lastKm }: { v: VehicleOverview; warranties: Warranty[]; customer: Customer | null; lastKm: number }) {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const { company } = useCompany()
  const save = useSaveWarranty(v.id!)
  const start = (v.delivered_at ?? v.sold_at ?? new Date().toISOString()).slice(0, 10)
  const add = (kind: 'vehicle' | 'extended') => save.mutate({ patch: { kind, start_date: kind === 'extended' ? warrantyEnd(warranties.find((w) => w.kind === 'vehicle') ?? { start_date: start, years: 0 }) : start, years: kind === 'extended' ? 2 : 5, km: kind === 'extended' ? null : 150000 } },
    { onError: (e) => toast.error(friendlyError(e)) })
  return (
    <div className="space-y-4">
      {warranties.length === 0 && (
        <div className="card">
          <Guide icon={ShieldCheck} title={t('empty.warrantyTitle')} body={customer ? t('empty.warrantyBodyOwner') : t('empty.warrantyBody')}
            action={role.manager && customer ? <Button onClick={() => add('vehicle')}><Plus />{t('warranty.add')}</Button> : null} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {warranties.map((w) => <WarrantyCard key={w.id} v={v} w={w} company={company.name} editable={role.manager} lastKm={lastKm} />)}
      </div>
      {role.manager && warranties.length > 0 && !warranties.some((w) => w.kind === 'extended') && (
        <Button onClick={() => add('extended')}><Plus />{t('warranty.addExtended')}</Button>
      )}
      <WarrantyDocs v={v} customer={customer} />
      <p className="text-[13px] text-ink-3">{t('warranty.footer')}</p>
    </div>
  )
}

function WarrantyCard({ v, w, company, editable, lastKm }: { v: VehicleOverview; w: Warranty; company: string; editable: boolean; lastKm: number }) {
  const { t } = useTranslation('aftersales')
  const save = useSaveWarranty(v.id!)
  const end = warrantyEnd(w)
  const startMs = new Date(w.start_date + 'T00:00:00Z').getTime()
  const total = new Date(end + 'T00:00:00Z').getTime() - startMs
  const [now] = useState(() => Date.now())
  const timeUsed = total > 0 ? (now - startMs) / total : 1
  const kmUsed = w.km ? lastKm / w.km : 0
  const Icon = w.kind === 'battery' ? Zap : ShieldCheck
  const set = (patch: Partial<Warranty>) => save.mutateAsync({ id: w.id, patch })
  const num = (x: string) => (/^\d{1,7}$/.test(x.replace(/[,\s]/g, '')) ? null : t('warranty.badNumber'))
  return (
    <section className="card p-5" data-warranty={w.kind}>
      <div className="flex items-start gap-3.5">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', w.kind === 'battery' ? 'bg-info/10 text-info' : 'bg-ok/10 text-ok')}><Icon className="size-5" /></span>
        <div className="min-w-0">
          <p className="font-semibold">{t(`warranty.kind.${w.kind as 'vehicle'}`, { company })}</p>
          <p className="flex flex-wrap items-center gap-x-1 text-[14px] text-ink-2">
            <InlineText id={`w-years-${w.id}`} label={t('warranty.years')} value={String(w.years)} disabled={!editable} inputMode="numeric" inputClassName="w-16"
              display={t('warranty.yearsN', { count: w.years })} validate={(x) => (/^\d{1,2}$/.test(x) ? null : t('warranty.badNumber'))} onSave={(x) => set({ years: Number(x) })} />
            <span>{t('warranty.or')}</span>
            <InlineText id={`w-km-${w.id}`} label={t('warranty.km')} value={w.km ? String(w.km) : ''} disabled={!editable} inputMode="numeric" inputClassName="w-28"
              display={w.km ? `${w.km.toLocaleString('en')} km` : t('warranty.noKm')} placeholder={t('warranty.noKm')} validate={num}
              onSave={(x) => set({ km: x ? Number(x.replace(/[,\s]/g, '')) : null })} />
            <span>{t('warranty.whicheverFirst')}</span>
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-around gap-4">
        <Gauge fraction={timeUsed} label={t('warranty.timeUsed')} center={fmtDate(end)} sub={t('warranty.coveredUntil')} color={w.kind === 'battery' && timeUsed < 0.75 ? 'var(--info)' : undefined} />
        {w.km ? <Gauge fraction={kmUsed} label={t('warranty.kmUsed')} center={`${w.km.toLocaleString('en')} km`} sub={t('warranty.kmDriven', { km: lastKm.toLocaleString('en') })} color={w.kind === 'battery' && kmUsed < 0.75 ? 'var(--info)' : undefined} /> : null}
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-line-soft pt-3 text-[14px] text-ink-2">
        <span>{t('warranty.started')} <b className="text-ink">{fmtDate(w.start_date)}</b></span>
        <span data-testid="covered-until">{t('warranty.coveredUntil')} <b className="text-ink">{fmtDate(end)}</b>{w.km ? <> {t('warranty.or')} <b className="text-ink">{w.km.toLocaleString('en')} km</b></> : null}</span>
      </div>
    </section>
  )
}

// --- Service -----------------------------------------------------------------------------

function ServiceTab({ v, d, onRemind }: { v: VehicleOverview; d: NonNullable<ReturnType<typeof useAftersalesCar>['data']>; onRemind: () => void }) {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const names = useStaffNames()
  const [log, setLog] = useState(false)
  const [today] = useState(() => new Date(todayDubai() + 'T00:00:00Z').getTime())
  const n = d.next
  const first = d.visits.length === 0
  const status = n?.status ?? 'ok'
  const DAY = 86_400_000
  const months = n ? (today - new Date(n.base_date + 'T00:00:00Z').getTime()) / DAY / 30.44 : 0
  const baseKm = n ? n.due_km - n.plan_km : 0
  return (
    <div className="space-y-4">
      <section className="card p-5" data-testid="next-service" data-status={status}>
        <div className="flex flex-wrap items-center gap-4">
          <span className={cn('flex size-11 items-center justify-center rounded-xl', status === 'overdue' ? 'bg-danger/10 text-danger' : status === 'due_soon' ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok')}><Wrench className="size-5" /></span>
          <div className="min-w-[200px] flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
            {n ? (
              <>
                <p className="text-[16px] font-semibold">
                  {status === 'overdue' ? (n.days_left < 0 ? t(first ? 'service.firstOverdue' : 'service.nextOverdue', { count: -n.days_left }) : t('service.overdueKm'))
                    : t(first ? 'service.firstIn' : 'service.nextIn', { count: n.days_left })}
                </p>
                <p className="text-[14px] text-ink-2">{t('service.dueLine', { date: fmtDate(n.due_date), km: n.due_km.toLocaleString('en'), last: n.last_km.toLocaleString('en') })}</p>
              </>
            ) : <p className="text-[14.5px] text-ink-2">{t('service.notYet')}</p>}
          </div>
          {role.manager && n && status !== 'ok' && <WaButton label={t('service.remind')} onClick={onRemind} />}
          {role.services && <Button variant="dark" onClick={() => setLog(true)} data-testid="log-service" className="max-sm:w-full"><Plus />{t('service.log')}</Button>}
        </div>
        {n && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <DueBar label={t('service.monthsSince')} fraction={months / n.plan_months} text={t('service.monthsOf', { n: Math.max(0, months).toFixed(1), of: n.plan_months })} />
            <DueBar label={t('service.kmSince')} fraction={(n.last_km - baseKm) / n.plan_km} text={t('service.kmOf', { n: Math.max(0, n.last_km - baseKm).toLocaleString('en'), of: n.plan_km.toLocaleString('en') })} />
          </div>
        )}
      </section>

      {n ? <ServiceTimeline d={d} /> : (
        <div className="card"><Guide icon={Wrench} title={t('empty.serviceTitle')} body={t('empty.serviceBody')} /></div>
      )}

      {d.visits.length > 0 && (
        <ul className="card divide-y divide-line-soft overflow-hidden">
          {d.visits.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4" data-visit={s.title}>
              <div className="min-w-[220px] flex-1">
                <p className="font-semibold">{s.title}</p>
                <p className="text-[13.5px] text-ink-3">{[fmtDate(s.visit_date), s.odometer_km !== null ? `${s.odometer_km.toLocaleString('en')} km` : null, s.technician_id && names.data?.get(s.technician_id) ? t('service.tech', { name: names.data.get(s.technician_id) }) : null].filter(Boolean).join(' · ')}</p>
              </div>
              {s.work_done && <p className="basis-full text-[14px] text-ink-2 sm:flex-1 sm:basis-auto">{s.work_done}</p>}
              {'cost' in s && s.cost !== undefined && <p className="font-semibold">{Number(s.cost) === 0 ? t('service.free') : fmtMoney(s.cost)}</p>}
            </li>
          ))}
        </ul>
      )}
      {n && <p className="text-[13px] text-ink-3">{t('service.footer', { months: n.plan_months, km: n.plan_km.toLocaleString('en') })}</p>}
      {log && <LogService v={v} lastKm={n?.last_km ?? v.mileage_km ?? 0} onClose={() => setLog(false)} />}
    </div>
  )
}

/** Delivery → each visit → the next service, on one line. */
function ServiceTimeline({ d }: { d: NonNullable<ReturnType<typeof useAftersalesCar>['data']> }) {
  const { t } = useTranslation('aftersales')
  const n = d.next!
  const visits = [...d.visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date))
  const startDate = visits.length ? (visits[0].visit_date < n.base_date ? visits[0].visit_date : n.base_date) : n.base_date
  const points = [
    { key: 'start', date: startDate, label: visits.length && visits[0].visit_date === startDate ? visits[0].title : t('service.delivery'), kind: visits.length && visits[0].visit_date === startDate ? 'visit' : 'start' },
    ...visits.filter((x, i) => !(i === 0 && x.visit_date === startDate)).map((x) => ({ key: x.id, date: x.visit_date, label: x.title, kind: 'visit' })),
    { key: 'next', date: n.due_date, label: t('service.next'), kind: n.status === 'overdue' ? 'overdue' : 'next' },
  ]
  const t0 = new Date(points[0].date).getTime()
  const t1 = Math.max(new Date(n.due_date).getTime(), t0 + 1)
  const pos = (date: string) => Math.max(0, Math.min(100, ((new Date(date).getTime() - t0) / (t1 - t0)) * 100))
  const [nowPos] = useState(() => pos(todayDubai()))
  return (
    <section className="card overflow-hidden px-4 pt-6 pb-4 sm:px-6" data-testid="service-timeline" aria-label={t('service.timeline')}>
      <div className="relative mx-8 h-[84px] min-w-[260px] sm:mx-10">
        <span className="absolute inset-x-0 top-[13px] h-1 rounded-full bg-line" />
        <span className="absolute start-0 top-[13px] h-1 rounded-full bg-ok" style={{ width: `${nowPos}%` }} />
        <span className="absolute top-[4px] -ms-px h-[22px] w-0.5 bg-ink-3" style={{ insetInlineStart: `${nowPos}%` }} title={t('service.today')} />
        {points.map((p) => (
          <div key={p.key} className="absolute top-0 flex w-20 -translate-x-1/2 sm:w-28 flex-col items-center text-center rtl:translate-x-1/2" style={{ insetInlineStart: `${pos(p.date)}%` }} data-timeline-point={p.kind}>
            <span className={cn('flex size-[30px] items-center justify-center rounded-full border-[3px] bg-surface',
              p.kind === 'visit' || p.kind === 'start' ? 'border-ok' : p.kind === 'overdue' ? 'border-danger border-dashed' : 'border-warn border-dashed')}>
              {p.kind === 'visit' ? <Check className="size-3.5 text-ok" strokeWidth={3} /> : p.kind === 'start' ? <span className="size-2 rounded-full bg-ok" /> : <Wrench className={cn('size-3.5', p.kind === 'overdue' ? 'text-danger' : 'text-warn')} />}
            </span>
            <span className="mt-1.5 line-clamp-1 text-[12.5px] font-semibold">{p.label}</span>
            <span className="text-[11.5px] text-ink-3">{fmtDate(p.date).replace(/ \d{4}$/, '')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function LogService({ v, lastKm, onClose }: { v: VehicleOverview; lastKm: number; onClose: () => void }) {
  const { t } = useTranslation(['aftersales', 'common'])
  const role = useAftersalesRole()
  const save = useLogService(v.id!)
  const [f, setF] = useState({ date: todayDubai(), km: '', title: '', work: '', cost: '' })
  const km = f.km.replace(/[,\s]/g, '')
  const kmOk = /^\d{1,7}$/.test(km) && Number(km) >= 0
  const costOk = !f.cost || parseAmount(f.cost) !== null
  const INPUT = 'h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink'
  const go = () => save.mutate({ date: f.date, km: Number(km), title: f.title.trim() || t('service.defaultTitle'), work: f.work.trim(), cost: role.manager && f.cost ? Number(parseAmount(f.cost)) : 0 }, {
    onSuccess: () => { toast.success(t('service.logged')); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Dialog open onClose={onClose} title={t('service.log')} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="primary" loading={save.isPending} disabled={!kmOk || !costOk} onClick={go} data-testid="save-service">{t('service.save')}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (kmOk && costOk) go() }}>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('service.date')}<input type="date" className={INPUT} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('service.odometer')}<input className={cn(INPUT, f.km && !kmOk && 'border-danger')} inputMode="numeric" dir="ltr" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} placeholder={t('service.lastReading', { km: lastKm.toLocaleString('en') })} autoFocus /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2 sm:col-span-2">{t('service.what')}<input className={INPUT} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('service.whatPh')} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2 sm:col-span-2">{t('service.work')}<input className={INPUT} value={f.work} onChange={(e) => setF({ ...f, work: e.target.value })} placeholder={t('service.workPh')} /></label>
        {role.manager && <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('service.cost')}<input className={cn(INPUT, !costOk && 'border-danger')} inputMode="decimal" dir="ltr" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder={t('service.costPh')} /></label>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}

// --- Parts -------------------------------------------------------------------------------

const STEPS = ['requested', 'ordered', 'arrived', 'fitted'] as const

function PartsTab({ v, parts, onNotify }: { v: VehicleOverview; parts: PartRequest[]; onNotify: (p: PartRequest) => void }) {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const names = useStaffNames()
  const status = useSetPartStatus(v.id!)
  const [req, setReq] = useState(false)
  const move = (p: PartRequest, to: string) => status.mutate({ id: p.id, status: to }, { onError: (e) => toast.error(friendlyError(e)) })
  const live = parts.filter((p) => p.status !== 'cancelled')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-ink-2">{t('parts.hint')}</p>
        {role.services && <Button variant="primary" onClick={() => setReq(true)} data-testid="request-part"><Plus />{t('parts.request')}</Button>}
      </div>
      {live.length === 0 ? (
        <div className="card"><Guide icon={Package} title={t('empty.partsTitle')} body={t('empty.partsBody')}
          action={role.services ? <Button variant="primary" onClick={() => setReq(true)}><Plus />{t('parts.request')}</Button> : null} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-4" data-testid="parts-board">
          {STEPS.map((col, ci) => {
            const cards = live.filter((p) => p.status === col)
            return (
              <section key={col} className="rounded-[14px] bg-hover/70 p-2.5" data-column={col}>
                <h3 className="flex items-center justify-between px-1.5 pt-0.5 pb-2 text-[13px] font-semibold text-ink-2">
                  <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-full', ['bg-ink-3', 'bg-info', 'bg-warn', 'bg-ok'][ci])} />{t(`parts.status.${col}`)}</span>
                  <span className="tnum text-ink-3">{cards.length}</span>
                </h3>
                <div className="space-y-2">
                  {cards.map((p) => {
                    const Icon = partIcon(p.name)
                    const next = STEPS[ci + 1]
                    return (
                      <article key={p.id} className="card p-3" data-part={p.name} data-part-status={p.status}>
                        <div className="flex items-start gap-2.5">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-2 ring-1 ring-line"><Icon className="size-4" /></span>
                          <div className="min-w-0">
                            <p className="text-[14px] leading-snug font-semibold">{p.name}</p>
                            <p className="text-[12.5px] text-ink-3">{[p.part_no || null, `×${p.qty}`, 'cost' in p && p.cost !== null && p.cost !== undefined ? fmtMoney(p.cost) : null].filter(Boolean).join(' · ')}</p>
                            <p className="text-[12px] text-ink-3">{[p.requested_by && names.data?.get(p.requested_by) ? t('parts.by', { name: names.data.get(p.requested_by) }) : null, p.supplier].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          {role.services && next && (
                            <button onClick={() => move(p, next)} disabled={status.isPending} data-move-to={next}
                              className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-ink px-2 text-[12.5px] font-semibold text-white disabled:opacity-50">
                              {tr(t, `parts.moveTo.${next}`)}<ArrowRight className="size-3.5 flip-rtl" />
                            </button>
                          )}
                          {role.services && ci > 0 && (
                            <button onClick={() => move(p, STEPS[ci - 1])} disabled={status.isPending} aria-label={t('parts.back', { status: t(`parts.status.${STEPS[ci - 1]}`) })}
                              className="flex size-8 items-center justify-center rounded-lg border border-line text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5 flip-rtl" /></button>
                          )}
                          {role.manager && p.status === 'arrived' && <WaButton label={t('parts.notify')} onClick={() => onNotify(p)} className="h-8 w-full justify-center px-2 text-[12.5px]" />}
                        </div>
                      </article>
                    )
                  })}
                  {cards.length === 0 && <p className="px-1.5 py-3 text-center text-[12.5px] text-ink-3">—</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {req && <RequestPart v={v} onClose={() => setReq(false)} />}
    </div>
  )
}

function RequestPart({ v, onClose }: { v: VehicleOverview; onClose: () => void }) {
  const { t } = useTranslation(['aftersales', 'common'])
  const role = useAftersalesRole()
  const save = useRequestPart(v.id!)
  const [f, setF] = useState({ name: '', partNo: '', qty: '1', supplier: '', cost: '' })
  const qtyOk = /^\d{1,3}$/.test(f.qty) && Number(f.qty) > 0
  const costOk = !f.cost || parseAmount(f.cost) !== null
  const INPUT = 'h-11 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-ink'
  const go = () => save.mutate({ name: f.name.trim(), qty: Number(f.qty), partNo: f.partNo.trim(), supplier: f.supplier.trim(), cost: role.manager && f.cost ? Number(parseAmount(f.cost)) : null }, {
    onSuccess: () => { toast.success(t('parts.requested')); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const ok = f.name.trim() && qtyOk && costOk
  return (
    <Dialog open onClose={onClose} title={t('parts.request')} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button><Button variant="primary" loading={save.isPending} disabled={!ok} onClick={go} data-testid="save-part">{t('parts.request')}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (ok) go() }}>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2 sm:col-span-2">{t('parts.name')}<input className={INPUT} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('parts.namePh')} autoFocus /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('parts.partNo')}<input className={INPUT} dir="ltr" value={f.partNo} onChange={(e) => setF({ ...f, partNo: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('parts.qty')}<input className={cn(INPUT, !qtyOk && 'border-danger')} inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('parts.supplierLabel')}<input className={INPUT} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></label>
        {role.manager && <label className="flex flex-col gap-1.5 text-[13.5px] font-semibold text-ink-2">{t('parts.cost')}<input className={cn(INPUT, !costOk && 'border-danger')} inputMode="decimal" dir="ltr" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="AED" /></label>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}

// --- What they may need ----------------------------------------------------------------------

function OffersTab({ v, offers, onOffer }: { v: VehicleOverview; offers: NonNullable<ReturnType<typeof useAftersalesCar>['data']>['offers']; onOffer: (name: string) => void }) {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const cat = useCatalogue()
  const o = useOffers(v.id!)
  const [picking, setPicking] = useState(false)
  const offered = new Set(offers.map((x) => x.catalogue_id))
  const choices = (cat.data ?? []).filter((c) => !offered.has(c.id))
  const err = (e: unknown) => toast.error(friendlyError(e))
  const accepted = offers.filter((x) => x.status === 'accepted')
  const acceptedTotal = accepted.reduce((n, x) => n + Number(x.price ?? 0), 0)
  if (offers.length === 0 && !picking) {
    return (
      <div className="card"><Guide icon={Sparkles} title={t('empty.offersTitle')} body={t('empty.offersBody')}
        action={role.manager ? <Button variant="primary" onClick={() => setPicking(true)} data-testid="add-offer"><Plus />{t('offers.add')}</Button> : null} /></div>
    )
  }
  return (
    <div className="space-y-4">
    <section className="card flex flex-wrap items-center gap-x-8 gap-y-2 p-5" data-testid="offers-summary">
      <div><p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('offers.acceptedTotal')}</p><p className="tnum text-[26px] font-bold text-ok">{fmtMoney(acceptedTotal)}</p></div>
      <p className="text-[14px] text-ink-2">{t('offers.summary', { accepted: accepted.length, open: offers.filter((x) => x.status === 'offered').length, declined: offers.filter((x) => x.status === 'declined').length })}</p>
    </section>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {offers.map((x) => {
        const Icon = ICON[x.icon] ?? Tag
        return (
          <div key={x.id} className="card flex flex-col p-5" data-offer={x.name}>
            <span className={cn('mb-3 flex size-12 items-center justify-center rounded-2xl', x.status === 'accepted' ? 'bg-ok/12 text-ok' : x.status === 'declined' ? 'bg-hover text-ink-3' : 'bg-violet/10 text-violet')}><Icon className="size-6" /></span>
            <p className="font-semibold">{x.name}</p>
            <InlineText id={`offer-price-${x.id}`} label={t('offers.price')} value={x.price !== null ? String(Number(x.price)) : ''} disabled={!role.manager} inputMode="decimal" dir="ltr"
              display={fmtMoney(x.price)} placeholder={t('offers.setPrice')} className="text-ink-2" validate={(p) => (parseAmount(p) ? null : t('offers.badPrice'))}
              onSave={(p) => o.price.mutateAsync({ id: x.id, price: p ? Number(parseAmount(p)) : null })} />
            <div className="mt-4 flex rounded-xl bg-hover p-1" role="group" aria-label={t('offers.statusOf', { name: x.name })}>
              {(['offered', 'accepted', 'declined'] as const).map((s) => (
                <button key={s} disabled={!role.manager} aria-pressed={x.status === s} onClick={() => o.status.mutate({ id: x.id, status: s }, { onError: err })}
                  className={cn('h-8 flex-1 rounded-lg text-[13px] font-medium', x.status === s ? cn('bg-surface shadow-sm', s === 'accepted' ? 'text-ok' : s === 'declined' ? 'text-ink-3' : 'text-ink') : 'text-ink-3')}>
                  {t(`offers.status.${s}`)}
                </button>
              ))}
            </div>
            {role.manager && x.status === 'offered' && <button className="mt-3 self-start text-[13px] font-semibold text-[#147a3d]" onClick={() => onOffer(x.name)}>{t('offers.send')}</button>}
          </div>
        )
      })}
      {role.manager && (picking ? (
        <div className="card p-3">
          <p className="px-2 pt-1 pb-2 text-[13px] font-semibold text-ink-2">{t('offers.pick')}</p>
          {choices.length === 0 && <p className="px-2 pb-2 text-[13px] text-ink-3">{t('offers.allOffered')}</p>}
          {choices.map((c: CatalogueItem) => (
            <button key={c.id} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-start text-[14px] hover:bg-hover"
              onClick={() => { setPicking(false); o.add.mutate(c, { onError: err }) }}>
              <span>{c.name}</span><span className="text-[13px] text-ink-3">{fmtMoney(c.default_price)}</span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setPicking(true)} className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-line px-6 text-center text-ink-3 hover:border-ink-3 hover:text-ink-2" data-testid="add-offer">
          <Plus className="size-6" /><span className="text-[15px] font-semibold">{t('offers.add')}</span><span className="text-[13px]">{t('offers.addHint')}</span>
        </button>
      ))}
      {!role.manager && offers.length === 0 && <p className="text-[14px] text-ink-3">{t('offers.none')}</p>}
    </div>
    </div>
  )
}

