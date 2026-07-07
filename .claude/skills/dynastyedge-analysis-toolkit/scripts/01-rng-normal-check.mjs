// Recipe 1 — verify the PRNG (mulberry32) and the normal transform (Box–Muller).
//
// mulberry32 and normalSample are module-INTERNAL to src/utils/playoffOdds.js
// (NOT exported — check the export list before assuming otherwise). They are
// replicated verbatim below. A drift guard reads the real source file and
// asserts the load-bearing tokens still exist, so if the repo implementation
// ever changes, this script fails loudly instead of validating a stale copy.
//
// Run:  node /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/01-rng-normal-check.mjs

import { readFileSync } from 'node:fs'

const SRC = '/home/user/dynastyedge/src/utils/playoffOdds.js'
const src = readFileSync(SRC, 'utf8')
const TOKENS = [
  '0x6d2b79f5',                                            // mulberry32 increment
  'Math.imul(seed ^ (seed >>> 15), 1 | seed)',             // mulberry32 mix step
  '(t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t',            // mulberry32 mix step 2
  '/ 4294967296',                                          // 2^32 divisor → [0,1)
  'Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)', // Box–Muller
]
for (const t of TOKENS) {
  if (!src.includes(t)) throw new Error(`DRIFT GUARD: token missing from playoffOdds.js: "${t}" — the replica below no longer matches the repo; re-copy it.`)
}
console.log('drift guard: all 5 load-bearing tokens present in playoffOdds.js — replica is current\n')

// ── Verbatim replicas of playoffOdds.js lines 23–41 (as of 2026-07-05) ──
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function normalSample(rng, mean, std) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return mean + z * std
}

// ── Uniformity: mean ≈ 1/2, var ≈ 1/12, flat 20-bin histogram, no lag-1 corr ──
const N = 2_000_000
const rng = mulberry32(0x5eed) // the repo's own default seed
let sum = 0, sumsq = 0, serial = 0, prev = null
const bins = new Array(20).fill(0)
for (let i = 0; i < N; i++) {
  const u = rng()
  sum += u; sumsq += u * u
  bins[Math.min(19, Math.floor(u * 20))]++
  if (prev !== null) serial += (prev - 0.5) * (u - 0.5)
  prev = u
}
const mean = sum / N
const varU = sumsq / N - mean * mean
const e = N / 20
const chi2 = bins.reduce((s, o) => s + (o - e) ** 2 / e, 0)
const lag1 = (serial / (N - 1)) / (1 / 12) // autocorrelation, normalized by uniform variance

console.log(`uniformity over N=${N.toLocaleString()} draws, seed=0x5eed:`)
console.log(`  mean     = ${mean.toFixed(6)}   (expect 0.500000, SE = ${(Math.sqrt(1 / 12 / N)).toFixed(6)})`)
console.log(`  variance = ${varU.toFixed(6)}   (expect 1/12 = 0.083333)`)
console.log(`  chi2(20 bins, 19 df) = ${chi2.toFixed(2)}   (5% critical value = 30.14 — pass if below)`)
console.log(`  lag-1 autocorrelation = ${lag1.toExponential(2)}   (pass if |rho| < 2/sqrt(N) = ${(2 / Math.sqrt(N)).toExponential(2)})`)

// ── Normality of Box–Muller draws: mean, var, skew, excess kurtosis, P(|z|≤1) ──
const M = 1_000_000
const rng2 = mulberry32(12345)
const zs = new Float64Array(M)
let zsum = 0
for (let i = 0; i < M; i++) { zs[i] = normalSample(rng2, 0, 1); zsum += zs[i] }
const zmean = zsum / M
let m2 = 0, m3 = 0, m4 = 0, within1 = 0
for (let i = 0; i < M; i++) {
  const d = zs[i] - zmean
  m2 += d * d; m3 += d ** 3; m4 += d ** 4
  if (Math.abs(zs[i]) <= 1) within1++
}
m2 /= M; m3 /= M; m4 /= M
const skew = m3 / m2 ** 1.5
const exkurt = m4 / m2 ** 2 - 3

console.log(`\nBox–Muller normality over M=${M.toLocaleString()} draws of normalSample(rng, 0, 1):`)
console.log(`  mean      = ${zmean.toFixed(5)}   (expect 0, SE = ${(1 / Math.sqrt(M)).toFixed(5)})`)
console.log(`  variance  = ${m2.toFixed(5)}   (expect 1)`)
console.log(`  skew      = ${skew.toFixed(5)}   (expect 0, SE ≈ sqrt(6/M) = ${Math.sqrt(6 / M).toFixed(5)})`)
console.log(`  ex.kurt   = ${exkurt.toFixed(5)}   (expect 0, SE ≈ sqrt(24/M) = ${Math.sqrt(24 / M).toFixed(5)})`)
console.log(`  P(|z|<=1) = ${(within1 / M).toFixed(5)}   (expect 0.68269)`)
