import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

export const listFollowsMapKey = 'listFollowsMap'

export function readListFollowsMap(): boolean {
  try {
    return localStorage.getItem(listFollowsMapKey) === '1'
  } catch {
    return false
  }
}

type ListFollowsMapValue = {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const ListFollowsMapContext = createContext<ListFollowsMapValue | null>(null)

export function ListFollowsMapProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(() => readListFollowsMap())

  const setEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(listFollowsMapKey, next ? '1' : '0')
    } catch {
      /* private mode */
    }
    setEnabledState(next)
  }, [])

  return (
    <ListFollowsMapContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </ListFollowsMapContext.Provider>
  )
}

export function useListFollowsMap(): ListFollowsMapValue {
  const value = useContext(ListFollowsMapContext)
  if (value) return value
  return { enabled: readListFollowsMap(), setEnabled: () => undefined }
}
