import { Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { ErrorState, LoadingState } from './components/states'
import { useSession } from './session'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, reload } = useSession()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <main className="px-4 py-8 md:px-8">
        <LoadingState />
      </main>
    )
  }
  if (status === 'error') {
    return (
      <main className="px-4 py-8 md:px-8">
        <ErrorState retry={reload} />
      </main>
    )
  }
  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}
