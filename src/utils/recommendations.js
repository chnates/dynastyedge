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

// The starters we protect hardest at each position in this 10-team Superflex
// Half-PPR league (QB doubles up via the Superflex slot; 3 FLEX spots make RB/WR
// depth matter). Players ranked beyond this within their position are treated as
// tradeable depth.
export const CORE_DEPTH = { QB: 2, RB: 3, WR: 3, TE: 1 }

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
  POSITIONS.forEach(pos => {
    myRoster.players
      .filter(p => p.position === pos && !p.isIR)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .forEach((p, i) => posRank.set(String(p.sleeperId), i))
  })

  return { myDeltas, myTier, posRank, leagueAverages }
}

// How much we want to KEEP an asset: 0 = very expendable, 1 = untouchable core.
// Higher = protect it from trades. Drives the "balanced" posture — draw from
// surplus and depth, protect starters at thin positions, and lean into the win
// window (a contender cashes picks/young fliers; a rebuilder hoards youth/picks
// and sells aging vets).
export function assetKeepScore(asset, ctx) {
  const { myDeltas, myTier, posRank } = ctx

  if (asset.type === 'pick') {
    let keep = 0.5
    if (myTier === 'Rebuilding') keep += 0.3       // hoard picks while building
    else if (myTier === 'Contending') keep -= 0.3  // cash picks for win-now
    return clamp(keep)
  }

  const pos = asset.position
  const rank = posRank?.get(String(asset.sleeperId)) ?? 99
  const coreN = CORE_DEPTH[pos] ?? 2

  // Core starters are protected; pieces beyond the starting depth decay toward
  // expendable.
  let keep = rank < coreN
    ? 0.85
    : Math.max(0.2, 0.55 - (rank - coreN) * 0.12)

  // Positional surplus/deficit: protect where I'm thin, open up where I'm deep.
  const delta = myDeltas?.[pos] ?? 0
  if (delta < 0) keep += 0.22
  else if (delta > 0) keep -= 0.18

  // Win-window lean on age.
  const age = asset.age ?? null
  if (myTier === 'Contending') {
    // Win-now: young low-value fliers are spare currency, not core.
    if (age != null && age <= 24 && (asset.value || 0) < 1500) keep -= 0.15
  } else if (myTier === 'Rebuilding') {
    if (age != null && age <= 24) keep += 0.2  // build around youth
    if (age != null && age >= 28) keep -= 0.2  // sell aging vets
  }

  return clamp(keep)
}

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
