// news.js — the aggregated player-news feed, as a server-side source.
//
// ── WHY THIS IS A TOOL AND NOT "LET THE MODEL SEARCH THE WEB" ──────────────
//
// A chat client can search the open web, and for breaking news it will
// sometimes beat this feed (see the staleness note below). Three things still
// make the feed the right primary source:
//
//   1. THE JOIN IS ALREADY DONE, AND DONE SERVER-SIDE ON PURPOSE. The news
//      pipeline resolves every item against Sleeper's player DB in the Actions
//      workflow and stamps `playerIds` on it, precisely because name matching
//      is unreliable — the live player DB contains TWO "DJ Moore"s (4961, a
//      cornerback, and 4983, the wide receiver on this roster). A model
//      matching a headline to a roster picks the wrong one eventually, which
//      is the same class of error `analyze_trade` refuses to risk by taking
//      ids only.
//   2. IT ARRIVES UNASKED. Web search fires only when the model decides to
//      search. News attached to a flagged player inside a lineup answer means
//      the reader never has to know to ask — which was the actual complaint
//      that produced this module.
//   3. PROVENANCE. Every item carries a source and a publish time, and this
//      module carries the feed's own age, so a stale answer can look stale.
//      A search result carries neither.
//
// ── AND WHERE IT LOSES, STATED RATHER THAN BURIED ──────────────────────────
//
// The feed publishes twice an hour (cron :17/:47) through a CDN that caches
// about five minutes. So it can sit up to ~35 minutes behind a wire report,
// and near kickoff that is exactly when a late inactive lands. Rather than
// pretend otherwise, `staleForKickoff` marks the condition and the tools hand
// the reader an explicit instruction to confirm against a live source. A tool
// that knows its own blind spot is more useful than one that is silently
// behind.
//
// ── CLASS B, ABSOLUTELY ────────────────────────────────────────────────────
//
// This is an Actions-published static feed, so the architecture contract makes
// it best-effort by construction: never throw, never block an answer, never
// retry-loop. A missing branch or a failed fetch yields `available: false` and
// every caller simply omits its news block. News has never been allowed to
// break a panel in the app and it must not start on the server.

import { NEWS_FEED_URL } from '../src/constants.js'
import { createFetcher } from './limit.js'
import { stampSource } from './snapshot.js'
import { memoryStore, loadSource } from './store.js'

// Ten minutes: shorter than the ~30-minute publish interval, so the server
// never sits on an edition longer than the pipeline takes to make the next
// one, and long enough that a conversation of follow-ups costs one fetch.
export const DEFAULT_NEWS_TTL_MS = 10 * 60 * 1000

// How far behind publish the feed may be before an answer says "confirm this
// against a live source". One publish interval plus the CDN window.
export const NEWS_STALE_MINUTES = 35

const NEWS_KEY = 'news:feed'
const defaultStore = memoryStore()

export function resetNewsCache() {
  return defaultStore.clear()
}

export async function getNews({
  ttlMs = DEFAULT_NEWS_TTL_MS, force = false, fetcher, concurrency = 6, store = defaultStore,
} = {}) {
  const get = fetcher ?? createFetcher({ concurrency })
  const loaded = await loadSource(store, NEWS_KEY, force ? -1 : ttlMs, () =>
    get(NEWS_FEED_URL, { label: 'DynastyEdge news feed' })
  ).catch(err => ({ data: null, fetchedAt: null, stale: false, error: err.message }))

  const feed = loaded.data
  const items = Array.isArray(feed?.items) ? feed.items : null
  if (!items) {
    return {
      available: false, items: [], updatedAt: null, ageMinutes: null,
      coverage: null, staleForKickoff: false, source: stampSource(loaded),
      notes: [],
    }
  }

  const updatedAt = feed.updatedAt ?? null
  const ageMinutes = updatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000))
    : null

  return {
    available: true,
    items,
    updatedAt,
    ageMinutes,
    coverage: feed.coverage ?? null,
    staleForKickoff: ageMinutes != null && ageMinutes > NEWS_STALE_MINUTES,
    source: stampSource(loaded),
    notes: [],
  }
}

// ── Matching ───────────────────────────────────────────────────────────────
//
// `playerIds` FIRST, because that is the id the pipeline resolved and the only
// one that is unambiguous. `athleteIds` second, via the player DB's `espn_id`,
// for items ESPN tagged but the name resolver missed. There is deliberately NO
// headline-name fallback here: the feed already name-matched server-side with
// the full player DB in hand, so a second, weaker attempt on this side could
// only add the errors the first one avoided.
export function newsForPlayer(feed, sleeperId, { limit = 3, playerDB } = {}) {
  if (!feed?.available || !sleeperId) return []
  const id = String(sleeperId)
  const espnId = playerDB?.[id]?.espn_id != null ? String(playerDB[id].espn_id) : null

  const hits = feed.items.filter(item => {
    if (Array.isArray(item.playerIds) && item.playerIds.some(p => String(p) === id)) return true
    if (espnId && Array.isArray(item.athleteIds) && item.athleteIds.some(a => String(a) === espnId)) return true
    return false
  })

  hits.sort((a, b) => new Date(b.published ?? 0) - new Date(a.published ?? 0))
  return hits.slice(0, Math.max(0, limit)).map(item => shapeItem(item, id))
}

// ESPN tags a roundup with every athlete it mentions, and the pipeline's
// story-level name matching does the same, so a multi-player column can surface
// on a player its headline is not about. The app's article sheet flags that
// case explicitly; so does this, rather than letting a reader take a roundup
// for a player-specific report.
function shapeItem(item, forId) {
  const named = Math.max(
    Array.isArray(item.playerIds) ? item.playerIds.length : 0,
    Array.isArray(item.athleteIds) ? item.athleteIds.length : 0,
  )
  return {
    headline: item.headline ?? null,
    story: item.story ?? null,
    source: item.source ?? null,
    published: item.published ?? null,
    link: item.link ?? null,
    // True when the item names several players, so the reader knows this may
    // be a roundup mentioning him rather than a report about him.
    multiPlayer: named > 1,
    playersNamed: named,
    forSleeperId: forId ? String(forId) : null,
  }
}

// News for a set of players at once — used to attach context to the players an
// answer has already decided are worth flagging. `perPlayer` is small by
// design: this rides inside another tool's payload, and non-negotiable 2 says
// bound every list.
export function newsForPlayers(feed, sleeperIds, { perPlayer = 2, maxPlayers = 8, playerDB } = {}) {
  if (!feed?.available) return {}
  const out = {}
  ;(sleeperIds ?? []).slice(0, maxPlayers).forEach(id => {
    const items = newsForPlayer(feed, id, { limit: perPlayer, playerDB })
    if (items.length) out[String(id)] = items
  })
  return out
}

// The sentence a tool prints when the feed cannot answer, or might be behind.
export function newsNotes(feed, { nearKickoff = false } = {}) {
  const notes = []
  if (!feed) return notes
  if (!feed.available) {
    notes.push(
      'The player-news feed did not load, so no injury or beat reporting is attached here. ' +
      'That is a missing source, not evidence that there is no news — check a live source if a ' +
      'status matters.'
    )
    return notes
  }
  if (feed.staleForKickoff || nearKickoff) {
    notes.push(
      `The news feed was published ${feed.ageMinutes ?? '?'} minutes ago and republishes about twice an ` +
      'hour, so it can trail a wire report by roughly half an hour. For a game kicking off shortly, ' +
      'confirm a questionable status against a live source before acting on it.'
    )
  }
  return notes
}
