// Add car: five short steps — chassis, car, arrival, photos, done. Specs come later, on the car page.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, ChevronLeft, ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { refreshCar } from '@/api/journey'
import { useUploadImages } from '@/api/records'
import { findByChassis } from '@/api/vehicles'
import { Button } from '@/components/ui/button'
import { Anim } from '@/components/v3/bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { fromLocalInput, nowLocalInput, parseAmount } from '@/lib/format'
import { friendlyError, supabase } from '@/lib/supabase'
import { normalizeChassis, VIN_LENGTH } from '@/lib/vin'

const STEPS = ['chassis', 'car', 'arrival', 'photos', 'done'] as const
type Step = (typeof STEPS)[number]

type Draft = {
  chassis: string
  brand: string
  model: string
  year: string
  trim: string
  color: string
  price: string
  arrivedAt: string
  location: string
  mileage: string
}

const thisYear = new Date().getFullYear()

export default function AddCar() {
  const { t } = useTranslation('cars')
  const [step, setStep] = useState<Step>('chassis')
  const [d, setD] = useState<Draft>(() => ({ chassis: '', brand: '', model: '', year: String(thisYear), trim: '', color: '', price: '', arrivedAt: nowLocalInput(), location: '', mileage: '' }))
  const [carId, setCarId] = useState<string | null>(null)
  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }))
  const i = STEPS.indexOf(step)
  const reset = () => { setD({ chassis: '', brand: '', model: '', year: String(thisYear), trim: '', color: '', price: '', arrivedAt: nowLocalInput(), location: '', mileage: '' }); setCarId(null); setStep('chassis') }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/vehicles" className="mb-5 inline-flex items-center gap-1.5 text-[14.5px] text-ink-2 hover:text-ink"><ChevronLeft className="size-4 flip-rtl" />{t('nav.cars')}</Link>
      <ol className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t('add.progress')}>
        {STEPS.map((s, n) => (
          <li key={s} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={s === step ? 'step' : undefined}>
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[12.5px] font-semibold transition-colors',
              n < i ? 'border-ok bg-ok text-white' : n === i ? 'border-accent text-accent' : 'border-line text-ink-3')}>
              {n < i ? <Check className="size-3.5" strokeWidth={3} /> : n + 1}
            </span>
            <span className={cn('text-[14px] whitespace-nowrap', n === i ? 'font-medium text-ink' : 'text-ink-3', n !== i && 'hidden sm:inline')}>{t(`add.step.${s}`)}</span>
            {n < STEPS.length - 1 && <span className={cn('h-0.5 min-w-4 flex-1 rounded-full', n < i ? 'bg-ok' : 'bg-line')} />}
          </li>
        ))}
      </ol>

      <div className="card p-6 sm:p-8">
        {step === 'chassis' && <ChassisStep value={d.chassis} onChange={set('chassis')} onNext={() => setStep('car')} />}
        {step === 'car' && <CarStep d={d} set={set} onBack={() => setStep('chassis')} onNext={() => setStep('arrival')} />}
        {step === 'arrival' && <ArrivalStep d={d} set={set} onBack={() => setStep('car')} onCreated={(id) => { setCarId(id); setStep('photos') }} />}
        {step === 'photos' && carId && <PhotosStep carId={carId} onDone={() => setStep('done')} />}
        {step === 'done' && carId && <DoneStep chassis={normalizeChassis(d.chassis)} carId={carId} onAnother={reset} />}
      </div>
    </div>
  )
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em]">{title}</h1>
      <p className="mt-1 text-[14.5px] text-ink-2">{sub}</p>
    </div>
  )
}

function Footer({ onBack, next, disabled, loading, form }: { onBack?: () => void; next: string; disabled?: boolean; loading?: boolean; form?: string }) {
  const { t } = useTranslation('cars')
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {onBack ? <Button variant="ghost" size="lg" onClick={onBack}><ArrowLeft className="flip-rtl" />{t('add.back')}</Button> : <span />}
      <Button variant="primary" size="lg" type="submit" form={form} disabled={disabled} loading={loading}>{next}</Button>
    </div>
  )
}

// 1. Chassis --------------------------------------------------------------------

function ChassisStep({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  const { t } = useTranslation('cars')
  const n = normalizeChassis(value)
  const [deferred, setDeferred] = useState(n)
  useEffect(() => { const h = window.setTimeout(() => setDeferred(n), 250); return () => window.clearTimeout(h) }, [n])
  const dup = useQuery({ queryKey: ['chassis-exists', deferred], enabled: deferred.length >= 5, queryFn: () => findByChassis(deferred) })
  const iqo = [...n].map((c, idx) => (/[IOQ]/.test(c) ? idx + 1 : 0)).filter(Boolean)
  const checking = deferred !== n || dup.isFetching
  const exists = !checking && dup.data
  const ok17 = n.length === VIN_LENGTH
  const canGo = n.length >= 5 && !checking && !exists
  return (
    <form id="chassis" onSubmit={(e) => { e.preventDefault(); if (canGo) onNext() }}>
      <Title title={t('add.chassisTitle')} sub={t('add.chassisSub')} />
      <label htmlFor="chassis-input" className="sr-only">{t('add.chassisLabel')}</label>
      <div className={cn('flex items-center gap-3 rounded-xl border-[1.5px] bg-surface px-4 transition-colors focus-within:border-ink',
        exists ? 'border-danger' : 'border-line')}>
        <input id="chassis-input" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
          placeholder="LVVDB21B9PD012345" maxLength={30} inputMode="text" dir="ltr"
          className="vin h-16 min-w-0 flex-1 bg-transparent text-[22px] font-bold tracking-[0.12em] outline-none placeholder:font-normal placeholder:text-ink-3/40 sm:text-[28px]" />
        <span className={cn('tnum shrink-0 text-[13px]', ok17 ? 'text-ok' : 'text-ink-3')}>{n.length} / {VIN_LENGTH}</span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px] sm:flex-row sm:flex-wrap sm:gap-x-5">
        {n.length > 0 && (
          <Check2 ok={ok17} warn={!ok17 && n.length >= 5}>{ok17 ? t('add.chk17') : t('add.chkLength', { count: n.length })}</Check2>
        )}
        {iqo.length > 0 && <Check2 ok={false} warn>{t('add.chkIOQ', { positions: iqo.join(', ') })}</Check2>}
        {n.length >= 5 && (checking ? <li className="text-ink-3">{t('add.chkChecking')}</li>
          : exists ? <li className="flex items-center gap-1.5 text-danger"><X className="size-4" />{t('add.chkExists')} <Link className="font-semibold underline" to={`/vehicles/${dup.data!.id}`}>{t('add.openIt')}</Link></li>
            : <Check2 ok>{t('add.chkNew')}</Check2>)}
      </ul>
      <Footer next={t('add.continue')} disabled={!canGo} form="chassis" />
    </form>
  )
}

function Check2({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5', ok ? 'text-ok' : warn ? 'text-warn' : 'text-ink-3')}>
      {ok ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}{children}
    </li>
  )
}

// 2. Car ------------------------------------------------------------------------

function useKnownBrands() {
  return useQuery({
    queryKey: ['known-brands'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('brand, model').not('brand', 'is', null).limit(1000)
      const brands = [...new Set((data ?? []).map((r) => r.brand!.trim()).filter(Boolean))].sort()
      const models = new Map<string, Set<string>>()
      for (const r of data ?? []) if (r.brand && r.model) models.set(r.brand.toLowerCase(), (models.get(r.brand.toLowerCase()) ?? new Set()).add(r.model))
      return { brands, models }
    },
  })
}

function Field({ label, optional, children, htmlFor }: { label: string; optional?: boolean; children: React.ReactNode; htmlFor: string }) {
  const { t } = useTranslation('cars')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13.5px] font-semibold text-ink-2">{label}{optional && <span className="font-normal text-ink-3"> ({t('add.optional')})</span>}</label>
      {children}
    </div>
  )
}
const INPUT = 'h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none transition-colors focus:border-ink placeholder:text-ink-3/70'

function CarStep({ d, set, onBack, onNext }: { d: Draft; set: (k: keyof Draft) => (v: string) => void; onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation('cars')
  const known = useKnownBrands()
  const models = useMemo(() => [...(known.data?.models.get(d.brand.trim().toLowerCase()) ?? [])], [known.data, d.brand])
  const priceOk = !d.price.trim() || parseAmount(d.price) !== null
  const ok = d.brand.trim() && d.model.trim() && d.year && priceOk
  return (
    <form id="car" onSubmit={(e) => { e.preventDefault(); if (ok) onNext() }}>
      <Title title={t('add.carTitle')} sub={t('add.carSub')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('add.brand')} htmlFor="brand">
          <input id="brand" className={INPUT} value={d.brand} onChange={(e) => set('brand')(e.target.value)} list="brands" autoFocus required placeholder="XPENG" />
          <datalist id="brands">{known.data?.brands.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label={t('add.model')} htmlFor="model">
          <input id="model" className={INPUT} value={d.model} onChange={(e) => set('model')(e.target.value)} list="models" required placeholder="G6" />
          <datalist id="models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label={t('add.year')} htmlFor="year">
          <select id="year" className={INPUT} value={d.year} onChange={(e) => set('year')(e.target.value)} required>
            {Array.from({ length: 12 }, (_, k) => thisYear + 1 - k).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label={t('add.trim')} optional htmlFor="trim">
          <input id="trim" className={INPUT} value={d.trim} onChange={(e) => set('trim')(e.target.value)} placeholder={t('add.trimPh')} />
        </Field>
        <Field label={t('add.color')} optional htmlFor="color">
          <input id="color" className={INPUT} value={d.color} onChange={(e) => set('color')(e.target.value)} placeholder={t('add.colorPh')} />
        </Field>
        <Field label={t('add.price')} optional htmlFor="price">
          <input id="price" className={cn(INPUT, !priceOk && 'border-danger')} value={d.price} onChange={(e) => set('price')(e.target.value)} inputMode="decimal" placeholder="AED" dir="ltr" />
        </Field>
      </div>
      <Footer onBack={onBack} next={t('add.continue')} disabled={!ok} form="car" />
    </form>
  )
}

// 3. Arrival (creates the car) ------------------------------------------------------

function ArrivalStep({ d, set, onBack, onCreated }: { d: Draft; set: (k: keyof Draft) => (v: string) => void; onBack: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation('cars')
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const kmOk = !d.mileage.trim() || /^\d{1,7}$/.test(d.mileage.replace(/[,\s]/g, ''))
  const save = async () => {
    setSaving(true)
    try {
      const { data, error } = await supabase.from('vehicles').insert({
        chassis_number: normalizeChassis(d.chassis),
        brand: d.brand.trim(), model: d.model.trim(), year: Number(d.year),
        trim_level: d.trim.trim() || null, exterior_color: d.color.trim() || null,
        listing_price: d.price.trim() ? Number(parseAmount(d.price)) : null,
        arrival_at: fromLocalInput(d.arrivedAt) ?? new Date().toISOString(),
        location: d.location.trim() || null,
        mileage_km: d.mileage.trim() ? Number(d.mileage.replace(/[,\s]/g, '')) : null,
      }).select('id').single()
      if (error) throw error
      refreshCar(qc, data.id)
      onCreated(data.id)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form id="arrival" onSubmit={(e) => { e.preventDefault(); if (kmOk) void save() }}>
      <Title title={t('add.arrivalTitle')} sub={t('add.arrivalSub')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('add.arrivedAt')} htmlFor="arrived">
          <input id="arrived" type="datetime-local" className={INPUT} value={d.arrivedAt} onChange={(e) => set('arrivedAt')(e.target.value)} required />
        </Field>
        <Field label={t('add.location')} optional htmlFor="location">
          <input id="location" className={INPUT} value={d.location} onChange={(e) => set('location')(e.target.value)} placeholder={t('add.locationPh')} list="locations" />
          <datalist id="locations">{['Showroom', 'Yard', 'Garage', 'Port'].map((l) => <option key={l} value={l} />)}</datalist>
        </Field>
        <Field label={t('add.mileage')} optional htmlFor="mileage">
          <input id="mileage" className={cn(INPUT, !kmOk && 'border-danger')} value={d.mileage} onChange={(e) => set('mileage')(e.target.value)} inputMode="numeric" placeholder="km" dir="ltr" />
        </Field>
      </div>
      <Footer onBack={onBack} next={t('add.saveCar')} disabled={!kmOk} loading={saving} form="arrival" />
    </form>
  )
}

// 4. Photos ---------------------------------------------------------------------

function PhotosStep({ carId, onDone }: { carId: string; onDone: () => void }) {
  const { t } = useTranslation('cars')
  const { company } = useCompany()
  const up = useUploadImages(company.id, carId)
  const [files, setFiles] = useState<File[]>([])
  const [done, setDone] = useState(0)
  const camera = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const add = (l: FileList | null) => l && setFiles((f) => [...f, ...[...l].filter((x) => x.type.startsWith('image/') || /\.(heic|heif)$/i.test(x.name))])
  const upload = () => up.mutate({ files, type: 'arrival', onProgress: setDone }, {
    onSuccess: onDone,
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div>
      <Title title={t('add.photosTitle')} sub={t('add.photosSub')} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} data-testid="camera-input" />
      <input ref={pick} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} data-testid="photo-input" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {urls.map((u, k) => (
          <div key={u} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-hover">
            <img src={u} alt={files[k].name} className="size-full object-cover" />
            {!up.isPending && (
              <button className="absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-white" aria-label={t('add.removePhoto', { name: files[k].name })}
                onClick={() => setFiles((f) => f.filter((_, j) => j !== k))}><X className="size-4" /></button>
            )}
          </div>
        ))}
        <button onClick={() => camera.current?.click()} className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line text-[13.5px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink">
          <Camera className="size-6" />{t('add.takePhoto')}
        </button>
        <button onClick={() => pick.current?.click()} className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line text-[13.5px] font-medium text-ink-2 hover:border-ink-3 hover:text-ink">
          <ImagePlus className="size-6" />{t('add.choosePhotos')}
        </button>
      </div>
      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" size="lg" onClick={onDone} disabled={up.isPending}>{t('add.skip')}</Button>
        <Button variant="primary" size="lg" disabled={!files.length} loading={up.isPending} onClick={upload}>
          {up.isPending ? t('add.uploading', { done: Math.min(done + 1, files.length), total: files.length }) : t('add.uploadPhotos', { count: files.length })}
        </Button>
      </div>
    </div>
  )
}

// 5. Done -----------------------------------------------------------------------

function DoneStep({ chassis, carId, onAnother }: { chassis: string; carId: string; onAnother: () => void }) {
  const { t } = useTranslation('cars')
  const nav = useNavigate()
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <Anim name="success" className="size-28" label={t('add.added')} />
      <h1 className="mt-2 text-[22px] font-bold">{t('add.added')}</h1>
      <p className="vin mt-1 text-[15px] font-semibold tracking-[0.08em] text-ink-2">{chassis}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onAnother}>{t('add.another')}</Button>
        <Button variant="primary" size="lg" onClick={() => nav(`/vehicles/${carId}`)} autoFocus>{t('add.openCar')}<ArrowRight className="flip-rtl" /></Button>
      </div>
    </div>
  )
}
