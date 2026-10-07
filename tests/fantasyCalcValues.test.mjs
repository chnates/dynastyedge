// Pins the snapshot pipelines' FantasyCalc reader (scripts/fantasyCalcValues.mjs).
//
// Every assertion cites a documented behaviour from CLAUDE.md (the FantasyCalc
// API section's "Classifying player vs. pick" rule, and rule 7) or from
// dynastyedge-failure-archaeology §3 ("a pick's value is never 0 just because
// its market listing is missing"), so a failure here is either a code
// regression or doc drift.

import test from 'node:test'
import assert from 'node:assert/strict'

import { splitFantasyCalcEntries, buildPickPricer } from '../scripts/fantasyCalcValues.mjs'

const entry = (name, sleeperId, value) => ({ player: { name, sleeperId }, value })

// The shape FantasyCalc actually returns, probed live 2026-09-21: 418 entries,
// 0 with a falsy sleeperId, 24 with a synthetic non-numeric one.
const LIVE_SHAPE = [
  entry('Ja\'Marr Chase', 7564, 9365),
  entry('DJ Moore', '4983', 3102),          // Sleeper mixes string and number ids
  entry('2027 1st (Early)', 'FP_2027_early_0', 4866),
  entry('2027 1st', 'FP_2027_1', 3022),
  entry('2027 1st (Late)', 'FP_2027_late_0', 2473),
  entry('2027 2nd', 'FP_2027_2', 1200),
  entry('2028 1st', 'FP_2028_1', 2203),
  entry('2026 Pick 1.09', 'DP_0_8', 3800),  // slot-level entry
]

test('a synthetic non-numeric sleeperId is a PICK, not a player', () => {
  // The live bug: `if (sid)` put all 24 pick entries into the player map and
  // left pickEntries empty, which priced every pick at 0.
  const { playerValues, pickEntries } = splitFantasyCalcEntries(LIVE_SHAPE)
  assert.equal(Object.keys(playerValues).length, 2)
  assert.equal(pickEntries.length, 6)
  assert.ok(!('FP_2027_1' in playerValues))
  assert.ok(!('DP_0_8' in playerValues))
})

test('a numeric sleeperId is a player, whether it arrives as string or number', () => {
  // CLAUDE.md rule 8: Sleeper returns ids as strings or numbers per endpoint.
  const { playerValues } = splitFantasyCalcEntries(LIVE_SHAPE)
  assert.equal(playerValues['7564'], 9365)
  assert.equal(playerValues['4983'], 3102)
})

test('a pick with NO id at all is still a pick', () => {
  // The pre-2026-07 shape. Classification is by id SHAPE, so both eras work.
  const { playerValues, pickEntries } = splitFantasyCalcEntries([
    entry('2027 1st', undefined, 3022),
    entry('2027 2nd', null, 1200),
  ])
  assert.deepEqual(playerValues, {})
  assert.equal(pickEntries.length, 2)
})

test('an empty or absent payload yields empty results rather than throwing', () => {
  assert.deepEqual(splitFantasyCalcEntries(undefined), { playerValues: {}, pickEntries: [] })
  assert.deepEqual(splitFantasyCalcEntries([]), { playerValues: {}, pickEntries: [] })
})

test('a pick is priced at the median of THAT SEASON\'s round entries', () => {
  const { pickEntries } = splitFantasyCalcEntries(LIVE_SHAPE)
  const price = buildPickPricer(pickEntries)
  // 2027 1sts are 2473 / 3022 / 4866 — the median is 3022.
  assert.equal(price('2027', 1), 3022)
  assert.equal(price('2027', 2), 1200)
})

test('a slot entry never pollutes a round median', () => {
  // "2026 Pick 1.09" carries no "1st" suffix, so it cannot enter the round
  // median — the same reason the app's findPickValue matches on the suffix.
  const { pickEntries } = splitFantasyCalcEntries(LIVE_SHAPE)
  assert.equal(buildPickPricer(pickEntries)('2026', 1), 3022)  // generic fallback, not 3800
})

test('a retired season falls back to the generic round median — "a 2nd is a 2nd"', () => {
  // FantasyCalc retires a season's pick entries the moment its draft
  // completes (failure-archaeology §3b/§3c), so the season match misses and
  // the ladder's second tier must answer.
  const { pickEntries } = splitFantasyCalcEntries(LIVE_SHAPE)
  const price = buildPickPricer(pickEntries)
  // All 1sts across every season: 2203 / 2473 / 3022 / 4866 — median 3022.
  assert.equal(price('2026', 1), 3022)
  assert.ok(price('2026', 1) > 0)
})

test('an unpriceable pick returns NULL, never 0', () => {
  // The §3 invariant. A stored 0 is indistinguishable from a real price: it
  // counts into a total and renders as fact, where a null is skipped by
  // design (useTradeTimeValues hides the line when any asset is missing).
  const price = buildPickPricer([])
  assert.equal(price('2027', 1), null)
  assert.notEqual(price('2027', 1), 0)

  const { pickEntries } = splitFantasyCalcEntries(LIVE_SHAPE)
  assert.equal(buildPickPricer(pickEntries)('2027', 4), null)  // no 4ths listed anywhere
})

test('an out-of-range round returns null rather than a price', () => {
  const { pickEntries } = splitFantasyCalcEntries(LIVE_SHAPE)
  const price = buildPickPricer(pickEntries)
  assert.equal(price('2027', 0), null)
  assert.equal(price('2027', 9), null)
  assert.equal(price('2027', undefined), null)
})

test('REGRESSION: the old presence-based classifier priced every pick at 0', () => {
  // Kept as an executable statement of the bug this module exists to prevent,
  // so nobody "simplifies" the shape test back to a truthiness check.
  const oldPickEntries = []
  LIVE_SHAPE.forEach(e => {
    const sid = e.player?.sleeperId
    if (sid) { /* into playerValues */ } else if (e.player?.name) oldPickEntries.push(e)
  })
  assert.equal(oldPickEntries.length, 0, 'the old classifier saw no picks at all')
  assert.equal(buildPickPricer(oldPickEntries)('2027', 1), null, 'so every pick was unpriced')
})

// ── ONE reader for app, server and pipelines (CODE-REVIEW-1 #6, 2026-10-07) ──
// The pipelines kept their own copy because Actions "could not import
// src/utils"; that copy archived every pick at 0 for two months. They now run
// with scripts/register.mjs and call src/utils/fantasyCalcPayload.js.
import { readFileSync as readSrc, readdirSync as readDir, statSync as statOf } from 'node:fs'
import { join as joinPath } from 'node:path'
import { splitFantasyCalcPayload, fantasyCalcValuesUrl, isPlayerSleeperId } from '../src/utils/fantasyCalcPayload.js'
import { findPickValue, pickRoundMedian } from '../src/utils/pickCapital.js'
import { FANTASYCALC_VALUES_URL } from '../scripts/fantasyCalcValues.mjs'

test('the URL is built from the four never-change parameters, byte-identical to the old literal', () => {
  const old = 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'
  assert.equal(fantasyCalcValuesUrl(), old)
  assert.equal(FANTASYCALC_VALUES_URL, old)
})

test('strict (app/server) throws on a bad shape; lenient (pipelines) returns empty', () => {
  assert.throws(() => splitFantasyCalcPayload(null), /unexpected data/)
  assert.throws(() => splitFantasyCalcPayload([{ player: { name: '2027 1st', sleeperId: 'FP_2027_1' }, value: 5 }]), /no player values/)
  assert.deepEqual(splitFantasyCalcPayload(null, { strict: false }), { playerMap: {}, pickEntries: [] })
  assert.equal(isPlayerSleeperId('4034'), true)
  assert.equal(isPlayerSleeperId('FP_2027_1'), false)
  assert.equal(isPlayerSleeperId(null), false)
})

test('the app\'s pick price and the pipelines\' agree wherever the app prices', () => {
  const entries = [
    { name: '2027 1st', value: 3000 }, { name: '2027 1st (Mid)', value: 3200 }, { name: '2028 1st', value: 2600 },
    { name: '2027 2nd', value: 1100 }, { name: '2026 Pick 1.09', value: 2900 },
  ]
  const pipeline = buildPickPricer(entries)
  for (const [season, round] of [['2027', 1], ['2028', 1], ['2027', 2]]) {
    assert.equal(findPickValue({ season, round }, entries), pipeline(season, round), `${season} ${round}`)
  }
  // Where the app shows 0 (no market for that season), the pipeline walks to
  // the generic median, then null — never 0.
  assert.equal(findPickValue({ season: '2029', round: 2 }, entries), 0)
  assert.equal(pipeline('2029', 2), 1100)
  assert.equal(pipeline('2029', 4), null)
  assert.equal(pickRoundMedian(entries, 4), null)
})

test('no second FantasyCalc reader or URL in src/, mcp/ or the pipeline scripts', () => {
  const root = new URL('..', import.meta.url).pathname
  const files = []
  const walk = dir => {
    for (const name of readDir(dir)) {
      const p = joinPath(dir, name)
      if (statOf(p).isDirectory()) { if (name !== 'dev') walk(p) }
      else if (/\.(js|jsx|mjs)$/.test(name)) files.push(p)
    }
  }
  walk(joinPath(root, 'src'))
  walk(joinPath(root, 'mcp'))
  walk(joinPath(root, 'scripts'))
  const copies = []
  for (const f of files) {
    if (f.endsWith('utils/fantasyCalcPayload.js')) continue
    readSrc(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (/api\.fantasycalc\.com\/values|\\d\+\$\/\.test\(String\(sid\)\)/.test(line)) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'use src/utils/fantasyCalcPayload.js')
})
