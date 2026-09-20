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


// ── GAME LOCKS, AT THE TOOL ───────────────────────────────────────────────
//
// The live failure: "SIT DJ Moore -> START TreVeyon Henderson, +8.5, must
// fix", issued on a Sunday about a Thursday game. Moore could not be moved,
// had already banked -0.1, and the 8.5 points were reported as sitting on the
// bench. The schedule the tool had already fetched said `status: "complete"`.

test('a locked starter yields NO move and NO must-fix, however he is flagged', () => {
  const { snapshot, weekly } = improvableSnapshot()
  // The hurt starter's game has finished. He is still listed Out.
  const sealed = { ...weekly, lockedTeams: new Set(['ATL']), gameStatus: { ATL: 'complete' } }

  const open = buildLineupAnswer(snapshot, weekly, { defaultRosterId: 6, myRosterId: 6 })
  assert.ok(open.summary.mustFixCount > 0, 'sanity: unlocked, the Out starter is a must-fix')

  const a = buildLineupAnswer(snapshot, sealed, {
    defaultRosterId: 6, myRosterId: 6,
    live: { available: true, pointsByRoster: { 6: { 4: -0.1 } }, notes: [] },
  })
  assert.equal(a.moves.length, 0, 'every slot is sealed, so there is nothing to change')
  assert.equal(a.summary.mustFixCount, 0,
    'a sealed slot cannot be "fixed" — calling it a must-fix asks for an impossible action')
  assert.equal(a.summary.pointsLeftOnBench, 0,
    'points that cannot be collected are not sitting on the bench')
  assert.equal(a.summary.lockedSlots, 11)
})

test('a locked player reports what he SCORED, and the row says it is locked', () => {
  const { snapshot, weekly } = improvableSnapshot()
  const a = buildLineupAnswer(snapshot,
    { ...weekly, lockedTeams: new Set(['ATL']), gameStatus: { ATL: 'complete' } },
    { defaultRosterId: 6, myRosterId: 6,
      live: { available: true, pointsByRoster: { 6: { 4: -0.1 } }, notes: [] } })

  const row = a.lineup.find(s => s.player?.sleeperId === '4').player
  assert.equal(row.locked, true)
  assert.equal(row.actualPoints, -0.1)
  assert.equal(row.effective, -0.1, 'a played game outranks both the projection and the blocked rule')
  assert.equal(row.gameState, 'complete')

  const text = renderLineupText(a)
  assert.match(text, /LOCKED, scored -0\.1/,
    'the rendered text must not print a projection for a game that has finished')
  assert.match(text, /slots LOCKED/)
})

test('locked slots are NOT reported as an optimal lineup you chose', () => {
  const { snapshot, weekly } = improvableSnapshot()
  const a = buildLineupAnswer(snapshot,
    { ...weekly, lockedTeams: new Set(['ATL']) },
    { defaultRosterId: 6, myRosterId: 6 })
  const text = renderLineupText(a)
  assert.match(text, /NOTHING LEFT TO CHANGE/,
    '"your lineup is optimal" would claim credit for a lineup the rules froze')
  assert.ok(a.notes.some(n => /cannot be changed|LOCKED/.test(n)))
})

test('live scores are best-effort — without them locks still hold', () => {
  const { snapshot, weekly } = improvableSnapshot()
  const a = buildLineupAnswer(snapshot,
    { ...weekly, lockedTeams: new Set(['ATL']) },
    { defaultRosterId: 6, myRosterId: 6, live: { available: false, pointsByRoster: {}, notes: ['scores down'] } })
  assert.equal(a.moves.length, 0,
    'which slots are locked comes from the SCHEDULE, so a missing box score never ' +
    'restores an impossible move')
  const row = a.lineup.find(s => s.player?.sleeperId === '4').player
  assert.equal(row.actualPoints, null, 'and the missing score is reported as missing, not as 0')
  assert.ok(a.notes.some(n => /live score/i.test(n)))
})

// ── NEWS ATTACHMENT ───────────────────────────────────────────────────────

const NEWS = {
  available: true,
  updatedAt: '2026-09-20T14:15:00.000Z',
  ageMinutes: 12,
  staleForKickoff: false,
  items: [{
    headline: 'Hurt Starter: Trending toward Week 3 return',
    story: 'Expected to sit this week but likely to return.',
    source: 'RotoWire', published: '2026-09-20T13:25:00.000Z', link: null,
    playerIds: ['4'], athleteIds: [], isPlayerNews: true,
  }],
}

test('a flagged player carries his injury detail and his latest item', () => {
  const { snapshot, weekly } = improvableSnapshot()
  const a = buildLineupAnswer(snapshot, weekly, { defaultRosterId: 6, myRosterId: 6, news: NEWS })
  assert.ok(a.news, 'the news block is present when the feed loaded')
  assert.equal(a.news.byPlayer['4'].length, 1)
  const text = renderLineupText(a)
  assert.match(text, /STATUS DETAIL/)
  assert.match(text, /Trending toward Week 3 return/,
    'the answer to "why is he out?" belongs in the same response as the advice')
})

test('a healthy player gets no news attached', () => {
  const { snapshot, weekly } = improvableSnapshot()
  const a = buildLineupAnswer(snapshot, weekly, { defaultRosterId: 6, myRosterId: 6, news: NEWS })
  assert.equal(a.news.byPlayer['1'], undefined,
    'attaching a beat report to 24 healthy players would spend the output budget saying nothing')
})

test('a missing news feed is absent, never an error and never "no news"', () => {
  const { snapshot, weekly } = improvableSnapshot()
  const a = buildLineupAnswer(snapshot, weekly, {
    defaultRosterId: 6, myRosterId: 6,
    news: { available: false, items: [] },
  })
  assert.equal(a.ok, true, 'Class B: news has never been allowed to break a panel in the app')
  assert.equal(a.news, null)
  assert.ok(a.notes.some(n => /missing source, not evidence/.test(n)),
    'an outage must not read as a claim that nothing has happened')
})
