import { useState, useEffect, useCallback } from 'react'
import { fetchJSON } from '../utils/fetchJSON'
import { fantasyCalcValuesUrl, splitFantasyCalcPayload } from '../utils/fantasyCalcPayload'

let moduleCache = null
let fetchPromise = null
let moduleFetchedAt = null

function loadValues(force = false) {
  if (moduleCache && !force) return Promise.resolve(moduleCache)
  if (!fetchPromise) {
    // URL, classifier and shape guards are THE shared reader
    // (utils/fantasyCalcPayload.js) — the MCP server and the pipelines run
    // the same code (CODE-REVIEW-1 #6).
    fetchPromise = fetchJSON(fantasyCalcValuesUrl(), {
      timeoutMs: 30000,
      label: 'FantasyCalc',
    })
      .then(data => {
        const { playerMap, pickEntries } = splitFantasyCalcPayload(data)

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

  useEffect(() => {
    let cancelled = false
    loadValues(false)
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
  }, [])

  // Keeps existing values on screen during a refresh (stale-while-revalidate):
  // loading only flips on when there is nothing cached to show. Resolves true
  // on success / false on failure (never rejects) so the manual-refresh
  // coordinator can show a per-source ✓/✗ tick. Stable identity (like
  // useSleeper's fetchData) so useLeague's memoized context value doesn't
  // churn every render.
  const retry = useCallback(() => {
    setError(null)
    if (!moduleCache) setLoading(true)
    return loadValues(true)
      .then(cache => {
        setValues(cache)
        setFetchedAt(moduleFetchedAt)
        setError(null)
        setLoading(false)
        return true
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
        return false
      })
  }, [])

  return { values, loading, error, retry, fetchedAt }
}
