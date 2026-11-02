// Journey: when the car arrived, went to the garage, to RTA, was sold and delivered — and who moved it.
import { useTranslation } from 'react-i18next'
import { useJourney, useStages } from '@/api/journey'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { fmtDate } from '@/lib/format'
import type { VehicleOverview } from '@/lib/types'
import { useStageName } from '@/lib/stageName'

const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }).format(new Date(iso))

export function JourneyPane({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const q = useJourney(v.id!)
  const stages = useStages()
  const stageName = useStageName()
  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const byId = new Map((stages.data ?? []).map((s) => [s.id, s]))
  const events = q.data ?? []
  return (
    <div>
      <ol className="card px-5 py-6 sm:px-8" data-testid="journey">
        {events.map((e, i) => {
          const s = e.stage_id ? byId.get(e.stage_id) : undefined
          const color = s?.color ?? '#8a8f97'
          // The stage's current name; the old one too if it was renamed since.
          const name = s ? stageName(s) : e.stage_name
          return (
            <li key={e.id} className="relative grid grid-cols-[76px_24px_minmax(0,1fr)] gap-x-4 pb-6 last:pb-0" data-journey-stage={e.stage_name}>
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
                <p className="font-semibold">{name}{s && e.stage_name && s.name_en !== e.stage_name && <span className="font-normal text-ink-3"> ({e.stage_name})</span>}</p>
                <p className="text-[14px] text-ink-2">
                  {[e.by ? t('journey.movedBy', { name: e.by }) : null, e.description ? t('journey.noteText', { note: e.description }) : null].filter(Boolean).join(' · ') || ' '}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[13px] text-ink-3">{t('journey.footnote')}</p>
    </div>
  )
}
