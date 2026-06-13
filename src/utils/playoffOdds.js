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
export function buildScoringModel(allRosters, completedScores) {
  const strengths = allRosters.map(teamStartingStrength)
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

function countRemainingGames(remainingSchedule, rosterId) {
  let n = 0
  remainingSchedule.forEach(week => {
    week.matchups.forEach(([a, b]) => {
      if (a === rosterId || b === rosterId) n += 1
    })
  })
  return n
}

// The simulation. Returns one result object per roster with playoff odds,
// projected seed, projected final record, and the full seed distribution.
export function simulatePlayoffs({
  allRosters,
  model,
  remainingSchedule,
  playoffTeams,
  iterations = ITERATIONS,
  seed = 0x5eed,
}) {
  const rng = mulberry32(seed)
  const ids = allRosters.map(r => r.rosterId)
  const n = ids.length

  const base = {}
  allRosters.forEach(r => {
    base[r.rosterId] = {
      wins: r.record?.wins ?? 0,
      losses: r.record?.losses ?? 0,
      ties: r.record?.ties ?? 0,
      pf: r.pointsFor ?? 0,
    }
  })

  const made = {}
  const seedSum = {}
  const topSeed = {}
  const winSum = {}
  const seedCounts = {}
  ids.forEach(id => {
    made[id] = 0
    seedSum[id] = 0
    topSeed[id] = 0
    winSum[id] = 0
    seedCounts[id] = new Array(n).fill(0)
  })

  for (let it = 0; it < iterations; it++) {
    const w = {}
    const pf = {}
    ids.forEach(id => {
      w[id] = base[id].wins
      pf[id] = base[id].pf
    })

    remainingSchedule.forEach(week => {
      week.matchups.forEach(([a, b]) => {
        const sa = Math.max(0, normalSample(rng, model[a].mean, model[a].std))
        const sb = Math.max(0, normalSample(rng, model[b].mean, model[b].std))
        pf[a] += sa
        pf[b] += sb
        if (sa > sb) w[a] += 1
        else if (sb > sa) w[b] += 1
        else { w[a] += 0.5; w[b] += 0.5 }
      })
    })

    // Sleeper's default tiebreaker: wins, then total points-for.
    const ranked = [...ids].sort((x, y) => (w[y] - w[x]) || (pf[y] - pf[x]))
    ranked.forEach((id, idx) => {
      const place = idx + 1
      seedSum[id] += place
      seedCounts[id][idx] += 1
      winSum[id] += w[id]
      if (place <= playoffTeams) made[id] += 1
      if (place === 1) topSeed[id] += 1
    })
  }

  return allRosters.map(r => {
    const id = r.rosterId
    const remGames = countRemainingGames(remainingSchedule, id)
    const basePlayed = base[id].wins + base[id].losses + base[id].ties
    const projWins = winSum[id] / iterations
    const projLosses = Math.max(0, basePlayed + remGames - projWins)
    return {
      rosterId: id,
      playoffPct: made[id] / iterations,
      topSeedPct: topSeed[id] / iterations,
      avgSeed: seedSum[id] / iterations,
      seedDist: seedCounts[id].map(c => c / iterations),
      projWins,
      projLosses,
      remGames,
    }
  })
}

// Preseason / no-schedule fallback: a projected seeding ranked purely by roster
// strength. Explicitly a *preview*, not odds — there are no games to simulate.
export function buildStrengthPreview(allRosters, playoffTeams) {
  return [...allRosters]
    .map(r => ({ rosterId: r.rosterId, owner: r.owner, strength: teamStartingStrength(r) }))
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
