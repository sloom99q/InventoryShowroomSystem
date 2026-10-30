import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { LOCALES } from '@/i18n'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

function LanguageSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="flex gap-1 text-[13px]">
      {LOCALES.map((l) => (
        <button key={l.code} lang={l.code} onClick={() => i18n.changeLanguage(l.code)} aria-pressed={i18n.language === l.code}
          className={cn('cursor-pointer rounded-md px-2.5 py-1', i18n.language === l.code ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function Login() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4"><LanguageSwitch /></div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form
          className="w-full max-w-sm rounded-lg border border-line-soft bg-surface p-7"
          onSubmit={async (e) => {
            e.preventDefault()
            setLoading(true)
            setError('')
            const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
            setLoading(false)
            if (error) setError(error.message === 'Invalid login credentials' ? t('wrong') : error.message)
          }}
        >
          <h1 className="text-[22px] font-semibold">{t('title')}</h1>
          <p className="mt-1 mb-6 text-[13.5px] text-ink-2">{t('subtitle')}</p>
          <div className="flex flex-col gap-4">
            <Field label={t('email')}>
              {(id) => <Input id={id} type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />}
            </Field>
            <Field label={t('password')} error={error}>
              {(id, d) => (
                <Input id={id} type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={d} aria-invalid={!!error} className="h-10" />
              )}
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2">{t('submit')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function NoAccess() {
  const { t } = useTranslation(['auth', 'common'])
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-[20px] font-semibold">{t('noAccessTitle')}</h1>
      <p className="max-w-sm text-[13.5px] text-ink-2">{t('noAccessBody')}</p>
      <Button onClick={() => supabase.auth.signOut()}>{t('common:nav.signOut')}</Button>
    </div>
  )
}
