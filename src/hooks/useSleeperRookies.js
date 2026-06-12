import { useMemo } from 'react'
import { usePlayerDB, getCachedPlayerDB } from './usePlayerDB'

const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// Rookie map derived from the shared player DB cache (usePlayerDB).
// years_exp===0 is definitive; years_exp==null with age<=25 catches freshly
// drafted players whose Sleeper data hasn't updated post-draft yet.
let rookieCache = { db: null, map: null }

function buildRookieMap(playerDB) {
  const map = {}
  Object.entries(playerDB).forEach(([player_id, p]) => {
    const isRookie = p.years_exp === 0 || (p.years_exp == null && p.age != null && p.age <= 25)
    if (!isRookie) return
    if (!VALID_POSITIONS.has(p.position)) return
    if (!p.name) return
    map[player_id] = {
      sleeperId: player_id,
      name: p.name,
      position: p.position,
      team: p.team,
      age: p.age,
      value: 0,
    }
  })
  return map
}

function getRookieMap(playerDB) {
  if (rookieCache.db !== playerDB) {
    rookieCache = { db: playerDB, map: buildRookieMap(playerDB) }
  }
  return rookieCache.map
}

export function getPlayerMetaMap() {
  return getCachedPlayerDB() ?? {}
}

export function useSleeperRookies() {
  const { playerDB, loading, error, retry } = usePlayerDB()
  const sleeperRookieMap = useMemo(
    () => (playerDB ? getRookieMap(playerDB) : null),
    [playerDB]
  )
  return { sleeperRookieMap, loading, error, retry }
}
