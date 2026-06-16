import { useSyncExternalStore, useCallback } from 'react'

const KEY = 'dynastyedge_identity_v1'

// Roster-specific on-device state. These are tied to *which* team you are, so
// they must be wiped whenever the logged-in identity changes — otherwise a
// teammate logging in on the same device would inherit your dismissed action
// items or your half-built trade. League-wide caches (transactions, history,
// draft) are not roster-specific and are left alone.
const ROSTER_SCOPED_LOCAL = ['dynastyedge_action_dismissals']
const ROSTER_SCOPED_SESSION = ['dynastyedge_trade_draft']

function clearRosterScoped() {
  try {
    ROSTER_SCOPED_LOCAL.forEach(k => localStorage.removeItem(k))
    ROSTER_SCOPED_SESSION.forEach(k => sessionStorage.removeItem(k))
  } catch {
    // storage unavailable (private mode) — nothing to clear
  }
}

// Tiny external store (same pattern as useWatchlist) so the App gate and the
// side drawer re-render together the moment identity is set or cleared.
const listeners = new Set()
let cache = read()

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    // A valid identity must carry a numeric rosterId — that's the join key the
    // whole app uses for "is this me?". Anything else is treated as logged-out.
    if (v && typeof v.rosterId === 'number') {
      return { userId: v.userId ?? null, rosterId: v.rosterId }
    }
    return null
  } catch {
    return null
  }
}

function persist(next) {
  cache = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // keep the in-memory identity working even if storage is unavailable
  }
  listeners.forEach(l => l())
}

function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useIdentity() {
  const identity = useSyncExternalStore(subscribe, () => cache)

  const setIdentity = useCallback(({ userId, rosterId }) => {
    clearRosterScoped()
    persist({ userId: userId ?? null, rosterId })
  }, [])

  const clearIdentity = useCallback(() => {
    clearRosterScoped()
    persist(null)
  }, [])

  return {
    identity,
    userId: identity?.userId ?? null,
    rosterId: identity?.rosterId ?? null,
    setIdentity,
    clearIdentity,
  }
}
