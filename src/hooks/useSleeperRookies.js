import { useMemo } from 'react'
import { usePlayerDB, getCachedPlayerDB } from './usePlayerDB'
import { buildRookieMap } from '../utils/rookieAdp'

// The rookie-class rule lives in utils/rookieAdp.js (so the MCP server
// builds the same class); this hook keeps only the per-DB memo.
let rookieCache = { db: null, map: null }

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
