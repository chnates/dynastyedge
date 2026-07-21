// tests/pickTrades.test.mjs — pins documented behavior of src/utils/pickTrades.js.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 13: "every pick … is priced by its exact slot entry
//    ("2026 Pick 1.09"). Before the order exists, the market falls back to
//    round-level picks at round medians (findPickValue)". (FantasyCalc dropped
//    its old Early/Mid/Late tier naming in 2026-07 for exact per-slot entries;
//    findSlotPickValue now delegates to the shared findExactSlotValue.)
//  - CLAUDE.md Feature 13 (Move Up): "Packages are 1–3 picks, each strictly
//    worth less than the target (equal value = a swap, not a move), totaling
//    80–145% of the target; undershoot is penalized 1.6× over overshoot".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findSlotPickValue, suggestPickPackages } from '../src/utils/pickTrades.js'

const PICK_ENTRIES = [
  { name: '2026 1st', value: 4100 },
  { name: '2026 Pick 1.02', value: 5200 },
  { name: '2026 Pick 1.09', value: 3300 },
]

test('findSlotPickValue: known slot prices at its exact FantasyCalc slot entry (Feature 13 slot-level pricing)', () => {
  assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: 2 }, PICK_ENTRIES), 5200)
  assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: 9 }, PICK_ENTRIES), 3300)
})

test('findSlotPickValue: unknown slot or no slot entry falls back to the round median (Feature 13: "round-level picks at round medians")', () => {
  // No slot → the round-level "2026 1st" price.
  assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: null }, PICK_ENTRIES), 4100)
  // Known slot but no slot entry for it → round median (here the 1st entry).
  assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: 5 }, PICK_ENTRIES), 4100)
  // Season FantasyCalc doesn't list at all → 0.
  assert.equal(findSlotPickValue({ season: '2027', round: 1, slot: 2 }, PICK_ENTRIES), 0)
})

// Candidate picks for package building. One candidate equals the target
// exactly — the doc says that's a swap, not a move, and must never appear.
function makeCandidates() {
  return [
    { id: 'equal', value: 3000 },
    { id: 'a', value: 2900 },
    { id: 'b', value: 1500 },
    { id: 'c', value: 1300 },
    { id: 'd', value: 600 },
    { id: 'e', value: 100 },
    { id: 'zero', value: 0 },
  ]
}

test('suggestPickPackages: 1–3 picks per package, each strictly < target, totals within 80–145% (Feature 13 Move Up)', () => {
  const target = 3000
  const packages = suggestPickPackages(target, makeCandidates(), { count: 10 })
  assert.ok(packages.length > 0, 'fixture must produce at least one package')
  for (const pkg of packages) {
    assert.ok(pkg.picks.length >= 1 && pkg.picks.length <= 3, `package size ${pkg.picks.length} outside 1–3`)
    for (const p of pkg.picks) {
      assert.ok(p.value < target, `pick worth ${p.value} is not strictly < target ${target}`)
      assert.notEqual(p.id, 'equal', 'a pick equal to the target is a swap, not a move — must be excluded')
      assert.notEqual(p.id, 'zero', 'zero-value picks must never enter a package')
    }
    assert.ok(pkg.total >= target * 0.8, `total ${pkg.total} below the 80% floor`)
    assert.ok(pkg.total <= target * 1.45, `total ${pkg.total} above the 145% cap`)
  }
})

test('suggestPickPackages: undershoot penalized 1.6× over overshoot (Feature 13: "sellers don\'t take light offers")', () => {
  // Two possible packages: 550+550 = 1100 (10% over) vs 900 (10% under).
  // score(over) = 100, score(under) = 160 → the overshoot must rank first.
  const candidates = [
    { id: 'x', value: 550 },
    { id: 'y', value: 550 },
    { id: 'u', value: 900 },
  ]
  const packages = suggestPickPackages(1000, candidates, { count: 3 })
  assert.ok(packages.length >= 2)
  assert.equal(packages[0].total, 1100, 'overshoot package must outrank the equally-distant undershoot')
  assert.equal(packages[1].total, 900)
})

test('suggestPickPackages: no target value → no packages (Feature 13 empty-state contract feeds off this)', () => {
  assert.deepEqual(suggestPickPackages(0, makeCandidates()), [])
  assert.deepEqual(suggestPickPackages(null, makeCandidates()), [])
})

test('suggestPickPackages: returns at most `count` packages, deduped by size+total', () => {
  const packages = suggestPickPackages(3000, makeCandidates()) // default count = 3
  assert.ok(packages.length <= 3)
  const keys = packages.map(p => `${p.picks.length}-${p.total}`)
  assert.equal(new Set(keys).size, keys.length, 'duplicate size+total packages must be deduped')
})
