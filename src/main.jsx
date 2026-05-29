import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

const storedTheme = localStorage.getItem('dynastyedge_theme')
const html = document.documentElement
if (storedTheme === 'light') {
  html.classList.remove('dark')
} else {
  html.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
