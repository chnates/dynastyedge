import { useState, useEffect } from 'react'
import { SLEEPER_BASE } from '../constants'

const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

let moduleCache = null
let fetchPromise = null

export function useSleeperRookies() {
  const [sleeperRookieMap, setSleeperRookieMap] = useState(moduleCache)
  const [loading, setLoading] = useState(!moduleCache)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (moduleCache) {
      setSleeperRookieMap(moduleCache)
      setLoading(false)
      return
    }

    if (!fetchPromise) {
      fetchPromise = fetch(`${SLEEPER_BASE}/players/nfl`)
        .then(r => {
          if (!r.ok) throw new Error(`Sleeper players DB ${r.status}`)
          return r.json()
        })
        .then(data => {
          // data is { player_id: { ...fields } } — large ~5MB object
          // Extract only years_exp===0 skill positions; discard the full response
          const map = {}
          Object.entries(data).forEach(([player_id, p]) => {
            if (p.years_exp !== 0) return
            if (!VALID_POSITIONS.has(p.position)) return
            const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
            if (!name) return
            map[player_id] = {
              sleeperId: player_id,
              name,
              position: p.position,
              team: p.team || '',
              age: p.age ?? null,
              value: 0,
            }
          })
          moduleCache = map
          return map
        })
    }

    fetchPromise
      .then(map => {
        setSleeperRookieMap(map)
        setLoading(false)
      })
      .catch(err => {
        fetchPromise = null
        setError(err.message)
        setLoading(false)
      })
  }, [retryCount])

  function retry() {
    fetchPromise = null
    moduleCache = null
    setError(null)
    setLoading(true)
    setSleeperRookieMap(null)
    setRetryCount(c => c + 1)
  }

  return { sleeperRookieMap, loading, error, retry }
}
