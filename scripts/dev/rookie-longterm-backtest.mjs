#!/usr/bin/env node
// Dev/analysis tool — NOT part of the app or any workflow. Nothing imports it.
//
// The Phase 3c GATE (docs/build-plan-2026-09.md §4). Phase 3 proposed splitting
// rookie research into TWO axes — "impact now" (will he play this season) and
// "long term" (is he worth a taxi spot) — and required the long-term score to
// beat NFL draft capital alone OUT OF SAMPLE before any of it shipped.
//
// This script answers three questions, in order of how much they matter:
//
//   1. Does a long-term score (capital + age at draft + combine athleticism)
//      beat capital alone at predicting a rookie's YEARS 2-3 production?
//   2. Is that long-term score a genuinely DIFFERENT ranking from the score
//      the app already ships — i.e. is there a second axis at all?
//   3. Does age add anything on top of the shipped score?
//
// Findings are written up in docs/analysis/rookie-longterm-signals-2026-09.md.
// Every number there comes from this script; nothing is hand-copied.
//
// Like scripts/dev/rookie-signal-backtest.mjs, this IMPORTS THE SHIPPED
// CONSTANTS rather than re-implementing them, so the analysis and the product
// cannot silently drift apart. It also re-derives COMBINE_BASELINE and
// AGE_BASELINE from raw nflverse data and diffs them against what is shipped.
//
// Usage:
//   node scripts/dev/rookie-longterm-backtest.mjs
//   node scripts/dev/rookie-longterm-backtest.mjs --bootstrap   # + resampling CIs
//
// Zero dependencies, read-only, public data. Safe to re-run. Downloads ~40MB
// of nflverse CSVs to a cache dir on first run (NFLVERSE_CACHE to override).

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  capitalScore, opportunityScore,
  COMBINE_BASELINE, AGE_BASELINE, COMBINE_DRILLS, ageAtDraftZ,
} from '../../src/utils/rookieResearch.js'

const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// The long-term frame. A class needs seasons S+1 and S+2 fully played, so the
// newest usable class is (last completed season - 2).
const LT_CLASSES = range(2013, 2023)
// The two-axis frame additionally needs a week-1 depth chart. nflverse's
// pre-2025 depth charts are the `depth_team` schema and go back well past this
// window; 2015 is chosen so 2015-2020 sits entirely OUTSIDE the 2021-2025
// window the shipped opportunity score was calibrated on.
const AXIS_CLASSES = range(2015, 2023)
// A "hit": years 2+3 combined half-PPR that a dynasty manager would call a
// startable stretch. Reported as a sanity check on the rank correlations, not
// as a model output.
const HIT_POINTS = 150

const CACHE = process.env.NFLVERSE_CACHE || join(tmpdir(), 'dynastyedge-nflverse')
mkdirSync(CACHE, { recursive: true })

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i) }

async function fetchCached(url, name) {
  const path = join(CACHE, name)
  if (existsSync(path)) return readFileSync(path, 'utf8')
  process.stderr.write(`  fetching ${name} …\n`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  writeFileSync(path, text)
  return text
}

// Minimal RFC4180 parser — nflverse quotes fields containing commas.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift()
  return rows.filter(r => r.length === head.length)
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const num = v => {
  const s = (v ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) }

function spearman(pairs) {
  const p = pairs.filter(([a, b]) => a != null && b != null && !Number.isNaN(a) && !Number.isNaN(b))
  const n = p.length
  if (n < 3) return { rho: NaN, n }
  const rank = vals => {
    const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b])
    const r = new Array(n)
    for (let i = 0; i < n;) {
      let j = i
      while (j + 1 < n && vals[idx[j + 1]] === vals[idx[i]]) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) r[idx[k]] = avg
      i = j + 1
    }
    return r
  }
  const ra = rank(p.map(x => x[0])), rb = rank(p.map(x => x[1]))
  const ma = mean(ra), mb = mean(rb)
  let cov = 0, va = 0, vb = 0
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2
  }
  return { rho: cov / Math.sqrt(va * vb), n }
}

// Deterministic RNG so a bootstrap CI is reproducible run to run — the same
// contract playoffOdds.js holds for the Monte Carlo.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Load ─────────────────────────────────────────────────────────────────────
process.stderr.write('Loading nflverse data (cached after first run)…\n')

const picks = parseCsv(await fetchCached(`${NFLVERSE}/draft_picks/draft_picks.csv`, 'draft_picks.csv'))
  .filter(r => SKILL.has(r.position) && r.gsis_id)

const combine = parseCsv(await fetchCached(`${NFLVERSE}/combine/combine.csv`, 'combine.csv'))
// pfr_id is the join. combine.pfr_id -> draft_picks.pfr_player_id is an exact
// ID match on both sides; NO name matching happens anywhere in this script or
// in the pipeline it validates (CLAUDE.md: Jordan Love vs Jeremiyah Love).
const combineByPfr = new Map()
for (const r of combine) if (r.pfr_id?.trim()) combineByPfr.set(r.pfr_id.trim(), r)

// Half-PPR points per (gsis_id, season). A drafted rookie absent from a
// season's stats file scores 0.0 — busts stay in the denominator.
const OUTCOME_SEASONS = range(LT_CLASSES[0] + 1, LT_CLASSES.at(-1) + 2)
const points = new Map()
for (const season of OUTCOME_SEASONS) {
  const csv = parseCsv(await fetchCached(
    `${NFLVERSE}/stats_player/stats_player_reg_${season}.csv`, `stats_player_reg_${season}.csv`))
  for (const r of csv) {
    const ppr = num(r.fantasy_points_ppr) ?? 0
    const rec = num(r.receptions) ?? 0
    points.set(`${r.player_id}|${season}`, ppr - 0.5 * rec)   // half PPR
  }
}
const pts = (gsis, season) => points.get(`${gsis}|${season}`) ?? 0

// Week-1 depth rank, the `depth_team` schema (all classes in AXIS_CLASSES).
async function weekOneDepth(season) {
  const csv = parseCsv(await fetchCached(
    `${NFLVERSE}/depth_charts/depth_charts_${season}.csv`, `depth_charts_${season}.csv`))
  const out = new Map()
  for (const r of csv) {
    if (r.week !== '1' || r.game_type !== 'REG' || r.formation !== 'Offense') continue
    if (!SKILL.has(r.position) || !r.gsis_id) continue
    const v = num(r.depth_team)
    if (v == null) continue
    if (!out.has(r.gsis_id) || v < out.get(r.gsis_id)) out.set(r.gsis_id, v)
  }
  return out
}

// ── Cohort ───────────────────────────────────────────────────────────────────
function buildRow(p) {
  const season = Number(p.season)
  const c = combineByPfr.get((p.pfr_player_id ?? '').trim())
  return {
    season,
    name: p.pfr_player_name,
    pos: p.position,
    pick: num(p.pick),
    age: num(p.age),
    forty: c ? num(c.forty) : null,
    vert: c ? num(c.vertical) : null,
    broad: c ? num(c.broad_jump) : null,
    gsis: p.gsis_id,
    y1: pts(p.gsis_id, season),
    y23: pts(p.gsis_id, season + 1) + pts(p.gsis_id, season + 2),
  }
}
const rows = picks.filter(p => LT_CLASSES.includes(Number(p.season))).map(buildRow)

console.log('=== cohort ===')
console.log(`  ${rows.length} drafted skill rookies, classes ${LT_CLASSES[0]}–${LT_CLASSES.at(-1)}`)
console.log('  outcome = half-PPR points in his 2nd + 3rd NFL seasons (absent from the')
console.log('            stats file = 0.0, so busts stay in the denominator)')
console.log('  coverage: ' + ['age', 'forty', 'vert', 'broad']
  .map(k => `${k} ${rows.filter(r => r[k] != null).length}/${rows.length}`).join('  '))
console.log('  NOTE: draft_picks.csv\'s career columns (games, w_av, rec_yards) are CAREER')
console.log('        TOTALS as of the file\'s last refresh, not season-scoped, so they leak')
console.log('        across the year-1 / years-2-3 boundary. Per-season stats are used instead.')

// ── Re-derive the shipped display baselines, and diff them ───────────────────
// These are DISPLAY constants (a measurable rendered as "elite / average for
// his position"), never score inputs — see the null in §3 below. They still
// have to be traceable to this script rather than hand-typed.
console.log('\n=== shipped COMBINE_BASELINE vs freshly measured ===')
console.log(`  population: every ${LT_CLASSES[0]}+ combine invitee at a skill position`)
let drift = 0
for (const pos of POSITIONS) {
  const g = combine.filter(r => r.pos === pos && Number(r.season) >= LT_CLASSES[0])
  const parts = []
  for (const [key, col] of Object.entries(COMBINE_DRILLS)) {
    const v = g.map(r => num(r[col])).filter(x => x != null)
    if (!v.length) { parts.push(`${key}:—`); continue }
    const m = mean(v), s = sd(v)
    const ship = COMBINE_BASELINE[pos]?.[key]
    if (!ship) { parts.push(`${key}:MISSING`); drift++; continue }
    const dm = m - ship.mean, ds = s - ship.sd
    if (Math.abs(dm) > 0.01 * Math.max(1, Math.abs(m)) || Math.abs(ds) > 0.05 * Math.max(0.1, s)) drift++
    parts.push(`${key} ${dm >= 0 ? '+' : ''}${dm.toFixed(2)}/${ds >= 0 ? '+' : ''}${ds.toFixed(2)} (n=${v.length})`)
  }
  console.log(`  ${pos}  ${parts.join('   ')}`)
}
console.log('\n=== shipped AGE_BASELINE vs freshly measured ===')
for (const pos of POSITIONS) {
  const v = rows.filter(r => r.pos === pos && r.age != null).map(r => r.age)
  const ship = AGE_BASELINE[pos]
  const dm = mean(v) - ship.mean, ds = sd(v) - ship.sd
  if (Math.abs(dm) > 0.05 || Math.abs(ds) > 0.05) drift++
  console.log(`  ${pos}  mean ${dm >= 0 ? '+' : ''}${dm.toFixed(2)}  sd ${ds >= 0 ? '+' : ''}${ds.toFixed(2)}  (n=${v.length})`)
}
console.log(drift === 0
  ? '  in sync — the shipped display baselines match this run'
  : `  ${drift} baseline(s) drifted — update src/utils/rookieResearch.js`)

// ── Scores under test ────────────────────────────────────────────────────────
// Age, mapped to 0..1 with YOUNGER = better, via the shipped z helper so the
// analysis and any future product use one definition. A missing age falls back
// to his position's mean (z = 0), which is the neutral read.
const ageScore = r => 0.5 + 0.25 * (ageAtDraftZ(r.pos, r.age) ?? 0)
// Athleticism: the mean of the available drill z-scores against his position's
// combine baseline, mapped to 0..1. Missing drills fall back to neutral.
function athScore(r) {
  const zs = []
  for (const key of Object.keys(COMBINE_DRILLS)) {
    const v = r[key]
    const b = COMBINE_BASELINE[r.pos]?.[key]
    if (v == null || !b?.sd) continue
    zs.push(b.higherIsBetter ? (v - b.mean) / b.sd : (b.mean - v) / b.sd)
  }
  if (!zs.length) return 0.5
  return Math.max(0, Math.min(1, 0.5 + 0.25 * mean(zs)))
}
for (const r of rows) { r.cap = capitalScore(r.pick); r.ageS = ageScore(r); r.athS = athScore(r) }

const longTerm = (r, wAge, wAth) => (1 - wAge - wAth) * r.cap + wAge * r.ageS + wAth * r.athS
const GRID = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]

console.log('\n=== 1. univariate Spearman vs years 2+3 half-PPR (pooled, in-sample) ===')
for (const [label, get] of [
  ['NFL draft capital        ', r => r.cap],
  ['age at draft (younger +) ', r => (r.age == null ? null : r.ageS)],
  ['combine athleticism      ', r => (r.forty == null && r.vert == null && r.broad == null ? null : r.athS)],
]) {
  const { rho, n } = spearman(rows.map(r => [get(r), r.y23]))
  console.log(`  ${label} rho=${rho >= 0 ? '+' : ''}${rho.toFixed(3)}  n=${n}`)
}
console.log('  collinearity with capital: ' +
  ['ageS', 'athS'].map(k => `${k} ${spearman(rows.map(r => [r[k], r.cap])).rho.toFixed(3)}`).join('  '))

// ── The gate: a clean temporal split ─────────────────────────────────────────
// EVERY choice — which inputs, what weight — is made on the training classes
// only. The test classes are never looked at while fitting.
const SPLIT = 2019
const train = rows.filter(r => r.season <= SPLIT)
const test = rows.filter(r => r.season > SPLIT)

function fitWeights(sample) {
  let best = { rho: -Infinity, wAge: 0, wAth: 0 }
  for (const wAge of GRID) for (const wAth of GRID) {
    if (wAge + wAth > 0.6) continue
    const { rho } = spearman(sample.map(r => [longTerm(r, wAge, wAth), r.y23]))
    if (rho > best.rho) best = { rho, wAge, wAth }
  }
  return best
}

console.log(`\n=== 2. THE GATE — fit on ${LT_CLASSES[0]}–${SPLIT}, test on ${SPLIT + 1}–${LT_CLASSES.at(-1)} ===`)
const fit = fitWeights(train)
console.log(`  weights chosen on the ${train.length} training rookies: ` +
  `capital ${(1 - fit.wAge - fit.wAth).toFixed(2)} · age ${fit.wAge.toFixed(2)} · athleticism ${fit.wAth.toFixed(2)}` +
  `  (train rho ${fit.rho.toFixed(3)})`)
const baseTest = spearman(test.map(r => [r.cap, r.y23])).rho
const ltTest = spearman(test.map(r => [longTerm(r, fit.wAge, fit.wAth), r.y23])).rho
console.log(`  HELD OUT (n=${test.length}):  capital alone ${baseTest.toFixed(3)}   long-term ${ltTest.toFixed(3)}` +
  `   delta ${ltTest - baseTest >= 0 ? '+' : ''}${(ltTest - baseTest).toFixed(4)}`)
for (const s of LT_CLASSES.filter(s => s > SPLIT)) {
  const g = test.filter(r => r.season === s)
  const a = spearman(g.map(r => [r.cap, r.y23])).rho
  const b = spearman(g.map(r => [longTerm(r, fit.wAge, fit.wAth), r.y23])).rho
  console.log(`    ${s} (n=${String(g.length).padStart(3)}):  capital ${a.toFixed(3)}   long-term ${b.toFixed(3)}` +
    `   ${b - a >= 0 ? '+' : ''}${(b - a).toFixed(3)}`)
}
console.log(`  GATE (as written in the build plan): long-term ${ltTest > baseTest ? 'BEATS' : 'DOES NOT BEAT'} capital alone out of sample.`)

console.log('\n  marginal value of ATHLETICISM, on the held-out classes:')
for (const wAth of [0, 0.05, 0.10, 0.15]) {
  const rho = spearman(test.map(r => [longTerm(r, fit.wAge, wAth), r.y23])).rho
  console.log(`    w_ath=${wAth.toFixed(2)}  test rho ${rho.toFixed(3)}`)
}

// ── The product gate: is there a SECOND AXIS at all? ─────────────────────────
console.log('\n=== 3. THE PRODUCT GATE — is the long-term ranking a different ranking? ===')
console.log(`  frame ${AXIS_CLASSES[0]}–${AXIS_CLASSES.at(-1)}; ${AXIS_CLASSES[0]}–2020 is entirely OUTSIDE`)
console.log('  the 2021–2025 window the shipped opportunity score was calibrated on.')
const depthByClass = new Map()
for (const s of AXIS_CLASSES) depthByClass.set(s, await weekOneDepth(s))
const axis = picks.filter(p => AXIS_CLASSES.includes(Number(p.season))).map(p => {
  const r = buildRow(p)
  r.rank = depthByClass.get(r.season).get(r.gsis) ?? null
  r.cap = capitalScore(r.pick)
  r.ageS = ageScore(r)
  r.athS = athScore(r)
  r.now = opportunityScore({ position: r.pos, rank: r.rank, pick: r.pick })
  r.long = longTerm(r, fit.wAge, fit.wAth)
  return r
})
console.log(`  n=${axis.length}, ${axis.filter(r => r.rank != null).length} located on a week-1 depth chart`)
console.log('\n  does each score win at its OWN outcome?')
console.log('                         vs YEAR-1 pts    vs YEARS 2+3 pts')
for (const [label, key] of [['capital alone ', 'cap'], ['impact-now (shipped)', 'now'], ['long-term (candidate)', 'long']]) {
  const a = spearman(axis.map(r => [r[key], r.y1])).rho
  const b = spearman(axis.map(r => [r[key], r.y23])).rho
  console.log(`    ${label.padEnd(22)} ${a >= 0 ? '+' : ''}${a.toFixed(3)}           ${b >= 0 ? '+' : ''}${b.toFixed(3)}`)
}
const axisRho = spearman(axis.map(r => [r.now, r.long])).rho
console.log(`\n  Spearman(impact-now, long-term) = ${axisRho.toFixed(3)}`)

// The two-axis product claims a rookie can be low on one axis and high on the
// other ("year-1 impact low, long-term upside elite — a taxi stash"). Count
// how many actually land there.
console.log('\n  joint distribution, both scores ranked into quartiles WITHIN each class:')
const cell = new Map()
let stash = 0, rental = 0
for (const s of AXIS_CLASSES) {
  const g = axis.filter(r => r.season === s)
  const q = (list, key) => {
    const m = new Map()
    ;[...list].sort((a, b) => b[key] - a[key]).forEach((r, i) => m.set(r, Math.min(3, Math.floor(4 * i / list.length))))
    return m
  }
  const nq = q(g, 'now'), lq = q(g, 'long')
  for (const r of g) {
    const k = `${nq.get(r)}|${lq.get(r)}`
    cell.set(k, (cell.get(k) ?? 0) + 1)
    if (nq.get(r) >= 2 && lq.get(r) === 0) stash++     // bottom half now, top quartile later
    if (nq.get(r) === 0 && lq.get(r) >= 2) rental++    // top quartile now, bottom half later
  }
}
console.log('        long Q1   Q2   Q3   Q4     (Q1 = best)')
for (let i = 0; i < 4; i++) {
  console.log(`    now Q${i + 1} ` + [0, 1, 2, 3].map(j => String(cell.get(`${i}|${j}`) ?? 0).padStart(5)).join(''))
}
console.log(`\n  "taxi stash" shaped (low now / high later): ${stash}/${axis.length}`)
console.log(`  "win-now rental" shaped (high now / low later): ${rental}/${axis.length}`)
console.log('  Those two quadrants ARE the two-axis product. If they are empty, the')
console.log('  second axis is the first axis wearing a different label.')

// ── Does age help ON TOP of what already ships? ──────────────────────────────
console.log('\n=== 4. does age at draft add anything ON TOP of the shipped score? ===')
const tilt = (r, w) => (1 - w) * r.now + w * r.ageS
for (const outcome of ['y1', 'y23']) {
  console.log(`  --- vs ${outcome === 'y1' ? 'YEAR 1' : 'YEARS 2+3'} ---`)
  for (const w of [0, 0.05, 0.10, 0.15, 0.20]) {
    const early = axis.filter(r => r.season <= 2020), late = axis.filter(r => r.season > 2020)
    const f = g => spearman(g.map(r => [tilt(r, w), r[outcome]])).rho.toFixed(3)
    console.log(`    w_age=${w.toFixed(2)}   ${AXIS_CLASSES[0]}–2020 ${f(early)} (n=${early.length})` +
      `   2021–${AXIS_CLASSES.at(-1)} ${f(late)} (n=${late.length})   pooled ${f(axis)}`)
  }
  const deltas = AXIS_CLASSES.map(s => {
    const g = axis.filter(r => r.season === s)
    return spearman(g.map(r => [tilt(r, 0.10), r[outcome]])).rho - spearman(g.map(r => [r.now, r[outcome]])).rho
  })
  const m = mean(deltas), t = m / (sd(deltas) / Math.sqrt(deltas.length - 1))
  console.log(`    per-class delta at w_age=0.10: mean ${m >= 0 ? '+' : ''}${m.toFixed(4)}  sd ${sd(deltas).toFixed(4)}` +
    `  t=${t >= 0 ? '+' : ''}${t.toFixed(2)}  improved ${deltas.filter(d => d > 0).length}/${deltas.length}`)
}
let moved5 = 0
for (const s of AXIS_CLASSES) {
  const g = axis.filter(r => r.season === s)
  const order = key => new Map([...g].sort((a, b) => b[key] - a[key]).map((r, i) => [r, i + 1]))
  const a = order('now')
  const b = new Map([...g].sort((x, y) => tilt(y, 0.10) - tilt(x, 0.10)).map((r, i) => [r, i + 1]))
  for (const r of g) if (Math.abs(a.get(r) - b.get(r)) >= 5) moved5++
}
console.log(`  a 0.10 age tilt moves ${moved5}/${axis.length} rookies >=5 spots within their class` +
  ` (Spearman with the shipped order ${spearman(axis.map(r => [r.now, tilt(r, 0.10)])).rho.toFixed(3)})`)

// ── Optional bootstrap ───────────────────────────────────────────────────────
if (process.argv.includes('--bootstrap')) {
  console.log('\n=== bootstrap over players, held-out classes only (fixed seed) ===')
  const rand = mulberry32(20260904)
  const B = 3000, ds = []
  for (let b = 0; b < B; b++) {
    const s = Array.from({ length: test.length }, () => test[Math.floor(rand() * test.length)])
    ds.push(spearman(s.map(r => [longTerm(r, fit.wAge, fit.wAth), r.y23])).rho -
            spearman(s.map(r => [r.cap, r.y23])).rho)
  }
  ds.sort((a, b) => a - b)
  console.log(`  long-term minus capital: mean ${mean(ds) >= 0 ? '+' : ''}${mean(ds).toFixed(4)}` +
    `  95% CI [${ds[Math.floor(0.025 * B)].toFixed(4)}, ${ds[Math.floor(0.975 * B)].toFixed(4)}]` +
    `  P(>0)=${(ds.filter(d => d > 0).length / B).toFixed(3)}`)
}

// ── Sanity check on the outcome definition ───────────────────────────────────
const hits = rows.filter(r => r.y23 >= HIT_POINTS).length
console.log(`\n=== sanity: ${hits}/${rows.length} (${(100 * hits / rows.length).toFixed(0)}%) of drafted skill rookies`)
console.log(`    cleared ${HIT_POINTS} combined half-PPR points in years 2+3 ===`)
