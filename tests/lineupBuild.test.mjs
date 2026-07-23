// tests/lineupBuild.test.mjs — pins the shared optimal-lineup slot-fill
// (src/utils/lineupBuild.js), the engine behind BOTH the in-season Optimizer
// (fed weekly points) and the Trade Analyzer's roster-fit sim (fed dynasty
// value).
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 9 / lineupHistory: "Fills single-position slots first,
//    then FLEX, then Superflex … always taking the highest remaining." The fill
//    order is optimal for the nested eligibility FLEX ⊂ SFLX.
//  - CLAUDE.md Rules #6 (taxi) / roster slots: taxi + IR players can't be
//    started, so buildValueLineup excludes them.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { selectOptimalStarters, buildValueLineup } from '../src/utils/lineupBuild.js'

test('selectOptimalStarters fills singles → FLEX → SFLX, taking the best remaining', () => {
  const items = [
    { key: 'QB1', position: 'QB', metric: 100 },
    { key: 'RB1', position: 'RB', metric: 90 },
    { key: 'RB2', position: 'RB', metric: 80 },
    { key: 'RB3', position: 'RB', metric: 70 },
    { key: 'RB4', position: 'RB', metric: 30 },
    { key: 'WR1', position: 'WR', metric: 60 },
    { key: 'WR2', position: 'WR', metric: 50 },
    { key: 'WR3', position: 'WR', metric: 25 },
    { key: 'WR4', position: 'WR', metric: 20 },
    { key: 'TE1', position: 'TE', metric: 40 },
    { key: 'TE2', position: 'TE', metric: 15 },
    { key: 'QB2', position: 'QB', metric: 10 },
  ]
  const { starters, total } = selectOptimalStarters(items)
  const keys = new Set(starters.map(s => s.key))

  // Singles: QB1, RB1/RB2, WR1/WR2, TE1. FLEX (best 3 of the rest): RB3(70),
  // RB4(30), WR3(25). SFLX (best remaining, QB eligible): WR4(20) > QB2(10).
  assert.equal(total, 100 + 90 + 80 + 60 + 50 + 40 + 70 + 30 + 25 + 20)
  assert.ok(keys.has('RB4'), 'RB4 fills a FLEX slot')
  assert.ok(keys.has('WR4'), 'WR4 wins the SFLX over the low QB2')
  assert.ok(!keys.has('TE2') && !keys.has('QB2'), 'the two weakest sit on the bench')
})

test('buildValueLineup excludes IR and taxi players and reports who starts by value', () => {
  const players = [
    { sleeperId: 'q1', position: 'QB', value: 7000 },
    { sleeperId: 'r1', position: 'RB', value: 5000 },
    { sleeperId: 'r2', position: 'RB', value: 4000 },
    { sleeperId: 'w1', position: 'WR', value: 3000 },
    { sleeperId: 'w2', position: 'WR', value: 2000 },
    { sleeperId: 't1', position: 'TE', value: 1500 },
    { sleeperId: 'ir1', position: 'WR', value: 9999, isIR: true },
    { sleeperId: 'taxi1', position: 'RB', value: 9999, isTaxi: true },
  ]
  const { starterIds, startingValue } = buildValueLineup(players)

  assert.ok(!starterIds.has('ir1'), 'an IR player never starts, even at 9999')
  assert.ok(!starterIds.has('taxi1'), 'a taxi player never starts')
  assert.ok(starterIds.has('q1') && starterIds.has('r1'), 'healthy actives start')
  // Six actives, all fit inside the 10 non-DEF slots → all start.
  assert.equal(startingValue, 7000 + 5000 + 4000 + 3000 + 2000 + 1500)
})
