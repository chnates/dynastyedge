#!/usr/bin/env node
// Dev/analysis tool — NOT part of the app or any workflow. Nothing imports it.
//
// Measures the two facts the recommendation engine's keep-score needs and has
// never had, and prints the analysis behind
// docs/analysis/asset-aging-and-pick-value-2026-09.md so every number there is
// re-runnable rather than asserted.
//
// The questions:
//   1. Does a player's production actually fall off at the age PEAK_WINDOWS
//      says it does — and by how much, per position? (Yes for RB and WR.
//      Not measurably for QB or TE.)
//   2. Is being BELOW the peak window better than being IN it? (No — the
//      half of the proposal this test killed.)
//   3. Do rookie picks deliver what the market charges for them? (Firsts beat
//      their price in every class measured; fourths miss theirs in every one.)
//
// METHOD NOTE — why this is longitudinal and the shipped trajectory model is
// not. dynastyTrajectory.js learns "what does the market pay at each age" from
// today's FantasyCalc pool, which is a CROSS-SECTION: the only 33-year-old TEs
// still carrying value are the ones who didn't decline, so that curve reads
// survivorship as aging (it scores a 31-year-old Mark Andrews a riser). Here
// the same player is followed from season to season, and a player who required
// a real season and then vanished counts as a ZERO rather than leaving the
// sample. That is the honest denominator for "will this asset still be useful".
//
// SELECTION NOTE — requiring MIN_PRIOR points in year Y means regression to the
// mean drags every retention figure below 1.0. That bias is constant across age
// bands, so compare bands to EACH OTHER, never to 1.0.
//
// Usage (the resolver hook is required — this script imports the shipped
// recommendations.js, whose extensionless imports plain node cannot resolve):
//   node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//     scripts/dev/asset-aging-backtest.mjs
//
// Zero dependencies, read-only, public data. Safe to re-run. Caches ~25MB of
// Sleeper payloads on first run (DYNASTYEDGE_CACHE to override).

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// The SHIPPED constants, imported rather than restated: this script measures
// what the app actually uses, so the analysis and the product cannot drift.
import { PEAK_WINDOWS } from '../../src/utils/peakWindows.js'
import { PICK_ROUND_KEEP } from '../../src/utils/recommendations.js'

const SLEEPER = 'https://api.sleeper.app/v1'
const FANTASYCALC = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'
const LEAGUE_ID = '1313933520715907072'
const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025]
const POSITIONS = ['QB', 'RB', 'WR', 'TE']
// A real fantasy season the year before — below this, a doubling is noise.
const MIN_PRIOR = 100
// The app's own "this pick became a starter" bar (DRAFT_HIT_VALUE).
const HIT = 1000

const CACHE = process.env.DYNASTYEDGE_CACHE || join(tmpdir(), 'dynastyedge-aging')
mkdirSync(CACHE, { recursive: true })

async function fetchCached(url, name) {
  const path = join(CACHE, name)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  process.stderr.write(`  fetching ${name} …\n`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  writeFileSync(path, text)
  return JSON.parse(text)
}

// ── stats ────────────────────────────────────────────────────────────────────
const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = xs => xs.reduce((s, c) => s + c, 0) / xs.length

function spearman(xs, ys) {
  const rank = a => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0])
    const out = Array(a.length)
    let i = 0
    while (i < idx.length) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      const r = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) out[idx[k][1]] = r
      i = j + 1
    }
    return out
  }
  const rx = rank(xs), ry = rank(ys), n = xs.length
  const mx = mean(rx), my = mean(ry)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my
    num += a * b; dx += a * a; dy += b * b
  }
  return num / Math.sqrt(dx * dy)
}

// Two-sided permutation test on the difference of means. Fixed seed so the
// memo's p-values are reproducible to the digit (same discipline as
// playoffOdds.js's fixed-seed Monte Carlo).
function permutationTest(a, b, iters = 20000, seed = 20260906) {
  const obs = mean(a) - mean(b)
  const pool = [...a, ...b]
  let s = seed >>> 0
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
  let atLeast = 0
  for (let it = 0; it < iters; it++) {
    const c = [...pool]
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]] }
    if (Math.abs(mean(c.slice(0, a.length)) - mean(c.slice(a.length))) >= Math.abs(obs)) atLeast++
  }
  return { obs, p: (atLeast + 1) / (iters + 1) }
}

// ── data ─────────────────────────────────────────────────────────────────────
const ageAt = (birthDate, season) => {
  if (!birthDate) return null
  const d = new Date(birthDate)
  if (isNaN(d)) return null
  return (new Date(`${season}-09-01`) - d) / (365.25 * 24 * 3600 * 1000)
}

async function loadPairs(playerDB) {
  const stats = {}
  for (const y of SEASONS) stats[y] = await fetchCached(`${SLEEPER}/stats/nfl/regular/${y}`, `stats_${y}.json`)
  const pairs = []
  for (let i = 0; i < SEASONS.length - 1; i++) {
    const y = SEASONS[i], next = SEASONS[i + 1]
    for (const id of Object.keys(stats[y])) {
      const p = playerDB[id]
      if (!p || !POSITIONS.includes(p.position)) continue
      const age = ageAt(p.birth_date, y)
      if (age == null || age < 20 || age > 40) continue
      const prior = stats[y][id]?.pts_half_ppr ?? 0
      if (prior < MIN_PRIOR) continue
      // Absent next season === 0. Never drop him; that is the whole point.
      const after = stats[next][id]?.pts_half_ppr ?? 0
      pairs.push({ pos: p.position, age, prior, after, ratio: after / prior, gone: after === 0 })
    }
  }
  return pairs
}

// ── §1 the null: a single 30-day trend snapshot ──────────────────────────────
function trendSnapshot(fc) {
  console.log('\n§1  DISCARDED — 30-day value trend vs age, one snapshot')
  console.log('    Recorded so nobody re-runs it expecting signal.\n')
  const rows = fc
    .filter(e => /^[0-9]+$/.test(String(e.player?.sleeperId ?? '')) && e.player.maybeAge > 0 && e.value >= 500)
    .filter(e => POSITIONS.includes(e.player.position))
  for (const pos of POSITIONS) {
    const g = rows.filter(r => r.player.position === pos)
    const bands = [[22, 24], [24, 26], [26, 28], [28, 30], [30, 40]]
    const cells = bands.map(([lo, hi]) => {
      const b = g.filter(r => r.player.maybeAge >= lo && r.player.maybeAge < hi)
      if (b.length < 4) return `${lo}-${hi}: n=${b.length} —`
      const pct = b.map(r => r.trend30Day / (r.value - r.trend30Day) * 100)
      return `${lo}-${hi}: ${median(pct).toFixed(1)}% (n=${b.length})`
    })
    console.log(`  ${pos}  ${cells.join('   ')}`)
  }
  console.log('\n  A single 30-day window measures the week\'s news, not aging.')
}

// ── §2 the aging test ────────────────────────────────────────────────────────
function agingTest(pairs) {
  console.log(`\n§2  Longitudinal retention — n=${pairs.length} player-seasons, ${SEASONS[0]}→${SEASONS[SEASONS.length - 1]}`)
  console.log(`    Median next-year half-PPR as a share of this-year, prior season >= ${MIN_PRIOR} pts.`)
  console.log('    Compare bands to each other, NOT to 1.0 (see SELECTION NOTE).\n')
  for (const pos of POSITIONS) {
    const g = pairs.filter(r => r.pos === pos)
    const [start, end] = PEAK_WINDOWS[pos]
    console.log(`  ${pos}  n=${g.length}   shipped peak window ${start}-${end}`)
    for (let a = 21; a <= 35; a++) {
      const b = g.filter(r => r.age >= a && r.age < a + 1)
      if (b.length < 6) continue
      const m = median(b.map(r => r.ratio))
      const gone = b.filter(r => r.gone).length / b.length
      const mark = a === end ? ' <- window ends' : ''
      console.log(`    ${a}  n=${String(b.length).padStart(3)}  ${m.toFixed(2)}  ${'#'.repeat(Math.round(m * 24)).padEnd(26)} gone ${(gone * 100).toFixed(0)}%${mark}`)
    }
    console.log()
  }

  console.log('  Correlation of age with retention (negative = age hurts):')
  const effects = {}
  for (const pos of POSITIONS) {
    const g = pairs.filter(r => r.pos === pos)
    console.log(`    ${pos}  n=${String(g.length).padStart(3)}  spearman = ${spearman(g.map(r => r.age), g.map(r => r.ratio)).toFixed(3)}`)
  }

  console.log('\n  Past-peak penalty at the SHIPPED window boundary:')
  for (const pos of POSITIONS) {
    const g = pairs.filter(r => r.pos === pos)
    const end = PEAK_WINDOWS[pos][1]
    const old = g.filter(r => r.age > end).map(r => r.ratio)
    const young = g.filter(r => r.age <= end).map(r => r.ratio)
    if (old.length < 8 || young.length < 8) {
      console.log(`    ${pos} > ${end}: n=${old.length} vs ${young.length} — too few to test`)
      effects[pos] = null
      continue
    }
    const { obs, p } = permutationTest(old, young)
    effects[pos] = { obs, p }
    const verdict = p < 0.05 ? 'SIGNIFICANT' : 'not significant'
    console.log(`    ${pos} > ${end}  (n=${String(old.length).padStart(3)}) ${mean(old).toFixed(2)}  vs  <= ${end} (n=${String(young.length).padStart(3)}) ${mean(young).toFixed(2)}   diff ${obs.toFixed(2)}  p=${p.toFixed(4)}  ${verdict}`)
  }

  console.log('\n  Relative effect size (RB = 1.00) — the basis for a per-position tilt:')
  const rb = effects.RB ? Math.abs(effects.RB.obs) : null
  for (const pos of POSITIONS) {
    if (!effects[pos] || !rb) { console.log(`    ${pos}  —`); continue }
    const rel = Math.abs(effects[pos].obs) / rb
    const note = effects[pos].p < 0.05 ? '' : '   (not significant — scale DOWN, the effect is unproven, not known-small)'
    console.log(`    ${pos}  ${rel.toFixed(2)}${note}`)
  }

  console.log('\n  Is being BELOW the window better than being IN it? (the pre-peak bonus)')
  for (const pos of POSITIONS) {
    const g = pairs.filter(r => r.pos === pos)
    const [start, end] = PEAK_WINDOWS[pos]
    const pre = g.filter(r => r.age < start).map(r => r.ratio)
    const inw = g.filter(r => r.age >= start && r.age <= end).map(r => r.ratio)
    if (pre.length < 8 || inw.length < 8) { console.log(`    ${pos}  too few (pre=${pre.length}, in=${inw.length})`); continue }
    const { obs, p } = permutationTest(pre, inw)
    console.log(`    ${pos}  pre(<${start}) n=${String(pre.length).padStart(3)} ${mean(pre).toFixed(2)}  vs  in(${start}-${end}) n=${String(inw.length).padStart(3)} ${mean(inw).toFixed(2)}   diff ${obs >= 0 ? '+' : ''}${obs.toFixed(2)}  p=${p.toFixed(3)}`)
  }
  console.log('\n  Four positions tested; one hit near 0.05 is what chance produces.')
  console.log('  Notably absent at RB — the position the tilt exists for.')
}

// ── §3 the pick test ─────────────────────────────────────────────────────────
async function pickTest(fc) {
  const value = new Map()
  for (const e of fc) {
    const id = e.player?.sleeperId
    if (id != null && /^[0-9]+$/.test(String(id))) value.set(String(id), e.value)
  }

  console.log('\n§3  Do rookie picks deliver what the market charges?\n')
  console.log('  Market price of a FUTURE pick today (FantasyCalc round-level entries):')
  const byRound = {}
  for (const e of fc) {
    const id = e.player?.sleeperId
    if (id != null && /^[0-9]+$/.test(String(id))) continue
    const m = /^(20\d\d)\s+(\d)(?:st|nd|rd|th)$/.exec(e.player?.name ?? '')
    if (m) (byRound[m[2]] ??= []).push([m[1], e.value])
  }
  for (const r of Object.keys(byRound).sort()) {
    console.log(`    round ${r}:  ${byRound[r].sort().map(([y, v]) => `${y}=${v}`).join('  ')}`)
  }

  // Walk previous_league_id to collect every rookie draft this league has held.
  const drafts = []
  let id = LEAGUE_ID
  for (let hop = 0; hop < 8 && id; hop++) {
    const league = await fetchCached(`${SLEEPER}/league/${id}`, `league_${id}.json`)
    const ds = await fetchCached(`${SLEEPER}/league/${id}/drafts`, `drafts_${id}.json`)
    for (const d of ds) {
      // Startup drafts (deep) are not rookie drafts — the same exclusion
      // managerAnalysis.js applies when grading rookie picks.
      if ((d.settings?.rounds ?? 0) > 6) continue
      if (d.status !== 'complete') continue
      drafts.push(d)
    }
    id = league.previous_league_id
  }
  drafts.sort((a, b) => Number(a.season) - Number(b.season))

  console.log('\n  Realized value TODAY of every rookie pick this league has made:')
  console.log('  (a class is only as resolved as it is old — read the trend across seasons)\n')
  const realized = {}
  for (const d of drafts) {
    const picks = await fetchCached(`${SLEEPER}/draft/${d.draft_id}/picks`, `picks_${d.draft_id}.json`)
    const rounds = {}
    for (const p of picks) (rounds[p.round] ??= []).push(value.get(String(p.player_id)) ?? 0)
    console.log(`    ${d.season}:`)
    for (const r of Object.keys(rounds).sort()) {
      const a = rounds[r]
      ;(realized[r] ??= []).push(median(a))
      console.log(`      round ${r}  n=${String(a.length).padStart(2)}  median ${String(Math.round(median(a))).padStart(5)}  mean ${String(Math.round(mean(a))).padStart(5)}  hits(>=${HIT}) ${a.filter(v => v >= HIT).length}/${a.length}`)
    }
  }

  console.log('\n  Round medians across all classes vs the cheapest future price on the board:')
  const beatsByRound = {}
  for (const r of Object.keys(realized).sort()) {
    const prices = (byRound[r] ?? []).map(([, v]) => v)
    if (!prices.length) { console.log(`    round ${r}: no market entry`); continue }
    const cheapest = Math.min(...prices), dearest = Math.max(...prices)
    const beats = realized[r].filter(v => v > dearest).length
    beatsByRound[r] = beats / realized[r].length
    console.log(`    round ${r}  realized ${realized[r].map(v => Math.round(v)).join(' / ')}   market ${cheapest}-${dearest}   classes beating the DEAREST future price: ${beats}/${realized[r].length}`)
  }

  // Drift check — the shipped keep-scores must stay ordered the way the
  // measurement orders the rounds. This is what stops a future session from
  // nudging PICK_ROUND_KEEP by feel: the numbers are a judgement, the ORDER is
  // measured, and a reversal here means the constants need re-deriving.
  console.log('\n  Drift check — shipped PICK_ROUND_KEEP vs the measurement:')
  const rounds = Object.keys(PICK_ROUND_KEEP).map(Number).sort((a, b) => a - b)
  let drift = false
  for (const r of rounds) {
    const share = beatsByRound[r]
    console.log(`    round ${r}  keep ${PICK_ROUND_KEEP[r].toFixed(2)}   beat their price in ${share == null ? 'n/a' : `${Math.round(share * 100)}% of classes`}`)
  }
  for (let i = 1; i < rounds.length; i++) {
    const [prev, cur] = [rounds[i - 1], rounds[i]]
    if (PICK_ROUND_KEEP[cur] >= PICK_ROUND_KEEP[prev]) {
      drift = true
      console.log(`    !! round ${cur} is not held more loosely than round ${prev}`)
    }
    if (beatsByRound[prev] != null && beatsByRound[cur] != null && beatsByRound[cur] > beatsByRound[prev]) {
      drift = true
      console.log(`    !! round ${cur} now beats its price MORE often than round ${prev} — re-derive PICK_ROUND_KEEP`)
    }
  }
  console.log(drift
    ? '    DRIFT: the shipped ordering no longer matches the measurement.'
    : '    OK: shipped ordering matches the measurement.')
}

// ── main ─────────────────────────────────────────────────────────────────────
const fc = await fetchCached(FANTASYCALC, 'fantasycalc.json')
const playerDB = await fetchCached(`${SLEEPER}/players/nfl`, 'players.json')

console.log('DynastyEdge — asset aging + pick realization back-test')
console.log(`Shipped PEAK_WINDOWS under test: ${JSON.stringify(PEAK_WINDOWS)}`)

trendSnapshot(fc)
agingTest(await loadPairs(playerDB))
await pickTest(fc)

console.log('\nDone. Memo: docs/analysis/asset-aging-and-pick-value-2026-09.md')
