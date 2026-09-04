#!/usr/bin/env node
// Dev/diagnostic tool. Runs ONLY from the `probe_only` path of
// .github/workflows/rookie-intel.yml, because it needs the CFBD_API_KEY secret
// and a repo secret is not readable from a dev machine or an agent session.
// Nothing in the app or the daily pipeline imports it.
//
// It answers the questions that decide whether college production can be
// added at all, BEFORE any of it is written:
//
//   Q1  Can CFBD be joined to our rookies BY ID?
//       ANSWERED YES, run 33929621664 (2026-09-04): CFBD's athlete id IS the
//       ESPN athlete id — 14 of 15 exact matches on the 2025 draft class,
//       zero mismatches. The build plan's assumption that `cfb_id` was the
//       join was wrong (nflverse's cfb_player_id is a sports-reference slug,
//       "ashton-jeanty-1"), but espn_id — which we already carry in nflverse
//       players.csv AND in Sleeper's own player DB — bridges it cleanly.
//       That test is kept below behind --join so it can be re-run, but it is
//       OFF by default: it costs one /player/search per player and the answer
//       is already recorded here.
//
//   Q2  Do the season-stat rows carry that id, or only a player's name?
//       If they are name-only the whole approach collapses regardless of Q1.
//       This is what the default run measures.
//
// Also learned in run 1: querying /stats/player/season with `team=` returns 0
// rows, because CFBD's team names are its own ("Miami", not nflverse's
// "Miami (FL)"). That would be a name-matched TEAM join, which we want no more
// than a name-matched player join. Omitting `team` returns the whole FBS for a
// year in one call, which is both ID-clean and far cheaper.
//
// THE KEY IS NEVER PRINTED — only status codes, already-public ids, counts.
//
// Usage (as workflow inputs):  probe_only=true          -> Q2
//                              probe_only=true, --join   -> Q1 as well

const CFBD = 'https://api.collegefootballdata.com'
const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download'
const KEY = (process.env.CFBD_API_KEY || '').trim()
const RUN_JOIN_TEST = process.argv.includes('--join')

// A rookie drafted in 2025 played his last college season in 2024, so 2024 is
// the year whose payload should actually contain the class.
const COLLEGE_SEASON = 2024
const DRAFT_CLASS = '2025'
const CALL_TIMEOUT_MS = 45000

let failures = 0
const fail = msg => { failures++; console.error(`  FAIL: ${msg}`) }
const keysOf = o => (o && typeof o === 'object' ? Object.keys(o).join(', ') : String(o))

// Every call announces itself BEFORE it goes out, so a hang is visible in the
// log at the exact request that caused it. Probe v2 stalled with no output and
// had to be cancelled blind; that is a diagnostic failing at its one job.
async function cfbd(path, { quiet = false } = {}) {
  if (!quiet) process.stdout.write(`    -> GET ${path.slice(0, 90)} … `)
  const t0 = Date.now()
  try {
    const res = await fetch(`${CFBD}${path}`, {
      headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
    const body = res.ok ? await res.json() : await res.text().catch(() => '')
    if (!quiet) console.log(`${res.status} in ${Date.now() - t0}ms` +
      (Array.isArray(body) ? ` (${body.length} rows)` : ''))
    return { status: res.status, body, headers: res.headers }
  } catch (err) {
    if (!quiet) console.log(`ERROR after ${Date.now() - t0}ms: ${err.name} ${err.message}`)
    // A Map stands in for Headers here so the caller's `.get()` still works
    // without adding Headers to the lint config's globals for one error path.
    return { status: 0, body: '', headers: new Map(), error: err }
  }
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
async function getText(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.text()
}

// ── 0. Auth ─────────────────────────────────────────────────────────────────
console.log('=== 0. auth ===')
if (!KEY) {
  console.error('  CFBD_API_KEY is empty or unset in this run.')
  console.error('  Check: repo Settings > Secrets and variables > Actions >')
  console.error('  Repository secrets, named exactly CFBD_API_KEY.')
  process.exit(1)
}
console.log(`  key present: ${KEY.length} chars` +
  (/^bearer\s/i.test(KEY) ? '  <-- WARNING: value starts with "Bearer ". Store the key ALONE.' : ''))
{
  const { status, body } = await cfbd('/teams?year=2025')
  if (status === 401) {
    console.error('  401 Unauthorized — wrong key, expired, or a stray prefix/space.')
    process.exit(1)
  }
  if (status !== 200) { fail(`/teams -> ${status}: ${String(body).slice(0, 200)}`); process.exit(1) }
}

// ── 1. Truth set: real NFL rookies with a known ESPN athlete id ─────────────
console.log(`\n=== 1. truth set — the ${DRAFT_CLASS} draft class, pfr_id -> espn_id ===`)
const picks = parseCsv(await getText(`${NFLVERSE}/draft_picks/draft_picks.csv`))
  .filter(r => ['QB', 'RB', 'WR', 'TE'].includes(r.position) && r.season === DRAFT_CLASS)
const espnByPfr = new Map()
for (const p of parseCsv(await getText(`${NFLVERSE}/players/players.csv`))) {
  if (p.pfr_id?.trim() && p.espn_id?.trim()) espnByPfr.set(p.pfr_id.trim(), p.espn_id.trim())
}
const truth = picks.map(p => ({
  name: p.pfr_player_name,
  pos: p.position,
  pick: Number(p.pick),
  cfbSlug: p.cfb_player_id,
  espnId: espnByPfr.get((p.pfr_player_id || '').trim()) ?? null,
})).filter(r => r.espnId).sort((a, b) => a.pick - b.pick)
console.log(`  ${picks.length} drafted skill players, ${truth.length} carry an ESPN athlete id`)
console.log(`  nflverse cfb_player_id is a SLUG (e.g. ${truth[0]?.cfbSlug}) — not a CFBD id`)

// ── 2. Q1, only on request ──────────────────────────────────────────────────
if (RUN_JOIN_TEST) {
  console.log('\n=== 2. Q1: does CFBD athlete id == ESPN athlete id? ===')
  let matched = 0, mismatched = 0, missed = 0
  for (const p of truth.slice(0, 15)) {
    const { status, body } = await cfbd(`/player/search?searchTerm=${encodeURIComponent(p.name)}`, { quiet: true })
    if (status !== 200 || !Array.isArray(body)) { fail(`/player/search -> ${status}`); break }
    const hits = body.filter(h => (h.position || '').toUpperCase() === p.pos)   // position-guarded
    if (!hits.length) { missed++; continue }
    String(hits[0].id) === p.espnId ? matched++ : mismatched++
  }
  console.log(`  matched ${matched} / mismatched ${mismatched} / no hit ${missed}`)
} else {
  console.log('\n=== 2. Q1 skipped — already answered (see the header). Pass --join to re-run. ===')
}

// ── 3. Q2: the production payload ───────────────────────────────────────────
console.log(`\n=== 3. Q2: /stats/player/season for ${COLLEGE_SEASON}, whole FBS, per category ===`)
const statRows = new Map()
for (const category of ['receiving', 'rushing']) {
  const { status, body, headers } = await cfbd(`/stats/player/season?year=${COLLEGE_SEASON}&category=${category}`)
  if (status !== 200 || !Array.isArray(body)) { fail(`${category} -> ${status}: ${String(body).slice(0, 200)}`); continue }
  statRows.set(category, body)
  console.log(`    keys: ${keysOf(body[0])}`)
  console.log(`    sample: ${JSON.stringify(body[0])}`)
  console.log(`    statTypes: ${[...new Set(body.map(r => r.statType))].sort().join(', ')}`)
  const idKey = ['playerId', 'player_id', 'athleteId', 'id'].find(k => body[0][k] != null)
  console.log(`    ATHLETE ID FIELD: ${idKey ?? 'NONE — rows are name-only'}`)
  console.log(`    team field: ${body[0].team != null ? 'team' : 'NONE'}` +
    ` (the dominator-rating denominator is a group-by if present)`)
  const remain = headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining')
  const limit = headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit')
  if (remain || limit) console.log(`    rate limit: ${remain ?? '?'} of ${limit ?? '?'} remaining`)
}

// ── 4. Coverage — and an adversarial check on it ────────────────────────────
// A set-membership count is easy to fool. Probe v3 reported 85/85 (100%),
// including QB 14/14 in RECEIVING+RUSHING payloads, while the sample rows
// showed 6-digit playerIds (146583) against 7-digit ESPN ids (4685415). Those
// two facts cannot both be true, so the count is not trusted until named rows
// come back with the right names on them.
console.log(`\n=== 4. coverage — ${DRAFT_CLASS} class in the ${COLLEGE_SEASON} payload, BY ID ===`)
const rows = [...(statRows.get('receiving') ?? []), ...(statRows.get('rushing') ?? [])]
const idKey = ['playerId', 'player_id', 'athleteId', 'id'].find(k => rows[0]?.[k] != null)
if (!idKey) {
  fail('no athlete id on the stat rows — a shipped join would need name matching. STOP.')
} else {
  const byId = new Map()
  for (const r of rows) {
    const k = String(r[idKey])
    if (!byId.has(k)) byId.set(k, r)
  }
  console.log(`  ${rows.length} rows, ${byId.size} distinct ${idKey}s`)

  // What do CFBD's ids actually look like? ESPN college athlete ids for the
  // modern recruiting era are 7 digits starting with 4.
  const nums = [...byId.keys()].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  const espnShaped = nums.filter(n => n >= 4000000).length
  console.log(`  ${idKey} range: ${nums[0]} … ${nums.at(-1)}; ` +
    `${espnShaped}/${nums.length} (${Math.round(100 * espnShaped / nums.length)}%) are ESPN-shaped (>= 4,000,000)`)

  const hit = truth.filter(p => byId.has(String(p.espnId)))
  console.log(`  set-membership count: ${hit.length}/${truth.length}`)

  // THE DECISIVE CHECK: for named players, does the row found under their ESPN
  // id actually belong to them? A matching id with the wrong name means the
  // count above is an artifact, not a join.
  console.log('\n  named spot-check (id -> whose row came back?):')
  let right = 0, wrong = 0, absent = 0
  for (const p of truth.slice(0, 12)) {
    const row = byId.get(String(p.espnId))
    if (!row) { absent++; console.log(`    ${p.name.padEnd(22)} ${p.pos}  espn=${p.espnId}  ABSENT`); continue }
    const same = (row.player || '').toLowerCase().replace(/[^a-z]/g, '')
      === p.name.toLowerCase().replace(/[^a-z]/g, '')
    same ? right++ : wrong++
    console.log(`    ${p.name.padEnd(22)} ${p.pos}  espn=${String(p.espnId).padEnd(8)} -> ` +
      `"${row.player}" (${row.position}, ${row.team}) ${same ? 'CORRECT' : '*** WRONG PLAYER ***'}`)
  }
  console.log(`\n  correct ${right} / WRONG ${wrong} / absent ${absent}`)
  if (wrong > 0) {
    fail('ESPN ids resolve to the WRONG players — CFBD playerId is NOT the ESPN athlete id ' +
      'on this endpoint. The stats join is name-based, and 3b is blocked.')
  } else if (right === 0) {
    fail('no ESPN id resolved to a row at all — the stats endpoint uses a different id space.')
  } else {
    console.log('  VERDICT: /stats/player/season playerId IS the ESPN athlete id. ' +
      'College production joins by ID.')
  }
  console.log(`  JOIN_VERIFIED=${right > 0 && wrong === 0 ? 'yes' : 'no'}`)
}

console.log(`\n=== done, ${failures} failure(s) ===`)
console.log(`STATS_HAVE_ID=${idKey ? 'yes' : 'no'}`)
