import { useState, useEffect } from 'react'
import { FANTASYCALC_BASE, FANTASYCALC_ROOKIE_PARAMS } from '../constants'

let moduleCache = null
let fetchPromise = null

export function useRookieADP() {
  const [rookieMap, setRookieMap] = useState(moduleCache)
  const [loading, setLoading]     = useState(!moduleCache)
  const [error, setError]         = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (moduleCache) {
      setRookieMap(moduleCache)
      setLoading(false)
      return
    }

    if (!fetchPromise) {
      const params = new URLSearchParams(
        Object.entries(FANTASYCALC_ROOKIE_PARAMS).map(([k, v]) => [k, String(v)])
      )
      fetchPromise = fetch(`${FANTASYCALC_BASE}/values/current?${params}`)
        .then(r => {
          if (!r.ok) throw new Error(`FantasyCalc rookies ${r.status}`)
          return r.json()
        })
        .then(data => {
          const map = {}
          data.forEach(entry => {
            const sid = entry.player?.sleeperId
            if (!sid) return
            if (!['QB', 'RB', 'WR', 'TE'].includes(entry.player?.position)) return
            map[String(sid)] = {
              name: entry.player.name,
              position: entry.player.position,
              team: entry.player.maybeTeam || '',
              age: entry.player.maybeAge ?? null,
              value: Math.round(entry.value ?? 0),
              overallRank: entry.overallRank ?? null,
              positionRank: entry.positionRank ?? null,
              trend30Day: entry.trend30Day ?? 0,
              adp: entry.adp ?? entry.overallRank ?? null,
              sleeperId: String(sid),
            }
          })
          moduleCache = map
          return map
        })
    }

    fetchPromise
      .then(map => {
        setRookieMap(map)
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
    setRookieMap(null)
    setRetryCount(c => c + 1)
  }

  return { rookieMap, loading, error, retry }
}
