// liveScores.js — this week's actual per-player scoring, for the one question
// a projection cannot answer: what has already happened?
//
// ── WHY THIS IS A FIFTH TTL, AND THE ONLY SHORT ONE ────────────────────────
//
// The four TTLs before it all argue for caching LONGER than instinct suggests.
// This one argues the other way, and the argument is not symmetry — it is that
// this is the only datum in the whole server that changes on a timescale of
// PLAYS.
//
//   The league snapshot (15 min) changes on an event — a trade, a waiver.
//   Projections (60 min) change on a 0.06%-per-10-hours drip.
//   Season matchups (60 min) change once a WEEK, when a whole week lands.
//   A settled transaction bucket is frozen forever.
//
//   A live box score changes every few minutes for three hours on a Sunday,
//   and it is the number that decides whether a lineup slot is still a
//   decision or already a result.
//
// So: 5 minutes (DYNASTYEDGE_LIVE_TTL_MS). That bounds how wrong a "banked so
// far" figure can be, at a cost of at most twelve small requests an hour
// during the only window anyone is asking. Outside that window the payload
// stops changing and the TTL costs nothing at all.
//
// ── WHY NOT REUSE season.js ────────────────────────────────────────────────
//
// season.js fetches this exact endpoint, and its TTL argument is the precise
// opposite of this one: it is long BECAUSE the model throws a partially-played
// week away, so its output only moves when a whole week completes. Borrowing
// its cache would mean reading a 60-minute-old box score to decide whether a
// game has finished. Two questions, two freshness domains, two modules.
//
// ── DEGRADATION ────────────────────────────────────────────────────────────
//
// Strictly best-effort. Without it a locked player is priced at his
// projection rather than his real score, which is a worse answer but never a
// wrong ACTION — the lock itself comes from the schedule, so the set of moves
// the tool offers is unaffected. The caller discloses the miss and moves on.

import { SLEEPER_BASE } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'

export const DEFAULT_LIVE_TTL_MS = 5 * 60 * 1000

const keyFor = (leagueId, week) => `live:${leagueId}_${week}`

const defaultStore = memoryStore()

export function resetLiveScoresCache() {
  return defaultStore.clear()
}

// Returns { available, week, pointsByRoster, source, notes }.
//
// `pointsByRoster` is rosterId → { sleeperId: points }. Sleeper reports it for
// every roster, not only yours, so one request serves a question about any
// team in the league.
export async function getLiveScores({
  leagueId, week, ttlMs = DEFAULT_LIVE_TTL_MS, force = false, fetcher, concurrency = 6,
  store = defaultStore,
} = {}) {
  const notes = []
  if (!leagueId || !Number.isFinite(Number(week)) || Number(week) < 1) {
    return { available: false, week: null, pointsByRoster: {}, source: null, notes }
  }

  const get = fetcher ?? createFetcher({ concurrency })
  const loaded = await loadSource(store, keyFor(leagueId, week), force ? -1 : ttlMs, () =>
    get(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`, { label: 'Sleeper live scores' })
  ).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))

  if (!Array.isArray(loaded.data)) {
    notes.push(
      `This week's live scores did not load (${loaded.error ?? 'unexpected shape'}), so a player whose ` +
      'game has already started is priced at his projection rather than at what he actually scored. ' +
      'Which slots are locked is unaffected — that comes from the NFL schedule.'
    )
    return { available: false, week: Number(week), pointsByRoster: {}, source: stampSource(loaded), notes }
  }

  const pointsByRoster = {}
  loaded.data.forEach(m => {
    if (m?.roster_id == null) return
    pointsByRoster[m.roster_id] = m.players_points ?? {}
  })

  return { available: true, week: Number(week), pointsByRoster, source: stampSource(loaded), notes }
}
