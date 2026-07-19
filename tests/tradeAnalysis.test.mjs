// tests/tradeAnalysis.test.mjs — pins documented behavior of src/utils/tradeAnalysis.js.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 3 Layer 1: "Show the % difference clearly" — the code
//    computes the % against the LARGER side of the trade (maxTotal), and
//    calls it even within ±5%.
//  - CLAUDE.md Feature 3 Verdict: the Accept / Decline / Counter ladder,
//    including the tension cases ("you're overpaying X% on raw value, but
//    this directly fills your … gap" and "raw value slightly favors you,
//    but…" → Counter when the asset type fights the win window).
//  - CLAUDE.md Feature 3: "The verdict only renders once both sides have at
//    least one asset" → empty trade yields no verdict.
//  - CLAUDE.md Feature 3 Counter: "Name a specific player or pick (never
//    vague) … Assets already in the trade are never suggested."

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { analyzeTrade, getTradeVerdict, getCounterSuggestion } from '../src/utils/tradeAnalysis.js'

// Minimal 4-team league so analyzeTrade's league-average / tier machinery has
// real inputs. Values are arbitrary but fixed.
function makeLeague() {
  const mk = (rosterId, value) => ({
    rosterId,
    players: [
      { sleeperId: `${rosterId}01`, name: `QB ${rosterId}`, position: 'QB', value, isIR: false },
      { sleeperId: `${rosterId}02`, name: `RB ${rosterId}`, position: 'RB', value: value / 2, isIR: false },
      { sleeperId: `${rosterId}03`, name: `WR ${rosterId}`, position: 'WR', value: value / 2, isIR: false },
      { sleeperId: `${rosterId}04`, name: `TE ${rosterId}`, position: 'TE', value: value / 4, isIR: false },
    ],
    picks: [],
    totalValue: value * 2.25,
    pickCapitalScore: 0,
    avgStarterAge: 26,
  })
  const allRosters = [mk(1, 8000), mk(2, 6000), mk(3, 4000), mk(4, 2000)]
  return { allRosters, myRoster: allRosters[0], opponentRoster: allRosters[1] }
}

test('Layer 1: % difference is computed against the LARGER side (Feature 3 raw value)', () => {
  const { myRoster, opponentRoster, allRosters } = makeLeague()
  // Give 1000, get 800: 200 / 1000 = 20% (vs 25% if measured on the smaller side).
  const give = [{ type: 'pick', value: 1000 }]
  const get = [{ type: 'pick', value: 800 }]
  const a = analyzeTrade(give, get, myRoster, opponentRoster, allRosters)
  assert.equal(a.valuePct, 20)
  assert.equal(a.valueWinner, 'them')
  // Mirror image: same 20%, winner flips.
  const b = analyzeTrade(get, give, myRoster, opponentRoster, allRosters)
  assert.equal(b.valuePct, 20)
  assert.equal(b.valueWinner, 'you')
})

test('Layer 1: within ±5% of the larger side reads as even (Feature 3 raw value)', () => {
  const { myRoster, opponentRoster, allRosters } = makeLeague()
  const a = analyzeTrade(
    [{ type: 'pick', value: 1000 }], [{ type: 'pick', value: 950 }],
    myRoster, opponentRoster, allRosters
  )
  assert.equal(a.valuePct, 5)
  assert.equal(a.valueWinner, 'even')
})

// getTradeVerdict only reads the analysis object, so the ladder is pinned
// against hand-built analyses — each field combination straight from a
// documented verdict sentence in Feature 3.
function analysis(overrides) {
  return {
    giveTotal: 1000, getTotal: 1000, valuePct: 0, valueWinner: 'even',
    filledNeeds: [], hurtStrengths: [], fitScore: 0,
    windowScore: 0, windowNote: 'Neutral — fits your current win window',
    ...overrides,
  }
}

test('verdict ladder: empty trade → no verdict (Feature 3: "only renders once both sides have at least one asset")', () => {
  assert.equal(getTradeVerdict(null), null)
  assert.equal(getTradeVerdict(analysis({ giveTotal: 0, getTotal: 0 })), null)
})

test('verdict ladder: losing more than 15% raw value is a hard Decline, even when it fills a need (Feature 3)', () => {
  const v = getTradeVerdict(analysis({ valueWinner: 'them', valuePct: 16, fitScore: 1, filledNeeds: ['WR'] }))
  assert.equal(v.verdict, 'Decline')
})

test('verdict ladder: winning or even value with neutral fit and window → Accept (Feature 3)', () => {
  assert.equal(getTradeVerdict(analysis({ valueWinner: 'you', valuePct: 10 })).verdict, 'Accept')
  assert.equal(getTradeVerdict(analysis({ valueWinner: 'even', valuePct: 3 })).verdict, 'Accept')
})

test('verdict ladder: overpaying ≤15% but filling a need → Accept with the tension flagged (Feature 3 tension case)', () => {
  const v = getTradeVerdict(analysis({ valueWinner: 'them', valuePct: 8, fitScore: 1, filledNeeds: ['WR'] }))
  assert.equal(v.verdict, 'Accept')
  assert.match(v.reasoning, /overpaying/i)
  assert.match(v.reasoning, /WR/)
})

test('verdict ladder: winning raw value but wrong asset type for the window → Counter (Feature 3 tension case)', () => {
  const v = getTradeVerdict(analysis({
    valueWinner: 'you', valuePct: 10, windowScore: -1,
    windowNote: 'Getting only picks conflicts with your Contending window',
  }))
  assert.equal(v.verdict, 'Counter')
})

test('verdict ladder: hurting a weak position → Decline (Feature 3 Layer 2)', () => {
  const v = getTradeVerdict(analysis({ valueWinner: 'even', fitScore: -1, hurtStrengths: ['QB'] }))
  assert.equal(v.verdict, 'Decline')
  assert.match(v.reasoning, /QB/)
})

test('verdict ladder: default is Counter (Feature 3: overpay with nothing else decisive)', () => {
  const v = getTradeVerdict(analysis({ valueWinner: 'them', valuePct: 10 }))
  assert.equal(v.verdict, 'Counter')
})

test('counter suggestion never names an asset already in the trade (Feature 3: "Assets already in the trade are never suggested")', () => {
  const opponentRoster = {
    players: [
      { sleeperId: 101, name: 'In Trade Guy', value: 400, isIR: false },
      { sleeperId: 102, name: 'Available Guy', value: 380, isIR: false },
    ],
    picks: [],
  }
  const myRoster = { players: [], picks: [] }
  // I'm down 400 on a 1000-side trade; player 101 is already in "You get".
  const a = analysis({ valueWinner: 'them', valuePct: 40, giveTotal: 1000, getTotal: 600 })
  const s = getCounterSuggestion(a, myRoster, opponentRoster, [], [{ id: '101' }])
  assert.ok(s, 'a bridging suggestion must exist')
  assert.equal(s.side, 'get')
  assert.equal(s.item.sleeperId, 102, 'must suggest the asset NOT already in the trade')
  // The suggestion names the specific asset (Feature 3: never vague).
  assert.match(s.text, /Available Guy/)
})

test('counter suggestion picks the in-window asset closest to the gap (Feature 3 Counter: "get within ~5% raw value")', () => {
  const opponentRoster = {
    players: [
      { sleeperId: 201, name: 'Window Floor', value: 1600, isIR: false }, // 0.8×gap — applied residual 10%
      { sleeperId: 202, name: 'Near Gap', value: 1900, isIR: false },     // applied residual 3%
      { sleeperId: 203, name: 'Overshoot', value: 2900, isIR: false },    // in window, farther from gap
    ],
    picks: [],
  }
  const myRoster = { players: [], picks: [] }
  // I'm down 2000 on a 4000-side trade → gap 2000; all three sit in [1600, 3000].
  const a = analysis({ valueWinner: 'them', valuePct: 50, giveTotal: 4000, getTotal: 2000 })
  const s = getCounterSuggestion(a, myRoster, opponentRoster, [], [])
  assert.equal(s.item.sleeperId, 202, 'must minimize |value − gap|, not pick the cheapest in-window asset')
})

test('counter suggestion: picks already in the trade are excluded too, and no candidates → null (Feature 3)', () => {
  const myRoster = {
    players: [],
    picks: [{ season: '2026', round: 2, originalOwner: 6, value: 350 }],
  }
  const opponentRoster = { players: [], picks: [] }
  // I'm winning; my only bridgeable asset is the pick — but it's already in the trade.
  const a = analysis({ valueWinner: 'you', valuePct: 40, giveTotal: 600, getTotal: 1000 })
  const s = getCounterSuggestion(a, myRoster, opponentRoster, [{ id: '2026-2-6' }], [])
  assert.equal(s, null)
})

test('counter suggestion: no suggestion inside the ±5% even band (Feature 3: counter targets ~5% fairness)', () => {
  const { myRoster, opponentRoster } = makeLeague()
  const a = analysis({ valueWinner: 'even', valuePct: 3 })
  assert.equal(getCounterSuggestion(a, myRoster, opponentRoster), null)
})
