import { ChevronLeft, ChevronRight, Download, ImagePlus, Images, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useImages, useRemoveImage, useUploadImages } from '@/api/records'
import { PhotoPicker } from '@/components/PhotoPicker'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Panel, PanelHeader, PageLoader, ErrorNote } from '@/components/ui/misc'
import { useCompany } from '@/lib/auth'
import { downloadFile, useSignedUrl } from '@/lib/files'
import { fmtDateTime } from '@/lib/format'
import { IMAGE_LABEL } from '@/lib/labels'
import { friendlyError } from '@/lib/supabase'
import type { ImageRow, ImageType } from '@/lib/types'

const GROUPS: { type: ImageType; hint?: 'hintArrival' | 'hintCurrent' | 'hintGarage' }[] = [
  { type: 'arrival', hint: 'hintArrival' },
  { type: 'current', hint: 'hintCurrent' },
  { type: 'garage', hint: 'hintGarage' },
  { type: 'other' },
]

function Thumb({ img, onClick }: { img: ImageRow; onClick: () => void }) {
  const { t } = useTranslation('vehicle')
  const url = useSignedUrl(img.thumbnail_path ?? img.storage_path)
  return (
    <button onClick={onClick} className="group relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-md bg-raised" aria-label={t('photos.openPhoto', { name: img.original_filename })}>
      {url.data && <img src={url.data} alt={img.caption ?? ''} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />}
    </button>
  )
}

export function PhotosTab({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation(['vehicle', 'common'])
  const { company, canWrite } = useCompany()
  const q = useImages(vehicleId)
  const [adding, setAdding] = useState<ImageType | null>(null)
  const [box, setBox] = useState<{ list: ImageRow[]; i: number } | null>(null)

  if (q.isLoading) return <PageLoader />
  if (q.error) return <ErrorNote error={q.error} />
  const live = q.data!.filter((i) => !i.superseded_at)
  const cards = q.data!.filter((i) => i.image_type === 'information_card')
  const card = cards.find((c) => !c.superseded_at)

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title={t('photos.infoCard')}>
          {canWrite && <Button size="sm" onClick={() => setAdding('information_card')}><ImagePlus />{card ? t('photos.replaceCard') : t('photos.addCard')}</Button>}
        </PanelHeader>
        <div className="p-4">
          {card ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="w-full max-w-md"><Thumb img={card} onClick={() => setBox({ list: [card], i: 0 })} /></div>
              <div className="text-[13px] text-ink-2">
                <p dir="auto">{card.original_filename}</p>
                <p className="text-ink-3">{t('photos.added', { date: fmtDateTime(card.uploaded_at) })}</p>
                <Button size="sm" className="mt-3" onClick={() => downloadFile(card.storage_path, card.original_filename)}><Download />{t('photos.downloadOriginal')}</Button>
                {cards.length > 1 && (
                  <div className="mt-4">
                    <p className="mb-1 text-ink-3">{t('photos.earlierVersions')}</p>
                    <ul className="space-y-1">
                      {cards.filter((c) => c.superseded_at).map((c) => (
                        <li key={c.id}>
                          <button className="text-accent underline" dir="auto" onClick={() => downloadFile(c.storage_path, c.original_filename)}>{c.original_filename}</button>{' '}
                          <span className="text-ink-3">{t('photos.replacedOn', { date: fmtDateTime(c.superseded_at) })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">{t('photos.noCard')}</p>
          )}
        </div>
      </Panel>

      {GROUPS.map((g) => {
        const list = live.filter((i) => i.image_type === g.type)
        return (
          <Panel key={g.type}>
            <PanelHeader title={<>{t('photos.groupTitle', { type: IMAGE_LABEL[g.type] })} <span className="tnum ms-1 font-normal text-ink-3">{list.length || ''}</span></>}>
              {canWrite && <Button size="sm" onClick={() => setAdding(g.type)}><ImagePlus />{t('common:actions.add')}</Button>}
            </PanelHeader>
            <div className="p-4">
              {list.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {list.map((img, i) => <Thumb key={img.id} img={img} onClick={() => setBox({ list, i })} />)}
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">{g.hint ? `${t(`photos.${g.hint}`)}. ` : ''}{t('photos.noPhotos')}</p>
              )}
            </div>
          </Panel>
        )
      })}

      {adding && <AddPhotos companyId={company.id} vehicleId={vehicleId} type={adding} onClose={() => setAdding(null)} />}
      {box && <Lightbox list={box.list} start={box.i} vehicleId={vehicleId} canWrite={canWrite} onClose={() => setBox(null)} />}
    </div>
  )
}

function AddPhotos({ companyId, vehicleId, type, onClose }: { companyId: string; vehicleId: string; type: ImageType; onClose: () => void }) {
  const { t, i18n } = useTranslation(['vehicle', 'common'])
  const [files, setFiles] = useState<File[]>([])
  const [done, setDone] = useState(0)
  const up = useUploadImages(companyId, vehicleId)
  const single = type === 'information_card'
  const typeLabel = i18n.language === 'en' ? IMAGE_LABEL[type].toLowerCase() : IMAGE_LABEL[type]
  return (
    <Dialog open onClose={onClose} title={single ? t('photos.infoCard') : t('photos.addTitle', { type: typeLabel })}
      description={single ? t('photos.cardKept') : undefined}
      footer={<>
        {up.isPending && <span className="tnum me-auto self-center text-[13px] text-ink-2">{t('photos.uploading', { done: done + 1, total: files.length })}</span>}
        <Button variant="ghost" onClick={onClose} disabled={up.isPending}>{t('common:actions.cancel')}</Button>
        <Button variant="primary" disabled={!files.length} loading={up.isPending}
          onClick={() => up.mutate({ files, type, onProgress: setDone }, {
            onSuccess: () => { toast.success(single ? t('photos.toastCard') : t('photos.toastPhotos', { count: files.length })); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>{t('common:actions.upload')}</Button>
      </>}>
      <PhotoPicker files={files} onChange={setFiles} multiple={!single} />
    </Dialog>
  )
}

function Lightbox({ list, start, vehicleId, canWrite, onClose }: { list: ImageRow[]; start: number; vehicleId: string; canWrite: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation(['vehicle', 'common'])
  const [i, setI] = useState(start)
  const [confirm, setConfirm] = useState(false)
  const img = list[i]
  const url = useSignedUrl(img?.storage_path)
  const rm = useRemoveImage(vehicleId)
  const rtl = i18n.dir() === 'rtl'
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
      const back = rtl ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === forward) setI((x) => Math.min(x + 1, list.length - 1))
      if (e.key === back) setI((x) => Math.max(x - 1, 0))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [list.length, rtl])
  if (!img) return null
  return (
    <Dialog open onClose={onClose} title={img.original_filename} description={`${IMAGE_LABEL[img.image_type]} · ${fmtDateTime(img.uploaded_at)}`} size="xl"
      footer={<>
        {canWrite && img.image_type !== 'information_card' && <Button variant="danger" className="me-auto" onClick={() => setConfirm(true)}><Trash2 />{t('common:actions.remove')}</Button>}
        <Button onClick={() => downloadFile(img.storage_path, img.original_filename)}><Download />{t('photos.downloadOriginal')}</Button>
      </>}>
      <div className="relative flex min-h-[50dvh] items-center justify-center bg-black/80">
        {url.data ? <img src={url.data} alt={img.caption ?? ''} className="max-h-[65dvh] max-w-full object-contain" /> : <Images className="size-8 text-ink-3" />}
        {list.length > 1 && (
          <>
            <Button size="icon" className="absolute start-2" disabled={i === 0} onClick={() => setI(i - 1)} aria-label={t('photos.prevPhoto')}><ChevronLeft className="flip-rtl" /></Button>
            <Button size="icon" className="absolute end-2" disabled={i === list.length - 1} onClick={() => setI(i + 1)} aria-label={t('photos.nextPhoto')}><ChevronRight className="flip-rtl" /></Button>
            <span className="tnum absolute bottom-2 rounded bg-black/60 px-2 text-[12px] text-white" dir="ltr">{i + 1} / {list.length}</span>
          </>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('photos.removeTitle')} confirmLabel={t('photos.removeConfirm')} loading={rm.isPending}
        onConfirm={() => rm.mutate(img.id, { onSuccess: () => { toast.success(t('photos.toastRemoved')); setConfirm(false); onClose() }, onError: (e) => toast.error(friendlyError(e)) })}>
        {t('photos.removeBody')}
      </ConfirmDialog>
    </Dialog>
  )
}
