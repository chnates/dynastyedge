import { useMemo, useState } from 'react'
import { ArrowLeftRight, DollarSign, UserPlus, Gavel } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useTransactions } from '../../hooks/useTransactions'
import { usePlayerDB } from '../../hooks/usePlayerDB'
import { getTeamName } from '../../hooks/useLeague'
import { findPickValue } from '../../utils/pickCapital'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'

const PAGE_SIZE = 25
const ROUND_SUFFIXES = ['', '1st', '2nd', '3rd', '4th', '5th']

const TYPE_META = {
  trade:        { label: 'Trade',      Icon: ArrowLeftRight, color: 'text-accent' },
  waiver:       { label: 'Waiver',     Icon: DollarSign,     color: 'text-warning' },
  free_agent:   { label: 'Free Agent', Icon: UserPlus,       color: 'text-success' },
  commissioner: { label: 'Commish',    Icon: Gavel,          color: 'text-text-secondary' },
}

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'trade',      label: 'Trades' },
  { id: 'waiver',     label: 'Waivers' },
  { id: 'free_agent', label: 'FA' },
  { id: 'mine',       label: 'My Moves' },
]

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function AssetLine({ sign, asset, onSelectPlayer }) {
  const color = sign === '+' ? 'text-success' : 'text-danger'
  return (
    <div className="flex items-center gap-1 leading-snug">
      <span className={`font-mono text-xs font-bold ${color} shrink-0`}>{sign}</span>
      {asset.player ? (
        <button
          onClick={() => onSelectPlayer(asset.player)}
          className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0 underline decoration-dotted decoration-text-tertiary underline-offset-2 active:opacity-60 transition-opacity"
        >
          {asset.label}
        </button>
      ) : (
        <span className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0">
          {asset.label}
        </span>
      )}
      <span className="flex-1" />
      <span className="font-mono text-[11px] text-text-secondary dark:text-text-secondary tabular-nums shrink-0">
        {asset.value != null ? asset.value.toLocaleString() : '—'}
      </span>
    </div>
  )
}

function TradeCard({ tx, teamName, resolveAsset, pickValue, onSelectPlayer }) {
  const sides = (tx.roster_ids ?? []).map(rosterId => {
    const players = Object.entries(tx.adds ?? {})
      .filter(([, rid]) => rid === rosterId)
      .map(([pid]) => resolveAsset(pid))
    const picks = (tx.draft_picks ?? [])
      .filter(pk => pk.owner_id === rosterId)
      .map(pk => ({
        label: `${pk.season} ${ROUND_SUFFIXES[pk.round] ?? `R${pk.round}`}${pk.roster_id !== rosterId ? ` (via ${teamName(pk.roster_id)})` : ''}`,
        value: pickValue(pk),
        player: null,
      }))
    const faab = (tx.waiver_budget ?? [])
      .filter(wb => wb.receiver === rosterId)
      .map(wb => ({ label: `$${wb.amount} FAAB`, value: null, player: null }))
    const assets = [...players, ...picks, ...faab]
    const total = assets.reduce((s, a) => s + (a.value ?? 0), 0)
    return { rosterId, assets, total }
  }).filter(s => s.assets.length > 0)

  // Color the larger haul green when the gap is meaningful (>5%)
  const totals = sides.map(s => s.total).filter(t => t > 0)
  const maxTotal = Math.max(0, ...totals)
  const minTotal = Math.min(...(totals.length ? totals : [0]))
  const meaningfulGap = totals.length > 1 && maxTotal > 0 && (maxTotal - minTotal) / maxTotal > 0.05

  return (
    <div className="flex flex-col gap-2">
      {sides.map(side => (
        <div key={side.rosterId}>
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <p className="font-body text-[11px] font-semibold text-text-secondary dark:text-text-secondary truncate">
              {teamName(side.rosterId)} gets
            </p>
            {side.total > 0 && (
              <span className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
                meaningfulGap && side.total === maxTotal ? 'text-success' : 'text-text-secondary dark:text-text-secondary'
              }`}>
                {side.total.toLocaleString()}
              </span>
            )}
          </div>
          {side.assets.map((asset, i) => (
            <AssetLine key={i} sign="+" asset={asset} onSelectPlayer={onSelectPlayer} />
          ))}
        </div>
      ))}
    </div>
  )
}

function PickupCard({ tx, teamName, resolveAsset, onSelectPlayer }) {
  const rosterId = tx.roster_ids?.[0]
  const adds = Object.keys(tx.adds ?? {}).map(resolveAsset)
  const drops = Object.keys(tx.drops ?? {}).map(resolveAsset)
  const bid = tx.settings?.waiver_bid

  return (
    <div>
      <p className="font-body text-[11px] font-semibold text-text-secondary dark:text-text-secondary mb-0.5">
        {teamName(rosterId)}
        {bid != null && <span className="font-mono text-warning ml-1.5">${bid}</span>}
      </p>
      {adds.map((asset, i) => <AssetLine key={`a${i}`} sign="+" asset={asset} onSelectPlayer={onSelectPlayer} />)}
      {drops.map((asset, i) => <AssetLine key={`d${i}`} sign="−" asset={asset} onSelectPlayer={onSelectPlayer} />)}
    </div>
  )
}

export default function LeagueActivity() {
  const { league, values, loading: leagueLoading, error: leagueError, retry: leagueRetry, myRosterId } = useLeagueContext()
  const { transactions, loading: txLoading, error: txError, retry: txRetry } = useTransactions()
  const { playerDB } = usePlayerDB()
  const [filter, setFilterState] = useState('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  function setFilter(id) {
    setFilterState(id)
    setVisibleCount(PAGE_SIZE)
  }

  const filtered = useMemo(() => {
    if (!transactions) return null
    if (filter === 'all') return transactions
    if (filter === 'mine') return transactions.filter(tx => (tx.roster_ids ?? []).includes(myRosterId))
    return transactions.filter(tx => tx.type === filter)
  }, [transactions, filter])

  const loading = (leagueLoading && !league) || (txLoading && !transactions)
  if (loading) return <LoadingSpinner message="Loading league activity…" />
  if (leagueError && !league) return <ErrorState message={leagueError} onRetry={leagueRetry} />
  if (txError && !transactions) return <ErrorState message={txError} onRetry={txRetry} />
  if (!league || !transactions || !filtered) return <ErrorState message="Could not load activity." onRetry={() => { leagueRetry(); txRetry() }} />

  const teamName = rosterId => getTeamName(league.userMap[rosterId])
  // Players keep their full FantasyCalc object so names can open the profile
  // drawer; unranked players fall back to the player DB with no value.
  const resolveAsset = rawPid => {
    const pid = String(rawPid)
    const fc = values?.playerMap?.[pid]
    if (fc) return { label: fc.name, value: fc.value, player: fc }
    return { label: playerDB?.[pid]?.name ?? `Player #${pid}`, value: null, player: null }
  }
  const pickValue = pk => {
    const v = findPickValue({ season: pk.season, round: pk.round }, values?.pickEntries ?? [])
    return v > 0 ? v : null
  }

  const visible = filtered.slice(0, visibleCount)

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          League Activity
        </p>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          {filtered.length} completed transaction{filtered.length === 1 ? '' : 's'} this season
        </p>
        <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary mt-0.5">
          Asset values shown at today's prices, not at trade time.
        </p>
      </div>

      {/* Type filter */}
      <div className="py-3 -mx-4 px-4 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 w-max">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 px-2.5 py-1 rounded-full font-body text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary dark:bg-bg-secondary text-text-secondary dark:text-text-secondary border border-border-default dark:border-border-default'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-8 text-center">
          {filter === 'all' ? 'No transactions yet this season.' : 'No matching transactions this season.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map(tx => {
            const meta = TYPE_META[tx.type] ?? TYPE_META.commissioner
            const involvesMe = (tx.roster_ids ?? []).includes(myRosterId)
            return (
              <div
                key={tx.transaction_id}
                className={`rounded-xl bg-bg-card dark:bg-bg-card border px-3 py-3 ${
                  involvesMe
                    ? 'border-accent/40'
                    : 'border-border-default dark:border-border-default'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <meta.Icon size={13} strokeWidth={2} className={meta.color} />
                  <span className={`font-body text-[11px] font-semibold uppercase tracking-wider ${meta.color}`}>
                    {meta.label}
                  </span>
                  {involvesMe && (
                    <span className="font-body text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5 bg-accent text-white">
                      You
                    </span>
                  )}
                  <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary ml-auto">
                    Week {tx.week} · {formatDate(tx.status_updated)}
                  </span>
                </div>
                {tx.type === 'trade'
                  ? <TradeCard tx={tx} teamName={teamName} resolveAsset={resolveAsset} pickValue={pickValue} onSelectPlayer={setSelectedPlayer} />
                  : <PickupCard tx={tx} teamName={teamName} resolveAsset={resolveAsset} onSelectPlayer={setSelectedPlayer} />}
              </div>
            )
          })}

          {visibleCount < filtered.length && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="mt-1 py-2.5 rounded-xl border border-accent/25 bg-accent/5 font-body text-sm font-semibold text-accent active:opacity-70 transition-opacity"
            >
              Show more
            </button>
          )}
        </div>
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
