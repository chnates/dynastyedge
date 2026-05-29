import { useState, useEffect, useCallback } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'

function fetchJSON(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`Sleeper ${r.status}: ${url}`)
    return r.json()
  })
}

export function useSleeper() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rosters, users, tradedPicks, nflState] = await Promise.all([
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/traded_picks`),
        fetchJSON(`${SLEEPER_BASE}/state/nfl`),
      ])

      let matchups = null
      if (nflState?.season_type === 'regular' && nflState?.week) {
        matchups = await fetchJSON(
          `${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${nflState.week}`
        )
      }

      setData({ rosters, users, tradedPicks, nflState, matchups })
      setFetchedAt(Date.now())
      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, retry: fetchData, fetchedAt }
}
