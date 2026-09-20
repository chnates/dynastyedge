// tests/managerAnalysis.test.mjs — pins documented behavior of src/utils/managerAnalysis.js.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 11 (hindsight valuation): "past picks that can't be
//    resolved use the median of that round across FantasyCalc's listed picks
//    (shown with ≈) — never 0 just because the draft year passed" → an
//    unpriced past pick carries approx: true, a positive round-median value.
//  - CLAUDE.md Feature 11: "Future picks use today's market pick value
//    (findPickValue)" → a listed-season pick uses the exact round median,
//    without the ≈ marker.
//  - CLAUDE.md Feature 11 (trade ledger): "win-loss-even at ±5% of trade
//    size" — the code's banding is STRICTLY greater than 5% of the larger
//    side: a net of exactly 5% is 'even', 5.1% is a win/loss.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildManagerProfiles, buildDraftGrades } from '../src/utils/managerAnalysis.js'

const PLAYER_MAP = {
  p1: { name: 'Player One', position: 'WR', age: 24, value: 2000 },
  p2: { name: 'Player Two', position: 'RB', age: 25, value: 1000 },
  p3: { name: 'Player Three', position: 'WR', age: 26, value: 950 },
  p4: { name: 'Player Four', position: 'TE', age: 24, value: 1000 },
  p5: { name: 'Player Five', position: 'RB', age: 23, value: 949 },
}

// FantasyCalc only lists FUTURE drafts — here only 2026. Round-2 median of
// [1100, 1500, 1900] is 1500.
const PICK_ENTRIES = [
  { name: '2026 Early 2nd', value: 1900 },
  { name: '2026 Mid 2nd', value: 1500 },
  { name: '2026 Late 2nd', value: 1100 },
]

function buildFixture() {
  const transactions = [
    // t1: A gets p1 + a listed 2026 2nd; A gives an UNLISTED 2023 2nd
    // (draft year passed, no pick index entry → generic round median path).
    {
      type: 'trade', transaction_id: 't1', week: 3, status_updated: 300,
      roster_ids: [1, 2],
      adds: { p1: 1 },
      drops: { p1: 2 },
      draft_picks: [
        { season: '2023', round: 2, roster_id: 1, owner_id: 2, previous_owner_id: 1 },
        { season: '2026', round: 2, roster_id: 2, owner_id: 1, previous_owner_id: 2 },
      ],
    },
    // t2: A gets 1000, gives 950 → net is EXACTLY 5% of the larger side.
    {
      type: 'trade', transaction_id: 't2', week: 4, status_updated: 400,
      roster_ids: [1, 2],
      adds: { p2: 1, p3: 2 },
      drops: { p2: 2, p3: 1 },
    },
    // t3: A gets 1000, gives 949 → net is 5.1% of the larger side.
    {
      type: 'trade', transaction_id: 't3', week: 5, status_updated: 500,
      roster_ids: [1, 2],
      adds: { p4: 1, p5: 2 },
      drops: { p4: 2, p5: 1 },
    },
  ]

  const currentLeague = {
    season: '2026',
    allRosters: [
      { rosterId: 1, owner: { user_id: 'ownerA', display_name: 'A' }, record: { wins: 0, losses: 0, ties: 0 } },
      { rosterId: 2, owner: { user_id: 'ownerB', display_name: 'B' }, record: { wins: 0, losses: 0, ties: 0 } },
    ],
    transactions,
  }

  return buildManagerProfiles({
    history: null,
    currentLeague,
    playerMap: PLAYER_MAP,
    pickEntries: PICK_ENTRIES,
    playerDB: {},
    myOwnerId: 'ownerA',
  })
}

function tradeOf(profile, txId) {
  return profile.trades.find(t => t.txId === txId)
}

test('unpriced past pick falls back to the generic round median with approx: true — never 0 (Feature 11)', () => {
  const { profiles } = buildFixture()
  const a = profiles.find(p => p.ownerId === 'ownerA')
  const pastPick = tradeOf(a, 't1').gave.find(x => x.type === 'pick')
  assert.equal(pastPick.label, '2023 2nd')
  assert.equal(pastPick.resolved, false)
  assert.equal(pastPick.approx, true, 'unlisted past pick must be marked approximate (shown with ≈)')
  assert.equal(pastPick.value, 1500, 'value must be the round-2 median across all listed picks')
  assert.ok(pastPick.value > 0, 'a past pick must NEVER value at 0 just because the draft year passed')
})

test('future pick uses today\'s exact market median without the ≈ marker (Feature 11)', () => {
  const { profiles } = buildFixture()
  const a = profiles.find(p => p.ownerId === 'ownerA')
  const futurePick = tradeOf(a, 't1').got.find(x => x.type === 'pick')
  assert.equal(futurePick.label, '2026 2nd')
  assert.equal(futurePick.value, 1500, 'listed 2026 2nd prices at findPickValue\'s round median')
  assert.ok(!futurePick.approx, 'a market-listed pick is not approximate')
})

test('win/loss banding is strictly greater than ±5% of trade size: exactly 5% is even (Feature 11 trade ledger)', () => {
  const { profiles } = buildFixture()
  const a = profiles.find(p => p.ownerId === 'ownerA')
  const b = profiles.find(p => p.ownerId === 'ownerB')

  // t2: |net| / size = 50 / 1000 = exactly 0.05 → 'even' on BOTH sides.
  assert.equal(tradeOf(a, 't2').result, 'even')
  assert.equal(tradeOf(b, 't2').result, 'even')

  // t3: |net| / size = 51 / 1000 = 0.051 → strictly beyond the band.
  assert.equal(tradeOf(a, 't3').result, 'win')
  assert.equal(tradeOf(b, 't3').result, 'loss')
})

test('ledger nets are computed at today\'s prices from each side\'s perspective (Feature 11 hindsight valuation)', () => {
  const { profiles } = buildFixture()
  const a = profiles.find(p => p.ownerId === 'ownerA')
  const t1 = tradeOf(a, 't1')
  // A got p1 (2000) + 2026 2nd (1500); gave the ≈2023 2nd (1500).
  assert.equal(t1.gotValue, 3500)
  assert.equal(t1.gaveValue, 1500)
  assert.equal(t1.net, 2000)
  assert.equal(t1.result, 'win') // 2000 / 3500 ≫ 5%
})

// ── buildDraftGrades — the narrow path, proved equivalent to the wide one ──
//
// The MCP server needs one thing from a manager's history: the rookie-draft
// hindsight record. Reaching it through buildManagerProfiles would mean
// fetching every past season's weekly transaction buckets (~169 requests,
// CLAUDE.md) that draft grading never reads. buildDraftGrades is the same
// buildDraftRecords reached without them.
//
// The contract that makes that safe is EQUIVALENCE, proved rather than
// inspected — the discipline prerequisites A-D each used.

// A league whose owners actually drafted, so there is a record to compare.
function draftFixture() {
  const drafts = [{
    draft: { draft_id: 'd1', season: '2025', settings: { rounds: 4 } },
    picks: [
      { player_id: 'p1', pick_no: 1, round: 1, draft_slot: 1, roster_id: 1, picked_by: 'ownerA' },
      { player_id: 'p2', pick_no: 2, round: 1, draft_slot: 2, roster_id: 2, picked_by: 'ownerB' },
      { player_id: 'p3', pick_no: 3, round: 1, draft_slot: 3, roster_id: 1, picked_by: 'ownerA' },
      { player_id: 'p5', pick_no: 4, round: 1, draft_slot: 4, roster_id: 2, picked_by: 'ownerB' },
    ],
  }]
  const currentLeague = {
    season: '2026',
    allRosters: [
      { rosterId: 1, owner: { user_id: 'ownerA', display_name: 'A' }, record: { wins: 0, losses: 0, ties: 0 } },
      { rosterId: 2, owner: { user_id: 'ownerB', display_name: 'B' }, record: { wins: 0, losses: 0, ties: 0 } },
    ],
    transactions: [],
  }
  // The WIDE history the app walks, and the NARROW one mcp/history.js builds:
  // identical but for the transactions and users the server never fetches.
  const wide = {
    currentDrafts: drafts,
    pastSeasons: [{
      season: '2025',
      users: [{ user_id: 'ownerA' }, { user_id: 'ownerB' }],
      rosters: [{ roster_id: 1, owner_id: 'ownerA' }, { roster_id: 2, owner_id: 'ownerB' }],
      transactions: [{ type: 'trade', transaction_id: 'x', status_updated: 1, roster_ids: [1, 2], adds: { p1: 1 }, drops: { p1: 2 } }],
      drafts,
    }],
  }
  const narrow = {
    currentDrafts: drafts,
    pastSeasons: [{ ...wide.pastSeasons[0], users: [], transactions: [] }],
  }
  const common = { currentLeague, playerMap: PLAYER_MAP, pickEntries: PICK_ENTRIES, playerDB: {} }
  return { wide, narrow, common }
}

test('buildDraftGrades equals buildManagerProfiles\'s own .draft, field for field', () => {
  const { wide, common } = draftFixture()
  const grades = buildDraftGrades({ history: wide, ...common })
  const { profiles } = buildManagerProfiles({ history: wide, ...common, myOwnerId: 'ownerA' })

  assert.ok(profiles.length, 'the fixture must produce profiles at all')
  profiles.forEach(p => {
    assert.deepEqual(grades[p.ownerId], p.draft,
      `draft record for ${p.ownerId} must be identical on both paths`)
  })
})

test('dropping the transactions the server never fetches does not change a grade', () => {
  // This is the load-bearing claim of mcp/history.js's narrow walk: the ~169
  // requests it skips genuinely cannot affect the number it is fetching for.
  const { wide, narrow, common } = draftFixture()
  assert.deepEqual(
    buildDraftGrades({ history: narrow, ...common }),
    buildDraftGrades({ history: wide, ...common })
  )
})

test('a grade carries the fields the pick-confidence nudge gates on', () => {
  const { wide, common } = draftFixture()
  const a = buildDraftGrades({ history: wide, ...common }).ownerA
  assert.equal(typeof a.count, 'number')
  assert.equal(typeof a.hits, 'number')
  assert.equal(typeof a.avgDelta, 'number')
  assert.ok(a.count > 0)
})

test('no league is an empty record, not a crash', () => {
  assert.deepEqual(buildDraftGrades({ history: null, currentLeague: null }), {})
})

// ── FAAB normalization ───────────────────────────────────────────────────────
//
// CLAUDE.md Feature 11: "Fix is to normalize bids to percent-of-budget using
// each season's waiver_budget before aggregating." This league's budget went
// $100 (2023-25) → $1000 (2026), so a raw-dollar sum across seasons is a
// number in no unit at all. Measured live 2026-09-20 on this league: it moved
// four of ten tendency chips, two of them inverted, and understated one
// manager's FAAB efficiency by 4.6×.

const FAAB_PLAYERS = {
  w1: { name: 'Waiver One', position: 'WR', age: 24, value: 1000 },
  w2: { name: 'Waiver Two', position: 'RB', age: 24, value: 1000 },
}

function waiver(rosterId, playerId, bid, id) {
  return {
    type: 'waiver', transaction_id: id, week: 1, status_updated: 100,
    roster_ids: [rosterId], adds: { [playerId]: rosterId }, drops: null,
    settings: { waiver_bid: bid },
  }
}

// Two seasons, two budget scales. `oldBids` are $100-scale, `newBids` $1000.
function faabFixture({ oldBids = [], newBids = [], oldBudget = 100, newBudget = 1000 } = {}) {
  const roster = (id, owner) => ({
    roster_id: id, owner_id: owner, settings: { wins: 0, losses: 0, ties: 0 },
  })
  return buildManagerProfiles({
    history: {
      currentSeason: '2026',
      currentDrafts: [],
      pastSeasons: [{
        season: '2025',
        leagueInfo: { season: '2025', settings: { waiver_budget: oldBudget } },
        users: [{ user_id: 'ownerA', display_name: 'A' }, { user_id: 'ownerB', display_name: 'B' }],
        rosters: [roster(1, 'ownerA'), roster(2, 'ownerB')],
        transactions: oldBids.map((b, i) => waiver(b.roster, b.player ?? 'w1', b.bid, `o${i}`)),
        drafts: [],
      }],
    },
    currentLeague: {
      season: '2026',
      faabBudget: newBudget,
      allRosters: [
        { rosterId: 1, owner: { user_id: 'ownerA', display_name: 'A' }, record: { wins: 0, losses: 0, ties: 0 } },
        { rosterId: 2, owner: { user_id: 'ownerB', display_name: 'B' }, record: { wins: 0, losses: 0, ties: 0 } },
      ],
      transactions: newBids.map((b, i) => waiver(b.roster, b.player ?? 'w1', b.bid, `n${i}`)),
    },
    playerMap: FAAB_PLAYERS,
    pickEntries: [],
    playerDB: {},
    myOwnerId: 'ownerA',
  })
}

const faabOf = (res, ownerId) => res.profiles.find(p => p.ownerId === ownerId).faab

test('a bid is normalized by ITS OWN season\'s budget, so the 10× scale change cannot inflate a total', () => {
  // $20 of $100 and $200 of $1000 are the same 20% commitment. Summing raw
  // dollars would have read the second as ten times the first.
  const res = faabFixture({
    oldBids: [{ roster: 1, bid: 20 }],
    newBids: [{ roster: 2, bid: 200 }],
  })
  assert.equal(faabOf(res, 'ownerA').budgetPct, 20)
  assert.equal(faabOf(res, 'ownerB').budgetPct, 20)
  assert.equal(faabOf(res, 'ownerA').avgBidPct, faabOf(res, 'ownerB').avgBidPct)
})

test('valuePerBudget is UNCHANGED for a history entirely on the $100 scale', () => {
  // The continuity property the unit was chosen for: on a $100 budget a full
  // budget WAS $100, so `valuePerBudget` equals the old `valuePer100` exactly
  // and the fix restates no pre-2026 history. Verified live on this league —
  // all four managers with no 2026 spend scored identically either way.
  const res = faabFixture({ oldBids: [{ roster: 1, bid: 25 }] })  // $25 of $100
  // 1000 value acquired for $25 of a $100 budget = 4000 per full budget,
  // which is the same number the old `valueAcquired / dollars * 100` gave.
  assert.equal(faabOf(res, 'ownerA').valuePerBudget, 4000)
})

test('the coaching gate means a FIFTH OF A BUDGET, not twenty dollars', () => {
  // The documented intent was "spent ≥20% of a budget". On raw dollars it
  // tripped at $20 of 2026's $1000 — 2%.
  const twoPct = faabFixture({ newBids: [{ roster: 1, bid: 20 }] })   // $20 of $1000
  assert.ok(faabOf(twoPct, 'ownerA').budgetPct < 20, '$20 of $1000 is 2%, under the gate')

  const twentyPct = faabFixture({ oldBids: [{ roster: 1, bid: 20 }] }) // $20 of $100
  assert.ok(faabOf(twentyPct, 'ownerA').budgetPct >= 20, '$20 of $100 is 20%, at the gate')
})

test('tendency chips compare percent, so the biggest raw spender can be the quieter bidder', () => {
  // A bids $300+$300 of $1000 (30% each). B bids $50+$50 of $100 (50% each).
  // In raw dollars A looks 6× the bidder; in budget terms B is the aggressor.
  const res = faabFixture({
    oldBids: [{ roster: 2, bid: 50 }, { roster: 2, bid: 50, player: 'w2' }],
    newBids: [{ roster: 1, bid: 300 }, { roster: 1, bid: 300, player: 'w2' }],
  })
  assert.equal(faabOf(res, 'ownerA').avgBidPct, 30)
  assert.equal(faabOf(res, 'ownerB').avgBidPct, 50)
  assert.ok(!res.profiles.find(p => p.ownerId === 'ownerA').tendencies.includes('Aggressive bidder'),
    'the larger raw-dollar spender must not be labelled the aggressive bidder')
})

test('a missing or zero waiver_budget falls back to 100, never divides by zero', () => {
  // Absence of a budget is not evidence of a scale; 100 is the historical
  // default and matches leagueState.js\'s own `?? 100`.
  const res = faabFixture({ oldBids: [{ roster: 1, bid: 30 }], oldBudget: 0, newBudget: undefined })
  assert.equal(faabOf(res, 'ownerA').budgetPct, 30)
  assert.ok(Number.isFinite(faabOf(res, 'ownerA').valuePerBudget))
})

test('no raw-dollar field escapes buildFaabStats', () => {
  // A cross-season dollar total has no unit. Leaving one on the object is
  // what invited the UI to render it for three seasons.
  const res = faabFixture({ oldBids: [{ roster: 1, bid: 10 }], newBids: [{ roster: 2, bid: 100 }] })
  for (const owner of ['ownerA', 'ownerB']) {
    const faab = faabOf(res, owner)
    assert.ok(!('dollars' in faab), 'raw dollars must not be carried out of the FAAB stats')
    assert.ok(!('avgBid' in faab), 'a raw-dollar average must not be carried out either')
    assert.ok(!('valuePer100' in faab), 'the $100-denominated metric is superseded by valuePerBudget')
  }
})

test('a manager with no waiver claims gets the empty record, not a crash', () => {
  const res = faabFixture({ oldBids: [{ roster: 1, bid: 10 }] })
  const b = faabOf(res, 'ownerB')
  assert.equal(b.budgetPct, 0)
  assert.equal(b.avgBidPct, null)
  assert.equal(b.valuePerBudget, null)
})
