import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeagueContext } from '../../context/LeagueContext'
import { assignWinWindowTiers, computeLeagueAverages, getPositionalStrength } from '../../utils/rosterAnalysis'
import { getTeamName } from '../../hooks/useLeague'
import { POSITIONS } from '../../constants'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import WinWindowBadge from '../shared/WinWindowBadge'
import TeamCard from './TeamCard'
import MatchupCard from './MatchupCard'

const SORT_OPTIONS = [
  { id: 'value',  label: 'Overall Value' },
  { id: 'record', label: 'Record' },
  { id: 'picks',  label: 'Pick Capital' },
  { id: 'faab',   label: 'FAAB' },
]

// Filters survive drill-down + back navigation via sessionStorage.
const SORT_KEY = 'dynastyedge_league_sort'
const POS_KEY = 'dynastyedge_league_pos'

function readSession(key, fallback) {
  try {
    return sessionStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // private mode — filters just won't persist
  }
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

  const [sortMode, setSortModeState] = useState(() => readSession(SORT_KEY, 'value'))
  const [posFilter, setPosFilterState] = useState(() => readSession(POS_KEY, 'ALL'))

  function setSortMode(mode) {
    setSortModeState(mode)
    writeSession(SORT_KEY, mode)
  }

  function setPosFilter(pos) {
    setPosFilterState(pos)
    writeSession(POS_KEY, pos)
  }

  const derived = useMemo(() => {
    if (!league?.allRosters) return null

    const { allRosters } = league
    const winWindowTiers = assignWinWindowTiers(allRosters)
    const leagueAverages = computeLeagueAverages(allRosters)

    const tierCounts = { Contending: 0, Middle: 0, Rebuilding: 0 }
    Object.values(winWindowTiers).forEach(t => { tierCounts[t] = (tierCounts[t] ?? 0) + 1 })

    const sortedRosters = [...allRosters].sort((a, b) => {
      if (sortMode === 'picks')  return (b.pickCapitalScore ?? 0) - (a.pickCapitalScore ?? 0)
      if (sortMode === 'faab')   return b.faabRemaining - a.faabRemaining
      if (sortMode === 'record') {
        const winDiff = (b.record?.wins ?? 0) - (a.record?.wins ?? 0)
        return winDiff !== 0 ? winDiff : (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
      }
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

  if (loading && !league) return <LoadingSpinner message="Loading league data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!league || !derived) return <ErrorState message="Could not load league data." onRetry={retry} />

  const { winWindowTiers, leagueAverages, tierCounts, sortedRosters, positionRanked } = derived

  function handleTeamTap(rosterId) {
    navigate(`/roster/teams/${rosterId}`)
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
      <div className="pt-4 pb-2 -mx-4 px-4 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 w-max">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                setSortMode(opt.id)
                if (opt.id !== 'value') setPosFilter('ALL')
              }}
              className={`shrink-0 px-2.5 py-1 rounded-full font-body text-xs font-medium transition-colors ${
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

      {/* ── Team List OR Position Ranking ── */}
      {posFilter === 'ALL' || sortMode !== 'value' ? (
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
