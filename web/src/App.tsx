import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PageLoader } from '@/components/ui/misc'
import { useAuth } from '@/lib/auth'
import { Login, NoAccess } from '@/pages/Login'
import CarsPage from '@/pages/cars/CarsPage'

const AddCar = lazy(() => import('@/pages/cars/AddCar'))
const CarPage = lazy(() => import('@/pages/car/CarPage'))
const AftersalesHome = lazy(() => import('@/pages/aftersales/AftersalesHome'))
const AftersalesCar = lazy(() => import('@/pages/aftersales/AftersalesCar'))
const AftersalesSettings = lazy(() => import('@/pages/aftersales/AftersalesSettings'))
const Documents = lazy(() => import('@/pages/Documents'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const ImportExport = lazy(() => import('@/pages/ImportExport'))
const Staff = lazy(() => import('@/pages/Staff'))
const Settings = lazy(() => import('@/pages/Settings'))
const ImportFiles = lazy(() => import('@/pages/import/ImportFiles'))
const SalesDocuments = lazy(() => import('@/pages/documents/SalesDocuments'))

/** The old "Fill specs" page is now the car page's Specs tab. */
function ToSpecs() {
  const { id } = useParams()
  return <Navigate to={`/vehicles/${id}`} replace />
}

export default function App() {
  const { session, loading, profile, company, isAdmin } = useAuth()
  if (loading) return <PageLoader />
  if (!session) return <Login />
  if (!profile?.active || !company) return <NoAccess />
  const aftersales = ['admin', 'sales_manager', 'secretary', 'technician'].includes(profile.role)

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/vehicles" replace />} />
            <Route path="vehicles" element={<CarsPage />} />
            <Route path="vehicles/new" element={<AddCar />} />
            <Route path="vehicles/import" element={<Navigate to="/vehicles/new" replace />} />
            <Route path="vehicles/:id" element={<CarPage />} />
            {isAdmin && <Route path="vehicles/:id/import" element={<ImportFiles key="existing" />} />}
            <Route path="vehicles/:id/specs" element={<ToSpecs />} />
            <Route path="vehicles/:id/documents" element={<SalesDocuments />} />
            {aftersales && <Route path="aftersales" element={<AftersalesHome />} />}
            {aftersales && <Route path="aftersales/:id" element={<AftersalesCar />} />}
            {(isAdmin || profile.role === 'sales_manager') && <Route path="aftersales/settings" element={<AftersalesSettings />} />}
            <Route path="documents" element={<Documents />} />
            <Route path="expenses" element={<Expenses />} />
            {isAdmin && <Route path="import" element={<ImportExport />} />}
            {isAdmin && <Route path="staff" element={<Staff />} />}
            {isAdmin && <Route path="settings" element={<Settings />} />}
            <Route path="*" element={<Navigate to="/vehicles" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
