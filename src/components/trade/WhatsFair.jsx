import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { getTopTradeTargets, assignWinWindowTiers } from '../../utils/rosterAnalysis'
import { suggestFairPackage } from '../../utils/tradeAnalysis'
import WinWindowBadge from '../shared/WinWindowBadge'
import TrendArrow from '../shared/TrendArrow'
import LoadingSpinner from '../shared/LoadingSpinner'

const POS_TAGS = {
  QB: 'bg-accent/20 text-accent',
  RB: 'bg-success/20 text-success',
  WR: 'bg-warning/20 text-warning',
  TE: 'bg-danger/20 text-danger',
}

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE']


function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
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

function TargetCard({ target, fairPackage, onTap }) {
  const posTag = POS_TAGS[target.position] ?? 'bg-bg-secondary text-text-secondary'

  return (
    <button
      onClick={onTap}
      className="w-full text-left rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3 flex flex-col gap-2 active:opacity-80 transition-opacity"
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

      {/* Row 3: estimated package cost */}
      {fairPackage && (
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
      )}
    </button>
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
    targets.forEach(t => {
      map[t.sleeperId] = suggestFairPackage(t, league.myRoster)
    })
    return map
  }, [targets, league])

  const filteredTargets = useMemo(() => {
    if (posFilter === 'All') return targets
    return targets.filter(t => t.position === posFilter)
  }, [targets, posFilter])

  if (loading) return <LoadingSpinner message="Finding trade targets…" />
  if (error)   return <ErrorState message={error} onRetry={retry} />
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
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`shrink-0 px-3 py-1 rounded-full font-body text-xs font-semibold uppercase tracking-wider transition-colors
              ${posFilter === pos
                ? 'bg-accent text-white'
                : 'bg-bg-card dark:bg-bg-card text-text-secondary dark:text-text-secondary border border-border-default dark:border-border-default'
              }`}
          >
            {pos}
          </button>
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
