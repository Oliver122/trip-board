import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

export const themeStorageKey = 'theme'

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(themeStorageKey)
    if (value === 'light' || value === 'dark' || value === 'system')
      return value
  } catch {
    /* private mode */
  }
  return 'system'
}

export function applyTheme(theme: ThemeChoice) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

type ThemeContextValue = {
  theme: ThemeChoice
  setTheme: (theme: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readTheme() === 'system') applyTheme('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: ThemeChoice) => {
    try {
      localStorage.setItem(themeStorageKey, next)
    } catch {
      /* private mode */
    }
    setThemeState(next)
    applyTheme(next)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider is missing')
  return value
}

/** Mirrors the `dark` class on `<html>`, including the system theme. */
export function useDark() {
  const { theme } = useTheme()
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const sync = () => {
      setDark(document.documentElement.classList.contains('dark'))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [theme])
  return dark
}
