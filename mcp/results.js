// results.js — every season's playoff bracket, for "who won our league in
// 2023?"
//
// `/league/{id}/winners_bracket` had never been called by this repo. The
// champion lives nowhere else: past rosters carry records and points-for, and
// a league's `metadata.latest_league_winner_roster_id` is a single convenience
// field, not the result. So this reads the bracket per season and keeps the
// metadata only as a cross-check (see src/utils/leagueResults.js).
//
// ── WHY THIS IS ITS OWN SMALL WALK, NOT A FIELD ON scout_managers ─────────
//
// The question is about the LEAGUE, not about how one manager trades, and the
// cost is different by a factor of three. Built on the NARROW history walk
// (chain + rosters, 14 requests and usually already cached), it adds two
// requests per past season — the bracket and that season's users, for the
// team name the title was won under — plus the current season's bracket.
// Answering it through scout_managers would spend the ledger's 68 requests to
// read seven.
//
// ── CACHING ───────────────────────────────────────────────────────────────
//
// A past season's bracket is FROZEN: the chain only holds seasons that renewed,
// i.e. finished. Each is cached under its own key on the history TTL. The
// CURRENT season's bracket fills in over the playoff weeks, so it rides the
// snapshot's TTL — a title game decided at 11pm should not wait six hours.
//
// ── DEGRADATION ───────────────────────────────────────────────────────────
//
// A season whose bracket cannot be read is NAMED (`failedSeasons`) and never
// cached; the tool then says "we could not read the 2023 bracket", never "2023
// had no champion". The chain itself failing is `available: false`.

import { SLEEPER_BASE } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'
import { getLeagueHistory, DEFAULT_HISTORY_TTL_MS } from './history.js'

export const DEFAULT_CURRENT_BRACKET_TTL_MS = 15 * 60 * 1000

const pastKey = seasonLeagueId => `results:${seasonLeagueId}`
const currentKey = leagueId => `bracket:${leagueId}`

const defaultStore = memoryStore()

export function resetResultsCache() {
  return defaultStore.clear()
}

export async function getLeagueResults({
  leagueId, leagueInfo, ttlMs = DEFAULT_HISTORY_TTL_MS, currentTtlMs = DEFAULT_CURRENT_BRACKET_TTL_MS,
  force = false, fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  if (!leagueId) throw new Error('getLeagueResults requires a leagueId')
  const get = fetcher ?? createFetcher({ concurrency })

  const [base, current] = await Promise.all([
    getLeagueHistory({ leagueId, leagueInfo, ttlMs, force, fetcher: get, concurrency, store }),
    loadSource(store, currentKey(leagueId), force ? -1 : currentTtlMs, async () => {
      const b = await get(`${SLEEPER_BASE}/league/${leagueId}/winners_bracket`, { label: 'Sleeper winners bracket' })
      if (!Array.isArray(b)) throw new Error('winners bracket returned an unexpected shape')
      return b
    }).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message })),
  ])

  if (!base.available) {
    return {
      available: false,
      current: { bracket: current.data ?? null, error: current.error ?? null },
      seasons: [],
      failedSeasons: [],
      sources: { history: base.sources.history, brackets: stampSource(current) },
      notes: [
        'This league\'s past seasons could not be loaded, so past champions are unknown. That is a gap in our ' +
        'data — it is not a claim that any season went without a winner.',
      ],
    }
  }

  const past = base.history.pastSeasons ?? []
  const loaded = await Promise.all(past.map(ps =>
    loadSource(store, pastKey(ps.leagueId), force ? -1 : ttlMs, async () => {
      const [bracket, users] = await Promise.all([
        get(`${SLEEPER_BASE}/league/${ps.leagueId}/winners_bracket`, { label: 'Sleeper winners bracket' }),
        // Names only. Without them a champion is still named — by the owner's
        // CURRENT team name, or "Roster N" — so a users failure never costs
        // the result.
        get(`${SLEEPER_BASE}/league/${ps.leagueId}/users`, { label: 'Sleeper users' }).catch(() => null),
      ])
      if (!Array.isArray(bracket)) throw new Error(`the ${ps.season} winners bracket returned an unexpected shape`)
      return { bracket, users: Array.isArray(users) ? users : [] }
    }).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))))

  const failedSeasons = []
  const seasons = past.map((ps, i) => {
    const l = loaded[i]
    if (!l.data) failedSeasons.push(ps.season)
    return {
      season: ps.season,
      leagueId: ps.leagueId,
      leagueInfo: ps.leagueInfo,
      rosters: ps.rosters ?? [],
      users: l.data?.users ?? [],
      bracket: l.data?.bracket ?? null,
      error: l.data ? null : (l.error ?? 'unknown error'),
    }
  })

  const times = [current.fetchedAt, ...loaded.map(l => l.fetchedAt)].filter(Boolean)
  return {
    available: true,
    current: { bracket: current.data ?? null, error: current.data ? null : (current.error ?? null) },
    seasons,   // past seasons, newest → oldest
    failedSeasons,
    sources: {
      history: base.sources.history,
      // The OLDEST contributing bracket, for the reason oldestSourceAt is the
      // stalest source. Past brackets are frozen, so this is harmless.
      brackets: stampSource({
        fetchedAt: times.length ? Math.min(...times) : null,
        stale: current.stale || loaded.some(l => l.stale),
        error: failedSeasons.length ? `${failedSeasons.length} of ${past.length} past brackets failed` : (current.error ?? null),
      }),
    },
    notes: [],
  }
}
