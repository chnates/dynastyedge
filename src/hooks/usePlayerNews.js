import { useEffect, useState } from 'react'
import { SLEEPER_BASE } from '../constants'

// Maps Sleeper's injury_status string to our three-tier flag
function deriveInjuryFlag(status) {
  if (!status) return 'green'
  const s = status.toLowerCase()
  if (s === 'out' || s === 'ir' || s === 'doubtful' || s === 'pup' || s === 'sus') return 'red'
  if (s === 'questionable') return 'yellow'
  return 'green'
}

const newsCache = new Map()     // playerId → result
const fetchPromises = new Map() // playerId → Promise

export async function fetchPlayerNews(playerId) {
  if (!playerId) return { injuryFlag: 'green', injuryStatus: null, injuryDetail: null, injuryNotes: null }
  if (newsCache.has(playerId)) return newsCache.get(playerId)
  if (fetchPromises.has(playerId)) return fetchPromises.get(playerId)

  const promise = fetch(`${SLEEPER_BASE}/players/nfl/${playerId}`)
    .then(res => {
      if (!res.ok) throw new Error(`${res.status}`)
      return res.json()
    })
    .then(player => {
      const result = {
        injuryFlag:    deriveInjuryFlag(player.injury_status),
        injuryStatus:  player.injury_status  ?? null,
        injuryDetail:  player.injury_body_part ?? null,
        injuryNotes:   player.injury_notes   ?? null,
      }
      newsCache.set(playerId, result)
      fetchPromises.delete(playerId)
      return result
    })
    .catch(() => {
      const result = { injuryFlag: 'green', injuryStatus: null, injuryDetail: null, injuryNotes: null }
      fetchPromises.delete(playerId)
      return result
    })

  fetchPromises.set(playerId, promise)
  return promise
}

export function usePlayerNews(playerId) {
  const [state, setState] = useState(() => {
    if (!playerId) return { injuryFlag: 'green', injuryStatus: null, injuryDetail: null, injuryNotes: null, loading: false }
    const cached = newsCache.get(playerId)
    return cached ? { ...cached, loading: false } : { injuryFlag: 'green', injuryStatus: null, injuryDetail: null, injuryNotes: null, loading: true }
  })

  useEffect(() => {
    if (!playerId) return
    if (newsCache.has(playerId)) {
      setState({ ...newsCache.get(playerId), loading: false })
      return
    }
    setState(s => ({ ...s, loading: true }))
    fetchPlayerNews(playerId).then(result => setState({ ...result, loading: false }))
  }, [playerId])

  return state
}
