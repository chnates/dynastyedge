// tests/mcpResearchRookies.test.mjs — pins tool #10, research_rookies, and the
// static-feed loader it reads through (mcp/feeds.js).
//
// Behaviours pinned (with their doc source):
//  - CLAUDE.md Feature 19: ONE score (dynastyOpportunityScore, with the age
//    tilt); combine numbers are context and never move it; there is no second
//    axis.
//  - Rule 7 applied to a model: a rookie with no feed entry is score null, never
//    0; an unpriced rookie is value null + unranked, never 0.
//  - The architecture contract's Class B: an unreadable rookie-intel feed is
//    `available: false`, the board still returns (dynasty-value order), and it
//    is never an error and never "no rookies".
//  - MCP non-negotiable 2: bounded output with the true count beside it.
//  - The resolver discipline: an ambiguous name returns candidates, never a guess.
//  - Equivalence with the app: the tool's score is the util's score, unmodified.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildRookieResearchAnswer, renderRookieResearchText, MAX_LIMIT }
  from '../mcp/tools/researchRookies.js'
import { getRookieIntel, getTradeValues } from '../mcp/feeds.js'
import { memoryStore } from '../mcp/store.js'
import { dynastyOpportunityScore } from '../src/utils/rookieResearch.js'
import { makeSnapshot, LEAGUE, VALUES } from './helpers/mcpFixtures.mjs'

const ROOKIE_DB = {
  900: { name: 'Rookie Wideout', position: 'WR', team: 'NYJ', age: 21, years_exp: 0 },
  901: { name: 'Rookie Runner', position: 'RB', team: 'DET', age: 22, years_exp: 0 },
  902: { name: 'Rookie Tight End', position: 'TE', team: 'KC', age: 23, years_exp: 0 },
  903: { name: 'Rookie Passer', position: 'QB', team: 'NYG', age: 22, years_exp: 0 },
  904: { name: 'Jaylen Smith', position: 'WR', team: 'SEA', age: 22, years_exp: 0 },
  905: { name: 'Jaylen Smith', position: 'RB', team: 'LAR', age: 21, years_exp: 0 },
  // A veteran: never on a rookie board.
  906: { name: 'Veteran Wideout', position: 'WR', team: 'SF', age: 29, years_exp: 6 },
}

const ROOKIE_VALUES = {
  900: { sleeperId: '900', name: 'Rookie Wideout', position: 'WR', team: 'NYJ', age: 21, value: 3000, overallRank: 60, positionRank: 25, trend30Day: 0 },
  901: { sleeperId: '901', name: 'Rookie Runner', position: 'RB', team: 'DET', age: 22, value: 2500, overallRank: 70, positionRank: 20, trend30Day: 0 },
  903: { sleeperId: '903', name: 'Rookie Passer', position: 'QB', team: 'NYG', age: 22, value: 4000, overallRank: 40, positionRank: 18, trend30Day: 0 },
  904: { sleeperId: '904', name: 'Jaylen Smith', position: 'WR', team: 'SEA', age: 22, value: 1200, overallRank: 150, positionRank: 60, trend30Day: 0 },
}

const entry = o => ({
  name: o.name, pos: o.pos, team: o.team ?? null, round: o.round ?? null, pick: o.pick ?? null,
  rank: o.rank ?? null, slot: o.pos, ranks: o.ranks ?? [o.rank], ahead: [],
  age: o.age ?? null, ht: 72, wt: 200, forty: o.forty ?? null, vert: null, broad: null,
})

const FEED = {
  updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
  season: '2027',
  players: {
    900: entry({ name: 'Rookie Wideout', pos: 'WR', round: 1, pick: 5, rank: 1, ranks: [3, 2, 1], age: 21.1, forty: 4.38 }),
    901: entry({ name: 'Rookie Runner', pos: 'RB', round: 1, pick: 20, rank: 1, age: 22.4 }),
    902: entry({ name: 'Rookie Tight End', pos: 'TE', round: 5, pick: 150, rank: 3, age: 23.2 }),
    904: entry({ name: 'Jaylen Smith', pos: 'WR', round: 3, pick: 80, rank: 2, age: 22.0 }),
    905: entry({ name: 'Jaylen Smith', pos: 'RB', pick: null, rank: 4 }),
    // 903 (the QB) deliberately has NO feed entry.
  },
}

const available = (data = FEED) => ({
  available: true, data, updatedAt: data.updatedAt, ageHours: 2, error: null,
  source: { fetchedAt: new Date().toISOString(), ageSeconds: 0, stale: false, error: null },
})
const missing = { available: false, data: null, updatedAt: null, ageHours: null, error: 'HTTP 404', source: null }

const snap = () => makeSnapshot({
  playerDB: { ...LEAGUE.playerDB, ...ROOKIE_DB },
  values: { ...VALUES, playerMap: { ...VALUES.playerMap, ...ROOKIE_VALUES } },
})

const ask = (feed, opts = {}) => buildRookieResearchAnswer(snap(), feed, {
  defaultRosterId: 6, myRosterId: 6, ...opts,
})

test('the score is the ONE score the app ships, 0-100, unmodified', () => {
  const a = ask(available(), { sort: 'score', limit: 40 })
  assert.equal(a.ok, true)
  const wr = a.board.find(r => r.sleeperId === '900')
  const expected = Math.round(dynastyOpportunityScore({ position: 'WR', rank: 1, pick: 5, age: 21.1 }) * 100)
  assert.equal(wr.score, expected, 'the tool reports the util\'s number; it computes no score of its own')
  assert.ok(a.board.every(r => r.score == null || (Number.isInteger(r.score) && r.score >= 0 && r.score <= 100)))
})

test('combine numbers are CONTEXT — changing them never moves a score', () => {
  const faster = { ...FEED, players: { ...FEED.players, 900: { ...FEED.players[900], forty: 4.25, vert: 42, broad: 135 } } }
  const a = ask(available(), { player: '900' })
  const b = ask(available(faster), { player: '900' })
  assert.equal(a.rookie.score, b.rookie.score)
  assert.equal(a.rookie.fit, b.rookie.fit)
  assert.equal(b.rookie.context.forty, 4.25, 'the drill is still reported, as context')
})

test('a rookie with no feed entry is UNSCORED (null), never 0', () => {
  const a = ask(available(), { player: 'Rookie Passer' })
  assert.equal(a.ok, true)
  assert.equal(a.rookie.score, null)
  assert.equal(a.rookie.fit, null)
  assert.equal(a.rookie.noFeedEntry, true)
  assert.ok(a.notes.some(n => /not evidence of no opportunity/.test(n)))
})

test('an unpriced rookie is value null + unranked, never 0 (rule 7)', () => {
  const a = ask(available(), { player: 'Rookie Tight End' })
  assert.equal(a.rookie.value, null)
  assert.equal(a.rookie.unranked, true)
  assert.ok(a.rookie.score != null, 'unpriced is not unscored — the feed still carries him')
})

test('veterans are not on the rookie board', () => {
  const a = ask(available(), { limit: 40 })
  assert.ok(!a.board.some(r => r.sleeperId === '906'))
  assert.equal(a.counts.rookieClass, 6)
})

test('Class B: an unreadable feed is available:false, NOT an error and NOT an empty board', () => {
  const a = ask(missing, { limit: 40 })
  assert.equal(a.ok, true)
  assert.equal(a.available, false)
  assert.equal(a.feed, null)
  assert.equal(a.board.length, 6, 'the class comes from the player DB, so "no rookies" would be false')
  assert.ok(a.board.every(r => r.score === null && r.fit === null), 'every score is null, never 0')
  // Degraded order = dynasty value, the same state Draft › Research renders.
  const priced = a.board.filter(r => r.value != null).map(r => r.value)
  assert.deepEqual(priced, [...priced].sort((x, y) => y - x))
  assert.ok(a.notes.some(n => /NOT zero/.test(n) && /gap in our data/.test(n)))
  assert.match(renderRookieResearchText(a), /unavailable/)
})

test('an ambiguous name returns candidates and refuses — never the higher-valued of two', () => {
  const a = ask(available(), { player: 'Jaylen Smith' })
  assert.equal(a.ok, false)
  assert.equal(a.rookieCandidates.length, 2)
  assert.equal(a.rookie, undefined)
  // The id resolves him exactly. (904, the priced one: see open-items ROOKIE-1
  // on buildRookieProspects' position-unguarded name fallback, which would
  // hand the unpriced 905 his namesake's FantasyCalc entry.)
  const b = ask(available(), { player: '904' })
  assert.equal(b.rookie.sleeperId, '904')
  assert.equal(b.rookie.position, 'WR')
})

test('the board is bounded, and the true count rides beside it', () => {
  const a = ask(available(), { limit: 2 })
  assert.equal(a.board.length, 2)
  assert.equal(a.counts.returned, 2)
  assert.equal(a.counts.matchingFilter, 6)
  assert.equal(a.counts.truncated, true)
  assert.ok(a.notes.some(n => /Showing the top 2 of 6/.test(n)))
  const big = ask(available(), { limit: 999 })
  assert.ok(big.board.length <= MAX_LIMIT)
})

test('the position filter applies to the board, the shortlist and the divergence lists', () => {
  const a = ask(available(), { position: 'wr', limit: 40 })
  assert.equal(a.filter.position, 'WR')
  for (const list of [a.board, a.targets, a.undervalued, a.overvalued]) {
    assert.ok(list.every(r => r.position === 'WR'))
  }
  const def = ask(available(), { position: 'DEF' })
  assert.equal(def.ok, false)
  assert.match(def.error, /defense/i)
})

test('roster fit is read for the REQUESTED team, and an unknown team is refused with candidates', () => {
  const mine = ask(available())
  assert.equal(mine.team.isYou, true)
  assert.deepEqual(mine.team.deficits, ['WR'], 'the fixture league is thin at WR for roster 6')
  const wr = ask(available(), { player: '900' })
  assert.equal(wr.rookie.fitsNeed, true)
  assert.ok(wr.rookie.fitReasons.some(r => /WR need/.test(r)))

  const bad = ask(available(), { team: 'nobody by that name' })
  assert.equal(bad.ok, false)
  assert.ok(bad.candidates.length >= 3)
})

test('without the player DB there is no class to rank, and it says so rather than returning []', () => {
  const a = buildRookieResearchAnswer(makeSnapshot({ playerDB: null }), available(), { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.ok, false)
  assert.match(a.error, /player DB/)
})

// ── mcp/feeds.js — the loader both new static feeds go through ─────────────

test('feeds: a failed fetch is available:false with the reason, and never throws', async () => {
  const r = await getRookieIntel({ fetcher: async () => { throw new Error('HTTP 404') }, store: memoryStore() })
  assert.equal(r.available, false)
  assert.equal(r.data, null)
  assert.match(r.error, /404/)
})

test('feeds: a 200 with the WRONG SHAPE is a miss, never a partial answer — and is not cached', async () => {
  const store = memoryStore()
  let calls = 0
  const bad = await getTradeValues({ fetcher: async () => { calls++; return { nope: true } }, store })
  assert.equal(bad.available, false)
  const good = await getTradeValues({ fetcher: async () => { calls++; return { updatedAt: 'x', trades: {} } }, store })
  assert.equal(good.available, true, 'the malformed payload was not written to the cache')
  assert.equal(calls, 2)
})

test('feeds: a good read is stamped and cached', async () => {
  const store = memoryStore()
  let calls = 0
  const fetcher = async () => { calls++; return FEED }
  const a = await getRookieIntel({ fetcher, store })
  const b = await getRookieIntel({ fetcher, store })
  assert.equal(a.available, true)
  assert.equal(b.available, true)
  assert.equal(calls, 1)
  assert.equal(typeof a.source.fetchedAt, 'string')
  assert.ok(a.ageHours >= 1.9 && a.ageHours <= 2.1)
})
