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
import { getTeamName } from '../hooks/useLeague'

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
// and what to ask for. Finds the partner who most needs `player`'s position
// (or, if none are below average, the team weakest there), then — when they own
// a comparable-value player at one of MY deficit positions — proposes a concrete
// one-for-one swap. Otherwise it falls back to "shop them to <partner>".
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
  const oppDeltas = new Map(opponents.map(o => [o.rosterId, getPositionalDeltas(o, leagueAverages)]))
  const theirNeed = o => oppDeltas.get(o.rosterId)[pos] ?? 0

  // Partners who need this position (most negative first); if none are below
  // average, the teams weakest at it are still the likeliest buyers.
  const needy = opponents.filter(o => theirNeed(o) < 0)
  const ranked = (needy.length ? needy : [...opponents]).sort((a, b) => theirNeed(a) - theirNeed(b))
  const partner = ranked[0]
  if (!partner) return null
  const partnerName = getTeamName(partner.owner)

  const give = [{ ...player, type: 'player' }]

  // Best return: a comparable-value player they own at one of my deficit spots.
  let returnPlayer = null, deficitPos = null
  for (const dPos of myDeficits) {
    const cand = partner.players
      .filter(p =>
        p.position === dPos && !p.isIR &&
        (p.value ?? 0) >= targetVal * 0.8 && (p.value ?? 0) <= targetVal * 1.25
      )
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
    if (cand) { returnPlayer = cand; deficitPos = dPos; break }
  }

  if (returnPlayer) {
    return {
      opponentRosterId: partner.rosterId,
      partnerName,
      give,
      get: [{ ...returnPlayer, type: 'player' }],
      deficitPos,
      ctaLabel: 'Build this trade',
      summary: `Flip ${player.name} to ${partnerName} for ${returnPlayer.name} — fills your ${deficitPos}.`,
    }
  }

  return {
    opponentRosterId: partner.rosterId,
    partnerName,
    give,
    get: null,
    deficitPos: myDeficits[0] ?? null,
    ctaLabel: `Shop to ${partnerName}`,
    summary: `Shop ${player.name} to ${partnerName} — they're thin at ${pos}.`,
  }
}
