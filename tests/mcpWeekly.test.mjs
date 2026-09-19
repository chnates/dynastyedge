// tests/mcpWeekly.test.mjs — pins mcp/weekly.js, the in-season data layer.
//
// Behaviors pinned (with their source):
//  - CLAUDE.md, "Weekly tools are in-season only": a weekly tool must SAY the
//    offseason rather than return zeros.
//  - CLAUDE.md, the critical schedule note: the schedule is the ONE Sleeper
//    endpoint NOT under /v1, and its fields are `home`/`away`, not
//    `home_team`/`away_team`. BOTH mistakes fail SILENTLY as "no games".
//  - CLAUDE.md / projections.js getAvailability: an EMPTY playingTeams set
//    means "we cannot know who is on bye", never "everyone is on bye".
//  - The deliberate TTL decision recorded in mcp/weekly.js's header:
//    projections are cached LONGER than the league snapshot.
//  - MCP_DISCOVERY.md §7: every source carries a stamp.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getWeekly, parseByeTeams, resetWeeklyCache, DEFAULT_WEEKLY_TTL_MS } from '../mcp/weekly.js'
import { mergeAsOf } from '../mcp/snapshot.js'

const IN_SEASON = { season: '2027', season_type: 'regular', week: 3 }
const OFFSEASON = { season: '2027', season_type: 'pre' }

// A fetcher standing in for mcp/limit.js's, recording what was asked for.
function fakeFetcher({ proj = { 1: { pts_half_ppr: 10 } }, schedule = [], fail = null } = {}) {
  const calls = []
  const fn = async url => {
    calls.push(url)
    if (fail && url.includes(fail)) throw new Error(`${fail} 500`)
    if (url.includes('/projections/')) return proj
    if (url.includes('/schedule/')) return schedule
    throw new Error(`unexpected url ${url}`)
  }
  fn.calls = calls
  return fn
}

// ── the offseason SAYS so, never zeros ───────────────────────────────────

test('offseason returns available:false with a note and no projMap', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher()
  const w = await getWeekly({ nflState: OFFSEASON, fetcher })
  assert.equal(w.available, false)
  assert.equal(w.isOffseason, true)
  assert.equal(w.projMap, null, 'null, never an empty map that reads as zeros')
  assert.ok(w.notes.some(n => /offseason/i.test(n)))
})

test('the offseason costs no upstream request at all', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher()
  await getWeekly({ nflState: OFFSEASON, fetcher })
  assert.equal(fetcher.calls.length, 0, 'there is nothing to fetch')
})

test('missing NFL state is treated as the offseason, not as week 0', async () => {
  resetWeeklyCache()
  const w = await getWeekly({ nflState: null, fetcher: fakeFetcher() })
  assert.equal(w.available, false)
  assert.equal(w.isOffseason, true)
})

test('in season with no resolvable week reports that, rather than guessing one', async () => {
  resetWeeklyCache()
  const w = await getWeekly({ nflState: { season: '2027', season_type: 'regular' }, fetcher: fakeFetcher() })
  assert.equal(w.available, false)
  assert.equal(w.week, null)
  assert.ok(w.notes.some(n => /no current week/i.test(n)))
})

// ── the schedule traps ───────────────────────────────────────────────────

test('the schedule is fetched off SLEEPER_ROOT, NOT /v1', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher()
  await getWeekly({ nflState: IN_SEASON, fetcher })
  const url = fetcher.calls.find(u => u.includes('/schedule/'))
  assert.ok(url, 'the schedule must be fetched')
  assert.ok(!url.includes('/v1/'), '/v1/schedule 404s for every season — it fails silently')
})

test('parseByeTeams reads `home`/`away`, not `home_team`/`away_team`', () => {
  const right = parseByeTeams([{ week: 3, home: 'KC', away: 'BUF' }], 3)
  assert.deepEqual([...right].sort(), ['BUF', 'KC'])
  // The wrong field names are the other half of the silent failure.
  const wrong = parseByeTeams([{ week: 3, home_team: 'KC', away_team: 'BUF' }], 3)
  assert.equal(wrong.size, 0, 'wrong field names yield no games — the silent bug')
})

test('parseByeTeams filters to the requested week', () => {
  const games = [{ week: 3, home: 'KC', away: 'BUF' }, { week: 4, home: 'ATL', away: 'NO' }]
  assert.deepEqual([...parseByeTeams(games, 4)].sort(), ['ATL', 'NO'])
})

test('a failed schedule leaves playingTeams EMPTY and says byes are unknown', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher({ fail: '/schedule/' })
  const w = await getWeekly({ nflState: IN_SEASON, fetcher })
  assert.equal(w.playingTeams.size, 0)
  // getAvailability only calls a bye when the set is non-empty, so an empty
  // set must mean "cannot know" — never "everybody is on bye".
  assert.ok(w.notes.some(n => /nobody is assumed to be on bye/i.test(n)))
  assert.equal(w.available, true, 'a missing schedule degrades advice, never fails it')
})

test('a failed projections fetch is not fatal and is disclosed', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher({ fail: '/projections/' })
  const w = await getWeekly({ nflState: IN_SEASON, fetcher })
  assert.equal(w.available, false)
  assert.equal(w.projMap, null)
  assert.ok(w.notes.some(n => /did not load/i.test(n)))
})

// ── the TTL decision ─────────────────────────────────────────────────────

test('projections are cached LONGER than the 15-minute league snapshot', () => {
  // The deliberate decision, not an inherited default: league data changes on
  // an event, projections on a 0.06%/10h drip.
  assert.ok(DEFAULT_WEEKLY_TTL_MS > 15 * 60 * 1000)
  assert.equal(DEFAULT_WEEKLY_TTL_MS, 60 * 60 * 1000)
})

test('a second call inside the TTL costs no upstream request', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher()
  await getWeekly({ nflState: IN_SEASON, fetcher })
  const afterFirst = fetcher.calls.length
  await getWeekly({ nflState: IN_SEASON, fetcher })
  assert.equal(fetcher.calls.length, afterFirst, 'the cache must serve the second call')
})

test('force bypasses the cache — the near-kickoff escape hatch', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher()
  await getWeekly({ nflState: IN_SEASON, fetcher })
  const afterFirst = fetcher.calls.length
  await getWeekly({ nflState: IN_SEASON, fetcher, force: true })
  assert.ok(fetcher.calls.length > afterFirst)
})

test('a different week is a different cache entry', async () => {
  resetWeeklyCache()
  const fetcher = fakeFetcher()
  await getWeekly({ nflState: IN_SEASON, fetcher })
  const afterFirst = fetcher.calls.length
  await getWeekly({ nflState: IN_SEASON, week: 5, fetcher })
  assert.ok(fetcher.calls.length > afterFirst)
})

test('requesting a past week says what that projection actually means', async () => {
  resetWeeklyCache()
  const w = await getWeekly({ nflState: IN_SEASON, week: 1, fetcher: fakeFetcher() })
  assert.equal(w.week, 1)
  assert.ok(w.notes.some(n => /what was forecast then, not what happened/i.test(n)))
})

// ── stamps ───────────────────────────────────────────────────────────────

test('every weekly source carries a stamp in the shared shape', async () => {
  resetWeeklyCache()
  const w = await getWeekly({ nflState: IN_SEASON, fetcher: fakeFetcher() })
  ;['projections', 'schedule'].forEach(k => {
    const s = w.sources[k]
    assert.ok(s, `${k} must be stamped`)
    assert.deepEqual(Object.keys(s).sort(), ['ageSeconds', 'error', 'fetchedAt', 'stale'])
  })
})

test('mergeAsOf RECOMPUTES the overall age over the union', () => {
  const asOf = {
    generatedAt: 'now', oldestSourceAt: '2027-09-19T13:58:00.000Z', stale: false,
    sources: { sleeper: { fetchedAt: '2027-09-19T13:58:00.000Z', ageSeconds: 1, stale: false, error: null } },
  }
  const merged = mergeAsOf(asOf, {
    projections: { fetchedAt: '2027-09-19T13:00:00.000Z', ageSeconds: 3480, stale: false, error: null },
  })
  // An older projection must drag the stated age down — it must not hide
  // behind a fresh roster fetch.
  assert.equal(merged.oldestSourceAt, '2027-09-19T13:00:00.000Z')
})

test('mergeAsOf propagates staleness from an added source', () => {
  const asOf = {
    generatedAt: 'now', oldestSourceAt: 'x', stale: false,
    sources: { sleeper: { fetchedAt: 'x', ageSeconds: 1, stale: false, error: null } },
  }
  const merged = mergeAsOf(asOf, {
    projections: { fetchedAt: 'x', ageSeconds: 1, stale: true, error: 'boom' },
  })
  assert.equal(merged.stale, true, 'the answer is only as fresh as its worst input')
})
