// fixture.mjs — deterministic synthetic 10-team league + season for offline
// model-quality harness runs. NO network, NO real league data. All shapes
// mirror what usePlayoffOdds.js feeds the pure functions in
// src/utils/playoffOdds.js (read that hook before changing anything here).
//
// The RNG here is a local mulberry32 reimplementation (playoffOdds.js does
// not export its RNG). It is test scaffolding only — the model under test
// uses its own internal RNG.

export function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function normal(rng, mean, std) {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std
}

const N_TEAMS = 10

// A synthetic league whose rosters satisfy teamStartingStrength()'s contract:
// players = [{ sleeperId, value, position, isIR, isTaxi }]. Values are drawn
// so team 1 is strongest and team 10 weakest (deterministic, seeded), with
// realistic FantasyCalc-scale numbers (0–10000).
export function makeLeague(seed = 42) {
  const rng = mulberry32(seed)
  const counts = { QB: 3, RB: 5, WR: 5, TE: 3, DEF: 1 }
  const rosters = []
  for (let t = 1; t <= N_TEAMS; t++) {
    // strength multiplier: team 1 ≈ 1.30 … team 10 ≈ 0.70
    const mult = 1.30 - (t - 1) * (0.60 / (N_TEAMS - 1))
    const players = []
    let pid = 0
    for (const [pos, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) {
        const base = pos === 'DEF' ? 0 : Math.round((6000 / (i + 1)) * mult * (0.85 + 0.3 * rng()))
        players.push({
          sleeperId: `t${t}p${pid++}`,
          value: base,
          position: pos,
          isIR: false,
          isTaxi: false,
        })
      }
    }
    rosters.push({
      rosterId: t,
      record: { wins: 0, losses: 0, ties: 0 },
      pointsFor: 0,
      players,
    })
  }
  return rosters
}

// Round-robin schedule for 10 teams over `weeks` weeks (circle method;
// repeats after 9 unique rounds — matches a 14-week Sleeper regular season).
export function makeSchedule(weeks = 14) {
  const ids = Array.from({ length: N_TEAMS }, (_, i) => i + 1)
  const fixed = ids[0]
  let rot = ids.slice(1)
  const rounds = []
  for (let r = 0; r < N_TEAMS - 1; r++) {
    const ring = [fixed, ...rot]
    const matchups = []
    for (let i = 0; i < N_TEAMS / 2; i++) {
      matchups.push([ring[i], ring[N_TEAMS - 1 - i]])
    }
    rounds.push(matchups)
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)]
  }
  const schedule = []
  for (let w = 1; w <= weeks; w++) {
    schedule.push({ week: w, matchups: rounds[(w - 1) % rounds.length] })
  }
  return schedule
}

// A fully-played synthetic season with KNOWN true team means — the ground
// truth the replay harness is validated against. Returns the season-file
// shape that phase1-replay.mjs consumes (same shape fetch-season.mjs writes
// from real Sleeper data).
export function makeSyntheticSeason(seed = 7, weeks = 14) {
  const rng = mulberry32(seed)
  // true weekly means: 132 (team 1) down to 100 (team 10), std 22 for all
  const trueMean = {}
  for (let t = 1; t <= N_TEAMS; t++) trueMean[t] = 132 - (t - 1) * (32 / (N_TEAMS - 1))
  const trueStd = 22

  const schedule = makeSchedule(weeks)
  const playedWeeks = schedule.map(({ week, matchups }) => {
    const points = {}
    matchups.forEach(([a, b]) => {
      points[a] = Math.max(0, Math.round(normal(rng, trueMean[a], trueStd) * 100) / 100)
      points[b] = Math.max(0, Math.round(normal(rng, trueMean[b], trueStd) * 100) / 100)
    })
    return { week, matchups, points }
  })

  return {
    season: 'synthetic',
    playoffTeams: 6,
    rosterIds: Array.from({ length: N_TEAMS }, (_, i) => i + 1),
    weeks: playedWeeks,
    _trueMean: trueMean, // ground truth, present only in synthetic files
    _trueStd: trueStd,
  }
}
