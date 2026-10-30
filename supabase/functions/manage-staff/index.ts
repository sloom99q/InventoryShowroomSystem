// Creates staff accounts for the caller's company. Only admins may call it.
// This is the only place the service-role key is used, and it never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ROLES = ['admin', 'secretary', 'staff', 'viewer']
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' })

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: userData } = await asCaller.auth.getUser()
  if (!userData.user) return reply(401, { error: 'Not signed in' })

  const { data: me } = await asCaller
    .from('profiles')
    .select('company_id, role, active')
    .eq('id', userData.user.id)
    .single()
  if (!me || !me.active || me.role !== 'admin') return reply(403, { error: 'Only an admin can add staff' })

  let body: { email?: string; password?: string; full_name?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'Invalid JSON' })
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.full_name ?? '').trim()
  const role = String(body.role ?? '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Enter a valid email address' })
  if (password.length < 10) return reply(400, { error: 'Password must be at least 10 characters' })
  if (!ROLES.includes(role)) return reply(400, { error: 'Unknown role' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // company_id comes from the caller's profile, never from the request body.
    app_metadata: { company_id: me.company_id, role },
    user_metadata: { full_name: fullName },
  })
  if (error) return reply(400, { error: error.message })
  return reply(200, { id: data.user.id, email: data.user.email })
})
