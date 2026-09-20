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
    lockedTeams: opts.lockedTeams,
    actualPoints: opts.actualPoints,
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


// ── GAME LOCKS ────────────────────────────────────────────────────────────
//
// The bug these pin, in full, because it shipped and was acted on: on a Sunday
// morning the engine told the owner to sit DJ Moore (BUF) for TreVeyon
// Henderson, "+8.5, must fix". Moore's game had finished on Thursday night. He
// could not be benched, he had not scored 0 — he had banked -0.1 before
// leaving injured — and those 8.5 points were counted in "points sitting on
// your bench" where they were not sitting and could not be collected. The
// schedule payload carried `status: "complete"` for that game the whole time.

test('a locked starter produces NO move, however much better the bench is', () => {
  // WR4 starts in a FLEX at 7; WR5 on the bench projects 30 — normally an
  // obvious upgrade. WR4's game has kicked off, so it is not available.
  const players = makeRoster([ps => {
    ps.find(x => x.sleeperId === 'WR4').team = 'LOCK'
    ps.find(x => x.sleeperId === 'WR5')._pts = 30
  }])
  const lineup = idsOf(players)

  const open = run(players, lineup)
  assert.ok(open.moves.some(m => m.out?.id === 'WR4'),
    'sanity: with no locks the engine does want to bench WR4')

  const sealed = run(players, lineup, { lockedTeams: new Set(['LOCK']) })
  assert.equal(sealed.moves.filter(m => m.out?.id === 'WR4' || m.in?.id === 'WR4').length, 0,
    'a sealed slot is not a decision — offering a move for it advertises points that cannot be won')
  assert.equal(sealed.lockedStarters, 1)
})

test('a locked BENCH player is never started', () => {
  const players = makeRoster([ps => {
    ps.find(x => x.sleeperId === 'WR5').team = 'LOCK'
    ps.find(x => x.sleeperId === 'WR5')._pts = 99
  }])
  const lineup = idsOf(players)
  const res = run(players, lineup, { lockedTeams: new Set(['LOCK']) })
  assert.ok(!res.moves.some(m => m.in?.id === 'WR5'),
    'you cannot start a player whose game has already begun, whatever he projects')
  assert.equal(res.lockedBench, 1)
})

test('a locked player scores what he ACTUALLY scored, not 0 and not his projection', () => {
  // Exactly DJ Moore's case: game finished, listed Out afterwards, real -0.1.
  const players = makeRoster([ps => {
    const w = ps.find(x => x.sleeperId === 'WR4')
    w.team = 'LOCK'; w._pts = 10.9
  }])
  const lineup = idsOf(players)
  const res = run(players, lineup, {
    lockedTeams: new Set(['LOCK']),
    playerStatuses: { WR4: { injury_status: 'Out' } },
    actualPoints: { WR4: -0.1 },
  })
  const row = res.slots.find(s => s.entry?.id === 'WR4').entry
  assert.equal(row.effPts, -0.1,
    'a played game is FACT — it outranks both the projection and the blocked-scores-0 rule')
  assert.equal(row.actualPts, -0.1)
  assert.equal(res.lockedPoints, -0.1, 'the banked figure is what is already settled')
})

test('a locked player with NO live score falls back to his projection, never to 0', () => {
  const players = makeRoster([ps => {
    const w = ps.find(x => x.sleeperId === 'WR4')
    w.team = 'LOCK'; w._pts = 10.9
  }])
  const res = run(players, idsOf(players), {
    lockedTeams: new Set(['LOCK']),
    playerStatuses: { WR4: { injury_status: 'Out' } },
  })
  const row = res.slots.find(s => s.entry?.id === 'WR4').entry
  assert.equal(row.effPts, 10.9,
    '"he will score 0" is a claim about the future; his game is not in the future. ' +
    'Guessing 0 here re-manufactures the overstatement the lock fix removed')
  assert.equal(row.actualPts, null, 'and the missing score is reported as missing')
  assert.equal(res.lockedWithoutScore, 1)
})

test('the Σ-gains invariant survives locks', () => {
  const players = makeRoster([ps => {
    ps.find(x => x.sleeperId === 'RB2').team = 'LOCK'
    ps.find(x => x.sleeperId === 'QB2').team = 'LOCK'
  }])
  const lineup = ['QB1', 'RB4', 'RB3', 'WR5', 'WR4', 'TE2', 'WR3', 'RB2', 'WR2', 'QB2', 'DEF1']
  const res = run(players, lineup, {
    lockedTeams: new Set(['LOCK']),
    actualPoints: { RB2: 4.4, QB2: 21.7 },
  })
  const sum = res.moves.reduce((a, m) => a + m.gain, 0)
  assert.ok(Math.abs(sum - (res.optimalTotal - res.currentTotal)) < 1e-9,
    'a locked contribution appears identically in both totals, so it cancels and the ' +
    'per-move gains still sum to the headline')
  assert.ok(Math.abs(res.pointsLeft - sum) < 1e-9)
})

test('no locks means byte-for-byte the behaviour that shipped before them', () => {
  const players = makeRoster()
  const lineup = ['QB1', 'RB4', 'RB3', 'WR5', 'WR4', 'TE2', 'WR3', 'RB2', 'WR2', 'QB2', 'DEF1']
  const before = run(players, lineup)
  // An EMPTY locked set must mean "locks unknown", never "everything locked" —
  // the same discipline an empty playingTeams keeps about byes.
  const after = run(players, lineup, { lockedTeams: new Set(), actualPoints: {} })
  assert.equal(after.moves.length, before.moves.length)
  assert.equal(after.currentTotal, before.currentTotal)
  assert.equal(after.optimalTotal, before.optimalTotal)
  assert.equal(after.lockedStarters, 0)
})
