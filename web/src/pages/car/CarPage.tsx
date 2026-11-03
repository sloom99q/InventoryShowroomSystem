// The car page: the chassis number first, where the car is, then everything about it, editable in place.
import { Archive, ArchiveRestore, ArrowRight, Camera, Check, ChevronLeft, Copy, FileText, FileUp, History, MoreHorizontal, Plus, ShieldAlert, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useMoveStage, useSaveCar, useStages, useJourney, type Stage } from '@/api/journey'
import { useAccessories } from '@/api/records'
import { useVehicleData } from '@/api/fields'
import { useVehicle } from '@/api/vehicles'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { attentionTags, InlineText, StagePill, Tag } from '@/components/v3/bits'
import { useSignedUrl } from '@/lib/files'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fmtDate, fmtMoney, fromLocalInput, nowLocalInput, parseAmount } from '@/lib/format'
import { friendlyError, supabase } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'
import { useStageName } from '@/lib/stageName'
import { ArchiveDialog, ChassisDialog, DeleteDialog } from './dialogs'
import { specProgress, SpecsSheet } from './SpecsSheet'
import { AccessoriesPane, accessorySummary } from './AccessoriesPane'
import { ExpensesPane } from './ExpensesPane'
import { JourneyPane } from './JourneyPane'
import { PhotosPane } from './PhotosPane'

const DocumentsTab = lazy(() => import('@/pages/vehicle/DocumentsTab').then((m) => ({ default: m.DocumentsTab })))
const EditLog = lazy(() => import('@/pages/vehicle/HistoryTabs').then((m) => ({ default: m.HistoryTab })))

const TABS = ['specs', 'photos', 'accessories', 'expenses', 'journey', 'documents'] as const
type Tab = (typeof TABS)[number]

export default function CarPage() {
  const { t } = useTranslation('cars')
  const { id } = useParams<{ id: string }>()
  const car = useVehicle(id)
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'specs'
  const data = useVehicleData(id)
  const acc = useAccessories(id!)
  if (car.isLoading) return <PageLoader />
  if (car.error || !car.data) return <ErrorNote error={car.error ?? new Error(t('car.notFound'))} />
  const v = car.data

  const prog = data.data ? specProgress(v, data.data) : null
  const accSum = accessorySummary(acc.data ?? [])
  const counts: Record<Tab, React.ReactNode> = {
    specs: prog && <Badge>{prog.filled}/{prog.total}</Badge>,
    photos: <Badge>{v.photo_count ?? 0}</Badge>,
    accessories: accSum.missing.length ? <Badge tone="danger">{t('car.missingCount', { count: accSum.missing.length })}</Badge> : accSum.checked ? <Badge>{accSum.present}/{accSum.total}</Badge> : null,
    expenses: Number(v.expense_total) > 0 ? <Badge>{fmtMoney(v.expense_total)}</Badge> : null,
    journey: null,
    documents: v.document_count ? <Badge>{v.document_count}</Badge> : null,
  }

  return (
    <div className="mx-auto max-w-[1240px]">
      <Link to="/vehicles" className="mb-5 inline-flex items-center gap-1.5 text-[14.5px] text-ink-2 hover:text-ink"><ChevronLeft className="size-4 flip-rtl" />{t('nav.cars')}</Link>
      {v.archived_at && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-hover px-4 py-3 text-[14px] text-ink-2"><Archive className="size-4" />{t('car.archivedBanner', { date: fmtDate(v.archived_at) })}</div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Hero v={v} />
        <Cover v={v} onPhotos={() => setParams({ tab: 'photos' }, { replace: true })} />
      </div>
      <JourneyCard v={v} />

      <div role="tablist" aria-label={t('car.sections')} className="mt-7 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'specs' ? {} : { tab: k }, { replace: true })}
            className={cn('-mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors',
              tab === k ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2')}>
            {t(`car.tab.${k}`)}{counts[k]}
          </button>
        ))}
      </div>
      <div className="pt-5" role="tabpanel">
        {tab === 'specs' && <SpecsSheet v={v} />}
        {tab === 'photos' && <PhotosPane v={v} />}
        {tab === 'accessories' && <AccessoriesPane v={v} />}
        {tab === 'expenses' && <ExpensesPane v={v} />}
        {tab === 'journey' && <JourneyPane v={v} />}
        {tab === 'documents' && (
          <Suspense fallback={<PageLoader />}>
            <Link to={`/vehicles/${v.id}/documents`} className="card mb-4 flex items-center gap-4 p-4 hover:bg-raised">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><FileText className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{t('car.sheetTitle')}</span><span className="block text-[13.5px] text-ink-2">{t('car.sheetSub')}</span></span>
              <ArrowRight className="size-4 text-ink-3 flip-rtl" />
            </Link>
            <DocumentsTab vehicleId={v.id!} chassis={v.chassis_number!} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'danger' }) {
  return <span className={cn('tnum rounded-md px-1.5 py-px text-[12px] font-semibold', tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-hover text-ink-2')}>{children}</span>
}

// --- Hero: chassis first ---------------------------------------------------------

function Hero({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const { canWrite, profile } = useCompany()
  const aftersales = ['admin', 'sales_manager', 'secretary', 'technician'].includes(profile.role)
  const stageName = useStageName()
  const save = useSaveCar(v.id!)
  const [copied, setCopied] = useState(false)
  const [adding, setAdding] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(v.chassis_number!) } catch {
      const el = document.createElement('textarea'); el.value = v.chassis_number!; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove()
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1500)
  }
  const labels = v.labels ?? []
  const setLabels = (next: string[]) => save.mutate({ labels: next }, { onError: (e) => toast.error(friendlyError(e)) })
  const sub = [v.trim_level, v.exterior_color].filter(Boolean).join(' · ')
  return (
    <section className="card relative p-6 sm:p-7">
      <div className="absolute end-5 top-5"><CarMenu v={v} /></div>
      <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t('car.chassisLabel')}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 pe-12">
        <h1 className="vin text-[26px] font-bold tracking-[0.1em] break-all sm:text-[34px]" data-testid="chassis-hero">{v.chassis_number}</h1>
        <button onClick={copy} className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-hover" aria-label={t('car.copyChassis')}>
          {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
        </button>
        {copied && <span className="text-[13px] text-ok" role="status">{t('car.copied')}</span>}
      </div>
      {(v.status === 'sold' || v.status === 'delivered') && aftersales && (
        <Link to={`/aftersales/${v.id}`} className="float-end mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-[14px] font-semibold text-accent hover:bg-accent/15" data-testid="to-aftersales">
          {t('car.toAftersales')}<ArrowRight className="size-4 flip-rtl" />
        </Link>
      )}
      <p className="mt-3 text-[19px] sm:text-[21px]">
        <span className="font-semibold">{[v.brand?.toUpperCase(), v.model, v.year].filter(Boolean).join(' ') || t('car.noName')}</span>
        {sub && <span className="text-ink-3"> · {sub}</span>}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StagePill name={stageName(v)} color={v.stage_color} />
        {attentionTags(v).map((g) => <Tag key={g.key} tone={g.tone}>{g.text}</Tag>)}
        {labels.map((l) => (
          <Tag key={l} tone="neutral" className="gap-1 pe-1">
            {l}
            {canWrite && <button onClick={() => setLabels(labels.filter((x) => x !== l))} className="rounded p-0.5 hover:bg-line" aria-label={t('car.removeLabel', { label: l })}><X className="size-3" /></button>}
          </Tag>
        ))}
        {canWrite && (adding
          ? <LabelInput onDone={(l) => { setAdding(false); if (l && !labels.includes(l)) setLabels([...labels, l]) }} />
          : <button onClick={() => setAdding(true)} className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-line px-2 text-[12px] font-medium text-ink-3 hover:border-ink-3 hover:text-ink-2"><Plus className="size-3" />{t('car.label')}</button>)}
      </div>
    </section>
  )
}

function LabelInput({ onDone }: { onDone: (label: string | null) => void }) {
  const { t } = useTranslation('cars')
  const [v, setV] = useState('')
  const suggestions = t('car.labelSuggestions').split('|')
  return (
    <span className="inline-flex items-center">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} list="label-suggestions" placeholder={t('car.labelPh')} aria-label={t('car.label')}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDone(v.trim() || null) } if (e.key === 'Escape') onDone(null) }}
        onBlur={() => onDone(v.trim() || null)} maxLength={40}
        className="h-7 w-44 rounded-md border border-accent px-2 text-[13px] outline-none" />
      <datalist id="label-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </span>
  )
}

function Cover({ v, onPhotos }: { v: VehicleOverview; onPhotos: () => void }) {
  const { t } = useTranslation('cars')
  const { canWrite } = useCompany()
  const url = useSignedUrl(v.cover_thumbnail_path)
  const save = useSaveCar(v.id!)
  const price = v.listing_price !== null && v.listing_price !== undefined ? String(Number(v.listing_price)) : ''
  return (
    <section className="relative min-h-[200px] overflow-hidden rounded-[14px] border border-line bg-gradient-to-br from-[#c5ccd6] to-[#8f99a8]">
      {url.data && <img src={url.data} alt={t('car.coverAlt')} className="absolute inset-0 size-full object-cover" />}
      <button onClick={onPhotos} className="absolute end-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50" aria-label={t('car.openPhotos')}>
        <Camera className="size-5" />
      </button>
      <div className="absolute start-4 bottom-4 rounded-xl bg-surface/95 px-3.5 py-2.5 shadow-sm backdrop-blur">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{t('car.askingPrice')}</p>
        <InlineText id="price" label={t('car.askingPrice')} value={price} disabled={!canWrite} placeholder={t('car.setPrice')} inputMode="decimal" dir="ltr"
          display={<span className="text-[19px] font-bold">{fmtMoney(v.listing_price)}</span>} inputClassName="w-40"
          validate={(x) => (parseAmount(x) === null ? t('car.badPrice') : null)}
          onSave={(x) => save.mutateAsync({ listing_price: x ? Number(parseAmount(x)) : null })} />
      </div>
    </section>
  )
}

// --- ⋯ menu -----------------------------------------------------------------------

function CarMenu({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const { profile } = useCompany()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<null | 'chassis' | 'archive' | 'delete' | 'log'>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const manage = profile.role === 'admin' || profile.role === 'secretary'
  const admin = profile.role === 'admin'
  const item = 'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[14px] hover:bg-hover [&_svg]:size-4 [&_svg]:text-ink-3'
  const pick = (d: typeof dialog) => { setOpen(false); setDialog(d) }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={t('car.more')}
        className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface hover:bg-hover"><MoreHorizontal className="size-5" /></button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-lg shadow-black/10">
          <Link role="menuitem" className={item} to={`/vehicles/${v.id}/documents`}><FileText />{t('car.sheetTitle')}</Link>
          {manage && <button role="menuitem" className={item} onClick={() => pick('chassis')}><ShieldAlert />{t('car.correctChassis')}</button>}
          {manage && (
            <button role="menuitem" className={item} onClick={() => pick('archive')}>
              {v.archived_at ? <><ArchiveRestore />{t('car.restore')}</> : <><Archive />{t('car.archive')}</>}
            </button>
          )}
          {admin && (
            <>
              <div className="my-1.5 border-t border-line-soft" />
              <button role="menuitem" className={item} onClick={() => pick('log')}><History />{t('car.editLog')}</button>
              <Link role="menuitem" className={item} to={`/vehicles/${v.id}/import`}><FileUp />{t('car.importFromFile')}</Link>
              <button role="menuitem" className={cn(item, 'text-danger [&_svg]:text-danger')} onClick={() => pick('delete')}><Trash2 />{t('car.deleteForever')}</button>
            </>
          )}
        </div>
      )}
      <ChassisDialog v={v} open={dialog === 'chassis'} onClose={() => setDialog(null)} />
      <ArchiveDialog v={v} open={dialog === 'archive'} onClose={() => setDialog(null)} />
      {dialog === 'delete' && <DeleteDialog v={v} onClose={() => setDialog(null)} />}
      {dialog === 'log' && (
        <Dialog open onClose={() => setDialog(null)} title={t('car.editLog')} description={t('car.editLogHint')} size="xl">
          <Suspense fallback={<PageLoader />}><EditLog vehicleId={v.id!} /></Suspense>
        </Dialog>
      )}
    </div>
  )
}

// --- Journey -----------------------------------------------------------------------

function JourneyCard({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const { canWrite } = useCompany()
  const stages = useStages()
  const journey = useJourney(v.id!)
  const stageName = useStageName()
  const [move, setMove] = useState<Stage | null>(null)
  const list = stages.data ?? []
  const current = list.find((s) => s.id === v.stage_id)
  const curPos = current?.position ?? 0
  const next = list.find((s) => s.position > curPos)
  const lastAt = new Map<string, string>()
  for (const e of journey.data ?? []) if (e.stage_id && !lastAt.has(e.stage_id)) lastAt.set(e.stage_id, e.event_at)
  return (
    <section className="card mt-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold">{t('journey.where')}</h2>
        {canWrite && next && (
          <Button variant="dark" onClick={() => setMove(next)} data-testid="next-stage">{t('journey.next', { stage: stageName(next) })}<ArrowRight className="flip-rtl" /></Button>
        )}
      </div>
      <ol className="mt-5 flex overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label={t('journey.track')}>
        {list.map((s, i) => {
          const done = s.position < curPos
          const here = s.id === v.stage_id
          const at = lastAt.get(s.id)
          const skipped = done && !at
          return (
            <li key={s.id} className="relative flex min-w-[96px] flex-1 flex-col items-center text-center">
              {i > 0 && <span className={cn('absolute top-[15px] end-1/2 h-0.5 w-full', s.position <= curPos ? 'bg-ok' : 'bg-line')} aria-hidden />}
              <button disabled={!canWrite || here} onClick={() => setMove(s)} data-stage={s.name_en}
                aria-label={here ? t('journey.isHere', { stage: stageName(s) }) : t('journey.moveTo', { stage: stageName(s) })}
                className={cn('relative z-[1] flex size-8 items-center justify-center rounded-full border-2 bg-surface transition-transform enabled:hover:scale-110',
                  done && !skipped ? 'border-ok bg-ok text-white' : skipped ? 'border-line bg-hover text-ink-3' : here ? 'border-[3px] shadow-[0_0_0_6px_color-mix(in_srgb,var(--stage)_15%,transparent)]' : 'border-line')}
                style={here ? ({ borderColor: s.color, '--stage': s.color } as React.CSSProperties) : undefined}>
                {done && !skipped && <Check className="size-4" strokeWidth={3} />}
                {skipped && <span className="h-0.5 w-2.5 rounded bg-ink-3" />}
              </button>
              <span className={cn('mt-2 px-1 text-[13.5px] font-semibold whitespace-nowrap', here ? '' : done ? 'text-ink' : 'text-ink-2')} style={here ? { color: s.color } : undefined}>{stageName(s)}</span>
              <span className="text-[12px] text-ink-3">{skipped ? t('journey.skipped') : at ? fmtDate(at).replace(/ \d{4}$/, '') : '—'}</span>
            </li>
          )
        })}
      </ol>
      {move && <MoveDialog v={v} to={move} current={current} onClose={() => setMove(null)} />}
    </section>
  )
}

function MoveDialog({ v, to, current, onClose }: { v: VehicleOverview; to: Stage; current?: Stage; onClose: () => void }) {
  const { t } = useTranslation(['cars', 'common'])
  const stageName = useStageName()
  const move = useMoveStage(v.id!)
  const [at, setAt] = useState(nowLocalInput())
  const [note, setNote] = useState('')
  const delivering = to.status === 'delivered'
  const [handover, setHandover] = useState(true)
  const back = current && to.position < current.position
  const needsDate = to.status === 'sold' || to.status === 'delivered'
  const go = () => move.mutate({ stageId: to.id, at: fromLocalInput(at) ?? new Date().toISOString(), note: note.trim() }, {
    onSuccess: async () => {
      if (delivering && handover) {
        const { error } = await supabase.rpc('check_handover', { p_vehicle_id: v.id! })
        if (error) toast.error(friendlyError(error))
      }
      toast.success(t('journey.moved', { stage: stageName(to) })); onClose()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Dialog open onClose={onClose} title={t('journey.moveTitle', { stage: stageName(to) })} size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={move.isPending} disabled={needsDate && !at} onClick={go} data-testid="confirm-move">{t('journey.moveConfirm', { stage: stageName(to) })}</Button>
      </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go() }}>
        {back && current && <p className="rounded-lg bg-warn/10 px-3 py-2 text-[13.5px] text-warn">{t('journey.backWarning', { from: stageName(current), to: stageName(to) })}</p>}
        {!back && current && to.position > current.position + 1 && <p className="rounded-lg bg-hover px-3 py-2 text-[13.5px] text-ink-2">{t('journey.skipNote')}</p>}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink-2">{needsDate ? t('journey.dateRequired', { stage: stageName(to) }) : t('journey.date')}</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required className="h-11 rounded-xl border border-line px-3 outline-none focus:border-ink" autoFocus />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink-2">{t('journey.note')} <span className="font-normal text-ink-3">({t('add.optional')})</span></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('journey.notePh')} className="h-11 rounded-xl border border-line px-3 outline-none focus:border-ink" />
        </label>
        {delivering && (
          <label className="flex items-start gap-2.5 rounded-xl bg-ok/[0.06] px-3 py-2.5 text-[14px]">
            <input type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} className="mt-0.5 size-4" data-testid="handover-check" />
            <span><b>{t('journey.handover')}</b><span className="block text-[13px] text-ink-2">{t('journey.handoverHint')}</span></span>
          </label>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
