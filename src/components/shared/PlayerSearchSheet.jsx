import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useSheetDrag } from '../../hooks/useSheetDrag'
import { useLeagueContext } from '../../context/LeagueContext'
import { POS_TEXT } from '../../utils/positionColors'
import PlayerProfileDrawer from './PlayerProfileDrawer'
import { SearchInput, IconButton, TrendArrow } from '../ui'

const MAX_RESULTS = 40
const MAX_DESTINATIONS = 8

// Every navigable section/feature, by recognizable name (no verb/keyword
// synonym map yet — names only). Matched against label + section so typing a
// section word ("league") surfaces its views too. The dot wears the section's
// identity color, same hues as the side drawer.
const SECTION_DOT = {
  'The Edge': 'bg-accent',
  'My Team': 'bg-pos-wr',
  Trade: 'bg-success',
  League: 'bg-warning',
  Draft: 'bg-pos-qb',
  News: 'bg-pos-def',
}

const DESTINATIONS = [
  { label: 'The Edge', section: 'The Edge', to: '/edge' },
  { label: 'My Roster', section: 'My Team', to: '/my-team' },
  { label: 'Lineup Optimizer', section: 'My Team', to: '/my-team/lineup' },
  { label: 'Season Review', section: 'My Team', to: '/my-team/season-review' },
  { label: 'Dynasty Trajectory', section: 'My Team', to: '/my-team/trajectory' },
  { label: 'Trade Partners', section: 'Trade', to: '/trade' },
  { label: 'Trade Analyzer', section: 'Trade', to: '/trade/analyze' },
  { label: 'Trade Targets', section: 'Trade', to: '/trade/whats-fair' },
  { label: 'Manager Scouting', section: 'Trade', to: '/trade/managers' },
  { label: 'Pick Trade Calculator', section: 'Trade', to: '/trade/pick-trades' },
  { label: 'League Overview', section: 'League', to: '/league' },
  { label: 'Free Agents', section: 'League', to: '/league/free-agents' },
  { label: 'League Activity', section: 'League', to: '/league/activity' },
  { label: 'Market Movers', section: 'League', to: '/league/movers' },
  { label: 'Playoff Odds', section: 'League', to: '/league/playoffs' },
  { label: 'Draft Board', section: 'Draft', to: '/draft/board' },
  { label: 'Draft Tracker', section: 'Draft', to: '/draft/tracker' },
  { label: 'News', section: 'News', to: '/news' },
]

const normalize = s =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

const DESTINATION_INDEX = DESTINATIONS.map(d => ({
  ...d,
  haystack: normalize(`${d.label} ${d.section}`),
}))

// Global player search — reachable from the app header on every screen.
// Searches the cached FantasyCalc dataset by name and opens the matched
// player's profile. Self-contained: spawns the PlayerProfileDrawer on top
// (same z-50, rendered after, so it paints over the search results).
export default function PlayerSearchSheet({ onClose }) {
  const { values } = useLeagueContext()
  const navigate = useNavigate()
  const overlayRef = useRef(null)
  const inputRef = useRef(null)
  const { sheetRef, scrollRef } = useSheetDrag(onClose)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  // Track the visual viewport so the sheet stays within the area above the
  // iOS keyboard. `fixed` + `vh` use the layout viewport, which doesn't shrink
  // when the keyboard opens — without this the result list overflows off the
  // top of the screen and the search header scrolls out of view.
  const [vp, setVp] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }))

  useScrollLock()

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const sync = () => setVp({ height: vv.height, offsetTop: vv.offsetTop })
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Bring up the keyboard on open.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [])

  const destinations = useMemo(() => {
    const q = normalize(query)
    if (q.length < 2) return []
    return DESTINATION_INDEX.filter(d => d.haystack.includes(q)).slice(0, MAX_DESTINATIONS)
  }, [query])

  const results = useMemo(() => {
    const q = normalize(query)
    if (q.length < 2 || !values?.playerMap) return []
    return Object.values(values.playerMap)
      .filter(p => normalize(p.name).includes(q))
      .sort((a, b) => (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity))
      .slice(0, MAX_RESULTS)
  }, [query, values])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  function goTo(to) {
    navigate(to)
    onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed left-0 right-0 z-50 flex items-end bg-black/60"
      style={{
        top: vp.offsetTop,
        height: vp.height,
        // The visual viewport reaches under the status bar in standalone mode;
        // pad the top by the safe-area inset (+ a small gap) so a long list
        // caps below the notch instead of sliding the header off-screen.
        //
        // Unlike the Trade Analyzer add sheet, this only needs the safe-area
        // inset — NOT the app header's height. This sheet is mounted at the
        // shell level (App.jsx, a sibling of <header>), so its z-50 shares the
        // root stacking context with the header's z-30 and paints ABOVE it —
        // a deliberate full-screen search takeover, never covered. Don't copy
        // the header-height padding from TradeBuilder here: it would leave a
        // dead gap of dimmed backdrop at the top and break the takeover.
        paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
      }}
    >
      <div
        ref={sheetRef}
        className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default flex flex-col max-h-full min-h-0"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>

        {/* Search header (fixed; results scroll below it) */}
        <div className="flex items-center gap-2 px-4 pt-1 pb-3 border-b border-border-default shrink-0">
          <div className="flex-1 min-w-0">
            <SearchInput
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search players & features…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <IconButton onClick={onClose} label="Close search">
            <X size={20} strokeWidth={1.75} />
          </IconButton>
        </div>

        {/* Results */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-3"
          style={{ overscrollBehavior: 'contain', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {normalize(query).length < 2 ? (
            <p className="font-body text-sm text-text-tertiary py-6 text-center">
              Search any player, section, or feature.
            </p>
          ) : destinations.length === 0 && results.length === 0 ? (
            <p className="font-body text-sm text-text-tertiary py-6 text-center">
              No matches for “{query.trim()}”.
            </p>
          ) : (
          <>
            {destinations.length > 0 && (
              <div className="pt-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary px-1 pb-1">
                  Jump to
                </p>
                {destinations.map(d => (
                  <button
                    key={d.to}
                    onClick={() => goTo(d.to)}
                    className="w-full py-2.5 border-b border-border-default last:border-0 text-left active:opacity-60 transition-opacity flex items-center gap-2.5"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SECTION_DOT[d.section] ?? 'bg-text-tertiary'}`} />
                    <span className="flex-1 font-body font-medium text-sm text-text-primary truncate min-w-0">
                      {d.label}
                    </span>
                    <span className="font-body text-[11px] text-text-tertiary shrink-0 uppercase tracking-wide">
                      {d.section}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {results.length > 0 && (
              <div className="pt-2">
                {destinations.length > 0 && (
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary px-1 pb-1">
                    Players
                  </p>
                )}
                {results.map(p => (
              <button
                key={p.sleeperId}
                onClick={() => setSelected(p)}
                className="w-full py-2.5 border-b border-border-default last:border-0 text-left active:opacity-60 transition-opacity"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-body font-medium text-sm text-text-primary truncate min-w-0">
                    {p.name}
                  </span>
                  <span className="font-body text-[11px] text-text-tertiary shrink-0 uppercase tracking-wide">
                    {p.team}
                  </span>
                  <span className={`font-body text-[10px] font-semibold shrink-0 uppercase ${POS_TEXT[p.position] ?? 'text-text-tertiary'}`}>
                    {p.position}
                  </span>
                  <span className="font-mono text-sm font-semibold text-text-primary shrink-0 w-12 text-right tabular-nums">
                    {(p.value ?? 0).toLocaleString()}
                  </span>
                  <span className="shrink-0 w-4 text-center">
                    <TrendArrow trend={p.trend30Day ?? 0} />
                  </span>
                </div>
              </button>
                ))}
              </div>
            )}
          </>
          )}
        </div>
      </div>

      {selected && (
        <PlayerProfileDrawer player={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
