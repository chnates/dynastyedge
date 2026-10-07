#!/usr/bin/env node
// buylow-timing-backtest.mjs — analysis only (research-frontier Item 4,
// open-items §0 #7). Nothing in src/ imports this file.
//
// THE QUESTION: when a player's 30-day value change drops below the app's
// trend threshold, does his value come back (a real buy-low) or keep falling
// (a falling knife)? And the mirror: do risers above the threshold give it
// back (sell-high) or keep rising?
//
// Pre-registered 2026-10-07 before any forward return was computed; the
// registration is quoted verbatim in docs/analysis/buylow-timing-2026-10.md.
//
// DATA
//   values-history.json from the values-history branch, read VIA GIT (never
//   the raw CDN, which caches ~5 min). Players only: the file still carries
//   88 draft-pick rows written before the 2026-09-21 classifier fix; their ids
//   are non-numeric and they are dropped here (CLAUDE.md, "Classify player vs
//   pick by id SHAPE").
//   values-consensus.json (same branch) — its `fantasycalc` source is a
//   PERMANENT daily FantasyCalc column since 2026-09-22, identical to
//   values-history on every overlapping cell (5,924 / 5,924 on 2026-10-07).
//   The two are merged, so the series keeps growing after the 90-day file
//   rolls its oldest day off; a disagreement on an overlap day aborts.
//   Sleeper /players/nfl for position + birth_date (age AT THE EVENT DATE).
//
// THE THRESHOLD is imported from src/utils/marketTrend.js — the same file every
// arrow, list and MCP tool reads — so the research tests the shipped rule.
//
//   docs/analysis/data/values-history-2026-10-06.json.gz — the rolling file
//   FROZEN on 2026-10-06 and committed. The branch file drops its oldest day
//   every morning and the permanent archive only starts 2026-09-22, so without
//   this copy the 2026-07-09 … 09-21 daily values would be lost for good. It
//   is merged with the live files, so the series runs unbroken from 07-09.
//
// Usage:
//   git fetch origin values-history
//   node scripts/dev/buylow-timing-backtest.mjs            # RE-RUN: frozen copy + live branch + live player DB
//   node scripts/dev/buylow-timing-backtest.mjs --frozen   # REPRODUCE the 2026-10 report exactly
//   Overrides: --history <file> --consensus <file> --players <file> --json <out.json>
//
// Zero dependencies. Deterministic: the bootstrap uses a fixed seed.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { TREND_THRESHOLD, MIN_TARGET_VALUE, trendDirection } from '../../src/utils/marketTrend.js'
import { getPeakStatus } from '../../src/utils/peakWindows.js'

// ── Pre-registered constants (do not tune) ──────────────────────────────────
const LOOKBACK = 30          // trend = v(t) − v(t − 30)
const HORIZONS = [30, 60]    // forward windows; 60 is reported as infeasible when it is
const REFRACTORY = 30        // one event per player per 30 days
const MIN_CONTROLS = 3       // an event with fewer matched controls is dropped
const MIN_EVENTS = 30        // a cell below this reports "no detectable signal"
const BOOT = 10000
const SEED = 0x5eed
const TIERS = [[0, 1000, '<1000'], [1000, 3000, '1000–2999'], [3000, 6000, '3000–5999'], [6000, Infinity, '6000+']]
const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// ── Args ────────────────────────────────────────────────────────────────────
const arg = name => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : null
}

const fromBranch = path =>
  execFileSync('git', ['show', `origin/values-history:${path}`], { encoding: 'utf8', maxBuffer: 256 << 20 })

const FROZEN = process.argv.includes('--frozen')
const DATA_DIR = new URL('../../docs/analysis/data/', import.meta.url)
const FROZEN_HISTORY = new URL('values-history-2026-10-06.json.gz', DATA_DIR)
const FROZEN_PLAYERS = new URL('players-2026-10-07.json.gz', DATA_DIR)
const readGz = url => gunzipSync(readFileSync(url)).toString('utf8')

function loadHistory() {
  const frozenRaw = readGz(FROZEN_HISTORY)
  const file = arg('history')
  const raw = file ? readFileSync(file, 'utf8') : FROZEN ? frozenRaw : fromBranch('values-history.json')
  const cfile = arg('consensus')
  let craw = null
  if (!FROZEN || cfile) {
    try { craw = cfile ? readFileSync(cfile, 'utf8') : fromBranch('values-consensus.json') } catch { craw = null }
  }
  const rolling = JSON.parse(raw)
  const fc = craw ? JSON.parse(craw)?.sources?.fantasycalc : null
  const archive = fc ? { dates: JSON.parse(craw).dates, players: fc.players } : null
  const sources = [rolling, archive]
  if (raw !== frozenRaw) sources.push(JSON.parse(frozenRaw))
  return { raw, craw, data: mergeSeries(sources) }
}

// Union of the daily FantasyCalc series, one column per date. Players only
// (numeric ids). On a date two carry, every value both have must agree. The
// first source is the rolling file; its row counts feed the integrity report.
function mergeSeries(srcs) {
  const [a] = srcs
  const present = srcs.filter(Boolean)
  const dates = [...new Set(present.flatMap(x => x.dates))].sort()
  const col = new Map(dates.map((d, i) => [d, i]))
  const players = {}
  let conflicts = 0, overlapCells = 0
  for (const src of present) {
    for (const [id, series] of Object.entries(src.players)) {
      if (!/^\d+$/.test(id)) continue
      const row = players[id] ?? (players[id] = new Array(dates.length).fill(null))
      src.dates.forEach((d, j) => {
        const v = series[j]
        if (v == null) return
        const i = col.get(d)
        if (row[i] != null) { overlapCells++; if (row[i] !== v) conflicts++ }
        row[i] = v
      })
    }
  }
  if (conflicts) throw new Error(`values-history and values-consensus disagree on ${conflicts} of ${overlapCells} overlapping cells — not merging`)
  return { dates, players, updatedAt: a.updatedAt, overlapCells, rollingDates: a.dates.length, archiveDates: srcs[1]?.dates.length ?? 0, rollingRows: Object.keys(a.players).length,
    rollingPickRows: Object.keys(a.players).filter(id => !/^\d+$/.test(id)).length }
}

async function loadPlayers() {
  const file = arg('players')
  if (file) return JSON.parse(readFileSync(file, 'utf8'))
  if (FROZEN) return JSON.parse(readGz(FROZEN_PLAYERS)).players
  const res = await fetch('https://api.sleeper.app/v1/players/nfl')
  if (!res.ok) throw new Error(`Sleeper players ${res.status}`)
  return res.json()
}

// ── Stats helpers ───────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length
const median = xs => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const sd = xs => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1))
}
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]

// Percentile bootstrap of the mean over EVENTS (pre-registered).
function bootMean(xs, seed = SEED) {
  const rng = mulberry32(seed)
  const n = xs.length
  const ms = new Float64Array(BOOT)
  for (let b = 0; b < BOOT; b++) {
    let s = 0
    for (let i = 0; i < n; i++) s += xs[Math.floor(rng() * n)]
    ms[b] = s / n
  }
  const sorted = Array.from(ms).sort((a, b) => a - b)
  return [quantile(sorted, 0.025), quantile(sorted, 0.975)]
}

// Difference of two independent means, each resampled within its own group.
function bootDiff(a, b, seed = SEED) {
  const rng = mulberry32(seed)
  const ds = new Float64Array(BOOT)
  for (let k = 0; k < BOOT; k++) {
    let sa = 0, sb = 0
    for (let i = 0; i < a.length; i++) sa += a[Math.floor(rng() * a.length)]
    for (let i = 0; i < b.length; i++) sb += b[Math.floor(rng() * b.length)]
    ds[k] = sa / a.length - sb / b.length
  }
  const sorted = Array.from(ds).sort((x, y) => x - y)
  return [quantile(sorted, 0.025), quantile(sorted, 0.975)]
}

// NOT pre-registered — robustness only. Resample whole event DATES, so a
// common shock that hit every dipper on one day counts once.
function bootByDate(events, key, seed = SEED) {
  const byDate = new Map()
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date).push(e[key])
  }
  const groups = [...byDate.values()]
  const rng = mulberry32(seed)
  const ms = new Float64Array(BOOT)
  for (let b = 0; b < BOOT; b++) {
    let s = 0, n = 0
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(rng() * groups.length)]
      for (const v of g) { s += v; n++ }
    }
    ms[b] = s / n
  }
  const sorted = Array.from(ms).sort((a, c) => a - c)
  return [quantile(sorted, 0.025), quantile(sorted, 0.975)]
}

const tierOf = v => TIERS.find(([lo, hi]) => v >= lo && v < hi)?.[2] ?? null

function ageAt(player, isoDate) {
  if (!player?.birth_date) return null
  const ms = Date.parse(isoDate) - Date.parse(player.birth_date)
  return Number.isFinite(ms) ? ms / (365.25 * 864e5) : null
}

// ── Event detection + matched null ──────────────────────────────────────────
// side: 'down' (buy-low) or 'up' (sell-high). delisted: 'exclude' (primary)
// or 'zero' (sensitivity — a player FantasyCalc stopped listing is worth 0).
function study(history, playersDB, { side, horizon, delisted }) {
  const { dates, players } = history
  const n = dates.length
  const ids = Object.keys(players).filter(id => /^\d+$/.test(id) && POSITIONS.includes(playersDB[id]?.position))

  const trendAt = (s, t) => (t - LOOKBACK >= 0 && s[t] != null && s[t - LOOKBACK] != null) ? s[t] - s[t - LOOKBACK] : null
  const fwd = (s, t) => {
    const a = s[t], b = s[t + horizon]
    if (a == null || a <= 0) return null
    if (b == null) return delisted === 'zero' ? { r: -1, pts: -a, delisted: true } : { r: null, delisted: true }
    return { r: (b - a) / a, pts: b - a, delisted: false }
  }

  const firstT = LOOKBACK
  const lastT = n - 1 - horizon
  if (lastT < firstT) return { feasible: false, firstT, lastT, needDays: LOOKBACK + horizon + 1, haveDays: n }

  const events = []
  let dropped = { delisted: 0, fewControls: 0, noAge: 0 }
  const lastEvent = new Map()

  for (let t = firstT; t <= lastT; t++) {
    // Control pools for this date, keyed by position|tier.
    const pools = new Map()
    for (const id of ids) {
      const s = players[id]
      const tr = trendAt(s, t)
      if (tr == null || trendDirection(tr) !== 'flat') continue
      const f = fwd(s, t)
      if (!f || f.r == null) continue
      const key = `${playersDB[id].position}|${tierOf(s[t])}`
      if (!pools.has(key)) pools.set(key, [])
      pools.get(key).push(f)
    }

    for (const id of ids) {
      const s = players[id]
      const tr = trendAt(s, t)
      if (tr == null || trendDirection(tr) !== side) continue
      const prev = trendAt(s, t - 1)
      if (prev != null && trendDirection(prev) === side) continue // not a crossing
      if (lastEvent.has(id) && t - lastEvent.get(id) < REFRACTORY) continue
      lastEvent.set(id, t)

      const f = fwd(s, t)
      if (!f) continue
      if (f.r == null) { dropped.delisted++; continue }
      const pos = playersDB[id].position
      const tier = tierOf(s[t])
      const pool = pools.get(`${pos}|${tier}`) ?? []
      if (pool.length < MIN_CONTROLS) { dropped.fewControls++; continue }
      const age = ageAt(playersDB[id], dates[t])
      const phase = getPeakStatus(pos, age)?.phase ?? null
      if (phase == null) dropped.noAge++
      events.push({
        id, name: playersDB[id].full_name ?? id, date: dates[t], pos, tier, phase,
        age, value: s[t], trend: tr,
        r: f.r, pts: f.pts, delisted: f.delisted,
        excess: f.r - mean(pool.map(c => c.r)),
        excessPts: f.pts - mean(pool.map(c => c.pts)),
        controls: pool.length,
      })
    }
  }
  return { feasible: true, firstT, lastT, window: [dates[firstT], dates[lastT]], events, dropped }
}

function summarize(events, label) {
  const xs = events.map(e => e.excess)
  const n = xs.length
  if (n === 0) return { label, n, verdict: 'no events' }
  const m = mean(xs)
  const out = {
    label, n,
    meanExcessPct: m * 100,
    medianExcessPct: median(xs) * 100,
    meanExcessPts: mean(events.map(e => e.excessPts)),
    rawMeanReturnPct: mean(events.map(e => e.r)) * 100,
  }
  if (n < 2) return { ...out, verdict: 'no detectable signal at this corpus size' }
  const ci = bootMean(xs).map(v => v * 100)
  const se = sd(xs) / Math.sqrt(n)
  out.ci95Pct = ci
  out.mdePct = 2.8 * se * 100 // 80% power, two-sided α = 0.05
  if (n < MIN_EVENTS) out.verdict = 'no detectable signal at this corpus size (n < 30)'
  else if (ci[0] > 0) out.verdict = 'BEATS matched non-movers'
  else if (ci[1] < 0) out.verdict = 'TRAILS matched non-movers'
  else out.verdict = 'no detectable signal (CI spans 0)'
  return out
}

function splits(events) {
  const by = (key, values) => values.map(v => summarize(events.filter(e => e[key] === v), `${key}=${v}`))
  return {
    overall: summarize(events, 'overall'),
    appPopulation: summarize(events.filter(e => e.value >= MIN_TARGET_VALUE), `value>=${MIN_TARGET_VALUE} (what the app surfaces)`),
    phase: by('phase', ['ascending', 'peak', 'declining']),
    position: by('pos', POSITIONS),
    tier: by('tier', TIERS.map(t => t[2])),
  }
}

function ageContrast(events) {
  const young = events.filter(e => e.phase === 'ascending').map(e => e.excess)
  const old = events.filter(e => e.phase === 'declining').map(e => e.excess)
  const out = { nAscending: young.length, nDeclining: old.length }
  if (young.length < 2 || old.length < 2) return { ...out, verdict: 'too few events' }
  out.diffPct = (mean(young) - mean(old)) * 100
  out.ci95Pct = bootDiff(young, old).map(v => v * 100)
  const powered = young.length >= MIN_EVENTS && old.length >= MIN_EVENTS
  out.verdict = !powered ? 'no detectable signal at this corpus size (a cell has n < 30)'
    : out.ci95Pct[0] > 0 ? 'ascending BEATS declining'
    : out.ci95Pct[1] < 0 ? 'declining BEATS ascending'
    : 'no detectable difference (CI spans 0)'
  return out
}

// ── Integrity report on the input (checked before trusting events) ──────────
function integrity(history) {
  const { dates, players } = history
  const gaps = []
  for (let i = 1; i < dates.length; i++) {
    const d = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5
    if (d !== 1) gaps.push([dates[i - 1], dates[i], d])
  }
  const ids = Object.keys(players)
  const perCol = dates.map((_, i) => ids.filter(id => players[id][i] != null).length)
  let identical = 0
  for (let i = 1; i < dates.length; i++) {
    if (ids.every(id => players[id][i] == null || players[id][i - 1] == null || players[id][i] === players[id][i - 1])) identical++
  }
  return {
    dates: dates.length, first: dates[0], last: dates.at(-1), gaps,
    rollingFileRows: history.rollingRows, pickRowsDropped: history.rollingPickRows,
    playerRows: ids.length, rollingDates: history.rollingDates, archiveDates: history.archiveDates,
    mergedOverlapCellsIdentical: history.overlapCells,
    playersPerDay: [Math.min(...perCol), Math.max(...perCol)],
    identicalConsecutiveColumns: identical,
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
const { raw, craw, data: history } = loadHistory()
const playersDB = await loadPlayers()
const result = {
  generatedAt: new Date().toISOString(),
  inputs: {
    valuesHistorySha256: createHash('sha256').update(raw).digest('hex'),
    valuesHistoryUpdatedAt: history.updatedAt,
    valuesConsensusSha256: craw ? createHash('sha256').update(craw).digest('hex') : null,
    playerDbSize: Object.keys(playersDB).length,
  },
  threshold: TREND_THRESHOLD,
  minTargetValue: MIN_TARGET_VALUE,
  integrity: integrity(history),
  runs: {},
}

for (const side of ['down', 'up']) {
  for (const horizon of HORIZONS) {
    for (const delisted of ['exclude', 'zero']) {
      const key = `${side === 'down' ? 'dip' : 'rise'}_+${horizon}d_${delisted}`
      const s = study(history, playersDB, { side, horizon, delisted })
      if (!s.feasible) { result.runs[key] = { feasible: false, needDays: s.needDays, haveDays: s.haveDays }; continue }
      result.runs[key] = {
        feasible: true, window: s.window, dropped: s.dropped,
        ...splits(s.events),
        ageContrast: ageContrast(s.events),
        robustnessByDate: s.events.length > 1 ? bootByDate(s.events, 'excess').map(v => v * 100) : null,
        eventDates: new Set(s.events.map(e => e.date)).size,
      }
      if (delisted === 'exclude') result.runs[key].events = s.events
    }
  }
}

const out = arg('json')
if (out) writeFileSync(out, JSON.stringify(result, null, 2))

// ── Human-readable summary ──────────────────────────────────────────────────
const f = v => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const line = s => s.n
  ? `${s.label.padEnd(44)} n=${String(s.n).padStart(3)}  mean ${f(s.meanExcessPct).padStart(7)}  CI [${f(s.ci95Pct?.[0])}, ${f(s.ci95Pct?.[1])}]  median ${f(s.medianExcessPct)}  ${s.meanExcessPts >= 0 ? '+' : ''}${Math.round(s.meanExcessPts)} pts  → ${s.verdict}`
  : `${s.label.padEnd(44)} n=  0`
console.log(`threshold ±${TREND_THRESHOLD} (from src/utils/marketTrend.js) · values-history sha256 ${result.inputs.valuesHistorySha256.slice(0, 16)}`)
console.log('integrity', JSON.stringify(result.integrity))
for (const [key, r] of Object.entries(result.runs)) {
  console.log(`\n=== ${key} ===`)
  if (!r.feasible) { console.log(`INFEASIBLE: needs ${r.needDays} daily columns, file has ${r.haveDays}`); continue }
  console.log(`event dates ${r.window.join(' → ')} (${r.eventDates} distinct) · dropped ${JSON.stringify(r.dropped)}`)
  ;[r.overall, r.appPopulation, ...r.phase, ...r.position, ...r.tier].forEach(s => console.log(line(s)))
  const a = r.ageContrast
  console.log(`ascending − declining: ${a.diffPct != null ? f(a.diffPct) : '—'} CI [${f(a.ci95Pct?.[0])}, ${f(a.ci95Pct?.[1])}] (n ${a.nAscending}/${a.nDeclining}) → ${a.verdict}`)
  console.log(`robustness (NOT pre-registered) — overall CI resampling whole dates: [${f(r.robustnessByDate?.[0])}, ${f(r.robustnessByDate?.[1])}]`)
}
