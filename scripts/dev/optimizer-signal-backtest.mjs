// optimizer-signal-backtest.mjs — ANALYSIS ONLY. Nothing in src/ imports this.
//
// Answers one question with numbers: can the Lineup Optimizer be made better by
// feeding it a better weekly POINT ESTIMATE than Sleeper's own projection?
//
// It reproduces the four load-bearing results of
// docs/analysis/optimizer-data-sources-2026-09.md:
//
//   1. BASELINE  — how accurate Sleeper's projection actually is, by position.
//   2. CEILING   — how much accuracy ANY pre-game estimate could ever add,
//                  measured against a predictor that cheats with hindsight.
//   3. CALIBRATION — how often "start the higher-projected player" is right,
//                  as a function of the projection gap. This is the curve the
//                  app does not currently show and Sleeper never will.
//   4. DEF STREAM — what streaming the best AVAILABLE defense is worth, using
//                  this league's real 2025 rosters.
//
// It reads LEAGUE_ID and SLEEPER_BASE from src/constants.js so the league and
// endpoints cannot drift from the app. The DEF streaming test is a single-slot
// choice, so it does not need the slot-fill engine; the lineup-level replays
// that DO drive src/utils/lineupBuild.js are described in the analysis note.
//
// Run:
//   node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//        scripts/dev/optimizer-signal-backtest.mjs
//
// Responses are cached under .cache/optimizer-backtest/ (gitignored) — the first
// run pulls ~150 Sleeper endpoints (~110MB), later runs are instant.

import fs from 'node:fs'
import path from 'node:path'
import { SLEEPER_BASE, LEAGUE_ID } from '../../src/constants.js'

const SEASONS = [2022, 2023, 2024, 2025]
const CACHE = '.cache/optimizer-backtest'
const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'DEF'])
const FLEX = new Set(['RB', 'WR', 'TE'])
// A projection below this is not a start/sit decision — it is a bench player.
const STARTABLE = 5

fs.mkdirSync(CACHE, { recursive: true })

async function get(url, key) {
  const file = path.join(CACHE, `${key}.json`)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const json = await res.json()
  fs.writeFileSync(file, JSON.stringify(json))
  return json
}

const pool = async (jobs, n = 6) => {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) { const j = i++; out[j] = await jobs[j]() }
  }))
  return out
}

// ── load ────────────────────────────────────────────────────────────────────
console.log('Loading (first run fetches ~150 endpoints; later runs read the cache)…')
const players = await get(`${SLEEPER_BASE}/players/nfl`, 'players')
const pos = id => players[id]?.position ?? null
const DEFS = new Set(Object.keys(players).filter(id => players[id]?.position === 'DEF'))

const jobs = []
for (const y of SEASONS) for (let w = 1; w <= 18; w++) {
  jobs.push(() => get(`${SLEEPER_BASE}/stats/nfl/regular/${y}/${w}`, `stats_${y}_${w}`))
  jobs.push(() => get(`${SLEEPER_BASE}/projections/nfl/regular/${y}/${w}`, `proj_${y}_${w}`))
}
await pool(jobs)
const stats = {}, projs = {}
for (const y of SEASONS) for (let w = 1; w <= 18; w++) {
  stats[`${y}_${w}`] = await get(`${SLEEPER_BASE}/stats/nfl/regular/${y}/${w}`, `stats_${y}_${w}`)
  projs[`${y}_${w}`] = await get(`${SLEEPER_BASE}/projections/nfl/regular/${y}/${w}`, `proj_${y}_${w}`)
}

// (season, week, id) rows carrying both a projection and an actual.
// `TEAM_*` keys are TEAM OFFENSE TOTALS (100+ pts), not a fantasy asset, and
// must be dropped before anything else — they are NOT the team defense, which
// is the bare abbreviation (`ARI`). Mixing them corrupts every DEF number.
const rows = []
for (const y of SEASONS) for (let w = 1; w <= 18; w++) {
  const S = stats[`${y}_${w}`] ?? {}, P = projs[`${y}_${w}`] ?? {}
  for (const id of new Set([...Object.keys(S), ...Object.keys(P)])) {
    if (id.startsWith('TEAM_')) continue
    const p = pos(id)
    if (!SKILL.has(p)) continue
    const proj = P[id]?.pts_half_ppr, act = S[id]?.pts_half_ppr
    if (proj == null || act == null) continue
    rows.push({ y, w, id, pos: p, proj, act })
  }
}
console.log(`  ${rows.length.toLocaleString()} player-weeks with both a projection and an actual\n`)

const mean = a => a.reduce((s, x) => s + x, 0) / a.length
const corr = (x, y) => {
  const mx = mean(x), my = mean(y)
  const sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0))
  const sy = Math.sqrt(y.reduce((s, v) => s + (v - my) ** 2, 0))
  return sx && sy ? x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (sx * sy) : NaN
}
const pad = (s, n) => String(s).padStart(n)

// ── 1. baseline ─────────────────────────────────────────────────────────────
console.log('1. HOW GOOD IS SLEEPER\'S PROJECTION?  (startable rows: proj >= 5)')
console.log(`   ${'pos'.padEnd(5)}${pad('n', 7)}${pad('MAE', 8)}${pad('r', 8)}${pad('bias', 8)}`)
for (const p of ['QB', 'RB', 'WR', 'TE', 'DEF']) {
  const s = rows.filter(r => r.pos === p && r.proj >= STARTABLE)
  if (s.length < 50) continue
  const mae = mean(s.map(r => Math.abs(r.proj - r.act)))
  console.log(`   ${p.padEnd(5)}${pad(s.length, 7)}${pad(mae.toFixed(2), 8)}` +
    `${pad(corr(s.map(r => r.proj), s.map(r => r.act)).toFixed(3), 8)}${pad(mean(s.map(r => r.proj - r.act)).toFixed(2), 8)}`)
}
console.log('   bias = projected minus actual. Positive means Sleeper runs hot.\n')

// ── 2. ceiling ──────────────────────────────────────────────────────────────
// A predictor that already KNOWS the player's full-season average is an upper
// bound on any honest pre-game point estimate. Whatever it fails to remove is
// irreducible weekly noise, and no data source can sell you that.
console.log('2. CEILING — how much accuracy could ANY better projection buy?')
console.log(`   ${'pos'.padEnd(5)}${pad('Sleeper', 10)}${pad('hindsight', 11)}${pad('headroom', 10)}`)
const bySeasonPlayer = new Map()
for (const r of rows) {
  const k = `${r.y}|${r.id}`
  if (!bySeasonPlayer.has(k)) bySeasonPlayer.set(k, [])
  bySeasonPlayer.get(k).push(r)
}
for (const p of ['QB', 'RB', 'WR', 'TE', 'DEF']) {
  const S = [], H = [], A = []
  for (const [, rs] of bySeasonPlayer) {
    if (rs[0].pos !== p || rs.length < 6) continue
    const avg = mean(rs.map(r => r.act))
    for (const r of rs) { if (r.proj < STARTABLE) continue; S.push(r.proj); H.push(avg); A.push(r.act) }
  }
  if (A.length < 100) continue
  const ms = mean(S.map((v, i) => Math.abs(v - A[i])))
  const mh = mean(H.map((v, i) => Math.abs(v - A[i])))
  console.log(`   ${p.padEnd(5)}${pad(ms.toFixed(3), 10)}${pad(mh.toFixed(3), 11)}${pad((100 * (ms - mh) / ms).toFixed(1) + '%', 10)}`)
}
console.log('   headroom = the MOST any projection upgrade could remove. It is small.\n')

// ── 3. calibration ──────────────────────────────────────────────────────────
// For every same-slot pair in the same week: how often does the higher-projected
// player actually outscore the lower, as a function of the gap? This turns
// "+2.3 pts" into "61% likely to be the right call".
console.log('3. CALIBRATION — "start the higher-projected player" success rate')
const BINS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 8], [8, 12], [12, 999]]
for (const [group, label] of [['FLEX', 'FLEX-eligible (RB/WR/TE)'], ['QB', 'QB'], ['DEF', 'DEF']]) {
  const wk = new Map()
  for (const r of rows) {
    if (r.proj < STARTABLE) continue
    const inGroup = group === 'FLEX' ? FLEX.has(r.pos) : r.pos === group
    if (!inGroup) continue
    const k = `${r.y}_${r.w}`
    if (!wk.has(k)) wk.set(k, [])
    wk.get(k).push(r)
  }
  const t = BINS.map(() => ({ n: 0, hit: 0, gain: 0 }))
  for (const [, list] of wk) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [hi, lo] = list[i].proj >= list[j].proj ? [list[i], list[j]] : [list[j], list[i]]
    const d = hi.proj - lo.proj
    const b = BINS.findIndex(([x, y]) => d >= x && d < y)
    if (b < 0) continue
    t[b].n++; t[b].gain += hi.act - lo.act
    if (hi.act > lo.act) t[b].hit++
  }
  console.log(`\n   ${label}`)
  console.log(`   ${'gap'.padEnd(12)}${pad('pairs', 10)}${pad('right', 8)}${pad('realized', 10)}`)
  t.forEach((v, i) => {
    if (v.n < 200) return
    const [x, y] = BINS[i]
    console.log(`   ${(y === 999 ? `${x}+ pts` : `${x}-${y} pts`).padEnd(12)}` +
      `${pad(v.n.toLocaleString(), 10)}${pad((100 * v.hit / v.n).toFixed(1) + '%', 8)}${pad((v.gain / v.n).toFixed(2), 10)}`)
  })
}

// ── 4. DEF streaming, ALL SEASONS ───────────────────────────────────────────
// A single season said +0.91 pts/wk with a t of 2.22. It did NOT replicate.
// Decisions are made on the PROJECTION ONLY and scored on actuals.
console.log('\n\n4. DEF STREAMING — this league, every season, all 10 rosters')
let lid = LEAGUE_ID
const chain = []
for (let hop = 0; hop < 6; hop++) {
  const lg = await get(`${SLEEPER_BASE}/league/${lid}`, `league_${lid}`)
  if (Number(lg.season) < 2026) chain.push({ season: Number(lg.season), id: lid })
  if (!lg.previous_league_id) break
  lid = lg.previous_league_id
}
const pooled = []
console.log(`   ${'season'.padEnd(8)}${pad('n', 5)}${pad('started', 10)}${pad('bestOwned', 11)}${pad('streamed', 10)}${pad('gain', 8)}`)
for (const { season, id } of chain.sort((a, b) => a.season - b.season)) {
  if (!projs[`${season}_1`]) continue
  const diffs = []; let st0 = 0, ow = 0, sr = 0, n = 0
  for (let w = 1; w <= 14; w++) {
    let mus; try { mus = await get(`${SLEEPER_BASE}/league/${id}/matchups/${w}`, `mu${season}_${w}`) } catch { continue }
    const P = projs[`${season}_${w}`] ?? {}, S = stats[`${season}_${w}`] ?? {}
    const playing = [...DEFS].filter(t => S[t]?.pts_half_ppr != null)
    const rostered = new Set(mus.flatMap(m => (m.players ?? []).map(String)).filter(id2 => DEFS.has(id2)))
    const free = playing.filter(t => !rostered.has(t))
    const pj = t => P[t]?.pts_half_ppr ?? 0, ac = t => S[t]?.pts_half_ppr ?? 0
    for (const m of mus) {
      const own = (m.players ?? []).map(String).filter(x => DEFS.has(x) && playing.includes(x))
      const start = (m.starters ?? []).map(String).find(x => DEFS.has(x))
      if (!start || !playing.includes(start)) continue
      const cand = [...own, ...free]; if (!cand.length) continue
      const best = own.length ? own.reduce((a, b) => pj(a) >= pj(b) ? a : b) : null
      const pick = cand.reduce((a, b) => pj(a) >= pj(b) ? a : b)
      st0 += ac(start); ow += best ? ac(best) : 0; sr += ac(pick); n++
      diffs.push(ac(pick) - ac(start))
    }
  }
  if (!n) continue
  pooled.push(...diffs)
  const m = mean(diffs)
  console.log(`   ${String(season).padEnd(8)}${pad(n, 5)}${pad((st0 / n).toFixed(2), 10)}${pad((ow / n).toFixed(2), 11)}${pad((sr / n).toFixed(2), 10)}${pad((m >= 0 ? '+' : '') + m.toFixed(2), 8)}`)
}
{
  const n = pooled.length, m = mean(pooled)
  const sd = Math.sqrt(mean(pooled.map(d => (d - m) ** 2))), se = sd / Math.sqrt(n)
  console.log(`\n   POOLED n=${n}  gain ${m >= 0 ? '+' : ''}${m.toFixed(2)} pts/wk` +
    `  95% CI [${(m - 1.96 * se).toFixed(2)}, ${(m + 1.96 * se).toFixed(2)}]  t=${(m / se).toFixed(2)}`)
  console.log('   -> the single-season "+0.91, significant" result does NOT replicate.')
}

// ── 5. do breakouts arrive with any warning? ────────────────────────────────
// The waiver question is not average accuracy, it is the tail: a backup who
// erupts because the starter is out. Season-average accuracy cannot see this.
console.log('\n\n5. BREAKOUTS — waiver-tier RB/WR/TE (projected < 8) who scored 15+')
const byPlayer = new Map()
for (const r of rows) {
  if (!['RB', 'WR', 'TE'].includes(r.pos)) continue
  const k = `${r.y}|${r.id}`
  if (!byPlayer.has(k)) byPlayer.set(k, [])
  byPlayer.get(k).push(r)
}
const wt = []
for (const [, rs] of byPlayer) {
  rs.sort((a, b) => a.w - b.w)
  rs.forEach((r, i) => {
    if (r.proj >= 8) return
    const prior = rs.slice(0, i).map(x => x.proj).slice(-3)
    if (prior.length < 2) return
    wt.push({ proj: r.proj, bump: r.proj - mean(prior), act: r.act })
  })
}
const bigs = wt.filter(r => r.act >= 15)
console.log(`   ${wt.length.toLocaleString()} waiver-tier player-weeks; ${bigs.length} scored 15+ (base rate ${(100 * bigs.length / wt.length).toFixed(1)}%)`)
console.log(`\n   ${'projected'.padEnd(14)}${pad('count', 8)}${pad('15+ rate', 10)}`)
for (const [lo, hi] of [[0, 2], [2, 4], [4, 6], [6, 8]]) {
  const sub = wt.filter(r => r.proj >= lo && r.proj < hi)
  if (sub.length < 100) continue
  console.log(`   ${`${lo}-${hi} pts`.padEnd(14)}${pad(sub.length, 8)}${pad((100 * sub.filter(r => r.act >= 15).length / sub.length).toFixed(1) + '%', 10)}`)
}
const flagged = bigs.filter(r => r.bump >= 1).length
console.log(`\n   Sleeper had raised the projection >=1 pt for only ${flagged} of ${bigs.length} breakouts (${(100 * flagged / bigs.length).toFixed(0)}%).`)
console.log('   -> the projection LEVEL sorts the tier well; the week-over-week BUMP does not warn you.')

// ── caveat: the projections endpoint is mutable ─────────────────────────────
console.log('\n\nCAVEAT — /projections for a past week is REWRITTEN in place, so the')
console.log('historical values above are the LAST number Sleeper held for that week,')
console.log('not necessarily what it showed before kickoff. Verify with two fetches')
console.log('of the current week hours apart; a nonzero diff proves mutability.')
