import { createClient } from '@supabase/supabase-js'
import i18n from '@/i18n'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example)')

export const supabase = createClient<Database>(url, key)

export const BUCKET = 'vehicle-files'

/** Turn a Postgres/PostgREST error into a sentence the secretary can act on. */
export function friendlyError(err: unknown): string {
  const t = i18n.t
  const e = err as { code?: string; message?: string } | null
  if (!e) return t('errors.generic')
  if (e.code === '23505' && e.message?.includes('vehicles_company_chassis_key')) return t('errors.duplicateChassis')
  if (e.code === '23505') return t('errors.exists')
  if (e.code === '42501') return t('errors.notPermitted')
  if (e.code === '23514' && e.message?.includes('sold_has_date')) return t('errors.soldNeedsDate')
  if (e.code === '23514' && e.message?.includes('chassis_len')) return t('errors.chassisLength')
  if (e.code === '23514') return t('errors.outOfRange')
  return e.message ?? t('errors.generic')
}
