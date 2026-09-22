#!/usr/bin/env node
// Dev/analysis tool — NOT part of the app or any workflow. Nothing imports it.
//
// THE OPEN-10 measurement: the package search's assembly window
// (`PACKAGE_BAND`) and the partner-appeal weight (`APPEAL_BONUS`) were tuned at
// different times against different questions, and the first is what makes the
// Trade > Targets board read wrong. This sweeps them JOINTLY over the live
// 20-target board and prints the four numbers that trade against each other —
// keep-pain, partner appeal, my-side appeal, verdict — in one table, because
// improving appeal while quietly raising what you pay is not an improvement.
//
// It drives the SHIPPED `suggestFairPackage` through its `opts` sweep hooks,
// so the analysis and the product cannot drift (same discipline as
// rookie-signal-backtest.mjs). It never writes anything.
//
// Usage (the resolver hook is required — this imports src/utils, whose
// extensionless relative imports plain node cannot resolve):
//   node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//     scripts/dev/trade-fair-band-sweep.mjs [--board] [--rows]
//
//   --board  print the full 20-row board for the SHIPPED setting and exit
//   --rows   also print per-row detail for every swept setting
//
// Zero dependencies, read-only, public data. Caches Sleeper/FantasyCalc
// payloads under $DYNASTYEDGE_CACHE (default: a tmpdir) so a sweep is measured
// against ONE league state — a re-fetch mid-sweep would compare settings
// against different data.

import path from 'node:path'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const U = p => path.join(REPO, 'src/utils', p)

const ARGS = new Set(process.argv.slice(2))

// ── the shipped code under measurement ──────────────────────────────────────
const c = await import(path.join(REPO, 'src/constants.js'))
const { buildLeagueState } = await import(U('leagueState.js'))
const { getTopTradeTargets } = await import(U('rosterAnalysis.js'))
const ta = await import(U('tradeAnalysis.js'))
const { assetKeepScore, buildGivabilityContext } = await import(U('recommendations.js'))
const { buildPlayoffOutlook } = await import(U('playoffOdds.js'))
const { suggestFairPackage, analyzeTrade, getTradeVerdict, APPEAL_BONUS, PACKAGE_BAND } = ta

const CACHE = process.env.DYNASTYEDGE_CACHE || path.join(tmpdir(), 'dynastyedge-fairband')
mkdirSync(CACHE, { recursive: true })
async function getJSON(url, name) {
  const p = path.join(CACHE, name)
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  process.stderr.write(`  fetching ${name} …\n`)
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  writeFileSync(p, text)
  return JSON.parse(text)
}

// ── live league state, through the app's own join ───────────────────────────
const L = c.LEAGUE_ID
const fcUrl = `${c.FANTASYCALC_BASE}/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5`
const [leagueInfo, rosters, users, tradedPicks, drafts, nflState, fc] = await Promise.all([
  getJSON(`${c.SLEEPER_BASE}/league/${L}`, 'league.json'),
  getJSON(`${c.SLEEPER_BASE}/league/${L}/rosters`, 'rosters.json'),
  getJSON(`${c.SLEEPER_BASE}/league/${L}/users`, 'users.json'),
  getJSON(`${c.SLEEPER_BASE}/league/${L}/traded_picks`, 'traded_picks.json'),
  getJSON(`${c.SLEEPER_BASE}/league/${L}/drafts`, 'drafts.json'),
  getJSON(`${c.SLEEPER_BASE}/state/nfl`, 'state.json'),
  getJSON(fcUrl, 'fc.json'),
])

// Same split useFantasyCalc performs: classify by id SHAPE, never presence.
const playerMap = {}, pickEntries = []
for (const e of fc) {
  const sid = e.player?.sleeperId
  if (sid != null && /^\d+$/.test(String(sid))) {
    playerMap[String(sid)] = {
      name: e.player.name, position: e.player.position, team: e.player.maybeTeam || '',
      age: e.player.maybeAge ?? null, value: Math.round(e.value ?? 0),
      overallRank: e.overallRank ?? null, positionRank: e.positionRank ?? null,
      trend30Day: e.trend30Day ?? 0, experience: e.player.experience ?? null,
      sleeperId: String(sid),
    }
  } else if (e.player?.name) {
    pickEntries.push({ name: e.player.name, value: Math.round(e.value ?? 0) })
  }
}

const league = buildLeagueState({
  sleeperData: { leagueInfo, rosters, users, tradedPicks, drafts, nflState },
  fcValues: { playerMap, pickEntries },
  playerDB: null, myRosterId: c.MY_ROSTER_ID, leagueId: L,
})
if (!league?.myRoster) { console.error('no league state — is the league id right?'); process.exit(1) }

// Layer 3 scores on live playoff odds in season; the verdict column is wrong
// without them (failure-archaeology §4e-vii).
let myPlayoffPct = null
if (nflState.season_type === 'regular') {
  const lastReg = (leagueInfo.settings?.playoff_week_start ?? 15) - 1
  const weeks = await Promise.all(Array.from({ length: lastReg }, (_, i) =>
    getJSON(`${c.SLEEPER_BASE}/league/${L}/matchups/${i + 1}`, `m${i + 1}.json`).catch(() => [])))
  const outlook = buildPlayoffOutlook({
    allRosters: league.allRosters,
    perWeek: weeks.map((entries, i) => ({ week: i + 1, entries })),
    playoffTeams: leagueInfo.settings?.playoff_teams ?? 6,
    firstPlayoffWeek: leagueInfo.settings?.playoff_week_start ?? 15,
  })
  myPlayoffPct = outlook?.oddsByRoster?.[league.myRoster.rosterId]?.playoffPct ?? null
}

const rosterById = new Map(league.allRosters.map(r => [r.rosterId, r]))

// A seat = one roster's own 20-target board. The owner's seat is the subject;
// the other nine are the robustness check, because a cap chosen on one roster's
// lumpy 20 rows is a step-edge fit (failure-archaeology §4e-vi).
function seatFor(rosterId) {
  const me = rosterById.get(rosterId)
  return {
    rosterId, me,
    targets: getTopTradeTargets(me, league.allRosters, 20),
    ctx: buildGivabilityContext(me, league.allRosters),
    // Playoff odds are the owner's; other seats fall back to the tier, which is
    // what analyzeTrade does with a null anyway.
    playoffPct: rosterId === league.myRoster.rosterId ? myPlayoffPct : null,
  }
}
let SEAT = seatFor(league.myRoster.rosterId)

// ── one setting, measured on all four axes at once ──────────────────────────
function runBoard({ band, appealBonus, requireFairBand = true }) {
  const { targets, me, ctx, playoffPct } = SEAT
  const rows = []
  for (const t of targets) {
    const opp = rosterById.get(t.ownerRosterId)
    const pkg = suggestFairPackage(t, me, league.allRosters, opp, { band, appealBonus, requireFairBand })
    if (!pkg) { rows.push({ name: t.name, targetValue: t.value, none: true }); continue }
    const get = [{ ...t, type: 'player' }]
    const analysis = analyzeTrade(pkg.assets, get, me, opp, league.allRosters, { myPlayoffPct: playoffPct })
    const verdict = getTradeVerdict(analysis)
    rows.push({
      name: t.name, position: t.position, targetValue: t.value,
      give: pkg.assets.map(a => a.name).join(' + '),
      total: pkg.totalValue, ratio: pkg.totalValue / t.value,
      pain: pkg.keepPain,
      // The search's objective includes a per-piece and a distance term, so a
      // tighter cap can raise it while SENDING LESS. rawKeep is the honest
      // "what did this cost me" — the plain sum of assetKeepScore.
      rawKeep: pkg.assets.reduce((s2, a) => s2 + assetKeepScore(a, ctx), 0),
      pieces: pkg.assets.length,
      appeal: pkg.appeal, myAppeal: pkg.myAppeal,
      verdict: verdict?.verdict ?? null,
      inBand: analysis?.fairBand?.inside ?? null,
      inFairBand: pkg.inFairBand,
      alternative: pkg.alternative
        ? `${pkg.alternative.assets.map(a => a.name).join(' + ')} +${pkg.alternative.premiumPct}% -> ${pkg.alternative.appeal}`
        : null,
    })
  }
  const live = rows.filter(r => !r.none)
  const tally = key => live.reduce((m, r) => { const k = r[key] ?? '-'; m[k] = (m[k] ?? 0) + 1; return m }, {})
  const sum = key => live.reduce((s, r) => s + (r[key] ?? 0), 0)
  return {
    rows,
    pain: sum('pain'),
    rawKeep: sum('rawKeep'),
    pieces: sum('pieces'),
    valueSent: sum('total'),
    targetValue: sum('targetValue'),
    meanRatio: live.length ? live.reduce((s, r) => s + r.ratio, 0) / live.length : 0,
    inBand: live.filter(r => r.inBand).length,
    appeal: tally('appeal'), myAppeal: tally('myAppeal'), verdict: tally('verdict'),
    none: rows.length - live.length,
  }
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n)
const padl = (s, n) => String(s).padStart(n)
const dist = (t, keys) => keys.map(k => `${k[0]}${t[k] ?? 0}`).join('/')

function printBoard(res, label) {
  console.log(`\n── ${label} ──`)
  console.log(pad('target', 20), padl('val', 6), padl('give', 6), padl('ratio', 6),
    padl('pain', 6), pad('  them', 8), pad('you', 6), pad('verdict', 9), 'fair')
  for (const r of res.rows) {
    if (r.none) { console.log(pad(r.name, 20), padl(r.targetValue, 6), '  (no package)'); continue }
    console.log(pad(r.name, 20), padl(r.targetValue, 6), padl(r.total, 6), padl(r.ratio.toFixed(3), 6),
      padl(r.pain.toFixed(2), 6), pad('  ' + r.appeal, 8), pad(r.myAppeal, 6), pad(r.verdict, 9),
      r.inBand ? 'IN' : 'out')
  }
  console.log('  packages:', res.rows.map(r => r.none ? '' : `\n    ${r.name}: ${r.give}${r.alternative ? `\n        alt: ${r.alternative}` : ''}`).join(''))
  console.log('  suggestions reaching the fair band:', res.rows.filter(r => r.inFairBand).length, '/', res.rows.filter(r => !r.none).length,
    '· alternative shown on', res.rows.filter(r => r.alternative).length)
}

const SHIPPED = { band: PACKAGE_BAND, appealBonus: APPEAL_BONUS }

if (ARGS.has('--board')) {
  // THE headline table: before and after, all four axes together, because they
  // trade against each other and a change that improves appeal while quietly
  // raising what you pay is not a change worth making.
  const before = runBoard({ ...SHIPPED, requireFairBand: false })
  const after = runBoard(SHIPPED)
  printBoard(before, 'BEFORE — suggestion may be any package in the assembly window')
  printBoard(after, 'AFTER — suggestion must land inside buildFairBand')
  const line = (label, res) =>
    console.log(pad(label, 8), padl(res.rawKeep.toFixed(2), 7), padl(res.pain.toFixed(2), 7),
      padl(res.valueSent.toLocaleString(), 11), padl(res.meanRatio.toFixed(4), 8),
      padl(`${res.inBand}/20`, 6), pad('  ' + dist(res.appeal, ['Strong', 'Fair', 'Weak']), 14),
      pad(dist(res.myAppeal, ['Strong', 'Fair', 'Weak']), 13),
      pad(dist(res.verdict, ['Accept', 'Counter', 'Decline']), 13),
      padl(res.rows.filter(r => r.alternative).length, 3))
  console.log(`\n${pad('', 8)}${padl('keep', 7)}${padl('obj', 7)}${padl('value sent', 11)}${padl('ratio', 8)}` +
    `${padl('fair', 6)}${pad('  them S/F/W', 14)}${pad('you S/F/W', 13)}${pad('verdict A/C/D', 13)}${padl('alt', 3)}`)
  line('BEFORE', before)
  line('AFTER', after)
  process.exit(0)
}

// ── robustness: the same sweep from all ten seats ───────────────────────────
if (ARGS.has('--seats')) {
  // "0.90:1.15:off" turns the fair-band gate off for that column — the
  // pre-2026-09-21 behaviour, so before/after is one command.
  const caps = (process.env.SWEEP_BANDS ?? '0.90:1.15:off,0.90:1.15')
    .split(',').map(t => { const [f, cc, g] = t.split(':'); return { floor: +f, cap: +cc, requireFairBand: g !== 'off' } })
  const w = Number(process.env.SWEEP_W ?? APPEAL_BONUS.Strong)
  console.log(`all ten seats, Strong weight ${w} — each row is one roster's own 20-target board\n`)
  console.log(pad('seat', 20), ...caps.map(b => pad(`[${b.floor},${b.cap}]${b.requireFairBand ? '' : ' NOGATE'} keep/fair/themW/youW/A`, 38)))
  const totals = caps.map(() => ({ keep: 0, fair: 0, themW: 0, youW: 0, accept: 0, n: 0, value: 0, alt: 0 }))
  for (const r of league.allRosters) {
    SEAT = seatFor(r.rosterId)
    const cells = caps.map((band, i) => {
      const res = runBoard({ band, appealBonus: { ...APPEAL_BONUS, Strong: w }, requireFairBand: band.requireFairBand })
      const live = res.rows.filter(x => !x.none).length
      totals[i].keep += res.rawKeep; totals[i].fair += res.inBand; totals[i].value += res.valueSent
      totals[i].themW += res.appeal.Weak ?? 0; totals[i].youW += res.myAppeal.Weak ?? 0
      totals[i].accept += res.verdict.Accept ?? 0; totals[i].n += live
      totals[i].alt += res.rows.filter(x => x.alternative).length
      return pad(`${res.rawKeep.toFixed(1)} / ${res.inBand}/${live} / ${res.appeal.Weak ?? 0} / ${res.myAppeal.Weak ?? 0} / ${res.verdict.Accept ?? 0}`, 38)
    })
    console.log(pad(r.owner?.display_name ?? `roster ${r.rosterId}`, 20), ...cells)
  }
  console.log()
  console.log(pad('ALL SEATS', 20), ...totals.map(t =>
    pad(`${t.keep.toFixed(1)} / ${t.fair}/${t.n} / ${t.themW} / ${t.youW} / ${t.accept}`, 38)))
  console.log(pad('value sent', 20), ...totals.map(t => pad(t.value.toLocaleString(), 38)))
  console.log(pad('alt shown', 20), ...totals.map(t => pad(String(t.alt), 38)))
  process.exit(0)
}

// ── the joint sweep ─────────────────────────────────────────────────────────
// Bands are swept against EVERY Strong weight, because the two were tuned
// together and a band's cost is only readable against the weight it runs with.
const BANDS = (process.env.SWEEP_BANDS
  ? process.env.SWEEP_BANDS.split(',').map(t => { const [f, c] = t.split(':').map(Number); return { floor: f, cap: c } })
  : [
    { floor: 0.90, cap: 1.15 },   // shipped
    { floor: 0.90, cap: 1.10 },
    { floor: 0.92, cap: 1.12 },
    { floor: 0.95, cap: 1.15 },
    { floor: 0.95, cap: 1.10 },
    { floor: 0.95, cap: 1.05 },   // == buildFairBand exactly
    { floor: 0.97, cap: 1.05 },
  ])
const STRONGS = process.env.SWEEP_W ? process.env.SWEEP_W.split(',').map(Number)
  : [0.0, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0]

console.log(`live board · ${SEAT.targets.length} targets · my playoff odds ` +
  `${myPlayoffPct == null ? 'n/a (offseason)' : (myPlayoffPct * 100).toFixed(1) + '%'} · ` +
  `${Object.keys(playerMap).length} FC players / ${pickEntries.length} pick entries`)
console.log('\nkey: them/you = partner & my-side appeal (Strong/Fair/Weak) · verdict = A/C/D · ' +
  'fair = suggestions landing inside buildFairBand (+/-5%)\n')

console.log(pad('band', 14), padl('w', 4), padl('keep', 6), padl('obj', 6), padl('pcs', 4),
  padl('value sent', 11), padl('ratio', 7),
  padl('fair', 5), pad('  them S/F/W', 14), pad('you S/F/W', 12), 'verdict A/C/D')
const results = []
for (const band of BANDS) {
  for (const w of STRONGS) {
    const appealBonus = { ...APPEAL_BONUS, Strong: w }
    const res = runBoard({ band, appealBonus })
    results.push({ band, w, res })
    const shipped = band.floor === PACKAGE_BAND.floor && band.cap === PACKAGE_BAND.cap && w === APPEAL_BONUS.Strong
    console.log(pad(`[${band.floor}, ${band.cap}]`, 14), padl(w.toFixed(1), 4),
      padl(res.rawKeep.toFixed(2), 6), padl(res.pain.toFixed(2), 6), padl(res.pieces, 4),
      padl(res.valueSent.toLocaleString(), 11),
      padl(res.meanRatio.toFixed(3), 7), padl(`${res.inBand}/20`, 5),
      pad('  ' + dist(res.appeal, ['Strong', 'Fair', 'Weak']), 14),
      pad(dist(res.myAppeal, ['Strong', 'Fair', 'Weak']), 12),
      dist(res.verdict, ['Accept', 'Counter', 'Decline']), shipped ? '  <- SHIPPED' : '')
    if (ARGS.has('--rows')) printBoard(res, `[${band.floor}, ${band.cap}] w=${w}`)
  }
  console.log()
}
