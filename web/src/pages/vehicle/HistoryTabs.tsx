import { useState } from 'react'
import { toast } from 'sonner'
import { useAddNote, useAudit, useEvents, useStaffNames } from '@/api/records'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDateTime, fromLocalInput, nowLocalInput } from '@/lib/format'
import { STATUS_LABEL } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { AuditLog, VehicleEvent } from '@/lib/types'

function eventText(e: VehicleEvent) {
  switch (e.event_type) {
    case 'registered': return 'Vehicle registered'
    case 'status_change': return `${e.from_status ? `${STATUS_LABEL[e.from_status]} → ` : ''}${STATUS_LABEL[e.to_status!]}`
    case 'archived': return 'Archived'
    case 'restored': return 'Restored from archive'
    case 'note': return 'Note'
    default: return e.event_type
  }
}

export function TimelineTab({ vehicleId }: { vehicleId: string }) {
  const { canWrite } = useCompany()
  const q = useEvents(vehicleId)
  const names = useStaffNames()
  const add = useAddNote(vehicleId)
  const [note, setNote] = useState('')
  const [at, setAt] = useState(nowLocalInput())
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  return (
    <Panel>
      <PanelHeader title="Timeline" />
      {canWrite && (
        <form className="flex flex-col gap-2 border-b border-line-soft p-4 sm:flex-row" onSubmit={(e) => {
          e.preventDefault()
          if (!note.trim()) return
          add.mutate({ description: note.trim(), event_at: fromLocalInput(at)! }, { onSuccess: () => { setNote(''); toast.success('Note added') }, onError: (er) => toast.error(friendlyError(er)) })
        }}>
          <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note, e.g. Customer viewed the car; collected from port" className="min-h-9 flex-1" aria-label="Note" />
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="sm:w-52" aria-label="When" />
          <Button type="submit" loading={add.isPending} disabled={!note.trim()}>Add note</Button>
        </form>
      )}
      <ol className="relative px-4 py-4">
        {q.data!.map((e, i) => (
          <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
            {i < q.data!.length - 1 && <span className="absolute start-[5px] top-4 bottom-0 w-px bg-line" aria-hidden />}
            <span className={cn('mt-1.5 size-[11px] shrink-0 rounded-full border-2', e.event_type === 'status_change' ? 'border-accent bg-accent/30' : 'border-line bg-raised')} aria-hidden />
            <div className="min-w-0 text-[13.5px]">
              <p className="font-medium">{eventText(e)}</p>
              {e.description && e.event_type !== 'registered' && <p className="whitespace-pre-wrap text-ink-2">{e.description}</p>}
              <p className="text-[12.5px] text-ink-3">{fmtDateTime(e.event_at)}{e.created_by ? ` · ${names.data?.get(e.created_by) ?? ''}` : ''}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

const FIELD_LABEL: Record<string, string> = {
  chassis_number: 'Chassis number', chassis_verified: 'Chassis checked', brand: 'Brand', model: 'Model', year: 'Year',
  trim_level: 'Trim', exterior_color: 'Exterior colour', interior_color: 'Interior colour', mileage_km: 'Mileage',
  location: 'Location', status: 'Status', arrival_at: 'Arrival', sold_at: 'Sold', delivered_at: 'Delivered',
  acquisition_price: 'Purchase price', sale_price: 'Sale price', notes: 'Notes', archived_at: 'Archived',
  title: 'Title', category: 'Category', amount: 'Amount', expense_date: 'Date', supplier_name: 'Supplier', description: 'Description',
  receipt_storage_path: 'Receipt', item_name: 'Item', quantity: 'Quantity', verification_status: 'Verification',
  superseded_at: 'Replaced', deleted_at: 'Removed', document_type: 'Type', caption: 'Caption',
}
const HIDDEN = new Set(['id', 'company_id', 'vehicle_id', 'created_at', 'created_by', 'uploaded_by', 'uploaded_at', 'storage_path', 'thumbnail_path', 'group_id', 'mime_type', 'file_size', 'extracted_text', 'chassis_normalized', 'currency'])
const ENTITY: Record<string, string> = { vehicles: 'Vehicle', documents: 'Document', vehicle_images: 'Photo', accessories: 'Accessory', expenses: 'Expense' }
const ACTION: Record<string, string> = { insert: 'added', update: 'changed', soft_delete: 'removed', delete: 'deleted', archive: 'archived', restore: 'restored' }

function show(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string' && /_at$/.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v)
  if (k === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v)
  return String(v)
}

function label(a: AuditLog) {
  const nv = (a.new_values ?? a.previous_values ?? {}) as Record<string, unknown>
  const what = (nv.title ?? nv.item_name ?? nv.original_filename ?? '') as string
  return `${ENTITY[a.entity_type] ?? a.entity_type}${what ? ` “${what}”` : ''} ${ACTION[a.action] ?? a.action}`
}

export function ActivityTab({ vehicleId }: { vehicleId: string }) {
  const q = useAudit(vehicleId, true)
  const names = useStaffNames()
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  return (
    <Panel>
      <PanelHeader title="Change history" />
      <p className="border-b border-line-soft px-4 py-2 text-[12.5px] text-ink-3">Every change to this vehicle and its records: who, when, and the before and after values.</p>
      <ul className="divide-y divide-line-soft">
        {q.data!.map((a) => {
          const prev = (a.previous_values ?? {}) as Record<string, unknown>
          const next = (a.new_values ?? {}) as Record<string, unknown>
          const keys = a.action === 'insert' ? [] : Object.keys({ ...prev, ...next }).filter((k) => !HIDDEN.has(k))
          return (
            <li key={a.id} className="px-4 py-3 text-[13.5px]">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-medium">{label(a)}</p>
                <p className="text-[12.5px] text-ink-3">{fmtDateTime(a.created_at)} · {a.user_id ? names.data?.get(a.user_id) ?? 'Staff member' : 'System'}</p>
              </div>
              {keys.length > 0 && (
                <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-[160px_1fr]">
                  {keys.map((k) => (
                    <div key={k} className="contents">
                      <dt className="text-ink-3">{FIELD_LABEL[k] ?? k}</dt>
                      <dd className="break-words"><span className="text-ink-3 line-through decoration-ink-3/50">{show(k, prev[k])}</span> <span className="text-ink-3">→</span> <span>{show(k, next[k])}</span></dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
