import { CarFront, FileText, LayoutGrid, LogOut, Menu, Plus, Receipt, Settings, Upload, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCompany } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { ROLE_LABEL } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { GlobalSearch } from './GlobalSearch'
import { buttonVariants } from './ui/button'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/vehicles', label: 'Vehicles', icon: CarFront },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/import', label: 'Import & export', icon: Upload },
]
const ADMIN_NAV = [
  { to: '/staff', label: 'Staff & access', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { company, profile, isAdmin } = useCompany()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] transition-colors [&_svg]:size-[17px]',
      isActive ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised/60 hover:text-ink',
    )
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-7 items-center justify-center rounded-md border border-accent/40 text-accent">
          <CarFront className="size-4" aria-hidden />
        </span>
        <span className="truncate text-[15px] font-semibold tracking-tight">{company.name}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={link} onClick={onNavigate}>
            <Icon aria-hidden /> {label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="mx-3 my-3 border-t border-line-soft" />
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={link} onClick={onNavigate}>
                <Icon aria-hidden /> {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="flex items-center gap-3 border-t border-line-soft px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-[12px] font-semibold text-ink-2">
          {(profile.full_name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{profile.full_name || 'Staff member'}</p>
          <p className="truncate text-[12px] text-ink-3">{ROLE_LABEL[profile.role]}</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label="Sign out" title="Sign out">
          <LogOut />
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { canWrite } = useCompany()

  return (
    <div className="min-h-dvh lg:ps-60">
      <aside className="fixed inset-y-0 start-0 z-20 hidden w-60 border-e border-line-soft bg-[#141619] lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 border-e border-line-soft bg-[#141619]">
            <button className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'absolute end-3 top-4')} onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line-soft bg-bg/90 px-4 backdrop-blur sm:px-6">
        <button className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'lg:hidden')} onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu />
        </button>
        <GlobalSearch className="max-w-xl flex-1" />
        {canWrite && (
          <Link to="/vehicles/new" className={cn(buttonVariants({ variant: 'primary' }), 'ms-auto')}>
            <Plus aria-hidden /> <span className="hidden sm:inline">Add vehicle</span>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
