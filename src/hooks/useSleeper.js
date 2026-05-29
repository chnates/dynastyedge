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

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`),
      fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`),
      fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/traded_picks`),
    ])
      .then(([rosters, users, tradedPicks]) => {
        setData({ rosters, users, tradedPicks })
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, retry: fetchData }
}
