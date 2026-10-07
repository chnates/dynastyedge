import { useEffect, useMemo, useState } from 'react'
import { loadNewsFeed } from './usePlayerIntel'
import { buildNewsIndex, resolveItemPlayer, feedItemView, byNewestFirst } from '../utils/newsMatch'
import { usePlayerDB } from './usePlayerDB'

// News relevant to a set of players (The Edge passes my roster + watchlist).
// Reads the same aggregated feed as the player profile drawer — one fetch
// per session — and matches items by the feed's own resolved Sleeper ids
// first, ESPN athlete id second, normalized full name in the headline last.
// Strictly best-effort, same contract as every news surface: any failure
// yields [] and the section simply hides.
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

    // THE shared matcher (utils/newsMatch.js): feed ids, then ESPN ids, then
    // the longest full name in the headline.
    const index = buildNewsIndex(players, playerDB)
    const seen = new Set()
    const matched = []
    items.forEach(item => {
      const player = resolveItemPlayer(item, index)
      if (!player || seen.has(item.headline)) return
      seen.add(item.headline)
      matched.push({ ...feedItemView(item), player })
    })

    matched.sort(byNewestFirst)
    return matched
    // playersKey stands in for the players array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, playersKey, playerDB])
}
