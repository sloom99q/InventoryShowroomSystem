import { useQuery } from '@tanstack/react-query'
import i18n from '@/i18n'
import { BUCKET, supabase } from './supabase'

export const MAX_FILE_BYTES = 50 * 1024 * 1024

type Sniffed = { mime: string; ext: string }

/**
 * Identify a file from its first bytes. The browser's MIME type and the file
 * name are user-controlled, so they are not trusted.
 */
export async function sniffFile(file: File): Promise<Sniffed | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const at = (o: number, ...xs: number[]) => xs.every((x, i) => b[o + i] === x)
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return { mime: 'application/pdf', ext: 'pdf' }
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' }
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { mime: 'image/png', ext: 'png' }
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', ext: 'webp' }
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(...b.slice(8, 12))
    if (/^(heic|heix|mif1|msf1|hevc)$/.test(brand)) return { mime: 'image/heic', ext: 'heic' }
  }
  return null
}

export type Accept = 'pdf_or_image' | 'image'

export async function validateFile(file: File, accept: Accept): Promise<Sniffed> {
  if (file.size === 0) throw new Error(i18n.t('files.empty', { name: file.name }))
  if (file.size > MAX_FILE_BYTES) throw new Error(i18n.t('files.tooLarge', { name: file.name }))
  const s = await sniffFile(file)
  if (!s) throw new Error(i18n.t('files.badType', { name: file.name }))
  if (accept === 'image' && s.mime === 'application/pdf') throw new Error(i18n.t('files.pdfNotPhoto', { name: file.name }))
  return s
}

export function objectPath(companyId: string, vehicleId: string, kind: string, ext: string) {
  return `${companyId}/${vehicleId}/${kind}/${crypto.randomUUID()}.${ext}`
}

export async function uploadObject(path: string, body: Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: false })
  if (error) throw error
}

/** Make a ~640px WebP thumbnail in the browser. Returns null if the browser can't decode the image (e.g. HEIC outside Safari). */
export async function makeThumbnail(file: File, max = 640): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = new OffscreenCanvas(w, h)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
  } catch {
    return null
  }
}

/** Upload an image and its thumbnail. Returns the storage paths. */
export async function uploadImage(companyId: string, vehicleId: string, kind: string, file: File) {
  const s = await validateFile(file, 'image')
  const path = objectPath(companyId, vehicleId, kind, s.ext)
  await uploadObject(path, file, s.mime)
  let thumbnail_path: string | null = null
  const thumb = await makeThumbnail(file)
  if (thumb) {
    thumbnail_path = path.replace(/\.[a-z]+$/, '.thumb.webp')
    await uploadObject(thumbnail_path, thumb, 'image/webp')
  }
  return { storage_path: path, thumbnail_path, mime_type: s.mime, file_size: file.size, original_filename: file.name }
}

export async function signedUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error) throw error
  return data.signedUrl
}

/** Signed URLs are cached for 50 minutes (they expire after 60). */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', path],
    queryFn: () => signedUrl(path!),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
  })
}

export async function openFile(path: string) {
  const w = window.open('', '_blank')
  const url = await signedUrl(path)
  if (w) w.location.href = url
  else window.location.href = url
}

export async function downloadFile(path: string, filename: string) {
  const url = await signedUrl(path, filename)
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  a.click()
}
