// history.js — the league's past seasons, walked back through Sleeper's
// `previous_league_id` renewal chain. The app's `useLeagueHistory` is the
// same walk for the phone.
//
// It exists here for ONE signal: `analyze_trade`'s pick-confidence nudge,
// which reads my rookie-draft hindsight record — the share of my rookie picks
// now worth starting-caliber dynasty value. When I am acquiring picks, that
// record adjusts confidence in the capital (never the raw value).
//
// ── THIS WALK IS DELIBERATELY NARROWER THAN THE APP'S ─────────────────────
//
// CLAUDE.md states the cost of the full one plainly: "useLeagueHistory's path
// alone fires ~169 concurrent requests against Sleeper's published guidance
// of under 1,000/minute." That is the number mcp/limit.js exists to bound,
// and it is not a number worth spending to produce one `{count, hits}`.
//
// Almost all of it is TRANSACTIONS — 18 weekly buckets per past season, which
// the app needs for the trade ledger and FAAB tendencies on Trade › Managers.
// Draft grading reads none of them. `buildDraftRecords` needs exactly two
// things per season: the drafts with their picks, and a roster→owner map for
// the fallback when a pick carries no `picked_by`.
//
// So this fetches leagues + rosters + drafts + picks and nothing else:
// roughly FOURTEEN requests on this league's four-season chain, against ~169.
// `users` and `transactions` are returned as empty arrays because
// normalizeSeasons maps over both, and their emptiness is the documented
// consequence below.
//
// ── THE CONSEQUENCE, STATED RATHER THAN BURIED ────────────────────────────
//
// A profile built from THIS history has a real `.draft` and an EMPTY trade
// ledger and FAAB record. That is why this module is paired with
// `buildDraftGrades` — a function that returns only draft records — rather
// than with `buildManagerProfiles`, whose other fields would read as
// "this manager has never traded" when the truth is "we did not ask".
//
// A future manager-scouting tool needs the ledger, and therefore needs the
// transactions this skips. Widen it there, with its own argument for the
// cost; do not quietly widen it here.
//
// ── CACHING ───────────────────────────────────────────────────────────────
//
// A past season is FROZEN — 2024's draft will never change — so this is the
// longest TTL in the server and the number is eviction pressure, not
// freshness. The only mutable part is the CURRENT season's draft, and it
// moves once a year; the signal reading it is a hindsight record gated at
// five graded picks, which a live draft cannot meaningfully move.
//
// Overridable with DYNASTYEDGE_HISTORY_TTL_MS.

import { SLEEPER_BASE } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'

export const DEFAULT_HISTORY_TTL_MS = 6 * 60 * 60 * 1000

// The app's own cap on chain length, kept identical so the two walks cover
// the same seasons.
export const MAX_SEASONS_BACK = 8

const historyKeyFor = leagueId => `history:${leagueId}`

const defaultStore = memoryStore()

export function resetHistoryCache() {
  return defaultStore.clear()
}

// All drafts for a league, each with its full pick list.
//
// The LIST error is deliberately NOT swallowed, while a per-draft pick error
// is — and the asymmetry is the whole degradation contract. A draft with no
// picks yet genuinely contributes [], exactly as the app treats it. But a
// failed drafts LIST returning [] would be indistinguishable from "this
// league has never drafted", which downstream reads as "you have no rookie
// record" — an outage rendering as a fact about the owner. The caller turns
// that throw into `available: false` instead.
async function fetchDrafts(get, leagueId) {
  const drafts = await get(`${SLEEPER_BASE}/league/${leagueId}/drafts`, { label: 'Sleeper drafts' })
  return Promise.all(
    (drafts ?? []).map(async draft => ({
      draft,
      picks: (await get(`${SLEEPER_BASE}/draft/${draft.draft_id}/picks`, { label: 'Draft picks' })
        .catch(() => [])) ?? [],
    }))
  )
}

// One past season: the roster→owner map and the drafts. No users, no
// transactions — see the header.
async function fetchPastSeason(get, leagueInfo) {
  const id = leagueInfo.league_id
  const [rosters, drafts] = await Promise.all([
    get(`${SLEEPER_BASE}/league/${id}/rosters`, { label: 'Sleeper rosters' }).catch(() => []),
    // One bad PAST season degrades the record rather than sinking the walk —
    // the same per-item contract the app keeps. Only losing everything is
    // unavailable, which the caller decides.
    fetchDrafts(get, id).catch(() => []),
  ])
  return {
    season: String(leagueInfo.season),
    leagueId: id,
    leagueInfo,
    users: [],          // not fetched — normalizeSeasons maps over it
    rosters: rosters ?? [],
    transactions: [],   // not fetched — see the header
    drafts,
  }
}

// Walk the renewal chain and return a history in the shape
// `normalizeSeasons` takes: { currentSeason, currentDrafts, pastSeasons }.
//
// `leagueInfo` is the CURRENT league's payload, which the snapshot already
// holds — so the chain starts from it rather than re-fetching the league.
export async function getLeagueHistory({
  leagueId, leagueInfo, ttlMs = DEFAULT_HISTORY_TTL_MS, force = false,
  fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  if (!leagueId) throw new Error('getLeagueHistory requires a leagueId')

  const get = fetcher ?? createFetcher({ concurrency })
  const ttl = force ? -1 : ttlMs

  const loaded = await loadSource(store, historyKeyFor(leagueId), ttl, async () => {
    // The chain is sequential by nature — each hop names the next — so it is
    // the one place here that cannot parallelise. `'0'` is Sleeper's
    // no-previous-league sentinel (rule 8's shape, in a different field).
    const pastLeagues = []
    let prevId = leagueInfo?.previous_league_id
    while (prevId && prevId !== '0' && pastLeagues.length < MAX_SEASONS_BACK) {
      const info = await get(`${SLEEPER_BASE}/league/${prevId}`, { label: 'Sleeper league' })
        .catch(() => null)
      if (!info) break
      pastLeagues.push(info)
      prevId = info.previous_league_id
    }

    let currentDraftsFailed = false
    const [currentDrafts, ...pastSeasons] = await Promise.all([
      fetchDrafts(get, leagueId).catch(() => { currentDraftsFailed = true; return [] }),
      ...pastLeagues.map(info => fetchPastSeason(get, info)),
    ])

    // Learned NOTHING. An empty history is a real answer for a brand-new
    // league and a lie after an outage, so the two must not share a shape:
    // reported empty, it would render as "you have no rookie-draft record",
    // which is a claim about the owner made on no evidence.
    if (currentDraftsFailed && pastSeasons.length === 0) {
      throw new Error('no league history could be loaded (drafts list failed, no past seasons reachable)')
    }

    return {
      currentSeason: String(leagueInfo?.season ?? ''),
      currentDrafts,
      pastSeasons,   // newest → oldest
    }
  }).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))

  if (!loaded.data) {
    return {
      available: false,
      reason: 'unavailable',
      history: null,
      sources: { history: stampSource(loaded) },
      notes: [
        `This league's past seasons could not be loaded (${loaded.error ?? 'unknown error'}), ` +
        'so the rookie-draft hindsight record is absent. That removes context from the pick ' +
        'read below, never a number from the grade.',
      ],
    }
  }

  return {
    available: true,
    reason: null,
    history: loaded.data,
    seasonsBack: loaded.data.pastSeasons?.length ?? 0,
    sources: { history: stampSource(loaded) },
    notes: [],
  }
}
