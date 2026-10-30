import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Download, Eye, FileText } from 'lucide-react'
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
      <PageHeader title="Documents" description="Every current document across all vehicles. Open a vehicle to upload or verify." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input defaultValue={term} onChange={(e) => set('q', e.target.value)} placeholder="Search file name" className="w-full sm:w-64" aria-label="Search file name" />
        <Select value={status} onChange={(e) => set('status', e.target.value)} className="w-auto" aria-label="Verification">
          <option value="all">Verified and unverified</option><option value="unverified">Awaiting verification</option><option value="verified">Verified</option>
        </Select>
        <Select value={type} onChange={(e) => set('type', e.target.value)} className="w-auto" aria-label="Type">
          <option value="all">All types</option>{Object.entries(DOCUMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorNote error={q.error} /> : !q.data!.length ? (
        <Panel><Empty icon={<FileText />} title="No documents found" /></Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line-soft text-[12.5px] text-ink-3">
              <th className="h-10 px-4 text-start font-medium">Document</th><th className="px-3 text-start font-medium">Vehicle</th>
              <th className="px-3 text-start font-medium">Uploaded</th><th className="px-3 text-start font-medium">Status</th><th />
            </tr></thead>
            <tbody>
              {q.data!.map((d) => (
                <tr key={d.id} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2.5"><p className="font-medium">{d.original_filename}</p><p className="text-[12.5px] text-ink-3">{DOCUMENT_LABEL[d.document_type]}</p></td>
                  <td className="px-3"><Link to={`/vehicles/${d.vehicles.id}?tab=documents`} className="hover:underline"><p>{vehicleTitle(d.vehicles)}</p><Chassis value={d.vehicles.chassis_number} className="text-[12.5px] text-ink-2" /></Link></td>
                  <td className="px-3 text-ink-2">{fmtDateTime(d.uploaded_at)}</td>
                  <td className="px-3">{d.verification_status === 'verified' ? <span className="flex items-center gap-1 text-ok"><BadgeCheck className="size-4" />Verified</span> : <Link to={`/vehicles/${d.vehicles.id}?tab=documents`} className="text-warn underline">Verify</Link>}</td>
                  <td className="px-3 text-end whitespace-nowrap">
                    <Button variant="ghost" size="icon-sm" aria-label="Open" onClick={() => openFile(d.storage_path)}><Eye /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => downloadFile(d.storage_path, d.original_filename)}><Download /></Button>
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
