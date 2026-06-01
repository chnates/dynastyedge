import { useState, useEffect } from 'react'
import { SLEEPER_BASE } from '../constants'

const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

let moduleCache = null
let playerMetaCache = null
let fetchPromise = null

export function getPlayerMetaMap() {
  return playerMetaCache ?? {}
}

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
          // Extract only rookie skill positions; discard the full response.
          // years_exp===0 is definitive; years_exp==null with age<=25 catches
          // freshly drafted players whose Sleeper data hasn't updated post-draft yet.
          const map = {}
          const metaMap = {}
          Object.entries(data).forEach(([player_id, p]) => {
            metaMap[player_id] = {
              years_exp: p.years_exp ?? null,
              injury_status: p.injury_status ?? null,
            }
            const isRookie = p.years_exp === 0 || (p.years_exp == null && p.age != null && p.age <= 25)
            if (!isRookie) return
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
          playerMetaCache = metaMap
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
    playerMetaCache = null
    setError(null)
    setLoading(true)
    setSleeperRookieMap(null)
    setRetryCount(c => c + 1)
  }

  return { sleeperRookieMap, loading, error, retry }
}
