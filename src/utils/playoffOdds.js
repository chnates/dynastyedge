import { computeOptimalPoints } from './lineupHistory'

// ── Playoff odds: a Monte Carlo simulation of the rest of the regular season ──
//
// We don't know who'll win each remaining game, so instead of guessing once we
// play the rest of the season out thousands of times. Each simulated week, every
// team draws a score from its own scoring distribution; the higher score wins.
// After all the simulated seasons, "playoff odds" is simply the share of them in
// which a team finished inside the playoff field. Everything here is pure logic —
// no fetching, no React.

// League-typical weekly scoring anchors for a 10-team Superflex Half-PPR league
// with a DEF slot. These shape only the *spread* between teams early on; once
// real games exist the model leans on actual results instead.
const BASELINE_MEAN = 115        // points a roughly average team scores per week
const BASELINE_STD = 24          // typical week-to-week swing in a team's score
const STRENGTH_SENSITIVITY = 0.40 // how strongly roster strength tilts the mean
const PRIOR_GAMES = 4            // how many games of "belief" the strength prior is worth
const ITERATIONS = 10000         // simulated seasons

// Deterministic RNG (mulberry32) seeded with a fixed value so the odds are
// stable across re-renders — the page must never reshuffle its numbers.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One draw from a normal distribution (Box–Muller).
function normalSample(rng, mean, std) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return mean + z * std
}

// A team's best-possible starting lineup value (FantasyCalc), using the league's
// real slot structure (FLEX/Superflex eligibility). This is our roster-strength
// proxy — the stand-in for "how good is this team" before games are played.
export function teamStartingStrength(roster) {
  const active = (roster.players ?? []).filter(p => !p.isIR && !p.isTaxi)
  const valueMap = {}
  const posMap = {}
  active.forEach(p => {
    valueMap[p.sleeperId] = p.value ?? 0
    posMap[p.sleeperId] = p.position
  })
  return computeOptimalPoints(active.map(p => p.sleeperId), valueMap, id => posMap[id])
}

// Build each team's weekly scoring model: a blend of its roster-strength prior
// and its actual results so far. Early in the year the prior dominates; as games
// accumulate the real scores take over (shrinkage with a 4-game pseudo-count).
// `strengths` may be passed in precomputed so callers that also need the
// strength preview don't run computeOptimalPoints over every roster twice.
export function buildScoringModel(allRosters, completedScores, strengths) {
  strengths = strengths ?? allRosters.map(teamStartingStrength)
  const meanStrength = strengths.reduce((s, v) => s + v, 0) / (strengths.length || 1)

  const model = {}
  allRosters.forEach((r, i) => {
    const priorMean = meanStrength > 0
      ? BASELINE_MEAN * (1 + STRENGTH_SENSITIVITY * (strengths[i] - meanStrength) / meanStrength)
      : BASELINE_MEAN

    const scores = completedScores[r.rosterId] ?? []
    const g = scores.length
    const empMean = g ? scores.reduce((s, v) => s + v, 0) / g : 0
    const mean = g
      ? (g * empMean + PRIOR_GAMES * priorMean) / (g + PRIOR_GAMES)
      : priorMean

    let std = BASELINE_STD
    if (g >= 3) {
      const variance = scores.reduce((s, v) => s + (v - empMean) ** 2, 0) / (g - 1)
      const empStd = Math.sqrt(variance)
      std = (g * empStd + PRIOR_GAMES * BASELINE_STD) / (g + PRIOR_GAMES)
    }

    model[r.rosterId] = {
      mean: Math.max(40, mean),
      std: Math.max(8, std),
      priorMean,
      gamesPlayed: g,
    }
  })
  return model
}

// The simulation. Returns one result object per roster with playoff odds,
// projected seed, projected final record, and the full seed distribution.
//
// Performance note: this is the single heaviest compute path in the app
// (10k iterations × every remaining game × two normal draws, plus a re-seed
// each iteration). The hot loop is written against dense integer-indexed flat
// arrays rather than rosterId-keyed objects so it does no per-iteration
// allocation and no string-key hashing. The exact RNG draw order (week order,
// then matchup order, sample A then B) is preserved, so results stay
// bit-identical to the previous object-keyed version — the deterministic-seed
// contract is intact.
export function simulatePlayoffs({
  allRosters,
  model,
  remainingSchedule,
  playoffTeams,
  iterations = ITERATIONS,
  seed = 0x5eed,
}) {
  const rng = mulberry32(seed)
  const n = allRosters.length

  // rosterId → dense index, so the hot loop touches plain arrays only.
  const indexById = new Map()
  allRosters.forEach((r, i) => indexById.set(r.rosterId, i))

  // Per-team model + base standings as flat arrays indexed by team index.
  const meanArr = new Float64Array(n)
  const stdArr = new Float64Array(n)
  const baseWins = new Float64Array(n)
  const basePf = new Float64Array(n)
  allRosters.forEach((r, i) => {
    const m = model[r.rosterId]
    meanArr[i] = m.mean
    stdArr[i] = m.std
    baseWins[i] = r.record?.wins ?? 0
    basePf[i] = r.pointsFor ?? 0
  })

  // Flatten the remaining schedule into a single index-pair list once. The
  // per-week grouping only mattered for fetching; the sim just needs every
  // game, in order. Stored as a flat [a0,b0,a1,b1,…] buffer.
  const games = []
  remainingSchedule.forEach(week => {
    week.matchups.forEach(([a, b]) => {
      games.push(indexById.get(a), indexById.get(b))
    })
  })
  const gameCount = games.length >> 1

  // Remaining games per team (replaces the old O(n × schedule) post-pass).
  const remGames = new Int32Array(n)
  for (let k = 0; k < games.length; k++) remGames[games[k]] += 1

  // Accumulators.
  const made = new Float64Array(n)
  const seedSum = new Float64Array(n)
  const topSeed = new Float64Array(n)
  const winSum = new Float64Array(n)
  const seedCounts = Array.from({ length: n }, () => new Int32Array(n))

  // Buffers reused across every iteration — zero per-iteration allocation.
  const w = new Float64Array(n)
  const pf = new Float64Array(n)
  const order = new Array(n)
  // Sleeper's default tiebreaker: wins, then total points-for.
  const cmp = (x, y) => (w[y] - w[x]) || (pf[y] - pf[x])

  for (let it = 0; it < iterations; it++) {
    w.set(baseWins)
    pf.set(basePf)

    for (let g = 0; g < gameCount; g++) {
      const a = games[g * 2]
      const b = games[g * 2 + 1]
      const sa = Math.max(0, normalSample(rng, meanArr[a], stdArr[a]))
      const sb = Math.max(0, normalSample(rng, meanArr[b], stdArr[b]))
      pf[a] += sa
      pf[b] += sb
      if (sa > sb) w[a] += 1
      else if (sb > sa) w[b] += 1
      else { w[a] += 0.5; w[b] += 0.5 }
    }

    for (let i = 0; i < n; i++) order[i] = i
    // Array.prototype.sort is stable (ES2019+), so ties keep roster order —
    // identical tie-breaking to the previous [...ids].sort() version.
    order.sort(cmp)

    for (let idx = 0; idx < n; idx++) {
      const i = order[idx]
      const place = idx + 1
      seedSum[i] += place
      seedCounts[i][idx] += 1
      winSum[i] += w[i]
      if (place <= playoffTeams) made[i] += 1
      if (place === 1) topSeed[i] += 1
    }
  }

  return allRosters.map((r, i) => {
    const basePlayed = baseWins[i] + (r.record?.losses ?? 0) + (r.record?.ties ?? 0)
    const projWins = winSum[i] / iterations
    const projLosses = Math.max(0, basePlayed + remGames[i] - projWins)
    return {
      rosterId: r.rosterId,
      playoffPct: made[i] / iterations,
      topSeedPct: topSeed[i] / iterations,
      avgSeed: seedSum[i] / iterations,
      seedDist: Array.from(seedCounts[i], c => c / iterations),
      projWins,
      projLosses,
      remGames: remGames[i],
    }
  })
}

// Preseason / no-schedule fallback: a projected seeding ranked purely by roster
// strength. Explicitly a *preview*, not odds — there are no games to simulate.
export function buildStrengthPreview(allRosters, playoffTeams, strengths) {
  strengths = strengths ?? allRosters.map(teamStartingStrength)
  return allRosters
    .map((r, i) => ({ rosterId: r.rosterId, owner: r.owner, strength: strengths[i] }))
    .sort((a, b) => b.strength - a.strength)
    .map((r, i) => ({ ...r, projSeed: i + 1, projectedIn: i < playoffTeams }))
}

// Plain-English trade-deadline stance from a team's playoff odds. Exported so the
// Trade Analyzer / Partner Finder can reuse the same call in a later pass.
export function getDeadlineVerdict(playoffPct, tier) {
  if (playoffPct == null) {
    return { stance: 'Wait', text: 'Odds activate once the season starts — revisit this after Week 1.' }
  }
  if (playoffPct >= 0.7) {
    return {
      stance: 'Buyer',
      tone: 'success',
      text: "You're a strong bet to make the playoffs. This is the time to trade future picks for proven win-now help.",
    }
  }
  if (playoffPct >= 0.35) {
    return {
      stance: 'On the bubble',
      tone: 'warning',
      text: tier === 'Rebuilding'
        ? "You're on the bubble, but your roster skews young — lean toward picks and youth unless a deal clearly swings your odds."
        : "You're on the bubble — one well-aimed move at your biggest weakness could decide your season.",
    }
  }
  return {
    stance: 'Seller',
    tone: 'danger',
    text: "The math says you're a long shot this year. Sell aging veterans now for picks and young players while their value holds.",
  }
}

// ── The composition, extracted from usePlayoffOdds (2026-09-19) ─────────────
//
// `splitCompletedWeeks` and `buildPlayoffOutlook` below were the body of the
// hook's `processWeeks` and `deriveOdds`. Both are pure — no React, no fetch —
// and they were the only thing standing between the MCP server and this
// model: a tool cannot import a hook, and the standing rule is that any math
// a tool needs is written HERE, where the app gets it too. Same shape as the
// phase-1 prerequisites (`getTeamName`, `buildLeagueState`,
// `buildFreeAgentPool`): the hook now calls this and does nothing else, so
// there is one definition of "what are my odds" and the phone and the server
// cannot disagree about it.
//
// The hook keeps the MEMO (see usePlayoffOdds) — caching by input identity is
// a rendering concern, and a module-level cache here would be a second one.

// Split fetched weeks into completed scores (real results) and a remaining
// schedule (future pairings).
//
// A week counts as complete only when EVERY team in it has scored. A
// partially-played current week is therefore simulated fresh rather than
// contaminating the model with half a week of points — which also means the
// odds only move when a whole week lands, not continuously through Sunday.
export function splitCompletedWeeks(perWeek) {
  const completedScores = {}
  const remainingSchedule = []
  let completedWeeks = 0

  ;(perWeek ?? []).forEach(({ week, entries }) => {
    if (!entries?.length) return

    const groups = {}
    entries.forEach(e => {
      if (e.matchup_id == null) return
      ;(groups[e.matchup_id] ??= []).push(e)
    })
    const pairs = Object.values(groups).filter(g => g.length === 2)
    if (!pairs.length) return // no schedule posted for this week yet

    const complete = entries.every(e => (e.points ?? 0) > 0)
    if (complete) {
      completedWeeks += 1
      entries.forEach(e => {
        ;(completedScores[e.roster_id] ??= []).push(e.points ?? 0)
      })
    } else {
      remainingSchedule.push({
        week,
        matchups: pairs.map(g => [g[0].roster_id, g[1].roster_id]),
      })
    }
  })

  return { completedScores, remainingSchedule, completedWeeks }
}

// The whole model in one call: split the weeks, build the scoring model, run
// the simulation, and report which of the three states the season is in.
//
// `status` is the load-bearing field. **preseason means there is nothing to
// simulate, and it returns `results: null` rather than a fabricated
// percentage** — the same discipline the weekly tools keep about the
// offseason. A strength-ranked preview is offered instead, and it is labelled
// a preview because that is what it is.
export function buildPlayoffOutlook({
  allRosters, perWeek, playoffTeams = 6, firstPlayoffWeek = 15,
}) {
  if (!allRosters?.length) return null

  const { completedScores, remainingSchedule, completedWeeks } = splitCompletedWeeks(perWeek)
  // Roster strength is the costliest piece of the model (an optimal-lineup
  // solve per team). Compute it once and feed both the scoring model and the
  // preseason preview, instead of solving every roster twice.
  const strengths = allRosters.map(teamStartingStrength)
  const model = buildScoringModel(allRosters, completedScores, strengths)
  const remainingGames = remainingSchedule.reduce((s, w) => s + w.matchups.length, 0)

  let status
  if (remainingSchedule.length === 0 && completedWeeks === 0) status = 'preseason'
  else if (remainingSchedule.length === 0) status = 'complete'
  else status = 'active'

  const results = status === 'preseason'
    ? null
    : simulatePlayoffs({ allRosters, model, remainingSchedule, playoffTeams })

  // Keyed by roster for consumers that need one team's odds without re-running
  // the sim (Trade Analyzer / Partner Finder / The Edge / analyze_trade).
  const oddsByRoster = {}
  ;(results ?? []).forEach(r => { oddsByRoster[r.rosterId] = r })

  return {
    status,
    results,
    oddsByRoster,
    model,
    completedWeeks,
    remainingWeeks: remainingSchedule.length,
    remainingGames,
    // Only the preseason page consumes this — don't solve seeding when the
    // real simulation already ran.
    strengthPreview: status === 'preseason'
      ? buildStrengthPreview(allRosters, playoffTeams, strengths)
      : null,
    playoffTeams,
    firstPlayoffWeek,
  }
}
