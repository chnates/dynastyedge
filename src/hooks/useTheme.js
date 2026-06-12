import { useState, useCallback } from 'react'

const THEME_KEY = 'dynastyedge_theme'

// Safari colors its status-bar area from this meta tag — keep it matching
// the app header (bg-secondary) or the strip above the header looks wrong.
export function syncThemeColorMeta(isDark) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#16161A' : '#F4F4F8')
}

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
      syncThemeColorMeta(next)
      return next
    })
  }, [])

  return { isDark, toggleTheme }
}
