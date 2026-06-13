import { useEffect, useMemo, useState } from 'react'
import { loadNewsFeed, normalizeName } from './usePlayerIntel'
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

  // espn_id → player and normalized-name → player indices, built once per
  // (playerMap, playerDB). Names are sorted longest-first so a more specific
  // name wins when one player's name is a substring of another's headline.
  const indices = useMemo(() => {
    if (!playerMap) return null
    const byEspn = new Map()
    const byName = []
    Object.values(playerMap).forEach(p => {
      const meta = playerDB?.[String(p.sleeperId)]
      const espnId = meta?.espn_id != null ? Number(meta.espn_id) : null
      if (espnId != null && !Number.isNaN(espnId) && !byEspn.has(espnId)) byEspn.set(espnId, p)
      const n = normalizeName(p.name)
      // Full names only — short fragments produce false headline hits
      if (n.length >= 6 && n.includes(' ')) byName.push({ n, player: p })
    })
    byName.sort((a, b) => b.n.length - a.n.length)
    return { byEspn, byName }
  }, [playerMap, playerDB])

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
        let player = null
        const ids = item.athleteIds ?? []
        if (indices) {
          for (const id of ids) {
            const hit = indices.byEspn.get(Number(id))
            if (hit) { player = hit; break }
          }
          if (!player) {
            const headline = normalizeName(item.headline)
            const hit = indices.byName.find(({ n }) => headline.includes(n))
            if (hit) player = hit.player
          }
        }
        return {
          headline: item.headline,
          story: item.story ?? '',
          published: item.published ?? null,
          source: item.source ?? null,
          link: item.link ?? null,
          athleteIds: ids,
          player,
          isMine: player ? myIds.has(String(player.sleeperId)) : false,
        }
      })
      .sort((a, b) => new Date(b.published ?? 0) - new Date(a.published ?? 0))
  }, [raw, indices, myIds])

  return { items, loading }
}
