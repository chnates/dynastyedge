import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from './components/shared/BottomNav'
import ThemeToggle from './components/shared/ThemeToggle'
import RosterView from './components/roster/RosterView'
import TradePartnerFinder from './components/trade/TradePartnerFinder'
import TradeAnalyzer from './components/trade/TradeAnalyzer'
import LineupOptimizer from './components/lineup/LineupOptimizer'
import LeagueOverview from './components/league/LeagueOverview'

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-white dark:bg-bg-primary text-gray-900 dark:text-text-primary font-body">
        <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 h-12 bg-gray-100 dark:bg-bg-secondary border-b border-gray-200 dark:border-border-default">
          <span className="font-display text-xl font-bold uppercase tracking-wide text-accent">
            DynastyEdge
          </span>
          <ThemeToggle />
        </header>

        <main
          className="pt-12 overflow-y-auto"
          style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/roster" replace />} />
            <Route path="/roster" element={<RosterView />} />
            <Route path="/trade" element={<TradePartnerFinder />} />
            <Route path="/trade/analyze" element={<TradeAnalyzer />} />
            <Route path="/lineup" element={<LineupOptimizer />} />
            <Route path="/league" element={<LeagueOverview />} />
          </Routes>
        </main>

        <BottomNav />
      </div>
    </HashRouter>
  )
}
