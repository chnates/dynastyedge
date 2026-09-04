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
// Returns { starters: [{ slot, slotIndex, key, position, metric, item }], total }.
export function selectOptimalStarters(items) {
  const byPos = {}
  ;(items ?? []).forEach(it => {
    if (!it.position) return
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
    .sort((a, b) => a.eligible.length - b.eligible.length)

  const starters = []
  let total = 0
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
