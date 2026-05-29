import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeagueContext } from '../../context/LeagueContext'
import { assignWinWindowTiers, computeLeagueAverages, getPositionalStrength } from '../../utils/rosterAnalysis'
import { getTeamName } from '../../hooks/useLeague'
import { POSITIONS, PICK_YEARS } from '../../constants'
import LoadingSpinner from '../shared/LoadingSpinner'
import WinWindowBadge from '../shared/WinWindowBadge'
import TeamCard from './TeamCard'
import MatchupCard from './MatchupCard'

const SORT_OPTIONS = [
  { id: 'value', label: 'Overall Value' },
  { id: 'picks', label: 'Pick Capital' },
  { id: 'faab',  label: 'FAAB' },
]

function SectionHeader({ label }) {
  return (
    <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary pt-4 pb-1.5">
      {label}
    </p>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <span className="text-2xl">⚠️</span>
      <p className="text-text-secondary dark:text-text-secondary font-body text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="mt-1 px-4 py-2 rounded-lg bg-accent text-white font-body font-medium text-sm"
      >
        Retry
      </button>
    </div>
  )
}

function PositionRankCard({ roster, posFilter, tier, posStrength, posRank, onTap }) {
  const teamName = getTeamName(roster.owner)

  return (
    <button
      onClick={() => onTap(roster.rosterId)}
      className="w-full rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3 text-left active:opacity-70 transition-opacity"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-lg font-bold text-text-tertiary dark:text-text-tertiary tabular-nums w-6 shrink-0">
          {posRank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-semibold text-text-primary dark:text-text-primary truncate">
            {teamName}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <WinWindowBadge tier={tier} />
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-base font-semibold text-accent tabular-nums">
            {posStrength.toLocaleString()}
          </span>
          <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">
            {posFilter}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function LeagueOverview() {
  const { league, nflState, matchups, isOffseason, loading, error, retry } = useLeagueContext()
  const navigate = useNavigate()

  const [sortMode, setSortMode] = useState('value')
  const [posFilter, setPosFilter] = useState('ALL')

  const derived = useMemo(() => {
    if (!league?.allRosters) return null

    const { allRosters } = league
    const winWindowTiers = assignWinWindowTiers(allRosters)
    const leagueAverages = computeLeagueAverages(allRosters)

    const tierCounts = { Contending: 0, Middle: 0, Rebuilding: 0 }
    Object.values(winWindowTiers).forEach(t => { tierCounts[t] = (tierCounts[t] ?? 0) + 1 })

    const sortedRosters = [...allRosters].sort((a, b) => {
      if (sortMode === 'picks') return b.pickCapitalScore - a.pickCapitalScore
      if (sortMode === 'faab')  return b.faabRemaining - a.faabRemaining
      return b.totalValue - a.totalValue
    })

    let positionRanked = []
    if (posFilter !== 'ALL') {
      positionRanked = [...allRosters]
        .map(r => ({ roster: r, posStrength: getPositionalStrength(r)[posFilter] }))
        .sort((a, b) => b.posStrength - a.posStrength)
        .map(({ roster, posStrength }, i) => ({
          roster,
          posStrength,
          posRank: i + 1,
          tier: winWindowTiers[roster.rosterId] ?? 'Middle',
        }))
    }

    return { winWindowTiers, leagueAverages, tierCounts, sortedRosters, positionRanked }
  }, [league, sortMode, posFilter])

  if (loading) return <LoadingSpinner message="Loading league data…" />
  if (error)   return <ErrorState message={error} onRetry={retry} />
  if (!league) return <ErrorState message="Could not load league data." onRetry={retry} />

  const { winWindowTiers, leagueAverages, tierCounts, sortedRosters, positionRanked } = derived

  function handleTeamTap(rosterId) {
    navigate('/roster', { state: { selectedRosterId: rosterId } })
  }

  const currentWeek = nflState?.week

  return (
    <div className="px-4 pb-4">
      {/* ── League Health Banner ── */}
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-1">
          League Health
        </p>
        <p className="font-body text-sm font-medium text-text-primary dark:text-text-primary">
          <span className="text-warning">{tierCounts.Contending} Contending</span>
          <span className="text-text-tertiary dark:text-text-tertiary mx-2">·</span>
          <span className="text-text-secondary dark:text-text-secondary">{tierCounts.Middle} Middle</span>
          <span className="text-text-tertiary dark:text-text-tertiary mx-2">·</span>
          <span className="text-text-tertiary dark:text-text-tertiary">{tierCounts.Rebuilding} Rebuilding</span>
        </p>
      </div>

      {/* ── Current Matchups (in-season only) ── */}
      {!isOffseason && matchups?.length > 0 && (
        <section>
          <SectionHeader label={currentWeek ? `Week ${currentWeek}` : 'This Week'} />
          <div className="flex flex-col gap-2">
            {matchups.map((pair, i) => (
              <MatchupCard key={i} pair={pair} />
            ))}
          </div>
        </section>
      )}

      {/* ── Sort Toggle ── */}
      <div className="pt-4 pb-2">
        <div className="flex gap-1.5">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                setSortMode(opt.id)
                if (opt.id !== 'value') setPosFilter('ALL')
              }}
              className={`px-2.5 py-1 rounded-full font-body text-xs font-medium transition-colors ${
                sortMode === opt.id
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary dark:bg-bg-secondary text-text-secondary dark:text-text-secondary border border-border-default dark:border-border-default'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Position Filter (Overall Value only) ── */}
      {sortMode === 'value' && (
        <div className="pb-3">
          <div className="flex gap-1.5">
            {['ALL', ...POSITIONS].map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`px-2.5 py-1 rounded-full font-body text-xs font-medium transition-colors ${
                  posFilter === pos
                    ? 'bg-accent text-white'
                    : 'bg-bg-secondary dark:bg-bg-secondary text-text-secondary dark:text-text-secondary border border-border-default dark:border-border-default'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Team List OR Position Swipe Ranking ── */}
      {posFilter === 'ALL' ? (
        <div className="flex flex-col gap-2">
          {sortedRosters.map(roster => (
            <TeamCard
              key={roster.rosterId}
              roster={roster}
              leagueAverages={leagueAverages}
              winWindowTiers={winWindowTiers}
              sortMode={sortMode}
              onTap={handleTeamTap}
            />
          ))}
        </div>
      ) : (
        <div>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary pb-2">
            {posFilter} Ranking
          </p>
          <div className="flex flex-col gap-2">
            {positionRanked.map(({ roster, posStrength, posRank, tier }) => (
              <PositionRankCard
                key={roster.rosterId}
                roster={roster}
                posFilter={posFilter}
                tier={tier}
                posStrength={posStrength}
                posRank={posRank}
                onTap={handleTeamTap}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
