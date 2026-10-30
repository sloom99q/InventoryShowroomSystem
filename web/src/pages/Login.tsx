import { CarFront } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { supabase } from '@/lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form
        className="w-full max-w-sm"
        onSubmit={async (e) => {
          e.preventDefault()
          setLoading(true)
          setError('')
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
          setLoading(false)
          if (error) setError(error.message === 'Invalid login credentials' ? 'Email or password is incorrect' : error.message)
        }}
      >
        <span className="mb-8 flex size-10 items-center justify-center rounded-lg border border-accent/40 text-accent">
          <CarFront className="size-5" aria-hidden />
        </span>
        <h1 className="text-[24px] font-semibold">Sign in</h1>
        <p className="mt-1 mb-7 text-[13.5px] text-ink-2">Showroom inventory. Accounts are created by your admin.</p>
        <div className="flex flex-col gap-4">
          <Field label="Email">
            {(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />}
          </Field>
          <Field label="Password" error={error}>
            {(id, d) => (
              <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={d} aria-invalid={!!error} className="h-10" />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2">Sign in</Button>
        </div>
      </form>
    </div>
  )
}

export function NoAccess() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-[20px] font-semibold">This account has no showroom access</h1>
      <p className="max-w-sm text-[13.5px] text-ink-2">Ask your admin to add you as staff, or to re-activate your account.</p>
      <Button onClick={() => supabase.auth.signOut()}>Sign out</Button>
    </div>
  )
}
