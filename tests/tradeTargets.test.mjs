// tests/tradeTargets.test.mjs — pins documented behavior of
// src/utils/rosterAnalysis.js's getTopTradeTargets, including the team-scoped
// ("scout this team") mode added for Trade › Targets.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 3 (Targets sub-tab): league-wide mode ranks opponents'
//    players by "need × value" and skips positions where I'm NOT below the
//    league average.
//  - CLAUDE.md Feature 3 (team filter): passing `ownerRosterId` scopes the
//    board to one opponent AND keeps their non-deficit pieces, ranked below
//    the need-matched ones — an explicitly chosen team must never render an
//    empty list. Each row carries `fillsNeed` so the UI can say which is which.
//  - CLAUDE.md Feature 3: value floor of 1000 and IR exclusion apply in both
//    modes; my own roster is never a target.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getTopTradeTargets } from '../src/utils/rosterAnalysis.js'

// Roster factory: `getPositionalStrength` sums the top N by value per
// position, so the counts below control who reads as above/below average.
function player(sleeperId, position, value, extra = {}) {
  return { sleeperId: String(sleeperId), name: `P${sleeperId}`, position, value, isIR: false, ...extra }
}

function roster(rosterId, players) {
  return { rosterId, owner: { user_id: `u${rosterId}`, display_name: `T${rosterId}` }, players, totalValue: 0, pickCapitalScore: 0 }
}

// Me: rich at WR, barren at RB → RB is my only deficit position.
const me = roster(1, [
  player('w1', 'WR', 8000), player('w2', 'WR', 7000), player('w3', 'WR', 6000),
  player('r1', 'RB', 1000),
])
// Opponent 2: holds RBs (fills my deficit) AND a big WR (does not).
const opp2 = roster(2, [
  player('r2', 'RB', 5000), player('r3', 'RB', 3000),
  player('w4', 'WR', 9000),
])
// Opponent 3: WR only — nothing at my deficit position at all.
const opp3 = roster(3, [
  player('w5', 'WR', 4000), player('w6', 'WR', 2000),
])
const league = [me, opp2, opp3]

test('league-wide mode keeps only deficit positions and never targets my own roster (Feature 3)', () => {
  const targets = getTopTradeTargets(me, league)
  assert.ok(targets.length > 0)
  assert.ok(targets.every(t => t.position === 'RB'), 'WRs are dropped — I am above average at WR')
  assert.ok(targets.every(t => t.ownerRosterId !== me.rosterId), 'my own players are never targets')
  assert.ok(targets.every(t => t.fillsNeed === true), 'every league-wide target fills a deficit')
  // Ranked by need × value → the more valuable RB leads.
  assert.equal(targets[0].sleeperId, 'r2')
})

test('team-scoped mode returns only that team, need-matched first (Feature 3: team filter)', () => {
  const targets = getTopTradeTargets(me, league, 20, { ownerRosterId: 2 })
  assert.ok(targets.every(t => t.ownerRosterId === 2), 'scoped to the chosen opponent only')
  // Their RBs fill my deficit and outrank the WR, which is kept as depth.
  assert.deepEqual(targets.map(t => t.sleeperId), ['r2', 'r3', 'w4'])
  assert.deepEqual(targets.map(t => t.fillsNeed), [true, true, false])
})

test('team-scoped mode never renders empty when the team fills no deficit (fallback contract)', () => {
  // Opponent 3 has nothing at RB — league-wide they contribute nothing.
  assert.equal(getTopTradeTargets(me, league).some(t => t.ownerRosterId === 3), false)
  // Scoped, their board still comes back — as depth, ranked by value.
  const targets = getTopTradeTargets(me, league, 20, { ownerRosterId: 3 })
  assert.deepEqual(targets.map(t => t.sleeperId), ['w5', 'w6'])
  assert.ok(targets.every(t => t.fillsNeed === false), 'flagged as depth, not as a need')
})

test('value floor and IR exclusion hold in team-scoped mode too (Feature 3 / rule 7)', () => {
  const opp4 = roster(4, [
    player('r4', 'RB', 4000, { isIR: true }),   // on IR — excluded
    player('r5', 'RB', 999),                    // under the 1000 floor — excluded
    player('r6', 'RB', 1000),                   // exactly at the floor — kept
  ])
  const targets = getTopTradeTargets(me, [...league, opp4], 20, { ownerRosterId: 4 })
  assert.deepEqual(targets.map(t => t.sleeperId), ['r6'])
})

test('an unknown ownerRosterId yields an empty scoped board rather than the whole league', () => {
  assert.deepEqual(getTopTradeTargets(me, league, 20, { ownerRosterId: 99 }), [])
})
