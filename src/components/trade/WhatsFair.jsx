import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { getTopTradeTargets, assignWinWindowTiers } from '../../utils/rosterAnalysis'
import { suggestFairPackage } from '../../utils/tradeAnalysis'
import WinWindowBadge from '../shared/WinWindowBadge'
import TrendArrow from '../shared/TrendArrow'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import { Card, Chip, cn } from '../ui'
import { POS_CHIP_ACTIVE, POS_TAG as POS_TAGS } from '../../utils/positionColors'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE']


function TargetCard({ target, fairPackage, onTap }) {
  const posTag = POS_TAGS[target.position] ?? 'bg-bg-secondary text-text-secondary'

  return (
    <Card
      onClick={onTap}
      padding="p-3"
      className="flex flex-col gap-2"
    >
      {/* Row 1: position + name + team + value + trend */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 text-[9px] font-bold font-body px-1.5 py-0.5 rounded leading-none ${posTag}`}>
          {target.position}
        </span>
        <span className="flex-1 font-display text-base font-bold uppercase tracking-wide text-text-primary dark:text-text-primary truncate min-w-0">
          {target.name}
        </span>
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0 uppercase tracking-wide">
          {target.team}
        </span>
        <span className="font-mono text-sm font-medium text-accent tabular-nums shrink-0">
          {(target.value || 0).toLocaleString()}
        </span>
        <span className="shrink-0">
          <TrendArrow trend={target.trend30Day} />
        </span>
      </div>

      {/* Row 2: owner team + fit tag */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-[11px] text-text-secondary dark:text-text-secondary truncate min-w-0">
          {getTeamName(target.owner)}
        </span>
        <span className={`shrink-0 font-body text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${POS_TAGS[target.position] ?? 'bg-bg-secondary text-text-secondary'}`}>
          {target.position}
        </span>
      </div>

      {/* Row 3: estimated package cost + why these pieces */}
      {fairPackage && (
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0">
              Est. cost:
            </span>
            <span className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0">
              {fairPackage.assets.map(a => a.name).join(' + ')}
            </span>
            <span className="font-mono text-[10px] text-text-secondary dark:text-text-secondary shrink-0 tabular-nums">
              (~{(fairPackage.totalValue || 0).toLocaleString()})
            </span>
          </div>
          {fairPackage.rationale && (
            <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary truncate min-w-0">
              {fairPackage.rationale}
            </span>
          )}
        </div>
      )}
    </Card>
  )
}

export default function WhatsFair() {
  const { league, loading, error, retry } = useLeagueContext()
  const navigate = useNavigate()
  const [posFilter, setPosFilter] = useState('All')

  const targets = useMemo(() => {
    if (!league?.myRoster || !league?.allRosters?.length) return []
    return getTopTradeTargets(league.myRoster, league.allRosters)
  }, [league])

  const myTier = useMemo(() => {
    if (!league?.allRosters?.length || !league?.myRoster) return 'Middle'
    const tiers = assignWinWindowTiers(league.allRosters)
    return tiers[league.myRoster.rosterId] ?? 'Middle'
  }, [league])

  // Pre-compute fair packages for all targets (ascending algorithm)
  const fairPackages = useMemo(() => {
    if (!league?.myRoster) return {}
    const map = {}
    const rosterById = new Map(league.allRosters.map(r => [r.rosterId, r]))
    targets.forEach(t => {
      map[t.sleeperId] = suggestFairPackage(
        t, league.myRoster, league.allRosters, rosterById.get(t.ownerRosterId)
      )
    })
    return map
  }, [targets, league])

  const filteredTargets = useMemo(() => {
    if (posFilter === 'All') return targets
    return targets.filter(t => t.position === posFilter)
  }, [targets, posFilter])

  if (loading && !league) return <LoadingSpinner message="Finding trade targets…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster) return <ErrorState message="Could not load league data." onRetry={retry} />

  const myTeamName = getTeamName(league.myRoster.owner)

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-body text-sm text-text-secondary dark:text-text-secondary">
            {myTeamName}
          </span>
          <WinWindowBadge tier={myTier} />
        </div>
        <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary leading-relaxed">
          Top targets ranked by positional need × value. Tap to explore a fair package.
        </p>
      </div>

      {/* Position filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-3 -mx-4 px-4">
        {POSITION_FILTERS.map(pos => (
          <Chip
            key={pos}
            active={posFilter === pos}
            activeClass={POS_CHIP_ACTIVE[pos] ?? 'bg-accent text-white'}
            onClick={() => setPosFilter(pos)}
            className={cn('py-1', posFilter !== pos && 'bg-bg-card dark:bg-bg-card')}
          >
            {pos}
          </Chip>
        ))}
      </div>

      {filteredTargets.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary">
            {posFilter === 'All'
              ? "No targets found — your roster is well-balanced."
              : `No ${posFilter} targets — you may already be strong at this position.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTargets.map(target => (
            <TargetCard
              key={target.sleeperId}
              target={target}
              fairPackage={fairPackages[target.sleeperId]}
              onTap={() =>
                navigate('/trade/analyze', {
                  state: {
                    opponentRosterId: target.ownerRosterId,
                    whatsFairTarget:  target,
                  },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
