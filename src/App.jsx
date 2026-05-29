import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useLeague } from './hooks/useLeague'
import { LeagueContext } from './context/LeagueContext'
import BottomNav from './components/shared/BottomNav'
import ThemeToggle from './components/shared/ThemeToggle'
import RosterView from './components/roster/RosterView'
import TradeLayout from './components/trade/TradeLayout'
import TradePartnerFinder from './components/trade/TradePartnerFinder'
import TradeAnalyzer from './components/trade/TradeAnalyzer'
import WhatsFair from './components/trade/WhatsFair'
import LineupOptimizer from './components/lineup/LineupOptimizer'
import LeagueOverview from './components/league/LeagueOverview'

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

export default function App() {
  const leagueData = useLeague()
  const { loading, retry, sleeperFetchedAt, fcFetchedAt } = leagueData

  const ts1 = sleeperFetchedAt ?? 0
  const ts2 = fcFetchedAt ?? 0
  const lastUpdated = Math.max(ts1, ts2) || null

  return (
    <LeagueContext.Provider value={leagueData}>
      <HashRouter>
        <div className="min-h-screen bg-white dark:bg-bg-primary text-gray-900 dark:text-text-primary font-body">
          <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 h-12 bg-gray-100 dark:bg-bg-secondary border-b border-gray-200 dark:border-border-default">
            <span className="font-display text-xl font-bold uppercase tracking-wide text-accent">
              DynastyEdge
            </span>
            <div className="flex items-center gap-1">
              {lastUpdated && (
                <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary mr-1">
                  {formatTimestamp(lastUpdated)}
                </span>
              )}
              <button
                onClick={retry}
                disabled={loading}
                aria-label="Refresh data"
                className="w-11 h-11 flex items-center justify-center rounded-lg text-text-tertiary dark:text-text-tertiary hover:bg-gray-200 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                <RefreshCw size={17} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
              </button>
              <ThemeToggle />
            </div>
          </header>

          <main
            className="pt-12 overflow-y-auto"
            style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}
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
            </Routes>
          </main>

          <BottomNav />
        </div>
      </HashRouter>
    </LeagueContext.Provider>
  )
}
