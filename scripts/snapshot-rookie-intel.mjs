#!/usr/bin/env node
// Publishes the rookie-research feed powering Draft › Research.
//
// Runs in GitHub Actions (.github/workflows/rookie-intel.yml); the app reads
// the published file from the rookie-intel branch via raw.githubusercontent
// (which sends CORS `*`). This exists because the two signals that actually
// predict a rookie season — NFL draft capital and the week-1 depth chart —
// live in nflverse CSVs that are CORS-blocked AND ~39MB. Aggregating here
// keeps the no-backend architecture and ships the phone a ~40KB derived file.
//
// Signal validation lives in docs/analysis/rookie-research-signals-2026-08.md
// (n=396 drafted skill rookies, 2021-2025). Two results shape this script:
//   - draft capital + week-1 depth rank blend to rho +0.664; either alone is
//     weaker (+0.598 / +0.541).
//   - PRESEASON PRODUCTION IS A TRAP (rho -0.195) — the best rookies sit in
//     August. Nothing preseason-derived is emitted here on purpose.
//
// The messy join (nflverse -> Sleeper) is resolved HERE, server-side, exactly
// as the news pipeline resolves athleteIds server-side. The app receives clean
// Sleeper player IDs and never name-matches.
//
// Format is columnar to stay mobile-sized:
//   { updatedAt, season, dates: ['YYYY-MM-DD', ...],
//     players: { sleeperId: { name, pos, team, round, pick, rank, slot,
//                             ranks: [r|null, ...], ahead: [...] } } }
// `ranks` is aligned to `dates` (one column per ISO week — daily snapshots
// would be ~7x the bytes for no extra signal).

import { writeFileSync } from 'node:fs'

const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const SLEEPER_STATE = 'https://api.sleeper.app/v1/state/nfl'
const SLEEPER_PLAYERS = 'https://api.sleeper.app/v1/players/nfl'

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
// 2025+ depth charts split WRs by alignment; rank 1 at any alignment = starter.
const OFFENSE_SLOTS = new Set(['QB', 'RB', 'TE', 'WR', 'LWR', 'RWR', 'SWR'])
const MAX_AHEAD = 3      // teammates listed above a rookie at his slot
const MAX_WEEKS = 26     // rolling window of weekly columns (~6 months)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

async function get(url, kind = 'json') {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${url}`)
    err.status = res.status
    throw err
  }
  return kind === 'json' ? res.json() : res.text()
}

// Minimal RFC4180 splitter for one line — only used when a fast split on
// commas disagrees with the header width (quoted college/team names).
function splitQuoted(line) {
  const out = []
  let field = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(field); field = '' }
    else field += c
  }
  out.push(field)
  return out
}

// Streams a CSV line-by-line, handing each row to `onRow` as an index getter.
// Deliberately avoids materializing 413k row objects — the depth-chart file is
// ~39MB and the Actions runner should not carry it as a heap of objects.
function eachRow(text, onRow) {
  const lines = text.split('\n')
  const header = splitQuoted(lines[0].replace(/\r$/, ''))
  const width = header.length
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (!line) continue
    let cells = line.split(',')
    if (cells.length !== width) cells = splitQuoted(line)
    if (cells.length !== width) continue
    onRow(cells, idx)
  }
}

// Name keys. Suffixes are the dominant mismatch between nflverse's
// pfr_player_name and Sleeper's full_name ("Omar Cooper Jr." vs "Omar
// Cooper"), so they are stripped; the initial+surname key additionally
// catches nicknames ("Matthew Hibner" vs "Matt Hibner") and is only ever
// consulted when it is unambiguous within the rookie class.
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g
const norm = s => (s || '').toLowerCase().replace(/\./g, '').replace(SUFFIX, '').replace(/[^a-z]/g, '')
function initialKey(name) {
  const parts = (name || '').toLowerCase().replace(/\./g, '').replace(SUFFIX, '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  return `${parts[0][0]}|${parts[parts.length - 1].replace(/[^a-z]/g, '')}`
}
// ISO week key, so one column per week rather than per day.
function weekKey(date) {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1) // back to Monday
  return d.toISOString().slice(0, 10)
}

// ── Season ───────────────────────────────────────────────────────────────────
const state = await get(SLEEPER_STATE)
const season = String(state?.season || new Date().getUTCFullYear())
console.log(`Season: ${season} (${state?.season_type})`)

// ── The rookie class, from Sleeper (the app's own definition) ────────────────
const playerDB = await get(SLEEPER_PLAYERS)
const rookies = new Map()       // sleeperId -> { name, pos, team }
const byName = new Map()        // normalized name -> sleeperId (rookies only)
const byInitial = new Map()     // 'f|surname' -> sleeperId | null when ambiguous
for (const [pid, p] of Object.entries(playerDB)) {
  const isRookie = p?.metadata?.rookie_year === season || p?.years_exp === 0
  if (!isRookie || !SKILL.has(p.position) || !p.full_name) continue
  rookies.set(pid, { name: p.full_name, pos: p.position, team: p.team || null })
  byName.set(norm(p.full_name), pid)
  const ik = initialKey(p.full_name)
  if (ik) byInitial.set(ik, byInitial.has(ik) ? null : pid)
}

// Resolve an nflverse name to a Sleeper rookie id: exact normalized name
// first, then the unambiguous initial+surname key.
//
// `pos` is REQUIRED for every name-based lookup and is not optional
// politeness. The name indices are built from rookies only, so a VETERAN who
// shares a surname and first initial with a rookie looks unambiguous and
// resolves straight onto him: Jordan Love (QB, GB) matched Jeremiyah Love
// (RB, ARI) and stamped a quarterback's depth chart onto a running back's
// card. Requiring the positions to agree is what makes the fallback safe.
// A gsis_id hit came from the roster crosswalk and needs no guard.
function resolveName(name, pos) {
  const exact = byName.get(norm(name))
  if (exact) return rookies.get(exact)?.pos === pos ? exact : undefined
  const ik = initialKey(name)
  const guess = ik && byInitial.get(ik)
  return guess && rookies.get(guess)?.pos === pos ? guess : undefined
}

// Depth-chart alignment slots collapse to a fantasy position for that guard.
const SLOT_POS = { QB: 'QB', RB: 'RB', TE: 'TE', WR: 'WR', LWR: 'WR', RWR: 'WR', SWR: 'WR' }
if (rookies.size === 0) {
  console.error(`No ${season} rookies found in the Sleeper player DB — aborting`)
  process.exit(1)
}
console.log(`Sleeper rookie class: ${rookies.size} skill players`)

// ── nflverse roster: the gsis_id -> sleeper_id crosswalk ────────────────────
// This column is why the app never has to name-match. Coverage is partial
// (UDFAs lack a sleeper_id), so name matching backfills the remainder here.
const gsisToSleeper = new Map()
try {
  const rosterCsv = await get(`${NFLVERSE}/rosters/roster_${season}.csv`, 'text')
  eachRow(rosterCsv, (c, i) => {
    const sid = c[i.sleeper_id], gsis = c[i.gsis_id]
    if (sid && gsis && rookies.has(sid)) gsisToSleeper.set(gsis, sid)
    else if (gsis && c[i.full_name]) {
      const guess = resolveName(c[i.full_name], c[i.position])
      if (guess) gsisToSleeper.set(gsis, guess)
    }
  })
  console.log(`Roster crosswalk: ${gsisToSleeper.size} rookie gsis_ids resolved`)
} catch (err) {
  console.error(`Roster file unavailable (${err.message}) — depth charts will name-match only`)
}

// ── NFL draft capital ────────────────────────────────────────────────────────
const capital = new Map()  // sleeperId -> { round, pick }
try {
  const picksCsv = await get(`${NFLVERSE}/draft_picks/draft_picks.csv`, 'text')
  eachRow(picksCsv, (c, i) => {
    if (c[i.season] !== season) return
    // A gsis hit is authoritative; a name hit goes through resolveName's
    // position guard (the draft file covers all 257 picks, so an offensive
    // lineman can otherwise land his capital on a wide receiver's card).
    const byGsis = gsisToSleeper.get(c[i.gsis_id])
    let sid = byGsis
    if (!sid) {
      sid = resolveName(c[i.pfr_player_name], c[i.position])
    }
    if (!sid || !rookies.has(sid)) return
    capital.set(sid, { round: Number(c[i.round]) || null, pick: Number(c[i.pick]) || null })
  })
  console.log(`Draft capital: ${capital.size} rookies matched to an NFL pick`)
} catch (err) {
  console.error(`Draft picks unavailable (${err.message}) — capital omitted`)
}

// ── Depth charts: current standing, who's ahead, and the camp series ─────────
// One pass. For each (team, slot, week) keep the last snapshot of that week,
// so a rookie's `ranks` array shows his climb through camp.
const perWeek = new Map()   // sleeperId -> Map(weekKey -> {date, rank})
const groups = new Map()    // `${team}|${slot}` -> Map(gsis -> {date,rank,name})
let latestDate = ''
try {
  const dcCsv = await get(`${NFLVERSE}/depth_charts/depth_charts_${season}.csv`, 'text')
  eachRow(dcCsv, (c, i) => {
    const slot = c[i.pos_abb]
    if (!OFFENSE_SLOTS.has(slot)) return
    const gsis = c[i.gsis_id]
    const date = (c[i.dt] || '').slice(0, 10)
    if (!date) return
    const rank = Number(c[i.pos_rank])
    if (!Number.isFinite(rank)) return
    if (date > latestDate) latestDate = date

    // Full position group, for the "who is ahead of him" context.
    const gkey = `${c[i.team]}|${slot}`
    let g = groups.get(gkey)
    if (!g) { g = new Map(); groups.set(gkey, g) }
    const cur = g.get(gsis)
    if (!cur || date >= cur.date) g.set(gsis, { date, rank, name: c[i.player_name], slot })

    // Rookie-only weekly series.
    const sid = gsisToSleeper.get(gsis) ?? resolveName(c[i.player_name], SLOT_POS[slot])
    if (!sid || !rookies.has(sid)) return
    let w = perWeek.get(sid)
    if (!w) { w = new Map(); perWeek.set(sid, w) }
    const wk = weekKey(date)
    const prev = w.get(wk)
    if (!prev || date >= prev.date) w.set(wk, { date, rank, slot })
  })
  console.log(`Depth charts: ${perWeek.size} rookies tracked, latest snapshot ${latestDate}`)
} catch (err) {
  console.error(`Depth charts unavailable (${err.message}) — aborting, this is the primary signal`)
  process.exit(1)
}

// Prune each group to its latest snapshot only, then index by (gsis) the
// teammates ranked above him at the same slot.
const aheadByGsis = new Map()
for (const g of groups.values()) {
  const rows = [...g.entries()]
  if (!rows.length) continue
  const newest = rows.reduce((m, [, v]) => (v.date > m ? v.date : m), '')
  const live = rows.filter(([, v]) => v.date === newest).sort((a, b) => a[1].rank - b[1].rank)
  live.forEach(([gsis], i) => {
    aheadByGsis.set(gsis, live.slice(0, i).map(([, o]) => o.name).slice(-MAX_AHEAD))
  })
}
const aheadBySleeper = new Map()
for (const [gsis, names] of aheadByGsis) {
  const sid = gsisToSleeper.get(gsis)
  if (sid) aheadBySleeper.set(sid, names)
}

// ── Assemble the columnar output ─────────────────────────────────────────────
const dates = [...new Set([...perWeek.values()].flatMap(w => [...w.keys()]))]
  .sort()
  .slice(-MAX_WEEKS)
const dateIdx = new Map(dates.map((d, i) => [d, i]))

const players = {}
for (const [sid, meta] of rookies) {
  const w = perWeek.get(sid)
  const cap = capital.get(sid)
  // A rookie with neither a depth-chart row nor a draft pick carries no
  // signal at all — emitting him would just be padding the file.
  if (!w && !cap) continue

  const ranks = new Array(dates.length).fill(null)
  let current = null
  if (w) {
    for (const [wk, v] of w) {
      const i = dateIdx.get(wk)
      if (i != null) ranks[i] = v.rank
      if (!current || v.date > current.date) current = v
    }
  }
  players[sid] = {
    name: meta.name,
    pos: meta.pos,
    team: meta.team,
    round: cap?.round ?? null,
    pick: cap?.pick ?? null,
    rank: current?.rank ?? null,
    slot: current?.slot ?? null,
    ranks,
    ahead: aheadBySleeper.get(sid) ?? [],
  }
}

const out = {
  updatedAt: new Date().toISOString(),
  season,
  asOf: latestDate,
  dates,
  players,
  meta: {
    rookieClass: rookies.size,
    published: Object.keys(players).length,
    withCapital: capital.size,
    withDepth: perWeek.size,
  },
}

if (out.meta.published === 0) {
  console.error('No rookies carried any signal — keeping the previous feed')
  process.exit(1)
}

writeFileSync('rookie-intel.json', JSON.stringify(out))
const kb = (JSON.stringify(out).length / 1024).toFixed(0)
console.log(`Wrote rookie-intel.json: ${out.meta.published} rookies, ` +
  `${dates.length} weekly columns, ${kb}KB ` +
  `(${out.meta.withCapital} with capital, ${out.meta.withDepth} with depth)`)
