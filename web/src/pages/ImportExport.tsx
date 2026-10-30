import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Panel, PanelHeader, Spinner } from '@/components/ui/misc'
import { Chassis } from '@/components/vehicle-bits'
import { useCompany } from '@/lib/auth'
import { buildRows, exportVehicles, guessMapping, IMPORT_FIELDS, readSheet, type ImportField, type Sheet } from '@/lib/excel'
import { fmtDateTime } from '@/lib/format'
import { STATUS_LABEL } from '@/lib/labels'
import { friendlyError, supabase } from '@/lib/supabase'
import type { VehicleOverview, VehicleStatus } from '@/lib/types'
import { normalizeChassis } from '@/lib/vin'

export default function ImportExport() {
  const { t } = useTranslation(['importer', 'common'])
  const { company, canWrite } = useCompany()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mapping, setMapping] = useState<Record<ImportField, number | null> | null>(null)
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  async function load(f: File) {
    setBusy(t('busy.reading'))
    try {
      const s = await readSheet(f)
      if (!s.headers.length) throw new Error(t('emptySheet'))
      const { data, error } = await supabase.from('vehicles').select('chassis_normalized')
      if (error) throw error
      setExisting(new Set(data.map((d) => d.chassis_normalized!)))
      setFile(f); setSheet(s); setMapping(guessMapping(s.headers))
    } catch (e) {
      toast.error(t('toast.readFailed', { name: f.name, error: (e as Error).message }))
    } finally { setBusy(null) }
  }
  // A spreadsheet dropped into the document import that turned out to be an inventory list.
  const routed = (useLocation().state as { file?: File } | null)?.file
  const [routedLoaded, setRoutedLoaded] = useState(false)
  if (routed && !routedLoaded) {
    setRoutedLoaded(true)
    queueMicrotask(() => load(routed))
  }


  const rows = useMemo(() => {
    if (!sheet || !mapping) return []
    return buildRows(sheet, mapping).map((r) => {
      const n = normalizeChassis(String(r.values.chassis_number ?? ''))
      return existing.has(n) ? { ...r, errors: [...r.errors, t('check.alreadyInSystem')] } : r
    })
  }, [sheet, mapping, existing, t])
  const ok = rows.filter((r) => !r.errors.length)
  const bad = rows.filter((r) => r.errors.length)

  async function runImport() {
    setBusy(t('busy.importing', { count: ok.length }))
    try {
      const { data, error } = await supabase.rpc('import_vehicles', { p_rows: ok.map((r) => r.values) })
      if (error) throw error
      toast.success(t('toast.imported', { count: data ?? 0 }))
      qc.invalidateQueries()
      nav('/vehicles?sort=created_at')
    } catch (e) {
      toast.error(friendlyError(e))
    } finally { setBusy(null) }
  }

  async function exportAll() {
    setBusy(t('busy.exporting'))
    try {
      const { data, error } = await supabase.from('vehicle_overview').select('*').order('created_at', { ascending: false }).limit(10000)
      if (error) throw error
      await exportVehicles(data as VehicleOverview[], company.currency)
      toast.success(t('toast.exported', { count: data.length }))
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title={t('title')} actions={<Button onClick={exportAll} disabled={!!busy}><Download />{t('exportAll')}</Button>} />

      {canWrite && (
        <Panel>
          <PanelHeader title={t('importTitle')} />
          <div className="p-4">
            {!sheet ? (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-10 text-center text-[13.5px] text-ink-2 hover:border-accent/60"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f) }}>
                {busy ? <Spinner /> : <FileSpreadsheet className="size-6 text-ink-3" />}
                <span className="text-ink">{t('drop')}</span>
                <span className="max-w-md text-ink-3">{t('dropHint')}</span>
                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
              </label>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                  <p><b className="font-medium" dir="auto">{file?.name}</b> <span className="text-ink-3">· {t('rows', { count: sheet.rows.length })}</span></p>
                  <Button variant="ghost" size="sm" onClick={() => { setSheet(null); setFile(null) }}>{t('chooseAnother')}</Button>
                </div>
                <div>
                  <h3 className="mb-2 text-[13.5px] font-medium">{t('stepMatch')}</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {IMPORT_FIELDS.map((f) => (
                      <label key={f.key} className="flex items-center justify-between gap-3 rounded-md border border-line-soft px-3 py-1.5 text-[13px]">
                        <span className={f.key === 'chassis_number' ? 'font-medium' : 'text-ink-2'}>{f.label}{f.key === 'chassis_number' && ' *'}</span>
                        <Select value={mapping![f.key] ?? ''} className="h-8 w-44" onChange={(e) => setMapping({ ...mapping!, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">{t('notInSheet')}</option>
                          {sheet.headers.map((h, i) => <option key={i} value={i}>{h || t('column', { n: i + 1 })}</option>)}
                        </Select>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-[13.5px] font-medium">{t('stepReview')}</h3>
                  <p className="mb-2 flex flex-wrap gap-4 text-[13px]">
                    <span className="flex items-center gap-1.5 text-ok"><CheckCircle2 className="size-4" />{t('ready', { count: ok.length })}</span>
                    {bad.length > 0 && <span className="flex items-center gap-1.5 text-danger"><AlertTriangle className="size-4" />{t('skipped', { count: bad.length })}</span>}
                  </p>
                  <div className="max-h-[420px] overflow-auto rounded-md border border-line-soft">
                    <table className="w-full text-[12.5px]">
                      <thead className="sticky top-0 bg-raised text-ink-3"><tr>
                        <th className="px-3 py-2 text-start font-medium">{t('table.row')}</th><th className="px-3 text-start font-medium">{t('table.chassis')}</th>
                        <th className="px-3 text-start font-medium">{t('table.vehicle')}</th><th className="px-3 text-start font-medium">{t('table.status')}</th>
                        <th className="px-3 text-start font-medium">{t('table.arrived')}</th><th className="px-3 text-start font-medium">{t('table.check')}</th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.line} className={`border-t border-line-soft ${r.errors.length ? 'bg-danger/5' : ''}`}>
                            <td className="tnum px-3 py-1.5 text-ink-3">{r.line}</td>
                            <td className="px-3">{r.values.chassis_number ? <Chassis value={String(r.values.chassis_number)} /> : '—'}</td>
                            <td className="px-3">{[r.values.brand, r.values.model, r.values.year].filter(Boolean).join(' ') || '—'}</td>
                            <td className="px-3">{STATUS_LABEL[(r.values.status as VehicleStatus) ?? 'in_stock']}</td>
                            <td className="px-3 whitespace-nowrap">{r.values.arrival_at ? fmtDateTime(String(r.values.arrival_at)) : '—'}</td>
                            <td className="px-3">
                              {r.errors.map((e) => <p key={e} className="text-danger">{e}</p>)}
                              {r.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  {busy && <span className="text-[13px] text-ink-2">{busy}</span>}
                  <p className="me-auto text-[12.5px] text-ink-3">{t('unverifiedNote')}</p>
                  <Button variant="primary" size="lg" disabled={!ok.length || mapping?.chassis_number === null} loading={!!busy} onClick={runImport}><Upload />{t('importButton', { count: ok.length })}</Button>
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  )
}
