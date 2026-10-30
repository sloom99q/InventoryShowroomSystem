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
import { type EditableField, type FieldCandidate, type FieldChoice, groupBySection, type SessionFile, type SpecDecision } from './session'

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

export function SpecsPanel({ facts, decisions, setDecision, items, setItem, files, onShow }: {
  facts: MergedFact[]
  decisions: Record<string, SpecDecision>
  setDecision: (id: string, d: SpecDecision) => void
  items: Record<string, boolean>
  setItem: (key: string, v: boolean) => void
  files: SessionFile[]
  onShow: (s: SourceRef) => void
}) {
  const { t } = useTranslation('docimport')
  const groups = groupBySection(facts)
  if (!facts.length) return null
  return (
    <Panel>
      <PanelHeader title={t('review.specs')} />
      {groups.map(([section, rows]) => (
        <div key={section || '-'} className="border-b border-line-soft last:border-0">
          <h3 className="bg-raised px-4 py-1.5 text-[12.5px] font-semibold text-ink-2" dir="auto">{section || t('review.general')}</h3>
          <ul className="divide-y divide-line-soft">
            {rows.map((m) => {
              if (m.kind === 'item') {
                return m.values.map((v, vi) => {
                  const key = `${m.id}:${vi}`
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13.5px]">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={items[key] ?? true} onChange={(e) => setItem(key, e.target.checked)} />
                        <span dir="auto">{v.value}</span>
                      </label>
                      <SourceChips sources={v.sources} files={files} onShow={onShow} />
                    </li>
                  )
                })
              }
              const d = decisions[m.id]
              return (
                <li key={m.id} className={cn('px-4 py-2.5 text-[13.5px]', m.conflict && d?.include === null && 'bg-warn/[0.06]')} data-spec={m.label}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label className="flex basis-56 cursor-pointer items-center gap-2 text-ink-2">
                      <input type="checkbox" checked={d?.include === true}
                        onChange={(e) => setDecision(m.id, { ...d, include: e.target.checked, valueIndex: d.valueIndex < 0 && e.target.checked ? 0 : d.valueIndex })} />
                      <span><span className="block" dir="auto">{m.label}</span>{m.labelAlt && <span className="block text-[12.5px] text-ink-3" dir="auto">{m.labelAlt}</span>}</span>
                    </label>
                    {!m.conflict && (
                      <>
                        <Input className="h-8 min-w-40 flex-1" dir="auto" aria-label={m.label}
                          value={d?.custom ?? m.values[0].value} onChange={(e) => setDecision(m.id, { ...d, custom: e.target.value })} />
                        <Input className="h-8 w-20" dir="auto" aria-label={t('specs.unit')} value={d?.unit ?? ''} onChange={(e) => setDecision(m.id, { ...d, unit: e.target.value || null })} />
                        <SourceChips sources={m.values[0].sources} files={files} onShow={onShow} />
                      </>
                    )}
                  </div>
                  {m.conflict && (
                    <div className="mt-2 space-y-1 ps-6">
                      <p className="flex items-center gap-1 text-[12px] text-warn"><AlertTriangle className="size-3.5" />{t('review.conflict')}</p>
                      {m.values.map((v, vi) => (
                        <label key={vi} className={cn('flex cursor-pointer flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5', d?.include && d.valueIndex === vi && d.custom === null ? 'border-ink-2 bg-raised' : 'border-line-soft hover:bg-raised')}>
                          <input type="radio" name={`s-${m.id}`} checked={!!d?.include && d.valueIndex === vi && d.custom === null}
                            onChange={() => setDecision(m.id, { include: true, valueIndex: vi, custom: null, unit: v.unit })} />
                          <span className="font-medium" dir="auto">{v.value}{v.unit && <span className="ms-1 font-normal text-ink-2">{v.unit}</span>}</span>
                          <SourceChips sources={v.sources} files={files} onShow={onShow} />
                        </label>
                      ))}
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line-soft px-2.5 py-1.5">
                        <input type="radio" name={`s-${m.id}`} checked={!!d?.include && d.custom !== null}
                          onChange={() => setDecision(m.id, { include: true, valueIndex: 0, custom: '', unit: m.values[0].unit })} />
                        <span className="text-ink-2">{t('review.typeValue')}</span>
                        {d?.include && d.custom !== null && <Input className="h-8 flex-1" dir="auto" value={d.custom} autoFocus aria-label={m.label} onChange={(e) => setDecision(m.id, { ...d, custom: e.target.value })} />}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line-soft px-2.5 py-1.5">
                        <input type="radio" name={`s-${m.id}`} checked={d?.include === false} onChange={() => setDecision(m.id, { ...d, include: false })} />
                        <span className="text-ink-2">{t('review.dontSave')}</span>
                      </label>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
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
