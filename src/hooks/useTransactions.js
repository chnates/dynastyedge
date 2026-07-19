import { useState, useEffect } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

// League transactions for the whole season. Sleeper buckets transactions by
// week (1–18); fetching all buckets in parallel (~18 small calls, well under
// the rate limit) is the only way to guarantee nothing is missed regardless
// of how offseason moves are bucketed. Cached for the session. One bad bucket
// is tolerated (contributes nothing), but when EVERY bucket fails the load
// rejects — League › Activity shows ErrorState instead of an empty feed
// masquerading as "no moves".
let txCache = null
let txPromise = null

export function loadTransactions(force = false) {
  if (txCache && !force) return Promise.resolve(txCache)
  if (!txPromise) {
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1)
    txPromise = Promise.all(
      weeks.map(w =>
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/transactions/${w}`, {
          label: 'Sleeper transactions',
        })
          .then(txs => ({ txs: Array.isArray(txs) ? txs : [], failed: false }))
          .catch(() => ({ txs: [], failed: true }))
      )
    )
      .then(perWeek => {
        if (perWeek.every(r => r.failed)) {
          throw new Error('Could not load league activity — check your connection and retry')
        }
        const all = []
        perWeek.forEach(({ txs }, i) => {
          txs.forEach(tx => {
            if (tx?.status === 'complete') all.push({ ...tx, week: i + 1 })
          })
        })
        all.sort((a, b) => (b.status_updated ?? 0) - (a.status_updated ?? 0))
        txCache = all
        txPromise = null
        return all
      })
      .catch(err => {
        txPromise = null
        throw err
      })
  }
  return txPromise
}

export function useTransactions() {
  const [transactions, setTransactions] = useState(txCache)
  const [loading, setLoading] = useState(!txCache)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadTransactions(refreshKey > 0)
      .then(txs => {
        if (cancelled) return
        setTransactions(txs)
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshKey])

  function retry() {
    setError(null)
    if (!txCache) setLoading(true)
    setRefreshKey(k => k + 1)
  }

  return { transactions, loading, error, retry }
}
