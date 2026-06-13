import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useLeague } from './hooks/useLeague'
import { useTheme } from './hooks/useTheme'
import { LeagueContext } from './context/LeagueContext'
import SideDrawer from './components/shared/SideDrawer'
import LoadingSpinner from './components/shared/LoadingSpinner'
import EdgeView from './components/edge/EdgeView'

// The Edge stays eager — it's the default route and must render without a
// lazy-chunk flash. Every other section loads on first navigation.
const RosterLayout      = lazy(() => import('./components/roster/RosterLayout'))
const RosterView        = lazy(() => import('./components/roster/RosterView'))
const AllTeamsView      = lazy(() => import('./components/roster/AllTeamsView'))
const FreeAgentsView    = lazy(() => import('./components/roster/FreeAgentsView'))
const TradeLayout       = lazy(() => import('./components/trade/TradeLayout'))
const TradePartnerFinder = lazy(() => import('./components/trade/TradePartnerFinder'))
const TradeAnalyzer     = lazy(() => import('./components/trade/TradeAnalyzer'))
const WhatsFair         = lazy(() => import('./components/trade/WhatsFair'))
const LineupOptimizer   = lazy(() => import('./components/lineup/LineupOptimizer'))
const LeagueLayout      = lazy(() => import('./components/league/LeagueLayout'))
const LeagueOverview    = lazy(() => import('./components/league/LeagueOverview'))
const LeagueActivity    = lazy(() => import('./components/league/LeagueActivity'))
const MarketMovers      = lazy(() => import('./components/league/MarketMovers'))
const ManagersView      = lazy(() => import('./components/league/ManagersView'))
const DraftLayout       = lazy(() => import('./components/draft/DraftLayout'))
const DraftBoard        = lazy(() => import('./components/draft/DraftBoard'))
const DraftTracker      = lazy(() => import('./components/draft/DraftTracker'))
const PickTradeCalculator = lazy(() => import('./components/draft/PickTradeCalculator'))

const SECTION_NAMES = {
  '/edge':   'The Edge',
  '/roster': 'Roster',
  '/trade':  'Trade',
  '/lineup': 'Lineup',
  '/league': 'League',
  '/draft':  'Draft',
}

// Refetch league + value data when the app regains focus with stale data.
const STALE_AFTER_MS = 30 * 60 * 1000

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
  const { isDark, toggleTheme } = useTheme()
  const edgeTouchStartX = useRef(null)

  const { loading, retry, sleeperFetchedAt, fcFetchedAt } = leagueData
  const ts1 = sleeperFetchedAt ?? 0
  const ts2 = fcFetchedAt ?? 0
  const lastUpdated = Math.max(ts1, ts2) || null

  // Auto-refresh: when the Safari tab comes back into focus and the data is
  // older than 30 minutes, silently refetch. Views keep showing the cached
  // data while the refresh runs (stale-while-revalidate).
  useEffect(() => {
    function maybeRefresh() {
      if (document.visibilityState !== 'visible') return
      if (loading || !lastUpdated) return
      if (Date.now() - lastUpdated > STALE_AFTER_MS) retry()
    }
    document.addEventListener('visibilitychange', maybeRefresh)
    window.addEventListener('focus', maybeRefresh)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh)
      window.removeEventListener('focus', maybeRefresh)
    }
  }, [loading, lastUpdated, retry])

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
      className="min-h-screen app-bg text-text-primary font-body"
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

      <header
        className="fixed top-0 left-0 right-0 z-30 bg-bg-secondary/85 backdrop-blur-md border-b border-border-default"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
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

      {/* The scroll container runs to the physical bottom edge; the home-
          indicator clearance lives INSIDE it as padding so content scrolls
          edge-to-edge instead of clipping at a dead bar above the inset. */}
      <main
        className="fixed left-0 right-0 overflow-y-auto"
        style={{
          top: 'calc(3rem + env(safe-area-inset-top))',
          bottom: 0,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <Suspense fallback={<LoadingSpinner message="Loading…" />}>
          <Routes>
            <Route path="/" element={<Navigate to="/edge" replace />} />
            <Route path="/edge" element={<EdgeView />} />
            <Route path="/roster" element={<RosterLayout />}>
              <Route index element={<Navigate to="my-team" replace />} />
              <Route path="my-team" element={<RosterView />} />
              <Route path="teams" element={<AllTeamsView />} />
              <Route path="teams/:rosterId" element={<RosterView />} />
              <Route path="free-agents" element={<FreeAgentsView />} />
            </Route>
            <Route path="/trade" element={<TradeLayout />}>
              <Route index element={<TradePartnerFinder />} />
              <Route path="analyze" element={<TradeAnalyzer />} />
              <Route path="whats-fair" element={<WhatsFair />} />
            </Route>
            <Route path="/lineup" element={<LineupOptimizer />} />
            <Route path="/league" element={<LeagueLayout />}>
              <Route index element={<LeagueOverview />} />
              <Route path="activity" element={<LeagueActivity />} />
              <Route path="movers" element={<MarketMovers />} />
              <Route path="managers" element={<ManagersView />} />
            </Route>
            <Route path="/draft" element={<DraftLayout />}>
              <Route index element={<Navigate to="board" replace />} />
              <Route path="board" element={<DraftBoard />} />
              <Route path="tracker" element={<DraftTracker />} />
              <Route path="trades" element={<PickTradeCalculator />} />
            </Route>
          </Routes>
        </Suspense>
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
