import { FileSearch, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { extractFields, type ExtractedFields } from '@/lib/extract'
import { validateFile } from '@/lib/files'
import { findCandidates, type Candidate } from '@/lib/vin'
import { Chassis } from './vehicle-bits'
import { DocPreview } from './DocPreview'
import { Spinner } from './ui/misc'
import { cn } from '@/lib/cn'

export type PdfReadResult = { file: File; text: string | null; candidates: Candidate[]; fields: ExtractedFields; scanned: boolean }

/**
 * Drop the vehicle PDF to read its existing text layer (no OCR, all in the
 * browser). Shows the document next to what was found so a person can check it.
 */
export function PdfReader({ onRead, onPick, picked }: { onRead: (r: PdfReadResult | null) => void; onPick: (c: Candidate) => void; picked?: string }) {
  const [state, setState] = useState<{ busy: boolean; error?: string; result?: PdfReadResult }>({ busy: false })

  async function read(file: File) {
    setState({ busy: true })
    try {
      const s = await validateFile(file, 'pdf_or_image')
      let result: PdfReadResult
      if (s.mime === 'application/pdf') {
        const { extractPdfText } = await import('@/lib/pdfText')
        const t = await extractPdfText(file)
        result = { file, text: t.pages.join('\n\f\n'), candidates: t.hasTextLayer ? findCandidates(t.pages) : [], fields: t.hasTextLayer ? extractFields(t.pages) : {}, scanned: !t.hasTextLayer }
      } else {
        result = { file, text: null, candidates: [], fields: {}, scanned: true }
      }
      setState({ busy: false, result })
      onRead(result)
      if (result.candidates.length === 1 && result.candidates[0].confidence >= 0.75) onPick(result.candidates[0])
    } catch (e) {
      setState({ busy: false, error: (e as Error).message })
      onRead(null)
    }
  }

  const r = state.result
  return (
    <div>
      <label
        className={cn('flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3 text-[13.5px] text-ink-2 hover:border-accent/60 hover:text-ink', state.busy && 'pointer-events-none opacity-60')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) read(f)
        }}
      >
        {state.busy ? <Spinner className="size-4" /> : <FileSearch className="size-4 text-accent" aria-hidden />}
        <span>{r ? <>Reading from <b className="font-medium text-ink">{r.file.name}</b>. Choose another file</> : 'Optional: drop the vehicle PDF here to read the chassis number from it'}</span>
        <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      </label>
      {state.error && <p className="mt-2 text-[13px] text-danger">{state.error}</p>}

      {r && (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-3">
            {r.scanned ? (
              <p className="flex items-start gap-2 rounded-md bg-raised px-3 py-2.5 text-[13px] text-ink-2">
                <ScanLine className="mt-0.5 size-4 shrink-0" />
                This file is a scan or photo, so there is no text to read. Type the chassis number from the preview. The file will still be attached to the vehicle.
              </p>
            ) : r.candidates.length === 0 ? (
              <p className="rounded-md bg-raised px-3 py-2.5 text-[13px] text-ink-2">No chassis number found in this PDF's text. Type it from the preview.</p>
            ) : (
              <div>
                <p className="mb-2 text-[13px] text-ink-2">Found in the document. Choose the correct one and compare it with the preview:</p>
                <ul className="space-y-1.5">
                  {r.candidates.slice(0, 4).map((c) => (
                    <li key={c.value}>
                      <button
                        type="button"
                        onClick={() => onPick(c)}
                        className={cn('flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-start', picked === c.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-raised')}
                      >
                        <Chassis value={c.value} className="text-[15px]" />
                        <span className="text-[12px] text-ink-3">
                          page {c.page}{c.labelAnchored ? ', labelled' : ''}{c.check.warnings.length ? ', check it' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Object.keys(r.fields).length > 0 && (
              <p className="text-[12.5px] text-ink-3">Other details found in the PDF were filled into empty fields below. Check them before saving.</p>
            )}
          </div>
          <DocPreview src={r.file} isPdf={!r.file.type.startsWith('image/')} className="max-h-[28rem]" />
        </div>
      )}
    </div>
  )
}
