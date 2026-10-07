import { useEffect, useState } from 'react'
import { loadPlayerDB, getCachedPlayerDB } from './usePlayerDB'
import { injuryFromMeta, INJURY_UNAVAILABLE } from '../utils/injuryStatus'

// A player's injury status for the player card and the Trade Analyzer's live
// cards. It reads the ONE shared player DB (rule 6) and the ONE status rule
// (utils/injuryStatus.js) — the same two things the Lineup Optimizer reads, so
// the three can no longer disagree about whether a player is playing.
//
// It used to fetch /players/nfl/{id} per player and, on any failure, report
// the player as healthy (green). A failed lookup is now `unavailable: true`
// with no flag — "we could not check", which the trade verdict says out loud —
// never a fabricated "Active".

const UNAVAILABLE = INJURY_UNAVAILABLE

function fromDB(db, playerId) {
  return db ? injuryFromMeta(db[String(playerId)]) : UNAVAILABLE
}

export async function fetchPlayerNews(playerId) {
  if (!playerId) return injuryFromMeta(null)
  try {
    return fromDB(await loadPlayerDB(), playerId)
  } catch {
    return UNAVAILABLE
  }
}

export function usePlayerNews(playerId) {
  const [state, setState] = useState(() => {
    if (!playerId) return { ...injuryFromMeta(null), loading: false }
    const db = getCachedPlayerDB()
    return db ? { ...fromDB(db, playerId), loading: false } : { ...UNAVAILABLE, loading: true }
  })

  useEffect(() => {
    if (!playerId) return
    const db = getCachedPlayerDB()
    if (db) {
      setState({ ...fromDB(db, playerId), loading: false })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    fetchPlayerNews(playerId).then(result => {
      if (!cancelled) setState({ ...result, loading: false })
    })
    return () => { cancelled = true }
  }, [playerId])

  return state
}
