import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PageLoader } from '@/components/ui/misc'
import { useAuth } from '@/lib/auth'
import { Dashboard } from '@/pages/Dashboard'
import { Login, NoAccess } from '@/pages/Login'
import { VehicleDetail } from '@/pages/VehicleDetail'
import { Vehicles } from '@/pages/Vehicles'
import { VehicleNew } from '@/pages/VehicleNew'

const Documents = lazy(() => import('@/pages/Documents'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const ImportExport = lazy(() => import('@/pages/ImportExport'))
const Staff = lazy(() => import('@/pages/Staff'))
const Settings = lazy(() => import('@/pages/Settings'))
const ImportFiles = lazy(() => import('@/pages/import/ImportFiles'))
const SalesDocuments = lazy(() => import('@/pages/documents/SalesDocuments'))

export default function App() {
  const { session, loading, profile, company, isAdmin } = useAuth()
  if (loading) return <PageLoader />
  if (!session) return <Login />
  if (!profile?.active || !company) return <NoAccess />

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="vehicles/new" element={<VehicleNew />} />
            <Route path="vehicles/import" element={<Navigate to="/vehicles/new?mode=documents" replace />} />
            <Route path="vehicles/:id" element={<VehicleDetail />} />
            <Route path="vehicles/:id/import" element={<ImportFiles key="existing" />} />
            <Route path="vehicles/:id/documents" element={<SalesDocuments />} />
            <Route path="documents" element={<Documents />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="import" element={<ImportExport />} />
            {isAdmin && <Route path="staff" element={<Staff />} />}
            {isAdmin && <Route path="settings" element={<Settings />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
