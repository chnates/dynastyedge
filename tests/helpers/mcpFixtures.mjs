// mcpFixtures.mjs — one synthetic league shared by the phase-1b tool tests.
//
// Shared rather than copied per file because four tools read the SAME league
// object, and four divergent copies of it is exactly the drift prerequisite C
// removed from src/. A behaviour pinned against one shape must be pinned
// against the shape the others see.
//
// Not itself a test file: the suite's glob is `tests/*.test.mjs`, so this
// subdirectory is imported, never run.
//
// The league is built to exercise the contracts, not to be realistic:
//   - roster 6 (mine) is DEEP at QB and THIN at WR, so there is a surplus to
//     sell from and a deficit to buy into.
//   - it carries an unranked defense, a taxi player and an IR player, so
//     rule 7 and the taxi/IR-are-not-bench contract are always in play.
//   - two players share a surname, so "never guess between matches" is
//     testable.

export const USER = (id, team, displayName) => ({
  user_id: id,
  // Sleeper's /league/{id}/users returns display_name, NOT username —
  // verified live 2026-09-19. The fixture matches the real payload.
  display_name: displayName,
  metadata: { team_name: team },
})

export function player(o) {
  return {
    sleeperId: String(o.id),
    name: o.name,
    position: o.pos,
    team: o.nfl ?? 'ATL',
    age: o.age ?? 25,
    value: o.unranked ? 0 : (o.value ?? 1000),
    overallRank: o.unranked ? null : 10,
    positionRank: o.unranked ? null : (o.posRank ?? 3),
    trend30Day: o.trend ?? 0,
    unranked: !!o.unranked,
    isStarter: !!o.starter,
    isTaxi: !!o.taxi,
    isIR: !!o.ir,
  }
}

export function roster(id, owner, players, picks = [], extra = {}) {
  const totalValue =
    players.reduce((s, p) => s + p.value, 0) + picks.reduce((s, p) => s + p.value, 0)
  return {
    rosterId: id, owner, players, picks, totalValue,
    faabBudget: 1000, faabRemaining: 750, faabSpent: 250,
    record: { wins: 2, losses: 1, ties: 0 }, hasRecord: true,
    pointsFor: 300.456, pointsAgainst: 280.1,
    pickCapitalScore: 5000, avgStarterAge: 25.66,
    starterOrder: players.filter(p => p.isStarter).map(p => p.sleeperId),
    ...extra,
  }
}

// Mine: three good QBs (surplus), one thin WR (deficit), plus the rule-7 cases.
export const MINE = roster(6, USER('u6', 'NIX CAGE', 'chnates'), [
  player({ id: '1', name: 'Star Quarterback', pos: 'QB', value: 7000, starter: true, trend: 800 }),
  player({ id: '2', name: 'Second Quarterback', pos: 'QB', value: 5000, starter: true, trend: 300 }),
  player({ id: '3', name: 'Third Quarterback', pos: 'QB', value: 3000, trend: 0 }),
  player({ id: '4', name: 'Lone Wideout', pos: 'WR', value: 800, starter: true }),
  player({ id: '5', name: 'Solid Runner', pos: 'RB', value: 4000, starter: true }),
  player({ id: '6', name: 'Deep Stash', pos: 'WR', unranked: true }),
  player({ id: '7', name: 'Taxi Rookie', pos: 'RB', value: 500, taxi: true }),
  player({ id: '8', name: 'Hurt Receiver', pos: 'WR', value: 900, ir: true }),
  player({ id: '9', name: 'Kansas City Chiefs', pos: 'DEF', unranked: true, starter: true }),
], [
  { season: '2027', round: 1, originalOwner: 6, slot: null, slotLabel: null, value: 2000 },
  { season: '2027', round: 2, originalOwner: 3, slot: 9, slotLabel: '2.09', value: 900 },
])

// Theirs: deep at WR, thin at QB — the mirror, so a QB-for-WR swap has a
// reason to exist on both sides.
export const THEIRS = roster(3, USER('u3', 'Mahomes Depot', 'depot'), [
  player({ id: '20', name: 'Elite Wideout', pos: 'WR', value: 6000, starter: true }),
  player({ id: '21', name: 'Good Wideout', pos: 'WR', value: 4500, starter: true, trend: -400 }),
  player({ id: '22', name: 'Spare Wideout', pos: 'WR', value: 3000, starter: true }),
  player({ id: '23', name: 'Weak Quarterback', pos: 'QB', value: 1200, starter: true }),
  player({ id: '24', name: 'Their Runner', pos: 'RB', value: 2500, starter: true }),
], [
  { season: '2027', round: 1, originalOwner: 3, slot: null, slotLabel: null, value: 2000 },
])

export const OTHER = roster(7, USER('u7', 'Jake & Bake', 'jakeb'), [
  player({ id: '30', name: 'Marquise Brown', pos: 'WR', value: 1500, starter: true }),
  player({ id: '31', name: 'Chase Brown', pos: 'RB', value: 3500, starter: true }),
], [
  { season: '2027', round: 1, originalOwner: 7, slot: null, slotLabel: null, value: 2000 },
])

export const LEAGUE = {
  allRosters: [MINE, THEIRS, OTHER],
  myRoster: MINE,
  userMap: { 6: MINE.owner, 3: THEIRS.owner, 7: OTHER.owner },
  leagueInfo: {
    league_id: 'L1', name: 'Test League',
    settings: { waiver_budget: 1000 },
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'SUPER_FLEX', 'DEF',
      ...Array(13).fill('BN'), 'TAXI', 'IR'],
  },
  pickYears: ['2027', '2028', '2029'],
  leagueId: 'L1',
  playerDB: {
    40: { name: 'Free Defense', position: 'DEF', team: 'BUF', age: null, years_exp: null, injury_status: null },
  },
}

// Everyone not on a roster, priced by FantasyCalc. Deliberately contains a WR
// (my deficit), a QB (my surplus) and a riser, so recommendFreeAgents has
// something to say in each branch.
export const PLAYER_MAP = {
  50: { sleeperId: '50', name: 'Available Wideout', position: 'WR', team: 'NE', age: 24, value: 1400, overallRank: 120, positionRank: 40, trend30Day: 200 },
  51: { sleeperId: '51', name: 'Available Quarterback', position: 'QB', team: 'MIN', age: 30, value: 900, overallRank: 200, positionRank: 30, trend30Day: 600 },
  52: { sleeperId: '52', name: 'Quiet Tight End', position: 'TE', team: 'DAL', age: 29, value: 300, overallRank: 400, positionRank: 40, trend30Day: 0 },
  // Rostered players also live in playerMap in the real payload.
  1: { sleeperId: '1', name: 'Star Quarterback', position: 'QB', team: 'ATL', age: 25, value: 7000, overallRank: 5, positionRank: 3, trend30Day: 800 },
  21: { sleeperId: '21', name: 'Good Wideout', position: 'WR', team: 'ATL', age: 25, value: 4500, overallRank: 20, positionRank: 8, trend30Day: -400 },
}

export const VALUES = {
  playerMap: PLAYER_MAP,
  pickEntries: [
    { name: '2027 1st', value: 2000 },
    { name: '2027 2nd', value: 900 },
    { name: '2027 Pick 2.09', value: 950 },
    { name: '2028 1st', value: 1800 },
  ],
}

const stamp = (iso, age) => ({ fetchedAt: iso, ageSeconds: age, stale: false, error: null })

export function makeSnapshot(over = {}) {
  return {
    league: LEAGUE,
    values: VALUES,
    playerDB: LEAGUE.playerDB,
    nflState: { season: '2027', season_type: 'regular', week: 3 },
    isOffseason: false,
    asOf: {
      generatedAt: '2027-09-19T14:00:00.000Z',
      oldestSourceAt: '2027-09-19T13:58:00.000Z',
      stale: false,
      sources: {
        sleeper: stamp('2027-09-19T13:58:00.000Z', 120),
        fantasycalc: stamp('2027-09-19T13:59:00.000Z', 60),
        playerDB: stamp('2027-09-19T13:59:00.000Z', 60),
      },
    },
    counts: {
      rosters: 3, players: 16, unrankedPlayers: 2, picks: 4,
      pricedPlayers: 5, playerDBEntries: 11000,
    },
    ...over,
  }
}

// In-season weekly block, as mcp/weekly.js returns it.
export function makeWeekly(over = {}) {
  return {
    available: true,
    isOffseason: false,
    season: '2027',
    week: 3,
    requestedWeek: null,
    projMap: {
      50: { pts_half_ppr: 9.4 },
      51: { pts_half_ppr: 17.2 },
      52: { pts_half_ppr: 3.1 },
      9: { pts_half_ppr: 8.6 },
    },
    playingTeams: new Set(['ATL', 'NE', 'MIN', 'DAL', 'KC', 'BUF']),
    scheduleGames: [],
    sources: {
      projections: stamp('2027-09-19T13:50:00.000Z', 720),
      schedule: stamp('2027-09-19T13:50:00.000Z', 720),
    },
    notes: [],
    ...over,
  }
}

// The offseason block — `available: false` with a note, never zeros.
export function makeOffseasonWeekly() {
  return {
    available: false, isOffseason: true, season: '2027', week: null,
    requestedWeek: null, projMap: null, playingTeams: new Set(), scheduleGames: [],
    sources: {}, notes: ['It is the offseason, so Sleeper publishes no weekly projections.'],
  }
}

// The rest-of-season block, as mcp/season.js returns it. Three rosters and a
// 3-week regular season with a 2-team field, so the simulated odds actually
// discriminate — with the league default of 6 playoff spots for 3 teams,
// every team would make it and every assertion would be 100%.
//
// `played` is how many of the three weeks have complete scores.
//
// `posted: false` is the DEEP-OFFSEASON case and it is a different state from
// `played: 0`: no schedule has been published at all, so every week comes back
// with no entries. `played: 0` means the schedule IS posted and week 1 has not
// kicked off — which is `active`, not `preseason`, because the model can
// simulate all three weeks off the roster-strength prior alone. That is the
// documented "seeded from projections early, real data later" behaviour, and
// conflating the two would put a strength PREVIEW on screen in Week 1 when
// real odds were available.
export function makeSeason({ played = 2, posted = true, over = {} } = {}) {
  const pairs = [[6, 3], [6, 7], [3, 7]] // one per week
  const perWeek = pairs.map(([a, b], i) => ({
    week: i + 1,
    entries: posted ? [
      { roster_id: a, matchup_id: 1, points: i < played ? 120 + i * 5 : 0 },
      { roster_id: b, matchup_id: 1, points: i < played ? 95 + i * 3 : 0 },
    ] : [],
  }))
  return {
    available: true,
    reason: null,
    perWeek,
    lastWeek: 3,
    playoffTeams: 2,
    firstPlayoffWeek: 4,
    failedWeeks: [],
    sources: {
      matchups: { fetchedAt: '2027-09-19T13:45:00.000Z', ageSeconds: 1020, stale: false, error: null },
    },
    notes: [],
    ...over,
  }
}

// The total-outage block — NOT a preseason, and the difference is the point.
export function makeUnavailableSeason() {
  return {
    available: false, reason: 'unavailable', perWeek: null, lastWeek: 3,
    playoffTeams: 2, firstPlayoffWeek: 4, failedWeeks: [1, 2, 3],
    sources: { matchups: { fetchedAt: null, ageSeconds: null, stale: false, error: 'Sleeper 500' } },
    notes: ['None of this league\'s 3 regular-season matchup weeks could be loaded — this is a data failure, NOT a preseason.'],
  }
}
