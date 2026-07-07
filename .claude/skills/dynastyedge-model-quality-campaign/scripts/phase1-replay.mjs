// phase1-replay.mjs — GATE 1 harness: walk-forward playoff-odds calibration
// replay. Feeds only weeks ≤ k into buildScoringModel + simulatePlayoffs and
// scores the predictions against the realized playoff field.
//
// OFFLINE mode (runs here, validates the harness itself against a season
// with KNOWN team strengths):
//   cd /home/user/dynastyedge
//   node --import ./.claude/skills/dynastyedge-model-quality-campaign/scripts/reg.mjs \
//        ./.claude/skills/dynastyedge-model-quality-campaign/scripts/phase1-replay.mjs --synthetic
//
// REAL-DATA mode (after fetch-season.mjs has written season files — network
// step, see the runbook in SKILL.md):
//   node --import .../reg.mjs .../phase1-replay.mjs season-2024.json season-2025.json
//
// Season-file shape (what fetch-season.mjs writes):
//   { season, playoffTeams, rosterIds: [..],
//     weeks: [{ week, matchups: [[ridA, ridB], ..], points: { rid: pts } }] }
//   weeks = COMPLETED regular-season weeks only, in order.
//
// IMPORTANT MODEL LIMITATION (be honest about it in any report): historical
// FantasyCalc roster values do not exist (values-history.json is a 90-day
// rolling window), so the roster-strength PRIOR cannot be reconstructed for
// past seasons. This harness feeds flat strengths (priorMean = BASELINE_MEAN
// for every team), which means the replay validates the empirical-score
// blending and the simulation — NOT the preseason prior. asOfWeek=0
// predictions are therefore pure climatology by construction; report
// calibration for asOfWeek ≥ 2 separately.

import { writeFileSync } from 'node:fs'
import {
  buildScoringModel,
  simulatePlayoffs,
} from '/home/user/dynastyedge/src/utils/playoffOdds.js'
import { makeSyntheticSeason } from './fixture.mjs'

const BUCKETS = [
  [0.0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0000001],
]

function finalStandings(seasonFile) {
  const { rosterIds, weeks } = seasonFile
  const w = Object.fromEntries(rosterIds.map(id => [id, 0]))
  const pf = Object.fromEntries(rosterIds.map(id => [id, 0]))
  weeks.forEach(({ matchups, points }) => {
    matchups.forEach(([a, b]) => {
      const pa = points[a] ?? 0, pb = points[b] ?? 0
      pf[a] += pa; pf[b] += pb
      if (pa > pb) w[a] += 1
      else if (pb > pa) w[b] += 1
      else { w[a] += 0.5; w[b] += 0.5 }
    })
  })
  // Sleeper default tiebreaker: wins, then points-for (same cmp as the sim)
  const order = [...rosterIds].sort((x, y) => (w[y] - w[x]) || (pf[y] - pf[x]))
  return { wins: w, pointsFor: pf, order }
}

function replaySeason(seasonFile) {
  const { rosterIds, weeks, playoffTeams } = seasonFile
  const W = weeks.length
  const { order } = finalStandings(seasonFile)
  const madeField = new Set(order.slice(0, playoffTeams))

  const predictions = [] // { asOfWeek, rosterId, pred, made }
  for (let k = 0; k < W; k++) {
    // standings + completed scores from weeks 1..k
    const wins = Object.fromEntries(rosterIds.map(id => [id, 0]))
    const losses = Object.fromEntries(rosterIds.map(id => [id, 0]))
    const ties = Object.fromEntries(rosterIds.map(id => [id, 0]))
    const pf = Object.fromEntries(rosterIds.map(id => [id, 0]))
    const completedScores = {}
    for (let i = 0; i < k; i++) {
      const { matchups, points } = weeks[i]
      matchups.forEach(([a, b]) => {
        const pa = points[a] ?? 0, pb = points[b] ?? 0
        ;(completedScores[a] ??= []).push(pa)
        ;(completedScores[b] ??= []).push(pb)
        pf[a] += pa; pf[b] += pb
        if (pa > pb) { wins[a]++; losses[b]++ }
        else if (pb > pa) { wins[b]++; losses[a]++ }
        else { ties[a]++; ties[b]++ }
      })
    }
    const rosters = rosterIds.map(id => ({
      rosterId: id,
      record: { wins: wins[id], losses: losses[id], ties: ties[id] },
      pointsFor: pf[id],
    }))
    const flatStrengths = rosterIds.map(() => 1) // no historical prior — see header
    const model = buildScoringModel(rosters, completedScores, flatStrengths)
    const remainingSchedule = weeks.slice(k).map(({ week, matchups }) => ({ week, matchups }))
    const results = simulatePlayoffs({
      allRosters: rosters, model, remainingSchedule, playoffTeams,
    })
    results.forEach(r => {
      predictions.push({
        asOfWeek: k,
        rosterId: r.rosterId,
        pred: r.playoffPct,
        made: madeField.has(r.rosterId) ? 1 : 0,
      })
    })
  }
  return { predictions, madeField: [...madeField] }
}

function brier(preds) {
  if (!preds.length) return null
  return preds.reduce((s, p) => s + (p.pred - p.made) ** 2, 0) / preds.length
}

function reliabilityTable(preds) {
  return BUCKETS.map(([lo, hi]) => {
    const inB = preds.filter(p => p.pred >= lo && p.pred < hi)
    const n = inB.length
    const avgPred = n ? inB.reduce((s, p) => s + p.pred, 0) / n : null
    const hitRate = n ? inB.reduce((s, p) => s + p.made, 0) / n : null
    // 95% binomial CI half-width on the hit rate (normal approx)
    const ci = n && hitRate != null
      ? 1.96 * Math.sqrt(Math.max(hitRate * (1 - hitRate), 1e-9) / n)
      : null
    return { bucket: `${(lo * 100).toFixed(0)}–${Math.min(hi * 100, 100).toFixed(0)}%`, n, avgPred, hitRate, ci }
  })
}

// ── main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let seasons
if (args.includes('--synthetic')) {
  seasons = [makeSyntheticSeason(7, 14)]
  console.log('MODE: synthetic season (known true means 132→100, std 22) — harness self-validation')
} else if (args.length) {
  const { readFileSync } = await import('node:fs')
  seasons = args.map(f => JSON.parse(readFileSync(f, 'utf8')))
  console.log(`MODE: real seasons — ${seasons.map(s => s.season).join(', ')}`)
} else {
  console.error('usage: phase1-replay.mjs --synthetic | season-*.json ...')
  process.exit(2)
}

const allPreds = []
for (const s of seasons) {
  const { predictions, madeField } = replaySeason(s)
  allPreds.push(...predictions.map(p => ({ ...p, season: s.season })))
  console.log(`\nseason ${s.season}: ${s.weeks.length} weeks, playoff field = [${madeField.join(', ')}]`)
}

// Climatology baseline: always predict base rate = playoffTeams / nTeams
const baseRate = seasons[0].playoffTeams / seasons[0].rosterIds.length
const climPreds = allPreds.map(p => ({ ...p, pred: baseRate }))

// asOfWeek=0 is pure climatology by construction (flat prior) — report split
const preds2plus = allPreds.filter(p => p.asOfWeek >= 2)

console.log(`\nsamples: ${allPreds.length} team-week predictions (${preds2plus.length} at asOfWeek ≥ 2)`)
console.log(`Brier (model, all weeks):      ${brier(allPreds).toFixed(4)}`)
console.log(`Brier (model, asOfWeek ≥ 2):   ${brier(preds2plus).toFixed(4)}`)
console.log(`Brier (climatology p=${baseRate}):   ${brier(climPreds).toFixed(4)}  ` +
  `[analytic: p(1-p) = ${(baseRate * (1 - baseRate)).toFixed(4)} when field is balanced]`)

console.log('\nreliability table (asOfWeek ≥ 2):')
console.log('  bucket     n     avgPred   hitRate   ±95%CI')
reliabilityTable(preds2plus).forEach(r => {
  if (!r.n) { console.log(`  ${r.bucket.padEnd(9)} 0     —         —`); return }
  console.log(`  ${r.bucket.padEnd(9)} ${String(r.n).padEnd(5)} ${(r.avgPred * 100).toFixed(1).padStart(6)}%   ${(r.hitRate * 100).toFixed(1).padStart(6)}%   ±${(r.ci * 100).toFixed(1)}pp`)
})

console.log('\nBrier by asOfWeek (should decrease as evidence accumulates):')
const weeksSeen = [...new Set(allPreds.map(p => p.asOfWeek))].sort((a, b) => a - b)
console.log('  ' + weeksSeen.map(k =>
  `w${k}:${brier(allPreds.filter(p => p.asOfWeek === k)).toFixed(3)}`).join(' '))

// Artifact
const out = {
  generatedAt: new Date().toISOString(),
  seasons: seasons.map(s => s.season),
  playoffTeams: seasons[0].playoffTeams,
  note: 'flat roster-strength prior (no historical FantasyCalc values); asOfWeek=0 is climatology by construction',
  samples: allPreds.length,
  brierModelAll: brier(allPreds),
  brierModelWeek2Plus: brier(preds2plus),
  brierClimatology: brier(climPreds),
  reliabilityWeek2Plus: reliabilityTable(preds2plus),
  predictions: allPreds,
}
const outPath = args.includes('--synthetic')
  ? '/tmp/claude-0/-home-user-dynastyedge/7879577a-345c-5c0f-8041-26eb02038d67/scratchpad/replay-synthetic.json'
  : `replay-results-${Date.now()}.json`
try {
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`\nartifact written: ${outPath}`)
} catch { /* artifact write is best-effort */ }
