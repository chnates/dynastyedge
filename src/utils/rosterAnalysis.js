import { POSITIONS } from '../constants'
import { buildValueLineup } from './lineupBuild'

const POSITION_DEPTH = { QB: 3, RB: 5, WR: 5, TE: 3 }

export function getPositionalStrength(roster) {
  const result = {}
  POSITIONS.forEach(pos => {
    const eligible = roster.players
      .filter(p => p.position === pos && !p.isIR)
      .sort((a, b) => b.value - a.value)
    result[pos] = eligible.slice(0, POSITION_DEPTH[pos]).reduce((s, p) => s + p.value, 0)
  })
  return result
}

export function computeLeagueAverages(allRosters) {
  const sums = { QB: 0, RB: 0, WR: 0, TE: 0 }
  allRosters.forEach(r => {
    const strength = getPositionalStrength(r)
    POSITIONS.forEach(pos => { sums[pos] += strength[pos] })
  })
  const n = allRosters.length || 1
  const avg = {}
  POSITIONS.forEach(pos => { avg[pos] = sums[pos] / n })
  return avg
}

export function getPositionalDeltas(roster, leagueAverages) {
  const strength = getPositionalStrength(roster)
  const deltas = {}
  POSITIONS.forEach(pos => { deltas[pos] = strength[pos] - leagueAverages[pos] })
  return deltas
}

function minMaxNormalize(arr) {
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  if (max === min) return arr.map(() => 0.5)
  return arr.map(v => (v - min) / (max - min))
}

export function assignWinWindowTiers(allRosters) {
  const ages = allRosters.map(r => r.avgStarterAge).filter(a => a != null)
  const medianAge = ages.length > 0
    ? ages.slice().sort((a, b) => a - b)[Math.floor(ages.length / 2)]
    : 26

  const rawYouth = allRosters.map(r => {
    const age = r.avgStarterAge ?? medianAge
    return age > 0 ? 1 / age : 0
  })

  const normValue   = minMaxNormalize(allRosters.map(r => r.totalValue))
  const normPickCap = minMaxNormalize(allRosters.map(r => r.pickCapitalScore ?? 0))
  const normYouth   = minMaxNormalize(rawYouth)

  const scored = allRosters.map((r, i) => ({
    rosterId: r.rosterId,
    score: normValue[i] * 0.5 + normPickCap[i] * 0.3 + normYouth[i] * 0.2,
  }))

  scored.sort((a, b) => b.score - a.score)

  const tiers = {}
  scored.forEach(({ rosterId }, rank) => {
    if (rank < 3)                      tiers[rosterId] = 'Contending'
    else if (rank >= scored.length - 3) tiers[rosterId] = 'Rebuilding'
    else                               tiers[rosterId] = 'Middle'
  })
  return tiers
}

function topNByDelta(deltas, n, sign) {
  return [...POSITIONS]
    .sort((a, b) => sign === 1 ? deltas[b] - deltas[a] : deltas[a] - deltas[b])
    .slice(0, n)
    .filter(pos => sign === 1 ? deltas[pos] > 0 : deltas[pos] < 0)
}

function getPickCapStatus(rosterId, allRosters) {
  const sorted = [...allRosters].sort((a, b) => b.pickCapitalScore - a.pickCapitalScore)
  const rank = sorted.findIndex(r => r.rosterId === rosterId)
  if (rank < 3)  return 'Rich'
  if (rank >= 7) return 'Depleted'
  return 'Neutral'
}

function getMismatchWarning(myTier, theirTier) {
  if (myTier === theirTier) return null
  if (theirTier === 'Rebuilding') return "They're rebuilding — expect them to ask for picks, not players"
  if (theirTier === 'Contending' && myTier === 'Rebuilding') return "They're contending — they'll want proven starters, not picks or youth"
  if (theirTier === 'Contending' && myTier === 'Middle') return "They're contending — they'll prioritize win-now assets"
  return "Different win windows — align expectations before dealing"
}

export function rankTradePartners(myRoster, allRosters) {
  const leagueAverages = computeLeagueAverages(allRosters)
  const winWindowTiers = assignWinWindowTiers(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)
  const myTier = winWindowTiers[myRoster.rosterId]

  const opponents = allRosters.filter(r => r.rosterId !== myRoster.rosterId)

  const partners = opponents.map(opp => {
    const theirDeltas = getPositionalDeltas(opp, leagueAverages)

    let matchScore = 0
    POSITIONS.forEach(pos => {
      const mySurplus    = Math.max(0,  myDeltas[pos])
      const myDeficit    = Math.max(0, -myDeltas[pos])
      const theirSurplus = Math.max(0,  theirDeltas[pos])
      const theirDeficit = Math.max(0, -theirDeltas[pos])
      matchScore += theirSurplus * myDeficit + mySurplus * theirDeficit
    })

    const theirTier = winWindowTiers[opp.rosterId]

    return {
      rosterId:         opp.rosterId,
      owner:            opp.owner,
      totalValue:       opp.totalValue,
      pickCapitalScore: opp.pickCapitalScore ?? 0,
      positionalDeltas: theirDeltas,
      matchScore,
      theirNeeds:       topNByDelta(theirDeltas, 2, -1),
      theirHaves:       topNByDelta(theirDeltas, 2,  1),
      pickCapStatus:    getPickCapStatus(opp.rosterId, allRosters),
      winWindowTier:    theirTier,
      mismatchWarning:  getMismatchWarning(myTier, theirTier),
    }
  })

  partners.sort((a, b) => b.matchScore - a.matchScore)

  partners.forEach((p, i) => {
    if (i < 3)      p.fitBadge = 'Priority'
    else if (i < 6) p.fitBadge = 'Good Fit'
    else            p.fitBadge = 'Poor Fit'
  })

  return { partners, leagueAverages, winWindowTiers, myDeltas, myTier }
}

export function getWinWindowTier(rosterId, allRosters) {
  return assignWinWindowTiers(allRosters)[rosterId] ?? 'Middle'
}

// How willing the owning roster should be to part with a player, as a
// multiplier on the need-based ranking. Three ROSTER FACTS only — his depth
// rank on their chart, whether he cracks their optimal lineup, and whether
// dealing him would drop them below league average at the position. No read on
// the manager: behavioral profiling was tested on this league's full 4-season
// corpus and disconfirmed (docs/analysis/trade-structure-stability-2026-08.md).
//
// Why it belongs in the ranking at all: `need × value` alone ranks the most
// expensive player at my thinnest position first, every time — which on the
// live board put an untouchable WR1 at the top of a list titled "who should I
// call about?". The same facts already decide Layer 4's appeal, so the board
// and the Analyzer now order by the same evidence.
// It is a TILT, not a co-equal factor. The band is deliberately narrow enough
// that movability can reorder players of comparable value but can never invert
// a real value gap: max/min is 1.93, so a player must be worth less than half as
// much to be outranked on movability alone. An early cut at 0.35–1.6 failed
// that on live data — a 2,174 WR5 outranked a 4,395 WR2 purely for being
// available, which is not a better target, it is a cheaper one. Same discipline
// as the rookie board's age tilt.
export const MOVABILITY_RANGE = [0.70, 1.35]

export function assetMovability({ depthRank, starts, weakensThem, theirDelta }) {
  let m = 1
  // Each step down their positional chart is a step toward spare depth.
  m += Math.min(0.18, Math.max(0, depthRank) * 0.06)
  // He doesn't crack their lineup — genuinely available, whatever he's worth.
  if (!starts) m += 0.12
  if (weakensThem) m -= 0.30          // they can't replace him; expect resistance
  else if (theirDelta > 0) m += 0.05  // above league average here — this is surplus
  return Math.max(MOVABILITY_RANGE[0], Math.min(MOVABILITY_RANGE[1], m))
}

export function getTopTradeTargets(myRoster, allRosters, limit = 20, opts = {}) {
  if (!myRoster || !allRosters?.length) return []

  const { ownerRosterId = null } = opts
  // Single-team mode ("scout this team"): the ranking is scoped to one
  // opponent AND keeps their non-deficit pieces, ranked below the ones that
  // fill a need. An explicitly chosen team must never render an empty board
  // just because they hold nobody at a position you're thin at.
  const scoped = ownerRosterId != null

  const leagueAverages = computeLeagueAverages(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)

  const targets = []

  allRosters
    .filter(r => r.rosterId !== myRoster.rosterId)
    .filter(r => !scoped || r.rosterId === ownerRosterId)
    .forEach(r => {
      const theirDeltas = getPositionalDeltas(r, leagueAverages)
      const starterIds = buildValueLineup(r.players).starterIds
      // Their positional pecking order, so a target's depth rank is a lookup
      // rather than a scan per player.
      const depthRank = new Map()
      POSITIONS.forEach(pos => {
        r.players
          .filter(p => p.position === pos && !p.isIR)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .forEach((p, i) => depthRank.set(String(p.sleeperId), i))
      })

      r.players
        .filter(p => !p.isIR && (p.value ?? 0) >= 1000)
        .forEach(p => {
          const need = Math.max(0, -(myDeltas[p.position] ?? 0))
          // League-wide: skip positions where I'm not below average.
          if (need === 0 && !scoped) return

          // What losing him would do to THEM — the same below-average test
          // Layer 4 applies, run on their roster without him.
          const withoutHim = r.players.filter(x => String(x.sleeperId) !== String(p.sleeperId))
          const afterDelta = getPositionalDeltas({ players: withoutHim }, leagueAverages)[p.position] ?? 0
          const theirDelta = theirDeltas[p.position] ?? 0
          const movability = assetMovability({
            depthRank: depthRank.get(String(p.sleeperId)) ?? 0,
            starts: starterIds.has(String(p.sleeperId)),
            weakensThem: afterDelta < 0 && afterDelta < theirDelta,
            theirDelta,
          })

          targets.push({
            ...p,
            ownerRosterId: r.rosterId,
            owner:         r.owner,
            // Movability multiplies rather than gates: a player his team would
            // hate to lose still belongs on the board, just below the ones they
            // can spare. Nothing is ever hidden by it.
            needScore:     need * p.value * movability,
            movability,
            fillsNeed:     need > 0,
            positionDelta: myDeltas[p.position] ?? 0,
            leagueAvgAtPos: leagueAverages[p.position] ?? 1,
          })
        })
    })

  return targets
    .sort((a, b) => b.needScore - a.needScore || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, limit)
}
