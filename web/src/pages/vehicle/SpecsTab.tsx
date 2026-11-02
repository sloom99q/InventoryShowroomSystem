// Specifications tab: the same compact table as "Fill specs", read-only, with one
// button to open the Fill specs page. Facts that match no field stay here.
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { type SpecRow, useFieldWriter, useVehicleData } from '@/api/fields'
import { SpecTable } from '@/components/specs/SpecTable'
import { Button, buttonVariants } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { FIELDS, labelFor, STORED_FIELDS } from '@/lib/fields'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'

type OtherRow = SpecRow & { documents?: { original_filename: string } | null }

function OtherInfo({ rows, vehicleId, canWrite }: { rows: OtherRow[]; vehicleId: string; canWrite: boolean }) {
  const { t } = useTranslation('vehicle')
  const w = useFieldWriter(vehicleId)
  const err = (e: unknown) => toast.error(friendlyError(e))
  const targets = [
    ...FIELDS.sections.flatMap((s) => [
      ...(s.fields ?? []).map((f) => ({ key: f.key, label: `${s.title_en} · ${f.label_en}` })),
      ...(s.list ? [{ key: s.list, label: `${s.title_en} (list)` }] : []),
    ]),
    ...STORED_FIELDS.filter((f) => !FIELDS.sections.some((s) => s.fields?.some((x) => x.key === f.key))).map((f) => ({ key: f.key, label: f.label_en })),
    { key: 'key_features', label: FIELDS.key_features.label_en },
  ]
  return (
    <details className="rounded-lg border border-dashed border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-[13.5px] text-ink-2">{t('fields.other', { count: rows.length })}</summary>
      <p className="border-t border-line-soft px-4 py-2 text-[12.5px] text-ink-3">{t('fields.otherHint')}</p>
      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[13px]">
            <div className="min-w-0 basis-48">
              <p className="text-ink-2" dir="auto">{r.section && r.section !== r.label ? `${r.section} · ` : ''}{r.label}</p>
              {r.label_alt && <p className="text-left text-[12px] text-ink-3 rtl:text-right" dir="rtl" lang="ar">{r.label_alt}</p>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium" dir="auto">{[r.value_en, r.unit].filter(Boolean).join(' ')}</p>
              {r.value_ar && <p className="text-ink-2" dir="rtl" lang="ar">{r.value_ar}</p>}
              {r.documents?.original_filename && <p className="text-[11.5px] text-ink-3" dir="auto">{t('fields.source', { name: r.documents.original_filename })}{r.source_page ? ` · p. ${r.source_page}` : ''}</p>}
            </div>
            {canWrite && (
              <div className="flex items-center gap-1.5">
                <Select className="h-8 w-56 text-[12.5px]" value="" aria-label={t('fields.assignTo')}
                  onChange={(e) => {
                    const key = e.target.value
                    if (!key) return
                    w.assignOther.mutate({ row: r, key }, { onSuccess: () => toast.success(t('fields.assigned', { label: labelFor(key) })), onError: err })
                  }}>
                  <option value="">{t('fields.assignTo')}</option>
                  {targets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </Select>
                <Button variant="ghost" size="icon-sm" onClick={() => w.removeRow.mutate(r.id, { onError: err })} aria-label={t('fields.deleteOther', { label: r.label })}><Trash2 /></Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function SpecsTab({ vehicle }: { vehicle: VehicleOverview }) {
  const { t } = useTranslation('vehicle')
  const { canWrite } = useCompany()
  const q = useVehicleData(vehicle.id!)
  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="flex justify-end">
          <Link to={`/vehicles/${vehicle.id}/specs`} className={buttonVariants({ variant: 'primary' })}><Pencil />{t('fill.open')}</Link>
        </div>
      )}
      <SpecTable vehicle={vehicle} data={q.data} mode="read" />
      {q.data.other.length > 0 && <OtherInfo rows={q.data.other as OtherRow[]} vehicleId={vehicle.id!} canWrite={canWrite} />}
    </div>
  )
}
