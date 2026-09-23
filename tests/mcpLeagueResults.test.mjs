// tests/mcpLeagueResults.test.mjs — pins tool #12, get_league_results, the
// bracket reader under it (src/utils/leagueResults.js) and its data layer
// (mcp/results.js).
//
// Behaviours pinned (with their doc source):
//  - MCP_DISCOVERY.md §5: "who won our league in 2023?" is read from
//    /league/{id}/winners_bracket — the p:1 game's winner, on the shape probed
//    live 2026-09-22 (the fixtures below are that payload, verbatim in form).
//  - A current-season bracket with every w/l null is IN PROGRESS, never
//    "nobody won"; an unreadable bracket is UNKNOWN, never "no champion".
//  - Titles are credited by owner_id — roster ids are season-scoped.
//  - The walk is built on the NARROW history walk: it adds brackets + users
//    and never a transaction bucket.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readBracketPlacements, buildSeasonResult, countTitles } from '../src/utils/leagueResults.js'
import { getLeagueResults } from '../mcp/results.js'
import { buildResultsAnswer, renderResultsText } from '../mcp/tools/leagueResults.js'
import { memoryStore } from '../mcp/store.js'
import { makeSnapshot } from './helpers/mcpFixtures.mjs'

// The real 2023 bracket of this league (probed 2026-09-22): roster 3 won.
const BRACKET_2023 = [
  { m: 1, r: 1, l: 1, w: 3, t1: 3, t2: 1 },
  { m: 2, r: 1, l: 5, w: 7, t1: 7, t2: 5 },
  { m: 3, r: 2, l: 10, w: 3, t1: 10, t2: 3, t2_from: { w: 1 } },
  { m: 4, r: 2, l: 7, w: 8, t1: 8, t2: 7, t2_from: { w: 2 } },
  { p: 5, m: 5, r: 2, l: 5, w: 1, t1: 1, t2: 5, t2_from: { l: 2 }, t1_from: { l: 1 } },
  { p: 1, m: 6, r: 3, l: 8, w: 3, t1: 3, t2: 8, t2_from: { w: 4 }, t1_from: { w: 3 } },
  { p: 3, m: 7, r: 3, l: 7, w: 10, t1: 10, t2: 7, t2_from: { l: 4 }, t1_from: { l: 3 } },
]
// The current season in September: the bracket EXISTS with every result null.
const BRACKET_LIVE = [
  { m: 1, r: 1, l: null, w: null, t1: 3, t2: 1 },
  { m: 6, p: 1, r: 3, l: null, w: null, t1: null, t2: null, t2_from: { w: 4 }, t1_from: { w: 3 } },
]

// ── the reader ────────────────────────────────────────────────────────────

test('the champion is the p:1 game\'s winner — the live 2023 shape', () => {
  const p = readBracketPlacements(BRACKET_2023)
  assert.deepEqual(
    [p.champion, p.runnerUp, p.third, p.fourth, p.fifth, p.sixth],
    [3, 8, 10, 7, 1, 5],
  )
  assert.equal(p.decided, true)
})

test('a posted-but-unplayed bracket is in progress, and no bracket is not a champion', () => {
  const live = readBracketPlacements(BRACKET_LIVE)
  assert.equal(live.decided, false)
  assert.equal(live.hasBracket, true)
  assert.equal(live.champion, null)
  assert.equal(buildSeasonResult({ season: '2026', bracket: BRACKET_LIVE }).status, 'in-progress')
  assert.equal(buildSeasonResult({ season: '2026', bracket: [] }).status, 'no-bracket')
})

test('placements carry owner_id, names fall back to the owner\'s current team, and standings sort by W then PF', () => {
  const rosters = [
    { roster_id: 3, owner_id: 'uA', settings: { wins: 9, losses: 5, fpts: 1904, fpts_decimal: 14 } },
    { roster_id: 8, owner_id: 'uB', settings: { wins: 11, losses: 3, fpts: 2116, fpts_decimal: 24 } },
    { roster_id: 10, owner_id: 'uC', settings: { wins: 12, losses: 2, fpts: 2153, fpts_decimal: 32 } },
  ]
  const r = buildSeasonResult({
    season: '2023', bracket: BRACKET_2023, rosters,
    users: [{ user_id: 'uA', metadata: { team_name: 'old name' } }],
    metadataWinner: '3',
    nameForOwner: id => (id === 'uB' ? 'Today B' : null),
  })
  assert.equal(r.status, 'complete')
  assert.deepEqual(r.champion, { rosterId: 3, ownerId: 'uA', teamName: 'Old Name' })
  assert.equal(r.runnerUp.teamName, 'Today B', 'no season user -> the owner\'s current name')
  assert.equal(r.third.teamName, 'Roster 10', 'nothing known -> a stable placeholder, never undefined')
  assert.equal(r.metadataAgrees, true)
  assert.deepEqual(r.standings.map(s => s.rosterId), [10, 8, 3])
  assert.equal(r.standings[0].pointsFor, 2153.32)
})

test('titles are counted by OWNER, across seasons', () => {
  const t = countTitles([
    { season: '2025', champion: { ownerId: 'uA' } },
    { season: '2024', champion: { ownerId: 'uA' } },
    { season: '2023', champion: { ownerId: 'uB' } },
    { season: '2026', champion: null },
  ])
  assert.deepEqual(t.map(x => [x.ownerId, x.titles]), [['uA', 2], ['uB', 1]])
})

// ── the walk ──────────────────────────────────────────────────────────────

const CURRENT = { league_id: 'L', season: '2027', previous_league_id: 'P1' }
const PAST = { league_id: 'P1', season: '2026', previous_league_id: '0', metadata: { latest_league_winner_roster_id: '3' } }

function routes({ failPastBracket = false } = {}) {
  const urls = []
  const fetcher = async url => {
    urls.push(url)
    const path = url.replace(/^https:\/\/api\.sleeper\.app\/v1/, '')
    if (path === '/league/P1') return PAST
    if (path.endsWith('/drafts')) return []
    if (path === '/league/P1/rosters') return [{ roster_id: 3, owner_id: 'u6', settings: { wins: 9 } }]
    if (path === '/league/P1/users') return [{ user_id: 'u6', display_name: 'chnates' }]
    if (path === '/league/P1/winners_bracket') {
      if (failPastBracket) throw new Error('HTTP 503')
      return BRACKET_2023
    }
    if (path === '/league/L/winners_bracket') return BRACKET_LIVE
    throw new Error(`unrouted ${url}`)
  }
  return { urls, fetcher }
}

test('the walk reads a bracket + users per season on top of the narrow walk — and no transaction bucket', async () => {
  const { urls, fetcher } = routes()
  const r = await getLeagueResults({ leagueId: 'L', leagueInfo: CURRENT, fetcher, store: memoryStore() })
  assert.equal(r.available, true)
  assert.equal(r.seasons.length, 1)
  assert.equal(r.seasons[0].bracket.length, BRACKET_2023.length)
  assert.deepEqual(r.current.bracket, BRACKET_LIVE)
  assert.equal(urls.filter(u => u.includes('/transactions/')).length, 0)
  assert.equal(urls.filter(u => u.endsWith('/winners_bracket')).length, 2)
})

test('an unreadable past bracket is NAMED and not cached — the next call retries it', async () => {
  const store = memoryStore()
  const bad = await getLeagueResults({ leagueId: 'L', leagueInfo: CURRENT, fetcher: routes({ failPastBracket: true }).fetcher, store })
  assert.deepEqual(bad.failedSeasons, ['2026'])
  assert.equal(bad.seasons[0].bracket, null)
  const good = await getLeagueResults({ leagueId: 'L', leagueInfo: CURRENT, fetcher: routes().fetcher, store })
  assert.deepEqual(good.failedSeasons, [])
})

// ── the tool ──────────────────────────────────────────────────────────────

const snap = () => makeSnapshot({
  league: { ...makeSnapshot().league, leagueInfo: { ...makeSnapshot().league.leagueInfo, season: '2027', settings: { playoff_week_start: 15 } } },
})

test('the tool names the 2026 champion by the owner, and the current season is in progress', async () => {
  const results = await getLeagueResults({ leagueId: 'L', leagueInfo: CURRENT, fetcher: routes().fetcher, store: memoryStore() })
  const a = buildResultsAnswer(snap(), results)
  assert.equal(a.ok, true)
  const past = a.seasons.find(s => s.season === '2026')
  assert.equal(past.status, 'complete')
  assert.equal(past.champion.ownerId, 'u6')
  assert.equal(past.champion.teamName, 'Chnates', 'the season\'s own user name')
  assert.deepEqual(a.titles.map(t => [t.ownerId, t.titles, t.stillInLeague]), [['u6', 1, true]])
  const now = a.seasons.find(s => s.season === '2027')
  assert.equal(now.status, 'in-progress')
  assert.equal(now.champion, null)
  assert.ok(a.notes.some(n => /in progress/.test(n) && /week 15/.test(n)))
  assert.match(renderResultsText(a), /2026: champion Chnates/)
})

test('an unreadable bracket reads UNKNOWN in the tool — never "no champion"', async () => {
  const results = await getLeagueResults({ leagueId: 'L', leagueInfo: CURRENT, fetcher: routes({ failPastBracket: true }).fetcher, store: memoryStore() })
  const a = buildResultsAnswer(snap(), results)
  const past = a.seasons.find(s => s.season === '2026')
  assert.equal(past.status, 'unavailable')
  assert.equal(past.champion, null)
  assert.ok(a.notes.some(n => /not "nobody won"/.test(n)))
  assert.equal(a.titles.length, 0)
  assert.match(renderResultsText(a), /champion unknown/)
})

test('one season on request, and an unknown season refuses with what exists', async () => {
  const results = await getLeagueResults({ leagueId: 'L', leagueInfo: CURRENT, fetcher: routes().fetcher, store: memoryStore() })
  const one = buildResultsAnswer(snap(), results, { season: '2026' })
  assert.equal(one.seasons.length, 1)
  assert.equal(one.counts.seasons, 2)
  const none = buildResultsAnswer(snap(), results, { season: '1999' })
  assert.equal(none.ok, false)
  assert.deepEqual(none.seasonsAvailable, ['2027', '2026'])
})

test('the history walk failing entirely is unavailable, with no champion invented', () => {
  const a = buildResultsAnswer(snap(), { available: false, current: { bracket: null }, seasons: [], failedSeasons: [] })
  assert.equal(a.available, false)
  assert.ok(a.seasons.every(s => s.champion === null))
  assert.ok(a.notes.some(n => /not a claim that any season went without a winner/.test(n)))
})
