import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useSheetDrag } from '../../hooks/useSheetDrag'
import { useLeagueContext } from '../../context/LeagueContext'
import { POS_TEXT } from '../../utils/positionColors'
import TrendArrow from './TrendArrow'
import PlayerProfileDrawer from './PlayerProfileDrawer'

const MAX_RESULTS = 40

const normalize = s =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

// Global player search — reachable from the app header on every screen.
// Searches the cached FantasyCalc dataset by name and opens the matched
// player's profile. Self-contained: spawns the PlayerProfileDrawer on top
// (same z-50, rendered after, so it paints over the search results).
export default function PlayerSearchSheet({ onClose }) {
  const { values } = useLeagueContext()
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
          <div className="flex items-center gap-2 flex-1 min-w-0 rounded-lg bg-bg-card border border-border-default px-3 py-2">
            <Search size={16} strokeWidth={2} className="shrink-0 text-text-tertiary" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search any player…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent font-body text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {/* Results */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-3"
          style={{ overscrollBehavior: 'contain', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {normalize(query).length < 2 ? (
            <p className="font-body text-sm text-text-tertiary py-6 text-center">
              Type a name to search every player.
            </p>
          ) : results.length === 0 ? (
            <p className="font-body text-sm text-text-tertiary py-6 text-center">
              No players match “{query.trim()}”.
            </p>
          ) : (
            results.map(p => (
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
            ))
          )}
        </div>
      </div>

      {selected && (
        <PlayerProfileDrawer player={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
