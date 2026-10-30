import { useQuery } from '@tanstack/react-query'
import { FileWarning } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Spinner } from './ui/misc'

/**
 * Shows a PDF (rendered page by page with pdf.js, so it works on phones and
 * in browsers without a PDF viewer) or an image.
 */
export function DocPreview({ src, isPdf, className }: { src: Blob | string | null | undefined; isPdf: boolean; className?: string }) {
  const key = typeof src === 'string' ? src : src ? `${(src as File).name ?? 'blob'}-${src.size}` : null
  const pages = useQuery({
    queryKey: ['pdf-preview', key],
    enabled: !!src && isPdf,
    staleTime: Infinity,
    queryFn: async () => {
      const buf = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : await (src as Blob).arrayBuffer()
      const { renderPdfPages } = await import('@/lib/pdfText')
      return renderPdfPages(buf)
    },
  })
  const imgUrl = useQuery({
    queryKey: ['img-preview', key],
    enabled: !!src && !isPdf,
    staleTime: Infinity,
    queryFn: () => (typeof src === 'string' ? src : URL.createObjectURL(src as Blob)),
  })

  return (
    <div className={cn('overflow-auto rounded-md border border-line bg-[#2a2e33]', className)}>
      {!src || pages.isLoading || imgUrl.isLoading ? (
        <div className="flex h-60 items-center justify-center"><Spinner /></div>
      ) : pages.error ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2 text-[13px] text-ink-2"><FileWarning className="size-5" />Preview not available</div>
      ) : isPdf ? (
        <div className="space-y-2 p-2">
          {pages.data?.map((p, i) => <img key={i} src={p} alt={`Page ${i + 1}`} className="w-full rounded-sm bg-white shadow" />)}
        </div>
      ) : (
        <img src={imgUrl.data} alt="Document" className="w-full object-contain" />
      )}
    </div>
  )
}
