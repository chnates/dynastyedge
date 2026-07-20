import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { usePlayoffOdds } from '../../hooks/usePlayoffOdds'
import { getDeadlineVerdict } from '../../utils/playoffOdds'
import { assignWinWindowTiers } from '../../utils/rosterAnalysis'
import { getTeamName } from '../../hooks/useLeague'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import WinWindowBadge from '../shared/WinWindowBadge'
import TeamAvatar from '../shared/TeamAvatar'
import { rankClass } from '../../utils/rankColors'
import { Badge } from '../ui'

const VERDICT_TONE = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function pct(p) {
  if (p >= 0.995) return '>99%'
  if (p > 0 && p < 0.005) return '<1%'
  return `${Math.round(p * 100)}%`
}

// Likelihood color for an odds number: confident green, coin-flip amber, long-shot red.
function oddsClass(p) {
  if (p >= 0.7) return 'text-success'
  if (p >= 0.35) return 'text-warning'
  return 'text-danger'
}

function oddsBarClass(p) {
  if (p >= 0.7) return 'bg-success'
  if (p >= 0.35) return 'bg-warning'
  return 'bg-danger'
}

function ordinal(n) {
  const r = Math.round(n)
  const s = ['th', 'st', 'nd', 'rd']
  const v = r % 100
  return r + (s[(v - 20) % 10] || s[v] || s[0])
}

function TeamOddsRow({ rank, roster, result, tier, isMine }) {
  const teamName = getTeamName(roster.owner)

  return (
    <div
      className={`rounded-none bg-bg-card border px-3 py-2.5 ${
        isMine ? 'border-brand/60' : 'border-border-default'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-mono text-base font-bold tabular-nums w-5 shrink-0 ${rankClass(rank)}`}>
          {rank}
        </span>
        <TeamAvatar owner={roster.owner} size={24} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-body text-sm font-semibold text-text-primary truncate">{teamName}</p>
            {isMine && <Badge tone="brand" className="shrink-0">You</Badge>}
          </div>
          <p className="font-body text-[10px] text-text-tertiary">
            Proj. {result.projWins.toFixed(1)}–{result.projLosses.toFixed(1)} · {ordinal(result.avgSeed)} seed
          </p>
        </div>
        <div className="text-right shrink-0 w-14">
          <p className={`font-mono text-lg font-bold tabular-nums leading-none ${oddsClass(result.playoffPct)}`}>
            {pct(result.playoffPct)}
          </p>
          <p className="font-body text-[9px] text-text-tertiary uppercase tracking-wide mt-0.5">
            playoffs
          </p>
        </div>
      </div>
      {/* Odds bar — full width = certain to make it; the marker shows the cut line */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full ${oddsBarClass(result.playoffPct)}`}
            style={{ width: `${Math.max(2, result.playoffPct * 100)}%` }}
          />
        </div>
        <WinWindowBadge tier={tier} />
      </div>
    </div>
  )
}

function StrengthPreviewRow({ row, isMine }) {
  const teamName = getTeamName(row.owner)
  return (
    <div
      className={`rounded-none bg-bg-card border px-3 py-2.5 flex items-center gap-2 ${
        isMine ? 'border-brand/60' : 'border-border-default'
      }`}
    >
      <span className={`font-mono text-base font-bold tabular-nums w-5 shrink-0 ${rankClass(row.projSeed)}`}>
        {row.projSeed}
      </span>
      <TeamAvatar owner={row.owner} size={24} />
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className="font-body text-sm font-semibold text-text-primary truncate">{teamName}</p>
        {isMine && <Badge tone="brand" className="shrink-0">You</Badge>}
      </div>
      <span
        className={`shrink-0 font-body text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
          row.projectedIn
            ? 'text-success bg-success/10 border-success/30'
            : 'text-text-tertiary bg-bg-secondary border-border-default'
        }`}
      >
        {row.projectedIn ? 'Projected in' : 'On the outside'}
      </span>
    </div>
  )
}

function HowToRead({ playoffTeams }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-none bg-bg-card border border-border-default mt-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-3">
        <span className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          How this works
        </span>
        {open
          ? <ChevronUp size={15} className="text-text-tertiary" strokeWidth={1.75} />
          : <ChevronDown size={15} className="text-text-tertiary" strokeWidth={1.75} />}
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2.5">
          <p className="font-body text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Playoff odds</span> answer one question:
            if the rest of the season played out, how often would you make the playoffs? Because nobody
            knows who wins each game, the app plays the remaining schedule out <span className="font-semibold text-text-primary">10,000 times</span>.
            Each simulated week, every team rolls a score based on how it usually scores, and the higher
            score wins. Your odds are simply the share of those 10,000 seasons where you finished in the
            top {playoffTeams} — the {playoffTeams} teams that make the playoffs.
          </p>
          <p className="font-body text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Seed</span> is your final rank among playoff
            teams. <span className="font-semibold text-text-primary">1st seed</span> is the best — it usually
            earns a first-round bye and home games. So a lower seed number means an easier path. "Proj. seed"
            is your average finishing seed across all the simulations.
          </p>
          <p className="font-body text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Proj. record</span> is your projected final
            win–loss total once the simulated games are added to what you've already played.
          </p>
          <p className="font-body text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Early in the year</span> there aren't many games
            to learn from, so the model leans on roster strength (your best lineup's dynasty value). As real
            games pile up, it shifts to your actual scoring — the odds get sharper every week.
          </p>
          <p className="font-body text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Buyer / Seller</span> is the takeaway for the
            trade deadline. <span className="text-success font-semibold">Buyer</span>: you're likely in, so
            spend picks on win-now help. <span className="text-warning font-semibold">On the bubble</span>:
            it's close — one good move could swing it. <span className="text-danger font-semibold">Seller</span>:
            you're a long shot, so cash in veterans for picks and youth.
          </p>
        </div>
      )}
    </div>
  )
}

export default function PlayoffOdds() {
  const {
    loading, error, retry, league, myRosterId,
    status, results, strengthPreview, playoffTeams,
    completedWeeks, remainingWeeks, remainingGames, firstPlayoffWeek,
  } = usePlayoffOdds()

  const tiers = useMemo(
    () => (league?.allRosters ? assignWinWindowTiers(league.allRosters) : {}),
    [league]
  )

  const rosterById = useMemo(() => {
    const map = {}
    ;(league?.allRosters ?? []).forEach(r => { map[r.rosterId] = r })
    return map
  }, [league])

  const ranked = useMemo(() => {
    if (!results) return []
    return [...results].sort((a, b) =>
      (b.playoffPct - a.playoffPct) || (a.avgSeed - b.avgSeed)
    )
  }, [results])

  if (loading) return <LoadingSpinner message="Simulating the season…" />
  if (error) return <ErrorState message={error} onRetry={retry} />
  if (!league || !status) return <ErrorState message="Could not load playoff odds." onRetry={retry} />

  const myTier = tiers[myRosterId] ?? 'Middle'

  // ── Preseason: no games and no posted schedule yet ──
  if (status === 'preseason') {
    return (
      <div className="px-4 pb-6">
        <div className="mt-4 bug-red flex items-center px-3 py-1.5">
          <span className="font-display text-[12px] uppercase tracking-[0.1em] leading-none">
            Playoff Odds
          </span>
        </div>
        <div className="hero-card border-t-0 px-4 py-4">
          <p className="font-body text-sm text-white/80 leading-relaxed">
            Live odds switch on once the Week 1 schedule is posted. The app will then play the
            rest of the season out 10,000 times to estimate everyone's chances of making the
            {` ${playoffTeams}`}-team playoff.
          </p>
        </div>

        <SectionHeader label="Preseason projection · by roster strength" />
        <p className="font-body text-xs text-text-secondary leading-relaxed pb-2">
          Until games are played, here's the projected seeding ranked purely by each team's best-lineup
          dynasty value — a strength preview, not real odds.
        </p>
        <div className="flex flex-col gap-2">
          {(strengthPreview ?? []).map(row => (
            <StrengthPreviewRow
              key={row.rosterId}
              row={row}
              isMine={row.rosterId === myRosterId}
            />
          ))}
        </div>

        <HowToRead playoffTeams={playoffTeams} />
      </div>
    )
  }

  // ── Active or complete: real simulation ──
  const myResult = results?.find(r => r.rosterId === myRosterId) ?? null
  const verdict = getDeadlineVerdict(myResult?.playoffPct, myTier)
  const seasonComplete = status === 'complete'

  return (
    <div className="px-4 pb-6">
      {/* My team summary — red score-bug hero */}
      <div className="mt-4 bug-red flex items-center px-3 py-1.5">
        <span className="font-display text-[12px] uppercase tracking-[0.1em] leading-none">
          Your Playoff Odds
        </span>
      </div>
      <div className="hero-card border-t-0 px-4 py-4">
        <div className="flex items-end gap-3">
          <span className="font-mono text-5xl font-bold tabular-nums text-white leading-none">
            {myResult ? pct(myResult.playoffPct) : '—'}
          </span>
          {myResult && (
            <div className="pb-1 flex flex-col gap-1">
              <span className="font-body text-xs text-white/85">
                Proj. {myResult.projWins.toFixed(1)}–{myResult.projLosses.toFixed(1)}
              </span>
              <span className="font-body text-xs text-white/85">
                {ordinal(myResult.avgSeed)} seed projected
              </span>
            </div>
          )}
        </div>
        <p className="font-body text-[11px] text-white/70 mt-1.5 leading-relaxed">
          {seasonComplete
            ? 'The regular season is complete — these reflect the final standings.'
            : `Chance of finishing in the top ${playoffTeams}, from 10,000 simulated seasons.`}
        </p>

        {myResult && !seasonComplete && (
          <div className="mt-3 rounded-none bg-white/15 border border-white/20 px-3 py-2.5">
            <p className="font-body text-xs font-bold uppercase tracking-wider text-white">
              {verdict.stance}
            </p>
            <p className="font-body text-[11px] text-white/85 mt-0.5 leading-relaxed">
              {verdict.text}
            </p>
          </div>
        )}
      </div>

      {/* Basis note */}
      <p className="font-body text-[11px] text-text-tertiary mt-3 leading-relaxed">
        {seasonComplete
          ? `Based on all ${completedWeeks} completed weeks. Playoffs begin Week ${firstPlayoffWeek}.`
          : `Based on ${completedWeeks} completed ${completedWeeks === 1 ? 'week' : 'weeks'} + ${remainingGames} remaining ${remainingGames === 1 ? 'game' : 'games'} over ${remainingWeeks} ${remainingWeeks === 1 ? 'week' : 'weeks'}. Playoffs begin Week ${firstPlayoffWeek}.`}
      </p>

      <SectionHeader label={`Every team · top ${playoffTeams} make it`} />
      <div className="flex flex-col gap-2">
        {ranked.map((result, i) => {
          const roster = rosterById[result.rosterId]
          if (!roster) return null
          return (
            <TeamOddsRow
              key={result.rosterId}
              rank={i + 1}
              roster={roster}
              result={result}
              tier={tiers[result.rosterId] ?? 'Middle'}
              isMine={result.rosterId === myRosterId}
            />
          )
        })}
      </div>

      <HowToRead playoffTeams={playoffTeams} />
    </div>
  )
}
