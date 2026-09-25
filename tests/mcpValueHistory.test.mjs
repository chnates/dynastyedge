// tests/mcpValueHistory.test.mjs — pins tool #13, get_value_history, and its
// feed loader (mcp/feeds.js getValueHistoryFeed).
//
// Behaviours pinned (with their doc source):
//  - CLAUDE.md Value history pipeline: fewer than MIN_SPARKLINE_POINTS points is
//    "not enough history yet" — never a flat line, never 0. Tracked-but-short
//    and untracked are different answers.
//  - The team line IS The Edge's buildTeamValueSeries, not a re-derivation.
//  - Class B: an unreadable feed is ok:true, available:false, never "nothing moved".
//  - Rule 7: an unpriced player's current value is null, never 0.
//  - The resolver discipline: an ambiguous name refuses with candidates.
//  - Non-negotiable 2: movers bounded, true counts beside them.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildValueHistoryAnswer, renderValueHistoryText, MAX_MOVERS } from '../mcp/tools/valueHistory.js'
import { getValueHistoryFeed, DEFAULT_VALUE_HISTORY_TTL_MS, DEFAULT_FEED_TTL_MS } from '../mcp/feeds.js'
import { memoryStore } from '../mcp/store.js'
import { buildTeamValueSeries } from '../src/utils/edgeBriefing.js'
import { makeSnapshot, MINE } from './helpers/mcpFixtures.mjs'

const dates = Array.from({ length: 10 }, (_, i) => `2027-09-${String(10 + i).padStart(2, '0')}`)
const ramp = (from, step) => dates.map((_, i) => from + step * i)
const HISTORY = {
  updatedAt: new Date(Date.now() - 3 * 36e5).toISOString(),
  dates,
  players: {
    1: ramp(6100, 100), // Star Quarterback: +900
    2: ramp(5450, -50), // Second Quarterback: −450
    3: ramp(3000, 0),
    4: [null, null, null, null, null, null, null, 780, 790, 800], // Lone Wideout: 3 points
    5: ramp(3550, 50), // Solid Runner: +450
    8: ramp(1350, -50), // Hurt Receiver: −450
    21: ramp(4900, -40),
  },
}

const available = (data = HISTORY) => ({
  available: true, data, updatedAt: data.updatedAt, ageHours: 3, error: null,
  source: { fetchedAt: new Date().toISOString(), ageSeconds: 0, stale: false, error: null },
})
const missing = { available: false, data: null, updatedAt: null, ageHours: null, error: 'HTTP 404', source: null }
const ask = (feed, opts = {}) => buildValueHistoryAnswer(makeSnapshot(), feed, {
  defaultRosterId: 6, myRosterId: 6, ...opts,
})

test('one player: a dated series and its first→last summary, beside the LIVE current value', () => {
  const a = ask(available(), { player: 'Star Quarterback' })
  assert.equal(a.ok, true)
  assert.equal(a.scope, 'player')
  assert.equal(a.history.status, 'ok')
  assert.equal(a.history.series.length, 10)
  assert.deepEqual(a.history.series[0], { date: '2027-09-10', value: 6100 })
  assert.equal(a.history.summary.change, 900)
  assert.equal(a.player.currentValue, 7000, 'from the snapshot, not the last column')
  assert.equal(a.player.isYours, true)
  assert.deepEqual(a.window, { requestedDays: null, from: '2027-09-10', to: '2027-09-19', snapshots: 10 })
  assert.match(renderValueHistoryText(a), /\+900/)
})

test('under the threshold is "not enough history yet" — no series, no summary, never a flat line or 0', () => {
  const a = ask(available(), { player: '4' })
  assert.equal(a.history.status, 'not-enough-history')
  assert.equal(a.history.points, 3)
  assert.equal(a.history.series, null)
  assert.equal(a.history.summary, null)
  assert.ok(a.notes.some(n => /Not enough history yet/.test(n) && /NOT a flat line/.test(n) && /NOT a zero/.test(n)))
})

test('a player the feed does not track is "untracked", a different answer from too few points', () => {
  const a = ask(available(), { player: '5', days: 5 })
  assert.equal(a.history.status, 'ok')
  const b = ask(available(), { player: '6' }) // Deep Stash: unranked, no row
  assert.equal(b.history.status, 'untracked')
  assert.equal(b.player.currentValue, null, 'rule 7: unpriced is null, never 0')
  assert.equal(b.player.unranked, true)
  assert.ok(b.notes.some(n => /top 500/.test(n)))
})

test('an ambiguous name refuses with candidates; a pick is refused', () => {
  const a = ask(available(), { player: 'Brown' })
  assert.equal(a.ok, false)
  assert.equal(a.playerCandidates.length, 2)
  assert.ok(a.playerCandidates.every(c => c.sleeperId))
  const p = ask(available(), { player: '2027 1st' })
  assert.equal(p.ok, false)
})

test('an unreadable feed is ok:true, available:false — the current value still answers', () => {
  const a = ask(missing, { player: 'Star Quarterback' })
  assert.equal(a.ok, true)
  assert.equal(a.available, false)
  assert.equal(a.history.status, 'unavailable')
  assert.equal(a.player.currentValue, 7000)
  assert.ok(a.notes.some(n => /gap in OUR data/.test(n)))
  const t = ask(missing)
  assert.equal(t.teamHistory.status, 'unavailable')
  assert.deepEqual(t.risers, [])
})

test('team mode: the line IS The Edge\'s buildTeamValueSeries, with dated points', () => {
  const a = ask(available())
  assert.equal(a.scope, 'team')
  assert.equal(a.team.isYou, true)
  assert.deepEqual(a.teamHistory.series.map(p => p.value), buildTeamValueSeries(HISTORY, MINE))
  assert.equal(a.teamHistory.series[9].date, '2027-09-19')
  assert.ok(a.notes.some(n => /TODAY'S roster/.test(n)))
})

test('team mode: movers sorted and bounded, counts carry the truth', () => {
  const a = ask(available(), { limit: 1 })
  assert.deepEqual(a.risers.map(r => r.sleeperId), ['1'])
  assert.equal(a.fallers.length, 1)
  assert.equal(a.counts.risers, 2)
  assert.equal(a.counts.fallers, 2)
  assert.equal(a.counts.withSeries, 5)
  assert.equal(a.counts.tooFewPoints, 1, 'Lone Wideout')
  assert.equal(a.counts.untracked, MINE.players.length - 6)
  assert.ok(a.notes.some(n => /top 1 risers/.test(n)))
  assert.ok(ask(available(), { limit: 999 }).risers.length <= MAX_MOVERS)
})

test('a window shorter than the threshold cannot be asked for, and a short feed draws no team line', () => {
  const a = ask(available(), { days: 1 })
  assert.equal(a.window.snapshots, 4, 'clamped up to MIN_SPARKLINE_POINTS')
  const short = { ...HISTORY, dates: dates.slice(-3), players: Object.fromEntries(Object.entries(HISTORY.players).map(([k, v]) => [k, v.slice(-3)])) }
  const b = ask(available(short))
  assert.equal(b.teamHistory.status, 'not-enough-history')
  assert.equal(b.teamHistory.series, null)
})

test('the loader never throws, never caches a wrong-shape 200, and has its own longer TTL', async () => {
  assert.ok(DEFAULT_VALUE_HISTORY_TTL_MS > DEFAULT_FEED_TTL_MS)
  const r = await getValueHistoryFeed({ fetcher: async () => { throw new Error('HTTP 404') }, store: memoryStore() })
  assert.equal(r.available, false)
  assert.match(r.error, /404/)
  const store = memoryStore()
  let calls = 0
  const bad = await getValueHistoryFeed({ fetcher: async () => { calls++; return { dates: 'x', players: {} } }, store })
  assert.equal(bad.available, false)
  const good = await getValueHistoryFeed({ fetcher: async () => { calls++; return HISTORY }, store })
  assert.equal(good.available, true)
  const again = await getValueHistoryFeed({ fetcher: async () => { calls++; return HISTORY }, store })
  assert.equal(again.available, true)
  assert.equal(calls, 2, 'the bad shape was not cached; the good one was')
})
