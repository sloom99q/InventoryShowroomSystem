// Create a showroom company and its first admin account.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/bootstrap.mjs "Showroom name" admin@example.com 'password' "Full Name"
//
// Run once per company. The service-role key must never be put in the web app.
import { createClient } from '@supabase/supabase-js'

const [name, email, password, fullName = ''] = process.argv.slice(2)
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!name || !email || !password || !key) {
  console.error('usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap.mjs "Company" email password ["Full Name"]')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const { data: company, error: cErr } = await admin.from('companies').insert({ name }).select().single()
if (cErr) throw cErr

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
