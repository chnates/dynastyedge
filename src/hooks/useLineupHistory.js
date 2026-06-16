import { useState, useEffect } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { useIdentity } from './useIdentity'

// My matchup entries for every completed week of the season — the raw
// material for the lineup efficiency review. Fetched once per session.
// Cached per (roster, lastWeek) since "my" entries depend on who's signed in.
let histCache = null // { key, byWeek }
let histPromise = null

function loadHistory(rosterId, lastWeek) {
  const key = `${rosterId}:${lastWeek}`
  if (histCache?.key === key) return Promise.resolve(histCache.byWeek)
  if (!histPromise) {
    const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
    histPromise = Promise.all(
      weeks.map(w =>
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${w}`, {
          label: 'Sleeper matchups',
        }).catch(() => [])
      )
    )
      .then(perWeek => {
        const byWeek = []
        perWeek.forEach((entries, i) => {
          const mine = (Array.isArray(entries) ? entries : []).find(
            m => m.roster_id === rosterId
          )
          if (!mine?.players?.length) return
          if ((mine.points ?? 0) === 0) return // week not played
          byWeek.push({
            week: i + 1,
            points: mine.points ?? 0,
            players: mine.players,
            playersPoints: mine.players_points ?? {},
          })
        })
        histCache = { key, byWeek }
        histPromise = null
        return byWeek
      })
      .catch(err => {
        histPromise = null
        throw err
      })
  }
  return histPromise
}

export function useLineupHistory(nflState) {
  const { rosterId: myRosterId } = useIdentity()

  // In-season: every week before the current one. Otherwise the league's
  // season is over (or hasn't started) — check all 17 weeks; unplayed weeks
  // simply come back empty.
  const lastWeek = nflState
    ? (nflState.season_type === 'regular' ? Math.max(0, (nflState.week ?? 1) - 1) : 17)
    : 0

  const cacheKey = `${myRosterId}:${lastWeek}`

  const [byWeek, setByWeek] = useState(histCache?.key === cacheKey ? histCache.byWeek : null)
  const [loading, setLoading] = useState(byWeek === null && lastWeek > 0)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (lastWeek === 0 || myRosterId == null) {
      setByWeek([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(histCache?.key !== cacheKey)
    loadHistory(myRosterId, lastWeek)
      .then(weeks => {
        if (cancelled) return
        setByWeek(weeks)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [cacheKey, lastWeek, myRosterId, retryCount])

  function retry() {
    setError(null)
    setRetryCount(c => c + 1)
  }

  return { byWeek, loading, error, retry }
}
