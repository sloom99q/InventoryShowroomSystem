import { useQuery } from '@tanstack/react-query'
import { FileWarning } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Spinner } from './ui/misc'

/**
 * Shows a PDF (rendered page by page with pdf.js, so it works on phones and
 * in browsers without a PDF viewer) or an image.
 */
export function DocPreview({ src, isPdf, className, page }: { src: Blob | string | null | undefined; isPdf: boolean; className?: string; page?: number | null }) {
  const { t } = useTranslation()
  const key = typeof src === 'string' ? src : src ? `${(src as File).name ?? 'blob'}-${src.size}` : null
  const pages = useQuery({
    queryKey: ['pdf-preview', key],
    enabled: !!src && isPdf,
    staleTime: Infinity,
    queryFn: async () => {
      const buf = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : await (src as Blob).arrayBuffer()
      const { renderPdfPages } = await import('@/lib/pdfText')
      return renderPdfPages(buf, 12)
    },
  })
  const imgUrl = useQuery({
    queryKey: ['img-preview', key],
    enabled: !!src && !isPdf,
    staleTime: Infinity,
    queryFn: () => (typeof src === 'string' ? src : URL.createObjectURL(src as Blob)),
  })

  return (
    <div className={cn('overflow-auto rounded-md border border-line bg-raised', className)}>
      {!src || pages.isLoading || imgUrl.isLoading ? (
        <div className="flex h-60 items-center justify-center"><Spinner /></div>
      ) : pages.error ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2 text-[13px] text-ink-2"><FileWarning className="size-5" />{t('files.previewUnavailable')}</div>
      ) : isPdf ? (
        <div className="space-y-2 p-2">
          {pages.data?.map((p, i) => (
            <img key={i} src={p} alt={t('files.page', { n: i + 1 })} className={cn('w-full rounded-sm bg-white shadow', page === i + 1 && 'ring-2 ring-accent')}
              ref={(el) => { if (el && page === i + 1) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }} />
          ))}
        </div>
      ) : (
        <img src={imgUrl.data} alt="Document" className="w-full object-contain" />
      )}
    </div>
  )
}
