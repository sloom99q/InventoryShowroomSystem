import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAddNote, useAudit, useEvents, useStaffNames } from '@/api/records'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import i18n from '@/i18n'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDateTime, fromLocalInput, nowLocalInput } from '@/lib/format'
import { ACCESSORY_LABEL, DOCUMENT_LABEL, EXPENSE_LABEL, IMAGE_LABEL, ITEM_STATUS_LABEL, STATUS_LABEL } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { AuditLog, VehicleEvent } from '@/lib/types'

function eventText(e: VehicleEvent) {
  const t = i18n.getFixedT(null, 'vehicle')
  switch (e.event_type) {
    case 'registered': return t('timeline.registered')
    case 'status_change': return `${e.from_status ? `${STATUS_LABEL[e.from_status]} ${i18n.dir() === 'rtl' ? '←' : '→'} ` : ''}${STATUS_LABEL[e.to_status!]}`
    case 'archived': return t('timeline.archived')
    case 'restored': return t('timeline.restored')
    case 'note': return t('timeline.note')
    case 'document_generated': return t('history.generated')
    case 'documents_imported': return t('history.imported')
    default: return e.event_type
  }
}

const HIDDEN = new Set(['id', 'company_id', 'vehicle_id', 'created_at', 'created_by', 'uploaded_by', 'uploaded_at', 'storage_path', 'thumbnail_path', 'group_id', 'mime_type', 'file_size', 'extracted_text', 'chassis_normalized', 'currency', 'updated_at'])

function show(entity: string, k: string, v: unknown): string {
  const t = i18n.getFixedT(null, 'vehicle')
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? t('activity.yes') : t('activity.no')
  if (typeof v === 'string' && /_at$/.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v)
  const s = String(v)
  const lookup = (rec: Record<string, string>) => rec[s] ?? s
  if (k === 'status') return entity === 'accessories' ? lookup(ITEM_STATUS_LABEL) : lookup(STATUS_LABEL)
  if (k === 'category') return lookup(EXPENSE_LABEL)
  if (k === 'item_type') return lookup(ACCESSORY_LABEL)
  if (k === 'document_type') return lookup(DOCUMENT_LABEL)
  if (k === 'image_type') return lookup(IMAGE_LABEL)
  if (k === 'verification_status') return s === 'verified' ? t('docs.verified') : t('docs.unverified')
  return s
}

function fieldLabel(k: string) {
  return i18n.exists(`activity.field.${k}`, { ns: 'vehicle' }) ? i18n.t(`activity.field.${k}` as never, { ns: 'vehicle' }) : k
}

function label(a: AuditLog) {
  const t = i18n.getFixedT(null, 'vehicle')
  const nv = (a.new_values ?? a.previous_values ?? {}) as Record<string, unknown>
  const what = (nv.title ?? nv.item_name ?? nv.original_filename ?? (nv.position ? nv.value_en : nv.label) ?? '') as string
  const entity = i18n.exists(`activity.entity.${a.entity_type}`, { ns: 'vehicle' }) ? t(`activity.entity.${a.entity_type}` as never) : a.entity_type
  const action = i18n.exists(`activity.action.${a.action}`, { ns: 'vehicle' }) ? t(`activity.action.${a.action}` as never) : a.action
  return t('activity.entry', { entity, what: what ? ` “${what}”` : '', action })
}

type Item = { at: string; event?: VehicleEvent; audit?: AuditLog }

/** One chronological list: status changes, notes and every recorded edit (newest first). */
export function HistoryTab({ vehicleId }: { vehicleId: string }) {
  const { t, i18n: inst } = useTranslation(['vehicle', 'common'])
  const { canWrite, profile } = useCompany()
  const seeAudit = profile.role === 'admin' || profile.role === 'secretary'
  const events = useEvents(vehicleId)
  const audit = useAudit(vehicleId, seeAudit)
  const names = useStaffNames()
  const add = useAddNote(vehicleId)
  const [note, setNote] = useState('')
  const [at, setAt] = useState(nowLocalInput())
  const arrow = inst.dir() === 'rtl' ? '←' : '→'
  if (events.isLoading || (seeAudit && audit.isLoading)) return <PageLoader />
  if (events.error) return <ErrorNote error={events.error} />
  const who = (id: string | null) => (id ? names.data?.get(id) ?? t('common:terms.staffMember') : t('common:terms.system'))
  const items: Item[] = [
    ...(events.data ?? []).map((e) => ({ at: e.event_at, event: e })),
    ...(seeAudit ? audit.data ?? [] : [])
      // Status changes already appear as timeline events; keep the audit entry only when it says more.
      .filter((a) => !(a.entity_type === 'vehicles' && a.action === 'insert'))
      .map((a) => ({ at: a.created_at, audit: a })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Panel>
      <PanelHeader title={t('history.title')} />
      <p className="border-b border-line-soft px-4 py-2 text-[12.5px] text-ink-3">{t('history.intro')}</p>
      {canWrite && (
        <form className="flex flex-col gap-2 border-b border-line-soft p-4 sm:flex-row" onSubmit={(e) => {
          e.preventDefault()
          if (!note.trim()) return
          add.mutate({ description: note.trim(), event_at: fromLocalInput(at)! }, { onSuccess: () => { setNote(''); toast.success(t('timeline.toastNote')) }, onError: (er) => toast.error(friendlyError(er)) })
        }}>
          <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('timeline.notePlaceholder')} className="min-h-9 flex-1" aria-label={t('timeline.noteAria')} />
          <Input type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} className="sm:w-52" aria-label={t('timeline.whenAria')} />
          <Button type="submit" loading={add.isPending} disabled={!note.trim()}>{t('timeline.addNote')}</Button>
        </form>
      )}
      {items.length === 0 && <p className="px-4 py-6 text-[13px] text-ink-3">{t('history.empty')}</p>}
      <ol className="relative px-4 py-4">
        {items.map((it, i) => {
          const last = i === items.length - 1
          if (it.event) {
            const e = it.event
            return (
              <li key={`e${e.id}`} className="relative flex gap-4 pb-5 last:pb-0">
                {!last && <span className="absolute start-[5px] top-4 bottom-0 w-px bg-line" aria-hidden />}
                <span className={cn('mt-1.5 size-[11px] shrink-0 rounded-full border-2', e.event_type === 'status_change' ? 'border-accent bg-accent/30' : 'border-line bg-raised')} aria-hidden />
                <div className="min-w-0 text-[13.5px]">
                  <p className="font-medium">{eventText(e)}</p>
                  {e.description && e.event_type !== 'registered' && <p className="whitespace-pre-wrap text-ink-2" dir="auto">{e.description}</p>}
                  <p className="text-[12.5px] text-ink-3">{fmtDateTime(e.event_at)}{e.created_by ? ` · ${who(e.created_by)}` : ''}</p>
                </div>
              </li>
            )
          }
          const a = it.audit!
          const prev = (a.previous_values ?? {}) as Record<string, unknown>
          const next = (a.new_values ?? {}) as Record<string, unknown>
          const keys = a.action === 'insert' ? [] : Object.keys({ ...prev, ...next }).filter((k) => !HIDDEN.has(k))
          return (
            <li key={`a${a.id}`} className="relative flex gap-4 pb-5 last:pb-0">
              {!last && <span className="absolute start-[5px] top-4 bottom-0 w-px bg-line" aria-hidden />}
              <span className="mt-2 ms-[2px] size-[7px] shrink-0 rounded-full bg-ink-3/60" aria-hidden />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="text-ink-2">{label(a)}</p>
                {keys.length > 0 && (
                  <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-[12.5px] sm:grid-cols-[160px_1fr]">
                    {keys.map((k) => (
                      <div key={k} className="contents">
                        <dt className="text-ink-3">{fieldLabel(k)}</dt>
                        <dd className="break-words">
                          <span className="text-ink-3 line-through decoration-ink-3/50" dir="auto">{show(a.entity_type, k, prev[k])}</span>{' '}
                          <span className="text-ink-3">{arrow}</span>{' '}
                          <span dir="auto">{show(a.entity_type, k, next[k])}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-[12px] text-ink-3">{fmtDateTime(a.created_at)} · {who(a.user_id)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
