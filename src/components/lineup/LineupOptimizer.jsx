import { useState, useMemo, useEffect, useRef } from 'react'
import { LayoutList, Search } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useFantasyCalc } from '../../hooks/useFantasyCalc'
import { useLineupData } from '../../hooks/useLineupData'
import {
  computeDefenseRankings,
  getMatchupQuality,
} from '../../utils/projections'
import {
  buildLineupMoves,
  lineupFromRoster,
  applySwap,
  isEligibleForSlot,
} from '../../utils/lineupMoves'
import {
  computeLeagueAverages,
  getPositionalDeltas,
  assignWinWindowTiers,
} from '../../utils/rosterAnalysis'
import { ROSTER_SLOTS, POSITIONS, PICK_YEARS } from '../../constants'
import { Button, Card, ErrorState, Spinner, SectionHeader, WinWindowBadge, cn } from '../ui'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import LineupRow from './LineupRow'
import LineupMovesCard from './LineupMovesCard'
import FreeAgentDrawer from './FreeAgentDrawer'

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
        <h2 className="font-display text-2xl uppercase tracking-wide text-text-primary dark:text-text-primary">
          Lineup Optimizer
        </h2>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          Available during the regular season.
        </p>
      </div>

      {myRoster && (
        <div className="flex flex-col gap-3 pt-4">
          {topNeed && (
            <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary mb-1.5">
                Heading Into The Season
              </p>
              <p className="font-body text-sm text-text-primary dark:text-text-primary leading-relaxed">
                Your biggest roster need is{' '}
                <span className="font-bold text-warning">{topNeed}</span>
                {' '}— currently below league average heading into the draft.
              </p>
            </div>
          )}

          <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary mb-2">
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

          <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary mb-2">
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

export default function LineupOptimizer() {
  const { league, loading: leagueLoading, error: leagueError, retry: leagueRetry } = useLeagueContext()
  const { values: fcValues, loading: fcLoading } = useFantasyCalc()
  const lineupData = useLineupData()

  // ── The sandbox ───────────────────────────────────────────────────────
  // Sleeper's API is READ-ONLY, so the lineup can never be written back. What
  // it can be is a local scratchpad: swap freely, watch the projected total
  // move, then mirror the result in the Sleeper app. `lineup` is an array of
  // sleeperId|null aligned to ROSTER_SLOTS.
  const [lineup, setLineup] = useState(null)
  const [swapArm, setSwapArm] = useState(null)      // { kind:'slot', idx } | { kind:'bench', playerId }
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [faSlotIdx, setFaSlotIdx] = useState(null)
  const [flash, setFlash] = useState(false)

  const baseLineup = useMemo(
    () => (league?.myRoster ? lineupFromRoster(league.myRoster) : null),
    [league?.myRoster],
  )

  // Seed (and re-seed) from Sleeper whenever the real roster changes — a
  // refresh that returns a new lineup must not be masked by stale local edits.
  const seededFrom = useRef(null)
  useEffect(() => {
    if (!baseLineup) return
    const sig = baseLineup.join(',')
    if (seededFrom.current === sig) return
    seededFrom.current = sig
    setLineup(baseLineup)
    setSwapArm(null)
  }, [baseLineup])

  const analysis = useMemo(() => {
    if (!league?.myRoster || !lineupData.projMap || !lineup) return null

    const { projMap, playerStatuses, playingTeams, defStatsRaw, statsWeek, nflState, schedule } = lineupData
    const currentWeek = nflState?.week ?? 1

    const res = buildLineupMoves({
      players: league.myRoster.players,
      lineup,
      projMap,
      playerStatuses,
      playingTeams,
    })

    // `playerStatuses` IS the shared trimmed player DB (position + team), which
    // is where defense rankings get the position and team the stats payload no
    // longer carries. `statsWeek` pairs those stats with that week's opponents.
    const defenseRankings = computeDefenseRankings(defStatsRaw ?? {}, {
      playerDB: playerStatuses,
      schedule,
      week: statsWeek ?? Math.max(1, currentWeek - 1),
    })
    // Week 1 has no prior week to rank defenses from, so every player would
    // read "Neutral". Showing a column of meaningless pills implies data we
    // don't have — so the pills hide and the header says why.
    const matchupsReady = POSITIONS.some(pos => Object.keys(defenseRankings[pos] ?? {}).length > 0)
    const matchupFor = player => (
      matchupsReady && player
        ? getMatchupQuality(player.team, player.position, currentWeek, schedule, defenseRankings)
        : null
    )

    return { ...res, currentWeek, matchupsReady, matchupFor }
  }, [league, lineup, lineupData])

  // Flash the projected total whenever the lineup changes (Motion spec).
  useEffect(() => {
    if (!lineup || !baseLineup) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 400)
    return () => clearTimeout(t)
  }, [lineup, baseLineup])

  const loading = leagueLoading || fcLoading || lineupData.loading
  const error   = leagueError || lineupData.error

  if (loading) return <Spinner message="Loading lineup data…" />
  if (error) return <ErrorState message={error} onRetry={() => { leagueRetry(); lineupData.retry() }} />
  if (lineupData.isOffseason) return <OffseasonPlaceholder league={league} />
  if (!analysis) return <ErrorState message="Could not build lineup view." onRetry={() => { leagueRetry(); lineupData.retry() }} />

  const { slots, bench, moves, optimalByIdx, currentWeek, matchupsReady, matchupFor } = analysis
  const dirty = baseLineup ? lineup.join(',') !== baseLineup.join(',') : false

  // ── Swap orchestration ────────────────────────────────────────────────
  // A swap is legal when BOTH players can occupy the other's slot. Bench
  // players only need to be eligible for the armed slot.
  const armedPlayer = swapArm?.kind === 'slot'
    ? slots[swapArm.idx]?.entry?.player ?? null
    : bench.find(b => b.id === swapArm?.playerId)?.player ?? null

  const slotState = idx => {
    if (!swapArm) return 'idle'
    if (swapArm.kind === 'slot') {
      if (swapArm.idx === idx) return 'armed'
      const theirs = slots[idx]?.entry?.player
      const mineOk = armedPlayer ? isEligibleForSlot(armedPlayer, idx) : true
      const theirsOk = theirs ? isEligibleForSlot(theirs, swapArm.idx) : true
      return mineOk && theirsOk ? 'target' : 'muted'
    }
    return armedPlayer && isEligibleForSlot(armedPlayer, idx) ? 'target' : 'muted'
  }

  const benchState = playerId => {
    if (!swapArm) return 'idle'
    if (swapArm.kind === 'bench') return swapArm.playerId === playerId ? 'armed' : 'muted'
    const p = bench.find(b => b.id === playerId)?.player
    return p && isEligibleForSlot(p, swapArm.idx) ? 'target' : 'muted'
  }

  const selectSlot = idx => {
    if (swapArm.kind === 'slot') setLineup(applySwap(lineup, swapArm.idx, { kind: 'slot', slotIdx: idx }))
    else setLineup(applySwap(lineup, idx, { kind: 'bench', playerId: swapArm.playerId }))
    setSwapArm(null)
  }

  const selectBench = playerId => {
    setLineup(applySwap(lineup, swapArm.idx, { kind: 'bench', playerId }))
    setSwapArm(null)
  }

  return (
    <div className="px-4 pb-4 hero-sweep">
      <LineupMovesCard
        week={currentWeek}
        currentTotal={analysis.currentTotal}
        optimalTotal={analysis.optimalTotal}
        pointsLeft={analysis.pointsLeft}
        moves={moves}
        mustFixCount={analysis.mustFixCount}
        upgradeCount={analysis.upgradeCount}
        dirty={dirty}
        onApplyAll={() => { setLineup([...optimalByIdx]); setSwapArm(null) }}
        onReset={() => { setLineup(baseLineup); setSwapArm(null) }}
      />

      {/* ── Starters ── */}
      <section>
        <SectionHeader label="Starting Lineup" />
        {swapArm && (
          <Card padding="p-2.5" className="mb-2 border-brand/40">
            <p className="font-body text-xs text-text-secondary leading-snug">
              Swapping <span className="font-semibold text-text-primary">{armedPlayer?.name ?? 'this slot'}</span>
              {' '}— tap a highlighted row to complete it.
            </p>
            <div className="flex gap-2 mt-2">
              {swapArm.kind === 'slot' && (
                <Button
                  variant="tinted"
                  size="sm"
                  icon={<Search size={13} strokeWidth={2.25} />}
                  onClick={() => { setFaSlotIdx(swapArm.idx); setSwapArm(null) }}
                >
                  Waiver options
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSwapArm(null)}>Cancel</Button>
            </div>
          </Card>
        )}
        <Card padding="px-3">
          {slots.map(({ idx, slot, entry, isOptimal }) => (
            <LineupRow
              key={`${slot.label}-${idx}`}
              lead={slot.label}
              leadIsSlot
              entry={entry}
              matchupQuality={matchupFor(entry?.player)}
              isOptimal={isOptimal}
              state={slotState(idx)}
              onOpenProfile={() => entry && setProfilePlayer(entry.player)}
              onArm={() => setSwapArm({ kind: 'slot', idx })}
              onSelectTarget={() => selectSlot(idx)}
              onCancel={() => setSwapArm(null)}
            />
          ))}
        </Card>
        <p className={cn(
          'font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-right mt-1.5 tabular-nums transition-colors',
          flash ? 'text-accent' : 'text-text-tertiary',
        )}>
          Projected {analysis.currentTotal.toFixed(1)}
        </p>
      </section>

      {/* ── Bench ── */}
      {bench.length > 0 && (
        <section>
          <SectionHeader label="Bench" count={bench.length} />
          <Card padding="px-3">
            {bench.map(b => (
              <LineupRow
                key={b.id}
                lead={b.player.position}
                entry={b}
                matchupQuality={matchupFor(b.player)}
                isOptimal={false}
                state={benchState(b.id)}
                onOpenProfile={() => setProfilePlayer(b.player)}
                onArm={() => setSwapArm({ kind: 'bench', playerId: b.id })}
                onSelectTarget={() => selectBench(b.id)}
                onCancel={() => setSwapArm(null)}
              />
            ))}
          </Card>
        </section>
      )}

      {!matchupsReady && (
        <p className="font-body text-[11px] text-text-tertiary leading-snug mt-3">
          Matchup ratings appear from Week 2 — they rank each defense by the points
          it allowed the previous week, and no week has been played yet.
        </p>
      )}

      {profilePlayer && (
        <PlayerProfileDrawer player={profilePlayer} onClose={() => setProfilePlayer(null)} />
      )}

      {faSlotIdx != null && fcValues?.playerMap && (
        <FreeAgentDrawer
          slot={ROSTER_SLOTS[faSlotIdx]}
          projMap={lineupData.projMap}
          allRosters={league.allRosters}
          fcPlayerMap={fcValues.playerMap}
          onClose={() => setFaSlotIdx(null)}
        />
      )}
    </div>
  )
}
