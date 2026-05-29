import { useState } from 'react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )

  function toggle() {
    const next = !isDark
    const html = document.documentElement
    if (next) {
      html.classList.add('dark')
      localStorage.setItem('dynastyedge_theme', 'dark')
    } else {
      html.classList.remove('dark')
      localStorage.setItem('dynastyedge_theme', 'light')
    }
    setIsDark(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="w-8 h-8 flex items-center justify-center text-lg text-text-secondary dark:text-text-secondary hover:text-text-primary dark:hover:text-text-primary transition-colors"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
