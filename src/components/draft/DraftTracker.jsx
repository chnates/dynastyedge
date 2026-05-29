import { useMemo, useState, useEffect } from 'react'
import { RotateCcw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { MY_ROSTER_ID } from '../../constants'
import LoadingSpinner from '../shared/LoadingSpinner'

const STORAGE_KEY = 'dynastyedge_draft_tracker_2026'
const ROUNDS = 4
const TEAMS = 10

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSlot(slotStr) {
  // e.g. "1.06" → { round: 1, pick: 6, overall: 6 }
  // e.g. "2.06" → { round: 2, pick: 6, overall: 16 }
  const match = slotStr.match(/^(\d+)\.(\d+)$/)
  if (!match) return null
  const round = parseInt(match[1], 10)
  const pick  = parseInt(match[2], 10)
  if (round < 1 || round > ROUNDS || pick < 1 || pick > TEAMS) return null
  return { round, pick, overall: (round - 1) * TEAMS + pick }
}

function slotLabel(round, pick) {
  return `${round}.${String(pick).padStart(2, '0')}`
}

function getMySlots(myRoster) {
  if (!myRoster?.picks) return []
  const mine = myRoster.picks.filter(p => p.season === '2026')
  // Slot is determined by the original team's draft position (their roster_id)
  return mine.map(p => slotLabel(p.round, p.originalOwner ?? MY_ROSTER_ID))
}

function compareSlots(a, b) {
  const pa = parseSlot(a)
  const pb = parseSlot(b)
  if (!pa || !pb) return 0
  return pa.overall - pb.overall
}

function nextPickInSequence(drafted) {
  const draftedOveralls = new Set(
    drafted.map(d => parseSlot(d.slot)?.overall).filter(Boolean)
  )
  for (let i = 1; i <= ROUNDS * TEAMS; i++) {
    if (!draftedOveralls.has(i)) {
      const round = Math.ceil(i / TEAMS)
      const pick  = i - (round - 1) * TEAMS
      return slotLabel(round, pick)
    }
  }
  return null // draft complete
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function OnTheClockBanner({ slot }) {
  return (
    <div className="mx-4 mb-3 px-3 py-3 rounded-xl bg-accent/10 border border-accent/30 text-center">
      <p className="font-body text-[11px] font-semibold uppercase tracking-wider text-accent mb-0.5">
        You're on the clock
      </p>
      <p className="font-mono text-2xl font-bold text-accent">{slot}</p>
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

function LogPickModal({ player, allRosters, userMap, mySlots, onSave, onClose }) {
  const [slotInput, setSlotInput] = useState('')
  const [teamId, setTeamId]       = useState('')
  const [err, setErr]             = useState('')

  const slotError = slotInput && !parseSlot(slotInput)
    ? 'Use format 1.06 (round.pick)'
    : ''

  function handleSave() {
    const parsed = parseSlot(slotInput)
    if (!parsed) { setErr('Invalid slot. Use format like 1.06'); return }
    if (!teamId) { setErr('Select a team'); return }
    onSave({ slot: slotInput, rosterId: Number(teamId) })
  }

  const isMine = slotInput && mySlots.includes(slotInput)

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

          {/* Slot input */}
          <label className="block font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Pick Slot
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 1.06"
            value={slotInput}
            onChange={e => { setSlotInput(e.target.value); setErr('') }}
            className={`w-full px-3 py-2.5 rounded-lg bg-bg-card border font-body text-sm text-text-primary focus:outline-none mb-1 ${
              slotError ? 'border-danger' : 'border-border-default focus:border-accent'
            }`}
          />
          {slotError && <p className="font-body text-xs text-danger mb-1">{slotError}</p>}
          {isMine && <p className="font-body text-xs text-accent mb-1">Your pick!</p>}

          {/* Team select */}
          <label className="block font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mt-3 mb-1.5">
            Drafted By
          </label>
          <select
            value={teamId}
            onChange={e => { setTeamId(e.target.value); setErr('') }}
            className="w-full px-3 py-2.5 rounded-lg bg-bg-card border border-border-default font-body text-sm text-text-primary focus:outline-none focus:border-accent appearance-none"
          >
            <option value="">Select team…</option>
            {allRosters.map(r => (
              <option key={r.rosterId} value={r.rosterId}>
                {getTeamName(userMap[r.rosterId])}
                {r.rosterId === MY_ROSTER_ID ? ' (You)' : ''}
              </option>
            ))}
          </select>

          {err && <p className="font-body text-xs text-danger mt-2">{err}</p>}

          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary">
              Cancel
            </button>
            <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg bg-accent text-white font-body text-sm font-medium">
              Log Pick
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditPickModal({ pick, player, onSave, onDelete, onClose }) {
  const [slotInput, setSlotInput] = useState(pick.slot)

  function handleSave() {
    const parsed = parseSlot(slotInput)
    if (!parsed) return
    onSave({ ...pick, slot: slotInput })
  }

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

          <label className="block font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Pick Slot
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={slotInput}
            onChange={e => setSlotInput(e.target.value)}
            className={`w-full px-3 py-2.5 rounded-lg bg-bg-card border font-body text-sm text-text-primary focus:outline-none mb-4 ${
              slotInput && !parseSlot(slotInput) ? 'border-danger' : 'border-border-default focus:border-accent'
            }`}
          />

          <div className="flex gap-2">
            <button
              onClick={onDelete}
              className="flex-1 py-2.5 rounded-lg border border-danger/50 font-body text-sm text-danger"
            >
              Undo Pick
            </button>
            <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg bg-accent text-white font-body text-sm font-medium">
              Save
            </button>
          </div>
          <button onClick={onClose} className="w-full mt-2 py-2.5 rounded-lg font-body text-sm text-text-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftTracker() {
  const { league, loading, error, retry, values } = useLeagueContext()

  // drafted: [{ sleeperId, slot, rosterId }] sorted by slot
  const [drafted, setDrafted]             = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
    catch { return [] }
  })
  const [logModal, setLogModal]           = useState(null)   // player
  const [editModal, setEditModal]         = useState(null)   // { pick, player }
  const [draftedOpen, setDraftedOpen]     = useState(false)
  const [showReset, setShowReset]         = useState(false)

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafted))
  }, [drafted])

  const rookies = useMemo(() => {
    if (!values?.playerMap) return []
    const rostered = new Set()
    league?.allRosters?.forEach(r => r.players.forEach(p => rostered.add(p.sleeperId)))
    return Object.values(values.playerMap)
      .filter(p => {
        if (!['QB','RB','WR','TE'].includes(p.position)) return false
        if (p.experience === 0) return true
        return p.experience == null && !rostered.has(p.sleeperId) && p.age != null && p.age <= 23.5
      })
      .sort((a, b) => (a.adp ?? a.overallRank ?? 999) - (b.adp ?? b.overallRank ?? 999))
  }, [values, league])

  const mySlots = useMemo(() => {
    if (!league?.myRoster) return []
    return getMySlots(league.myRoster)
  }, [league])

  const draftedSet = useMemo(() => new Set(drafted.map(d => d.sleeperId)), [drafted])

  const undrafted = useMemo(() =>
    rookies.filter(p => !draftedSet.has(p.sleeperId)),
  [rookies, draftedSet])

  const draftedSorted = useMemo(() =>
    [...drafted].sort((a, b) => compareSlots(a.slot, b.slot)),
  [drafted])

  const nextPick = useMemo(() => nextPickInSequence(drafted), [drafted])
  const isComplete = nextPick === null && drafted.length >= rookies.length

  const isOnClock = nextPick && mySlots.includes(nextPick)

  function logPick({ slot, rosterId }) {
    if (!logModal) return
    setDrafted(prev => {
      const filtered = prev.filter(d => d.sleeperId !== logModal.sleeperId)
      return [...filtered, { sleeperId: logModal.sleeperId, slot, rosterId }]
    })
    setLogModal(null)
  }

  function editPick(pick) {
    setDrafted(prev => prev.map(d => d.sleeperId === pick.sleeperId ? pick : d))
    setEditModal(null)
  }

  function deletePick(sleeperId) {
    setDrafted(prev => prev.filter(d => d.sleeperId !== sleeperId))
    setEditModal(null)
  }

  function resetTracker() {
    setDrafted([])
    setShowReset(false)
  }

  if (loading) return <LoadingSpinner message="Loading draft data…" />
  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
      <p className="text-text-secondary font-body text-sm">{error}</p>
      <button onClick={retry} className="px-4 py-2 rounded-lg bg-accent text-white font-body font-medium text-sm">Retry</button>
    </div>
  )

  const { allRosters = [], userMap = {} } = league ?? {}

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
        {/* On the clock */}
        {isOnClock && <div className="pt-4"><OnTheClockBanner slot={nextPick} /></div>}

        {/* Next pick indicator (not mine) */}
        {nextPick && !isOnClock && (
          <div className="px-4 pt-4 pb-2">
            <p className="font-body text-xs text-text-tertiary">
              Next pick on the board: <span className="font-mono text-text-primary font-medium">{nextPick}</span>
            </p>
          </div>
        )}

        {/* My picks info */}
        {mySlots.length > 0 && (
          <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5">
            <span className="font-body text-[10px] text-text-tertiary">My picks:</span>
            {mySlots.sort(compareSlots).map(s => (
              <span key={s} className={`font-mono text-[10px] font-bold ${draftedSet.has(s) ? 'text-text-tertiary line-through' : 'text-accent'}`}>
                {s}
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
              {undrafted.map((player, i) => {
                const isMineSlot = mySlots.length > 0 && nextPick && mySlots.includes(nextPick)
                return (
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
                        {mySlots.some(s => {
                          const parsed = parseSlot(s)
                          const adp = player.adp ?? player.overallRank ?? 999
                          return parsed && adp >= parsed.overall - 1 && adp <= parsed.overall + 1
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
                )
              })}
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
              {draftedOpen ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronRight size={14} className="text-text-tertiary" />}
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

      {/* Modals */}
      {logModal && (
        <LogPickModal
          player={logModal}
          allRosters={allRosters}
          userMap={userMap}
          mySlots={mySlots}
          onSave={logPick}
          onClose={() => setLogModal(null)}
        />
      )}
      {editModal && (
        <EditPickModal
          pick={editModal.pick}
          player={editModal.player}
          onSave={editPick}
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
