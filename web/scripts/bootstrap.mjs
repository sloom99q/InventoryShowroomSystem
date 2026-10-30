// Create a showroom company (tenant) and its first admin account.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/bootstrap.mjs "Showroom name" admin@example.com 'password' "Full Name"
//
// Optional branding (env): ACCENT=#b3121a SIDEBAR=#141b2d MODE=light LOCALE=ar
//   LOGO=path/to/logo.png LOGO_DARK=path/to/logo-on-dark.png
// Run once per company. The service-role key must never be put in the web app.
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const [name, email, password, fullName = ''] = process.argv.slice(2)
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!name || !email || !password || !key) {
  console.error('usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap.mjs "Company" email password ["Full Name"]')
  process.exit(1)
}
const env = process.env
const admin = createClient(url, key, { auth: { persistSession: false } })

const { data: company, error: cErr } = await admin
  .from('companies')
  .insert({
    name,
    ...(env.ACCENT && { accent_color: env.ACCENT }),
    ...(env.SIDEBAR && { sidebar_color: env.SIDEBAR }),
    ...(env.MODE && { theme_mode: env.MODE }),
    ...(env.LOCALE && { default_locale: env.LOCALE }),
  })
  .select()
  .single()
if (cErr) throw cErr

async function uploadLogo(file, slot) {
  if (!file) return
  const ext = extname(file).slice(1).toLowerCase().replace('jpeg', 'jpg')
  const path = `${company.id}/branding/${slot}-${crypto.randomUUID()}.${ext}`
  const { error } = await admin.storage.from('vehicle-files').upload(path, await readFile(file), { contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` })
  if (error) throw error
  await admin.from('companies').update({ [slot === 'logo' ? 'logo_path' : 'logo_dark_path']: path }).eq('id', company.id)
}
await uploadLogo(env.LOGO, 'logo')
await uploadLogo(env.LOGO_DARK, 'logo-dark')

const { data: user, error: uErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { company_id: company.id, role: 'admin' },
  user_metadata: { full_name: fullName },
})
if (uErr) {
  await admin.from('companies').delete().eq('id', company.id)
  throw uErr
}
console.log(`Created company "${company.name}" (${company.id}) and admin ${user.user.email}`)
