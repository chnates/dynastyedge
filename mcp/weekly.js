// weekly.js — the in-season data layer: this week's projections and the
// season schedule. Separate from snapshot.js on purpose; see the TTL note.
//
// ── WHY THIS HAS ITS OWN TTL (60 min, not the snapshot's 15) ───────────────
//
// The brief for phase 1b said to decide this deliberately rather than inherit
// the league snapshot's 15 minutes, and the two are genuinely different
// freshness domains:
//
//   League data changes on an EVENT. A trade or a waiver claim lands at an
//   arbitrary moment and changes a roster completely. 15 minutes bounds how
//   long the server can be wrong about who owns whom.
//
//   Projections change on a DRIP. weeklyProjections.js:13-15 records the
//   measurement: Sleeper rewrites `/projections/.../{week}` in place, and
//   6 of 9,419 entries moved between two fetches ten hours apart — 0.06%.
//   Refetching a 1-2MB payload every 15 minutes to catch a 0.06%/10h drift
//   spends four times the bytes for a change that measurably almost never
//   happens.
//
// So projections are cached LONGER than the league, not shorter. Two things
// keep that honest:
//
//   - The stamp. The projection source carries its own fetchedAt/ageSeconds
//     into the response's `asOf.sources`, and mergeAsOf recomputes
//     `oldestSourceAt` over the union — so a 50-minute-old projection drags
//     the whole answer's stated age down with it rather than hiding behind a
//     fresh roster fetch.
//   - `refresh: true` on any weekly tool forces a refetch. Near kickoff, when
//     a late inactive can move a number faster than the drip rate, that is
//     the escape hatch, and the tool docs say so.
//
// Overridable with DYNASTYEDGE_WEEKLY_TTL_MS.
//
// ── THE SCHEDULE IS THE ONE SLEEPER ENDPOINT NOT UNDER /v1 ─────────────────
//
// It is served from SLEEPER_ROOT, and its fields are `home`/`away`, NOT
// `home_team`/`away_team`. BOTH mistakes fail SILENTLY — the wrong base 404s
// and the wrong field names simply yield "no games", which reads as "every
// team is on bye" and kills bye detection outright. That is why this file
// imports SLEEPER_ROOT explicitly and why parseByeTeams below is a verbatim
// copy of the app's, right down to the field names.

import { SLEEPER_BASE, SLEEPER_ROOT } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'

export const DEFAULT_WEEKLY_TTL_MS = 60 * 60 * 1000

const projCaches = new Map()     // `${season}_${week}` -> { data, fetchedAt }
const scheduleCaches = new Map() // season -> { data, fetchedAt }

export function resetWeeklyCache() {
  projCaches.clear()
  scheduleCaches.clear()
}

// Teams with a game this week — everyone else is on bye. Mirrors
// useLineupData's parseByeTeams exactly, including the `home`/`away` fields.
//
// An EMPTY set is meaningful and must be preserved: getAvailability only
// treats a player as on bye when `playingTeams.size > 0`, so a failed schedule
// fetch degrades to "we cannot know who is on bye" rather than inventing a
// league-wide bye week.
export function parseByeTeams(schedule, week) {
  const games = Array.isArray(schedule) ? schedule.filter(g => g.week === week) : []
  const playing = new Set()
  games.forEach(g => {
    if (g.home) playing.add(g.home)
    if (g.away) playing.add(g.away)
  })
  return playing
}

const fresh = (entry, ttl) => entry && Date.now() - entry.fetchedAt < ttl

async function loadSource(current, ttl, load) {
  if (fresh(current, ttl)) return { ...current, stale: false, error: null }
  try {
    return { data: await load(), fetchedAt: Date.now(), stale: false, error: null }
  } catch (err) {
    // Same contract as snapshot.js: an old answer beats no answer, provided it
    // says it is old.
    if (current) return { ...current, stale: true, error: err.message }
    throw err
  }
}

// Load one week of projections plus the season schedule.
//
// Returns { available, isOffseason, season, week, projMap, playingTeams,
//           scheduleGames, sources, notes }.
//
// IN-SEASON ONLY, and it says so rather than returning zeros: in the offseason
// `/projections/nfl/regular/{year}/{week}` has nothing to give, and a weekly
// tool must report that condition, exactly as LineupOptimizer hides itself
// (CLAUDE.md, "Weekly tools are in-season only").
export async function getWeekly({
  nflState, week, ttlMs = DEFAULT_WEEKLY_TTL_MS, force = false, fetcher, concurrency = 6,
} = {}) {
  const notes = []
  if (!nflState || nflState.season_type !== 'regular') {
    return {
      available: false, isOffseason: true,
      season: nflState?.season ?? null, week: null,
      projMap: null, playingTeams: new Set(), scheduleGames: [],
      sources: {}, requestedWeek: week ?? null,
      notes: ['It is the offseason, so Sleeper publishes no weekly projections. ' +
              'Weekly advice is unavailable until the regular season starts — there are no numbers to report, not zeros.'],
    }
  }

  const season = nflState.season
  const targetWeek = Number.isFinite(Number(week)) && Number(week) > 0
    ? Number(week)
    : Number(nflState.week)

  if (!Number.isFinite(targetWeek) || targetWeek < 1) {
    return {
      available: false, isOffseason: false, season, week: null,
      projMap: null, playingTeams: new Set(), scheduleGames: [],
      sources: {}, requestedWeek: week ?? null,
      notes: [`Sleeper reports no current week for ${season}, so there is nothing to project.`],
    }
  }
  if (week != null && Number(week) !== Number(nflState.week)) {
    notes.push(
      `Projections requested for week ${targetWeek}; Sleeper's current week is ${nflState.week}. ` +
      'A past week\'s projections are what was forecast then, not what happened.'
    )
  }

  const get = fetcher ?? createFetcher({ concurrency })
  const ttl = force ? -1 : ttlMs
  const projKey = `${season}_${targetWeek}`

  const [proj, schedule] = await Promise.all([
    loadSource(projCaches.get(projKey), ttl, () =>
      get(`${SLEEPER_BASE}/projections/nfl/regular/${season}/${targetWeek}`, {
        timeoutMs: 30000, label: 'Sleeper projections',
      })
    ).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message })),
    // Best-effort, exactly as useLineupData treats it: without the schedule we
    // lose bye detection, which degrades the advice but must never fail it.
    // NOTE THE BASE — SLEEPER_ROOT, not SLEEPER_BASE. /v1 404s here.
    loadSource(scheduleCaches.get(season), ttl, () =>
      get(`${SLEEPER_ROOT}/schedule/nfl/regular/${season}`, { label: 'Sleeper schedule' })
    ).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message })),
  ])

  if (proj.data) projCaches.set(projKey, { data: proj.data, fetchedAt: proj.fetchedAt })
  if (schedule.data) scheduleCaches.set(season, { data: schedule.data, fetchedAt: schedule.fetchedAt })

  if (!proj.data) {
    notes.push(`Sleeper's week ${targetWeek} projections did not load (${proj.error}), so no projection is shown.`)
  }
  const scheduleGames = Array.isArray(schedule.data) ? schedule.data : []
  const playingTeams = parseByeTeams(scheduleGames, targetWeek)
  if (!playingTeams.size) {
    notes.push(
      'The NFL schedule did not load, so bye weeks cannot be detected. ' +
      'A player on bye will not be flagged — nobody is assumed to be on bye rather than everybody.'
    )
  }

  return {
    available: !!proj.data,
    isOffseason: false,
    season,
    week: targetWeek,
    requestedWeek: week ?? null,
    projMap: proj.data,
    playingTeams,
    scheduleGames,
    sources: {
      projections: stampSource(proj),
      schedule: stampSource(schedule),
    },
    notes,
  }
}
