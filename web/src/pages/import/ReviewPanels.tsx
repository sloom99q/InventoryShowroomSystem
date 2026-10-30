import { AlertTriangle, Lightbulb } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChassisInput } from '@/components/ChassisInput'
import { Input, Select } from '@/components/ui/form'
import { Panel, PanelHeader } from '@/components/ui/misc'
import { Chassis } from '@/components/vehicle-bits'
import { cn } from '@/lib/cn'
import type { ImageCandidate, MergedFact, SourceRef } from '@/lib/extract/types'
import { IMAGE_LABEL } from '@/lib/labels'
import type { ImageType } from '@/lib/types'
import { type BiCandidate, type BiChoice, type EditableField, type FieldCandidate, type FieldChoice, type Placement, type SessionFile } from './session'
import { FIELD_BY_KEY, FIELDS } from '@/lib/fields'

export function SourceChips({ sources, files, onShow }: { sources: SourceRef[]; files: SessionFile[]; onShow: (s: SourceRef) => void }) {
  const { t } = useTranslation('docimport')
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((s, i) => {
        const f = files.find((x) => x.key === s.fileKey)
        return (
          <button key={i} type="button" onClick={() => onShow(s)} title={f?.file.name}
            className="max-w-48 cursor-pointer truncate rounded-sm bg-raised px-1.5 py-0.5 text-[11.5px] text-ink-3 hover:text-ink" dir="auto">
            {f?.file.name ?? '?'}{s.page ? ` · ${t('review.pageN', { n: s.page })}` : ''}
          </button>
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------

const FIELD_ORDER: EditableField[] = ['chassis_number', 'brand', 'model', 'year', 'trim_level', 'exterior_color', 'interior_color', 'mileage_km', 'listing_price']

export function CoreFieldsPanel({ cands, choices, setChoice, current, isNew, files, onShow, decisionNeeded, wrongCar }: {
  cands: Record<EditableField, FieldCandidate[]>
  choices: Record<EditableField, FieldChoice>
  setChoice: (f: EditableField, c: FieldChoice) => void
  current: Partial<Record<EditableField, string | null>>
  isNew: boolean
  files: SessionFile[]
  onShow: (s: SourceRef) => void
  decisionNeeded: (f: EditableField) => boolean
  wrongCar: React.ReactNode
}) {
  const { t } = useTranslation(['docimport', 'common'])
  return (
    <Panel>
      <PanelHeader title={t('review.vehicleFields')} />
      {wrongCar}
      <div className="divide-y divide-line-soft">
        {FIELD_ORDER.map((f) => {
          const list = cands[f]
          const choice = choices[f]
          const cur = current[f]
          const unresolved = choice === null && decisionNeeded(f)
          const isChassis = f === 'chassis_number'
          return (
            <fieldset key={f} className={cn('grid gap-2 px-4 py-3 sm:grid-cols-[150px_1fr]', unresolved && 'bg-warn/[0.06]')} data-field={f}>
              <legend className="contents">
                <span className="pt-1 text-[13px] font-medium text-ink-2">
                  {t(`fields.${f}`)}
                  {unresolved && <span className="mt-0.5 flex items-center gap-1 text-[12px] font-normal text-warn"><AlertTriangle className="size-3.5" />{t('review.chooseOne')}</span>}
                </span>
              </legend>
              <div className="space-y-1.5">
                {list.map((c, i) => (
                  <label key={i} className={cn('flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-[13.5px]',
                    choice?.kind === 'candidate' && choice.index === i ? 'border-ink-2 bg-raised' : 'border-line-soft hover:bg-raised', c.invalid && 'opacity-70')}>
                    <input type="radio" name={`f-${f}`} checked={choice?.kind === 'candidate' && choice.index === i} disabled={c.invalid}
                      onChange={() => setChoice(f, { kind: 'candidate', index: i })} />
                    {isChassis ? <Chassis value={c.value} /> : <span className="font-medium" dir="auto">{c.value}</span>}
                    {c.suggested && <span className="flex items-center gap-1 rounded-sm bg-info/10 px-1.5 text-[11.5px] text-info"><Lightbulb className="size-3" />{t('review.suggested')}</span>}
                    {c.invalid && <span className="text-[12px] text-warn">{t('review.invalidFor')}</span>}
                    <SourceChips sources={c.sources} files={files} onShow={onShow} />
                  </label>
                ))}
                <label className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13.5px]', choice?.kind === 'keep' ? 'border-ink-2 bg-raised' : 'border-line-soft hover:bg-raised')}>
                  <input type="radio" name={`f-${f}`} checked={choice?.kind === 'keep'} onChange={() => setChoice(f, { kind: 'keep' })} />
                  {isNew
                    ? <span className="text-ink-2">{t('review.leaveEmpty')}</span>
                    : <span className="text-ink-2">{t('review.keepCurrent')}: {cur ? (isChassis ? <Chassis value={cur} className="text-ink" /> : <b className="font-medium text-ink" dir="auto">{cur}</b>) : t('review.empty')}</span>}
                </label>
                {!(isChassis && !isNew) && (
                  <div className={cn('rounded-md border px-2.5 py-1.5', choice?.kind === 'custom' ? 'border-ink-2 bg-raised' : 'border-line-soft')}>
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                      <input type="radio" name={`f-${f}`} checked={choice?.kind === 'custom'} onChange={() => setChoice(f, { kind: 'custom', text: choice?.kind === 'custom' ? choice.text : '' })} />
                      {t('review.typeValue')}
                    </label>
                    {choice?.kind === 'custom' && (
                      <div className="mt-1.5">
                        {isChassis
                          ? <ChassisInput value={choice.text} onChange={(v) => setChoice(f, { kind: 'custom', text: v })} />
                          : <Input value={choice.text} onChange={(e) => setChoice(f, { kind: 'custom', text: e.target.value })} dir={['year', 'mileage_km', 'listing_price'].includes(f) ? 'ltr' : 'auto'}
                              inputMode={['year', 'mileage_km', 'listing_price'].includes(f) ? 'decimal' : undefined} aria-label={t(`fields.${f}`)} autoFocus />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </fieldset>
          )
        })}
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

const IDENTITY_EXTRAS = FIELDS.identity.filter((f) => !['brand', 'model', 'year', 'trim', 'listing_price'].includes(f.key))

function BiFieldRow({ fkey, cands, choice, setChoice, current, unresolved, files, onShow }: {
  fkey: string
  cands: BiCandidate[]
  choice: BiChoice
  setChoice: (c: BiChoice) => void
  current: { en: string | null; ar: string | null } | undefined
  unresolved: boolean
  files: SessionFile[]
  onShow: (s: SourceRef) => void
}) {
  const { t } = useTranslation('docimport')
  const def = FIELD_BY_KEY.get(fkey)!
  const name = `bi-${fkey}`
  const box = (on: boolean) => cn('flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-[13.5px]', on ? 'border-ink-2 bg-raised' : 'border-line-soft hover:bg-raised')
  return (
    <fieldset className={cn('grid gap-2 px-4 py-3 sm:grid-cols-[170px_1fr]', unresolved && 'bg-warn/[0.06]')} data-field={fkey}>
      <legend className="contents">
        <span className="pt-1 text-[13px] font-medium text-ink-2">
          {def.label_en}
          <span className="block text-[12px] font-normal text-ink-3" dir="rtl" lang="ar">{def.label_ar}</span>
          {unresolved && <span className="mt-0.5 flex items-center gap-1 text-[12px] font-normal text-warn"><AlertTriangle className="size-3.5" />{t('review.chooseOne')}</span>}
        </span>
      </legend>
      <div className="space-y-1.5">
        {cands.map((c, i) => (
          <label key={i} className={box(choice?.kind === 'candidate' && choice.index === i)}>
            <input type="radio" name={name} checked={choice?.kind === 'candidate' && choice.index === i} onChange={() => setChoice({ kind: 'candidate', index: i })} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium" dir="auto">{c.en}</span>
              {c.ar && <span className="block text-[12.5px] text-ink-2" dir="rtl" lang="ar">{c.ar}</span>}
            </span>
            <SourceChips sources={c.sources} files={files} onShow={onShow} />
          </label>
        ))}
        <label className={box(choice?.kind === 'keep')}>
          <input type="radio" name={name} checked={choice?.kind === 'keep'} onChange={() => setChoice({ kind: 'keep' })} />
          {current?.en
            ? <span className="text-ink-2">{t('review.keepCurrent')}: <b className="font-medium text-ink" dir="auto">{current.en}</b></span>
            : <span className="text-ink-2">{t('review.leaveEmpty')}</span>}
        </label>
        <div className={cn('rounded-md border px-2.5 py-1.5', choice?.kind === 'custom' ? 'border-ink-2 bg-raised' : 'border-line-soft')}>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="radio" name={name} checked={choice?.kind === 'custom'} onChange={() => setChoice({ kind: 'custom', en: cands[0]?.en ?? '', ar: cands.find((c) => c.ar)?.ar ?? '' })} />
            {t('review.typeValue')}
          </label>
          {choice?.kind === 'custom' && (
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              <Input value={choice.en} onChange={(e) => setChoice({ ...choice, en: e.target.value })} dir="auto" aria-label={def.label_en} placeholder="English" autoFocus />
              <Input value={choice.ar} onChange={(e) => setChoice({ ...choice, ar: e.target.value })} dir="rtl" lang="ar" aria-label={def.label_ar} placeholder="العربية" />
            </div>
          )}
        </div>
      </div>
    </fieldset>
  )
}

/** Found values laid out in the same sections as the car page. */
export function SectionsPanel({ placement, choices, setChoice, current, needsDecision, itemOff, toggleItem, files, onShow }: {
  placement: Placement
  choices: Record<string, BiChoice>
  setChoice: (key: string, c: BiChoice) => void
  current: (key: string) => { en: string | null; ar: string | null } | undefined
  needsDecision: (key: string) => boolean
  itemOff: Set<string>
  toggleItem: (key: string) => void
  files: SessionFile[]
  onShow: (s: SourceRef) => void
}) {
  const { t } = useTranslation('docimport')
  const groups = [
    { key: 'identity', title_en: t('review.identity'), title_ar: '', fields: IDENTITY_EXTRAS, list: undefined as string | undefined },
    ...FIELDS.sections.map((s) => ({ key: s.key, title_en: s.title_en, title_ar: s.title_ar, fields: s.fields ?? [], list: s.list })),
  ]
  const row = (key: string) => (
    <BiFieldRow key={key} fkey={key} cands={placement.fields.get(key)!} choice={choices[key]} setChoice={(c) => setChoice(key, c)}
      current={current(key)} unresolved={choices[key] === null && needsDecision(key)} files={files} onShow={onShow} />
  )
  const found = groups.filter((g) => g.fields.some((f) => placement.fields.has(f.key)) || (g.list && placement.lists.get(g.list)?.length))
  if (!found.length) return null
  return (
    <>
      {found.map((g) => {
        const missing = g.fields.filter((f) => !placement.fields.has(f.key)).length
        const items = g.list ? placement.lists.get(g.list) ?? [] : []
        return (
          <Panel key={g.key} data-section={g.key}>
            <PanelHeader title={<span className="flex flex-wrap items-baseline gap-x-3"><span>{g.title_en}</span>{g.title_ar && <span className="text-[13px] font-normal text-ink-3" dir="rtl" lang="ar">{g.title_ar}</span>}</span>}>
              {missing > 0 && <span className="text-[12px] text-ink-3">{t('review.notInFiles', { count: missing })}</span>}
            </PanelHeader>
            <div className="divide-y divide-line-soft">
              {g.fields.filter((f) => placement.fields.has(f.key)).map((f) => row(f.key))}
              {items.map((it, i) => {
                const k = `${g.list}:${i}`
                return (
                  <label key={k} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13.5px]">
                    <input type="checkbox" checked={!itemOff.has(k)} onChange={() => toggleItem(k)} />
                    <span className="min-w-0 flex-1" dir="auto">{it.en}</span>
                    {it.ar && <span className="text-[12.5px] text-ink-2" dir="rtl" lang="ar">{it.ar}</span>}
                    <SourceChips sources={it.sources} files={files} onShow={onShow} />
                  </label>
                )
              })}
            </div>
          </Panel>
        )
      })}
    </>
  )
}

/** Facts that match no field: kept on the car page as "Other" (never printed). */
export function OtherPanel({ facts, off, toggle, files, onShow }: { facts: MergedFact[]; off: Set<string>; toggle: (id: string) => void; files: SessionFile[]; onShow: (s: SourceRef) => void }) {
  const { t } = useTranslation('docimport')
  if (!facts.length) return null
  return (
    <Panel>
      <details>
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-[14px] font-semibold">
          {t('review.other', { count: facts.length })}
          <span className="text-[12.5px] font-normal text-ink-3">{t('review.otherHint')}</span>
        </summary>
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {facts.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
              <input type="checkbox" checked={!off.has(m.id)} onChange={() => toggle(m.id)} aria-label={t('review.keepLine')} />
              <span className="basis-48 text-ink-2" dir="auto">{m.label}{m.labelAlt && <span className="block text-ink-3" dir="rtl">{m.labelAlt}</span>}</span>
              <span className="min-w-0 flex-1" dir="auto">{m.values.map((v) => [v.value, v.unit].filter(Boolean).join(' ')).join(' · ')}</span>
              <SourceChips sources={m.values.flatMap((v) => v.sources)} files={files} onShow={onShow} />
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

export function TextPanel({ files, picked, toggle, onShow }: { files: SessionFile[]; picked: Set<string>; toggle: (k: string) => void; onShow: (s: SourceRef) => void }) {
  const { t } = useTranslation('docimport')
  const withText = files.filter((f) => f.extraction?.unstructured.length)
  if (!withText.length) return null
  return (
    <Panel>
      <details>
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-[14px] font-semibold">
          {t('review.otherText')}
          <span className="text-[12.5px] font-normal text-ink-3">{t('review.otherTextHint')}</span>
        </summary>
        {withText.map((f) => (
          <div key={f.key} className="border-t border-line-soft">
            <p className="bg-raised px-4 py-1.5 text-[12.5px] font-semibold text-ink-2" dir="auto">{f.file.name}</p>
            <ul>
              {f.extraction!.unstructured.map((u, i) => {
                const k = `${f.key}:${i}`
                return (
                  <li key={k} className="flex items-start gap-2 px-4 py-1.5 text-[13px]">
                    <input type="checkbox" className="mt-1" checked={picked.has(k)} onChange={() => toggle(k)} aria-label={t('review.keepLine')} />
                    <span className="flex-1" dir="auto">{u.text}</span>
                    {u.page && <button className="text-[11.5px] text-ink-3 hover:text-ink" onClick={() => onShow({ fileKey: f.key, page: u.page })}>{t('review.pageN', { n: u.page })}</button>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </details>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

const PHOTO_TYPES: ImageType[] = ['arrival', 'current', 'garage', 'other']

function Thumb({ img }: { img: ImageCandidate }) {
  const url = useMemo(() => URL.createObjectURL(img.blob), [img.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} alt="" className="size-full object-cover" />
}

export function PhotosPanel({ files, choice, setChoice }: {
  files: SessionFile[]
  choice: Record<string, { keep: boolean; type: ImageType }>
  setChoice: (id: string, v: { keep: boolean; type: ImageType }) => void
}) {
  const { t } = useTranslation('docimport')
  const imgs = files.flatMap((f) => f.images.map((i) => ({ i, f })))
  if (!imgs.length) return null
  return (
    <Panel>
      <PanelHeader title={t('review.photos')}><span className="text-[12.5px] text-ink-3">{t('review.photosHint')}</span></PanelHeader>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
        {imgs.map(({ i, f }) => {
          const c = choice[i.id]
          return (
            <div key={i.id} className={cn('overflow-hidden rounded-md border', c?.keep ? 'border-accent ring-1 ring-accent' : 'border-line-soft')} data-photo={i.id}>
              <label className="relative block aspect-[4/3] cursor-pointer bg-raised">
                <Thumb img={i} />
                <input type="checkbox" className="absolute start-2 top-2 size-4" checked={!!c?.keep} aria-label={t('review.keepPhoto')}
                  onChange={(e) => setChoice(i.id, { keep: e.target.checked, type: c?.type ?? 'other' })} />
              </label>
              <div className="space-y-1 p-2 text-[11.5px] text-ink-3">
                <p className="truncate" dir="auto">{f.file.name}{i.page ? ` · ${t('review.pageN', { n: i.page })}` : ''} · <span dir="ltr">{i.width}×{i.height}</span></p>
                <Select className="h-7 text-[12px]" value={c?.type ?? 'other'} aria-label={t('review.category')} onChange={(e) => setChoice(i.id, { keep: c?.keep ?? false, type: e.target.value as ImageType })}>
                  {PHOTO_TYPES.map((p) => <option key={p} value={p}>{IMAGE_LABEL[p]}</option>)}
                </Select>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
