// Specs: one clean sheet. Click a value, type, Enter saves and opens the next one.
// Arabic is optional ("+ عربي"), and only where the brochure prints it.
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { type SpecRow, useFieldWriter, useVehicleData, type VehicleData } from '@/api/fields'
import { useSaveCar } from '@/api/journey'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { InlineText } from '@/components/v3/bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { type FieldDef, FIELDS } from '@/lib/fields'
import { arabicFor, printsArabic } from '@/lib/fields/arabic'
import { fmtKm } from '@/lib/format'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'
import { OtherInfo, type OtherRow } from '@/pages/vehicle/SpecsTab'

type Col = 'trim_level' | 'exterior_color' | 'interior_color' | 'mileage_km' | 'location'
/** The car's own details shown first (columns on the car, or catalogue fields). */
const IDENTITY: ({ col: Col; label: string; label_ar: string } | { field: string })[] = [
  { col: 'trim_level', label: 'Trim', label_ar: 'الفئة' },
  { col: 'exterior_color', label: 'Exterior colour', label_ar: 'اللون الخارجي' },
  { col: 'interior_color', label: 'Interior colour', label_ar: 'اللون الداخلي' },
  { field: 'regional_specs' },
  { col: 'mileage_km', label: 'Mileage', label_ar: 'الممشى' },
  { col: 'location', label: 'Location', label_ar: 'الموقع' },
  { field: 'description' },
]
const ID_FIELD = new Map(FIELDS.identity.map((f) => [f.key, f]))

/** "9 of 16 filled": the car's details, every catalogue field, each list and key features. */
export function specProgress(v: VehicleOverview, d: VehicleData) {
  let total = 0
  let filled = 0
  for (const r of IDENTITY) {
    total++
    if ('col' in r ? v[r.col] !== null && v[r.col] !== undefined && String(v[r.col]).trim() !== '' : d.fields.get(r.field)?.value_en) filled++
  }
  for (const s of FIELDS.sections) {
    for (const f of s.fields ?? []) { total++; if (d.fields.get(f.key)?.value_en) filled++ }
    if (s.list) { total++; if ((d.lists[s.list] ?? []).length) filled++ }
  }
  total++
  if ((d.lists.key_features ?? []).length) filled++
  return { filled, total }
}

export function SpecsSheet({ v }: { v: VehicleOverview }) {
  const { t, i18n } = useTranslation('cars')
  const ar = i18n.language === 'ar'
  const q = useVehicleData(v.id!)
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const { canWrite } = useCompany()
  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const d = q.data
  const p = specProgress(v, d)
  const show = (filled: boolean) => !onlyEmpty || !filled

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-hover p-1" role="group" aria-label={t('specs.filter')}>
          {[false, true].map((o) => (
            <button key={String(o)} onClick={() => setOnlyEmpty(o)} aria-pressed={onlyEmpty === o}
              className={cn('h-8 rounded-lg px-3 text-[13.5px] font-medium', onlyEmpty === o ? 'bg-surface text-ink shadow-sm' : 'text-ink-3')}>
              {o ? t('specs.onlyEmpty') : t('specs.all')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[14px] text-ink-2">
          <span className="h-1.5 w-36 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.filled}>
            <span className="block h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${(p.filled / p.total) * 100}%` }} />
          </span>
          {t('specs.progress', { filled: p.filled, total: p.total })}
        </div>
      </div>

      <Section title={t('specs.identity')} titleAr={ar ? 'Identity' : 'الهوية'}>
        {IDENTITY.map((r) => 'col' in r
          ? show(v[r.col] !== null && v[r.col] !== undefined && String(v[r.col]) !== '') && <ColRow key={r.col} v={v} col={r.col} label={r.label} />
          : show(!!d.fields.get(r.field)?.value_en) && <FieldRow key={r.field} v={v} def={ID_FIELD.get(r.field)!} row={d.fields.get(r.field)} canWrite={canWrite} />)}
      </Section>

      {FIELDS.sections.map((s) => {
        const fields = (s.fields ?? []).filter((f) => show(!!d.fields.get(f.key)?.value_en))
        const items = s.list ? d.lists[s.list] ?? [] : []
        const listShown = s.list && show(items.length > 0)
        if (!fields.length && !listShown) return null
        return (
          <Section key={s.key} title={ar ? s.title_ar : s.title_en} titleAr={ar ? s.title_en : s.title_ar}>
            {fields.map((f) => <FieldRow key={f.key} v={v} def={f} row={d.fields.get(f.key)} canWrite={canWrite} />)}
            {listShown && <ListRows v={v} list={s.list!} items={items} canWrite={canWrite} />}
          </Section>
        )
      })}

      {show((d.lists.key_features ?? []).length > 0) && (
        <Section title={t('specs.keyFeatures')} titleAr={t('specs.keyFeaturesHint', { max: FIELDS.key_features.max })}>
          <ListRows v={v} list="key_features" items={d.lists.key_features ?? []} canWrite={canWrite} enOnly max={FIELDS.key_features.max} />
        </Section>
      )}

      {d.other.length > 0 && <OtherInfo rows={d.other as OtherRow[]} vehicleId={v.id!} canWrite={canWrite} />}
    </div>
  )
}

function Section({ title, titleAr, children }: { title: string; titleAr?: string; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <h3 className="flex items-baseline justify-between gap-3 border-b border-line bg-raised px-5 py-3.5 text-[12.5px] font-semibold tracking-[0.1em] text-ink-2 uppercase">
        <span>{title}</span>{titleAr && <span className="text-[13px] font-medium tracking-normal normal-case text-ink-3" dir="auto">{titleAr}</span>}
      </h3>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  )
}

const ROW = 'grid gap-x-6 gap-y-0.5 px-5 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center'

function ColRow({ v, col, label }: { v: VehicleOverview; col: Col; label: string }) {
  const { t } = useTranslation('cars')
  const { canWrite } = useCompany()
  const save = useSaveCar(v.id!)
  const raw = v[col]
  const value = raw === null || raw === undefined ? '' : String(raw)
  return (
    <div className={ROW} data-field={col}>
      <span className="text-[14px] text-ink-2">{t(`specs.col.${col}`, { defaultValue: label })}</span>
      <InlineText id={`spec-${col}`} label={t(`specs.col.${col}`, { defaultValue: label })} value={value} disabled={!canWrite}
        display={col === 'mileage_km' ? fmtKm(Number(raw)) : undefined} inputMode={col === 'mileage_km' ? 'numeric' : undefined}
        validate={col === 'mileage_km' ? (x) => (/^\d{1,7}$/.test(x.replace(/[,\s]/g, '')) ? null : t('specs.badKm')) : undefined}
        onSave={(x) => save.mutateAsync({ [col]: col === 'mileage_km' ? (x ? Number(x.replace(/[,\s]/g, '')) : null) : (x || null) })} />
    </div>
  )
}

function FieldRow({ v, def, row, canWrite }: { v: VehicleOverview; def: FieldDef; row?: SpecRow; canWrite: boolean }) {
  const { t, i18n } = useTranslation('cars')
  const label = i18n.language === 'ar' && def.label_ar ? def.label_ar : def.label_en
  const w = useFieldWriter(v.id!)
  const [arOpen, setArOpen] = useState(false)
  const en = row?.value_en ?? ''
  const ar = row?.value_ar ?? ''
  const arabic = printsArabic(def.key)
  return (
    <div className={ROW} data-field={def.key}>
      <span className="text-[14px] text-ink-2">{label}</span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3">
          <InlineText id={`spec-${def.key}`} label={label} value={en} disabled={!canWrite} multiline={def.key === 'description'}
            onSave={(x) => w.setField.mutateAsync({ key: def.key, value: { en: x } })} />
          {arabic && en && !ar && !arOpen && canWrite && (
            <button onClick={() => setArOpen(true)} className="text-[13px] text-ink-3 hover:text-accent" lang="ar" aria-label={t('specs.addArabic', { field: label })}>+ عربي</button>
          )}
        </div>
        {arabic && (ar || arOpen) && (
          <InlineText id={`spec-${def.key}-ar`} label={`${label} (${t('specs.arabic')})`} value={ar} dir="rtl" lang="ar" disabled={!canWrite}
            placeholder={arabicFor(en, null)} className="mt-0.5 text-ink-2"
            onSave={(x) => w.setField.mutateAsync({ key: def.key, value: { ar: x } }).then(() => { if (!x) setArOpen(false) })} />
        )}
      </div>
    </div>
  )
}

function ListRows({ v, list, items, canWrite, enOnly, max }: { v: VehicleOverview; list: string; items: SpecRow[]; canWrite: boolean; enOnly?: boolean; max?: number }) {
  const { t } = useTranslation('cars')
  const w = useFieldWriter(v.id!)
  const [arOpen, setArOpen] = useState<string | null>(null)
  const err = (e: unknown) => toast.error(friendlyError(e))
  const full = max !== undefined && items.length >= max
  return (
    <>
      {items.map((it, i) => (
        <div key={it.id} className="group flex items-start gap-3 px-5 py-2.5" data-item={it.id}>
          <span className="tnum mt-1.5 w-5 shrink-0 text-[13px] text-ink-3">{i + 1}.</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3">
              <InlineText id={`item-${it.id}`} label={t('specs.item', { n: i + 1 })} value={it.value_en ?? ''} disabled={!canWrite}
                onSave={(x) => (x ? w.updateRow.mutateAsync({ id: it.id, patch: { value_en: x } }) : w.removeRow.mutateAsync(it.id))} />
              {!enOnly && it.value_en && !it.value_ar && arOpen !== it.id && canWrite && (
                <button onClick={() => setArOpen(it.id)} className="text-[13px] text-ink-3 hover:text-accent" lang="ar" aria-label={t('specs.addArabic', { field: it.value_en })}>+ عربي</button>
              )}
            </div>
            {!enOnly && (it.value_ar || arOpen === it.id) && (
              <InlineText id={`item-${it.id}-ar`} label={`${it.value_en} (${t('specs.arabic')})`} value={it.value_ar ?? ''} dir="rtl" lang="ar" disabled={!canWrite}
                placeholder={arabicFor(it.value_en, null)} className="mt-0.5 text-ink-2"
                onSave={(x) => w.updateRow.mutateAsync({ id: it.id, patch: { value_ar: x || null } })} />
            )}
          </div>
          {canWrite && (
            <span className="flex shrink-0 opacity-60 group-hover:opacity-100 focus-within:opacity-100">
              <IconBtn label={t('specs.moveUp')} disabled={i === 0} onClick={() => w.moveItem.mutate({ items, index: i, dir: -1 }, { onError: err })}><ArrowUp /></IconBtn>
              <IconBtn label={t('specs.moveDown')} disabled={i === items.length - 1} onClick={() => w.moveItem.mutate({ items, index: i, dir: 1 }, { onError: err })}><ArrowDown /></IconBtn>
              <IconBtn label={t('specs.removeItem', { item: it.value_en ?? '' })} onClick={() => w.removeRow.mutate(it.id, { onError: err })}><X /></IconBtn>
            </span>
          )}
        </div>
      ))}
      {canWrite && !full && (
        <div className="flex items-center gap-3 px-5 py-2.5">
          <Plus className="size-4 shrink-0 text-ink-3" />
          <InlineText repeat id={`add-${list}`} label={t('specs.addTo', { list })} value="" placeholder={items.length ? t('specs.addAnother') : t('specs.addFirst')}
            onSave={(x) => (x ? w.addItem.mutateAsync({ list, value: { en: x, ar: null } }) : Promise.resolve())} />
        </div>
      )}
      {full && <p className="px-5 py-2.5 text-[13px] text-ink-3">{t('specs.full', { max })}</p>}
    </>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-30 [&_svg]:size-4">{children}</button>
  )
}
