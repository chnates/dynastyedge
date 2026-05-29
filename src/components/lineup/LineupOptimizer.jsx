import { useState, useMemo } from 'react'
import { AlertTriangle, LayoutList } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useFantasyCalc } from '../../hooks/useFantasyCalc'
import { useLineupData } from '../../hooks/useLineupData'
import {
  getProjPts,
  computeDefenseRankings,
  getMatchupQuality,
  getPlayerFlag,
  getBestBench,
} from '../../utils/projections'
import {
  computeLeagueAverages,
  getPositionalDeltas,
  assignWinWindowTiers,
} from '../../utils/rosterAnalysis'
import { ROSTER_SLOTS, POSITIONS, PICK_YEARS } from '../../constants'
import LoadingSpinner from '../shared/LoadingSpinner'
import WinWindowBadge from '../shared/WinWindowBadge'
import StarterSlot from './StarterSlot'
import FreeAgentDrawer from './FreeAgentDrawer'

function SectionHeader({ label, count }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1.5">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary">
        {label}
      </span>
      {count != null && (
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
          {count}
        </span>
      )}
    </div>
  )
}

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

function OffseasonPlaceholder({ league }) {
  const myRoster = league?.myRoster
  const allRosters = league?.allRosters

  const leagueAvgs = allRosters ? computeLeagueAverages(allRosters) : null
  const deltas = myRoster && leagueAvgs ? getPositionalDeltas(myRoster, leagueAvgs) : null
  const topNeed = deltas
    ? POSITIONS.reduce((worst, pos) => (deltas[pos] < (deltas[worst] ?? 0) ? pos : worst), POSITIONS[0])
    : null

  const picksByYear = {}
  ;(myRoster?.picks ?? []).forEach(pk => {
    picksByYear[pk.season] = (picksByYear[pk.season] ?? 0) + 1
  })

  const tier = allRosters && myRoster
    ? assignWinWindowTiers(allRosters)[myRoster.rosterId] ?? 'Middle'
    : 'Middle'

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default flex flex-col items-center text-center gap-2">
        <LayoutList size={40} strokeWidth={1.5} className="text-accent" />
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text-primary dark:text-text-primary">
          Lineup Optimizer
        </h2>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          Available during the regular season.
        </p>
      </div>

      {myRoster && (
        <div className="flex flex-col gap-3 pt-4">
          {topNeed && (
            <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3">
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-1.5">
                Heading Into The Season
              </p>
              <p className="font-body text-sm text-text-primary dark:text-text-primary leading-relaxed">
                Your biggest roster need is{' '}
                <span className="font-bold text-warning">{topNeed}</span>
                {' '}— currently below league average heading into the draft.
              </p>
            </div>
          )}

          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-2">
              Rookie Draft Capital
            </p>
            <div className="flex gap-4">
              {PICK_YEARS.map(yr => (
                <div key={yr} className="flex items-baseline gap-1">
                  <span className="font-mono text-xl font-semibold text-accent tabular-nums">
                    {picksByYear[yr] ?? 0}
                  </span>
                  <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">
                    '{yr.slice(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-2">
              Win Window
            </p>
            <div className="flex items-center gap-2">
              <WinWindowBadge tier={tier} />
              <span className="font-mono text-base font-semibold text-accent tabular-nums">
                {myRoster.totalValue.toLocaleString()}
              </span>
              <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">
                dynasty pts
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MATCHUP_DOT = {
  Easy:    <span className="inline-block w-2 h-2 rounded-full bg-success" />,
  Neutral: <span className="inline-block w-2 h-2 rounded-full bg-text-tertiary" />,
  Tough:   <span className="inline-block w-2 h-2 rounded-full bg-danger" />,
}

export default function LineupOptimizer() {
  const { league, loading: leagueLoading, error: leagueError, retry: leagueRetry } = useLeagueContext()
  const { values: fcValues, loading: fcLoading } = useFantasyCalc()
  const lineupData = useLineupData()

  const [drawerState, setDrawerState] = useState(null)

  const loading = leagueLoading || fcLoading || lineupData.loading
  const error   = leagueError || lineupData.error

  const lineupView = useMemo(() => {
    if (!league?.myRoster || !lineupData.projMap || !fcValues) return null

    const { myRoster } = league
    const { projMap, playerStatuses, playingTeams, defStatsRaw, nflState, schedule } = lineupData

    const bench = myRoster.players.filter(p => !p.isStarter && !p.isTaxi && !p.isIR)
    const defenseRankings = computeDefenseRankings(defStatsRaw ?? {})
    const currentWeek = nflState?.week ?? 1

    const starterSlots = (myRoster.starterOrder ?? [])
      .map((sleeperId, idx) => {
        const slot = ROSTER_SLOTS[idx]
        if (!slot || slot.label === 'DEF') return null
        const player = myRoster.players.find(p => p.sleeperId === sleeperId)
        if (!player) return null

        const projPts = getProjPts(player.sleeperId, projMap)
        const matchupQuality = getMatchupQuality(player.team, player.position, currentWeek, schedule, defenseRankings)
        const flag = getPlayerFlag(player, projMap, playerStatuses, playingTeams, bench, slot.eligible)
        const bestBenchPlayer = getBestBench(slot.eligible, player.sleeperId, bench, projMap, playerStatuses, playingTeams)
        const bestBenchPts = bestBenchPlayer ? getProjPts(bestBenchPlayer.sleeperId, projMap) : 0

        return { slot, player, projPts, matchupQuality, flag, bestBenchPts, idx }
      })
      .filter(Boolean)

    const benchWithProj = bench
      .map(p => ({
        player: p,
        projPts: getProjPts(p.sleeperId, projMap),
        matchupQuality: getMatchupQuality(p.team, p.position, currentWeek, schedule, defenseRankings),
      }))
      .sort((a, b) => b.projPts - a.projPts)

    const flagCounts = { red: 0, yellow: 0 }
    starterSlots.forEach(s => { if (s.flag !== 'green') flagCounts[s.flag]++ })

    return { starterSlots, benchWithProj, flagCounts, currentWeek }
  }, [league, fcValues, lineupData])

  if (loading) return <LoadingSpinner message="Loading lineup data…" />
  if (error) return <ErrorState message={error} onRetry={() => { leagueRetry(); lineupData.retry() }} />
  if (lineupData.isOffseason) return <OffseasonPlaceholder league={league} />
  if (!lineupView) return <ErrorState message="Could not build lineup view." onRetry={() => { leagueRetry(); lineupData.retry() }} />

  const { starterSlots, benchWithProj, flagCounts, currentWeek } = lineupView

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          Week {currentWeek}
        </p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text-primary dark:text-text-primary leading-tight">
          Lineup Optimizer
        </h1>
        {(flagCounts.red > 0 || flagCounts.yellow > 0) && (
          <p className="font-body text-xs text-warning mt-1">
            {[
              flagCounts.red > 0 ? `${flagCounts.red} must-start change${flagCounts.red > 1 ? 's' : ''}` : null,
              flagCounts.yellow > 0 ? `${flagCounts.yellow} decision${flagCounts.yellow > 1 ? 's' : ''} to review` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Starters */}
      <section>
        <SectionHeader label="Starting Lineup" count={starterSlots.length} />
        <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
          {starterSlots.map(({ slot, player, flag, projPts, matchupQuality, bestBenchPts, idx }) => (
            <StarterSlot
              key={`${slot.label}-${idx}`}
              slotLabel={slot.label}
              player={player}
              flag={flag}
              projPts={projPts}
              matchupQuality={matchupQuality}
              bestBenchPts={bestBenchPts}
              onClick={() => setDrawerState({ slot, player })}
            />
          ))}
        </div>
      </section>

      {/* Bench */}
      {benchWithProj.length > 0 && (
        <section>
          <SectionHeader label="Bench" count={benchWithProj.length} />
          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
            {benchWithProj.map(({ player, projPts, matchupQuality }) => (
              <div
                key={player.sleeperId}
                className="py-2.5 border-b border-border-default dark:border-border-default last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary truncate min-w-0">
                    {player.name}
                  </span>
                  <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0 uppercase tracking-wide">
                    {player.team}
                  </span>
                  <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0 uppercase">
                    {player.position}
                  </span>
                  <span className="font-mono text-sm font-semibold text-text-primary dark:text-text-primary shrink-0 w-10 text-right tabular-nums">
                    {projPts > 0 ? projPts.toFixed(1) : '—'}
                  </span>
                  <span className="shrink-0 flex items-center justify-center w-4" title={matchupQuality}>
                    {MATCHUP_DOT[matchupQuality] ?? MATCHUP_DOT.Neutral}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Free agent drawer */}
      {drawerState && fcValues?.playerMap && (
        <FreeAgentDrawer
          slot={drawerState.slot}
          projMap={lineupData.projMap}
          allRosters={league.allRosters}
          fcPlayerMap={fcValues.playerMap}
          onClose={() => setDrawerState(null)}
        />
      )}
    </div>
  )
}
