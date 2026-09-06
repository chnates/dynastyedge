// recommendations.js — the assistant-GM "brain".
//
// Pure logic that turns the app's existing signals (positional surplus/deficit,
// win-window tier, player depth, age) into a measure of how willing we should
// be to trade each asset away. Every recommendation surface — the fair-package
// builder, free-agent pickups, and The Edge's action items — consumes these
// helpers so they all reason about the roster the same way.
//
// Zero new data sources: everything composes caches LeagueContext already holds.

import { POSITIONS } from '../constants'
import { computeLeagueAverages, getPositionalDeltas, assignWinWindowTiers } from './rosterAnalysis'
import { buildValueLineup } from './lineupBuild'
import { PEAK_WINDOWS } from './peakWindows'
import { getTeamName } from '../hooks/useLeague'

// The starters we protect hardest at each position in this 10-team Superflex
// Half-PPR league (QB doubles up via the Superflex slot; 3 FLEX spots make RB/WR
// depth matter). Players ranked beyond this within their position are treated as
// tradeable depth.
export const CORE_DEPTH = { QB: 2, RB: 3, WR: 3, TE: 1 }

// How much we want to KEEP a pick, by round — replacing a flat 0.5 that made a
// 2027 1st and a 2029 4th equally spendable. Measured over all 120 rookie picks
// this league has ever made, valued at today's prices: a class's round-1 median
// beat the DEAREST future 1st on the board in 3 of 3 classes (30/30 became
// starter-caliber), while no class's round-4 median reached the CHEAPEST future
// 4th (8/30). Hype flattens the pick curve and resolution steepens it — the
// market prices a 1st at 3.5x a 4th; the most-resolved class delivered 8.0x.
// Re-derive with scripts/dev/asset-aging-backtest.mjs rather than nudging
// by feel; revisit once the 2027 class resolves.
// See docs/analysis/asset-aging-and-pick-value-2026-09.md §3.
export const PICK_ROUND_KEEP = { 1: 0.65, 2: 0.5, 3: 0.4, 4: 0.3 }
// An unknown round keeps the old flat rate. Absence of a round is not evidence
// that a pick is cheap — same contract as an unranked player, who is shown and
// counted rather than priced at 0.
export const PICK_KEEP_DEFAULT = 0.5
// No pick has ever been auto-excluded from a package, and this does not start.
// PROTECT_THRESHOLD exists for irreplaceable PLAYERS (the backup-less elite
// starter of ff116ba); picks are the currency a package is built from, and a
// rebuilder's +0.3 on a first would otherwise cross the line and strip the
// builder of its main way to reach fair value. The cap preserves the round
// ordering at every tier.
export const PICK_KEEP_CAP = 0.85

// How willing we are to move an asset PAST its position's peak window. Three
// facts, all measured in docs/analysis/asset-aging-and-pick-value-2026-09.md §2
// over n=762 player-seasons (2020-2025), following the SAME player year over
// year with a departed player counted as 0 rather than dropped:
//
//   1. It is DECLINE-ONLY. Protecting players younger than their window was
//      proposed and disconfirmed — absent at RB (-0.02, p=0.853), the position
//      the tilt exists for, with one near-hit in four tests elsewhere. A player
//      inside or below his window is untouched.
//   2. The weight is PER POSITION, because the penalty is. Past-peak retention
//      falls 0.94 -> 0.66 for RB (p=0.0001) and 0.84 -> 0.67 for WR (p=0.0016);
//      QB and TE are not distinguishable from zero, so each takes its measured
//      relative effect HALVED — unproven is not the same as known-small.
//   3. It saturates over AGE_TILT_SPAN years, matching the RB shape (0.79 ->
//      0.74 -> 0.40 -> 0.25 across the three years past 26).
//
// The peak windows themselves are NOT re-tuned here: RB ending at 26 and WR at
// 28 both test significant at the boundary peakWindows.js already ships.
export const AGE_TILT_BY_POSITION = { RB: 1, WR: 0.65, QB: 0.4, TE: 0.15 }
// Base magnitude by win window. This is the ONE knob no measurement sets — it
// is a preference weight (given two assets the market prices identically, which
// do I want in three years), not an estimate, and it is deliberately small:
// dynasty value already prices age, so the tilt exists to break near-ties, not
// to argue with the market. Being decline-only, it can only ever make an asset
// MORE available — it can never protect one, so it cannot reach past
// PROTECT_THRESHOLD or undo the cliff protection below.
export const AGE_TILT_BY_TIER = { Contending: 0.04, Middle: 0.1, Rebuilding: 0.16 }
export const AGE_TILT_SPAN = 3

// Negative (more expendable) once past the window, 0 otherwise. An unknown age
// or position is a no-op, never an imputed average — the same contract the
// rookie board's age tilt keeps for the rookies whose age the feed lacks.
export function pastPeakTilt(asset, myTier) {
  const window = PEAK_WINDOWS[asset?.position]
  const age = asset?.age
  if (!window || age == null || age <= 0) return 0
  const past = age - window[1]
  if (past <= 0) return 0
  const magnitude = (AGE_TILT_BY_TIER[myTier] ?? AGE_TILT_BY_TIER.Middle)
    * (AGE_TILT_BY_POSITION[asset.position] ?? 0)
  return -Math.min(1, past / AGE_TILT_SPAN) * magnitude
}

const clamp = (v, lo = 0.05, hi = 1) => Math.max(lo, Math.min(hi, v))

export function joinAnd(parts) {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

// Build the per-roster context needed to score how willing we are to part with
// each asset: my positional surpluses/deficits, my win-window tier, and each of
// my players' depth rank within its position (0 = my best at that spot).
export function buildGivabilityContext(myRoster, allRosters) {
  const hasLeague = !!allRosters?.length
  const leagueAverages = hasLeague ? computeLeagueAverages(allRosters) : null
  const myDeltas = leagueAverages ? getPositionalDeltas(myRoster, leagueAverages) : {}
  const myTier = hasLeague
    ? (assignWinWindowTiers(allRosters)[myRoster.rosterId] ?? 'Middle')
    : 'Middle'

  const posRank = new Map()
  const posValues = {}
  POSITIONS.forEach(pos => {
    const mine = myRoster.players
      .filter(p => p.position === pos && !p.isIR)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
    mine.forEach((p, i) => posRank.set(String(p.sleeperId), i))
    posValues[pos] = mine.map(p => p.value || 0)
  })

  return { myDeltas, myTier, posRank, posValues, leagueAverages }
}

// How much we want to KEEP an asset: 0 = very expendable, 1 = untouchable core.
// Higher = protect it from trades. Drives the "balanced" posture — draw from
// surplus and depth, protect starters at thin positions, and lean into the win
// window (a contender cashes picks/young fliers; a rebuilder hoards youth/picks
// and sells aging vets).
export function assetKeepScore(asset, ctx) {
  const { myDeltas, myTier, posRank, posValues } = ctx

  if (asset.type === 'pick') {
    let keep = PICK_ROUND_KEEP[asset.round] ?? PICK_KEEP_DEFAULT
    if (myTier === 'Rebuilding') keep += 0.3       // hoard picks while building
    else if (myTier === 'Contending') keep -= 0.3  // cash picks for win-now
    return clamp(keep, 0.05, PICK_KEEP_CAP)
  }

  const pos = asset.position
  const rank = posRank?.get(String(asset.sleeperId)) ?? 99
  const coreN = CORE_DEPTH[pos] ?? 2

  // Core starters are protected; pieces beyond the starting depth decay toward
  // expendable.
  let keep = rank < coreN
    ? 0.85
    : Math.max(0.2, 0.55 - (rank - coreN) * 0.12)

  // Positional surplus/deficit. A deficit protects everyone at the position.
  // A surplus only opens up the DEPTH pieces (rank >= coreN) — it must NEVER
  // discount a core starter, because one elite player (e.g. a top-1 TE with no
  // backup) inflates the position's summed value and makes a thin spot read as
  // a surplus. We don't trade the stud just because he makes the bin look deep.
  const delta = myDeltas?.[pos] ?? 0
  if (delta < 0) keep += 0.22
  else if (delta > 0 && rank >= coreN) keep -= 0.18

  // Cliff protection: my best at a position with a steep drop to the next-best
  // is irreplaceable depth-wise — protect hard regardless of how the summed
  // positional value reads. This is what keeps an elite, backup-less starter
  // out of auto-suggested packages.
  if (rank === 0) {
    const vals = posValues?.[pos] ?? []
    const top = vals[0] ?? 0
    const next = vals[1] ?? 0
    if (top > 0 && next / top < 0.5) keep = Math.max(keep, 0.95)
  }

  // Win-window lean on age. Both surviving rules are WINDOW preferences (what
  // do I want when my window opens), which is a different question from the
  // aging tilt below (what will still be useful in three years) — a rebuilder's
  // pull toward youth is not the disconfirmed pre-peak retention claim.
  const age = asset.age ?? null
  if (myTier === 'Contending') {
    // Win-now: young low-value fliers are spare currency, not core.
    if (age != null && age <= 24 && (asset.value || 0) < 1500) keep -= 0.15
  } else if (myTier === 'Rebuilding') {
    if (age != null && age <= 24) keep += 0.2  // build around youth
  }

  // Past-peak decline. This REPLACES a flat `age >= 28 => -0.2` that only fired
  // for a rebuilder: 28 is two years past an RB's peak and mid-window for a QB,
  // so one age cut-off could not be right for both, and a Middle team — which
  // this league's owner has been all season — got no age opinion at all.
  keep += pastPeakTilt(asset, myTier)

  return clamp(keep)
}

// Assets at or above this keep-score are never auto-included in a suggested
// package — they're core/irreplaceable. The user can still add them manually.
export const PROTECT_THRESHOLD = 0.9

// Inverse of keep — higher = more willing to include in a package / move on from.
export function assetGivability(asset, ctx) {
  return 1 - assetKeepScore(asset, ctx)
}

// A team's deficit positions (where they're below league average) — the assets
// that make a package they'd actually accept.
export function getDeficitPositions(roster, allRosters) {
  if (!roster || !allRosters?.length) return new Set()
  const leagueAverages = computeLeagueAverages(allRosters)
  const deltas = getPositionalDeltas(roster, leagueAverages)
  return new Set(POSITIONS.filter(pos => deltas[pos] < 0))
}

// Proactive free-agent pickups — not a filter, an actual recommendation. Ranks
// available players by what they'd do for MY roster: fill a deficit position,
// upgrade my depth at a position, ride a rising trend, and fit my win window
// (a rebuilder values young stashes; a contender values win-now depth). Returns
// only players that genuinely move the needle, each with plain-English reasons.
export function recommendFreeAgents(freeAgents, myRoster, allRosters, { limit = 5, minValue = 600 } = {}) {
  if (!freeAgents?.length || !myRoster) return []

  const ctx = buildGivabilityContext(myRoster, allRosters)
  const { myDeltas, myTier } = ctx

  // Replacement level per position: the value a pickup must beat to be a real
  // upgrade — my CORE_DEPTH-th best at that spot (or my worst if I'm shallow).
  const replacement = {}
  POSITIONS.forEach(pos => {
    const mine = myRoster.players
      .filter(p => p.position === pos && !p.isIR)
      .map(p => p.value || 0)
      .sort((a, b) => b - a)
    const depth = CORE_DEPTH[pos] ?? 2
    replacement[pos] = mine.length >= depth ? mine[depth - 1] : (mine[mine.length - 1] ?? 0)
  })

  const scored = freeAgents
    .filter(p => (p.value ?? 0) >= minValue && POSITIONS.includes(p.position))
    .map(p => {
      const value = p.value ?? 0
      const pos = p.position
      const isNeed = (myDeltas[pos] ?? 0) < 0
      const upgradeMargin = value - (replacement[pos] ?? 0)
      const isUpgrade = upgradeMargin > 0
      const trend = p.trend30Day ?? 0
      const age = p.age ?? null

      let score = value / 1000
      const reasons = []

      if (isNeed) {
        score += 2.5
        reasons.push(`Fills your ${pos} need`)
      }
      if (isUpgrade) {
        score += Math.min(2, upgradeMargin / 600)
        reasons.push(`+${Math.round(upgradeMargin).toLocaleString()} over your ${pos} depth`)
      }
      if (trend > 50) {
        score += Math.min(1.5, trend / 400)
        reasons.push('Trending up the last 30 days')
      } else if (trend < -50) {
        score -= 0.5
      }
      if (myTier === 'Rebuilding' && age != null && age <= 24) {
        score += 1
        reasons.push(`Young stash (age ${Math.floor(age)})`)
      } else if (myTier === 'Contending' && age != null && age >= 26 && isUpgrade) {
        score += 0.5
        reasons.push('Win-now depth')
      }

      return { player: p, score, reasons, isNeed, isUpgrade, upgradeMargin, trend }
    })
    // Only surface players that actually do something — a need, an upgrade, or a
    // genuine riser. Everything else is just available value, not a recommendation.
    .filter(r => r.isNeed || r.isUpgrade || r.trend > 50)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit).map(r => ({
    ...r,
    primaryReason: r.reasons[0] ?? 'Available value',
  }))
}

// Turn "you have a surplus you could convert" into the actual move: who to call
// and what to ask for.
//
// TWO-SIDED partner pick. It used to take whichever opponent's positional delta
// was most negative and then hope a return existed on their roster — so the
// neediest team won the call even when it had nothing I wanted, and the move
// degraded to a bare "shop him to X". Now every opponent is scored on three
// roster facts and the best complete move wins:
//
//   1. do they need this position (their delta, the original signal)
//   2. would he actually START for them — a player who only stacks their bench
//      is not a sale, however thin their summed value at the position reads
//   3. do they own a comparable-value player at one of MY deficit positions,
//      so the call is a concrete swap instead of an opening pleasantry
//
// A partner with a real return beats a needier one without: a two-sided move is
// the thing worth surfacing. Falls back to the neediest team when nobody has a
// return, which is the old behavior and still an honest "shop him here".
//
// Returns nav-ready state for the Trade Analyzer's preloadTrade / preloadGivePlayer.
export function suggestSellMove(player, myRoster, allRosters) {
  if (!player || !myRoster || !allRosters?.length) return null
  const pos = player.position
  const targetVal = player.value || 0

  const leagueAverages = computeLeagueAverages(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)
  const myDeficits = POSITIONS
    .filter(p => (myDeltas[p] ?? 0) < 0)
    .sort((a, b) => myDeltas[a] - myDeltas[b]) // deepest need first

  const opponents = allRosters.filter(r => r.rosterId !== myRoster.rosterId)
  if (!opponents.length) return null

  // The best return this opponent could send back: a comparable-value player at
  // one of my deficit positions, deepest need first.
  const findReturn = opp => {
    for (const dPos of myDeficits) {
      const cand = opp.players
        .filter(p =>
          p.position === dPos && !p.isIR &&
          (p.value ?? 0) >= targetVal * 0.8 && (p.value ?? 0) <= targetVal * 1.25
        )
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
      if (cand) return { returnPlayer: cand, deficitPos: dPos }
    }
    return null
  }

  const scored = opponents.map(opp => {
    const theirDelta = getPositionalDeltas(opp, leagueAverages)[pos] ?? 0
    const ret = findReturn(opp)
    // Would he crack their lineup? Simulated on their roster with him added —
    // the same "does this actually help them" test Layer 4 applies.
    const starts = buildValueLineup([
      ...opp.players,
      { sleeperId: String(player.sleeperId), name: player.name, position: pos,
        value: targetVal, isIR: false, isTaxi: false },
    ]).starterIds.has(String(player.sleeperId))

    // Need is the base; the two facts that make the call worth placing are
    // weighted above it, so a needy team with nothing to send loses to a
    // slightly-less-needy one holding what I'm short of.
    let score = -theirDelta / Math.max(1, leagueAverages[pos] ?? 1)
    if (starts) score += 1.2
    if (ret)    score += 1.5
    return { opp, theirDelta, ret, starts, score }
  }).sort((a, b) => b.score - a.score)

  const pick = scored[0]
  if (!pick) return null
  const partnerName = getTeamName(pick.opp.owner)
  const give = [{ ...player, type: 'player' }]

  if (pick.ret) {
    const { returnPlayer, deficitPos } = pick.ret
    return {
      opponentRosterId: pick.opp.rosterId,
      partnerName,
      give,
      get: [{ ...returnPlayer, type: 'player' }],
      deficitPos,
      startsForThem: pick.starts,
      ctaLabel: 'Build this trade',
      summary: `Flip ${player.name} to ${partnerName} for ${returnPlayer.name} — fills your ${deficitPos}.`,
    }
  }

  return {
    opponentRosterId: pick.opp.rosterId,
    partnerName,
    give,
    get: null,
    deficitPos: myDeficits[0] ?? null,
    startsForThem: pick.starts,
    ctaLabel: `Shop to ${partnerName}`,
    summary: pick.starts
      ? `Shop ${player.name} to ${partnerName} — he'd start for them.`
      : `Shop ${player.name} to ${partnerName} — they're thin at ${pos}.`,
  }
}
