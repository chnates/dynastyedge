// tests/lineupMoves.test.mjs — pins the weekly start/sit engine
// (src/utils/lineupMoves.js), the Lineup Optimizer's brain.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 4: the optimizer solves the WHOLE lineup, so the per-move
//    gains must sum to the headline "points left on bench". The superseded
//    per-slot logic double-counted one bench player across several slots, which
//    is the first two tests here.
//  - CLAUDE.md Feature 4 status flags: Out / IR / bye are hard blocks. A blocked
//    player is dropped from the eligible pool entirely (a 0-metric player would
//    otherwise be "optimized" back into an empty slot) and scores 0 regardless
//    of the projection Sleeper still carries for him.
//  - CLAUDE.md Rules #6: taxi + IR players can't be started.
//  - League Context roster slots: QB·RB·RB·WR·WR·TE·FLEX×3·SFLX·DEF, so the
//    DEF slot is part of the lineup and an unset one is a must-fix.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLineupMoves,
  lineupFromRoster,
  applySwap,
  isEligibleForSlot,
} from '../src/utils/lineupMoves.js'
import { confidenceForGap } from '../src/utils/lineupConfidence.js'

// ── fixture helpers ───────────────────────────────────────────────────────
const P = (id, position, pts, extra = {}) => ({
  sleeperId: id, name: id, position, team: extra.team ?? 'AAA', ...extra,
})
const projOf = players => Object.fromEntries(
  players.map(p => [p.sleeperId, { pts_half_ppr: p._pts ?? 0 }]),
)
// A full legal roster: 11 starters + bench, every slot fillable.
function makeRoster(overrides = []) {
  const spec = [
    ['QB1', 'QB', 20], ['RB1', 'RB', 15], ['RB2', 'RB', 12],
    ['WR1', 'WR', 14], ['WR2', 'WR', 11], ['TE1', 'TE', 10],
    ['RB3', 'RB', 9], ['WR3', 'WR', 8], ['WR4', 'WR', 7],
    ['QB2', 'QB', 18], ['DEF1', 'DEF', 6],
    ['RB4', 'RB', 4], ['WR5', 'WR', 3], ['TE2', 'TE', 2],
  ]
  const players = spec.map(([id, pos, pts]) => {
    const p = P(id, pos); p._pts = pts; return p
  })
  overrides.forEach(fn => fn(players))
  return players
}
const idsOf = players => players.slice(0, 11).map(p => p.sleeperId)

function run(players, lineup, opts = {}) {
  return buildLineupMoves({
    players,
    lineup,
    projMap: projOf(players),
    playerStatuses: opts.playerStatuses ?? {},
    playingTeams: opts.playingTeams ?? new Set(['AAA']),
  })
}

// ── the invariant the old per-slot logic broke ────────────────────────────
test('per-move gains sum EXACTLY to optimal − current', () => {
  const players = makeRoster()
  // Start the four worst players, bench the best — a maximally messy lineup.
  const lineup = ['QB1', 'RB4', 'RB3', 'WR5', 'WR4', 'TE2', 'WR3', 'RB2', 'WR2', 'QB2', 'DEF1']
  const res = run(players, lineup)

  const sum = res.moves.reduce((a, m) => a + m.gain, 0)
  assert.ok(res.moves.length > 1, 'fixture should need several moves')
  assert.ok(
    Math.abs(sum - (res.optimalTotal - res.currentTotal)) < 1e-9,
    `Σ gains ${sum} must equal optimal−current ${res.optimalTotal - res.currentTotal}`,
  )
  assert.ok(Math.abs(res.pointsLeft - sum) < 1e-9, 'pointsLeft is that same number')
})

test('one bench player who outprojects two starters yields ONE move, not two', () => {
  // The superseded per-slot check flagged every slot the bench player beat,
  // advertising his gain twice for a player who can only occupy one slot.
  const players = makeRoster()
  players.find(p => p.sleeperId === 'WR5')._pts = 13 // beats WR2 (11) and WR4 (7)
  const lineup = idsOf(players)
  const res = run(players, lineup)

  const involvingWR5 = res.moves.filter(m => m.in?.id === 'WR5')
  assert.equal(involvingWR5.length, 1, 'WR5 can only be started once')
  assert.equal(res.moves.length, 1)
  // He replaces the WEAKEST displaced starter, and the gain is the real one.
  assert.equal(res.moves[0].out.id, 'WR4')
  assert.ok(Math.abs(res.moves[0].gain - (13 - 7)) < 1e-9)
})

test('finds a cascading move the per-slot check could never see', () => {
  // RB4 becomes the best RB. No single slot comparison surfaces this: the fix
  // is to promote RB4 and let the reshuffle settle, not to compare RB4 against
  // any one incumbent.
  const players = makeRoster()
  players.find(p => p.sleeperId === 'RB4')._pts = 30
  const res = run(players, idsOf(players))
  assert.ok(res.moves.some(m => m.in?.id === 'RB4'), 'RB4 must be started')
  assert.ok(res.optimalTotal > res.currentTotal)
})

// ── hard blocks ───────────────────────────────────────────────────────────
test('a bye-week starter scores 0 and is replaced', () => {
  const players = makeRoster()
  players.find(p => p.sleeperId === 'WR2').team = 'BYE'
  const res = run(players, idsOf(players), { playingTeams: new Set(['AAA']) })

  const slot = res.slots.find(s => s.entry?.id === 'WR2')
  assert.equal(slot.entry.availability.status, 'bye')
  assert.equal(slot.entry.effPts, 0, 'a bye player contributes 0, not his projection')

  const move = res.moves.find(m => m.out?.id === 'WR2')
  assert.ok(move, 'the bye starter must produce a move')
  assert.equal(move.mustFix, true)
  assert.match(move.reason, /on bye/)
})

test('an Out starter contributes 0 even though Sleeper still projects him', () => {
  const players = makeRoster()
  const res = run(players, idsOf(players), {
    playerStatuses: { WR1: { injury_status: 'Out' } },
  })
  const slot = res.slots.find(s => s.entry?.id === 'WR1')
  assert.equal(slot.entry.projPts, 14, 'the raw projection is still there')
  assert.equal(slot.entry.effPts, 0, 'but it must not count')
  assert.equal(res.moves.find(m => m.out?.id === 'WR1').mustFix, true)
})

test('a blocked player is never optimized back INTO an empty slot', () => {
  // Only TE is on bye. Dropping him from the pool leaves the TE slot empty —
  // the truthful outcome. Handing him a 0 metric instead would place him.
  const players = makeRoster().filter(p => p.sleeperId !== 'TE2')
  players.find(p => p.sleeperId === 'TE1').team = 'BYE'
  const res = run(players, idsOf(players))
  assert.equal(res.optimalByIdx[5], null, 'TE slot stays empty')
  const move = res.moves.find(m => m.out?.id === 'TE1')
  assert.equal(move.in, null, 'sit with nobody to replace him')
  assert.match(move.reason, /no eligible replacement/)
})

test('Questionable is a soft flag — startable, but surfaced', () => {
  const players = makeRoster()
  const res = run(players, idsOf(players), {
    playerStatuses: { RB1: { injury_status: 'Questionable' } },
  })
  const slot = res.slots.find(s => s.entry?.id === 'RB1')
  assert.equal(slot.entry.availability.blocked, false)
  assert.equal(slot.entry.effPts, 15, 'still counts his projection')
})

test('taxi and IR players are excluded from the lineup entirely', () => {
  const players = makeRoster()
  players.find(p => p.sleeperId === 'RB4').isTaxi = true
  players.find(p => p.sleeperId === 'WR5').isIR = true
  const res = run(players, idsOf(players))
  const seen = new Set([...res.bench.map(b => b.id), ...res.slots.map(s => s.entry?.id)])
  assert.ok(!seen.has('RB4'), 'taxi player is not startable')
  assert.ok(!seen.has('WR5'), 'IR player is not startable')
})

// ── the DEF slot the old optimizer skipped ────────────────────────────────
test('an unset DEF slot is a must-fix, not silence', () => {
  const players = makeRoster()
  const lineup = [...idsOf(players)]
  lineup[10] = null // Sleeper pads an unset slot with '0'
  const res = run(players, lineup)

  const move = res.moves.find(m => m.in?.id === 'DEF1')
  assert.ok(move, 'the rostered DEF must be surfaced')
  assert.equal(move.out, null)
  assert.equal(move.mustFix, true)
  assert.equal(move.direct, true, 'filling an empty slot is a direct move, not a chain')
  assert.equal(res.emptySlots, 1)
})

test('lineupFromRoster maps Sleeper\'s "0" padding to an empty slot', () => {
  const lineup = lineupFromRoster({ starterOrder: ['1', '2', '0', '4'] })
  assert.equal(lineup.length, 11, 'always aligned to ROSTER_SLOTS')
  assert.equal(lineup[2], null)
  assert.equal(lineup[0], '1')
  assert.equal(lineup[10], null, 'a short starters array leaves later slots empty')
})

// ── move pairing ──────────────────────────────────────────────────────────
test('a move is flagged as a chain only when the swap is not directly legal', () => {
  const players = makeRoster()
  players.find(p => p.sleeperId === 'TE2')._pts = 40 // TE2 in, someone out
  const res = run(players, idsOf(players))
  const move = res.moves.find(m => m.in?.id === 'TE2')
  // TE is eligible for the FLEX slots, so pairing prefers a directly-legal
  // partner over one that would imply an illegal one-for-one.
  assert.ok(move.direct, `expected a direct pairing, got out=${move.out?.id}`)
})

test('an optimal lineup produces no moves at all', () => {
  const players = makeRoster()
  const res = run(players, idsOf(players))
  assert.deepEqual(res.moves, [])
  assert.equal(res.pointsLeft, 0)
  assert.ok(res.slots.every(s => s.isOptimal))
})

// ── slot eligibility + swapping ───────────────────────────────────────────
test('isEligibleForSlot honors FLEX ⊄ QB and SFLX ⊃ QB', () => {
  const qb = P('q', 'QB'), wr = P('w', 'WR')
  assert.equal(isEligibleForSlot(qb, 0), true,  'QB slot takes a QB')
  assert.equal(isEligibleForSlot(qb, 6), false, 'FLEX excludes QB')
  assert.equal(isEligibleForSlot(qb, 9), true,  'Superflex includes QB')
  assert.equal(isEligibleForSlot(wr, 6), true,  'FLEX takes a WR')
  assert.equal(isEligibleForSlot(wr, 1), false, 'RB slot rejects a WR')
})

test('applySwap swaps two slots without mutating the input', () => {
  const before = ['a', 'b', 'c']
  const after = applySwap(before, 0, { kind: 'slot', slotIdx: 2 })
  assert.deepEqual(before, ['a', 'b', 'c'], 'input is untouched')
  assert.deepEqual(after, ['c', 'b', 'a'])
})

test('a bench player moving in displaces the starter to the bench', () => {
  const after = applySwap(['a', 'b', 'c'], 1, { kind: 'bench', playerId: 'z' })
  assert.deepEqual(after, ['a', 'z', 'c'], 'b leaves the lineup entirely')
})

test('swapping in a player already starting elsewhere trades the two slots', () => {
  // Guards the double-start bug: 'c' must not end up in two slots.
  const after = applySwap(['a', 'b', 'c'], 0, { kind: 'bench', playerId: 'c' })
  assert.deepEqual(after, ['c', 'b', 'a'])
  assert.equal(new Set(after).size, 3, 'nobody starts twice')
})

// ── confidence + coin-flip demotion (build plan 1a) ───────────────────────
// CLAUDE.md Feature 4: every move carries the measured chance that starting
// the higher-projected player is the right call (utils/lineupConfidence.js,
// regenerated from scripts/dev/optimizer-signal-backtest.mjs §3). Sub-1-point
// swaps are coin flips and are demoted OUT of the move list — but never
// dropped, because the headline is optimal − current and the per-move gains
// must keep summing to it.

test('a swap carries the measured confidence for its projection gap', () => {
  const players = makeRoster()
  players.find(p => p.sleeperId === 'WR5')._pts = 14 // beats WR4 (7) by 7
  const res = run(players, idsOf(players))
  const move = res.moves.find(m => m.in?.id === 'WR5')
  assert.ok(Math.abs(move.gain - 7) < 1e-9)
  assert.equal(move.confidence, 74.7, 'a 5-8 pt gap is right 74.7% of the time')
  assert.equal(move.meaningful, true)
})

test('a must-fix carries NO confidence — the outgoing side scores 0 by rule', () => {
  // A bye player is not "the lower projection", he is a certainty. Borrowing
  // the calibration curve's authority for that would misstate what it measured.
  const players = makeRoster()
  players.find(p => p.sleeperId === 'WR2').team = 'BYE'
  const res = run(players, idsOf(players), { playingTeams: new Set(['AAA']) })
  const move = res.moves.find(m => m.out?.id === 'WR2')
  assert.equal(move.mustFix, true)
  assert.equal(move.confidence, null)
  assert.equal(move.meaningful, true, 'a must-fix is never demoted')
})

test('a sub-1-point swap is demoted but STILL sums into the headline', () => {
  const players = makeRoster()
  players.find(p => p.sleeperId === 'WR5')._pts = 7.4 // beats WR4 (7) by 0.4
  const res = run(players, idsOf(players))
  const move = res.moves.find(m => m.in?.id === 'WR5')

  assert.equal(move.meaningful, false, 'under 1 pt is a coin flip, not a move')
  assert.equal(move.confidence, 52, '0-1 pt gap: 52% — barely better than chance')
  assert.equal(res.coinFlipCount, 1)
  assert.equal(res.upgradeCount, 0, 'it must not be counted as an upgrade')

  const sum = res.moves.reduce((a, m) => a + m.gain, 0)
  assert.ok(
    Math.abs(res.pointsLeft - sum) < 1e-9,
    'the demoted move still counts toward optimal − current',
  )
})

test('confidenceForGap is monotone and only defined above a zero gap', () => {
  assert.equal(confidenceForGap(0), null)
  assert.equal(confidenceForGap(-3), null)
  const pcts = [0.5, 1.5, 2.5, 3.5, 4.5, 6, 10, 20].map(confidenceForGap)
  pcts.forEach((p, i) => {
    assert.ok(p > 50 && p < 100, `${p} must read as a probability`)
    if (i > 0) assert.ok(p > pcts[i - 1], 'a bigger gap is never less reliable')
  })
})
