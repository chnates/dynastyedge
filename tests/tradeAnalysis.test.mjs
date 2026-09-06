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

import { analyzeTrade, getTradeVerdict, getCounterSuggestion, buildTradePitch, buildPartnerFit, suggestFairPackage } from '../src/utils/tradeAnalysis.js'
import { computeLeagueAverages, assignWinWindowTiers } from '../src/utils/rosterAnalysis.js'
import { buildGivabilityContext, assetKeepScore, PROTECT_THRESHOLD } from '../src/utils/recommendations.js'

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

test('Layer 3: draft-grade nudge keys on HIT RATE, only when acquiring picks with a large-enough sample', () => {
  const { myRoster, opponentRoster, allRosters } = makeLeague()
  const pick = { type: 'pick', value: 2700, id: 'pk' }
  const give = [{ type: 'player', sleeperId: 'x', name: 'X', position: 'RB', value: 2700 }]

  // ≥70% hit rate → success. (avgDelta is intentionally absent: the trigger is
  // hit rate now, not slot-delta.)
  const strong = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 5, hits: 4 } })
  assert.ok(strong.draftNote && strong.draftTone === 'success', 'a high hit rate gets a confidence boost on the pick')

  // ≤35% hit rate → warning.
  const weak = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 6, hits: 1 } })
  assert.ok(weak.draftNote && weak.draftTone === 'warning', 'a low hit rate gets a caution')

  // Middle hit rate (60%) sits in the deadband → no nudge.
  const middle = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 5, hits: 3 } })
  assert.equal(middle.draftNote, null, 'a middling hit rate does not nudge either way')

  // Below the ≥5-pick gate → no nudge even at a perfect hit rate.
  const tiny = analyzeTrade(give, [pick], myRoster, opponentRoster, allRosters,
    { myDraftGrade: { count: 4, hits: 4 } })
  assert.equal(tiny.draftNote, null, 'a 4-pick history is too small to nudge')

  const noPick = analyzeTrade(give, [{ type: 'player', sleeperId: 'y', name: 'Y', position: 'WR', value: 2700 }],
    myRoster, opponentRoster, allRosters, { myDraftGrade: { count: 5, hits: 4 } })
  assert.equal(noPick.draftNote, null, 'no acquired pick → no draft nudge')
})

// giveContext — "what am I giving up": the positional pecking order on my roster
// for every position I'm dealing from, marking the piece(s) leaving, ranked by
// dynasty value, with who starts (buildValueLineup) and taxi/IR excluded.
test('giveContext: dealt player carries his positional rank + the roster pecking order', () => {
  // My roster: 3 TEs (value gaps so ranks are unambiguous) behind enough RB/WR
  // to fill every FLEX + Superflex, so only Best TE starts and Gunnar Helm (TE2)
  // is genuine bench depth. Plus an IR TE that must NOT count in the order.
  const myRoster = {
    rosterId: 1,
    players: [
      { sleeperId: 'te1', name: 'Best TE',   position: 'TE', value: 5000, isIR: false, isTaxi: false },
      { sleeperId: 'te2', name: 'Gunnar Helm',position: 'TE', value: 3000, isIR: false, isTaxi: false },
      { sleeperId: 'te3', name: 'Third TE',  position: 'TE', value: 800,  isIR: false, isTaxi: false, unranked: false },
      { sleeperId: 'teIR',name: 'Hurt TE',   position: 'TE', value: 9999, isIR: true,  isTaxi: false },
      { sleeperId: 'q1',  name: 'My QB',     position: 'QB', value: 4000, isIR: false, isTaxi: false },
      { sleeperId: 'r1',  name: 'RB1',       position: 'RB', value: 4200, isIR: false, isTaxi: false },
      { sleeperId: 'r2',  name: 'RB2',       position: 'RB', value: 4100, isIR: false, isTaxi: false },
      { sleeperId: 'r3',  name: 'RB3',       position: 'RB', value: 4000, isIR: false, isTaxi: false },
      { sleeperId: 'r4',  name: 'RB4',       position: 'RB', value: 3900, isIR: false, isTaxi: false },
      { sleeperId: 'w1',  name: 'WR1',       position: 'WR', value: 4300, isIR: false, isTaxi: false },
      { sleeperId: 'w2',  name: 'WR2',       position: 'WR', value: 4200, isIR: false, isTaxi: false },
      { sleeperId: 'w3',  name: 'WR3',       position: 'WR', value: 4100, isIR: false, isTaxi: false },
      { sleeperId: 'w4',  name: 'WR4',       position: 'WR', value: 3600, isIR: false, isTaxi: false },
    ],
    picks: [],
    totalValue: 20000, pickCapitalScore: 0, avgStarterAge: 26,
  }
  const opp = { rosterId: 2, players: [
    { sleeperId: 'ow', name: 'Opp WR', position: 'WR', value: 3000, isIR: false, isTaxi: false },
  ], picks: [], totalValue: 3000, pickCapitalScore: 0, avgStarterAge: 26 }
  const allRosters = [myRoster, opp, { ...myRoster, rosterId: 3 }, { ...myRoster, rosterId: 4 }]

  // Deal the middle TE (Gunnar Helm).
  const give = [{ type: 'player', sleeperId: 'te2', name: 'Gunnar Helm', position: 'TE', value: 3000 }]
  const get  = [{ type: 'player', sleeperId: 'ow', name: 'Opp WR', position: 'WR', value: 3000 }]
  const a = analyzeTrade(give, get, myRoster, opp, allRosters)

  assert.equal(a.giveContext.length, 1, 'one position dealt from → one group')
  const g = a.giveContext[0]
  assert.equal(g.position, 'TE')
  assert.equal(g.count, 3, 'IR TE excluded from the pecking order')
  // Ranked by value desc: Best TE, Gunnar Helm, Third TE.
  assert.deepEqual(g.peers.map(p => p.name), ['Best TE', 'Gunnar Helm', 'Third TE'])
  assert.equal(g.dealt.length, 1)
  assert.equal(g.dealt[0].name, 'Gunnar Helm')
  assert.equal(g.dealt[0].posRank, 2, 'Helm is my TE2 by value')
  // Best TE is the lone TE starter; the dealt TE2 is bench depth.
  assert.equal(g.peers.find(p => p.name === 'Best TE').isStarter, true)
  assert.equal(g.dealt[0].isStarter, false)
  assert.equal(g.peers.find(p => p.isDealt).name, 'Gunnar Helm')
})

test('giveContext: two players dealt from one position share a single grouped depth chart', () => {
  const myRoster = {
    rosterId: 1,
    players: [
      { sleeperId: 'te1', name: 'TE A', position: 'TE', value: 5000, isIR: false, isTaxi: false },
      { sleeperId: 'te2', name: 'TE B', position: 'TE', value: 3000, isIR: false, isTaxi: false },
      { sleeperId: 'te3', name: 'TE C', position: 'TE', value: 800,  isIR: false, isTaxi: false },
      { sleeperId: 'q1',  name: 'My QB',position: 'QB', value: 4000, isIR: false, isTaxi: false },
    ],
    picks: [], totalValue: 12800, pickCapitalScore: 0, avgStarterAge: 26,
  }
  const opp = { rosterId: 2, players: [], picks: [], totalValue: 0, pickCapitalScore: 0, avgStarterAge: 26 }
  const allRosters = [myRoster, opp, { ...myRoster, rosterId: 3 }, { ...myRoster, rosterId: 4 }]

  const give = [
    { type: 'player', sleeperId: 'te2', name: 'TE B', position: 'TE', value: 3000 },
    { type: 'player', sleeperId: 'te3', name: 'TE C', position: 'TE', value: 800 },
  ]
  const a = analyzeTrade(give, [{ type: 'pick', value: 3800 }], myRoster, opp, allRosters)
  assert.equal(a.giveContext.length, 1, 'both TEs collapse into one TE group')
  assert.equal(a.giveContext[0].dealt.length, 2)
  assert.deepEqual(a.giveContext[0].dealt.map(d => d.posRank).sort(), [2, 3])
})

// ── Layer 4: their side ─────────────────────────────────────────────────────
//
// Behaviors pinned (CLAUDE.md Feature 3 Layer 4):
//  - "does this deal do anything for the team being asked to accept it" is
//    judged by their POST-TRADE optimal lineup, not by a position tag.
//  - the verdict gate only ever DOWNGRADES, and only from Accept.
//  - the pitch is stated from their side of the table.

// A league where BOTH teams are QB-rich and the partner is WR-rich — the exact
// shape of the screenshot bug this layer exists to catch: even value, fills my
// WR need, and hands a QB to a team that starts three better ones.
function makeStackedLeague() {
  const P = (id, name, pos, value, age = 26) =>
    ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, players, picks: [],
    totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  const me = mk(1, [
    P('101', 'Dart', 'QB', 4937), P('102', 'Nix', 'QB', 4704), P('103', 'Love', 'QB', 3902),
    P('106', 'My WR1', 'WR', 2000), P('107', 'My WR2', 'WR', 1200),
    P('108', 'My RB1', 'RB', 3000), P('110', 'My TE1', 'TE', 2500),
  ])
  const them = mk(2, [
    P('201', 'Their QB1', 'QB', 6000), P('202', 'Their QB2', 'QB', 5000), P('203', 'Their QB3', 'QB', 4500),
    P('204', 'Flowers', 'WR', 3891), P('205', 'Their WR1', 'WR', 5000), P('206', 'Their WR2', 'WR', 4500),
    P('207', 'Their WR3', 'WR', 3000), P('209', 'Their RB1', 'RB', 900), P('210', 'Their TE1', 'TE', 700),
  ])
  const t3 = mk(3, [P('301', 'a', 'QB', 3000), P('302', 'b', 'RB', 3000), P('303', 'c', 'WR', 3000), P('304', 'd', 'TE', 1500)])
  const t4 = mk(4, [P('401', 'a', 'QB', 2000), P('402', 'b', 'RB', 2000), P('403', 'c', 'WR', 2000), P('404', 'd', 'TE', 1000)])
  return { me, them, all: [me, them, t3, t4] }
}

const asAsset = p => ({ ...p, type: 'player' })

test('Layer 4: a player who cannot crack their lineup reads as Weak appeal, however he is valued', () => {
  const { me, them, all } = makeStackedLeague()
  const give = [asAsset(me.players.find(p => p.name === 'Love'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Flowers'))]
  const a = analyzeTrade(give, get, me, them, all)

  // Their QB4 — 3,902 of dynasty value that moves their starters not at all.
  const landed = a.partnerFit.landingSpots[0]
  assert.equal(landed.name, 'Love')
  assert.equal(landed.starts, false)
  assert.equal(landed.posRank, 4)
  assert.deepEqual(a.partnerFit.stacks, ['QB'])
  assert.deepEqual(a.partnerFit.fills, [])
  assert.ok(a.partnerFit.startersDelta < 0)
  assert.equal(a.partnerFit.appeal, 'Weak')
})

test('Layer 4: the verdict gate downgrades an otherwise-clean Accept (never upgrades)', () => {
  const { me, them, all } = makeStackedLeague()
  const give = [asAsset(me.players.find(p => p.name === 'Love'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Flowers'))]
  const a = analyzeTrade(give, get, me, them, all)

  // My side alone would say Accept: value is even and it fills my WR need.
  assert.equal(a.valueWinner, 'even')
  assert.deepEqual(a.filledNeeds, ['WR'])

  const v = getTradeVerdict(a)
  assert.equal(v.verdict, 'Counter')
  assert.equal(v.partnerGated, true)
  // It must quote the specific objection, not a generic line.
  assert.match(v.reasoning, /wouldn't crack their lineup/)
})

test('Layer 4: a Decline is never gated upward by partner appeal', () => {
  const { me, them, all } = makeStackedLeague()
  // I hand over my QB1 for their worst piece: terrible for me, great for them.
  const give = [asAsset(me.players.find(p => p.name === 'Dart'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Their TE1'))]
  const a = analyzeTrade(give, get, me, them, all)
  assert.equal(a.partnerFit.valueWinner, 'them')
  assert.equal(getTradeVerdict(a).verdict, 'Decline')
})

test('Layer 4: a player who starts at their deficit position reads as a fill', () => {
  const { me, them, all } = makeStackedLeague()
  // They are thin at RB (900). Sending my RB1 (3,000) starts for them
  // immediately, and the piece coming back is small enough that their best
  // lineup genuinely gains — an equal-value swap would net to zero.
  const give = [asAsset(me.players.find(p => p.name === 'My RB1'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Their TE1'))]
  const a = analyzeTrade(give, get, me, them, all)
  assert.deepEqual(a.partnerFit.fills, ['RB'])
  assert.equal(a.partnerFit.landingSpots[0].starts, true)
  assert.ok(a.partnerFit.startersDelta > 0)
  assert.notEqual(a.partnerFit.appeal, 'Weak')
})

test('Layer 4: acquired players get a landing spot on MY post-trade depth chart', () => {
  const { me, them, all } = makeStackedLeague()
  const give = [asAsset(me.players.find(p => p.name === 'Love'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Flowers'))]
  const a = analyzeTrade(give, get, me, them, all)
  const mine = a.myLandingSpots[0]
  assert.equal(mine.name, 'Flowers')
  assert.equal(mine.posRank, 1)     // 3,891 tops my 2,000 / 1,200 WR room
  assert.equal(mine.count, 3)
  assert.equal(mine.starts, true)
})

test('the pitch states the case from THEIR side, and never from mine', () => {
  const { me, them, all } = makeStackedLeague()
  const give = [asAsset(me.players.find(p => p.name === 'My RB1'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Their WR3'))]
  const a = analyzeTrade(give, get, me, them, all)
  const pitch = buildTradePitch(a, { partnerName: 'Password Is Taco', giveAssets: give, getAssets: get })

  // "You get" is what I'm giving — the perspective flip is the whole point.
  assert.match(pitch.text, /You get: My RB1 \(RB\)/)
  assert.match(pitch.text, /You give: Their WR3 \(WR\)/)
  assert.match(pitch.text, /Password Is Taco/)
  // It must say where the incoming piece lands for THEM.
  assert.ok(pitch.bullets.some(b => /My RB1 slots in as your RB1/.test(b)))
})

test('the pitch needs both sides — a half-built trade produces none', () => {
  const { me, them, all } = makeStackedLeague()
  const give = [asAsset(me.players.find(p => p.name === 'My RB1'))]
  const a = analyzeTrade(give, [], me, them, all)
  assert.equal(buildTradePitch(a, { giveAssets: give, getAssets: [] }), null)
})

// ── OPEN-6: the recommenders are two-sided too ──────────────────────────────
// CLAUDE.md Feature 3: `suggestFairPackage` is two-phase — phase 1 ranks every
// package in the fair band by what it costs ME, phase 2 scores that shortlist
// with `buildPartnerFit` (the same Layer 4 the Analyzer grades it with) and
// takes the best appeal. This is what stops the app suggesting a package its
// own panel immediately downgrades.

test('buildPartnerFit is the SAME computation analyzeTrade uses (extraction contract)', () => {
  const { me, them, all } = makeStackedLeague()
  const give = [asAsset(me.players.find(p => p.name === 'Love'))]
  const get  = [asAsset(them.players.find(p => p.name === 'Flowers'))]

  const standalone = buildPartnerFit(give, get, them, all)
  const viaAnalyze = analyzeTrade(give, get, me, them, all).partnerFit

  assert.equal(standalone.appeal, viaAnalyze.appeal)
  assert.equal(standalone.appealScore, viaAnalyze.appealScore)
  assert.equal(standalone.startersDelta, viaAnalyze.startersDelta)
  assert.deepEqual(standalone.reasons, viaAnalyze.reasons)
  assert.deepEqual(standalone.fills, viaAnalyze.fills)
})

test('buildPartnerFit needs no injected averages or tiers (standalone contract)', () => {
  const { them, all } = makeStackedLeague()
  const fit = buildPartnerFit(
    [{ type: 'player', sleeperId: 'x', name: 'X', position: 'RB', value: 3000 }],
    [asAsset(them.players.find(p => p.name === 'Flowers'))],
    them, all
  )
  assert.ok(fit && ['Strong', 'Fair', 'Weak'].includes(fit.appeal))
  // Injecting them must not change the answer — they are a cost optimization
  // for a caller in a loop, never a different model.
  const injected = buildPartnerFit(
    [{ type: 'player', sleeperId: 'x', name: 'X', position: 'RB', value: 3000 }],
    [asAsset(them.players.find(p => p.name === 'Flowers'))],
    them, all,
    { leagueAverages: computeLeagueAverages(all), winWindowTiers: assignWinWindowTiers(all) }
  )
  assert.equal(injected.appeal, fit.appeal)
  assert.equal(injected.appealScore, fit.appealScore)
})

test('buildPartnerFit returns null without a partner roster (degradation contract)', () => {
  const { them, all } = makeStackedLeague()
  assert.equal(buildPartnerFit([], [], null, all), null)
  assert.equal(buildPartnerFit([], [], them, []), null)
})

// The bad loop needs a roster with a REAL alternative in the band, otherwise
// Weak is the honest ceiling and the builder is right to report it. Here my
// cheapest single asset by keep-score is still a third quarterback (into a room
// of three better ones), but spare RB and TE depth reaches the same band — and
// the partner is threadbare at both.
function makeSpareDepthLeague() {
  const P = (id, name, pos, value, age = 26) =>
    ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, players, picks: [],
    totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  const me = mk(1, [
    P('101', 'Dart', 'QB', 4937), P('102', 'Nix', 'QB', 4704), P('103', 'Love', 'QB', 3902),
    P('104', 'My RB1', 'RB', 3000), P('105', 'My RB2', 'RB', 2800), P('106', 'My RB3', 'RB', 2600),
    P('107', 'My TE1', 'TE', 2500), P('108', 'My TE2', 'TE', 2300), P('111', 'My RB4', 'RB', 1400),
    P('109', 'My WR1', 'WR', 2000), P('110', 'My WR2', 'WR', 1200),
  ])
  const them = mk(2, [
    P('201', 'Their QB1', 'QB', 6000), P('202', 'Their QB2', 'QB', 5000), P('203', 'Their QB3', 'QB', 4500),
    P('204', 'Flowers', 'WR', 3891), P('205', 'Their WR1', 'WR', 5000), P('206', 'Their WR2', 'WR', 4500),
    P('207', 'Their WR3', 'WR', 3000),
    P('208', 'Their RB1', 'RB', 900), P('209', 'Their TE1', 'TE', 700),   // threadbare
  ])
  const t3 = mk(3, [P('301', 'a', 'QB', 3000), P('302', 'b', 'RB', 3000), P('303', 'c', 'WR', 3000), P('304', 'd', 'TE', 1500)])
  const t4 = mk(4, [P('401', 'a', 'QB', 2000), P('402', 'b', 'RB', 2000), P('403', 'c', 'WR', 2000), P('404', 'd', 'TE', 1000)])
  return { me, them, all: [me, them, t3, t4] }
}

test('phase 2 stops the builder reaching for the piece they have no use for (OPEN-6)', () => {
  // The exact shape of the bad loop, measured live: my cheapest asset by
  // keep-score is a third quarterback, and the partner already starts three
  // better ones — so the one-sided builder handed over a package its own
  // Layer 4 graded Weak. Pieces they'd actually start sit in the same band.
  const { me, them, all } = makeSpareDepthLeague()
  const flowers = them.players.find(p => p.name === 'Flowers')

  const pkg = suggestFairPackage(flowers, me, all, them)
  assert.ok(pkg, 'a package is still suggested')

  // The suggestion now carries the read it was chosen for.
  assert.ok(['Strong', 'Fair', 'Weak'].includes(pkg.appeal))
  assert.notEqual(pkg.appeal, 'Weak', 'phase 2 rejects the package they have no use for')

  // And it is no longer the lone spare QB into a room of three better ones.
  const isLoneSpareQb = pkg.assets.length === 1 && pkg.assets[0].name === 'Love'
  assert.equal(isLoneSpareQb, false)
})

test('the package still comes from spare parts — phase 2 never unlocks a protected core piece (OPEN-6)', () => {
  const { me, them, all } = makeSpareDepthLeague()
  const flowers = them.players.find(p => p.name === 'Flowers')
  const ctx = buildGivabilityContext(me, all)
  const pkg = suggestFairPackage(flowers, me, all, them)
  assert.ok(pkg.assets.every(a => assetKeepScore(a, ctx) < PROTECT_THRESHOLD),
    'appeal may reorder the candidates, never widen the pool')
  // The fair band is unchanged too.
  assert.ok(pkg.totalValue >= flowers.value * 0.9 && pkg.totalValue <= flowers.value * 1.15)
})

test('without a partner roster the builder degrades to phase 1 and reports no appeal (OPEN-6)', () => {
  const { me, them, all } = makeSpareDepthLeague()
  const flowers = them.players.find(p => p.name === 'Flowers')
  const pkg = suggestFairPackage(flowers, me, all, null)
  assert.ok(pkg, 'still suggests a package')
  assert.equal(pkg.appeal, null, 'no partner to read, so no read is invented')
  assert.equal(pkg.partnerSummary, null)
})

// ── The cheaper alternative package ─────────────────────────────────────────
// Pins CLAUDE.md Feature 3: appeal stays lexicographically first (owner call —
// knowing whether they would accept is the information the search exists to
// produce), so this NEVER reorders. It only names what the winner cost and what
// giving less would cost in their eyes.

// A roster with two very different ways to pay: a QB the partner has no use
// for (cheap for me, weak for them) and an RB who would start for them.
function altScenario() {
  const P = (id, name, pos, value, age = 26) =>
    ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, owner: { user_id: `u${rosterId}`, display_name: `T${rosterId}` },
    players, picks: [],
    totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  const me = mk(1, [
    P('a1', 'Spare QB', 'QB', 4000), P('a2', 'My QB1', 'QB', 6000), P('a3', 'My QB2', 'QB', 5500),
    P('a4', 'My RB1', 'RB', 4300), P('a5', 'My RB2', 'RB', 4200), P('a6', 'My RB3', 'RB', 4100),
    P('a7', 'My RB4', 'RB', 4000), P('a8', 'My WR1', 'WR', 3000), P('a9', 'My TE1', 'TE', 3000),
  ])
  // They are stacked at QB and thin at RB, so a QB reads weak and an RB strong.
  const opp = mk(2, [
    P('b1', 'Their QB1', 'QB', 7000), P('b2', 'Their QB2', 'QB', 6500),
    P('b3', 'Their WR1', 'WR', 4200), P('b4', 'Their RB1', 'RB', 900),
  ])
  const others = [3, 4].map(i => mk(i, [
    P(`${i}1`, `QB ${i}`, 'QB', 3000), P(`${i}2`, `RB ${i}`, 'RB', 3000),
    P(`${i}3`, `WR ${i}`, 'WR', 3000), P(`${i}4`, `TE ${i}`, 'TE', 3000),
  ]))
  const all = [me, opp, ...others]
  return { me, all, opp, target: { ...opp.players[2], type: 'player' } }
}

test('the alternative is cheaper AND reads worse to them, or it is not shown', () => {
  const { me, all, opp, target } = altScenario()
  const pkg = suggestFairPackage(target, me, all, opp)
  assert.ok(pkg, 'a package is suggested')
  if (!pkg.alternative) return  // no meaningful saving exists — a valid outcome
  const rank = { Weak: 0, Fair: 1, Strong: 2 }
  assert.ok(rank[pkg.alternative.appeal] < rank[pkg.appeal],
    'an alternative at the same or better appeal would just be the winner')
  assert.ok(pkg.alternative.totalValue !== pkg.totalValue,
    'a package identical to the winner is not an alternative')
})

test('the alternative never becomes the suggestion', () => {
  const { me, all, opp, target } = altScenario()
  const pkg = suggestFairPackage(target, me, all, opp)
  const rank = { Weak: 0, Fair: 1, Strong: 2 }
  // Whatever the alternative reads, the chosen package must still be the best
  // appeal the search found — the ranking is untouched by this feature.
  if (pkg.alternative)
    assert.ok(rank[pkg.appeal] >= rank[pkg.alternative.appeal])
})
