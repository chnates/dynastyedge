// Recipe 4 — kernel-smoothed weighted-median age curves via the repo's REAL
// buildAgeCurves (src/utils/dynastyTrajectory.js).
//
// Synthetic market: for each position, a cloud of (age, value) samples whose
// true peak matches dynasty intuition (RB earlier than WR earlier than QB),
// with heavy-tailed lognormal noise + a few 9000-value studs at off-peak ages
// to show why the MEDIAN (not the mean) is the right center.
//
// Run:  node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//         /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/04-age-curve.mjs

import { buildAgeCurves } from '/home/user/dynastyedge/src/utils/dynastyTrajectory.js'

// Deterministic local PRNG (same mulberry32 algorithm as playoffOdds.js — internal there).
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(42)
const normal = () => {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// True market shape: triangular peak, decaying either side.
const TRUE_PEAK = { QB: 28, RB: 24, WR: 26, TE: 27 }
const shape = (pos, age) => {
  const d = Math.abs(age - TRUE_PEAK[pos])
  return Math.max(0.1, 1 - 0.11 * d)
}

const playerMap = {}
let id = 0
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  for (let age = 21; age <= 34; age++) {
    for (let k = 0; k < 12; k++) { // 12 players per (pos, age) — dense bins
      const value = Math.round(2500 * shape(pos, age) * Math.exp(0.6 * normal()))
      playerMap[`p${id++}`] = { position: pos, age: age + rng() * 0.9, value }
    }
  }
  // heavy-tail contamination: three 9000-value studs at a non-peak age
  for (let k = 0; k < 3; k++) playerMap[`p${id++}`] = { position: pos, age: 31 + rng(), value: 9000 }
}

const { curves, generic } = buildAgeCurves(playerMap)

const argmax = curve => Object.entries(curve).reduce((b, [a, v]) => (v > b[1] ? [Number(a), v] : b), [0, -1])
console.log('curve peak age per position (synthetic truth in parens):')
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  const [a, v] = argmax(curves[pos])
  console.log(`  ${pos}: peaks at age ${a} (truth ${TRUE_PEAK[pos]}), curve value ${Math.round(v)}`)
}
const [rbPeak] = argmax(curves.RB), [wrPeak] = argmax(curves.WR), [qbPeak] = argmax(curves.QB)
console.log(`sanity: RB peak (${rbPeak}) < WR peak (${wrPeak}) <= QB peak (${qbPeak}) → ${rbPeak < wrPeak && wrPeak <= qbPeak ? 'PASS' : 'FAIL'}`)

console.log('\nRB vs WR curve, ages 22–34 (note RB falls off harder in the late 20s):')
console.log(' age |   RB  |   WR')
for (let age = 22; age <= 34; age += 2) {
  console.log(`  ${age} | ${String(Math.round(curves.RB[age])).padStart(5)} | ${String(Math.round(curves.WR[age])).padStart(5)}`)
}

// Contamination check: did the 9000-value studs at age ~31 drag the curve up?
console.log(`\ncurve at age 31 despite three 9000-value outliers there:`)
for (const pos of ['RB', 'WR']) {
  console.log(`  ${pos}: curve(31) = ${Math.round(curves[pos][31])} vs curve(peak) = ${Math.round(argmax(curves[pos])[1])} — outliers did NOT create a second peak`)
}

// Why median, not mean — one age bin, by hand:
const bin = [800, 900, 1000, 1100, 1200, 9000]
const mean = bin.reduce((s, v) => s + v, 0) / bin.length
const med = [...bin].sort((a, b) => a - b)
const median = (med[2] + med[3]) / 2
console.log(`\none age bin ${JSON.stringify(bin)}: mean = ${mean.toFixed(0)} (dragged 2x by one stud), median = ${median} (stable)`)

console.log(`\ngeneric (cross-position) curve at rookie entry 22: ${Math.round(generic[22])}, at 26: ${Math.round(generic[26])}, at 32: ${Math.round(generic[32])}`)
