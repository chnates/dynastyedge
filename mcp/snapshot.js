// snapshot.js — the server's data layer: fetch, cache, and STAMP.
//
// Three decisions from MCP_DISCOVERY.md, each with its reason:
//
// 1. ~15-MINUTE TTL (§1). One assembly per conversation instead of five. An
//    LLM asks four follow-up questions about the same roster; each should not
//    re-download an 8MB player DB.
//
// 2. ON FAILURE, SERVE THE CACHE AND LABEL ITS AGE (§1). Never a silent
//    failure, never a fabricated fresh answer, and never an error when a
//    perfectly usable five-minute-old snapshot is in hand. A cold failure with
//    nothing cached still throws — that is a real "I don't know".
//
// 3. EVERY SNAPSHOT CARRIES PROVENANCE (§7). This is the mitigation for the
//    biggest risk in the whole design: there is no schema validation anywhere
//    in this codebase, so in the app a Sleeper shape change produces a visibly
//    broken screen, but through an LLM it produces a confident, fluent, wrong
//    answer. The as-of stamp and the counts are what make a wrong answer LOOK
//    wrong to the reader.
//
// CACHE KEYING: league-scoped data is keyed by leagueId; FantasyCalc values
// and the Sleeper player DB are league-AGNOSTIC and cached once across all
// leagues. That matters — the player DB is 5–8MB, and a second league would
// otherwise re-download it.
//
// Note these are module-level caches, same pattern as the app's ~20 hook
// singletons. In a long-lived stdio process that is exactly right. It is NOT
// right for the serverless deployment in phase 2, which has no warm process
// and wants external KV — see mcp/README.md.

import { SLEEPER_BASE, FANTASYCALC_BASE, FANTASYCALC_PARAMS } from '../src/constants.js'
import { buildLeagueState } from '../src/utils/leagueState.js'
import { createFetcher } from './limit.js'
import { memoryStore, loadSource } from './store.js'

const FC_PARAMS = new URLSearchParams(
  Object.entries(FANTASYCALC_PARAMS).map(([k, v]) => [k, String(v)])
)

// ── cache keys ─────────────────────────────────────────────────────────────
//
// FantasyCalc values and the Sleeper player DB are league-AGNOSTIC and share
// one key across every league — the player DB is 5-8MB on the wire and a
// second league must not re-download it. Only Sleeper's league payload is
// keyed by leagueId.
//
// Prefixes are distinct from weekly.js's so both layers can share ONE store
// (which is what the HTTP deployment does — a single KV connection) without
// any chance of collision.
const VALUES_KEY = 'values'
const PLAYERDB_KEY = 'playerdb'
const leagueKey = leagueId => `league:${leagueId}`

// The DEFAULT backend is process memory: correct for the long-lived stdio
// process, where a cached snapshot resolves in 1ms against a 658ms cold
// assembly. The serverless HTTP transport has no warm process to hold this,
// so it passes its own store — see mcp/store.js.
const defaultStore = memoryStore()

export function resetSnapshotCache() {
  return defaultStore.clear()
}

// Mirrors useFantasyCalc's split EXACTLY. The player/pick classification is by
// id SHAPE, not presence: FantasyCalc stamps pick entries with synthetic
// non-numeric ids ("FP_2027_1", "DP_0_8"). Splitting on presence — the
// pre-2026-07 bug — dumps every pick into playerMap under a key no roster
// references and prices every pick at 0 app-wide.
function splitValues(data) {
  if (!Array.isArray(data)) {
    throw new Error('FantasyCalc returned unexpected data — player values unavailable')
  }
  const playerMap = {}
  const pickEntries = []
  data.forEach(entry => {
    const sid = entry.player?.sleeperId
    if (sid != null && /^\d+$/.test(String(sid))) {
      playerMap[String(sid)] = {
        name: entry.player.name,
        position: entry.player.position,
        team: entry.player.maybeTeam || '',
        age: entry.player.maybeAge ?? null,
        value: Math.round(entry.value ?? 0),
        overallRank: entry.overallRank ?? null,
        positionRank: entry.positionRank ?? null,
        trend30Day: entry.trend30Day ?? 0,
        experience: entry.player.experience ?? null,
        sleeperId: String(sid),
      }
    } else if (entry.player?.name) {
      pickEntries.push({ name: entry.player.name, value: Math.round(entry.value ?? 0) })
    }
  })
  // Guard a silent shape change: an empty playerMap would price every roster
  // at 0 with no visible error. Same throw useFantasyCalc carries.
  if (Object.keys(playerMap).length === 0) {
    throw new Error('FantasyCalc returned no player values — try again later')
  }
  return { playerMap, pickEntries }
}

// Mirrors usePlayerDB's trim. The raw 5–8MB response is discarded; only these
// fields survive. A tool needing another field adds it here — never a second
// fetch of /players/nfl.
function trimPlayerDB(data) {
  const meta = {}
  Object.entries(data).forEach(([id, p]) => {
    meta[id] = {
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      position: p.position ?? null,
      team: p.team || '',
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
      injury_status: p.injury_status ?? null,
    }
  })
  return meta
}

async function fetchSleeperCore(get, leagueId) {
  const [leagueInfo, rosters, users, tradedPicks, nflState, drafts] = await Promise.all([
    get(`${SLEEPER_BASE}/league/${leagueId}`, { label: 'Sleeper league' }),
    get(`${SLEEPER_BASE}/league/${leagueId}/rosters`, { label: 'Sleeper rosters' }),
    get(`${SLEEPER_BASE}/league/${leagueId}/users`, { label: 'Sleeper users' }),
    get(`${SLEEPER_BASE}/league/${leagueId}/traded_picks`, { label: 'Sleeper traded picks' }),
    get(`${SLEEPER_BASE}/state/nfl`, { label: 'Sleeper NFL state' }),
    // Best-effort, exactly as useSleeper treats it: the drafts list only
    // enriches picks with their exact slot and slot-level price. Without it
    // picks still resolve at the round median.
    get(`${SLEEPER_BASE}/league/${leagueId}/drafts`, { label: 'Sleeper drafts' }).catch(() => []),
  ])
  if (!leagueInfo || !Array.isArray(rosters) || rosters.length === 0) {
    throw new Error(`Sleeper returned no rosters for league ${leagueId}`)
  }
  return { leagueInfo, rosters, users, tradedPicks, nflState, drafts }
}

// THE snapshot: raw sources fetched + the assembled league state + provenance.
//
//   leagueId    which league (never a constant here)
//   myRosterId  whose "me" — decides `myRoster` only
export async function getSnapshot({
  leagueId, myRosterId = null, ttlMs = 15 * 60 * 1000, concurrency = 6, force = false, fetcher,
  store = defaultStore,
} = {}) {
  if (!leagueId) throw new Error('getSnapshot requires a leagueId')
  const get = fetcher ?? createFetcher({ concurrency })
  const ttl = force ? -1 : ttlMs

  const [core, values, playerDB] = await Promise.all([
    loadSource(store, leagueKey(leagueId), ttl, () => fetchSleeperCore(get, leagueId)),
    loadSource(store, VALUES_KEY, ttl, async () =>
      splitValues(await get(`${FANTASYCALC_BASE}/values/current?${FC_PARAMS}`, {
        timeoutMs: 30000, label: 'FantasyCalc',
      }))),
    // The player DB is what makes rule 7 possible: a rostered player
    // FantasyCalc does not rank still gets a name, a position and `—`. It is
    // best-effort — without it those players are simply absent, exactly as the
    // app behaves before the background fetch lands — so it must never fail
    // the whole snapshot.
    loadSource(store, PLAYERDB_KEY, ttl, async () =>
      trimPlayerDB(await get(`${SLEEPER_BASE}/players/nfl`, {
        timeoutMs: 45000, label: 'Sleeper player DB',
      }))).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message })),
  ])

  // NOTE: no write-back here any more. loadSource persists a successful
  // refresh itself, so there is exactly one place that decides what gets
  // cached — and the stale path never re-writes an entry it only read.

  const league = buildLeagueState({
    sleeperData: core.data,
    fcValues: values.data,
    playerDB: playerDB.data,
    myRosterId,
    leagueId,
  })

  const sources = {
    sleeper: stamp(core),
    fantasycalc: stamp(values),
    playerDB: stamp(playerDB),
  }

  return {
    league,
    // The FantasyCalc split itself. `buildLeagueState` folds values INTO the
    // rosters, but the pool of everyone NOT on a roster (free agents) and the
    // market-wide scan `computeEdgeSignals` runs both need the raw map, so it
    // is exposed rather than re-derived. Same object the app's LeagueContext
    // hands its consumers as `values`.
    values: values.data,
    playerDB: playerDB.data,
    nflState: core.data.nflState ?? null,
    isOffseason: core.data.nflState?.season_type !== 'regular',
    asOf: {
      // The OLDEST contributing source — an answer is only as fresh as its
      // stalest input, and quoting the newest would overstate it.
      generatedAt: new Date().toISOString(),
      oldestSourceAt: oldestIso(sources),
      stale: Object.values(sources).some(s => s.stale),
      sources,
    },
    // Counts, so "did this actually load?" is answerable from the response.
    counts: {
      rosters: league?.allRosters.length ?? 0,
      players: league?.allRosters.reduce((s, r) => s + r.players.length, 0) ?? 0,
      unrankedPlayers: league?.allRosters
        .reduce((s, r) => s + r.players.filter(p => p.unranked).length, 0) ?? 0,
      picks: league?.allRosters.reduce((s, r) => s + r.picks.length, 0) ?? 0,
      pricedPlayers: Object.keys(values.data.playerMap).length,
      playerDBEntries: playerDB.data ? Object.keys(playerDB.data).length : 0,
    },
  }
}

function stamp(s) {
  return {
    fetchedAt: s.fetchedAt ? new Date(s.fetchedAt).toISOString() : null,
    ageSeconds: s.fetchedAt ? Math.round((Date.now() - s.fetchedAt) / 1000) : null,
    stale: !!s.stale,
    // Present only when a refresh failed and a cached copy is being served —
    // the reader is entitled to know why the number is old.
    error: s.error ?? null,
  }
}

function oldestIso(sources) {
  const times = Object.values(sources).map(s => s.fetchedAt).filter(Boolean)
  return times.length ? times.slice().sort()[0] : null
}

// Fold extra per-source stamps (weekly projections, the schedule) into an
// existing asOf block. `oldestSourceAt` and `stale` are RECOMPUTED over the
// union, never carried across — the whole point of the stamp is that an
// answer is only as fresh as its stalest input, and a tool that adds a source
// without re-deriving those two would quietly overstate its own freshness.
export function mergeAsOf(asOf, extraSources) {
  const sources = { ...asOf.sources, ...extraSources }
  return {
    ...asOf,
    oldestSourceAt: oldestIso(sources),
    stale: Object.values(sources).some(s => s.stale),
    sources,
  }
}

// Exported so mcp/weekly.js stamps its sources in exactly this shape — two
// stamp formats reaching one `asOf` block would be a bug the reader could not
// see.
export function stampSource(s) {
  return stamp(s)
}
