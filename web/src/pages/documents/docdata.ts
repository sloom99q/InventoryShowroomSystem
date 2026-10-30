// From a vehicle record to the documents' input (kit/sample/sample-data.json
// shape), plus the checks before export. Pure except prepareImage (browser).
import { readiness, type VehicleData } from '@/api/fields'
import type { Database } from '@/lib/database.types'
import { FIELDS } from '@/lib/fields'
import { signedUrl } from '@/lib/files'
import type { Bi, DocData, RenderResult } from '@/docs/types'

type T = Database['public']['Tables']
export type Img = T['vehicle_images']['Row']
export type VehicleLike = Pick<T['vehicles']['Row'], 'brand' | 'model' | 'year' | 'trim_level' | 'listing_price' | 'doc_settings'>
export type CompanyLike = Pick<T['companies']['Row'], 'name' | 'legal_name' | 'signature_line' | 'disclaimer' | 'currency' | 'doc_banner_path' | 'doc_watermark_path'>
export type DocKind = 'specsheet' | 'brochure'

/** Saved per vehicle: only the brochure photos are chosen by hand. Rows and sections come from fields.json. */
export type DocSettings = { brochure?: { coverId?: string | null; photoIds?: string[] }; /** yyyy-mm-dd printed on the spec sheet; default: today. */ docDate?: string }

export function readSettings(v: Pick<VehicleLike, 'doc_settings'>): DocSettings {
  const s = v.doc_settings
  return s && typeof s === 'object' && !Array.isArray(s) ? (s as DocSettings) : {}
}

export function usablePhotos(images: Img[]) {
  return images.filter((i) => !i.deleted_at && !i.superseded_at && i.image_type !== 'information_card' && !i.mime_type.includes('pdf'))
}

/** Cover and photo pages: saved choice, else arrival + current photos in upload order. */
export function brochurePhotos(images: Img[], settings: DocSettings) {
  const usable = usablePhotos(images)
  const b = settings.brochure ?? {}
  const byId = new Map(usable.map((i) => [i.id, i]))
  const photos = b.photoIds ? b.photoIds.map((id) => byId.get(id)).filter((x): x is Img => !!x) : usable.filter((i) => i.image_type === 'arrival' || i.image_type === 'current')
  const cover = (b.coverId && byId.get(b.coverId)) || photos[0] || null
  return { photos, cover }
}

const bi = (en?: string | null, ar?: string | null): Bi => ({ ...(en?.trim() ? { en: en.trim() } : {}), ...(ar?.trim() ? { ar: ar.trim() } : {}) })

/** yyyy-mm-dd in UAE time. */
export function docDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function toDocData(
  v: VehicleLike,
  company: CompanyLike,
  data: VehicleData,
  paths: { cover: string | null; pages: string[]; banner: string | null; watermark: string | null },
  now = new Date(),
): DocData {
  const field = (k: string) => data.fields.get(k)
  const values: Record<string, Bi> = {}
  for (const [k, r] of data.fields) if (k !== 'description' && k !== 'regional_specs') {
    const b = bi(r.value_en, r.value_ar)
    if (b.en || b.ar) values[k] = b
  }
  const list = (k: string) => (data.lists[k] ?? []).map((r) => bi(r.value_en, r.value_ar)).filter((x) => x.en || x.ar)
  return {
    doc_date: readSettings(v).docDate || docDate(now),
    identity: {
      brand: (v.brand ?? '').toUpperCase(),
      model: (v.model ?? '').toUpperCase(),
      year: v.year ? String(v.year) : '',
      ...(v.trim_level ? { trim: v.trim_level } : {}),
      ...(field('description')?.value_en ? { description: field('description')!.value_en! } : {}),
      ...(field('regional_specs') ? { regional_specs: bi(field('regional_specs')!.value_en, field('regional_specs')!.value_ar) } : {}),
      listing_price: v.listing_price ?? null,
      currency: company.currency,
    },
    values,
    lists: {
      drive_modes: list('drive_modes'),
      interior_features: list('interior_features'),
      smart_features: list('smart_features'),
      key_features: (data.lists.key_features ?? []).map((r) => r.value_en?.trim() ?? '').filter(Boolean).slice(0, FIELDS.key_features.max),
    },
    photos: { cover: paths.cover, pages: paths.pages },
    company: {
      banner: paths.banner,
      watermark: paths.watermark,
      signature: company.signature_line || 'Management',
      legal_name: company.legal_name || company.name,
      disclaimer: company.disclaimer ?? '',
    },
  }
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export type IssueTarget = { kind: 'vehicle'; field: 'brand' | 'model' | 'year' | 'listing_price' } | { kind: 'field'; key: string; lang: 'en' | 'ar'; rowId?: string } | { kind: 'photos' } | { kind: 'layout' }
export type Issue = { level: 'block' | 'warn'; code: string; params?: Record<string, string | number>; target: IssueTarget }

export const MIN_PHOTO_WIDTH = 1600

export function inspect(
  kind: DocKind,
  v: VehicleLike & { trim_level: string | null },
  data: VehicleData,
  images: Img[],
  opts: { render?: Pick<RenderResult, 'problems'>; photoSizes?: Record<string, { width: number; height: number } | null> } = {},
): Issue[] {
  const out: Issue[] = []
  for (const f of ['brand', 'model'] as const) if (!v[f]?.trim()) out.push({ level: 'block', code: `missing_${f}`, target: { kind: 'vehicle', field: f } })
  if (!v.year) out.push({ level: 'block', code: 'missing_year', target: { kind: 'vehicle', field: 'year' } })
  for (const p of opts.render?.problems ?? []) {
    if (kind === 'specsheet' && p.code === 'specsheet_overflow') out.push({ level: 'block', code: 'overflow', target: { kind: 'layout' } })
    if (kind === 'brochure' && p.code === 'brochure_slide_overflow') out.push({ level: 'block', code: 'slide_overflow', params: { slide: p.slide ?? 0 }, target: { kind: 'layout' } })
  }
  if (v.listing_price === null || v.listing_price === undefined) out.push({ level: 'warn', code: 'no_price', target: { kind: 'vehicle', field: 'listing_price' } })
  const r = readiness(v, data)
  for (const g of r.gaps) {
    if (['brand', 'model', 'year', 'listing_price'].includes(g.key)) continue
    out.push({ level: 'warn', code: g.kind === 'empty' ? 'empty_field' : 'no_arabic', params: { label: g.label }, target: { kind: 'field', key: g.key, lang: g.kind === 'empty' ? 'en' : 'ar', rowId: g.rowId } })
  }
  if (kind === 'brochure') {
    const sel = brochurePhotos(images, readSettings(v))
    if (sel.photos.length < 3) out.push({ level: 'warn', code: 'few_photos', params: { count: sel.photos.length }, target: { kind: 'photos' } })
    for (const p of [...(sel.cover ? [sel.cover] : []), ...sel.photos]) {
      const size = opts.photoSizes?.[p.id]
      if (size && size.width < MIN_PHOTO_WIDTH && !out.some((o) => o.code === 'low_res' && o.params?.name === p.original_filename))
        out.push({ level: 'warn', code: 'low_res', params: { name: p.original_filename, width: size.width }, target: { kind: 'photos' } })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Images (browser)
// ---------------------------------------------------------------------------

export type PreparedImage = { bytes: Uint8Array; width: number; height: number; ext: 'jpg' | 'png' }
const cache = new Map<string, Promise<PreparedImage | null>>()

/**
 * Load a stored image for the PDF, re-encoded and capped in size. width/height are
 * the original pixels (low-resolution check). Banner and watermark are used as
 * uploaded (PNG keeps the watermark's transparency). Null if undecodable (HEIC).
 */
export function prepareImage(path: string, mode: 'photo' | 'asset' = 'photo'): Promise<PreparedImage | null> {
  const key = `${mode}:${path}`
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const blob = await (await fetch(await signedUrl(path))).blob()
        const bmp = await createImageBitmap(blob)
        const { width, height } = bmp
        const max = mode === 'asset' ? 2480 : 2400
        const scale = Math.min(1, max / Math.max(width, height))
        const c = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale))
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
        bmp.close()
        const type = mode === 'asset' ? 'image/png' : 'image/jpeg'
        const bytes = new Uint8Array(await (await c.convertToBlob({ type, quality: 0.9 })).arrayBuffer())
        return { bytes, width, height, ext: mode === 'asset' ? 'png' : 'jpg' }
      } catch {
        return null
      }
    })())
  }
  return cache.get(key)!
}

/** Collect the files a document needs and the DocData paths pointing at them. */
export async function gatherFiles(kind: DocKind, company: CompanyLike, images: Img[], settings: DocSettings) {
  const files: Record<string, Uint8Array> = {}
  const put = async (path: string | null | undefined, mode: 'photo' | 'asset', name: string) => {
    if (!path) return null
    const p = await prepareImage(path, mode)
    if (!p) return null
    const vfs = `/${name}.${p.ext}`
    files[vfs] = p.bytes
    return vfs
  }
  const banner = kind === 'specsheet' ? await put(company.doc_banner_path, 'asset', 'assets/banner') : null
  const watermark = kind === 'brochure' ? await put(company.doc_watermark_path, 'asset', 'assets/watermark') : null
  let cover: string | null = null
  const pages: string[] = []
  if (kind === 'brochure') {
    const sel = brochurePhotos(images, settings)
    cover = sel.cover ? await put(sel.cover.storage_path, 'photo', `photos/${sel.cover.id}`) : null
    for (const p of sel.photos) {
      const path = await put(p.storage_path, 'photo', `photos/${p.id}`)
      if (path) pages.push(path)
    }
  }
  return { files, paths: { cover, pages, banner, watermark } }
}

export async function photoSizes(images: Img[]) {
  const out: Record<string, { width: number; height: number } | null> = {}
  await Promise.all(images.map(async (i) => {
    const p = await prepareImage(i.storage_path)
    out[i.id] = p ? { width: p.width, height: p.height } : null
  }))
  return out
}
