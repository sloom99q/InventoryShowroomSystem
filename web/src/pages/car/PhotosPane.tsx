// Photos: category chips, a grid in the order she sets, a star for the cover, the camera on phones.
import { ArrowLeft, ArrowRight, Camera, GripVertical, ImagePlus, Star } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tr } from '@/components/v3/bits'
import { toast } from 'sonner'
import { useReorderPhotos, useSetCover } from '@/api/journey'
import { useImages, useUploadImages } from '@/api/records'
import { Button } from '@/components/ui/button'
import { ErrorNote, PageLoader } from '@/components/ui/misc'
import { EmptyState } from '@/components/v3/bits'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useSignedUrl } from '@/lib/files'
import { friendlyError } from '@/lib/supabase'
import type { ImageRow, ImageType } from '@/lib/types'
import type { VehicleOverview } from '@/lib/types'
import { Lightbox } from '@/pages/vehicle/PhotosTab'

const CATS: ImageType[] = ['arrival', 'current', 'garage']
type Filter = 'all' | ImageType

/** Cover first, then her order, then newest. */
function ordered(list: ImageRow[]) {
  return [...list].sort((a, b) => Number(b.is_cover) - Number(a.is_cover)
    || (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || b.uploaded_at.localeCompare(a.uploaded_at))
}

export function PhotosPane({ v }: { v: VehicleOverview }) {
  const { t } = useTranslation('cars')
  const { company, canWrite } = useCompany()
  const q = useImages(v.id!)
  const [filter, setFilter] = useState<Filter>('all')
  const [box, setBox] = useState<number | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const up = useUploadImages(company.id, v.id!)
  const cover = useSetCover(v.id!)
  const reorder = useReorderPhotos(v.id!)
  const camera = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const live = useMemo(() => ordered((q.data ?? []).filter((i) => !i.superseded_at && i.image_type !== 'information_card')), [q.data])
  const shown = filter === 'all' ? live : live.filter((i) => i.image_type === filter)
  const [local, setLocal] = useState<string[] | null>(null)
  const list = local ? local.map((id) => shown.find((i) => i.id === id)!).filter(Boolean) : shown

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />

  const upload = (files: FileList | null) => {
    if (!files?.length) return
    const type: ImageType = filter === 'all' ? 'current' : filter
    up.mutate({ files: [...files], type, onProgress: setDone }, {
      onSuccess: () => toast.success(t('photos.added', { count: files.length })),
      onError: (e) => toast.error(friendlyError(e)),
    })
  }
  const commitOrder = (ids: string[]) => {
    const full = filter === 'all' ? ids : [...ids, ...live.filter((i) => !ids.includes(i.id)).map((i) => i.id)]
    reorder.mutate(full, { onSettled: () => setLocal(null), onError: (e) => toast.error(friendlyError(e)) })
  }
  const move = (id: string, dir: -1 | 1) => {
    const ids = list.map((i) => i.id)
    const k = ids.indexOf(id)
    const j = k + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[k], ids[j]] = [ids[j], ids[k]]
    setLocal(ids)
    commitOrder(ids)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', ...CATS] as Filter[]).map((c) => {
          const n = c === 'all' ? live.length : live.filter((i) => i.image_type === c).length
          return (
            <button key={c} onClick={() => { setFilter(c); setLocal(null) }} aria-pressed={filter === c}
              className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium', filter === c ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3')}>
              {tr(t, `photos.cat.${c}`)}<span className={cn('tnum text-[12px]', filter === c ? 'text-white/70' : 'text-ink-3')}>{n}</span>
            </button>
          )
        })}
        {canWrite && (
          <span className="ms-auto flex gap-2">
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
            <input ref={pick} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = '' }} data-testid="photos-upload" />
            <Button className="md:hidden" onClick={() => camera.current?.click()} disabled={up.isPending}><Camera />{t('photos.camera')}</Button>
            <Button variant="primary" onClick={() => pick.current?.click()} loading={up.isPending}>
              <ImagePlus />{up.isPending ? t('add.uploading', { done: done + 1, total: '…' }) : t('photos.upload', { type: tr(t, `photos.cat.${filter === 'all' ? 'current' : filter}`) })}
            </Button>
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card"><EmptyState anim="empty-photos" title={t('photos.emptyTitle')}>{t('photos.emptyBody')}</EmptyState></div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((img, i) => (
            <li key={img.id} draggable={canWrite} data-photo-id={img.id}
              onDragStart={() => setDragId(img.id)}
              onDragOver={(e) => {
                e.preventDefault()
                if (!dragId || dragId === img.id) return
                const ids = list.map((x) => x.id).filter((x) => x !== dragId)
                ids.splice(ids.indexOf(img.id) + (list.findIndex((x) => x.id === dragId) < i ? 1 : 0), 0, dragId)
                setLocal(ids)
              }}
              onDragEnd={() => { if (local) commitOrder(local); setDragId(null) }}
              className={cn('group relative aspect-[4/3] overflow-hidden rounded-xl bg-hover', dragId === img.id && 'opacity-50')}>
              <Thumb img={img} onOpen={() => setBox(i)} />
              {img.is_cover && <span className="absolute start-2 bottom-2 rounded-md bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">{t('photos.cover')}</span>}
              {canWrite && (
                <>
                  <button onClick={() => cover.mutate(img.id, { onError: (e) => toast.error(friendlyError(e)) })} aria-pressed={img.is_cover}
                    aria-label={img.is_cover ? t('photos.isCover') : t('photos.makeCover')}
                    className={cn('absolute end-2 top-2 flex size-9 items-center justify-center rounded-full backdrop-blur transition-colors',
                      img.is_cover ? 'bg-amber-400 text-white' : 'bg-black/40 text-white opacity-80 hover:bg-black/60 group-hover:opacity-100')}>
                    <Star className={cn('size-4', img.is_cover && 'fill-current')} />
                  </button>
                  <span className="absolute start-2 top-2 hidden size-8 cursor-grab items-center justify-center rounded-lg bg-black/40 text-white md:group-hover:flex" aria-hidden><GripVertical className="size-4" /></span>
                  <span className="absolute end-2 bottom-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100">
                    <button disabled={i === 0} onClick={() => move(img.id, -1)} aria-label={t('photos.earlier')} className="flex size-8 items-center justify-center rounded-lg bg-black/45 text-white disabled:opacity-30"><ArrowLeft className="size-4 flip-rtl" /></button>
                    <button disabled={i === list.length - 1} onClick={() => move(img.id, 1)} aria-label={t('photos.later')} className="flex size-8 items-center justify-center rounded-lg bg-black/45 text-white disabled:opacity-30"><ArrowRight className="size-4 flip-rtl" /></button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {box !== null && <Lightbox list={list} start={box} vehicleId={v.id!} canWrite={canWrite} onClose={() => setBox(null)} />}
    </div>
  )
}

function Thumb({ img, onOpen }: { img: ImageRow; onOpen: () => void }) {
  const { t } = useTranslation('cars')
  const url = useSignedUrl(img.thumbnail_path ?? img.storage_path)
  return (
    <button onClick={onOpen} className="block size-full cursor-zoom-in" aria-label={t('photos.open', { name: img.original_filename })}>
      {url.data && <img src={url.data} alt="" loading="lazy" draggable={false} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />}
    </button>
  )
}
