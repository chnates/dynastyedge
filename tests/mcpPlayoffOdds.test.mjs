// tests/mcpPlayoffOdds.test.mjs — pins mcp/tools/playoffOdds.js, tool #7.
//
// Behaviours pinned (with their source):
//  - CLAUDE.md, Feature 14 / the weekly-tools contract: the preseason has
//    NOTHING to simulate, so the answer is a NULL percentage plus a labelled
//    strength PREVIEW — never a fabricated number, and never 0 (which reads
//    as "eliminated").
//  - mcp/season.js's header: a total fetch failure is NOT a preseason. The
//    two shapes are identical on the wire and only `reason` tells them apart.
//  - MCP_DISCOVERY.md §7 non-negotiable 2: bounded output. The per-seed
//    distribution (n² numbers) is computed and deliberately not returned.
//  - CLAUDE.md, Feature 14: getDeadlineVerdict is the ONE definition of
//    buyer/seller, so this tool cannot disagree with a trade grade.
//  - playoffOdds.js: the simulation is fixed-seed, so two calls on the same
//    data give the same numbers.
//  - MCP_DISCOVERY.md §1: an ambiguous team resolves to NOTHING.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildOddsAnswer, renderOddsText, MAX_TEAMS } from '../mcp/tools/playoffOdds.js'
import { getDeadlineVerdict } from '../src/utils/playoffOdds.js'
import { makeSnapshot, makeSeason, makeUnavailableSeason } from './helpers/mcpFixtures.mjs'

const OPTS = { defaultRosterId: 6, myRosterId: 6 }

// ── the three states ─────────────────────────────────────────────────────

test('an active season returns real odds for every team', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  assert.equal(a.ok, true)
  assert.equal(a.status, 'active')
  assert.equal(a.teams.length, 3)
  assert.ok(typeof a.you.playoffPct === 'number')
  a.teams.forEach(t => {
    assert.ok(t.playoffPct >= 0 && t.playoffPct <= 100, 'a percentage, 0-100')
  })
})

test('the field is ranked by playoff odds, best first', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  const pcts = a.teams.map(t => t.playoffPct)
  assert.deepEqual(pcts, pcts.slice().sort((x, y) => y - x))
})

test('odds sum to the number of playoff spots — the simulation is coherent', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  const total = a.teams.reduce((s, t) => s + t.playoffPct, 0)
  assert.ok(
    Math.abs(total - a.league.playoffTeams * 100) < 0.5,
    `every simulated season seats exactly ${a.league.playoffTeams} teams, so the odds must sum to that (got ${total})`
  )
})

test('a completed season is stated as outcomes, not odds', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 3 }), OPTS)
  assert.equal(a.status, 'complete')
  assert.equal(a.basis.remainingGames, 0)
  a.teams.forEach(t => assert.ok(t.playoffPct === 100 || t.playoffPct === 0, 'deterministic'))
  assert.ok(a.notes.some(n => /outcomes rather than odds/i.test(n)))
})

// ── THE contract: the preseason invents nothing ──────────────────────────

test('the preseason returns a NULL percentage, never a number and never 0', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 0, posted: false }), OPTS)
  assert.equal(a.ok, true)
  assert.equal(a.status, 'preseason')
  assert.equal(a.you.playoffPct, null, 'null — a 0 would read as "eliminated"')
  assert.equal(a.you.avgSeed, null)
  assert.equal(a.you.projWins, null)
  assert.deepEqual(a.teams, [], 'there is no field to rank')
})

test('the preseason offers a strength PREVIEW and labels it one', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 0, posted: false }), OPTS)
  assert.equal(a.strengthPreview.length, 3)
  assert.deepEqual(a.strengthPreview.map(p => p.projSeed), [1, 2, 3])
  assert.equal(a.strengthPreview.filter(p => p.projectedIn).length, 2, 'the top 2 of a 2-team field')
  assert.ok(
    a.notes.some(n => /PREVIEW, not odds/i.test(n)),
    'the reader must be told this is a ranking, not a simulation'
  )
  assert.equal(a.basis.iterations, 0, 'nothing was simulated, and the basis says so')
})

test('the strength preview is absent outside the preseason — the real sim ran', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  assert.equal(a.strengthPreview, null)
})

test('a POSTED schedule with nothing played yet is active, not preseason', () => {
  // Week 1. The model simulates all of it off the roster-strength prior, which
  // is what makes this feature useful before any game is played. Reporting it
  // as a preseason would replace real odds with a strength ranking.
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 0, posted: true }), OPTS)
  assert.equal(a.status, 'active')
  assert.equal(a.basis.completedWeeks, 0)
  assert.equal(a.basis.remainingGames, 3)
  assert.ok(typeof a.you.playoffPct === 'number', 'a real percentage off the prior alone')
  assert.equal(a.strengthPreview, null)
})

// ── THE other contract: an outage is not a preseason ─────────────────────

test('a total matchup failure is ok:false with reason unavailable, NOT a preseason', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeUnavailableSeason(), OPTS)
  assert.equal(a.ok, false)
  assert.equal(a.unavailable, true)
  assert.equal(a.reason, 'unavailable')
  assert.equal(a.status, undefined, 'it must not claim one of the three season states')
  assert.equal(a.strengthPreview, undefined, 'and must not offer a preview off data it does not have')
})

test('unavailable and preseason are distinguishable without reading prose', () => {
  const out = buildOddsAnswer(makeSnapshot(), makeUnavailableSeason(), OPTS)
  const pre = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 0, posted: false }), OPTS)
  assert.notEqual(out.ok, pre.ok)
  assert.equal(pre.status, 'preseason')
  assert.equal(out.reason, 'unavailable')
})

// ── one definition of buyer/seller ───────────────────────────────────────

test('the stance is getDeadlineVerdict\'s, so a trade grade cannot disagree', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  const expected = getDeadlineVerdict(a.you.playoffPct / 100, a.you.winWindow)
  assert.equal(a.you.stance, expected.stance)
  assert.equal(a.you.stanceText, expected.text)
})

test('the preseason stance is Wait, not a guess', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 0, posted: false }), OPTS)
  assert.equal(a.you.stance, 'Wait')
})

// ── bounded output ───────────────────────────────────────────────────────

test('the per-seed distribution is NOT returned, and the notes say it was dropped', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  a.teams.forEach(t => assert.equal(t.seedDist, undefined))
  assert.equal(a.you.seedDist, undefined)
  assert.ok(
    a.notes.some(n => /distribution is computed but not returned/i.test(n)),
    'absence must not read as "the model does not compute it"'
  )
})

test('the team list is capped and the true count is reported beside it', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  assert.ok(a.teams.length <= MAX_TEAMS)
  assert.equal(a.league.teamCount, 3, 'the true roster count, whatever the cap did')
})

test('the response stays small', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  assert.ok(JSON.stringify(a).length < 12000, 'bounded — never a raw payload')
})

// ── determinism ──────────────────────────────────────────────────────────

test('two calls on the same data give byte-identical odds (fixed seed)', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  const b = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  assert.deepEqual(a.teams, b.teams, 'the page must never reshuffle its numbers')
})

// ── provenance and team resolution ───────────────────────────────────────

test('the as-of stamp rides along', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS)
  assert.ok(a.asOf.oldestSourceAt)
  assert.equal(typeof a.asOf.stale, 'boolean')
})

test('an ambiguous team resolves to NOTHING, with candidates', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), { ...OPTS, team: 'nobody' })
  assert.equal(a.ok, false)
  assert.ok(a.error)
  assert.ok(Array.isArray(a.candidates))
})

test('another team can be scouted — "you" is a parameter, not a constant', () => {
  const a = buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), { ...OPTS, team: '3' })
  assert.equal(a.ok, true)
  assert.equal(a.you.rosterId, 3)
  assert.equal(a.teams.find(t => t.rosterId === 6).isYou, true, 'isYou still marks the configured identity')
})

// ── the text rendering ───────────────────────────────────────────────────

test('the text answer leads with the percentage, and the preseason does not print one', () => {
  const active = renderOddsText(buildOddsAnswer(makeSnapshot(), makeSeason({ played: 2 }), OPTS))
  assert.match(active, /to make the playoffs/)
  const pre = renderOddsText(buildOddsAnswer(makeSnapshot(), makeSeason({ played: 0, posted: false }), OPTS))
  assert.match(pre, /no odds yet/)
  assert.match(pre, /a preview, not odds/i)
  assert.doesNotMatch(pre, /to make the playoffs/)
})

test('an unavailable season renders its explanation, not an empty board', () => {
  const t = renderOddsText(buildOddsAnswer(makeSnapshot(), makeUnavailableSeason(), OPTS))
  assert.match(t, /NOT a preseason/i)
})
