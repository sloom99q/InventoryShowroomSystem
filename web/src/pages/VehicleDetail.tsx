import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, ArchiveRestore, ArrowLeftRight, ArrowRight, BadgeCheck, Eye, FileText, MoreHorizontal, Pencil, ShieldAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAccessories, useDocuments, useExpenses, useImages } from '@/api/records'
import { useArchiveVehicle, useChangeStatus, useUpdateVehicle, useVehicle } from '@/api/vehicles'
import { ChassisInput, useChassisBlocked } from '@/components/ChassisInput'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel, Tabs } from '@/components/ui/misc'
import { readiness, useFieldWriter, useVehicleData, type VehicleData } from '@/api/fields'
import { cn } from '@/lib/cn'
import { FIELDS, isListKey } from '@/lib/fields'
import { fromForm, toForm, VehicleFields, vehicleSchema, type VehicleForm } from '@/components/VehicleFields'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { fmtDate, fmtDateTime, fmtKm, fmtMoney, fromLocalInput, nowLocalInput, parseAmount } from '@/lib/format'
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview, VehicleStatus } from '@/lib/types'
import { AccessoriesTab } from './vehicle/AccessoriesTab'
import { HistoryTab } from './vehicle/HistoryTabs'
import { DocumentsTab } from './vehicle/DocumentsTab'
import { ExpensesTab } from './vehicle/ExpensesTab'
import { SpecsTab } from './vehicle/SpecsTab'
import { PhotosTab } from './vehicle/PhotosTab'

type Tab = 'specs' | 'photos' | 'documents' | 'accessories' | 'expenses' | 'history'
const TABS: Tab[] = ['specs', 'photos', 'documents', 'accessories', 'expenses', 'history']
/** Tabs from before the redesign still open somewhere sensible. */
const OLD_TABS: Record<string, Tab> = { overview: 'specs', timeline: 'history', activity: 'history' }

const DAY = 86_400_000

export function VehicleDetail() {
  const { t } = useTranslation(['vehicle', 'common', 'salesdocs'])
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') ?? 'specs'
  const tab: Tab = (TABS as string[]).includes(raw) ? (raw as Tab) : OLD_TABS[raw] ?? 'specs'
  const { canWrite, company } = useCompany()
  const q = useVehicle(id)
  const data = useVehicleData(id)
  const docs = useDocuments(id!)
  const imgs = useImages(id!)
  const acc = useAccessories(id!)
  const exp = useExpenses(id!)
  const [dialog, setDialog] = useState<null | 'status' | 'edit' | 'archive' | 'chassis'>(null)
  const [now] = useState(() => Date.now())

  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error ?? new Error(t('header.notFound'))} />
  const v = q.data
  const photos = (imgs.data ?? []).filter((i) => !i.superseded_at && i.image_type !== 'information_card')
  const field = (k: string) => data.data?.fields.get(k)?.value_en ?? null
  const subtitle = [v.trim_level, field('description'), field('regional_specs')].filter(Boolean).join(' · ')
  const since = v.arrival_at ?? v.created_at
  const days = since ? Math.max(0, Math.floor(((v.sold_at ? new Date(v.sold_at).getTime() : now) - new Date(since).getTime()) / DAY)) : null

  const tabs: { value: Tab; label: string; count?: number | null }[] = [
    { value: 'specs', label: t('tabs.specs') },
    { value: 'photos', label: t('tabs.photos'), count: photos.length },
    { value: 'documents', label: t('tabs.documents'), count: docs.data?.filter((d) => !d.superseded_at).length },
    { value: 'accessories', label: t('tabs.accessories'), count: acc.data?.length },
    { value: 'expenses', label: t('tabs.expenses'), count: exp.data?.length },
    { value: 'history', label: t('tabs.history') },
  ]

  const accSummary = !v.accessory_count
    ? t('header.accNotRecorded')
    : v.missing_accessories
      ? t('header.accMissing', { count: v.missing_accessories })
      : v.unknown_accessories
        ? t('header.accToCheck', { count: v.unknown_accessories })
        : t('header.accComplete')

  /** Readiness item clicked: identity fields live in "Edit details", the rest in Specifications. */
  const goTo = (key: string, rowId?: string) => {
    if (FIELDS.identity.some((f) => f.key === key)) return setDialog('edit')
    const next: Record<string, string> = { tab: 'specs', field: key }
    if (rowId && isListKey(key)) next.item = rowId
    setParams(next, { replace: true })
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="text-[13px] text-ink-3"><Link to="/vehicles" className="hover:text-ink">{t('common:nav.vehicles')}</Link> / <span className="text-ink-2">{vehicleTitle(v)}</span></nav>
        {canWrite && (
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Link to={`/vehicles/${v.id}/import`} className={buttonVariants()}><Upload /> {t('header.importFiles')}</Link>
            <Button onClick={() => setDialog('status')}><ArrowLeftRight className="flip-rtl" /> {t('header.changeStatus')}</Button>
            <Link to={`/vehicles/${v.id}/documents`} className={buttonVariants({ variant: 'primary' })}><FileText /> {t('page.sheetAndBrochure')}</Link>
            <MoreMenu v={v} onPick={setDialog} />
          </div>
        )}
        {!canWrite && (
          <Link to={`/vehicles/${v.id}/documents?view=1`} className={cn(buttonVariants(), 'ms-auto')}><Eye /> {t('page.viewDocuments')}</Link>
        )}
      </div>

      {v.archived_at && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-2.5 text-[13.5px] text-ink-2">
          <Archive className="size-4" /> {t('header.archivedBanner', { date: fmtDateTime(v.archived_at) })}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <button className="relative block w-full shrink-0 overflow-hidden rounded-lg lg:w-[400px]" onClick={() => setParams({ tab: 'photos' }, { replace: true })}>
          <VehicleThumb path={v.cover_thumbnail_path} className="aspect-[16/10] w-full rounded-lg" alt={vehicleTitle(v)} />
          <span className="absolute start-3 bottom-3 rounded-md bg-black/65 px-2 py-1 text-[12px] text-white">
            {photos.length ? t('page.coverPhotos', { count: photos.length }) : t('page.noPhotos')}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] leading-tight font-semibold">
              {[v.brand, v.model].filter(Boolean).join(' ').toUpperCase() || vehicleTitle(v)}
              {v.year && <span className="ms-2 font-normal text-ink-3">{v.year}</span>}
            </h1>
            <StatusBadge status={v.status!} />
          </div>
          {subtitle && <p className="mt-1 text-[14px] text-ink-2" dir="auto">{subtitle}</p>}

          <div className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-raised px-3 py-1.5">
            <span className="text-[11px] tracking-[0.12em] text-ink-3">{t('header.chassisLabel').toUpperCase()}</span>
            <Chassis value={v.chassis_number!} className="text-[15px] font-medium text-ink" />
            {v.chassis_verified ? (
              <span className="flex items-center gap-1 text-[12px] text-ok"><BadgeCheck className="size-3.5" />{t('header.chassisChecked')}</span>
            ) : (
              <span className="flex items-center gap-1 text-[12px] text-warn"><ShieldAlert className="size-3.5" />{t('header.chassisNotChecked')}</span>
            )}
            {canWrite && <ChassisVerifyToggle v={v} />}
          </div>

          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-[13px] text-ink-3">{t('page.asking')}</span>
            {v.listing_price !== null
              ? <span className="tnum text-[26px] font-semibold">{fmtMoney(v.listing_price, company.currency, true)}</span>
              : <button className="text-[14px] text-ink-3 hover:text-ink" onClick={() => canWrite && setDialog('edit')}>{t('page.noPrice')}</button>}
          </p>

          <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-line-soft bg-surface sm:grid-cols-5">
            <Fact label={t('header.arrived')} value={fmtDate(v.arrival_at)} />
            <Fact label={t('page.inStock')} value={days === null ? '—' : t('page.days', { count: days })}
              sub={v.sold_at ? `${v.status === 'delivered' ? t('header.delivered') : t('header.sold')} ${fmtDate(v.status === 'delivered' ? v.delivered_at : v.sold_at)}` : undefined} />
            <Fact label={t('page.mileage')} value={v.mileage_km !== null ? fmtKm(v.mileage_km) : '—'} />
            <Fact label={t('header.expenses')} value={fmtMoney(v.expense_total, company.currency, true)} />
            <Fact label={t('header.accessories')} value={accSummary} tone={v.missing_accessories ? 'warn' : undefined} />
          </dl>
        </div>
      </div>

      {data.data && <ReadinessBar v={v} data={data.data} onGo={goTo} />}

      <Tabs value={tab} onChange={(tb) => setParams(tb === 'specs' ? {} : { tab: tb }, { replace: true })} items={tabs} className="mt-6 mb-5" />

      {tab === 'specs' && <SpecsTab vehicleId={v.id!} />}
      {tab === 'photos' && <PhotosTab vehicleId={v.id!} />}
      {tab === 'documents' && <DocumentsTab vehicleId={v.id!} chassis={v.chassis_number!} />}
      {tab === 'accessories' && <AccessoriesTab vehicleId={v.id!} />}
      {tab === 'expenses' && <ExpensesTab vehicleId={v.id!} />}
      {tab === 'history' && <HistoryTab vehicleId={v.id!} />}

      <StatusDialog v={v} open={dialog === 'status'} onClose={() => setDialog(null)} />
      <EditDialog v={v} open={dialog === 'edit'} onClose={() => setDialog(null)} />
      <ChassisDialog v={v} open={dialog === 'chassis'} onClose={() => setDialog(null)} />
      <ArchiveDialog v={v} open={dialog === 'archive'} onClose={() => setDialog(null)} />
    </>
  )
}

function MoreMenu({ v, onPick }: { v: VehicleOverview; onPick: (d: 'edit' | 'chassis' | 'archive') => void }) {
  const { t } = useTranslation('vehicle')
  const { profile } = useCompany()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const manage = profile.role === 'admin' || profile.role === 'secretary'
  const item = 'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-start text-[13.5px] hover:bg-raised [&_svg]:size-4 [&_svg]:text-ink-3'
  const pick = (d: 'edit' | 'chassis' | 'archive') => { setOpen(false); onPick(d) }
  return (
    <div ref={ref} className="relative">
      <Button size="icon" aria-label={t('page.more')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal /></Button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg shadow-black/10">
          <button role="menuitem" className={item} onClick={() => pick('edit')}><Pencil />{t('header.editDetails')}</button>
          <Link role="menuitem" className={item} to={`/vehicles/${v.id}/documents?view=1`}><Eye />{t('page.viewDocuments')}</Link>
          {manage && <button role="menuitem" className={item} onClick={() => pick('chassis')}><ShieldAlert />{t('header.correctChassis')}</button>}
          {manage && (
            <button role="menuitem" className={item} onClick={() => pick('archive')}>
              {v.archived_at ? <><ArchiveRestore />{t('header.restore')}</> : <><Archive />{t('header.archive')}</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ReadinessBar({ v, data, onGo }: { v: VehicleOverview; data: VehicleData; onGo: (key: string, rowId?: string) => void }) {
  const { t } = useTranslation('vehicle')
  const [open, setOpen] = useState(false)
  const r = readiness(v as never, data)
  const done = r.gaps.length === 0
  return (
    <Panel className="mt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-full', done ? 'bg-ok' : 'bg-ok/80')} style={{ width: `${r.pct}%` }} />
        </div>
        <p className="text-[13.5px]">
          <b className="font-semibold">{t('ready.title', { pct: r.pct })}</b>{' '}
          <span className="text-ink-2">
            {done ? t('ready.allSet') : [r.empty ? t('ready.empty', { count: r.empty }) : null, r.arabic ? t('ready.arabic', { count: r.arabic }) : null].filter(Boolean).join(' · ')}
          </span>
        </p>
        {!done && (
          <button className="ms-auto inline-flex items-center gap-1 text-[13px] text-warn hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? t('ready.hide') : t('ready.show')}<ArrowRight className={cn('size-3.5 flip-rtl transition-transform', open && 'rotate-90')} />
          </button>
        )}
      </div>
      {open && !done && (
        <ul className="grid gap-x-6 border-t border-line-soft px-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {r.gaps.map((g, i) => (
            <li key={`${g.kind}:${g.key}:${g.rowId ?? i}`}>
              <button className="flex w-full items-center gap-2 py-1.5 text-start text-[13px] hover:text-accent" onClick={() => onGo(g.key, g.rowId)}>
                <span className={cn('size-1.5 shrink-0 rounded-full', g.kind === 'empty' ? 'bg-ink-3' : 'bg-warn')} />
                <span className="min-w-0 flex-1 truncate" dir="auto">{g.label}</span>
                <span className="text-[12px] text-ink-3">{g.kind === 'empty' ? t('ready.emptyItem') : t('ready.arabicItem')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Fact({ label, value, tone, sub }: { label: string; value: string; tone?: 'warn'; sub?: string }) {
  return (
    <div className="border-line-soft px-4 py-3 not-last:border-e max-sm:border-b">
      <dt className="text-[11px] tracking-[0.1em] text-ink-3">{label.toUpperCase()}</dt>
      <dd className={cn('mt-1 text-[15px] font-semibold', tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</dd>
      {sub && <dd className="text-[12px] text-ink-3">{sub}</dd>}
    </div>
  )
}

function ChassisVerifyToggle({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('vehicle')
  const upd = useUpdateVehicle(v.id!)
  return (
    <button
      className="ms-2 cursor-pointer text-ink-3 underline hover:text-ink"
      disabled={upd.isPending}
      onClick={() => upd.mutate({ chassis_verified: !v.chassis_verified }, {
        onSuccess: () => toast.success(v.chassis_verified ? t('header.toastUnchecked') : t('header.toastChecked')),
        onError: (e) => toast.error(friendlyError(e)),
      })}
    >
      {v.chassis_verified ? t('header.undo') : t('header.markChecked')}
    </button>
  )
}

const DATE_KEY: Partial<Record<VehicleStatus, 'dateSold' | 'dateDelivered' | 'dateGarage' | 'dateReserved'>> = {
  sold: 'dateSold', delivered: 'dateDelivered', in_garage: 'dateGarage', reserved: 'dateReserved',
}

function StatusDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation(['vehicle', 'common'])
  const [status, setStatus] = useState<VehicleStatus>(v.status!)
  const [at, setAt] = useState(nowLocalInput())
  const [note, setNote] = useState('')
  const m = useChangeStatus(v.id!)
  const dateKey = DATE_KEY[status]
  const backwards = (v.status === 'sold' || v.status === 'delivered') && status !== 'sold' && status !== 'delivered'
  const label = (s: VehicleStatus) => (i18n.language === 'en' ? STATUS_LABEL[s].toLowerCase() : STATUS_LABEL[s])
  return (
    <Dialog open={open} onClose={onClose} title={t('statusDialog.title')} description={<>{t('statusDialog.currently')} <b className="font-medium text-ink">{STATUS_LABEL[v.status!]}</b></>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={m.isPending} disabled={status === v.status || (!!dateKey && !at)}
          onClick={() => m.mutate({ status, at: fromLocalInput(at), note }, {
            onSuccess: () => { toast.success(t('statusDialog.toast', { status: label(status) })); setNote(''); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>{t('statusDialog.save')}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
              className={`cursor-pointer rounded-md border px-3 py-2.5 text-start text-[13.5px] ${status === s ? 'border-accent bg-accent/10' : 'border-line hover:bg-raised'}`}>
              <StatusBadge status={s} className="bg-transparent" />
            </button>
          ))}
        </div>
        {dateKey && (
          <Field label={t(`statusDialog.${dateKey}`)} hint={t('common:terms.uaeTime')}>
            {(id) => <Input id={id} type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} required />}
          </Field>
        )}
        {backwards && (
          <p className="rounded-md bg-warn/10 px-3 py-2 text-[13px] text-warn">
            {v.status === 'delivered' ? t('statusDialog.clearsSaleDelivery') : t('statusDialog.clearsSale')}
          </p>
        )}
        <Field label={t('statusDialog.note')}>
          {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'sold' ? t('statusDialog.notePlaceholderSold') : ''} />}
        </Field>
      </div>
    </Dialog>
  )
}

function EditDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'common', 'salesdocs'])
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema), values: toForm(v) })
  const upd = useUpdateVehicle(v.id!)
  const data = useVehicleData(v.id!)
  const writer = useFieldWriter(v.id!)
  const field = (k: string) => data.data?.fields.get(k)
  const [extra, setExtra] = useState<{ price: string; description: string; regionEn: string; regionAr: string } | null>(null)
  const x = extra ?? {
    price: v.listing_price !== null ? String(v.listing_price) : '',
    description: field('description')?.value_en ?? '',
    regionEn: field('regional_specs')?.value_en ?? '',
    regionAr: field('regional_specs')?.value_ar ?? '',
  }
  const set = (p: Partial<typeof x>) => setExtra({ ...x, ...p })
  const priceOk = !x.price.trim() || parseAmount(x.price) !== null
  const close = () => { setExtra(null); onClose() }
  const save = form.handleSubmit(async (vals) => {
    if (!priceOk) return
    try {
      await upd.mutateAsync({ ...fromForm(vals), listing_price: x.price.trim() ? (parseAmount(x.price) as unknown as number) : null })
      if (x.description !== (field('description')?.value_en ?? '')) await writer.setField.mutateAsync({ key: 'description', value: { en: x.description } })
      if (x.regionEn !== (field('regional_specs')?.value_en ?? '') || x.regionAr !== (field('regional_specs')?.value_ar ?? ''))
        await writer.setField.mutateAsync({ key: 'regional_specs', value: { en: x.regionEn, ar: x.regionAr } })
      toast.success(t('editDialog.toast'))
      close()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  })
  return (
    <Dialog open={open} onClose={close} title={t('editDialog.title')} size="lg"
      footer={<>
        <Button variant="ghost" onClick={close}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={upd.isPending || writer.setField.isPending} disabled={!priceOk} onClick={save}>{t('common:actions.saveChanges')}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('overview.listingPrice')} error={priceOk ? undefined : t('salesdocs:fields.listing_price')}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" dir="ltr" value={x.price} onChange={(e) => set({ price: e.target.value })} placeholder="AED" />}
          </Field>
          <Field label={t('page.description')}>
            {(id) => <Input id={id} dir="auto" value={x.description} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
          <Field label={t('page.regionalSpecs')}>
            {(id) => <Input id={id} dir="auto" value={x.regionEn} onChange={(e) => set({ regionEn: e.target.value })} />}
          </Field>
          <Field label={t('page.regionalSpecsAr')}>
            {(id) => <Input id={id} dir="rtl" lang="ar" value={x.regionAr} onChange={(e) => set({ regionAr: e.target.value })} />}
          </Field>
        </div>
        <VehicleFields form={form} />
      </div>
    </Dialog>
  )
}

function ChassisDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'common', 'salesdocs'])
  const [value, setValue] = useState(v.chassis_number!)
  const [reason, setReason] = useState('')
  const blocked = useChassisBlocked(value, v.id!)
  const upd = useUpdateVehicle(v.id!)
  return (
    <Dialog open={open} onClose={onClose} title={t('chassisDialog.title')} size="lg"
      description={t('chassisDialog.description')}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={upd.isPending} disabled={blocked || value.trim() === v.chassis_number || !reason.trim()}
          onClick={() => upd.mutate({
            chassis_number: value.trim(),
            chassis_verified: false,
            notes: [v.notes, t('chassisDialog.note', { old: v.chassis_number, reason: reason.trim() })].filter(Boolean).join('\n'),
          }, {
            onSuccess: () => { toast.success(t('chassisDialog.toast')); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>{t('chassisDialog.save')}</Button>
      </>}>
      <div className="space-y-4">
        <ChassisInput value={value} onChange={setValue} excludeId={v.id!} />
        <Field label={t('chassisDialog.reason')}>
          {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('chassisDialog.reasonPlaceholder')} />}
        </Field>
      </div>
    </Dialog>
  )
}

function ArchiveDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t } = useTranslation('vehicle')
  const m = useArchiveVehicle(v.id!)
  const archiving = !v.archived_at
  return (
    <ConfirmDialog open={open} onClose={onClose} title={archiving ? t('archiveDialog.titleArchive') : t('archiveDialog.titleRestore')} danger={archiving}
      confirmLabel={archiving ? t('archiveDialog.confirmArchive') : t('archiveDialog.confirmRestore')} loading={m.isPending}
      onConfirm={() => m.mutate({ archive: archiving }, {
        onSuccess: () => { toast.success(archiving ? t('archiveDialog.toastArchived') : t('archiveDialog.toastRestored')); onClose() },
        onError: (e) => toast.error(friendlyError(e)),
      })}>
      {archiving ? t('archiveDialog.bodyArchive') : t('archiveDialog.bodyRestore')}
    </ConfirmDialog>
  )
}
