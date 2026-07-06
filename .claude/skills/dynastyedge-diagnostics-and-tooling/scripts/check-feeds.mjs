// check-feeds.mjs — NETWORK REQUIRED. Freshness check for the three static
// JSON feeds the app serves from orphan branches via raw.githubusercontent.com:
//
//   NEWS_FEED_URL       (news-data branch, refreshed twice hourly by Actions)
//   VALUES_HISTORY_URL  (values-history branch, one column per UTC day)
//   TRADE_VALUES_URL    (values-history branch, permanent trade-time archive)
//
// Prints per-feed: item counts, newest-item age, values-history date range /
// column count / player count, and staleness verdicts (news > 2h old? values
// missing today's or yesterday's UTC column?). Each feed fails independently
// and gracefully — one broken feed never hides the others.
//
// USAGE:
//   node /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/check-feeds.mjs
import { fileURLToPath } from 'node:url'
import path from 'node:path'

let NEWS_FEED_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json'
let VALUES_HISTORY_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json'
let TRADE_VALUES_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/trade-values.json'
try {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const c = await import(path.join(repoRoot, 'src/constants.js'))
  NEWS_FEED_URL = c.NEWS_FEED_URL; VALUES_HISTORY_URL = c.VALUES_HISTORY_URL; TRADE_VALUES_URL = c.TRADE_VALUES_URL
} catch { /* fall back to literals above */ }

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const hoursAgo = iso => (Date.now() - new Date(iso).getTime()) / 3600000
const utcDay = d => new Date(d).toISOString().slice(0, 10)
let failures = 0

// ── News feed ────────────────────────────────────────────────────────────────
console.log('=== news.json (news-data branch) ===')
try {
  const feed = await getJSON(NEWS_FEED_URL)
  const items = feed.items ?? feed // tolerate bare-array shape
  const list = Array.isArray(items) ? items : []
  const newest = list.map(i => i.published).filter(Boolean).sort().at(-1)
  const age = newest ? hoursAgo(newest) : null
  console.log(`items:        ${list.length} (pipeline caps at 100)`)
  console.log(`newest item:  ${newest ?? 'n/a'}${age != null ? ` (${age.toFixed(1)}h ago)` : ''}`)
  const withLinks = list.filter(i => i.link).length
  console.log(`with links:   ${withLinks} · sources: ${[...new Set(list.map(i => i.source))].join(', ') || 'n/a'}`)
  // The workflow runs at :17 and :47; sources publish continuously. A newest
  // item > 2h old usually means the cron workflow has stopped (GitHub disables
  // crons after ~60 days of repo inactivity) — check Actions.
  console.log(`verdict:      ${age == null ? 'NO TIMESTAMPS — inspect feed shape' : age > 2 ? `STALE — newest item ${age.toFixed(1)}h old (>2h). Check .github/workflows/news.yml runs.` : 'FRESH'}`)
} catch (err) { failures++; console.log(`FEED UNREACHABLE: ${err.message} — network blocked, branch missing, or feed deleted.`) }

// ── Values history ───────────────────────────────────────────────────────────
console.log('\n=== values-history.json (values-history branch) ===')
try {
  const h = await getJSON(VALUES_HISTORY_URL)
  const dates = h.dates ?? []
  const players = Object.keys(h.players ?? {})
  console.log(`updatedAt:    ${h.updatedAt ?? 'n/a'}`)
  console.log(`columns:      ${dates.length} (rolling window is 90 days)`)
  console.log(`date range:   ${dates[0] ?? 'n/a'} → ${dates.at(-1) ?? 'n/a'}`)
  console.log(`players:      ${players.length} (top 500 by value + carried rows)`)
  const today = utcDay(Date.now()), yesterday = utcDay(Date.now() - 86400000)
  const hasToday = dates.includes(today), hasYesterday = dates.includes(yesterday)
  // Cron is 41 9 * * * UTC — before ~09:41 UTC, missing "today" is normal.
  console.log(`verdict:      ${hasToday ? 'FRESH (has today\'s UTC column)'
    : hasYesterday ? 'OK-ish — has yesterday but not today (normal before ~09:41 UTC; stale after)'
    : 'STALE — missing both today and yesterday. Check .github/workflows/values-history.yml.'}`)
} catch (err) { failures++; console.log(`FEED UNREACHABLE: ${err.message} — network blocked, branch missing, or feed deleted.`) }

// ── Trade-time value archive ─────────────────────────────────────────────────
console.log('\n=== trade-values.json (values-history branch) ===')
try {
  const t = await getJSON(TRADE_VALUES_URL)
  const entries = t.trades ?? t.entries ?? t
  const n = Array.isArray(entries) ? entries.length : Object.keys(entries ?? {}).length
  console.log(`entries:      ${n} (permanent archive — only ever grows)`)
  console.log(`updatedAt:    ${t.updatedAt ?? 'n/a'}`)
  console.log('verdict:      no staleness rule — archive only gains entries when trades happen.')
} catch (err) { failures++; console.log(`FEED UNREACHABLE: ${err.message} — best-effort feed; the app hides its UI line when missing.`) }

if (failures === 3) {
  console.error('\nAll three feeds unreachable — almost certainly no outbound network')
  console.error('(sandboxed sessions get proxy 403 on raw.githubusercontent.com).')
  console.error('Run from an environment with real network access.')
  process.exit(1)
}
