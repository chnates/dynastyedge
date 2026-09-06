// tests/tradeContext.test.mjs — pins the five negotiating signals layered onto
// the Trade Analyzer (CLAUDE.md Feature 3: fair band, scarcity, roster space,
// weekly impact, partner activity).
//
// The load-bearing contract across all five: NONE of them may move the verdict
// (owner call 2026-09-06). They change what you understand and how you
// negotiate, not the Accept/Decline/Counter call.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { analyzeTrade, getTradeVerdict, buildFairBand, buildTradePitch } from '../src/utils/tradeAnalysis.js'
import { getRosterLimits, buildRosterSpace } from '../src/utils/rosterSpace.js'
import { buildReplacementLevels, assetVorp } from '../src/utils/positionalValue.js'
import { buildPartnerActivity } from '../src/utils/partnerActivity.js'

const P = (id, name, pos, value, extra = {}) =>
  ({ sleeperId: id, name, position: pos, value, age: 26, isIR: false, isTaxi: false, ...extra })

const LEAGUE_INFO = {
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'SUPER_FLEX', 'DEF',
    ...Array(13).fill('BN')],
  settings: { taxi_slots: 5, reserve_slots: 2 },
}

// ── Roster space ────────────────────────────────────────────────────────────

test('roster limits come from the league roster_positions, not a constant', () => {
  // CLAUDE.md's prose said 12 bench; the league actually carries 13 (24 active).
  const limits = getRosterLimits(LEAGUE_INFO)
  assert.equal(limits.activeSlots, 24)
  assert.equal(limits.taxiSlots, 5)
  assert.equal(limits.irSlots, 2)
})

test('taxi and IR players occupy no active slot, so dealing one frees nothing', () => {
  const limits = getRosterLimits(LEAGUE_INFO)
  const roster = {
    players: [
      ...Array.from({ length: 20 }, (_, i) => P(`a${i}`, `A${i}`, 'WR', 100)),
      P('taxi1', 'Taxi', 'RB', 100, { isTaxi: true }),
      P('ir1', 'Hurt', 'RB', 100, { isIR: true }),
    ],
  }
  const before = buildRosterSpace(roster, { limits })
  assert.equal(before.before, 20)

  // Trading the taxi player away frees no ACTIVE slot — the arrival still costs one.
  const s = buildRosterSpace(roster, {
    arrivals: [P('new', 'New', 'WR', 100)],
    departures: [P('taxi1', 'Taxi', 'RB', 100)],
    limits,
  })
  assert.equal(s.after, 21)
  assert.equal(s.net, 1)
})

test('over the cap is reported as owed drops, never as an illegal trade', () => {
  // Nine of ten teams were over the cap the week after the rookie draft — being
  // over it is a normal transient state, so nothing here refuses the trade.
  const limits = getRosterLimits(LEAGUE_INFO)
  const roster = { players: Array.from({ length: 26 }, (_, i) => P(`p${i}`, `P${i}`, 'WR', 100)) }
  const s = buildRosterSpace(roster, {
    arrivals: [P('in', 'In', 'WR', 100)],
    departures: [P('p0', 'P0', 'WR', 100), P('p1', 'P1', 'WR', 100)],
    limits,
  })
  assert.equal(s.overBefore, 2)
  assert.equal(s.overAfter, 1)
  assert.equal(s.net, -1)
  // A 2-for-1 into an over-cap roster pays the debt down — the pitch lever.
  assert.equal(s.relievesCrunch, true)
})

// ── Scarcity (value over replacement) ───────────────────────────────────────

// Two positions, same raw values, deliberately different depth: the QB pool
// runs barely past its starting slots, the WR pool runs far past its own.
function makeScarcityLeague() {
  const mk = (rosterId, players) => ({ rosterId, players, picks: [], totalValue: 0, pickCapitalScore: 0, avgStarterAge: 26 })
  return Array.from({ length: 4 }, (_, t) => mk(t + 1, [
    P(`${t}q1`, `QB${t}a`, 'QB', 5000 - t * 100),
    P(`${t}q2`, `QB${t}b`, 'QB', 4000 - t * 100),
    P(`${t}r1`, `RB${t}a`, 'RB', 3000 - t * 100),
    P(`${t}r2`, `RB${t}b`, 'RB', 2000 - t * 100),
    ...Array.from({ length: 8 }, (_, i) => P(`${t}w${i}`, `WR${t}-${i}`, 'WR', 4000 - i * 400 - t * 50)),
    P(`${t}t1`, `TE${t}`, 'TE', 2000 - t * 100),
  ]))
}

test('replacement level is derived from the league, and a thin pool floors higher', () => {
  const { levels, starters } = buildReplacementLevels(makeScarcityLeague())
  // Every rostered QB starts (SFLX soaks up the second), so the QB floor sits
  // high; the WR pool runs well past its starting slots, so its floor is low.
  assert.ok(levels.QB > levels.WR,
    `expected a thinner QB pool to floor higher — QB ${levels.QB} vs WR ${levels.WR}`)
  assert.ok(starters.QB > 0 && starters.WR > 0)
})

test('a pick has no position and so is never scarcity-adjusted', () => {
  const { levels } = buildReplacementLevels(makeScarcityLeague())
  assert.equal(assetVorp({ type: 'pick', name: '2027 1st', value: 2500 }, levels), 2500)
})

test('the scarcity flag stays SILENT when it agrees with raw value', () => {
  const all = makeScarcityLeague()
  const { levels } = buildReplacementLevels(all)
  const me = all[0], them = all[1]
  // Same position both ways: no cross-position distortion to correct for.
  const give = [{ ...me.players.find(p => p.position === 'WR'), type: 'player' }]
  const get  = [{ ...them.players.find(p => p.position === 'WR'), type: 'player' }]
  const a = analyzeTrade(give, get, me, them, all, { replacementLevels: levels })
  assert.equal(a.scarcity, null)
})

// ── The five never touch the verdict ────────────────────────────────────────

test('none of the five signals changes the verdict', () => {
  const all = makeScarcityLeague()
  const { levels } = buildReplacementLevels(all)
  const me = all[0], them = all[1]
  const give = [{ ...me.players.find(p => p.position === 'QB'), type: 'player' }]
  const get  = [{ ...them.players.find(p => p.position === 'WR'), type: 'player' }]

  const bare = analyzeTrade(give, get, me, them, all)
  const rich = analyzeTrade(give, get, me, them, all, {
    replacementLevels: levels,
    rosterLimits: getRosterLimits(LEAGUE_INFO),
    weeklyProjections: {
      week: 4,
      projMap: Object.fromEntries(all.flatMap(r => r.players.map(p => [String(p.sleeperId), { pts_half_ppr: 10 }]))),
    },
    partnerActivity: { count: 3, summary: 'Added X (TE).', positionsAdded: ['TE'], acquired: [], trades: 1, windowDays: 21 },
  })

  // The context all landed…
  assert.ok(rich.scarcity || rich.myRosterSpace || rich.weeklyImpact)
  assert.ok(rich.myRosterSpace && rich.theirRosterSpace)
  assert.ok(rich.weeklyImpact)
  assert.equal(rich.partnerFit.activity.summary, 'Added X (TE).')
  // …and the call is byte-identical to the one without any of it.
  assert.deepEqual(getTradeVerdict(rich), getTradeVerdict(bare))
})

// ── Fair band ───────────────────────────────────────────────────────────────

test('the fair band is the ±5% window around what you GET, measured on what you give', () => {
  const b = buildFairBand(3902, 3891)
  assert.equal(b.low, 3696)
  assert.equal(b.high, 4086)
  assert.equal(b.inside, true)
  assert.equal(b.gapToBand, 0)
})

test('the band reports the distance to its near edge in both directions', () => {
  const light = buildFairBand(3000, 4000)
  assert.equal(light.inside, false)
  assert.equal(light.gapToBand, 800)   // 3800 low edge − 3000
  const heavy = buildFairBand(5000, 4000)
  assert.equal(heavy.inside, false)
  assert.equal(heavy.gapToBand, 800)   // 5000 − 4200 high edge
})

// ── Partner activity ────────────────────────────────────────────────────────

const NOW = 1_757_000_000_000

test('partner activity reads only the moves that landed on THAT roster, in window', () => {
  const txs = [
    { type: 'trade', status_updated: NOW - 2 * 86400000, roster_ids: [8, 3], adds: { '100': 8, '200': 3 } },
    { type: 'waiver', status_updated: NOW - 5 * 86400000, roster_ids: [8], adds: { '300': 8 } },
    // Out of window, and a different roster — neither should appear.
    { type: 'trade', status_updated: NOW - 90 * 86400000, roster_ids: [8], adds: { '400': 8 } },
    { type: 'waiver', status_updated: NOW - 1 * 86400000, roster_ids: [5], adds: { '500': 5 } },
  ]
  const playerMap = new Map([
    ['100', { name: 'Kyle Pitts', position: 'TE' }],
    ['200', { name: 'Someone Else', position: 'WR' }],
    ['300', { name: 'Jordan Mason', position: 'RB' }],
    ['400', { name: 'Old Add', position: 'WR' }],
  ])
  const a = buildPartnerActivity(txs, 8, { playerMap, now: NOW })
  assert.equal(a.count, 2)
  assert.deepEqual(a.acquired.map(x => x.name), ['Kyle Pitts', 'Jordan Mason'])
  assert.deepEqual(a.positionsAdded.sort(), ['RB', 'TE'])
  assert.match(a.summary, /Kyle Pitts \(TE\)/)
})

test('a quiet partner yields a summary, never a crash or a fake move', () => {
  const a = buildPartnerActivity([{ type: 'waiver', status_updated: NOW, roster_ids: [3], adds: { '1': 3 } }], 8, { now: NOW })
  assert.equal(a.count, 0)
  assert.equal(a.summary, null)
  assert.deepEqual(a.acquired, [])
})

// ── Pitch picks up the new arguments ────────────────────────────────────────

test('the pitch names a roster spot it frees for them — the strongest lever in a capped league', () => {
  const all = makeScarcityLeague()
  const me = all[0], them = all[1]
  // Fill their roster past the cap so a 2-for-1 pays the debt down.
  them.players = [...them.players, ...Array.from({ length: 14 }, (_, i) => P(`fill${i}`, `Fill${i}`, 'WR', 50))]
  const give = [{ ...me.players.find(p => p.position === 'QB'), type: 'player' }]
  const get  = [
    { ...them.players.find(p => p.position === 'WR'), type: 'player' },
    { ...them.players.find(p => p.position === 'TE'), type: 'player' },
  ]
  const a = analyzeTrade(give, get, me, them, all, { rosterLimits: getRosterLimits(LEAGUE_INFO) })
  assert.equal(a.theirRosterSpace.relievesCrunch, true)
  const pitch = buildTradePitch(a, { partnerName: 'Them', giveAssets: give, getAssets: get })
  assert.ok(pitch.bullets.some(b => /frees you 1 roster spot/.test(b)), pitch.text)
})

test('the pitch volunteers scarcity only when it argues THEIR side', () => {
  const all = makeScarcityLeague()
  const { levels } = buildReplacementLevels(all)
  const me = all[0], them = all[1]
  // I send the scarce-position player and receive the deep-position one, so
  // scarcity favors me — the pitch must not make my opponent's case for them.
  const give = [{ ...me.players.find(p => p.position === 'QB'), type: 'player' }]
  const get  = [{ ...them.players.find(p => p.position === 'WR'), type: 'player' }]
  const a = analyzeTrade(give, get, me, them, all, { replacementLevels: levels })
  const pitch = buildTradePitch(a, { partnerName: 'Them', giveAssets: give, getAssets: get })
  if (a.scarcity?.vorpWinner === 'you') {
    assert.ok(!pitch.bullets.some(b => /against replacement/i.test(b)), pitch.text)
  }
})
