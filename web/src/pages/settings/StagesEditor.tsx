// Settings → Stages: the showroom's own list (name, colour, order). Cars can skip stages.
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { type Stage, useDeleteStage, useReorderStages, useSaveStage, useStages } from '@/api/journey'
import { Button } from '@/components/ui/button'
import { Panel, PanelHeader } from '@/components/ui/misc'
import { InlineText, StagePill } from '@/components/v3/bits'
import { friendlyError } from '@/lib/supabase'
import type { VehicleStatus } from '@/lib/types'

const MEANINGS: VehicleStatus[] = ['in_stock', 'in_garage', 'reserved', 'sold', 'delivered']
const SWATCHES = ['#5b6470', '#b86e00', '#1f5fbf', '#16824f', '#6a3fc1', '#c8102e', '#16181b', '#0f8a8a']

export function StagesEditor() {
  const { t } = useTranslation('cars')
  const q = useStages()
  const save = useSaveStage()
  const reorder = useReorderStages()
  const del = useDeleteStage()
  const list = q.data ?? []
  const err = (e: unknown) => toast.error(friendlyError(e))
  const move = (i: number, d: -1 | 1) => {
    const ids = list.map((s) => s.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    reorder.mutate(ids, { onError: err })
  }
  const add = () => save.mutate({ name_en: t('stagesEditor.newName'), color: SWATCHES[list.length % SWATCHES.length], position: (list.at(-1)?.position ?? 0) + 1, status: 'in_stock' }, { onError: err })
  return (
    <Panel data-testid="stages-editor">
      <PanelHeader title={t('stagesEditor.title')}>
        <Button size="sm" onClick={add} loading={save.isPending}><Plus />{t('stagesEditor.add')}</Button>
      </PanelHeader>
      <p className="border-b border-line-soft px-5 py-3 text-[13.5px] text-ink-2">{t('stagesEditor.hint')}</p>
      <ol className="divide-y divide-line-soft">
        {list.map((s, i) => <StageRow key={s.id} s={s} first={i === 0} last={i === list.length - 1} onMove={(d) => move(i, d)}
          onDelete={() => del.mutate(s.id, { onError: (e) => toast.error(/foreign key|violates/i.test(String((e as Error).message)) ? t('stagesEditor.inUse') : friendlyError(e)) })} />)}
      </ol>
    </Panel>
  )
}

function StageRow({ s, first, last, onMove, onDelete }: { s: Stage; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const { t } = useTranslation('cars')
  const save = useSaveStage()
  const [colors, setColors] = useState(false)
  const set = (patch: Partial<Stage>) => save.mutateAsync({ id: s.id, ...patch })
  return (
    <li className="grid items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_150px_auto]" data-stage-row={s.name_en}>
      <StagePill name={s.name_en} color={s.color} />
      <InlineText id={`stage-en-${s.id}`} label={t('stagesEditor.nameEn')} value={s.name_en} validate={(x) => (x ? null : t('stagesEditor.nameRequired'))}
        onSave={(x) => set({ name_en: x })} />
      <InlineText id={`stage-ar-${s.id}`} label={t('stagesEditor.nameAr')} value={s.name_ar ?? ''} dir="rtl" lang="ar" placeholder={t('stagesEditor.arPh')}
        onSave={(x) => set({ name_ar: x || null })} />
      <select value={s.status} onChange={(e) => void set({ status: e.target.value as VehicleStatus })} aria-label={t('stagesEditor.meaning', { stage: s.name_en })}
        className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px]">
        {MEANINGS.map((m) => <option key={m} value={m}>{t(`stagesEditor.means.${m}`)}</option>)}
      </select>
      <span className="flex items-center gap-1">
        <span className="relative">
          <button onClick={() => setColors(!colors)} className="flex size-8 items-center justify-center rounded-lg hover:bg-hover" aria-label={t('stagesEditor.colour', { stage: s.name_en })}>
            <span className="size-4 rounded-full" style={{ background: s.color }} />
          </button>
          {colors && (
            <span className="absolute end-0 top-full z-10 mt-1 flex gap-1.5 rounded-xl border border-line bg-surface p-2 shadow-lg">
              {SWATCHES.map((c) => (
                <button key={c} onClick={() => { setColors(false); void set({ color: c }) }} aria-label={c} className="size-6 rounded-full ring-offset-2 hover:ring-2 hover:ring-line" style={{ background: c }} />
              ))}
            </span>
          )}
        </span>
        <button disabled={first} onClick={() => onMove(-1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-hover disabled:opacity-30" aria-label={t('stagesEditor.up', { stage: s.name_en })}><ArrowUp className="size-4" /></button>
        <button disabled={last} onClick={() => onMove(1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-hover disabled:opacity-30" aria-label={t('stagesEditor.down', { stage: s.name_en })}><ArrowDown className="size-4" /></button>
        <button onClick={onDelete} className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-danger" aria-label={t('stagesEditor.delete', { stage: s.name_en })}><Trash2 className="size-4" /></button>
      </span>
    </li>
  )
}
