import { ChevronLeft, ChevronRight, Download, ImagePlus, Images, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
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

const GROUPS: { type: ImageType; hint: string }[] = [
  { type: 'arrival', hint: 'Condition when the car came in' },
  { type: 'current', hint: 'Latest condition' },
  { type: 'garage', hint: 'Damage, repairs and workshop progress' },
  { type: 'other', hint: '' },
]

function Thumb({ img, onClick }: { img: ImageRow; onClick: () => void }) {
  const url = useSignedUrl(img.thumbnail_path ?? img.storage_path)
  return (
    <button onClick={onClick} className="group relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-md bg-raised" aria-label={`Open ${img.original_filename}`}>
      {url.data && <img src={url.data} alt={img.caption ?? ''} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />}
    </button>
  )
}

export function PhotosTab({ vehicleId }: { vehicleId: string }) {
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
        <PanelHeader title="Information card">
          {canWrite && <Button size="sm" onClick={() => setAdding('information_card')}><ImagePlus />{card ? 'Replace card' : 'Add card'}</Button>}
        </PanelHeader>
        <div className="p-4">
          {card ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="w-full max-w-md"><Thumb img={card} onClick={() => setBox({ list: [card], i: 0 })} /></div>
              <div className="text-[13px] text-ink-2">
                <p>{card.original_filename}</p>
                <p className="text-ink-3">Added {fmtDateTime(card.uploaded_at)}</p>
                <Button size="sm" className="mt-3" onClick={() => downloadFile(card.storage_path, card.original_filename)}><Download />Download original</Button>
                {cards.length > 1 && (
                  <div className="mt-4">
                    <p className="mb-1 text-ink-3">Earlier versions</p>
                    <ul className="space-y-1">
                      {cards.filter((c) => c.superseded_at).map((c) => (
                        <li key={c.id}><button className="text-accent underline" onClick={() => downloadFile(c.storage_path, c.original_filename)}>{c.original_filename}</button> <span className="text-ink-3">replaced {fmtDateTime(c.superseded_at)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">No information card yet.</p>
          )}
        </div>
      </Panel>

      {GROUPS.map((g) => {
        const list = live.filter((i) => i.image_type === g.type)
        return (
          <Panel key={g.type}>
            <PanelHeader title={<>{IMAGE_LABEL[g.type]} photos <span className="tnum ms-1 font-normal text-ink-3">{list.length || ''}</span></>}>
              {canWrite && <Button size="sm" onClick={() => setAdding(g.type)}><ImagePlus />Add</Button>}
            </PanelHeader>
            <div className="p-4">
              {list.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {list.map((img, i) => <Thumb key={img.id} img={img} onClick={() => setBox({ list, i })} />)}
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">{g.hint ? `${g.hint}. ` : ''}No photos yet.</p>
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
  const [files, setFiles] = useState<File[]>([])
  const [done, setDone] = useState(0)
  const up = useUploadImages(companyId, vehicleId)
  const single = type === 'information_card'
  return (
    <Dialog open onClose={onClose} title={single ? 'Information card' : `Add ${IMAGE_LABEL[type].toLowerCase()} photos`}
      description={single ? 'The current card, if any, is kept as an earlier version.' : undefined}
      footer={<>
        {up.isPending && <span className="tnum me-auto self-center text-[13px] text-ink-2">Uploading {done + 1} of {files.length}…</span>}
        <Button variant="ghost" onClick={onClose} disabled={up.isPending}>Cancel</Button>
        <Button variant="primary" disabled={!files.length} loading={up.isPending}
          onClick={() => up.mutate({ files, type, onProgress: setDone }, {
            onSuccess: () => { toast.success(single ? 'Information card saved' : `${files.length} photo${files.length > 1 ? 's' : ''} added`); onClose() },
            onError: (e) => toast.error(friendlyError(e)),
          })}>Upload</Button>
      </>}>
      <PhotoPicker files={files} onChange={setFiles} multiple={!single} />
    </Dialog>
  )
}

function Lightbox({ list, start, vehicleId, canWrite, onClose }: { list: ImageRow[]; start: number; vehicleId: string; canWrite: boolean; onClose: () => void }) {
  const [i, setI] = useState(start)
  const [confirm, setConfirm] = useState(false)
  const img = list[i]
  const url = useSignedUrl(img?.storage_path)
  const rm = useRemoveImage(vehicleId)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, list.length - 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [list.length])
  if (!img) return null
  return (
    <Dialog open onClose={onClose} title={img.original_filename} description={`${IMAGE_LABEL[img.image_type]} · ${fmtDateTime(img.uploaded_at)}`} size="xl"
      footer={<>
        {canWrite && img.image_type !== 'information_card' && <Button variant="danger" className="me-auto" onClick={() => setConfirm(true)}><Trash2 />Remove</Button>}
        <Button onClick={() => downloadFile(img.storage_path, img.original_filename)}><Download />Download original</Button>
      </>}>
      <div className="relative flex min-h-[50dvh] items-center justify-center bg-black/30">
        {url.data ? <img src={url.data} alt={img.caption ?? ''} className="max-h-[65dvh] max-w-full object-contain" /> : <Images className="size-8 text-ink-3" />}
        {list.length > 1 && (
          <>
            <Button size="icon" className="absolute start-2" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous photo"><ChevronLeft /></Button>
            <Button size="icon" className="absolute end-2" disabled={i === list.length - 1} onClick={() => setI(i + 1)} aria-label="Next photo"><ChevronRight /></Button>
            <span className="tnum absolute bottom-2 rounded bg-black/60 px-2 text-[12px]">{i + 1} / {list.length}</span>
          </>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Remove this photo?" confirmLabel="Remove photo" loading={rm.isPending}
        onConfirm={() => rm.mutate(img.id, { onSuccess: () => { toast.success('Photo removed'); setConfirm(false); onClose() }, onError: (e) => toast.error(friendlyError(e)) })}>
        It will be hidden from this vehicle. The original file is kept and the removal is recorded.
      </ConfirmDialog>
    </Dialog>
  )
}
