// THE league-history walk — the one implementation of how this league's past
// seasons are read from Sleeper, shared by the app's `useLeagueHistory`
// (Trade › Managers, Partner cards) and the MCP server's `mcp/history.js`
// (`scout_managers`, `analyze_trade`'s draft-grade nudge). CODE-REVIEW-1 #3.
//
// It takes the fetcher as an argument (`get(url, { label })`, returning the
// parsed JSON or throwing) and makes no request of its own, so it stays a pure
// util: the app passes `fetchJSON`, the server its rate-limited fetcher, the
// tests a fake.
//
// ── THE CONTRACT: "never traded" is not "we could not read" ───────────────
//
// Until 2026-10-07 the app swallowed three failures into facts:
//   • every weekly transaction bucket failing read as "nobody traded that
//     season";
//   • the drafts LIST failing read as "never drafted";
//   • a failed hop in the `previous_league_id` chain silently ended the walk,
//     so older seasons vanished as if the league were younger.
// The server had already been fixed for the first two. Both now share the
// rules below, and every reader gets told which seasons it actually read.

import { SLEEPER_BASE } from '../constants'

// Safety cap on the chain walk.
export const MAX_SEASONS_BACK = 8

// The most transaction buckets a season can have. A past season reads
// 1..last_scored_leg (17 here) — a bucket past the last played week is empty
// by construction.
export const LEDGER_MAX_WEEK = 18

export function playedWeeks(leagueInfo) {
  const last = Number(leagueInfo?.settings?.last_scored_leg)
  return Number.isFinite(last) && last >= 1 ? Math.min(LEDGER_MAX_WEEK, last) : LEDGER_MAX_WEEK
}

// Walk `previous_league_id` back from the CURRENT league's payload.
// `'0'` is Sleeper's no-previous-league sentinel (rule 8's shape).
//
// Returns { pastLeagues (newest → oldest), chainBroken }. `chainBroken` is
// null when the chain ended naturally (or hit the cap), and otherwise names
// where it broke — the seasons behind that hop are UNKNOWN, not absent.
export async function walkLeagueChain(get, leagueInfo, { maxBack = MAX_SEASONS_BACK, base = SLEEPER_BASE } = {}) {
  const pastLeagues = []
  let prevId = leagueInfo?.previous_league_id
  let chainBroken = null
  while (prevId && prevId !== '0' && pastLeagues.length < maxBack) {
    let info = null
    try {
      info = await get(`${base}/league/${prevId}`, { label: 'Sleeper league' })
    } catch (err) {
      chainBroken = {
        leagueId: String(prevId),
        afterSeason: String((pastLeagues[pastLeagues.length - 1] ?? leagueInfo)?.season ?? ''),
        error: err?.message ?? 'request failed',
      }
      break
    }
    if (!info) {
      chainBroken = {
        leagueId: String(prevId),
        afterSeason: String((pastLeagues[pastLeagues.length - 1] ?? leagueInfo)?.season ?? ''),
        error: 'empty response',
      }
      break
    }
    pastLeagues.push(info)
    prevId = info.previous_league_id
  }
  return { pastLeagues, chainBroken }
}

// All drafts for a league, each with its full pick list.
//
// The LIST error is NOT swallowed; a per-draft pick error is. A draft with no
// picks yet genuinely contributes []. A failed list returning [] would read as
// "this league never drafted" — an outage rendering as a fact about a manager.
export async function fetchDraftsWithPicks(get, leagueId, { base = SLEEPER_BASE } = {}) {
  const drafts = await get(`${base}/league/${leagueId}/drafts`, { label: 'Sleeper drafts' })
  return Promise.all(
    (drafts ?? []).map(async draft => ({
      draft,
      picks: (await get(`${base}/draft/${draft.draft_id}/picks`, { label: 'Draft picks' })
        .catch(() => [])) ?? [],
    }))
  )
}

// One past season's ledger inputs: its users (names for departed
// counterparties) and its completed transactions, each stamped with its week.
//
// Every bucket failing THROWS — a caller that caches must not cache an empty
// ledger, and a caller that reports must name the season. One failed bucket
// is disclosed as `failedWeeks` (a partial season).
export async function fetchSeasonLedger(get, leagueInfo, { base = SLEEPER_BASE } = {}) {
  const id = leagueInfo.league_id
  const weeks = Array.from({ length: playedWeeks(leagueInfo) }, (_, i) => i + 1)
  const [users, ...buckets] = await Promise.all([
    get(`${base}/league/${id}/users`, { label: 'Sleeper users' }).catch(() => null),
    ...weeks.map(w =>
      get(`${base}/league/${id}/transactions/${w}`, { label: `Sleeper transactions w${w}` })
        .catch(() => null)),
  ])
  const failedWeeks = weeks.filter((_, i) => !Array.isArray(buckets[i]))
  if (failedWeeks.length === weeks.length) {
    throw new Error(`no transaction week of the ${leagueInfo.season} season could be loaded`)
  }
  const transactions = []
  buckets.forEach((txs, i) => {
    ;(Array.isArray(txs) ? txs : []).forEach(tx => {
      if (tx?.status === 'complete') transactions.push({ ...tx, week: weeks[i] })
    })
  })
  transactions.sort((a, b) => (b.status_updated ?? 0) - (a.status_updated ?? 0))
  return {
    users: Array.isArray(users) ? users : [],
    usersFailed: !Array.isArray(users),
    transactions,
    failedWeeks,
    weeks: weeks.length,
  }
}

// Which seasons' trades were actually read — the one statement every reader
// prints. `complete` is the only state in which "No trades yet" may be said.
//
//   currentSeason   the live season's label
//   currentRead     did the current season's transaction feed load?
//   historyRead     did the history walk load at all?
//   ledgerSeasons   past seasons whose transactions loaded
//   failedSeasons   past seasons whose transactions did not
//   chainBroken     walkLeagueChain's break, or null
export function ledgerCoverage({
  currentSeason, currentRead = true, historyRead = true,
  ledgerSeasons = [], failedSeasons = [], chainBroken = null,
} = {}) {
  const seasonsRead = [
    ...(currentRead && currentSeason ? [String(currentSeason)] : []),
    ...(historyRead ? ledgerSeasons.map(String) : []),
  ]
  const seasonsMissing = [
    ...(currentRead ? [] : [String(currentSeason)]),
    ...(historyRead ? failedSeasons.map(String) : ['every past season']),
    ...(historyRead && chainBroken ? [`any season before ${chainBroken.afterSeason}`] : []),
  ]
  return {
    seasonsRead,
    seasonsMissing,
    available: seasonsRead.length > 0,
    complete: seasonsRead.length > 0 && seasonsMissing.length === 0,
  }
}

// The activity sentence for a manager with no trades in what was read.
export function noTradesLabel(coverage) {
  if (!coverage || coverage.complete) return 'No trades yet'
  const n = coverage.seasonsRead.length
  return `No trades in the ${n} season${n === 1 ? '' : 's'} we could read`
}
