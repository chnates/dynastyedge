// Recipe 5 — calibration measurement: Brier score, climatology baseline,
// reliability table. Pure JS, no repo import needed (the method applies to
// playoffOdds output, but real outcomes accumulate only one season at a time,
// so the demo is synthetic).
//
// Run:  node /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/05-calibration.mjs

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(7)

// ── The climatology baseline for THIS league, by hand ──
// Base rate = playoff_teams / 10. playoff_teams is API-sourced; the code
// default is 6 (`?? 6` in src/hooks/usePlayoffOdds.js) → base rate 0.6.
// Predicting the base rate for everyone with k of 10 teams in:
// Brier = (k*(1-k/10)^2 + (10-k)*(k/10)^2) / 10 — for k=6 that is 0.2400,
// regardless of WHO makes it. Confirm the live setting before quoting a bar.
{
  const k = 6 // code-default playoff_teams — replace with the live setting
  const base = k / 10
  const brier = (k * (1 - base) ** 2 + (10 - k) * base ** 2) / 10
  console.log(`climatology baseline (10-team league, playoff_teams=${k} [code default], base rate ${base}):`)
  console.log(`  Brier = mean((${base} - o)^2) = ${brier.toFixed(4)} for every possible outcome set`)
  console.log(`  → any model claiming skill must beat the climatology Brier computed`)
  console.log(`    from the LIVE playoff_teams setting, on real playoff outcomes\n`)
}

// ── Synthetic demo: three forecasters over N events ──
const N = 5000
const events = []
for (let i = 0; i < N; i++) {
  const p = 0.05 + 0.9 * rng()          // true probability
  const o = rng() < p ? 1 : 0           // outcome
  events.push({ p, o })
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const forecasters = {
  'calibrated (predicts true p)': e => e.p,
  'climatology (always 0.5)': () => 0.5,
  'overconfident (stretch 1.6x)': e => clamp(0.5 + 1.6 * (e.p - 0.5), 0.02, 0.98),
}
const brier = f => events.reduce((s, e) => s + (f(e) - e.o) ** 2, 0) / N
console.log(`Brier scores over N=${N} synthetic events (lower is better):`)
for (const [name, f] of Object.entries(forecasters)) {
  console.log(`  ${name.padEnd(30)} ${brier(f).toFixed(4)}`)
}

// ── Reliability table (5 buckets) for the overconfident forecaster ──
console.log('\nreliability table, overconfident forecaster (5 buckets):')
console.log('  bucket    | n    | mean predicted | observed freq | gap')
const K = 5
const buckets = Array.from({ length: K }, () => ({ n: 0, psum: 0, osum: 0 }))
const f = forecasters['overconfident (stretch 1.6x)']
for (const e of events) {
  const p = f(e)
  const b = buckets[Math.min(K - 1, Math.floor(p * K))]
  b.n++; b.psum += p; b.osum += e.o
}
buckets.forEach((b, i) => {
  if (!b.n) return
  const pred = b.psum / b.n, obs = b.osum / b.n
  const se = Math.sqrt(obs * (1 - obs) / b.n)
  console.log(`  ${(i / K).toFixed(1)}–${((i + 1) / K).toFixed(1)}   | ${String(b.n).padStart(4)} | ${pred.toFixed(3).padStart(14)} | ${obs.toFixed(3).padStart(13)} | ${(obs - pred >= 0 ? '+' : '')}${(obs - pred).toFixed(3)} (bucket SE ±${se.toFixed(3)})`)
})
console.log('\npattern: low buckets observe HIGHER than predicted, high buckets LOWER —')
console.log('the signature of overconfidence. A calibrated model shows gaps within ~2 bucket-SEs.')

// ── Minimum sample size for a K-bucket table ──
console.log('\nsample-size rule: to resolve a 5pp miscalibration per bucket you need')
console.log('bucket SE = sqrt(p(1-p)/n) ≲ 0.025 → n ≈ 0.25/0.025^2 = 400 events/bucket at p=0.5,')
console.log('so a 5-bucket table wants ~2000 events. One league season gives 10 —')
console.log('use 2–3 coarse buckets, or pool many weeks of week-ahead forecasts instead.')
