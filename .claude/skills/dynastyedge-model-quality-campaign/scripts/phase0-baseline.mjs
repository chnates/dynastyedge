// phase0-baseline.mjs — GATE 0 harness: baseline instrumentation of the
// playoff-odds model. NO model changes, NO network. Run with:
//
//   cd /home/user/dynastyedge
//   node --import ./.claude/skills/dynastyedge-model-quality-campaign/scripts/reg.mjs \
//        .claude/skills/dynastyedge-model-quality-campaign/scripts/phase0-baseline.mjs
//
// Checks (each prints PASS/FAIL):
//   A. Determinism — two simulatePlayoffs runs, same seed → bit-identical.
//   B. Odds conservation — Σ playoffPct over 10 teams = playoffTeams (6);
//      Σ topSeedPct = 1; every team's seedDist sums to 1.
//   C. Monotonicity — the strongest-model team's odds ≥ weakest's.
//   D. Shrinkage arithmetic — buildScoringModel at g=0 (pure prior) and
//      g=4 (exact midpoint: (4·emp + 4·prior)/8) match hand math.
//   E. Noise floor — playoffPct std-dev across 20 different seeds, compared
//      to the analytic binomial SE sqrt(p(1-p)/10000).
//   F. getDeadlineVerdict threshold edges (0.35 / 0.70).

import {
  buildScoringModel,
  simulatePlayoffs,
  teamStartingStrength,
  getDeadlineVerdict,
} from '/home/user/dynastyedge/src/utils/playoffOdds.js'
import { makeLeague, makeSchedule } from './fixture.mjs'

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const rosters = makeLeague(42)
const schedule = makeSchedule(14) // full 14-week season remaining (week 0)
const playoffTeams = 6

const strengths = rosters.map(teamStartingStrength)
console.log('fixture strengths (optimal-lineup value, team 1→10):')
console.log(' ', strengths.map(s => Math.round(s)).join(' '))

const model = buildScoringModel(rosters, {}, strengths)
console.log('model means (team 1→10):')
console.log(' ', rosters.map(r => model[r.rosterId].mean.toFixed(1)).join(' '))

const simArgs = { allRosters: rosters, model, remainingSchedule: schedule, playoffTeams }

// A. Determinism
const run1 = simulatePlayoffs({ ...simArgs })
const run2 = simulatePlayoffs({ ...simArgs })
check('A determinism (same seed ⇒ identical results)',
  JSON.stringify(run1) === JSON.stringify(run2))

// B. Conservation
const sumPct = run1.reduce((s, r) => s + r.playoffPct, 0)
check('B Σ playoffPct = playoffTeams', Math.abs(sumPct - playoffTeams) < 1e-9,
  `Σ = ${sumPct}`)
const sumTop = run1.reduce((s, r) => s + r.topSeedPct, 0)
check('B Σ topSeedPct = 1', Math.abs(sumTop - 1) < 1e-9, `Σ = ${sumTop}`)
const distOk = run1.every(r => Math.abs(r.seedDist.reduce((s, v) => s + v, 0) - 1) < 1e-9)
check('B every seedDist sums to 1', distOk)

// C. Monotonicity
const byId = Object.fromEntries(run1.map(r => [r.rosterId, r]))
check('C strongest team odds ≥ weakest team odds',
  byId[1].playoffPct >= byId[10].playoffPct,
  `team1 ${(byId[1].playoffPct * 100).toFixed(1)}% vs team10 ${(byId[10].playoffPct * 100).toFixed(1)}%`)
console.log('  playoffPct by team:',
  run1.map(r => `${r.rosterId}:${(r.playoffPct * 100).toFixed(1)}%`).join(' '))

// D. Shrinkage arithmetic (PRIOR_GAMES = 4 in playoffOdds.js)
const m0 = buildScoringModel(rosters, {}, strengths)
check('D g=0 ⇒ mean = priorMean',
  rosters.every(r => m0[r.rosterId].mean === Math.max(40, m0[r.rosterId].priorMean)))
const fourScores = { 1: [120, 120, 120, 120] } // empMean = 120, g = 4
const m4 = buildScoringModel(rosters, fourScores, strengths)
const expected = (4 * 120 + 4 * m4[1].priorMean) / 8
check('D g=4 ⇒ mean = midpoint(emp, prior)',
  Math.abs(m4[1].mean - expected) < 1e-9,
  `mean ${m4[1].mean.toFixed(3)} vs hand math ${expected.toFixed(3)}`)

// E. Noise floor across seeds (bubble team = whichever is closest to 50%)
const SEEDS = 20
const perSeed = []
for (let s = 1; s <= SEEDS; s++) {
  perSeed.push(simulatePlayoffs({ ...simArgs, seed: s }))
}
const bubble = run1.reduce((a, b) =>
  Math.abs(a.playoffPct - 0.5) < Math.abs(b.playoffPct - 0.5) ? a : b)
const bubbleVals = perSeed.map(res => res.find(r => r.rosterId === bubble.rosterId).playoffPct)
const mean = bubbleVals.reduce((s, v) => s + v, 0) / SEEDS
const sd = Math.sqrt(bubbleVals.reduce((s, v) => s + (v - mean) ** 2, 0) / (SEEDS - 1))
const analyticSE = Math.sqrt(mean * (1 - mean) / 10000)
console.log(`E noise floor: bubble team ${bubble.rosterId}, mean ${(mean * 100).toFixed(2)}%, ` +
  `empirical sd ${(sd * 100).toFixed(2)}pp across ${SEEDS} seeds, ` +
  `analytic SE sqrt(p(1-p)/10000) = ${(analyticSE * 100).toFixed(2)}pp`)
check('E empirical seed-to-seed sd within 2× analytic SE', sd < 2 * analyticSE,
  `${(sd * 100).toFixed(2)}pp vs bound ${(2 * analyticSE * 100).toFixed(2)}pp`)

// F. Verdict thresholds
check('F 0.349 ⇒ Seller', getDeadlineVerdict(0.349).stance === 'Seller')
check('F 0.35 ⇒ On the bubble', getDeadlineVerdict(0.35).stance === 'On the bubble')
check('F 0.699 ⇒ On the bubble', getDeadlineVerdict(0.699).stance === 'On the bubble')
check('F 0.70 ⇒ Buyer', getDeadlineVerdict(0.70).stance === 'Buyer')
check('F null ⇒ Wait', getDeadlineVerdict(null).stance === 'Wait')

console.log(failures === 0 ? '\nGATE 0: ALL CHECKS PASS' : `\nGATE 0: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
