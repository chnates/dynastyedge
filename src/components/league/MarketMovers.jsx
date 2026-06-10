import { useMemo, useState } from 'react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import {
  computeLeagueAverages,
  getPositionalDeltas,
  assignWinWindowTiers,
} from '../../utils/rosterAnalysis'
import { POSITIONS, MY_ROSTER_ID } from '../../constants'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'

// Ignore deep free agents whose tiny values produce noisy trend swings.
const MIN_FA_VALUE = 500
const MIN_TARGET_VALUE = 1000
const TREND_THRESHOLD = 50

function TrendChip({ trend }) {
  const positive = trend > 0
  return (
    <span className={`font-mono text-xs font-semibold tabular-nums shrink-0 w-14 text-right ${positive ? 'text-success' : 'text-danger'}`}>
      {positive ? '+' : ''}{Math.round(trend)}
    </span>
  )
}

function MoverRow({ player, ownerLabel, note, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left py-2.5 border-b border-border-default dark:border-border-default last:border-0 active:opacity-60 transition-opacity"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary truncate min-w-0">
          {player.name}
        </span>
        <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0 uppercase">
          {player.position}
        </span>
        <span className="font-mono text-sm font-medium text-text-primary dark:text-text-primary shrink-0 w-14 text-right tabular-nums">
          {player.value.toLocaleString()}
        </span>
        <TrendChip trend={player.trend30Day} />
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] text-text-tertiary dark:text-text-tertiary font-body">
          {ownerLabel}
        </span>
        {note && (
          <>
            <span className="text-[10px] text-text-tertiary dark:text-text-tertiary">·</span>
            <span className="text-[10px] text-warning font-body">{note}</span>
          </>
        )}
      </div>
    </button>
  )
}

function MoverSection({ label, count, players, getOwnerLabel, getNote, onSelect }) {
  if (!players.length) return null
  return (
    <section>
      <SectionHeader label={label} count={count ?? players.length} />
      <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
        {players.map(p => (
          <MoverRow
            key={p.sleeperId}
            player={p}
            ownerLabel={getOwnerLabel(p)}
            note={getNote?.(p)}
            onClick={() => onSelect(p)}
          />
        ))}
      </div>
    </section>
  )
}

export default function MarketMovers() {
  const { league, values, loading, error, retry } = useLeagueContext()
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  const movers = useMemo(() => {
    if (!league?.myRoster || !values?.playerMap) return null

    const ownerByPlayer = {}
    league.allRosters.forEach(r => {
      r.players.forEach(p => { ownerByPlayer[p.sleeperId] = r })
    })

    const all = Object.values(values.playerMap).map(p => ({
      ...p,
      ownerRoster: ownerByPlayer[p.sleeperId] ?? null,
    }))
    const relevant = all.filter(p => p.ownerRoster || p.value >= MIN_FA_VALUE)

    const risers = relevant
      .filter(p => p.trend30Day > TREND_THRESHOLD)
      .sort((a, b) => b.trend30Day - a.trend30Day)
      .slice(0, 10)

    const fallers = relevant
      .filter(p => p.trend30Day < -TREND_THRESHOLD)
      .sort((a, b) => a.trend30Day - b.trend30Day)
      .slice(0, 10)

    const leagueAverages = computeLeagueAverages(league.allRosters)
    const myDeltas = getPositionalDeltas(league.myRoster, leagueAverages)
    const tiers = assignWinWindowTiers(league.allRosters)
    const myDeficits = POSITIONS.filter(pos => (myDeltas[pos] ?? 0) < 0)
    const mySurpluses = POSITIONS.filter(pos => (myDeltas[pos] ?? 0) > 0)

    // Buy low: falling value, fills one of my deficits, not on my roster.
    // A rebuilding owner makes it a prime target.
    const buyLow = all
      .filter(p =>
        p.trend30Day < -TREND_THRESHOLD &&
        p.value >= MIN_TARGET_VALUE &&
        myDeficits.includes(p.position) &&
        p.ownerRoster?.rosterId !== MY_ROSTER_ID
      )
      .sort((a, b) => a.trend30Day - b.trend30Day)
      .slice(0, 8)
      .map(p => ({
        ...p,
        ownerTier: p.ownerRoster ? tiers[p.ownerRoster.rosterId] : null,
      }))

    // Sell high: my players rising at positions where I'm already above average.
    const sellHigh = league.myRoster.players
      .filter(p =>
        p.trend30Day > TREND_THRESHOLD &&
        p.value >= MIN_TARGET_VALUE &&
        mySurpluses.includes(p.position)
      )
      .sort((a, b) => b.trend30Day - a.trend30Day)
      .slice(0, 8)
      .map(p => ({ ...p, ownerRoster: league.myRoster }))

    return { risers, fallers, buyLow, sellHigh }
  }, [league, values])

  if (loading && !league) return <LoadingSpinner message="Loading market data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!movers) return <ErrorState message="Could not load market data." onRetry={retry} />

  const ownerLabel = p => {
    if (!p.ownerRoster) return 'Free agent'
    if (p.ownerRoster.rosterId === MY_ROSTER_ID) return 'Your roster'
    return getTeamName(p.ownerRoster.owner)
  }

  const hasAnything = movers.risers.length || movers.fallers.length || movers.buyLow.length || movers.sellHigh.length

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          Market Movers
        </p>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          30-day dynasty value trends across the league.
        </p>
      </div>

      {!hasAnything ? (
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-8 text-center">
          No significant value movement in the last 30 days.
        </p>
      ) : (
        <>
          <MoverSection
            label="Buy-Low Targets"
            players={movers.buyLow}
            getOwnerLabel={ownerLabel}
            getNote={p => (p.ownerTier === 'Rebuilding' ? 'Rebuilding owner — prime target' : null)}
            onSelect={setSelectedPlayer}
          />
          <MoverSection
            label="Sell-High Candidates"
            players={movers.sellHigh}
            getOwnerLabel={() => 'Your roster · surplus position'}
            onSelect={setSelectedPlayer}
          />
          <MoverSection
            label="Top Risers"
            players={movers.risers}
            getOwnerLabel={ownerLabel}
            onSelect={setSelectedPlayer}
          />
          <MoverSection
            label="Top Fallers"
            players={movers.fallers}
            getOwnerLabel={ownerLabel}
            onSelect={setSelectedPlayer}
          />
        </>
      )}

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
