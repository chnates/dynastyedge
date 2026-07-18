import { useState, useEffect, useCallback } from 'react'
import { FANTASYCALC_BASE, FANTASYCALC_PARAMS } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

let moduleCache = null
let fetchPromise = null
let moduleFetchedAt = null

function loadValues(force = false) {
  if (moduleCache && !force) return Promise.resolve(moduleCache)
  if (!fetchPromise) {
    const params = new URLSearchParams(
      Object.entries(FANTASYCALC_PARAMS).map(([k, v]) => [k, String(v)])
    )
    fetchPromise = fetchJSON(`${FANTASYCALC_BASE}/values/current?${params}`, {
      timeoutMs: 30000,
      label: 'FantasyCalc',
    })
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('FantasyCalc returned unexpected data — player values unavailable')
        }

        const playerMap = {}
        const pickEntries = []

        data.forEach(entry => {
          const sid = entry.player?.sleeperId
          if (sid) {
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
            pickEntries.push({
              name: entry.player.name,
              value: Math.round(entry.value ?? 0),
            })
          }
        })

        // Guard against a silent API shape change: an empty playerMap would
        // make every roster render blank with no visible error.
        if (Object.keys(playerMap).length === 0) {
          throw new Error('FantasyCalc returned no player values — try again later')
        }

        moduleFetchedAt = Date.now()
        moduleCache = { playerMap, pickEntries }
        fetchPromise = null
        return moduleCache
      })
      .catch(err => {
        fetchPromise = null
        throw err
      })
  }
  return fetchPromise
}

export function useFantasyCalc() {
  const [values, setValues] = useState(moduleCache)
  const [loading, setLoading] = useState(!moduleCache)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(moduleFetchedAt)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadValues(refreshKey > 0)
      .then(cache => {
        if (cancelled) return
        setValues(cache)
        setFetchedAt(moduleFetchedAt)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshKey])

  // Keeps existing values on screen during a refresh (stale-while-revalidate):
  // loading only flips on when there is nothing cached to show.
  // Stable identity (like useSleeper's fetchData) so useLeague's memoized
  // context value doesn't churn every render.
  const retry = useCallback(() => {
    setError(null)
    if (!moduleCache) setLoading(true)
    setRefreshKey(k => k + 1)
  }, [])

  return { values, loading, error, retry, fetchedAt }
}
