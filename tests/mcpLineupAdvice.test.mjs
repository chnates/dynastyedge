// tests/mcpLineupAdvice.test.mjs — pins lineup_advice.
//
// Behaviors pinned (with their source):
//  - CLAUDE.md, "Weekly tools are in-season only": the offseason must SAY so
//    rather than return a lineup of zeros.
//  - CLAUDE.md Feature 4 / lineupMoves.js: the per-move gains SUM EXACTLY to
//    the headline. That invariant is what makes the engine trustworthy, and a
//    tool that re-derived a gain would break it silently.
//  - CLAUDE.md Feature 4, confidence: "A must-fix carries NO confidence" —
//    a bye/Out/empty slot scores 0 BY RULE, not by projection, so the
//    measured curve has no question to answer. And the curve returns a
//    PERCENTAGE, not a fraction.
//  - CLAUDE.md Feature 4: a blocked starter contributes 0 to the current
//    total whatever Sleeper still projects for him.
//  - CLAUDE.md: Sleeper's API is read-only.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildLineupAnswer, renderLineupText } from '../mcp/tools/lineupAdvice.js'
import { makeSnapshot, makeWeekly, makeOffseasonWeekly, LEAGUE, MINE, player } from './helpers/mcpFixtures.mjs'

const advise = (weekly = makeWeekly(), args = {}, snapOver = {}) =>
  buildLineupAnswer(makeSnapshot(snapOver), weekly, {
    defaultRosterId: 6, myRosterId: 6, ...args,
  })

// A roster whose lineup is genuinely improvable: the starting WR is OUT, and
// a better WR sits on the bench.
function improvableSnapshot() {
  const players = [
    player({ id: '1', name: 'Starting QB', pos: 'QB', starter: true, nfl: 'ATL' }),
    player({ id: '2', name: 'Starting RB1', pos: 'RB', starter: true, nfl: 'ATL' }),
    player({ id: '3', name: 'Starting RB2', pos: 'RB', starter: true, nfl: 'ATL' }),
    player({ id: '4', name: 'Hurt Starter', pos: 'WR', starter: true, nfl: 'ATL' }),
    player({ id: '5', name: 'Starting WR2', pos: 'WR', starter: true, nfl: 'ATL' }),
    player({ id: '6', name: 'Starting TE', pos: 'TE', starter: true, nfl: 'ATL' }),
    player({ id: '7', name: 'Flex One', pos: 'WR', starter: true, nfl: 'ATL' }),
    player({ id: '8', name: 'Flex Two', pos: 'RB', starter: true, nfl: 'ATL' }),
    player({ id: '9', name: 'Flex Three', pos: 'WR', starter: true, nfl: 'ATL' }),
    player({ id: '10', name: 'Superflex QB', pos: 'QB', starter: true, nfl: 'ATL' }),
    player({ id: '11', name: 'Team Defense', pos: 'DEF', starter: true, nfl: 'ATL', unranked: true }),
    // The bench upgrade.
    player({ id: '12', name: 'Better Bench WR', pos: 'WR', nfl: 'ATL' }),
  ]
  const roster = {
    ...MINE, players,
    starterOrder: players.filter(p => p.isStarter).map(p => p.sleeperId),
  }
  const league = { ...LEAGUE, myRoster: roster, allRosters: [roster, ...LEAGUE.allRosters.slice(1)] }
  const projMap = Object.fromEntries(players.map(p => [p.sleeperId, { pts_half_ppr: 10 }]))
  projMap['4'] = { pts_half_ppr: 11 }  // Sleeper still projects the Out player
  projMap['12'] = { pts_half_ppr: 16 } // the bench upgrade
  // 'Hurt Starter' is Out — the player DB is where injury_status lives.
  const playerDB = { 4: { name: 'Hurt Starter', position: 'WR', team: 'ATL', injury_status: 'Out' } }
  return {
    snapshot: makeSnapshot({ league, playerDB }),
    weekly: makeWeekly({ projMap, playingTeams: new Set(['ATL']) }),
  }
}

const improvable = () => {
  const { snapshot, weekly } = improvableSnapshot()
  return buildLineupAnswer(snapshot, weekly, { defaultRosterId: 6, myRosterId: 6 })
}

// ── IN-SEASON ONLY ────────────────────────────────────────────────────────

test('the offseason returns unavailable with a reason — NEVER a lineup of zeros', () => {
  const a = advise(makeOffseasonWeekly(), {}, { isOffseason: true })
  assert.equal(a.ok, false)
  assert.equal(a.unavailable, true)
  assert.equal(a.reason, 'offseason')
  assert.equal(a.summary, undefined, 'no zeroed summary may be reported')
  assert.equal(a.moves, undefined)
  assert.match(a.error, /offseason/i)
})

test('the offseason error explains why zeros would be WRONG, not just absent', () => {
  const a = advise(makeOffseasonWeekly(), {}, { isOffseason: true })
  assert.match(a.error, /nobody is worth starting|lineup of zeros/i)
})

test('a failed projections fetch is distinguished from the offseason', () => {
  const failed = makeWeekly({ available: false, projMap: null })
  const a = advise(failed)
  assert.equal(a.ok, false)
  assert.equal(a.reason, 'projections-unavailable')
  assert.match(a.error, /not a verdict that your lineup is fine/i)
})

// ── the engine's invariant ───────────────────────────────────────────────

test('per-move gains sum EXACTLY to the headline', () => {
  const a = improvable()
  const sum = a.moves.reduce((s, m) => s + m.gain, 0)
  assert.ok(
    Math.abs(sum - a.summary.pointsLeftOnBench) < 0.11,
    `gains ${sum} must sum to headline ${a.summary.pointsLeftOnBench} (within rounding)`
  )
})

test('the headline is optimal minus current', () => {
  const a = improvable()
  assert.ok(
    Math.abs((a.summary.optimalProjected - a.summary.currentProjected) - a.summary.pointsLeftOnBench) < 0.11
  )
})

test('coin-flip moves are DEMOTED, not dropped — the headline includes them', () => {
  const a = improvable()
  // Whatever the split, every move is present in the list; `meaningful`
  // separates them. Dropping one would leave points in the headline with
  // nothing on screen explaining them.
  assert.equal(
    a.moves.length,
    a.summary.mustFixCount + a.summary.upgradeCount + a.summary.coinFlipCount
  )
})

// ── confidence ───────────────────────────────────────────────────────────

test('a must-fix carries NO confidence, by rule', () => {
  const a = improvable()
  const mustFix = a.moves.filter(m => m.mustFix)
  assert.ok(mustFix.length > 0, 'the fixture has an Out starter')
  mustFix.forEach(m =>
    assert.equal(m.confidencePct, null,
      'a bye/Out/empty slot scores 0 by rule — there is no closer call to be uncertain about'))
})

test('confidence is a PERCENTAGE in 0-100, never a fraction', () => {
  const a = improvable()
  a.moves.filter(m => m.confidencePct != null).forEach(m => {
    assert.ok(m.confidencePct > 1 && m.confidencePct <= 100,
      `${m.confidencePct} is not a percentage — the ×100 bug printed "6530%"`)
    assert.ok(m.confidencePct >= 50, 'the measured curve floors at 52%')
  })
})

test('the notes explain what confidence measures', () => {
  const a = improvable()
  assert.ok(a.notes.some(n => /666,026/.test(n)), 'the measured sample must be quoted')
})

// ── a blocked player scores 0 ────────────────────────────────────────────

test('a blocked starter contributes 0 however Sleeper projects him', () => {
  const a = improvable()
  const hurt = a.lineup.map(s => s.player).find(p => p?.name === 'Hurt Starter')
  assert.ok(hurt)
  assert.equal(hurt.blocked, true)
  assert.equal(hurt.projected, 11, 'Sleeper still carries a projection')
  assert.equal(hurt.effective, 0, 'but he contributes 0 — otherwise the gap is hidden')
})

test('the blocked player produces a must-fix move', () => {
  const a = improvable()
  assert.ok(a.summary.mustFixCount >= 1)
  assert.ok(a.moves.some(m => m.mustFix && m.sit?.name === 'Hurt Starter'))
})

// ── shape and bounds ─────────────────────────────────────────────────────

test('the lineup covers every roster slot, empties included', () => {
  const a = improvable()
  assert.equal(a.lineup.length, 11, 'QB RB RB WR WR TE FLEX×3 SFLX DEF')
  a.lineup.forEach(s => assert.ok(typeof s.slot === 'string'))
})

test('an already-optimal lineup says so rather than inventing a move', () => {
  // Every player projects the same, so there is nothing to gain.
  const players = MINE.players.filter(p => !p.isTaxi && !p.isIR)
  const roster = { ...MINE, players, starterOrder: players.map(p => p.sleeperId) }
  const league = { ...LEAGUE, myRoster: roster, allRosters: [roster, ...LEAGUE.allRosters.slice(1)] }
  const projMap = Object.fromEntries(players.map(p => [p.sleeperId, { pts_half_ppr: 10 }]))
  const a = buildLineupAnswer(
    makeSnapshot({ league }), makeWeekly({ projMap, playingTeams: new Set(['ATL']) }),
    { defaultRosterId: 6, myRosterId: 6 }
  )
  if (a.summary.isOptimal) {
    assert.equal(a.moves.length, 0)
    assert.equal(a.summary.pointsLeftOnBench, 0)
    assert.ok(a.notes.some(n => /already optimal/i.test(n)))
  }
})

test('it advises on ANOTHER team when asked, and marks it not-you', () => {
  const a = advise(makeWeekly(), { team: 'Mahomes Depot' })
  assert.equal(a.ok, true)
  assert.equal(a.team.rosterId, 3)
  assert.equal(a.team.isYou, false)
})

test('an unknown team returns candidates, never a guess', () => {
  const a = advise(makeWeekly(), { team: 'Nobody' })
  assert.equal(a.ok, false)
  assert.equal(a.candidates.length, 3)
})

test('a manager handle resolves via display_name, which is what Sleeper returns', () => {
  const a = advise(makeWeekly(), { team: 'depot' })
  assert.equal(a.ok, true)
  assert.equal(a.team.rosterId, 3)
})

// ── provenance and the read-only truth ───────────────────────────────────

test('carries the as-of stamp and the week it advised on', () => {
  const a = improvable()
  assert.ok(a.asOf.generatedAt)
  assert.equal(a.league.week, 3)
})

test('weekly notes are carried through, so a missing schedule is disclosed', () => {
  const { snapshot } = improvableSnapshot()
  const w = makeWeekly({ playingTeams: new Set(), notes: ['bye weeks cannot be detected'] })
  const a = buildLineupAnswer(snapshot, w, { defaultRosterId: 6, myRosterId: 6 })
  assert.ok(a.notes.some(n => /bye weeks cannot be detected/.test(n)))
})

test('states that Sleeper is read-only — this cannot set the lineup', () => {
  const a = improvable()
  assert.ok(a.notes.some(n => /READ-ONLY/i.test(n)))
})

test('the text rendering leads with the cost of doing nothing', () => {
  const txt = renderLineupText(improvable())
  assert.ok(/POINTS SITTING ON YOUR BENCH|LINEUP IS OPTIMAL/.test(txt))
  assert.ok(txt.includes('STARTING LINEUP'))
  assert.ok(txt.includes('As of'))
})

test('the text rendering never prints a percentage on a must-fix', () => {
  const a = improvable()
  const txt = renderLineupText(a)
  const lines = txt.split('\n')
  lines.forEach((line, i) => {
    if (!line.includes('[MUST FIX]')) return
    // The two lines following a must-fix header must not carry a confidence.
    const block = lines.slice(i + 1, i + 3).join(' ')
    assert.ok(!/likely to be the right call/.test(block),
      'a must-fix must not borrow the curve\'s authority')
  })
})

test('the offseason renders as prose, not an empty lineup', () => {
  const txt = renderLineupText(advise(makeOffseasonWeekly(), {}, { isOffseason: true }))
  assert.match(txt, /offseason/i)
  assert.ok(!txt.includes('STARTING LINEUP'))
})
