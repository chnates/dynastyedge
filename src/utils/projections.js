const POSITIONS = ['QB', 'RB', 'WR', 'TE']

const HARD_BLOCK_STATUSES = new Set([
  'Out', 'IR', 'Suspended', 'PUP', 'NFI', 'NFI-R', 'SUSP', 'NA',
])
const SOFT_FLAG_STATUSES = new Set(['Questionable', 'Doubtful'])

export function getProjPts(sleeperId, projMap) {
  if (!projMap || !sleeperId) return 0
  return projMap[sleeperId]?.pts_half_ppr ?? 0
}

// Rank each NFL defense vs each position based on pts they allowed last week.
// Returns { QB: { 'NE': 'Easy'|'Neutral'|'Tough', ... }, RB: {...}, ... }
export function computeDefenseRankings(defStatsRaw) {
  if (!defStatsRaw) return {}

  const allowed = {}
  POSITIONS.forEach(pos => { allowed[pos] = {} })

  Object.values(defStatsRaw).forEach(entry => {
    const { pos, opp, pts_half_ppr } = entry
    if (!pos || !opp || pts_half_ppr == null || !allowed[pos]) return
    if (!allowed[pos][opp]) allowed[pos][opp] = { total: 0, count: 0 }
    allowed[pos][opp].total += pts_half_ppr
    allowed[pos][opp].count += 1
  })

  const rankings = {}
  POSITIONS.forEach(pos => {
    const defenses = allowed[pos]
    const sorted = Object.entries(defenses)
      .map(([team, { total, count }]) => ({ team, avg: count > 0 ? total / count : 0 }))
      .sort((a, b) => b.avg - a.avg) // most pts allowed = easiest matchup

    const n = sorted.length
    if (n === 0) { rankings[pos] = {}; return }

    const topThird = Math.ceil(n / 3)
    const bottomThird = Math.floor(n / 3)

    rankings[pos] = {}
    sorted.forEach(({ team }, i) => {
      if (i < topThird) rankings[pos][team] = 'Easy'
      else if (i >= n - bottomThird) rankings[pos][team] = 'Tough'
      else rankings[pos][team] = 'Neutral'
    })
  })

  return rankings
}

// Look up current week opponent for a player's team from the schedule array.
export function getMatchupQuality(playerTeam, playerPosition, currentWeek, schedule, defenseRankings) {
  if (!playerTeam || !playerPosition || !schedule?.length || !defenseRankings) return 'Neutral'

  const game = schedule.find(
    g => g.week === currentWeek && (g.home_team === playerTeam || g.away_team === playerTeam)
  )
  if (!game) return 'Neutral'

  const opponent = game.home_team === playerTeam ? game.away_team : game.home_team
  return defenseRankings[playerPosition]?.[opponent] ?? 'Neutral'
}

function isHardBlocked(player, playerStatuses, playingTeams) {
  if (player.isIR) return true
  if (playingTeams.size > 0 && player.team && !playingTeams.has(player.team)) return true
  const status = playerStatuses?.[player.sleeperId]?.injury_status
  return status != null && HARD_BLOCK_STATUSES.has(status)
}

// Determine the flag for a starter slot.
// benchPlayers: bench-only players (not IR/taxi) from myRoster
// slotEligible: array of positions eligible for this slot
export function getPlayerFlag(player, projMap, playerStatuses, playingTeams, benchPlayers, slotEligible) {
  if (isHardBlocked(player, playerStatuses, playingTeams)) return 'red'

  const status = playerStatuses?.[player.sleeperId]?.injury_status
  if (status && SOFT_FLAG_STATUSES.has(status)) return 'yellow'

  const starterPts = getProjPts(player.sleeperId, projMap)
  const hasBenchUpgrade = (benchPlayers ?? []).some(p =>
    slotEligible.includes(p.position) &&
    !isHardBlocked(p, playerStatuses, playingTeams) &&
    getProjPts(p.sleeperId, projMap) > starterPts
  )
  if (hasBenchUpgrade) return 'yellow'

  return 'green'
}

// Return best eligible bench player (by projected pts) who isn't hard-blocked.
export function getBestBench(slotEligible, starterSleeperId, benchPlayers, projMap, playerStatuses, playingTeams) {
  return [...(benchPlayers ?? [])]
    .filter(p => slotEligible.includes(p.position))
    .filter(p => !isHardBlocked(p, playerStatuses, playingTeams))
    .sort((a, b) => getProjPts(b.sleeperId, projMap) - getProjPts(a.sleeperId, projMap))[0] ?? null
}
