// tests/mcpFindTradeTargets.test.mjs — pins tool #9, find_trade_targets.
//
// Behaviours pinned (with their doc source):
//  - CLAUDE.md The MCP Server, non-negotiable 2: BOUNDED OUTPUT — cap the
//    list, report the true count beside the capped one, disclose the
//    truncation in `notes`.
//  - CLAUDE.md Feature 3 (Targets has two modes): "The filter must push into
//    the ranking, not sit on top of it" — the ranking slices to a limit before
//    anything downstream sees it, so a filter applied to the slice answers a
//    different question and can come back empty when the real answer is not.
//  - MCP_DISCOVERY.md §1 / CLAUDE.md get_roster: it NEVER guesses which team
//    you meant; an ambiguous name returns candidates and refuses.
//  - failure-archaeology §4e-iv (extended by OPEN-10): a surface that hands a
//    trade to the Analyzer must propose something the Analyzer calls fair —
//    and when nothing can, say so rather than imply agreement.
//  - The two DJ Moores, applied to picks: two picks sharing a label resolve to
//    NOTHING rather than to the first match.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTradeTargetsAnswer, renderTradeTargetsText, DEFAULT_LIMIT, MAX_LIMIT }
  from '../mcp/tools/findTradeTargets.js'
import { makeSnapshot, LEAGUE, MINE, THEIRS, OTHER, roster, player, USER }
  from './helpers/mcpFixtures.mjs'

const snap = over => makeSnapshot(over)

test('the board is bounded, and the true count rides beside the capped one', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: 2 })
  assert.equal(a.ok, true)
  assert.equal(a.targets.length, 2)
  assert.equal(a.counts.returned, 2)
  assert.ok(a.counts.board > 2, 'counts.board is the ranked board, not an echo of the cap')
  assert.equal(a.counts.truncated, true)
  assert.ok(a.notes.some(n => /Showing the top 2 of \d+/.test(n)),
    'non-negotiable 2: the truncation is DISCLOSED, never silent')
})

test('the limit is clamped to the board depth, so this tool can never out-run Trade > Targets', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: 999 })
  assert.ok(a.targets.length <= MAX_LIMIT)
  const dflt = buildTradeTargetsAnswer(snap(), { myRosterId: 6 })
  assert.ok(dflt.targets.length <= DEFAULT_LIMIT)
})

test('the position filter pushes INTO the ranking, not onto the returned slice', () => {
  // Scoped to one opponent, the top-ranked target is a WR (my only deficit).
  const top = buildTradeTargetsAnswer(snap(), { myRosterId: 6, team: 'Mahomes Depot', limit: 1 })
  assert.equal(top.targets[0].player.position, 'WR')

  // Their RB is a DEPTH piece, ranked below every WR — so filtering the
  // already-sliced top-1 would return nothing at all. Pushed into the ranking
  // it returns the answer the question actually asked for.
  const rb = buildTradeTargetsAnswer(snap(), {
    myRosterId: 6, team: 'Mahomes Depot', position: 'RB', limit: 1,
  })
  assert.equal(rb.targets.length, 1, 'an empty answer here would be "not in your top 1", not "nobody"')
  assert.equal(rb.targets[0].player.position, 'RB')
  assert.equal(rb.filter.position, 'RB')
})

test('a position with no dynasty market is refused with the reason, not answered with zero rows', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, position: 'DEF' })
  assert.equal(a.ok, false)
  assert.match(a.error, /defense/i)
  assert.equal(a.targets, undefined)
})

test('it never guesses which team you meant', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, team: 'nobody by that name' })
  assert.equal(a.ok, false)
  assert.ok(a.candidates.length >= 3, 'the candidate list is the answer, not a guess')
  assert.ok(a.candidates.every(c => typeof c.teamName === 'string' && c.username !== undefined))
})

test('scouting your own roster is refused — a trade target is on someone else\'s team', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, team: 'Nix Cage' })
  assert.equal(a.ok, false)
  assert.match(a.error, /your own roster/i)
})

test('scoped mode keeps their depth pieces and SAYS which rows fill a need', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, team: 'Mahomes Depot', limit: MAX_LIMIT })
  assert.equal(a.mode, 'scoped')
  assert.equal(a.scopedTo.rosterId, 3)
  assert.ok(a.targets.some(t => !t.fillsNeed),
    'an explicitly chosen team must never render empty just because they hold nobody at a deficit position')
  assert.ok(a.notes.some(n => /Scouting one roster/.test(n)))
  assert.ok(a.targets.every(t => t.owner.rosterId === 3))
})

test('every priced row carries BOTH seats and the fair-band verdict on the package', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: MAX_LIMIT })
  const priced = a.targets.filter(t => t.package)
  assert.ok(priced.length > 0)
  priced.forEach(t => {
    assert.ok(['Strong', 'Fair', 'Weak'].includes(t.package.you.appeal), 'my seat is graded')
    assert.ok(['Strong', 'Fair', 'Weak'].includes(t.package.them.appeal), 'their seat is graded')
    assert.equal(typeof t.package.inFairBand, 'boolean')
  })
})

test('a package that cannot reach the fair band says so rather than implying the Analyzer will agree', () => {
  // The cheapest target on this board (1,500) is below the smallest package my
  // movable assets can assemble, so the honest answer is a near-miss.
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: MAX_LIMIT })
  const miss = a.targets.find(t => t.package && !t.package.inFairBand)
  assert.ok(miss, 'fixture precondition: one target is a near-miss')
  assert.ok(a.counts.inFairBand < a.counts.priced)
  assert.match(renderTradeTargetsText(a), /the fair band/)
})

test('`alternative` names the premium that would buy a yes', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: MAX_LIMIT })
  const withAlt = a.targets.find(t => t.package?.alternative)
  assert.ok(withAlt, 'fixture precondition: at least one row has a pricier road not taken')
  const alt = withAlt.package.alternative
  assert.equal(typeof alt.premiumPct, 'number')
  assert.ok(alt.assets.length > 0)
  assert.ok(['Strong', 'Fair', 'Weak'].includes(alt.appeal))
})

test('a package asset carries the id analyze_trade accepts, so the handoff is one call', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: MAX_LIMIT })
  const assets = a.targets.flatMap(t => t.package?.assets ?? [])
  assert.ok(assets.length > 0)
  assets.filter(x => x.type === 'player').forEach(x => {
    assert.match(x.id, /^\d+$/, 'a player id is the numeric Sleeper id')
  })
  assets.filter(x => x.type === 'pick').forEach(x => {
    assert.match(x.id, /^20\d{2}-\d-\d+$/, 'a pick id is SEASON-ROUND-ORIGINALOWNER')
  })
  assert.ok(a.notes.some(n => /analyze_trade/.test(n)), 'and the response says where to take them')
})

test('two picks sharing a label resolve to NOTHING, never to the first match', () => {
  // The same collision the news layer refuses to name-match around (two DJ
  // Moores), in the one place a package asset can hit it: `suggestFairPackage`
  // labels a pick "2027 2nd" and drops the original owner, so a roster holding
  // two of them has no unambiguous reverse lookup.
  const twinPicks = roster(6, USER('u6', 'NIX CAGE', 'chnates'), MINE.players, [
    { season: '2027', round: 2, originalOwner: 6, slot: null, slotLabel: null, value: 900 },
    { season: '2027', round: 2, originalOwner: 3, slot: null, slotLabel: null, value: 900 },
  ])
  const league = { ...LEAGUE, myRoster: twinPicks, allRosters: [twinPicks, THEIRS, OTHER] }
  const a = buildTradeTargetsAnswer(snap({ league }), { myRosterId: 6, limit: MAX_LIMIT })

  const picks = a.targets.flatMap(t => t.package?.assets ?? []).filter(x => x.type === 'pick')
  assert.ok(picks.length > 0, 'fixture precondition: a package reaches for one of the twins')
  picks.forEach(x => {
    assert.equal(x.id, null, 'refusing beats guessing — the app\'s own `.find` takes the first silently')
    assert.equal(x.ambiguous, true)
  })
  assert.ok(a.notes.some(n => /resolve_assets/.test(n)),
    'and it points at the tool whose whole job is disambiguating')
})

test('no roster of mine in this league is an answer, with the teams that ARE here', () => {
  const league = { ...LEAGUE, myRoster: null }
  const a = buildTradeTargetsAnswer(snap({ league }), { myRosterId: 99 })
  assert.equal(a.ok, false)
  assert.equal(a.candidates.length, 3)
})

test('an empty board explains itself instead of returning a bare empty list', () => {
  // A roster that is at or above league average everywhere has no deficit, so
  // the league-wide board is empty BY THE RULE, not by a data gap.
  const strong = roster(6, USER('u6', 'NIX CAGE', 'chnates'), [
    player({ id: '1', name: 'Star Quarterback', pos: 'QB', value: 9000, starter: true }),
    player({ id: '4', name: 'Star Wideout', pos: 'WR', value: 9000, starter: true }),
    player({ id: '5', name: 'Star Runner', pos: 'RB', value: 9000, starter: true }),
    player({ id: '6', name: 'Star Tight End', pos: 'TE', value: 9000, starter: true }),
  ], MINE.picks)
  const league = { ...LEAGUE, myRoster: strong, allRosters: [strong, THEIRS, OTHER] }
  const a = buildTradeTargetsAnswer(snap({ league }), { myRosterId: 6 })
  assert.equal(a.ok, true)
  assert.equal(a.targets.length, 0)
  assert.ok(a.notes.some(n => /deficit/.test(n)), 'the empty board states WHY it is empty')
})

test('a stale snapshot is disclosed, and the text renders the age either way', () => {
  const base = makeSnapshot()
  const stale = makeSnapshot({
    asOf: { ...base.asOf, stale: true, sources: { ...base.asOf.sources } },
  })
  const a = buildTradeTargetsAnswer(stale, { myRosterId: 6, limit: 2 })
  assert.ok(a.notes.some(n => /cached data/.test(n)))
  assert.match(renderTradeTargetsText(a), /STALE/)
  assert.match(renderTradeTargetsText(buildTradeTargetsAnswer(base, { myRosterId: 6, limit: 2 })), /As of /)
})

test('the tool does not grade, and says so — a verdict is analyze_trade\'s job', () => {
  const a = buildTradeTargetsAnswer(snap(), { myRosterId: 6, limit: 2 })
  a.targets.forEach(t => {
    assert.equal(t.package?.verdict, undefined, 'no verdict is invented here')
  })
  assert.ok(a.notes.some(n => /this tool does not grade/.test(n)))
})
