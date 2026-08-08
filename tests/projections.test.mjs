// tests/projections.test.mjs — pins the Week 1 lineup engine (src/utils/projections.js).
//
// This file exists because the entire in-season half of the app had only ever
// been code-read, never executed (docs/open-items.md ACTIVE-1). Probing the
// live Sleeper API on 2026-08-08 found two breaks that code-reading missed —
// both are pinned here:
//
//  1. `/v1/schedule/nfl/regular/{y}` 404s for every season; the working
//     endpoint is off /v1 (SLEEPER_ROOT) and its payload uses `home`/`away`,
//     NOT `home_team`/`away_team`. Reading the old field names silently
//     yielded "no games", killing bye detection and opponent lookup.
//  2. `/v1/stats/nfl/regular/{y}/{w}` entries carry NO `pos`/`opp`/`tm` —
//     null on every entry in 2022–2026. The old computeDefenseRankings keyed
//     off those fields, so it returned {} and every player's matchup quality
//     read 'Neutral' forever (CLAUDE.md Feature 4 documents Easy/Neutral/Tough
//     on every player). Position and team now come from the shared player DB
//     and the opponent from the schedule.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 4 matchup quality: Easy = bottom third of defenses vs
//    the position (most points allowed), Tough = top third, else Neutral.
//  - CLAUDE.md Feature 4 status flags: red = Out/IR/bye (hard block),
//    yellow = Questionable OR any bench player projecting higher ("flag any
//    positive difference — no minimum threshold"), green otherwise.
//  - Degradation: a week with no stats yet (Week 1) ranks nothing and reports
//    'Neutral' — the honest answer, never a guess off an empty sample.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOpponentMap,
  computeDefenseRankings,
  getMatchupQuality,
  getProjPts,
  getPlayerFlag,
  getBestBench,
} from '../src/utils/projections.js'

// Six teams, three games — shaped exactly like the live payload.
const SCHEDULE = [
  { week: 1, home: 'ATL', away: 'CAR', status: 'pre_game' },
  { week: 1, home: 'BUF', away: 'MIA', status: 'pre_game' },
  { week: 1, home: 'DET', away: 'GB', status: 'pre_game' },
  { week: 2, home: 'CAR', away: 'BUF', status: 'pre_game' },
]

// The trimmed player DB shape usePlayerDB caches: position + team.
const PLAYER_DB = {
  r1: { position: 'RB', team: 'ATL' }, // faced CAR
  r2: { position: 'RB', team: 'CAR' }, // faced ATL
  r3: { position: 'RB', team: 'BUF' }, // faced MIA
  r4: { position: 'RB', team: 'MIA' }, // faced BUF
  r5: { position: 'RB', team: 'DET' }, // faced GB
  r6: { position: 'RB', team: 'GB' },  // faced DET
  w1: { position: 'WR', team: 'ATL' },
  bye: { position: 'RB', team: 'NYJ' }, // no week-1 game → contributes nothing
}

test('buildOpponentMap reads home/away and filters to the week', () => {
  const wk1 = buildOpponentMap(SCHEDULE, 1)
  assert.equal(wk1.ATL, 'CAR')
  assert.equal(wk1.CAR, 'ATL')
  assert.equal(wk1.GB, 'DET')
  assert.equal(Object.keys(wk1).length, 6) // week 2's CAR/BUF game excluded
  // The pre-fix field names must NOT resurrect: a payload using home_team /
  // away_team yields nothing, which is what silently broke matchup quality.
  assert.deepEqual(buildOpponentMap([{ week: 1, home_team: 'ATL', away_team: 'CAR' }], 1), {})
  assert.deepEqual(buildOpponentMap(null, 1), {})
})

test('defense rankings join stats → player DB → schedule (thirds by points allowed)', () => {
  // Points each player scored; the DEFENSE that allowed them is his opponent.
  const stats = {
    r1: { pts_half_ppr: 30 }, // CAR allowed 30 to RBs → most generous
    r2: { pts_half_ppr: 20 }, // ATL allowed 20
    r3: { pts_half_ppr: 15 }, // MIA allowed 15
    r4: { pts_half_ppr: 10 }, // BUF allowed 10
    r5: { pts_half_ppr: 5 },  // GB  allowed 5
    r6: { pts_half_ppr: 1 },  // DET allowed 1 → stingiest
    bye: { pts_half_ppr: 99 }, // no opponent this week → ignored entirely
    ghost: { pts_half_ppr: 50 }, // not in the player DB → ignored
  }
  const r = computeDefenseRankings(stats, { playerDB: PLAYER_DB, schedule: SCHEDULE, week: 1 })

  // 6 defenses ranked: ceil(6/3)=2 Easy, floor(6/3)=2 Tough, 2 Neutral.
  assert.equal(Object.keys(r.RB).length, 6)
  assert.equal(r.RB.CAR, 'Easy')   // allowed the most
  assert.equal(r.RB.ATL, 'Easy')
  assert.equal(r.RB.MIA, 'Neutral')
  assert.equal(r.RB.BUF, 'Neutral')
  assert.equal(r.RB.GB, 'Tough')
  assert.equal(r.RB.DET, 'Tough')  // allowed the least
  assert.equal(r.RB.NYJ, undefined) // bye team never appears as a defense

  // Positions are independent — no WR stats means no WR rankings.
  assert.deepEqual(r.WR, {})
})

test('points allowed are TOTALLED per defense, not averaged over players faced', () => {
  // ATL faced two RBs for 12 total; BUF faced one for 20. Averaging would rank
  // ATL (avg 6) below BUF (avg 20) AND above nothing — but BUF genuinely gave
  // up more. Totalling keeps a deep bench of zero-point players from diluting.
  const db = {
    a1: { position: 'RB', team: 'CAR' }, a2: { position: 'RB', team: 'CAR' },
    b1: { position: 'RB', team: 'MIA' }, z: { position: 'RB', team: 'GB' },
  }
  const stats = {
    a1: { pts_half_ppr: 6 }, a2: { pts_half_ppr: 6 }, // ATL allowed 12
    b1: { pts_half_ppr: 20 },                          // BUF allowed 20
    z: { pts_half_ppr: 0 },                            // DET allowed 0
  }
  const r = computeDefenseRankings(stats, { playerDB: db, schedule: SCHEDULE, week: 1 })
  assert.equal(r.RB.BUF, 'Easy')
  assert.equal(r.RB.ATL, 'Neutral')
  assert.equal(r.RB.DET, 'Tough')
})

test('Week 1 contract: no stats yet ranks nothing and reports Neutral', () => {
  // Sleeper returns {} for a week that has not been played (verified live:
  // /v1/stats/nfl/regular/2026/1 → {} on 2026-08-08).
  const r = computeDefenseRankings({}, { playerDB: PLAYER_DB, schedule: SCHEDULE, week: 1 })
  assert.deepEqual(r, { QB: {}, RB: {}, WR: {}, TE: {} })
  assert.equal(getMatchupQuality('ATL', 'RB', 1, SCHEDULE, r), 'Neutral')

  // Missing player DB (its fetch failed) also degrades, never throws.
  assert.deepEqual(computeDefenseRankings({ r1: { pts_half_ppr: 30 } }, { schedule: SCHEDULE, week: 1 }), {})
  // Entries with a null score are skipped rather than counted as zero.
  const nulls = computeDefenseRankings(
    { r1: { pts_half_ppr: null }, r2: { pts_half_ppr: null } },
    { playerDB: PLAYER_DB, schedule: SCHEDULE, week: 1 },
  )
  assert.deepEqual(nulls.RB, {})
})

test('getMatchupQuality resolves the opponent from home/away either side', () => {
  const rankings = { RB: { CAR: 'Easy', ATL: 'Tough' } }
  assert.equal(getMatchupQuality('ATL', 'RB', 1, SCHEDULE, rankings), 'Easy')  // ATL faces CAR
  assert.equal(getMatchupQuality('CAR', 'RB', 1, SCHEDULE, rankings), 'Tough') // CAR faces ATL
  assert.equal(getMatchupQuality('NYJ', 'RB', 1, SCHEDULE, rankings), 'Neutral') // bye → no game
  assert.equal(getMatchupQuality('ATL', 'WR', 1, SCHEDULE, rankings), 'Neutral') // unranked position
  assert.equal(getMatchupQuality('ATL', 'RB', 1, [], rankings), 'Neutral')       // schedule missing
})

test('getProjPts reads pts_half_ppr and defaults to 0', () => {
  assert.equal(getProjPts('r1', { r1: { pts_half_ppr: 14.6 } }), 14.6)
  assert.equal(getProjPts('r1', { r1: {} }), 0)
  assert.equal(getProjPts('nope', { r1: { pts_half_ppr: 9 } }), 0)
  assert.equal(getProjPts('r1', null), 0)
})

// ── Status flags (CLAUDE.md Feature 4) ────────────────────────────────────
const PLAYING = new Set(['ATL', 'CAR', 'BUF', 'MIA', 'DET', 'GB'])
const proj = { s1: { pts_half_ppr: 12 }, b1: { pts_half_ppr: 14 }, b2: { pts_half_ppr: 3 } }
const starter = { sleeperId: 's1', position: 'RB', team: 'ATL' }

test('red: hard blocks are Out/IR/bye and are non-negotiable', () => {
  const solo = []
  assert.equal(getPlayerFlag({ ...starter, isIR: true }, proj, {}, PLAYING, solo, ['RB']), 'red')
  assert.equal(getPlayerFlag({ ...starter, team: 'NYJ' }, proj, {}, PLAYING, solo, ['RB']), 'red') // bye
  assert.equal(getPlayerFlag(starter, proj, { s1: { injury_status: 'Out' } }, PLAYING, solo, ['RB']), 'red')
  assert.equal(getPlayerFlag(starter, proj, { s1: { injury_status: 'PUP' } }, PLAYING, solo, ['RB']), 'red')
  // With no schedule loaded (playingTeams empty) bye detection is skipped
  // rather than blocking every player — the best-effort schedule contract.
  assert.equal(getPlayerFlag({ ...starter, team: 'NYJ' }, proj, {}, new Set(), solo, ['RB']), 'green')
})

test('yellow: Questionable, or ANY bench player projecting higher (no threshold)', () => {
  assert.equal(getPlayerFlag(starter, proj, { s1: { injury_status: 'Questionable' } }, PLAYING, [], ['RB']), 'yellow')

  const better = [{ sleeperId: 'b1', position: 'RB', team: 'CAR' }]
  assert.equal(getPlayerFlag(starter, proj, {}, PLAYING, better, ['RB']), 'yellow')

  // A hairline edge still flags — the doc says flag any positive difference.
  const hair = [{ sleeperId: 'h', position: 'RB', team: 'CAR' }]
  assert.equal(
    getPlayerFlag(starter, { ...proj, h: { pts_half_ppr: 12.01 } }, {}, PLAYING, hair, ['RB']),
    'yellow',
  )
  // An injured bench player is not an upgrade, so he cannot raise the flag.
  assert.equal(
    getPlayerFlag(starter, proj, { b1: { injury_status: 'Out' } }, PLAYING, better, ['RB']),
    'green',
  )
  // Nor is a bench player ineligible for the slot.
  assert.equal(getPlayerFlag(starter, proj, {}, PLAYING, better, ['WR']), 'green')
})

test('green: healthy, playing, and the best option at his slot', () => {
  const worse = [{ sleeperId: 'b2', position: 'RB', team: 'CAR' }]
  assert.equal(getPlayerFlag(starter, proj, {}, PLAYING, worse, ['RB']), 'green')
})

test('getBestBench: slot-eligible, not hard-blocked, highest projection first', () => {
  const bench = [
    { sleeperId: 'b2', position: 'RB', team: 'CAR' }, // 3 pts
    { sleeperId: 'b1', position: 'RB', team: 'BUF' }, // 14 pts
    { sleeperId: 'w', position: 'WR', team: 'ATL' },  // wrong position
  ]
  assert.equal(getBestBench(['RB'], 's1', bench, proj, {}, PLAYING).sleeperId, 'b1')
  // Out → skipped, next best wins.
  assert.equal(
    getBestBench(['RB'], 's1', bench, proj, { b1: { injury_status: 'Out' } }, PLAYING).sleeperId,
    'b2',
  )
  // On bye → skipped too.
  const onBye = [{ sleeperId: 'b1', position: 'RB', team: 'NYJ' }, bench[0]]
  assert.equal(getBestBench(['RB'], 's1', onBye, proj, {}, PLAYING).sleeperId, 'b2')
  assert.equal(getBestBench(['TE'], 's1', bench, proj, {}, PLAYING), null)
  assert.equal(getBestBench(['RB'], 's1', null, proj, {}, PLAYING), null)
})
