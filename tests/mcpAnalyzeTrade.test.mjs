// tests/mcpAnalyzeTrade.test.mjs — pins analyze_trade.
//
// Behaviors pinned (with their source):
//  - MCP_DISCOVERY.md §1: "resolve_assets first, then grade on IDs only …
//    makes grading the wrong player structurally impossible." A free-text
//    name must be REJECTED, never guessed at. This is the single most
//    important assertion in this file.
//  - MCP_DISCOVERY.md §5: mirror TradeAnalyzer.jsx:141-256 — surface the
//    verdict, reasoning, value split, BOTH seats' appeal, landing spots,
//    fair band, counter suggestion and pitch.
//  - CLAUDE.md Feature 3: the verdict renders only once BOTH sides carry an
//    asset; myFit is DISPLAY ONLY; `windowBasis` names which basis scored
//    Layer 3.
//  - CLAUDE.md Rule #7: an unpriced player counts 0 but reports null.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTradeAnswer, renderTradeText, MAX_ASSETS_PER_SIDE } from '../mcp/tools/analyzeTrade.js'
import { makeSnapshot, makeWeekly, makeOffseasonWeekly, LEAGUE } from './helpers/mcpFixtures.mjs'

const grade = (args, weekly = makeWeekly(), snapOver = {}) =>
  buildTradeAnswer(makeSnapshot(snapOver), weekly, { myRosterId: 6, ...args })

// My QB2 for their WR2 — a real swap in both directions on this fixture.
const FAIR = { give: ['2'], get: ['21'], partner: 'Mahomes Depot' }

// ── IDS ONLY — the contract this tool exists for ──────────────────────────

test('a free-text player name is REJECTED, never guessed at', () => {
  const a = grade({ ...FAIR, give: ['Second Quarterback'] })
  assert.equal(a.ok, false)
  assert.match(a.error, /IDS ONLY/)
  assert.match(a.error, /resolve_assets/, 'the error must point at the fix')
})

test('the rejection explains WHY, so the round-trip reads as a feature', () => {
  const a = grade({ ...FAIR, get: ['Good Wideout'] })
  assert.match(a.error, /grading the wrong player/i)
})

test('a name that happens to be unique is still rejected — no shortcut', () => {
  // "Star Quarterback" is unambiguous, and that must not matter: the tool
  // does not do name matching at all.
  const a = grade({ ...FAIR, give: ['Star Quarterback'] })
  assert.equal(a.ok, false)
  assert.match(a.error, /IDS ONLY/)
})

test('an id on the WRONG roster is rejected rather than silently priced', () => {
  // 21 is theirs; putting him on the give side is a caller error.
  const a = grade({ give: ['21'], get: ['2'], partner: 'Mahomes Depot' })
  assert.equal(a.ok, false)
  assert.match(a.error, /not on .* roster/i)
})

test('a valid pick id resolves from the owning roster', () => {
  const a = grade({ give: ['2027-1-6'], get: ['21'], partner: 'Mahomes Depot' })
  assert.equal(a.ok, true)
  assert.equal(a.sides.give[0].type, 'pick')
  assert.equal(a.sides.give[0].id, '2027-1-6')
})

test('a malformed pick id is rejected with the expected form', () => {
  const a = grade({ give: ['2027 1st'], get: ['21'], partner: 'Mahomes Depot' })
  assert.equal(a.ok, false)
  assert.match(a.error, /SEASON-ROUND-ORIGINALOWNERROSTERID/)
})

test('the caller cannot supply a value — the price comes from the roster', () => {
  const a = grade(FAIR)
  // Second Quarterback is 5000 on the fixture roster, whatever a caller says.
  assert.equal(a.sides.give[0].value, 5000)
})

test('a repeated id counts once, not twice', () => {
  const a = grade({ ...FAIR, give: ['2', '2'] })
  assert.equal(a.sides.give.length, 1)
})

test('an over-long side is rejected', () => {
  const many = Array.from({ length: MAX_ASSETS_PER_SIDE + 1 }, () => '2')
  const a = grade({ ...FAIR, give: many })
  assert.equal(a.ok, false)
  assert.match(a.error, /cap is/i)
})

// ── partner resolution, same discipline ──────────────────────────────────

test('an unknown partner returns candidates, never a guess', () => {
  const a = grade({ ...FAIR, partner: 'Nobody' })
  assert.equal(a.ok, false)
  assert.equal(a.candidates.length, 3)
})

test('trading with yourself is refused', () => {
  const a = grade({ ...FAIR, partner: '6' })
  assert.equal(a.ok, false)
  assert.match(a.error, /your own team/i)
})

test('a partner resolves by roster id as well as by name', () => {
  assert.equal(grade({ ...FAIR, partner: '3' }).sides.them.rosterId, 3)
  assert.equal(grade({ ...FAIR, partner: 'depot' }).sides.them.rosterId, 3,
    'display_name is the manager handle Sleeper actually returns')
})

// ── the analysis surface (MCP_DISCOVERY §5) ──────────────────────────────

test('surfaces the verdict with its reasoning', () => {
  const a = grade(FAIR)
  assert.ok(a.verdict)
  assert.ok(['Accept', 'Decline', 'Counter'].includes(a.verdict.verdict))
  assert.ok(typeof a.verdict.reasoning === 'string' && a.verdict.reasoning.length > 0)
})

test('surfaces the raw value split', () => {
  const a = grade(FAIR)
  assert.equal(a.value.giveTotal, 5000)
  assert.equal(a.value.getTotal, 4500)
  assert.ok(['you', 'them', 'even'].includes(a.value.winner))
})

test('surfaces BOTH seats — this is the one-engine-both-seats contract', () => {
  const a = grade(FAIR)
  ;[a.forYou, a.forThem].forEach(fit => {
    assert.ok(fit.appeal, 'each seat carries a graded appeal')
    assert.ok(Array.isArray(fit.reasons))
    assert.ok(Array.isArray(fit.concerns))
  })
})

test('concerns are a SUBSET of reasons (buildSideFit pushes to both)', () => {
  const a = grade(FAIR)
  ;[a.forYou, a.forThem].forEach(fit => {
    fit.concerns.forEach(c =>
      assert.ok(fit.reasons.includes(c), 'a concern is a reason marked against'))
  })
})

test('surfaces landing spots on both sides', () => {
  const a = grade(FAIR)
  assert.ok(a.forYou.landingSpots.length > 0)
  assert.ok(a.forThem.landingSpots.length > 0)
  const sp = a.forThem.landingSpots[0]
  assert.equal(typeof sp.starts, 'boolean', 'a landing spot says whether he starts')
})

test('surfaces the fair band using buildFairBand\'s own field names', () => {
  const a = grade(FAIR)
  assert.ok(a.fairBand)
  assert.equal(typeof a.fairBand.inside, 'boolean')
  assert.equal(typeof a.fairBand.gapToBand, 'number')
  assert.ok(a.fairBand.low <= a.fairBand.high)
})

test('surfaces the pitch as text plus the bullets it is built from', () => {
  const a = grade(FAIR)
  assert.ok(a.pitch)
  assert.equal(typeof a.pitch.text, 'string')
  assert.ok(Array.isArray(a.pitch.bullets))
  assert.ok(a.pitch.text.includes('Mahomes Depot'), 'the pitch is addressed to them')
})

test('a counter is surfaced only when the verdict is Counter', () => {
  const a = grade(FAIR)
  if (a.verdict.verdict === 'Counter') assert.ok(a.counter, 'a Counter must name what fixes it')
  else assert.equal(a.counter, null)
})

// ── Layer 3's basis is NAMED, not assumed ────────────────────────────────

// Layer 3 is scored on LIVE playoff odds when the server could run the
// rest-of-season simulation, and on the win-window TIER when it could not.
// The tier tracks the starting lineup at Spearman 0.721 against odds' 0.988,
// so which one ran is a real difference in the strength of the answer — and
// `windowBasis` exists precisely so a reader never has to assume the stronger
// one did.

test('windowBasis says "odds" when live playoff odds are passed', () => {
  const a = grade({ ...FAIR, myPlayoffPct: 0.82 })
  assert.equal(a.winWindow.basis, 'odds')
  assert.match(a.winWindow.note, /82% playoff odds/, 'the note quotes the number that scored it')
})

test('windowBasis falls back to "tier" when no odds are available', () => {
  const a = grade(FAIR)
  assert.equal(a.winWindow.basis, 'tier')
})

test('the odds basis and the tier basis can score the SAME trade differently', () => {
  // The point of the wiring. The tier has no `Middle` branch at all, so a
  // mid-table team takes no lean and scores a flat 0; odds give it a real
  // buyer or seller stance. Live, windowScore was 0 on 20 of 20 suggested
  // trades under the tier.
  const buyer = grade({ ...FAIR, myPlayoffPct: 0.9 })
  const seller = grade({ ...FAIR, myPlayoffPct: 0.1 })
  assert.equal(buyer.winWindow.basis, 'odds')
  assert.equal(seller.winWindow.basis, 'odds')
  assert.notEqual(
    buyer.winWindow.note, seller.winWindow.note,
    'a 90%-odds buyer and a 10%-odds seller must not read the same'
  )
})

test('the notes state which basis actually scored the window, both ways', () => {
  const odds = grade({ ...FAIR, myPlayoffPct: 0.6 })
  assert.ok(
    odds.notes.some(n => /LIVE playoff odds/.test(n)),
    'and it points at get_playoff_odds for the numbers behind it'
  )
  assert.ok(odds.notes.some(n => /get_playoff_odds/.test(n)))
  assert.ok(
    !odds.notes.some(n => /scored on the win-window TIER/.test(n)),
    'the old fixed sentence must not survive alongside the odds one'
  )

  const tier = grade(FAIR)
  assert.ok(tier.notes.some(n => /scored on the win-window TIER/.test(n)))
})

test('the tier note names WHY the odds were unavailable — offseason vs a failed fetch', () => {
  const off = grade(FAIR, makeOffseasonWeekly(), { isOffseason: true })
  assert.ok(
    off.notes.some(n => /offseason, so there is no rest-of-season simulation/.test(n)),
    '"there is nothing to simulate" and "we could not fetch it" are different answers'
  )
  const inSeason = grade(FAIR)
  assert.ok(inSeason.notes.some(n => /schedule did not load/.test(n)))
})

test('odds of 0 are honoured as a real Seller stance, not treated as missing', () => {
  // The `?? null` guard in server.js exists so a MISSING entry falls back to
  // the tier; a genuine 0% must still score, or an eliminated team would be
  // graded as though its window were unknown.
  const a = grade({ ...FAIR, myPlayoffPct: 0 })
  assert.equal(a.winWindow.basis, 'odds')
})

test('the notes name what is NOT wired, so absence is never read as zero', () => {
  const a = grade(FAIR)
  assert.ok(a.notes.some(n => /not wired/i.test(n)))
  assert.ok(a.notes.some(n => /not modelled|disconfirmed/i.test(n)))
  assert.ok(a.notes.some(n => /read-only/i.test(n)))
})

// ── the both-sides gate ──────────────────────────────────────────────────

test('a one-sided trade shows totals but NO verdict', () => {
  const a = grade({ give: ['2'], get: [], partner: 'Mahomes Depot' })
  assert.equal(a.ok, true, 'a one-sided draft is a valid state, not an error')
  assert.equal(a.verdict, null)
  assert.equal(a.value.giveTotal, 5000)
  assert.ok(a.notes.some(n => /no verdict/i.test(n)))
})

// ── rule 7 ───────────────────────────────────────────────────────────────

test('an unpriced player reports value null and is called out in the notes', () => {
  const a = grade({ give: ['6'], get: ['21'], partner: 'Mahomes Depot' })
  assert.equal(a.sides.give[0].value, null)
  assert.equal(a.sides.give[0].unranked, true)
  assert.ok(a.notes.some(n => /unpriced/i.test(n)))
})

// ── offseason ────────────────────────────────────────────────────────────

test('offseason grades the trade but says the weekly read is absent', () => {
  const a = grade(FAIR, makeOffseasonWeekly(), { isOffseason: true })
  assert.equal(a.ok, true)
  assert.ok(a.verdict, 'a dynasty trade is gradeable year-round')
  assert.ok(a.notes.some(n => /offseason/i.test(n)))
})

// ── provenance and rendering ─────────────────────────────────────────────

test('carries the as-of stamp', () => {
  const a = grade(FAIR)
  assert.ok(a.asOf.generatedAt)
  assert.ok(a.asOf.sources.sleeper)
})

test('an identity with no roster in this league is refused', () => {
  const a = buildTradeAnswer(
    makeSnapshot({ league: { ...LEAGUE, myRoster: null } }), makeWeekly(),
    { ...FAIR, myRosterId: 99 }
  )
  assert.equal(a.ok, false)
})

test('the text rendering leads with THE CALL and never prints [object Object]', () => {
  const txt = renderTradeText(grade(FAIR))
  assert.ok(txt.includes('THE CALL'))
  assert.ok(txt.includes('FOR YOU'))
  assert.ok(txt.includes('FOR THEM'))
  assert.ok(!txt.includes('[object Object]'), 'landing spots must render as prose')
})

test('the text rendering of a rejection explains the fix', () => {
  const txt = renderTradeText(grade({ ...FAIR, give: ['Second Quarterback'] }))
  assert.match(txt, /resolve_assets/)
})
