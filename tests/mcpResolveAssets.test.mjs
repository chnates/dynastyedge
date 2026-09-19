// tests/mcpResolveAssets.test.mjs — pins resolve_assets.
//
// Behaviors pinned (with their source):
//  - MCP_DISCOVERY.md §1, the decision this tool exists to serve:
//    "resolve_assets first, then grade on IDs only — costs a round-trip;
//     makes grading the wrong player structurally impossible."
//    The load-bearing half is that an ambiguous name resolves to NOTHING.
//  - CLAUDE.md Rule #7: an unranked player is still findable, valued null.
//  - MCP_DISCOVERY.md §7: bounded output with the true count.
//  - CLAUDE.md Feature 13 / TradeAnalyzer.jsx:38: a pick's id is
//    `season-round-originalOwner`, so an id resolved here round-trips into
//    analyze_trade.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildResolveAnswer, renderResolveText, MAX_CANDIDATES_PER_QUERY, MAX_QUERIES,
} from '../mcp/tools/resolveAssets.js'
import { makeSnapshot } from './helpers/mcpFixtures.mjs'

const resolve = (names, opts = {}) =>
  buildResolveAnswer(makeSnapshot(), { names, ...opts })
const one = (name, opts) => resolve([name], opts).results[0]

// ── the rule: never guess ─────────────────────────────────────────────────

test('a unique name resolves to exactly one match', () => {
  const r = one('Star Quarterback')
  assert.ok(r.match)
  assert.equal(r.match.sleeperId, '1')
  assert.equal(r.match.position, 'QB')
})

test('an AMBIGUOUS name resolves to NOTHING and returns the candidates', () => {
  const r = one('Brown')
  // This is the whole point of the tool. A model handed two Browns must not
  // be able to pick one; it has to come back and ask.
  assert.equal(r.match, null, 'match MUST be null when more than one asset matches')
  assert.ok(r.candidates.length >= 2)
  assert.match(r.reason, /matches 2|pass the sleeperId/i)
})

test('it never silently prefers the more valuable of two matches', () => {
  const r = one('Brown')
  assert.equal(r.match, null)
  // Ordering candidates by value is a display convenience; it must not
  // become a tiebreak that resolves the query.
  assert.ok(r.candidates[0].value >= r.candidates[1].value, 'sorted by value')
})

test('an unmatched name returns no match and no candidates', () => {
  const r = one('Nobody At All')
  assert.equal(r.match, null)
  assert.equal(r.candidates.length, 0)
  assert.match(r.reason, /no player matching/i)
})

test('the notes tell the caller what to do about an ambiguous name', () => {
  const a = resolve(['Brown'])
  assert.ok(a.notes.some(n => /never guesses/i.test(n)))
  assert.equal(a.counts.ambiguous, 1)
  assert.equal(a.counts.resolved, 0)
})

// ── normalization: find the player, still don't guess between two ─────────

test('case, punctuation and suffixes fold', () => {
  assert.ok(one('star quarterback').match, 'case')
  assert.ok(one('  Star Quarterback  ').match, 'whitespace')
})

test('a surname alone resolves when it is unique', () => {
  const r = one('Wideout')
  // Three "… Wideout" players exist on the fixture, so this must NOT resolve.
  assert.equal(r.match, null)
  assert.ok(r.candidates.length >= 3)
})

test('a word-boundary match outranks a mid-word substring', () => {
  const r = one('Elite')
  assert.ok(r.match)
  assert.equal(r.match.name, 'Elite Wideout')
})

test('a too-short query is refused rather than matching everything', () => {
  const r = one('a')
  assert.equal(r.match, null)
  assert.equal(r.candidates.length, 0)
  assert.match(r.reason, /too short/i)
})

// ── ids round-trip ────────────────────────────────────────────────────────

test('a bare numeric id echoes back its facts', () => {
  const r = one('1')
  assert.ok(r.match)
  assert.equal(r.match.sleeperId, '1')
  assert.match(r.reason, /exact sleeper id/i)
})

test('an unknown numeric id is reported, not guessed at', () => {
  const r = one('999999')
  assert.equal(r.match, null)
  assert.match(r.reason, /no player with sleeper id/i)
})

// ── picks ─────────────────────────────────────────────────────────────────

test('a pick query parses and returns every team that owns one', () => {
  const r = one('2027 1st')
  assert.equal(r.kind, 'pick')
  assert.deepEqual(r.parsed, { season: '2027', round: 1, slot: null })
  // Three rosters hold a 2027 1st in the fixture — ambiguous by three.
  assert.equal(r.match, null)
  assert.equal(r.candidates.length, 3)
})

test('a pick id is exactly the form analyze_trade accepts', () => {
  const r = one('2027 1st')
  r.candidates.forEach(c =>
    assert.match(c.id, /^20\d{2}-\d-\d+$/, 'season-round-originalOwner'))
})

test('an exact slot resolves to the one pick that carries it', () => {
  const r = one('2027 2.09')
  assert.ok(r.match, 'only roster 6 holds the 2.09')
  assert.equal(r.match.slotLabel, '2.09')
  assert.equal(r.match.pricing, 'exact-slot')
})

test('word forms of a round parse too', () => {
  assert.equal(one('2027 first').parsed.round, 1)
  assert.equal(one('2027 round 2').parsed.round, 2)
})

test('a pick nobody owns says so rather than inventing an owner', () => {
  const r = one('2029 3rd')
  assert.equal(r.match, null)
  assert.equal(r.candidates.length, 0)
  assert.match(r.reason, /no team in this league owns/i)
})

test('a pick carries its market price even when unowned', () => {
  const r = one('2028 1st')
  assert.equal(r.marketValue, 1800)
})

// ── rule 7 ────────────────────────────────────────────────────────────────

test('an unranked rostered player is findable and valued null, never 0', () => {
  const r = one('Deep Stash')
  assert.ok(r.match, 'rule 7: never silently dropped')
  assert.equal(r.match.value, null)
  assert.equal(r.match.unranked, true)
})

test('a defense is findable by name (search is not the pickup pool)', () => {
  const r = one('Kansas City')
  assert.ok(r.match)
  assert.equal(r.match.position, 'DEF')
  assert.equal(r.match.value, null)
})

// ── ownership ─────────────────────────────────────────────────────────────

test('every candidate says who owns it', () => {
  const r = one('Star Quarterback')
  assert.equal(r.match.ownerRosterId, 6)
  assert.equal(r.match.ownerTeam, 'Nix Cage')
  assert.equal(r.match.isFreeAgent, false)
})

test('free agents are included by default and flagged', () => {
  const r = one('Available Wideout')
  assert.ok(r.match)
  assert.equal(r.match.isFreeAgent, true)
  assert.equal(r.match.ownerRosterId, null)
})

test('includeFreeAgents false restricts the search to rostered players', () => {
  const r = one('Available Wideout', { includeFreeAgents: false })
  assert.equal(r.match, null)
  assert.equal(r.candidates.length, 0)
})

// ── bounds and provenance ─────────────────────────────────────────────────

test('queries beyond MAX_QUERIES are dropped and disclosed', () => {
  const many = Array.from({ length: MAX_QUERIES + 5 }, (_, i) => `q${i}`)
  const a = resolve(many)
  assert.equal(a.results.length, MAX_QUERIES)
  assert.ok(a.notes.some(n => new RegExp(`first ${MAX_QUERIES}`).test(n)))
})

test('candidates per query are capped with the true count reported', () => {
  const r = one('Wideout')
  assert.ok(r.candidates.length <= MAX_CANDIDATES_PER_QUERY)
  assert.equal(typeof r.totalCandidates, 'number')
})

test('an empty name list is an error, not an empty success', () => {
  const a = buildResolveAnswer(makeSnapshot(), { names: [] })
  assert.equal(a.ok, false)
})

test('carries the as-of stamp and points at analyze_trade', () => {
  const a = resolve(['Star Quarterback'])
  assert.ok(a.asOf.generatedAt)
  assert.ok(a.notes.some(n => /analyze_trade/.test(n)))
})

test('the text rendering shows ids, values and owners', () => {
  const txt = renderResolveText(resolve(['Star Quarterback', 'Brown']))
  assert.ok(txt.includes('As of'))
  assert.ok(txt.includes('Star Quarterback'))
  assert.ok(txt.includes('Nix Cage'))
})
