import { useState, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useLeague } from './hooks/useLeague'
import { LeagueContext } from './context/LeagueContext'
import SideDrawer from './components/shared/SideDrawer'
import RosterView from './components/roster/RosterView'
import TradeLayout from './components/trade/TradeLayout'
import TradePartnerFinder from './components/trade/TradePartnerFinder'
import TradeAnalyzer from './components/trade/TradeAnalyzer'
import WhatsFair from './components/trade/WhatsFair'
import LineupOptimizer from './components/lineup/LineupOptimizer'
import LeagueOverview from './components/league/LeagueOverview'
import DraftPlaceholder from './components/draft/DraftPlaceholder'

const SECTION_NAMES = {
  '/roster': 'Roster',
  '/trade':  'Trade',
  '/lineup': 'Lineup',
  '/league': 'League',
  '/draft':  'Draft',
}

function getSectionName(pathname) {
  for (const [prefix, name] of Object.entries(SECTION_NAMES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return name
  }
  return 'DynastyEdge'
}

function formatTimestamp(ts) {
  if (!ts) return null
  const now = Date.now()
  const time = new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (now - ts > 3600000) {
    const date = new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
    return `Updated ${time} · ${date}`
  }
  return `Updated ${time}`
}

function AppShell({ leagueData }) {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )
  const edgeTouchStartX = useRef(null)

  const { loading, retry, sleeperFetchedAt, fcFetchedAt } = leagueData
  const ts1 = sleeperFetchedAt ?? 0
  const ts2 = fcFetchedAt ?? 0
  const lastUpdated = Math.max(ts1, ts2) || null

  function toggleTheme() {
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

  // Swipe right from left edge (≤20px) to open drawer
  function handleTouchStart(e) {
    const x = e.touches[0].clientX
    edgeTouchStartX.current = !drawerOpen && x < 20 ? x : null
  }

  function handleTouchEnd(e) {
    if (edgeTouchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - edgeTouchStartX.current
    if (deltaX > 50) setDrawerOpen(true)
    edgeTouchStartX.current = null
  }

  return (
    <div
      className="min-h-screen bg-bg-primary text-text-primary font-body"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        lastUpdated={formatTimestamp(lastUpdated)}
        onRefresh={retry}
        loading={loading}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <header className="fixed top-0 left-0 right-0 z-30 bg-bg-secondary border-b border-border-default">
        <div className="flex items-center h-12 px-1">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>
          <span className="font-body font-semibold text-[17px] text-text-primary ml-1">
            {getSectionName(location.pathname)}
          </span>
        </div>
      </header>

      <main
        className="fixed left-0 right-0 top-12 overflow-y-auto"
        style={{ bottom: 'env(safe-area-inset-bottom)' }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/roster" replace />} />
          <Route path="/roster" element={<RosterView />} />
          <Route path="/trade" element={<TradeLayout />}>
            <Route index element={<TradePartnerFinder />} />
            <Route path="analyze" element={<TradeAnalyzer />} />
            <Route path="whats-fair" element={<WhatsFair />} />
          </Route>
          <Route path="/lineup" element={<LineupOptimizer />} />
          <Route path="/league" element={<LeagueOverview />} />
          <Route path="/draft" element={<DraftPlaceholder />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const leagueData = useLeague()
  return (
    <LeagueContext.Provider value={leagueData}>
      <HashRouter>
        <AppShell leagueData={leagueData} />
      </HashRouter>
    </LeagueContext.Provider>
  )
}
