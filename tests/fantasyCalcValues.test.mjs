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
