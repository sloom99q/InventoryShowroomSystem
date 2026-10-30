import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, ArchiveRestore, ArrowLeftRight, BadgeCheck, Pencil, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
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
  if (q.error || !q.data) return <ErrorNote error={q.error ?? new Error('Vehicle not found')} />
  const v = q.data
  const seeAudit = profile.role === 'admin' || profile.role === 'secretary'

  const tabs: { value: Tab; label: string; count?: number | null }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'documents', label: 'Documents', count: docs.data?.filter((d) => !d.superseded_at).length },
    { value: 'photos', label: 'Photos', count: imgs.data?.filter((i) => !i.superseded_at).length },
    { value: 'accessories', label: 'Accessories', count: acc.data?.length },
    { value: 'expenses', label: 'Expenses', count: exp.data?.length },
    { value: 'timeline', label: 'Timeline' },
    ...(seeAudit ? [{ value: 'activity' as Tab, label: 'Change history' }] : []),
  ]

  return (
    <>
      <nav className="mb-4 text-[13px] text-ink-3"><Link to="/vehicles" className="hover:text-ink">Vehicles</Link> / <span className="text-ink-2">{vehicleTitle(v)}</span></nav>

      {v.archived_at && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-2.5 text-[13.5px] text-ink-2">
          <Archive className="size-4" /> Archived on {fmtDateTime(v.archived_at)}. It stays searchable but is hidden from the main list.
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

            <div className="mt-4 inline-flex flex-col rounded-md border border-line bg-bg/60 px-4 py-2.5">
              <span className="text-[11.5px] text-ink-3">Chassis number</span>
              <Chassis value={v.chassis_number!} className="text-[22px] text-ink sm:text-[26px]" />
              <span className="mt-1 flex items-center gap-1.5 text-[12.5px]">
                {v.chassis_verified ? (
                  <span className="flex items-center gap-1.5 text-ok"><BadgeCheck className="size-3.5" />Checked against documents</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-warn"><ShieldAlert className="size-3.5" />Not yet checked against documents</span>
                )}
                {canWrite && (
                  <ChassisVerifyToggle v={v} />
                )}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
              <Fact label="Arrived" value={fmtDateTime(v.arrival_at)} />
              <Fact label={v.status === 'delivered' ? 'Delivered' : 'Sold'} value={fmtDateTime(v.status === 'delivered' ? v.delivered_at : v.sold_at)} />
              <Fact label="Expenses" value={fmtMoney(v.expense_total)} />
              <Fact label="Accessories" value={!v.accessory_count ? 'Not recorded' : v.missing_accessories ? `${v.missing_accessories} missing` : v.unknown_accessories ? `${v.unknown_accessories} to check` : 'Complete'} tone={v.missing_accessories ? 'danger' : undefined} />
            </dl>
          </div>
          {canWrite && (
            <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col">
              <Button variant="primary" onClick={() => setDialog('status')}><ArrowLeftRight /> Change status</Button>
              <Button onClick={() => setDialog('edit')}><Pencil /> Edit details</Button>
              {(profile.role === 'admin' || profile.role === 'secretary') && (
                <>
                  <Button variant="ghost" onClick={() => setDialog('chassis')}>Correct chassis</Button>
                  <Button variant="ghost" onClick={() => setDialog('archive')}>{v.archived_at ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}</Button>
                </>
              )}
            </div>
          )}
        </div>
        <Tabs value={tab} onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })} items={tabs} className="border-t border-line-soft px-3 sm:px-4" />
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
  const upd = useUpdateVehicle(v.id!)
  return (
    <button
      className="ms-2 cursor-pointer text-ink-3 underline hover:text-ink"
      disabled={upd.isPending}
      onClick={() => upd.mutate({ chassis_verified: !v.chassis_verified }, {
        onSuccess: () => toast.success(v.chassis_verified ? 'Marked as not checked' : 'Chassis marked as checked'),
        onError: (e) => toast.error(friendlyError(e)),
      })}
    >
      {v.chassis_verified ? 'Undo' : 'Mark as checked'}
    </button>
  )
}

function Overview({ v }: { v: VehicleOverview }) {
  const rows: [string, React.ReactNode][] = [
    ['Brand', v.brand], ['Model', v.model], ['Year', v.year], ['Trim / specification', v.trim_level],
    ['Exterior colour', v.exterior_color], ['Interior colour', v.interior_color], ['Mileage', v.mileage_km !== null ? fmtKm(v.mileage_km) : null],
    ['Location', v.location], ['Status', STATUS_LABEL[v.status!]], ['Arrived', fmtDateTime(v.arrival_at)],
    ['Sold', fmtDateTime(v.sold_at)], ['Delivered', fmtDateTime(v.delivered_at)],
    ['Purchase price', v.acquisition_price !== null ? fmtMoney(v.acquisition_price) : null],
    ['Sale price', v.sale_price !== null ? fmtMoney(v.sale_price) : null],
    ['Record created', fmtDateTime(v.created_at)], ['Last updated', fmtDateTime(v.updated_at)],
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
            <p className="text-[13px] text-ink-2">Gross profit</p>
            <p className={`tnum mt-1 text-[20px] font-semibold ${profit < 0 ? 'text-danger' : ''}`}>{fmtMoney(profit)}</p>
            <p className="mt-1 text-[12.5px] text-ink-3">Sale price − purchase price − expenses</p>
          </Panel>
        )}
        <Panel className="p-4">
          <p className="mb-1 text-[13px] text-ink-2">Notes</p>
          <p className="text-[13.5px] whitespace-pre-wrap">{v.notes || <span className="text-ink-3">No notes</span>}</p>
        </Panel>
      </div>
    </div>
  )
}

const NEEDS_DATE: Partial<Record<VehicleStatus, string>> = { sold: 'Sale date and time', delivered: 'Delivery date and time', in_garage: 'Date into garage', reserved: 'Reserved on' }

function StatusDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<VehicleStatus>(v.status!)
  const [at, setAt] = useState(nowLocalInput())
  const [note, setNote] = useState('')
  const m = useChangeStatus(v.id!)
  const dateLabel = NEEDS_DATE[status]
  const backwards = (v.status === 'sold' || v.status === 'delivered') && status !== 'sold' && status !== 'delivered'
  return (
    <Dialog open={open} onClose={onClose} title="Change status" description={<>Currently <b className="font-medium text-ink">{STATUS_LABEL[v.status!]}</b></>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={m.isPending} disabled={status === v.status || (!!dateLabel && !at)}
          onClick={() => m.mutate({ status, at: fromLocalInput(at), note }, {
            onSuccess: () => { toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`); setNote(''); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>Save status</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
              className={`cursor-pointer rounded-md border px-3 py-2.5 text-start text-[13.5px] ${status === s ? 'border-accent bg-accent-soft' : 'border-line hover:bg-raised'}`}>
              <StatusBadge status={s} className="ring-0 bg-transparent px-0" />
            </button>
          ))}
        </div>
        {dateLabel && (
          <Field label={dateLabel} hint="UAE time">
            {(id) => <Input id={id} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />}
          </Field>
        )}
        {backwards && <p className="rounded-md bg-warn/10 px-3 py-2 text-[13px] text-warn">This clears the recorded sale{v.status === 'delivered' ? ' and delivery' : ''} date. The old dates stay in the timeline and change history.</p>}
        <Field label="Note (optional)">
          {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'sold' ? 'e.g. Sold to walk-in customer, paid by transfer' : ''} />}
        </Field>
      </div>
    </Dialog>
  )
}

function EditDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema), values: toForm(v) })
  const upd = useUpdateVehicle(v.id!)
  return (
    <Dialog open={open} onClose={onClose} title="Edit details" size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={upd.isPending} onClick={form.handleSubmit((vals) => upd.mutate(fromForm(vals), {
          onSuccess: () => { toast.success('Changes saved'); onClose() },
          onError: (e) => toast.error(friendlyError(e)),
        }))}>Save changes</Button>
      </>}>
      <VehicleFields form={form} />
    </Dialog>
  )
}

function ChassisDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const [value, setValue] = useState(v.chassis_number!)
  const [reason, setReason] = useState('')
  const blocked = useChassisBlocked(value, v.id!)
  const upd = useUpdateVehicle(v.id!)
  return (
    <Dialog open={open} onClose={onClose} title="Correct chassis number" size="lg"
      description="Use this only to fix a typing or reading mistake. The old value is kept in the change history."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={upd.isPending} disabled={blocked || value.trim() === v.chassis_number || !reason.trim()}
          onClick={() => upd.mutate({ chassis_number: value.trim(), chassis_verified: false, notes: [v.notes, `Chassis corrected from ${v.chassis_number}: ${reason.trim()}`].filter(Boolean).join('\n') }, {
            onSuccess: () => { toast.success('Chassis number corrected'); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>Save correction</Button>
      </>}>
      <div className="space-y-4">
        <ChassisInput value={value} onChange={setValue} excludeId={v.id!} />
        <Field label="Reason for the correction">
          {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 8 was typed as B; checked against the export certificate" />}
        </Field>
      </div>
    </Dialog>
  )
}

function ArchiveDialog({ v, open, onClose }: { v: VehicleOverview; open: boolean; onClose: () => void }) {
  const m = useArchiveVehicle(v.id!)
  const archiving = !v.archived_at
  return (
    <ConfirmDialog open={open} onClose={onClose} title={archiving ? 'Archive this vehicle?' : 'Restore this vehicle?'} danger={archiving}
      confirmLabel={archiving ? 'Archive vehicle' : 'Restore vehicle'} loading={m.isPending}
      onConfirm={() => m.mutate({ archive: archiving }, { onSuccess: () => { toast.success(archiving ? 'Vehicle archived' : 'Vehicle restored'); onClose() }, onError: (e) => toast.error(friendlyError(e)) })}>
      {archiving
        ? 'It will be hidden from the vehicle list and dashboard counts. Nothing is deleted: documents, photos, expenses and history are kept, and you can restore it at any time.'
        : 'It will appear in the vehicle list and dashboard again.'}
    </ConfirmDialog>
  )
}
