import { useState, useEffect, useCallback } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

export function useSleeper() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [leagueInfo, rosters, users, tradedPicks, nflState] = await Promise.all([
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/traded_picks`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/state/nfl`, { label: 'Sleeper' }),
      ])

      let matchups = null
      if (nflState?.season_type === 'regular' && nflState?.week) {
        matchups = await fetchJSON(
          `${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${nflState.week}`,
          { label: 'Sleeper' }
        )
      }

      setData({ leagueInfo, rosters, users, tradedPicks, nflState, matchups })
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
