// lineupMoves.js — THE weekly start/sit engine.
//
// The Optimizer used to flag each slot independently ("is any bench player
// projecting higher than this starter?"). That is not an optimization, and it
// was wrong in two ways that matter:
//
//   1. One bench player who outprojects two starters flagged BOTH slots, so
//      the advertised gains double-counted a player who can only fill one.
//   2. Cascading moves were structurally invisible — promoting a WR out of
//      FLEX into WR2 so a better RB takes the FLEX never surfaced, because no
//      single slot comparison sees it.
//
// So instead we solve the whole lineup at once with the shared slot-fill
// (`selectOptimalStarters`, the same engine Season Review uses in hindsight)
// and DIFF it against the lineup you're actually starting. The difference of
// two sets is the honest answer, and it has the property the old per-slot math
// lacked: the per-move gains SUM EXACTLY to the headline number, because
// shuffling a player between slots changes no total.
//
// Pure — no React, no fetching. Fed weekly projections by the Optimizer.

import { ROSTER_SLOTS } from '../constants'
import { selectOptimalStarters } from './lineupBuild'
import { getProjPts, getAvailability } from './projections'
import { confidenceForGap, MIN_MEANINGFUL_GAIN } from './lineupConfidence'

// What a player actually contributes.
//
// THREE CASES, AND THE ORDER MATTERS:
//
//   1. His game has kicked off and we have a live score → that score. A played
//      game is FACT, and a fact outranks both a projection and the blocked
//      rule. DJ Moore exited Thursday's game hurt and was listed Out by
//      Sunday; the blocked rule scored him 0 and the projection said 10.9,
//      while `players_points` said he had already banked -0.1. Only the third
//      number is true, and it is the only one the owner can do nothing about.
//   2. Blocked (bye / Out / IR / empty) with no game played → 0. An "Out"
//      starter carrying a 12.4 projection would inflate the current total and
//      hide the very gap this tool exists to surface.
//   3. Otherwise → Sleeper's projection.
//
// A locked player with NO live score falls through to the projection rather
// than to 0 (case 2 is skipped for him), because "he will score 0" is a
// forward-looking claim and his game is not in the future. Guessing 0 there
// would re-manufacture the exact overstatement this function was fixed to
// remove; the caller discloses that live scores were unavailable instead.
function effectivePts(player, projMap, availability, actualPoints) {
  if (!player) return 0
  const id = String(player.sleeperId)
  if (availability?.locked) {
    const actual = actualPoints?.[id]
    if (Number.isFinite(actual)) return actual
    return getProjPts(player.sleeperId, projMap)
  }
  if (availability?.blocked) return 0
  return getProjPts(player.sleeperId, projMap)
}

// The lineup a fresh visit starts from: Sleeper's own starters, mapped onto
// ROSTER_SLOTS by index. Sleeper pads unset slots with '0'.
export function lineupFromRoster(myRoster) {
  const order = myRoster?.starterOrder ?? []
  return ROSTER_SLOTS.map((_, i) => {
    const id = order[i]
    return id && id !== '0' ? String(id) : null
  })
}

// Can `player` legally occupy ROSTER_SLOTS[slotIdx]?
export function isEligibleForSlot(player, slotIdx) {
  const slot = ROSTER_SLOTS[slotIdx]
  if (!slot || !player?.position) return false
  return slot.eligible.includes(player.position)
}

function reasonFor({ outEntry, inEntry, gain }) {
  if (!outEntry) return 'Nobody is starting in this slot'
  const { availability, player } = outEntry
  const name = player?.name ?? 'This slot'

  // Why he has to come out. The cause and the "…and nobody can replace him"
  // fact COMPOSE — the cause explains, the second half is what you act on, and
  // dropping either one leaves the card half-useful.
  let cause = null
  if (availability.status === 'bye') cause = `${name} is on bye and will score 0`
  else if (availability.status === 'ir') cause = `${name} is on IR and can't play`
  else if (availability.status === 'out') cause = `${name} is listed ${availability.label} and will likely score 0`

  if (!inEntry) {
    const tail = 'no eligible replacement on your bench'
    return cause ? `${cause} — ${tail}` : `${name} has ${tail}`
  }
  if (cause) return cause

  const q = availability.status === 'questionable' ? ` (${name} is ${availability.label})` : ''
  return `${inEntry.player.name} projects ${gain.toFixed(1)} more points${q}`
}

// buildLineupMoves — evaluate a lineup and say what to do about it.
//
//   players        every rostered player (taxi/IR are filtered here)
//   lineup         array aligned to ROSTER_SLOTS of sleeperId | null
//   projMap        Sleeper weekly projections
//   playerStatuses the shared trimmed player DB (injury_status lives here)
//   playingTeams   teams with a game this week (empty ⇒ bye info unavailable)
//   lockedTeams    teams whose game has kicked off (empty ⇒ locks unknown)
//   actualPoints   sleeperId → points already scored, for locked players
//
// ── WHAT A LOCK DOES TO THE SOLVE ─────────────────────────────────────────
//
// Sleeper seals a player's slot the moment his game starts. So the question
// this engine answers narrows from "what is your best lineup?" to "what is the
// best lineup you can still REACH?" — and that is a strictly better question,
// because the first one has an answer you may not be allowed to act on.
//
// Locked STARTERS are pinned to their slots and carry their real score into
// both totals, where it cancels. Locked BENCH players leave the eligible pool
// outright — you cannot start a player whose game is over. Neither can produce
// a move, which is the whole point: the engine previously emitted "SIT DJ
// Moore → START TreVeyon Henderson, +8.5" for a slot that had been sealed for
// three days, and counted those 8.5 fictional points in the headline.
export function buildLineupMoves({
  players, lineup, projMap, playerStatuses, playingTeams, lockedTeams, actualPoints,
}) {
  const startable = (players ?? []).filter(p => !p.isTaxi && !p.isIR)
  const byId = new Map(startable.map(p => [String(p.sleeperId), p]))

  const availabilityOf = new Map()
  startable.forEach(p => {
    availabilityOf.set(String(p.sleeperId), getAvailability(p, playerStatuses, playingTeams, lockedTeams))
  })

  const entryFor = id => {
    const player = byId.get(String(id))
    if (!player) return null
    const availability = availabilityOf.get(String(id))
    return {
      id: String(id),
      player,
      availability,
      projPts: getProjPts(player.sleeperId, projMap),
      effPts: effectivePts(player, projMap, availability, actualPoints),
      locked: !!availability?.locked,
      // Present only when his game has started AND a live score arrived, so a
      // caller can distinguish "he scored 3.2" from "his game is under way and
      // we could not read the score".
      actualPts: availability?.locked && Number.isFinite(actualPoints?.[String(id)])
        ? actualPoints[String(id)]
        : null,
    }
  }

  const current = (lineup ?? []).map(id => (id ? entryFor(id) : null))
  const currentIds = new Set(current.filter(Boolean).map(e => e.id))

  // ── The optimal lineup ────────────────────────────────────────────────
  // Blocked players are dropped from the pool outright rather than handed a 0
  // metric: a 0-metric player still gets placed when nothing else is eligible,
  // which would quietly "optimize" a bye-week player back into your lineup.
  // Leaving the slot empty is the truthful outcome.
  //
  // Locked players leave the pool for a different reason — not "he will score
  // nothing" but "this is not yours to decide any more".
  const pool = startable
    .filter(p => {
      const a = availabilityOf.get(String(p.sleeperId))
      return !a.blocked && !a.locked
    })
    .map(p => ({
      key: String(p.sleeperId),
      position: p.position,
      metric: getProjPts(p.sleeperId, projMap),
      item: p,
    }))

  // A locked starter holds his slot at his REAL contribution, so the optimal
  // total is a lineup you could actually end up with rather than one the rules
  // forbid.
  const pinned = current
    .map((e, slotIndex) => (e?.locked ? { slotIndex, key: e.id, position: e.player.position, metric: e.effPts, item: e.player } : null))
    .filter(Boolean)

  const optimal = selectOptimalStarters(pool, { pinned })

  const optimalByIdx = ROSTER_SLOTS.map(() => null)
  optimal.starters.forEach(s => { optimalByIdx[s.slotIndex] = s.key })
  const optimalIds = new Set(optimal.starters.map(s => s.key))

  const currentTotal = current.reduce((sum, e) => sum + (e?.effPts ?? 0), 0)
  const optimalTotal = optimal.total

  // ── The diff ──────────────────────────────────────────────────────────
  const byEffDesc = (a, b) => b.effPts - a.effPts
  const outgoing = [...currentIds].filter(id => !optimalIds.has(id)).map(entryFor).filter(Boolean).sort(byEffDesc)
  const incoming = [...optimalIds].filter(id => !currentIds.has(id)).map(entryFor).filter(Boolean).sort(byEffDesc)

  const slotOfCurrent = new Map()
  current.forEach((e, idx) => { if (e) slotOfCurrent.set(e.id, idx) })

  // Pair best-with-best, but prefer a pairing the reader can act on directly:
  // an incoming player who is actually eligible for the outgoing player's slot
  // reads as one swap, not as a limb of a reshuffle. Where no such pairing
  // exists the lineup change really is a chain, and the pair is flagged so the
  // card can say so instead of implying an illegal one-for-one.
  const unmatched = [...outgoing]
  const moves = []
  incoming.forEach(inEntry => {
    let pickIdx = unmatched.findIndex(o => isEligibleForSlot(inEntry.player, slotOfCurrent.get(o.id)))
    if (pickIdx === -1) pickIdx = unmatched.length > 0 ? 0 : -1
    const outEntry = pickIdx >= 0 ? unmatched.splice(pickIdx, 1)[0] : null
    const direct = outEntry ? isEligibleForSlot(inEntry.player, slotOfCurrent.get(outEntry.id)) : true
    const gain = inEntry.effPts - (outEntry?.effPts ?? 0)
    const mustFix = !outEntry || outEntry.availability.blocked
    moves.push({
      key: `${outEntry?.id ?? 'empty'}->${inEntry.id}`,
      out: outEntry,
      in: inEntry,
      gain,
      direct,
      mustFix,
      // Confidence answers "is the higher-projected player the right start?",
      // so it only applies where that is genuinely in doubt. A must-fix is a
      // bye/Out/empty slot: the outgoing side scores 0 by rule, not by
      // projection, and dressing that certainty up as "87% likely" would be
      // borrowing the curve's authority for a question it never measured.
      confidence: mustFix ? null : confidenceForGap(gain),
      meaningful: mustFix || gain >= MIN_MEANINGFUL_GAIN,
      reason: reasonFor({ outEntry, inEntry, gain }),
    })
  })
  // Anyone left over has to come out with nobody to replace them — a real
  // outcome (your only TE is on bye), and one worth saying out loud.
  unmatched.forEach(outEntry => {
    moves.push({
      key: `${outEntry.id}->empty`,
      out: outEntry,
      in: null,
      gain: -outEntry.effPts,
      direct: true,
      mustFix: outEntry.availability.blocked,
      confidence: null,
      // Nobody can replace him — there is no alternative to be unsure about,
      // and the move is the only honest thing to show either way.
      meaningful: true,
      reason: reasonFor({ outEntry, inEntry: null, gain: 0 }),
    })
  })

  moves.sort((a, b) => (Number(b.mustFix) - Number(a.mustFix)) || (b.gain - a.gain))

  const bench = startable
    .filter(p => !currentIds.has(String(p.sleeperId)))
    .map(p => entryFor(p.sleeperId))
    .sort(byEffDesc)

  const slots = ROSTER_SLOTS.map((slot, idx) => ({
    idx,
    slot,
    entry: current[idx],
    isOptimal: (current[idx]?.id ?? null) === optimalByIdx[idx],
  }))

  return {
    slots,
    bench,
    moves,
    optimalByIdx,
    currentTotal,
    optimalTotal,
    pointsLeft: Math.max(0, optimalTotal - currentTotal),
    mustFixCount: moves.filter(m => m.mustFix).length,
    // Upgrades worth presenting AS upgrades. Sub-1-point swaps are 52/48 coin
    // flips (see lineupConfidence.js), so they are counted separately and the
    // UI demotes them — but they stay in `moves`, because the headline is
    // optimal − current and the per-move gains must keep summing to it.
    upgradeCount: moves.filter(m => !m.mustFix && m.meaningful).length,
    coinFlipCount: moves.filter(m => !m.meaningful).length,
    emptySlots: slots.filter(s => !s.entry).length,
    // ── Lock reporting ────────────────────────────────────────────────
    // `lockedStarters` is how many of your slots are already sealed, and
    // `lockedPoints` is what they have banked — the part of the current total
    // that is settled rather than forecast. A caller that prints one number
    // for "your lineup" is printing two different kinds of thing added
    // together, and on a Sunday afternoon that matters.
    lockedStarters: pinned.length,
    lockedPoints: Math.round(pinned.reduce((sum, p) => sum + (p.metric ?? 0), 0) * 10) / 10,
    // Locked players whose live score never arrived, so their contribution is
    // still a projection. Disclosed rather than hidden: it is the one case
    // where a locked slot's number is not yet a fact.
    lockedWithoutScore: current.filter(e => e?.locked && e.actualPts === null).length,
    lockedBench: bench.filter(e => e?.locked).length,
  }
}

// Swap whatever occupies two positions in the lineup. `to` is either a slot
// index (starter ↔ starter) or the string 'bench' (starter ↔ bench player).
// Returns a NEW lineup array; never mutates.
export function applySwap(lineup, fromSlotIdx, target) {
  const next = [...lineup]
  if (target.kind === 'slot') {
    const a = next[fromSlotIdx]
    next[fromSlotIdx] = next[target.slotIdx]
    next[target.slotIdx] = a
    return next
  }
  // bench player moves in; the displaced starter (if any) goes to the bench.
  const existingIdx = next.indexOf(target.playerId)
  if (existingIdx !== -1) next[existingIdx] = next[fromSlotIdx]
  next[fromSlotIdx] = target.playerId
  return next
}
