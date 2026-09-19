// tests/mcpSnapshot.test.mjs — pins the server's data layer (mcp/snapshot.js)
// against a mocked globalThis.fetch, the same pattern matchupWeeks.test.mjs
// and transactions.test.mjs use for module-level fetch loaders.
//
// Behaviors pinned (with their source):
//  - MCP_DISCOVERY.md §1: "~15-minute snapshot TTL, background refresh — one
//    assembly per conversation instead of five."
//  - MCP_DISCOVERY.md §1: "What on an API failure? Serve cache, label the age
//    in the output."
//  - MCP_DISCOVERY.md §7: "every tool output carries provenance — an as-of
//    timestamp, counts, and explicit unranked flags — so a wrong answer at
//    least looks wrong." This is the mitigation for the fact that NOTHING in
//    this codebase validates an external payload.
//  - MCP_DISCOVERY.md §1: "League / identity scope — parameterized from day
//    one." Nothing here may read LEAGUE_ID as a constant.
//  - CLAUDE.md FantasyCalc contract: the four query params are frozen, and the
//    player/pick split is by id SHAPE, not presence.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getSnapshot, resetSnapshotCache } from '../mcp/snapshot.js'

// ── a minimal but shape-accurate world ─────────────────────────────────────
const FC = [
  { player: { sleeperId: '100', name: 'Ranked QB', position: 'QB', maybeTeam: 'ATL', maybeAge: 26 }, value: 7000, overallRank: 1, positionRank: 1, trend30Day: 60 },
  { player: { sleeperId: '200', name: 'Ranked RB', position: 'RB', maybeTeam: 'GB', maybeAge: 24 }, value: 5000, overallRank: 5, positionRank: 2, trend30Day: -60 },
  // Pick entries carry synthetic NON-NUMERIC ids — the split is by shape.
  { player: { sleeperId: 'FP_2027_1', name: '2027 1st' }, value: 2000 },
  { player: { name: '2027 2nd' }, value: 800 },
]
const PLAYERS_NFL = {
  100: { first_name: 'Ranked', last_name: 'QB', position: 'QB', team: 'ATL', age: 26 },
  400: { first_name: 'Deep', last_name: 'Stash', position: 'TE', team: 'NYJ', age: 23 },
}
const ROSTERS = [
  { roster_id: 1, owner_id: 'u1', players: [100, '200', 400], starters: ['100', '200'], settings: { wins: 2, losses: 1, waiver_budget_used: 40 } },
  { roster_id: 2, owner_id: 'u2', players: ['200'], starters: ['200'], settings: {} },
]
const USERS = [
  { user_id: 'u1', username: 'chnates', display_name: 'chnates', metadata: { team_name: 'NIX CAGE' } },
  { user_id: 'u2', username: 'rival', display_name: 'Rival', metadata: {} },
]

function installFetch({ fail = new Set(), count = { n: 0 }, urls = [] } = {}) {
  globalThis.fetch = async url => {
    const u = String(url)
    urls.push(u)
    count.n++
    for (const f of fail) if (u.includes(f)) return { ok: false, status: 500, json: async () => ({}) }
    const body =
      u.includes('fantasycalc') ? FC
      : u.includes('/players/nfl') ? PLAYERS_NFL
      : u.includes('/rosters') ? ROSTERS
      : u.includes('/users') ? USERS
      : u.includes('/traded_picks') ? []
      : u.includes('/state/nfl') ? { season: '2027', season_type: 'regular', week: 3 }
      : u.includes('/drafts') ? []
      : { league_id: u.split('/league/')[1], name: 'Test League', settings: { waiver_budget: 1000 } }
    return { ok: true, status: 200, json: async () => body }
  }
  return { count, urls }
}

async function withFetch(opts, fn) {
  const real = globalThis.fetch
  resetSnapshotCache()
  const probe = installFetch(opts)
  try { return await fn(probe) } finally { globalThis.fetch = real; resetSnapshotCache() }
}

// ── parameterization ───────────────────────────────────────────────────────

test('leagueId is a parameter — it appears in the URLs, and is required', async () => {
  await withFetch({}, async ({ urls }) => {
    await getSnapshot({ leagueId: 'ABC123' })
    assert.ok(urls.some(u => u.includes('/league/ABC123/rosters')))
    assert.ok(!urls.some(u => u.includes('1313933520715907072')), 'no hardcoded league leaked in')
  })
  await assert.rejects(getSnapshot({}), /requires a leagueId/)
})

test('FantasyCalc is called with the four frozen params', async () => {
  await withFetch({}, async ({ urls }) => {
    await getSnapshot({ leagueId: 'L1' })
    const fc = urls.find(u => u.includes('fantasycalc'))
    assert.match(fc, /isDynasty=true/)
    assert.match(fc, /numQbs=2/)
    assert.match(fc, /numTeams=10/)
    assert.match(fc, /ppr=0\.5/)
  })
})

// ── the TTL ────────────────────────────────────────────────────────────────

test('a second call inside the TTL refetches nothing (§1: one assembly per conversation)', async () => {
  await withFetch({}, async ({ count }) => {
    await getSnapshot({ leagueId: 'L1' })
    const afterFirst = count.n
    assert.ok(afterFirst >= 8, 'cold start fetches every source')
    await getSnapshot({ leagueId: 'L1' })
    assert.equal(count.n, afterFirst, 'the 5-8MB player DB must not be re-downloaded')
  })
})

test('force refetches, and an expired TTL refetches', async () => {
  await withFetch({}, async ({ count }) => {
    await getSnapshot({ leagueId: 'L1' })
    const a = count.n
    await getSnapshot({ leagueId: 'L1', force: true })
    assert.ok(count.n > a, 'force bypasses the cache')
    const b = count.n
    await getSnapshot({ leagueId: 'L1', ttlMs: 0 })
    assert.ok(count.n > b, 'an expired snapshot refetches')
  })
})

test('FantasyCalc and the player DB are cached ACROSS leagues; league data is not', async () => {
  await withFetch({}, async ({ urls }) => {
    await getSnapshot({ leagueId: 'L1' })
    const before = urls.length
    await getSnapshot({ leagueId: 'L2' })
    const added = urls.slice(before)
    assert.ok(added.some(u => u.includes('/league/L2/rosters')), 'league data is per-league')
    assert.ok(!added.some(u => u.includes('/players/nfl')),
      'the player DB is league-agnostic — a second league must not re-download 5-8MB')
    assert.ok(!added.some(u => u.includes('fantasycalc')), 'values are league-agnostic too')
  })
})

// ── provenance (§7) ────────────────────────────────────────────────────────

test('every snapshot carries a per-source as-of stamp', async () => {
  await withFetch({}, async () => {
    const s = await getSnapshot({ leagueId: 'L1' })
    assert.ok(s.asOf.generatedAt)
    assert.ok(s.asOf.oldestSourceAt)
    assert.equal(s.asOf.stale, false)
    for (const key of ['sleeper', 'fantasycalc', 'playerDB']) {
      assert.ok(s.asOf.sources[key].fetchedAt, `${key} must be stamped`)
      assert.equal(typeof s.asOf.sources[key].ageSeconds, 'number')
      assert.equal(s.asOf.sources[key].stale, false)
    }
  })
})

test('oldestSourceAt is the STALEST input, never the newest', async () => {
  await withFetch({}, async () => {
    const s = await getSnapshot({ leagueId: 'L1' })
    const times = Object.values(s.asOf.sources).map(x => x.fetchedAt).filter(Boolean)
    assert.equal(s.asOf.oldestSourceAt, times.slice().sort()[0],
      'an answer is only as fresh as its stalest input')
  })
})

test('counts make "did this actually load?" answerable from the response (§7)', async () => {
  await withFetch({}, async () => {
    const s = await getSnapshot({ leagueId: 'L1' })
    assert.equal(s.counts.rosters, 2)
    assert.equal(s.counts.players, 4, '3 on roster 1 + 1 on roster 2')
    assert.equal(s.counts.unrankedPlayers, 1, 'the deep stash')
    assert.equal(s.counts.pricedPlayers, 2)
    assert.ok(s.counts.playerDBEntries > 0)
  })
})

// ── failure behaviour (§1: serve cache, label the age) ─────────────────────

test('a failed refresh serves the cache and LABELS it stale', async () => {
  const real = globalThis.fetch
  resetSnapshotCache()
  try {
    installFetch({})
    const fresh = await getSnapshot({ leagueId: 'L1' })
    assert.equal(fresh.asOf.stale, false)

    installFetch({ fail: new Set(['/rosters']) })
    const served = await getSnapshot({ leagueId: 'L1', ttlMs: 0 })
    assert.ok(served.league, 'an old answer beats no answer')
    assert.equal(served.asOf.stale, true, 'and it must SAY it is old')
    assert.equal(served.asOf.sources.sleeper.stale, true)
    assert.match(served.asOf.sources.sleeper.error, /500/, 'the reader is told why')
    assert.equal(served.asOf.sources.fantasycalc.stale, false, 'staleness is per source')
  } finally { globalThis.fetch = real; resetSnapshotCache() }
})

test('a COLD failure throws — that is a real "I do not know"', async () => {
  await withFetch({ fail: new Set(['/rosters']) }, async () => {
    await assert.rejects(getSnapshot({ leagueId: 'L1' }), /500/)
  })
})

test('the player DB is best-effort: without it the snapshot still builds (rule 7 degrades)', async () => {
  await withFetch({ fail: new Set(['/players/nfl']) }, async () => {
    const s = await getSnapshot({ leagueId: 'L1' })
    assert.ok(s.league, 'a 5-8MB best-effort fetch must not fail the whole answer')
    assert.equal(s.counts.playerDBEntries, 0)
    assert.equal(s.counts.unrankedPlayers, 0,
      'without the DB an unranked player is absent, exactly as the app behaves pre-load')
    assert.ok(s.asOf.sources.playerDB.error, 'and the response says the DB is missing')
  })
})

test('an empty FantasyCalc payload throws rather than pricing every roster at 0', async () => {
  const real = globalThis.fetch
  resetSnapshotCache()
  try {
    installFetch({})
    const inner = globalThis.fetch
    globalThis.fetch = async url =>
      String(url).includes('fantasycalc')
        ? { ok: true, status: 200, json: async () => [] }
        : inner(url)
    await assert.rejects(getSnapshot({ leagueId: 'L1' }), /no player values/)
  } finally { globalThis.fetch = real; resetSnapshotCache() }
})

test('a non-array FantasyCalc payload throws too (silent shape drift)', async () => {
  const real = globalThis.fetch
  resetSnapshotCache()
  try {
    installFetch({})
    const inner = globalThis.fetch
    globalThis.fetch = async url =>
      String(url).includes('fantasycalc')
        ? { ok: true, status: 200, json: async () => ({ players: [] }) }
        : inner(url)
    await assert.rejects(getSnapshot({ leagueId: 'L1' }), /unexpected data/)
  } finally { globalThis.fetch = real; resetSnapshotCache() }
})

// ── the assembled state ────────────────────────────────────────────────────

test('the snapshot yields a real league state, with myRoster following myRosterId', async () => {
  await withFetch({}, async () => {
    const s = await getSnapshot({ leagueId: 'L1', myRosterId: 2 })
    assert.equal(s.league.myRoster.rosterId, 2)
    assert.equal(s.league.leagueId, 'L1')
    assert.equal(s.isOffseason, false)
    assert.equal(s.nflState.week, 3)
  })
})
