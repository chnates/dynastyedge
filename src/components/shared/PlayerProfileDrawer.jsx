import { useMemo, useState } from 'react'
import { X, ArrowRight, Star, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NewsArticleSheet from './NewsArticleSheet'
import { usePlayerNews } from '../../hooks/usePlayerNews'
import { usePlayerIntel, relativeTime, TOUCH_LABEL } from '../../hooks/usePlayerIntel'
import { getPeakStatus } from '../../utils/peakWindows'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useLeagueContext } from '../../context/LeagueContext'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import { getTeamName } from '../../hooks/useLeague'
import { POS_TEXT } from '../../utils/positionColors'
import { Sheet, IconButton, Button, Badge, Card, TrendArrow, cn } from '../ui'

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

// ── Rookie opportunity (Draft › Research) ────────────────────────────────────
// Rendered only when the drawer is opened from Draft › Research, which hands in
// the row it was showing. The scouting read the user just tapped is the reason
// they opened the sheet, so it leads the body — a value number alone doesn't
// answer "is he going to play?".

const OPP_TIER = {
  strong: { text: 'text-success', label: 'Strong opportunity' },
  fair:   { text: 'text-warning', label: 'Fair opportunity' },
  weak:   { text: 'text-text-tertiary', label: 'Thin opportunity' },
}
const OPP_REASON_TONE = {
  good: 'text-success',
  flat: 'text-text-secondary',
  bad:  'text-danger',
}

function RookieOpportunity({ research }) {
  const { score, tier, depthText, reasons = [], move, pick, round, slot, rank } = research
  const tone = OPP_TIER[tier] ?? OPP_TIER.weak
  const capital = pick == null
    ? (research.noData ? 'No NFL draft record in the feed' : 'Undrafted free agent')
    : `Round ${round ?? '—'} · pick ${pick} of the NFL draft`

  return (
    <Card padding="sm">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
        Rookie Opportunity
      </p>

      {score == null ? (
        <p className="font-body text-sm text-text-secondary leading-snug">
          No depth-chart or NFL draft record for him yet, so there's no opportunity
          score — the daily rookie feed hasn't placed him.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className={cn('font-mono text-3xl font-semibold tabular-nums', tone.text)}>
              {Math.round(score * 100)}
            </span>
            <div>
              <p className={cn('font-body text-sm font-semibold', tone.text)}>{tone.label}</p>
              <p className="font-body text-[10px] text-text-tertiary">out of 100 · chance he lands a real role</p>
            </div>
          </div>

          <p className="font-body text-sm text-text-primary mt-2.5 leading-snug">{depthText}</p>
          <p className="font-body text-xs text-text-secondary mt-0.5">{capital}</p>
          {slot && (
            <p className="font-body text-xs text-text-tertiary mt-0.5">
              Listed {slot}{rank != null ? ` ${rank}` : ''} on his NFL depth chart
            </p>
          )}

          {move && (
            <p className={cn('font-body text-xs mt-1.5', move.direction === 'up' ? 'text-success' : 'text-danger')}>
              {move.direction === 'up' ? 'Climbed' : 'Slipped'} {Math.abs(move.delta)}{' '}
              {Math.abs(move.delta) === 1 ? 'spot' : 'spots'} since the feed started tracking
              {' '}(#{move.from} → #{move.to}) — shown for context, not scored
            </p>
          )}

          {reasons.length > 0 && (
            <ul className="mt-2.5 pt-2.5 border-t border-border-default space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className={cn('font-body text-xs leading-snug', OPP_REASON_TONE[r.tone])}>
                  · {r.text}
                </li>
              ))}
            </ul>
          )}

          {research.divergence != null && (
            <p className="font-body text-xs text-text-secondary mt-2.5 pt-2.5 border-t border-border-default leading-snug">
              Among {research.position}s in this class the market has him{' '}
              <span className="font-mono text-text-primary">#{research.marketRank}</span> and this model has him{' '}
              <span className="font-mono text-text-primary">#{research.modelRank}</span>
              {research.divergence === 0
                ? ' — they agree.'
                : research.divergence > 0
                  ? ` — the model likes him ${research.divergence} spots more.`
                  : ` — the market likes him ${Math.abs(research.divergence)} spots more.`}
            </p>
          )}

          {research.fitReasons?.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-border-default">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1">
                For your roster
              </p>
              {research.fitReasons.map((r, i) => (
                <p key={i} className="font-body text-xs text-text-primary leading-snug">· {r}</p>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── Slot label ───────────────────────────────────────────────────────────────


// ── Usage — DISPLAY ONLY ─────────────────────────────────────────────────────
// "How he's being used", not "how he'll score". Adding usage to Sleeper's
// weekly projection was measured worthless (MAE gain 0.026, unstable signs —
// study §5), so this is deliberately descriptive and feeds no score or ranking
// anywhere in the app. The label says so on screen.

function UsageStat({ label, value, suffix = '%' }) {
  return (
    <div>
      <span className="font-mono text-lg font-semibold text-text-primary tabular-nums">
        {value != null ? `${value}${suffix}` : '—'}
      </span>
      <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mt-0.5">
        {label}
      </span>
    </div>
  )
}

function UsageCard({ usage, position }) {
  if (!usage) return null
  return (
    <Card padding="sm">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
        Usage · {usage.year} season
      </p>
      <div className="flex gap-5">
        <UsageStat label="Snap share" value={usage.snapShare} />
        {position === 'RB'
          ? <UsageStat label="Rush share" value={usage.rushShare} />
          : <UsageStat label="Target share" value={usage.targetShare} />}
        {usage.rzTargets != null && position !== 'QB' && (
          <UsageStat label="RZ targets" value={usage.rzTargets} suffix="" />
        )}
      </div>
      <p className="font-body text-[10px] text-text-tertiary leading-snug mt-2.5">
        How he's being used — context only. Usage was measured not to improve a
        weekly projection, so nothing here feeds a score or a ranking.
      </p>
    </Card>
  )
}

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
  fpNotesMap = {}, research = null,
}) {
  const navigate = useNavigate()
  const ctx = useLeagueContext()
  const league = ctx?.league
  const values = ctx?.values

  const { injuryFlag, injuryStatus, injuryDetail, injuryNotes, loading: newsLoading } = usePlayerNews(player.sleeperId)
  const intel = usePlayerIntel(player.sleeperId, ctx?.nflState)
  const peak = getPeakStatus(player.position, player.age)
  const { toggleWatch, isWatched } = useWatchlist()
  const watched = isWatched(player.sleeperId)
  const [openArticle, setOpenArticle] = useState(null)

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

  // My full position group, viewed player included — shows where they rank
  const competitors = useMemo(() => {
    if (!league?.myRoster || !player.position || playerContext !== 'mine') return []
    return league.myRoster.players
      .filter(p => p.position === player.position)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  }, [league, player.position, playerContext])

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

  // Both readings are keyed entirely to a FantasyCalc positional rank, so a
  // player who has none — every team defense, plus any unranked stash — would
  // be graded from a made-up `99` and stamped "D — Deep Stash". Show them only
  // where the rank they are derived from actually exists.
  const grade = useMemo(() =>
    (player.positionRank != null
      ? getOpportunityGrade(player.position, player.positionRank, player.value ?? 0)
      : null),
  [player])

  const role = useMemo(() =>
    (player.positionRank != null
      ? getRoleDescription(player.position, player.positionRank)
      : ''),
  [player])

  const comparables = useMemo(() =>
    getComparables(player, resolvedPlayerMap),
  [player, resolvedPlayerMap])

  // Depth-chart room capped for mobile, but the viewed player is always shown
  // (even if deeper than the cap) with their true room index preserved.
  const roomRows = useMemo(() => {
    const room = intel.depthChart?.room ?? []
    // Dynasty value per teammate — the room alone doesn't say much ("WR2 behind
    // a 1,100 WR1" reads nothing like "WR2 behind a 7,000 WR1"). Joined on the
    // cached FantasyCalc map; unranked teammates show — (rule 7).
    const rows = room.map((r, i) => ({
      ...r,
      roomIndex: i + 1,
      value: resolvedPlayerMap[r.sleeperId]?.value ?? null,
    }))
    const CAP = 6
    if (rows.length <= CAP) return rows
    const top = rows.slice(0, CAP)
    if (top.some(r => r.isViewed)) return top
    const viewed = rows.find(r => r.isViewed)
    return viewed ? [...rows.slice(0, CAP - 1), viewed] : top
  }, [intel.depthChart, resolvedPlayerMap])

  const myRankings = csvColumns
    .map(col => ({ name: col.name, rank: col.data?.[player.name?.toLowerCase()] ?? null }))
    .filter(r => r.rank != null)

  const fpNotes = fpNotesMap[player.sleeperId] ?? null

  function handleAnalyzeTrade() {
    if (playerContext === 'opponent' && ownerRoster) {
      navigate('/trade/analyze', { state: { opponentRosterId: ownerRoster.rosterId, whatsFairTarget: player } })
    } else {
      navigate('/trade/analyze', { state: { preloadGivePlayer: player } })
    }
    onClose()
  }

  const flagStyle = FLAG_STYLES[injuryFlag] ?? FLAG_STYLES.green

  // A team defense is not a dynasty asset in this app's model: FantasyCalc
  // ranks none, you start exactly one a week, and there is no reason to hold a
  // second. So the dynasty framing — a value card reading `—`, a trade CTA the
  // Analyzer would price at 0 — is noise on a defense, not information.
  const isDefense = player.position === 'DEF'

  return (
    <>
      {/* z-50 so the nested NewsArticleSheet (z-[60], rendered after) paints on top */}
      <Sheet onClose={onClose} zIndex="z-50" label={player.name}>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border-default">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              {grade && (
                <span className={`font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${GRADE_STYLES[grade]}`}>
                  {grade} — {GRADE_LABELS[grade]}
                </span>
              )}
              {player.position && (
                <span className={`font-body text-[10px] font-semibold uppercase tracking-wider ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>
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
            <h2 className="font-display text-xl uppercase tracking-wide text-text-primary mt-1 leading-tight">
              {player.name}
            </h2>
            <p className="font-body text-sm text-text-secondary mt-0.5">
              {player.team || 'FA'}{player.age != null ? ` · Age ${Math.floor(player.age)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton
              onClick={() => toggleWatch(player.sleeperId)}
              label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
              className={cn('transition-colors', watched && 'text-accent hover:text-accent')}
            >
              <Star size={18} strokeWidth={1.75} className={watched ? 'fill-accent' : ''} />
            </IconButton>
            <IconButton onClick={onClose} label="Close">
              <X size={18} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>

        <div className="px-4 pb-6 pt-3 flex flex-col gap-4">

          {research && <RookieOpportunity research={research} />}

          {/* Player Status */}
          <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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
            {peak && (
              <div className="mt-2.5 pt-2.5 border-t border-border-default">
                <p className={`font-body text-xs ${
                  peak.phase === 'ascending' ? 'text-success'
                    : peak.phase === 'peak' ? 'text-warning'
                    : 'text-danger'
                }`}>
                  {peak.label}
                </p>
              </div>
            )}
          </div>

          {/* Depth Chart — NFL position room, viewed player highlighted.
              Best-effort: hides entirely when Sleeper has no depth order. */}
          {roomRows.length > 0 && (
            <Card padding="sm">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Depth Chart
              </p>
              <div className="flex items-center gap-2 mb-3">
                <Badge tone="accent" soft>{intel.depthChart.role}</Badge>
                <span className="font-mono text-xs text-text-secondary tabular-nums">
                  {intel.depthChart.roomRank ? `${intel.position}${intel.depthChart.roomRank}` : intel.position}
                  {player.team ? ` · ${player.team}` : ''}
                </span>
              </div>
              {/* Column header — spacers mirror the row's column widths so the
                  label sits directly over the value column. */}
              <div className="flex items-center gap-2 mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                <span className="w-4 shrink-0" />
                <span className="flex-1 min-w-0" />
                <span className="w-11 text-right shrink-0">Value</span>
                <span className="w-8 shrink-0" />
                <span className="w-6 shrink-0" />
              </div>
              <div className="flex flex-col gap-0">
                {roomRows.map((r, i) => (
                  <div
                    key={r.sleeperId}
                    className={cn(
                      'relative flex items-center gap-2 py-1.5 -mx-3 px-3',
                      i < roomRows.length - 1 && 'border-b border-border-default',
                      r.isViewed && 'bg-accent/15',
                    )}
                  >
                    {r.isViewed && (
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-accent" aria-hidden="true" />
                    )}
                    <span className={`font-mono text-[10px] tabular-nums w-4 shrink-0 ${r.isViewed ? 'text-text-primary font-semibold' : 'text-text-tertiary'}`}>
                      {r.roomIndex}
                    </span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`font-body text-xs truncate ${r.isViewed ? 'font-bold text-text-primary' : 'text-text-primary'}`}>
                        {r.name}
                      </span>
                      {r.isViewed && <Badge tone="accent" soft className="shrink-0">Viewing</Badge>}
                    </div>
                    <span className={cn(
                      'font-mono text-[10px] tabular-nums w-11 text-right shrink-0',
                      r.isViewed ? 'text-text-primary font-semibold' : 'text-text-secondary',
                    )}>
                      {r.value != null ? Math.round(r.value).toLocaleString() : '—'}
                    </span>
                    {r.slot ? (
                      <span className={`font-mono text-[10px] uppercase tracking-wide w-8 text-right shrink-0 ${POS_TEXT[intel.position] ?? 'text-text-tertiary'}`}>
                        {r.slot}
                      </span>
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    <span className="w-6 text-right shrink-0">
                      {r.isStarter
                        ? <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-accent">ST</span>
                        : <span className="font-mono text-[10px] text-text-tertiary">·</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <UsageCard usage={intel.usage} position={intel.position} />

          {/* Production — recent games in-season, last-season summary otherwise */}
          {(intel.loading || intel.seasonSummary || intel.recentGames.some(g => g.pts != null)) && (
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Latest News
              </p>
              <div className="flex flex-col">
                {intel.news.map((n, i) => (
                  <button
                    key={i}
                    onClick={() => setOpenArticle(n)}
                    className={`w-full text-left active:opacity-60 transition-opacity ${i < intel.news.length - 1 ? 'pb-2.5 mb-2.5 border-b border-border-default' : ''}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="flex-1 font-body text-sm font-medium text-text-primary leading-snug">
                        {n.headline}
                      </p>
                      {(n.source || relativeTime(n.published)) && (
                        <span className="font-body text-[10px] text-text-tertiary shrink-0">
                          {[n.source, relativeTime(n.published)].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-end gap-1.5 mt-1">
                      {n.story && (
                        <p
                          className="flex-1 font-body text-xs text-text-secondary leading-snug"
                          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {n.story}
                        </p>
                      )}
                      <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-text-tertiary mb-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dynasty value — never for a defense (see isDefense above) */}
          {!isDefense && (
          <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Dynasty Value
            </p>
            <div className="flex items-baseline gap-3">
              {/* Rule 7: an unranked player shows `—`, never a 0 that reads
                  like a measured value of zero. */}
              <span className="font-mono text-3xl font-semibold text-accent tabular-nums">
                {player.value ? player.value.toLocaleString() : '—'}
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
                  <span className={`font-body text-[10px] font-semibold ml-1 ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>{player.position}</span>
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
          )}

          {/* Role / opportunity — hidden when FP dynasty outlook is available */}
          {role && !(isDraftContext && fpNotes?.dynastyOutlook) && (
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
                Dynasty Outlook
              </p>
              <p className="font-body text-sm text-text-primary leading-snug">{role}</p>
            </div>
          )}

          {/* External rankings */}
          {myRankings.length > 0 && (
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Scouting Report
              </p>
              <p className="font-body text-sm text-text-primary leading-relaxed">{fpNotes.scoutingReport}</p>
            </div>
          )}

          {/* Dynasty Outlook (FantasyPros) */}
          {isDraftContext && fpNotes?.dynastyOutlook && (
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-sm font-bold uppercase tracking-wide text-accent mb-2">
                Dynasty Outlook
              </p>
              <p className="font-body text-sm text-text-primary leading-relaxed">{fpNotes.dynastyOutlook}</p>
            </div>
          )}

          {/* Comparable players */}
          {comparables.length > 0 && (
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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
            <div className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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
                        {competitors.map((comp, i) => {
                          const isViewed = String(comp.sleeperId) === String(player.sleeperId)
                          return (
                            <div
                              key={comp.sleeperId}
                              className={`flex items-center justify-between py-1.5 ${i < competitors.length - 1 ? 'border-b border-border-default' : ''}`}
                            >
                              <span className="font-mono text-[10px] text-text-tertiary tabular-nums w-4 shrink-0">
                                {i + 1}
                              </span>
                              <p className={`font-body text-xs truncate flex-1 min-w-0 ${isViewed ? 'font-semibold text-accent' : 'text-text-primary'}`}>
                                {comp.name}
                              </p>
                              <span className={`font-mono text-xs tabular-nums ml-2 flex-shrink-0 ${isViewed ? 'font-semibold text-accent' : 'text-text-secondary'}`}>
                                {comp.value ? comp.value.toLocaleString() : '—'}
                              </span>
                            </div>
                          )
                        })}
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
                      <span className="font-body text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 border border-success/30 rounded-none px-1.5 py-0.5">
                        Fills Need
                      </span>
                    </div>
                  )}
                  {myPositionPlayers.length > 0 ? (
                    <div className="flex flex-col gap-0">
                      {myPositionPlayers.map((rp, i) => {
                        // A value comparison needs two values. For a position
                        // FantasyCalc doesn't rank (every defense) both sides
                        // are unvalued, and "0 · +0" reads as a measurement.
                        const comparable = !!player.value && !!rp.value
                        const delta = (player.value ?? 0) - (rp.value ?? 0)
                        return (
                          <div
                            key={rp.sleeperId}
                            className={`flex items-center justify-between py-2 ${i < myPositionPlayers.length - 1 ? 'border-b border-border-default' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-body text-sm text-text-primary truncate">{rp.name}</p>
                              <p className="font-body text-[10px] text-text-tertiary truncate">
                                {rp.team || 'FA'}{rp.positionRank != null ? ` · #${rp.positionRank}` : ''} {rp.position}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <span className="font-mono text-sm text-text-secondary tabular-nums">
                                {rp.value ? rp.value.toLocaleString() : '—'}
                              </span>
                              {comparable && (
                                <span className={`font-mono text-xs font-semibold tabular-nums w-14 text-right ${
                                  delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-tertiary'
                                }`}>
                                  {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                                </span>
                              )}
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
            <div key={player.sleeperId} className="rounded-none bg-bg-card border border-border-default px-3 py-3">
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

          {/* Analyze Trade button — not for a defense (see isDefense above) */}
          {!isDefense && (
            <Button size="lg" fullWidth onClick={handleAnalyzeTrade}
              icon={<ArrowRight size={16} strokeWidth={2} />} iconRight>
              Analyze Trade
            </Button>
          )}

        </div>
      </Sheet>

      {openArticle && (
        <NewsArticleSheet
          article={{ ...openArticle, player }}
          onClose={() => setOpenArticle(null)}
        />
      )}
    </>
  )
}
