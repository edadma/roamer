import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'

interface ThemeContextValue {
  theme: string | undefined
  isDark: boolean
  setTheme: (theme: string) => void
  toggleTheme: () => void
  systemTheme: 'dark' | 'light'
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const darkThemes = new Set([
  'dark', 'synthwave', 'halloween', 'forest', 'black',
  'luxury', 'dracula', 'business', 'night', 'coffee', 'dim', 'sunset',
])

interface ThemeProviderProps {
  defaultTheme?: string
  children: ReactNode
}

export function ThemeProvider({ defaultTheme, children }: ThemeProviderProps) {
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light'
  )
  const [theme, setThemeState] = useState<string | undefined>(() => defaultTheme ?? systemTheme)
  const isDark = theme ? darkThemes.has(theme) : systemTheme === 'dark'

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((t: string) => setThemeState(t), [])
  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const currentIsDark = current ? darkThemes.has(current) : systemTheme === 'dark'
      return currentIsDark ? 'light' : 'dark'
    })
  }, [systemTheme])

  const value = useMemo(() => ({
    theme, isDark, setTheme, toggleTheme, systemTheme,
  }), [theme, isDark, setTheme, toggleTheme, systemTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    const theme = document.documentElement.getAttribute('data-theme') ?? undefined
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme ? darkThemes.has(theme) : systemDark
    return {
      theme, isDark,
      setTheme: (t: string) => document.documentElement.setAttribute('data-theme', t),
      toggleTheme: () => {
        const current = document.documentElement.getAttribute('data-theme')
        const currentIsDark = current ? darkThemes.has(current) : systemDark
        document.documentElement.setAttribute('data-theme', currentIsDark ? 'light' : 'dark')
      },
      systemTheme: (systemDark ? 'dark' : 'light') as 'dark' | 'light',
    }
  }
  return ctx
}
