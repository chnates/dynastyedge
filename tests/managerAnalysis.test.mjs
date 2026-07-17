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

import { buildManagerProfiles } from '../src/utils/managerAnalysis.js'

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
