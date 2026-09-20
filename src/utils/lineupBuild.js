// lineupBuild.js — the one optimal starting-lineup slot-fill, metric-agnostic.
//
// Shared by both notions of "starter" in the app:
//   - the in-season Lineup Optimizer / Season Review, fed WEEKLY POINTS
//     (via computeOptimalPoints in lineupHistory.js)
//   - the Trade Analyzer's roster-fit sim, fed DYNASTY VALUE (buildValueLineup)
//
// It fills single-position slots first, then FLEX, then Superflex — respecting
// the nested eligibility FLEX ⊂ SFLX — always taking the best remaining. That
// greedy order is optimal for this slot structure. Unlike the old points-only
// helper, it tracks player identity so callers can ask *who* starts, not just
// the total.

import { ROSTER_SLOTS } from '../constants'

// items: [{ key, position, metric, item? }] — item is passed through untouched.
//
// `pinned` is an optional [{ slotIndex, key, position, metric, item }]: slots
// that are ALREADY DECIDED and cannot be reassigned. The weekly Optimizer uses
// it for players whose NFL game has kicked off — Sleeper seals those slots, so
// solving them is solving a decision the owner is not allowed to make.
//
// The pinned contribution lands in `total` exactly as a filled slot would,
// which is what keeps the caller's headline honest: it appears identically in
// the current total and the optimal total, so it cancels out of
// (optimal − current) and the per-move gains still sum to the difference. Omit
// it and the behaviour is byte-for-byte what it always was — every existing
// caller (the dynasty-value lineup, Season Review's hindsight) passes nothing.
//
// Returns { starters: [{ slot, slotIndex, key, position, metric, item }], total }.
export function selectOptimalStarters(items, { pinned = [] } = {}) {
  const pinnedBySlot = new Map()
  ;(pinned ?? []).forEach(p => {
    if (p && Number.isInteger(p.slotIndex)) pinnedBySlot.set(p.slotIndex, p)
  })
  const pinnedKeys = new Set([...pinnedBySlot.values()].map(p => String(p.key)))

  const byPos = {}
  ;(items ?? []).forEach(it => {
    if (!it.position) return
    // A pinned player must never also be available to fill a free slot, or he
    // would be started twice.
    if (pinnedKeys.has(String(it.key))) return
    ;(byPos[it.position] ||= []).push(it)
  })
  Object.values(byPos).forEach(arr => arr.sort((a, b) => b.metric - a.metric))

  // Fewest-eligible slots first: singles (QB/RB/WR/TE/DEF) before FLEX before SFLX.
  // `index` is carried through so callers can map a chosen starter back to its
  // position in ROSTER_SLOTS (labels repeat — RB/RB, FLEX×3 — so the label
  // alone can't address a slot). Array#sort is stable, so equal-eligibility
  // slots keep their declared order and the assignment stays deterministic.
  const slots = ROSTER_SLOTS
    .map((s, index) => ({ ...s, index }))
    .filter(s => !pinnedBySlot.has(s.index))
    .sort((a, b) => a.eligible.length - b.eligible.length)

  const starters = []
  let total = 0
  pinnedBySlot.forEach((p, slotIndex) => {
    starters.push({ slot: ROSTER_SLOTS[slotIndex]?.label ?? String(slotIndex), ...p, slotIndex })
    total += p.metric ?? 0
  })
  slots.forEach(slot => {
    let bestPos = null
    slot.eligible.forEach(pos => {
      if (byPos[pos]?.length && (bestPos === null || byPos[pos][0].metric > byPos[bestPos][0].metric)) {
        bestPos = pos
      }
    })
    if (bestPos != null) {
      const it = byPos[bestPos].shift()
      starters.push({ slot: slot.label, slotIndex: slot.index, ...it })
      total += it.metric
    }
  })
  return { starters, total }
}

// Optimal starting lineup by DYNASTY VALUE for a roster — the Trade Analyzer's
// year-round notion of "who actually starts" (no weekly projections needed, so
// it works in the offseason). Taxi and IR players can't be started, so they're
// excluded. Unranked players (value 0) are still eligible but only start if
// nothing valued outranks them at their slot.
export function buildValueLineup(players) {
  const items = (players ?? [])
    .filter(p => !p.isIR && !p.isTaxi)
    .map(p => ({
      key: String(p.sleeperId),
      position: p.position,
      metric: p.value || 0,
      item: p,
    }))
  const { starters, total } = selectOptimalStarters(items)
  return {
    starters,
    starterIds: new Set(starters.map(s => s.key)),
    startingValue: total,
  }
}
