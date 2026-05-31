import { useEffect, useState } from 'react'
import { SLEEPER_BASE } from '../constants'

const INJURY_CRITICAL = /\b(out|placed on ir|injured reserve|torn|surgery|fracture|doubtful|season-ending)\b/i
const INJURY_MODERATE = /\b(questionable|limited|managing|day-to-day|dnp|did not practice)\b/i

function deriveInjuryFlag(headlines) {
  if (!headlines?.length) return 'green'
  const text = headlines.map(h => `${h.title ?? ''} ${h.description ?? ''}`).join(' ')
  if (INJURY_CRITICAL.test(text)) return 'red'
  if (INJURY_MODERATE.test(text)) return 'yellow'
  return 'green'
}

const newsCache = new Map()
const fetchPromises = new Map()

export async function fetchPlayerNews(playerId) {
  if (!playerId) return { headlines: [], injuryFlag: 'green' }
  if (newsCache.has(playerId)) return newsCache.get(playerId)
  if (fetchPromises.has(playerId)) return fetchPromises.get(playerId)

  const promise = fetch(`${SLEEPER_BASE}/players/nfl/${playerId}/news`)
    .then(res => {
      if (!res.ok) throw new Error(`${res.status}`)
      return res.json()
    })
    .then(data => {
      const headlines = Array.isArray(data) ? data.slice(0, 3) : []
      const result = { headlines, injuryFlag: deriveInjuryFlag(headlines) }
      newsCache.set(playerId, result)
      fetchPromises.delete(playerId)
      return result
    })
    .catch(() => {
      const result = { headlines: [], injuryFlag: 'green' }
      fetchPromises.delete(playerId)
      return result
    })

  fetchPromises.set(playerId, promise)
  return promise
}

export function usePlayerNews(playerId) {
  const [state, setState] = useState(() => {
    if (!playerId) return { headlines: [], injuryFlag: 'green', loading: false }
    const cached = newsCache.get(playerId)
    return cached ? { ...cached, loading: false } : { headlines: [], injuryFlag: 'green', loading: true }
  })

  useEffect(() => {
    if (!playerId) return
    if (newsCache.has(playerId)) {
      setState({ ...newsCache.get(playerId), loading: false })
      return
    }
    setState(s => ({ ...s, loading: true }))
    fetchPlayerNews(playerId).then(result => {
      setState({ ...result, loading: false })
    })
  }, [playerId])

  return state
}
