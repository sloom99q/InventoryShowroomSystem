import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example)')

export const supabase = createClient<Database>(url, key)

export const BUCKET = 'vehicle-files'

/** Turn a Postgres/PostgREST error into a sentence the secretary can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null
  if (!e) return 'Something went wrong'
  if (e.code === '23505' && e.message?.includes('vehicles_company_chassis_key'))
    return 'A vehicle with this chassis number already exists'
  if (e.code === '23505') return e.message?.replace(/^duplicate key value violates unique constraint.*$/, 'This already exists') ?? 'This already exists'
  if (e.code === '42501') return e.message?.startsWith('new row violates') ? 'You do not have permission to do this' : e.message ?? 'Not permitted'
  if (e.code === '23514' && e.message?.includes('sold_has_date')) return 'A sold vehicle needs a sale date'
  if (e.code === '23514' && e.message?.includes('chassis_len')) return 'Chassis number must be 5–30 letters or digits'
  if (e.code === '23514') return 'One of the values is out of range'
  return e.message ?? 'Something went wrong'
}
