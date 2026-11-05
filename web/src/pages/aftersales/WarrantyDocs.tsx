// Warranty certificates and terms (PDF) of one car: upload, versions, preview, download,
// and "Send to customer". WhatsApp links can't carry files, so:
//   - phones: the share sheet sends the real PDF into WhatsApp (Web Share API)
//   - otherwise: the PDF downloads and WhatsApp opens with a ready message to attach it to
// Every send is logged on the car.
import { useQuery } from '@tanstack/react-query'
import { Download, Eye, FileText, History, RefreshCw, Send, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { type Customer, useAftersalesRole, useLogMessage } from '@/api/aftersales'
import { useDocuments, useUploadDocument } from '@/api/records'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { downloadFile, openFile, signedUrl } from '@/lib/files'
import { fmtDate } from '@/lib/format'
import { friendlyError } from '@/lib/supabase'
import type { VehicleOverview } from '@/lib/types'
import { waLink } from '@/lib/whatsapp'

type Doc = NonNullable<ReturnType<typeof useDocuments>['data']>[number]
const KINDS = ['warranty_certificate', 'warranty_terms'] as const

/** Can this browser hand a file to the share sheet (and so to WhatsApp)? Needs https or localhost. */
function canShareFiles() {
  try {
    const probe = new File(['x'], 'x.pdf', { type: 'application/pdf' })
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
  } catch { return false }
}

export function sendText(lang: 'ar' | 'en', firstName: string, car: string, company: string) {
  return lang === 'ar'
    ? `مرحباً ${firstName}،\nمرفق شهادة ضمان سيارتكم ${car}.\nيسعدنا خدمتكم دائماً.\n${company}`
    : `Hello ${firstName},\nYour warranty certificate for your ${car} is attached.\nWe're always happy to help.\n${company}`
}

export function WarrantyDocs({ v, customer }: { v: VehicleOverview; customer: Customer | null }) {
  const { t } = useTranslation('aftersales')
  const role = useAftersalesRole()
  const { company, canWrite } = useCompany()
  const docs = useDocuments(v.id!)
  const up = useUploadDocument(company.id, v.id!)
  const log = useLogMessage(v.id!)
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ kind: (typeof KINDS)[number]; replaces?: string } | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const all = (docs.data ?? []).filter((d) => (KINDS as readonly string[]).includes(d.document_type))
  const current = all.filter((d) => !d.superseded_at)
  const versions = (d: Doc) => all.filter((x) => x.group_id === d.group_id).sort((a, b) => b.version - a.version)

  const pick = (kind: (typeof KINDS)[number], replaces?: string) => { setPending({ kind, replaces }); input.current?.click() }
  const upload = (f: File | undefined) => {
    if (!f || !pending) return
    up.mutate({ file: f, type: pending.kind, replaces: pending.replaces }, {
      onSuccess: () => toast.success(pending.replaces ? t('docs.replaced') : t('docs.uploaded')),
      onError: (e) => toast.error(friendlyError(e)),
    })
  }

  const send = async (d: Doc) => {
    if (!customer?.phone) { toast.error(t('wa.noPhone')); return }
    const lang = customer.language === 'en' ? 'en' : 'ar'
    const text = sendText(lang, customer.full_name.split(' ')[0], [v.brand, v.model].filter(Boolean).join(' '), company.name)
    try {
      if (canShareFiles()) {
        const blob = await (await fetch(await signedUrl(d.storage_path))).blob()
        const file = new File([blob], d.original_filename, { type: d.mime_type })
        await navigator.share({ files: [file], text })
      } else {
        await downloadFile(d.storage_path, d.original_filename)
        window.open(waLink(customer.phone, text), '_blank', 'noopener')
        toast.info(t('docs.attachHint'))
      }
      log.mutate({ customerId: customer.id, kind: 'warranty', text: `${text}\n[${d.original_filename}]`, phone: customer.phone })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(friendlyError(e))
    }
  }

  return (
    <section className="card overflow-hidden" data-testid="warranty-docs">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h3 className="text-[16px] font-semibold">{t('docs.title')}</h3>
          <p className="text-[13.5px] text-ink-2">{t('docs.hint')}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => <Button key={k} size="sm" onClick={() => pick(k)} loading={up.isPending && pending?.kind === k && !pending.replaces}><Upload />{t(`docs.upload.${k}`)}</Button>)}
          </div>
        )}
        <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" data-testid="warranty-upload"
          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
      </header>
      {current.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-hover text-ink-3"><FileText className="size-6" /></span>
          <p className="font-semibold">{t('docs.emptyTitle')}</p>
          <p className="mt-1 max-w-md text-[14px] text-ink-2">{t('docs.emptyBody')}</p>
          {canWrite && <Button className="mt-4" variant="primary" onClick={() => pick('warranty_certificate')}><Upload />{t('docs.upload.warranty_certificate')}</Button>}
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {current.map((d) => (
            <li key={d.id} className="px-5 py-4" data-warranty-doc={d.document_type}>
              <div className="flex flex-wrap items-center gap-4">
                <PdfThumb doc={d} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t(`docs.kind.${d.document_type as 'warranty_terms'}`)}</p>
                  <p className="truncate text-[13.5px] text-ink-3">{d.original_filename} · {t('docs.version', { n: d.version })} · {fmtDate(d.uploaded_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <IconBtn label={t('docs.preview')} onClick={() => openFile(d.storage_path)}><Eye /></IconBtn>
                  <IconBtn label={t('docs.download')} onClick={() => downloadFile(d.storage_path, d.original_filename)}><Download /></IconBtn>
                  {versions(d).length > 1 && <IconBtn label={t('docs.history')} onClick={() => setHistory(history === d.id ? null : d.id)}><History /></IconBtn>}
                  {canWrite && <IconBtn label={t('docs.replace')} onClick={() => pick(d.document_type as (typeof KINDS)[number], d.id)}><RefreshCw /></IconBtn>}
                  {role.manager && (
                    <button onClick={() => send(d)} data-testid="send-warranty"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1fa855] px-3 text-[13.5px] font-semibold text-white hover:bg-[#1a9049]">
                      <Send className="size-4" />{t('docs.send')}
                    </button>
                  )}
                </div>
              </div>
              {history === d.id && (
                <ol className="ms-[76px] mt-3 space-y-1 border-s-2 border-line-soft ps-3 text-[13.5px]" data-testid="doc-history">
                  {versions(d).map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center gap-2">
                      <span className={cn('font-semibold', !x.superseded_at && 'text-ok')}>{t('docs.version', { n: x.version })}</span>
                      <span className="text-ink-3">{x.original_filename} · {fmtDate(x.uploaded_at)}</span>
                      <button className="text-info hover:underline" onClick={() => downloadFile(x.storage_path, x.original_filename)}>{t('docs.download')}</button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-label={label} title={label} className="flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-hover [&_svg]:size-4">{children}</button>
}

/** First page of the PDF as a small preview. */
function PdfThumb({ doc }: { doc: Doc }) {
  const q = useQuery({
    queryKey: ['pdf-thumb', doc.storage_path],
    staleTime: Infinity,
    enabled: doc.mime_type === 'application/pdf',
    queryFn: async () => {
      const buf = await (await fetch(await signedUrl(doc.storage_path))).arrayBuffer()
      const { renderPdfPages } = await import('@/lib/pdfText')
      return (await renderPdfPages(buf, 1, 160))[0] ?? null
    },
  })
  return (
    <span className="flex h-[78px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-white">
      {q.data ? <img src={q.data} alt="" className="size-full object-cover object-top" /> : <FileText className="size-5 text-ink-3" />}
    </span>
  )
}
