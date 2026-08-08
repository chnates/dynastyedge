#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// replay-live.mjs — dress-rehearse the app's LIVE surfaces before they happen
//
// Why this exists: DynastyEdge's entire live/in-season half had only ever been
// code-read, never executed (docs/open-items.md ACTIVE-1). Two one-shot
// deadlines — the rookie draft (one live moment per year) and Week 1 (when
// every `season_type === 'regular'` gate opens) — offer no second chance and
// no way to test in advance, because the app reads live Sleeper state.
//
// So this script lies to the app. It drives the REAL running app in headless
// Chromium (same interception trick as screenshot-app.mjs) but overlays a
// synthetic world on specific endpoints: a rookie draft advancing pick by pick,
// or a Week 1 regular season. Everything NOT overridden still comes from the
// live API, so the rest of the app stays honest.
//
// This complements, and does not replace, tests/draftLive.test.mjs and
// tests/projections.test.mjs — those pin the pure logic; this proves the
// components actually render it.
//
// ── Setup (same as screenshot-app.mjs) ────────────────────────────────────────
//   npm run dev &
//   mkdir -p /tmp/pw && ( cd /tmp/pw && npm i playwright-core )
//
// ── Usage ─────────────────────────────────────────────────────────────────────
//   node scripts/dev/replay-live.mjs --scenario draft
//   node scripts/dev/replay-live.mjs --scenario draft --stage clock
//   node scripts/dev/replay-live.mjs --scenario week1
//   node scripts/dev/replay-live.mjs --scenario week1 --week 6
//
// Flags: --scenario draft|week1 (required) · --stage pre|clock|mid|complete
//        (draft; default: walk all four) · --week N (week1; default 1) ·
//        --outdir DIR · --theme dark|light · --url BASE · --width N · --wait MS
//
// Draft stages map to the states the Tracker has never rendered:
//   pre      0 picks, order set          → capital card with real slots
//   clock    my first pick is next       → on-the-clock banner + Best Available
//   mid      partway through             → "N picks until yours" countdown
//   complete all 40 picks in             → recap: totals, steals, reaches
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const scenario = arg('scenario')
if (scenario !== 'draft' && scenario !== 'week1') {
  console.error('Usage: replay-live.mjs --scenario draft|week1 [--stage …] [--week N]')
  process.exit(1)
}
const stageArg = arg('stage')
const week     = Number(arg('week', 1))
const theme    = arg('theme', 'dark')
const base     = arg('url', 'http://localhost:5173/dynastyedge/')
const width    = Number(arg('width', 390))
const settle   = Number(arg('wait', 1400))
let outdir     = arg('outdir', join(REPO, '.screenshots', `replay-${scenario}`))
outdir = isAbsolute(outdir) ? outdir : join(process.cwd(), outdir)
mkdirSync(outdir, { recursive: true })

// League + draft identity (src/constants.js). MY_ROSTER is the seeded identity.
const LEAGUE_ID = '1313933520715907072'
const MY_OWNER  = '965787707299430400'
const MY_ROSTER = 6

// ── the synthetic world ───────────────────────────────────────────────────────

// Draft: replay this league's REAL 2025 rookie draft, relabelled as the 2026
// draft the app is looking for. Real payload shapes, real traded picks (24 of
// 40 changed hands — 2026 has 22 of 40, so the load is comparable).
const FIXTURE = JSON.parse(readFileSync(join(REPO, 'tests', 'fixtures', 'draft-2025.json'), 'utf8'))
const DRAFT_SEASON = '2026'
const DRAFT_ID = 'replay-draft'

// My picks on the REAL replayed board, trades included — the stages have to be
// derived from it, not guessed, or "on the clock" and "N picks until yours"
// land on the wrong pick numbers.
const TEAMS = FIXTURE.draft.settings.teams
const MY_OVERALLS = []
for (let round = 1; round <= FIXTURE.draft.settings.rounds; round++) {
  for (let slot = 1; slot <= TEAMS; slot++) {
    const original = FIXTURE.draft.slot_to_roster_id[slot]
    const traded = FIXTURE.tradedPicks.find(t => t.round === round && t.roster_id === original)
    const owner = traded ? traded.owner_id : original
    if (owner === MY_ROSTER) MY_OVERALLS.push((round - 1) * TEAMS + slot)
  }
}
// `clock`: my first pick is next. `mid`: at least 2 picks before my next one,
// so the countdown renders rather than the banner.
const MID_PICKS = (MY_OVERALLS.find(o => o >= 12) ?? MY_OVERALLS.at(-1)) - 3

const STAGES = {
  pre:      { status: 'pre_draft', picks: 0 },
  clock:    { status: 'drafting',  picks: MY_OVERALLS[0] - 1 },
  mid:      { status: 'drafting',  picks: Math.max(1, MID_PICKS) },
  complete: { status: 'complete',  picks: 40 },
}

function draftObject(stage) {
  return {
    ...FIXTURE.draft,
    draft_id: DRAFT_ID,
    season: DRAFT_SEASON,
    status: STAGES[stage].status,
    start_time: stage === 'pre' ? null : Date.now() - 600000,
    last_picked: STAGES[stage].picks ? Date.now() - 30000 : null,
  }
}
const draftPicks = stage => FIXTURE.picks.slice(0, STAGES[stage].picks)
  .map(p => ({ ...p, draft_id: DRAFT_ID }))
const draftTrades = () => FIXTURE.tradedPicks.map(t => ({ ...t, season: DRAFT_SEASON, draft_id: DRAFT_ID }))

// Week 1: a regular-season NFL state, plus a full league schedule. Weeks before
// `week` are played (deterministic scores so runs are comparable); `week` and
// later are posted-but-unplayed, which is what flips Playoff Odds to `active`.
const NFL_STATE_REGULAR = {
  week, leg: week, season: '2026', season_type: 'regular',
  league_season: '2026', previous_season: '2025', display_week: week,
  season_start_date: '2026-09-10', season_has_scores: true,
}

function seededScore(w, rosterId) {
  // mulberry32-ish: stable across runs so two captures are comparable.
  let t = (w * 2654435761 + rosterId * 40503) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const u = (((t ^ (t >>> 14)) >>> 0) % 10000) / 10000
  return Math.round((95 + u * 55) * 100) / 100 // 95–150 pts
}

function matchupsForWeek(w) {
  const rosters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  // Rotate pairings so the remaining schedule isn't the same game every week.
  const rot = [rosters[0], ...rosters.slice(1).map((_, i) => rosters[1 + ((i + w) % 9)])]
  const played = w < week
  return rot.map((rid, i) => ({
    roster_id: rid,
    matchup_id: Math.floor(i / 2) + 1,
    points: played ? seededScore(w, rid) : 0,
    players: [], starters: [], players_points: {},
  }))
}

// ── request overrides ─────────────────────────────────────────────────────────
// Returns a JSON body for URLs this scenario fakes, or null to pass through to
// the live API via curl. Keeping the override surface tiny is the point: every
// endpoint not listed here stays real.
let currentStage = 'pre'
function override(url) {
  if (scenario === 'draft') {
    if (url.endsWith(`/league/${LEAGUE_ID}/drafts`)) return [draftObject(currentStage)]
    if (url.endsWith(`/draft/${DRAFT_ID}`)) return draftObject(currentStage)
    if (url.endsWith(`/draft/${DRAFT_ID}/picks`)) return draftPicks(currentStage)
    if (url.endsWith(`/draft/${DRAFT_ID}/traded_picks`)) return draftTrades()
  }
  if (scenario === 'week1') {
    if (url.endsWith('/state/nfl')) return NFL_STATE_REGULAR
    const m = url.match(new RegExp(`/league/${LEAGUE_ID}/matchups/(\\d+)$`))
    if (m) return matchupsForWeek(Number(m[1]))
  }
  return null
}

// 2026 has no played weeks yet, so the NFL stats and schedule for a mid-season
// replay have to come from a season that does. Rewriting the URL (rather than
// synthesizing a payload) keeps these responses genuinely real — which is the
// whole point for matchup quality, whose join across stats → player DB →
// schedule is exactly what was broken. Both are remapped together so the
// opponent map and the stats agree on who played whom.
const STATS_SEASON = String(arg('stats-season', '2025'))
function rewrite(url) {
  if (scenario !== 'week1' || week <= 1) return null
  if (/\/stats\/nfl\/regular\/2026\/\d+$/.test(url)) {
    return url.replace('/regular/2026/', `/regular/${STATS_SEASON}/`)
  }
  if (/\/schedule\/nfl\/regular\/2026$/.test(url)) {
    return url.replace('/regular/2026', `/regular/${STATS_SEASON}`)
  }
  return null
}

// ── browser plumbing (mirrors screenshot-app.mjs — see its header for why) ─────
async function loadChromium() {
  try { return (await import('playwright-core')).chromium } catch { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_CORE_DIR || '/tmp/pw'
  return createRequire(join(dir, 'noop.js'))('playwright-core').chromium
}
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM && existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  for (const d of readdirSync(root).filter(x => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = join(root, d, 'chrome-linux', 'chrome')
    if (existsSync(exe)) return exe
  }
  throw new Error(`No Chromium found under ${root} — set PLAYWRIGHT_CHROMIUM`)
}

const chromium = await loadChromium()
const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
const ctx = await browser.newContext({
  viewport: { width, height: Number(arg('height', 900)) }, deviceScaleFactor: 2,
})

await ctx.addInitScript(([t, owner, roster]) => {
  /* eslint-disable no-undef */
  // This also runs on the about:blank hop between captures, where localStorage
  // is an opaque origin and throws — the app page is the only one that matters.
  try {
    localStorage.setItem('dynastyedge_identity_v1', JSON.stringify({ userId: owner, rosterId: roster }))
    localStorage.setItem('dynastyedge_theme', t)
  } catch { /* opaque origin (about:blank) */ }
  /* eslint-enable no-undef */
}, [theme === 'light' ? 'light' : 'dark', MY_OWNER, MY_ROSTER])

const TMP = tmpdir()
const seen = []
await ctx.route('**/*', async r => {
  const req = r.request()
  const url = req.url()
  if (url.includes('localhost') || url.includes('127.0.0.1')) return r.continue()
  if (req.method() !== 'GET') {
    return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' })
  }
  seen.push(url)
  const faked = override(url)
  if (faked !== null) {
    return r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify(faked),
    })
  }
  const tmp = join(TMP, `de_body_${randomUUID()}.bin`)
  const fetchUrl = rewrite(url) ?? url
  try {
    const ct = execFileSync('curl', ['-sS', '--max-time', '90', '-o', tmp, '-w', '%{content_type}', fetchUrl],
      { encoding: 'utf8', maxBuffer: 1e8 })
    await r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': ct || 'application/json' },
      body: readFileSync(tmp),
    })
  } catch { await r.abort() }
})

const page = await ctx.newPage()
const pageErrors = []
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)))

async function go(routePath, label) {
  const slug = String(routePath).replace(/^#?\/*/, '')
  // HashRouter: navigating between two #/routes on the same document is a
  // hash change, NOT a reload — the app's module caches (useSleeperDraft's in
  // particular) would survive and keep serving the previous stage. Blank the
  // page first so every capture starts from a genuinely cold app.
  await page.goto('about:blank')
  await page.goto(new URL(`#/${slug}`, base).href, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByLabel('Search players').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForTimeout(settle)
  const file = join(outdir, `${label}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const body = await page.locator('body').innerText()
  console.log(`  ✓ ${label} → ${file}`)
  return body
}

function has(body, needle) {
  return needle instanceof RegExp
    ? needle.test(body)
    : body.toLowerCase().includes(String(needle).toLowerCase())
}
function expect(body, needle, label) {
  const ok = has(body, needle)
  console.log(`      ${ok ? 'PASS' : 'FAIL'}  ${label} — expected "${needle}"`)
  return ok
}
// For "this must NOT be on screen" checks, so a pass doesn't print as FAIL.
function refute(body, needle, label) {
  const ok = !has(body, needle)
  console.log(`      ${ok ? 'PASS' : 'FAIL'}  ${label} — must not contain "${needle}"`)
  return ok
}

const results = []
if (scenario === 'draft') {
  const stages = stageArg ? [stageArg] : ['pre', 'clock', 'mid', 'complete']
  for (const s of stages) {
    if (!STAGES[s]) throw new Error(`unknown stage "${s}" (pre|clock|mid|complete)`)
    currentStage = s
    console.log(`\n▸ draft stage: ${s} (${STAGES[s].picks} picks, status ${STAGES[s].status})`)
    // A fresh page load re-reads the module cache from scratch, which is the
    // honest way to show a new draft state without faking the poll timer.
    const body = await go('/draft/tracker', `draft-${s}`)
    if (s === 'pre') {
      // Slot-level labels ("1.04") only appear when the order resolved — the
      // exact thing that was silently broken until 2026-08.
      results.push(expect(body, 'my draft capital', 'pre-draft capital card'))
      results.push(expect(body, /\d\.\d\d/, 'capital shows real slots, not "Rd N"'))
    }
    if (s === 'clock') {
      results.push(expect(body, "you're on the clock", 'on-the-clock banner'))
      results.push(expect(body, 'best overall', 'Best Available card'))
    }
    if (s === 'mid') results.push(expect(body, 'until yours', 'picks-until-yours countdown'))
    if (s === 'complete') {
      results.push(expect(body, 'draft recap', 'completion recap'))
      results.push(expect(body, 'full results', 'full results list'))
      // NOT asserted: "Biggest Steals"/"Reaches". Those grade a pick's slot
      // against the CURRENT rookie class's derived ADP, and this replay drafts
      // last year's rookies — who aren't in this year's class, so they carry no
      // ADP and the sections correctly stay hidden. buildRecap's steal/reach
      // banding is pinned on real deltas in tests/draftLive.test.mjs instead.
    }
  }
} else {
  console.log(`\n▸ week1 scenario: season_type=regular, week ${week}`)
  const lineup = await go('/my-team/lineup', 'week1-lineup')
  results.push(refute(lineup, 'offseason', 'Optimizer left the offseason placeholder'))
  // The regression that made this whole exercise worth running: the schedule
  // endpoint 404ing threw into useLineupData, and LineupOptimizer renders
  // ErrorState BEFORE its offseason check — so Week 1 showed an error box.
  results.push(refute(lineup, 'retry', 'Optimizer is not stuck on ErrorState'))
  results.push(expect(lineup, /\d+\.\d/, 'Optimizer shows weekly projected points'))
  if (week > 1) {
    // Matchup quality needs a PLAYED prior week; --week N>1 borrows 2025's
    // stats + schedule for it (see statsSeason below).
    results.push(expect(lineup, /EASY|TOUGH/, 'matchup quality resolves beyond Neutral'))
  }
  const league = await go('/league', 'week1-league-overview')
  results.push(expect(league, 'week', 'League Overview shows this week\'s matchups'))
  const odds = await go('/league/playoffs', 'week1-playoff-odds')
  results.push(refute(odds, 'odds activate', 'Playoff Odds left the preseason state'))
  results.push(expect(odds, /\d+%/, 'Playoff Odds shows simulated percentages'))
  await go('/trade', 'week1-trade-deadline')
  await go('/edge', 'week1-edge')
}

if (pageErrors.length) {
  console.log('\nPAGE ERRORS:')
  ;[...new Set(pageErrors)].slice(0, 10).forEach(e => console.log('  ', e))
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed · ${outdir}`)
console.log(`(${seen.filter(u => override(u) !== null).length} requests served synthetically)`)

await browser.close()
process.exit(results.every(Boolean) && !pageErrors.length ? 0 : 1)
