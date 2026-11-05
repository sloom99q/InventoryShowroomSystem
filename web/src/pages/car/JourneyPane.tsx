// Journey: when the car arrived, went to the garage, to RTA, was sold and delivered — and who moved it.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAddNote } from '@/api/records'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/lib/auth'
import { fromLocalInput, nowLocalInput } from '@/lib/format'
import { friendlyError } from '@/lib/supabase'
import { useJourney, useStages } from '@/api/journey'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { fmtDate } from '@/lib/format'
import type { VehicleOverview } from '@/lib/types'
import { useStageName } from '@/lib/stageName'

const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }).format(new Date(iso))

export function JourneyPane({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const { canWrite } = useCompany()
  const q = useJourney(v.id!)
  const stages = useStages()
  const stageName = useStageName()
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const byId = new Map((stages.data ?? []).map((s) => [s.id, s]))
  const events = q.data ?? []
  return (
    <div>
      {canWrite && <AddNote vehicleId={v.id!} />}
      <ol className="card px-5 py-6 sm:px-8" data-testid="journey">
        {events.map((e, i) => {
          const s = e.stage_id ? byId.get(e.stage_id) : undefined
          const isNote = e.event_type === 'note'
          const color = isNote ? '#c4c2bc' : s?.color ?? '#8a8f97'
          // The stage's current name; the old one too if it was renamed since.
          const name = s ? stageName(s) : e.stage_name
          return (
            <li key={e.id} data-journey-note={isNote ? e.description ?? '' : undefined} className="relative grid grid-cols-[76px_24px_minmax(0,1fr)] gap-x-4 pb-6 last:pb-0" data-journey-stage={e.stage_name}>
              <div className="text-end">
                <p className="text-[14px] font-semibold">{fmtDate(e.event_at).replace(/ \d{4}$/, '')}</p>
                <p className="tnum text-[13px] text-ink-3">{time(e.event_at)}</p>
              </div>
              <div className="relative flex justify-center">
                {i < events.length - 1 && <span className="absolute top-5 bottom-[-24px] w-px bg-line" aria-hidden />}
                <span className="relative mt-0.5 flex size-5 items-center justify-center rounded-full border-2 bg-surface" style={{ borderColor: color }}>
                  <span className="size-2 rounded-full" style={{ background: color }} />
                </span>
              </div>
              <div>
                {isNote ? (
                  <>
                    <p className="font-semibold text-ink-2">{t('journey.noteTitle')}</p>
                    <p className="text-[14px] whitespace-pre-wrap">{e.description}</p>
                    {e.by && <p className="text-[13px] text-ink-3">{t('journey.notedBy', { name: e.by })}</p>}
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{name}{s && e.stage_name && s.name_en !== e.stage_name && <span className="font-normal text-ink-3"> ({e.stage_name})</span>}</p>
                    <p className="text-[14px] text-ink-2">
                      {[e.by ? t('journey.movedBy', { name: e.by }) : null, e.description ? t('journey.noteText', { note: e.description }) : null].filter(Boolean).join(' · ') || ' '}
                    </p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[13px] text-ink-3">{t('journey.footnote')}</p>
    </div>
  )
}

/** A free note on the car's timeline ("Customer called about the tint"), dated. */
function AddNote({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation('cars')
  const qc = useQueryClient()
  const add = useAddNote(vehicleId)
  const [note, setNote] = useState('')
  const [at, setAt] = useState(nowLocalInput())
  const save = () => add.mutate({ description: note.trim(), event_at: fromLocalInput(at) ?? new Date().toISOString() }, {
    onSuccess: () => { setNote(''); setAt(nowLocalInput()); qc.invalidateQueries({ queryKey: ['journey', vehicleId] }); toast.success(t('journey.noteAdded')) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <form className="card mb-4 flex flex-wrap items-center gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) save() }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('journey.notePlaceholder')} aria-label={t('journey.noteTitle')}
        className="h-10 min-w-[200px] flex-1 rounded-lg border border-line px-3 outline-none focus:border-ink" />
      <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label={t('journey.noteWhen')}
        className="h-10 rounded-lg border border-line px-2 text-[13.5px] outline-none focus:border-ink" />
      <Button type="submit" loading={add.isPending} disabled={!note.trim()}>{t('journey.addNote')}</Button>
    </form>
  )
}
