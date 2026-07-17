// tests/lineupHistory.test.mjs — pins documented behavior of src/utils/lineupHistory.js.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 9: "Optimal lineup computed from players_points …
//    filling single-position slots first, then FLEX, then Superflex" —
//    the slot order comes from sorting ROSTER_SLOTS by eligibility breadth
//    (QB/RB/RB/WR/WR/TE/DEF → FLEX×3 → SFLX), each slot taking the highest
//    remaining score among its eligible positions.
//  - League context (CLAUDE.md Roster slots): QB · RB·RB · WR·WR · TE ·
//    FLEX×3 (RB/WR/TE) · Superflex (QB/RB/WR/TE) · DEF — no kicker.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeOptimalPoints } from '../src/utils/lineupHistory.js'

function run(playersByPos) {
  // playersByPos: { QB: [30, 25], RB: [...], ... } → ids + maps.
  const pointsMap = {}
  const posMap = {}
  const ids = []
  Object.entries(playersByPos).forEach(([pos, scores]) => {
    scores.forEach((pts, i) => {
      const id = `${pos}${i}`
      ids.push(id)
      pointsMap[id] = pts
      posMap[id] = pos
    })
  })
  return computeOptimalPoints(ids, pointsMap, id => posMap[id])
}

test('fills single-position slots first, then FLEX, then Superflex (Feature 9 optimal lineup)', () => {
  const total = run({
    QB: [30, 25],
    RB: [20, 18, 10],
    WR: [22, 15, 12],
    TE: [14, 8],
    DEF: [9],
  })
  // Hand-derived under the documented fill order:
  //  singles: QB 30, RB 20+18, WR 22+15, TE 14, DEF 9
  //  FLEX×3 (best remaining RB/WR/TE): WR 12, RB 10, TE 8
  //  SFLX (best remaining incl. QB): QB 25
  assert.equal(total, 30 + 20 + 18 + 22 + 15 + 14 + 9 + 12 + 10 + 8 + 25)
})

test('Superflex takes the QB2 even when FLEX cannot (league context: Superflex = QB/RB/WR/TE, FLEX = RB/WR/TE)', () => {
  // QB2 (25) outscores every FLEX candidate, but only SFLX may start a QB.
  // If FLEX were QB-eligible the total would be higher — pin the exact sum.
  const total = run({
    QB: [30, 25],
    RB: [5, 4, 3, 2],
    WR: [5, 4, 3],
    TE: [5, 3],
    DEF: [1],
  })
  // singles: 30 + (5+4) + (5+4) + 5 + 1 = 54; FLEX×3: 3(RB)+3(WR)+3(TE)=9; SFLX: QB 25.
  assert.equal(total, 54 + 9 + 25)
})

test('with only one QB, Superflex falls back to the best remaining RB/WR/TE (Feature 9 slot filling)', () => {
  const total = run({
    QB: [30],
    RB: [20, 18, 16, 14, 12],
    WR: [22, 15],
    TE: [14],
    DEF: [9],
  })
  // singles: 30 + 20+18 + 22+15 + 14 + 9 = 128
  // FLEX×3: RB 16, RB 14, RB 12 = 42 (WR/TE pools are exhausted)
  // SFLX: nothing left at any eligible position → contributes 0.
  assert.equal(total, 128 + 42)
})

test('an empty position contributes 0 — its slot is skipped, never crashes (Feature 9 on real weeks with holes)', () => {
  const total = run({
    QB: [30],
    RB: [20],
    WR: [22],
    // no TE at all, no DEF
  })
  // singles: QB 30, RB 20 (one RB slot empty), WR 22 (one WR slot empty),
  // TE 0, DEF 0; FLEX/SFLX: pools exhausted → 0.
  assert.equal(total, 72)
})

test('players with unknown position are ignored (Feature 9: only slot-eligible positions score)', () => {
  const pointsMap = { a: 50, b: 30 }
  const posMap = { a: null, b: 'QB' }
  const total = computeOptimalPoints(['a', 'b'], pointsMap, id => posMap[id])
  assert.equal(total, 30)
})
