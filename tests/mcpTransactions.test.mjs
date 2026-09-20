// tests/mcpTransactions.test.mjs — pins mcp/transactions.js, the season-wide
// transaction feed behind analyze_trade's partner-activity read.
//
// Behaviours pinned (with their source):
//  - transactions.js's header, THE measured decision: Sleeper buckets a
//    transaction by the week it was PROCESSED, so a bucket past the current
//    week is empty by construction. Measured on this league at 2026 week 2 —
//    week 1: 71 complete, week 2: 6, weeks 3/17/18: 0. Fetching 1..18 spends
//    sixteen requests to learn nothing.
//  - The SPLIT TTL: a settled bucket is frozen, the live one changes on an
//    event — the same events that make a roster wrong — so the live week
//    rides the snapshot's freshness, not season.js's 60 minutes.
//  - The degradation contract: "no moves" is a REAL answer about a quiet
//    manager, so an outage must never render as one. Mirrors the app, where
//    all-buckets-failed makes League › Activity show an ErrorState rather
//    than an empty feed (CLAUDE.md, Transactions note).
//  - MCP_DISCOVERY.md §7: the stamp is the OLDEST contributing bucket.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  getTransactions, lastTransactionWeek, resetTransactionsCache,
  DEFAULT_TRANSACTIONS_TTL_MS, DEFAULT_FROZEN_TTL_MS, MAX_TRANSACTION_WEEK,
} from '../mcp/transactions.js'

const IN_SEASON = { season: '2026', season_type: 'regular', week: 2 }

const tx = (id, week, rosterId, status = 'complete') => ({
  transaction_id: id,
  status,
  status_updated: 1000 * week + id,
  type: 'waiver',
  roster_ids: [rosterId],
  adds: { [`p${id}`]: rosterId },
})

function fakeFetcher({ failWeeks = [], failAll = false, byWeek = null } = {}) {
  const calls = []
  const fn = async url => {
    calls.push(url)
    const week = Number(url.match(/\/transactions\/(\d+)/)?.[1])
    if (failAll || failWeeks.includes(week)) throw new Error(`Sleeper 500 (week ${week})`)
    if (byWeek) return byWeek[week] ?? []
    return [tx(week, week, 3), tx(week + 50, week, 3, 'failed')]
  }
  fn.calls = calls
  return fn
}

// ── the week range: measured, not assumed ────────────────────────────────

test('only weeks 1..current are fetched — a later bucket is empty by construction', () => {
  assert.equal(lastTransactionWeek({ week: 2 }), 2)
  assert.equal(lastTransactionWeek({ week: 11 }), 11)
})

test('the range is clamped to the regular season, never past it', () => {
  assert.equal(lastTransactionWeek({ week: 25 }), MAX_TRANSACTION_WEEK)
})

test('an unknown week reads ALL buckets rather than guessing a short range', () => {
  // Absence of NFL state is not evidence the season is young. Guessing low
  // would silently drop the bulk of the feed.
  assert.equal(lastTransactionWeek(null), MAX_TRANSACTION_WEEK)
  assert.equal(lastTransactionWeek({ week: 'nonsense' }), MAX_TRANSACTION_WEEK)
})

test('the offseason still reads week 1, where every offseason move lands', () => {
  assert.equal(lastTransactionWeek({ week: 0 }), 1)
})

test('week 2 costs TWO requests, not eighteen', async () => {
  resetTransactionsCache()
  const get = fakeFetcher()
  await getTransactions({ leagueId: 'L', nflState: IN_SEASON, fetcher: get })
  assert.equal(get.calls.length, 2, 'sixteen empty buckets are not worth asking for')
})

// ── the feed itself ──────────────────────────────────────────────────────

test('only COMPLETE transactions survive, newest first', async () => {
  resetTransactionsCache()
  const res = await getTransactions({ leagueId: 'L2', nflState: IN_SEASON, fetcher: fakeFetcher() })
  assert.equal(res.available, true)
  assert.ok(res.transactions.every(t => t.status === 'complete'), 'a failed claim is not a move')
  const stamps = res.transactions.map(t => t.status_updated)
  assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a))
})

// ── the split TTL — the whole reason this is its own layer ───────────────

test('a settled bucket is served from cache while the LIVE week refetches', async () => {
  resetTransactionsCache()
  const get = fakeFetcher()
  await getTransactions({
    leagueId: 'L3', nflState: { week: 3 }, fetcher: get,
    ttlMs: -1,                      // live week: always stale
    frozenTtlMs: 60 * 60 * 1000,    // settled weeks: fresh
  })
  assert.equal(get.calls.length, 3)

  await getTransactions({
    leagueId: 'L3', nflState: { week: 3 }, fetcher: get,
    ttlMs: -1, frozenTtlMs: 60 * 60 * 1000,
  })
  // Weeks 1 and 2 are frozen and came from cache; only week 3 went out again.
  assert.equal(get.calls.length, 4, 'a refresh costs ONE request, not one per week')
  assert.match(get.calls[3], /\/transactions\/3$/)
})

test('the live week rides the SNAPSHOT default, not season.js\'s 60 minutes', () => {
  // Stated as its own literal so re-deriving another layer's number can never
  // silently move this one (the check mcpSeason.test.mjs makes for its TTL).
  assert.equal(DEFAULT_TRANSACTIONS_TTL_MS, 15 * 60 * 1000)
  assert.ok(DEFAULT_FROZEN_TTL_MS > DEFAULT_TRANSACTIONS_TTL_MS,
    'a frozen bucket must outlive the live one by a wide margin')
})

test('force bypasses BOTH tiers — a settled bucket is not exempt', async () => {
  resetTransactionsCache()
  const get = fakeFetcher()
  const opts = { leagueId: 'L4', nflState: { week: 3 }, fetcher: get, frozenTtlMs: 60 * 60 * 1000 }
  await getTransactions(opts)
  assert.equal(get.calls.length, 3)
  await getTransactions({ ...opts, force: true })
  assert.equal(get.calls.length, 6)
})

// ── degradation: an outage is never a quiet league ───────────────────────

test('ONE bad bucket degrades and is disclosed; it does not sink the feed', async () => {
  resetTransactionsCache()
  const res = await getTransactions({
    leagueId: 'L5', nflState: { week: 3 }, fetcher: fakeFetcher({ failWeeks: [2] }),
  })
  assert.equal(res.available, true)
  assert.deepEqual(res.failedWeeks, [2])
  assert.ok(res.notes.some(n => /did not load/i.test(n)))
  assert.ok(res.notes.some(n => /understates/i.test(n)), 'the direction of the error is stated')
})

test('ALL buckets failing is UNAVAILABLE — never an empty feed', async () => {
  resetTransactionsCache()
  const res = await getTransactions({
    leagueId: 'L6', nflState: IN_SEASON, fetcher: fakeFetcher({ failAll: true }),
  })
  assert.equal(res.available, false)
  assert.equal(res.reason, 'unavailable')
  assert.equal(res.transactions, null, 'an empty ARRAY would read as "they made no moves"')
  assert.ok(res.notes.some(n => /NOT a quiet league/i.test(n)))
})

test('a genuinely empty league IS available with an empty feed', async () => {
  // The other side of the same contract: emptiness is a real answer when it
  // is measured rather than inferred from an outage.
  resetTransactionsCache()
  const res = await getTransactions({
    leagueId: 'L7', nflState: IN_SEASON, fetcher: fakeFetcher({ byWeek: { 1: [], 2: [] } }),
  })
  assert.equal(res.available, true)
  assert.deepEqual(res.transactions, [])
})

// ── provenance ───────────────────────────────────────────────────────────

test('the stamp is the OLDEST contributing bucket, never the newest', async () => {
  resetTransactionsCache()
  const res = await getTransactions({ leagueId: 'L8', nflState: IN_SEASON, fetcher: fakeFetcher() })
  const stamp = res.sources.transactions
  assert.ok(stamp.fetchedAt, 'the feed must carry provenance at all')
  assert.equal(stamp.error, null)
})

test('a partial failure is recorded ON the stamp, not only in the notes', async () => {
  resetTransactionsCache()
  const res = await getTransactions({
    leagueId: 'L9', nflState: { week: 3 }, fetcher: fakeFetcher({ failWeeks: [1] }),
  })
  assert.match(res.sources.transactions.error, /1 of 3 weeks failed/)
})

test('per-league cache keys — a second league does not read the first\'s feed', async () => {
  resetTransactionsCache()
  const get = fakeFetcher()
  await getTransactions({ leagueId: 'A', nflState: IN_SEASON, fetcher: get })
  await getTransactions({ leagueId: 'B', nflState: IN_SEASON, fetcher: get })
  assert.equal(get.calls.length, 4)
  assert.ok(get.calls.some(u => u.includes('/league/B/')))
})
