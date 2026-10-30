import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useCreateVehicle } from '@/api/vehicles'
import { ChassisInput, useChassisBlocked } from '@/components/ChassisInput'
import { PdfReader, type PdfReadResult } from '@/components/PdfReader'
import { PhotoPicker } from '@/components/PhotoPicker'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Panel } from '@/components/ui/misc'
import { fromForm, VehicleFields, vehicleSchema, type VehicleForm } from '@/components/VehicleFields'
import { useCompany } from '@/lib/auth'
import { nowLocalInput } from '@/lib/format'
import { ITEM_STATUS_LABEL } from '@/lib/labels'
import { objectPath, uploadImage, uploadObject, validateFile } from '@/lib/files'
import { friendlyError, supabase } from '@/lib/supabase'
import type { ItemStatus } from '@/lib/types'
import { checkChassis } from '@/lib/vin'

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

export function VehicleNew() {
  const { t } = useTranslation(['add', 'common', 'docimport'])
  const { company } = useCompany()
  const nav = useNavigate()
  const create = useCreateVehicle()
  const [chassis, setChassis] = useState('')
  const [verified, setVerified] = useState(false)
  const [pdf, setPdf] = useState<PdfReadResult | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [card, setCard] = useState<File[]>([])
  const [kit, setKit] = useState<Kit>({ physical: '', smart: '', nfc: '', charger: '', chargerType: '' })
  const [saving, setSaving] = useState<string | null>(null)
  const form = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema), defaultValues: { arrival_at: nowLocalInput() } })
  const blocked = useChassisBlocked(chassis)
  const check = checkChassis(chassis)

  function onPdfRead(r: PdfReadResult | null) {
    setPdf(r)
    if (!r) return
    for (const [k, v] of Object.entries(r.fields)) {
      const key = k as keyof VehicleForm
      if (!form.getValues(key)) form.setValue(key, v, { shouldDirty: true })
    }
  }

  async function save(values: VehicleForm) {
    if (!chassis || blocked) return
    setSaving(t('progress.vehicle'))
    try {
      const v = await create.mutateAsync({ ...fromForm(values), chassis_number: chassis.trim(), chassis_verified: verified })
      const problems: string[] = []
      // Follow-up uploads. A failure here never loses the vehicle record.
      if (pdf) {
        setSaving(t('progress.document'))
        try {
          const s = await validateFile(pdf.file, 'pdf_or_image')
          const path = objectPath(company.id, v.id, 'documents', s.ext)
          await uploadObject(path, pdf.file, s.mime)
          const { error } = await supabase.from('documents').insert({
            vehicle_id: v.id, document_type: 'vehicle_pdf', original_filename: pdf.file.name, storage_path: path,
            mime_type: s.mime, file_size: pdf.file.size, extracted_text: pdf.text,
            verification_status: verified ? 'verified' : 'unverified',
          })
          if (error) throw error
        } catch (e) { problems.push(t('problems.document', { error: friendlyError(e) })) }
      }
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
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{t('title')}</h1>
          <p className="mt-1 text-[13.5px] text-ink-2">{t('intro')}</p>
        </div>
        <Link to="/vehicles/import" className={buttonVariants()}>{t('docimport:fromFiles')}</Link>
      </div>

      <Section n={1} title={t('sections.chassis')} hint={t('sections.chassisHint')}>
        <ChassisInput value={chassis} onChange={(v) => { setChassis(v); setVerified(false) }} autoFocus />
        <div className="mt-4">
          <PdfReader onRead={onPdfRead} picked={check.normalized} onPick={(c) => { setChassis(c.value); setVerified(false) }} />
        </div>
        {chassis && !blocked && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 size-4" />
            <span>{pdf ? t('verifiedCheckShown') : t('verifiedCheck')}</span>
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
