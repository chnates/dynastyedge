// tests/draftLive.test.mjs — pins the rookie draft's LIVE path
// (src/utils/draftLive.js + buildDraftOrder) by replaying a REAL past draft.
//
// Why replay instead of pure fixtures: the Draft Tracker's live path had never
// executed against real data (docs/open-items.md ACTIVE-1) and there is no
// second chance until next year's draft. A completed draft only shows the FINAL
// state — but truncating its real pick list to the first N picks synthesizes
// every intermediate state, so we get genuine Sleeper payload shapes with
// synthetic time travel. Fixture: tests/fixtures/draft-2025.json, captured from
// /draft/1180943706723041281 (this league's 2025 rookie draft, 4 rounds ×
// 10 teams = 40 picks, linear).
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 10 / Feature 1: draft order resolves from
//    `slot_to_roster_id` when present, else `draft_order` joined to rosters
//    (set in `pre_draft`, so slots are known a month early). The
//    /league/{id}/drafts LIST endpoint omits slot_to_roster_id entirely
//    (verified live 2026-08-08) — the single-draft endpoint is the one that
//    carries it. Before this was fixed buildDraftOrder returned null always,
//    silently disabling the banner, the countdown, Best Available and slot
//    pricing.
//  - Feature 10 Tracker: on-the-clock banner, "N picks until yours",
//    Best Available (only while on the clock), completion recap with
//    steals/reaches by pick slot vs derived rookie ADP.
//  - In-draft pick trades move a pick to its new owner at the ORIGINAL owner's
//    slot.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDraftOrder } from '../src/hooks/useSleeperDraft.js'
import {
  deriveDraftState, buildBestAvailable, buildMyCapital, buildRecap,
} from '../src/utils/draftLive.js'

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/draft-2025.json', import.meta.url))
)
const { draft: REAL_DRAFT, picks: REAL_PICKS, tradedPicks: REAL_TRADES } = FIXTURE

// Rosters as useLeague supplies them (owner_id → roster_id), needed for the
// draft_order fallback path.
const ROSTERS = Object.entries(REAL_DRAFT.draft_order)
  .map(([ownerId, slot]) => ({ owner_id: ownerId, roster_id: REAL_DRAFT.slot_to_roster_id[slot] }))

// The draft as the app sees it while it is running.
const liveDraft = { ...REAL_DRAFT, status: 'drafting' }

test('fixture sanity: a real 4×10 linear draft with 40 picks', () => {
  assert.equal(REAL_PICKS.length, 40)
  assert.equal(REAL_DRAFT.settings.rounds, 4)
  assert.equal(REAL_DRAFT.settings.teams, 10)
  assert.equal(REAL_DRAFT.type, 'linear')
})

test('buildDraftOrder: slot_to_roster_id drives the board, linear repeats each round', () => {
  const order = buildDraftOrder(REAL_DRAFT, [], ROSTERS)
  assert.ok(order, 'order must resolve — null here is the bug that killed the live path')
  assert.equal(order.length, 40)
  assert.equal(order[0].overall, 1)
  assert.equal(order[0].label, '1.01')
  assert.equal(order[9].label, '1.10')
  assert.equal(order[10].label, '2.01') // linear: round 2 restarts at slot 1
  assert.equal(order[39].label, '4.10')

  // Every slot maps to the roster Sleeper assigned it.
  order.forEach(p => {
    assert.equal(p.rosterId, REAL_DRAFT.slot_to_roster_id[p.slot])
    assert.equal(p.originalRosterId, p.rosterId) // no trades applied in this call
  })

  // Slots agree with what actually happened on the board.
  REAL_PICKS.forEach(pick => {
    assert.equal(order[pick.pick_no - 1].slot, pick.draft_slot, `pick ${pick.pick_no} slot`)
  })
})

test('replaying the REAL traded picks reproduces who actually made all 40 picks', () => {
  // 24 of this draft's 40 picks had changed hands. Without applying them the
  // board shows original owners and disagrees with reality from pick 2 on —
  // which is exactly the load this year's draft puts on the feature
  // (22 of 40 2026 picks are already traded).
  assert.equal(REAL_TRADES.length, 24)

  const naive = buildDraftOrder(REAL_DRAFT, [], ROSTERS)
  const mismatched = REAL_PICKS.filter(p => naive[p.pick_no - 1].rosterId !== p.roster_id)
  assert.ok(mismatched.length > 0, 'trades genuinely moved picks in this draft')

  const order = buildDraftOrder(REAL_DRAFT, REAL_TRADES, ROSTERS)
  REAL_PICKS.forEach(pick => {
    const slotted = order[pick.pick_no - 1]
    assert.equal(slotted.rosterId, pick.roster_id,
      `pick ${pick.pick_no} (${slotted.label}) should belong to roster ${pick.roster_id}`)
    // A traded pick keeps sitting at the ORIGINAL owner's slot.
    assert.equal(slotted.originalRosterId, REAL_DRAFT.slot_to_roster_id[slotted.slot])
  })
})

test('buildDraftOrder falls back to draft_order when slot_to_roster_id is absent', () => {
  // Exactly the shape /league/{id}/drafts returns: no slot_to_roster_id key.
  const listed = { ...REAL_DRAFT }
  delete listed.slot_to_roster_id

  assert.equal(buildDraftOrder(listed, [], []), null, 'no rosters → nothing to join against')

  const order = buildDraftOrder(listed, [], ROSTERS)
  assert.ok(order, 'draft_order + rosters must still resolve the board in pre_draft')
  const full = buildDraftOrder(REAL_DRAFT, [], ROSTERS)
  assert.deepEqual(order, full, 'both tiers must produce the identical board')

  assert.equal(buildDraftOrder(null, [], ROSTERS), null)
  assert.equal(buildDraftOrder({ ...listed, draft_order: null }, [], ROSTERS), null)
})

test('in-draft pick trades reassign the pick at the original owner’s slot', () => {
  const slot1Roster = REAL_DRAFT.slot_to_roster_id['1']
  const traded = [{ season: REAL_DRAFT.season, round: 1, roster_id: slot1Roster, owner_id: 99 }]
  const order = buildDraftOrder(REAL_DRAFT, traded, ROSTERS)

  assert.equal(order[0].rosterId, 99, 'pick now belongs to the acquiring team')
  assert.equal(order[0].originalRosterId, slot1Roster, 'but sits at the original owner’s slot')
  assert.equal(order[0].slot, 1)
  // Only round 1 moved.
  assert.equal(order[10].rosterId, slot1Roster)
  // A trade from another season must not leak in.
  const other = buildDraftOrder(REAL_DRAFT, [{ ...traded[0], season: '2024' }], ROSTERS)
  assert.equal(other[0].rosterId, slot1Roster)
})

// ── Replay: walk the real draft pick by pick ──────────────────────────────
const ORDER = buildDraftOrder(REAL_DRAFT, [], ROSTERS)
const at = (n, draft = liveDraft, myRosterId = 6) =>
  deriveDraftState({ draft, order: ORDER, picks: REAL_PICKS.slice(0, n), myRosterId })

test('replay: on-the-clock fires exactly on my picks, and never on anyone else’s', () => {
  const myRosterId = 6
  const mySlots = ORDER.filter(p => p.rosterId === myRosterId).map(p => p.overall)
  assert.equal(mySlots.length, 4, 'one pick per round in this draft')

  // At every one of the 40 board positions, on-the-clock must be true iff the
  // next pick belongs to me. This is the assertion the live path never got.
  for (let made = 0; made < 40; made++) {
    const s = at(made)
    assert.equal(s.isOnClock, mySlots.includes(made + 1), `after ${made} picks`)
    assert.equal(s.nextPick.overall, made + 1)
  }
})

test('replay: "N picks until yours" counts the teams ahead of me and hits 0 on the clock', () => {
  const myFirst = ORDER.find(p => p.rosterId === 6).overall

  assert.equal(at(0).picksUntilMine, myFirst - 1, 'before any pick is made')
  assert.equal(at(myFirst - 1).picksUntilMine, 0, 'on the clock = 0 picks away')
  assert.equal(at(myFirst).picksUntilMine > 0, true, 'after my pick it points at my next one')

  // It never goes negative, and it disappears once I have no picks left.
  for (let made = 0; made <= 40; made++) {
    const v = at(made).picksUntilMine
    if (v != null) assert.ok(v >= 0, `after ${made} picks: ${v}`)
  }
  assert.equal(at(40).picksUntilMine, null, 'board exhausted → no next pick')
})

test('replay: a paused draft is still live; a pre_draft board has no clock', () => {
  const myFirst = ORDER.find(p => p.rosterId === 6).overall
  assert.equal(at(myFirst - 1, { ...REAL_DRAFT, status: 'paused' }).isOnClock, true)
  assert.equal(at(myFirst - 1, { ...REAL_DRAFT, status: 'pre_draft' }).isOnClock, false)
  // pre_draft still knows the whole board, so the countdown works beforehand.
  assert.equal(at(0, { ...REAL_DRAFT, status: 'pre_draft' }).picksUntilMine, myFirst - 1)
})

test('replay: completion is reached by a full board, with or without the status flag', () => {
  assert.equal(at(39).isComplete, false)
  assert.equal(at(40).isComplete, true, 'every pick made = complete even while status says drafting')
  assert.equal(at(40).isOnClock, false, 'a complete draft never shows a clock')
  assert.equal(at(40).nextPick, null)
  assert.equal(at(5, { ...REAL_DRAFT, status: 'complete' }).isComplete, true, 'status wins early too')
})

test('replay: drafted players accumulate exactly once each', () => {
  assert.equal(at(0).draftedIds.size, 0)
  assert.equal(at(17).draftedIds.size, 17)
  assert.equal(at(40).draftedIds.size, 40, 'no duplicate player_ids in a real draft')
  assert.ok(at(1).draftedIds.has(String(REAL_PICKS[0].player_id)))
})

test('unknown order degrades: no clock, no countdown, but the draft still tracks', () => {
  const s = deriveDraftState({ draft: liveDraft, order: null, picks: REAL_PICKS.slice(0, 5), myRosterId: 6 })
  assert.equal(s.orderKnown, false)
  assert.equal(s.nextPick, null)
  assert.equal(s.isOnClock, false)
  assert.equal(s.picksUntilMine, null)
  assert.equal(s.totalPicks, 40, 'falls back to rounds × teams')
  assert.equal(s.picksMade, 5, 'picks still tracked')
})

// ── Best Available ────────────────────────────────────────────────────────
const PROSPECTS = [
  { sleeperId: 'a', name: 'A', position: 'RB', adp: 1 },
  { sleeperId: 'b', name: 'B', position: 'WR', adp: 2 },
  { sleeperId: 'c', name: 'C', position: 'TE', adp: 3 },
  { sleeperId: 'd', name: 'D', position: 'WR', adp: 4 },
]

test('Best Available: only on the clock, undrafted only, need positions after best overall', () => {
  const base = { prospects: PROSPECTS, draftedIds: new Set(), needPositions: ['WR', 'TE'] }
  assert.deepEqual(buildBestAvailable({ ...base, isOnClock: false }), [], 'hidden off the clock')

  const rows = buildBestAvailable({ ...base, isOnClock: true })
  assert.deepEqual(rows.map(r => [r.tag, r.player.sleeperId]), [
    ['Best overall', 'a'],
    ['Top WR · need', 'b'],
    ['Top TE · need', 'c'],
  ])

  // The best overall is never repeated as a positional row.
  const rbNeed = buildBestAvailable({ ...base, isOnClock: true, needPositions: ['RB'] })
  assert.deepEqual(rbNeed.map(r => r.player.sleeperId), ['a'])

  // Drafted players drop out and the next man up takes the row.
  // With a and b gone, the best overall is the TE — so the "Top TE · need" row
  // is dropped rather than listing him twice, and WR falls to the next man up.
  const afterA = buildBestAvailable({ ...base, isOnClock: true, draftedIds: new Set(['a', 'b']) })
  assert.deepEqual(afterA.map(r => [r.tag, r.player.sleeperId]), [
    ['Best overall', 'c'],
    ['Top WR · need', 'd'],
  ])
})

test('Best Available ranks by My Board when the user has one, else by rookie ADP', () => {
  const rows = buildBestAvailable({
    isOnClock: true, prospects: PROSPECTS, draftedIds: new Set(),
    boardRankMap: { d: 1, a: 2 }, needPositions: [],
  })
  assert.equal(rows[0].player.sleeperId, 'd', 'My Board overrides ADP')
  // Prospects missing from the board sort to the bottom, never to the top.
  const unranked = buildBestAvailable({
    isOnClock: true, prospects: [{ sleeperId: 'z', position: 'QB' }], draftedIds: new Set(),
    boardRankMap: { d: 1 }, needPositions: [],
  })
  assert.equal(unranked[0].player.sleeperId, 'z')
})

// ── My draft capital ──────────────────────────────────────────────────────
test('capital: real slots when the order is known, marked used as the board moves', () => {
  const myRosterId = 6
  const mine = ORDER.filter(p => p.rosterId === myRosterId)
  const leaguePicks = mine.map(p => ({
    round: p.round, originalOwner: p.originalRosterId, value: 1000 * p.round,
  }))

  const before = buildMyCapital({ order: ORDER, orderKnown: true, leaguePicks, picksMade: 0, myRosterId })
  assert.equal(before.length, 4)
  assert.equal(before[0].label, mine[0].label, 'exact slot label, e.g. "1.04"')
  assert.equal(before[0].value, 1000)
  assert.deepEqual(before.map(p => p.used), [false, false, false, false])

  const after = buildMyCapital({
    order: ORDER, orderKnown: true, leaguePicks, picksMade: mine[0].overall, myRosterId,
  })
  assert.deepEqual(after.map(p => p.used), [true, false, false, false])

  // A pick with no matching league entry prices at 0, never undefined.
  const unpriced = buildMyCapital({ order: ORDER, orderKnown: true, leaguePicks: [], picksMade: 0, myRosterId })
  assert.deepEqual([...new Set(unpriced.map(p => p.value))], [0])
})

test('capital falls back to round labels when the order is unknown', () => {
  const rows = buildMyCapital({
    order: null, orderKnown: false, picksMade: 0, myRosterId: 6,
    leaguePicks: [{ round: 1, originalOwner: 6, value: 4200 }, { round: 3, originalOwner: 2, value: 500 }],
  })
  assert.deepEqual(rows.map(r => r.label), ['Rd 1', 'Rd 3'])
  assert.deepEqual(rows.map(r => r.used), [false, false])
  assert.equal(rows[0].value, 4200)
})

// ── Recap ─────────────────────────────────────────────────────────────────
test('recap: null until complete, then per-team totals ranked high to low', () => {
  const resolvePick = pick => ({ name: `P${pick.player_id}`, value: pick.pick_no <= 10 ? 2000 : 500 })
  assert.equal(buildRecap({ isComplete: false, sortedPicks: REAL_PICKS, resolvePick }), null)

  const recap = buildRecap({ isComplete: true, sortedPicks: REAL_PICKS, resolvePick, adpById: {} })
  assert.equal(recap.entries.length, 40)
  assert.equal(recap.teamTotals.length, 10)
  for (let i = 1; i < recap.teamTotals.length; i++) {
    assert.ok(recap.teamTotals[i - 1].total >= recap.teamTotals[i].total, 'sorted descending')
  }
  assert.equal(recap.teamTotals.reduce((s, t) => s + t.count, 0), 40)
  // No ADP anywhere → no steals or reaches, rather than a page of noise.
  assert.deepEqual(recap.steals, [])
  assert.deepEqual(recap.reaches, [])
})

test('recap: steals fell past their ADP, reaches went early, ±2 threshold, top 3 each', () => {
  const picks = [
    { pick_no: 1, roster_id: 1, player_id: 'early' },   // ADP 9  → delta −8 reach
    { pick_no: 2, roster_id: 1, player_id: 'ontime' },  // ADP 3  → delta −1 neither
    { pick_no: 3, roster_id: 2, player_id: 'edge' },    // ADP 5  → delta −2 reach
    { pick_no: 10, roster_id: 2, player_id: 'late' },   // ADP 2  → delta +8 steal
    { pick_no: 11, roster_id: 1, player_id: 'slip' },   // ADP 9  → delta +2 steal
    { pick_no: 12, roster_id: 2, player_id: 'noadp' },  // no ADP → excluded
  ]
  const recap = buildRecap({
    isComplete: true,
    sortedPicks: picks,
    resolvePick: p => ({ name: p.player_id, value: 100 }),
    adpById: { early: 9, ontime: 3, edge: 5, late: 2, slip: 9 },
  })
  assert.deepEqual(recap.steals.map(e => e.pick.player_id), ['late', 'slip'])
  assert.deepEqual(recap.reaches.map(e => e.pick.player_id), ['early', 'edge'])
  assert.equal(recap.steals[0].delta, 8, 'biggest steal first')
  assert.equal(recap.reaches[0].delta, -8, 'biggest reach first')
  assert.equal(recap.entries.find(e => e.pick.player_id === 'noadp').delta, null)
})
