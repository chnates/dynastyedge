import { useEffect, useState } from 'react'
import { SLEEPER_BASE } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

// The one shared cache for /projections/nfl/regular/{season}/{week} and
// /state/nfl. Before this, only the Optimizer read weekly projections; League ›
// Free Agents now needs the same payload to show what a pickup projects for
// THIS week, and the response is ~1–2MB — fetching it twice a session because
// two views wanted it is exactly what the caching rules exist to prevent.
// Same pattern as hooks/matchupWeeks.js.
//
// Session-scoped: a week's projections cache until a retry clears them. Note
// the endpoint is REWRITTEN IN PLACE by Sleeper (verified 2026-09-04: 6 of
// 9,419 entries moved between two fetches ten hours apart), so a long session
// can hold slightly stale numbers — Refresh clears them.

const projPromises = new Map() // `${season}_${week}` -> Promise<projMap>
let statePromise = null

export function loadNflState() {
  if (!statePromise) {
    statePromise = fetchJSON(`${SLEEPER_BASE}/state/nfl`, { label: 'Sleeper' })
      .catch(err => { statePromise = null; throw err })
  }
  return statePromise
}

export function loadWeeklyProjections(season, week) {
  const key = `${season}_${week}`
  if (!projPromises.has(key)) {
    projPromises.set(
      key,
      fetchJSON(`${SLEEPER_BASE}/projections/nfl/regular/${season}/${week}`, { label: 'Sleeper' })
        .catch(err => { projPromises.delete(key); throw err }),
    )
  }
  return projPromises.get(key)
}

export function clearProjectionCache() {
  projPromises.clear()
  statePromise = null
}

// Best-effort read of this week's projections for a view that merely DECORATES
// with them (League › Free Agents). It never surfaces an error and never
// blocks: a failure leaves `projMap` null and the projection column hides,
// same contract as every other optional data source in the app.
export function useWeeklyProjections() {
  const [state, setState] = useState({
    projMap: null, week: null, season: null, isOffseason: false, loading: true,
  })

  useEffect(() => {
    let cancelled = false
    loadNflState()
      .then(async nflState => {
        if (nflState?.season_type !== 'regular') {
          return { projMap: null, week: null, season: null, isOffseason: true }
        }
        const { season, week } = nflState
        const projMap = await loadWeeklyProjections(season, week).catch(() => null)
        return { projMap, week, season, isOffseason: false }
      })
      .catch(() => ({ projMap: null, week: null, season: null, isOffseason: false }))
      .then(result => { if (!cancelled) setState({ ...result, loading: false }) })
    return () => { cancelled = true }
  }, [])

  return state
}
