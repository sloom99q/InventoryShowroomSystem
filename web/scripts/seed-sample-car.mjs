// Create (or refresh) the kit's fictional sample car — Valtren Orisa X5 — in a
// company, with every field, list, key feature and photo from
// kit/sample/sample-data.json, and the company's document assets from kit/assets.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-sample-car.mjs ["Company name"]
//
// Local development only. Re-running replaces the sample car's data, not duplicates it.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error('usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-sample-car.mjs ["Company name"]')
  process.exit(1)
}
const kit = new URL('../../kit/', import.meta.url)
const read = (p) => readFileSync(new URL(p, kit))
const sample = JSON.parse(read('sample/sample-data.json'))
const fields = JSON.parse(read('fields.json'))
const db = createClient(url, key, { auth: { persistSession: false } })
const must = ({ data, error }) => { if (error) throw error; return data }

const CHASSIS = 'LVTDB21B9RD012345' // fictional

// ---- Company -----------------------------------------------------------------
const companyName = process.argv[2]
const companies = must(await db.from('companies').select('*').order('created_at'))
const company = companyName ? companies.find((c) => c.name === companyName) : companies[0]
if (!company) throw new Error(`No company ${companyName ?? ''} — run scripts/bootstrap.mjs first`)

async function upload(path, bytes, contentType) {
  const { error } = await db.storage.from('vehicle-files').upload(path, bytes, { contentType, upsert: true })
  if (error) throw error
  return path
}
const banner = await upload(`${company.id}/branding/sample-spec-header-banner.jpg`, read('assets/spec-header-banner.jpg'), 'image/jpeg')
const watermark = await upload(`${company.id}/branding/sample-watermark-logo.png`, read('assets/watermark-logo.png'), 'image/png')
const bannerLeft = await upload(`${company.id}/branding/sample-banner-left.png`, read('assets/banner-left.png'), 'image/png')
const bannerText = await upload(`${company.id}/branding/sample-banner-text.png`, read('assets/banner-text.png'), 'image/png')
must(await db.from('companies').update({
  legal_name: sample.company.legal_name, signature_line: sample.company.signature,
  disclaimer: sample.company.disclaimer, doc_banner_path: banner, doc_watermark_path: watermark,
  doc_banner_left_path: bannerLeft, doc_banner_text_path: bannerText,
}).eq('id', company.id))

// ---- Vehicle -------------------------------------------------------------------
const id = sample.identity
const cap = (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
const vehicleRow = {
  company_id: company.id, chassis_number: CHASSIS, brand: cap(id.brand), model: cap(id.model).replace(/\bX5\b/i, 'X5'),
  year: Number(id.year), trim_level: id.trim, listing_price: id.listing_price, mileage_km: 12, status: 'in_stock',
  arrival_at: '2026-10-14T10:00:00+04:00', location: 'Showroom',
}
let vehicle = must(await db.from('vehicles').select('id').eq('company_id', company.id).eq('chassis_normalized', CHASSIS).maybeSingle())
if (vehicle) {
  must(await db.from('vehicles').update(vehicleRow).eq('id', vehicle.id))
  must(await db.from('vehicle_specs').delete().eq('vehicle_id', vehicle.id))
} else {
  vehicle = must(await db.from('vehicles').insert(vehicleRow).select('id').single())
}
const vid = vehicle.id

// ---- Fields, lists, key features ---------------------------------------------------
const sectionOf = new Map(fields.sections.flatMap((s) => [...(s.fields ?? []).map((f) => [f.key, s]), ...(s.list ? [[s.list, s]] : [])]))
const defOf = new Map([...fields.identity, ...fields.sections.flatMap((s) => s.fields ?? [])].map((f) => [f.key, f]))
const rows = []
let sort = 0
const field = (k, en, ar) => rows.push({
  company_id: company.id, vehicle_id: vid, field_key: k, label: defOf.get(k).label_en, label_alt: defOf.get(k).label_ar,
  section: sectionOf.get(k)?.title_en ?? null, value_en: en ?? null, value_ar: ar ?? null, verified: true, sort_order: ++sort,
})
field('description', id.description, null)
field('regional_specs', id.regional_specs?.en, id.regional_specs?.ar)
for (const [k, v] of Object.entries(sample.values)) field(k, v.en, v.ar)
for (const list of ['drive_modes', 'interior_features', 'smart_features']) {
  sample.lists[list].forEach((it, i) => rows.push({
    company_id: company.id, vehicle_id: vid, field_key: list, position: i + 1, label: sectionOf.get(list).title_en,
    section: sectionOf.get(list).title_en, value_en: it.en, value_ar: it.ar ?? null, verified: true, sort_order: ++sort,
  }))
}
sample.lists.key_features.forEach((t, i) => rows.push({
  company_id: company.id, vehicle_id: vid, field_key: 'key_features', position: i + 1, label: fields.key_features.label_en,
  section: fields.key_features.label_en, value_en: t, verified: true, sort_order: ++sort,
}))
must(await db.from('vehicle_specs').insert(rows))

// ---- Photos (cover + pages in the sample's order) -----------------------------------
const existing = must(await db.from('vehicle_images').select('id, original_filename').eq('vehicle_id', vid).is('deleted_at', null))
const byName = new Map(existing.map((i) => [i.original_filename, i.id]))
async function photo(rel, type) {
  const name = rel.split('/').pop()
  if (byName.has(name)) return byName.get(name)
  const bytes = read(`sample/${rel}`)
  const path = await upload(`${company.id}/${vid}/photos/${randomUUID()}.jpg`, bytes, 'image/jpeg')
  const row = must(await db.from('vehicle_images').insert({
    company_id: company.id, vehicle_id: vid, image_type: type, storage_path: path, original_filename: name, mime_type: 'image/jpeg', file_size: bytes.length,
  }).select('id').single())
  return row.id
}
const coverId = await photo(sample.photos.cover, 'current')
const photoIds = []
for (const p of sample.photos.pages) photoIds.push(await photo(p, 'arrival'))
// Banner photo: the sample names one of its photo pages.
const bannerId = photoIds[sample.photos.pages.indexOf(sample.photos.banner)] ?? coverId
must(await db.from('vehicles').update({ doc_settings: {
  brochure: { coverId, photoIds },
  banner: { photoId: bannerId, pos: sample.photos.banner_pos ?? '50% 50%', zoom: sample.photos.banner_zoom ?? 1 },
  docDate: sample.doc_date,
} }).eq('id', vid))

// ---- A little history so the header looks lived-in (like the mockup) ---------------
const acc = must(await db.from('accessories').select('id').eq('vehicle_id', vid))
if (!acc.length) must(await db.from('accessories').insert([
  ['physical_key', 'Physical key 1', 'present'], ['nfc_card', 'NFC card 1', 'present'], ['nfc_card', 'NFC card 2', 'present'],
  ['smart_key', 'Smart key 1', 'present'], ['charger', 'Charger (Type 2 portable)', 'missing'],
].map(([item_type, item_name, status]) => ({ company_id: company.id, vehicle_id: vid, item_type, item_name, status }))))
const exp = must(await db.from('expenses').select('id').eq('vehicle_id', vid).is('deleted_at', null))
if (!exp.length) must(await db.from('expenses').insert([
  ['PDI and detailing', 'maintenance', '850.00'], ['Window tint', 'accessories', '1200.00'], ['Transport from port', 'transportation', '400.00'],
].map(([title, category, amount]) => ({ company_id: company.id, vehicle_id: vid, title, category, amount, expense_date: '2026-10-15' }))))

console.log(`Sample car ready in "${company.name}": /vehicles/${vid}`)
