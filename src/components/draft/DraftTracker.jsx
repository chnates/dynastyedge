import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  RotateCcw, RefreshCw, ChevronDown, ChevronRight,
  Search, FileText,
} from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useRookieADP } from '../../hooks/useRookieADP'
import { buildRookieProspects } from '../../utils/rookieAdp'
import { useSleeperDraft, buildDraftOrder, DRAFT_SEASON } from '../../hooks/useSleeperDraft'
import { useSheetDrag } from '../../hooks/useSheetDrag'
import { useScrollLock } from '../../hooks/useScrollLock'
import { getTeamName } from '../../hooks/useLeague'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import { MY_ROSTER_ID } from '../../constants'
import { BOARD_ORDER_KEY, NOTES_KEY, readJSON } from './boardStorage'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import { POS_CHIP_ACTIVE, POS_TEXT } from '../../utils/positionColors'

const MANUAL_STORAGE_KEY = `dynastyedge_draft_tracker_${DRAFT_SEASON}`
const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE']
const FALLBACK_ROUNDS = 4
const FALLBACK_TEAMS = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

function slotLabel(round, slot) {
  return `${round}.${String(slot).padStart(2, '0')}`
}

function relTime(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

function pickSlotLabel(pick, teams) {
  const slot = pick.draft_slot ?? ((pick.pick_no - 1) % teams) + 1
  return slotLabel(pick.round, slot)
}

// ── Shared subcomponents ──────────────────────────────────────────────────────

const STATUS_CHIPS = {
  pre_draft: { label: 'Pre-Draft', cls: 'text-text-secondary bg-bg-card border-border-default' },
  drafting:  { label: '● Live',    cls: 'text-success bg-success/15 border-success/30' },
  paused:    { label: 'Paused',    cls: 'text-warning bg-warning/15 border-warning/30' },
  complete:  { label: 'Complete',  cls: 'text-accent bg-accent/15 border-accent/30' },
}

function StatusBar({ status, fetchedAt, refreshing, syncError, onRefresh }) {
  // Re-render every 15s so "Xs ago" stays honest
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const chip = STATUS_CHIPS[status] ?? STATUS_CHIPS.pre_draft
  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <span className={`font-body text-[10px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 ${chip.cls}`}>
          {chip.label}
        </span>
        <span className="font-body text-[10px] text-text-tertiary flex-1 truncate">
          Synced with Sleeper{fetchedAt ? ` · ${relTime(fetchedAt)}` : ''}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-card border border-border-default text-text-secondary active:opacity-60 transition-opacity flex-shrink-0"
        >
          <RefreshCw size={13} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
          <span className="font-body text-[11px] font-semibold uppercase tracking-wide">Refresh</span>
        </button>
      </div>
      {syncError && (
        <p className="font-body text-[10px] text-danger mt-1.5">
          Last sync failed — showing previous data. Tap Refresh to retry.
        </p>
      )}
    </div>
  )
}

function DraftCapitalCard({ capital, taxiUsed, taxiSlots }) {
  if (!capital.length && taxiSlots == null) return null
  return (
    <div className="mx-4 mt-3 px-3 py-2.5 rounded-xl bg-bg-card border border-border-default">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          My Draft Capital
        </span>
        {taxiSlots != null && (
          <span className="font-body text-[10px] text-text-tertiary">
            Taxi <span className="font-mono text-text-secondary">{taxiUsed}/{taxiSlots}</span>
          </span>
        )}
      </div>
      {capital.length === 0 ? (
        <p className="font-body text-xs text-text-tertiary">No {DRAFT_SEASON} picks owned.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {capital.map(c => (
            <span
              key={c.key}
              className={`flex items-baseline gap-1.5 px-2 py-1 rounded-lg border ${
                c.used
                  ? 'border-border-default bg-bg-secondary opacity-50'
                  : 'border-accent/30 bg-accent/10'
              }`}
            >
              <span className={`font-mono text-xs font-bold ${c.used ? 'text-text-tertiary line-through' : 'text-accent'}`}>
                {c.label}
              </span>
              {c.value > 0 && (
                <span className="font-mono text-[10px] text-text-secondary tabular-nums">
                  {Math.round(c.value).toLocaleString()}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function OnTheClockBanner({ slotStr }) {
  return (
    <div className="mx-4 mt-3 px-3 py-3 rounded-xl bg-accent/10 border border-accent/30 text-center">
      <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-accent mb-0.5">
        You're on the clock
      </p>
      <p className="font-mono text-2xl font-bold text-accent">{slotStr}</p>
    </div>
  )
}

function NeedBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 border border-success/30 rounded px-1.5 py-0.5 flex-shrink-0">
      Need
    </span>
  )
}

function DeltaChip({ delta }) {
  if (delta == null || Math.abs(delta) < 2) return null
  const steal = delta > 0
  return (
    <span className={`font-mono text-[10px] font-bold tabular-nums flex-shrink-0 ${steal ? 'text-success' : 'text-danger'}`}>
      {steal ? `+${delta}` : delta}
    </span>
  )
}

function BestAvailableCard({ rows, onSelect }) {
  if (!rows.length) return null
  return (
    <div className="mx-4 mt-3 rounded-xl bg-bg-card border border-success/30 px-3 py-2.5">
      <p className="font-body text-[10px] font-semibold uppercase tracking-wider text-success mb-1.5">
        Best Available For You
      </p>
      {rows.map(({ tag, player }) => (
        <button
          key={player.sleeperId}
          onClick={() => onSelect(player)}
          className="w-full flex items-center gap-2 py-1.5 text-left active:opacity-60 transition-opacity"
        >
          <span className="font-body text-[10px] text-text-tertiary w-24 flex-shrink-0 truncate">{tag}</span>
          <span className="font-body text-sm font-medium text-text-primary flex-1 truncate">{player.name}</span>
          <span className={`font-body text-[10px] font-semibold uppercase flex-shrink-0 ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>{player.position}</span>
          <span className="font-mono text-xs font-medium text-accent tabular-nums flex-shrink-0">
            {(player.value ?? 0).toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  )
}

// Searchable, filterable undrafted prospect list — sortable by My Board order
// (when one exists) or derived rookie ADP. Tap → player profile drawer.
function ProspectList({
  prospects, draftedIds, needPositions, notes, boardRankMap, onSelect,
}) {
  const [search, setSearch]     = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  const [sortMode, setSortMode] = useState(boardRankMap ? 'board' : 'adp')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = prospects.filter(p =>
      !draftedIds.has(p.sleeperId) &&
      (posFilter === 'ALL' || p.position === posFilter) &&
      (!q || p.name?.toLowerCase().includes(q))
    )
    const rankOf = sortMode === 'board' && boardRankMap
      ? p => boardRankMap[p.sleeperId] ?? 9999
      : p => p.adp ?? 9999
    return filtered.sort((a, b) => rankOf(a) - rankOf(b))
  }, [prospects, draftedIds, search, posFilter, sortMode, boardRankMap])

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          On the Board — {list.length}
        </p>
        {boardRankMap && (
          <div className="flex rounded-lg border border-border-default overflow-hidden">
            {[['board', 'My Board'], ['adp', 'ADP']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  sortMode === mode ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" strokeWidth={1.75} />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search prospects"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border-default font-body text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
        />
      </div>

      <div className="flex gap-1.5 mb-2 overflow-x-auto">
        {POS_FILTERS.map(pos => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-body text-xs font-semibold uppercase tracking-wide transition-colors ${
              posFilter === pos
                ? POS_CHIP_ACTIVE[pos] ?? 'bg-accent text-white'
                : 'bg-bg-card border border-border-default text-text-secondary'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="text-center text-text-tertiary font-body text-sm py-6">
          {prospects.length === 0 ? 'No rookie prospects loaded yet.' : 'No prospects match.'}
        </p>
      ) : (
        <div className="rounded-xl bg-bg-card border border-border-default px-3">
          {list.map((player, i) => {
            const rank = sortMode === 'board' && boardRankMap
              ? boardRankMap[player.sleeperId]
              : player.adp
            return (
              <button
                key={player.sleeperId}
                onClick={() => onSelect(player)}
                className={`w-full text-left py-2.5 flex items-center gap-2 active:opacity-60 transition-opacity ${
                  i < list.length - 1 ? 'border-b border-border-default' : ''
                }`}
              >
                <span className="font-mono text-xs font-bold text-text-tertiary tabular-nums w-7 text-right flex-shrink-0">
                  {rank != null ? `#${rank}` : '—'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-sm font-medium text-text-primary leading-tight truncate">
                      {player.name}
                    </span>
                    {!!notes[player.sleeperId] && (
                      <FileText size={11} className="text-accent flex-shrink-0" strokeWidth={1.75} />
                    )}
                    {needPositions.includes(player.position) && <NeedBadge />}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`font-body text-[10px] font-semibold uppercase ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>{player.position}</span>
                    <span className="text-text-tertiary text-[10px]">·</span>
                    <span className="font-body text-[10px] text-text-tertiary">{player.team || 'TBD'}</span>
                    {player.adp != null && (
                      <>
                        <span className="text-text-tertiary text-[10px]">·</span>
                        <span className="font-body text-[10px] text-text-tertiary">Rk ADP {player.adp}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="font-mono text-xs font-medium text-accent tabular-nums flex-shrink-0">
                  {(player.value ?? 0).toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PickRow({ pick, player, teamName, isMine, label, delta, isLast, onSelect }) {
  const Inner = (
    <>
      <span className={`font-mono text-xs font-bold w-10 flex-shrink-0 ${isMine ? 'text-accent' : 'text-text-tertiary'}`}>
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-body text-sm text-text-primary truncate">{player.name}</p>
        <p className="font-body text-[10px] text-text-tertiary truncate">{teamName}{isMine ? ' · You' : ''}</p>
      </div>
      <DeltaChip delta={delta} />
      <span className="font-mono text-xs text-text-secondary tabular-nums flex-shrink-0">
        {(player.value ?? 0) > 0 ? player.value.toLocaleString() : '—'}
      </span>
      <span className={`font-body text-[10px] font-semibold uppercase w-7 text-right flex-shrink-0 ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>
        {player.position}
      </span>
    </>
  )
  const cls = `w-full text-left py-2.5 flex items-center gap-2 ${isLast ? '' : 'border-b border-border-default'} ${
    isMine ? 'bg-accent/5 -mx-3 px-3' : ''
  }`
  return onSelect ? (
    <button onClick={onSelect} className={`${cls} active:opacity-60 transition-opacity`}>{Inner}</button>
  ) : (
    <div className={cls}>{Inner}</div>
  )
}

// ── Synced tracker (Sleeper draft exists) ─────────────────────────────────────

function SyncedTracker({ sleeperDraft, league, leagueInfo, values, prospects }) {
  const { data, fetchedAt, refreshing, error: syncError, refresh } = sleeperDraft
  const { draft, picks, tradedPicks } = data
  const userMap = league?.userMap ?? {}

  const [selected, setSelected] = useState(null)
  const [allPicksOpen, setAllPicksOpen] = useState(false)
  const [notes, setNotes] = useState(() => readJSON(NOTES_KEY, {}))
  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
  }, [notes])
  const updateNote = useCallback((sleeperId, text) => {
    setNotes(prev => {
      const trimmed = text.trim()
      if (!trimmed) {
        const next = { ...prev }
        delete next[sleeperId]
        return next
      }
      return { ...prev, [sleeperId]: trimmed }
    })
  }, [])

  const order = useMemo(() => buildDraftOrder(draft, tradedPicks), [draft, tradedPicks])
  const orderKnown = order != null
  const teams = draft.settings?.teams ?? FALLBACK_TEAMS
  const totalPicks = order?.length ?? (draft.settings?.rounds ?? FALLBACK_ROUNDS) * teams

  const sortedPicks = useMemo(
    () => [...picks].sort((a, b) => a.pick_no - b.pick_no),
    [picks]
  )
  const draftedIds = useMemo(
    () => new Set(sortedPicks.map(p => String(p.player_id))),
    [sortedPicks]
  )

  const isComplete = draft.status === 'complete' ||
    (totalPicks > 0 && sortedPicks.length >= totalPicks)
  const isLive = draft.status === 'drafting' || draft.status === 'paused'
  const nextPick = !isComplete && orderKnown ? order[sortedPicks.length] ?? null : null
  const isOnClock = isLive && nextPick?.rosterId === MY_ROSTER_ID
  const myUpcoming = orderKnown
    ? order.slice(sortedPicks.length).filter(p => p.rosterId === MY_ROSTER_ID)
    : []
  const picksUntilMine = myUpcoming.length > 0
    ? myUpcoming[0].overall - sortedPicks.length - 1
    : null

  const boardRankMap = useMemo(() => {
    const boardOrder = readJSON(BOARD_ORDER_KEY, [])
    if (!boardOrder.length) return null
    const m = {}
    boardOrder.forEach((id, i) => { m[id] = i + 1 })
    return m
  }, [])

  const needPositions = useMemo(() => {
    if (!league) return []
    const avgs = computeLeagueAverages(league.allRosters)
    const deltas = getPositionalDeltas(league.myRoster, avgs)
    return Object.entries(deltas).filter(([, d]) => d < 0).map(([p]) => p)
  }, [league])

  const { resolvePick, adpById } = useMemo(() => {
    const byId = {}
    const adp = {}
    prospects.forEach(r => {
      byId[r.sleeperId] = r
      if (r.adp != null) adp[r.sleeperId] = r.adp
    })
    return {
      resolvePick: pick => {
        const id = String(pick.player_id)
        return values?.playerMap?.[id] ?? byId[id] ?? {
          sleeperId: id,
          name: [pick.metadata?.first_name, pick.metadata?.last_name].filter(Boolean).join(' ') || `Player ${id}`,
          position: pick.metadata?.position ?? '',
          value: 0,
        }
      },
      adpById: adp,
    }
  }, [prospects, values])

  // My pick capital: order-driven when the real order is known; values come
  // from league pick data (already FantasyCalc-priced in useLeague).
  const capital = useMemo(() => {
    const leaguePicks = (league?.myRoster?.picks ?? []).filter(p => p.season === DRAFT_SEASON)
    if (orderKnown) {
      return order
        .filter(p => p.rosterId === MY_ROSTER_ID)
        .map(p => ({
          key: p.label,
          label: p.label,
          used: p.overall <= sortedPicks.length,
          value: leaguePicks.find(lp =>
            lp.round === p.round && lp.originalOwner === p.originalRosterId
          )?.value ?? 0,
        }))
    }
    return leaguePicks.map(p => ({
      key: `${p.round}-${p.originalOwner}`,
      label: `Rd ${p.round}`,
      used: false,
      value: p.value ?? 0,
    }))
  }, [order, orderKnown, league, sortedPicks.length])

  const taxiSlots = leagueInfo?.settings?.taxi_slots ?? null
  const taxiUsed = useMemo(
    () => (league?.myRoster?.players ?? []).filter(p => p.isTaxi).length,
    [league]
  )

  const bestAvailable = useMemo(() => {
    if (!isOnClock) return []
    const avail = prospects.filter(p => !draftedIds.has(p.sleeperId))
    const rankOf = boardRankMap
      ? p => boardRankMap[p.sleeperId] ?? 9999
      : p => p.adp ?? 9999
    const sorted = [...avail].sort((a, b) => rankOf(a) - rankOf(b))
    const rows = []
    if (sorted[0]) rows.push({ tag: 'Best overall', player: sorted[0] })
    needPositions.forEach(pos => {
      const top = sorted.find(p =>
        p.position === pos && !rows.some(r => r.player.sleeperId === p.sleeperId)
      )
      if (top) rows.push({ tag: `Top ${pos} · need`, player: top })
    })
    return rows
  }, [isOnClock, prospects, draftedIds, boardRankMap, needPositions])

  // ── Recap data (complete draft) ────────────────────────────────────────────
  const recap = useMemo(() => {
    if (!isComplete) return null
    const totals = {}
    const entries = sortedPicks.map(pick => {
      const player = resolvePick(pick)
      const adp = adpById[String(pick.player_id)] ?? null
      const delta = adp != null ? pick.pick_no - adp : null
      if (!totals[pick.roster_id]) totals[pick.roster_id] = { rosterId: pick.roster_id, total: 0, count: 0 }
      totals[pick.roster_id].total += player.value ?? 0
      totals[pick.roster_id].count += 1
      return { pick, player, delta }
    })
    const withDelta = entries.filter(e => e.delta != null)
    return {
      entries,
      teamTotals: Object.values(totals).sort((a, b) => b.total - a.total),
      steals: [...withDelta].sort((a, b) => b.delta - a.delta).filter(e => e.delta >= 2).slice(0, 3),
      reaches: [...withDelta].sort((a, b) => a.delta - b.delta).filter(e => e.delta <= -2).slice(0, 3),
    }
  }, [isComplete, sortedPicks, resolvePick, adpById])

  const recentPicks = useMemo(
    () => [...sortedPicks].reverse(),
    [sortedPicks]
  )

  return (
    <>
      <div className="pb-4">
        <StatusBar
          status={isComplete ? 'complete' : draft.status}
          fetchedAt={fetchedAt}
          refreshing={refreshing}
          syncError={syncError}
          onRefresh={refresh}
        />

        {draft.status === 'pre_draft' && draft.start_time && (
          <p className="px-4 pt-2 font-body text-xs text-text-secondary">
            Scheduled: {new Date(draft.start_time).toLocaleString([], {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </p>
        )}
        {!orderKnown && !isComplete && (
          <p className="px-4 pt-2 font-body text-xs text-text-tertiary">
            Draft order hasn't been set in Sleeper yet — pick slots will appear once it is.
          </p>
        )}

        {isOnClock && nextPick && <OnTheClockBanner slotStr={nextPick.label} />}
        {isLive && !isOnClock && nextPick && (
          <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">On the clock</span>
            <span className="font-mono text-sm font-bold text-text-primary">{nextPick.label}</span>
            <span className="font-body text-xs text-text-secondary">
              {getTeamName(userMap[nextPick.rosterId])}
            </span>
            {picksUntilMine != null && picksUntilMine > 0 && (
              <span className="font-body text-[10px] text-accent">
                · {picksUntilMine} {picksUntilMine === 1 ? 'pick' : 'picks'} until yours
              </span>
            )}
          </div>
        )}

        {!isComplete && (
          <DraftCapitalCard capital={capital} taxiUsed={taxiUsed} taxiSlots={taxiSlots} />
        )}

        {isOnClock && <BestAvailableCard rows={bestAvailable} onSelect={setSelected} />}

        {isComplete && recap ? (
          <div className="px-4 pt-4">
            <h2 className="font-display text-lg font-bold uppercase text-text-primary mb-2">Draft Recap</h2>

            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1.5">
              Value Drafted by Team
            </p>
            <div className="rounded-xl bg-bg-card border border-border-default px-3 mb-4">
              {recap.teamTotals.map((t, i) => {
                const isMine = t.rosterId === MY_ROSTER_ID
                return (
                  <div
                    key={t.rosterId}
                    className={`py-2.5 flex items-center gap-2 ${i < recap.teamTotals.length - 1 ? 'border-b border-border-default' : ''} ${
                      isMine ? 'bg-accent/5 -mx-3 px-3' : ''
                    }`}
                  >
                    <span className="font-mono text-xs font-bold text-text-tertiary w-5 flex-shrink-0">{i + 1}</span>
                    <span className={`font-body text-sm flex-1 truncate ${isMine ? 'text-accent font-medium' : 'text-text-primary'}`}>
                      {getTeamName(userMap[t.rosterId])}{isMine ? ' · You' : ''}
                    </span>
                    <span className="font-body text-[10px] text-text-tertiary flex-shrink-0">{t.count} picks</span>
                    <span className="font-mono text-xs font-medium text-accent tabular-nums flex-shrink-0">
                      {Math.round(t.total).toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>

            {(recap.steals.length > 0 || recap.reaches.length > 0) && (
              <div className="mb-4">
                {recap.steals.length > 0 && (
                  <>
                    <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-success mb-1.5">
                      Biggest Steals
                    </p>
                    <div className="rounded-xl bg-bg-card border border-border-default px-3 mb-3">
                      {recap.steals.map((e, i) => (
                        <PickRow
                          key={e.pick.pick_no}
                          pick={e.pick}
                          player={e.player}
                          teamName={getTeamName(userMap[e.pick.roster_id])}
                          isMine={e.pick.roster_id === MY_ROSTER_ID}
                          label={pickSlotLabel(e.pick, teams)}
                          delta={e.delta}
                          isLast={i === recap.steals.length - 1}
                          onSelect={values?.playerMap?.[String(e.pick.player_id)] ? () => setSelected(e.player) : null}
                        />
                      ))}
                    </div>
                  </>
                )}
                {recap.reaches.length > 0 && (
                  <>
                    <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-danger mb-1.5">
                      Biggest Reaches
                    </p>
                    <div className="rounded-xl bg-bg-card border border-border-default px-3">
                      {recap.reaches.map((e, i) => (
                        <PickRow
                          key={e.pick.pick_no}
                          pick={e.pick}
                          player={e.player}
                          teamName={getTeamName(userMap[e.pick.roster_id])}
                          isMine={e.pick.roster_id === MY_ROSTER_ID}
                          label={pickSlotLabel(e.pick, teams)}
                          delta={e.delta}
                          isLast={i === recap.reaches.length - 1}
                          onSelect={values?.playerMap?.[String(e.pick.player_id)] ? () => setSelected(e.player) : null}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1.5">
              Full Results
            </p>
            <div className="rounded-xl bg-bg-card border border-border-default px-3">
              {recap.entries.map((e, i) => (
                <PickRow
                  key={e.pick.pick_no}
                  pick={e.pick}
                  player={e.player}
                  teamName={getTeamName(userMap[e.pick.roster_id])}
                  isMine={e.pick.roster_id === MY_ROSTER_ID}
                  label={pickSlotLabel(e.pick, teams)}
                  delta={e.delta}
                  isLast={i === recap.entries.length - 1}
                  onSelect={values?.playerMap?.[String(e.pick.player_id)] ? () => setSelected(e.player) : null}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <ProspectList
              prospects={prospects}
              draftedIds={draftedIds}
              needPositions={needPositions}
              notes={notes}
              boardRankMap={boardRankMap}
              onSelect={setSelected}
            />

            {sortedPicks.length > 0 && (
              <div className="px-4 pt-4">
                <button
                  onClick={() => setAllPicksOpen(o => !o)}
                  className="flex items-center gap-2 w-full mb-2"
                >
                  {allPicksOpen
                    ? <ChevronDown size={14} className="text-text-tertiary" />
                    : <ChevronRight size={14} className="text-text-tertiary" />}
                  <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                    Drafted — {sortedPicks.length} of {totalPicks}
                  </p>
                </button>
                <div className="rounded-xl bg-bg-card border border-border-default px-3">
                  {(allPicksOpen ? recentPicks : recentPicks.slice(0, 3)).map((pick, i, arr) => {
                    const player = resolvePick(pick)
                    const adp = adpById[String(pick.player_id)] ?? null
                    return (
                      <PickRow
                        key={pick.pick_no}
                        pick={pick}
                        player={player}
                        teamName={getTeamName(userMap[pick.roster_id])}
                        isMine={pick.roster_id === MY_ROSTER_ID}
                        label={pickSlotLabel(pick, teams)}
                        delta={adp != null ? pick.pick_no - adp : null}
                        isLast={i === arr.length - 1}
                        onSelect={values?.playerMap?.[String(pick.player_id)] ? () => setSelected(player) : null}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <PlayerProfileDrawer
          player={selected}
          playerMap={values?.playerMap ?? {}}
          onClose={() => setSelected(null)}
          isDraftContext
          note={notes[selected.sleeperId]}
          onNoteChange={updateNote}
        />
      )}
    </>
  )
}

// ── Manual fallback tracker (no Sleeper draft created yet) ────────────────────

function parseManualSlot(slotStr) {
  const match = slotStr?.match(/^(\d+)\.(\d+)$/)
  if (!match) return null
  const round = parseInt(match[1], 10)
  const pick  = parseInt(match[2], 10)
  if (round < 1 || round > FALLBACK_ROUNDS || pick < 1 || pick > FALLBACK_TEAMS) return null
  return { round, pick, overall: (round - 1) * FALLBACK_TEAMS + pick }
}

// Provisional 40-pick order assuming slot = original owner's roster ID.
// Only used before the real draft exists in Sleeper.
function buildAssumedOrder(allRosters) {
  const pickMap = {}
  allRosters.forEach(roster => {
    roster.picks
      .filter(p => p.season === DRAFT_SEASON)
      .forEach(p => {
        pickMap[`${p.round}-${p.originalOwner}`] = p.currentOwner
      })
  })

  const order = []
  for (let round = 1; round <= FALLBACK_ROUNDS; round++) {
    for (let slot = 1; slot <= FALLBACK_TEAMS; slot++) {
      const currentOwner = pickMap[`${round}-${slot}`] ?? slot
      order.push({
        round,
        slot,
        overall: (round - 1) * FALLBACK_TEAMS + slot,
        currentOwner,
        slotStr: slotLabel(round, slot),
      })
    }
  }
  return order
}

function findNextManualPick(draftOrder, drafted) {
  const draftedOveralls = new Set(
    drafted.map(d => parseManualSlot(d.slot)?.overall).filter(Boolean)
  )
  return draftOrder.find(p => !draftedOveralls.has(p.overall)) ?? null
}

function LogPickModal({ player, nextPickInfo, userMap, onSave, onClose }) {
  useScrollLock()
  const { sheetRef } = useSheetDrag(onClose)
  const teamName = getTeamName(userMap[nextPickInfo?.currentOwner])
  const isMyPick = nextPickInfo?.currentOwner === MY_ROSTER_ID

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div
        ref={sheetRef}
        className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>
        <div className="px-4 pt-2 pb-4">
          <h3 className="font-display text-lg font-bold uppercase text-text-primary leading-tight">
            Log Pick
          </h3>
          <p className="font-body text-sm text-text-secondary mt-0.5 mb-4">{player.name}</p>

          <div className="rounded-lg bg-bg-card border border-border-default px-3 py-2.5 flex items-center gap-3">
            <span className="font-mono text-xl font-bold text-accent tabular-nums">
              {nextPickInfo?.slotStr}
            </span>
            <div>
              <p className="font-body text-sm text-text-primary leading-tight">{teamName}</p>
              {isMyPick && (
                <p className="font-body text-[10px] text-accent">Your pick</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary">
              Cancel
            </button>
            <button onClick={onSave} className="flex-1 py-2.5 rounded-lg bg-accent text-white font-body text-sm font-medium">
              Log Pick
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditPickModal({ pick, player, userMap, onDelete, onClose }) {
  useScrollLock()
  const { sheetRef } = useSheetDrag(onClose)
  const teamName = getTeamName(userMap[pick.rosterId])
  const isMyPick = pick.rosterId === MY_ROSTER_ID

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div
        ref={sheetRef}
        className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>
        <div className="px-4 pt-2 pb-4">
          <h3 className="font-display text-lg font-bold uppercase text-text-primary leading-tight">
            Edit Pick
          </h3>
          <p className="font-body text-sm text-text-secondary mt-0.5 mb-4">{player?.name}</p>

          <div className="rounded-lg bg-bg-card border border-border-default px-3 py-2.5 flex items-center gap-3 mb-4">
            <span className="font-mono text-xl font-bold text-text-primary tabular-nums">
              {pick.slot}
            </span>
            <div>
              <p className="font-body text-sm text-text-primary leading-tight">{teamName}</p>
              {isMyPick && (
                <p className="font-body text-[10px] text-accent">Your pick</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onDelete}
              className="flex-1 py-2.5 rounded-lg border border-danger/50 font-body text-sm text-danger"
            >
              Undo Pick
            </button>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResetConfirm({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-xs bg-bg-secondary rounded-2xl border border-border-default p-5 text-center">
        <h3 className="font-display text-lg font-bold uppercase text-text-primary mb-2">Reset tracker?</h3>
        <p className="font-body text-sm text-text-secondary mb-5">This clears all logged picks and cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg bg-danger text-white font-body text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

function ManualTracker({ league, values, prospects, syncError, onCheckAgain, checking }) {
  const [drafted, setDrafted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MANUAL_STORAGE_KEY) ?? '[]') }
    catch { return [] }
  })
  const [logModal, setLogModal]       = useState(null)
  const [editModal, setEditModal]     = useState(null)
  const [draftedOpen, setDraftedOpen] = useState(false)
  const [showReset, setShowReset]     = useState(false)

  useEffect(() => {
    localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(drafted))
  }, [drafted])

  const rookies = useMemo(
    () => [...prospects].sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999)),
    [prospects]
  )
  const draftOrder    = useMemo(() => buildAssumedOrder(league?.allRosters ?? []), [league])
  const draftedSet    = useMemo(() => new Set(drafted.map(d => d.sleeperId)), [drafted])
  const undrafted     = useMemo(() => rookies.filter(p => !draftedSet.has(p.sleeperId)), [rookies, draftedSet])
  const draftedSorted = useMemo(() =>
    [...drafted].sort((a, b) => (parseManualSlot(a.slot)?.overall ?? 0) - (parseManualSlot(b.slot)?.overall ?? 0)),
  [drafted])
  const nextPickInfo  = useMemo(() => findNextManualPick(draftOrder, drafted), [draftOrder, drafted])
  const userMap = league?.userMap ?? {}

  function logPick(player) {
    if (!nextPickInfo) return
    setDrafted(prev => {
      const filtered = prev.filter(d => d.sleeperId !== player.sleeperId)
      return [...filtered, {
        sleeperId: player.sleeperId,
        slot: nextPickInfo.slotStr,
        rosterId: nextPickInfo.currentOwner,
      }]
    })
    setLogModal(null)
  }

  return (
    <>
      <div className="pb-4">
        {/* No-draft banner with on-demand re-check */}
        <div className={`mx-4 mt-4 px-3 py-2.5 rounded-xl border ${syncError ? 'bg-danger/10 border-danger/30' : 'bg-bg-card border-border-default'}`}>
          <div className="flex items-start gap-2">
            <p className="font-body text-xs text-text-secondary flex-1">
              {syncError
                ? 'Couldn’t reach Sleeper to check for the rookie draft.'
                : `No ${DRAFT_SEASON} rookie draft in Sleeper yet — this tracker will sync automatically once your league creates it. Until then, log picks manually below (slots assume roster-ID order).`}
            </p>
            <button
              onClick={onCheckAgain}
              disabled={checking}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-secondary border border-border-default text-text-secondary active:opacity-60 transition-opacity flex-shrink-0"
            >
              <RefreshCw size={12} strokeWidth={1.75} className={checking ? 'animate-spin' : ''} />
              <span className="font-body text-[10px] font-semibold uppercase tracking-wide">Check</span>
            </button>
          </div>
        </div>

        {nextPickInfo && (
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Next pick</span>
              <span className="font-mono text-sm font-bold text-text-primary">{nextPickInfo.slotStr}</span>
              <span className="text-text-tertiary text-[10px]">·</span>
              <span className="font-body text-xs text-text-secondary">
                {getTeamName(userMap[nextPickInfo.currentOwner])}
              </span>
            </div>
          </div>
        )}

        <div className="px-4 pt-3">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2">
            On the Board — {undrafted.length} remaining
          </p>
          {undrafted.length === 0 ? (
            <p className="text-center text-text-tertiary font-body text-sm py-6">All prospects drafted.</p>
          ) : (
            <div className="rounded-xl bg-bg-card border border-border-default px-3">
              {undrafted.map((player, i) => (
                <button
                  key={player.sleeperId}
                  onClick={() => setLogModal(player)}
                  className={`w-full text-left py-2.5 flex items-center gap-2 active:opacity-60 transition-opacity ${
                    i < undrafted.length - 1 ? 'border-b border-border-default' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-body text-sm font-medium text-text-primary leading-tight truncate block">
                      {player.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`font-body text-[10px] font-semibold uppercase ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>{player.position}</span>
                      <span className="text-text-tertiary text-[10px]">·</span>
                      <span className="font-body text-[10px] text-text-tertiary">{player.team || 'TBD'}</span>
                      {player.adp != null && (
                        <>
                          <span className="text-text-tertiary text-[10px]">·</span>
                          <span className="font-body text-[10px] text-text-tertiary">Rk ADP {player.adp}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="font-mono text-xs font-medium text-accent tabular-nums flex-shrink-0">
                    {(player.value ?? 0).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {draftedSorted.length > 0 && (
          <div className="px-4 pt-4">
            <button
              onClick={() => setDraftedOpen(o => !o)}
              className="flex items-center gap-2 w-full mb-2"
            >
              {draftedOpen
                ? <ChevronDown size={14} className="text-text-tertiary" />
                : <ChevronRight size={14} className="text-text-tertiary" />}
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Drafted — {draftedSorted.length}
              </p>
            </button>
            {draftedOpen && (
              <div className="rounded-xl bg-bg-card border border-border-default px-3">
                {draftedSorted.map((pick, i) => {
                  const player = values?.playerMap?.[pick.sleeperId]
                  const team = getTeamName(userMap[pick.rosterId])
                  const isMine = pick.rosterId === MY_ROSTER_ID
                  return (
                    <button
                      key={pick.sleeperId}
                      onClick={() => setEditModal({ pick, player })}
                      className={`w-full text-left py-2.5 flex items-center gap-2 active:opacity-60 transition-opacity ${
                        i < draftedSorted.length - 1 ? 'border-b border-border-default' : ''
                      }`}
                    >
                      <span className={`font-mono text-xs font-bold w-10 flex-shrink-0 ${isMine ? 'text-accent' : 'text-text-tertiary'}`}>
                        {pick.slot}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-text-primary truncate">{player?.name ?? pick.sleeperId}</p>
                        <p className="font-body text-[10px] text-text-tertiary truncate">
                          {team}{isMine ? ' · You' : ''}
                        </p>
                      </div>
                      <span className={`font-body text-[10px] font-semibold uppercase flex-shrink-0 ${POS_TEXT[player?.position] ?? 'text-text-tertiary'}`}>
                        {player?.position}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="px-4 pt-5 flex justify-center">
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-1.5 text-text-tertiary hover:text-danger transition-colors"
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            <span className="font-body text-xs">Reset tracker</span>
          </button>
        </div>
      </div>

      {logModal && nextPickInfo && (
        <LogPickModal
          player={logModal}
          nextPickInfo={nextPickInfo}
          userMap={userMap}
          onSave={() => logPick(logModal)}
          onClose={() => setLogModal(null)}
        />
      )}
      {editModal && (
        <EditPickModal
          pick={editModal.pick}
          player={editModal.player}
          userMap={userMap}
          onDelete={() => {
            setDrafted(prev => prev.filter(d => d.sleeperId !== editModal.pick.sleeperId))
            setEditModal(null)
          }}
          onClose={() => setEditModal(null)}
        />
      )}
      {showReset && (
        <ResetConfirm
          onConfirm={() => { setDrafted([]); setShowReset(false) }}
          onCancel={() => setShowReset(false)}
        />
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftTracker() {
  const { league, loading, error, retry, values, leagueInfo } = useLeagueContext()
  const { rookieMap, loading: rookieLoading, error: rookieError, retry: rookieRetry } = useRookieADP()
  const sleeperDraft = useSleeperDraft()

  const prospects = useMemo(
    () => buildRookieProspects(rookieMap, values?.playerMap),
    [rookieMap, values]
  )

  if (loading || rookieLoading || (sleeperDraft.loading && !sleeperDraft.data)) {
    return <LoadingSpinner message="Loading draft data…" />
  }
  if (error || rookieError) {
    return <ErrorState message={error || rookieError} onRetry={error ? retry : rookieRetry} />
  }

  if (sleeperDraft.data?.draft) {
    return (
      <SyncedTracker
        sleeperDraft={sleeperDraft}
        league={league}
        leagueInfo={leagueInfo}
        values={values}
        prospects={prospects}
      />
    )
  }

  return (
    <ManualTracker
      league={league}
      values={values}
      prospects={prospects}
      syncError={sleeperDraft.error}
      onCheckAgain={sleeperDraft.refresh}
      checking={sleeperDraft.refreshing || sleeperDraft.loading}
    />
  )
}
