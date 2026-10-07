// tests/faabBid.test.mjs — pins utils/faabBid.js, the FAAB bid recommender
// (OPEN-3; docs/analysis/faab-bid-corpus-2026-08.md §6 and §10).
//
// Behaviors pinned (with their source):
//  - CLAUDE.md League Context: the budget is READ from league settings, never
//    assumed — it went $100 → $1000 for 2026 — and `waiver_budget_used` is
//    the CURRENT period only, because the budget resets twice a league year.
//  - Owner decision 2026-10-07: the uncontested floor is what this league
//    actually pays ($0–2 on $1000), not the spec's 1% ($10).
//  - Memo §6 Part B/C: the 11 / 16 / 23% ladder against the FULL budget,
//    scaled 0.8× weeks 1–4, 1.0× 5–14, 0.3× from 15, capped at what is left.
//  - Rule 7 + the one-defense doctrine: no fabricated bid for an unpriced
//    player, and never a bid for a defense.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  recommendFaabBid, readFaabPeriod, faabSeasonMultiplier, faabFloor,
  FAAB_LADDER_PCT, FAAB_CALIBRATION,
} from '../src/utils/faabBid.js'
import { buildPickupContext, recommendFreeAgents } from '../src/utils/recommendations.js'
import { LEAGUE, MINE, PLAYER_MAP, player, roster, USER } from './helpers/mcpFixtures.mjs'

const INFO_1000 = { settings: { waiver_budget: 1000 } }
const fa = (o) => ({ ...player({ ...o, id: o.id ?? '900' }) })
const bid = (p, { info = INFO_1000, mine = MINE, all = LEAGUE.allRosters, week = 6, regular = true } = {}) =>
  recommendFaabBid(p, mine, all, { period: readFaabPeriod(info, mine), week, isRegularSeason: regular })

// ── The budget is read, never assumed ──────────────────────────────────────

test('readFaabPeriod reads the budget from settings and the CURRENT period from waiver_budget_used', () => {
  // MINE has spent 250 of this period — the remainder is budget minus that,
  // never reconciled against a transaction-log total.
  assert.deepEqual(readFaabPeriod(INFO_1000, MINE), { budget: 1000, spent: 250, remaining: 750, bidMin: 0 })
  assert.equal(readFaabPeriod({ settings: { waiver_budget: 100 } }, { faabSpent: 30 }).remaining, 70)
})

test('a league that does not report its budget gets NO bid — never an assumed 100 or 1000', () => {
  assert.equal(readFaabPeriod({ settings: {} }, MINE), null)
  assert.equal(readFaabPeriod(null, MINE), null)
  const b = recommendFaabBid(fa({ name: 'X', pos: 'WR', value: 1400 }), MINE, LEAGUE.allRosters, { period: null })
  assert.equal(b.bid, null)
  assert.equal(b.unavailable, 'budget-unknown')
})

test('the same rule scales to the budget it reads: $1000 and $100 give the same PERCENT', () => {
  const wr = PLAYER_MAP[50]
  const big = bid(wr)
  const small = bid(wr, { info: { settings: { waiver_budget: 100 } }, mine: { ...MINE, faabSpent: 0 } })
  assert.equal(big.bid, 230)
  assert.equal(small.bid, 23)
  assert.equal(big.pctOfBudget, small.pctOfBudget)
})

// ── The tiers ──────────────────────────────────────────────────────────────

test('must-win: fills a need AND starts in my best lineup → 23% of the full budget', () => {
  // MINE is below average at WR with one healthy receiver, so a 1,400 WR
  // takes the empty WR2 slot.
  const b = bid(PLAYER_MAP[50])
  assert.equal(b.tier, 'must-win')
  assert.ok(b.fillsNeed && b.startsForMe)
  assert.equal(b.bid, 1000 * FAAB_LADDER_PCT['must-win'] / 100)
  assert.equal(b.pctOfBudget, 23)
})

test('floor: a player who neither fills a need nor beats my depth costs the uncontested floor — $2 on $1000', () => {
  // MINE has three QBs (7000/5000/3000); a 900 QB is neither a need nor an upgrade.
  const b = bid(PLAYER_MAP[51])
  assert.equal(b.tier, 'floor')
  assert.equal(b.bid, 2)
  assert.equal(b.pctOfBudget, 0.2)
})

test('the floor is $1 at the old $100 scale — the 2023–25 uncontested median — and never under waiver_bid_min', () => {
  assert.equal(faabFloor({ budget: 100, bidMin: 0 }), 1)
  assert.equal(faabFloor({ budget: 1000, bidMin: 0 }), 2)
  assert.equal(faabFloor({ budget: 1000, bidMin: 5 }), 5)
})

test('the floor is NOT the spec\'s 1% — owner decision 2026-10-07', () => {
  assert.notEqual(faabFloor({ budget: 1000, bidMin: 0 }), 10)
})

// A two-roster league built so each middle tier is reachable on purpose.
function tierLeague() {
  const me = roster(1, USER('a', 'Me', 'me'), [
    player({ id: 'q1', name: 'Q1', pos: 'QB', value: 6000 }),
    player({ id: 'q2', name: 'Q2', pos: 'QB', value: 5000 }),
    player({ id: 'r1', name: 'R1', pos: 'RB', value: 3000 }),
    player({ id: 'r2', name: 'R2', pos: 'RB', value: 3000 }),
    player({ id: 'r3', name: 'R3', pos: 'RB', value: 3000 }),
    player({ id: 'r4', name: 'R4', pos: 'RB', value: 3000 }),
    player({ id: 'r5', name: 'R5', pos: 'RB', value: 3000 }),
    player({ id: 'w1', name: 'W1', pos: 'WR', value: 3000 }),
    player({ id: 'w2', name: 'W2', pos: 'WR', value: 3000 }),
    player({ id: 'w3', name: 'W3', pos: 'WR', value: 3000 }),
    player({ id: 'w4', name: 'W4', pos: 'WR', value: 3000 }),
    player({ id: 't1', name: 'T1', pos: 'TE', value: 400 }),
    player({ id: 't2', name: 'T2', pos: 'TE', value: 400 }),
  ], [], { faabSpent: 0 })
  const them = roster(2, USER('b', 'Them', 'them'), [
    player({ id: 'x1', name: 'X1', pos: 'QB', value: 3000 }),
    player({ id: 'x2', name: 'X2', pos: 'RB', value: 1000 }),
    player({ id: 'x3', name: 'X3', pos: 'WR', value: 1000 }),
    player({ id: 'x4', name: 'X4', pos: 'TE', value: 5000 }),
  ])
  return { me, all: [me, them] }
}

test('value play: at a need but no better than my depth → 11%', () => {
  const { me, all } = tierLeague()
  // TE is my need (400 vs their 5000); a 300 TE is no upgrade and cannot start.
  const b = bid(fa({ id: 't9', name: 'T9', pos: 'TE', value: 300 }), { mine: me, all })
  assert.equal(b.tier, 'value')
  assert.equal(b.bid, 110)
})

test('default: an upgrade that starts, at a position I am NOT short at → 16%', () => {
  const { me, all } = tierLeague()
  // 4,000 RB beats a 3,000 FLEX; RB is a surplus, not a need.
  const b = bid(fa({ id: 'r9', name: 'R9', pos: 'RB', value: 4000 }), { mine: me, all })
  assert.equal(b.fillsNeed, false)
  assert.equal(b.startsForMe, true)
  assert.equal(b.tier, 'default')
  assert.equal(b.bid, 160)
})

// ── Part C — the week ──────────────────────────────────────────────────────

test('the ladder scales by week: 0.8× in weeks 1–4, 1.0× in 5–14, 0.3× from 15', () => {
  assert.equal(faabSeasonMultiplier(1, true), 0.8)
  assert.equal(faabSeasonMultiplier(4, true), 0.8)
  assert.equal(faabSeasonMultiplier(5, true), 1)
  assert.equal(faabSeasonMultiplier(14, true), 1)
  assert.equal(faabSeasonMultiplier(15, true), 0.3)
  assert.equal(bid(PLAYER_MAP[50], { week: 3 }).bid, 184)
  assert.equal(bid(PLAYER_MAP[50], { week: 16 }).bid, 69)
})

test('the offseason applies no week scaling, and the floor never scales', () => {
  assert.equal(faabSeasonMultiplier(0, false), 1)
  assert.equal(bid(PLAYER_MAP[50], { regular: false, week: null }).bid, 230)
  assert.equal(bid(PLAYER_MAP[51], { week: 16 }).bid, 2)
})

// ── Money it does not have ─────────────────────────────────────────────────

test('a bid is capped at what is left THIS period, and says so', () => {
  const broke = { ...MINE, faabSpent: 950 }
  const b = bid(PLAYER_MAP[50], { mine: broke })
  assert.equal(b.bid, 50)
  assert.equal(b.capped, true)
  assert.ok(b.reasons.some(r => r.includes('$50')))
  const empty = bid(PLAYER_MAP[50], { mine: { ...MINE, faabSpent: 1000 } })
  assert.equal(empty.bid, 0)
})

test('the ladder is priced against the FULL budget, not the remainder', () => {
  // $600 left of $1000: 23% of the budget is $230, not 23% of $600 ($138).
  const b = bid(PLAYER_MAP[50], { mine: { ...MINE, faabSpent: 400 } })
  assert.equal(b.bid, 230)
  assert.equal(b.capped, false)
})

// ── Rule 7 and the one-defense doctrine ────────────────────────────────────

test('a defense never gets a bid', () => {
  const b = bid({ sleeperId: '40', name: 'Free Defense', position: 'DEF', value: 0 })
  assert.equal(b.bid, null)
  assert.equal(b.unavailable, 'defense')
})

test('an unpriced player gets NO bid, never a fabricated one or a 0', () => {
  for (const p of [fa({ name: 'Stash', pos: 'WR', unranked: true }), { sleeperId: '9', position: 'WR', value: null }]) {
    const b = bid(p)
    assert.equal(b.bid, null)
    assert.equal(b.unavailable, 'unpriced')
  }
})

// ── Shared definitions ─────────────────────────────────────────────────────

test('the bid reads the SAME pickup context as recommendFreeAgents, so "fills your need" agrees', () => {
  const ctx = buildPickupContext(MINE, LEAGUE.allRosters)
  const recs = recommendFreeAgents(Object.values(PLAYER_MAP).filter(p => ['50', '51'].includes(p.sleeperId)),
    MINE, LEAGUE.allRosters, { limit: 10, minValue: 0 })
  recs.forEach(r => {
    const b = recommendFaabBid(r.player, MINE, LEAGUE.allRosters, { period: readFaabPeriod(INFO_1000, MINE), ctx })
    assert.equal(b.fillsNeed, r.isNeed)
    assert.equal(b.isUpgrade, r.isUpgrade)
  })
  // Passing the context in never changes the answer.
  const p = PLAYER_MAP[50]
  const period = readFaabPeriod(INFO_1000, MINE)
  assert.deepEqual(
    recommendFaabBid(p, MINE, LEAGUE.allRosters, { period, ctx }),
    recommendFaabBid(p, MINE, LEAGUE.allRosters, { period }),
  )
})

test('the calibration label names both eras honestly', () => {
  assert.match(FAAB_CALIBRATION, /2023–25 at \$100/)
  assert.match(FAAB_CALIBRATION, /contested auctions on \$1000/)
})
