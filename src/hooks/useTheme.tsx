import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemeMode } from '../types'

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('kristory-theme')
    return (stored as ThemeMode) || 'system'
  })

  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const update = () => {
      let dark = false
      if (theme === 'dark') {
        dark = true
      } else if (theme === 'system') {
        dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      }
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
    }

    update()

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [theme])

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode)
    localStorage.setItem('kristory-theme', mode)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
