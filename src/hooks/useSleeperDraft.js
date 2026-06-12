import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchJSON } from '../utils/fetchJSON'
import { SLEEPER_BASE, LEAGUE_ID, PICK_YEARS } from '../constants'

// The upcoming rookie draft season — same convention as the pick tracker.
export const DRAFT_SEASON = PICK_YEARS[0]

const LIVE_POLL_MS     = 30 * 1000      // poll cadence while the draft is live
const LIVE_STALE_MS    = 10 * 1000      // focus refetch threshold while live
const IDLE_STALE_MS    = 5 * 60 * 1000  // focus refetch threshold otherwise

// Module cache: Board and Tracker share one fetch per session; refresh()
// updates the cache for whichever consumer mounts next.
let cache = { data: null, fetchedAt: 0 }
let inflight = null

async function fetchDraftData() {
  const drafts = await fetchJSON(
    `${SLEEPER_BASE}/league/${LEAGUE_ID}/drafts`,
    { label: 'Sleeper drafts' }
  )
  const draft = (drafts ?? []).find(
    d => String(d.season) === DRAFT_SEASON && d.type !== 'auction'
  ) ?? null
  if (!draft) return { draft: null, picks: [], tradedPicks: [] }

  // Both are best-effort: a draft with no picks yet returns [].
  const [picks, tradedPicks] = await Promise.all([
    fetchJSON(`${SLEEPER_BASE}/draft/${draft.draft_id}/picks`, { label: 'Draft picks' })
      .catch(() => []),
    fetchJSON(`${SLEEPER_BASE}/draft/${draft.draft_id}/traded_picks`, { label: 'Draft trades' })
      .catch(() => []),
  ])
  return { draft, picks: picks ?? [], tradedPicks: tradedPicks ?? [] }
}

function loadDraft(force = false) {
  if (!force && cache.data) return Promise.resolve(cache.data)
  if (inflight) return inflight
  inflight = fetchDraftData()
    .then(data => {
      cache = { data, fetchedAt: Date.now() }
      return data
    })
    .finally(() => { inflight = null })
  return inflight
}

// Full draft order, resolved against in-draft pick trades.
// Returns null while Sleeper has no draft order set (slot_to_roster_id null).
// Entries: { round, slot, overall, rosterId, originalRosterId, label }.
export function buildDraftOrder(draft, tradedPicks = []) {
  const slotToRoster = draft?.slot_to_roster_id
  if (!slotToRoster) return null
  const rounds = draft.settings?.rounds ?? 4
  const teams = draft.settings?.teams ?? (Object.keys(slotToRoster).length || 10)

  const traded = {}
  tradedPicks.forEach(tp => {
    if (String(tp.season) !== String(draft.season)) return
    traded[`${tp.round}-${tp.roster_id}`] = tp.owner_id
  })

  const order = []
  for (let round = 1; round <= rounds; round++) {
    for (let i = 1; i <= teams; i++) {
      const slot = draft.type === 'snake' && round % 2 === 0 ? teams + 1 - i : i
      const original = slotToRoster[slot] ?? null
      const rosterId = original != null
        ? (traded[`${round}-${original}`] ?? original)
        : null
      order.push({
        round,
        slot,
        overall: (round - 1) * teams + i,
        rosterId,
        originalRosterId: original,
        label: `${round}.${String(slot).padStart(2, '0')}`,
      })
    }
  }
  return order
}

// Live Sleeper draft state for the upcoming rookie draft. Session-cached;
// refresh() refetches on demand. While the draft is live it also polls every
// 30s and refetches whenever the tab regains focus (e.g. flipping back from
// the Sleeper app mid-draft).
export function useSleeperDraft() {
  const [data, setData]           = useState(cache.data)
  const [fetchedAt, setFetchedAt] = useState(cache.fetchedAt || null)
  const [loading, setLoading]     = useState(!cache.data)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState(null)
  const mounted = useRef(true)

  const load = useCallback(force => {
    if (cache.data) setRefreshing(true)
    else setLoading(true)
    setError(null)
    return loadDraft(force)
      .then(d => {
        if (!mounted.current) return
        setData(d)
        setFetchedAt(cache.fetchedAt)
      })
      .catch(e => { if (mounted.current) setError(e.message) })
      .finally(() => {
        if (mounted.current) {
          setLoading(false)
          setRefreshing(false)
        }
      })
  }, [])

  const refresh = useCallback(() => load(true), [load])

  useEffect(() => {
    mounted.current = true
    load(false)
    return () => { mounted.current = false }
  }, [load])

  // Refetch on tab focus — aggressively while live, gently otherwise.
  const statusRef = useRef(null)
  statusRef.current = data?.draft?.status ?? null
  useEffect(() => {
    function maybeRefresh() {
      if (document.visibilityState !== 'visible') return
      const live = statusRef.current === 'drafting' || statusRef.current === 'paused'
      const staleAfter = live ? LIVE_STALE_MS : IDLE_STALE_MS
      if (Date.now() - (cache.fetchedAt || 0) > staleAfter) refresh()
    }
    document.addEventListener('visibilitychange', maybeRefresh)
    window.addEventListener('focus', maybeRefresh)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh)
      window.removeEventListener('focus', maybeRefresh)
    }
  }, [refresh])

  // Poll while the draft is actively running and the tab is visible.
  useEffect(() => {
    if (data?.draft?.status !== 'drafting') return undefined
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, LIVE_POLL_MS)
    return () => clearInterval(id)
  }, [data?.draft?.status, refresh])

  return { data, fetchedAt, loading, refreshing, error, refresh }
}
