#!/usr/bin/env node
// Dev/diagnostic tool. Runs ONLY from the `probe_only` path of
// .github/workflows/rookie-intel.yml, because it needs the CFBD_API_KEY secret
// and a repo secret is not readable from a dev machine or an agent session.
// Nothing in the app or the daily pipeline imports it.
//
// It exists to answer ONE question before any college-production code is
// written: **can CFBD be joined to our rookies by ID, or only by name?**
//
// The build plan assumed `cfb_id` was the join. It is not: nflverse's
// `cfb_player_id` is a sports-reference SLUG ("ashton-jeanty-1") while CFBD
// keys athletes by a numeric id. The candidate ID bridge is ESPN's athlete id,
// which we already carry in nflverse `players.csv` and in Sleeper's own
// `espn_id`. If CFBD's athlete id IS the ESPN athlete id, college production
// joins by ID end to end, exactly like every other feed here. If it is not,
// the only bridge left is a name match, which this pipeline does not do
// unguarded (CLAUDE.md: Jordan Love vs Jeremiyah Love).
//
// THE KEY IS NEVER PRINTED. Only status codes, response key names, ids that
// are already public, and counts.

const CFBD = 'https://api.collegefootballdata.com'
const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const KEY = (process.env.CFBD_API_KEY || '').trim()

// The class whose college careers are fully in the past, so every endpoint has
// real data. 2026 rookies played in 2025 and would work too; 2025 is safer.
const PROBE_SEASON = 2025
const PROBE_CLASS = '2025'
const SAMPLE = 15

let failures = 0
const fail = msg => { failures++; console.error(`  FAIL: ${msg}`) }

async function cfbd(path) {
  const res = await fetch(`${CFBD}${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  })
  const body = res.ok ? await res.json() : await res.text().catch(() => '')
  return { status: res.status, body, headers: res.headers }
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
  return rows.filter(r => r.length === head.length)
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}
const get = async (url) => {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.text()
}
const keysOf = obj => (obj && typeof obj === 'object' ? Object.keys(obj).join(', ') : String(obj))

// ── 0. Is the secret even present and valid? ────────────────────────────────
console.log('=== 0. auth ===')
if (!KEY) {
  console.error('  CFBD_API_KEY is empty or unset in this run.')
  console.error('  Check: repo Settings > Secrets and variables > Actions >')
  console.error('  Repository secrets, named exactly CFBD_API_KEY.')
  process.exit(1)
}
console.log(`  key present: ${KEY.length} chars` +
  (/^bearer\s/i.test(KEY) ? '  <-- WARNING: the value starts with "Bearer ". Store the key ALONE.' : ''))
{
  const { status, body } = await cfbd(`/teams?year=${PROBE_SEASON}`)
  console.log(`  GET /teams?year=${PROBE_SEASON} -> ${status}` +
    (Array.isArray(body) ? ` (${body.length} teams)` : ''))
  if (status === 401) {
    console.error('  401 Unauthorized — the key is wrong, expired, or has a stray prefix/space.')
    process.exit(1)
  }
  if (status !== 200) { fail(`unexpected status ${status}: ${String(body).slice(0, 200)}`); process.exit(1) }
}

// ── 1. Build the truth set: real NFL rookies with a known ESPN athlete id ────
console.log('\n=== 1. truth set from nflverse (pfr_id -> espn_id) ===')
const picks = parseCsv(await get(`${NFLVERSE}/draft_picks/draft_picks.csv`))
  .filter(r => ['QB', 'RB', 'WR', 'TE'].includes(r.position) && r.season === PROBE_CLASS)
const playersCsv = parseCsv(await get(`${NFLVERSE}/players/players.csv`))
const espnByPfr = new Map()
for (const p of playersCsv) if (p.pfr_id?.trim() && p.espn_id?.trim()) espnByPfr.set(p.pfr_id.trim(), p.espn_id.trim())

const truth = picks
  .map(p => ({
    name: p.pfr_player_name,
    pos: p.position,
    pick: Number(p.pick),
    college: p.college,
    cfbSlug: p.cfb_player_id,          // the sports-reference slug the plan assumed
    espnId: espnByPfr.get((p.pfr_player_id || '').trim()) ?? null,
  }))
  .filter(r => r.espnId)
  .sort((a, b) => a.pick - b.pick)
console.log(`  ${PROBE_CLASS} drafted skill players: ${picks.length}, ` +
  `${truth.length} carry an ESPN athlete id in players.csv`)
console.log(`  nflverse cfb_player_id is a SLUG, e.g. ${truth[0]?.cfbSlug} — not a CFBD numeric id`)

// ── 2. THE JOIN TEST — is CFBD's athlete id the ESPN athlete id? ────────────
// /player/search is used HERE ONLY, as the diagnostic bootstrap: it is the one
// way to find CFBD's record for a player we already know. If the ids match,
// nothing shipped ever needs this endpoint.
console.log('\n=== 2. THE JOIN TEST: does CFBD athlete id == ESPN athlete id? ===')
const sample = truth.slice(0, SAMPLE)
let matched = 0, mismatched = 0, notFound = 0, ambiguous = 0
let searchShapePrinted = false
for (const p of sample) {
  const { status, body } = await cfbd(`/player/search?searchTerm=${encodeURIComponent(p.name)}`)
  if (status !== 200 || !Array.isArray(body)) { fail(`/player/search -> ${status}`); break }
  if (!searchShapePrinted && body[0]) {
    console.log(`  /player/search row keys: ${keysOf(body[0])}`)
    searchShapePrinted = true
  }
  // Position-guarded, exactly as the pipeline's own name fallback is guarded.
  const hits = body.filter(h => (h.position || '').toUpperCase() === p.pos)
  if (!hits.length) { notFound++; console.log(`    ${p.name.padEnd(22)} ${p.pos}  no ${p.pos} hit`); continue }
  if (hits.length > 1) ambiguous++
  const cfbdId = String(hits[0].id ?? '')
  const same = cfbdId === p.espnId
  if (same) matched++; else mismatched++
  console.log(`    ${p.name.padEnd(22)} ${p.pos}  cfbd=${cfbdId.padEnd(8)} espn=${String(p.espnId).padEnd(8)} ` +
    `${same ? 'MATCH' : 'differ'}${hits.length > 1 ? `  (${hits.length} same-position hits)` : ''}`)
}
console.log(`\n  matched ${matched} / mismatched ${mismatched} / no hit ${notFound} (n=${sample.length}, ambiguous ${ambiguous})`)
const idJoinWorks = matched > 0 && mismatched === 0
console.log(idJoinWorks
  ? '  VERDICT: CFBD athlete id IS the ESPN athlete id. College production can join by ID\n' +
    '           end to end (pfr_id -> espn_id -> CFBD), no name matching anywhere.'
  : '  VERDICT: the ids are NOT the same. A shipped join would need name matching,\n' +
    '           which this pipeline does not do unguarded. Report before building 3b.')

// ── 3. The production payload — does it carry the athlete id? ───────────────
// This is the second load-bearing question. A dominator rating needs a
// player's share of his TEAM's production, so we need per-player season stats
// that we can (a) attribute to a player BY ID and (b) sum within a team.
//
// Probe v1 learned that querying by `team=` returns 0 rows, because CFBD's
// team names are its own ("Miami", not nflverse's "Miami (FL)") — a
// name-matched team join we do not want anyway. Omitting `team` returns the
// entire FBS for a year in one call, which is both cheaper and ID-clean.
console.log('\n=== 3. /stats/player/season, whole-FBS per category ===')
const statRows = new Map()   // category -> rows
for (const category of ['receiving', 'rushing']) {
  const t0 = Date.now()
  const { status, body, headers } = await cfbd(`/stats/player/season?year=${PROBE_SEASON}&category=${category}`)
  const ms = Date.now() - t0
  if (status !== 200 || !Array.isArray(body)) { fail(`${category} -> ${status}: ${String(body).slice(0, 200)}`); continue }
  statRows.set(category, body)
  console.log(`  ${category}: ${status} · ${body.length} rows · ${ms}ms`)
  console.log(`    keys: ${keysOf(body[0])}`)
  console.log(`    sample: ${JSON.stringify(body[0])}`)
  const types = [...new Set(body.map(r => r.statType))].sort()
  console.log(`    statTypes: ${types.join(', ')}`)
  const idKey = ['playerId', 'player_id', 'athleteId', 'id'].find(k => body[0][k] != null)
  console.log(`    athlete id field: ${idKey ?? 'NONE — rows are name-only'}`)
  const limit = headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit')
  const remain = headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining')
  if (limit || remain) console.log(`    rate limit: ${remain ?? '?'} of ${limit ?? '?'} remaining`)
}

// ── 4. Coverage: how many of OUR rookies are actually in that payload? ──────
// The join is only useful if it lands. Measured against the whole draft class,
// by ID, with no name matching.
console.log('\n=== 4. coverage of the ' + PROBE_CLASS + ' class, joined BY ID ===')
const rec = statRows.get('receiving') ?? []
const rush = statRows.get('rushing') ?? []
const idKey = ['playerId', 'player_id', 'athleteId', 'id'].find(k => rec[0]?.[k] != null)
if (!idKey) {
  fail('no athlete id on the stats rows — a shipped join would need name matching')
} else {
  const seen = new Set([...rec, ...rush].map(r => String(r[idKey])))
  const hit = truth.filter(p => seen.has(String(p.espnId)))
  console.log(`  ${hit.length}/${truth.length} of the ${PROBE_CLASS} class appear in the ${PROBE_SEASON} payload by ESPN id`)
  console.log(`  (a rookie drafted in ${PROBE_CLASS} played his last college season in ${PROBE_SEASON - 1};`)
  console.log(`   ${PROBE_SEASON} is used here only to prove the join, so a partial hit rate is expected)`)
  const byPos = {}
  for (const p of truth) (byPos[p.pos] ??= [0, 0])[seen.has(String(p.espnId)) ? 0 : 1]++
  console.log('  by position: ' + Object.entries(byPos).map(([k, [a, b]]) => `${k} ${a}/${a + b}`).join('  '))

  // Team totals: can a denominator be built by summing within team?
  const teamKey = ['team'].find(k => rec[0]?.[k] != null)
  console.log(`  team field on a row: ${teamKey ?? 'NONE'} — ` +
    (teamKey ? 'team totals are a group-by, no extra call' : 'NO denominator without another call'))
}

// ── 5. Per-player season overview (the other candidate shape) ───────────────
console.log('\n=== 5. /player/season/overview needs a playerId — does an ESPN id work? ===')
{
  const probeId = truth.find(p => p.espnId)?.espnId
  const { status, body } = await cfbd(`/player/season/overview?playerId=${probeId}`)
  console.log(`  playerId=${probeId} -> ${status}` + (Array.isArray(body) ? ` · ${body.length} rows` : ''))
  if (status === 200 && Array.isArray(body) && body[0]) console.log(`    keys: ${keysOf(body[0])}`)
  else if (status !== 200) console.log(`    body: ${String(body).slice(0, 200)}`)
  console.log('  NOTE: per-player endpoints cost one call each (~80/class/season).')
  console.log('  The whole-FBS category call above is 1 call per (year, category) and is preferred.')
}

console.log(`\n=== done, ${failures} failure(s) ===`)
console.log(`JOIN_BY_ID=${idJoinWorks ? 'yes' : 'no'}`)
