import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CarFront, FilePlus2, Plus, Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { findByChassis, useChassisSearch, useVehicle } from '@/api/vehicles'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Panel, PanelHeader } from '@/components/ui/misc'
import { Chassis, StatusBadge, VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { useVehicleData } from '@/api/fields'
import { useCompany } from '@/lib/auth'
import { FIELD_BY_KEY, matchField, matchList, SECTION_OF } from '@/lib/fields'
import { cn } from '@/lib/cn'
import { detectKind, extractFile, mergeFacts } from '@/lib/extract/index'
import { isDocumentHeading, suggestName } from '@/lib/extract/core'
import type { SourceRef } from '@/lib/extract/types'
import { makeThumbnail, MAX_FILE_BYTES, uploadObject } from '@/lib/files'
import { friendlyError, supabase } from '@/lib/supabase'
import type { ImageType } from '@/lib/types'
import { checkChassis, normalizeChassis } from '@/lib/vin'
import { FileList, FilePreview } from './FilePanel'
import { CoreFieldsPanel, OtherPanel, PhotosPanel, SectionsPanel, TextPanel } from './ReviewPanels'
import {
  buildCandidates, chosenValue, defaultChoice, EDITABLE, type EditableField, type FieldCandidate,
  type BiChoice, biNeedsDecision, chosenBi, defaultBiChoice, type FieldChoice, needsDecision, placeFacts, type SessionFile,
} from './session'

type Target = { mode: 'existing'; id: string } | { mode: 'new' } | null

const ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

/** embedded = shown inside "Add vehicle": no page header, and files default to a new vehicle. */
export default function ImportFiles({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation(['docimport', 'common'])
  const { company, canWrite } = useCompany()
  const { id: routeId } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()

  const [files, setFiles] = useState<SessionFile[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [target, setTarget] = useState<Target>(routeId ? { mode: 'existing', id: routeId } : null)
  const [autoTargeted, setAutoTargeted] = useState(false)
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<{ key: string; page: number | null } | null>(null)
  const [choiceOverride, setChoiceOverride] = useState<Partial<Record<EditableField, FieldChoice>>>({})
  const [fieldOverride, setFieldOverride] = useState<Record<string, BiChoice>>({})
  const [itemOff, setItemOff] = useState<Set<string>>(new Set())
  const [otherOff, setOtherOff] = useState<Set<string>>(new Set())
  const [textPicked, setTextPicked] = useState<Set<string>>(new Set())
  const [photoOverride, setPhotoOverride] = useState<Record<string, { keep: boolean; type: ImageType }>>({})
  const [wrongCarOk, setWrongCarOk] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const vehicle = useVehicle(target?.mode === 'existing' ? target.id : undefined)
  // Brands from Settings plus those already on this company's vehicles.
  const usedBrands = useQuery({
    queryKey: ['used-brands'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('brand').not('brand', 'is', null).limit(2000)
      return [...new Set((data ?? []).map((r) => r.brand!).filter(Boolean))]
    },
  })
  const knownBrands = useMemo(() => [...new Set([...(company.known_brands ?? []), ...(usedBrands.data ?? [])])], [company.known_brands, usedBrands.data])
  const isNew = target?.mode === 'new'

  // ---- Reading files -------------------------------------------------------
  const addFiles = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list)
    const bad: string[] = []
    const fresh: SessionFile[] = []
    for (const file of arr) {
      if (file.size === 0) { bad.push(t('common:files.empty', { name: file.name })); continue }
      if (file.size > MAX_FILE_BYTES) { bad.push(t('common:files.tooLarge', { name: file.name })); continue }
      const kind = await detectKind(file)
      if (!kind) { bad.push(t('files.unsupported', { name: file.name })); continue }
      fresh.push({ key: crypto.randomUUID(), file, kind: kind.kind, mime: kind.mime, ext: kind.ext, status: 'reading', images: [] })
    }
    setRejected(bad)
    if (!fresh.length) return
    setFiles((f) => [...f, ...fresh])
    setSelected((s) => s ?? { key: fresh[0].key, page: null })
    await Promise.all(fresh.map(async (sf) => {
      try {
        const r = await extractFile(sf.file, sf.key)
        setFiles((all) => all.map((x) => (x.key === sf.key ? { ...x, status: 'ready', extraction: r.extraction, images: r.images } : x)))
      } catch (e) {
        setFiles((all) => all.map((x) => (x.key === sf.key ? { ...x, status: 'error', error: (e as Error).message || t('files.readFailed') } : x)))
      }
    }))
  }, [t])

  const ready = files.filter((f) => f.status === 'ready' && !f.extraction?.inventorySheet)
  const reading = files.some((f) => f.status === 'reading')
  const merged = useMemo(() => mergeFacts(ready.map((f) => ({ fileKey: f.key, facts: f.extraction!.facts }))), [ready])

  // ---- Vehicle field candidates -----------------------------------------------
  const cands = useMemo(() => {
    const titles = ready.filter((f) => f.extraction!.title && !isDocumentHeading(f.extraction!.title)).map((f) => ({ name: f.extraction!.title!, source: { fileKey: f.key, page: f.kind === 'pdf' ? 1 : null } }))
    const c = buildCandidates(merged, titles, (n) => suggestName(n, knownBrands))
    // Chassis numbers spotted in the text (not under a label) are offered too.
    for (const f of ready) for (const cc of f.extraction!.chassisCandidates) {
      const hit = c.chassis_number.find((x) => normalizeChassis(x.value) === cc.value)
      const src: SourceRef = { fileKey: f.key, page: f.kind === 'pdf' ? cc.page : null }
      if (hit) { if (!hit.sources.some((s) => s.fileKey === src.fileKey)) hit.sources.push(src) }
      else c.chassis_number.push({ value: cc.value, sources: [src], suggested: !cc.labelAnchored, raw: cc.raw, invalid: cc.check.errors.length > 0 } satisfies FieldCandidate)
    }
    return c
  }, [merged, ready, knownBrands])

  const current = useMemo(() => {
    const v = vehicle.data
    const out: Partial<Record<EditableField, string | null>> = {}
    if (v) for (const f of EDITABLE) out[f] = v[f] === null || v[f] === undefined ? null : String(v[f])
    return out
  }, [vehicle.data])

  const choices = useMemo(() => Object.fromEntries(EDITABLE.map((f) => [f,
    f in choiceOverride ? choiceOverride[f]! : defaultChoice(f, cands[f], current[f] ?? null, isNew)])) as Record<EditableField, FieldChoice>,
  [choiceOverride, cands, current, isNew])

  const docChassis = useMemo(() => [...new Set(cands.chassis_number.filter((c) => !c.invalid).map((c) => normalizeChassis(c.value)))], [cands])

  // Pick the vehicle automatically only on an exact chassis match with an existing record.
  const match = useQuery({
    queryKey: ['import-chassis-match', docChassis.join(',')],
    enabled: docChassis.length > 0,
    queryFn: async () => Promise.all(docChassis.map(async (c) => ({ chassis: c, vehicle: await findByChassis(c) }))),
  })
  if (!autoTargeted && !reading && files.length && (match.data || docChassis.length === 0) && !target) {
    setAutoTargeted(true)
    const found = (match.data ?? []).filter((m) => m.vehicle)
    if (docChassis.length === 1 && found.length === 1) setTarget({ mode: 'existing', id: found[0].vehicle!.id })
    else if (embedded) setTarget({ mode: 'new' })
  }

  // ---- Wrong-car check ---------------------------------------------------------
  const mismatched = target?.mode === 'existing' && vehicle.data
    ? docChassis.filter((c) => c !== vehicle.data!.chassis_normalized)
    : []
  const otherVehicle = match.data?.find((m) => m.vehicle && mismatched.includes(m.chassis))?.vehicle

  // ---- Specs & photos --------------------------------------------------------------
  // Facts placed on the fixed fields (kit/fields.json); the rest is "Other".
  const placement = useMemo(() => placeFacts(merged, matchField, matchList, new Set(['brand', 'model', 'year', 'trim', 'listing_price'])), [merged])
  const saved = useVehicleData(target?.mode === 'existing' ? target.id : undefined)
  const currentField = (key: string) => {
    const r = saved.data?.fields.get(key)
    return r ? { en: r.value_en, ar: r.value_ar } : undefined
  }
  const fieldChoices = Object.fromEntries([...placement.fields].map(([k, c]) => [k, k in fieldOverride ? fieldOverride[k] : defaultBiChoice(c, currentField(k))])) as Record<string, BiChoice>
  const photoChoice = useMemo(() => Object.fromEntries(files.flatMap((f) => f.images).map((i) => [i.id,
    photoOverride[i.id] ?? { keep: i.origin === 'file', type: i.origin === 'file' ? 'arrival' : 'other' }])), [files, photoOverride])

  // ---- What still needs the secretary ------------------------------------------------
  const newChassis = isNew ? chosenValue('chassis_number', choices.chassis_number, cands.chassis_number) : null
  const dupCheck = useQuery({
    queryKey: ['chassis-exists', newChassis ? normalizeChassis(newChassis) : ''],
    enabled: !!newChassis,
    queryFn: () => findByChassis(newChassis!),
  })
  const blockers: string[] = []
  if (!target) blockers.push(t('block.target'))
  if (reading) blockers.push(t('block.reading'))
  if (!ready.length && !files.some((f) => f.images.length)) blockers.push(t('block.noFiles'))
  const unresolvedFields = EDITABLE.filter((f) => choices[f] === null && needsDecision(f, cands[f], current[f] ?? null, isNew))
  if (unresolvedFields.length) blockers.push(t('block.fields', { count: unresolvedFields.length }))
  const unresolvedSpecs = [...placement.fields].filter(([k, c]) => fieldChoices[k] === null && biNeedsDecision(c, currentField(k)))
  if (unresolvedSpecs.length) blockers.push(t('block.specs', { count: unresolvedSpecs.length }))
  if (isNew && !newChassis) blockers.push(t('block.chassis'))
  if (isNew && newChassis && checkChassis(newChassis).errors.length) blockers.push(t('block.chassisInvalid'))
  if (isNew && dupCheck.data) blockers.push(t('block.duplicate'))
  if (mismatched.length && !wrongCarOk) blockers.push(t('block.wrongCar'))

  // ---- Save ----------------------------------------------------------------------------
  async function save() {
    if (blockers.length || !target) return
    const session = crypto.randomUUID()
    const base = `${company.id}/imports/${session}`
    try {
      const documents = []
      for (const [i, f] of ready.entries()) {
        setSaving(t('saving.file', { n: i + 1, total: ready.length }))
        const path = `${base}/${crypto.randomUUID()}.${f.ext}`
        await uploadObject(path, f.file, f.mime)
        documents.push({
          key: f.key, storage_path: path, original_filename: f.file.name, mime_type: f.mime, file_size: f.file.size,
          document_type: 'other', extracted_text: f.extraction!.pages.join('\n\f\n'),
        })
      }
      const keep = files.flatMap((f) => f.images.map((i) => ({ i, f }))).filter(({ i }) => photoChoice[i.id]?.keep)
      const images = []
      for (const [n, { i, f }] of keep.entries()) {
        setSaving(t('saving.photo', { n: n + 1, total: keep.length }))
        const type = i.blob.type || 'image/png'
        const ext = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
        const name = `${f.file.name.replace(/\.[^.]+$/, '')}${i.page ? `-p${i.page}` : ''}.${ext}`
        const path = `${base}/${crypto.randomUUID()}.${ext}`
        await uploadObject(path, i.blob, type)
        let thumbnail_path: string | null = null
        const thumb = await makeThumbnail(new File([i.blob], name, { type }))
        if (thumb) { thumbnail_path = path.replace(/\.[a-z]+$/, '.thumb.webp'); await uploadObject(thumbnail_path, thumb, 'image/webp') }
        images.push({ storage_path: path, thumbnail_path, original_filename: name, mime_type: type, file_size: i.blob.size, image_type: photoChoice[i.id].type })
      }

      const fields: Record<string, string> = {}
      for (const f of EDITABLE) {
        const v = chosenValue(f, choices[f], cands[f])
        if (v !== null && (isNew || v !== (current[f] ?? null))) fields[f] = v
      }

      const out: Record<string, unknown>[] = []
      const src = (c: { sources: SourceRef[] }) => ({ source_key: c.sources[0]?.fileKey, source_page: c.sources[0]?.page })
      for (const [key, cands] of placement.fields) {
        const v = chosenBi(fieldChoices[key], cands)
        if (!v || (!v.en && !v.ar)) continue
        const def = FIELD_BY_KEY.get(key)!
        const c = fieldChoices[key]?.kind === 'candidate' ? cands[(fieldChoices[key] as { index: number }).index] : null
        out.push({ field_key: key, label: def.label_en, label_alt: def.label_ar, section: SECTION_OF.get(key)?.title_en ?? null,
          value_en: v.en, value_ar: v.ar ?? currentField(key)?.ar ?? null, ...(c ? src(c) : {}) })
      }
      for (const [list, items] of placement.lists) items.forEach((it, i) => {
        if (itemOff.has(`${list}:${i}`)) return
        out.push({ list, section: SECTION_OF.get(list)?.title_en ?? null, value_en: it.en, value_ar: it.ar, ...src(it) })
      })
      for (const m of placement.other) {
        if (otherOff.has(m.id)) continue
        for (const v of m.values) out.push({ section: m.section, label: m.label || m.section || t('review.feature'), label_alt: m.labelAlt,
          value_en: v.value, value_ar: v.valueAlt ?? null, unit: v.unit, ...src(v) })
      }
      for (const f of ready) f.extraction!.unstructured.forEach((u, i) => {
        if (textPicked.has(`${f.key}:${i}`)) out.push({ section: t('review.otherText'), label: t('review.noteLabel'), value_en: u.text, source_key: f.key, source_page: u.page })
      })

      setSaving(t('saving.record'))
      const { data: vid, error } = await supabase.rpc('save_vehicle_import', {
        p_vehicle_id: target.mode === 'existing' ? target.id : null,
        p_fields: fields, p_documents: documents, p_images: images, p_specs: out,
      } as never)
      if (error) throw error
      qc.invalidateQueries()
      toast.success(t('saved', { count: out.length }))
      nav(`/vehicles/${vid}`)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(null)
    }
  }

  const show = (s: SourceRef) => setSelected({ key: s.fileKey, page: s.page })
  const selectedFile = files.find((f) => f.key === selected?.key)

  if (!canWrite) return null

  return (
    <div className="pb-24">
      {!embedded && <PageHeader title={t('title')} description={t('subtitle')} />}

      <TargetBar target={target} setTarget={(tg) => { setTarget(tg); setChoiceOverride({}); setWrongCarOk(false) }} picking={picking} setPicking={setPicking} vehicle={vehicle.data} />

      <label
        className="mt-4 flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface px-4 py-6 text-center text-[13.5px] text-ink-2 hover:border-accent/60"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
      >
        <FilePlus2 className="size-6 text-ink-3" />
        <span className="font-medium text-ink">{files.length ? t('drop.more') : t('drop.title')}</span>
        <span className="text-ink-3">{t('drop.formats')}</span>
        <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
      </label>
      {rejected.length > 0 && (
        <div className="mt-2 space-y-0.5 text-[13px] text-danger" role="alert">{rejected.map((r) => <p key={r}>{r}</p>)}</div>
      )}

      {files.length > 0 && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(340px,0.85fr)_1.15fr]">
          <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <Panel>
              <PanelHeader title={t('files.title', { count: files.length })} />
              <FileList files={files} selected={selected?.key ?? null} onSelect={(k) => setSelected({ key: k, page: null })}
                onRemove={(k) => { setFiles((f) => f.filter((x) => x.key !== k)); if (selected?.key === k) setSelected(null) }}
                onRouteInventory={(f) => { setFiles((all) => all.map((x) => (x.key === f.key ? { ...x, status: 'routed' } : x))); nav('/import', { state: { file: f.file } }) }} />
            </Panel>
            <Panel className="overflow-hidden"><FilePreview file={selectedFile} page={selected?.page ?? null} /></Panel>
          </div>

          <div className="space-y-5">
            {ready.length > 0 && target && (
              <CoreFieldsPanel cands={cands} choices={choices} setChoice={(f, c) => setChoiceOverride((o) => ({ ...o, [f]: c }))}
                current={current} isNew={isNew} files={files} onShow={show}
                decisionNeeded={(f) => needsDecision(f, cands[f], current[f] ?? null, isNew)}
                wrongCar={mismatched.length > 0 && (
                  <div className="border-b border-danger/30 bg-danger/[0.06] px-4 py-3 text-[13px]" role="alert">
                    <p className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" />{t('wrongCar.title')}</p>
                    <p className="mt-1 text-ink-2">
                      {t('wrongCar.body')} {mismatched.map((c) => <Chassis key={c} value={c} className="ms-1 text-ink" />)}
                    </p>
                    {otherVehicle && (
                      <Button size="sm" className="mt-2" onClick={() => setTarget({ mode: 'existing', id: otherVehicle.id })}>
                        {t('wrongCar.switch', { name: vehicleTitle(otherVehicle) })}
                      </Button>
                    )}
                    <label className="mt-2 flex items-start gap-2 text-ink">
                      <input type="checkbox" className="mt-0.5" checked={wrongCarOk} onChange={(e) => setWrongCarOk(e.target.checked)} />
                      {t('wrongCar.confirm')}
                    </label>
                  </div>
                )} />
            )}
            {ready.length > 0 && !target && (
              <Panel className="p-5 text-[13.5px] text-ink-2">{t('target.firstChoose')}</Panel>
            )}
            <SectionsPanel placement={placement} choices={fieldChoices} setChoice={(k, c) => setFieldOverride((o) => ({ ...o, [k]: c }))}
              current={currentField} needsDecision={(k) => biNeedsDecision(placement.fields.get(k) ?? [], currentField(k))}
              itemOff={itemOff} toggleItem={(k) => setItemOff((s0) => { const n = new Set(s0); if (n.has(k)) n.delete(k); else n.add(k); return n })}
              files={files} onShow={show} />
            <OtherPanel facts={placement.other} off={otherOff} files={files} onShow={show}
              toggle={(id) => setOtherOff((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n })} />
            <TextPanel files={ready} picked={textPicked} onShow={show}
              toggle={(k) => setTextPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })} />
            <PhotosPanel files={files} choice={photoChoice} setChoice={(id, v) => setPhotoOverride((o) => ({ ...o, [id]: v }))} />
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line-soft bg-surface/95 backdrop-blur lg:start-64">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6">
            <p className="me-auto text-[13px] text-ink-2">
              {saving ?? (blockers.length ? <span className="text-warn">{blockers.join(' · ')}</span> : t('readyToSave'))}
            </p>
            <Button variant="ghost" onClick={() => nav(-1)} disabled={!!saving}>{t('common:actions.cancel')}</Button>
            <Button variant="primary" size="lg" loading={!!saving} disabled={blockers.length > 0} onClick={save}>
              {target?.mode === 'new' ? t('saveNew') : t('save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function TargetBar({ target, setTarget, picking, setPicking, vehicle }: {
  target: Target
  setTarget: (t: Target) => void
  picking: boolean
  setPicking: (b: boolean) => void
  vehicle: ReturnType<typeof useVehicle>['data']
}) {
  const { t } = useTranslation('docimport')
  const [term, setTerm] = useState('')
  const res = useChassisSearch(term)
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-medium text-ink-2">{t('target.label')}</span>
        {target?.mode === 'existing' && vehicle ? (
          <Link to={`/vehicles/${vehicle.id}`} className="flex items-center gap-3 rounded-md border border-line-soft px-2.5 py-1.5 hover:bg-raised">
            <VehicleThumb path={vehicle.cover_thumbnail_path} className="h-8 w-11" />
            <span>
              <span className="block text-[13.5px] font-medium">{vehicleTitle(vehicle)}</span>
              <Chassis value={vehicle.chassis_number!} className="text-[12px] text-ink-2" />
            </span>
            <StatusBadge status={vehicle.status!} />
          </Link>
        ) : target?.mode === 'new' ? (
          <span className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-[13.5px] font-medium"><Plus className="size-4" />{t('target.newVehicle')}</span>
        ) : (
          <span className="text-[13.5px] text-warn">{t('target.none')}</span>
        )}
        <span className="ms-auto flex gap-2">
          <Button size="sm" onClick={() => setPicking(!picking)}><Search />{t('target.existing')}</Button>
          <Button size="sm" onClick={() => { setTarget({ mode: 'new' }); setPicking(false) }} aria-pressed={target?.mode === 'new'}><CarFront />{t('target.new')}</Button>
        </span>
      </div>
      {picking && (
        <div className="mt-3">
          <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('target.searchPlaceholder')} aria-label={t('target.existing')} />
          <ul className="mt-1 divide-y divide-line-soft rounded-md border border-line-soft empty:hidden">
            {(term.trim().length >= 2 ? res.data ?? [] : []).map((v) => (
              <li key={v.id}>
                <button className={cn('flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-start hover:bg-raised')}
                  onClick={() => { setTarget({ mode: 'existing', id: v.id! }); setPicking(false); setTerm('') }}>
                  <VehicleThumb path={v.cover_thumbnail_path} className="h-8 w-11" />
                  <span className="flex-1">
                    <span className="block text-[13.5px] font-medium">{vehicleTitle(v)}</span>
                    <Chassis value={v.chassis_number!} className="text-[12px] text-ink-2" />
                  </span>
                  <StatusBadge status={v.status!} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
