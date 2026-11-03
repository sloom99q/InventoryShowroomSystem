// Photo upload queue (Add car, car page): each photo has its own state, previews show at once
// and keep their place, uploads start as soon as photos are picked (two at a time), a failed
// photo can be retried, and uploads carry on in the background if she moves on.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshCar } from '@/api/journey'
import { preparePhoto, uploadImage } from '@/lib/files'
import { friendlyError, supabase } from '@/lib/supabase'
import type { ImageType } from '@/lib/types'
import { uuid } from '@/lib/uuid'

export type PhotoStatus = 'preparing' | 'waiting' | 'uploading' | 'done' | 'failed'
export type PhotoItem = { key: string; name: string; preview: string | null; status: PhotoStatus; error?: string }

const CONCURRENCY = 2
const looksHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /heic|heif/i.test(f.type)

export function usePhotoQueue(companyId: string, vehicleId: string | null, type: ImageType = 'arrival') {
  const qc = useQueryClient()
  const [items, setItems] = useState<PhotoItem[]>([])
  const files = useRef(new Map<string, File>())
  const urls = useRef<string[]>([])
  const active = useRef(0)
  const order = useRef<string[]>([])
  const state = useRef(new Map<string, PhotoStatus>())

  const patch = useCallback((key: string, p: Partial<PhotoItem>) => {
    if (p.status) state.current.set(key, p.status)
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)))
  }, [])

  const pump = useCallback(() => {
    if (!vehicleId) return
    while (active.current < CONCURRENCY) {
      const key = order.current.find((k) => state.current.get(k) === 'waiting')
      if (!key) return
      active.current++
      patch(key, { status: 'uploading', error: undefined })
      const run = async () => {
        let file = files.current.get(key)!
        const prepared = await preparePhoto(file)
        if (prepared !== file && looksHeic(file)) {
          const u = URL.createObjectURL(prepared); urls.current.push(u)
          patch(key, { preview: u })
        }
        file = prepared
        const up = await uploadImage(companyId, vehicleId, 'photos', file)
        const { error } = await supabase.from('vehicle_images').insert({ vehicle_id: vehicleId, image_type: type, ...up })
        if (error) throw error
      }
      run()
        .then(() => { patch(key, { status: 'done' }); refreshCar(qc, vehicleId) })
        .catch((e) => patch(key, { status: 'failed', error: friendlyError(e) }))
        .finally(() => { active.current--; pump() })
    }
  }, [companyId, vehicleId, type, patch, qc])

  useEffect(() => { pump() }, [pump, vehicleId])
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u) }, [])

  const add = useCallback((list: FileList | File[] | null) => {
    const picked = [...(list ?? [])].filter((f) => f.type.startsWith('image/') || looksHeic(f))
    if (!picked.length) return
    const next: PhotoItem[] = picked.map((f) => {
      const key = uuid()
      files.current.set(key, f)
      order.current.push(key)
      state.current.set(key, 'waiting')
      // HEIC can't be previewed outside Safari until it's converted.
      let preview: string | null = null
      if (!looksHeic(f)) { preview = URL.createObjectURL(f); urls.current.push(preview) }
      return { key, name: f.name, preview, status: 'waiting' as const }
    })
    setItems((xs) => [...xs, ...next])
    queueMicrotask(pump)
  }, [pump])

  const retry = useCallback((key: string) => { patch(key, { status: 'waiting', error: undefined }); queueMicrotask(pump) }, [patch, pump])
  const remove = useCallback((key: string) => {
    if (state.current.get(key) !== 'waiting' && state.current.get(key) !== 'failed') return
    state.current.delete(key)
    order.current = order.current.filter((k) => k !== key)
    setItems((xs) => xs.filter((x) => x.key !== key))
  }, [])

  const pending = items.filter((x) => x.status === 'waiting' || x.status === 'uploading' || x.status === 'preparing').length
  return {
    items, add, retry, remove, pending,
    done: items.filter((x) => x.status === 'done').length,
    failed: items.filter((x) => x.status === 'failed').length,
  }
}
export type PhotoQueue = ReturnType<typeof usePhotoQueue>
