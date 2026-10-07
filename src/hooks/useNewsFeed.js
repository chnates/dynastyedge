import { useEffect, useMemo, useState } from 'react'
import { loadNewsFeed } from './usePlayerIntel'
import { buildNewsIndex, resolveItemPlayer, feedItemView, byNewestFirst } from '../utils/newsMatch'
import { usePlayerDB } from './usePlayerDB'
import { useLeagueContext } from '../context/LeagueContext'

// Full aggregated news feed (≤100 items) for the browsable News section.
// Unlike useLeagueNews — which filters to a player set and drops everything
// else — this returns EVERY item, newest first, each enriched with the best-
// matched FantasyCalc-ranked player (so a tap opens that player's profile)
// and whether that player is on my roster. Same one-fetch-per-session feed
// (loadNewsFeed) and the same best-effort contract as every news surface:
// any failure yields an empty list and the page shows its empty state.
export function useNewsFeed() {
  const { values, league } = useLeagueContext()
  const { playerDB } = usePlayerDB()
  const [raw, setRaw] = useState(null) // null = loading, [] = loaded/empty

  useEffect(() => {
    let cancelled = false
    loadNewsFeed().then(list => { if (!cancelled) setRaw(list ?? []) })
    return () => { cancelled = true }
  }, [])

  const playerMap = values?.playerMap ?? null

  // THE shared matcher's index (utils/newsMatch.js), built once per
  // (playerMap, playerDB): feed ids, then ESPN ids, then the longest full name.
  const index = useMemo(
    () => (playerMap ? buildNewsIndex(Object.values(playerMap), playerDB) : null),
    [playerMap, playerDB]
  )

  const myIds = useMemo(() => {
    const s = new Set()
    league?.myRoster?.players?.forEach(p => s.add(String(p.sleeperId)))
    return s
  }, [league])

  const loading = raw === null

  const items = useMemo(() => {
    if (!raw?.length) return []
    return raw
      .map(item => {
        const player = resolveItemPlayer(item, index)
        return {
          ...feedItemView(item),
          player,
          isMine: player ? myIds.has(String(player.sleeperId)) : false,
        }
      })
      .sort(byNewestFirst)
  }, [raw, index, myIds])

  return { items, loading }
}
