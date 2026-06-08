import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { setVatEnabled } from './lib/taxConfig'
import { Login } from './pages/Login'
import { POS } from './pages/POS'
import { Products } from './pages/Products'
import { Cashiers } from './pages/Cashiers'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { AppLayout } from './components/AppLayout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App() {
  const checkSession = useAuthStore((s) => s.checkSession)

  useEffect(() => {
    checkSession()
    // Load the VAT on/off switch (defaults off for unregistered businesses)
    window.api?.getSettings?.().then((s) => setVatEnabled(s?.vat_enabled === 'true')).catch(() => {})
  }, [checkSession])

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<POS />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/cashiers" element={<Cashiers />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </HashRouter>
  )
}
