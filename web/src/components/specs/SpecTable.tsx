// The whole field catalogue as one compact table: label | English | Arabic.
// mode "edit" (Fill specs page): every cell saves itself on Enter/leave, Enter
// jumps to the next cell, empty cells are tinted. mode "read" (Specifications tab).
import { ArrowDown, ArrowUp, Check, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useFieldWriter, type VehicleData } from '@/api/fields'
import { useUpdateVehicle } from '@/api/vehicles'
import { cn } from '@/lib/cn'
import { type FieldDef, FIELDS, type SectionDef } from '@/lib/fields'
import { arabicFor, printsArabic } from '@/lib/fields/arabic'
import { fmtMoney, parseAmount } from '@/lib/format'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'

type Mode = 'edit' | 'read'
type Status = 'idle' | 'saving' | 'saved' | 'error'

/** Move focus to the next editable cell (in page order). */
function focusNext(from: HTMLElement) {
  const cells = [...document.querySelectorAll<HTMLInputElement>('input[data-fill]:not([disabled])')]
  const i = cells.indexOf(from as HTMLInputElement)
  const next = cells[i + 1]
  if (next) { next.focus(); next.select() }
}

/** One self-saving cell. */
function Cell({ id, value, onSave, dir = 'auto', lang, placeholder, inputMode, mode, display, disabled, fallback }: {
  id?: string
  /** Printed when the cell is left empty (Arabic: the English value, translated where possible). */
  fallback?: string
  value: string
  onSave: (v: string) => Promise<unknown>
  dir?: 'ltr' | 'rtl' | 'auto'
  lang?: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
  mode: Mode
  display?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [status, setStatus] = useState<Status>('idle')
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(value) }, [value])
  // Enter saves and moves focus, and leaving the cell saves too: the same text only once.
  const sent = useRef<string | null>(null)
  useEffect(() => { sent.current = null }, [value])

  if (mode === 'read') {
    const text = display ?? value
    return <span className={cn('block px-2 py-1.5 text-[13.5px]', !text && 'text-ink-3')} dir={dir} lang={lang}>{text || fallback || '—'}</span>
  }
  const commit = async () => {
    const next = draft.trim()
    if (next === value.trim() || next === sent.current) return
    sent.current = next
    setStatus('saving')
    try {
      await onSave(next)
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
    } catch (e) {
      sent.current = null
      setStatus('error')
      toast.error(friendlyError(e))
    }
  }
  return (
    <span className="relative block">
      <input id={id} data-fill value={draft} dir={dir} lang={lang} placeholder={fallback !== undefined ? fallback : placeholder} inputMode={inputMode} disabled={disabled} aria-label={placeholder}
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; void commit() }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(); focusNext(e.currentTarget) }
          if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
        }}
        className={cn('h-8 w-full rounded-sm border px-2 text-[13.5px] transition-colors focus:border-accent focus:bg-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          draft.trim() ? 'border-transparent bg-transparent hover:border-line'
            : fallback !== undefined ? 'border-transparent bg-transparent placeholder:text-ink-3 hover:border-line'
              : 'border-dashed border-line bg-warn/[0.07] placeholder:text-ink-3/70',
          status === 'error' && 'border-danger')} />
      {status !== 'idle' && (
        <span className="pointer-events-none absolute end-1.5 top-1/2 -translate-y-1/2" aria-live="polite">
          {status === 'saving' ? <Loader2 className="size-3.5 animate-spin text-ink-3" /> : status === 'saved' ? <Check className="size-3.5 text-ok" /> : null}
        </span>
      )}
    </span>
  )
}

function Label({ en, ar, children }: { en: string; ar?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 py-1">
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <p className="text-[13px] text-ink-2">{en}</p>
        {ar && <p className="text-[11.5px] text-ink-3" dir="rtl" lang="ar">{ar}</p>}
      </div>
      {children}
    </div>
  )
}

const ROW = 'grid items-start gap-x-3 gap-y-1 px-3 py-1.5 sm:grid-cols-[200px_1fr_1fr]'

type Props = {
  vehicle: VehicleOverview
  data: VehicleData
  mode: Mode
}

export function SpecTable({ vehicle, data, mode }: Props) {
  const { t } = useTranslation('vehicle')
  const w = useFieldWriter(vehicle.id!)
  const upd = useUpdateVehicle(vehicle.id!)
  const saveCol = (patch: Record<string, unknown>) => upd.mutateAsync(patch as never)

  const fieldRow = (def: FieldDef, extra?: React.ReactNode) => {
    const row = data.fields.get(def.key)
    return (
      <div key={def.key} className={ROW} id={`fill-${def.key}`} data-field={def.key}>
        <Label en={def.label_en} ar={def.label_ar}>{extra}</Label>
        <Cell id={`fill-${def.key}-en`} mode={mode} value={row?.value_en ?? ''} placeholder={def.label_en}
          onSave={(v) => w.setField.mutateAsync({ key: def.key, value: { en: v } })} />
        {printsArabic(def.key) ? (
          <Cell id={`fill-${def.key}-ar`} mode={mode} value={row?.value_ar ?? ''} dir="rtl" lang="ar" placeholder={def.label_ar}
            fallback={arabicFor(row?.value_en, null)}
            onSave={(v) => w.setField.mutateAsync({ key: def.key, value: { ar: v } })} />
        ) : <span />}
      </div>
    )
  }

  const listRows = (list: string, enOnly = false, max?: number) => {
    const items = data.lists[list] ?? []
    return (
      <>
        {items.map((it, i) => (
          <div key={it.id} className={cn(ROW, 'sm:grid-cols-[200px_1fr_1fr]')} id={`fill-item-${it.id}`}>
            <div className="flex items-center gap-1 py-1 text-[12.5px] text-ink-3">
              <span className="tnum w-5">{i + 1}.</span>
              {mode === 'edit' && (
                <span className="ms-auto flex">
                  <button type="button" className="flex size-6 items-center justify-center rounded-sm hover:bg-raised disabled:opacity-30" disabled={i === 0} aria-label={t('fields.moveUp')}
                    onClick={() => w.moveItem.mutate({ items, index: i, dir: -1 })}><ArrowUp className="size-3.5" /></button>
                  <button type="button" className="flex size-6 items-center justify-center rounded-sm hover:bg-raised disabled:opacity-30" disabled={i === items.length - 1} aria-label={t('fields.moveDown')}
                    onClick={() => w.moveItem.mutate({ items, index: i, dir: 1 })}><ArrowDown className="size-3.5" /></button>
                  <button type="button" className="flex size-6 items-center justify-center rounded-sm text-ink-3 hover:bg-raised hover:text-danger" aria-label={t('fields.removeItem', { label: it.value_en ?? '' })}
                    onClick={() => w.removeRow.mutate(it.id, { onError: (e) => toast.error(friendlyError(e)) })}><Trash2 className="size-3.5" /></button>
                </span>
              )}
            </div>
            <Cell id={`fill-item-${it.id}-en`} mode={mode} value={it.value_en ?? ''} placeholder={t('fill.itemEn')}
              onSave={(v) => (!v && !it.value_ar ? w.removeRow.mutateAsync(it.id) : w.updateRow.mutateAsync({ id: it.id, patch: { value_en: v || null } }))} />
            {enOnly ? <span /> : (
              <Cell id={`fill-item-${it.id}-ar`} mode={mode} value={it.value_ar ?? ''} dir="rtl" lang="ar" placeholder={t('fill.itemAr')}
                fallback={arabicFor(it.value_en, null)}
                onSave={(v) => (!v && !it.value_en ? w.removeRow.mutateAsync(it.id) : w.updateRow.mutateAsync({ id: it.id, patch: { value_ar: v || null } }))} />
            )}
          </div>
        ))}
        {mode === 'edit' && (max === undefined || items.length < max) && <NewItem list={list} enOnly={enOnly} vehicleId={vehicle.id!} />}
        {mode === 'read' && !items.length && <div className={ROW}><span /><span className="px-2 py-1.5 text-[13.5px] text-ink-3">—</span></div>}
      </>
    )
  }

  const sectionBlock = (s: SectionDef) => (
    <section key={s.key} className="border-b border-line-soft last:border-0" id={`fill-section-${s.key}`}>
      <h3 className="flex items-baseline justify-between gap-3 bg-raised px-3 py-2 text-[12px] font-semibold tracking-[0.08em]">
        <span>{s.title_en}</span><span className="font-normal tracking-normal text-ink-3" dir="rtl" lang="ar">{s.title_ar}</span>
      </h3>
      {(s.fields ?? []).map((f) => fieldRow(f, f.in_brochure === false
        ? <span className="mt-0.5 inline-block rounded-sm border border-line px-1 text-[10.5px] text-ink-3">{t('fields.specSheetOnly')}</span> : null))}
      {s.list && listRows(s.list)}
    </section>
  )

  const id = (k: string) => FIELDS.identity.find((f) => f.key === k)!
  const yearStr = vehicle.year ? String(vehicle.year) : ''
  const priceStr = vehicle.listing_price !== null && vehicle.listing_price !== undefined ? Number(vehicle.listing_price).toFixed(2).replace(/\.00$/, '') : ''

  return (
    <div className="overflow-hidden rounded-lg border border-line-soft bg-surface">
      <div className="hidden border-b border-line-soft px-3 py-1.5 text-[11.5px] text-ink-3 sm:grid sm:grid-cols-[200px_1fr_1fr] sm:gap-x-3">
        <span>{t('fill.colField')}</span><span className="px-2">{t('fill.colEn')}</span><span className="px-2 text-end">{t('fill.colAr')}</span>
      </div>
      <section className="border-b border-line-soft" id="fill-section-identity">
        <h3 className="bg-raised px-3 py-2 text-[12px] font-semibold tracking-[0.08em]">{t('fill.identity')}</h3>
        {(['brand', 'model'] as const).map((k) => (
          <div key={k} className={ROW} id={`fill-${k}`} data-field={k}>
            <Label en={id(k).label_en} ar={id(k).label_ar} />
            <Cell id={`fill-${k}-en`} mode={mode} value={vehicle[k] ?? ''} placeholder={id(k).label_en} onSave={(v) => saveCol({ [k]: v || null })} />
            <span />
          </div>
        ))}
        <div className={ROW} id="fill-year" data-field="year">
          <Label en={id('year').label_en} ar={id('year').label_ar} />
          <Cell id="fill-year-en" mode={mode} value={yearStr} dir="ltr" inputMode="numeric" placeholder={id('year').label_en}
            onSave={async (v) => {
              const n = v ? Number(v) : null
              if (n !== null && !(Number.isInteger(n) && n >= 1900 && n <= 2100)) throw new Error(t('fill.badYear'))
              return saveCol({ year: n })
            }} />
          <span />
        </div>
        <div className={ROW} id="fill-trim" data-field="trim">
          <Label en={id('trim').label_en} ar={id('trim').label_ar} />
          <Cell id="fill-trim-en" mode={mode} value={vehicle.trim_level ?? ''} placeholder={id('trim').label_en} onSave={(v) => saveCol({ trim_level: v || null })} />
          <span />
        </div>
        {fieldRow(id('description'))}
        {fieldRow(id('regional_specs'))}
        <div className={ROW} id="fill-listing_price" data-field="listing_price">
          <Label en={id('listing_price').label_en} ar={id('listing_price').label_ar} />
          <Cell id="fill-listing_price-en" mode={mode} value={priceStr} display={priceStr ? fmtMoney(vehicle.listing_price) : ''} dir="ltr" inputMode="decimal" placeholder="AED"
            onSave={async (v) => {
              if (!v) return saveCol({ listing_price: null })
              const a = parseAmount(v)
              if (a === null) throw new Error(t('fill.badPrice'))
              return saveCol({ listing_price: a })
            }} />
          <span />
        </div>
      </section>
      {FIELDS.sections.map(sectionBlock)}
      <section id="fill-section-key_features">
        <h3 className="flex items-baseline justify-between bg-raised px-3 py-2 text-[12px] font-semibold tracking-[0.08em]">
          <span>{FIELDS.key_features.label_en}</span>
          <span className="tnum font-normal tracking-normal text-ink-3">{(data.lists.key_features ?? []).length} / {FIELDS.key_features.max}</span>
        </h3>
        {listRows('key_features', true, FIELDS.key_features.max)}
      </section>
    </div>
  )
}

/** Empty row at the end of a list: typing in it adds an item (when the row is left or Enter is pressed). */
function NewItem({ list, enOnly, vehicleId }: { list: string; enOnly: boolean; vehicleId: string }) {
  const { t } = useTranslation('vehicle')
  const w = useFieldWriter(vehicleId)
  const [en, setEn] = useState('')
  const [ar, setAr] = useState('')
  const row = useRef<HTMLDivElement>(null)
  const commit = () => {
    if (!en.trim() && !ar.trim()) return
    const value = { en: en.trim() || null, ar: ar.trim() || null }
    setEn(''); setAr('')
    w.addItem.mutate({ list, value }, { onError: (e) => toast.error(friendlyError(e)) })
  }
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); if (enOnly || e.currentTarget.dir === 'rtl') commit(); focusNext(e.currentTarget) }
  }
  return (
    <div ref={row} className={ROW} onBlur={(e) => { if (!row.current?.contains(e.relatedTarget as Node)) commit() }} data-new-item={list}>
      <span className="py-1.5 text-[12.5px] text-ink-3">{t('fill.addItem')}</span>
      <input data-fill value={en} onChange={(e) => setEn(e.target.value)} onKeyDown={keys} placeholder={t('fill.itemEn')} aria-label={enOnly ? t('fields.addFeature') : `${t('fill.addItem')} (${list})`}
        className="h-8 w-full rounded-sm border border-dashed border-line bg-transparent px-2 text-[13.5px] placeholder:text-ink-3/70 focus:border-accent focus:outline-none" />
      {enOnly ? <span /> : (
        <input data-fill value={ar} onChange={(e) => setAr(e.target.value)} onKeyDown={keys} dir="rtl" lang="ar" placeholder={t('fill.itemAr')}
          className="h-8 w-full rounded-sm border border-dashed border-line bg-transparent px-2 text-[13.5px] placeholder:text-ink-3/70 focus:border-accent focus:outline-none" />
      )}
    </div>
  )
}
