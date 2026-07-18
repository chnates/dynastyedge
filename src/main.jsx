import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { syncThemeColorMeta } from './hooks/useTheme'

let storedTheme = null
try { storedTheme = localStorage.getItem('dynastyedge_theme') }
catch { /* storage blocked (private mode / DevTools) — fall back to dark */ }
const html = document.documentElement
if (storedTheme === 'light') {
  html.classList.remove('dark')
} else {
  html.classList.add('dark')
}
syncThemeColorMeta(storedTheme !== 'light')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
