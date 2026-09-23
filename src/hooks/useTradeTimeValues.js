import { useState, useEffect } from 'react'
import { TRADE_VALUES_URL } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { tradeTimeTotals } from '../utils/managerAnalysis'

// Trade-time value archive, accumulated by the values-history GitHub Action:
// for every trade completed while the pipeline runs, the asset values within
// ~a day of the trade are recorded permanently. Lets the scouting ledger show
// "at the time" totals next to today's hindsight totals.
//
// Strictly best-effort, same contract as useValueHistory: archiving starts
// the day the pipeline ships, so most trades have no entry — consumers hide
// the "at trade" line rather than show an error or a loading state.
let archiveCache = null
let archivePromise = null
let archiveFailed = false

function loadArchive() {
  if (archiveCache) return Promise.resolve(archiveCache)
  if (archiveFailed) return Promise.resolve(null)
  if (!archivePromise) {
    archivePromise = fetchJSON(TRADE_VALUES_URL, { label: 'Trade values' })
      .then(data => {
        if (!data?.trades || typeof data.trades !== 'object') throw new Error('bad shape')
        archiveCache = data
        archivePromise = null
        return data
      })
      .catch(() => {
        archiveFailed = true
        archivePromise = null
        return null
      })
  }
  return archivePromise
}

export function useTradeTimeValues() {
  const [archive, setArchive] = useState(archiveCache)

  useEffect(() => {
    let cancelled = false
    loadArchive().then(a => {
      if (!cancelled && a) setArchive(a)
    })
    return () => { cancelled = true }
  }, [])

  // "At trade time" totals for one ledger entry — the rule lives in
  // utils/managerAnalysis.js (tradeTimeTotals) so the MCP server shares it.
  function getTradeTimeTotals(trade) {
    return tradeTimeTotals(archive, trade)
  }

  return { archive, getTradeTimeTotals }
}
