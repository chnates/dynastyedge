// tests/recommendations.test.mjs — pins documented behavior of
// src/utils/recommendations.js's `suggestSellMove`, the recommendation engine's
// "who do I call about this surplus?" answer.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md "The recommendation engine" / Feature 1 Action Items:
//    suggestSellMove returns nav-ready preloadTrade state naming a concrete
//    partner and, where one exists, a concrete return at one of MY deficits.
//  - OPEN-6 (two-sided recommenders): the partner is chosen on three ROSTER
//    FACTS — their need at the position, whether the player would actually
//    START for them, and whether they hold a return I need. A partner with a
//    real return beats a needier one holding nothing, because the two-sided
//    move is the thing worth surfacing. It falls back to the neediest team
//    when nobody has a return.
//  - Never a read on the manager: behavioral profiling is disconfirmed
//    (docs/analysis/trade-structure-stability-2026-08.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { suggestSellMove } from '../src/utils/recommendations.js'

const P = (id, name, pos, value, age = 26) =>
  ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
const mk = (rosterId, players, name = `T${rosterId}`) => ({
  rosterId,
  owner: { user_id: `u${rosterId}`, display_name: name },
  players, picks: [],
  totalValue: players.reduce((s, p) => s + p.value, 0),
  pickCapitalScore: 0, avgStarterAge: 26,
})

// Me: three quarterbacks (a surplus worth converting) and nothing at WR.
const me = mk(1, [
  P('101', 'My QB1', 'QB', 6000), P('102', 'My QB2', 'QB', 5000), P('103', 'Spare QB', 'QB', 4000),
  P('104', 'My RB1', 'RB', 4000), P('105', 'My RB2', 'RB', 3800),
  P('106', 'My WR1', 'WR', 900), P('107', 'My TE1', 'TE', 3000),
])

// NEEDIEST at QB — but holds nothing at WR I could ask for in return.
const needyNoReturn = mk(2, [
  P('201', 'Their QB', 'QB', 500),
  P('202', 'RB', 'RB', 5000), P('203', 'RB2', 'RB', 4800),
  P('204', 'Weak WR', 'WR', 400), P('205', 'TE', 'TE', 3000),
], 'Needy')

// Slightly less needy at QB, but holds a WR at my deficit worth what I'd send.
const needyWithReturn = mk(3, [
  P('301', 'Their QB', 'QB', 1500),
  P('302', 'Good WR', 'WR', 4200), P('303', 'WR2', 'WR', 3900),
  P('304', 'RB', 'RB', 3000), P('305', 'TE', 'TE', 2500),
], 'Trader')

const filler = mk(4, [
  P('401', 'a', 'QB', 5500), P('402', 'b', 'RB', 3000), P('403', 'c', 'WR', 3000), P('404', 'd', 'TE', 2000),
], 'Filler')

const league = [me, needyNoReturn, needyWithReturn, filler]
const spareQb = me.players.find(p => p.name === 'Spare QB')

test('the partner with a concrete return beats a needier one holding nothing (OPEN-6)', () => {
  const move = suggestSellMove(spareQb, me, league)
  assert.ok(move, 'a move is suggested')
  assert.equal(move.opponentRosterId, needyWithReturn.rosterId,
    'a two-sided move outranks a bare "shop him to the neediest team"')
  assert.ok(move.get?.length, 'the return is concrete, not an opening pleasantry')
  assert.equal(move.get[0].name, 'Good WR')
  assert.equal(move.deficitPos, 'WR', 'and it lands at a position I am actually short of')
})

test('the suggestion is nav-ready for the Analyzer preloadTrade (Feature 1 Action Items)', () => {
  const move = suggestSellMove(spareQb, me, league)
  assert.equal(move.give.length, 1)
  assert.equal(move.give[0].type, 'player')
  assert.equal(move.give[0].sleeperId, spareQb.sleeperId)
  assert.equal(move.get[0].type, 'player')
  assert.ok(typeof move.opponentRosterId === 'number')
  assert.ok(move.summary.includes('Good WR'))
})

test('it falls back to the neediest team when nobody holds a return (old contract preserved)', () => {
  // Strip the only useful WRs out of the league — now no partner can pay me at
  // a deficit position, so the honest move is still "shop him here".
  const stripped = [
    me,
    needyNoReturn,
    mk(3, [P('301', 'Their QB', 'QB', 1500), P('304', 'RB', 'RB', 3000)], 'Trader'),
    filler,
  ]
  const move = suggestSellMove(spareQb, me, stripped)
  assert.ok(move)
  assert.equal(move.get, null, 'no return is invented')
  assert.ok(move.ctaLabel.startsWith('Shop to'))
  assert.equal(move.opponentRosterId, needyNoReturn.rosterId, 'the neediest team gets the call')
})

test('it reports whether the player would actually START for them (OPEN-6)', () => {
  // A roster fact, and the reason a "need" at a position can be illusory: a
  // player who only stacks their bench is not a sale.
  const move = suggestSellMove(spareQb, me, league)
  assert.equal(typeof move.startsForThem, 'boolean')
  assert.equal(move.startsForThem, true, 'a 4,000 QB starts for a team whose best is 1,500')
})

test('it degrades to null rather than guessing (degradation contract)', () => {
  assert.equal(suggestSellMove(null, me, league), null)
  assert.equal(suggestSellMove(spareQb, null, league), null)
  assert.equal(suggestSellMove(spareQb, me, []), null)
  assert.equal(suggestSellMove(spareQb, me, [me]), null, 'no opponents — no move')
})
