// tests/playoffOdds.test.mjs — pins documented behavior of src/utils/playoffOdds.js.
//
// Run via `npm test` (node --import reg.mjs --test tests/). The reg.mjs hook
// resolves src/utils' extensionless relative imports under plain Node.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 14: "fixed-seed RNG (mulberry32 + Box–Muller) so the
//    page never reshuffles its numbers across renders" → two identical calls
//    must be deep-equal.
//  - CLAUDE.md Feature 14: "records who lands in the top playoff_teams" →
//    exactly playoffTeams teams make it each iteration, so Σ playoffPct over
//    all teams === playoffTeams.
//  - CLAUDE.md Feature 14: "accumulates wins + points-for on top of current
//    standings" + "projected final record" → projWins + projLosses ===
//    games already played + remaining games, per team.
//  - CLAUDE.md Feature 14 / Features 2 & 3: getDeadlineVerdict thresholds —
//    "a long-shot opponent (< 35% odds) is flagged 'likely seller', a
//    near-lock (≥ 70%) 'buying win-now'" → Buyer at ≥ 0.70, Seller below
//    0.35, "On the bubble" between; null odds → the offseason "Wait" stance.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { simulatePlayoffs, getDeadlineVerdict, splitCompletedWeeks, buildPlayoffOutlook } from '../src/utils/playoffOdds.js'

// Synthetic 4-team fixture: distinct strengths, 3 remaining weeks, one team
// with a nonzero base record so "on top of current standings" is exercised.
function makeSimArgs() {
  const allRosters = [
    { rosterId: 1, record: { wins: 2, losses: 1, ties: 0 }, pointsFor: 380 },
    { rosterId: 2, record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0 },
    { rosterId: 3, record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0 },
    { rosterId: 4, record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0 },
  ]
  const model = {
    1: { mean: 130, std: 20 },
    2: { mean: 115, std: 20 },
    3: { mean: 110, std: 20 },
    4: { mean: 95, std: 20 },
  }
  const remainingSchedule = [
    { matchups: [[1, 2], [3, 4]] },
    { matchups: [[1, 3], [2, 4]] },
    { matchups: [[1, 4], [2, 3]] },
  ]
  return { allRosters, model, remainingSchedule, playoffTeams: 2, iterations: 10000 }
}

test('fixed-seed determinism: two identical runs are deep-equal (Feature 14: "never reshuffles its numbers")', () => {
  const runA = simulatePlayoffs(makeSimArgs())
  const runB = simulatePlayoffs(makeSimArgs())
  assert.deepEqual(runA, runB)
})

test('Σ playoffPct === playoffTeams: exactly the top playoff_teams make the field each iteration (Feature 14)', () => {
  const results = simulatePlayoffs(makeSimArgs())
  const total = results.reduce((s, r) => s + r.playoffPct, 0)
  assert.ok(Math.abs(total - 2) < 1e-9, `Σ playoffPct was ${total}, expected exactly playoffTeams (2)`)
})

test('projWins + projLosses === games played + remaining, per team (Feature 14: projected final record)', () => {
  const args = makeSimArgs()
  const results = simulatePlayoffs(args)
  for (const r of results) {
    const roster = args.allRosters.find(x => x.rosterId === r.rosterId)
    const basePlayed = roster.record.wins + roster.record.losses + roster.record.ties
    const expectedGames = basePlayed + r.remGames
    assert.ok(
      Math.abs(r.projWins + r.projLosses - expectedGames) < 1e-9,
      `roster ${r.rosterId}: projWins ${r.projWins} + projLosses ${r.projLosses} !== ${expectedGames}`
    )
  }
  // Every team plays all 3 remaining weeks in this fixture.
  results.forEach(r => assert.equal(r.remGames, 3))
})

test('stronger scoring model → higher playoff odds (Feature 14: strength-seeded model)', () => {
  const results = simulatePlayoffs(makeSimArgs())
  const pct = Object.fromEntries(results.map(r => [r.rosterId, r.playoffPct]))
  // Roster 1 has both the best model AND a 2-1 head start; roster 4 has the
  // worst model. Ordering, not exact values, is the pinned behavior.
  assert.ok(pct[1] > pct[4], `expected roster 1 (${pct[1]}) above roster 4 (${pct[4]})`)
})

test('getDeadlineVerdict thresholds: Buyer ≥ 0.70, Seller < 0.35, bubble between (Feature 14 / partner flags in Feature 2)', () => {
  assert.equal(getDeadlineVerdict(0.9, 'Contending').stance, 'Buyer')
  assert.equal(getDeadlineVerdict(0.7, 'Middle').stance, 'Buyer')          // boundary: ≥ 0.70 is Buyer
  assert.equal(getDeadlineVerdict(0.6999, 'Middle').stance, 'On the bubble')
  assert.equal(getDeadlineVerdict(0.35, 'Middle').stance, 'On the bubble') // boundary: 0.35 is NOT yet Seller
  assert.equal(getDeadlineVerdict(0.3499, 'Rebuilding').stance, 'Seller')  // "< 35% odds" → seller
  assert.equal(getDeadlineVerdict(0.1, 'Middle').stance, 'Seller')
})

test('getDeadlineVerdict with null odds → "Wait" (Feature 14: consumers degrade silently in the offseason)', () => {
  assert.equal(getDeadlineVerdict(null, 'Middle').stance, 'Wait')
  assert.equal(getDeadlineVerdict(undefined, 'Contending').stance, 'Wait')
})

// ── splitCompletedWeeks + buildPlayoffOutlook ────────────────────────────
//
// Both were the body of usePlayoffOdds' `processWeeks` and `deriveOdds` and
// were extracted here (2026-09-19) so the MCP server's get_playoff_odds runs
// exactly the model the app runs — the same prerequisite shape as
// getTeamName, buildLeagueState and buildFreeAgentPool. Equivalence to the
// pre-extraction memo body was proved by running the two side by side on
// preseason / active / complete / partially-played / no-schedule inputs at
// two field sizes each, deepStrictEqual on all 20.
//
// Behaviours pinned (with their source):
//  - usePlayoffOdds' own comment: "a week counts as complete only when EVERY
//    team in it has scored — so a partially-played current week is simulated
//    fresh instead of contaminating the model".
//  - CLAUDE.md Feature 14's three page states, and specifically that
//    preseason returns NO results rather than a fabricated percentage.

const WEEK_ROSTERS = [1, 2, 3, 4].map(id => ({
  rosterId: id,
  owner: { user_id: String(id), display_name: `o${id}` },
  record: { wins: 1, losses: 1, ties: 0 },
  pointsFor: 200 + id * 10,
  players: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'DEF'].map((p, i) => ({
    sleeperId: `${id}_${i}`, position: p, value: 1000 + id * 100 + i * 50,
  })),
}))

const wk = (week, played) => ({
  week,
  entries: [1, 2, 3, 4].map((r, i) => ({
    roster_id: r, matchup_id: i < 2 ? 1 : 2, points: played ? 100 + r * 5 : 0,
  })),
})

test('splitCompletedWeeks counts a week only when EVERY team in it has scored', () => {
  const partial = {
    week: 2,
    entries: [
      { roster_id: 1, matchup_id: 1, points: 110 },
      { roster_id: 2, matchup_id: 1, points: 0 }, // still playing
      { roster_id: 3, matchup_id: 2, points: 95 },
      { roster_id: 4, matchup_id: 2, points: 88 },
    ],
  }
  const r = splitCompletedWeeks([wk(1, true), partial])
  assert.equal(r.completedWeeks, 1, 'week 2 is not complete')
  assert.equal(r.completedScores[1].length, 1, 'only week 1 contributed a score')
  assert.equal(r.remainingSchedule.length, 1, 'week 2 goes back into the schedule to be simulated fresh')
  assert.equal(r.remainingSchedule[0].week, 2)
})

test('splitCompletedWeeks ignores a week with no matchup_id — no schedule posted yet', () => {
  const r = splitCompletedWeeks([{ week: 1, entries: [{ roster_id: 1, matchup_id: null, points: 0 }] }])
  assert.equal(r.completedWeeks, 0)
  assert.equal(r.remainingSchedule.length, 0, 'an unpaired entry is not a game')
})

test('splitCompletedWeeks tolerates missing and empty weeks', () => {
  assert.equal(splitCompletedWeeks(null).completedWeeks, 0)
  assert.equal(splitCompletedWeeks([{ week: 1, entries: [] }]).remainingSchedule.length, 0)
})

test('buildPlayoffOutlook: no schedule at all is PRESEASON, with null results', () => {
  const o = buildPlayoffOutlook({
    allRosters: WEEK_ROSTERS,
    perWeek: [1, 2, 3].map(w => ({ week: w, entries: [] })),
    playoffTeams: 2,
  })
  assert.equal(o.status, 'preseason')
  assert.equal(o.results, null, 'nothing to simulate — a percentage here would be invented')
  assert.deepEqual(o.oddsByRoster, {})
  assert.ok(o.strengthPreview.length === 4, 'a strength-ranked preview stands in')
})

test('buildPlayoffOutlook: a posted, unplayed schedule is ACTIVE and produces real odds', () => {
  const o = buildPlayoffOutlook({
    allRosters: WEEK_ROSTERS,
    perWeek: [1, 2, 3].map(w => wk(w, false)),
    playoffTeams: 2,
  })
  assert.equal(o.status, 'active')
  assert.equal(o.completedWeeks, 0)
  assert.equal(o.remainingGames, 6)
  assert.equal(o.strengthPreview, null, 'the real simulation ran, so no preview')
  const total = Object.values(o.oddsByRoster).reduce((s, r) => s + r.playoffPct, 0)
  assert.ok(Math.abs(total - 2) < 0.001, 'Σ odds === the field size')
})

test('buildPlayoffOutlook: every week played is COMPLETE, and deterministic', () => {
  const o = buildPlayoffOutlook({
    allRosters: WEEK_ROSTERS,
    perWeek: [1, 2, 3].map(w => wk(w, true)),
    playoffTeams: 2,
  })
  assert.equal(o.status, 'complete')
  assert.equal(o.remainingGames, 0)
  Object.values(o.oddsByRoster).forEach(r => {
    assert.ok(r.playoffPct === 1 || r.playoffPct === 0, 'no games left means no uncertainty')
  })
})

test('buildPlayoffOutlook is deterministic — the same input gives the same odds', () => {
  const input = { allRosters: WEEK_ROSTERS, perWeek: [1, 2, 3].map(w => wk(w, false)), playoffTeams: 2 }
  assert.deepEqual(buildPlayoffOutlook(input), buildPlayoffOutlook(input))
})

test('buildPlayoffOutlook returns null without rosters rather than an empty answer', () => {
  assert.equal(buildPlayoffOutlook({ allRosters: [], perWeek: [] }), null)
})
