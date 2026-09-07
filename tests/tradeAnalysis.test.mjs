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

import { analyzeTrade, getTradeVerdict, getCounterSuggestion, buildTradePitch, buildPartnerFit, suggestFairPackage, APPEAL_BONUS } from '../src/utils/tradeAnalysis.js'
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

test('the alternative costs MORE and reads better to them, or it is not shown', () => {
  const { me, all, opp, target } = altScenario()
  const pkg = suggestFairPackage(target, me, all, opp)
  assert.ok(pkg, 'a package is suggested')
  if (!pkg.alternative) return  // no meaningfully pricier upgrade exists — valid
  const rank = { Weak: 0, Fair: 1, Strong: 2 }
  // The direction reversed when phase 2 stopped being lexicographic. The
  // suggestion now already weighs my cost, so the road not taken is the one
  // they'd like MORE that it declined to pay for.
  assert.ok(rank[pkg.alternative.appeal] > rank[pkg.appeal],
    'an alternative at the same or worse appeal is not an upgrade worth naming')
  assert.ok(pkg.alternative.totalValue !== pkg.totalValue,
    'a package identical to the winner is not an alternative')
})

test('the alternative never becomes the suggestion', () => {
  const { me, all, opp, target } = altScenario()
  const pkg = suggestFairPackage(target, me, all, opp)
  // The suggestion is chosen on appeal traded off against my keep-pain, so a
  // higher-appeal alternative existing is EXPECTED — it was passed over on
  // cost. What must never happen is the two being the same package.
  if (pkg.alternative)
    assert.notDeepEqual(pkg.alternative.assets.map(a => a.name), pkg.assets.map(a => a.name))
})

// ── The three fixes from the 2026-09 "does it care too much about them?" review ──

// ── Layer 3: live playoff odds drive the window in season, tier in the offseason ──

// A league where the tier and the live odds DISAGREE about me, which is the
// whole point of the swap. I am mid-pack on total assets (so the tier ranking
// puts me in the fixed-size `Middle` bucket and scores nothing), while my odds
// say I am a clear buyer. Mirrors roster 5 on the live league: strong starters,
// thin depth, no picks left, tier says Rebuilding, odds say 87.7%.
function windowScenario() {
  const P = (id, name, pos, value, age = 26) =>
    ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
  const mk = (rosterId, mult) => ({
    rosterId,
    players: [
      P(`${rosterId}a`, `QB${rosterId}`, 'QB', 6000 * mult), P(`${rosterId}b`, `QB2${rosterId}`, 'QB', 5000 * mult),
      P(`${rosterId}c`, `RB${rosterId}`, 'RB', 5000 * mult), P(`${rosterId}d`, `RB2${rosterId}`, 'RB', 4000 * mult),
      P(`${rosterId}e`, `WR${rosterId}`, 'WR', 5000 * mult), P(`${rosterId}f`, `WR2${rosterId}`, 'WR', 4000 * mult),
      P(`${rosterId}g`, `TE${rosterId}`, 'TE', 3000 * mult),
    ],
    picks: [], totalValue: 32000 * mult, pickCapitalScore: 1000 * mult, avgStarterAge: 26,
  })
  // EIGHT teams, not six: the tier is top-3 Contending / bottom-3 Rebuilding,
  // so a six-team league has no `Middle` bucket at all and the fixture could
  // not express the case it exists to test.
  const all = [mk(1, 1.5), mk(2, 1.4), mk(3, 1.3), mk(4, 1.1), mk(5, 1.0),
    mk(6, 0.9), mk(7, 0.8), mk(8, 0.7)]
  return { me: all[3], opp: all[1], all }   // rank 4 of 8 => tier `Middle`
}

test('Layer 3 takes its lean from live playoff odds when they exist', () => {
  const { me, opp, all } = windowScenario()
  const give = [{ type: 'pick', name: '2027 1st', value: 4000 }]
  const get  = [{ ...me.players[0], sleeperId: 'x9', name: 'A Proven Vet', value: 4100, age: 27, type: 'player' }]

  // Offseason: no odds. The tier is the only basis, and this roster is Middle —
  // the bucket with no branch, which is exactly the hole the swap fills.
  const off = analyzeTrade(give, get, me, opp, all)
  assert.equal(off.windowBasis, 'tier')
  assert.equal(off.myTier, 'Middle')
  assert.equal(off.windowScore, 0, 'the tier has no opinion for a Middle team — the documented gap')

  // In season at 80%: getDeadlineVerdict says Buyer, so acquiring a proven
  // player for a pick now scores POSITIVELY where the tier scored nothing.
  const on = analyzeTrade(give, get, me, opp, all, { myPlayoffPct: 0.80 })
  assert.equal(on.windowBasis, 'odds')
  assert.equal(on.windowScore, 1)
  assert.match(on.windowNote, /80% playoff odds/)
  assert.equal(on.oddsStance, 'Buyer')
})

test('Layer 3 flips with the odds, not with the roster', () => {
  const { me, opp, all } = windowScenario()
  // Acquiring ONLY picks: right for a seller, wrong for a buyer. Same rosters,
  // same assets — only the odds move, and the score moves with them.
  const give = [{ ...me.players[2], type: 'player' }]
  const get  = [{ type: 'pick', name: '2028 1st', value: 4000 }]

  const buyer  = analyzeTrade(give, get, me, opp, all, { myPlayoffPct: 0.85 })
  const seller = analyzeTrade(give, get, me, opp, all, { myPlayoffPct: 0.10 })
  assert.equal(buyer.windowScore, -1, 'a buyer cashing a starter for picks is off-window')
  assert.equal(seller.windowScore, 1, 'a seller doing the identical trade is on-window')
  assert.equal(buyer.oddsStance, 'Buyer')
  assert.equal(seller.oddsStance, 'Seller')
})

test('a bubble team gets a real read instead of a placeholder', () => {
  const { me, opp, all } = windowScenario()
  const give = [{ ...me.players[2], type: 'player' }]
  const get  = [{ type: 'pick', name: '2028 1st', value: 4000 }]
  // 50% sits between the Seller (<35%) and Buyer (>=70%) thresholds.
  const a = analyzeTrade(give, get, me, opp, all, { myPlayoffPct: 0.50 })
  assert.equal(a.windowBasis, 'odds')
  assert.equal(a.windowScore, 0, 'no lean either way on the bubble')
  assert.match(a.windowNote, /on the bubble at 50%/, 'but it says so, with the number')
  assert.equal(a.oddsStance, 'On the bubble')
})

test('the offseason fallback is byte-for-byte the old tier behaviour', () => {
  // The swap must not change what a Contending or Rebuilding team sees with no
  // odds available — that is the half of the year the tier still owns.
  const P = (id, name, pos, value, age = 26) =>
    ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
  const mk = (rosterId, mult) => ({
    rosterId,
    players: [P(`${rosterId}a`, `QB${rosterId}`, 'QB', 6000 * mult), P(`${rosterId}c`, `RB${rosterId}`, 'RB', 5000 * mult),
      P(`${rosterId}e`, `WR${rosterId}`, 'WR', 5000 * mult), P(`${rosterId}g`, `TE${rosterId}`, 'TE', 3000 * mult)],
    picks: [], totalValue: 19000 * mult, pickCapitalScore: 1000 * mult, avgStarterAge: 26,
  })
  const all = [mk(1, 1.5), mk(2, 1.3), mk(3, 1.1), mk(4, 0.9), mk(5, 0.7), mk(6, 0.5)]
  const contender = all[0]
  const a = analyzeTrade(
    [{ ...contender.players[1], type: 'player' }], [{ type: 'pick', name: '2028 1st', value: 4000 }],
    contender, all[1], all)
  assert.equal(a.windowBasis, 'tier')
  assert.equal(a.myTier, 'Contending')
  assert.equal(a.windowScore, -1)
  assert.match(a.windowNote, /Contending window/, 'offseason copy still names the tier, not a percentage')
  assert.equal(a.playoffPct, null)
  assert.equal(a.oddsStance, null)
})

test('the odds stance the panel prints is the one that scored the layer', () => {
  // One getDeadlineVerdict call feeds both, so the badge can never contradict
  // the note. Checked across the whole probability range.
  const { me, opp, all } = windowScenario()
  const give = [{ type: 'pick', name: '2027 1st', value: 4000 }]
  const get  = [{ ...me.players[0], sleeperId: 'x9', name: 'Vet', value: 4100, age: 27, type: 'player' }]
  for (const pct of [0.05, 0.34, 0.35, 0.5, 0.69, 0.70, 0.99]) {
    const a = analyzeTrade(give, get, me, opp, all, { myPlayoffPct: pct })
    assert.equal(a.playoffPct, pct)
    assert.equal(a.windowBasis, 'odds')
    if (a.oddsStance === 'Buyer')  assert.equal(a.windowScore, 1)
    if (a.oddsStance === 'Seller') assert.equal(a.windowScore, 0, 'a vet for a pick is neutral, not aligned, for a seller')
    if (a.oddsStance === 'On the bubble') assert.equal(a.windowScore, 0)
  }
})

// A roster where the two selection rules genuinely disagree: a spare RB the
// partner will accept (Fair, cheap to lose) and a core WR they'd prefer
// (Strong, expensive), both inside the same [0.9x, 1.15x] band and both under
// the protect threshold. Their TE room is deep enough that taking the target
// does not drop them below league average, which is what lets the pricier
// package reach Strong at all.
function divergentScenario() {
  const P = (id, name, pos, value, age = 26) =>
    ({ sleeperId: id, name, position: pos, value, age, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, players, picks: [], totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  const me = mk(1, [
    P('a1', 'My QB1', 'QB', 6000), P('a2', 'My QB2', 'QB', 5800),
    P('a3', 'My RB1', 'RB', 5200), P('a4', 'My RB2', 'RB', 5100), P('a5', 'My RB3', 'RB', 5000),
    P('a6', 'SpareRB', 'RB', 4300), P('a7', 'SpareRB2', 'RB', 4250),
    P('a8', 'My WR1', 'WR', 5400), P('a9', 'My WR2', 'WR', 4500), P('a10', 'My TE1', 'TE', 3000),
  ])
  const opp = mk(2, [
    P('b1', 'TQB1', 'QB', 5000), P('b2', 'TRB1', 'RB', 3800), P('b3', 'TWR1', 'WR', 3700),
    P('b4', 'TTE1', 'TE', 4000), P('b6', 'TTE2', 'TE', 3900), P('b5', 'TARGET', 'TE', 4100),
  ])
  const others = [3, 4].map(i => mk(i, [P(`${i}1`, `QB${i}`, 'QB', 5500),
    P(`${i}2`, `RB${i}`, 'RB', 4800), P(`${i}3`, `WR${i}`, 'WR', 4800), P(`${i}4`, `TE${i}`, 'TE', 3000)]))
  const all = [me, opp, ...others]
  return { me, all, opp, target: { ...opp.players[5], type: 'player' } }
}

test('phase 2 declines to buy Strong appeal when it costs more than the bonus', () => {
  const { me, all, opp, target } = divergentScenario()
  const ctx = buildGivabilityContext(me, all)
  const pkg = suggestFairPackage(target, me, all, opp)
  assert.ok(pkg, 'a package is suggested')

  // The board on offer: a Fair package at ~0.25 keep-pain and a Strong one at
  // ~0.85. The gap (~0.60) exceeds APPEAL_BONUS.Strong, so the Strong package
  // must lose. The old lexicographic rule took it every time.
  const pain = assets => assets.reduce((s, a) => s + assetKeepScore(a, ctx), 0)
  assert.equal(pkg.appeal, 'Fair', 'the cheaper acceptable package wins')
  assert.ok(pain(pkg.assets) < 0.5, 'and it is genuinely the cheap one')
  assert.ok(pkg.alternative, 'the Strong package it passed over is still named')
  assert.equal(pkg.alternative.appeal, 'Strong')
  assert.ok(pain(pkg.alternative.assets) - pain(pkg.assets) > APPEAL_BONUS.Strong,
    'it was passed over precisely because it cost more than a step of appeal is worth')

  // Nothing about the guardrails moved.
  pkg.assets.forEach(a => assert.ok(assetKeepScore(a, ctx) < PROTECT_THRESHOLD))
  assert.ok(pkg.totalValue >= target.value * 0.9 && pkg.totalValue <= target.value * 1.15,
    'the fair band still binds')
})

test('phase 2 maximizes appeal-minus-my-cost, not appeal alone', () => {
  // The invariant form of the rule: no package the search could have picked
  // may beat the one it did on (APPEAL_BONUS[appeal] - my keep-pain). Under the
  // old lexicographic rule this fails the moment a pricier higher-appeal
  // package exists, which is exactly the case the review found live (2 of 20
  // suggestions on the real board, both reaching for an asset just under the
  // protect line). Written as an invariant rather than a staged divergence
  // because the [0.9x, 1.15x] band is narrow enough that a synthetic
  // Fair-vs-Strong pair is fragile; the behaviour change itself was measured
  // against the live league.
  const { me, all, opp, target } = altScenario()
  const pkg = suggestFairPackage(target, me, all, opp)
  assert.ok(pkg, 'a package is suggested')
  const ctx = buildGivabilityContext(me, all)
  const net = assets => {
    const fit = buildPartnerFit(assets, [target], opp, all)
    const pain = assets.reduce((s, a) => s + assetKeepScore(a, ctx), 0)
    return (APPEAL_BONUS[fit?.appeal] ?? 0) - pain
  }
  const chosenNet = net(pkg.assets)
  // Every single-asset package inside the same band is a candidate the search saw.
  me.players
    .filter(p => assetKeepScore({ type: 'player', ...p }, ctx) < PROTECT_THRESHOLD)
    .filter(p => p.value >= target.value * 0.9 && p.value <= target.value * 1.15)
    .forEach(p => {
      const rival = [{ type: 'player', name: p.name, value: p.value, sleeperId: p.sleeperId, position: p.position, age: p.age }]
      assert.ok(chosenNet >= net(rival) - 1e-9,
        `${p.name} scores better on appeal-minus-cost than the package that was chosen`)
    })
  // The protect threshold still binds first — the trade-off never unlocks a core asset.
  pkg.assets.forEach(a => assert.ok(assetKeepScore(a, ctx) < PROTECT_THRESHOLD))
})

test('APPEAL_BONUS keeps Weak near-prohibitive and Strong a small nudge', () => {
  // The asymmetry is the point: a Weak package means the offer goes unanswered
  // (§4e-v), while Strong-over-Fair is negotiating comfort. Pinning the SHAPE,
  // not the exact values, so retuning inside the plateau stays free.
  assert.ok(APPEAL_BONUS.Weak <= -1, 'Weak must cost about a whole untouchable-tier asset')
  assert.equal(APPEAL_BONUS.Fair, 0, 'Fair is the reference point')
  assert.ok(APPEAL_BONUS.Strong > 0 && APPEAL_BONUS.Strong < 0.6,
    'Strong is a nudge — above ~0.6 the rule collapses back to lexicographic')
})

test('Layer 4 scores a filled deficit and the lineup gain it causes ONCE', () => {
  // A "fill" is defined as an arriving player who STARTS at a position they are
  // below average in — which is exactly what raises their startersDelta. Before
  // the fix both fired, so one event earned the 2 points that mean Strong.
  const P = (id, name, pos, value) =>
    ({ sleeperId: id, name, position: pos, value, age: 25, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, players, picks: [], totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  // Partner holds no TE at all, so TE is a clear deficit for them.
  const opp = mk(2, [P('b1', 'Their QB', 'QB', 3000), P('b2', 'Their RB', 'RB', 3000),
    P('b3', 'Their WR', 'WR', 3000)])
  const others = [1, 3, 4].map(i => mk(i, [P(`${i}1`, `QB${i}`, 'QB', 3000),
    P(`${i}2`, `RB${i}`, 'RB', 3000), P(`${i}3`, `WR${i}`, 'WR', 3000), P(`${i}4`, `TE${i}`, 'TE', 3000)]))
  const all = [others[0], opp, others[1], others[2]]

  // Two arms that take the SAME player out of their roster (so `weakens` and
  // the value read are identical) and differ only in whether the incoming
  // player lands on a position they are short at. Send 4,000 for a 3,000 so
  // their lineup genuinely GAINS — an equal swap nets zero and would not
  // exercise the branch at all.
  const takeRB = [{ ...opp.players[1], type: 'player' }]
  const fit = buildPartnerFit(
    [{ ...P('x1', 'Big TE', 'TE', 4000), type: 'player' }], takeRB, opp, all)
  const noFillFit = buildPartnerFit(
    [{ ...P('x2', 'Big WR', 'WR', 4000), type: 'player' }], takeRB, opp, all)

  assert.ok(fit.fills.includes('TE'), 'the TE fills their deficit')
  assert.ok(fit.startersDelta > 0, 'and therefore raises their starting lineup')
  assert.deepEqual(noFillFit.fills, [], 'the control fills nothing')
  assert.equal(noFillFit.startersDelta, fit.startersDelta, 'both arms move their lineup equally')
  assert.deepEqual(noFillFit.weakens, fit.weakens, 'both arms cost them the same position')

  // Both facts still RENDER — naming where the hole is, is information the
  // delta alone does not carry.
  assert.ok(fit.reasons.some(r => r.includes('TE deficit')))
  assert.ok(fit.reasons.some(r => r.includes('starting lineup gains')))

  // But they are worth ONE point between them. Before the fix the fill added a
  // second point for the same event, and this equality was 1 apart — which is
  // exactly the gap between `Fair` and `Strong`.
  assert.equal(fit.appealScore, noFillFit.appealScore,
    'a filled deficit adds no point beyond the lineup gain that IS the fill')
})

test('a material drop in MY starting lineup downgrades an Accept, and only downgrades', () => {
  const P = (id, name, pos, value) =>
    ({ sleeperId: id, name, position: pos, value, age: 25, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, players, picks: [], totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  // I am below league average at WR, so acquiring a starting WR "fills a need"
  // and the position COUNT balances against the RB I ship — the exact tie that
  // let an Accept sit on top of a worse lineup.
  const me = mk(1, [
    P('m1', 'My QB', 'QB', 6000),
    // Age 32 deliberately: Layer 3's Contending branch scores -1 for "giving up
    // proven starters" on any player over 5,000 aged <= 30, which would knock
    // the base verdict off Accept and leave this test measuring nothing.
    { ...P('m2', 'My RB1', 'RB', 9000), age: 32 },
    P('m3', 'My RB2', 'RB', 5000),
    P('m4', 'My WR1', 'WR', 1200), P('m5', 'My WR2', 'WR', 1100), P('m6', 'My TE', 'TE', 3000),
  ])
  const opp = mk(2, [P('o1', 'Their QB', 'QB', 6000), P('o2', 'Their RB', 'RB', 3000),
    P('o3', 'Their WR', 'WR', 8600), P('o4', 'Their TE', 'TE', 3000)])
  const others = [3, 4].map(i => mk(i, [P(`${i}1`, `QB${i}`, 'QB', 6000),
    P(`${i}2`, `RB${i}`, 'RB', 5000), P(`${i}3`, `WR${i}`, 'WR', 5000), P(`${i}4`, `TE${i}`, 'TE', 3000)]))
  const all = [me, opp, ...others]

  const give = [{ ...me.players[1], type: 'player' }]   // My RB1, 9000
  const get  = [{ ...opp.players[2], type: 'player' }]  // Their WR, 8600
  const a = analyzeTrade(give, get, me, opp, all)

  assert.equal(typeof a.myStartersDelta, 'number', 'my own lineup delta is measured at all')
  assert.ok(a.myStartersDelta < 0, 'this specific swap lowers my best starting lineup')
  assert.ok(a.myLineupMaterial, 'and by more than the materiality floor')

  const v = getTradeVerdict(a)
  assert.notEqual(v.verdict, 'Accept', 'a materially worse lineup cannot be a clean Accept')
  assert.equal(v.verdict, 'Counter', 'the gate downgrades to Counter, never to Decline')
  assert.match(v.reasoning, /starting lineup drops/)
})

test('the lineup gate never fires on noise, and never upgrades a verdict', () => {
  const P = (id, name, pos, value) =>
    ({ sleeperId: id, name, position: pos, value, age: 25, isIR: false, isTaxi: false })
  const mk = (rosterId, players) => ({
    rosterId, players, picks: [], totalValue: players.reduce((s, p) => s + p.value, 0),
    pickCapitalScore: 0, avgStarterAge: 26,
  })
  const me = mk(1, [
    P('m1', 'My QB', 'QB', 6000), P('m2', 'My RB1', 'RB', 5000), P('m3', 'My RB2', 'RB', 5000),
    P('m4', 'My WR1', 'WR', 5000), P('m5', 'My WR2', 'WR', 5000), P('m6', 'My TE', 'TE', 5000),
  ])
  const opp = mk(2, [P('o1', 'Their QB', 'QB', 6000), P('o2', 'Their RB', 'RB', 4999),
    P('o3', 'Their WR', 'WR', 5000), P('o4', 'Their TE', 'TE', 5000)])
  const others = [3, 4].map(i => mk(i, [P(`${i}1`, `QB${i}`, 'QB', 6000),
    P(`${i}2`, `RB${i}`, 'RB', 5000), P(`${i}3`, `WR${i}`, 'WR', 5000), P(`${i}4`, `TE${i}`, 'TE', 5000)]))
  const all = [me, opp, ...others]
  // A 1-point lineup move on a ~30,000 lineup — far under MY_LINEUP_MATERIAL_PCT.
  const a = analyzeTrade(
    [{ ...me.players[1], type: 'player' }], [{ ...opp.players[1], type: 'player' }], me, opp, all)
  assert.equal(a.myLineupMaterial, false, 'a 1-point move is noise, not a signal')

  // And the gate is one-directional: a lineup GAIN never lifts a Decline.
  const bad = analyzeTrade(
    [{ type: 'pick', name: '2027 1st', value: 9000 }],
    [{ type: 'pick', name: '2027 4th', value: 500 }], me, opp, all)
  assert.equal(getTradeVerdict(bad).verdict, 'Decline',
    'no lineup number rescues a trade that loses on value')
})
