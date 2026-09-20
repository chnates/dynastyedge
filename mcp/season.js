// season.js — the rest-of-season data layer: every regular-season week's
// matchups. It is the one fetch the playoff-odds model needs, and a single
// pass over it yields BOTH halves of that model's input: the remaining
// schedule (who still plays whom) and every completed week's actual per-team
// score. The app's `src/hooks/matchupWeeks.js` is the same idea for the phone.
//
// ── WHY THIS IS A THIRD TTL, NOT THE WEEKLY LAYER'S ───────────────────────
//
// snapshot.js caches 15 minutes and weekly.js caches 60, each for a reason
// stated where it lives. This is a THIRD freshness domain and inheriting
// either number would be inheriting the wrong argument:
//
//   A completed week is FROZEN FOREVER. Week 3's scores will never change
//   again. Most of what this fetch returns is immutable history.
//
//   The current week's scores move live through Sunday — and the model
//   THROWS THEM AWAY. `splitCompletedWeeks` counts a week as complete only
//   when every team in it has scored, so a partially-played week is
//   simulated fresh rather than counted. The consequence is the one that
//   sets this TTL: **the odds output only changes when a whole week lands**,
//   which happens once a week. Refetching 14 payloads to catch that sooner
//   buys nothing a reader would notice.
//
// So 60 minutes is comfortably tighter than the thing it tracks, and it is
// its own constant rather than weekly.js's because the two would need
// re-deriving separately if either ever moved. What DOES change on an event —
// a roster, and therefore the strength prior feeding the model — comes from
// the 15-minute snapshot, not from here.
//
// Overridable with DYNASTYEDGE_SEASON_TTL_MS.
//
// ── THE DEGRADATION CONTRACT, AND THE ONE STATE THAT MUST NOT HAPPEN ──────
//
// A week with no entries is indistinguishable from a week not yet played.
// That is fine for a single bad bucket — it contributes nothing, exactly as
// the app's per-week `.catch(() => [])` does — and catastrophic for ALL of
// them: fourteen empty weeks is precisely the shape of a preseason, so a
// total Sleeper outage would render as a confident "the season hasn't
// started" with a strength preview attached. The app rejects in that case so
// League › Playoffs shows an ErrorState; here the tool reports
// `available: false` with `reason: 'unavailable'`, which a reader can tell
// apart from `preseason`. Same distinction lineup_advice draws between
// 'offseason' and 'projections-unavailable': "there is nothing to know" and
// "we could not find out" are different answers.

import { SLEEPER_BASE } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'

export const DEFAULT_SEASON_TTL_MS = 60 * 60 * 1000

// Sleeper's own default when a league does not state one. Read from league
// settings whenever they loaded — never assumed (CLAUDE.md, League Context).
export const DEFAULT_PLAYOFF_WEEK_START = 15
export const DEFAULT_PLAYOFF_TEAMS = 6

// Distinct key prefix, so this layer can share ONE store with snapshot.js and
// weekly.js — which is what the HTTP deployment does, on a single connection.
const matchupsKeyFor = (leagueId, week) => `matchups:${leagueId}_${week}`

const defaultStore = memoryStore()

export function resetSeasonCache() {
  return defaultStore.clear()
}

// How many regular-season weeks this league has, from its own settings.
export function regularSeasonWeeks(leagueInfo) {
  const start = Number(leagueInfo?.settings?.playoff_week_start) || DEFAULT_PLAYOFF_WEEK_START
  return Math.max(1, start - 1)
}

export function playoffFieldSize(leagueInfo) {
  return Number(leagueInfo?.settings?.playoff_teams) || DEFAULT_PLAYOFF_TEAMS
}

// Fetch weeks 1..lastWeek of /league/{id}/matchups/{week}.
//
// Returns { available, reason, perWeek, lastWeek, playoffTeams, firstPlayoffWeek,
//            failedWeeks, sources, notes }.
// `perWeek` is [{ week, entries }] — exactly the shape buildPlayoffOutlook
// takes, and exactly what the app's loadMatchupWeeks resolves to, so the two
// feed one model with no adapter between them.
export async function getSeasonWeeks({
  leagueId, leagueInfo, ttlMs = DEFAULT_SEASON_TTL_MS, force = false,
  fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  if (!leagueId) throw new Error('getSeasonWeeks requires a leagueId')

  const lastWeek = regularSeasonWeeks(leagueInfo)
  const playoffTeams = playoffFieldSize(leagueInfo)
  const firstPlayoffWeek = lastWeek + 1
  const get = fetcher ?? createFetcher({ concurrency })
  const ttl = force ? -1 : ttlMs
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)

  // The concurrency gate in limit.js bounds these — fourteen requests go out
  // six at a time against Sleeper's published budget, not all at once.
  const loaded = await Promise.all(weeks.map(w =>
    loadSource(store, matchupsKeyFor(leagueId, w), ttl, () =>
      get(`${SLEEPER_BASE}/league/${leagueId}/matchups/${w}`, { label: `Sleeper matchups w${w}` })
    ).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))
  ))

  const failedWeeks = weeks.filter((_, i) => !loaded[i].data)
  const notes = []

  // Every week failed — see the header. This is NOT a preseason.
  if (failedWeeks.length === lastWeek) {
    return {
      available: false,
      reason: 'unavailable',
      perWeek: null,
      lastWeek,
      playoffTeams,
      firstPlayoffWeek,
      failedWeeks,
      sources: { matchups: stampSource(loaded[0] ?? {}) },
      notes: [
        `None of this league's ${lastWeek} regular-season matchup weeks could be loaded ` +
        `(${loaded[0]?.error ?? 'unknown error'}), so the rest-of-season simulation cannot run. ` +
        'This is a data failure, NOT a preseason — fourteen empty weeks look identical to a season ' +
        'that has not started, and reporting it as one would invent a confident answer out of an outage.',
      ],
    }
  }

  if (failedWeeks.length) {
    notes.push(
      `Week(s) ${failedWeeks.join(', ')} did not load, so those games are absent from the simulation. ` +
      'A missing week reads as "not yet played", which understates completed results and leaves its ' +
      'games out of the remaining schedule — the odds below are weaker than usual.'
    )
  }

  // The stamp is the OLDEST contributing week, for the same reason
  // `asOf.oldestSourceAt` is the stalest source: an answer built from
  // fourteen fetches is only as fresh as the oldest of them.
  const fetchedTimes = loaded.map(l => l.fetchedAt).filter(Boolean)
  const oldest = fetchedTimes.length ? Math.min(...fetchedTimes) : null

  return {
    available: true,
    reason: null,
    perWeek: weeks.map((w, i) => ({
      week: w,
      entries: Array.isArray(loaded[i].data) ? loaded[i].data : [],
    })),
    lastWeek,
    playoffTeams,
    firstPlayoffWeek,
    failedWeeks,
    sources: {
      matchups: stampSource({
        fetchedAt: oldest,
        stale: loaded.some(l => l.stale),
        error: failedWeeks.length ? `${failedWeeks.length} of ${lastWeek} weeks failed` : null,
      }),
    },
    notes,
  }
}
