import { useState, useEffect } from 'react'
import { VALUES_HISTORY_URL } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { MIN_SPARKLINE_POINTS, getValueSeries } from '../utils/valueHistory'

// Daily dynasty-value snapshots accumulated by the values-history GitHub
// Action. Fetched lazily (first consumer mount) and cached for the session.
// Strictly best-effort: history accumulates from the day the pipeline ships,
// so the file may be missing or have a single column — consumers must hide
// sparklines rather than show an error.
let historyCache = null
let historyPromise = null
let historyFailed = false
let historyFetchedAt = null

// When this session last successfully pulled the history feed (epoch ms) —
// powers the drawer's per-source "last refreshed" line. Distinct from the
// feed's own `updatedAt` (the daily snapshot's publish time): this moves on
// every successful (re)fetch.
export function getHistoryFetchedAt() {
  return historyFetchedAt
}

// Exported for the side drawer's feed-age readout: resolves the cached
// history object (whose `updatedAt` stamps the last snapshot), or null when
// the feed never loaded. Same single session-cached request as the hook.
// `force` re-fetches on demand (the drawer's Refresh button) so a new daily
// snapshot is picked up mid-session and the feed-age readout can move.
export function loadHistory(force = false) {
  if (force) { historyPromise = null; historyFailed = false }
  if (historyCache && !force) return Promise.resolve(historyCache)
  if (historyFailed && !force) return Promise.resolve(null)
  if (!historyPromise) {
    historyPromise = fetchJSON(VALUES_HISTORY_URL, { label: 'Values history' })
      .then(data => {
        if (!Array.isArray(data?.dates) || !data?.players) throw new Error('bad shape')
        historyCache = data
        historyFetchedAt = Date.now()
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

// Moved to src/utils/valueHistory.js so the analysis layer stays React-free.
// Re-exported here: this is where the app has always imported it from.
export { MIN_SPARKLINE_POINTS }

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
  // until MIN_SPARKLINE_POINTS snapshots exist. The rule lives in
  // utils/valueHistory.js so the MCP server's value-history tool reads it too.
  function getSeries(sleeperId) {
    return getValueSeries(history, sleeperId)
  }

  return { history, getSeries }
}
