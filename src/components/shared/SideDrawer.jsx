import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Zap, Users, ArrowLeftRight, Trophy, FileText, Newspaper,
  RefreshCw, Sun, Moon, LogOut,
} from 'lucide-react'
import DynastyEdgeLogo from './DynastyEdgeLogo'
import TeamAvatar from './TeamAvatar'
import { useLeagueContext } from '../../context/LeagueContext'
import { useIdentity } from '../../hooks/useIdentity'
import { getTeamName } from '../../hooks/useLeague'
import { loadNewsFeed, getNewsFeedUpdatedAt } from '../../hooks/usePlayerIntel'
import { loadHistory } from '../../hooks/useValueHistory'

// Feed-age readout for the two Actions-published feeds. Both die silently by
// design (the client hides stale feeds), so the drawer is the one place their
// age is visible. Amber past these thresholds: the news cron runs twice an
// hour (2h ≈ four missed runs), the values cron daily (36h ≈ a missed day).
const NEWS_STALE_MS = 2 * 60 * 60 * 1000
const VALUES_STALE_MS = 36 * 60 * 60 * 1000

function formatFeedAge(iso) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return null
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// The drawer is the app's complete map: an always-expanded hierarchical tree
// (docs-sidebar pattern). Each section has an identity color — icons always
// wear it; the active child gets the tinted background + edge bar. Parent rows
// are both the group anchor and a destination (→ the section's default view);
// children sit indented on a color-tinted guide rail. Leaf sections (The Edge,
// News) are plain single rows with no children/rail.
const NAV_TREE = [
  { to: '/edge', label: 'The Edge', Icon: Zap, text: 'text-accent', activeBg: 'bg-accent/10', bar: 'bg-accent' },
  {
    to: '/my-team', label: 'My Team', Icon: Users,
    text: 'text-pos-wr', activeBg: 'bg-pos-wr/10', bar: 'bg-pos-wr', rail: 'bg-pos-wr/25',
    children: [
      { to: '/my-team', label: 'My Roster', end: true },
      { to: '/my-team/lineup', label: 'Lineup' },
      { to: '/my-team/season-review', label: 'Season Review' },
      { to: '/my-team/trajectory', label: 'Trajectory' },
    ],
  },
  {
    to: '/trade', label: 'Trade', Icon: ArrowLeftRight,
    text: 'text-success', activeBg: 'bg-success/10', bar: 'bg-success', rail: 'bg-success/25',
    children: [
      { to: '/trade', label: 'Partners', end: true },
      { to: '/trade/analyze', label: 'Analyzer' },
      { to: '/trade/whats-fair', label: 'Targets' },
      { to: '/trade/managers', label: 'Managers' },
      { to: '/trade/pick-trades', label: 'Pick Trades' },
    ],
  },
  {
    to: '/league', label: 'League', Icon: Trophy,
    text: 'text-warning', activeBg: 'bg-warning/10', bar: 'bg-warning', rail: 'bg-warning/25',
    children: [
      { to: '/league', label: 'Overview', end: true },
      { to: '/league/free-agents', label: 'Free Agents' },
      { to: '/league/activity', label: 'Activity' },
      { to: '/league/movers', label: 'Movers' },
      { to: '/league/playoffs', label: 'Playoffs' },
    ],
  },
  {
    to: '/draft', label: 'Draft', Icon: FileText,
    text: 'text-pos-qb', activeBg: 'bg-pos-qb/10', bar: 'bg-pos-qb', rail: 'bg-pos-qb/25',
    children: [
      { to: '/draft/board', label: 'Board' },
      { to: '/draft/tracker', label: 'Tracker' },
    ],
  },
  { to: '/news', label: 'News', Icon: Newspaper, text: 'text-pos-def', activeBg: 'bg-pos-def/10', bar: 'bg-pos-def' },
]

export default function SideDrawer({
  isOpen,
  onClose,
  lastUpdated,
  onRefresh,
  loading,
  isDark,
  onToggleTheme,
}) {
  const { league } = useLeagueContext()
  const { clearIdentity } = useIdentity()
  const myOwner = league?.myRoster?.owner ?? null
  const myTeamName = myOwner ? getTeamName(myOwner) : null

  const touchStartX = useRef(null)

  // Feed ages (news / values updatedAt) — read from the session-cached feed
  // loaders on drawer open (no fetch beyond each feed's one per session).
  // Best-effort: a feed that never loaded stays null and its segment hides.
  const [feedStamps, setFeedStamps] = useState({ news: null, values: null })
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    loadNewsFeed().then(() => {
      if (!cancelled) setFeedStamps(s => ({ ...s, news: getNewsFeedUpdatedAt() }))
    })
    loadHistory().then(h => {
      if (!cancelled) setFeedStamps(s => ({ ...s, values: h?.updatedAt ?? null }))
    })
    return () => { cancelled = true }
  }, [isOpen])

  const feedAges = [
    { label: 'News', age: formatFeedAge(feedStamps.news), stale: Date.now() - Date.parse(feedStamps.news ?? '') > NEWS_STALE_MS },
    { label: 'Values', age: formatFeedAge(feedStamps.values), stale: Date.now() - Date.parse(feedStamps.values ?? '') > VALUES_STALE_MS },
  ].filter(f => f.age !== null)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  function handlePanelTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }

  function handlePanelTouchEnd(e) {
    if (touchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    if (deltaX < -50) onClose()
    touchStartX.current = null
  }

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-[80vw] max-w-[300px] bg-bg-secondary border-r border-border-default flex flex-col transition-transform duration-[250ms] ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onTouchStart={handlePanelTouchStart}
        onTouchEnd={handlePanelTouchEnd}
        aria-hidden={!isOpen}
      >
        {/* Branding */}
        <div className="px-5 pt-5 pb-4">
          <DynastyEdgeLogo theme={isDark ? 'dark' : 'light'} size={88} />
          {myTeamName && (
            <div className="flex items-center gap-1.5 mt-2 select-none">
              <TeamAvatar owner={myOwner} size={18} />
              <p className="font-body text-[11px] text-text-tertiary">
                {myTeamName}
              </p>
            </div>
          )}
        </div>

        {/* Nav items — the complete app map */}
        <nav className="px-3 flex-1 overflow-y-auto min-h-0" style={{ overscrollBehavior: 'contain' }}>
          {NAV_TREE.map(({ to, label, Icon, text, activeBg, bar, rail, children }) =>
            children ? (
              <div key={to} className="mb-2">
                {/* Parent: group anchor + destination (→ section default) */}
                <NavLink
                  to={to}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150"
                >
                  <Icon size={20} strokeWidth={1.75} className={text} />
                  <span className="font-display text-[14px] uppercase tracking-[0.08em]">{label}</span>
                </NavLink>

                {/* Children — indented on a section-colored guide rail */}
                <div className="relative ml-[26px] mt-0.5">
                  <span className={`absolute left-0 top-1 bottom-1 w-[2px] ${rail}`} aria-hidden="true" />
                  {children.map(child => (
                    <NavLink
                      key={child.to + child.label}
                      to={child.to}
                      end={child.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `relative block pl-4 pr-3 py-2 rounded-r-lg font-body text-[13.5px] transition-colors duration-150 ` +
                        (isActive
                          ? `${text} ${activeBg} font-semibold`
                          : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full ${bar}`} />
                          )}
                          {child.label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              /* Leaf section — plain single row */
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-2 relative transition-colors duration-150 ` +
                  (isActive
                    ? `${text} ${activeBg}`
                    : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full ${bar}`} />
                    )}
                    <Icon size={20} strokeWidth={1.75} className={text} />
                    <span className="font-display text-[14px] uppercase tracking-[0.08em]">{label}</span>
                  </>
                )}
              </NavLink>
            )
          )}
        </nav>

        {/* Utility controls */}
        <div className="px-3 pt-2 pb-4 shrink-0">
          <div className="h-px bg-border-default mx-2 mb-3" />

          {lastUpdated && (
            <div className="px-3 py-1.5">
              <span className="font-body text-[11px] text-text-tertiary">{lastUpdated}</span>
            </div>
          )}

          {feedAges.length > 0 && (
            <div className="px-3 pb-1.5">
              <span className="font-body text-[11px] text-text-tertiary">
                {feedAges.map((f, i) => (
                  <span key={f.label}>
                    {i > 0 && ' · '}
                    <span className={f.stale ? 'text-warning' : ''}>
                      {f.label} {f.age}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          )}

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={18} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
            <span className="font-body font-medium text-[14px]">Refresh data</span>
          </button>

          <button
            onClick={onToggleTheme}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {isDark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
            <span className="font-body font-medium text-[14px]">
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          </button>

          <button
            onClick={() => { onClose(); clearIdentity() }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <LogOut size={18} strokeWidth={1.75} />
            <span className="font-body font-medium text-[14px]">
              {myTeamName ? 'Switch team' : 'Sign out'}
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
