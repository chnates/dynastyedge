// Recipe 3 — shrinkage estimator: the pseudo-count blend in the repo's REAL
// buildScoringModel (src/utils/playoffOdds.js).
//
//   mean = (g·empMean + PRIOR_GAMES·priorMean) / (g + PRIOR_GAMES),  PRIOR_GAMES = 4
//
// Two teams, strengths 60k / 40k (league mean 50k). Team 1 then scores 140
// every week; watch its model mean walk from the prior toward 140 as games
// accumulate, and verify against the hand formula at every step.
//
// Run:  node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//         /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/03-shrinkage.mjs

import { buildScoringModel } from '/home/user/dynastyedge/src/utils/playoffOdds.js'

const allRosters = [{ rosterId: 1 }, { rosterId: 2 }]
const strengths = [60000, 40000] // passed precomputed so no roster.players needed

// Hand-derived prior for team 1: BASELINE_MEAN=115, STRENGTH_SENSITIVITY=0.40
// priorMean = 115 * (1 + 0.40 * (60000-50000)/50000) = 115 * 1.08 = 124.2
const PRIOR = 115 * (1 + 0.40 * (60000 - 50000) / 50000)
const EMP = 140 // team 1 scores 140 every completed week

console.log(`prior mean (hand): ${PRIOR.toFixed(2)}  |  empirical scoring: ${EMP} every week`)
console.log('g = games played · repo mean = buildScoringModel output · hand = (g·140 + 4·prior)/(g+4)\n')
console.log(' g | repo mean | hand mean | weight on data g/(g+4)')
console.log('---+-----------+-----------+-----------------------')
for (const g of [0, 1, 2, 4, 8, 13]) {
  const scores = Array(g).fill(EMP)
  const model = buildScoringModel(allRosters, { 1: scores, 2: [] }, strengths)
  const hand = g === 0 ? PRIOR : (g * EMP + 4 * PRIOR) / (g + 4)
  const ok = Math.abs(model[1].mean - hand) < 1e-9 ? 'MATCH' : 'MISMATCH!'
  console.log(
    `${String(g).padStart(2)} | ${model[1].mean.toFixed(3).padStart(9)} | ${hand.toFixed(3).padStart(9)} | ${(g / (g + 4)).toFixed(2).padStart(6)}   ${ok}`
  )
}

console.log('\nweek 1 (g=1): posterior sits 20% of the way from prior to data.')
console.log('week 8 (g=8): 67% of the way. The 4-game pseudo-count IS the crossover: at g=4, prior and data split 50/50.')
