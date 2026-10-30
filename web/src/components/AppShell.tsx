import { CarFront, FileText, LayoutGrid, LogOut, Menu, Plus, Receipt, Settings, Upload, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { LOCALES } from '@/i18n'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useSignedUrl } from '@/lib/files'
import { ROLE_LABEL } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { chromeIsDark } from '@/lib/theme'
import { GlobalSearch } from './GlobalSearch'
import { buttonVariants } from './ui/button'

const NAV = [
  { to: '/', key: 'dashboard', icon: LayoutGrid, end: true },
  { to: '/vehicles', key: 'vehicles', icon: CarFront },
  { to: '/documents', key: 'documents', icon: FileText },
  { to: '/expenses', key: 'expenses', icon: Receipt },
  { to: '/import', key: 'import', icon: Upload },
] as const
const ADMIN_NAV = [
  { to: '/staff', key: 'staff', icon: Users },
  { to: '/settings', key: 'settings', icon: Settings },
] as const

/** The company's own logo, picking the dark-background version when the sidebar is dark. */
export function CompanyLogo({ className }: { className?: string }) {
  const { company } = useCompany()
  const dark = chromeIsDark(company.sidebar_color)
  const path = dark ? company.logo_dark_path ?? company.logo_path : company.logo_path
  const url = useSignedUrl(path)
  if (!path) return <span className={cn('truncate text-[16px] font-semibold text-chrome-ink', className)}>{company.name}</span>
  // A light-only logo on a dark sidebar sits on its own white plate.
  const plate = dark && !company.logo_dark_path
  return (
    <span className={cn('flex min-w-0 items-center', plate && 'rounded-md bg-white px-3 py-2', className)}>
      {url.data ? <img src={url.data} alt={company.name} className="max-h-[76px] max-w-full object-contain" /> : <span className="h-12" />}
    </span>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { profile, isAdmin, setLocale } = useCompany()
  const { i18n } = useTranslation()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative flex h-10 items-center gap-3 rounded-md px-3 text-[14px] transition-colors [&_svg]:size-[18px]',
      isActive
        ? 'bg-chrome-hover font-medium text-chrome-ink before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-accent'
        : 'text-chrome-ink-2 hover:bg-chrome-hover hover:text-chrome-ink',
    )
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-28 items-center px-5">
        <CompanyLogo className="max-w-[200px]" />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2" aria-label={t('nav.main')}>
        {NAV.map(({ to, key, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest} className={link} onClick={onNavigate}>
            <Icon aria-hidden /> {t(`nav.${key}`)}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="mx-3 my-3 border-t border-chrome-line" />
            {ADMIN_NAV.map(({ to, key, icon: Icon }) => (
              <NavLink key={to} to={to} className={link} onClick={onNavigate}>
                <Icon aria-hidden /> {t(`nav.${key}`)}
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="px-4 pb-2">
        <div className="flex rounded-md border border-chrome-line p-0.5" role="group" aria-label={t('nav.language')}>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              aria-pressed={i18n.language === l.code}
              lang={l.code}
              className={cn(
                'h-7 flex-1 cursor-pointer rounded-sm text-[13px] transition-colors',
                i18n.language === l.code ? 'bg-chrome-hover font-medium text-chrome-ink' : 'text-chrome-ink-2 hover:text-chrome-ink',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-chrome-line px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chrome-hover text-[12px] font-semibold text-chrome-ink-2">
          {(profile.full_name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-chrome-ink">{profile.full_name || t('terms.staffMember')}</p>
          <p className="truncate text-[12px] text-chrome-ink-2">{ROLE_LABEL[profile.role]}</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-chrome-ink-2 hover:bg-chrome-hover hover:text-chrome-ink"
          aria-label={t('nav.signOut')}
          title={t('nav.signOut')}
        >
          <LogOut className="size-4 flip-rtl" />
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { canWrite } = useCompany()

  return (
    <div className="min-h-dvh lg:ps-64">
      <aside className="fixed inset-y-0 start-0 z-20 hidden w-64 border-e border-chrome-line bg-chrome lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-chrome shadow-xl">
            <button
              className="absolute end-3 top-4 flex size-8 cursor-pointer items-center justify-center rounded-md text-chrome-ink-2 hover:bg-chrome-hover"
              onClick={() => setMobileOpen(false)}
              aria-label={t('nav.closeMenu')}
            >
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line-soft bg-surface px-4 sm:px-6">
        <button className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'lg:hidden')} onClick={() => setMobileOpen(true)} aria-label={t('nav.openMenu')}>
          <Menu />
        </button>
        <GlobalSearch className="max-w-xl flex-1" />
        {canWrite && (
          <Link to="/vehicles/new" className={cn(buttonVariants({ variant: 'primary' }), 'ms-auto')}>
            <Plus aria-hidden /> <span className="hidden sm:inline">{t('actions.addVehicle')}</span>
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line-soft pb-5">
      <div>
        <h1 className="text-[24px] font-semibold">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
