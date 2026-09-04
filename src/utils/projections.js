const POSITIONS = ['QB', 'RB', 'WR', 'TE']

const HARD_BLOCK_STATUSES = new Set([
  'Out', 'IR', 'Suspended', 'PUP', 'NFI', 'NFI-R', 'SUSP', 'NA',
])
const SOFT_FLAG_STATUSES = new Set(['Questionable', 'Doubtful'])

export function getProjPts(sleeperId, projMap) {
  if (!projMap || !sleeperId) return 0
  return projMap[sleeperId]?.pts_half_ppr ?? 0
}

// Map each NFL team to its opponent for a given week.
// Sleeper's schedule payload uses `home`/`away` (NOT `home_team`/`away_team`).
export function buildOpponentMap(schedule, week) {
  const opp = {}
  ;(Array.isArray(schedule) ? schedule : []).forEach(g => {
    if (g.week !== week || !g.home || !g.away) return
    opp[g.home] = g.away
    opp[g.away] = g.home
  })
  return opp
}

// Rank each NFL defense vs each position by the fantasy points it allowed in
// the given week. Returns { QB: { 'NE': 'Easy'|'Neutral'|'Tough', ... }, ... }.
//
// Sleeper's `/stats/nfl/regular/{y}/{w}` entries carry NO `pos`/`opp`/`tm` —
// they are null on every entry in every season checked (2022–2026, verified
// 2026-08-08). So position and team come from the shared player DB and the
// opponent comes from the schedule; the stats payload supplies only the
// points. With no stats (a week not yet played) every position ranks empty and
// `getMatchupQuality` reports 'Neutral' — the honest answer, not a guess.
export function computeDefenseRankings(defStatsRaw, { playerDB, schedule, week } = {}) {
  if (!defStatsRaw || !playerDB) return {}

  const oppByTeam = buildOpponentMap(schedule, week)
  const allowed = {}
  POSITIONS.forEach(pos => { allowed[pos] = {} })

  Object.entries(defStatsRaw).forEach(([sleeperId, entry]) => {
    const pts = entry?.pts_half_ppr
    if (pts == null) return
    const player = playerDB[String(sleeperId)]
    const pos = player?.position
    const opp = oppByTeam[player?.team]
    if (!pos || !opp || !allowed[pos]) return
    allowed[pos][opp] = (allowed[pos][opp] ?? 0) + pts
  })

  const rankings = {}
  POSITIONS.forEach(pos => {
    // TOTAL points allowed to the position, not a per-player average: the
    // stats payload includes every rostered player, so averaging would punish
    // a defense merely for facing a deep bench of zero-point players.
    const sorted = Object.entries(allowed[pos])
      .map(([team, pts]) => ({ team, pts }))
      .sort((a, b) => b.pts - a.pts) // most pts allowed = easiest matchup

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
    g => g.week === currentWeek && (g.home === playerTeam || g.away === playerTeam)
  )
  if (!game) return 'Neutral'

  const opponent = game.home === playerTeam ? game.away : game.home
  return defenseRankings[playerPosition]?.[opponent] ?? 'Neutral'
}

// THE availability verdict for a player in a given week — the one place that
// decides "can this player be started, and if not, why?". Returns a reason so
// callers can SAY why (a move card reading "on bye" beats a red dot), and a
// `blocked` flag so the lineup engine can drop them from the eligible pool
// entirely rather than hoping a 0 projection sorts them out.
//
// `label` is the full word for prose ("is listed Questionable"); `short` is the
// conventional fantasy shorthand for a chip, because a full-width
// "QUESTIONABLE" badge on a 390px row squeezes the player's own name down to
// "Rach…" — and the name is the one thing the row must never lose.
//
//   { blocked, status: 'ok'|'bye'|'ir'|'out'|'questionable', label, short }
const SHORT_LABEL = {
  Questionable: 'Q', Doubtful: 'D', Suspended: 'SUSP',
  'NFI-R': 'NFI', NA: 'NA',
}

export function getAvailability(player, playerStatuses, playingTeams) {
  const done = (blocked, status, label) =>
    ({ blocked, status, label, short: label ? (SHORT_LABEL[label] ?? label) : null })

  if (!player) return done(true, 'out', 'Empty')

  if (player.isIR) return done(true, 'ir', 'IR')

  // playingTeams is empty when the schedule fetch failed (best-effort) — with
  // no schedule we can't know who's on bye, so we must not invent a bye.
  if (playingTeams?.size > 0 && player.team && !playingTeams.has(player.team)) {
    return done(true, 'bye', 'Bye')
  }

  const status = playerStatuses?.[player.sleeperId]?.injury_status
  if (status && HARD_BLOCK_STATUSES.has(status)) return done(true, 'out', status)
  if (status && SOFT_FLAG_STATUSES.has(status)) return done(false, 'questionable', status)
  return done(false, 'ok', null)
}

function isHardBlocked(player, playerStatuses, playingTeams) {
  return getAvailability(player, playerStatuses, playingTeams).blocked
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
