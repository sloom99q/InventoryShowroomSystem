import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import i18n, { type Locale } from '@/i18n'
import { supabase } from './supabase'
import { applyBranding } from './theme'
import type { AppRole, Company, Profile } from './types'

type AuthState = {
  session: Session | null
  loading: boolean
  profile: Profile | null
  company: Company | null
  canWrite: boolean
  isAdmin: boolean
  canEditChassis: boolean
  setLocale: (l: Locale) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const me = useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle()
      if (error) throw error
      if (!profile) return { profile: null, company: null }
      const { data: company } = await supabase.from('companies').select('*').eq('id', profile.company_id).single()
      return { profile, company }
    },
  })

  const profile = me.data?.profile ?? null
  const company = me.data?.company ?? null

  // Company branding and the user's language, once known.
  useEffect(() => {
    if (!company) return
    applyBranding(company)
    const lng = (profile?.locale ?? company.default_locale) as Locale
    if (i18n.language !== lng) i18n.changeLanguage(lng)
  }, [company, profile?.locale])

  async function setLocale(l: Locale) {
    await i18n.changeLanguage(l)
    if (profile) {
      await supabase.rpc('set_my_locale', { p_locale: l })
      qc.invalidateQueries({ queryKey: ['me'] })
    }
  }

  const role: AppRole | undefined = profile?.active ? profile.role : undefined
  const value: AuthState = {
    session,
    loading: !ready || (!!userId && (me.isPending || me.isFetching) && !me.data),
    profile,
    company,
    canWrite: role === 'admin' || role === 'secretary' || role === 'staff',
    isAdmin: role === 'admin',
    canEditChassis: role === 'admin' || role === 'secretary',
    setLocale,
  }
  return <Ctx value={value}>{children}</Ctx>
}

export function useAuth() {
  const v = use(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

/** For pages behind the auth gate: company and profile are guaranteed. */
export function useCompany() {
  const { company, profile, ...rest } = useAuth()
  if (!company || !profile) throw new Error('No company')
  return { company, profile, ...rest }
}
