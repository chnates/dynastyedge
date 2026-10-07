import { useState, useEffect } from 'react'
import { SLEEPER_BASE } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { trimPlayerDB } from '../utils/playerDB'

// Single shared cache of Sleeper's full player DB (/players/nfl, ~5-8MB).
// Fetched at most once per session; the raw response is trimmed to the
// fields the app needs and discarded. Every consumer (rookie detection,
// lineup injury statuses, unranked-player name resolution, transaction
// feed, lineup history) reads from this one cache.
let moduleCache = null
let fetchPromise = null

export function getCachedPlayerDB() {
  return moduleCache
}

export function loadPlayerDB() {
  if (moduleCache) return Promise.resolve(moduleCache)
  if (!fetchPromise) {
    fetchPromise = fetchJSON(`${SLEEPER_BASE}/players/nfl`, {
      timeoutMs: 45000,
      label: 'Sleeper player DB',
    })
      .then(data => {
        // The kept fields are THE shared trim (utils/playerDB.js).
        const meta = trimPlayerDB(data)
        moduleCache = meta
        fetchPromise = null
        return meta
      })
      .catch(err => {
        fetchPromise = null
        throw err
      })
  }
  return fetchPromise
}

export function usePlayerDB() {
  const [playerDB, setPlayerDB] = useState(moduleCache)
  const [loading, setLoading] = useState(!moduleCache)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!moduleCache) setLoading(true)
    loadPlayerDB()
      .then(db => {
        if (cancelled) return
        setPlayerDB(db)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [retryCount])

  function retry() {
    setError(null)
    setRetryCount(c => c + 1)
  }

  return { playerDB, loading, error, retry }
}
