import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Download, Eye, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel } from '@/components/ui/misc'
import { Chassis, vehicleTitle } from '@/components/vehicle-bits'
import { downloadFile, openFile } from '@/lib/files'
import { fmtDateTime } from '@/lib/format'
import { DOCUMENT_LABEL } from '@/lib/labels'
import { supabase } from '@/lib/supabase'

export default function Documents() {
  const { t } = useTranslation(['pages', 'common'])
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const type = params.get('type') ?? 'all'
  const term = params.get('q') ?? ''
  const q = useQuery({
    queryKey: ['all-documents', status, type, term],
    queryFn: async () => {
      let r = supabase.from('documents').select('*, vehicles!inner(id, chassis_number, chassis_normalized, brand, model, year)')
        .is('deleted_at', null).is('superseded_at', null).order('uploaded_at', { ascending: false }).limit(300)
      if (status !== 'all') r = r.eq('verification_status', status as 'verified')
      if (type !== 'all') r = r.eq('document_type', type as 'other')
      if (term.trim()) r = r.ilike('original_filename', `%${term.replace(/[%,()]/g, '')}%`)
      const { data, error } = await r
      if (error) throw error
      return data
    },
  })
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v === 'all' || !v) n.delete(k); else n.set(k, v); setParams(n, { replace: true }) }
  return (
    <>
      <PageHeader title={t('documents.title')} description={t('documents.description')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input defaultValue={term} onChange={(e) => set('q', e.target.value)} placeholder={t('documents.searchPlaceholder')} className="w-full sm:w-64" aria-label={t('documents.searchPlaceholder')} />
        <Select value={status} onChange={(e) => set('status', e.target.value)} className="w-auto" aria-label={t('documents.verification')}>
          <option value="all">{t('documents.bothStatuses')}</option><option value="unverified">{t('documents.awaiting')}</option><option value="verified">{t('documents.verified')}</option>
        </Select>
        <Select value={type} onChange={(e) => set('type', e.target.value)} className="w-auto" aria-label={t('documents.type')}>
          <option value="all">{t('documents.allTypes')}</option>{Object.entries(DOCUMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorNote error={q.error} /> : !q.data!.length ? (
        <Panel><Empty icon={<FileText />} title={t('documents.empty')} /></Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line-soft text-[12.5px] text-ink-3">
              <th className="h-10 px-4 text-start font-medium">{t('documents.col.document')}</th><th className="px-3 text-start font-medium">{t('documents.col.vehicle')}</th>
              <th className="px-3 text-start font-medium">{t('documents.col.uploaded')}</th><th className="px-3 text-start font-medium">{t('documents.col.status')}</th><th />
            </tr></thead>
            <tbody>
              {q.data!.map((d) => (
                <tr key={d.id} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2.5"><p className="font-medium">{d.original_filename}</p><p className="text-[12.5px] text-ink-3">{DOCUMENT_LABEL[d.document_type]}</p></td>
                  <td className="px-3"><Link to={`/vehicles/${d.vehicles.id}?tab=documents`} className="hover:underline"><p>{vehicleTitle(d.vehicles)}</p><Chassis value={d.vehicles.chassis_number} className="text-[12.5px] text-ink-2" /></Link></td>
                  <td className="px-3 text-ink-2">{fmtDateTime(d.uploaded_at)}</td>
                  <td className="px-3">{d.verification_status === 'verified' ? <span className="flex items-center gap-1 text-ok"><BadgeCheck className="size-4" />{t('documents.verified')}</span> : <Link to={`/vehicles/${d.vehicles.id}?tab=documents`} className="text-warn underline">{t('documents.verify')}</Link>}</td>
                  <td className="px-3 text-end whitespace-nowrap">
                    <Button variant="ghost" size="icon-sm" aria-label={t('common:actions.open')} onClick={() => openFile(d.storage_path)}><Eye /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t('common:actions.download')} onClick={() => downloadFile(d.storage_path, d.original_filename)}><Download /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
