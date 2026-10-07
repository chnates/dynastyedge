// tests/mcpGetRoster.test.mjs — pins the get_roster tool (mcp/tools/getRoster.js).
//
// Behaviors pinned (with their source):
//  - MCP_DISCOVERY.md §1: resolve-then-act. "Costs a round-trip; makes grading
//    the wrong player structurally impossible." The same discipline applies to
//    picking a TEAM: an ambiguous name returns candidates, never a guess.
//  - MCP_DISCOVERY.md §7: "Response size. The player DB is 5-8MB … Tools must
//    return bounded, summarized projections, never raw payloads." And: every
//    output carries provenance and explicit `unranked` flags.
//  - CLAUDE.md Rule #7: an unranked player is shown, valued `—`, counted 0 —
//    here, `value: null` plus `unranked: true`, never 0.
//  - CLAUDE.md League Context: taxi and IR sit OUTSIDE the 24 active slots.
//  - CLAUDE.md Feature 1: picks carry an exact slot label where the draft
//    order is known, and the round median otherwise.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveTeam, buildRosterAnswer, renderRosterText } from '../mcp/tools/getRoster.js'

const USER = (id, team, username) => ({ user_id: id, username, display_name: username, metadata: { team_name: team } })

function player(o) {
  return {
    sleeperId: o.id, name: o.name, position: o.pos, team: o.nfl ?? 'ATL',
    age: o.age ?? 25, value: o.value ?? 1000,
    overallRank: o.value ? 10 : null, positionRank: o.value ? 3 : null,
    trend30Day: o.trend ?? 0, unranked: !!o.unranked,
    isStarter: !!o.starter, isTaxi: !!o.taxi, isIR: !!o.ir,
  }
}

function roster(id, owner, players, picks = [], extra = {}) {
  const totalValue = players.reduce((s, p) => s + p.value, 0) + picks.reduce((s, p) => s + p.value, 0)
  return {
    rosterId: id, owner, players, picks, totalValue,
    faabBudget: 1000, faabRemaining: 750, faabSpent: 250,
    record: { wins: 2, losses: 1, ties: 0 }, hasRecord: true,
    pointsFor: 300.456, pointsAgainst: 280.1,
    pickCapitalScore: 5000, avgStarterAge: 25.66, starterOrder: [],
    ...extra,
  }
}

const MINE = roster(6, USER('u6', 'NIX CAGE', 'chnates'), [
  player({ id: '1', name: 'Star QB', pos: 'QB', value: 7000, starter: true, trend: 800 }),
  player({ id: '2', name: 'Bench RB', pos: 'RB', value: 2000 }),
  player({ id: '3', name: 'Taxi WR', pos: 'WR', value: 500, taxi: true }),
  player({ id: '4', name: 'Hurt WR', pos: 'WR', value: 900, ir: true }),
  player({ id: '5', name: 'Kansas City Chiefs', pos: 'DEF', value: 0, unranked: true, starter: true }),
], [
  { season: '2027', round: 1, originalOwner: 6, slot: null, slotLabel: null, value: 2000 },
  { season: '2027', round: 2, originalOwner: 3, slot: 9, slotLabel: '2.09', value: 900 },
])

const THEIRS = roster(3, USER('u3', 'Mahomes Depot', 'depot'), [
  player({ id: '9', name: 'Their WR', pos: 'WR', value: 4000, starter: true }),
])
const OTHER = roster(7, USER('u7', 'Jake & Bake', 'jakeb'), [
  player({ id: '10', name: 'Some RB', pos: 'RB', value: 1000, starter: true }),
])

const LEAGUE = {
  allRosters: [MINE, THEIRS, OTHER],
  myRoster: MINE,
  userMap: { 6: MINE.owner, 3: THEIRS.owner, 7: OTHER.owner },
  leagueInfo: { league_id: 'L1', name: 'Test League', settings: { waiver_budget: 1000 } },
  pickYears: ['2027', '2028', '2029'],
  leagueId: 'L1',
}

const SNAP = {
  league: LEAGUE,
  nflState: { season: '2027', season_type: 'regular', week: 3 },
  isOffseason: false,
  asOf: {
    generatedAt: '2027-09-19T14:00:00.000Z',
    oldestSourceAt: '2027-09-19T13:58:00.000Z',
    stale: false,
    sources: {
      sleeper: { fetchedAt: '2027-09-19T13:58:00.000Z', ageSeconds: 120, stale: false, error: null },
      fantasycalc: { fetchedAt: '2027-09-19T13:59:00.000Z', ageSeconds: 60, stale: false, error: null },
      playerDB: { fetchedAt: '2027-09-19T13:59:00.000Z', ageSeconds: 60, stale: false, error: null },
    },
  },
  counts: { rosters: 3, players: 7, unrankedPlayers: 1, picks: 2, pricedPlayers: 500, playerDBEntries: 11000 },
}

const build = (args = {}) => buildRosterAnswer(SNAP, { defaultRosterId: 6, myRosterId: 6, ...args })

// ── team resolution: never guess ───────────────────────────────────────────

test('omitting `team` uses the configured identity', () => {
  assert.equal(resolveTeam(LEAGUE, undefined, 6).roster.rosterId, 6)
  assert.equal(resolveTeam(LEAGUE, '', 6).roster.rosterId, 6)
})

test('a bare integer is a roster id', () => {
  assert.equal(resolveTeam(LEAGUE, '3', 6).roster.rosterId, 3)
  assert.match(resolveTeam(LEAGUE, '99', 6).error, /No roster with id 99/)
})

test('a team name or username resolves, case-insensitively and by substring', () => {
  assert.equal(resolveTeam(LEAGUE, 'Mahomes Depot', 6).roster.rosterId, 3)
  assert.equal(resolveTeam(LEAGUE, 'mahomes', 6).roster.rosterId, 3)
  assert.equal(resolveTeam(LEAGUE, 'depot', 6).roster.rosterId, 3, 'by username')
  assert.equal(resolveTeam(LEAGUE, 'JAKE', 6).roster.rosterId, 7)
})

test('an AMBIGUOUS name returns candidates rather than guessing (§1)', () => {
  const league = { ...LEAGUE, allRosters: [MINE, THEIRS, roster(8, USER('u8', 'Mahomes Depot 2', 'depot2'), [])] }
  const r = resolveTeam(league, 'mahomes', 6)
  assert.equal(r.roster, undefined, 'picking the wrong team is the same class of error as grading the wrong player')
  assert.match(r.error, /matches 2 teams/)
  assert.equal(r.candidates.length, 2)
})

test('an exact name still wins over a longer partial match', () => {
  const league = { ...LEAGUE, allRosters: [MINE, THEIRS, roster(8, USER('u8', 'Mahomes Depot 2', 'depot2'), [])] }
  assert.equal(resolveTeam(league, 'Mahomes Depot', 6).roster.rosterId, 3)
})

test('an unknown name lists every team so the caller can pick', () => {
  const r = resolveTeam(LEAGUE, 'nobody', 6)
  assert.match(r.error, /No team matching/)
  assert.equal(r.candidates.length, 3)
})

test('a missing default identity is reported, not silently defaulted', () => {
  assert.match(resolveTeam(LEAGUE, undefined, 42).error, /No roster 42/)
})

// ── rule 7 ─────────────────────────────────────────────────────────────────

test('an unranked player is KEPT, valued null (never 0) and flagged (rule 7)', () => {
  const a = build()
  const def = a.players.find(p => p.sleeperId === '5')
  assert.ok(def, 'never silently dropped from a roster view')
  assert.equal(def.value, null, '`—`, not 0 — "unpriced" must not read as "worthless"')
  assert.equal(def.unranked, true)
  assert.equal(a.totals.unrankedCount, 1)
})

test('unranked players contribute 0 to the totals (rule 7)', () => {
  const a = build()
  assert.equal(a.totals.playerValue, 7000 + 2000 + 500 + 900 + 0)
})

test('the rendered text shows an em dash for an unranked player, never a zero', () => {
  const text = renderRosterText(build())
  assert.match(text, /Kansas City Chiefs.*— —.*\[unranked\]/)
  assert.ok(!/Kansas City Chiefs.*— 0/.test(text))
})

// ── slots: taxi and IR sit outside the active roster ───────────────────────

test('slot classification separates STARTER / BENCH / TAXI / IR (League Context)', () => {
  const by = Object.fromEntries(build().players.map(p => [p.sleeperId, p.slot]))
  assert.equal(by['1'], 'STARTER')
  assert.equal(by['2'], 'BENCH')
  assert.equal(by['3'], 'TAXI', 'a taxi player is unavailable, not bench depth')
  assert.equal(by['4'], 'IR')
  assert.equal(by['5'], 'STARTER')
})

test('IR wins over a stale starter flag — an IR player cannot be starting', () => {
  const league = {
    ...LEAGUE,
    allRosters: [roster(6, MINE.owner, [player({ id: 'x', name: 'Both', pos: 'WR', starter: true, ir: true })]), THEIRS, OTHER],
  }
  const a = buildRosterAnswer({ ...SNAP, league }, { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.players[0].slot, 'IR')
})

// ── picks (Feature 1) ──────────────────────────────────────────────────────

test('picks report their pricing basis — exact slot vs round median', () => {
  const a = build()
  const [p1, p2] = a.picks
  assert.equal(p1.pricing, 'round-median')
  assert.equal(p1.label, '2027 round 1')
  assert.equal(p2.pricing, 'exact-slot')
  assert.equal(p2.label, '2027 2.09')
})

test('a pick acquired from another team names its original owner', () => {
  const a = build()
  assert.equal(a.picks[0].originalOwnerTeam, null, 'own pick — no "via"')
  assert.equal(a.picks[1].originalOwnerTeam, 'Mahomes Depot')
})

// ── provenance and bounded output (§7) ─────────────────────────────────────

test('the response carries the snapshot as-of stamp verbatim', () => {
  const a = build()
  assert.deepEqual(a.asOf, SNAP.asOf)
  assert.match(renderRosterText(a), /As of 2027-09-19T13:58:00\.000Z/)
})

test('a stale snapshot says so in BOTH the text and the notes', () => {
  const stale = { ...SNAP, asOf: { ...SNAP.asOf, stale: true } }
  const a = buildRosterAnswer(stale, { defaultRosterId: 6, myRosterId: 6 })
  assert.ok(a.notes.some(n => /cached data/.test(n)))
  assert.match(renderRosterText(a), /STALE/)
})

test('a missing player DB is disclosed — silence would hide absent players', () => {
  const s = { ...SNAP, counts: { ...SNAP.counts, playerDBEntries: 0 } }
  const a = buildRosterAnswer(s, { defaultRosterId: 6, myRosterId: 6 })
  assert.ok(a.notes.some(n => /player DB did not load/.test(n)))
})

test('output is BOUNDED and small — never a raw payload (§7)', () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    player({ id: `b${i}`, name: `Player ${i}`, pos: 'WR', value: 100 }))
  const league = { ...LEAGUE, allRosters: [roster(6, MINE.owner, many), THEIRS, OTHER] }
  const a = buildRosterAnswer({ ...SNAP, league }, { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.players.length, 60, 'capped')
  assert.equal(a.totals.playerCount, 200, 'but the true count is still reported')
  assert.ok(a.notes.some(n => /truncated/.test(n)), 'and the truncation is disclosed')
  assert.ok(JSON.stringify(a).length < 60000)
})

// ── the rest of the answer ─────────────────────────────────────────────────

test('totals, rank, FAAB and win window come from the shared utils', () => {
  const a = build()
  assert.equal(a.totals.totalValue, MINE.totalValue)
  assert.equal(a.totals.valueRank, 1, 'highest total value in this fixture')
  assert.equal(a.faab.display, '$750')
  assert.ok(['Contending', 'Middle', 'Rebuilding'].includes(a.winWindow))
  assert.equal(a.totals.avgStarterAge, 25.7, 'rounded for display, not invented')
})

test('a team with no games played reports null, never a 0-0 "result"', () => {
  const league = { ...LEAGUE, allRosters: [roster(6, MINE.owner, MINE.players, [], { hasRecord: false, record: { wins: 0, losses: 0, ties: 0 } }), THEIRS, OTHER] }
  const a = buildRosterAnswer({ ...SNAP, league }, { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.record, null)
  assert.match(renderRosterText(a), /no games played yet/)
})

test('isYou is set only for the configured identity', () => {
  assert.equal(build().team.isYou, true)
  assert.equal(build({ team: '3' }).team.isYou, false)
})

test('an unresolved team answers ok:false with candidates, and renders them', () => {
  const a = build({ team: 'nobody' })
  assert.equal(a.ok, false)
  assert.equal(a.candidates.length, 3)
  assert.match(renderRosterText(a), /Mahomes Depot/)
})

// ── the league calendar (open-items §0 #9) ─────────────────────────────────
// The scheduled brief reads the trade deadline from here, so it must come from
// league settings through the ONE deadline rule — never a typed-in date.

const withSettings = (settings, nfl = { season: '2026', season_type: 'regular', week: 5 }, isOffseason = false) => ({
  ...SNAP,
  nflState: nfl,
  isOffseason,
  league: { ...LEAGUE, leagueInfo: { ...LEAGUE.leagueInfo, settings } },
})

const LIVE_SETTINGS = {
  waiver_budget: 1000, trade_deadline: 13, playoff_week_start: 15,
  daily_waivers: 1, waiver_type: 2, waiver_day_of_week: 2, daily_waivers_hour: 9, waiver_clear_days: 1,
}

test('calendar: the deadline is read from settings and run through readTradeDeadline', () => {
  const a = buildRosterAnswer(withSettings(LIVE_SETTINGS), { defaultRosterId: 6, myRosterId: 6 })
  assert.deepEqual(a.calendar.tradeDeadline, { week: 13, weeksLeft: 8, status: 'upcoming', inWindow: false })
  assert.equal(a.calendar.tradeDeadlineWeek, 13)
  assert.equal(a.calendar.playoffWeekStart, 15)
  const w12 = buildRosterAnswer(withSettings(LIVE_SETTINGS, { season: '2026', season_type: 'regular', week: 12 }), { defaultRosterId: 6, myRosterId: 6 })
  assert.deepEqual(w12.calendar.tradeDeadline, { week: 13, weeksLeft: 1, status: 'soon', inWindow: true })
  assert.match(renderRosterText(w12), /Trade deadline: Week 13 · 1 week away/)
})

test('calendar: waiver settings pass through UNDECODED, and say so', () => {
  const { waiverSettings } = buildRosterAnswer(withSettings(LIVE_SETTINGS), { defaultRosterId: 6, myRosterId: 6 }).calendar
  assert.deepEqual(waiverSettings, {
    dailyWaivers: true, waiverType: 2, waiverDayOfWeek: 2, dailyWaiversHour: 9, waiverClearDays: 1, decoded: false,
  })
})

test('calendar: offseason or no deadline is null, never a made-up week', () => {
  const off = buildRosterAnswer(withSettings(LIVE_SETTINGS, { season: '2026', season_type: 'off', week: 0 }, true), { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(off.calendar.tradeDeadline, null)
  assert.equal(off.calendar.tradeDeadlineWeek, 13, 'the setting itself is still reported')
  const none = buildRosterAnswer(withSettings({ waiver_budget: 1000 }), { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(none.calendar.tradeDeadline, null)
  assert.equal(none.calendar.tradeDeadlineWeek, null)
  assert.equal(none.calendar.waiverSettings.dailyWaivers, null)
  assert.doesNotMatch(renderRosterText(none), /Trade deadline/)
})

// ── room to move (owner, 2026-10-07): "I only have 2 IR spots … once those
// are full, people have to stay on the bench injured." ─────────────────────

const roomSnap = (settings, rosterPositions) => ({
  ...SNAP,
  league: {
    ...LEAGUE,
    leagueInfo: { ...LEAGUE.leagueInfo, settings, roster_positions: rosterPositions },
  },
  // 'Bench RB' (id 2) is Out — eligible for IR under this league's rules.
  playerDB: { 2: { injury_status: 'Out' }, 4: { injury_status: 'IR' } },
})

test('IR full: the eligible bench player is reported waiting, and the notes forbid an IR suggestion', () => {
  // One IR slot, already holding Hurt WR (id 4).
  const a = buildRosterAnswer(roomSnap({ waiver_budget: 1000, reserve_slots: 1, reserve_allow_out: 1 }, ['QB', 'RB', 'BN', 'BN']),
    { defaultRosterId: 6, myRosterId: 6 })
  const { ir, activeRoster } = a.roomToMove
  assert.deepEqual({ slots: ir.slots, used: ir.used, open: ir.open, full: ir.full, canMove: ir.canMove },
    { slots: 1, used: 1, open: 0, full: true, canMove: 0 })
  assert.deepEqual(ir.eligibleWaiting, [{ sleeperId: '2', name: 'Bench RB', status: 'Out' }])
  assert.ok(a.notes.some(n => /IR is full \(1 of 1\)\. Bench RB .*do not suggest moving them to IR/.test(n)))
  // 4 active slots; Star QB, Bench RB, Kansas City Chiefs are active (taxi and IR sit outside).
  assert.deepEqual(activeRoster, { slots: 4, used: 3, open: 1 })
  assert.match(renderRosterText(a), /IR 1 of 1 \(full\) · IR-eligible but on the active roster: Bench RB/)
})

test('a full active roster says every claim needs a drop', () => {
  const a = buildRosterAnswer(roomSnap({ waiver_budget: 1000, reserve_slots: 2 }, ['QB', 'RB', 'BN']),
    { defaultRosterId: 6, myRosterId: 6 })
  assert.deepEqual(a.roomToMove.activeRoster, { slots: 3, used: 3, open: 0 })
  assert.ok(a.notes.some(n => /All 3 active roster spots are filled/.test(n)))
  assert.equal(a.roomToMove.ir.full, false, 'one of two IR slots is open')
})
