#!/usr/bin/env node
// Dev/analysis tool — NOT part of the app or any workflow. Nothing imports it.
//
// Reproduces docs/analysis/trade-structure-stability-2026-08.md: the step-2
// stability test for frontier Item 3 (trade-structure profiling), which
// DISCONFIRMED the premise. Every number in that memo is re-runnable here
// rather than asserted.
//
// The question: does a manager's accepted-trade SHAPE, profiled on their
// earlier trades, describe their later trades better than the league average
// does? Answer on this league's full 4-season corpus: no — 39.0% against a
// 50% null (permutation p = 0.42). Between-manager MAD is 0.000 on two of the
// three features, i.e. there is no between-manager signal in the median to
// profile. See the memo's standing ruling before reviving this.
//
// Framing limit: Sleeper exposes only COMPLETED trades (no rejected/pending
// offers), so this is structure profiling of accepted trades — one-class data.
// It can never license a claim of the form "predicts they will accept".
//
// The corpus is built by driving the SHIPPED buildManagerProfiles, so the
// analysis cannot drift from the app's own ledger logic. That import needs the
// diagnostics loader hook (src/utils use extensionless relative imports):
//
//   SKILL=./.claude/skills/dynastyedge-diagnostics-and-tooling
//   node --import $SKILL/scripts/reg.mjs scripts/dev/trade-structure-backtest.mjs
//
// (the leading ./ is required — node reads a bare relative --import as a
// package name and dies with ERR_INVALID_MODULE_SPECIFIER)
//
// Flags: --refetch  rebuild the frozen corpus (default: reuse the cache)
//        --cache P  corpus cache path (default .cache/trade-corpus.json)
// Zero dependencies, read-only, public data. Requires network on first run.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const argv = process.argv
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : (argv[i + 1] ?? true) }
const CACHE = arg('cache', '.cache/trade-corpus.json')
const REFETCH = argv.includes('--refetch')
const LEAGUE = '1313933520715907072'
const B = 'https://api.sleeper.app/v1'
const MIN_SIDES = 8, SEED = 20260814, SHUFFLES = 10000
const MY_OWNER = '965787707299430400'

const j = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json() }

async function buildCorpus() {
  const { buildManagerProfiles } = await import(
    new URL('../../src/utils/managerAnalysis.js', import.meta.url).href)
  const seasonTx = async id => (await Promise.all(Array.from({ length: 18 }, (_, i) =>
    j(`${B}/league/${id}/transactions/${i + 1}`).catch(() => [])))).flat()
    .filter(t => t.status === 'complete')
  const drafts = async id => Promise.all(((await j(`${B}/league/${id}/drafts`).catch(() => []))).map(
    async d => ({ draft: d, picks: await j(`${B}/draft/${d.draft_id}/picks`).catch(() => []) })))
  const season = async id => {
    const info = await j(`${B}/league/${id}`)
    const [users, rosters, transactions, dr] = await Promise.all(
      [j(`${B}/league/${id}/users`), j(`${B}/league/${id}/rosters`), seasonTx(id), drafts(id)])
    return { season: String(info.season), leagueId: id, leagueInfo: info, users, rosters, transactions, drafts: dr }
  }
  const cur = await j(`${B}/league/${LEAGUE}`)
  const chain = []
  let prev = cur.previous_league_id
  while (prev && prev !== '0' && chain.length < 8) {
    const info = await j(`${B}/league/${prev}`); chain.push(prev); prev = info.previous_league_id
  }
  const [curSeason, ...pastSeasons] = await Promise.all([season(LEAGUE), ...chain.map(season)])

  const fc = await j('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5')
  const playerMap = {}, pickEntries = []
  for (const e of fc) {
    const id = e.player?.sleeperId
    const rec = { sleeperId: id != null ? String(id) : null, name: e.player.name, position: e.player.position,
                  age: e.player.maybeAge, value: e.value, overallRank: e.overallRank }
    if (id != null && /^\d+$/.test(String(id))) playerMap[String(id)] = rec
    else pickEntries.push(rec)
  }
  const db = await j(`${B}/players/nfl`)
  const playerDB = {}
  for (const [k, p] of Object.entries(db)) playerDB[k] = { name: p.full_name ?? p.name, position: p.position, age: p.age }

  const currentLeague = {
    season: curSeason.season,
    allRosters: curSeason.rosters.map(r => ({
      rosterId: r.roster_id,
      owner: curSeason.users.find(u => u.user_id === r.owner_id) ?? null,
      record: { wins: r.settings?.wins ?? 0, losses: r.settings?.losses ?? 0 },
    })),
    transactions: curSeason.transactions,
  }
  const out = buildManagerProfiles({ history: { currentDrafts: curSeason.drafts, pastSeasons },
    currentLeague, playerMap, pickEntries, playerDB, myOwnerId: MY_OWNER })
  return {
    fetchedAt: new Date().toISOString(), seasonList: out.seasonList,
    profiles: out.profiles.map(p => ({
      ownerId: p.ownerId, name: p.teamName ?? p.username ?? p.ownerId, isMe: p.isMe, trades: p.trades })),
  }
}

// ── features (fixed by the pre-registration; do not tune) ────────────────────
const nonFaab = a => a.type !== 'faab'
const vwAge = list => {
  const w = list.filter(a => a.type === 'player' && a.age != null && a.value > 0)
  if (!w.length) return null
  const tot = w.reduce((s, a) => s + a.value, 0)
  return tot > 0 ? w.reduce((s, a) => s + a.age * a.value, 0) / tot : null
}
function features(t) {
  const got = t.got.filter(nonFaab), gave = t.gave.filter(nonFaab)
  const n = got.length + gave.length
  const gotVal = got.reduce((s, a) => s + a.value, 0)
  const pickVal = got.filter(a => a.type === 'pick').reduce((s, a) => s + a.value, 0)
  const ageGot = vwAge(got), ageGave = vwAge(gave)
  return {
    F1: n > 0 ? got.length / n : null,
    F2: gotVal > 0 ? pickVal / gotVal : null,
    F3: (ageGot != null && ageGave != null) ? ageGot - ageGave : null,
  }
}
const FKEYS = ['F1', 'F2', 'F3']
const median = xs => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
const iqr = xs => { const a = [...xs].sort((x, y) => x - y)
  const q = p => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]
  return q(0.75) - q(0.25) }
const orderKey = t => t.date != null ? Number(t.date) : Number(t.season) * 100 + (t.week ?? 0)
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// ── run ─────────────────────────────────────────────────────────────────────
let corpus
if (!REFETCH && existsSync(CACHE)) {
  corpus = JSON.parse(readFileSync(CACHE, 'utf8'))
  console.log(`corpus: cached ${CACHE} (fetched ${corpus.fetchedAt}) — --refetch to rebuild`)
} else {
  console.log('corpus: fetching live Sleeper + FantasyCalc…')
  corpus = await buildCorpus()
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, JSON.stringify(corpus, null, 2))
  console.log(`corpus: built and frozen to ${CACHE}`)
}

const mgrs = corpus.profiles
  .map(p => ({ ...p, sides: p.trades.map(t => ({ ...features(t), key: orderKey(t) })).sort((a, b) => a.key - b.key) }))
  .filter(m => m.sides.length >= MIN_SIDES)
const uniq = new Set(); corpus.profiles.forEach(p => p.trades.forEach(t => uniq.add(t.txId)))
const fit = [], hold = []
mgrs.forEach(m => { const h = Math.floor(m.sides.length / 2)
  m.fit = m.sides.slice(0, h); m.hold = m.sides.slice(h); fit.push(...m.fit); hold.push(...m.hold) })
const scale = {}, league = {}
FKEYS.forEach(k => { const v = fit.map(s => s[k]).filter(x => x != null)
  scale[k] = iqr(v) || 1; league[k] = median(v) })
mgrs.forEach(m => { m.profile = {}
  FKEYS.forEach(k => { const v = m.fit.map(s => s[k]).filter(x => x != null)
    m.profile[k] = v.length ? median(v) : league[k] }) })
const dist = (s, p) => { const d = FKEYS.filter(k => s[k] != null).map(k => Math.abs(s[k] - p[k]) / scale[k])
  return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null }
const rate = m => { let w = 0, n = 0
  m.hold.forEach(s => { const dO = dist(s, m.profile), dL = dist(s, league)
    if (dO == null || dL == null) return; n++; w += dO < dL ? 1 : dO === dL ? 0.5 : 0 })
  return { w, n } }
function winRate(assign) { let w = 0, n = 0
  mgrs.forEach((m, i) => m.hold.forEach(s => {
    const dO = dist(s, mgrs[assign[i]].profile), dL = dist(s, league)
    if (dO == null || dL == null) return; n++; w += dO < dL ? 1 : dO === dL ? 0.5 : 0 }))
  return { rate: n ? w / n : 0, n } }

const ident = mgrs.map((_, i) => i)
const obs = winRate(ident)
const rnd = mulberry32(SEED)
let ge = 0
for (let s = 0; s < SHUFFLES; s++) {
  const perm = ident.slice()
  for (let i = perm.length - 1; i > 0; i--) { const jx = Math.floor(rnd() * (i + 1)); [perm[i], perm[jx]] = [perm[jx], perm[i]] }
  if (winRate(perm).rate >= obs.rate) ge++
}

console.log(`\nseasons ${corpus.seasonList.join(', ')} · ${uniq.size} unique trades · ${corpus.profiles.length} managers`)
console.log(`qualifying ${mgrs.length} (>=${MIN_SIDES} sides) · fit ${fit.length} · holdout ${hold.length}`)
console.log(`\nOVERALL WIN RATE: ${(obs.rate * 100).toFixed(1)}%  (null 50%, n=${obs.n})`)
console.log(`permutation p = ${(ge / SHUFFLES).toFixed(4)}  (${SHUFFLES} shuffles, seed ${SEED})`)
const indiv = mgrs.map(m => { const { w, n } = rate(m); return n ? w / n : 0 })
console.log(`managers individually >= 50%: ${indiv.filter(r => r >= 0.5).length} of ${mgrs.length}`)

console.log('\n--- why: is there any between-manager signal to profile? ---')
FKEYS.forEach(k => {
  const profs = mgrs.map(m => m.profile[k])
  const between = median(profs.map(p => Math.abs(p - median(profs))))
  let within = 0, n = 0
  mgrs.forEach(m => { const v = m.fit.map(s => s[k]).filter(x => x != null); if (v.length < 2) return
    const p = median(v); v.forEach(x => { within += Math.abs(x - p); n++ }) })
  console.log(`  ${k}: between-manager MAD ${between.toFixed(3)} · within ${(within / n).toFixed(3)}` +
    ` -> signal/noise ${(between / (within / n)).toFixed(2)}`)
})
console.log('\nVERDICT: DISCONFIRMED (see docs/analysis/trade-structure-stability-2026-08.md)')
