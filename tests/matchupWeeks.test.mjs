// tests/matchupWeeks.test.mjs — pins the shared matchup-weeks cache contract
// (src/hooks/matchupWeeks.js) with a mocked fetch.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 14 + Feature 9: playoff odds (weeks 1..playoff_week_start−1,
//    full entries) and lineup history ("my" rows for weeks 1..17 / 1..current−1)
//    share ONE session cache — each week is fetched at most once across both
//    consumers, including when they mount concurrently.
//  - Degradation: a single failed week degrades to empty entries (the old
//    per-week `.catch(() => [])`), but when EVERY requested week fails the
//    load REJECTS so League › Playoffs / Season Review show ErrorState
//    instead of masquerading as "preseason" / "no data" (F7).
//  - A total-outage rejection caches nothing, so retry refetches for real.
//  - Repeated loads of the same range return the same array reference —
//    usePlayoffOdds' module-scope derived-results cache keys on identity.
//  - Lineup derivation (Feature 9): unplayed weeks (my points === 0) and
//    weeks without my entry are skipped.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadMatchupWeeks, peekMatchupWeeks, resetMatchupWeeks } from '../src/hooks/matchupWeeks.js'
import { loadHistory } from '../src/hooks/useLineupHistory.js'

const calls = []
let failing = () => false // (week) => should this week's fetch fail?

globalThis.fetch = async url => {
  const week = Number(String(url).split('/').pop())
  calls.push(week)
  if (failing(week)) return { ok: false, status: 500, json: async () => ({}) }
  return {
    ok: true,
    // Weeks past 15 come back unplayed (points 0) — like real late-season
    // buckets Sleeper returns before those weeks are played.
    json: async () => [
      {
        roster_id: 1,
        matchup_id: 1,
        points: week > 15 ? 0 : 100 + week,
        players: ['p1'],
        players_points: { p1: 10 },
      },
      {
        roster_id: 2,
        matchup_id: 1,
        points: week > 15 ? 0 : 90,
        players: ['p2'],
        players_points: { p2: 9 },
      },
    ],
  }
}

test('one fetch per week across both consumers (playoff range, then lineup range)', async () => {
  resetMatchupWeeks()
  calls.length = 0

  // usePlayoffOdds' range: playoff_week_start 15 → weeks 1..14, full entries.
  const playoffWeeks = await loadMatchupWeeks(14)
  assert.equal(calls.length, 14)
  assert.equal(playoffWeeks.length, 14)
  assert.equal(playoffWeeks[0].week, 1)
  assert.equal(playoffWeeks[0].entries.length, 2)

  // useLineupHistory's offseason range (1..17) derives "my" rows from the
  // same cache — only weeks 15–17 hit the network.
  const byWeek = await loadHistory(1, 17)
  assert.equal(calls.length, 17)
  assert.deepEqual(calls.slice(14), [15, 16, 17])

  // Derivation: weeks 16–17 are unplayed (points 0) → skipped.
  assert.equal(byWeek.length, 15)
  assert.deepEqual(byWeek[0], {
    week: 1,
    points: 101,
    players: ['p1'],
    playersPoints: { p1: 10 },
  })
})

test('concurrent consumers share in-flight fetches (no duplicate requests)', async () => {
  resetMatchupWeeks()
  calls.length = 0
  const [a, b, c] = await Promise.all([
    loadMatchupWeeks(14),
    loadMatchupWeeks(14),
    loadMatchupWeeks(17),
  ])
  assert.equal(calls.length, 17)
  assert.equal(a, b) // same range → same in-flight promise → same array
  assert.equal(c.length, 17)
})

test('repeat loads return the same array reference (derived-results cache keys on identity)', async () => {
  const first = await loadMatchupWeeks(14)
  const again = await loadMatchupWeeks(14)
  assert.equal(again, first)
  assert.equal(peekMatchupWeeks(14), first)
  assert.equal(peekMatchupWeeks(10), null) // unloaded range peeks null
})

test('a single failed week degrades to empty entries — the load still resolves', async () => {
  resetMatchupWeeks()
  calls.length = 0
  failing = w => w > 10
  const weeks = await loadMatchupWeeks(14)
  failing = () => false
  assert.equal(weeks.length, 14)
  assert.deepEqual(weeks[13].entries, []) // failed week → empty, not an error
  assert.equal(weeks[9].entries.length, 2) // good weeks untouched
})

test('EVERY week failing rejects (F7: ErrorState, not a fake preseason), and retry refetches', async () => {
  resetMatchupWeeks()
  failing = () => true
  await assert.rejects(() => loadMatchupWeeks(14), /Could not load matchup data/)
  // The lineup-history consumer path rejects the same way.
  await assert.rejects(() => loadHistory(2, 9), /Could not load matchup data/)

  // Nothing was cached from the outage: with the network back, a retry
  // fetches every week fresh and succeeds.
  failing = () => false
  calls.length = 0
  const recovered = await loadMatchupWeeks(14)
  assert.equal(calls.length, 14)
  assert.equal(recovered[0].entries.length, 2)
})
