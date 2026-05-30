import { useMemo, useState, useEffect } from 'react'
import { RotateCcw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useRookieADP } from '../../hooks/useRookieADP'
import { getTeamName } from '../../hooks/useLeague'
import { MY_ROSTER_ID } from '../../constants'
import LoadingSpinner from '../shared/LoadingSpinner'

const STORAGE_KEY = 'dynastyedge_draft_tracker_2026'
const ROUNDS = 4
const TEAMS = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSlot(slotStr) {
  const match = slotStr?.match(/^(\d+)\.(\d+)$/)
  if (!match) return null
  const round = parseInt(match[1], 10)
  const pick  = parseInt(match[2], 10)
  if (round < 1 || round > ROUNDS || pick < 1 || pick > TEAMS) return null
  return { round, pick, overall: (round - 1) * TEAMS + pick }
}

function slotLabel(round, slot) {
  return `${round}.${String(slot).padStart(2, '0')}`
}

// Build full 40-pick draft order from picks already in LeagueContext.
// originalOwner acts as the pick slot within each round (1–10).
// currentOwner reflects any trades from the traded_picks endpoint.
function buildDraftOrder(allRosters) {
  const pickMap = {}
  allRosters.forEach(roster => {
    roster.picks
      .filter(p => p.season === '2026')
      .forEach(p => {
        const key = `${p.round}-${p.originalOwner}`
        pickMap[key] = p.currentOwner
      })
  })

  const order = []
  for (let round = 1; round <= ROUNDS; round++) {
    for (let slot = 1; slot <= TEAMS; slot++) {
      const key = `${round}-${slot}`
      // fallback: if no pick record, assume original owner still holds it (slot = rosterId)
      const currentOwner = pickMap[key] ?? slot
      order.push({
        round,
        slot,
        overall: (round - 1) * TEAMS + slot,
        currentOwner,
        slotStr: slotLabel(round, slot),
      })
    }
  }
  return order
}

function findNextPick(draftOrder, drafted) {
  const draftedOveralls = new Set(
    drafted.map(d => parseSlot(d.slot)?.overall).filter(Boolean)
  )
  return draftOrder.find(p => !draftedOveralls.has(p.overall)) ?? null
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function OnTheClockBanner({ slotStr, teamName }) {
  return (
    <div className="mx-4 mb-3 px-3 py-3 rounded-xl bg-accent/10 border border-accent/30 text-center">
      <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-accent mb-0.5">
        You're on the clock
      </p>
      <p className="font-mono text-2xl font-bold text-accent">{slotStr}</p>
      <p className="font-body text-xs text-text-secondary mt-0.5">{teamName}</p>
    </div>
  )
}

function MyPickBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/15 border border-accent/30 rounded px-1.5 py-0.5 flex-shrink-0">
      My Pick
    </span>
  )
}

// Confirmation modal — no user inputs; slot and team are derived automatically.
function LogPickModal({ player, nextPickInfo, userMap, onSave, onClose }) {
  const teamName = getTeamName(userMap[nextPickInfo?.currentOwner])
  const isMyPick = nextPickInfo?.currentOwner === MY_ROSTER_ID

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default pb-8">
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

// Edit modal — slot is fixed; only action is undo (delete the logged player).
function EditPickModal({ pick, player, userMap, onDelete, onClose }) {
  const teamName = getTeamName(userMap[pick.rosterId])
  const isMyPick = pick.rosterId === MY_ROSTER_ID

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default pb-8">
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

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftTracker() {
  const { league, loading, error, retry, values } = useLeagueContext()
  const { rookieMap, loading: rookieLoading, error: rookieError, retry: rookieRetry } = useRookieADP()

  const [drafted, setDrafted]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
    catch { return [] }
  })
  const [logModal, setLogModal]       = useState(null)
  const [editModal, setEditModal]     = useState(null)
  const [draftedOpen, setDraftedOpen] = useState(false)
  const [showReset, setShowReset]     = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafted))
  }, [drafted])

  // All hooks before early returns (React rules)
  const rookies = useMemo(() => {
    if (!rookieMap) return []

    const nameToFCEntry = {}
    if (values?.playerMap) {
      Object.values(values.playerMap).forEach(e => {
        if (e.name) nameToFCEntry[e.name.toLowerCase()] = e
      })
    }

    return Object.values(rookieMap)
      .map(rookieEntry => {
        const mainEntry = values?.playerMap?.[rookieEntry.sleeperId]
        if (mainEntry) return { ...mainEntry }
        const nameMatch = nameToFCEntry[rookieEntry.name?.toLowerCase()]
        if (nameMatch) return { ...nameMatch, sleeperId: rookieEntry.sleeperId }
        return { ...rookieEntry, adpOnly: true }
      })
      .sort((a, b) => (a.adp ?? a.overallRank ?? 999) - (b.adp ?? b.overallRank ?? 999))
  }, [rookieMap, values])

  const draftOrder    = useMemo(() => buildDraftOrder(league?.allRosters ?? []), [league])
  const myPicks       = useMemo(() => draftOrder.filter(p => p.currentOwner === MY_ROSTER_ID), [draftOrder])
  const draftedSet    = useMemo(() => new Set(drafted.map(d => d.sleeperId)), [drafted])
  const draftedSlots  = useMemo(() => new Set(drafted.map(d => d.slot)), [drafted])
  const undrafted     = useMemo(() => rookies.filter(p => !draftedSet.has(p.sleeperId)), [rookies, draftedSet])
  const draftedSorted = useMemo(() =>
    [...drafted].sort((a, b) => (parseSlot(a.slot)?.overall ?? 0) - (parseSlot(b.slot)?.overall ?? 0)),
  [drafted])
  const nextPickInfo  = useMemo(() => findNextPick(draftOrder, drafted), [draftOrder, drafted])
  const isComplete    = nextPickInfo === null
  const isOnClock     = nextPickInfo?.currentOwner === MY_ROSTER_ID

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

  function deletePick(sleeperId) {
    setDrafted(prev => prev.filter(d => d.sleeperId !== sleeperId))
    setEditModal(null)
  }

  function resetTracker() {
    setDrafted([])
    setShowReset(false)
  }

  if (loading || rookieLoading) return <LoadingSpinner message="Loading draft data…" />
  if (error || rookieError) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
      <p className="text-text-secondary font-body text-sm">{error || rookieError}</p>
      <button onClick={error ? retry : rookieRetry} className="px-4 py-2 rounded-lg bg-accent text-white font-body font-medium text-sm">Retry</button>
    </div>
  )

  const { userMap = {} } = league ?? {}

  // ── Draft complete view ──────────────────────────────────────────────────────
  if (isComplete) {
    return (
      <div className="px-4 pb-4">
        <div className="pt-4 mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase text-text-primary">Draft Results</h2>
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-1 text-text-tertiary hover:text-danger transition-colors"
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            <span className="font-body text-xs">Reset</span>
          </button>
        </div>
        <div className="rounded-xl bg-bg-card border border-border-default px-3">
          {draftedSorted.map((pick, i) => {
            const player = values?.playerMap?.[pick.sleeperId]
            const team = getTeamName(userMap[pick.rosterId])
            const isMine = pick.rosterId === MY_ROSTER_ID
            return (
              <div
                key={pick.sleeperId}
                className={`py-2.5 flex items-center gap-2 ${i < draftedSorted.length - 1 ? 'border-b border-border-default' : ''}`}
              >
                <span className={`font-mono text-xs font-bold w-10 flex-shrink-0 ${isMine ? 'text-accent' : 'text-text-tertiary'}`}>
                  {pick.slot}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-text-primary truncate">{player?.name ?? pick.sleeperId}</p>
                  <p className="font-body text-[10px] text-text-tertiary truncate">{team}{isMine ? ' · You' : ''}</p>
                </div>
                <span className="font-body text-[10px] font-semibold uppercase text-text-tertiary flex-shrink-0">
                  {player?.position}
                </span>
              </div>
            )
          })}
        </div>
        {showReset && <ResetConfirm onConfirm={resetTracker} onCancel={() => setShowReset(false)} />}
      </div>
    )
  }

  // ── Live tracker view ────────────────────────────────────────────────────────
  return (
    <>
      <div className="pb-4">
        {/* On the clock banner (my turn) */}
        {isOnClock && nextPickInfo && (
          <div className="pt-4">
            <OnTheClockBanner
              slotStr={nextPickInfo.slotStr}
              teamName={getTeamName(userMap[nextPickInfo.currentOwner])}
            />
          </div>
        )}

        {/* Current pick indicator (not my turn) */}
        {nextPickInfo && !isOnClock && (
          <div className="px-4 pt-4 pb-1">
            <div className="flex items-center gap-2">
              <span className="font-body text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">On the clock</span>
              <span className="font-mono text-sm font-bold text-text-primary">{nextPickInfo.slotStr}</span>
              <span className="text-text-tertiary text-[10px]">·</span>
              <span className="font-body text-xs text-text-secondary">
                {getTeamName(userMap[nextPickInfo.currentOwner])}
              </span>
            </div>
          </div>
        )}

        {/* My picks chip row */}
        {myPicks.length > 0 && (
          <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5">
            <span className="font-body text-[10px] text-text-tertiary">My picks:</span>
            {myPicks.map(p => (
              <span
                key={p.slotStr}
                className={`font-mono text-[10px] font-bold ${draftedSlots.has(p.slotStr) ? 'text-text-tertiary line-through' : 'text-accent'}`}
              >
                {p.slotStr}
              </span>
            ))}
          </div>
        )}

        {/* Undrafted list */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              On the Board — {undrafted.length} remaining
            </p>
          </div>
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
                    <div className="flex items-center gap-1.5">
                      <span className="font-body text-sm font-medium text-text-primary leading-tight truncate">
                        {player.name}
                      </span>
                      {myPicks.some(p => {
                        const adp = player.adp ?? player.overallRank ?? 999
                        return adp >= p.overall - 1 && adp <= p.overall + 1
                      }) && <MyPickBadge />}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-body text-[10px] font-semibold uppercase text-text-tertiary">{player.position}</span>
                      <span className="text-text-tertiary text-[10px]">·</span>
                      <span className="font-body text-[10px] text-text-tertiary">{player.team || 'TBD'}</span>
                      {player.adp != null && (
                        <>
                          <span className="text-text-tertiary text-[10px]">·</span>
                          <span className="font-body text-[10px] text-text-tertiary">ADP {Number(player.adp).toFixed(0)}</span>
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

        {/* Drafted section (collapsible) */}
        {draftedSorted.length > 0 && (
          <div className="px-4 pt-4">
            <button
              onClick={() => setDraftedOpen(o => !o)}
              className="flex items-center gap-2 w-full mb-2"
            >
              {draftedOpen
                ? <ChevronDown size={14} className="text-text-tertiary" />
                : <ChevronRight size={14} className="text-text-tertiary" />
              }
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
                      <span className="font-body text-[10px] font-semibold uppercase text-text-tertiary flex-shrink-0">
                        {player?.position}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Reset button */}
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
          onDelete={() => deletePick(editModal.pick.sleeperId)}
          onClose={() => setEditModal(null)}
        />
      )}
      {showReset && <ResetConfirm onConfirm={resetTracker} onCancel={() => setShowReset(false)} />}
    </>
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
