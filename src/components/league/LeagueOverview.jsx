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
import { POS_CHIP_ACTIVE, POS_TEXT, POS_BG } from '../../utils/positionColors'
import { TIER_BADGE, TIER_TEXT } from '../../utils/tierColors'
import { rankClass } from '../../utils/rankColors'
import TeamAvatar from '../shared/TeamAvatar'
import { Chip, Badge, cn } from '../ui'

const SORT_OPTIONS = [
  { id: 'value',  label: 'Overall Value' },
  { id: 'record', label: 'Record' },
  { id: 'picks',  label: 'Pick Capital' },
  { id: 'faab',   label: 'FAAB' },
]

const TIERS = ['Contending', 'Middle', 'Rebuilding']

// Filters survive drill-down + back navigation via sessionStorage.
const SORT_KEY = 'dynastyedge_league_sort'
const POS_KEY = 'dynastyedge_league_pos'
const TIER_KEY = 'dynastyedge_league_tier'

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

function PositionRankCard({ roster, posFilter, tier, posStrength, posRank, onTap, myRosterId }) {
  const teamName = getTeamName(roster.owner)
  const isMyTeam = roster.rosterId === myRosterId

  return (
    <button
      onClick={() => onTap(roster.rosterId)}
      className={`w-full rounded-none bg-bg-card dark:bg-bg-card border px-3 py-3 text-left active:opacity-70 transition-opacity ${
        isMyTeam ? 'border-brand/60' : 'border-border-default dark:border-border-default'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`font-mono text-lg font-bold tabular-nums w-6 shrink-0 ${rankClass(posRank)}`}>
          {posRank}
        </span>
        <TeamAvatar owner={roster.owner} size={26} />
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <p className="font-body text-sm font-semibold text-text-primary dark:text-text-primary truncate">
            {teamName}
          </p>
          {isMyTeam && (
            <Badge tone="brand" className="shrink-0">You</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <WinWindowBadge tier={tier} />
        <div className="flex items-baseline gap-1">
          <span className={`font-mono text-base font-semibold tabular-nums ${POS_TEXT[posFilter] ?? 'text-accent'}`}>
            {posStrength.toLocaleString()}
          </span>
          <span className={`font-body text-[10px] font-semibold ${POS_TEXT[posFilter] ?? 'text-text-tertiary dark:text-text-tertiary'}`}>
            {posFilter}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function LeagueOverview() {
  const { league, nflState, matchups, isOffseason, loading, error, retry, myRosterId } = useLeagueContext()
  const navigate = useNavigate()

  const [sortMode, setSortModeState] = useState(() => readSession(SORT_KEY, 'value'))
  const [posFilter, setPosFilterState] = useState(() => readSession(POS_KEY, 'ALL'))
  const [tierFilter, setTierFilterState] = useState(() => readSession(TIER_KEY, 'ALL'))

  function setSortMode(mode) {
    setSortModeState(mode)
    writeSession(SORT_KEY, mode)
  }

  function setPosFilter(pos) {
    setPosFilterState(pos)
    writeSession(POS_KEY, pos)
  }

  function setTierFilter(tier) {
    setTierFilterState(tier)
    writeSession(TIER_KEY, tier)
  }

  const derived = useMemo(() => {
    if (!league?.allRosters) return null

    const { allRosters } = league
    const winWindowTiers = assignWinWindowTiers(allRosters)
    const leagueAverages = computeLeagueAverages(allRosters)

    const tierCounts = { Contending: 0, Middle: 0, Rebuilding: 0 }
    Object.values(winWindowTiers).forEach(t => { tierCounts[t] = (tierCounts[t] ?? 0) + 1 })

    const anyRecords = allRosters.some(
      r => (r.record?.wins ?? 0) + (r.record?.losses ?? 0) + (r.record?.ties ?? 0) > 0
    )
    const effectiveSort = sortMode === 'record' && !anyRecords ? 'value' : sortMode

    const sortedRosters = [...allRosters].sort((a, b) => {
      if (effectiveSort === 'picks')  return (b.pickCapitalScore ?? 0) - (a.pickCapitalScore ?? 0)
      if (effectiveSort === 'faab')   return b.faabRemaining - a.faabRemaining
      if (effectiveSort === 'record') {
        const winDiff = (b.record?.wins ?? 0) - (a.record?.wins ?? 0)
        return winDiff !== 0 ? winDiff : (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
      }
      return b.totalValue - a.totalValue
    })

    // Rank within the current sort, computed before the tier filter so the
    // ordinal always reflects the team's true league-wide standing.
    const rankMap = {}
    sortedRosters.forEach((r, i) => { rankMap[r.rosterId] = i + 1 })

    // Value vs record divergence: a big gap between roster-value rank and
    // record rank flags teams whose results don't match their talent.
    const divergenceMap = {}
    if (anyRecords) {
      const byValue = [...allRosters].sort((a, b) => b.totalValue - a.totalValue)
      const byRecord = [...allRosters].sort((a, b) => {
        const winDiff = (b.record?.wins ?? 0) - (a.record?.wins ?? 0)
        return winDiff !== 0 ? winDiff : (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
      })
      const valueRank = {}
      const recordRank = {}
      byValue.forEach((r, i) => { valueRank[r.rosterId] = i })
      byRecord.forEach((r, i) => { recordRank[r.rosterId] = i })
      allRosters.forEach(r => {
        const gap = recordRank[r.rosterId] - valueRank[r.rosterId]
        divergenceMap[r.rosterId] = gap >= 4 ? 'under' : gap <= -4 ? 'over' : null
      })
    }

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

    const myTier = winWindowTiers[myRosterId] ?? 'Middle'

    return {
      winWindowTiers, leagueAverages, tierCounts, sortedRosters,
      positionRanked, rankMap, divergenceMap, anyRecords, effectiveSort, myTier,
    }
  }, [league, sortMode, posFilter, myRosterId])

  if (loading && !league) return <LoadingSpinner message="Loading league data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!league || !derived) return <ErrorState message="Could not load league data." onRetry={retry} />

  const {
    winWindowTiers, leagueAverages, tierCounts, sortedRosters,
    positionRanked, rankMap, divergenceMap, anyRecords, effectiveSort, myTier,
  } = derived

  function handleTeamTap(rosterId) {
    navigate(`/league/teams/${rosterId}`)
  }

  const currentWeek = nflState?.week
  const sortOptions = anyRecords ? SORT_OPTIONS : SORT_OPTIONS.filter(o => o.id !== 'record')

  const tierFilteredRosters = tierFilter === 'ALL'
    ? sortedRosters
    : sortedRosters.filter(r => (winWindowTiers[r.rosterId] ?? 'Middle') === tierFilter)
  const tierFilteredPositionRanked = tierFilter === 'ALL'
    ? positionRanked
    : positionRanked.filter(({ tier }) => tier === tierFilter)

  return (
    <div className="px-4 pb-4">
      {/* ── League Health Banner — tap a tier to filter the list ── */}
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary">
            League Health
          </p>
          <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
            You: <span className={`font-semibold ${TIER_TEXT[myTier] ?? 'text-text-primary dark:text-text-primary'}`}>{myTier}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          {TIERS.map(tier => {
            const active = tierFilter === tier
            return (
              <Chip
                key={tier}
                active={active}
                activeClass={TIER_BADGE[tier]}
                onClick={() => setTierFilter(active ? 'ALL' : tier)}
                className={cn('px-2.5 py-1', !active && 'bg-bg-secondary dark:bg-bg-secondary')}
              >
                {tierCounts[tier]} {tier}
              </Chip>
            )
          })}
        </div>
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
          {sortOptions.map(opt => (
            <Chip
              key={opt.id}
              active={effectiveSort === opt.id}
              onClick={() => {
                setSortMode(opt.id)
                if (opt.id !== 'value') setPosFilter('ALL')
              }}
              className={cn('px-2.5 py-1', effectiveSort !== opt.id && 'bg-bg-secondary dark:bg-bg-secondary')}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* ── Position Filter (Overall Value only) ── */}
      {effectiveSort === 'value' && (
        <div className="pb-3">
          <div className="flex gap-1.5">
            {['ALL', ...POSITIONS].map(pos => (
              <Chip
                key={pos}
                active={posFilter === pos}
                activeClass={POS_CHIP_ACTIVE[pos] ?? 'bg-accent text-bg-primary border border-transparent'}
                onClick={() => setPosFilter(pos)}
                className={cn('px-2.5 py-1', posFilter !== pos && 'bg-bg-secondary dark:bg-bg-secondary')}
              >
                {pos}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* ── Team List OR Position Ranking ── */}
      {posFilter === 'ALL' || effectiveSort !== 'value' ? (
        <div>
          <div className="-mt-4 pb-1">
            <SectionHeader label="All Teams" count={tierFilteredRosters.length} />
          </div>
          {effectiveSort === 'value' && (
            <p className="font-body text-[11px] leading-snug text-text-tertiary dark:text-text-tertiary pb-2">
              Bars = position strength vs league avg
              <span className="opacity-60"> (marker = average)</span> · arrow = 30-day trend
            </p>
          )}
          <div className="flex flex-col gap-2">
          {tierFilteredRosters.map(roster => (
            <TeamCard
              key={roster.rosterId}
              roster={roster}
              rank={rankMap[roster.rosterId]}
              divergence={divergenceMap[roster.rosterId] ?? null}
              leagueAverages={leagueAverages}
              winWindowTiers={winWindowTiers}
              sortMode={effectiveSort}
              onTap={handleTeamTap}
            />
          ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="-mt-4 pb-1">
            <SectionHeader label={`${posFilter} Ranking`} accentBar={POS_BG[posFilter]} />
          </div>
          <div className="flex flex-col gap-2">
            {tierFilteredPositionRanked.map(({ roster, posStrength, posRank, tier }) => (
              <PositionRankCard
                key={roster.rosterId}
                roster={roster}
                posFilter={posFilter}
                tier={tier}
                posStrength={posStrength}
                posRank={posRank}
                onTap={handleTeamTap}
                myRosterId={myRosterId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
