// tests/mcpFindSellHigh.test.mjs — pins find_sell_high (mcp/tools/findSellHigh.js).
//
// Behaviors pinned (with their source):
//  - MCP_DISCOVERY.md §5: the tool's value is that suggestSellMove returns a
//    CONCRETE partner and return, "not just 'shop him'".
//  - CLAUDE.md, the recommendation engine: suggestSellMove's partner pick is
//    TWO-SIDED — a partner holding a real return beats a needier one with
//    nothing to send.
//  - CLAUDE.md Rule #7: unpriced is `value: null` + `unranked: true`, never 0.
//  - MCP_DISCOVERY.md §7 / mcp/README.md rule 1: every response carries the
//    as-of stamp, and conditions surface as `notes`.
//  - CLAUDE.md, Feature 3 Layer 4: whether they would ACCEPT is deliberately
//    not modelled — per-manager profiling was tested and disconfirmed.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSellHighAnswer, renderSellHighText } from '../mcp/tools/findSellHigh.js'
import { makeSnapshot, LEAGUE, MINE } from './helpers/mcpFixtures.mjs'

const build = (over = {}) => buildSellHighAnswer(makeSnapshot(over), { myRosterId: 6 })

// ── the core answer ────────────────────────────────────────────────────────

test('finds the rising player at a surplus position', () => {
  const a = build()
  assert.equal(a.ok, true)
  // Star Quarterback is +800 at QB, where the fixture roster is three deep.
  assert.equal(a.sellHigh.player.name, 'Star Quarterback')
  assert.equal(a.sellHigh.player.position, 'QB')
  assert.ok(a.positions.surpluses.includes('QB'), 'QB must read as a surplus')
  assert.ok(a.positions.deficits.includes('WR'), 'WR must read as a deficit')
})

test('names a CONCRETE partner, not "shop him to someone" (MCP_DISCOVERY §5)', () => {
  const a = build()
  const move = a.sellHigh.move
  assert.ok(move, 'a sell-high candidate must carry a move')
  assert.equal(typeof move.partnerRosterId, 'number')
  assert.ok(move.partnerName.length > 0)
  assert.ok(move.summary.includes(a.sellHigh.player.name))
})

test('the partner pick is two-sided: it names the return that fills my deficit', () => {
  const a = build()
  const move = a.sellHigh.move
  // Mahomes Depot is thin at QB and deep at WR — my deficit. The two-sided
  // rule should surface a WR coming back, not a bare "shop him".
  assert.ok(move.returnPlayer, 'a partner holding a comparable return must produce one')
  assert.equal(move.returnPlayer.position, 'WR')
  assert.equal(move.fillsDeficit, 'WR')
})

test('reports whether the player would actually START for them', () => {
  const a = build()
  // buildValueLineup's test, carried through verbatim — "does this help them"
  // is a lineup question, not a summed-value one.
  assert.equal(typeof a.sellHigh.move.startsForThem, 'boolean')
})

// ── rule 7 ─────────────────────────────────────────────────────────────────

test('an unpriced player is never valued 0 anywhere in the answer', () => {
  const a = build()
  const rows = [
    a.sellHigh?.player, a.buyLow?.player, a.sellHigh?.move?.returnPlayer,
    ...a.alternatives,
  ].filter(Boolean)
  rows.forEach(r => {
    if (r.unranked) assert.equal(r.value, null, `${r.name}: unranked must be null, not 0`)
  })
})

// ── the other two reads ────────────────────────────────────────────────────

test('buy-low is a FALLING player at a deficit position, held by someone else', () => {
  const a = build()
  assert.ok(a.buyLow, 'Good Wideout is -400 at WR, my deficit')
  assert.ok(a.buyLow.player.trend30Day < 0)
  assert.ok(a.positions.deficits.includes(a.buyLow.player.position))
  assert.notEqual(a.buyLow.ownerRosterId, 6, 'never my own player')
})

test('alternatives exclude the headline pick and stay bounded', () => {
  const a = build()
  assert.ok(a.alternatives.length <= 5, 'bounded output (§7)')
  assert.ok(
    !a.alternatives.some(p => p.sleeperId === a.sellHigh.player.sleeperId),
    'the headline candidate must not repeat in the runners-up'
  )
})

test('every alternative genuinely sits at a surplus position', () => {
  const a = build()
  a.alternatives.forEach(p =>
    assert.ok(a.positions.surpluses.includes(p.position),
      `${p.name} (${p.position}) is not at a surplus position`))
})

// ── provenance and honesty ─────────────────────────────────────────────────

test('carries the as-of stamp verbatim (rule 1)', () => {
  const snap = makeSnapshot()
  const a = buildSellHighAnswer(snap, { myRosterId: 6 })
  assert.deepEqual(a.asOf, snap.asOf)
})

test('a stale snapshot says so in notes', () => {
  const base = makeSnapshot()
  const a = build({ asOf: { ...base.asOf, stale: true } })
  assert.ok(a.notes.some(n => /cached data/i.test(n)))
})

test('states that acceptance is NOT modelled', () => {
  const a = build()
  assert.ok(
    a.notes.some(n => /not modelled|disconfirmed/i.test(n)),
    'the copy must say this is roster logic, per the standing ruling'
  )
})

test('states that Sleeper is read-only', () => {
  const a = build()
  assert.ok(a.notes.some(n => /read-only/i.test(n)))
})

// ── degraded states are answers, not gaps ─────────────────────────────────

test('no riser at a surplus position is stated as the answer, not hidden', () => {
  const flat = {
    ...LEAGUE,
    myRoster: { ...MINE, players: MINE.players.map(p => ({ ...p, trend30Day: 0 })) },
  }
  flat.allRosters = [flat.myRoster, ...LEAGUE.allRosters.slice(1)]
  const a = buildSellHighAnswer(makeSnapshot({ league: flat }), { myRosterId: 6 })
  assert.equal(a.sellHigh, null)
  assert.ok(a.notes.some(n => /no sell-high|that is the answer/i.test(n)))
})

test('an identity with no roster in this league returns candidates, never a guess', () => {
  const a = buildSellHighAnswer(
    makeSnapshot({ league: { ...LEAGUE, myRoster: null } }), { myRosterId: 99 }
  )
  assert.equal(a.ok, false)
  assert.equal(a.candidates.length, 3)
  assert.ok(a.candidates.every(c => typeof c.rosterId === 'number'))
})

// ── the text rendering ─────────────────────────────────────────────────────

test('the text rendering leads with the as-of stamp and names the move', () => {
  const txt = renderSellHighText(build())
  assert.ok(txt.includes('As of'))
  assert.ok(txt.includes('SELL HIGH'))
  assert.ok(txt.includes('Star Quarterback'))
})

test('the text rendering of a failure lists the candidates', () => {
  const a = buildSellHighAnswer(
    makeSnapshot({ league: { ...LEAGUE, myRoster: null } }), { myRosterId: 99 }
  )
  const txt = renderSellHighText(a)
  assert.ok(txt.includes('Nix Cage'))
})
