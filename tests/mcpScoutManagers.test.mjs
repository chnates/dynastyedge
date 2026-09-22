// tests/mcpScoutManagers.test.mjs — pins tool #11, scout_managers, the wide
// history walk behind it (getLedgerHistory), and the extracted
// tradeTimeTotals rule.
//
// Behaviours pinned (with their doc source):
//  - CLAUDE.md The MCP Server, "The league-history walk": the narrow walk is NOT
//    quietly widened — the ledger is its own function with its own cost, and it
//    reads weeks 1..last_scored_leg (week 18 is empty in every past season).
//  - The degradation contract, from BOTH directions (as partnerActivity's is):
//    a failed read never prints "never traded" / "No trades yet", and a
//    genuinely quiet manager still does.
//  - CLAUDE.md Feature 11: FAAB in BUDGETS, never dollars.
//  - Rule 7 on a ledger: a zero-value asset reports null, never a raw 0.
//  - failure-archaeology §3d: an archived null is a MISSING asset, and the "at
//    trade time" line hides rather than under-counting.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildScoutAnswer, renderScoutText, MAX_TRADE_LIMIT } from '../mcp/tools/scoutManagers.js'
import { getLedgerHistory, getLeagueHistory, playedWeeks } from '../mcp/history.js'
import { memoryStore } from '../mcp/store.js'
import { tradeTimeTotals } from '../src/utils/managerAnalysis.js'
import { makeSnapshot } from './helpers/mcpFixtures.mjs'

const stamp = { fetchedAt: '2027-09-19T13:00:00.000Z', ageSeconds: 60, stale: false, error: null }

// Roster 6 (me) trades with roster 3; roster 7 (Jake & Bake) never trades
// but makes a $500 claim on a $1000 budget.
const TRADE = {
  transaction_id: 't1', type: 'trade', status: 'complete', week: 2, status_updated: 1_800_000_000_000,
  roster_ids: [6, 3],
  adds: { 50: 6, 1: 3 },
  drops: { 50: 3, 1: 6 },
  draft_picks: [{ season: '2028', round: 1, roster_id: 3, owner_id: 6, previous_owner_id: 3 }],
  waiver_budget: [{ sender: 6, receiver: 3, amount: 25 }],
}
const CLAIM = {
  transaction_id: 'w1', type: 'waiver', status: 'complete', week: 1, status_updated: 1_700_000_000_000,
  roster_ids: [7], adds: { 52: 7 }, drops: null, settings: { waiver_bid: 500 },
}

const txRead = (list = [TRADE, CLAIM]) => ({
  available: true, reason: null, transactions: list, notes: [], sources: { transactions: stamp },
})
const txFailed = {
  available: false, reason: 'unavailable', transactions: null, notes: ['none loaded'], sources: { transactions: stamp },
}
const histRead = (over = {}) => ({
  available: true, reason: null,
  history: { currentSeason: '2027', currentDrafts: [], pastSeasons: [] },
  ledgerSeasons: [], failedSeasons: [], partialSeasons: [], notes: [], sources: { history: stamp },
  ...over,
})
const histFailed = { available: false, reason: 'unavailable', history: null, ledgerSeasons: [], failedSeasons: [], partialSeasons: [], notes: [], sources: { history: stamp } }

const ask = (sources, opts = {}) => buildScoutAnswer(makeSnapshot(), sources, {
  defaultRosterId: 6, myRosterId: 6, ...opts,
})

const QUIET = /no trades yet|never traded|haven't completed a trade/i

// ── the contract, from both directions ────────────────────────────────────

test('a genuinely quiet manager IS reported as one, when every season was read', () => {
  const a = ask({ history: histRead(), transactions: txRead() })
  assert.equal(a.ledger.complete, true)
  const jake = a.managers.find(m => m.rosterId === 7)
  assert.equal(jake.trades.count, 0)
  assert.equal(jake.activity, 'No trades yet', 'a quiet manager is a real answer, and it is given')
})

test('a failed read NEVER prints "never traded" — nothing read means every trade field is null', () => {
  const a = ask({ history: histFailed, transactions: txFailed })
  assert.equal(a.ok, true)
  assert.equal(a.ledger.available, false)
  for (const m of a.managers) {
    assert.equal(m.trades, null)
    assert.equal(m.faab, null)
    assert.equal(m.activity, null)
  }
  assert.doesNotMatch(JSON.stringify(a.managers) + JSON.stringify(a.you), QUIET)
  assert.doesNotMatch(renderScoutText(a), QUIET)
  assert.ok(a.notes.some(n => /gap in our data/.test(n)))
})

test('a PARTIAL read names the missing seasons and never calls anyone a non-trader over them', () => {
  const a = ask({ history: histRead({ failedSeasons: ['2026'] }), transactions: txRead() })
  assert.equal(a.ledger.available, true)
  assert.equal(a.ledger.complete, false)
  assert.deepEqual(a.ledger.seasonsMissing, ['2026'])
  const jake = a.managers.find(m => m.rosterId === 7)
  assert.equal(jake.activity, 'No trades in the 1 season we could read')
  assert.ok(a.notes.some(n => /2026/.test(n) && /Nobody is described as a non-trader/.test(n)))

  // My own report card must not say it either, though I have 1 trade here —
  // so exercise it from a seat with none.
  const quietMe = buildScoutAnswer(makeSnapshot(), {
    history: histRead({ failedSeasons: ['2026'] }), transactions: txRead([CLAIM]),
  }, { defaultRosterId: 6, myRosterId: 6 })
  assert.doesNotMatch(JSON.stringify(quietMe.you), QUIET)
})

test('the current season failing alone is a missing season, not a quiet one', () => {
  const a = ask({ history: histRead({ ledgerSeasons: ['2026'] }), transactions: txFailed })
  assert.deepEqual(a.ledger.seasonsRead, ['2026'])
  assert.deepEqual(a.ledger.seasonsMissing, ['2027'])
  assert.equal(a.managers.find(m => m.rosterId === 6).trades.thisSeason, null,
    'this season\'s count is unknown, not 0')
})

// ── units and values ──────────────────────────────────────────────────────

test('FAAB is reported in BUDGETS and bid PERCENT — no dollar field leaves the tool', () => {
  const a = ask({ history: histRead(), transactions: txRead() })
  const jake = a.managers.find(m => m.rosterId === 7)
  assert.equal(jake.faab.budgetsCommitted, 0.5, '$500 of a $1000 budget is half a budget')
  assert.equal(jake.faab.avgBidPct, 50)
  assert.doesNotMatch(JSON.stringify(a), /"dollars"|"avgBid"|"valuePer100"/)
})

test('a zero-value asset reports null, never a raw 0 — FAAB included', () => {
  const a = ask({ history: histRead(), transactions: txRead() }, { team: 'NIX CAGE' })
  const t = a.manager.tradeLedger[0]
  const faab = t.gave.find(x => x.type === 'faab')
  assert.equal(faab.value, null)
  assert.ok(t.got.every(x => x.value === null || x.value > 0))
})

// ── the "at trade time" line ──────────────────────────────────────────────

test('at trade time: a complete archive entry prints, a null asset hides the whole line', () => {
  const full = { available: true, data: { trades: { t1: { players: { 50: 1500, 1: 6500 }, picks: { '2028-1-3': 1900 } } } } }
  const a = ask({ history: histRead(), transactions: txRead(), tradeValues: full }, { team: '6' })
  assert.deepEqual(a.manager.tradeLedger[0].atTradeTime, { got: 3400, gave: 6500 })
  assert.equal(a.counts.withTradeTimeValues, 1)

  const partial = { available: true, data: { trades: { t1: { players: { 50: 1500, 1: 6500 }, picks: { '2028-1-3': null } } } } }
  const b = ask({ history: histRead(), transactions: txRead(), tradeValues: partial }, { team: '6' })
  assert.equal(b.manager.tradeLedger[0].atTradeTime, null, 'an archived null is MISSING, never 0')

  const none = { available: false, data: null, error: 'HTTP 404' }
  const c = ask({ history: histRead(), transactions: txRead(), tradeValues: none }, { team: '6' })
  assert.equal(c.manager.tradeLedger[0].atTradeTime, null)
  assert.ok(c.notes.some(n => /archive could not be read/.test(n)))
})

test('tradeTimeTotals (the extracted rule) skips FAAB and refuses a partial total', () => {
  const trade = { txId: 'x', got: [{ type: 'player', id: '1' }, { type: 'faab' }], gave: [{ type: 'pick', pickKey: 'k' }] }
  assert.deepEqual(tradeTimeTotals({ trades: { x: { players: { 1: 10 }, picks: { k: 20 } } } }, trade), { gotThen: 10, gaveThen: 20 })
  assert.equal(tradeTimeTotals({ trades: { x: { players: {}, picks: { k: 20 } } } }, trade), null)
  assert.equal(tradeTimeTotals(null, trade), null)
})

// ── bounds and resolution ─────────────────────────────────────────────────

test('the ledger is bounded, the true count rides beside it, and an unknown team is refused', () => {
  const two = { ...TRADE, transaction_id: 't2', status_updated: 1_800_000_000_001 }
  const a = ask({ history: histRead(), transactions: txRead([TRADE, two, CLAIM]) }, { team: 'NIX CAGE', limit: 1 })
  assert.equal(a.manager.tradeLedger.length, 1)
  assert.equal(a.counts.trades, 2)
  assert.equal(a.counts.truncated, true)
  assert.ok(a.notes.some(n => new RegExp(`max ${MAX_TRADE_LIMIT}`).test(n)))

  const bad = ask({ history: histRead(), transactions: txRead() }, { team: 'nobody by that name' })
  assert.equal(bad.ok, false)
  assert.ok(bad.candidates.length >= 3)
})

// ── the wide walk ─────────────────────────────────────────────────────────

const CURRENT = { league_id: 'L', season: '2027', previous_league_id: 'P1' }
const PAST = { league_id: 'P1', season: '2026', previous_league_id: '0', settings: { last_scored_leg: 3, waiver_budget: 100 } }

function routes({ failTx = false, failWeek = null } = {}) {
  const urls = []
  const fetcher = async url => {
    urls.push(url)
    const path = url.replace(/^https:\/\/api\.sleeper\.app\/v1/, '')
    if (path === '/league/P1') return PAST
    if (path.endsWith('/drafts')) return []
    if (path === '/league/P1/rosters') return [{ roster_id: 6, owner_id: 'u6' }]
    if (path === '/league/P1/users') return [{ user_id: 'u6', display_name: 'chnates' }]
    const m = path.match(/^\/league\/P1\/transactions\/(\d+)$/)
    if (m) {
      if (failTx || Number(m[1]) === failWeek) throw new Error('HTTP 503')
      return [{ ...TRADE, transaction_id: `p${m[1]}`, roster_ids: [6] }]
    }
    throw new Error(`unrouted ${url}`)
  }
  return { urls, fetcher }
}

test('the wide walk reads weeks 1..last_scored_leg, plus users — and the narrow walk is untouched', async () => {
  assert.equal(playedWeeks(PAST), 3)
  assert.equal(playedWeeks({}), 18, 'no field: read the whole season rather than guess low')

  const narrow = routes()
  await getLeagueHistory({ leagueId: 'L', leagueInfo: CURRENT, fetcher: narrow.fetcher, store: memoryStore() })
  assert.equal(narrow.urls.filter(u => /transactions|users/.test(u)).length, 0,
    'the narrow walk still fetches no transactions and no users')

  const wide = routes()
  const r = await getLedgerHistory({ leagueId: 'L', leagueInfo: CURRENT, fetcher: wide.fetcher, store: memoryStore() })
  const tx = wide.urls.filter(u => u.includes('/transactions/'))
  assert.deepEqual(tx.map(u => Number(u.split('/').pop())), [1, 2, 3])
  assert.equal(wide.urls.filter(u => u.endsWith('/users')).length, 1)
  assert.deepEqual(r.ledgerSeasons, ['2026'])
  assert.equal(r.history.pastSeasons[0].transactions.length, 3)
  assert.equal(r.history.pastSeasons[0].transactions[0].week != null, true, 'week is stamped from the bucket')
})

test('a past season whose buckets ALL fail is named, not cached, and retried next call', async () => {
  const store = memoryStore()
  const bad = routes({ failTx: true })
  const r = await getLedgerHistory({ leagueId: 'L', leagueInfo: CURRENT, fetcher: bad.fetcher, store })
  assert.deepEqual(r.failedSeasons, ['2026'])
  assert.deepEqual(r.ledgerSeasons, [])
  assert.ok(r.notes.some(n => /ABSENT — not zero/.test(n)))

  const good = routes()
  const r2 = await getLedgerHistory({ leagueId: 'L', leagueInfo: CURRENT, fetcher: good.fetcher, store })
  assert.deepEqual(r2.ledgerSeasons, ['2026'], 'the failure was not cached as an empty season')
})

test('one failed bucket inside a season is disclosed as a partial season', async () => {
  const r = await getLedgerHistory({
    leagueId: 'L', leagueInfo: CURRENT, fetcher: routes({ failWeek: 2 }).fetcher, store: memoryStore(),
  })
  assert.deepEqual(r.partialSeasons, [{ season: '2026', failedWeeks: [2] }])
  assert.ok(r.notes.some(n => /2026: transaction week\(s\) 2 did not load/.test(n)))
})
