import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Zap, Users, ArrowLeftRight, Trophy, FileText, Newspaper,
  RefreshCw, Sun, Moon, LogOut, Check, X, Loader2,
} from 'lucide-react'
import DynastyEdgeLogo from './DynastyEdgeLogo'
import TeamAvatar from './TeamAvatar'
import { cn } from '../ui'
import { useLeagueContext } from '../../context/LeagueContext'
import { useIdentity } from '../../hooks/useIdentity'
import { getTeamName } from '../../hooks/useLeague'
import { loadNewsFeed, getNewsFeedUpdatedAt, getNewsFeedFetchedAt } from '../../hooks/usePlayerIntel'
import { loadHistory, getHistoryFetchedAt } from '../../hooks/useValueHistory'

// Feed-age readout for the two Actions-published feeds. Both die silently by
// design (the client hides stale feeds), so the drawer is the one place their
// age is visible. Amber past these thresholds: the news cron runs twice an
// hour (2h ≈ four missed runs), the values cron daily (36h ≈ a missed day).
const NEWS_STALE_MS = 2 * 60 * 60 * 1000
const VALUES_STALE_MS = 36 * 60 * 60 * 1000

// How long "Updated ✓" lingers before the button settles back to idle.
const DONE_LINGER_MS = 2200
// Floor on the visible "Refreshing…" phase. Sleeper + the two CDN feeds often
// resolve in a few hundred ms, so without this the spinner/ticks flash by
// faster than the eye catches and the button looks like it did nothing.
const MIN_REFRESH_MS = 800

// "2m ago" / "3h ago" from an epoch-ms timestamp — the per-source last-refreshed
// line. Null when never fetched so the row can hide.
function formatAgo(ts) {
  if (!ts) return null
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

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
  isDark,
  onToggleTheme,
}) {
  const { league, sleeperRetry, fcRetry, sleeperFetchedAt, fcFetchedAt } = useLeagueContext()
  const { clearIdentity } = useIdentity()
  const myOwner = league?.myRoster?.owner ?? null
  const myTeamName = myOwner ? getTeamName(myOwner) : null

  const touchStartX = useRef(null)

  // Feed timestamps for the two Actions-published feeds. `pub` = the feed's own
  // publish time (updatedAt — news twice/hour, values daily); `fetched` = when
  // this session last pulled it. The live APIs (Sleeper/FC) carry their own
  // fetch time via context, so only the feed stamps live in local state.
  const [feed, setFeed] = useState({ newsPub: null, valuesPub: null, newsFetched: null, historyFetched: null })
  function readFeedStamps() {
    setFeed(f => ({ ...f, newsPub: getNewsFeedUpdatedAt(), newsFetched: getNewsFeedFetchedAt() }))
  }
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    loadNewsFeed().then(() => {
      if (!cancelled) setFeed(f => ({ ...f, newsPub: getNewsFeedUpdatedAt(), newsFetched: getNewsFeedFetchedAt() }))
    })
    loadHistory().then(h => {
      if (!cancelled) setFeed(f => ({ ...f, valuesPub: h?.updatedAt ?? null, historyFetched: getHistoryFetchedAt() }))
    })
    return () => { cancelled = true }
  }, [isOpen])

  // Per-source status rows: app-side "last refreshed" for all four, plus the
  // publish age for the two feeds (that's the number that only moves when the
  // cron publishes — labelled "feed" so it reads as a separate thing).
  const dataStatus = [
    { key: 'sleeper', label: 'Rosters', refreshed: formatAgo(sleeperFetchedAt) },
    { key: 'fc', label: 'Values', refreshed: formatAgo(fcFetchedAt) },
    {
      key: 'news', label: 'News', refreshed: formatAgo(feed.newsFetched),
      feedAge: formatFeedAge(feed.newsPub),
      feedStale: Date.now() - Date.parse(feed.newsPub ?? '') > NEWS_STALE_MS,
    },
    {
      key: 'history', label: 'History', refreshed: formatAgo(feed.historyFetched),
      feedAge: formatFeedAge(feed.valuesPub),
      feedStale: Date.now() - Date.parse(feed.valuesPub ?? '') > VALUES_STALE_MS,
    },
  ]

  // ── Refresh coordinator ────────────────────────────────────────────────────
  // One button, four independent sources fired in parallel and non-blocking.
  // `phase` drives the button (idle → refreshing → done → idle); `sources`
  // tracks each source's 'loading'|'done'|'error' for the per-source ticks.
  const [phase, setPhase] = useState('idle')
  const [sources, setSources] = useState({})
  const doneTimer = useRef(null)
  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current) }, [])

  function handleRefresh() {
    if (phase === 'refreshing') return
    if (doneTimer.current) { clearTimeout(doneTimer.current); doneTimer.current = null }
    const startedAt = Date.now()
    setPhase('refreshing')
    setSources({ sleeper: 'loading', fc: 'loading', news: 'loading', history: 'loading' })
    const mark = (key, ok) => setSources(s => ({ ...s, [key]: ok ? 'done' : 'error' }))

    const jobs = [
      // Live APIs — each retry resolves true/false and keeps cached data on
      // screen while it runs (stale-while-revalidate), so no view blanks. Their
      // fetch time updates reactively via context (sleeperFetchedAt/fcFetchedAt).
      Promise.resolve(sleeperRetry?.()).then(ok => mark('sleeper', ok !== false), () => mark('sleeper', false)),
      Promise.resolve(fcRetry?.()).then(ok => mark('fc', ok !== false), () => mark('fc', false)),
      // Actions-published feeds — force a fresh pull, then re-read the publish +
      // fetch stamps so both the "refreshed" line and feed age reflect it.
      loadNewsFeed(true).then(
        () => { readFeedStamps(); mark('news', true) },
        () => mark('news', false),
      ),
      loadHistory(true).then(
        h => { setFeed(f => ({ ...f, valuesPub: h?.updatedAt ?? null, historyFetched: getHistoryFetchedAt() })); mark('history', true) },
        () => mark('history', false),
      ),
    ]
    // Hold "Refreshing…" for at least MIN_REFRESH_MS so the animation is always
    // perceptible even when every source resolves in a few hundred ms.
    Promise.allSettled(jobs).then(() => {
      const wait = Math.max(0, MIN_REFRESH_MS - (Date.now() - startedAt))
      setTimeout(() => {
        setPhase('done')
        doneTimer.current = setTimeout(() => {
          setPhase('idle')
          setSources({})
          doneTimer.current = null
        }, DONE_LINGER_MS)
      }, wait)
    })
  }

  const refreshing = phase === 'refreshing'
  const justRefreshed = phase === 'done'

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

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
          >
            {justRefreshed ? (
              <Check size={18} strokeWidth={2} className="text-success" />
            ) : (
              <RefreshCw size={18} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
            )}
            <span className={cn('font-body font-medium text-[14px]', justRefreshed && 'text-success')}>
              {refreshing ? 'Refreshing…' : justRefreshed ? 'Updated ✓' : 'Refresh data'}
            </span>
          </button>

          {/* Per-source data status — last refreshed (app fetch time) for all
              four, always visible so "did it work?" is answerable at a glance.
              While a refresh runs, each row's leading glyph ticks
              spinner → ✓/✗. The two feeds also show their publish age ("feed
              Xh"), the number that only moves when the cron publishes. */}
          <div className="px-3 pt-1 pb-1.5 space-y-1">
            {dataStatus.map(({ key, label, refreshed, feedAge, feedStale }) => {
              const st = phase !== 'idle' ? (sources[key] ?? 'loading') : null
              return (
                <div key={key} className="flex items-center gap-2 text-[11px] font-body">
                  <span className="w-3 shrink-0 flex items-center justify-center">
                    {st === 'done' ? (
                      <Check size={11} strokeWidth={2.5} className="text-success" />
                    ) : st === 'error' ? (
                      <X size={11} strokeWidth={2.5} className="text-danger" />
                    ) : st === 'loading' ? (
                      <Loader2 size={11} strokeWidth={2.5} className="animate-spin text-text-secondary" />
                    ) : (
                      <span className="w-1 h-1 rounded-full bg-text-tertiary/50" />
                    )}
                  </span>
                  <span className="text-text-secondary">{label}</span>
                  <span className="ml-auto text-text-tertiary tabular-nums">
                    {refreshed ?? '—'}
                    {feedAge && (
                      <span className={cn('ml-1.5', feedStale ? 'text-warning' : 'text-text-tertiary/70')}>
                        · feed {feedAge}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

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
