import {
  devUsersResponseSchema,
  type DevUsersResponse,
} from '@tripboard/shared'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

type DevUser = DevUsersResponse['users'][number]

type DevLoginState =
  | { status: 'loading'; users: null }
  | { status: 'off'; users: null }
  | { status: 'on'; users: DevUser[] }

const DevLoginContext = createContext<DevLoginState | null>(null)

export function DevLoginProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DevLoginState>({
    status: 'loading',
    users: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/auth/dev/users', {
          signal: controller.signal,
        })
        if (!response.ok) {
          if (!controller.signal.aborted)
            setState({ status: 'off', users: null })
          return
        }
        const body = devUsersResponseSchema.parse(await response.json())
        if (!controller.signal.aborted)
          setState({ status: 'on', users: body.users })
      } catch {
        if (controller.signal.aborted) return
        setState({ status: 'off', users: null })
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  return (
    <DevLoginContext.Provider value={state}>
      {children}
    </DevLoginContext.Provider>
  )
}

export function useDevLogin(): DevLoginState {
  const value = useContext(DevLoginContext)
  if (!value) throw new Error('DevLoginProvider is missing')
  return value
}

export function DevLoginBadge() {
  const { t } = useTranslation()
  const { status } = useDevLogin()
  if (status !== 'on') return null
  return (
    <span
      data-testid="dev-login-badge"
      className="rounded-[8px] border border-border px-2 py-1 text-xs text-muted"
    >
      {t('header.devLogin')}
    </span>
  )
}
