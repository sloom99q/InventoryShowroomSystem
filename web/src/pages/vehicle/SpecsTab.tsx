// Specifications: the fixed fields from kit/fields.json, in brochure order.
// Every value is English with its Arabic underneath; empty fields say so.
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { type SpecRow, useFieldWriter, useVehicleData, type VehicleData } from '@/api/fields'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { type FieldDef, FIELDS, isListKey, labelFor, type SectionDef, STORED_FIELDS } from '@/lib/fields'
import { friendlyError } from '@/lib/supabase'

/** Card layout from the mockup: left and right columns, related sections share a card. */
const LAYOUT: string[][][] = [
  [['engine_performance'], ['interior']],
  [['suspension_chassis', 'fuel'], ['smart_driving', 'drive_modes']],
]
const SECTION = new Map(FIELDS.sections.map((s) => [s.key, s]))

function Chip({ tone, children }: { tone: 'warn' | 'muted'; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-normal whitespace-nowrap',
      tone === 'warn' ? 'border-warn/40 text-warn' : 'border-line text-ink-3')}>{children}</span>
  )
}

function useFocus(): [string | null, string | null, () => void] {
  const [params, setParams] = useSearchParams()
  const clear = () => {
    const next = new URLSearchParams(params)
    next.delete('field')
    next.delete('item')
    setParams(next, { replace: true })
  }
  return [params.get('field'), params.get('item'), clear]
}

/** Two inputs (English + Arabic) with save/cancel; Escape cancels, Enter saves. */
function BiEditor({ en, ar, onSave, onCancel, busy, enOnly, label }: {
  en: string; ar: string; onSave: (en: string, ar: string) => void; onCancel: () => void; busy?: boolean; enOnly?: boolean; label: string
}) {
  const { t } = useTranslation(['vehicle', 'common'])
  const [e, setE] = useState(en)
  const [a, setA] = useState(ar)
  const keys = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.preventDefault(); onCancel() }
    if (ev.key === 'Enter') { ev.preventDefault(); onSave(e, a) }
  }
  return (
    <div className="space-y-1.5" onKeyDown={keys}>
      <Input autoFocus className="h-8" value={e} onChange={(x) => setE(x.target.value)} aria-label={`${label} — ${t('fields.english')}`} placeholder={t('fields.english')} dir="ltr" />
      {!enOnly && <Input className="h-8" value={a} onChange={(x) => setA(x.target.value)} aria-label={`${label} — ${t('fields.arabic')}`} placeholder={t('fields.arabic')} dir="rtl" lang="ar" />}
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" loading={busy} onClick={() => onSave(e, a)}><Check />{t('common:actions.save')}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X />{t('common:actions.cancel')}</Button>
      </div>
    </div>
  )
}

function FieldLine({ def, row, vehicleId, canWrite, open, onOpen, onClose }: {
  def: FieldDef; row: SpecRow | undefined; vehicleId: string; canWrite: boolean; open: boolean; onOpen: () => void; onClose: () => void
}) {
  const { t } = useTranslation('vehicle')
  const { setField } = useFieldWriter(vehicleId)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [open])
  const en = row?.value_en ?? ''
  const ar = row?.value_ar ?? ''
  return (
    <div ref={ref} id={`field-${def.key}`} data-field={def.key} className={cn('grid grid-cols-[140px_1fr] gap-3 px-4 py-3 sm:grid-cols-[150px_1fr]', open && 'bg-raised')}>
      <div className="text-[13px]">
        <p className="text-ink-2">{def.label_en}</p>
        <p className="text-left text-[12px] text-ink-3 rtl:text-right" dir="rtl" lang="ar">{def.label_ar}</p>
      </div>
      {open ? (
        <BiEditor en={en} ar={ar} label={def.label_en} busy={setField.isPending} onCancel={onClose}
          onSave={(e, a) => setField.mutate({ key: def.key, value: { en: e, ar: a } }, {
            onSuccess: () => { toast.success(t('fields.saved')); onClose() },
            onError: (er) => toast.error(friendlyError(er)),
          })} />
      ) : (
        <div className="min-w-0 text-[13.5px]">
          {en ? (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium" dir="auto">{en}</span>
                {!ar && <Chip tone="warn">{t('fields.arabicMissing')}</Chip>}
                {def.in_brochure === false && <Chip tone="muted">{t('fields.specSheetOnly')}</Chip>}
                {canWrite && <button className="ms-auto text-ink-3 hover:text-ink" onClick={onOpen} aria-label={t('fields.edit', { label: def.label_en })}><Pencil className="size-3.5" /></button>}
              </p>
              {ar && <p className="mt-1 text-end text-ink-2" dir="rtl" lang="ar">{ar}</p>}
            </>
          ) : (
            <p className="text-ink-3">
              {t('fields.notSet')}
              {canWrite && <> · <button className="text-accent hover:underline" onClick={onOpen}>{t('fields.add')}</button></>}
              {def.in_brochure === false && <span className="ms-2"><Chip tone="muted">{t('fields.specSheetOnly')}</Chip></span>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ListItems({ list, items, vehicleId, canWrite, chips, focusItem, clearFocus }: {
  list: string; items: SpecRow[]; vehicleId: string; canWrite: boolean; chips?: boolean; focusItem: string | null; clearFocus: () => void
}) {
  const { t } = useTranslation('vehicle')
  const w = useFieldWriter(vehicleId)
  const [editing, setEditing] = useState<string | null>(focusItem && items.some((i) => i.id === focusItem) ? focusItem : null)
  const [adding, setAdding] = useState(false)
  const close = () => { setEditing(null); clearFocus() }
  const err = (e: unknown) => toast.error(friendlyError(e))
  return (
    <div id={`list-${list}`}>
      {items.length === 0 && !adding && <p className="px-4 py-3 text-[13px] text-ink-3">{t('fields.noItems')}</p>}
      <ul className={cn(chips ? 'flex flex-wrap gap-2 px-4 py-3' : 'divide-y divide-line-soft')}>
        {items.map((it, i) => editing === it.id ? (
          <li key={it.id} className={cn('px-4 py-2.5', chips && 'w-full px-0')}>
            <BiEditor en={it.value_en ?? ''} ar={it.value_ar ?? ''} label={it.value_en ?? ''} busy={w.updateRow.isPending} onCancel={close}
              onSave={(e, a) => {
                if (!e.trim() && !a.trim()) return w.removeRow.mutate(it.id, { onSuccess: close, onError: err })
                w.updateRow.mutate({ id: it.id, patch: { value_en: e.trim() || null, value_ar: a.trim() || null } }, { onSuccess: close, onError: err })
              }} />
          </li>
        ) : chips ? (
          <li key={it.id} id={`item-${it.id}`}>
            <button disabled={!canWrite} onClick={() => setEditing(it.id)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-line px-3 text-[13px] enabled:cursor-pointer enabled:hover:bg-raised">
              <span dir="auto">{it.value_en}</span>
              {it.value_ar ? <span className="text-[12px] text-ink-3" dir="rtl" lang="ar">{it.value_ar}</span> : <Chip tone="warn">{t('fields.arabicMissing')}</Chip>}
            </button>
          </li>
        ) : (
          <li key={it.id} id={`item-${it.id}`} className="group flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
            <span className="min-w-0 flex-1" dir="auto">{it.value_en}</span>
            {it.value_ar ? <span className="min-w-0 flex-1 text-end text-ink-2" dir="rtl" lang="ar">{it.value_ar}</span> : <Chip tone="warn">{t('fields.arabicMissing')}</Chip>}
            {canWrite && (
              <span className="flex shrink-0 opacity-60 group-hover:opacity-100">
                <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => w.moveItem.mutate({ items, index: i, dir: -1 })} aria-label={t('fields.moveUp')}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-sm" disabled={i === items.length - 1} onClick={() => w.moveItem.mutate({ items, index: i, dir: 1 })} aria-label={t('fields.moveDown')}><ArrowDown /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(it.id)} aria-label={t('fields.edit', { label: it.value_en ?? '' })}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => w.removeRow.mutate(it.id, { onError: err })} aria-label={t('fields.removeItem', { name: it.value_en ?? '' })}><Trash2 /></Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (adding ? (
        <div className="border-t border-line-soft px-4 py-3">
          <BiEditor en="" ar="" label={labelFor(list)} busy={w.addItem.isPending} onCancel={() => setAdding(false)}
            onSave={(e, a) => {
              if (!e.trim() && !a.trim()) return setAdding(false)
              w.addItem.mutate({ list, value: { en: e, ar: a } }, { onSuccess: () => setAdding(false), onError: err })
            }} />
        </div>
      ) : (
        <div className={cn('px-4 pb-3', !chips && 'pt-2')}>
          <button className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />{list === 'drive_modes' ? t('fields.addMode') : t('fields.addItem')}
          </button>
        </div>
      ))}
    </div>
  )
}

function SectionBlock({ section, data, vehicleId, canWrite, first, focus, focusItem, setFocus, clearFocus }: {
  section: SectionDef; data: VehicleData; vehicleId: string; canWrite: boolean; first: boolean
  focus: string | null; focusItem: string | null; setFocus: (k: string | null) => void; clearFocus: () => void
}) {
  return (
    <div className={cn(!first && 'border-t border-line-soft')} id={`section-${section.key}`}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line-soft px-4 py-2">
        <h3 className="text-[12px] font-semibold tracking-[0.12em] text-ink-2">{section.title_en}</h3>
        <span className="text-[13px] text-ink-2" dir="rtl" lang="ar">{section.title_ar}</span>
      </div>
      {(section.fields ?? []).length > 0 && (
        <div className="divide-y divide-line-soft">
          {section.fields!.map((f) => (
            <FieldLine key={f.key} def={f} row={data.fields.get(f.key)} vehicleId={vehicleId} canWrite={canWrite}
              open={focus === f.key} onOpen={() => setFocus(f.key)} onClose={() => { setFocus(null); clearFocus() }} />
          ))}
        </div>
      )}
      {section.list && (
        <div className={cn((section.fields ?? []).length > 0 && 'border-t border-line-soft')}>
          <ListItems list={section.list} items={data.lists[section.list] ?? []} vehicleId={vehicleId} canWrite={canWrite}
            chips={section.key === 'drive_modes'} focusItem={focusItem} clearFocus={clearFocus} />
        </div>
      )}
    </div>
  )
}

function KeyFeatures({ items, vehicleId, canWrite }: { items: SpecRow[]; vehicleId: string; canWrite: boolean }) {
  const { t } = useTranslation('vehicle')
  const w = useFieldWriter(vehicleId)
  const max = FIELDS.key_features.max
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [text, setText] = useState('')
  const err = (e: unknown) => toast.error(friendlyError(e))
  const half = Math.ceil(items.length / 2)
  const cols = [items.slice(0, half), items.slice(half)] // column-major, as printed
  return (
    <Panel id="list-key_features">
      <div className="flex min-h-12 items-center justify-between border-b border-line-soft px-4 py-2">
        <h3 className="text-[12px] font-semibold tracking-[0.12em] text-ink-2">{t('fields.keyFeatures').toUpperCase()}</h3>
        <span className="tnum text-[12.5px] font-medium text-ink-3" dir="ltr">{items.length} / {max}</span>
      </div>
      <p className="px-4 pt-3 text-[12.5px] text-ink-3">{t('fields.keyFeaturesHint')}</p>
      <div className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
        {cols.map((col, c) => (
          <ul key={c}>
            {col.map((it) => {
              const i = items.indexOf(it)
              return (
                <li key={it.id} className="group flex items-center gap-2 py-1.5 text-[13.5px]">
                  <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
                  {editing === it.id ? (
                    <Input autoFocus className="h-8 flex-1" value={text} dir="ltr" aria-label={t('fields.edit', { label: it.value_en ?? '' })}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null)
                        if (e.key === 'Enter') {
                          const v = text.trim()
                          if (!v) w.removeRow.mutate(it.id, { onError: err })
                          else w.updateRow.mutate({ id: it.id, patch: { value_en: v } }, { onError: err })
                          setEditing(null)
                        }
                      }}
                      onBlur={() => setEditing(null)} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate" dir="ltr">{it.value_en}</span>
                  )}
                  {canWrite && editing !== it.id && (
                    <span className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => w.moveItem.mutate({ items, index: i, dir: -1 })} aria-label={t('fields.moveUp')}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-sm" disabled={i === items.length - 1} onClick={() => w.moveItem.mutate({ items, index: i, dir: 1 })} aria-label={t('fields.moveDown')}><ArrowDown /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(it.id); setText(it.value_en ?? '') }} aria-label={t('fields.edit', { label: it.value_en ?? '' })}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => w.removeRow.mutate(it.id, { onError: err })} aria-label={t('fields.removeItem', { name: it.value_en ?? '' })}><Trash2 /></Button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ))}
      </div>
      {canWrite && (
        <form className="flex gap-2 border-t border-line-soft px-4 py-3" onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim() || items.length >= max) return
          w.addItem.mutate({ list: 'key_features', value: { en: draft } }, { onSuccess: () => setDraft(''), onError: err })
        }}>
          <Input className="h-8 flex-1" dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={items.length >= max}
            placeholder={items.length >= max ? t('fields.keyFeatureFull', { max }) : t('fields.addFeature')} aria-label={t('fields.addFeature')} />
          <Button size="sm" type="submit" loading={w.addItem.isPending} disabled={!draft.trim() || items.length >= max}><Plus />{t('fields.add')}</Button>
        </form>
      )}
    </Panel>
  )
}

type OtherRow = SpecRow & { documents?: { original_filename: string } | null }

function OtherInfo({ rows, vehicleId, canWrite }: { rows: OtherRow[]; vehicleId: string; canWrite: boolean }) {
  const { t } = useTranslation('vehicle')
  const w = useFieldWriter(vehicleId)
  const err = (e: unknown) => toast.error(friendlyError(e))
  const targets = [
    ...FIELDS.sections.flatMap((s) => [
      ...(s.fields ?? []).map((f) => ({ key: f.key, label: `${s.title_en} · ${f.label_en}` })),
      ...(s.list ? [{ key: s.list, label: `${s.title_en} (list)` }] : []),
    ]),
    ...STORED_FIELDS.filter((f) => !FIELDS.sections.some((s) => s.fields?.some((x) => x.key === f.key))).map((f) => ({ key: f.key, label: f.label_en })),
    { key: 'key_features', label: FIELDS.key_features.label_en },
  ]
  return (
    <details className="rounded-lg border border-dashed border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-[13.5px] text-ink-2">{t('fields.other', { count: rows.length })}</summary>
      <p className="border-t border-line-soft px-4 py-2 text-[12.5px] text-ink-3">{t('fields.otherHint')}</p>
      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[13px]">
            <div className="min-w-0 basis-48">
              <p className="text-ink-2" dir="auto">{r.section && r.section !== r.label ? `${r.section} · ` : ''}{r.label}</p>
              {r.label_alt && <p className="text-left text-[12px] text-ink-3 rtl:text-right" dir="rtl" lang="ar">{r.label_alt}</p>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium" dir="auto">{[r.value_en, r.unit].filter(Boolean).join(' ')}</p>
              {r.value_ar && <p className="text-ink-2" dir="rtl" lang="ar">{r.value_ar}</p>}
              {r.documents?.original_filename && <p className="text-[11.5px] text-ink-3" dir="auto">{t('fields.source', { name: r.documents.original_filename })}{r.source_page ? ` · p. ${r.source_page}` : ''}</p>}
            </div>
            {canWrite && (
              <div className="flex items-center gap-1.5">
                <Select className="h-8 w-56 text-[12.5px]" value="" aria-label={t('fields.assignTo')}
                  onChange={(e) => {
                    const key = e.target.value
                    if (!key) return
                    w.assignOther.mutate({ row: r, key }, { onSuccess: () => toast.success(t('fields.assigned', { label: labelFor(key) })), onError: err })
                  }}>
                  <option value="">{t('fields.assignTo')}</option>
                  {targets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </Select>
                <Button variant="ghost" size="icon-sm" onClick={() => w.removeRow.mutate(r.id, { onError: err })} aria-label={t('fields.deleteOther', { label: r.label })}><Trash2 /></Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function SpecsTab({ vehicleId }: { vehicleId: string }) {
  const { canWrite } = useCompany()
  const q = useVehicleData(vehicleId)
  const [urlField, urlItem, clearUrl] = useFocus()
  const [localFocus, setLocalFocus] = useState<string | null>(null)
  // A field picked from "Show what's missing" (URL) wins until it's closed.
  const focus = urlField && !isListKey(urlField) ? urlField : localFocus
  const setFocus = (k: string | null) => { if (urlField) clearUrl(); setLocalFocus(k) }
  useEffect(() => {
    if (!urlItem && !urlField) return
    const el = document.getElementById(urlItem ? `item-${urlItem}` : `list-${urlField}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [urlItem, urlField, q.data])

  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const data = q.data
  const placed = new Set(LAYOUT.flat(2))
  const extra = FIELDS.sections.filter((s) => !placed.has(s.key)).map((s) => [s.key])

  const card = (keys: string[]) => (
    <Panel key={keys.join('+')} className="overflow-hidden">
      {keys.map((k, i) => SECTION.get(k) && (
        <SectionBlock key={k} section={SECTION.get(k)!} data={data} vehicleId={vehicleId} canWrite={canWrite} first={i === 0}
          focus={focus} focusItem={urlItem} setFocus={setFocus} clearFocus={clearUrl} />
      ))}
    </Panel>
  )

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {LAYOUT.map((column, c) => (
          <div key={c} className="space-y-5">{column.map(card)}{c === 1 && extra.map(card)}</div>
        ))}
      </div>
      <KeyFeatures items={data.lists.key_features ?? []} vehicleId={vehicleId} canWrite={canWrite} />
      {data.other.length > 0 && <OtherInfo rows={data.other as OtherRow[]} vehicleId={vehicleId} canWrite={canWrite} />}
    </div>
  )
}
