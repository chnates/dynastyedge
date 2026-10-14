// tests/mcpRecommendFreeAgents.test.mjs — pins recommend_free_agents.
//
// Behaviors pinned (with their source):
//  - CLAUDE.md League Context, owner doctrine 2026-09-04: "the app must NEVER
//    suggest adding a defense as a pickup". Prerequisite C enforces that by
//    construction; this pins that the tool does not route around it.
//  - CLAUDE.md Feature 1, free agents: TWO AXES. Dynasty value and this
//    week's projection correlate at only r = 0.427, so the projection rides
//    beside the value and never folds into the ranking.
//  - CLAUDE.md, "Weekly tools are in-season only": the offseason must SAY so
//    rather than return zeros.
//  - MCP_DISCOVERY.md §7: bounded output, true count beside the capped one.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildFreeAgentAnswer, renderFreeAgentText, MAX_LIMIT, DEFAULT_LIMIT, DEFAULT_POOL_LIMIT, MAX_POOL_LIMIT,
  MAX_VALUE_SWAPS,
} from '../mcp/tools/recommendFreeAgents.js'
import { makeSnapshot, makeWeekly, makeOffseasonWeekly, LEAGUE } from './helpers/mcpFixtures.mjs'
import { buildValueSwaps, buildFreeAgentPool } from '../src/utils/freeAgents.js'

const build = (args = {}, weekly = makeWeekly(), snapOver = {}) =>
  buildFreeAgentAnswer(makeSnapshot(snapOver), weekly, { myRosterId: 6, ...args })

// ── THE STANDING RULE: a defense is never a general pickup ────────────────

test('no defense ever appears in the general recommendation list', () => {
  const a = build({ limit: MAX_LIMIT })
  assert.ok(a.ok)
  assert.ok(
    a.recommendations.every(p => p.position !== 'DEF'),
    'buildFreeAgentPool cannot return a defense; the tool must not add one back'
  )
})

test('asking for DEF is refused with the reason, not served', () => {
  const a = build({ position: 'DEF' })
  assert.equal(a.ok, false)
  assert.match(a.error, /never a general pickup/i)
  assert.match(a.error, /exactly one/i)
})

test('the DEF refusal still answers the one real question — which defense do I have', () => {
  const a = build({ position: 'DEF' })
  // Refusing is right; refusing WITHOUT the incumbent would be unhelpful.
  assert.ok(a.incumbentDefense)
  assert.equal(a.incumbentDefense.rostered.name, 'Kansas City Chiefs')
  // A defense is never FantasyCalc-ranked.
  assert.equal(a.incumbentDefense.rostered.value, null)
})

test('the DEF refusal turns urgent when NO defense is rostered', () => {
  const noDef = {
    ...LEAGUE,
    myRoster: { ...LEAGUE.myRoster, players: LEAGUE.myRoster.players.filter(p => p.position !== 'DEF') },
  }
  noDef.allRosters = [noDef.myRoster, ...LEAGUE.allRosters.slice(1)]
  const a = build({ position: 'DEF' }, makeWeekly(), { league: noDef })
  assert.equal(a.incumbentDefense.rostered, null)
  assert.match(a.incumbentDefense.note, /NO defense/i)
})

test('the notes state the exclusion so the absence is never read as a gap', () => {
  const a = build()
  assert.ok(a.notes.some(n => /defenses are excluded by design/i.test(n)))
})

// ── two axes ──────────────────────────────────────────────────────────────

test('in season a recommendation carries BOTH dynasty value and a projection', () => {
  const a = build()
  const withProj = a.recommendations.filter(p => p.projectedPoints != null)
  assert.ok(withProj.length > 0, 'the fixture projMap covers the available pool')
  assert.equal(a.projections.available, true)
  assert.equal(a.projections.week, 3)
})

test('the ranking is by dynasty value, NOT by projection', () => {
  const a = build({ limit: MAX_LIMIT })
  // Available Quarterback projects 17.2 against Available Wideout's 9.4, but
  // the WR fills a deficit and the engine scores in dynasty value, so
  // projection order must not drive the list.
  const qb = a.recommendations.find(p => p.sleeperId === '51')
  const wr = a.recommendations.find(p => p.sleeperId === '50')
  if (qb && wr) {
    assert.ok(qb.projectedPoints > wr.projectedPoints, 'fixture sanity')
    assert.ok(
      a.recommendations.indexOf(wr) < a.recommendations.indexOf(qb),
      'the deficit-filling WR must outrank the higher-projecting QB'
    )
  }
})

test('the two-axis caveat is stated whenever a projection is shown', () => {
  const a = build()
  assert.ok(a.notes.some(n => /0\.427/.test(n)), 'the measured correlation must be quoted')
})

// ── in-season only: the offseason SAYS so, never zeros ────────────────────

test('offseason returns projectedPoints null — never 0', () => {
  const a = build({}, makeOffseasonWeekly(), { isOffseason: true })
  assert.equal(a.ok, true)
  assert.equal(a.projections.available, false)
  a.recommendations.forEach(p =>
    assert.equal(p.projectedPoints, null,
      `${p.name}: a missing projection is null; 0 would read as "not worth starting"`))
})

test('offseason states WHY the projection is absent', () => {
  const a = build({}, makeOffseasonWeekly(), { isOffseason: true })
  assert.match(a.projections.reason, /offseason/i)
  assert.ok(a.notes.some(n => /offseason/i.test(n)))
})

test('a failed in-season projection fetch is distinguished from the offseason', () => {
  const failed = makeWeekly({ available: false, projMap: null, notes: ['projections did not load'] })
  const a = build({}, failed)
  assert.equal(a.projections.available, false)
  assert.match(a.projections.reason, /did not load/i)
  assert.doesNotMatch(a.projections.reason, /offseason/i)
})

// ── bounded output ────────────────────────────────────────────────────────

test('limit defaults, clamps to MAX_LIMIT, and rejects nonsense', () => {
  assert.equal(build({}).filter.limit, DEFAULT_LIMIT)
  assert.equal(build({ limit: 999 }).filter.limit, MAX_LIMIT)
  assert.equal(build({ limit: 0 }).filter.limit, DEFAULT_LIMIT)
  assert.equal(build({ limit: -3 }).filter.limit, DEFAULT_LIMIT)
})

test('the true count is reported beside the capped one (§7)', () => {
  const a = build({ limit: 1 })
  assert.equal(a.recommendations.length, 1)
  assert.ok(a.counts.recommendedTotal >= a.recommendations.length)
  assert.ok(a.counts.poolSize >= a.counts.recommendedTotal)
})

// ── filters ───────────────────────────────────────────────────────────────

test('a position filter returns only that position', () => {
  const a = build({ position: 'WR' })
  assert.ok(a.ok)
  a.recommendations.forEach(p => assert.equal(p.position, 'WR'))
})

test('an unknown position is rejected with the valid set', () => {
  const a = build({ position: 'K' })
  assert.equal(a.ok, false)
  assert.match(a.error, /QB, RB, WR, TE/)
})

test('a rostered player is never recommended', () => {
  const a = build({ limit: MAX_LIMIT })
  const rosteredIds = new Set(
    LEAGUE.allRosters.flatMap(r => r.players.map(p => String(p.sleeperId)))
  )
  a.recommendations.forEach(p =>
    assert.ok(!rosteredIds.has(p.sleeperId), `${p.name} is already rostered`))
})

// ── provenance ────────────────────────────────────────────────────────────

test('carries the as-of stamp and the FAAB the claim would be paid from', () => {
  const a = build()
  assert.ok(a.asOf.generatedAt)
  assert.equal(a.team.faabDisplay, '$750')
  assert.ok(a.notes.some(n => /read-only/i.test(n)))
})

test('weekly notes are carried through, not swallowed', () => {
  const a = build({}, makeWeekly({ notes: ['the schedule did not load'] }))
  assert.ok(a.notes.some(n => /schedule did not load/.test(n)))
})

test('the text rendering names the projection and the reasons', () => {
  const txt = renderFreeAgentText(build())
  assert.ok(txt.includes('As of'))
  assert.ok(/proj /.test(txt), 'the in-season projection column must render')
})

test('the DEF refusal renders as prose, not an empty list', () => {
  const txt = renderFreeAgentText(build({ position: 'DEF' }))
  assert.match(txt, /never a general pickup/i)
  assert.match(txt, /Kansas City Chiefs/)
})

// ── The FAAB bid (OPEN-3) — the app's util, never math in mcp/ ────────────

test('every recommendation carries the SAME bid utils/faabBid.js gives the app', async () => {
  const { recommendFaabBid, readFaabPeriod } = await import('../src/utils/faabBid.js')
  const a = build()
  assert.ok(a.recommendations.length)
  const period = readFaabPeriod(LEAGUE.leagueInfo, LEAGUE.myRoster)
  a.recommendations.forEach(r => {
    const p = makeSnapshot().values.playerMap[r.sleeperId]
    const direct = recommendFaabBid(p, LEAGUE.myRoster, LEAGUE.allRosters, {
      period, week: 3, isRegularSeason: true,
    })
    assert.equal(r.faabBid.bid, direct.bid)
    assert.equal(r.faabBid.tier, direct.tier)
  })
})

test('the faab block reports the CURRENT period read from settings, the week scaling, and the honest label', () => {
  const a = build()
  assert.equal(a.faab.budget, 1000)
  assert.equal(a.faab.remaining, 750)
  assert.equal(a.faab.week, 3)
  assert.equal(a.faab.multiplier, 0.8)
  assert.match(a.faab.calibration, /2023–25 at \$100; n = \d+ contested auctions on \$1000/)
  assert.match(renderFreeAgentText(a), /Bid \$\d+/)
  assert.ok(a.notes.some(n => /Order your claims/.test(n)))
})

test('a league that does not report its budget gets null bids, not an assumed scale', () => {
  const snap = makeSnapshot()
  snap.league = { ...snap.league, leagueInfo: { ...snap.league.leagueInfo, settings: {} } }
  const a = buildFreeAgentAnswer(snap, makeWeekly(), { myRosterId: 6 })
  assert.ok(a.recommendations.length)
  a.recommendations.forEach(r => {
    assert.equal(r.faabBid.bid, null)
    assert.equal(r.faabBid.unavailable, 'budget-unknown')
  })
  assert.equal(a.faab.budget, null)
})

// ── one pickup per position (owner, 2026-10-07) ────────────────────────────
test('no position repeats; same-position runners-up are alternatives with NO bid', () => {
  const a = build({ limit: MAX_LIMIT })
  const positions = a.recommendations.map(r => r.position)
  assert.equal(new Set(positions).size, positions.length, `a position repeats: ${positions}`)
  for (const r of a.recommendations) {
    assert.ok(Array.isArray(r.alternatives))
    for (const alt of r.alternatives) assert.equal('faabBid' in alt, false, 'an alternative never carries a bid')
  }
  assert.ok(a.notes.some(n => /ONE pickup per position/.test(n)))
})

// ── THE POOL (owner, 2026-10-14): "across the board" without asking for names ─
// The weekly brief could see one pick per position and asked the owner to open
// Sleeper and read names. `pool` is every available player by dynasty value,
// bounded with the true total, and it never carries a bid.

test('pool: every available player, ranked by dynasty value, bounded with the true count', () => {
  const a = build({ poolLimit: 3 })
  assert.ok(a.ok)
  assert.ok(a.pool.length <= 3)
  assert.equal(a.counts.poolShown, a.pool.length)
  assert.ok(a.counts.poolSize >= a.pool.length, 'the true pool size sits beside the capped list')
  const values = a.pool.map(p => p.value)
  assert.deepEqual(values, [...values].sort((x, y) => y - x), 'value, descending')
  assert.ok(a.pool.every(p => p.position !== 'DEF'), 'the pool is the general pool — never a defense')
})

test('pool rows carry no bid, and every pick appears with role "pick"', () => {
  const a = build({ poolLimit: MAX_POOL_LIMIT })
  assert.ok(a.pool.every(p => !('faabBid' in p)), 'a bid on every row invites claiming two')
  const picks = new Set(a.recommendations.map(r => r.sleeperId))
  a.pool.filter(p => picks.has(p.sleeperId)).forEach(p => assert.equal(p.role, 'pick'))
  assert.ok(a.pool.every(p => ['pick', 'alternative', 'available'].includes(p.role)))
})

test('poolLimit defaults and clamps', () => {
  assert.ok(build().pool.length <= DEFAULT_POOL_LIMIT)
  assert.ok(build({ poolLimit: 999 }).pool.length <= MAX_POOL_LIMIT)
  assert.ok(build({ poolLimit: -4 }).pool.length <= DEFAULT_POOL_LIMIT)
})

test('the position filter narrows the pool too', () => {
  const a = build({ position: 'WR', poolLimit: MAX_POOL_LIMIT })
  assert.ok(a.pool.every(p => p.position === 'WR'))
})

// ── Value swaps (owner, 2026-10-14) ─────────────────────────────────────────
// The SAME list League › Free Agents shows — utils/freeAgents.js's rule, never
// a copy — bounded, with no bid, and never dropping a starter, taxi or IR player.
test('valueSwaps is the app\'s buildValueSwaps over the same pool, bounded and bid-less', () => {
  const snap = makeSnapshot()
  const a = buildFreeAgentAnswer(snap, makeWeekly(), { myRosterId: 6 })
  const pool = buildFreeAgentPool({ fcPlayerMap: snap.values.playerMap, allRosters: snap.league.allRosters })
  const app = buildValueSwaps(pool, snap.league.myRoster)
  assert.equal(a.valueSwaps.count, app.count)
  assert.equal(a.valueSwaps.totalGain, app.totalGain)
  assert.deepEqual(a.valueSwaps.rows.map(r => [r.add.sleeperId, r.drop.sleeperId, r.gain]),
    app.swaps.slice(0, MAX_VALUE_SWAPS).map(s => [String(s.add.sleeperId), String(s.drop.sleeperId), s.gain]))
  assert.ok(a.valueSwaps.rows.length <= MAX_VALUE_SWAPS)
  assert.ok(a.valueSwaps.rows.every(r => !('faabBid' in r)), 'a swap is a value move — no bid')
  const mine = new Map(snap.league.myRoster.players.map(p => [String(p.sleeperId), p]))
  a.valueSwaps.rows.forEach(r => {
    const d = mine.get(r.drop.sleeperId)
    assert.ok(d && !d.isTaxi && !d.isIR && !d.isStarter, 'the drop frees an active bench spot')
    assert.equal(d.position, r.position)
    assert.ok(r.gain > 0)
    if (d.unranked) assert.equal(r.drop.value, null, 'rule 7 — an unranked drop is null, never 0')
  })
})

test('the text names the value swaps when there are any', () => {
  const a = build()
  const t = renderFreeAgentText(a)
  if (a.valueSwaps.count) assert.match(t, /Value swaps — \d+/)
  assert.ok(a.notes.some(n => n.includes('valueSwaps')), 'the note explains what a swap is')
})
