// Pick trade calculator math — slot-level pick pricing plus move-up /
// move-down package suggestions. Pure functions over cached league and
// FantasyCalc data; no fetches.

import { findPickValue } from './pickCapital'

const ROUND_SUFFIX = ['', '1st', '2nd', '3rd', '4th']

export function pickRoundLabel(pick) {
  const suffix = ROUND_SUFFIX[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

// Early / Mid / Late thirds of a round (1–3 / 4–7 / 8–10 in a 10-team league).
export function slotTier(slot, teams = 10) {
  if (slot <= Math.ceil(teams / 3)) return 'Early'
  if (slot <= Math.ceil((2 * teams) / 3)) return 'Mid'
  return 'Late'
}

// Slot-aware pick price: FantasyCalc lists picks as "2026 Early 1st" etc., so
// a known slot maps to its Early/Mid/Late entry. Unknown slot (or no tiered
// entry) falls back to the round median — the same value pick capital uses
// everywhere else in the app.
export function findSlotPickValue({ season, round, slot, teams = 10 }, pickEntries) {
  if (slot != null) {
    const suffix = ROUND_SUFFIX[round]
    if (suffix) {
      const tier = slotTier(slot, teams)
      const entry = pickEntries.find(e =>
        e.name.includes(season) && e.name.includes(suffix) && e.name.includes(tier)
      )
      if (entry) return entry.value
    }
  }
  return findPickValue({ season, round }, pickEntries)
}

// Market price board for the header card: per round, the Early/Mid/Late
// prices (null when FantasyCalc has no tiered entry) plus the round median.
export function buildPriceBoard(pickEntries, season, rounds = 4) {
  const board = []
  for (let round = 1; round <= rounds; round++) {
    const suffix = ROUND_SUFFIX[round]
    const matches = pickEntries.filter(e => e.name.includes(season) && e.name.includes(suffix))
    if (!matches.length) continue
    const tierValue = tier => matches.find(e => e.name.includes(tier))?.value ?? null
    board.push({
      round,
      early: tierValue('Early'),
      mid: tierValue('Mid'),
      late: tierValue('Late'),
      median: findPickValue({ season, round }, pickEntries),
    })
  }
  return board
}

// Every pick in the target season with its current owner and market value —
// slot-level when the Sleeper draft order is known, round-level otherwise.
// Each entry keeps the owner's actual roster pick object so analyzer handoffs
// use the same assets the trade add sheet does (same dedupe id).
export function buildPickMarket({ allRosters, draftOrder, pickEntries, season }) {
  const teams = allRosters.length || 10
  const market = []

  if (draftOrder) {
    draftOrder.forEach(o => {
      if (o.rosterId == null) return
      const owner = allRosters.find(r => r.rosterId === o.rosterId)
      const rosterPick = owner?.picks.find(
        p => p.season === season && p.round === o.round && p.originalOwner === o.originalRosterId
      )
      if (!rosterPick) return // only offer picks teams actually still own
      market.push({
        season,
        round: o.round,
        slot: o.slot,
        slotLabel: o.label,
        label: o.label,
        ownerRosterId: o.rosterId,
        rosterPick,
        value: findSlotPickValue({ season, round: o.round, slot: o.slot, teams }, pickEntries),
      })
    })
    return { slotLevel: true, picks: market }
  }

  allRosters.forEach(r => {
    r.picks
      .filter(p => p.season === season)
      .forEach(p => {
        market.push({
          season,
          round: p.round,
          slot: null,
          slotLabel: null,
          label: pickRoundLabel(p),
          ownerRosterId: r.rosterId,
          rosterPick: p,
          value: p.value ?? findPickValue(p, pickEntries),
        })
      })
  })
  market.sort((a, b) => a.round - b.round || b.value - a.value)
  return { slotLevel: false, picks: market }
}

// Suggest up to `count` packages of 1–3 picks whose total lands near
// targetValue. Undershoot is penalized harder than overshoot — the seller
// won't take a light package, but a buyer can choose to pay a small premium.
// Candidates worth as much as the target are excluded: that's a straight
// swap, not a move.
export function suggestPickPackages(targetValue, candidates, { count = 3 } = {}) {
  if (!targetValue) return []
  const pool = candidates.filter(c => (c.value ?? 0) > 0 && c.value < targetValue)
  const FLOOR = targetValue * 0.8
  const CAP   = targetValue * 1.45
  const score = total =>
    total >= targetValue ? total - targetValue : (targetValue - total) * 1.6

  const packages = []
  const consider = picks => {
    const total = picks.reduce((s, p) => s + p.value, 0)
    if (total < FLOOR || total > CAP) return
    packages.push({
      picks,
      total,
      diffPct: Math.round(((total - targetValue) / targetValue) * 100),
      score: score(total),
    })
  }

  // Pool is at most a dozen picks — exhaustive subsets up to size 3 are cheap.
  for (let i = 0; i < pool.length; i++) {
    consider([pool[i]])
    for (let j = i + 1; j < pool.length; j++) {
      consider([pool[i], pool[j]])
      for (let k = j + 1; k < pool.length; k++) consider([pool[i], pool[j], pool[k]])
    }
  }

  packages.sort((a, b) => a.score - b.score || a.picks.length - b.picks.length)

  // Dedupe by size+total so three near-identical combos don't crowd out variety
  const seen = new Set()
  const out = []
  for (const p of packages) {
    const key = `${p.picks.length}-${p.total}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= count) break
  }
  return out
}
