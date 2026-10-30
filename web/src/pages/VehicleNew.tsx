import { zodResolver } from '@hookform/resolvers/zod'
import { lazy, Suspense, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileStack, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateVehicle } from '@/api/vehicles'
import { ChassisInput, useChassisBlocked } from '@/components/ChassisInput'
import { PhotoPicker } from '@/components/PhotoPicker'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { PageLoader, Panel } from '@/components/ui/misc'
import { cn } from '@/lib/cn'

const ImportFiles = lazy(() => import('@/pages/import/ImportFiles'))
import { fromForm, VehicleFields, vehicleSchema, type VehicleForm } from '@/components/VehicleFields'
import { useCompany } from '@/lib/auth'
import { nowLocalInput } from '@/lib/format'
import { ITEM_STATUS_LABEL } from '@/lib/labels'
import { uploadImage } from '@/lib/files'
import { friendlyError, supabase } from '@/lib/supabase'
import type { ItemStatus } from '@/lib/types'

type Kit = { physical: string; smart: string; nfc: string; charger: ItemStatus | ''; chargerType: string }

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="mb-5 flex gap-3">
        <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-[12px] text-ink-2">{n}</span>
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-ink-2">{hint}</p>}
        </div>
      </div>
      {children}
    </Panel>
  )
}

/** Manual entry: the chassis number is the only required field. */
export function ManualVehicleForm() {
  const { t } = useTranslation(['add', 'common'])
  const { company } = useCompany()
  const nav = useNavigate()
  const create = useCreateVehicle()
  const [chassis, setChassis] = useState('')
  const [verified, setVerified] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [card, setCard] = useState<File[]>([])
  const [kit, setKit] = useState<Kit>({ physical: '', smart: '', nfc: '', charger: '', chargerType: '' })
  const [saving, setSaving] = useState<string | null>(null)
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema), defaultValues: { arrival_at: nowLocalInput() } })
  const blocked = useChassisBlocked(chassis)

  async function save(values: VehicleForm) {
    if (!chassis || blocked) return
    setSaving(t('progress.vehicle'))
    try {
      const v = await create.mutateAsync({ ...fromForm(values), chassis_number: chassis.trim(), chassis_verified: verified })
      const problems: string[] = []
      // Follow-up uploads. A failure here never loses the vehicle record.
      for (const [i, f] of photos.entries()) {
        setSaving(t('progress.photo', { n: i + 1, total: photos.length }))
        try {
          const up = await uploadImage(company.id, v.id, 'photos', f)
          const { error } = await supabase.from('vehicle_images').insert({ vehicle_id: v.id, image_type: 'arrival', ...up })
          if (error) throw error
        } catch (e) { problems.push(`${f.name}: ${friendlyError(e)}`) }
      }
      if (card[0]) {
        setSaving(t('progress.card'))
        try {
          const up = await uploadImage(company.id, v.id, 'card', card[0])
          const { error } = await supabase.rpc('set_information_card', {
            p_vehicle_id: v.id, p_storage_path: up.storage_path, p_thumbnail_path: up.thumbnail_path ?? undefined,
            p_original_filename: up.original_filename, p_mime_type: up.mime_type, p_file_size: up.file_size,
          })
          if (error) throw error
        } catch (e) { problems.push(t('problems.card', { error: friendlyError(e) })) }
      }
      const items: { item_type: 'physical_key' | 'smart_key' | 'nfc_card' | 'charger'; item_name: string; status: ItemStatus; notes?: string }[] = []
      const many = (n: string, type: 'physical_key' | 'smart_key' | 'nfc_card', name: string) => {
        for (let i = 1; i <= Math.min(Number(n) || 0, 10); i++) items.push({ item_type: type, item_name: `${name} ${i}`, status: 'present' })
      }
      many(kit.physical, 'physical_key', t('common:accessoryType.physical_key'))
      many(kit.smart, 'smart_key', t('common:accessoryType.smart_key'))
      many(kit.nfc, 'nfc_card', t('common:accessoryType.nfc_card'))
      if (kit.charger) items.push({ item_type: 'charger', item_name: kit.chargerType.trim() ? t('kit.chargerNamed', { type: kit.chargerType.trim() }) : t('common:accessoryType.charger'), status: kit.charger })
      if (items.length) {
        const { error } = await supabase.from('accessories').insert(items.map((i) => ({ ...i, vehicle_id: v.id })))
        if (error) problems.push(t('problems.accessories', { error: friendlyError(error) }))
      }
      if (problems.length) toast.warning(t('toast.partial'), { description: problems.join('\n'), duration: 12000 })
      else toast.success(t('toast.added'))
      nav(`/vehicles/${v.id}`)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(save)} className="mx-auto max-w-4xl space-y-4 pb-24">
      <p className="text-[13.5px] text-ink-2">{t('intro')}</p>

      <Section n={1} title={t('sections.chassis')} hint={t('sections.chassisHint')}>
        <ChassisInput value={chassis} onChange={(v) => { setChassis(v); setVerified(false) }} autoFocus />
        {chassis && !blocked && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 size-4" />
            <span>{t('verifiedCheck')}</span>
          </label>
        )}
      </Section>

      <Section n={2} title={t('sections.details')}>
        <VehicleFields form={form} />
      </Section>

      <Section n={3} title={t('sections.kit')} hint={t('sections.kitHint')}>
        <div className="grid gap-4 sm:grid-cols-3">
          {(['physical', 'smart', 'nfc'] as const).map((k) => (
            <Field key={k} label={t(`kit.${k}`)}>
              {(id) => <Input id={id} type="number" min={0} max={10} inputMode="numeric" dir="ltr" value={kit[k]} onChange={(e) => setKit({ ...kit, [k]: e.target.value })} placeholder="0" />}
            </Field>
          ))}
          <Field label={t('kit.charger')}>
            {(id) => (
              <Select id={id} value={kit.charger} onChange={(e) => setKit({ ...kit, charger: e.target.value as ItemStatus | '' })}>
                <option value="">{t('kit.notApplicable')}</option>
                {(['present', 'missing', 'unknown'] as const).map((s) => <option key={s} value={s}>{ITEM_STATUS_LABEL[s]}</option>)}
              </Select>
            )}
          </Field>
          {kit.charger && (
            <Field label={t('kit.chargerType')} className="sm:col-span-2">
              {(id) => <Input id={id} value={kit.chargerType} onChange={(e) => setKit({ ...kit, chargerType: e.target.value })} placeholder={t('kit.chargerTypePlaceholder')} />}
            </Field>
          )}
        </div>
      </Section>

      <Section n={4} title={t('sections.photos')} hint={t('sections.photosHint')}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">{t('arrivalPhotos')}</p>
            <PhotoPicker files={photos} onChange={setPhotos} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">{t('informationCard')}</p>
            <PhotoPicker files={card} onChange={setCard} multiple={false} label={t('photosPicker.addCard')} />
          </div>
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line-soft bg-bg/95 backdrop-blur lg:start-64">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3 px-4 py-3 sm:px-6">
          {saving && <span className="me-auto text-[13px] text-ink-2">{saving}</span>}
          <Button variant="ghost" onClick={() => nav(-1)} disabled={!!saving}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="primary" size="lg" loading={!!saving} disabled={!chassis || blocked}>{t('save')}</Button>
        </div>
      </div>
    </form>
  )
}

/** "Add vehicle": read it from the car's documents, or type it in. */
export function VehicleNew() {
  const { t } = useTranslation('add')
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'documents' ? 'documents' : 'manual'
  const options = [
    { value: 'manual', icon: Keyboard, title: t('mode.manual'), hint: t('mode.manualHint') },
    { value: 'documents', icon: FileStack, title: t('mode.documents'), hint: t('mode.documentsHint') },
  ] as const
  return (
    <>
      <h1 className="mb-4 text-[24px] font-semibold">{t('title')}</h1>
      <div role="tablist" aria-label={t('title')} className="mb-6 grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button key={o.value} role="tab" aria-selected={mode === o.value}
            onClick={() => setParams(o.value === 'documents' ? { mode: 'documents' } : {}, { replace: true })}
            className={cn('flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 text-start transition-colors',
              mode === o.value ? 'border-accent ring-1 ring-accent' : 'border-line-soft hover:border-line')}>
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', mode === o.value ? 'bg-accent text-accent-ink' : 'bg-raised text-ink-2')}>
              <o.icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-[15px] font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-[13px] text-ink-2">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {mode === 'manual' ? <ManualVehicleForm /> : (
        <Suspense fallback={<PageLoader />}><ImportFiles embedded /></Suspense>
      )}
    </>
  )
}
