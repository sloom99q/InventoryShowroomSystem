// "Fill specs": every field of a car on one page (pilot feedback), with
// "Paste specs" and a live spec sheet preview.
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardPaste, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useVehicleData, type VehicleData } from '@/api/fields'
import { useImages } from '@/api/records'
import { useVehicle } from '@/api/vehicles'
import { SpecTable } from '@/components/specs/SpecTable'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel } from '@/components/ui/misc'
import { StatusBadge, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { matchField, matchList } from '@/lib/fields'
import { friendlyError, supabase } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'
import { OtherPanel, SectionsPanel } from '@/pages/import/ReviewPanels'
import { biNeedsDecision, type BiChoice, chosenBi, defaultBiChoice, placeFacts } from '@/pages/import/session'

export default function FillSpecs() {
  const { t } = useTranslation('vehicle')
  const { id } = useParams<{ id: string }>()
  const { canWrite } = useCompany()
  const vehicle = useVehicle(id)
  const data = useVehicleData(id)
  const [params] = useSearchParams()
  const [paste, setPaste] = useState(false)

  // Jump to a field picked from "Documents X% ready".
  const focusField = params.get('field')
  const focusLang = params.get('lang') === 'ar' ? 'ar' : 'en'
  const focusItem = params.get('item')
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current || !data.data || (!focusField && !focusItem)) return
    const el = document.getElementById(focusItem ? `fill-item-${focusItem}-${focusLang}` : `fill-${focusField}-${focusLang}`)
      ?? document.querySelector<HTMLElement>(`[data-new-item="${focusField}"] input`)
      ?? document.getElementById(`fill-${focusField}-en`)
    if (el) {
      focused.current = true
      el.scrollIntoView({ block: 'center' })
      ;(el as HTMLInputElement).focus()
    }
  }, [data.data, focusField, focusItem, focusLang])

  if (vehicle.isLoading || data.isLoading) return <PageLoader />
  if (vehicle.error || !vehicle.data || data.error || !data.data) return <ErrorNote error={vehicle.error ?? data.error} />
  const v = vehicle.data

  return (
    <div className="pb-16">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to={`/vehicles/${id}`} className="flex size-9 items-center justify-center rounded-md border border-line hover:bg-raised" aria-label={t('fill.back')}>
          <ArrowLeft className="size-4 flip-rtl" />
        </Link>
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-3">{t('fill.title')}</p>
          <h1 className="flex flex-wrap items-center gap-2 text-[20px] font-semibold">{vehicleTitle(v)} <StatusBadge status={v.status!} /></h1>
        </div>
        {canWrite && (
          <div className="ms-auto flex flex-wrap gap-2">
            <Button onClick={() => setPaste(true)}><ClipboardPaste />{t('fill.paste')}</Button>
          </div>
        )}
      </div>
      <p className="mb-4 text-[13px] text-ink-2">{t('fill.intro')}</p>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <SpecTable vehicle={v} data={data.data} mode={canWrite ? 'edit' : 'read'} />
        <div className="hidden lg:sticky lg:top-20 lg:block">
          <SpecPreview vehicle={v} data={data.data} />
        </div>
      </div>
      {paste && <PasteSpecs vehicleId={id!} data={data.data} onClose={() => setPaste(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live spec sheet preview (desktop)
// ---------------------------------------------------------------------------

function SpecPreview({ vehicle, data }: { vehicle: VehicleOverview; data: VehicleData }) {
  const { t } = useTranslation('vehicle')
  const { company } = useCompany()
  const images = useImages(vehicle.id!)
  const [img, setImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const key = JSON.stringify([[...data.fields.values(), ...Object.values(data.lists).flat(), ...data.other].map((r) => [r.id, r.value_en, r.value_ar, r.position]), vehicle.brand, vehicle.model, vehicle.year, vehicle.trim_level, vehicle.listing_price, vehicle.doc_settings, images.isLoading, (images.data ?? []).map((i) => i.id)])
  useEffect(() => {
    if (images.isLoading) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setBusy(true)
      try {
        const dd = await import('@/pages/documents/docdata')
        const { files, paths } = await dd.gatherFiles('specsheet', company, images.data ?? [], dd.readSettings(vehicle))
        const r = await import('@/docs/render')
        const res = await r.renderSpecSheet(dd.toDocData(vehicle, company, data, paths), files)
        const { renderPdfPages } = await import('@/lib/pdfText')
        const [page] = await renderPdfPages(res.pdf.slice().buffer, 1, 800)
        if (!cancelled) setImg(page)
      } catch (e) {
        console.warn('Spec sheet preview failed', e) // best-effort; the documents page reports problems
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 700)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2 text-[12.5px] text-ink-2">
        {t('fill.preview')}
        {busy && <Loader2 className="size-3.5 animate-spin text-ink-3" />}
      </div>
      {img ? <img src={img} alt={t('fill.preview')} className={cn('w-full bg-white transition-opacity', busy && 'opacity-70')} />
        : <div className="flex aspect-[595/842] items-center justify-center text-ink-3"><Loader2 className="size-5 animate-spin" /></div>}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Paste specs
// ---------------------------------------------------------------------------

function PasteSpecs({ vehicleId, data, onClose }: { vehicleId: string; data: VehicleData; onClose: () => void }) {
  const { t } = useTranslation(['vehicle', 'docimport', 'common'])
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [placement, setPlacement] = useState<ReturnType<typeof placeFacts> | null>(null)
  const [override, setOverride] = useState<Record<string, BiChoice>>({})
  const [itemOff, setItemOff] = useState<Set<string>>(new Set())
  const [otherOff, setOtherOff] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const current = (key: string) => {
    const r = data.fields.get(key)
    return r ? { en: r.value_en, ar: r.value_ar } : undefined
  }
  async function read() {
    const { extractText } = await import('@/lib/extract/text')
    const { mergeFacts } = await import('@/lib/extract/index')
    const merged = mergeFacts([{ fileKey: 'paste', facts: extractText(text, 'paste') }])
    setPlacement(placeFacts(merged, matchField, matchList, new Set(['brand', 'model', 'year', 'trim', 'listing_price'])))
    setOverride({})
    setItemOff(new Set())
    setOtherOff(new Set())
  }
  const choices = placement ? Object.fromEntries([...placement.fields].map(([k, c]) => [k, k in override ? override[k] : defaultBiChoice(c, current(k))])) as Record<string, BiChoice> : {}
  const unresolved = placement ? [...placement.fields].filter(([k, c]) => choices[k] === null && biNeedsDecision(c, current(k))).length : 0
  const found = placement ? placement.fields.size + placement.lists.size + placement.other.length : 0

  async function apply() {
    if (!placement) return
    setSaving(true)
    try {
      const { FIELD_BY_KEY, SECTION_OF } = await import('@/lib/fields')
      const specs: Record<string, unknown>[] = []
      for (const [key, cands] of placement.fields) {
        const v = chosenBi(choices[key], cands)
        if (!v || (!v.en && !v.ar)) continue
        const cur = current(key)
        if (cur && (v.en ?? null) === cur.en && (v.ar ?? cur.ar) === cur.ar) continue
        const def = FIELD_BY_KEY.get(key)!
        specs.push({ field_key: key, label: def.label_en, label_alt: def.label_ar, section: SECTION_OF.get(key)?.title_en ?? null, value_en: v.en, value_ar: v.ar ?? cur?.ar ?? null })
      }
      const existing = new Set(Object.entries(data.lists).flatMap(([k, items]) => items.map((i) => `${k}:${(i.value_en ?? '').toLowerCase()}`)))
      for (const [list, items] of placement.lists) items.forEach((it, i) => {
        if (itemOff.has(`${list}:${i}`) || existing.has(`${list}:${it.en.toLowerCase()}`)) return
        specs.push({ list, section: SECTION_OF.get(list)?.title_en ?? null, value_en: it.en, value_ar: it.ar })
      })
      for (const m of placement.other) {
        if (otherOff.has(m.id)) continue
        for (const val of m.values) specs.push({ section: m.section, label: m.label || m.section || 'Note', label_alt: m.labelAlt, value_en: val.value, value_ar: val.valueAlt ?? null, unit: val.unit })
      }
      if (specs.length) {
        const { error } = await supabase.rpc('save_vehicle_import', { p_vehicle_id: vehicleId, p_fields: {}, p_specs: specs } as never)
        if (error) throw error
      }
      qc.invalidateQueries({ queryKey: ['specs', vehicleId] })
      toast.success(t('fill.pasteSaved', { count: specs.length }))
      onClose()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={t('fill.pasteTitle')} size="xl" description={t('fill.pasteHint')}
      footer={<>
        {placement && unresolved > 0 && <span className="me-auto self-center text-[13px] text-warn">{t('docimport:block.specs', { count: unresolved })}</span>}
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        {placement
          ? <Button variant="primary" loading={saving} disabled={unresolved > 0 || !found} onClick={apply}>{t('fill.pasteApply')}</Button>
          : <Button variant="primary" disabled={!text.trim()} onClick={read}>{t('fill.pasteRead')}</Button>}
      </>}>
      {!placement ? (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} dir="auto" autoFocus aria-label={t('fill.pasteTitle')}
          placeholder={'Top speed: 200 km/h\nBattery\t43 kWh\tالبطارية\nSMART DRIVING\n• Adaptive Cruise Control'} className="font-mono text-[12.5px]" />
      ) : found === 0 ? (
        <p className="py-6 text-center text-[13.5px] text-ink-2">{t('fill.pasteNothing')} <button className="underline" onClick={() => setPlacement(null)}>{t('fill.pasteEdit')}</button></p>
      ) : (
        <div className="space-y-4">
          <button className="text-[12.5px] text-ink-2 underline" onClick={() => setPlacement(null)}>{t('fill.pasteEdit')}</button>
          <SectionsPanel placement={placement} choices={choices} setChoice={(k, c) => setOverride((o) => ({ ...o, [k]: c }))}
            current={current} needsDecision={(k) => biNeedsDecision(placement.fields.get(k) ?? [], current(k))}
            itemOff={itemOff} toggleItem={(k) => setItemOff((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
            files={[]} onShow={() => {}} />
          <OtherPanel facts={placement.other} off={otherOff} files={[]} onShow={() => {}}
            toggle={(id) => setOtherOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })} />
        </div>
      )}
    </Dialog>
  )
}

