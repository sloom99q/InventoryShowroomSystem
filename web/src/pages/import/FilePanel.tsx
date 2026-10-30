import { AlertTriangle, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Sheet, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DocPreview } from '@/components/DocPreview'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { fmtBytes } from '@/lib/format'
import type { SessionFile } from './session'

const ICON = { pdf: FileText, docx: FileText, spreadsheet: FileSpreadsheet, image: ImageIcon } as const

export function FileList({ files, selected, onSelect, onRemove, onRouteInventory }: {
  files: SessionFile[]
  selected: string | null
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  onRouteInventory: (f: SessionFile) => void
}) {
  const { t } = useTranslation('docimport')
  return (
    <ul className="divide-y divide-line-soft">
      {files.map((f) => {
        const Icon = f.kind ? ICON[f.kind] : AlertTriangle
        const facts = f.extraction?.facts.length ?? 0
        return (
          <li key={f.key} className={cn('flex items-start gap-2.5 px-3 py-2.5', selected === f.key && 'bg-raised')}>
            <button className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-start" onClick={() => onSelect(f.key)} aria-current={selected === f.key}>
              {f.status === 'reading' ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-ink-3" /> : <Icon className={cn('mt-0.5 size-4 shrink-0', f.status === 'error' ? 'text-danger' : 'text-ink-3')} />}
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium" dir="auto">{f.file.name}</span>
                <span className="block text-[12px] text-ink-3">
                  {f.status === 'reading' && t('files.reading')}
                  {f.status === 'error' && <span className="text-danger">{f.error}</span>}
                  {f.status === 'routed' && t('files.routed')}
                  {f.status === 'ready' && (
                    <>
                      {fmtBytes(f.file.size)}
                      {' · '}
                      {f.extraction?.inventorySheet
                        ? t('files.inventory', { count: f.extraction.inventorySheet.rows })
                        : f.extraction?.hasText
                          ? t('files.facts', { count: facts })
                          : t('files.noText')}
                      {f.images.length > 0 && ` · ${t('files.pictures', { count: f.images.length })}`}
                    </>
                  )}
                </span>
              </span>
            </button>
            {f.status === 'ready' && f.extraction?.inventorySheet && (
              <Button size="sm" onClick={() => onRouteInventory(f)}><Sheet />{t('files.openBulk')}</Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label={t('files.remove', { name: f.file.name })} onClick={() => onRemove(f.key)}><X /></Button>
          </li>
        )
      })}
    </ul>
  )
}

export function FilePreview({ file, page }: { file: SessionFile | undefined; page: number | null }) {
  const { t } = useTranslation('docimport')
  const url = useMemo(() => (file?.kind === 'image' ? URL.createObjectURL(file.file) : null), [file])
  if (!file) return <p className="p-6 text-center text-[13px] text-ink-3">{t('files.pickToPreview')}</p>
  if (file.kind === 'pdf') return <DocPreview src={file.file} isPdf page={page} className="max-h-[70dvh] border-0" />
  if (file.kind === 'image' && url) return <img src={url} alt={file.file.name} className="max-h-[70dvh] w-full object-contain" />
  const pages = file.extraction?.pages ?? []
  if (!pages.join('').trim()) return <p className="p-6 text-center text-[13px] text-ink-3">{t('files.noText')}</p>
  return (
    <pre className="max-h-[70dvh] overflow-auto p-4 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2" dir="auto">
      {pages.join('\n\n')}
    </pre>
  )
}
