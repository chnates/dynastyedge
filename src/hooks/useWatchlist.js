import { useSyncExternalStore, useCallback } from 'react'

const KEY = 'dynastyedge_watchlist_v1'

// Tiny external store so every component sharing the watchlist re-renders
// together when a player is starred/unstarred anywhere in the app.
const listeners = new Set()
let cache = read()

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function write(next) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // localStorage full or unavailable — keep the in-memory list working
  }
  listeners.forEach(l => l())
}

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useWatchlist() {
  const watchlist = useSyncExternalStore(subscribe, () => cache)

  const toggleWatch = useCallback(sleeperId => {
    const id = String(sleeperId)
    write(cache.includes(id) ? cache.filter(x => x !== id) : [...cache, id])
  }, [])

  const isWatched = useCallback(
    sleeperId => watchlist.includes(String(sleeperId)),
    [watchlist]
  )

  return { watchlist, toggleWatch, isWatched }
}
