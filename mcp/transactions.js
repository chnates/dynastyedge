// transactions.js — the season-wide transaction feed: every completed add,
// drop, waiver claim and trade this league has processed. It is what
// `buildPartnerActivity` reads to answer "what has this partner been doing
// lately?", which is the difference between a TE surplus that is spare depth
// and one they just went out and bought.
//
// The app's `useTransactions` is the same idea for the phone.
//
// ── WHY THIS DOES NOT FETCH 18 WEEKS THE WAY THE APP DOES ─────────────────
//
// CLAUDE.md describes the app's feed as "all 18 weekly buckets in parallel",
// which is right for a phone paying once per session and wrong for a server
// driven by an eager model. Sleeper buckets a transaction by the week it was
// PROCESSED, so a bucket past the current week is empty by construction —
// there is no mechanism by which a move lands in a week that has not
// happened.
//
// Measured on this league, 2026 week 2 (2026-09-20):
//
//   week  1 → 71 complete of 74   (every offseason and preseason move)
//   week  2 →  6 complete of  7   (the live week)
//   week  3 → 0 · week 17 → 0 · week 18 → 0
//
// So fetching 1..18 would spend SIXTEEN requests to learn nothing. This layer
// fetches 1..currentWeek and gets the identical answer. Note the shape of the
// distribution too: the bulk of a season's transactions sit in week 1, which
// is also the bucket that freezes first — which is what makes the split TTL
// below worth having rather than a micro-optimisation.
//
// ── WHY THE TTL IS SPLIT, AND WHY IT IS NOT season.js's ───────────────────
//
// snapshot.js caches 15 minutes, weekly.js 60, season.js 60 — each argued
// where it lives. This is a FOURTH freshness domain and it is genuinely two
// domains wearing one name:
//
//   A PAST week's bucket is FROZEN. Week 1 stopped receiving entries when
//   week 2 began (its newest entry is 2026-09-16, week 2's oldest 09-17).
//   Re-fetching it is re-fetching history.
//
//   The CURRENT week's bucket changes on an EVENT — a waiver clears, a trade
//   executes — which is the SAME domain the league snapshot is on, and for
//   the same reason: these are the very events that make a roster wrong.
//   Inheriting season.js's 60 minutes would let this layer disagree with the
//   snapshot for 45 of them, reporting a roster that holds a player while
//   claiming the partner has made no moves. So the live week tracks
//   `snapshotTtlMs`, deliberately.
//
// The payoff is that after the first pass a refresh costs ONE request, not
// one per week: every frozen bucket is served from cache.
//
// Overridable with DYNASTYEDGE_TRANSACTIONS_TTL_MS (the live week) and
// DYNASTYEDGE_FROZEN_TTL_MS (the settled ones).
//
// ── THE DEGRADATION CONTRACT ──────────────────────────────────────────────
//
// "No moves in the last three weeks" is a REAL and useful answer — it is the
// answer for a quiet manager. An outage produces the identical shape, so the
// two must never be conflated: a single failed bucket contributes nothing and
// is disclosed, and ALL of them failing returns `available: false` with
// `reason: 'unavailable'`. That mirrors the app exactly, where a total
// failure makes League › Activity render an ErrorState rather than an empty
// feed masquerading as "no moves" (CLAUDE.md, Transactions note).

import { SLEEPER_BASE } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'

// The live week rides the snapshot's event-driven domain; callers pass their
// configured snapshot TTL. This default exists only so the module is usable
// standalone and matches snapshot.js's own default.
export const DEFAULT_TRANSACTIONS_TTL_MS = 15 * 60 * 1000

// A settled bucket is immutable, so this is eviction pressure rather than
// freshness. Kept well under store.js's STORE_GC_SECONDS.
export const DEFAULT_FROZEN_TTL_MS = 12 * 60 * 60 * 1000

// Sleeper's regular season. Only ever an upper bound here — the real cap is
// the current week, for the reason in the header.
export const MAX_TRANSACTION_WEEK = 18

const txKeyFor = (leagueId, week) => `transactions:${leagueId}_${week}`

const defaultStore = memoryStore()

export function resetTransactionsCache() {
  return defaultStore.clear()
}

// How many buckets are worth asking for. Clamped to at least 1 so the
// offseason — where Sleeper reports week 1 and every offseason move sits in
// that first bucket — still reads the one bucket that holds everything.
export function lastTransactionWeek(nflState) {
  const week = Number(nflState?.week)
  if (!Number.isFinite(week)) return MAX_TRANSACTION_WEEK
  return Math.min(MAX_TRANSACTION_WEEK, Math.max(1, week))
}

// Fetch weeks 1..lastTransactionWeek of /league/{id}/transactions/{week}.
//
// Returns { available, reason, transactions, weeks, failedWeeks, sources, notes }.
// `transactions` is the flattened, status==='complete' feed newest-first —
// exactly the shape buildPartnerActivity takes, and the same filter the app
// applies, so the two feed one function with no adapter between them.
export async function getTransactions({
  leagueId, nflState, ttlMs = DEFAULT_TRANSACTIONS_TTL_MS,
  frozenTtlMs = DEFAULT_FROZEN_TTL_MS, force = false,
  fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  if (!leagueId) throw new Error('getTransactions requires a leagueId')

  const lastWeek = lastTransactionWeek(nflState)
  const get = fetcher ?? createFetcher({ concurrency })
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)

  const loaded = await Promise.all(weeks.map(w => {
    // Every week before the current one is settled; only the live bucket is
    // on the event-driven TTL. `force` overrides both.
    const ttl = force ? -1 : (w < lastWeek ? frozenTtlMs : ttlMs)
    return loadSource(store, txKeyFor(leagueId, w), ttl, () =>
      get(`${SLEEPER_BASE}/league/${leagueId}/transactions/${w}`, { label: `Sleeper transactions w${w}` })
    ).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))
  }))

  const failedWeeks = weeks.filter((_, i) => !Array.isArray(loaded[i].data))
  const notes = []

  // Every bucket failed. See the header: this is NOT "a quiet manager".
  if (failedWeeks.length === lastWeek) {
    return {
      available: false,
      reason: 'unavailable',
      transactions: null,
      weeks: lastWeek,
      failedWeeks,
      sources: { transactions: stampSource(loaded[0] ?? {}) },
      notes: [
        `None of this league's ${lastWeek} transaction week(s) could be loaded ` +
        `(${loaded[0]?.error ?? 'unknown error'}), so there is no activity read. ` +
        'This is a data failure, NOT a quiet league — an empty feed and an outage look identical, ' +
        'and reporting one as the other would state "they have made no moves" on no evidence.',
      ],
    }
  }

  if (failedWeeks.length) {
    notes.push(
      `Transaction week(s) ${failedWeeks.join(', ')} did not load, so any moves made in them are ` +
      'absent from the activity read below — it understates how active a manager has been.'
    )
  }

  // `week` is stamped from the bucket, exactly as useTransactions does — the
  // manager ledger reports it, and a raw Sleeper transaction does not carry it.
  const transactions = loaded
    .flatMap((l, i) => (Array.isArray(l.data) ? l.data.map(tx => ({ ...tx, week: weeks[i] })) : []))
    .filter(tx => tx?.status === 'complete')
    .sort((a, b) => (b.status_updated ?? 0) - (a.status_updated ?? 0))

  // The stalest contributing bucket, for the same reason asOf.oldestSourceAt
  // is the stalest source. With the split TTL the oldest is almost always a
  // frozen week, which is correct and harmless: it is frozen.
  const fetchedTimes = loaded.map(l => l.fetchedAt).filter(Boolean)
  const oldest = fetchedTimes.length ? Math.min(...fetchedTimes) : null

  return {
    available: true,
    reason: null,
    transactions,
    weeks: lastWeek,
    failedWeeks,
    sources: {
      transactions: stampSource({
        fetchedAt: oldest,
        stale: loaded.some(l => l.stale),
        error: failedWeeks.length ? `${failedWeeks.length} of ${lastWeek} weeks failed` : null,
      }),
    },
    notes,
  }
}
