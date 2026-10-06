import { BrowserRouter, Route, Routes } from 'react-router'
import { ActivityPage } from './admin/ActivityPage'
import { AdminGate } from './admin/AdminLayout'
import { AuditPage } from './admin/AuditPage'
import { DashboardPage } from './admin/DashboardPage'
import { RequestsPage } from './admin/RequestsPage'
import { SettingsPage } from './admin/SettingsPage'
import { StoragePage } from './admin/StoragePage'
import { TripPage } from './admin/TripPage'
import { TripsPage as AdminTripsPage } from './admin/TripsPage'
import { UserPage } from './admin/UserPage'
import { UsersPage } from './admin/UsersPage'
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
import { ListFollowsMapProvider } from './list-follows-map'
import { SessionProvider } from './session'
import { ThemeProvider } from './theme'

export function App() {
  return (
    <ThemeProvider>
      <ListFollowsMapProvider>
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
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminGate />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="users/:id" element={<UserPage />} />
                <Route path="trips" element={<AdminTripsPage />} />
                <Route path="trips/:id" element={<TripPage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="storage" element={<StoragePage />} />
                <Route path="requests" element={<RequestsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="audit" element={<AuditPage />} />
              </Route>
            </Routes>
          </SessionProvider>
        </BrowserRouter>
      </ListFollowsMapProvider>
    </ThemeProvider>
  )
}
