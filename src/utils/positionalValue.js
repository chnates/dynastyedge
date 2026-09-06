// positionalValue.js — scarcity-adjusted value (value over replacement).
//
// FantasyCalc's number already prices Superflex demand into each player, but a
// TRADE compares sums across positions, and a sum of raw values quietly assumes
// a point of QB value and a point of WR value are interchangeable. In a 10-team
// Superflex league they are not: ~20 QBs command a starting spot out of a pool
// barely deeper than that, while the WR pool runs far past its starting slots.
// The 30th-best WR is a bench body; the 30th-best QB does not exist to stream.
//
// Replacement level is derived FROM THE LEAGUE, never hardcoded — same
// discipline as dynastyTrajectory's age curves, and it recalibrates every load:
//   1. run the shipped slot-fill over all 10 rosters to see who actually starts
//   2. count the starters at each position (FLEX and Superflex included)
//   3. the (S+1)-th best rostered player at that position is the first who
//      commands no starting spot league-wide — that is the replacement.
//
// This is the textbook definition, computed on live data with no free
// parameters. It is DISPLAY ONLY: it never moves a verdict (owner call,
// 2026-09-06) — it is an unbacktested model input, and the app's standing rule
// is that those describe, they don't score.

import { POSITIONS } from '../constants'
import { buildValueLineup } from './lineupBuild'

export function buildReplacementLevels(allRosters) {
  if (!allRosters?.length) return null

  const startCount = {}
  const pool = {}

  allRosters.forEach(r => {
    buildValueLineup(r.players).starters.forEach(s => {
      if (POSITIONS.includes(s.position)) startCount[s.position] = (startCount[s.position] ?? 0) + 1
    })
    r.players.forEach(p => {
      if (p.isIR || p.isTaxi || !POSITIONS.includes(p.position)) return
      ;(pool[p.position] ||= []).push(p.value || 0)
    })
  })

  const levels = {}
  const starters = {}
  POSITIONS.forEach(pos => {
    const arr = (pool[pos] ?? []).sort((a, b) => b - a)
    const n = startCount[pos] ?? 0
    starters[pos] = n
    // A position whose pool is no deeper than its starting slots has no
    // replacement to speak of — the floor is the worst rostered body.
    levels[pos] = arr.length > n ? arr[n] : (arr[arr.length - 1] ?? 0)
  })
  return { levels, starters }
}

// Value over replacement for one asset. A pick has no position and no
// replacement — it contributes its raw value unchanged, so a picks-only trade
// reads identically on both scales (which is correct: there is no scarcity
// distortion to correct for).
export function assetVorp(asset, levels) {
  if (!levels) return asset.value || 0
  if (asset.type === 'pick' || !asset.position) return asset.value || 0
  const floor = levels[asset.position]
  if (floor == null) return asset.value || 0
  return Math.max(0, (asset.value || 0) - floor)
}

export function sideVorp(assets, levels) {
  return (assets ?? []).reduce((s, a) => s + assetVorp(a, levels), 0)
}
