// feeds.js — the Actions-published static feeds other than news, as
// server-side sources: rookie-intel.json and trade-values.json.
//
// news.js was the first static feed the server read and carries its own
// matcher and kickoff-staleness logic. These two need none of that — they are
// read, shape-checked, stamped and handed to a util — so they share one small
// loader rather than each growing a copy of the contract below.
//
// ── CLASS B, BY CONSTRUCTION ───────────────────────────────────────────────
//
// Both files live on force-pushed data branches that GitHub Actions publishes
// (CLAUDE.md, the architecture contract's link 6), so a missing branch, a
// failed run or a 404 is a normal state. This loader NEVER throws: a miss is
// `available: false` with the reason in `error`, and every caller turns that
// into a note — never an ErrorState, never an empty result dressed up as
// "there are no rookies" or "this trade was never archived". Those are claims
// about the world; a failed fetch is a claim about our data.
//
// A 200 carrying the WRONG SHAPE is a miss too, not a partial answer: the app's
// own loaders throw 'bad shape' on exactly the same checks and latch off.
//
// ── TTLs, each argued ─────────────────────────────────────────────────────
//
// rookie-intel publishes ONCE A DAY (rookie-intel.yml, cron 10:23 UTC) and its
// depth-chart signal is weekly-granular (one column per ISO week). An hour
// bounds how far behind a fresh publish the server can sit while a
// conversation of follow-ups pays for one fetch; anything shorter buys nothing
// the feed can deliver.
//
// trade-values is a PERMANENT, append-only archive written by the daily
// values-history workflow — an entry, once written, never changes (trades are
// immutable, and 2026-09-21's self-heal rewrites a 0 to null exactly once). New
// entries arrive at most daily. Same hour, same reason.

import { ROOKIE_INTEL_URL, TRADE_VALUES_URL } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'

export const DEFAULT_FEED_TTL_MS = 60 * 60 * 1000

const defaultStore = memoryStore()

export function resetFeedsCache() {
  return defaultStore.clear()
}

async function loadFeed({ key, url, label, valid, ttlMs, force, fetcher, concurrency, store }) {
  const get = fetcher ?? createFetcher({ concurrency })
  const loaded = await loadSource(store, key, force ? -1 : ttlMs, async () => {
    const data = await get(url, { label })
    // Same checks the app's loaders throw 'bad shape' on. Thrown INSIDE the
    // load so a malformed payload is never written to the cache.
    if (!valid(data)) throw new Error(`${label} returned an unexpected shape`)
    return data
  }).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))

  const data = loaded.data ?? null
  const updatedAt = data?.updatedAt ?? null
  return {
    available: !!data,
    data,
    updatedAt,
    ageHours: updatedAt
      ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 36e5 * 10) / 10)
      : null,
    error: data ? null : (loaded.error ?? 'unknown error'),
    source: stampSource(loaded),
  }
}

export function getRookieIntel({
  ttlMs = DEFAULT_FEED_TTL_MS, force = false, fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  return loadFeed({
    key: 'feed:rookie-intel', url: ROOKIE_INTEL_URL, label: 'DynastyEdge rookie intel',
    valid: d => !!d?.players && typeof d.players === 'object',
    ttlMs, force, fetcher, concurrency, store,
  })
}

export function getTradeValues({
  ttlMs = DEFAULT_FEED_TTL_MS, force = false, fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  return loadFeed({
    key: 'feed:trade-values', url: TRADE_VALUES_URL, label: 'DynastyEdge trade-time values',
    valid: d => !!d?.trades && typeof d.trades === 'object',
    ttlMs, force, fetcher, concurrency, store,
  })
}
