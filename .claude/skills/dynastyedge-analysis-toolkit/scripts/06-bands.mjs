// Recipe 6 — fair-value band arithmetic against the repo's REAL functions:
//   pickTrades.suggestPickPackages — FLOOR 0.8x, CAP 1.45x, undershoot penalty 1.6x
//   tradeAnalysis.getTradeVerdict  — ±5% "even" band, >15% hard decline
//
// Run:  node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//         /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/06-bands.mjs

import { suggestPickPackages } from '/home/user/dynastyedge/src/utils/pickTrades.js'
import { getTradeVerdict } from '/home/user/dynastyedge/src/utils/tradeAnalysis.js'

// ── Pick packages: target 3000, candidate pool chosen so a −10% and a +10%
//    package both exist. The 1.6x undershoot penalty must rank +10% first. ──
const mk = (label, value) => ({ label, value })
const pool = [
  mk("'27 2nd", 700), mk("'26 late 2nd", 900), mk("'26 mid 2nd", 1300),
  mk("'27 1st", 1400), mk("'26 late 1st", 1900), mk("'26 mid 1st", 2400),
]
const pkgs = suggestPickPackages(3000, pool, { count: 6 })
console.log('suggestPickPackages(target=3000) — band is [2400, 4350] = [0.8x, 1.45x]:')
pkgs.forEach(p => {
  console.log(`  ${p.picks.map(x => x.label).join(' + ').padEnd(34)} total ${String(p.total).padStart(4)}  diff ${String(p.diffPct).padStart(3)}%  score ${p.score}`)
})

// The asymmetry, by hand: score = over ? (total-target) : (target-total)*1.6
console.log('\nasymmetry check (score(total), target 3000):')
console.log(`  total 2700 (−10%): score = 300 * 1.6 = ${(3000 - 2700) * 1.6}`)
console.log(`  total 3300 (+10%): score = 300       = ${3300 - 3000}`)
console.log('  → equal % misses, but the overshoot ranks first: sellers reject light offers;')
console.log('    a buyer overpaying 10% still gets the deal done.')

// ── Trade verdict bands: feed getTradeVerdict analysis objects built with the
//    exact same valuePct/valueWinner arithmetic analyzeTrade uses. ──
const analysisFor = (giveTotal, getTotal) => {
  const maxTotal = Math.max(giveTotal, getTotal, 1)
  const valueDiff = getTotal - giveTotal
  const valuePct = Math.round(Math.abs(valueDiff) / maxTotal * 100)
  const valueWinner = valuePct <= 5 ? 'even' : valueDiff > 0 ? 'you' : 'them'
  return {
    giveTotal, getTotal, valueDiff, valuePct, valueWinner,
    filledNeeds: [], hurtStrengths: [], fitScore: 0, windowScore: 0,
    windowNote: 'Neutral — fits your current win window',
  }
}
console.log('\ngetTradeVerdict at the band edges (neutral fit/window):')
for (const [give, get] of [[1000, 960], [1000, 880], [1000, 840]]) {
  const a = analysisFor(give, get)
  const v = getTradeVerdict(a)
  console.log(`  give ${give} / get ${get} → pct ${a.valuePct}% ${a.valueWinner.padEnd(4)} → ${v.verdict}: ${v.reasoning}`)
}
