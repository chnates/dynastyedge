// tests/dynastyTrajectory.test.mjs — pins documented behavior of src/utils/dynastyTrajectory.js.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 17: projection is "currentValue × curve(age + n) /
//    curve(age), clamped per year (0.55×–1.18×)" → a wild curve ratio is
//    clamped to YEAR_RATIO_FLOOR^n … YEAR_RATIO_CEIL^n.
//  - CLAUDE.md Feature 17: "Unranked / no-age players hold flat (we never
//    invent a curve the market hasn't priced) and contribute 0" — flat means
//    the current value carries forward unchanged.
//  - CLAUDE.md Feature 17: "Picks mature into rookies — a pick holds at its
//    current FantasyCalc value until its draft year, then converts to a
//    rookie-aged (22) young asset that ages on a generic … curve."

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAgeCurves,
  projectPlayer,
  buildRosterTrajectory,
  TRAJECTORY_HORIZON,
} from '../src/utils/dynastyTrajectory.js'

// Hand-built curves: exact ratios, so the clamp is the only variable.
function flatCurveExcept(entries) {
  const curve = {}
  for (let age = 21; age <= 39; age++) curve[age] = 1000
  Object.entries(entries).forEach(([age, v]) => { curve[age] = v })
  return curve
}

test('per-year clamp floor: a crash in the market curve projects at most −45%/year (Feature 17: clamp 0.55–1.18)', () => {
  // curve(31)/curve(30) = 10/1000 = 0.01 → clamped to 0.55 for n=1.
  const curves = { WR: flatCurveExcept({ 30: 1000, 31: 10, 32: 10 }) }
  const player = { position: 'WR', age: 30, value: 1000 }
  assert.equal(projectPlayer(player, 1, curves), Math.round(1000 * 0.55))
  // n=2 clamps at 0.55², not 0.55 — the clamp compounds per year.
  assert.equal(projectPlayer(player, 2, curves), Math.round(1000 * 0.55 ** 2))
})

test('per-year clamp ceiling: a spike in the market curve projects at most +18%/year (Feature 17: clamp 0.55–1.18)', () => {
  // curve(23)/curve(22) = 5000/100 = 50 → clamped to 1.18 for n=1.
  const curves = { WR: flatCurveExcept({ 22: 100, 23: 5000, 24: 5000 }) }
  const player = { position: 'WR', age: 22, value: 1000 }
  assert.equal(projectPlayer(player, 1, curves), Math.round(1000 * 1.18))
  assert.equal(projectPlayer(player, 2, curves), Math.round(1000 * 1.18 ** 2))
})

test('a mild curve ratio passes through unclamped (Feature 17: value rides the market curve)', () => {
  // curve(28)/curve(27) = 900/1000 = 0.9, inside [0.55, 1.18].
  const curves = { RB: flatCurveExcept({ 27: 1000, 28: 900 }) }
  assert.equal(projectPlayer({ position: 'RB', age: 27, value: 2000 }, 1, curves), 1800)
})

test('unranked / no-age players hold flat (Feature 17: never invent a curve the market hasn\'t priced)', () => {
  const curves = { WR: flatCurveExcept({ 26: 1000, 27: 500 }) }
  // Unranked: flagged explicitly — value carries forward unchanged.
  assert.equal(projectPlayer({ position: 'WR', age: 26, value: 800, unranked: true }, 2, curves), 800)
  // No age: same flat contract.
  assert.equal(projectPlayer({ position: 'WR', age: null, value: 800 }, 2, curves), 800)
  // No curve for the position: flat.
  assert.equal(projectPlayer({ position: 'TE', age: 26, value: 800 }, 2, curves), 800)
  // Zero value stays zero (contributes 0, same contract as everywhere).
  assert.equal(projectPlayer({ position: 'WR', age: 26, value: 0 }, 2, curves), 0)
})

test('picks hold at their value until the draft year, then age as a rookie-22 asset on the generic curve (Feature 17)', () => {
  // Generic curve: age 22 → 100, age 23 → 90 (a −10% year, inside the clamp).
  const genericCurve = flatCurveExcept({ 22: 100, 23: 90 })
  const roster = {
    players: [],
    picks: [{ season: '2028', round: 1, value: 1000 }],
  }
  const t = buildRosterTrajectory(roster, 2026, {}, genericCurve)
  assert.deepEqual(t.seasons, [2026, 2027, 2028, 2029])
  // 2026, 2027: not yet conveyed → holds. 2028: draft year (0 years in) →
  // still holds. 2029: 1 year in → 1000 × (90/100) = 900.
  assert.deepEqual(t.pickByYear, [1000, 1000, 1000, 900])
  assert.deepEqual(t.totalByYear, [1000, 1000, 1000, 900])
})

test('buildAgeCurves produces a full 21–39 curve per position from the FantasyCalc pool (Feature 17 market age curve)', () => {
  // Tiny synthetic market: enough samples that curves exist everywhere via
  // the kernel + prior blend. Shape correctness is a model-quality question
  // (out of scope here); existence and positivity are the contract.
  const playerMap = {}
  let id = 0
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    for (let age = 22; age <= 32; age += 2) {
      playerMap[`x${id++}`] = { position, age, value: 3000 - (age - 22) * 150 }
    }
  }
  const { curves, generic } = buildAgeCurves(playerMap)
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    for (let age = 21; age <= 39; age++) {
      assert.ok(curves[pos][age] > 0, `${pos} curve missing/non-positive at age ${age}`)
    }
  }
  assert.ok(generic[22] > 0)
  // The projection horizon the whole feature is built around (current → +3).
  assert.equal(TRAJECTORY_HORIZON, 3)
})
