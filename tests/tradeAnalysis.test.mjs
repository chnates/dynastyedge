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

// ── Layer 2 as a real post-trade lineup sim (Feature 3 Layer 2) ──────────────
// A roster builder that lets each test control exactly who plays where.
let uid = 0
function roster(rosterId, players, extra = {}) {
  return {
    rosterId,
    players: players.map(p => ({ sleeperId: `p${uid++}`, isIR: false, isTaxi: false, ...p })),
    picks: [],
    totalValue: players.reduce((s, p) => s + (p.value || 0), 0),
    pickCapitalScore: 0,
    avgStarterAge: 26,
    ...extra,
  }
}
const asset = p => ({ type: 'player', id: p.sleeperId, ...p })

test('Layer 2: an acquired player who would NOT start does not fill the need — it flags him as depth', () => {
  // My WR corps is deep but mediocre (top-5 = 10,000) while the league WR
  // average is far higher (deficit). But my RBs consume the FLEX slots, so a
  // 1,500 WR I acquire sits behind five better WRs — he does NOT start.
  const mine = roster(1, [
    { name: 'QB1', position: 'QB', value: 6000 },
    { name: 'RB1', position: 'RB', value: 5000 },
    { name: 'RB2', position: 'RB', value: 4800 },
    { name: 'RB3', position: 'RB', value: 4600 },
    { name: 'RB4', position: 'RB', value: 4400 },
    { name: 'WR1', position: 'WR', value: 2200 },
    { name: 'WR2', position: 'WR', value: 2100 },
    { name: 'WR3', position: 'WR', value: 2000 },
    { name: 'WR4', position: 'WR', value: 1900 },
    { name: 'WR5', position: 'WR', value: 1800 },
    { name: 'TE1', position: 'TE', value: 2500 },
    { name: 'TE2', position: 'TE', value: 700 },
  ])
  // Two opponents stacked at WR pull the league WR average above mine → deficit.
  const oppWRs = n => roster(n, [
    { name: `oQB${n}`, position: 'QB', value: 3000 },
    ...[3400, 3300, 3200, 3100, 3000].map((v, i) => ({ name: `oWR${n}-${i}`, position: 'WR', value: v })),
  ])
  const allRosters = [mine, oppWRs(2), oppWRs(3)]

  const sutton = { sleeperId: 'sutton', name: 'Sutton', position: 'WR', value: 1500, age: 30 }
  const a = analyzeTrade([], [asset(sutton)], mine, allRosters[1], allRosters)

  assert.ok(a.myDeltas.WR < 0, 'WR is genuinely a deficit position for me')
  assert.ok(!a.filledNeeds.includes('WR'), 'a benched acquisition must NOT count as filling the WR need')
  assert.ok(a.benchNote && /Sutton/.test(a.benchNote), 'he is surfaced as depth, not an upgrade')
})

test('Layer 2: shipping a starter that drops the position below league average flags a real hurt', () => {
  // Brown is my RB1 and a lineup lock. Giving him drops my RB group from above
  // the league average to below it → hurtStrengths includes RB, fit turns negative.
  const brown = { name: 'Brown', position: 'RB', value: 4000 }
  const mine = roster(1, [
    { name: 'QB1', position: 'QB', value: 4000 },
    brown,
    { name: 'RB2', position: 'RB', value: 1500 },
    { name: 'RB3', position: 'RB', value: 1000 },
    { name: 'WR1', position: 'WR', value: 3000 },
    { name: 'WR2', position: 'WR', value: 2000 },
    { name: 'TE1', position: 'TE', value: 1500 },
  ])
  const brownId = mine.players.find(p => p.name === 'Brown').sleeperId
  // Opponents' RBs set the league RB average near 5,000: my 6,500 is above it,
  // but 2,500 after dealing Brown is well below.
  const oppRB = n => roster(n, [{ name: `oRB${n}`, position: 'RB', value: 4250 }])
  const allRosters = [mine, oppRB(2), oppRB(3)]

  const a = analyzeTrade([asset({ sleeperId: brownId, ...brown })], [], mine, allRosters[1], allRosters)

  assert.ok(a.hurtStrengths.includes('RB'), 'losing a starter that craters the position must register as a hurt')
  assert.equal(a.fitScore, -1)
})

test('Layer 2: shipping a starter that stays above average is a heads-up note, not a hurt', () => {
  // Brown starts, but my RB room is deep enough that dealing him keeps RB above
  // the league average → no hurtStrength, but a starter-loss note fires.
  const brown = { name: 'Brown', position: 'RB', value: 3000 }
  const mine = roster(1, [
    { name: 'QB1', position: 'QB', value: 4000 },
    { name: 'RB1', position: 'RB', value: 5000 },
    brown,
    { name: 'RB3', position: 'RB', value: 2500 },
    { name: 'RB4', position: 'RB', value: 2000 },
    { name: 'WR1', position: 'WR', value: 3000 },
    { name: 'WR2', position: 'WR', value: 2000 },
    { name: 'TE1', position: 'TE', value: 1500 },
  ])
  const brownId = mine.players.find(p => p.name === 'Brown').sleeperId
  const oppRB = n => roster(n, [{ name: `oRB${n}`, position: 'RB', value: 4250 }])
  const allRosters = [mine, oppRB(2), oppRB(3)]

  const a = analyzeTrade([asset({ sleeperId: brownId, ...brown })], [], mine, allRosters[1], allRosters)

  assert.ok(!a.hurtStrengths.includes('RB'), 'RB stays above average, so it is not a hurt')
  assert.ok(a.starterLossNote && /Brown/.test(a.starterLossNote), 'but dealing a starter still earns a heads-up')
})

// ── Layer 3: my-players trajectory lens + draft-grade nudge (Feature 3) ──────
const CURVE_AGES = Array.from({ length: 19 }, (_, i) => 21 + i)
const mkCurve = fn => Object.fromEntries(CURVE_AGES.map(age => [age, fn(age)]))
const CURVES = {
  RB: mkCurve(age => 1000 + age * 60),   // rising with age → a young RB projects up
  WR: mkCurve(age => 6000 - age * 90),    // falling with age → an older WR projects down
  QB: mkCurve(() => 3000),                // flat → stable
  TE: mkCurve(() => 3000),
}

test('Layer 3: selling an ascending player raises a trajectory caution (age already priced, so it is a note)', () => {
  const { myRoster, opponentRoster, allRosters } = makeLeague()
  const brown = { sleeperId: 'brown', name: 'Brown', position: 'RB', value: 4000, age: 24 }
  const a = analyzeTrade(
    [asset(brown)],
    [{ type: 'pick', value: 4000, id: 'pk' }],
    myRoster, opponentRoster, allRosters,
    { curves: CURVES }
  )
  assert.ok(a.myTrajectoryNote && /Brown/.test(a.myTrajectoryNote), 'giving a riser flags selling an ascending asset')
  assert.equal(a.myTrajectoryTone, 'warning')
})

test('Layer 3: acquiring a declining player reads as a win-now add', () => {
  const { myRoster, opponentRoster, allRosters } = makeLeague()
  const sutton = { sleeperId: 'sutton', name: 'Sutton', position: 'WR', value: 1500, age: 31 }
  const a = analyzeTrade(
    [{ type: 'pick', value: 1500, id: 'pk' }],   // not a player, so nothing ascending on my give side
    [asset(sutton)],
    myRoster, opponentRoster, allRosters,
    { curves: CURVES }
  )
  assert.ok(a.myTrajectoryNote && /Sutton/.test(a.myTrajectoryNote), 'buying a faller warns the price may not hold')
})

test('Layer 3: draft-grade nudge fires only when acquiring picks with a large-enough sample', () => {
  const { myRoster, opponentRoster, allRosters } = makeLeague()
  const pick = { type: 'pick', value: 2700, id: 'pk' }
  const give = [{ type: 'player', sleeperId: 'x', name: 'X', position: 'RB', value: 2700 }]

  const strong = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 5, hits: 3, avgDelta: 3 } })
  assert.ok(strong.draftNote && strong.draftTone === 'success', 'a strong drafter gets a confidence boost on the pick')

  const weak = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 5, hits: 0, avgDelta: -3 } })
  assert.ok(weak.draftNote && weak.draftTone === 'warning', 'a weak drafter gets a caution')

  const tiny = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 2, hits: 1, avgDelta: 5 } })
  assert.equal(tiny.draftNote, null, 'a 2-pick history is too small to nudge')

  const noPick = analyzeTrade(give, [{ type: 'player', sleeperId: 'y', name: 'Y', position: 'WR', value: 2700 }],
    myRoster, opponentRoster, allRosters, { myDraftGrade: { count: 5, hits: 3, avgDelta: 3 } })
  assert.equal(noPick.draftNote, null, 'no acquired pick → no draft nudge')
})
