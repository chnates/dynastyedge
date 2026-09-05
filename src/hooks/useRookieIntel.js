import { useState, useEffect } from 'react'
import { ROOKIE_INTEL_URL } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

// Rookie research feed published daily by .github/workflows/rookie-intel.yml:
// NFL draft capital plus weekly depth-chart standing for the current rookie
// class, already joined to Sleeper player IDs server-side (the nflverse CSVs
// it derives from are CORS-blocked and ~39MB, so the app can never fetch them
// directly — see the architecture contract, link 5).
//
// Class B / best-effort, same contract as useValueHistory: fetched lazily on
// first consumer mount, cached for the session, and a single failure latches
// off for the rest of the session rather than retry-looping. Draft › Research
// renders its own "feed hasn't published yet" state — it never shows an
// ErrorState, because a missing feed is an expected condition (the branch does
// not exist until the first workflow run).
let intelCache = null
let intelPromise = null
let intelFailed = false
let intelFetchedAt = null

// When this session last successfully pulled the feed (epoch ms) — powers the
// drawer's per-source "last refreshed" line. Distinct from the feed's own
// `updatedAt`, which only moves when the daily workflow publishes.
export function getRookieIntelFetchedAt() {
  return intelFetchedAt
}

// Exported for the drawer's feed-age readout and its Refresh button, which
// passes `force` so a fresh publish is picked up mid-session.
export function loadRookieIntel(force = false) {
  if (force) { intelPromise = null; intelFailed = false }
  if (intelCache && !force) return Promise.resolve(intelCache)
  if (intelFailed && !force) return Promise.resolve(null)
  if (!intelPromise) {
    intelPromise = fetchJSON(ROOKIE_INTEL_URL, { label: 'Rookie intel' })
      .then(data => {
        if (!data?.players || typeof data.players !== 'object') throw new Error('bad shape')
        intelCache = data
        intelFetchedAt = Date.now()
        intelPromise = null
        return data
      })
      .catch(() => {
        intelFailed = true
        intelPromise = null
        return null
      })
  }
  return intelPromise
}

// `enabled` keeps the fetch lazy at a second level: the feed is only worth
// pulling for a consumer that will actually render a rookie. The profile
// drawer opens on veterans far more often than rookies, so it passes false
// until it knows the player is one (see useRookieResearchFor).
export function useRookieIntel(enabled = true) {
  const [intel, setIntel] = useState(intelCache)
  // Distinguishes "still fetching" from "fetched, nothing there" so the view
  // can show a spinner once and then a real empty state, never both.
  const [loading, setLoading] = useState(enabled && !intelCache && !intelFailed)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // A consumer that enables late (a rookie's drawer opening) starts its own
    // spinner here rather than inheriting the disabled hook's initial false.
    if (!intelCache && !intelFailed) setLoading(true)
    loadRookieIntel().then(data => {
      if (cancelled) return
      if (data) setIntel(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [enabled])

  return { intel, loading }
}
