import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, ArchiveRestore, ArrowLeftRight, BadgeCheck, Pencil, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAccessories, useDocuments, useExpenses, useImages } from '@/api/records'
import { useArchiveVehicle, useChangeStatus, useUpdateVehicle, useVehicle } from '@/api/vehicles'
import { ChassisInput, useChassisBlocked } from '@/components/ChassisInput'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel, Tabs } from '@/components/ui/misc'
import { fromForm, toForm, VehicleFields, vehicleSchema, type VehicleForm } from '@/components/VehicleFields'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { fmtDateTime, fmtKm, fmtMoney, fromLocalInput, nowLocalInput } from '@/lib/format'
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview, VehicleStatus } from '@/lib/types'
import { AccessoriesTab } from './vehicle/AccessoriesTab'
import { ActivityTab, TimelineTab } from './vehicle/HistoryTabs'
import { DocumentsTab } from './vehicle/DocumentsTab'
import { ExpensesTab } from './vehicle/ExpensesTab'
import { PhotosTab } from './vehicle/PhotosTab'

type Tab = 'overview' | 'documents' | 'photos' | 'accessories' | 'expenses' | 'timeline' | 'activity'

export function VehicleDetail() {
  const { t } = useTranslation(['vehicle', 'common'])
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'overview'
  const { canWrite, profile } = useCompany()
  const q = useVehicle(id)
  const docs = useDocuments(id!)
  const imgs = useImages(id!)
  const acc = useAccessories(id!)
  const exp = useExpenses(id!)
  const [dialog, setDialog] = useState<null | 'status' | 'edit' | 'archive' | 'chassis'>(null)

  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error ?? new Error(t('header.notFound'))} />
  const v = q.data
  const seeAudit = profile.role === 'admin' || profile.role === 'secretary'

  const tabs: { value: Tab; label: string; count?: number | null }[] = [
    { value: 'overview', label: t('tabs.overview') },
    { value: 'documents', label: t('tabs.documents'), count: docs.data?.filter((d) => !d.superseded_at).length },
    { value: 'photos', label: t('tabs.photos'), count: imgs.data?.filter((i) => !i.superseded_at).length },
    { value: 'accessories', label: t('tabs.accessories'), count: acc.data?.length },
    { value: 'expenses', label: t('tabs.expenses'), count: exp.data?.length },
    { value: 'timeline', label: t('tabs.timeline') },
    ...(seeAudit ? [{ value: 'activity' as Tab, label: t('tabs.activity') }] : []),
  ]

  const accSummary = !v.accessory_count
    ? t('header.accNotRecorded')
    : v.missing_accessories
      ? t('header.accMissing', { count: v.missing_accessories })
      : v.unknown_accessories
        ? t('header.accToCheck', { count: v.unknown_accessories })
        : t('header.accComplete')

  return (
    <>
      <nav className="mb-4 text-[13px] text-ink-3"><Link to="/vehicles" className="hover:text-ink">{t('common:nav.vehicles')}</Link> / <span className="text-ink-2">{vehicleTitle(v)}</span></nav>

      {v.archived_at && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-2.5 text-[13.5px] text-ink-2">
          <Archive className="size-4" /> {t('header.archivedBanner', { date: fmtDateTime(v.archived_at) })}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <VehicleThumb path={v.cover_thumbnail_path} className="aspect-[16/10] w-full sm:w-64" alt={vehicleTitle(v)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-semibold">{vehicleTitle(v)}</h1>
              <StatusBadge status={v.status!} />
            </div>
            {v.trim_level && <p className="text-[13.5px] text-ink-2">{v.trim_level}</p>}

            <div className="mt-4 inline-flex flex-col rounded-md border border-line bg-raised px-4 py-2.5">
              <span className="text-[11.5px] text-ink-3">{t('header.chassisLabel')}</span>
              <Chassis value={v.chassis_number!} className="text-[22px] text-ink sm:text-[26px]" />
              <span className="mt-1 flex items-center gap-1.5 text-[12.5px]">
                {v.chassis_verified ? (
                  <span className="flex items-center gap-1.5 text-ok"><BadgeCheck className="size-3.5" />{t('header.chassisChecked')}</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-warn"><ShieldAlert className="size-3.5" />{t('header.chassisNotChecked')}</span>
                )}
                {canWrite && <ChassisVerifyToggle v={v} />}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
              <Fact label={t('header.arrived')} value={fmtDateTime(v.arrival_at)} />
              <Fact label={v.status === 'delivered' ? t('header.delivered') : t('header.sold')} value={fmtDateTime(v.status === 'delivered' ? v.delivered_at : v.sold_at)} />
              <Fact label={t('header.expenses')} value={fmtMoney(v.expense_total)} />
              <Fact label={t('header.accessories')} value={accSummary} tone={v.missing_accessories ? 'danger' : undefined} />
            </dl>
          </div>
          {canWrite && (
            <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col">
              <Button variant="primary" onClick={() => setDialog('status')}><ArrowLeftRight className="flip-rtl" /> {t('header.changeStatus')}</Button>
              <Button onClick={() => setDialog('edit')}><Pencil /> {t('header.editDetails')}</Button>
              {(profile.role === 'admin' || profile.role === 'secretary') && (
                <>
                  <Button variant="ghost" onClick={() => setDialog('chassis')}>{t('header.correctChassis')}</Button>
                  <Button variant="ghost" onClick={() => setDialog('archive')}>{v.archived_at ? <><ArchiveRestore /> {t('header.restore')}</> : <><Archive /> {t('header.archive')}</>}</Button>
                </>
              )}
            </div>
          )}
        </div>
        <Tabs value={tab} onChange={(tb) => setParams(tb === 'overview' ? {} : { tab: tb }, { replace: true })} items={tabs} className="border-t border-line-soft px-3 sm:px-4" />
      </Panel>

      <div className="mt-5">
        {tab === 'overview' && <Overview v={v} />}
        {tab === 'documents' && <DocumentsTab vehicleId={v.id!} chassis={v.chassis_number!} />}
        {tab === 'photos' && <PhotosTab vehicleId={v.id!} />}
        {tab === 'accessories' && <AccessoriesTab vehicleId={v.id!} />}
        {tab === 'expenses' && <ExpensesTab vehicleId={v.id!} />}
        {tab === 'timeline' && <TimelineTab vehicleId={v.id!} />}
        {tab === 'activity' && seeAudit && <ActivityTab vehicleId={v.id!} />}
      </div>

      <StatusDialog v={v} open={dialog === 'status'} onClose={() => setDialog(null)} />
      <EditDialog v={v} open={dialog === 'edit'} onClose={() => setDialog(null)} />
      <ChassisDialog v={v} open={dialog === 'chassis'} onClose={() => setDialog(null)} />
      <ArchiveDialog v={v} open={dialog === 'archive'} onClose={() => setDialog(null)} />
    </>
  )
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className={tone === 'danger' ? 'text-danger' : 'text-ink'}>{value}</dd>
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

function Overview({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('vehicle')
  const rows: [string, React.ReactNode][] = [
    [t('overview.brand'), v.brand], [t('overview.model'), v.model], [t('overview.year'), v.year], [t('overview.trim'), v.trim_level],
    [t('overview.exteriorColor'), v.exterior_color], [t('overview.interiorColor'), v.interior_color],
    [t('overview.mileage'), v.mileage_km !== null ? fmtKm(v.mileage_km) : null],
    [t('overview.location'), v.location], [t('overview.status'), STATUS_LABEL[v.status!]], [t('overview.arrived'), fmtDateTime(v.arrival_at)],
    [t('overview.sold'), fmtDateTime(v.sold_at)], [t('overview.delivered'), fmtDateTime(v.delivered_at)],
    [t('overview.purchasePrice'), v.acquisition_price !== null ? fmtMoney(v.acquisition_price) : null],
    [t('overview.salePrice'), v.sale_price !== null ? fmtMoney(v.sale_price) : null],
    [t('overview.created'), fmtDateTime(v.created_at)], [t('overview.updated'), fmtDateTime(v.updated_at)],
  ]
  const profit = v.sale_price !== null && v.acquisition_price !== null
    ? (Math.round(Number(v.sale_price) * 100) - Math.round(Number(v.acquisition_price) * 100) - Math.round(Number(v.expense_total) * 100)) / 100
    : null
  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <Panel>
        <dl className="grid sm:grid-cols-2">
          {rows.map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line-soft px-4 py-2.5 text-[13.5px] sm:odd:border-e">
              <dt className="text-ink-2">{k}</dt>
              <dd className="text-end">{val === null || val === undefined || val === '' ? <span className="text-ink-3">—</span> : val}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="space-y-5">
        {profit !== null && (
          <Panel className="p-4">
            <p className="text-[13px] text-ink-2">{t('overview.grossProfit')}</p>
            <p className={`tnum mt-1 text-[20px] font-semibold ${profit < 0 ? 'text-danger' : ''}`}>{fmtMoney(profit)}</p>
            <p className="mt-1 text-[12.5px] text-ink-3">{t('overview.profitFormula')}</p>
          </Panel>
        )}
        <Panel className="p-4">
          <p className="mb-1 text-[13px] text-ink-2">{t('overview.notes')}</p>
          <p className="text-[13.5px] whitespace-pre-wrap">{v.notes || <span className="text-ink-3">{t('overview.noNotes')}</span>}</p>
        </Panel>
      </div>
    </div>
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
  const { t } = useTranslation(['vehicle', 'common'])
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema), values: toForm(v) })
  const upd = useUpdateVehicle(v.id!)
  return (
    <Dialog open={open} onClose={onClose} title={t('editDialog.title')} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={upd.isPending} onClick={form.handleSubmit((vals) => upd.mutate(fromForm(vals), {
          onSuccess: () => { toast.success(t('editDialog.toast')); onClose() },
          onError: (e) => toast.error(friendlyError(e)),
        }))}>{t('common:actions.saveChanges')}</Button>
      </>}>
      <VehicleFields form={form} />
    </Dialog>
  )
}

function ChassisDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'common'])
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
