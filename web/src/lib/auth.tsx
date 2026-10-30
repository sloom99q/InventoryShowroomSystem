import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { AppRole, Company, Profile } from './types'

type AuthState = {
  session: Session | null
  loading: boolean
  profile: Profile | null
  company: Company | null
  canWrite: boolean
  isAdmin: boolean
  canEditChassis: boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

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

  const role: AppRole | undefined = me.data?.profile?.active ? me.data.profile.role : undefined
  const value: AuthState = {
    session,
    loading: !ready || (!!userId && me.isLoading),
    profile: me.data?.profile ?? null,
    company: me.data?.company ?? null,
    canWrite: role === 'admin' || role === 'secretary' || role === 'staff',
    isAdmin: role === 'admin',
    canEditChassis: role === 'admin' || role === 'secretary',
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
