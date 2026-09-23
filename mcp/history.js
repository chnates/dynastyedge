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
// The manager-scouting tool needs the ledger, and therefore the transactions
// this skips. It got them the way this note asked — `getLedgerHistory`, below,
// widens the walk IN THE OPEN as its own function with its own measured cost,
// and this one stays narrow.
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

// ── THE WIDE WALK — getLedgerHistory ──────────────────────────────────────
//
// The header above says a manager-scouting tool needs the ledger and must
// widen this walk "with its own argument for the cost". This is that
// widening, done in the open as its OWN function so the narrow path and the
// 14-request claim that `tests/mcpHistory.test.mjs` pins stay exactly as they
// were for `analyze_trade`.
//
// It is built ON TOP of the narrow walk rather than beside it: the chain,
// rosters and drafts come from `getLeagueHistory` (and its cache), and this
// adds only what the ledger needs that the narrow walk skips — each past
// season's USERS (names for departed counterparties) and its TRANSACTIONS.
//
// ── THE COST, MEASURED RATHER THAN QUOTED ─────────────────────────────────
//
// Per past season: 1 users + one bucket per played week. Measured on this
// league 2026-09-22, every past season's week-18 bucket is EMPTY (2023, 2024
// and 2025 all read 0) and each league's `settings.last_scored_leg` is 17 —
// so the walk reads weeks 1..last_scored_leg, falling back to 18 when the
// field is absent, and spends 17 buckets rather than 18. Same "a bucket past
// the last week is empty by construction" argument transactions.js makes for
// the live season.
//
// ── CACHING ───────────────────────────────────────────────────────────────
//
// A past season is frozen, so each one is cached under its OWN key on the
// history TTL. Keyed per season (not per chain) so a failure in one season
// retries alone, and so a second league sharing no seasons shares no entries.
//
// ── THE DEGRADATION CONTRACT — "never traded" vs "we could not read" ─────
//
// A manager with no trades is a real answer, and an outage produces the
// identical shape. So every past season reports whether its transactions
// actually loaded (`ledgerSeasons` / `failedSeasons`), and a season whose
// buckets ALL failed contributes NO transactions and is named in
// `failedSeasons` — the tool then refuses to call anyone a non-trader over a
// window it could not read. One failed bucket inside a season is disclosed the
// same way, as a partial season.

export const LEDGER_MAX_WEEK = 18

const ledgerSeasonKey = seasonLeagueId => `ledger:${seasonLeagueId}`

export function playedWeeks(leagueInfo) {
  const last = Number(leagueInfo?.settings?.last_scored_leg)
  return Number.isFinite(last) && last >= 1 ? Math.min(LEDGER_MAX_WEEK, last) : LEDGER_MAX_WEEK
}

async function fetchSeasonLedger(get, leagueInfo) {
  const id = leagueInfo.league_id
  const weeks = Array.from({ length: playedWeeks(leagueInfo) }, (_, i) => i + 1)
  const [users, ...buckets] = await Promise.all([
    get(`${SLEEPER_BASE}/league/${id}/users`, { label: 'Sleeper users' }).catch(() => null),
    ...weeks.map(w =>
      get(`${SLEEPER_BASE}/league/${id}/transactions/${w}`, { label: `Sleeper transactions w${w}` })
        .catch(() => null)),
  ])
  const failedWeeks = weeks.filter((_, i) => !Array.isArray(buckets[i]))
  // Every bucket failed: throw, so nothing is CACHED for this season and the
  // next call retries it — a cached empty ledger would be "never traded" for
  // the whole history TTL.
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
  return { users: Array.isArray(users) ? users : [], usersFailed: !Array.isArray(users), transactions, failedWeeks, weeks: weeks.length }
}

export async function getLedgerHistory({
  leagueId, leagueInfo, ttlMs = DEFAULT_HISTORY_TTL_MS, force = false,
  fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  const base = await getLeagueHistory({ leagueId, leagueInfo, ttlMs, force, fetcher, concurrency, store })
  if (!base.available) {
    return {
      ...base, ledgerSeasons: [], failedSeasons: [], partialSeasons: [],
      notes: [
        'This league\'s past seasons could not be loaded, so there is no multi-season trade ledger, FAAB ' +
        'record or draft record. That is a gap in our data — it says nothing about how any manager trades.',
      ],
    }
  }

  const get = fetcher ?? createFetcher({ concurrency })
  const ttl = force ? -1 : ttlMs
  const past = base.history.pastSeasons ?? []

  const loaded = await Promise.all(past.map(ps =>
    loadSource(store, ledgerSeasonKey(ps.leagueId), ttl, () => fetchSeasonLedger(get, ps.leagueInfo))
      .catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))))

  const failedSeasons = []
  const partialSeasons = []
  const pastSeasons = past.map((ps, i) => {
    const l = loaded[i].data
    if (!l) { failedSeasons.push(ps.season); return { ...ps } }
    if (l.failedWeeks.length) partialSeasons.push({ season: ps.season, failedWeeks: l.failedWeeks })
    return { ...ps, users: l.users, transactions: l.transactions }
  })

  const notes = [...base.notes]
  if (failedSeasons.length) {
    notes.push(
      `The ${failedSeasons.join(', ')} season${failedSeasons.length > 1 ? 's' : ''}' transactions could not be ` +
      'loaded, so trades and FAAB from them are ABSENT — not zero. A manager showing few trades may have made ' +
      'more in the seasons we could not read.'
    )
  }
  partialSeasons.forEach(p => notes.push(
    `${p.season}: transaction week(s) ${p.failedWeeks.join(', ')} did not load, so that season's ledger ` +
    'understates activity.'
  ))

  // The stalest contributing season, for the same reason oldestSourceAt is
  // the stalest source.
  const times = [base.sources.history.fetchedAt, ...loaded.map(l => l.fetchedAt)]
    .filter(Boolean).map(t => (typeof t === 'number' ? t : Date.parse(t)))
  const oldest = times.length ? Math.min(...times) : null

  return {
    available: true,
    reason: null,
    history: { ...base.history, pastSeasons },
    seasonsBack: past.length,
    ledgerSeasons: pastSeasons.filter((_, i) => loaded[i].data).map(ps => ps.season),
    failedSeasons,
    partialSeasons,
    sources: {
      history: stampSource({
        fetchedAt: oldest,
        stale: base.sources.history.stale || loaded.some(l => l.stale),
        error: failedSeasons.length ? `${failedSeasons.length} of ${past.length} past seasons' ledgers failed` : null,
      }),
    },
    notes,
  }
}
