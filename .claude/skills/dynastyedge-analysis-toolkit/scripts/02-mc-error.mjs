// Recipe 2 — Monte Carlo error analysis against the repo's REAL simulatePlayoffs.
//
// SE of a simulated probability = sqrt(p(1-p)/N). This script prints the error
// budget at the repo's ITERATIONS=10000, then empirically confirms it: run the
// actual simulatePlayoffs() on a fixed toy league with 20 different seeds and
// show the spread of one team's playoffPct matches the binomial SE.
//
// Run:  node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//         /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/02-mc-error.mjs

import { simulatePlayoffs } from '/home/user/dynastyedge/src/utils/playoffOdds.js'

// ── Analytic error budget at N = 10000 (the repo's ITERATIONS constant) ──
console.log('SE = sqrt(p(1-p)/N) at N=10000:')
for (const p of [0.1, 0.5]) {
  const se = Math.sqrt(p * (1 - p) / 10000)
  console.log(`  p=${p}: SE = ${(se * 100).toFixed(2)}pp  →  95% CI ≈ ±${(1.96 * se * 100).toFixed(2)}pp`)
}
console.log('iterations needed for a ±1pp 95% CI at p=0.5:',
  Math.ceil((1.96 / 0.01) ** 2 * 0.25).toLocaleString())

// ── Toy league: 10 teams, graded strength, 8-week circle-method schedule ──
const n = 10
const allRosters = Array.from({ length: n }, (_, i) => ({
  rosterId: i + 1,
  record: { wins: 0, losses: 0, ties: 0 },
  pointsFor: 0,
}))
const model = {}
allRosters.forEach((r, i) => { model[r.rosterId] = { mean: 100 + i * 3, std: 24 } })

// Circle method round robin: fix team 1, rotate the rest.
const remainingSchedule = []
for (let w = 0; w < 8; w++) {
  const rot = [1]
  for (let i = 0; i < n - 1; i++) rot.push(2 + ((i + w) % (n - 1)))
  const matchups = []
  for (let i = 0; i < n / 2; i++) matchups.push([rot[i], rot[n - 1 - i]])
  remainingSchedule.push({ week: w + 1, matchups })
}

// ── 20 independent seeds → spread of team 5's playoffPct vs binomial SE ──
const TEAM = 5
const pcts = []
for (let seed = 1; seed <= 20; seed++) {
  const res = simulatePlayoffs({ allRosters, model, remainingSchedule, playoffTeams: 5, seed })
  pcts.push(res.find(r => r.rosterId === TEAM).playoffPct)
}
const mean = pcts.reduce((s, v) => s + v, 0) / pcts.length
const sd = Math.sqrt(pcts.reduce((s, v) => s + (v - mean) ** 2, 0) / (pcts.length - 1))
const seTheory = Math.sqrt(mean * (1 - mean) / 10000)

console.log(`\nteam ${TEAM} playoffPct across 20 seeds (real simulatePlayoffs, 10000 iters each):`)
console.log(`  values: ${pcts.map(p => (p * 100).toFixed(1)).join(', ')}`)
console.log(`  mean = ${(mean * 100).toFixed(2)}%`)
console.log(`  observed sd across seeds = ${(sd * 100).toFixed(2)}pp`)
console.log(`  binomial SE prediction   = ${(seTheory * 100).toFixed(2)}pp   (should be same order, ratio ≈ 1)`)
console.log(`  ratio observed/predicted = ${(sd / seTheory).toFixed(2)}`)
