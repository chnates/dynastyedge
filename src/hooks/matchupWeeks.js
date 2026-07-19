import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

// The one shared cache for /league/{id}/matchups/{week}. Playoff odds needs
// weeks 1..playoff_week_start−1 with FULL per-team entries; lineup history
// needs "my" entries for weeks 1..17 (offseason) or 1..current−1 (in-season).
// Before this module each hook fetched its own copy — ~17 redundant requests
// when both features were visited. Matchups for this league ID are one fixed
// season (each Sleeper season is a new league ID), so weeks cache for the
// whole session; a played week's scores only refresh via retry or reload,
// same as before.
//
// Degradation contract: each week fetch is individually caught (one bad
// bucket can't sink the set — it contributes empty entries, exactly the old
// per-week `.catch(() => [])`), EXCEPT when every requested week failed.
// A total outage rejects, so League › Playoffs and Season Review show
// ErrorState instead of masquerading as "preseason" / "no data". Failed
// weeks from a total outage are not kept, so retry refetches them.

const weekResults = new Map() // week -> { entries, failed }
const weekPromises = new Map() // week -> in-flight fetch
const rangeResults = new Map() // lastWeek -> resolved [{ week, entries }]
const rangePromises = new Map() // lastWeek -> in-flight range load

function fetchWeek(week) {
  const done = weekResults.get(week)
  if (done) return Promise.resolve(done)
  if (!weekPromises.has(week)) {
    const p = fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${week}`, {
      label: 'Sleeper matchups',
    })
      .then(entries => ({ entries: Array.isArray(entries) ? entries : [], failed: false }))
      .catch(() => ({ entries: [], failed: true }))
      .then(result => {
        weekResults.set(week, result)
        weekPromises.delete(week)
        return result
      })
    weekPromises.set(week, p)
  }
  return weekPromises.get(week)
}

// Load weeks 1..lastWeek. Resolves to a per-range STABLE array reference
// ([{ week, entries }]) — usePlayoffOdds' derived-results cache keys on that
// identity, so the same data must always arrive as the same array.
export function loadMatchupWeeks(lastWeek) {
  if (!(lastWeek >= 1)) return Promise.resolve([])
  const cached = rangeResults.get(lastWeek)
  if (cached) return Promise.resolve(cached)
  if (!rangePromises.has(lastWeek)) {
    const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
    const p = Promise.all(weeks.map(fetchWeek))
      .then(results => {
        rangePromises.delete(lastWeek)
        if (results.every(r => r.failed)) {
          weeks.forEach(w => weekResults.delete(w))
          throw new Error('Could not load matchup data — check your connection and retry')
        }
        const arr = weeks.map((w, i) => ({ week: w, entries: results[i].entries }))
        rangeResults.set(lastWeek, arr)
        return arr
      })
      .catch(err => {
        rangePromises.delete(lastWeek)
        throw err
      })
    rangePromises.set(lastWeek, p)
  }
  return rangePromises.get(lastWeek)
}

// Synchronous cache read for useState initializers.
export function peekMatchupWeeks(lastWeek) {
  return rangeResults.get(lastWeek) ?? null
}

// Full invalidation — the retry path, so a manual retry refetches real data.
export function resetMatchupWeeks() {
  weekResults.clear()
  weekPromises.clear()
  rangeResults.clear()
  rangePromises.clear()
}
