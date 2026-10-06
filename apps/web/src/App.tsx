import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AccountPage } from './pages/AccountPage'
import { BoardPage } from './pages/BoardPage'
import { HomePage } from './pages/HomePage'
import { JoinPage } from './pages/JoinPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SchedulePage } from './pages/SchedulePage'
import { TripSettingsPage } from './pages/TripSettingsPage'
import { TripsPage } from './pages/TripsPage'
import { RequireAuth } from './RequireAuth'
import { SessionProvider } from './session'
import { ThemeProvider } from './theme'

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <SessionProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/join/:code" element={<JoinPage />} />
              <Route
                path="/trips"
                element={
                  <RequireAuth>
                    <TripsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/trips/:id"
                element={
                  <RequireAuth>
                    <BoardPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/trips/:id/settings"
                element={
                  <RequireAuth>
                    <TripSettingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/trips/:id/schedule"
                element={
                  <RequireAuth>
                    <SchedulePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account"
                element={
                  <RequireAuth>
                    <AccountPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
