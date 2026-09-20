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

// Teams whose game this week has already kicked off — Sleeper LOCKS a player
// the moment his game starts, so nobody on these teams can be moved into or
// out of a lineup any more, whatever his projection or injury status now says.
//
// THIS IS READ OFF A FIELD THE SCHEDULE ALREADY CARRIES. `parseByeTeams` above
// reads only `home`/`away`/`week` and throws `status` away, which is why the
// Optimizer used to recommend sitting a Thursday-night player on Sunday
// morning — a move that cannot be made, advertising points that cannot be won.
//
// A game is locked when we POSITIVELY know it is past `pre_game`. An absent or
// unrecognised status means NOT locked, deliberately: over-locking would pin a
// player you can still move and hide a real move, while under-locking merely
// degrades to the behaviour that shipped before this existed. Same discipline
// as an empty `playingTeams` meaning "byes unknown" rather than "everyone is
// on bye".
export const LOCKED_GAME_STATUSES = new Set(['in_game', 'complete', 'post_game', 'final'])

export function parseLockedTeams(schedule, week) {
  const locked = new Set()
  ;(Array.isArray(schedule) ? schedule : []).forEach(g => {
    if (g.week !== week) return
    const status = typeof g.status === 'string' ? g.status.toLowerCase() : null
    if (!status || status === 'pre_game' || !LOCKED_GAME_STATUSES.has(status)) return
    if (g.home) locked.add(g.home)
    if (g.away) locked.add(g.away)
  })
  return locked
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

// `locked` is ORTHOGONAL to `blocked`, and conflating the two is the bug this
// parameter exists to fix. `blocked` is a forward-looking claim — "he will
// score 0, take him out". `locked` is a claim about the transaction — "you
// cannot take him out at all". DJ Moore was both Out and locked: the engine
// saw only `blocked`, told the owner to bench a player whose game had finished
// three days earlier, and counted the 10.9 it had just zeroed as points
// recoverable from the bench. They were not recoverable; he had already scored
// -0.1 and the slot was sealed.
export function getAvailability(player, playerStatuses, playingTeams, lockedTeams) {
  const locked = !!(lockedTeams?.size > 0 && player?.team && lockedTeams.has(player.team))
  const done = (blocked, status, label) =>
    ({ blocked, status, label, short: label ? (SHORT_LABEL[label] ?? label) : null, locked })

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

function isHardBlocked(player, playerStatuses, playingTeams, lockedTeams) {
  return getAvailability(player, playerStatuses, playingTeams, lockedTeams).blocked
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
