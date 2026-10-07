// tests/briefingLedger.test.mjs — pins the briefing ledger (scripts/briefingLedger.mjs),
// the daily record of what The Edge's briefing would tell the owner
// (open-items §0 #10; scoring plan docs/analysis/briefing-decision-quality-2026-10.md).
//
// Behaviors pinned (with their source):
//  - CLAUDE.md, Value history pipeline / the briefing ledger: it runs the APP'S
//    computeEdgeSignals + buildBriefing — never a copy. Pinned twice: the
//    recorded claims equal the app's on the same league, and a source scan
//    fails if a selection rule appears in the recorder.
//  - CLAUDE.md rule 7 / the permanent-archive contract: anything the recorder
//    could not read is null, NEVER 0; an unreadable day is still written,
//    named, and never overwrites a day already recorded.
//  - The ledger is PERMANENT: nothing is pruned.
//  - The alarm (check-briefing-ledger.mjs): a persistent gap fires, one missed
//    run does not; a missing or empty ledger is itself an alarm.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  recordBriefingDay, unreadableDay, mergeLedgerDay, emptyLedger, assessLedger,
  playerRow, teamRow, MAX_CANDIDATES, MAX_LEDGER_LAG_DAYS, CHECKABLE_ITEMS,
} from '../scripts/briefingLedger.mjs'
import { computeEdgeSignals, buildBriefing } from '../src/utils/edgeBriefing.js'
import { makeSnapshot, LEAGUE, MINE, VALUES } from './helpers/mcpFixtures.mjs'

const DATE = '2027-09-19'
const record = (over = {}) => recordBriefingDay({
  date: DATE, snapshot: makeSnapshot(over), myRosterId: 6, recordedAt: '2027-09-19T09:41:00.000Z',
})
const appSignals = (snap = makeSnapshot()) => computeEdgeSignals({
  league: snap.league, values: snap.values, watchlist: [], nflState: snap.nflState, myRosterId: 6,
})

// ── it records the APP's claims ──────────────────────────────────────────────

test('records exactly the players and teams computeEdgeSignals names', () => {
  const day = record()
  const s = appSignals()
  assert.equal(day.status, 'recorded')
  assert.equal(day.items.buyLow.player.sleeperId, String(s.buyLow.sleeperId))
  assert.equal(day.items.sellHigh.player.sleeperId, String(s.sellHigh.sleeperId))
  assert.equal(day.items.pickup.player.sleeperId, String(s.topPickup.player.sleeperId))
  // The fixture is built so all three fire (WR deficit, QB surplus, a WR on the wire).
  assert.equal(day.items.buyLow.player.name, 'Good Wideout')
  assert.equal(day.items.sellHigh.player.name, 'Star Quarterback')
  assert.equal(day.items.pickup.player.name, 'Available Wideout')
  assert.deepEqual(day.items.pickup.reasons, s.topPickup.reasons)
})

test('slots and the shown list are buildBriefing\'s, built with what a server can see', () => {
  const snap = makeSnapshot()
  const s = appSignals(snap)
  const items = buildBriefing({
    signals: s, transactions: null, lastVisit: null, draft: null,
    isOffseason: false, nflState: snap.nflState, tradeDeadline: null, myPlayoffPct: null,
  })
  const day = record()
  assert.deepEqual(day.briefing, items.map(i => i.id))
  for (const [id, key] of Object.entries(CHECKABLE_ITEMS)) {
    const at = items.findIndex(i => i.id === id)
    assert.equal(day.items[key].slot, at === -1 ? null : at + 1, `${id} slot`)
  }
})

test('a live draft and a near deadline push the scored items down — the recorded slot follows', () => {
  const league = {
    ...LEAGUE,
    leagueInfo: { ...LEAGUE.leagueInfo, settings: { ...LEAGUE.leagueInfo.settings, trade_deadline: 4 } },
  }
  const day = record({
    league,
    drafts: [{ draft_id: 'd1', season: '2027', type: 'snake', status: 'drafting' }],
  })
  assert.deepEqual(day.briefing.slice(0, 2), ['draft-live', 'deadline'])
  assert.equal(day.items.buyLow.slot, 3)
  assert.equal(day.items.pickup.slot, 5)
})

test('computeEdgeSignals keeps its picks as the head of the recorded pools (one rule, not two)', () => {
  const s = appSignals()
  assert.equal(s.buyLow, s.buyLowCandidates[0])
  assert.equal(s.sellHigh, s.sellHighCandidates[0])
  const day = record()
  assert.equal(day.items.buyLow.candidates.count, s.buyLowCandidates.length)
  assert.equal(day.items.buyLow.candidates.rows[0].sleeperId, day.items.buyLow.player.sleeperId)
  assert.equal(day.items.closingWindow.opponents.length, LEAGUE.allRosters.length - 1)
  assert.equal(day.items.underperformer.teams.length, LEAGUE.allRosters.length)
})

test('a comparison group is bounded, with the true count beside it', () => {
  const fallers = {}
  for (let i = 0; i < MAX_CANDIDATES + 5; i++) {
    fallers[`f${i}`] = {
      sleeperId: `90${i}`, name: `Falling Wideout ${i}`, position: 'WR', team: 'NYJ',
      age: 25, value: 3000, overallRank: 50, positionRank: 20, trend30Day: -100 - i,
    }
  }
  const day = record({ values: { ...VALUES, playerMap: { ...VALUES.playerMap, ...fallers } } })
  const c = day.items.buyLow.candidates
  assert.equal(c.rows.length, MAX_CANDIDATES)
  assert.ok(c.count > MAX_CANDIDATES)
  // Steepest fall first, so the bounded sample keeps the pick.
  assert.equal(c.rows[0].sleeperId, day.items.buyLow.player.sleeperId)
})

// ── null, never 0 ────────────────────────────────────────────────────────────

test('an unpriced player is value null + trend null, never 0', () => {
  const stash = MINE.players.find(p => p.unranked && p.position === 'WR')
  const row = playerRow(stash)
  assert.equal(row.value, null)
  assert.equal(row.trend30Day, null)
  assert.equal(row.unranked, true)
  // A priced player with a flat market keeps its real 0 trend.
  const flat = playerRow(MINE.players.find(p => p.name === 'Third Quarterback'))
  assert.equal(flat.value, 3000)
  assert.equal(flat.trend30Day, 0)
})

test('a team with no readable value or record is null, never 0', () => {
  const t = teamRow({ rosterId: 9, owner: null, totalValue: 0, hasRecord: false, record: { wins: 0, losses: 0, ties: 0 } }, {})
  assert.equal(t.totalValue, null)
  assert.equal(t.record, null)
  assert.equal(t.ownerId, null)
  assert.equal(t.tier, null)
})

test('a quiet signal is fired:false with null subjects — not a zero-valued row', () => {
  const day = record()
  for (const key of ['closingWindow', 'underperformer']) {
    const it = day.items[key]
    if (!it.fired) {
      assert.equal(it.team, null, `${key}.team`)
      assert.equal(it.slot, null, `${key}.slot`)
    }
  }
  // No game played: the underperformer claim cannot be made, and says so.
  const unplayed = LEAGUE.allRosters.map(r => ({ ...r, record: { wins: 0, losses: 0, ties: 0 }, hasRecord: false }))
  const d2 = record({ league: { ...LEAGUE, allRosters: unplayed, myRoster: unplayed.find(r => r.rosterId === 6) } })
  assert.equal(d2.items.underperformer.gamesPlayed, false)
  assert.equal(d2.items.underperformer.fired, false)
  assert.deepEqual(d2.items.underperformer.teams, [])
})

test('a day the recorder could not read is WRITTEN as unreadable, with every field null', () => {
  const noLeague = recordBriefingDay({ date: DATE, snapshot: makeSnapshot({ league: null }), myRosterId: 6 })
  assert.equal(noLeague.status, 'unreadable')
  assert.match(noLeague.reason, /league/)
  for (const k of ['league', 'me', 'briefing', 'items']) assert.equal(noLeague[k], null, k)

  const noValues = recordBriefingDay({ date: DATE, snapshot: makeSnapshot({ values: null }), myRosterId: 6 })
  assert.equal(noValues.status, 'unreadable')
  assert.match(noValues.reason, /FantasyCalc/)

  const notMine = recordBriefingDay({ date: DATE, snapshot: makeSnapshot({ league: { ...LEAGUE, myRoster: null } }), myRosterId: 42 })
  assert.match(notMine.reason, /roster 42/)

  const thrown = unreadableDay({ date: DATE, reason: 'snapshot failed: HTTP 503' })
  assert.equal(thrown.items, null)
})

test('the as-of stamp and the code version ride along so a stale read or a rule change is visible later', () => {
  const day = record()
  assert.equal(day.codeVersion, null)
  const stamped = recordBriefingDay({ date: DATE, snapshot: makeSnapshot(), myRosterId: 6, codeVersion: 'abc123' })
  assert.equal(stamped.codeVersion, 'abc123')
  assert.equal(unreadableDay({ date: DATE, reason: 'x', codeVersion: 'abc123' }).codeVersion, 'abc123')
  assert.equal(day.asOf.fantasycalc.fetchedAt, '2027-09-19T13:59:00.000Z')
  assert.equal(day.league.week, 3)
  assert.deepEqual(day.me.deficits, appSignals().myDeficits)
})

// ── the ledger file ───────────────────────────────────────────────────────────

const stub = (date, status = 'recorded') => ({ date, status, recordedAt: `${date}T09:41:00Z` })

test('days append in date order, a same-day re-run replaces, and nothing is ever pruned', () => {
  let ledger = emptyLedger()
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2026, 9, 8) + i * 86400000).toISOString().slice(0, 10)
    ledger = mergeLedgerDay(ledger, stub(d))
  }
  assert.equal(ledger.days.length, 400)
  ledger = mergeLedgerDay(ledger, { ...stub('2026-10-08'), note: 'rerun' })
  assert.equal(ledger.days.length, 400)
  assert.equal(ledger.days[0].note, 'rerun')
  ledger = mergeLedgerDay(ledger, stub('2026-10-01'))
  assert.equal(ledger.days[0].date, '2026-10-01')
})

test('an unreadable re-run never overwrites a day already recorded', () => {
  let ledger = mergeLedgerDay(emptyLedger(), stub('2026-10-08'))
  ledger = mergeLedgerDay(ledger, stub('2026-10-08', 'unreadable'))
  assert.equal(ledger.days[0].status, 'recorded')
  // …but a recorded re-run does replace an unreadable one.
  ledger = mergeLedgerDay(mergeLedgerDay(emptyLedger(), stub('2026-10-09', 'unreadable')), stub('2026-10-09'))
  assert.equal(ledger.days[0].status, 'recorded')
})

// ── the alarm ─────────────────────────────────────────────────────────────────

test('the alarm: one missed run is a blip, a persistent gap fires', () => {
  const ledger = [stub('2026-10-08')].reduce(mergeLedgerDay, emptyLedger())
  assert.equal(assessLedger(ledger, '2026-10-08').stale, false)
  assert.equal(assessLedger(ledger, '2026-10-09').stale, false)
  assert.equal(assessLedger(ledger, `2026-10-${String(8 + MAX_LEDGER_LAG_DAYS).padStart(2, '0')}`).stale, true)
})

test('unreadable days are a named gap, not a recorded day — they cannot hold the alarm off', () => {
  const ledger = [stub('2026-10-08'), stub('2026-10-09', 'unreadable'), stub('2026-10-10', 'unreadable')]
    .reduce(mergeLedgerDay, emptyLedger())
  const a = assessLedger(ledger, '2026-10-10')
  assert.equal(a.newestRecorded, '2026-10-08')
  assert.equal(a.unreadableRun, 2)
  assert.equal(a.stale, true)
})

test('an empty or malformed ledger alarms', () => {
  assert.equal(assessLedger(emptyLedger(), '2026-10-08').stale, true)
  assert.equal(assessLedger({ nope: true }, '2026-10-08').stale, true)
})

// ── the briefing logic is the app's, never a copy ─────────────────────────────

test('the recorder imports the app\'s briefing logic and re-implements none of it', () => {
  const files = ['scripts/briefingLedger.mjs', 'scripts/record-briefing.mjs', 'scripts/check-briefing-ledger.mjs']
  const src = Object.fromEntries(files.map(f => [f, readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')]))
  assert.match(
    src['scripts/briefingLedger.mjs'],
    /import \{[^}]*computeEdgeSignals[^}]*buildBriefing[^}]*\} from '\.\.\/src\/utils\/edgeBriefing\.js'/,
  )
  // Every rule the five claims are selected by. Any of these appearing in the
  // recorder means it is choosing players itself instead of recording the app.
  const SELECTION_RULES = [
    'isBuyLowCandidate', 'isSellHighCandidate', 'isMoving', 'recommendFreeAgents',
    'buildFreeAgentPool', 'buildAgeCurves', 'buildRosterTrajectory', 'getTrajectoryRead',
    'assignWinWindowTiers', 'computeLeagueAverages', 'getPositionalDeltas', 'TREND_THRESHOLD',
  ]
  for (const [file, text] of Object.entries(src)) {
    for (const rule of SELECTION_RULES) {
      assert.ok(!text.includes(rule), `${file} must not use ${rule} — record computeEdgeSignals' output instead`)
    }
    // …nor sort anything by trend, which is how buy-low / sell-high pick.
    assert.doesNotMatch(text, /sort\([^)]*trend30Day/, `${file} must not rank by trend`)
  }
})
