// odds-calibration-backtest.mjs — ANALYSIS ONLY. Nothing in src/ imports this.
//
// Answers open-items §0 #11 (OPEN-5, first half), as pre-registered in
// docs/analysis/playoff-odds-calibration-2026-10.md §2:
//
//   A. PLAYOFF ODDS — replay every completed season (2023–25) through the
//      app's own buildPlayoffOutlook, one cutoff week at a time, and score the
//      predictions against each season's real winners bracket. Brier vs two
//      baselines (always-60%, and record-only), a reliability table, and the
//      Buyer / bubble / Seller labels' hit rates.
//   B. LINEUP CONFIDENCE — rebuild the shipped CONFIDENCE_CURVE's pairs on
//      2026's completed weeks (a season the curve has never seen) and compare
//      bin by bin.
//
// It reads LEAGUE_ID / SLEEPER_BASE from src/constants.js and the model from
// src/utils, so the league, the endpoints and the model cannot drift.
//
// Run:
//   node --import ./scripts/register.mjs scripts/dev/odds-calibration-backtest.mjs            # live (cached under .cache/)
//   node --import ./scripts/register.mjs scripts/dev/odds-calibration-backtest.mjs --freeze   # live, then write the frozen inputs
//   node --import ./scripts/register.mjs scripts/dev/odds-calibration-backtest.mjs --frozen   # REPRODUCE the 2026-10 report
//
// Why freeze: past seasons are settled, but Sleeper rewrites projections in
// place (optimizer study R3) and the player DB moves, so the 2026 lineup rows
// are frozen as they were read.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { SLEEPER_BASE, LEAGUE_ID } from '../../src/constants.js'
import { BUYER_PCT, SELLER_PCT, ODDS_TRACK_RECORD } from '../../src/utils/playoffOdds.js'
import { PRIMARY_WINDOW, replaySeasons, standingsAgree, trackRecord } from './oddsReplay.mjs'
import { CONFIDENCE_CURVE } from '../../src/utils/lineupConfidence.js'

const CACHE = '.cache/odds-calibration'
const FROZEN_FILE = 'docs/analysis/data/odds-calibration-2026-10.json.gz'
const FROZEN = process.argv.includes('--frozen')
const FREEZE = process.argv.includes('--freeze')
const PRIMARY = PRIMARY_WINDOW    // cutoffs k = 2..12 — the trade-deadline window
const BOOT = 10000
const FLEX = new Set(['RB', 'WR', 'TE'])
const STARTABLE = 5               // same as optimizer-signal-backtest.mjs §3

// ── data ────────────────────────────────────────────────────────────────────
async function get(url, key) {
  fs.mkdirSync(CACHE, { recursive: true })
  const file = path.join(CACHE, `${key}.json`)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const json = await res.json()
  fs.writeFileSync(file, JSON.stringify(json))
  return json
}

async function loadLive() {
  const current = await get(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, `league_${LEAGUE_ID}`)
  const seasons = []
  let prev = current.previous_league_id
  while (prev && prev !== '0' && seasons.length < 8) {
    const lg = await get(`${SLEEPER_BASE}/league/${prev}`, `league_${prev}`)
    const last = (lg.settings?.playoff_week_start ?? 15) - 1
    const perWeek = []
    for (let w = 1; w <= last; w++) {
      const entries = await get(`${SLEEPER_BASE}/league/${prev}/matchups/${w}`, `mu_${prev}_${w}`)
      perWeek.push({ week: w, entries: (entries ?? []).map(e => ({ roster_id: e.roster_id, matchup_id: e.matchup_id, points: e.points })) })
    }
    const bracket = await get(`${SLEEPER_BASE}/league/${prev}/winners_bracket`, `wb_${prev}`)
    const rosters = await get(`${SLEEPER_BASE}/league/${prev}/rosters`, `ro_${prev}`)
    seasons.push({
      season: lg.season, leagueId: prev,
      playoffTeams: lg.settings?.playoff_teams ?? 6,
      rosterIds: rosters.map(r => r.roster_id),
      bracket: bracket.map(({ r, m, t1, t2, w, l, p }) => ({ r, m, t1, t2, w, l, p })),
      perWeek,
    })
    prev = lg.previous_league_id
  }

  // Lineup rows: this season's completed weeks only.
  const state = await get(`${SLEEPER_BASE}/state/nfl`, `state_${new Date().toISOString().slice(0, 10)}`)
  const year = Number(state.season)
  const lastDone = (current.settings?.last_scored_leg ?? 0)
  const players = await get(`${SLEEPER_BASE}/players/nfl`, 'players')
  const lineupRows = []
  for (let w = 1; w <= lastDone; w++) {
    const S = await get(`${SLEEPER_BASE}/stats/nfl/regular/${year}/${w}`, `stats_${year}_${w}`)
    const P = await get(`${SLEEPER_BASE}/projections/nfl/regular/${year}/${w}`, `proj_${year}_${w}`)
    for (const id of Object.keys(P)) {
      if (id.startsWith('TEAM_')) continue
      const pos = players[id]?.position
      if (!FLEX.has(pos)) continue
      const proj = P[id]?.pts_half_ppr, act = S[id]?.pts_half_ppr
      if (proj == null || act == null) continue
      lineupRows.push({ w, id, pos, proj, act })
    }
  }
  return { readAt: new Date().toISOString(), lineupSeason: year, lineupWeeks: lastDone, seasons, lineupRows }
}

const data = FROZEN
  ? JSON.parse(zlib.gunzipSync(fs.readFileSync(FROZEN_FILE)).toString())
  : await loadLive()
if (FREEZE) {
  fs.writeFileSync(FROZEN_FILE, zlib.gzipSync(JSON.stringify(data)))
  console.log(`frozen inputs written: ${FROZEN_FILE}`)
}
console.log(`inputs read ${data.readAt}${FROZEN ? ' (frozen)' : ''}\n`)

// ── helpers ─────────────────────────────────────────────────────────────────
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const brier = ps => ps.reduce((s, p) => s + (p.pred - p.made) ** 2, 0) / ps.length
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`
function wilson(hits, n, z = 1.96) {
  if (!n) return [null, null]
  const p = hits / n, den = 1 + z * z / n
  const c = (p + z * z / (2 * n)) / den
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
  return [c - h, c + h]
}
// Bootstrap over team-seasons: one outcome serves every cutoff of a team's
// season, so the team-season is the independent unit, never the team-week.
function blockBootstrapDiff(preds, keyA, keyB, seed = 0x0dd5) {
  const blocks = new Map()
  for (const p of preds) {
    const k = `${p.season}|${p.rosterId}`
    if (!blocks.has(k)) blocks.set(k, [])
    blocks.get(k).push(p)
  }
  const list = [...blocks.values()]
  const rng = mulberry32(seed)
  const diffs = []
  for (let b = 0; b < BOOT; b++) {
    let sa = 0, sb = 0, n = 0
    for (let i = 0; i < list.length; i++) {
      for (const p of list[Math.floor(rng() * list.length)]) {
        sa += (p[keyA] - p.made) ** 2; sb += (p[keyB] - p.made) ** 2; n++
      }
    }
    diffs.push((sa - sb) / n)
  }
  diffs.sort((x, y) => x - y)
  return [diffs[Math.floor(0.025 * BOOT)], diffs[Math.floor(0.975 * BOOT)]]
}

// ── A. playoff odds ─────────────────────────────────────────────────────────
console.log('A. PLAYOFF ODDS — walk-forward replay through buildPlayoffOutlook')
for (const s of [...data.seasons].sort((a, b) => a.season - b.season)) {
  const c = standingsAgree(s)
  console.log(`  ${s.season}: ${c.completedWeeks} completed weeks · bracket field [${c.field.join(', ')}]` +
    ` · rebuilt standings ${c.agree ? 'AGREE' : `DISAGREE [${c.rebuilt.join(', ')}]`}`)
}
const preds = replaySeasons(data.seasons)

const prim = preds.filter(p => p.k >= PRIMARY[0] && p.k <= PRIMARY[1])
console.log(`\n  primary window (after Week ${PRIMARY[0]} … after Week ${PRIMARY[1]}): ${prim.length} predictions, ` +
  `${new Set(prim.map(p => `${p.season}|${p.rosterId}`)).size} team-seasons`)
const bM = brier(prim), bC = brier(prim.map(p => ({ ...p, pred: p.clim }))), bR = brier(prim.map(p => ({ ...p, pred: p.recordOnly })))
const ciC = blockBootstrapDiff(prim, 'pred', 'clim')
const ciR = blockBootstrapDiff(prim, 'pred', 'recordOnly')
console.log(`  Brier  model ${bM.toFixed(4)} · always-60% ${bC.toFixed(4)} · record-only ${bR.toFixed(4)}`)
console.log(`  Q1 model − always-60%:  ${(bM - bC).toFixed(4)}  95% CI [${ciC[0].toFixed(4)}, ${ciC[1].toFixed(4)}]  → ${bM < bC && ciC[1] < 0 ? 'PASS' : 'FAIL'}`)
console.log(`  Q2 model − record-only: ${(bM - bR).toFixed(4)}  95% CI [${ciR[0].toFixed(4)}, ${ciR[1].toFixed(4)}]  → ${bM < bR && ciR[1] < 0 ? 'PASS' : 'FAIL'}`)
console.log('     (intervals: bootstrap over team-seasons, 10,000 resamples)')

console.log('\n  Q3 reliability (primary window; Wilson intervals are naive — team-weeks are correlated)')
console.log('     bucket      n   avg pred   made    95% interval   covers?')
const BUCKETS = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0001]]
for (const [lo, hi] of BUCKETS) {
  const b = prim.filter(p => p.pred >= lo && p.pred < hi)
  if (!b.length) { console.log(`     ${pct(lo, 0)}–${pct(Math.min(hi, 1), 0)}    0`); continue }
  const avg = b.reduce((s, p) => s + p.pred, 0) / b.length
  const hits = b.reduce((s, p) => s + p.made, 0)
  const [l, u] = wilson(hits, b.length)
  console.log(`     ${`${pct(lo, 0)}–${pct(Math.min(hi, 1), 0)}`.padEnd(10)}${String(b.length).padStart(4)}   ${pct(avg).padStart(6)}   ${pct(hits / b.length).padStart(6)}   ${pct(l, 0).padStart(4)}–${pct(u, 0).padEnd(5)}    ${avg >= l && avg <= u ? 'yes' : (avg > u ? 'NO — model too high' : 'NO — model too low')}`)
}

console.log('\n  Q4 the advice labels (primary window)')
for (const [name, test] of [
  [`Buyer (≥ ${pct(BUYER_PCT, 0)})`, p => p.pred >= BUYER_PCT],
  ['On the bubble', p => p.pred >= SELLER_PCT && p.pred < BUYER_PCT],
  [`Seller (< ${pct(SELLER_PCT, 0)})`, p => p.pred < SELLER_PCT],
]) {
  const b = prim.filter(test), hits = b.reduce((s, p) => s + p.made, 0)
  const [l, u] = wilson(hits, b.length)
  const avg = b.reduce((s, p) => s + p.pred, 0) / b.length
  console.log(`     ${name.padEnd(16)} n ${String(b.length).padStart(3)} · avg pred ${pct(avg)} · made it ${pct(hits / b.length)} (${pct(l, 0)}–${pct(u, 0)})`)
}

console.log('\n  Brier by cutoff (all seasons) — model / always-60% / record-only')
for (let k = 0; k <= 13; k++) {
  const b = preds.filter(p => p.k === k)
  if (!b.length) continue
  console.log(`     after Week ${String(k).padStart(2)}: ${brier(b).toFixed(3)} / ${brier(b.map(p => ({ ...p, pred: p.clim }))).toFixed(3)} / ${brier(b.map(p => ({ ...p, pred: p.recordOnly }))).toFixed(3)}`)
}
console.log('\n  Brier by season (primary window) — model / always-60% / record-only')
for (const season of [...new Set(prim.map(p => p.season))]) {
  const b = prim.filter(p => p.season === season)
  console.log(`     ${season}: ${brier(b).toFixed(3)} / ${brier(b.map(p => ({ ...p, pred: p.clim }))).toFixed(3)} / ${brier(b.map(p => ({ ...p, pred: p.recordOnly }))).toFixed(3)}`)
}

// The figures the Playoffs page publishes. ODDS_TRACK_RECORD in
// src/utils/playoffOdds.js must equal this (tests/oddsTrackRecord.test.mjs).
const tr = trackRecord(preds)
console.log('\n  ODDS_TRACK_RECORD (paste into src/utils/playoffOdds.js — never hand-edit):')
console.log('  ' + JSON.stringify(tr))
console.log(`  shipped constant ${JSON.stringify(tr) === JSON.stringify(ODDS_TRACK_RECORD) ? 'MATCHES' : 'DIFFERS — regenerate it'}`)

// ── B. lineup confidence ────────────────────────────────────────────────────
console.log(`\n\nB. LINEUP CONFIDENCE — ${data.lineupSeason} Weeks 1–${data.lineupWeeks} vs the shipped curve (2022–25)`)
const byWeek = new Map()
for (const r of data.lineupRows) {
  if (r.proj < STARTABLE) continue
  if (!byWeek.has(r.w)) byWeek.set(r.w, [])
  byWeek.get(r.w).push(r)
}
const t = CONFIDENCE_CURVE.map(() => ({ n: 0, hit: 0 }))
for (const [, list] of byWeek) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
  const [hi, lo] = list[i].proj >= list[j].proj ? [list[i], list[j]] : [list[j], list[i]]
  const d = hi.proj - lo.proj
  const b = CONFIDENCE_CURVE.findIndex(c => d >= c.min && d < c.max)
  if (b < 0) continue
  t[b].n++
  if (hi.act > lo.act) t[b].hit++
}
console.log(`  ${byWeek.size} weeks · ${[...byWeek.values()].reduce((s, l) => s + l.length, 0)} startable FLEX player-weeks`)
console.log('     gap         pairs    2026   shipped   diff   within ±5?')
let pass = true, prev = -1, dips = 0
CONFIDENCE_CURVE.forEach((c, i) => {
  const { n, hit } = t[i]
  const rate = n ? 100 * hit / n : null
  const label = c.max === Infinity ? `${c.min}+ pts` : `${c.min}–${c.max} pts`
  const judged = n >= 1000
  const ok = judged ? Math.abs(rate - c.pct) <= 5 : null
  if (judged && !ok) pass = false
  if (rate != null && n >= 1000) {
    if (rate < prev) { if (n >= 2000) pass = false; else dips++ }
    prev = rate
  }
  console.log(`     ${label.padEnd(10)}${String(n).padStart(7)}   ${rate == null ? '   —' : `${rate.toFixed(1)}%`.padStart(6)}   ${`${c.pct.toFixed(1)}%`.padStart(6)}   ${rate == null ? '  —' : `${(rate - c.pct >= 0 ? '+' : '')}${(rate - c.pct).toFixed(1)}`.padStart(5)}   ${judged ? (ok ? 'yes' : 'NO') : 'too few to judge'}`)
})
if (dips > 1) pass = false
console.log(`  → ${pass ? 'PASS' : 'FAIL'} (pre-registered: every bin with ≥ 1,000 pairs within ±5 points, curve rising)`)
