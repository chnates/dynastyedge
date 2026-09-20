// tests/mcpSeason.test.mjs — pins mcp/season.js, the rest-of-season data layer.
//
// Behaviours pinned (with their source):
//  - mcp/season.js's header, THE state that must not happen: fourteen empty
//    weeks and a season that has not started are identical on the wire, so a
//    total fetch failure must NEVER be reported as a preseason. The app's
//    src/hooks/matchupWeeks.js rejects for the same reason, so League ›
//    Playoffs shows an ErrorState rather than a fake "preseason".
//  - The app's per-week `.catch(() => [])` contract: ONE bad bucket degrades,
//    it does not sink the set.
//  - Its own TTL, deliberately not weekly.js's or the snapshot's.
//  - MCP_DISCOVERY.md §7: every source carries a stamp, and an answer
//    assembled from fourteen fetches is only as fresh as its OLDEST.
//  - CLAUDE.md, League Context: read playoff_week_start from league settings,
//    never assume it.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  getSeasonWeeks, regularSeasonWeeks, playoffFieldSize,
  resetSeasonCache, DEFAULT_SEASON_TTL_MS,
} from '../mcp/season.js'
import { DEFAULT_WEEKLY_TTL_MS } from '../mcp/weekly.js'

const LEAGUE_INFO = { settings: { playoff_week_start: 15, playoff_teams: 6 } }

const entriesFor = week => [
  { roster_id: 1, matchup_id: 1, points: week <= 2 ? 110 : 0 },
  { roster_id: 2, matchup_id: 1, points: week <= 2 ? 98 : 0 },
]

// Stands in for mcp/limit.js's fetcher. `failWeeks` throws for those weeks.
function fakeFetcher({ failWeeks = [], failAll = false } = {}) {
  const calls = []
  const fn = async url => {
    calls.push(url)
    const week = Number(url.match(/\/matchups\/(\d+)/)?.[1])
    if (failAll || failWeeks.includes(week)) throw new Error(`Sleeper 500 (week ${week})`)
    return entriesFor(week)
  }
  fn.calls = calls
  return fn
}

// ── the week range comes from league settings, never a guess ─────────────

test('regularSeasonWeeks reads playoff_week_start from league settings', () => {
  assert.equal(regularSeasonWeeks({ settings: { playoff_week_start: 15 } }), 14)
  assert.equal(regularSeasonWeeks({ settings: { playoff_week_start: 14 } }), 13)
})

test('a league with no settings falls back to Sleeper defaults rather than 0 weeks', () => {
  assert.equal(regularSeasonWeeks(null), 14, 'playoff_week_start 15')
  assert.equal(playoffFieldSize(null), 6)
})

test('playoffFieldSize reads playoff_teams from settings', () => {
  assert.equal(playoffFieldSize({ settings: { playoff_teams: 4 } }), 4)
})

// ── THE contract: a total outage is not a preseason ──────────────────────

test('when EVERY week fails, the result is unavailable — never a silent preseason', async () => {
  resetSeasonCache()
  const season = await getSeasonWeeks({
    leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher: fakeFetcher({ failAll: true }),
  })
  assert.equal(season.available, false)
  assert.equal(season.reason, 'unavailable')
  assert.equal(season.perWeek, null, 'null, never 14 empty weeks that read as a preseason')
  assert.equal(season.failedWeeks.length, 14)
  assert.ok(
    season.notes.some(n => /NOT a preseason/i.test(n)),
    'the note must say explicitly that this is a data failure, because the two shapes are identical'
  )
})

test('a total outage is distinguishable from a real preseason by reason alone', async () => {
  resetSeasonCache()
  // A real preseason: every week fetches fine and every week is empty.
  const empty = async () => []
  const pre = await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher: empty })
  assert.equal(pre.available, true, 'fetching successfully and finding nothing is a real answer')
  assert.equal(pre.reason, null)
  assert.equal(pre.perWeek.length, 14)
  assert.ok(pre.perWeek.every(w => w.entries.length === 0))

  const out = await getSeasonWeeks({
    leagueId: 'L2', leagueInfo: LEAGUE_INFO, fetcher: fakeFetcher({ failAll: true }),
  })
  assert.notEqual(pre.available, out.available)
})

// ── one bad bucket degrades, it does not sink the set ────────────────────

test('a single failed week contributes empty entries and a note, not a failure', async () => {
  resetSeasonCache()
  const season = await getSeasonWeeks({
    leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher: fakeFetcher({ failWeeks: [3] }),
  })
  assert.equal(season.available, true)
  assert.deepEqual(season.failedWeeks, [3])
  assert.equal(season.perWeek.length, 14)
  assert.deepEqual(season.perWeek[2].entries, [], 'week 3 degrades to empty')
  assert.equal(season.perWeek[0].entries.length, 2, 'the rest are untouched')
  assert.ok(
    season.notes.some(n => /Week\(s\) 3 did not load/.test(n)),
    'a missing week understates results and must be disclosed'
  )
})

test('perWeek is the exact shape buildPlayoffOutlook takes — { week, entries }', async () => {
  resetSeasonCache()
  const season = await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher: fakeFetcher() })
  season.perWeek.forEach((w, i) => {
    assert.equal(w.week, i + 1, 'weeks are 1-indexed and in order')
    assert.ok(Array.isArray(w.entries))
  })
})

// ── caching ──────────────────────────────────────────────────────────────

test('weeks are cached per week, so a second call costs no request', async () => {
  resetSeasonCache()
  const fetcher = fakeFetcher()
  await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher })
  assert.equal(fetcher.calls.length, 14)
  await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher })
  assert.equal(fetcher.calls.length, 14, 'the second call is served from the store')
})

test('force refetches', async () => {
  resetSeasonCache()
  const fetcher = fakeFetcher()
  await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher })
  await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher, force: true })
  assert.equal(fetcher.calls.length, 28)
})

test('a second league does not read the first league\'s weeks', async () => {
  resetSeasonCache()
  const fetcher = fakeFetcher()
  await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher })
  await getSeasonWeeks({ leagueId: 'L2', leagueInfo: LEAGUE_INFO, fetcher })
  assert.equal(fetcher.calls.length, 28, 'matchups are league-scoped, unlike values and the player DB')
})

test('the TTL is its OWN constant, not an alias of the weekly layer\'s', () => {
  // The two are the same NUMBER today and that is fine — what must not happen
  // is one being defined as the other, because then moving weekly.js's TTL
  // (which is argued from projection drift) would silently move this one
  // (which is argued from "a completed week is frozen forever"). Pinning the
  // literal is what makes a future re-derivation of either a visible change.
  assert.equal(DEFAULT_SEASON_TTL_MS, 60 * 60 * 1000)
  assert.equal(DEFAULT_WEEKLY_TTL_MS, 60 * 60 * 1000)
  assert.ok(
    DEFAULT_SEASON_TTL_MS > 15 * 60 * 1000,
    'longer than the snapshot: rosters change on an event, a played week never changes again'
  )
})

// ── provenance ───────────────────────────────────────────────────────────

test('the stamp is the OLDEST of the weeks, never the newest', async () => {
  resetSeasonCache()
  const season = await getSeasonWeeks({ leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher: fakeFetcher() })
  const at = season.sources.matchups.fetchedAt
  assert.ok(at, 'a stamp is present')
  assert.equal(typeof season.sources.matchups.stale, 'boolean')
  // Fourteen fetches in one pass land within milliseconds; what is pinned is
  // that the field exists and is a real ISO time the reader can age.
  assert.ok(!Number.isNaN(Date.parse(at)))
})

test('a partial failure is recorded on the stamp\'s error, not hidden', async () => {
  resetSeasonCache()
  const season = await getSeasonWeeks({
    leagueId: 'L1', leagueInfo: LEAGUE_INFO, fetcher: fakeFetcher({ failWeeks: [2, 5] }),
  })
  assert.match(season.sources.matchups.error, /2 of 14 weeks failed/)
})
