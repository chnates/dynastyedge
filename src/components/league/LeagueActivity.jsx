import { useMemo, useState } from 'react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useTransactions } from '../../hooks/useTransactions'
import { usePlayerDB } from '../../hooks/usePlayerDB'
import { getTeamName } from '../../hooks/useLeague'
import { findPickValue, buildDraftPickIndex, buildGenericRoundValues } from '../../utils/pickCapital'
import { useSleeperDraft } from '../../hooks/useSleeperDraft'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import { Chip, Badge, Button, cn } from '../ui'

const PAGE_SIZE = 25
const ROUND_SUFFIXES = ['', '1st', '2nd', '3rd', '4th', '5th']

// Each move type carried a lucide glyph AND its label. The label already said
// it, so only the label and its colour survive.
const TYPE_META = {
  trade:        { label: 'Trade',      color: 'text-alt' },
  waiver:       { label: 'Waiver',     color: 'text-warning' },
  free_agent:   { label: 'Free Agent', color: 'text-success' },
  commissioner: { label: 'Commish',    color: 'text-text-tertiary' },
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
          className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0 underline decoration-dotted decoration-text-tertiary underline-offset-2 press"
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
        {asset.value != null ? `${asset.approx ? '≈' : ''}${asset.value.toLocaleString()}` : '—'}
      </span>
    </div>
  )
}

function TradeCard({ tx, teamName, resolveAsset, resolvePick, onSelectPlayer }) {
  const sides = (tx.roster_ids ?? []).map(rosterId => {
    const players = Object.entries(tx.adds ?? {})
      .filter(([, rid]) => rid === rosterId)
      .map(([pid]) => resolveAsset(pid))
    const picks = (tx.draft_picks ?? [])
      .filter(pk => pk.owner_id === rosterId)
      .map(pk => resolvePick(pk, rosterId))
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
  // Best-effort, session-cached and shared with the Draft section: after a
  // rookie draft completes this is the draft it keeps on screen, which is
  // exactly the pick list needed to say what a spent pick became. A failure
  // just drops the feed back to the round-median tier — never an error here.
  const sleeperDraft = useSleeperDraft()
  const [filter, setFilterState] = useState('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  function setFilter(id) {
    setFilterState(id)
    setVisibleCount(PAGE_SIZE)
  }

  const pickEntries = useMemo(() => values?.pickEntries ?? [], [values])

  const genericRoundValues = useMemo(
    () => buildGenericRoundValues(pickEntries),
    [pickEntries]
  )

  const pickIndex = useMemo(
    () => buildDraftPickIndex(
      sleeperDraft.data?.draft,
      sleeperDraft.data?.picks,
      league?.allRosters?.map(r => ({
        roster_id: r.rosterId,
        owner_id: r.owner?.user_id,
      })) ?? []
    ),
    [sleeperDraft.data, league]
  )

  const filtered = useMemo(() => {
    if (!transactions) return null
    if (filter === 'all') return transactions
    if (filter === 'mine') return transactions.filter(tx => (tx.roster_ids ?? []).includes(myRosterId))
    return transactions.filter(tx => tx.type === filter)
  }, [transactions, filter, myRosterId])

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
  // A traded pick, priced the way the manager scouting ledger prices one — the
  // two screens show the same trades and must never disagree about an asset.
  //
  // FantasyCalc retires a season's pick entries the moment its draft completes,
  // so a pick spent in THIS season's feed has no market price at all. Three
  // tiers, best first: the player actually drafted at that slot (tappable, at
  // his value today), then the generic round median marked approximate, then
  // `—`. Only the last is honest as a blank, and it is now reached only when
  // FantasyCalc lists no picks whatsoever.
  const resolvePick = (pk, rosterId) => {
    const via = pk.roster_id !== rosterId ? ` (via ${teamName(pk.roster_id)})` : ''
    const round = ROUND_SUFFIXES[pk.round] ?? `R${pk.round}`
    const base = `${pk.season} ${round}`

    const became = pickIndex[`${pk.season}-${pk.round}-${pk.roster_id}`]
    if (became) {
      // Once we know what the pick became, its exact slot says more than "(via
      // X)" and costs a third of the width — which matters, because the label
      // truncates at 390px and the player's name is the new information.
      const asset = resolveAsset(became.playerId)
      return {
        label: `${pk.season} ${became.slotLabel ?? round} → ${asset.label}`,
        value: asset.value,
        player: asset.player,
      }
    }

    const market = findPickValue({ season: pk.season, round: pk.round }, pickEntries)
    if (market > 0) return { label: `${base}${via}`, value: market, player: null }

    const generic = genericRoundValues[pk.round] ?? 0
    return {
      label: `${base}${via}`,
      value: generic > 0 ? generic : null,
      approx: generic > 0,
      player: null,
    }
  }

  const visible = filtered.slice(0, visibleCount)

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary mb-0.5">
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
            <Chip
              key={f.id}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn('px-2.5 py-1', filter !== f.id && 'bg-bg-secondary dark:bg-bg-secondary')}
            >
              {f.label}
            </Chip>
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
                className={`rounded-none bg-bg-card dark:bg-bg-card border px-3 py-3 ${
                  involvesMe
                    ? 'border-brand/40'
                    : 'border-border-default dark:border-border-default'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <meta.Icon size={13} strokeWidth={2} className={meta.color} />
                  <span className={`font-body text-[11px] font-semibold uppercase tracking-wider ${meta.color}`}>
                    {meta.label}
                  </span>
                  {involvesMe && <Badge tone="brand">You</Badge>}
                  <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary ml-auto">
                    Week {tx.week} · {formatDate(tx.status_updated)}
                  </span>
                </div>
                {tx.type === 'trade'
                  ? <TradeCard tx={tx} teamName={teamName} resolveAsset={resolveAsset} resolvePick={resolvePick} onSelectPlayer={setSelectedPlayer} />
                  : <PickupCard tx={tx} teamName={teamName} resolveAsset={resolveAsset} onSelectPlayer={setSelectedPlayer} />}
              </div>
            )
          })}

          {visibleCount < filtered.length && (
            <Button
              variant="tinted"
              size="lg"
              fullWidth
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="mt-1"
            >
              Show more
            </Button>
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
