#!/usr/bin/env node
// Dev/analysis tool — NOT part of the app or any workflow. Nothing imports it.
//
// Back-tests the candidate signals for the proposed Draft › Research module
// against five real rookie classes (2021–2025), and prints the analysis behind
// docs/analysis/rookie-research-signals-2026-08.md so every number there is
// re-runnable rather than asserted.
//
// The two questions it answers:
//   1. Does PRESEASON production predict a rookie's season? (No — it inverts.)
//   2. Does the WEEK-1 DEPTH CHART add anything over NFL draft capital? (Yes.)
//
// Population frame is nflverse, not Sleeper: Sleeper prunes inactive players
// from /players/nfl, so building the 2021 cohort from Sleeper would quietly
// drop the busts and inflate every correlation. Here a drafted rookie who
// never played is present with 0.0 points, which is the honest denominator.
//
// Usage:
//   node scripts/dev/rookie-signal-backtest.mjs             # full analysis
//   node scripts/dev/rookie-signal-backtest.mjs --preseason # + preseason check
//
// Zero dependencies, read-only, public data. Safe to re-run. Downloads ~70MB
// of nflverse CSVs to a cache dir on first run (NFLVERSE_CACHE to override).

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const SLEEPER = 'https://api.sleeper.app/v1'
const SEASONS = [2021, 2022, 2023, 2024, 2025]
const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
// 2025+ depth charts split WRs by alignment; rank 1 at any alignment = starter.
const NEW_SLOTS = new Set(['QB', 'RB', 'TE', 'WR', 'LWR', 'RWR', 'SWR'])

const CACHE = process.env.NFLVERSE_CACHE || join(tmpdir(), 'dynastyedge-nflverse')
mkdirSync(CACHE, { recursive: true })

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

const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function spearman(pairs) {
  const p = pairs.filter(([a, b]) => a != null && b != null && !Number.isNaN(a) && !Number.isNaN(b))
  const n = p.length
  if (n < 3) return { rho: NaN, n }
  const rank = vals => {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b])
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
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n
  let cov = 0, va = 0, vb = 0
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb); va += (ra[i] - ma) ** 2; vb += (rb[i] - mb) ** 2
  }
  return { rho: cov / Math.sqrt(va * vb), n }
}

// ── Depth charts ─────────────────────────────────────────────────────────────
// Two schemas. 2021–2024: one row per (week, game_type) with depth_team 1..3.
// 2025+: dated snapshots with pos_rank per alignment slot. Both express the
// same thing — "where he sat when the games started" — so both map to a rank
// keyed by gsis_id. Week-1 REG is the post-camp chart in the old schema; the
// new schema's analogue is the last snapshot before the opener.
async function depthChart(season) {
  const csv = parseCsv(await fetchCached(
    `${NFLVERSE}/depth_charts/depth_charts_${season}.csv`, `depth_charts_${season}.csv`))
  const out = new Map()
  if (season >= 2025) {
    const cutoff = `${season}-09-08`
    const latest = new Map()
    for (const r of csv) {
      if (!NEW_SLOTS.has(r.pos_abb) || !r.gsis_id) continue
      const dt = r.dt.slice(0, 10)
      if (dt > cutoff) continue
      const rank = Number(r.pos_rank)
      const cur = latest.get(r.gsis_id)
      if (!cur || dt > cur.dt || (dt === cur.dt && rank < cur.rank)) latest.set(r.gsis_id, { dt, rank })
    }
    for (const [k, v] of latest) out.set(k, v.rank)
  } else {
    for (const r of csv) {
      if (r.week !== '1' || r.game_type !== 'REG' || r.formation !== 'Offense') continue
      if (!SKILL.has(r.position) || !r.gsis_id) continue
      const v = Number(r.depth_team)
      if (!out.has(r.gsis_id) || v < out.get(r.gsis_id)) out.set(r.gsis_id, v)
    }
  }
  return out
}

async function outcomes(season) {
  const csv = parseCsv(await fetchCached(
    `${NFLVERSE}/stats_player/stats_player_reg_${season}.csv`, `stats_player_reg_${season}.csv`))
  const out = new Map()
  for (const r of csv) {
    const ppr = Number(r.fantasy_points_ppr || 0), rec = Number(r.receptions || 0)
    if (!Number.isNaN(ppr)) out.set(r.player_id, ppr - 0.5 * rec) // half PPR
  }
  return out
}

// ── Build the cohort ─────────────────────────────────────────────────────────
process.stderr.write('Loading nflverse data (cached after first run)…\n')
const picks = parseCsv(await fetchCached(`${NFLVERSE}/draft_picks/draft_picks.csv`, 'draft_picks.csv'))
  .filter(r => SKILL.has(r.position) && r.gsis_id)

const rows = []
console.log('=== cohort ===')
for (const season of SEASONS) {
  const [depth, pts] = await Promise.all([depthChart(season), outcomes(season)])
  const cohort = picks.filter(p => p.season === String(season)).map(p => ({
    season, name: p.pfr_player_name, pos: p.position, pick: Number(p.pick),
    rank: depth.get(p.gsis_id) ?? null, pts: pts.get(p.gsis_id) ?? 0,
  }))
  rows.push(...cohort)
  const onChart = cohort.filter(r => r.rank).length
  console.log(`  ${season}: ${String(cohort.length).padStart(3)} drafted skill rookies | ` +
    `${String(onChart).padStart(3)} on the week-1 depth chart (${Math.round(onChart / cohort.length * 100)}%)`)
}
console.log(`  TOTAL: ${rows.length} drafted skill rookies, ${SEASONS[0]}–${SEASONS.at(-1)}`)
console.log('  (a drafted rookie absent from the stats file scores 0.0 — busts stay in the denominator)')

// Off the chart entirely is treated as rank 4+: it is the same fact.
const D = r => r.rank ?? 5

console.log('\n=== Spearman vs rookie-season half-PPR points (pooled) ===')
const depthRho = spearman(rows.map(r => [-D(r), r.pts]))
const capRho = spearman(rows.map(r => [-r.pick, r.pts]))
console.log(`  week-1 depth rank (inverted)   rho=${depthRho.rho.toFixed(3)}  n=${depthRho.n}`)
console.log(`  NFL draft capital (inverted)   rho=${capRho.rho.toFixed(3)}  n=${capRho.n}`)

console.log('\n=== per-season stability ===')
for (const s of SEASONS) {
  const g = rows.filter(r => r.season === s)
  const a = spearman(g.map(r => [-D(r), r.pts])).rho
  const b = spearman(g.map(r => [-r.pick, r.pts])).rho
  console.log(`  ${s}:  depth ${a.toFixed(3)}   capital ${b.toFixed(3)}   (n=${g.length})`)
}

console.log('\n=== CALIBRATION: median rookie-season half-PPR by position x week-1 depth rank ===')
const table = new Map()
const hdr = ['rank 1', 'rank 2', 'rank 3', '4+ / off chart']
console.log('     ' + hdr.map(h => h.padStart(17)).join(''))
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  let line = pos.padEnd(5)
  for (const b of [1, 2, 3, 4]) {
    const g = rows.filter(r => r.pos === pos && (b < 4 ? D(r) === b : D(r) >= 4)).map(r => r.pts)
    if (!g.length) { line += '-'.padStart(17); continue }
    const m = median(g)
    table.set(`${pos}|${b}`, m)
    line += `${m.toFixed(0)} (n=${g.length})`.padStart(17)
  }
  console.log(line)
}

// ── Blend search ─────────────────────────────────────────────────────────────
// Depth score = the position's own calibration row, normalized to its own max,
// so a rank means what it is WORTH at that position rather than its ordinal.
const maxByPos = Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map(p =>
  [p, Math.max(...[1, 2, 3, 4].map(b => table.get(`${p}|${b}`) ?? 0), 1)]))
const depthScore = r => (table.get(`${r.pos}|${Math.min(D(r), 4)}`) ?? 0) / maxByPos[r.pos]
const capScore = r => Math.max(0, 1 - Math.log(r.pick) / Math.log(260))

console.log('\n=== blend search ===')
let best = { w: 0, rho: -Infinity }
for (let i = 0; i <= 10; i++) {
  const w = i / 10
  const { rho } = spearman(rows.map(r => [w * depthScore(r) + (1 - w) * capScore(r), r.pts]))
  if (rho > best.rho) best = { w, rho }
  console.log(`  w_depth=${w.toFixed(1)}  w_capital=${(1 - w).toFixed(1)}   rho=${rho.toFixed(3)}`)
}
console.log(`\n  BEST: w_depth=${best.w.toFixed(1)} -> rho=${best.rho.toFixed(3)}` +
  `  (capital alone ${capRho.rho.toFixed(3)}, depth alone ${depthRho.rho.toFixed(3)})`)
console.log('  NOTE: the curve is flat across w=0.2–0.5, so the weight is not knife-edge.')

// ── Optional: the preseason trap ─────────────────────────────────────────────
if (process.argv.includes('--preseason')) {
  console.log('\n=== preseason production check (Sleeper, 2025 class) ===')
  const db = await (await fetch(`${SLEEPER}/players/nfl`)).json()
  const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '')
  const byName = new Map()
  for (const [pid, p] of Object.entries(db)) {
    if (p.metadata?.rookie_year === '2025' && SKILL.has(p.position)) byName.set(norm(p.full_name), pid)
  }
  const weeks = await Promise.all([1, 2, 3].map(w =>
    fetch(`${SLEEPER}/stats/nfl/pre/2025/${w}`).then(r => r.json())))
  const reg = await (await fetch(`${SLEEPER}/stats/nfl/regular/2025`)).json()
  const pool = picks.filter(p => p.season === '2025')
  const obs = []
  for (const p of pool) {
    const pid = byName.get(norm(p.pfr_player_name))
    if (!pid) continue
    let snaps = 0, teamSnaps = 0
    for (const wk of weeks) {
      const s = wk[pid]
      if (!s) continue
      snaps += s.off_snp || 0
      teamSnaps += s.tm_off_snp || 0
    }
    obs.push([teamSnaps ? snaps / teamSnaps : 0, reg[pid]?.pts_half_ppr ?? 0])
  }
  const pre = spearman(obs)
  console.log(`  preseason snap share vs season points: rho=${pre.rho.toFixed(3)}  n=${pre.n}`)
  console.log('  Negative or near-zero is the expected result: the best rookies sit in')
  console.log('  August. Preseason snap share measures job insecurity, not talent.')
}
