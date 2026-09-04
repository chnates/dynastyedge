#!/usr/bin/env node
// Dev/analysis tool. Runs ONLY from the `college-backtest` mode of
// .github/workflows/rookie-intel.yml, because it needs the CFBD_API_KEY secret
// and a repo secret is not readable from a dev machine or an agent session.
// Nothing in the app or the daily pipeline imports it.
//
// THE PHASE 3B GATE. docs/analysis/rookie-longterm-signals-2026-09.md stopped
// the two-axis rookie UI on a measured null: age and combine athleticism are
// both dominated by draft capital, so a "long-term" score built from them
// correlates 0.934 with the score already shipped, LOSES to it at predicting
// years 2-3 (+0.602 vs +0.632), and the "low impact now / high upside later"
// quadrant the product depends on held 0 rookies across nine classes.
//
// That memo named college production as the one untested candidate, and the
// reason it matters: dominator rating and breakout age are the only proposed
// inputs that are NOT a restatement of where a player was drafted. This script
// tests them, against the same outcome and the same held-out classes:
//
//   Q1  Does college production beat draft capital alone, out of sample?
//   Q2  Does it add anything ON TOP of the shipped opportunity score?
//   Q3  Does it finally produce a SEPARABLE second axis, or is it a third way
//       of saying "he was a high pick"?
//
// Q3 is the one that decides whether 3d gets revived. Q2 decides whether the
// shipped score should change at all. A null on both means college production
// ships as display context or not at all, and the two-axis question is closed.
//
// Like its siblings it IMPORTS THE SHIPPED CONSTANTS rather than
// reimplementing them, so the analysis and the product cannot drift apart.
//
// Join: CFBD's `playerId` on /stats/player/season IS the ESPN athlete id
// (verified run 33929992953, 2026-09-04: 12/12 named spot-checks correct,
// 5353/5364 distinct ids in ESPN's range). We reach it from
// draft_picks.pfr_player_id -> players.csv espn_id. NO NAME MATCHING.
//
// Usage (workflow input):  mode=college-backtest

import {
  capitalScore, opportunityScore,
} from '../../src/utils/rookieResearch.js'

const CFBD = 'https://api.collegefootballdata.com'
const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const KEY = (process.env.CFBD_API_KEY || '').trim()
const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// Same frame as the long-term memo: a class needs seasons S+1 and S+2 played.
const CLASSES = range(2013, 2023)
// A 2013 draftee's college career runs 2009-2012; a 2023 draftee's ends 2022.
const COLLEGE_YEARS = range(2009, 2022)
// Depth charts harmonize on the `depth_team` schema for these, and 2015-2020
// sits outside the 2021-2025 window the shipped score was calibrated on.
const AXIS_CLASSES = range(2015, 2023)
const SPLIT = 2019          // fit on <= SPLIT, test on > SPLIT
// The conventional WR breakout threshold. Reported, not tuned.
const BREAKOUT_DOMINATOR = 0.20

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i) }
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) }
const num = v => { const s = (v ?? '').toString().trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null }

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

async function cfbd(path) {
  const t0 = Date.now()
  const res = await fetch(`${CFBD}${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(90000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
  const body = await res.json()
  return { body, ms: Date.now() - t0 }
}
async function getText(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.text()
}
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
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

if (!KEY) { console.error('CFBD_API_KEY is empty or unset — aborting.'); process.exit(1) }

// ── 1. Cohort and outcomes, from nflverse ───────────────────────────────────
console.log('=== 1. cohort ===')
const picks = parseCsv(await getText(`${NFLVERSE}/draft_picks/draft_picks.csv`))
  .filter(r => SKILL.has(r.position) && r.gsis_id && CLASSES.includes(Number(r.season)))
const espnByPfr = new Map()
for (const p of parseCsv(await getText(`${NFLVERSE}/players/players.csv`))) {
  if (p.pfr_id?.trim() && p.espn_id?.trim()) espnByPfr.set(p.pfr_id.trim(), p.espn_id.trim())
}
const points = new Map()
for (const season of range(CLASSES[0] + 1, CLASSES.at(-1) + 2)) {
  for (const r of parseCsv(await getText(`${NFLVERSE}/stats_player/stats_player_reg_${season}.csv`))) {
    points.set(`${r.player_id}|${season}`, (num(r.fantasy_points_ppr) ?? 0) - 0.5 * (num(r.receptions) ?? 0))
  }
}
const pts = (g, s) => points.get(`${g}|${s}`) ?? 0

const rows = picks.map(p => {
  const season = Number(p.season)
  return {
    season, name: p.pfr_player_name, pos: p.position, pick: num(p.pick), age: num(p.age),
    gsis: p.gsis_id, espnId: espnByPfr.get((p.pfr_player_id || '').trim()) ?? null,
    y1: pts(p.gsis_id, season), y23: pts(p.gsis_id, season + 1) + pts(p.gsis_id, season + 2),
  }
})
console.log(`  ${rows.length} drafted skill rookies, ${CLASSES[0]}-${CLASSES.at(-1)}`)
console.log(`  ${rows.filter(r => r.espnId).length} carry an ESPN athlete id (the CFBD join key)`)
console.log('  outcome = half-PPR points in his 2nd + 3rd NFL seasons; absent = 0.0')

// ── 2. CFBD college production ──────────────────────────────────────────────
// One call per (year, category) returns the whole FBS. Rows are reduced to
// per-player and per-team aggregates immediately — the raw payloads are ~20k
// rows each and there is no reason to hold 15 years of them at once.
console.log(`\n=== 2. CFBD /stats/player/season, ${COLLEGE_YEARS[0]}-${COLLEGE_YEARS.at(-1)} ===`)
const prod = new Map()      // `${playerId}|${year}` -> {recYds,recTd,rushYds,rushTd,team,pos}
const teamTot = new Map()   // `${team}|${year}` -> {recYds,recTd,rushYds,rushTd}
const bump = (map, key, field, v) => {
  const cur = map.get(key) ?? { recYds: 0, recTd: 0, rushYds: 0, rushTd: 0 }
  cur[field] += v
  map.set(key, cur)
}
let cfbdCalls = 0
for (const year of COLLEGE_YEARS) {
  const counts = {}
  for (const category of ['receiving', 'rushing']) {
    let body
    try { ({ body } = await cfbd(`/stats/player/season?year=${year}&category=${category}`)); cfbdCalls++ }
    catch (err) { console.log(`  ${year} ${category}: FAILED (${err.message.slice(0, 90)})`); continue }
    counts[category] = body.length
    for (const r of body) {
      const stat = num(r.stat)
      if (stat == null) continue
      const yardField = category === 'receiving' ? 'recYds' : 'rushYds'
      const tdField = category === 'receiving' ? 'recTd' : 'rushTd'
      const field = r.statType === 'YDS' ? yardField : r.statType === 'TD' ? tdField : null
      if (!field) continue
      const pkey = `${r.playerId}|${year}`
      bump(prod, pkey, field, stat)
      const p = prod.get(pkey); p.team = r.team; p.pos = r.position
      bump(teamTot, `${r.team}|${year}`, field, stat)
    }
  }
  console.log(`  ${year}: receiving ${counts.receiving ?? 'x'} rows, rushing ${counts.rushing ?? 'x'} rows`)
}
console.log(`  ${cfbdCalls} CFBD calls, ${prod.size} player-seasons, ${teamTot.size} team-seasons`)

// Dominator rating: a player's share of his team's production. The standard
// receiving formulation is the mean of his yard share and his TD share. For
// RBs the same idea over rushing+receiving, since a back's college role is
// carries. Team totals come from the same payload — no extra call.
function dominatorFor(playerId, year, pos) {
  const p = prod.get(`${playerId}|${year}`)
  if (!p?.team) return null
  const t = teamTot.get(`${p.team}|${year}`)
  if (!t) return null
  const share = (a, b) => (b > 0 ? a / b : null)
  const parts = pos === 'RB'
    ? [share(p.rushYds + p.recYds, t.rushYds + t.recYds), share(p.rushTd + p.recTd, t.rushTd + t.recTd)]
    : [share(p.recYds, t.recYds), share(p.recTd, t.recTd)]
  const ok = parts.filter(x => x != null)
  return ok.length ? mean(ok) : null
}

// ── 3. Attach to the cohort, and report coverage honestly ───────────────────
console.log('\n=== 3. coverage — how much of each class CFBD actually covers ===')
for (const r of rows) {
  r.cap = capitalScore(r.pick)
  r.domFinal = null; r.domBest = null; r.breakoutAge = null
  if (!r.espnId) continue
  const seasons = []
  for (let y = r.season - 5; y <= r.season - 1; y++) {
    const d = dominatorFor(r.espnId, y, r.pos)
    if (d != null) seasons.push({ year: y, dom: d })
  }
  if (!seasons.length) continue
  r.domFinal = seasons.at(-1).dom
  r.domBest = Math.max(...seasons.map(s => s.dom))
  // Breakout age: how young he was the first time he cleared the threshold.
  // age at a college season = age at the draft minus the years between.
  const first = seasons.find(s => s.dom >= BREAKOUT_DOMINATOR)
  if (first && r.age != null) r.breakoutAge = r.age - (r.season - first.year)
}
for (const c of CLASSES) {
  const g = rows.filter(r => r.season === c)
  const withDom = g.filter(r => r.domFinal != null).length
  console.log(`  ${c}: ${String(withDom).padStart(3)}/${String(g.length).padStart(3)} with a dominator ` +
    `(${Math.round(100 * withDom / g.length)}%)`)
}
const covered = rows.filter(r => r.domFinal != null)
console.log(`  TOTAL ${covered.length}/${rows.length} (${Math.round(100 * covered.length / rows.length)}%)`)
console.log('  misses are FCS/non-FBS players and transfers CFBD does not carry — a real,')
console.log('  permanent limitation, not a matching failure (the join is by ID).')
for (const pos of POSITIONS) {
  const g = rows.filter(r => r.pos === pos)
  console.log(`    ${pos}: ${g.filter(r => r.domFinal != null).length}/${g.length}` +
    `  median final dominator ${(() => {
      const v = g.map(r => r.domFinal).filter(x => x != null).sort((a, b) => a - b)
      return v.length ? v[v.length >> 1].toFixed(3) : '—'
    })()}`)
}

// ── 4. Q1 — univariate, and against capital alone out of sample ─────────────
console.log('\n=== 4. Q1: does college production beat draft capital alone? ===')
console.log('  univariate Spearman vs years 2+3 (pooled, in-sample):')
for (const [label, get] of [
  ['draft capital       ', r => r.cap],
  ['final-season dominator', r => r.domFinal],
  ['best-season dominator ', r => r.domBest],
  ['breakout age (younger+)', r => (r.breakoutAge == null ? null : -r.breakoutAge)],
]) {
  const { rho, n } = spearman(rows.map(r => [get(r), r.y23]))
  console.log(`    ${label}  rho=${rho >= 0 ? '+' : ''}${rho.toFixed(3)}  n=${n}`)
}
console.log('  collinearity with capital: ' +
  ['domFinal', 'domBest'].map(k => `${k} ${spearman(rows.map(r => [r[k], r.cap])).rho.toFixed(3)}`).join('  '))

// A missing dominator falls back to the cohort median, the neutral read, so
// the comparison is over the SAME players as the capital-only baseline.
const medDom = (() => {
  const v = covered.map(r => r.domFinal).sort((a, b) => a - b)
  return v[v.length >> 1]
})()
const withCollege = (r, w, key = 'domBest') => (1 - w) * r.cap + w * (r[key] ?? medDom)
const GRID = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40]

const train = rows.filter(r => r.season <= SPLIT)
const test = rows.filter(r => r.season > SPLIT)
let bestW = 0, bestRho = -Infinity
for (const w of GRID) {
  const { rho } = spearman(train.map(r => [withCollege(r, w), r.y23]))
  if (rho > bestRho) { bestRho = rho; bestW = w }
}
const capTest = spearman(test.map(r => [r.cap, r.y23])).rho
const colTest = spearman(test.map(r => [withCollege(r, bestW), r.y23])).rho
console.log(`\n  weight chosen on ${train.length} training rookies (<=${SPLIT}): w_college=${bestW.toFixed(2)} (train rho ${bestRho.toFixed(3)})`)
console.log(`  HELD OUT >${SPLIT} (n=${test.length}): capital ${capTest.toFixed(3)}  +college ${colTest.toFixed(3)}` +
  `  delta ${colTest - capTest >= 0 ? '+' : ''}${(colTest - capTest).toFixed(4)}`)
for (const c of CLASSES.filter(c => c > SPLIT)) {
  const g = test.filter(r => r.season === c)
  const a = spearman(g.map(r => [r.cap, r.y23])).rho
  const b = spearman(g.map(r => [withCollege(r, bestW), r.y23])).rho
  console.log(`    ${c} (n=${String(g.length).padStart(3)}): ${a.toFixed(3)} -> ${b.toFixed(3)}  ${b - a >= 0 ? '+' : ''}${(b - a).toFixed(3)}`)
}

// ── 5. Q2 — on top of the SHIPPED score (needs the week-1 depth chart) ──────
console.log('\n=== 5. Q2: does it add anything ON TOP of the shipped opportunity score? ===')
const depthByClass = new Map()
for (const season of AXIS_CLASSES) {
  const csv = parseCsv(await getText(`${NFLVERSE}/depth_charts/depth_charts_${season}.csv`))
  const out = new Map()
  for (const r of csv) {
    if (r.week !== '1' || r.game_type !== 'REG' || r.formation !== 'Offense') continue
    if (!SKILL.has(r.position) || !r.gsis_id) continue
    const v = num(r.depth_team)
    if (v == null) continue
    if (!out.has(r.gsis_id) || v < out.get(r.gsis_id)) out.set(r.gsis_id, v)
  }
  depthByClass.set(season, out)
}
const axis = rows.filter(r => AXIS_CLASSES.includes(r.season)).map(r => ({
  ...r,
  rank: depthByClass.get(r.season).get(r.gsis) ?? null,
  now: opportunityScore({ position: r.pos, rank: depthByClass.get(r.season).get(r.gsis) ?? null, pick: r.pick }),
}))
console.log(`  n=${axis.length}, ${axis.filter(r => r.rank != null).length} on a week-1 depth chart`)
const tilt = (r, w) => (1 - w) * r.now + w * (r.domBest ?? medDom)
for (const outcome of ['y1', 'y23']) {
  console.log(`  --- vs ${outcome === 'y1' ? 'YEAR 1' : 'YEARS 2+3'} ---`)
  for (const w of [0, 0.05, 0.10, 0.15, 0.20, 0.30]) {
    const early = axis.filter(r => r.season <= 2020), late = axis.filter(r => r.season > 2020)
    const f = g => spearman(g.map(r => [tilt(r, w), r[outcome]])).rho.toFixed(3)
    console.log(`    w_college=${w.toFixed(2)}   ${AXIS_CLASSES[0]}-2020 ${f(early)}   2021-${AXIS_CLASSES.at(-1)} ${f(late)}   pooled ${f(axis)}`)
  }
  const deltas = AXIS_CLASSES.map(c => {
    const g = axis.filter(r => r.season === c)
    return spearman(g.map(r => [tilt(r, 0.15), r[outcome]])).rho - spearman(g.map(r => [r.now, r[outcome]])).rho
  })
  const m = mean(deltas), t = m / (sd(deltas) / Math.sqrt(deltas.length - 1))
  console.log(`    per-class delta at w=0.15: mean ${m >= 0 ? '+' : ''}${m.toFixed(4)}  t=${t >= 0 ? '+' : ''}${t.toFixed(2)}` +
    `  improved ${deltas.filter(d => d > 0).length}/${deltas.length}`)
}

// ── 6. Q3 — is THIS finally a separable second axis? ────────────────────────
console.log('\n=== 6. Q3: a separable second axis, or capital in a third costume? ===')
const longTerm = r => 0.5 * r.cap + 0.5 * (r.domBest ?? medDom)
for (const r of axis) r.long = longTerm(r)
console.log('                          vs YEAR-1 pts    vs YEARS 2+3 pts')
for (const [label, key] of [['capital alone', 'cap'], ['impact-now (shipped)', 'now'], ['long-term (+college)', 'long']]) {
  const a = spearman(axis.map(r => [r[key], r.y1])).rho
  const b = spearman(axis.map(r => [r[key], r.y23])).rho
  console.log(`    ${label.padEnd(22)} ${a >= 0 ? '+' : ''}${a.toFixed(3)}           ${b >= 0 ? '+' : ''}${b.toFixed(3)}`)
}
console.log(`\n  Spearman(impact-now, long-term) = ${spearman(axis.map(r => [r.now, r.long])).rho.toFixed(3)}`)
console.log('  (age + athleticism managed 0.934 — near-duplicate. Lower is the point.)')
const cell = new Map()
let stash = 0, rental = 0
for (const c of AXIS_CLASSES) {
  const g = axis.filter(r => r.season === c)
  const q = key => {
    const m = new Map()
    ;[...g].sort((a, b) => b[key] - a[key]).forEach((r, i) => m.set(r, Math.min(3, Math.floor(4 * i / g.length))))
    return m
  }
  const nq = q('now'), lq = q('long')
  for (const r of g) {
    const k = `${nq.get(r)}|${lq.get(r)}`
    cell.set(k, (cell.get(k) ?? 0) + 1)
    if (nq.get(r) >= 2 && lq.get(r) === 0) stash++
    if (nq.get(r) === 0 && lq.get(r) >= 2) rental++
  }
}
console.log('\n  joint quartiles within class:')
console.log('        long Q1   Q2   Q3   Q4')
for (let i = 0; i < 4; i++) {
  console.log(`    now Q${i + 1} ` + [0, 1, 2, 3].map(j => String(cell.get(`${i}|${j}`) ?? 0).padStart(5)).join(''))
}
console.log(`\n  "taxi stash" shaped (low now / high later): ${stash}/${axis.length}`)
console.log(`  "win-now rental" shaped (high now / low later): ${rental}/${axis.length}`)
console.log('  Age + athleticism produced 0 and 2 of 712. If these are also ~0, the')
console.log('  two-axis question is closed for good and 3d stays dead.')
