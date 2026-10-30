import { AlertTriangle, BadgeCheck, CheckCircle2, Download, Eye, FilePlus2, FileText, History, Replace, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDocuments, useUpdateDocument, useUploadDocument } from '@/api/records'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { Empty, ErrorNote, PageLoader, Panel, PanelHeader, Spinner } from '@/components/ui/misc'
import { Chassis } from '@/components/vehicle-bits'
import { DocPreview } from '@/components/DocPreview'
import { useCompany } from '@/lib/auth'
import { downloadFile, openFile, useSignedUrl, validateFile } from '@/lib/files'
import { fmtBytes, fmtDateTime } from '@/lib/format'
import { DOCUMENT_LABEL } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { DocumentRow, DocumentType } from '@/lib/types'
import { findCandidates, normalizeChassis } from '@/lib/vin'

type Check = { state: 'match' | 'mismatch' | 'none' | 'scan'; found: string[]; text: string | null }

/** Read a PDF's text layer and compare any chassis numbers in it with this vehicle. */
async function checkAgainst(file: File, chassis: string): Promise<Check> {
  const s = await validateFile(file, 'pdf_or_image')
  if (s.mime !== 'application/pdf') return { state: 'scan', found: [], text: null }
  const { extractPdfText } = await import('@/lib/pdfText')
  const pdf = await extractPdfText(file)
  if (!pdf.hasTextLayer) return { state: 'scan', found: [], text: null }
  const found = findCandidates(pdf.pages).map((c) => c.value)
  const mine = normalizeChassis(chassis)
  const text = pdf.pages.join('\n\f\n')
  if (found.includes(mine)) return { state: 'match', found, text }
  if (found.length) return { state: 'mismatch', found, text }
  return { state: 'none', found, text }
}

export function DocumentsTab({ vehicleId, chassis }: { vehicleId: string; chassis: string }) {
  const { t } = useTranslation(['vehicle', 'common'])
  const { company, canWrite } = useCompany()
  const q = useDocuments(vehicleId)
  const upd = useUpdateDocument(vehicleId)
  const [upload, setUpload] = useState<{ replaces?: DocumentRow } | null>(null)
  const [verify, setVerify] = useState<DocumentRow | null>(null)
  const [remove, setRemove] = useState<DocumentRow | null>(null)
  const [history, setHistory] = useState<string | null>(null)

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const all = q.data!
  const current = all.filter((d) => !d.superseded_at)

  return (
    <Panel>
      <PanelHeader title={t('docs.title')}>
        {canWrite && <Button variant="primary" size="sm" onClick={() => setUpload({})}><FilePlus2 /> {t('docs.upload')}</Button>}
      </PanelHeader>
      {current.length === 0 ? (
        <Empty icon={<FileText />} title={t('docs.emptyTitle')} action={canWrite && <Button onClick={() => setUpload({})}><FilePlus2 /> {t('docs.upload')}</Button>}>
          {t('docs.emptyBody')}
        </Empty>
      ) : (
        <ul className="divide-y divide-line-soft">
          {current.map((d) => {
            const versions = all.filter((x) => x.group_id === d.group_id).sort((a, b) => b.version - a.version)
            return (
              <li key={d.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <FileText className="size-5 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium" dir="auto">{d.original_filename}</p>
                    <p className="text-[12.5px] text-ink-3">
                      {DOCUMENT_LABEL[d.document_type]} · <span dir="ltr">{fmtBytes(d.file_size)}</span> · {fmtDateTime(d.uploaded_at)}
                      {d.version > 1 && ` · ${t('common:terms.version', { n: d.version })}`}
                    </p>
                    {d.notes && <p className="mt-0.5 text-[12.5px] text-ink-2">{d.notes}</p>}
                  </div>
                  {d.verification_status === 'verified' ? (
                    <span className="flex items-center gap-1 text-[12.5px] text-ok"><BadgeCheck className="size-4" />{t('docs.verified')}</span>
                  ) : canWrite ? (
                    <Button size="sm" onClick={() => setVerify(d)}>{t('docs.verify')}</Button>
                  ) : (
                    <span className="text-[12.5px] text-warn">{t('docs.unverified')}</span>
                  )}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" title={t('common:actions.open')} aria-label={t('common:actions.open')} onClick={() => openFile(d.storage_path)}><Eye /></Button>
                    <Button variant="ghost" size="icon-sm" title={t('common:actions.download')} aria-label={t('common:actions.download')} onClick={() => downloadFile(d.storage_path, d.original_filename)}><Download /></Button>
                    {canWrite && <Button variant="ghost" size="icon-sm" title={t('docs.newVersion')} aria-label={t('docs.newVersion')} onClick={() => setUpload({ replaces: d })}><Replace /></Button>}
                    {versions.length > 1 && <Button variant="ghost" size="icon-sm" title={t('docs.earlierVersions')} aria-label={t('docs.earlierVersions')} onClick={() => setHistory(history === d.group_id ? null : d.group_id)}><History /></Button>}
                    {canWrite && <Button variant="ghost" size="icon-sm" title={t('common:actions.remove')} aria-label={t('common:actions.remove')} onClick={() => setRemove(d)}><Trash2 /></Button>}
                  </div>
                </div>
                {history === d.group_id && (
                  <ul className="ms-8 mt-2 space-y-1 border-s border-line ps-3">
                    {versions.slice(1).map((o) => (
                      <li key={o.id} className="flex items-center gap-3 text-[12.5px] text-ink-2">
                        <span>{t('docs.historyLine', { n: o.version, name: o.original_filename, date: fmtDateTime(o.superseded_at) })}</span>
                        <button className="text-accent underline" onClick={() => downloadFile(o.storage_path, o.original_filename)}>{t('common:actions.download')}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {upload && <UploadDialog companyId={company.id} vehicleId={vehicleId} chassis={chassis} replaces={upload.replaces} onClose={() => setUpload(null)} />}
      {verify && <VerifyDialog doc={verify} chassis={chassis} onClose={() => setVerify(null)}
        onVerify={() => upd.mutate({ id: verify.id, patch: { verification_status: 'verified' } }, { onSuccess: () => { toast.success(t('docs.toastVerified')); setVerify(null) }, onError: (e) => toast.error(friendlyError(e)) })} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title={t('docs.removeTitle')} confirmLabel={t('docs.removeConfirm')} loading={upd.isPending}
        onConfirm={() => remove && upd.mutate({ id: remove.id, patch: { deleted_at: new Date().toISOString() } }, { onSuccess: () => { toast.success(t('docs.toastRemoved')); setRemove(null) }, onError: (e) => toast.error(friendlyError(e)) })}>
        {t('docs.removeBody')}
      </ConfirmDialog>
    </Panel>
  )
}

function UploadDialog({ companyId, vehicleId, chassis, replaces, onClose }: { companyId: string; vehicleId: string; chassis: string; replaces?: DocumentRow; onClose: () => void }) {
  const { t, i18n } = useTranslation(['vehicle', 'common'])
  const rtl = i18n.dir() === 'rtl'
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<DocumentType>(replaces?.document_type ?? 'vehicle_pdf')
  const [notes, setNotes] = useState('')
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmMismatch, setConfirmMismatch] = useState(false)
  const [error, setError] = useState('')
  const up = useUploadDocument(companyId, vehicleId)

  async function pick(f: File) {
    setFile(f); setCheck(null); setError(''); setConfirmMismatch(false); setChecking(true)
    try { setCheck(await checkAgainst(f, chassis)) } catch (e) { setError((e as Error).message); setFile(null) } finally { setChecking(false) }
  }

  return (
    <Dialog open onClose={onClose} title={replaces ? t('docs.versionTitle') : t('docs.uploadTitle')} size="lg"
      description={replaces
        ? <Trans t={t} i18nKey="docs.keepsCurrent" values={{ name: replaces.original_filename, version: replaces.version }} components={{ b: <b className="font-medium text-ink" /> }} />
        : <>{t('docs.forVehicle')} <Chassis value={chassis} /></>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" loading={up.isPending} disabled={!file || checking || (check?.state === 'mismatch' && !confirmMismatch)}
          onClick={() => file && up.mutate({ file, type, notes, extractedText: check?.text ?? undefined, replaces: replaces?.id }, {
            onSuccess: () => { toast.success(replaces ? t('docs.toastVersion') : t('docs.toastUploaded')); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>{t('common:actions.upload')}</Button>
      </>}>
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13.5px] text-ink-2 hover:border-accent/60"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f) }}>
          <FilePlus2 className="size-6 text-ink-3" />
          {file ? <span className="text-ink"><span dir="auto">{file.name}</span> <span className="text-ink-3" dir="ltr">({fmtBytes(file.size)})</span></span> : t('docs.drop')}
          <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        </label>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {checking && <p className="flex items-center gap-2 text-[13px] text-ink-2"><Spinner className="size-4" />{t('docs.checking')}</p>}
        {check?.state === 'match' && <p className="flex items-center gap-2 text-[13px] text-ok"><CheckCircle2 className="size-4" />{t('docs.match')}</p>}
        {check?.state === 'none' && <p className="text-[13px] text-ink-2">{t('docs.none')}</p>}
        {check?.state === 'scan' && <p className="text-[13px] text-ink-2">{t('docs.scan')}</p>}
        {check?.state === 'mismatch' && (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-[13px]">
            <p className="flex items-center gap-2 font-medium text-danger"><AlertTriangle className="size-4" />{t('docs.mismatchTitle')}</p>
            <p className="mt-1 text-ink-2">
              {t('docs.mentions')} {check.found.slice(0, 3).map((f, i) => <span key={f}>{i > 0 && (rtl ? '، ' : ', ')}<Chassis value={f} className="text-ink" /></span>)}{rtl ? ' ' : ', '}{t('docs.notThis')} <Chassis value={chassis} className="text-ink" />.
            </p>
            <label className="mt-2 flex items-start gap-2 text-ink">
              <input type="checkbox" checked={confirmMismatch} onChange={(e) => setConfirmMismatch(e.target.checked)} className="mt-0.5" />
              {t('docs.confirmMismatch')}
            </label>
          </div>
        )}
        {!replaces && (
          <Field label={t('docs.type')}>
            {(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
              {Object.entries(DOCUMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>}
          </Field>
        )}
        <Field label={t('docs.notes')}>
          {(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

/** Shows the document next to the chassis it should contain, then records the check. */
function VerifyDialog({ doc, chassis, onClose, onVerify }: { doc: DocumentRow; chassis: string; onClose: () => void; onVerify: () => void }) {
  const { t } = useTranslation(['vehicle', 'common'])
  const url = useSignedUrl(doc.storage_path)
  const found = doc.extracted_text ? findCandidates(doc.extracted_text.split('\n\f\n')).map((c) => c.value) : []
  const mine = normalizeChassis(chassis)
  return (
    <Dialog open onClose={onClose} title={t('docs.verifyTitle')} size="xl"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common:actions.notNow')}</Button><Button variant="primary" onClick={onVerify}><BadgeCheck /> {t('docs.verifyConfirm')}</Button></>}>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3 text-[13.5px]">
          <div>
            <p className="text-[12.5px] text-ink-3">{t('docs.thisChassis')}</p>
            <Chassis value={chassis} className="text-[19px]" />
          </div>
          {found.length > 0 && (
            <div>
              <p className="text-[12.5px] text-ink-3">{t('docs.foundInText')}</p>
              {found.slice(0, 4).map((f) => (
                <p key={f} className={f === mine ? 'text-ok' : 'text-warn'}><Chassis value={f} /> {f === mine ? '✓' : '≠'}</p>
              ))}
            </div>
          )}
          <p className="text-ink-2">{t('docs.verifyInstructions')}</p>
        </div>
        <DocPreview src={url.data} isPdf={doc.mime_type === 'application/pdf'} className="max-h-[65dvh]" />
      </div>
    </Dialog>
  )
}
