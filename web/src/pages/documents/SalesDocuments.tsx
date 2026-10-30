import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, Ban, CheckCircle2, Download, Eye, FileText, Images, Loader2, Presentation } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useFieldWriter, useVehicleData } from '@/api/fields'
import { useImages } from '@/api/records'
import { useUpdateVehicle, useVehicle } from '@/api/vehicles'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { ErrorNote, PageLoader, Panel, PanelHeader } from '@/components/ui/misc'
import { VehicleThumb, vehicleTitle } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useSignedUrl } from '@/lib/files'
import { friendlyError } from '@/lib/supabase'
import type { RenderResult } from '@/docs/types'
import { labelFor } from '@/lib/fields'
import { brochurePhotos, type DocKind, type DocSettings, gatherFiles, type Img, inspect, type Issue, photoSizes, readSettings, toDocData, usablePhotos } from './docdata'
import { saveExport } from './save'

const DOCS: { kind: DocKind; icon: typeof FileText }[] = [
  { kind: 'specsheet', icon: FileText },
  { kind: 'brochure', icon: Presentation },
]

export default function SalesDocuments() {
  const { t } = useTranslation(['salesdocs', 'common'])
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const kind: DocKind = params.get('doc') === 'brochure' ? 'brochure' : 'specsheet'
  const viewOnly = params.get('view') === '1'
  const { company, canWrite } = useCompany()
  const vehicle = useVehicle(id)
  const specsQ = useVehicleData(id)
  const imagesQ = useImages(id!)
  const update = useUpdateVehicle(id!)
  const qc = useQueryClient()
  const nav = useNavigate()

  // Content choices: edited locally, saved to the vehicle shortly after each change.
  const [draft, setDraft] = useState<DocSettings | null>(null)
  const settings = useMemo(() => draft ?? (vehicle.data ? readSettings(vehicle.data) : {}), [draft, vehicle.data])
  const saveTimer = useRef<number | undefined>(undefined)
  const change = (next: DocSettings) => {
    setDraft(next)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => update.mutate({ doc_settings: next as never }), 600)
  }

  const data = specsQ.data
  const images = useMemo(() => (imagesQ.data ?? []) as Img[], [imagesQ.data])
  const v = useMemo(() => (vehicle.data ? { ...vehicle.data, doc_settings: settings as never } : null), [vehicle.data, settings])

  // ---- Render --------------------------------------------------------------
  const [render, setRender] = useState<{ key: string; pages: string[]; pdf: Uint8Array; result: RenderResult } | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number } | null>>({})
  const renderKey = JSON.stringify([kind, settings, (data?.rows ?? []).map((s) => [s.id, s.field_key, s.position, s.value_en, s.value_ar]),
    images.map((i) => i.id), v && [v.brand, v.model, v.year, v.trim_level, v.listing_price],
    [company.legal_name, company.signature_line, company.disclaimer, company.doc_banner_path, company.doc_watermark_path, company.currency]])

  useEffect(() => {
    if (!v || !data || imagesQ.isLoading) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setRendering(true)
      setRenderError(null)
      try {
        const { files, paths } = await gatherFiles(kind, company, images, settings)
        const docData = toDocData(v, company, data, paths)
        const r = await import('@/docs/render')
        const result = kind === 'specsheet' ? await r.renderSpecSheet(docData, files) : await r.renderBrochure(docData, files)
        const { renderPdfPages } = await import('@/lib/pdfText')
        const pages = await renderPdfPages(result.pdf.slice().buffer, 60, kind === 'specsheet' ? 1100 : 1400)
        if (kind === 'brochure') setSizes(await photoSizes(usablePhotos(images)))
        if (!cancelled) setRender({ key: renderKey, pages, pdf: result.pdf, result })
      } catch (e) {
        if (!cancelled) setRenderError((e as Error).message)
      } finally {
        if (!cancelled) setRendering(false)
      }
    }, 450)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [renderKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const issues = useMemo(() => (v && data ? inspect(kind, v, data, images, { render: render?.result, photoSizes: sizes }) : []), [kind, v, data, images, render, sizes])
  const blocking = issues.filter((i) => i.level === 'block')
  const fresh = render?.key === renderKey

  // ---- Export --------------------------------------------------------------
  const [exporting, setExporting] = useState(false)
  async function exportPdf() {
    if (!v || !render || !fresh || blocking.length) return
    setExporting(true)
    try {
      const name = `${[v.brand, v.model, v.year].filter(Boolean).join(' ')} ${kind === 'specsheet' ? 'spec sheet' : 'brochure'}`.trim()
      const file = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.pdf`
      const blob = new Blob([render.pdf.slice()], { type: 'application/pdf' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      await saveExport({ kind, companyId: company.id, vehicleId: v.id!, pdf: render.pdf, filename: file, firstPage: render.pages[0] })
      qc.invalidateQueries()
      toast.success(t(kind === 'specsheet' ? 'exported.specsheet' : 'exported.brochure'))
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setExporting(false)
    }
  }

  if (vehicle.isLoading || specsQ.isLoading || imagesQ.isLoading || !data) return <PageLoader />
  if (vehicle.error || !v) return <ErrorNote error={vehicle.error} />

  const header = (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Link to={`/vehicles/${id}`} className="flex items-center gap-3">
        <VehicleThumb path={v.cover_thumbnail_path} className="h-10 w-14" />
        <span>
          <span className="block text-[12.5px] text-ink-3">{t('title')}</span>
          <span className="block text-[17px] font-semibold">{vehicleTitle(v)}</span>
        </span>
      </Link>
      <div role="tablist" className="ms-auto flex rounded-md border border-line bg-surface p-0.5">
        {DOCS.map((d) => (
          <button key={d.kind} role="tab" aria-selected={kind === d.kind}
            onClick={() => setParams({ ...(d.kind === 'brochure' ? { doc: 'brochure' } : {}), ...(viewOnly ? { view: '1' } : {}) }, { replace: true })}
            className={cn('flex h-8 cursor-pointer items-center gap-2 rounded-sm px-3 text-[13px]', kind === d.kind ? 'bg-raised font-medium text-ink' : 'text-ink-2 hover:text-ink')}>
            <d.icon className="size-4" />{t(`doc.${d.kind}`)}
          </button>
        ))}
      </div>
      {viewOnly ? (
        canWrite && <Button onClick={() => setParams(kind === 'brochure' ? { doc: 'brochure' } : {})}><Eye />{t('inspectAndExport')}</Button>
      ) : (
        <Button variant="primary" onClick={exportPdf} loading={exporting} disabled={!fresh || rendering || blocking.length > 0 || !canWrite}
          title={blocking.length ? t('fixBlocking') : undefined}>
          <Download />{t('export')}
        </Button>
      )}
    </div>
  )

  const preview = (
    <div id="preview" className="space-y-4" aria-busy={rendering}>
      {renderError && <ErrorNote error={new Error(renderError)} />}
      {!render && !renderError && <Panel className="flex h-96 items-center justify-center gap-2 text-[13px] text-ink-2"><Loader2 className="size-4 animate-spin" />{t('rendering')}</Panel>}
      {render && (
        <div className={cn('space-y-4 transition-opacity', !fresh && 'opacity-60')}>
          <p className="text-[12.5px] text-ink-3">{t('pages', { count: render.pages.length })}{rendering && ` · ${t('updating')}`}</p>
          {render.pages.map((src, i) => (
            <img key={i} src={src} alt={t('pageN', { n: i + 1 })} data-page={i + 1}
              className={cn('w-full rounded-sm border border-line-soft bg-white shadow-sm', kind === 'specsheet' && 'mx-auto max-w-[720px]')} />
          ))}
        </div>
      )}
    </div>
  )

  if (viewOnly) return <>{header}{preview}</>

  return (
    <>
      {header}
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto xl:pb-6">
          <Checklist issues={issues} vehicleId={id!} ready={fresh} onGo={(target) => {
            const el = document.getElementById(target)
            if (!el) { nav(`/vehicles/${id}`); return }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-warn')
            setTimeout(() => el.classList.remove('ring-2', 'ring-warn'), 1600)
          }} />
          {kind === 'brochure' && <BrochureChoices images={images} settings={settings} change={change} sizes={sizes} />}
          <button className="text-[12.5px] text-ink-3 underline hover:text-ink" onClick={() => nav(`/vehicles/${id}`)}>{t('editSpecs')}</button>
        </div>
        {preview}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Checklist with inline fixes
// ---------------------------------------------------------------------------

function targetId(i: Issue) {
  switch (i.target.kind) {
    case 'photos': return 'choose-photos'
    case 'layout': return 'preview'
    case 'field': return `field-${i.target.key}`
    default: return `vehicle-${i.target.field}`
  }
}

function Checklist({ issues, vehicleId, ready, onGo }: { issues: Issue[]; vehicleId: string; ready: boolean; onGo: (id: string) => void }) {
  const { t } = useTranslation('salesdocs')
  const blocks = issues.filter((i) => i.level === 'block')
  const warns = issues.filter((i) => i.level === 'warn')
  return (
    <Panel>
      <PanelHeader title={t('checklist.title')}>
        {!ready ? <Loader2 className="size-4 animate-spin text-ink-3" /> : !issues.length && <span className="flex items-center gap-1 text-[12.5px] text-ok"><CheckCircle2 className="size-4" />{t('checklist.allGood')}</span>}
      </PanelHeader>
      {issues.length > 0 && (
        <ul className="max-h-[60dvh] divide-y divide-line-soft overflow-y-auto">
          {[...blocks, ...warns].map((i) => (
            <li key={`${i.code}:${JSON.stringify(i.target)}:${JSON.stringify(i.params ?? {})}`} className="px-4 py-2.5 text-[13px]" data-issue={i.code}>
              <div className="flex items-start gap-2">
                {i.level === 'block' ? <Ban className="mt-0.5 size-4 shrink-0 text-danger" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />}
                <span className="flex-1" dir="auto">{String(t(`issue.${i.code}` as never, (i.params ?? {}) as never))}</span>
                {i.target.kind !== 'vehicle' && (
                  <button className="shrink-0 text-[12.5px] text-ink-2 underline hover:text-ink"
                    onClick={() => (i.target.kind === 'field' ? window.open(`/vehicles/${vehicleId}#field-${i.target.key}`, '_self') : onGo(targetId(i)))}>{t('checklist.show')}</button>
                )}
              </div>
              <InlineFix issue={i} vehicleId={vehicleId} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Type the missing value right in the checklist. */
function InlineFix({ issue, vehicleId }: { issue: Issue; vehicleId: string }) {
  const { t } = useTranslation(['salesdocs', 'common'])
  const [value, setValue] = useState('')
  const { setField, updateRow } = useFieldWriter(vehicleId)
  const updVehicle = useUpdateVehicle(vehicleId)
  const tg = issue.target
  const onErr = (er: unknown) => toast.error(friendlyError(er))
  if (tg.kind === 'vehicle') {
    const numeric = tg.field === 'year' || tg.field === 'listing_price'
    return (
      <form className="mt-1.5 flex gap-2 ps-6" onSubmit={(e) => {
        e.preventDefault()
        const v = value.trim().replace(/,/g, '')
        if (v) updVehicle.mutate({ [tg.field]: numeric ? Number(v) : v } as never, { onError: onErr })
      }}>
        <Input id={`vehicle-${tg.field}`} className="h-8" value={value} onChange={(e) => setValue(e.target.value)} inputMode={numeric ? 'decimal' : undefined} dir={numeric ? 'ltr' : 'auto'}
          placeholder={t(`fields.${tg.field}`)} aria-label={t(`fields.${tg.field}`)} />
        <Button size="sm" type="submit" loading={updVehicle.isPending} disabled={!value.trim()}>{t('common:actions.save')}</Button>
      </form>
    )
  }
  if (tg.kind === 'field' && tg.key !== 'key_features' && !(tg.lang === 'en' && ['drive_modes', 'interior_features', 'smart_features'].includes(tg.key))) {
    const label = labelFor(tg.key, tg.lang)
    const pending = setField.isPending || updateRow.isPending
    return (
      <form className="mt-1.5 flex gap-2 ps-6" onSubmit={(e) => {
        e.preventDefault()
        const v = value.trim()
        if (!v) return
        if (tg.rowId && tg.lang === 'ar') updateRow.mutate({ id: tg.rowId, patch: { value_ar: v } }, { onError: onErr })
        else setField.mutate({ key: tg.key, value: tg.lang === 'ar' ? { ar: v } : { en: v } }, { onError: onErr })
      }}>
        <Input className="h-8" dir={tg.lang === 'ar' ? 'rtl' : 'auto'} lang={tg.lang} value={value} onChange={(e) => setValue(e.target.value)} placeholder={label} aria-label={label} />
        <Button size="sm" type="submit" loading={pending} disabled={!value.trim()}>{t('common:actions.save')}</Button>
      </form>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Content choices
// ---------------------------------------------------------------------------

function OrderedPicker<T extends { id: string }>({ id, title, hint, all, chosen, onChange, render }: {
  id: string
  title: string
  hint?: string
  all: T[]
  chosen: T[]
  onChange: (ids: string[]) => void
  render: (x: T) => React.ReactNode
}) {
  const { t } = useTranslation('salesdocs')
  const chosenIds = chosen.map((c) => c.id)
  const rest = all.filter((x) => !chosenIds.includes(x.id))
  const move = (i: number, d: number) => {
    const next = [...chosenIds]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <Panel id={id} className="transition-shadow">
      <PanelHeader title={title}><span className="tnum text-[12.5px] text-ink-3">{chosen.length}/{all.length}</span></PanelHeader>
      {hint && <p className="border-b border-line-soft px-4 py-2 text-[12.5px] text-ink-3">{hint}</p>}
      <ul className="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
        {chosen.map((x, i) => (
          <li key={x.id} id={`${id}-${x.id}`} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
            <input type="checkbox" checked onChange={() => onChange(chosenIds.filter((c) => c !== x.id))} aria-label={t('choose.include')} />
            <span className="min-w-0 flex-1">{render(x)}</span>
            <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('choose.up')}><ArrowUp /></Button>
            <Button variant="ghost" size="icon-sm" disabled={i === chosen.length - 1} onClick={() => move(i, 1)} aria-label={t('choose.down')}><ArrowDown /></Button>
          </li>
        ))}
        {rest.map((x) => (
          <li key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-ink-3">
            <input type="checkbox" checked={false} onChange={() => onChange([...chosenIds, x.id])} aria-label={t('choose.include')} />
            <span className="min-w-0 flex-1">{render(x)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function PhotoThumb({ img, lowRes }: { img: Img; lowRes?: boolean }) {
  const url = useSignedUrl(img.thumbnail_path ?? img.storage_path)
  return (
    <span className="relative block h-12 w-16 overflow-hidden rounded-sm bg-raised">
      {url.data && <img src={url.data} alt="" className="size-full object-cover" />}
      {lowRes && <AlertTriangle className="absolute end-0.5 top-0.5 size-3.5 text-warn drop-shadow" />}
    </span>
  )
}

function BrochureChoices({ images, settings, change, sizes }: {
  images: Img[]; settings: DocSettings; change: (s: DocSettings) => void; sizes: Record<string, { width: number; height: number } | null>
}) {
  const { t } = useTranslation('salesdocs')
  const usable = usablePhotos(images)
  const sel = brochurePhotos(images, settings)
  const b = settings.brochure ?? {}
  const low = (i: Img) => (sizes[i.id]?.width ?? Infinity) < 1600
  return (
    <>
      <Panel id="choose-cover">
        <PanelHeader title={t('choose.cover')} />
        {usable.length === 0 ? <p className="px-4 py-3 text-[13px] text-ink-3"><Images className="me-1 inline size-4" />{t('choose.noPhotos')}</p> : (
          <div className="flex flex-wrap gap-2 p-3">
            {usable.map((i) => (
              <button key={i.id} onClick={() => change({ ...settings, brochure: { ...b, coverId: i.id } })} aria-pressed={sel.cover?.id === i.id}
                className={cn('cursor-pointer rounded-sm p-0.5', sel.cover?.id === i.id ? 'ring-2 ring-ink-2' : 'opacity-70 hover:opacity-100')} title={i.original_filename}>
                <PhotoThumb img={i} lowRes={low(i)} />
              </button>
            ))}
          </div>
        )}
      </Panel>
      <OrderedPicker id="choose-photos" title={t('choose.photos')} hint={t('choose.photosHint')} all={usable} chosen={sel.photos}
        onChange={(ids) => change({ ...settings, brochure: { ...b, photoIds: ids } })}
        render={(i) => (
          <span className="flex items-center gap-2">
            <PhotoThumb img={i} lowRes={low(i)} />
            <span className="truncate" dir="auto">{i.original_filename}</span>
            {sizes[i.id] && <span className="tnum text-[11.5px] text-ink-3" dir="ltr">{sizes[i.id]!.width}×{sizes[i.id]!.height}</span>}
          </span>
        )} />
    </>
  )
}

export function DocumentButtons({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation('salesdocs')
  return (
    <>
      <Link to={`/vehicles/${vehicleId}/documents`} className={buttonVariants()}><FileText />{t('previewExport')}</Link>
      <Link to={`/vehicles/${vehicleId}/documents?view=1`} className={buttonVariants({ variant: 'ghost' })}><Eye />{t('view')}</Link>
    </>
  )
}
