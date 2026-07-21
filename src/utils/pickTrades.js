// Pick trade calculator math — slot-level pick pricing plus move-up /
// move-down package suggestions. Pure functions over cached league and
// FantasyCalc data; no fetches.

import { findPickValue, findExactSlotValue } from './pickCapital'

const ROUND_SUFFIX = ['', '1st', '2nd', '3rd', '4th']

export function pickRoundLabel(pick) {
  const suffix = ROUND_SUFFIX[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

// Slot-aware pick price. FantasyCalc lists exact-slot picks as "2026 Pick 1.09"
// once a draft season's order is known; a known slot maps to that entry.
// Unknown slot (or no slot entry — future seasons, or after the generic
// entries retire) falls back to the round median, the same value pick capital
// uses everywhere else. (FantasyCalc dropped its old Early/Mid/Late tier names
// in 2026-07 in favor of exact per-slot entries — hence delegating to the
// shared `findExactSlotValue`.)
export function findSlotPickValue({ season, round, slot }, pickEntries) {
  return findExactSlotValue({ season, round, slot }, pickEntries)
}

// Rookie-class fallback pricer. FantasyCalc only prices a *generic* rookie
// pick ("2026 Mid 1st") while the rookie class is unknown; once the NFL draft
// happens those entries vanish (the picks become named rookies). But a dynasty
// league hasn't held its rookie draft yet, so its current-season picks are
// still live, untraded assets with no generic price — every one would read 0.
// In that window we price a pick by the rookie projected at its slot (derived
// rookie ADP), or the median rookie in its round when the draft order isn't
// set. Any other season keeps the generic market price.
export function makePickPricer({ pickEntries = [], prospects = [], draftSeason, teams = 10 }) {
  const ranked = prospects
    .filter(p => p.adp != null && (p.value ?? 0) > 0)
    .sort((a, b) => a.adp - b.adp)
  const valueAtAdp = adp => ranked.find(p => p.adp === adp)?.value ?? 0
  const roundMedian = round => {
    const lo = (round - 1) * teams + 1
    const hi = round * teams
    const vals = ranked.filter(p => p.adp >= lo && p.adp <= hi).map(p => p.value).sort((a, b) => a - b)
    return vals.length ? vals[Math.floor(vals.length / 2)] : 0
  }
  return ({ season, round, slot = null, overall = null }) => {
    // findSlotPickValue prices an exact slot when known and falls back to the
    // round median otherwise, so one call covers both.
    const generic = findSlotPickValue({ season, round, slot }, pickEntries)
    if (generic > 0) return generic
    if (season === draftSeason && ranked.length) {
      const adp = overall ?? (slot != null ? (round - 1) * teams + slot : null)
      if (adp != null) {
        const v = valueAtAdp(adp)
        if (v > 0) return v
      }
      return roundMedian(round)
    }
    return generic
  }
}

// Market price board for the header card: the round-level reference price for
// each round (exact per-slot prices live on the pick rows themselves). When
// `priceFor` is supplied, the median falls back to rookie-class pricing so a
// current-season board isn't all dashes between the NFL and league drafts.
export function buildPriceBoard(pickEntries, season, rounds = 4, priceFor = null) {
  const board = []
  for (let round = 1; round <= rounds; round++) {
    const median = priceFor
      ? priceFor({ season, round })
      : findPickValue({ season, round }, pickEntries)
    if (!(median > 0)) continue
    board.push({ round, median })
  }
  return board
}

// Every pick in the target season with its current owner and market value.
// Each entry keeps the owner's actual roster pick object so analyzer handoffs
// use the same assets the trade add sheet does (same dedupe id).
//
// Two paths:
//  - `draftOrder` present (a live draft board — slot_to_roster_id set):
//    walk it so in-draft pick trades are honored, pricing each slot exactly.
//  - otherwise: read the exact slot each pick ALREADY carries (resolved from
//    the draft order in useLeague, incl. draft_order in pre_draft) and price
//    at that slot. `priceFor` only backstops a pick whose value came up 0
//    (generic entries retired between the NFL and league drafts).
export function buildPickMarket({ allRosters, draftOrder, priceFor, season }) {
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
        value: priceFor({ season, round: o.round, slot: o.slot, overall: o.overall }),
      })
    })
    return { slotLevel: true, picks: market }
  }

  let slotLevel = false
  allRosters.forEach(r => {
    r.picks
      .filter(p => p.season === season)
      .forEach(p => {
        if (p.slot != null) slotLevel = true
        market.push({
          season,
          round: p.round,
          slot: p.slot ?? null,
          slotLabel: p.slotLabel ?? null,
          label: p.slotLabel ?? pickRoundLabel(p),
          ownerRosterId: r.rosterId,
          rosterPick: p,
          value: p.value > 0 ? p.value : priceFor({ season, round: p.round, slot: p.slot ?? null }),
        })
      })
  })
  market.sort((a, b) => a.round - b.round || (a.slot ?? 99) - (b.slot ?? 99) || b.value - a.value)
  return { slotLevel, picks: market }
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
