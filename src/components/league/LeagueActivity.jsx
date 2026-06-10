import { useState } from 'react'
import { ArrowLeftRight, DollarSign, UserPlus, Gavel } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useTransactions } from '../../hooks/useTransactions'
import { usePlayerDB } from '../../hooks/usePlayerDB'
import { getTeamName } from '../../hooks/useLeague'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'

const PAGE_SIZE = 25
const ROUND_SUFFIXES = ['', '1st', '2nd', '3rd', '4th', '5th']

const TYPE_META = {
  trade:        { label: 'Trade',      Icon: ArrowLeftRight, color: 'text-accent' },
  waiver:       { label: 'Waiver',     Icon: DollarSign,     color: 'text-warning' },
  free_agent:   { label: 'Free Agent', Icon: UserPlus,       color: 'text-success' },
  commissioner: { label: 'Commish',    Icon: Gavel,          color: 'text-text-secondary' },
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function AssetLine({ sign, children }) {
  const color = sign === '+' ? 'text-success' : 'text-danger'
  return (
    <p className="font-body text-xs text-text-primary dark:text-text-primary leading-snug">
      <span className={`font-mono font-bold ${color} mr-1`}>{sign}</span>
      {children}
    </p>
  )
}

function TradeCard({ tx, teamName, resolveName }) {
  const sides = (tx.roster_ids ?? []).map(rosterId => {
    const players = Object.entries(tx.adds ?? {})
      .filter(([, rid]) => rid === rosterId)
      .map(([pid]) => resolveName(pid))
    const picks = (tx.draft_picks ?? [])
      .filter(pk => pk.owner_id === rosterId)
      .map(pk => `${pk.season} ${ROUND_SUFFIXES[pk.round] ?? `R${pk.round}`}${pk.roster_id !== rosterId ? ` (via ${teamName(pk.roster_id)})` : ''}`)
    const faab = (tx.waiver_budget ?? [])
      .filter(wb => wb.receiver === rosterId)
      .map(wb => `$${wb.amount} FAAB`)
    return { rosterId, assets: [...players, ...picks, ...faab] }
  }).filter(s => s.assets.length > 0)

  return (
    <div className="flex flex-col gap-2">
      {sides.map(side => (
        <div key={side.rosterId}>
          <p className="font-body text-[11px] font-semibold text-text-secondary dark:text-text-secondary mb-0.5">
            {teamName(side.rosterId)} gets
          </p>
          {side.assets.map((asset, i) => (
            <AssetLine key={i} sign="+">{asset}</AssetLine>
          ))}
        </div>
      ))}
    </div>
  )
}

function PickupCard({ tx, teamName, resolveName }) {
  const rosterId = tx.roster_ids?.[0]
  const adds = Object.keys(tx.adds ?? {}).map(resolveName)
  const drops = Object.keys(tx.drops ?? {}).map(resolveName)
  const bid = tx.settings?.waiver_bid

  return (
    <div>
      <p className="font-body text-[11px] font-semibold text-text-secondary dark:text-text-secondary mb-0.5">
        {teamName(rosterId)}
        {bid != null && <span className="font-mono text-warning ml-1.5">${bid}</span>}
      </p>
      {adds.map((name, i) => <AssetLine key={`a${i}`} sign="+">{name}</AssetLine>)}
      {drops.map((name, i) => <AssetLine key={`d${i}`} sign="−">{name}</AssetLine>)}
    </div>
  )
}

export default function LeagueActivity() {
  const { league, values, loading: leagueLoading, error: leagueError, retry: leagueRetry } = useLeagueContext()
  const { transactions, loading: txLoading, error: txError, retry: txRetry } = useTransactions()
  const { playerDB } = usePlayerDB()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const loading = (leagueLoading && !league) || (txLoading && !transactions)
  if (loading) return <LoadingSpinner message="Loading league activity…" />
  if (leagueError && !league) return <ErrorState message={leagueError} onRetry={leagueRetry} />
  if (txError && !transactions) return <ErrorState message={txError} onRetry={txRetry} />
  if (!league || !transactions) return <ErrorState message="Could not load activity." onRetry={() => { leagueRetry(); txRetry() }} />

  const teamName = rosterId => getTeamName(league.userMap[rosterId])
  const resolveName = pid =>
    values?.playerMap?.[pid]?.name ?? playerDB?.[pid]?.name ?? `Player #${pid}`

  const visible = transactions.slice(0, visibleCount)

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          League Activity
        </p>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          {transactions.length} completed transaction{transactions.length === 1 ? '' : 's'} this season
        </p>
      </div>

      {transactions.length === 0 ? (
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-8 text-center">
          No transactions yet this season.
        </p>
      ) : (
        <div className="flex flex-col gap-2 pt-3">
          {visible.map(tx => {
            const meta = TYPE_META[tx.type] ?? TYPE_META.commissioner
            return (
              <div
                key={tx.transaction_id}
                className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <meta.Icon size={13} strokeWidth={2} className={meta.color} />
                  <span className={`font-body text-[11px] font-semibold uppercase tracking-wider ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary ml-auto">
                    Week {tx.week} · {formatDate(tx.status_updated)}
                  </span>
                </div>
                {tx.type === 'trade'
                  ? <TradeCard tx={tx} teamName={teamName} resolveName={resolveName} />
                  : <PickupCard tx={tx} teamName={teamName} resolveName={resolveName} />}
              </div>
            )
          })}

          {visibleCount < transactions.length && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="mt-1 py-2.5 rounded-xl border border-border-default dark:border-border-default font-body text-sm font-medium text-accent active:opacity-70 transition-opacity"
            >
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
