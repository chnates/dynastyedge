import { useState, useCallback } from 'react'

const THEME_KEY = 'dynastyedge_theme'

// iOS colors the status-bar area from this meta tag (and updates live on
// iOS 16.4+). Keep it EXACTLY matching the app header background (bg-secondary)
// in each theme, or the strip above the header reads as a mismatched bar.
// The manifest intentionally carries no static theme_color so this live value
// drives the installed standalone app instead of being overridden by it.
export function syncThemeColorMeta(isDark) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#16161A' : '#E9ECF5')
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
