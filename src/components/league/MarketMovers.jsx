import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import {
  computeLeagueAverages,
  getPositionalDeltas,
  assignWinWindowTiers,
} from '../../utils/rosterAnalysis'
import { POSITIONS, MY_ROSTER_ID } from '../../constants'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useValueHistory } from '../../hooks/useValueHistory'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import Sparkline from '../shared/Sparkline'

// Ignore deep free agents whose tiny values produce noisy trend swings.
const MIN_FA_VALUE = 500
const MIN_TARGET_VALUE = 1000
const TREND_THRESHOLD = 50

function TrendChip({ trend, value }) {
  const positive = trend > 0
  const neutral = trend === 0
  // % change against the value 30 days ago — a +120 move means a lot more
  // on an 800 player than on a 7,500 one.
  const baseline = (value ?? 0) - trend
  const pct = baseline > 0 ? Math.round((trend / baseline) * 100) : null
  const color = neutral ? 'text-text-tertiary' : positive ? 'text-success' : 'text-danger'

  return (
    <span className={`shrink-0 w-14 text-right ${color}`}>
      <span className="block font-mono text-xs font-semibold tabular-nums leading-tight">
        {positive ? '+' : ''}{Math.round(trend)}
      </span>
      {pct != null && pct !== 0 && (
        <span className="block font-mono text-[9px] tabular-nums leading-tight opacity-80">
          {pct > 0 ? '+' : ''}{pct}%
        </span>
      )}
    </span>
  )
}

function MoverRow({ player, ownerLabel, note, series, onClick, onBuildTrade }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick() }}
      className="w-full text-left py-2.5 border-b border-border-default dark:border-border-default last:border-0 active:opacity-60 transition-opacity cursor-pointer"
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
        <TrendChip trend={player.trend30Day} value={player.value} />
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] text-text-tertiary dark:text-text-tertiary font-body truncate">
          {ownerLabel}
        </span>
        {note && (
          <>
            <span className="text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0">·</span>
            <span className="text-[10px] text-warning font-body truncate">{note}</span>
          </>
        )}
        <span className="flex-1" />
        {series && <Sparkline data={series} />}
        {onBuildTrade && (
          <button
            onClick={e => { e.stopPropagation(); onBuildTrade() }}
            aria-label="Build trade"
            className="shrink-0 ml-1 flex items-center gap-1 rounded-md border border-border-default dark:border-border-default px-1.5 py-0.5 text-accent active:opacity-60 transition-opacity"
          >
            <ArrowLeftRight size={11} strokeWidth={2.25} />
            <span className="font-body text-[10px] font-semibold">Trade</span>
          </button>
        )}
      </div>
    </div>
  )
}

function MoverSection({ label, players, emptyHint, getOwnerLabel, getNote, getSeries, onSelect, onBuildTrade }) {
  if (!players.length && !emptyHint) return null
  return (
    <section>
      <SectionHeader label={label} count={players.length || undefined} />
      {players.length === 0 ? (
        <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary px-1 pb-2">
          {emptyHint}
        </p>
      ) : (
        <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
          {players.map(p => (
            <MoverRow
              key={p.sleeperId}
              player={p}
              ownerLabel={getOwnerLabel(p)}
              note={getNote?.(p)}
              series={getSeries?.(p.sleeperId)}
              onClick={() => onSelect(p)}
              onBuildTrade={onBuildTrade && p.ownerRoster ? () => onBuildTrade(p) : null}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function MarketMovers() {
  const { league, values, loading, error, retry } = useLeagueContext()
  const { watchlist } = useWatchlist()
  const { getSeries } = useValueHistory()
  const navigate = useNavigate()
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

    // Watchlist movers first — the players you've explicitly flagged are the
    // most personally relevant trend reads, whatever the size of the move.
    const watchSet = new Set(watchlist)
    const watching = all
      .filter(p => watchSet.has(String(p.sleeperId)))
      .sort((a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day))

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

    return { watching, risers, fallers, buyLow, sellHigh, myDeficits, mySurpluses }
  }, [league, values, watchlist])

  if (loading && !league) return <LoadingSpinner message="Loading market data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!movers) return <ErrorState message="Could not load market data." onRetry={retry} />

  const ownerLabel = p => {
    if (!p.ownerRoster) return 'Free agent'
    if (p.ownerRoster.rosterId === MY_ROSTER_ID) return 'Your roster'
    return getTeamName(p.ownerRoster.owner)
  }

  // Jump straight into the Trade Analyzer: their player → pre-filled fair
  // package (same flow as Targets); my player → pre-loaded in You Give.
  const buildTrade = p => {
    if (!p.ownerRoster) return
    if (p.ownerRoster.rosterId === MY_ROSTER_ID) {
      navigate('/trade/analyze', { state: { preloadGivePlayer: p } })
    } else {
      navigate('/trade/analyze', {
        state: { opponentRosterId: p.ownerRoster.rosterId, whatsFairTarget: p },
      })
    }
  }

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

      <MoverSection
        label="Watching"
        players={movers.watching}
        getOwnerLabel={ownerLabel}
        getSeries={getSeries}
        onSelect={setSelectedPlayer}
        onBuildTrade={buildTrade}
      />
      <MoverSection
        label="Buy-Low Targets"
        players={movers.buyLow}
        emptyHint={movers.myDeficits.length === 0
          ? 'No below-average positions on your roster right now — nothing to buy low into.'
          : `No falling players currently fit your needs (${movers.myDeficits.join(', ')}).`}
        getOwnerLabel={ownerLabel}
        getNote={p => (p.ownerTier === 'Rebuilding' ? 'Rebuilding owner — prime target' : null)}
        getSeries={getSeries}
        onSelect={setSelectedPlayer}
        onBuildTrade={buildTrade}
      />
      <MoverSection
        label="Sell-High Candidates"
        players={movers.sellHigh}
        emptyHint={movers.mySurpluses.length === 0
          ? 'No surplus positions on your roster right now — nothing safe to sell.'
          : `None of your players at surplus positions (${movers.mySurpluses.join(', ')}) are rising right now.`}
        getOwnerLabel={() => 'Your roster · surplus position'}
        getSeries={getSeries}
        onSelect={setSelectedPlayer}
        onBuildTrade={buildTrade}
      />
      <MoverSection
        label="Top Risers"
        players={movers.risers}
        getOwnerLabel={ownerLabel}
        getSeries={getSeries}
        onSelect={setSelectedPlayer}
        onBuildTrade={buildTrade}
      />
      <MoverSection
        label="Top Fallers"
        players={movers.fallers}
        getOwnerLabel={ownerLabel}
        getSeries={getSeries}
        onSelect={setSelectedPlayer}
        onBuildTrade={buildTrade}
      />

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
