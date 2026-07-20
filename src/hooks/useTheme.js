import { useState, useCallback } from 'react'

const THEME_KEY = 'dynastyedge_theme'

// The iOS status-bar color comes from the STATIC prefers-color-scheme
// theme-color metas in index.html (honored + updated live by the browser),
// not from a runtime JS swap — a single JS-mutated meta gets cached at launch
// in standalone mode, which is what produced a stuck black band before.

// Single source of truth for the theme toggle. The initial dark/light class
// is applied to <html> in main.jsx before first render; this hook reads that
// state and keeps localStorage + the class in sync on toggle.
export function useTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
      return next
    })
  }, [])

  return { isDark, toggleTheme }
}
