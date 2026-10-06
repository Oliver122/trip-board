import { meResponseSchema, type MeResponse } from '@tripboard/shared'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { syncLocale } from './i18n'
import { browserLanguages, detectLocale } from './lib/locale'

type SessionState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'ready'; user: MeResponse }
  | { status: 'error'; user: null }

type SessionContextValue = SessionState & {
  reload: () => void
  setUser: (user: MeResponse) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    user: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/me', {
          credentials: 'include',
          signal: controller.signal,
        })
        if (response.status === 401) {
          await syncLocale(detectLocale(undefined, browserLanguages()))
          if (!controller.signal.aborted) {
            setState({ status: 'anonymous', user: null })
          }
          return
        }
        if (!response.ok) {
          if (!controller.signal.aborted)
            setState({ status: 'error', user: null })
          return
        }
        const user = meResponseSchema.parse(await response.json())
        await syncLocale(user.locale)
        if (!controller.signal.aborted) setState({ status: 'ready', user })
      } catch {
        if (controller.signal.aborted) return
        setState({ status: 'error', user: null })
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading', user: null })
    setAttempt((value) => value + 1)
  }, [])

  const setUser = useCallback((user: MeResponse) => {
    setState({ status: 'ready', user })
  }, [])

  return (
    <SessionContext.Provider value={{ ...state, reload, setUser }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider is missing')
  return value
}
