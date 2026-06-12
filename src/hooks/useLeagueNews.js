import { useEffect, useMemo, useState } from 'react'
import { loadNewsFeed, normalizeName } from './usePlayerIntel'
import { usePlayerDB } from './usePlayerDB'

// News relevant to a set of players (The Edge passes my roster + watchlist).
// Reads the same aggregated feed as the player profile drawer — one fetch
// per session — and matches items by ESPN athlete id first, normalized full
// name in the headline second. Strictly best-effort, same contract as every
// news surface: any failure yields [] and the section simply hides.
export function useLeagueNews(players) {
  const { playerDB } = usePlayerDB()
  const [items, setItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadNewsFeed().then(list => { if (!cancelled) setItems(list) })
    return () => { cancelled = true }
  }, [])

  const playersKey = players.map(p => p.sleeperId).join(',')

  return useMemo(() => {
    if (!items?.length || !players.length) return []

    const matchers = players.map(p => {
      const n = normalizeName(p.name)
      return {
        player: p,
        espnId: playerDB?.[p.sleeperId]?.espn_id != null
          ? Number(playerDB[p.sleeperId].espn_id)
          : null,
        // Full names only — short fragments produce false headline hits
        name: n.length >= 6 && n.includes(' ') ? n : null,
      }
    })

    const seen = new Set()
    const matched = []
    items.forEach(item => {
      const headline = normalizeName(item.headline)
      const hit = matchers.find(({ espnId, name }) =>
        (espnId != null && item.athleteIds?.includes(espnId)) ||
        (name && headline.includes(name))
      )
      if (!hit || seen.has(item.headline)) return
      seen.add(item.headline)
      matched.push({
        headline: item.headline,
        story: item.story ?? '',
        published: item.published ?? null,
        source: item.source ?? null,
        link: item.link ?? null,
        athleteIds: item.athleteIds ?? [],
        player: hit.player,
      })
    })

    matched.sort((a, b) => new Date(b.published ?? 0) - new Date(a.published ?? 0))
    return matched
    // playersKey stands in for the players array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, playersKey, playerDB])
}
