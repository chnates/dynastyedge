import { useState, useEffect, useCallback, useRef } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

export function useSleeper() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  const hasData = useRef(false)

  // Resolves true on success / false on failure (never rejects), so the
  // manual-refresh coordinator can show a per-source ✓/✗ tick.
  const fetchData = useCallback(async () => {
    // Stale-while-revalidate: only show the full-screen loading state on the
    // first load. A manual or auto refresh keeps the cached data on screen
    // (matches useFantasyCalc) so pressing Refresh never blanks a view.
    if (!hasData.current) setLoading(true)
    setError(null)
    try {
      const [leagueInfo, rosters, users, tradedPicks, nflState, drafts] = await Promise.all([
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/traded_picks`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_BASE}/state/nfl`, { label: 'Sleeper' }),
        // Best-effort: the drafts list only enriches picks with their exact
        // draft slot (1.09) and slot-level value. If it fails, picks still
        // resolve and price at the round median — never fail the app for it.
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/drafts`, { label: 'Sleeper' }).catch(() => []),
      ])

      let matchups = null
      if (nflState?.season_type === 'regular' && nflState?.week) {
        matchups = await fetchJSON(
          `${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${nflState.week}`,
          { label: 'Sleeper' }
        )
      }

      setData({ leagueInfo, rosters, users, tradedPicks, nflState, matchups, drafts })
      hasData.current = true
      setFetchedAt(Date.now())
      setLoading(false)
      return true
    } catch (err) {
      setError(err.message)
      setLoading(false)
      return false
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, retry: fetchData, fetchedAt }
}
