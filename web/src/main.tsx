import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'
import App from './App'
import './i18n'
import { AuthProvider } from './lib/auth'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

/** Remount the app on language change so every label, date and number re-renders. */
function Localized() {
  const { i18n } = useTranslation()
  return (
    <>
      <App key={i18n.language} />
      <Toaster
        position={i18n.dir() === 'rtl' ? 'bottom-left' : 'bottom-right'}
        dir={i18n.dir()}
        toastOptions={{ style: { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: 6 } }}
      />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Localized />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
