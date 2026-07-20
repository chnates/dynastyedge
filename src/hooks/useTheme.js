import { useState, useCallback } from 'react'

const THEME_KEY = 'dynastyedge_theme'

// Safari colors its status-bar area from this meta tag. Dark matches the
// app header (bg-secondary, #101013); light is deliberately #F2F3F5 —
// near, but not equal to, bg-secondary (#E7E9EC). Don't align it to
// #E7E9EC without an on-device light-mode check (regular Safari AND the
// standalone home-screen app).
export function syncThemeColorMeta(isDark) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#101013' : '#F2F3F5')
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
