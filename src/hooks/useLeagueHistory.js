import { useState, useEffect } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'

// League history: walks the previous_league_id chain back through every
// season this league has existed on Sleeper, and pulls each past season's
// users, rosters, full transaction log, and drafts (with every pick made).
// Past seasons are frozen, so everything is fetched once and cached for the
// session. Lazy — nothing fetches until the first consumer mounts
// (Managers view or Trade Partner Finder).
//
// Current-season transactions are NOT fetched here — useTransactions already
// caches them; useManagerProfiles merges the two. Current-league drafts ARE
// fetched here (with picks) so traded picks from completed rookie drafts can
// be resolved into the players they became.

const MAX_SEASONS_BACK = 8   // safety cap on chain walking
const TX_WEEKS = 18

let historyCache = null
let historyPromise = null

async function fetchSeasonTransactions(leagueId) {
  const weeks = Array.from({ length: TX_WEEKS }, (_, i) => i + 1)
  const perWeek = await Promise.all(
    weeks.map(w =>
      fetchJSON(`${SLEEPER_BASE}/league/${leagueId}/transactions/${w}`, {
        label: 'Sleeper transactions',
      }).catch(() => [])
    )
  )
  const all = []
  perWeek.forEach((txs, i) => {
    ;(Array.isArray(txs) ? txs : []).forEach(tx => {
      if (tx?.status === 'complete') all.push({ ...tx, week: i + 1 })
    })
  })
  all.sort((a, b) => (b.status_updated ?? 0) - (a.status_updated ?? 0))
  return all
}

// All drafts for a league, each with its full pick list. Best-effort per
// draft — a draft with no picks yet returns [].
async function fetchDrafts(leagueId) {
  const drafts = await fetchJSON(`${SLEEPER_BASE}/league/${leagueId}/drafts`, {
    label: 'Sleeper drafts',
  }).catch(() => [])
  return Promise.all(
    (drafts ?? []).map(async draft => ({
      draft,
      picks: (await fetchJSON(`${SLEEPER_BASE}/draft/${draft.draft_id}/picks`, {
        label: 'Draft picks',
      }).catch(() => [])) ?? [],
    }))
  )
}

async function fetchPastSeason(leagueInfo) {
  const id = leagueInfo.league_id
  const [users, rosters, transactions, drafts] = await Promise.all([
    fetchJSON(`${SLEEPER_BASE}/league/${id}/users`, { label: 'Sleeper users' }),
    fetchJSON(`${SLEEPER_BASE}/league/${id}/rosters`, { label: 'Sleeper rosters' }),
    fetchSeasonTransactions(id),
    fetchDrafts(id),
  ])
  return {
    season: String(leagueInfo.season),
    leagueId: id,
    leagueInfo,
    users: users ?? [],
    rosters: rosters ?? [],
    transactions,
    drafts,
  }
}

async function fetchHistory() {
  const current = await fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, {
    label: 'Sleeper league',
  })

  // Walk the renewal chain — each hop is a prior season of this league
  const pastLeagues = []
  let prevId = current?.previous_league_id
  while (prevId && prevId !== '0' && pastLeagues.length < MAX_SEASONS_BACK) {
    const info = await fetchJSON(`${SLEEPER_BASE}/league/${prevId}`, {
      label: 'Sleeper league',
    }).catch(() => null)
    if (!info) break
    pastLeagues.push(info)
    prevId = info.previous_league_id
  }

  const [currentDrafts, ...pastSeasons] = await Promise.all([
    fetchDrafts(LEAGUE_ID),
    ...pastLeagues.map(fetchPastSeason),
  ])

  return {
    currentSeason: String(current?.season ?? ''),
    currentDrafts,
    pastSeasons,   // newest → oldest
  }
}

function loadHistory(force = false) {
  if (historyCache && !force) return Promise.resolve(historyCache)
  if (!historyPromise) {
    historyPromise = fetchHistory()
      .then(data => {
        historyCache = data
        historyPromise = null
        return data
      })
      .catch(err => {
        historyPromise = null
        throw err
      })
  }
  return historyPromise
}

export function useLeagueHistory() {
  const [history, setHistory] = useState(historyCache)
  const [loading, setLoading] = useState(!historyCache)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadHistory(refreshKey > 0)
      .then(h => {
        if (cancelled) return
        setHistory(h)
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
    if (!historyCache) setLoading(true)
    setRefreshKey(k => k + 1)
  }

  return { history, loading, error, retry }
}
