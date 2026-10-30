import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Field, Input, Textarea } from './ui/form'
import { fromLocalInput, parseAmount, toLocalInput } from '@/lib/format'
import type { Vehicle, VehicleInsert } from '@/lib/types'

const optText = z.string().trim().max(120).optional()
// Messages are looked up at validation time so they follow the current language.
const optInt = (min: number, max: number, key: 'year' | 'mileage') =>
  z.string().trim().optional().refine((v) => !v || (/^\d+$/.test(v.replace(/[,\s]/g, '')) && +v.replace(/[,\s]/g, '') >= min && +v.replace(/[,\s]/g, '') <= max), { error: () => i18n.t(`add:validation.${key}`) })
const optMoney = z.string().trim().optional().refine((v) => !v || parseAmount(v) !== null, { error: () => i18n.t('add:validation.money') })

export const vehicleSchema = z.object({
  brand: optText,
  model: optText,
  year: optInt(1900, 2100, 'year'),
  trim_level: optText,
  exterior_color: optText,
  interior_color: optText,
  mileage_km: optInt(0, 5_000_000, 'mileage'),
  location: optText,
  arrival_at: z.string().optional(),
  acquisition_price: optMoney,
  sale_price: optMoney,
  notes: z.string().max(4000).optional(),
})
export type VehicleForm = z.infer<typeof vehicleSchema>

export function toForm(v: Partial<Vehicle>): VehicleForm {
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  return {
    brand: s(v.brand), model: s(v.model), year: s(v.year), trim_level: s(v.trim_level),
    exterior_color: s(v.exterior_color), interior_color: s(v.interior_color), mileage_km: s(v.mileage_km),
    location: s(v.location), arrival_at: toLocalInput(v.arrival_at), acquisition_price: s(v.acquisition_price),
    sale_price: s(v.sale_price), notes: s(v.notes),
  }
}

export function fromForm(f: VehicleForm): Partial<VehicleInsert> {
  const t = (x?: string) => (x?.trim() ? x.trim() : null)
  const n = (x?: string) => (x?.trim() ? Number(x.replace(/[,\s]/g, '')) : null)
  const m = (x?: string) => (x?.trim() ? (parseAmount(x) as unknown as number) : null)
  return {
    brand: t(f.brand), model: t(f.model), year: n(f.year), trim_level: t(f.trim_level),
    exterior_color: t(f.exterior_color), interior_color: t(f.interior_color), mileage_km: n(f.mileage_km),
    location: t(f.location), arrival_at: f.arrival_at ? fromLocalInput(f.arrival_at) : null,
    acquisition_price: m(f.acquisition_price), sale_price: m(f.sale_price), notes: t(f.notes),
  }
}

export function VehicleFields({ form, showPrices = true }: { form: UseFormReturn<VehicleForm>; showPrices?: boolean }) {
  const { t } = useTranslation(['add', 'common'])
  const { register, formState: { errors } } = form
  const f = (name: keyof VehicleForm, label: string, props: React.ComponentProps<'input'> = {}) => (
    <Field label={label} error={errors[name]?.message}>
      {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors[name]} {...register(name)} {...props} />}
    </Field>
  )
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {f('brand', t('fields.brand'), { placeholder: t('fields.brandPlaceholder'), autoComplete: 'off' })}
      {f('model', t('fields.model'), { placeholder: t('fields.modelPlaceholder'), autoComplete: 'off' })}
      {f('year', t('fields.year'), { inputMode: 'numeric', placeholder: '2025', maxLength: 4, dir: 'ltr' })}
      {f('trim_level', t('fields.trim'), { autoComplete: 'off' })}
      {f('exterior_color', t('fields.exteriorColor'), { autoComplete: 'off' })}
      {f('interior_color', t('fields.interiorColor'), { autoComplete: 'off' })}
      {f('mileage_km', t('fields.mileage'), { inputMode: 'numeric', dir: 'ltr' })}
      {f('location', t('fields.location'), { placeholder: t('fields.locationPlaceholder'), autoComplete: 'off' })}
      <Field label={t('fields.arrival')} hint={t('common:terms.uaeTime')} error={errors.arrival_at?.message}>
        {(id, d) => <Input id={id} type="datetime-local" aria-describedby={d} {...register('arrival_at')} />}
      </Field>
      {showPrices && (
        <>
          {f('acquisition_price', t('fields.purchasePrice'), { inputMode: 'decimal', placeholder: 'AED', dir: 'ltr' })}
          {f('sale_price', t('fields.salePrice'), { inputMode: 'decimal', placeholder: 'AED', dir: 'ltr' })}
        </>
      )}
      <Field label={t('fields.notes')} className="sm:col-span-2">
        {(id) => <Textarea id={id} rows={3} {...register('notes')} />}
      </Field>
    </div>
  )
}
