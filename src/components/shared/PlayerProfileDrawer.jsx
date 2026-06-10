import { useEffect, useMemo, useRef } from 'react'
import { X, ArrowRight, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TrendArrow from './TrendArrow'
import { usePlayerNews } from '../../hooks/usePlayerNews'
import { usePlayerIntel, relativeTime, TOUCH_LABEL } from '../../hooks/usePlayerIntel'
import { getPeakStatus } from '../../utils/peakWindows'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useLeagueContext } from '../../context/LeagueContext'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import { getTeamName } from '../../hooks/useLeague'

// ── Opportunity grade ────────────────────────────────────────────────────────

function getOpportunityGrade(position, positionRank, value) {
  if (position === 'QB') {
    if (positionRank <= 2) return 'A'
    if (positionRank <= 6) return 'B'
    if (positionRank <= 12) return 'C'
    return 'D'
  }
  if (position === 'WR') {
    if (positionRank <= 5 && value >= 5000) return 'A'
    if (positionRank <= 12) return 'B'
    if (positionRank <= 24) return 'C'
    return 'D'
  }
  if (position === 'RB') {
    if (positionRank <= 5 && value >= 4000) return 'A'
    if (positionRank <= 12) return 'B'
    if (positionRank <= 24) return 'C'
    return 'D'
  }
  if (position === 'TE') {
    if (positionRank <= 2) return 'A'
    if (positionRank <= 6) return 'B'
    if (positionRank <= 12) return 'C'
    return 'D'
  }
  return 'C'
}

const GRADE_STYLES = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-accent/20 text-accent border-accent/30',
  C: 'bg-warning/20 text-warning border-warning/30',
  D: 'bg-text-tertiary/20 text-text-tertiary border-text-tertiary/30',
}

const GRADE_LABELS = { A: 'Elite', B: 'Strong', C: 'Upside', D: 'Deep Stash' }

// ── Injury flag styles ───────────────────────────────────────────────────────

const FLAG_STYLES = {
  red:    { dot: 'bg-danger',   text: 'text-danger',   label: 'Injured' },
  yellow: { dot: 'bg-warning',  text: 'text-warning',  label: 'Questionable' },
  green:  { dot: 'bg-success',  text: 'text-success',  label: 'Active' },
}

// ── Role description per position ────────────────────────────────────────────

function getRoleDescription(position, positionRank) {
  if (position === 'QB') {
    if (positionRank <= 3) return 'Elite QB1 — top Superflex asset'
    if (positionRank <= 8) return 'QB1 starter — strong Superflex value'
    if (positionRank <= 15) return 'QB2 / streaming — situational Superflex'
    return 'Backup QB — minimal dynasty value'
  }
  if (position === 'WR') {
    if (positionRank <= 5) return 'WR1 profile — featured target in offense'
    if (positionRank <= 12) return 'WR2 profile — reliable weekly starter'
    if (positionRank <= 24) return 'WR3 / flex — target-share dependent'
    if (positionRank <= 40) return 'Depth / boom-bust upside'
    return 'Stash candidate — long-term dart throw'
  }
  if (position === 'RB') {
    if (positionRank <= 5) return 'Three-down workhorse — lead back role'
    if (positionRank <= 12) return 'Feature back or competitive timeshare'
    if (positionRank <= 24) return 'Timeshare / committee role'
    return 'Backup / handcuff value only'
  }
  if (position === 'TE') {
    if (positionRank <= 2) return 'Elite TE1 — target monster, positional scarcity'
    if (positionRank <= 6) return 'TE1 starter — reliable weekly production'
    if (positionRank <= 12) return 'TE2 / streaming — matchup dependent'
    return 'Depth TE — minimal standalone value'
  }
  return ''
}

// ── Comparable players ───────────────────────────────────────────────────────

function getComparables(player, playerMap) {
  const { position, value, age, sleeperId } = player
  if (!value || !position) return []

  const valueLow = value * 0.78
  const valueHigh = value * 1.28
  const ageLow = (age ?? 25) - 2.5
  const ageHigh = (age ?? 25) + 2.5

  return Object.values(playerMap)
    .filter(p =>
      p.sleeperId !== sleeperId &&
      p.position === position &&
      p.value >= valueLow &&
      p.value <= valueHigh &&
      p.age != null &&
      p.age >= ageLow &&
      p.age <= ageHigh
    )
    .sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))
    .slice(0, 4)
}

// ── Slot label ───────────────────────────────────────────────────────────────

function slotLabel(rosterPlayer) {
  if (!rosterPlayer) return 'Bench'
  if (rosterPlayer.isIR) return 'Injured Reserve'
  if (rosterPlayer.isTaxi) return 'Taxi Squad'
  if (rosterPlayer.isStarter) return 'Starting Lineup'
  return 'Bench'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlayerProfileDrawer({
  player, onClose, playerMap = {}, csvColumns = [],
  isDraftContext = false, note = '', onNoteChange = null,
  fpNotesMap = {},
}) {
  const overlayRef = useRef(null)
  const sheetRef   = useRef(null)
  const scrollRef  = useRef(null)
  const navigate = useNavigate()
  const ctx = useLeagueContext()
  const league = ctx?.league
  const values = ctx?.values

  const { injuryFlag, injuryStatus, injuryDetail, injuryNotes, loading: newsLoading } = usePlayerNews(player.sleeperId)
  const intel = usePlayerIntel(player.sleeperId, ctx?.nflState)
  const peak = getPeakStatus(player.position, player.age)
  const { toggleWatch, isWatched } = useWatchlist()
  const watched = isWatched(player.sleeperId)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Swipe-down-to-dismiss — native listeners so we can call preventDefault
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let startTime = 0
    let isDragging = false
    let currentDragY = 0

    function onTouchStart(e) {
      startY = e.touches[0].clientY
      startTime = Date.now()
      isDragging = false
      currentDragY = 0
      el.style.transition = 'none'
    }

    function onTouchMove(e) {
      const dy = e.touches[0].clientY - startY

      if (isDragging) {
        e.preventDefault()
        currentDragY = Math.max(0, dy)
        el.style.transform = `translateY(${currentDragY}px)`
        return
      }

      // Start drag only when at scroll top and moving downward
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      if (scrollTop === 0 && dy > 8) {
        isDragging = true
        e.preventDefault()
        currentDragY = Math.max(0, dy)
        el.style.transform = `translateY(${currentDragY}px)`
      }
    }

    function onTouchEnd() {
      if (!isDragging) return
      const elapsed = Math.max(1, Date.now() - startTime)
      const velocity = currentDragY / elapsed // px/ms

      if (currentDragY > 120 || velocity > 0.4) {
        onClose()
      } else {
        el.style.transition = 'transform 0.25s ease-out'
        el.style.transform = 'translateY(0)'
      }
      isDragging = false
      currentDragY = 0
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onClose])

  // Determine player ownership
  const { playerContext, ownerRoster } = useMemo(() => {
    if (!league) return { playerContext: 'loading', ownerRoster: null }
    const myRoster = league.myRoster
    if (myRoster?.players.some(p => p.sleeperId === player.sleeperId)) {
      return { playerContext: 'mine', ownerRoster: myRoster }
    }
    const found = (league.allRosters ?? []).find(
      r => r.rosterId !== myRoster?.rosterId && r.players.some(p => p.sleeperId === player.sleeperId)
    )
    if (found) return { playerContext: 'opponent', ownerRoster: found }
    return { playerContext: 'fa', ownerRoster: null }
  }, [league, player.sleeperId])

  // My roster's version of this player (for slot + competitors)
  const myRosterPlayer = useMemo(() => {
    if (!league?.myRoster || playerContext !== 'mine') return null
    return league.myRoster.players.find(p => p.sleeperId === player.sleeperId) ?? null
  }, [league, player.sleeperId, playerContext])

  // Competitors at same position on my roster
  const competitors = useMemo(() => {
    if (!league?.myRoster || !player.position || playerContext !== 'mine') return []
    return league.myRoster.players
      .filter(p => p.position === player.position && p.sleeperId !== player.sleeperId)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  }, [league, player.position, player.sleeperId, playerContext])

  // My roster players at same position (for FA context)
  const myPositionPlayers = useMemo(() => {
    if (!league?.myRoster || !player.position || playerContext !== 'fa') return []
    return league.myRoster.players
      .filter(p => p.position === player.position)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  }, [league, player.position, playerContext])

  // "Fills Need" for FA context
  const fillsNeed = useMemo(() => {
    if (!league || playerContext !== 'fa') return false
    const avgs = computeLeagueAverages(league.allRosters)
    const deltas = getPositionalDeltas(league.myRoster, avgs)
    return (deltas[player.position] ?? 0) < 0
  }, [league, playerContext, player.position])

  // Use context playerMap as fallback for comparables
  const resolvedPlayerMap = useMemo(() => {
    if (playerMap && Object.keys(playerMap).length > 0) return playerMap
    return values?.playerMap ?? {}
  }, [playerMap, values])

  const grade = useMemo(() =>
    getOpportunityGrade(player.position, player.positionRank ?? 99, player.value ?? 0),
  [player])

  const role = useMemo(() =>
    getRoleDescription(player.position, player.positionRank ?? 99),
  [player])

  const comparables = useMemo(() =>
    getComparables(player, resolvedPlayerMap),
  [player, resolvedPlayerMap])

  const myRankings = csvColumns
    .map(col => ({ name: col.name, rank: col.data?.[player.name?.toLowerCase()] ?? null }))
    .filter(r => r.rank != null)

  const fpNotes = fpNotesMap[player.sleeperId] ?? null

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  function handleAnalyzeTrade() {
    if (playerContext === 'opponent' && ownerRoster) {
      navigate('/trade/analyze', { state: { opponentRosterId: ownerRoster.rosterId, whatsFairTarget: player } })
    } else {
      navigate('/trade/analyze', { state: { preloadGivePlayer: player } })
    }
    onClose()
  }

  const flagStyle = FLAG_STYLES[injuryFlag] ?? FLAG_STYLES.green

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end bg-black/60"
    >
      <div ref={sheetRef} className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default">
        <div ref={scrollRef} className="max-h-[85vh] overflow-y-auto">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border-default">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${GRADE_STYLES[grade]}`}>
                {grade} — {GRADE_LABELS[grade]}
              </span>
              {player.position && (
                <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {player.position}
                </span>
              )}
              {!newsLoading && (
                <span className={`flex items-center gap-1 font-body text-[10px] ${flagStyle.text}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${flagStyle.dot}`} />
                  {flagStyle.label}
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-text-primary mt-1 leading-tight">
              {player.name}
            </h2>
            <p className="font-body text-sm text-text-secondary mt-0.5">
              {player.team || 'FA'}{player.age != null ? ` · Age ${Math.floor(player.age)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => toggleWatch(player.sleeperId)}
              aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${watched ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Star size={18} strokeWidth={1.75} className={watched ? 'fill-accent' : ''} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-6 pt-3 flex flex-col gap-4">

          {/* Player Status */}
          <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Player Status
            </p>
            {newsLoading ? (
              <div className="flex items-center gap-2 py-1">
                <div className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                <span className="font-body text-xs text-text-tertiary">Loading…</span>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${flagStyle.dot}`} />
                <div>
                  <p className={`font-body text-sm font-semibold ${flagStyle.text}`}>
                    {injuryStatus ?? 'Active'}
                    {injuryDetail ? ` — ${injuryDetail}` : ''}
                  </p>
                  {injuryNotes && (
                    <p className="font-body text-xs text-text-secondary mt-0.5 leading-snug">
                      {injuryNotes}
                    </p>
                  )}
                </div>
              </div>
            )}
            {(intel.depthChart || peak) && (
              <div className="mt-2.5 pt-2.5 border-t border-border-default flex flex-col gap-1">
                {intel.depthChart && (
                  <p className="font-body text-xs text-text-secondary">
                    Depth chart:{' '}
                    <span className="font-semibold text-text-primary">
                      {intel.depthChart.slot}{intel.depthChart.order ?? ''}
                    </span>
                    {player.team ? ` · ${player.team}` : ''}
                  </p>
                )}
                {peak && (
                  <p className={`font-body text-xs ${
                    peak.phase === 'ascending' ? 'text-success'
                      : peak.phase === 'peak' ? 'text-warning'
                      : 'text-danger'
                  }`}>
                    {peak.label}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Production — recent games in-season, last-season summary otherwise */}
          {(intel.loading || intel.seasonSummary || intel.recentGames.some(g => g.pts != null)) && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Production
              </p>
              {intel.loading ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  <span className="font-body text-xs text-text-tertiary">Loading stats…</span>
                </div>
              ) : (
                <>
                  {intel.seasonSummary && (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-semibold text-accent tabular-nums">
                          {intel.seasonSummary.ppg ?? intel.seasonSummary.pts}
                        </span>
                        <span className="font-body text-[10px] text-text-tertiary">
                          {intel.seasonSummary.ppg != null ? 'PPG' : 'PTS'} · {intel.seasonSummary.year} season
                        </span>
                      </div>
                      <div className="flex gap-4 mt-2">
                        {intel.seasonSummary.posRank != null && intel.position && (
                          <div>
                            <span className="font-mono text-sm text-text-primary tabular-nums">{intel.position}{intel.seasonSummary.posRank}</span>
                            <span className="font-body text-[10px] text-text-tertiary ml-1">finish</span>
                          </div>
                        )}
                        <div>
                          <span className="font-mono text-sm text-text-primary tabular-nums">{intel.seasonSummary.pts.toLocaleString()}</span>
                          <span className="font-body text-[10px] text-text-tertiary ml-1">pts</span>
                        </div>
                        {intel.seasonSummary.gp != null && (
                          <div>
                            <span className="font-mono text-sm text-text-primary tabular-nums">{intel.seasonSummary.gp}</span>
                            <span className="font-body text-[10px] text-text-tertiary ml-1">games</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {intel.recentGames.length > 0 && (
                    <div className={`flex flex-col gap-1 ${intel.seasonSummary ? 'mt-2.5 pt-2.5 border-t border-border-default' : ''}`}>
                      {intel.recentGames.map(g => (
                        <div key={g.week} className="flex items-center justify-between">
                          <span className="font-body text-xs text-text-tertiary">Week {g.week}</span>
                          <span className="font-mono text-xs text-text-primary tabular-nums">
                            {g.pts != null
                              ? `${g.pts.toFixed(1)} pts${g.touches != null ? ` · ${g.touches} ${TOUCH_LABEL[intel.position] ?? ''}` : ''}`
                              : 'DNP'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Latest News (ESPN — unofficial, hidden when unavailable) */}
          {intel.news.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Latest News
              </p>
              <div className="flex flex-col">
                {intel.news.map((n, i) => (
                  <div key={i} className={i < intel.news.length - 1 ? 'pb-2.5 mb-2.5 border-b border-border-default' : ''}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="flex-1 font-body text-sm font-medium text-text-primary leading-snug">
                        {n.headline}
                      </p>
                      {relativeTime(n.published) && (
                        <span className="font-body text-[10px] text-text-tertiary shrink-0">
                          {relativeTime(n.published)}
                        </span>
                      )}
                    </div>
                    {n.story && (
                      <p
                        className="font-body text-xs text-text-secondary mt-1 leading-snug"
                        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {n.story}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynasty value */}
          <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Dynasty Value
            </p>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-semibold text-accent tabular-nums">
                {(player.value ?? 0).toLocaleString()}
              </span>
              <TrendArrow trend={player.trend30Day ?? 0} />
            </div>
            <div className="flex gap-4 mt-2">
              {player.overallRank != null && (
                <div>
                  <span className="font-mono text-sm text-text-primary tabular-nums">#{player.overallRank}</span>
                  <span className="font-body text-[10px] text-text-tertiary ml-1">Overall</span>
                </div>
              )}
              {player.positionRank != null && (
                <div>
                  <span className="font-mono text-sm text-text-primary tabular-nums">#{player.positionRank}</span>
                  <span className="font-body text-[10px] text-text-tertiary ml-1">{player.position}</span>
                </div>
              )}
              {isDraftContext && player.adp != null && (
                <div>
                  <span className="font-mono text-sm text-text-primary tabular-nums">{Number(player.adp).toFixed(0)}</span>
                  <span className="font-body text-[10px] text-text-tertiary ml-1">Rookie ADP</span>
                </div>
              )}
            </div>
          </div>

          {/* Role / opportunity — hidden when FP dynasty outlook is available */}
          {role && !(isDraftContext && fpNotes?.dynastyOutlook) && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
                Dynasty Outlook
              </p>
              <p className="font-body text-sm text-text-primary leading-snug">{role}</p>
            </div>
          )}

          {/* External rankings */}
          {myRankings.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Ranking Sources
              </p>
              <div className="flex flex-col gap-2">
                {myRankings.map(r => (
                  <div key={r.name} className="flex items-center justify-between">
                    <span className="font-body text-sm text-text-secondary truncate mr-2">{r.name}</span>
                    <span className="font-mono text-sm font-medium text-text-primary tabular-nums flex-shrink-0">
                      #{r.rank}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border-default pt-2 mt-0.5">
                  <span className="font-body text-sm text-text-secondary">FantasyCalc</span>
                  <span className="font-mono text-sm font-medium text-accent tabular-nums flex-shrink-0">
                    #{player.overallRank ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Scouting Report (FantasyPros) */}
          {isDraftContext && fpNotes?.scoutingReport && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Scouting Report
              </p>
              <p className="font-body text-sm text-text-primary leading-relaxed">{fpNotes.scoutingReport}</p>
            </div>
          )}

          {/* Dynasty Outlook (FantasyPros) */}
          {isDraftContext && fpNotes?.dynastyOutlook && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-sm font-bold uppercase tracking-wide text-accent mb-2">
                Dynasty Outlook
              </p>
              <p className="font-body text-sm text-text-primary leading-relaxed">{fpNotes.dynastyOutlook}</p>
            </div>
          )}

          {/* Comparable players */}
          {comparables.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Comparable Players
              </p>
              <div className="flex flex-col gap-0">
                {comparables.map((comp, i) => (
                  <div
                    key={comp.sleeperId}
                    className={`flex items-center justify-between py-2 ${i < comparables.length - 1 ? 'border-b border-border-default' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-text-primary truncate">{comp.name}</p>
                      <p className="font-body text-[10px] text-text-tertiary">
                        {comp.team || 'FA'} · Age {Math.floor(comp.age ?? 0)} · #{comp.positionRank} {comp.position}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-medium text-text-secondary tabular-nums ml-2 flex-shrink-0">
                      {(comp.value ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend detail */}
          {player.trend30Day != null && Math.abs(player.trend30Day) > 50 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
                30-Day Trend
              </p>
              <div className="flex items-center gap-2">
                <TrendArrow trend={player.trend30Day} />
                <span className={`font-mono text-sm font-medium tabular-nums ${player.trend30Day > 0 ? 'text-success' : 'text-danger'}`}>
                  {player.trend30Day > 0 ? '+' : ''}{player.trend30Day} pts
                </span>
                <span className="font-body text-xs text-text-tertiary">over past 30 days</span>
              </div>
            </div>
          )}

          {/* Roster Context */}
          {league && playerContext !== 'loading' && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                {playerContext === 'mine' ? 'Your Roster' : playerContext === 'opponent' ? 'Roster' : `Your ${player.position ?? 'Position'}`}
              </p>

              {playerContext === 'mine' && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-body text-xs text-text-secondary">Slot:</span>
                    <span className="font-body text-xs font-semibold text-text-primary">
                      {slotLabel(myRosterPlayer)}
                    </span>
                  </div>
                  {competitors.length > 0 && (
                    <>
                      <p className="font-body text-[10px] text-text-tertiary mb-1.5">Position group</p>
                      <div className="flex flex-col gap-0">
                        {competitors.map((comp, i) => (
                          <div
                            key={comp.sleeperId}
                            className={`flex items-center justify-between py-1.5 ${i < competitors.length - 1 ? 'border-b border-border-default' : ''}`}
                          >
                            <p className="font-body text-xs text-text-primary truncate flex-1 min-w-0">{comp.name}</p>
                            <span className="font-mono text-xs text-text-secondary tabular-nums ml-2 flex-shrink-0">
                              {(comp.value ?? 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {playerContext === 'opponent' && ownerRoster && (
                <div>
                  <p className="font-body text-sm text-text-primary font-medium">
                    {getTeamName(ownerRoster.owner)}
                  </p>
                  {ownerRoster.owner?.username && (
                    <p className="font-body text-[11px] text-text-tertiary mt-0.5">
                      @{ownerRoster.owner.username}
                    </p>
                  )}
                </div>
              )}

              {playerContext === 'fa' && (
                <>
                  {fillsNeed && (
                    <div className="mb-2">
                      <span className="font-body text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 border border-success/30 rounded px-1.5 py-0.5">
                        Fills Need
                      </span>
                    </div>
                  )}
                  {myPositionPlayers.length > 0 ? (
                    <div className="flex flex-col gap-0">
                      {myPositionPlayers.map((rp, i) => {
                        const delta = (player.value ?? 0) - (rp.value ?? 0)
                        return (
                          <div
                            key={rp.sleeperId}
                            className={`flex items-center justify-between py-2 ${i < myPositionPlayers.length - 1 ? 'border-b border-border-default' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-body text-sm text-text-primary truncate">{rp.name}</p>
                              <p className="font-body text-[10px] text-text-tertiary truncate">
                                {rp.team || 'FA'} · #{rp.positionRank ?? '—'} {rp.position}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <span className="font-mono text-sm text-text-secondary tabular-nums">
                                {(rp.value ?? 0).toLocaleString()}
                              </span>
                              <span className={`font-mono text-xs font-semibold tabular-nums w-14 text-right ${
                                delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-tertiary'
                              }`}>
                                {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="font-body text-xs text-text-tertiary italic">No {player.position} on your roster</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Scout Note (Draft Board context only) */}
          {isDraftContext && (
            <div key={player.sleeperId} className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Scout Note
              </p>
              <textarea
                defaultValue={note}
                placeholder="Add a note about this prospect…"
                onBlur={e => onNoteChange?.(player.sleeperId, e.target.value)}
                rows={3}
                className="w-full bg-transparent font-body text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none leading-snug"
              />
            </div>
          )}

          {/* Analyze Trade button */}
          <button
            onClick={handleAnalyzeTrade}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-white font-body font-semibold text-sm active:opacity-80 transition-opacity"
          >
            Analyze Trade
            <ArrowRight size={16} strokeWidth={2} />
          </button>

        </div>
        </div>
      </div>
    </div>
  )
}
