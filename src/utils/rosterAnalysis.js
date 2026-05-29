import { POSITIONS } from '../constants'

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
