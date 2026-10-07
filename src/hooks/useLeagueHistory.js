import { useState, useEffect } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { walkLeagueChain, fetchDraftsWithPicks, fetchSeasonLedger } from '../utils/leagueHistory'

// League history: walks the previous_league_id chain back through every
// season this league has existed on Sleeper, and pulls each past season's
// users, rosters, full transaction log, and drafts (with every pick made).
// Past seasons are frozen, so everything is fetched once and cached for the
// session — except a walk with gaps, which `retry` (and the Managers screen's
// notice) refetches. Lazy — nothing fetches until the first consumer mounts
// (Managers view or Trade Partner Finder).
//
// Current-season transactions are NOT fetched here — useTransactions already
// caches them; useManagerProfiles merges the two. Current-league drafts ARE
// fetched here (with picks) so traded picks from completed rookie drafts can
// be resolved into the players they became.

// The walk itself — the chain, the drafts list, a season's ledger, and the
// rule for what each failure means — lives in utils/leagueHistory.js, shared
// with the MCP server (CODE-REVIEW-1 #3). Until 2026-10-07 this hook swallowed
// all three failures into facts: a season whose trades failed read "nobody
// traded", a failed drafts list read "never drafted", a failed hop ended the
// chain as if the league were younger. Each is now reported in `readState`,
// and Trade › Managers says which seasons it could not read.

let historyCache = null
let historyPromise = null

const get = (url, { label } = {}) => fetchJSON(url, { label })

async function fetchPastSeason(leagueInfo) {
  const id = leagueInfo.league_id
  const [ledger, rosters, drafts] = await Promise.all([
    fetchSeasonLedger(get, leagueInfo).then(l => ({ ok: true, ...l })).catch(() => ({ ok: false })),
    get(`${SLEEPER_BASE}/league/${id}/rosters`, { label: 'Sleeper rosters' }).catch(() => []),
    fetchDraftsWithPicks(get, id).then(d => ({ ok: true, d })).catch(() => ({ ok: false, d: [] })),
  ])
  return {
    season: String(leagueInfo.season),
    leagueId: id,
    leagueInfo,
    users: ledger.ok ? ledger.users : [],
    rosters: rosters ?? [],
    transactions: ledger.ok ? ledger.transactions : [],
    drafts: drafts.d,
    // Read state, per season — what the screens may and may not claim.
    ledgerRead: ledger.ok,
    failedWeeks: ledger.ok ? ledger.failedWeeks : [],
    draftsFailed: !drafts.ok,
  }
}

async function fetchHistory() {
  const current = await get(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, { label: 'Sleeper league' })
  const { pastLeagues, chainBroken } = await walkLeagueChain(get, current)

  let currentDraftsFailed = false
  const [currentDrafts, ...pastSeasons] = await Promise.all([
    fetchDraftsWithPicks(get, LEAGUE_ID).catch(() => { currentDraftsFailed = true; return [] }),
    ...pastLeagues.map(fetchPastSeason),
  ])

  return {
    currentSeason: String(current?.season ?? ''),
    currentDrafts,
    pastSeasons,   // newest → oldest
    readState: {
      ledgerSeasons: pastSeasons.filter(ps => ps.ledgerRead).map(ps => ps.season),
      failedSeasons: pastSeasons.filter(ps => !ps.ledgerRead).map(ps => ps.season),
      partialSeasons: pastSeasons
        .filter(ps => ps.ledgerRead && ps.failedWeeks.length)
        .map(ps => ({ season: ps.season, failedWeeks: ps.failedWeeks })),
      draftGaps: [
        ...(currentDraftsFailed ? [String(current?.season ?? '')] : []),
        ...pastSeasons.filter(ps => ps.draftsFailed).map(ps => ps.season),
      ],
      chainBroken,
    },
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
