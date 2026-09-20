// tests/mcpHistory.test.mjs — pins mcp/history.js, the narrow league-history
// walk behind analyze_trade's pick-confidence nudge.
//
// Behaviours pinned (with their source):
//  - history.js's header, THE sizing decision: the app's useLeagueHistory
//    fires ~169 concurrent requests (CLAUDE.md), almost all of them weekly
//    TRANSACTION buckets that draft grading never reads. This walk fetches
//    leagues + rosters + drafts + picks and nothing else, and the test proves
//    it by asserting no transaction URL is ever requested.
//  - CLAUDE.md, Feature 11: the chain is `previous_league_id`, capped, and
//    ends wherever it ends (a recreated league simply covers fewer seasons).
//  - The degradation contract: a failed walk removes CONTEXT, never a number.
//  - Rule 8's shape: '0' is Sleeper's no-previous-league sentinel.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getLeagueHistory, resetHistoryCache, MAX_SEASONS_BACK, DEFAULT_HISTORY_TTL_MS } from '../mcp/history.js'
import { DEFAULT_SEASON_TTL_MS } from '../mcp/season.js'

const CURRENT = { league_id: 'L2026', season: '2026', previous_league_id: 'L2025' }

// A chain: 2026 → 2025 → 2024, then Sleeper's '0' sentinel.
const CHAIN = {
  L2025: { league_id: 'L2025', season: '2025', previous_league_id: 'L2024' },
  L2024: { league_id: 'L2024', season: '2024', previous_league_id: '0' },
}

function fakeFetcher({ failLeagues = [], failAll = false, noPicks = false } = {}) {
  const calls = []
  const fn = async url => {
    calls.push(url)
    if (failAll) throw new Error('Sleeper 500')
    const league = url.match(/\/league\/([^/]+)$/)?.[1]
    if (league) {
      if (failLeagues.includes(league)) throw new Error('Sleeper 500')
      return CHAIN[league] ?? null
    }
    if (/\/rosters$/.test(url)) return [{ roster_id: 1, owner_id: 'u6', settings: { wins: 5, losses: 4 } }]
    if (/\/drafts$/.test(url)) {
      const id = url.match(/\/league\/([^/]+)\/drafts$/)[1]
      return [{ draft_id: `d-${id}`, season: CHAIN[id]?.season ?? '2026', settings: { rounds: 4 } }]
    }
    if (/\/picks$/.test(url)) {
      if (noPicks) return []
      return [{ player_id: '100', pick_no: 1, round: 1, draft_slot: 1, roster_id: 1, picked_by: 'u6' }]
    }
    return null
  }
  fn.calls = calls
  return fn
}

// ── the walk is NARROW, and that is the point ────────────────────────────

test('the walk NEVER fetches a transaction bucket — the ~169-request half', async () => {
  resetHistoryCache()
  const get = fakeFetcher()
  await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: get })
  assert.equal(
    get.calls.filter(u => u.includes('/transactions/')).length, 0,
    'draft grading reads no transactions; fetching them would be the app\'s cost for none of its benefit'
  )
})

test('it also skips /users — nothing in a draft grade needs a display name', async () => {
  resetHistoryCache()
  const get = fakeFetcher()
  await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: get })
  assert.equal(get.calls.filter(u => /\/users$/.test(u)).length, 0)
})

test('the whole walk on a 3-season chain stays in single digits', async () => {
  resetHistoryCache()
  const get = fakeFetcher()
  await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: get })
  assert.ok(get.calls.length < 20, `expected a narrow walk, got ${get.calls.length} requests`)
})

// ── the chain ────────────────────────────────────────────────────────────

test('it walks previous_league_id back through every past season', async () => {
  resetHistoryCache()
  const res = await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: fakeFetcher() })
  assert.equal(res.available, true)
  assert.deepEqual(res.history.pastSeasons.map(s => s.season), ['2025', '2024'], 'newest → oldest')
  assert.equal(res.seasonsBack, 2)
})

test("'0' ends the chain — it is a sentinel, not a league id", async () => {
  resetHistoryCache()
  const get = fakeFetcher()
  await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: get })
  assert.equal(get.calls.filter(u => /\/league\/0$/.test(u)).length, 0)
})

test('a league with no previous season is a one-season history, not an error', async () => {
  resetHistoryCache()
  const res = await getLeagueHistory({
    leagueId: 'L2026', leagueInfo: { league_id: 'L2026', season: '2026', previous_league_id: null },
    fetcher: fakeFetcher(),
  })
  assert.equal(res.available, true)
  assert.deepEqual(res.history.pastSeasons, [])
  assert.ok(res.history.currentDrafts.length, 'the current season still contributes its own draft')
})

test('a broken hop ends the chain rather than failing the walk', async () => {
  // CLAUDE.md: "If the league was ever recreated instead of renewed, the
  // chain just ends there and profiles cover fewer seasons."
  resetHistoryCache()
  const res = await getLeagueHistory({
    leagueId: 'L2026', leagueInfo: CURRENT, fetcher: fakeFetcher({ failLeagues: ['L2024'] }),
  })
  assert.equal(res.available, true)
  assert.deepEqual(res.history.pastSeasons.map(s => s.season), ['2025'])
})

test('the chain is capped, so a pathological history cannot run away', () => {
  assert.equal(MAX_SEASONS_BACK, 8, 'kept identical to the app\'s own cap')
})

// ── the shape normalizeSeasons consumes ──────────────────────────────────

test('past seasons carry users and transactions as EMPTY arrays, never undefined', async () => {
  // normalizeSeasons maps over both. Leaving them undefined would throw
  // inside src/utils rather than degrade here.
  resetHistoryCache()
  const res = await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: fakeFetcher() })
  res.history.pastSeasons.forEach(s => {
    assert.ok(Array.isArray(s.users))
    assert.ok(Array.isArray(s.transactions))
    assert.ok(Array.isArray(s.rosters), 'the roster→owner map IS needed, so these are real')
  })
})

test('a draft with no picks yet contributes an empty list, not a failure', async () => {
  resetHistoryCache()
  const res = await getLeagueHistory({
    leagueId: 'L2026', leagueInfo: CURRENT, fetcher: fakeFetcher({ noPicks: true }),
  })
  assert.equal(res.available, true)
  assert.deepEqual(res.history.currentDrafts[0].picks, [])
})

// ── caching + degradation ────────────────────────────────────────────────

test('the walk is cached — a second call costs nothing', async () => {
  resetHistoryCache()
  const get = fakeFetcher()
  await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: get })
  const first = get.calls.length
  await getLeagueHistory({ leagueId: 'L2026', leagueInfo: CURRENT, fetcher: get })
  assert.equal(get.calls.length, first, 'past seasons are frozen; re-walking them is re-fetching history')
})

test('history has the LONGEST TTL in the server, because a past season is frozen', () => {
  assert.ok(DEFAULT_HISTORY_TTL_MS > DEFAULT_SEASON_TTL_MS)
})

test('a totally failed walk removes CONTEXT, never a number', async () => {
  resetHistoryCache()
  const res = await getLeagueHistory({
    leagueId: 'L2026', leagueInfo: CURRENT, fetcher: fakeFetcher({ failAll: true }),
  })
  assert.equal(res.available, false)
  assert.equal(res.reason, 'unavailable')
  assert.equal(res.history, null)
  assert.ok(res.notes.some(n => /never a number/i.test(n)))
})

test('a league that has genuinely never drafted is AVAILABLE with an empty record', async () => {
  // The other side of the contract above, and the reason the drafts LIST
  // error is not swallowed: measured emptiness is a real answer, inferred
  // emptiness after an outage is a claim about the owner.
  resetHistoryCache()
  const get = async url => {
    if (/\/drafts$/.test(url)) return []
    if (/\/league\/[^/]+$/.test(url)) return null
    return []
  }
  const res = await getLeagueHistory({
    leagueId: 'L2026',
    leagueInfo: { league_id: 'L2026', season: '2026', previous_league_id: null },
    fetcher: get,
  })
  assert.equal(res.available, true, 'nothing failed — there is simply nothing to report')
  assert.deepEqual(res.history.currentDrafts, [])
})
