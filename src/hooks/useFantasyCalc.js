import { useState, useEffect } from 'react'
import { FANTASYCALC_BASE, FANTASYCALC_PARAMS } from '../constants'

let moduleCache = null
let fetchPromise = null

export function useFantasyCalc() {
  const [values, setValues] = useState(moduleCache)
  const [loading, setLoading] = useState(!moduleCache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (moduleCache) {
      setValues(moduleCache)
      setLoading(false)
      return
    }

    if (!fetchPromise) {
      const params = new URLSearchParams(
        Object.entries(FANTASYCALC_PARAMS).map(([k, v]) => [k, String(v)])
      )
      fetchPromise = fetch(`${FANTASYCALC_BASE}/values/current?${params}`)
        .then(r => {
          if (!r.ok) throw new Error(`FantasyCalc ${r.status}`)
          return r.json()
        })
        .then(data => {
          const playerMap = {}
          const pickEntries = []

          data.forEach(entry => {
            const sid = entry.player?.sleeperId
            if (sid) {
              playerMap[String(sid)] = {
                name: entry.player.name,
                position: entry.player.position,
                team: entry.player.maybeTeam || '',
                age: entry.player.maybeAge ?? null,
                value: Math.round(entry.value ?? 0),
                overallRank: entry.overallRank ?? null,
                positionRank: entry.positionRank ?? null,
                trend30Day: entry.trend30Day ?? 0,
              }
            } else if (entry.player?.name) {
              pickEntries.push({
                name: entry.player.name,
                value: Math.round(entry.value ?? 0),
              })
            }
          })

          moduleCache = { playerMap, pickEntries }
          return moduleCache
        })
    }

    fetchPromise
      .then(cache => {
        setValues(cache)
        setLoading(false)
      })
      .catch(err => {
        fetchPromise = null
        setError(err.message)
        setLoading(false)
      })
  }, [])

  function retry() {
    fetchPromise = null
    moduleCache = null
    setError(null)
    setLoading(true)
    setValues(null)
  }

  return { values, loading, error, retry }
}
