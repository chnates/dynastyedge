import { useState, useEffect } from 'react'
import { VALUES_HISTORY_URL } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

// Daily dynasty-value snapshots accumulated by the values-history GitHub
// Action. Fetched lazily (first consumer mount) and cached for the session.
// Strictly best-effort: history accumulates from the day the pipeline ships,
// so the file may be missing or have a single column — consumers must hide
// sparklines rather than show an error.
let historyCache = null
let historyPromise = null
let historyFailed = false

// Exported for the side drawer's feed-age readout: resolves the cached
// history object (whose `updatedAt` stamps the last snapshot), or null when
// the feed never loaded. Same single session-cached request as the hook.
export function loadHistory() {
  if (historyCache) return Promise.resolve(historyCache)
  if (historyFailed) return Promise.resolve(null)
  if (!historyPromise) {
    historyPromise = fetchJSON(VALUES_HISTORY_URL, { label: 'Values history' })
      .then(data => {
        if (!Array.isArray(data?.dates) || !data?.players) throw new Error('bad shape')
        historyCache = data
        historyPromise = null
        return data
      })
      .catch(() => {
        // No history yet (pipeline not run, branch missing) — hide silently
        historyFailed = true
        historyPromise = null
        return null
      })
  }
  return historyPromise
}

// Minimum snapshots before a sparkline is worth drawing. With fewer, the
// "graph" is just a straight segment (the pipeline adds one point per day
// from the day it shipped) — hide it until it has real shape.
export const MIN_SPARKLINE_POINTS = 4

export function useValueHistory() {
  const [history, setHistory] = useState(historyCache)

  useEffect(() => {
    let cancelled = false
    loadHistory().then(h => {
      if (!cancelled && h) setHistory(h)
    })
    return () => { cancelled = true }
  }, [])

  // Series for one player, nulls (missing days) removed. Callers get null
  // until MIN_SPARKLINE_POINTS snapshots exist.
  function getSeries(sleeperId) {
    const raw = history?.players?.[String(sleeperId)]
    if (!raw) return null
    const points = raw.filter(v => v != null)
    return points.length >= MIN_SPARKLINE_POINTS ? points : null
  }

  return { history, getSeries }
}
