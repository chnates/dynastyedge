// tests/leagueState.test.mjs — pins buildLeagueState (src/utils/leagueState.js),
// the five-source join that produces the object EVERY analysis function in this
// app eats. It lived in a useMemo inside useLeague.js and had no tests at all.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Rule #8 (Sleeper ID normalization): "Sleeper returns IDs as
//    strings or numbers depending on endpoint. Normalize to String(id) at
//    ingestion … all lookups and joins use string IDs."
//  - CLAUDE.md Rule #7 (Unranked players): a rostered player with no
//    FantasyCalc value is "still shown — name resolved from the player DB,
//    value displayed as `—`, contributing 0 to roster totals. Never silently
//    drop a rostered player from a roster view."
//  - CLAUDE.md Feature 1 (Exact slot resolution): a pick "sits at its ORIGINAL
//    owner's slot" and is priced at FantasyCalc's exact-slot value, "falling
//    back to the round median when the slot is unknown".
//  - CLAUDE.md Feature 18 / Rule: identity is runtime state — myRoster is
//    selected by the passed myRosterId, never by MY_ROSTER_ID.
//  - CLAUDE.md League Context: FAAB budget is read from
//    league.settings.waiver_budget, "never assume 100".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildLeagueState } from '../src/utils/leagueState.js'

// ── fixture ────────────────────────────────────────────────────────────────
// Deliberately mixes string and numeric player ids, includes the '0'
// empty-slot sentinel, a duplicate id, an unranked player, and a player
// neither source knows.
const PLAYER_MAP = {
  '100': { sleeperId: '100', name: 'Ranked QB', position: 'QB', team: 'ATL', age: 26, value: 7000, overallRank: 1, positionRank: 1, trend30Day: 120 },
  '200': { sleeperId: '200', name: 'Ranked RB', position: 'RB', team: 'GB', age: 24, value: 5000, overallRank: 5, positionRank: 2, trend30Day: -80 },
  '300': { sleeperId: '300', name: 'Ranked WR', position: 'WR', team: 'CIN', age: 25, value: 3000, overallRank: 20, positionRank: 9, trend30Day: 0 },
}
const PLAYER_DB = {
  '400': { name: 'Deep Stash', position: 'TE', team: 'NYJ', age: 23 },
  '500': { name: 'Atlanta', position: 'DEF', team: 'ATL', age: null },
  // 600 exists in the DB but with no position — must still be skipped.
  '600': { name: 'Mystery', position: null, team: null, age: null },
}
const PICK_ENTRIES = [
  { name: '2027 1st', value: 2000 },
  { name: '2027 2nd', value: 800 },
  { name: '2027 Pick 1.03', value: 2400 },
  { name: '2028 1st', value: 1500 },
]

function fixture(overrides = {}) {
  const rosters = [
    {
      roster_id: 1,
      owner_id: 'u1',
      // numeric 100, string '200', duplicate '200', unranked 400/500, unknown 600/999
      players: [100, '200', '200', 400, '500', 600, 999],
      starters: ['100', 200, '0', '400'],
      reserve: [500],
      taxi: ['400'],
      settings: {
        wins: 3, losses: 1, ties: 0, fpts: 450, fpts_decimal: 55,
        fpts_against: 400, fpts_against_decimal: 10, waiver_budget_used: 250,
      },
    },
    {
      roster_id: 2,
      owner_id: 'u2',
      players: ['300'],
      starters: ['300'],
      settings: {},
    },
  ]
  return {
    sleeperData: {
      leagueInfo: { league_id: 'L1', settings: { waiver_budget: 1000 } },
      rosters,
      users: [
        { user_id: 'u1', username: 'chnates', display_name: 'chnates', metadata: { team_name: 'NIX CAGE' } },
        { user_id: 'u2', username: 'other', display_name: 'Other Guy', metadata: {} },
      ],
      tradedPicks: [],
      drafts: [],
      nflState: { season: '2027', season_type: 'regular' },
    },
    fcValues: { playerMap: PLAYER_MAP, pickEntries: PICK_ENTRIES },
    playerDB: PLAYER_DB,
    myRosterId: 1,
    pickYears: ['2027', '2028', '2029'],
    ...overrides,
  }
}

// ── the null gate ──────────────────────────────────────────────────────────

test('returns null without both core sources (the gate useLeague had)', () => {
  assert.equal(buildLeagueState(), null)
  assert.equal(buildLeagueState({}), null)
  assert.equal(buildLeagueState({ sleeperData: fixture().sleeperData }), null, 'FantasyCalc missing')
  assert.equal(buildLeagueState({ fcValues: fixture().fcValues }), null, 'Sleeper missing')
})

// ── Rule #8 — string normalization is load-bearing ─────────────────────────

test('every sleeperId is a String, whatever shape Sleeper sent (rule 8)', () => {
  const st = buildLeagueState(fixture())
  const ids = st.allRosters.flatMap(r => r.players.map(p => p.sleeperId))
  assert.ok(ids.length > 0)
  assert.ok(ids.every(id => typeof id === 'string'), 'a numeric id would miss every Set lookup')
  assert.ok(ids.includes('100'), 'numeric 100 normalized to "100"')
})

test('numeric and string ids join to the same FantasyCalc row (rule 8)', () => {
  const st = buildLeagueState(fixture())
  const r1 = st.allRosters[0]
  // roster 1 held 100 as a number and '200' as a string; both must be priced.
  assert.equal(r1.players.find(p => p.sleeperId === '100').value, 7000)
  assert.equal(r1.players.find(p => p.sleeperId === '200').value, 5000)
})

test('starter/taxi/IR flags survive mixed id shapes and ignore the "0" sentinel (rule 8)', () => {
  const r1 = buildLeagueState(fixture()).allRosters[0]
  const by = id => r1.players.find(p => p.sleeperId === id)
  // starters were ['100', 200, '0', '400'] — mixed shapes plus the empty slot.
  assert.equal(by('100').isStarter, true, 'string starter matched')
  assert.equal(by('200').isStarter, true, 'numeric starter 200 matched the string id')
  assert.equal(by('400').isTaxi, true)
  assert.equal(by('500').isIR, true, 'numeric reserve 500 matched')
  assert.equal(by('300'), undefined, 'roster 2\'s player is not on roster 1')
  assert.ok(!r1.starterOrder.includes(undefined))
  assert.ok(r1.starterOrder.every(id => typeof id === 'string'))
})

test('a duplicate player id is counted once', () => {
  const r1 = buildLeagueState(fixture()).allRosters[0]
  assert.equal(r1.players.filter(p => p.sleeperId === '200').length, 1)
})

// ── Rule #7 — unranked players are kept, never dropped ─────────────────────

test('an unranked rostered player is KEPT with value 0 and unranked:true (rule 7)', () => {
  const r1 = buildLeagueState(fixture()).allRosters[0]
  const stash = r1.players.find(p => p.sleeperId === '400')
  assert.ok(stash, 'a rostered player FantasyCalc does not rank must never be dropped')
  assert.equal(stash.name, 'Deep Stash', 'identity resolved from the player DB')
  assert.equal(stash.position, 'TE')
  assert.equal(stash.value, 0, 'contributes 0 to roster totals')
  assert.equal(stash.unranked, true)
  assert.equal(stash.overallRank, null, 'no fabricated rank')
  assert.equal(stash.positionRank, null)
})

test('a defense is kept the same way — FantasyCalc ranks zero of them (rule 7)', () => {
  const def = buildLeagueState(fixture()).allRosters[0].players.find(p => p.sleeperId === '500')
  assert.ok(def)
  assert.equal(def.position, 'DEF')
  assert.equal(def.unranked, true)
  assert.equal(def.value, 0)
})

test('a player NEITHER source knows is skipped, and self-heals when the DB lands (rule 7)', () => {
  const r1 = buildLeagueState(fixture()).allRosters[0]
  assert.equal(r1.players.find(p => p.sleeperId === '999'), undefined, 'unknown to both')
  assert.equal(r1.players.find(p => p.sleeperId === '600'), undefined, 'in the DB but no position')

  // Same roster, player DB now knows 999 — he appears without any other change.
  const healed = buildLeagueState(fixture({
    playerDB: { ...PLAYER_DB, '999': { name: 'Late Arrival', position: 'WR', team: 'SF', age: 22 } },
  }))
  const late = healed.allRosters[0].players.find(p => p.sleeperId === '999')
  assert.ok(late, 'skipping is a not-yet-loaded state, not a permanent drop')
  assert.equal(late.unranked, true)
})

test('with no player DB at all, ranked players still resolve (the DB loads in background)', () => {
  const st = buildLeagueState(fixture({ playerDB: null }))
  const r1 = st.allRosters[0]
  assert.equal(r1.players.length, 2, 'the two FantasyCalc-ranked players')
  assert.equal(r1.players.reduce((s, p) => s + p.value, 0), 7000 + 5000)
  // totalValue also carries this roster's untraded picks, which do not depend
  // on the player DB.
  assert.equal(r1.totalValue, 12000 + r1.picks.reduce((s, p) => s + p.value, 0))
})

// ── roster totals, FAAB, record ────────────────────────────────────────────

test('totalValue sums players + picks, unranked contributing 0 (rule 7)', () => {
  const st = buildLeagueState(fixture({
    sleeperData: { ...fixture().sleeperData, tradedPicks: [] },
  }))
  const r1 = st.allRosters[0]
  const playerSum = r1.players.reduce((s, p) => s + p.value, 0)
  const pickSum = r1.picks.reduce((s, p) => s + p.value, 0)
  assert.equal(playerSum, 12000, '7000 + 5000 + 0 + 0')
  assert.equal(r1.totalValue, playerSum + pickSum)
})

test('FAAB is read from league settings, never assumed 100 (League Context)', () => {
  const r1 = buildLeagueState(fixture()).allRosters[0]
  assert.equal(r1.faabBudget, 1000, 'the 2026 budget change was 100 -> 1000')
  assert.equal(r1.faabSpent, 250)
  assert.equal(r1.faabRemaining, 750)
})

test('FAAB falls back to 100 only when the league omits waiver_budget', () => {
  const f = fixture()
  const st = buildLeagueState({
    ...f,
    sleeperData: { ...f.sleeperData, leagueInfo: { league_id: 'L1', settings: {} } },
  })
  assert.equal(st.allRosters[0].faabBudget, 100)
})

test('record, hasRecord and points carry their decimal halves', () => {
  const [r1, r2] = buildLeagueState(fixture()).allRosters
  assert.deepEqual(r1.record, { wins: 3, losses: 1, ties: 0 })
  assert.equal(r1.hasRecord, true)
  assert.equal(r1.pointsFor, 450.55, 'fpts + fpts_decimal/100')
  assert.equal(r1.pointsAgainst, 400.10)
  assert.equal(r2.hasRecord, false, 'a team with no games played reads as no record')
  assert.deepEqual(r2.record, { wins: 0, losses: 0, ties: 0 })
})

test('avgStarterAge counts only ranked, active starters', () => {
  const r1 = buildLeagueState(fixture()).allRosters[0]
  // Starters are 100 (26), 200 (24) and 400 — but 400 is taxi AND unranked.
  assert.equal(r1.avgStarterAge, 25)
})

// ── Feature 1 — pick resolution ────────────────────────────────────────────

test('picks resolve to the round median when no draft order exists (Feature 1)', () => {
  const st = buildLeagueState(fixture())
  const picks = st.allRosters.flatMap(r => r.picks)
  assert.ok(picks.length > 0, 'untraded picks still belong to their original owner')
  const first = picks.find(p => p.season === '2027' && p.round === 1)
  assert.equal(first.slot, null, 'no Sleeper draft for 2027 yet')
  assert.equal(first.slotLabel, null)
  assert.equal(first.value, 2000, 'priced at the 2027 1st round median, never 0')
})

test('a pick sits at its ORIGINAL owner\'s slot and takes the exact-slot price (Feature 1)', () => {
  const f = fixture()
  const st = buildLeagueState({
    ...f,
    sleeperData: {
      ...f.sleeperData,
      // roster 2 owns the 1.03 slot; roster 1 has traded for roster 2's 1st.
      drafts: [{ draft_id: 'd1', season: '2027', type: 'linear', status: 'pre_draft', settings: { teams: 2, rounds: 1 }, draft_order: { u1: 1, u2: 3 } }],
      tradedPicks: [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
    },
  })
  const acquired = st.allRosters
    .find(r => r.rosterId === 1)
    .picks.find(p => p.season === '2027' && p.round === 1 && p.originalOwner === 2)
  assert.ok(acquired, 'the traded pick moved to roster 1')
  assert.equal(acquired.slot, 3, "roster 2's slot, not roster 1's")
  assert.equal(acquired.slotLabel, '1.03', 'zero-padded round.slot')
  assert.equal(acquired.value, 2400, 'exact-slot price beats the 2000 round median')
})

test('a future season keeps the round median even when this season has an order (Feature 1)', () => {
  const f = fixture()
  const st = buildLeagueState({
    ...f,
    sleeperData: {
      ...f.sleeperData,
      drafts: [{ draft_id: 'd1', season: '2027', type: 'linear', status: 'pre_draft', settings: { teams: 2, rounds: 1 }, draft_order: { u1: 1, u2: 3 } }],
    },
  })
  const future = st.allRosters[0].picks.find(p => p.season === '2028')
  assert.equal(future.slot, null, 'only the upcoming draft has a known order')
  assert.equal(future.value, 1500, 'round median')
})

// ── identity is runtime state ──────────────────────────────────────────────

test('myRoster follows the passed myRosterId, never a constant (Feature 18)', () => {
  assert.equal(buildLeagueState(fixture({ myRosterId: 1 })).myRoster.rosterId, 1)
  assert.equal(buildLeagueState(fixture({ myRosterId: 2 })).myRoster.rosterId, 2)
  assert.equal(buildLeagueState(fixture({ myRosterId: null })).myRoster, null, 'logged out')
  assert.equal(buildLeagueState(fixture({ myRosterId: 99 })).myRoster, null, 'departed team')
})

test('switching identity changes only myRoster — allRosters is identical', () => {
  const a = buildLeagueState(fixture({ myRosterId: 1 }))
  const b = buildLeagueState(fixture({ myRosterId: 2 }))
  assert.deepEqual(a.allRosters, b.allRosters)
})

// ── the rest of the returned shape ─────────────────────────────────────────

test('userMap keys by roster id and tolerates an ownerless roster', () => {
  const f = fixture()
  f.sleeperData.rosters.push({ roster_id: 3, owner_id: 'ghost', players: [], starters: [], settings: {} })
  const st = buildLeagueState(f)
  assert.equal(st.userMap[1].username, 'chnates')
  assert.equal(st.userMap[3], null, 'an unclaimed roster maps to null, not undefined')
  assert.equal(st.allRosters.find(r => r.rosterId === 3).owner, null)
})

test('pickYears is passed through, or derived from sleeperData when omitted', () => {
  assert.deepEqual(buildLeagueState(fixture()).pickYears, ['2027', '2028', '2029'])
  const f = fixture()
  delete f.pickYears
  const derived = buildLeagueState(f).pickYears
  assert.equal(derived.length, 3, 'resolvePickYears ran off nflState + drafts')
  assert.equal(derived[0], '2027', 'no completed 2027 draft, so the window starts there')
})

test('leagueId is echoed for provenance, falling back to leagueInfo', () => {
  assert.equal(buildLeagueState(fixture({ leagueId: 'explicit' })).leagueId, 'explicit')
  assert.equal(buildLeagueState(fixture()).leagueId, 'L1', 'from leagueInfo.league_id')
})

test('the function is pure — it does not mutate its inputs', () => {
  const f = fixture()
  const snapshot = JSON.stringify(f)
  buildLeagueState(f)
  assert.equal(JSON.stringify(f), snapshot, 'analysis code must never mutate a cached payload')
})
