// tests/pickCapital.test.mjs — pins documented behavior of src/utils/pickCapital.js.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 1 (Pick capital rules): "Any pick NOT in traded_picks
//    is still owned by the original team … Picks in traded_picks belong to
//    owner_id in that record"; picks derive from the traded_picks endpoint
//    only (Rules #3).
//  - CLAUDE.md Feature 1: "Each pick shows original owner if different from
//    current owner" → resolved picks carry originalOwner.
//  - CLAUDE.md Feature 6 / Feature 11: "Pick values use the same
//    median-of-round logic as pick capital (findPickValue)" → median of the
//    round's matching FantasyCalc entries; no matching entries → 0.
//  - CLAUDE.md Feature 2: pick capital score weights "2026 picks worth 3×,
//    2027 worth 2×, 2028 worth 1×".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolvePickOwnership,
  findPickValue,
  findExactSlotValue,
  buildDraftSlots,
  slotForRound,
  computePickCapitalScore,
} from '../src/utils/pickCapital.js'

const ROSTERS = [{ roster_id: 1 }, { roster_id: 2 }]

test('resolvePickOwnership: untraded picks stay with their original team (Feature 1 pick capital rules)', () => {
  const result = resolvePickOwnership([], ROSTERS)
  // 3 years × 4 rounds each, all owned by self.
  assert.equal(result[1].length, 12)
  assert.equal(result[2].length, 12)
  result[1].forEach(p => {
    assert.equal(p.originalOwner, 1)
    assert.equal(p.currentOwner, 1)
  })
})

test('resolvePickOwnership: a traded pick belongs to owner_id and keeps its original owner (Feature 1)', () => {
  // Sleeper traded_picks record: roster 1's 2027 2nd now owned by roster 2.
  const traded = [{ season: '2027', round: 2, roster_id: 1, owner_id: 2 }]
  const result = resolvePickOwnership(traded, ROSTERS)
  assert.equal(result[1].length, 11)
  assert.equal(result[2].length, 13)
  const moved = result[2].find(p => p.season === '2027' && p.round === 2 && p.originalOwner === 1)
  assert.ok(moved, 'traded pick must appear in the new owner\'s inventory')
  assert.equal(moved.currentOwner, 2)
  // Roster 1 must no longer hold its own 2027 2nd.
  assert.ok(!result[1].some(p => p.season === '2027' && p.round === 2 && p.originalOwner === 1))
})

test('resolvePickOwnership: traded picks outside the covered years are ignored (Feature 1: show 2026/2027/2028)', () => {
  const traded = [{ season: '2031', round: 1, roster_id: 1, owner_id: 2 }]
  const result = resolvePickOwnership(traded, ROSTERS)
  assert.equal(result[1].length, 12)
  assert.equal(result[2].length, 12)
})

test('resolvePickOwnership: each inventory is sorted by season then round (Feature 1: picks grouped by year)', () => {
  const traded = [{ season: '2026', round: 4, roster_id: 2, owner_id: 1 }]
  const result = resolvePickOwnership(traded, ROSTERS)
  const keys = result[1].map(p => [p.season, p.round])
  const sorted = [...keys].sort((a, b) => (a[0] !== b[0] ? a[0].localeCompare(b[0]) : a[1] - b[1]))
  assert.deepEqual(keys, sorted)
})

const PICK_ENTRIES = [
  { name: '2026 Early 1st', value: 5200 },
  { name: '2026 Mid 1st', value: 4100 },
  { name: '2026 Late 1st', value: 3300 },
  { name: '2026 Early 2nd', value: 1900 },
  { name: '2026 Mid 2nd', value: 1500 },
  { name: '2026 Late 2nd', value: 1100 },
  { name: '2027 Mid 1st', value: 3800 },
]

test('findPickValue: median of the round\'s matching FantasyCalc entries (Features 6 & 11: median-of-round logic)', () => {
  // Three 2026 1st entries → the middle value (4100) is the round price.
  assert.equal(findPickValue({ season: '2026', round: 1 }, PICK_ENTRIES), 4100)
  assert.equal(findPickValue({ season: '2026', round: 2 }, PICK_ENTRIES), 1500)
  // Single matching entry → that entry is the median.
  assert.equal(findPickValue({ season: '2027', round: 1 }, PICK_ENTRIES), 3800)
})

test('findPickValue fallback chain: no matching entries or unknown round → 0 (caller decides the fallback)', () => {
  // Season FantasyCalc doesn't list → 0. Consumers (managerAnalysis, the
  // pick pricer) build their own fallback ON TOP of this 0 — pinned in
  // tests/managerAnalysis.test.mjs and tests/pickTrades.test.mjs.
  assert.equal(findPickValue({ season: '2031', round: 1 }, PICK_ENTRIES), 0)
  // Round beyond the suffix table (no "6th" suffix) → 0.
  assert.equal(findPickValue({ season: '2026', round: 6 }, PICK_ENTRIES), 0)
  // Empty market → 0.
  assert.equal(findPickValue({ season: '2026', round: 1 }, []), 0)
})

// Exact-slot entries in FantasyCalc's current format ("2026 Pick 1.09"),
// alongside the round-level "2026 1st" the fallback uses.
const SLOT_ENTRIES = [
  { name: '2026 1st', value: 3194 },
  { name: '2026 Pick 1.01', value: 7037 },
  { name: '2026 Pick 1.09', value: 2744 },
  { name: '2026 Pick 1.10', value: 2579 },
  { name: '2027 1st', value: 2974 },
]

test('findExactSlotValue: a known slot prices at its exact FantasyCalc slot entry ("2026 Pick 1.09")', () => {
  assert.equal(findExactSlotValue({ season: '2026', round: 1, slot: 1 }, SLOT_ENTRIES), 7037)
  assert.equal(findExactSlotValue({ season: '2026', round: 1, slot: 9 }, SLOT_ENTRIES), 2744)
  // Slot 10 must zero-pad to "1.10" (not "1.1").
  assert.equal(findExactSlotValue({ season: '2026', round: 1, slot: 10 }, SLOT_ENTRIES), 2579)
})

test('findExactSlotValue: unknown slot or no slot entry falls back to the round median', () => {
  // No slot → round median of the "2026 1st" match.
  assert.equal(findExactSlotValue({ season: '2026', round: 1, slot: null }, SLOT_ENTRIES), 3194)
  // Future season has only a round-level entry, no slot entry → round median.
  assert.equal(findExactSlotValue({ season: '2027', round: 1, slot: 5 }, SLOT_ENTRIES), 2974)
})

const DRAFT_ROSTERS = [
  { roster_id: 6, owner_id: 'ownerA' },
  { roster_id: 3, owner_id: 'ownerB' },
]

test('buildDraftSlots: derives roster → draft position from draft_order in pre_draft', () => {
  // draft_order maps user_id → position; resolve through owner_id.
  const draft = { season: '2026', type: 'linear', draft_order: { ownerA: 6, ownerB: 9 } }
  const slots = buildDraftSlots(draft, DRAFT_ROSTERS)
  assert.equal(slots[6], 6)
  assert.equal(slots[3], 9)
})

test('buildDraftSlots: prefers slot_to_roster_id once Sleeper has built the board', () => {
  const draft = { season: '2026', slot_to_roster_id: { 1: 6, 2: 3 }, draft_order: { ownerA: 99 } }
  const slots = buildDraftSlots(draft, DRAFT_ROSTERS)
  assert.equal(slots[6], 1) // from slot_to_roster_id, not the stale draft_order
  assert.equal(slots[3], 2)
})

test('buildDraftSlots: no draft or no order → null (picks fall back to round median)', () => {
  assert.equal(buildDraftSlots(null, DRAFT_ROSTERS), null)
  assert.equal(buildDraftSlots({ season: '2026' }, DRAFT_ROSTERS), null)
})

test('slotForRound: linear keeps the same slot every round; snake reverses even rounds', () => {
  assert.equal(slotForRound(9, 1, 'linear', 10), 9)
  assert.equal(slotForRound(9, 2, 'linear', 10), 9)
  assert.equal(slotForRound(9, 1, 'snake', 10), 9)   // odd round unchanged
  assert.equal(slotForRound(9, 2, 'snake', 10), 2)   // even round: 10 + 1 - 9
  assert.equal(slotForRound(null, 1, 'linear', 10), null)
})

test('computePickCapitalScore: year weights 3×/2×/1× for 2026/2027/2028 (Feature 2 pick capital score)', () => {
  const picks = [
    { season: '2026', round: 1 }, // 4100 × 3
    { season: '2027', round: 1 }, // 3800 × 2
  ]
  assert.equal(computePickCapitalScore(picks, PICK_ENTRIES), 4100 * 3 + 3800 * 2)
  // Unweighted seasons contribute 0.
  assert.equal(computePickCapitalScore([{ season: '2031', round: 1 }], PICK_ENTRIES), 0)
})
