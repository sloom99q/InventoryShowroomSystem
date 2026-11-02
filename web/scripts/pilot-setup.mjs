// One-time setup of the PILOT instance (real data): the company with its
// branding and document settings, plus two logins. No vehicles, no test data.
// Refuses to run if the pilot already has a company.
//
//   node scripts/pilot-setup.mjs
//   ADMIN_EMAIL=… SECRETARY_EMAIL=… SECRETARY_NAME=… node scripts/pilot-setup.mjs
//
// Keys come from pilot/.env (written by scripts/pilot.sh). Passwords are
// generated and written to pilot/.credentials (readable only by you).
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(readFileSync(new URL('pilot/.env', root), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)))
const url = env.PILOT_API_URL
if (!url || !/:563\d\d$/.test(url)) throw new Error(`pilot/.env does not point at the pilot (${url})`)
const db = createClient(url, env.PILOT_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const must = ({ data, error }) => { if (error) throw error; return data }
const read = (p) => readFileSync(new URL(p, root))

if (must(await db.from('companies').select('id')).length) {
  console.error('The pilot already has a company. Nothing was changed.')
  process.exit(1)
}

const sample = JSON.parse(read('kit/sample/sample-data.json')) // company document details only (no car data)
const company = must(await db.from('companies').insert({
  name: 'SinoLink Motors', accent_color: '#b3121a', sidebar_color: '#ffffff', theme_mode: 'light', default_locale: 'en',
  legal_name: sample.company.legal_name, signature_line: sample.company.signature, disclaimer: sample.company.disclaimer,
}).select().single())

const upload = async (name, file, type) => {
  const path = `${company.id}/branding/${name}`
  const { error } = await db.storage.from('vehicle-files').upload(path, read(file), { contentType: type })
  if (error) throw error
  return path
}
must(await db.from('companies').update({
  logo_path: await upload('logo.png', 'web/scripts/assets/sinolink-logo.png', 'image/png'),
  logo_dark_path: await upload('logo-on-dark.png', 'web/scripts/assets/sinolink-logo-on-dark.png', 'image/png'),
  doc_banner_left_path: await upload('banner-left.png', 'kit/assets/banner-left.png', 'image/png'),
  doc_banner_text_path: await upload('banner-text.png', 'kit/assets/banner-text.png', 'image/png'),
  doc_banner_path: await upload('spec-header-banner.jpg', 'kit/assets/spec-header-banner.jpg', 'image/jpeg'),
  doc_watermark_path: await upload('watermark-logo.png', 'kit/assets/watermark-logo.png', 'image/png'),
}).eq('id', company.id))

const password = () => randomBytes(12).toString('base64url')
const people = [
  { email: process.env.ADMIN_EMAIL ?? 'sloom99q@gmail.com', name: process.env.ADMIN_NAME ?? 'Salem Alazzawi', role: 'admin' },
  { email: process.env.SECRETARY_EMAIL ?? 'secretary@sinolink.local', name: process.env.SECRETARY_NAME ?? 'Secretary', role: 'secretary' },
]
const lines = ['Pilot logins (SinoLink Motors). Keep this file private.', '']
for (const p of people) {
  const pw = password()
  must(await db.auth.admin.createUser({
    email: p.email, password: pw, email_confirm: true,
    app_metadata: { company_id: company.id, role: p.role }, user_metadata: { full_name: p.name },
  }))
  lines.push(`${p.role.padEnd(10)} ${p.email}  ${pw}`)
}
const credFile = new URL('pilot/.credentials', root)
writeFileSync(credFile, lines.join('\n') + '\n')
chmodSync(credFile, 0o600)
console.log(`Pilot ready: company "${company.name}", ${people.length} logins (admin, secretary). Passwords: pilot/.credentials`)
