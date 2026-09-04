#!/usr/bin/env node
// Fetches NFL player news from several free sources, merges them into the
// PREVIOUSLY published feed, ranks by whether an item is actually about a
// player, and writes news.json. Runs in GitHub Actions
// (.github/workflows/news.yml) where requests are server-side — no browser
// CORS restrictions. The app reads the published file from the news-data
// branch via raw.githubusercontent.com (which sends
// Access-Control-Allow-Origin: *).
//
// Three things make this feed about MY players rather than about the NFL:
//
//   1. Player-focused sources lead. RotoWire is 100% player-news; PFF,
//      Yardbarker, The Athletic and PFT name a player in 30–45% of items.
//      Yahoo (8%) still ships — the News tab wants general items too — it
//      just loses every tiebreak.
//   2. Accumulation. Each run merges into the feed the last run published,
//      so a source like RotoWire (only 5 items per pull, but all of them
//      player news) compounds across 48 runs a day instead of being flushed
//      by one 100-item general-interest source.
//   3. ID enrichment. Only ~20% of items arrive carrying ESPN athlete ids —
//      the strongest join the app has. Items matched to a player BY NAME
//      here get that player's espn_id written into `athleteIds`, so the app
//      resolves them by id with no client change.
//
// Every source is best-effort: a source that fails or changes shape is
// logged and skipped. Player enrichment is best-effort too — without the
// Sleeper player DB the script still publishes, just ranked by recency.
// The script only fails (exit 1, keeping the previous feed) when the merged
// result is empty.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const MAX_STORY = 600

// Retention. Player items are the product, so they get a long window and the
// lion's share of the cap; general items are context and age out in two days.
// 320 items lands around 130KB — the app pulls this once per session.
const PLAYER_MAX = 240
const PLAYER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const GENERAL_MAX = 80
const GENERAL_MAX_AGE_MS = 48 * 60 * 60 * 1000

// Written by the workflow from the news-data branch before this runs. Absent
// on the very first run (or if the checkout failed) — we just start fresh.
const PREV_FILE = 'news-prev.json'
const OUT_FILE = 'news.json'

const SLEEPER_PLAYERS = 'https://api.sleeper.app/v1/players/nfl'
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

async function get(url, type = 'text') {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: type === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return type === 'json' ? res.json() : res.text()
}

function decodeEntities(s) {
  return (s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Numeric entities — feeds that double-encode (PFF ships &#8217; for an
    // apostrophe) would otherwise leave mojibake in the headline, and a
    // mangled headline breaks both dedupe and name matching.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')   // last, so &amp;#39; resolves in one pass
}

function stripTags(s) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].trim() : ''
}

function toIso(d) {
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

// Caps a derived timestamp at the current moment. Only for dates WE infer —
// a source's own timestamp is left exactly as published, even when it is
// ahead of the clock (ESPN's news API routinely runs ~45 minutes into the
// future; `relativeTime` already floors that at "1m ago").
function notFuture(iso) {
  if (!iso) return null
  const now = Date.now()
  return Date.parse(iso) > now ? new Date(now).toISOString() : iso
}

// Only keep real http(s) article URLs — the app renders these as
// "Read full article" links, so a malformed value must become null.
function cleanLink(u) {
  const s = typeof u === 'string' ? u.trim() : ''
  return /^https?:\/\//.test(s) ? s : null
}

// Dedupe key. Items arrive from several sources and, with accumulation, from
// several runs, so this has to be stable across both.
function keyOf(item) {
  return (item.headline ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function normalizeName(s) {
  return (s ?? '').toLowerCase().replace(/[.'’-]/g, '').replace(/\s+/g, ' ').trim()
}

function parseRss(xml, source) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  return blocks
    .map(b => ({
      headline: stripTags(decodeEntities(tag(b, 'title'))),
      story: stripTags(decodeEntities(tag(b, 'description'))).slice(0, MAX_STORY),
      published: toIso(stripTags(tag(b, 'pubDate'))),
      source,
      link: cleanLink(stripTags(decodeEntities(tag(b, 'link')))),
      athleteIds: [],
    }))
    .filter(i => i.headline)
}

// ESPN's news API tags articles with athlete ids — the strongest join we
// have, since Sleeper's player DB carries espn_id for every player.
async function espnApi() {
  const data = await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50', 'json')
  return (data?.articles ?? [])
    .map(a => ({
      headline: a.headline ?? '',
      story: stripTags(a.description ?? '').slice(0, MAX_STORY),
      published: toIso(a.published),
      source: 'ESPN',
      link: cleanLink(a.links?.web?.href),
      athleteIds: (a.categories ?? [])
        .filter(c => c.type === 'athlete' && c.athleteId != null)
        .map(c => Number(c.athleteId)),
    }))
    .filter(i => i.headline)
}

// RotoWire's news PAGE, not its RSS. The RSS caps at 5 items; this page
// carries 25 of the same player updates per pull, and every one is a real
// player note ("Josh Jacobs: Court Date Moved Up") rather than a column —
// which is exactly the shape the app matches on, since it name-matches the
// HEADLINE. Scraping markup is more fragile than an RSS contract, so it is
// wrapped in the same best-effort try/catch as every other source: if
// RotoWire restyles the page this yields nothing and the feed carries on.
async function rotowirePage() {
  const html = await get('https://www.rotowire.com/football/news.php')
  // Blocks open as `class="news-update"` or `class="news-update is-injured"`;
  // the `news-update__*` children must not split the list.
  return html
    .split(/<div class="news-update[ "]/)
    .slice(1)
    .map(block => {
      const pick = re => stripTags(decodeEntities((block.match(re) ?? [])[1] ?? ''))
      const player = pick(/class="news-update__player-link"[^>]*>([\s\S]*?)<\/a>/)
      const note = pick(/class="news-update__headline"[^>]*>([\s\S]*?)<\/a>/)
      const href = (block.match(/class="news-update__headline"[^>]*href="([^"]+)"/) ?? [])[1] ?? ''
      // The page gives a date only ("September 4, 2026"). Anchor it at local
      // midday so a page copy never lands on the wrong calendar day relative
      // to its RSS twin, then clamp to now: today's midday is in the future
      // for most of the UTC day, and a future timestamp sorts above real news
      // while still rendering as "1m ago". The page lists newest-first and
      // refreshes constantly, so "now" is a fair upper bound — and the newest
      // few carry exact times anyway, from the RSS copy they dedupe with.
      const day = pick(/class="news-update__timestamp"[^>]*>([\s\S]*?)<\/div>/)
      return {
        headline: player && note ? `${player}: ${note}` : '',
        story: pick(/class="news-update__news"[^>]*>([\s\S]*?)<\/div>/).slice(0, MAX_STORY),
        published: day ? notFuture(toIso(`${day} 12:00:00 GMT-0700`)) : null,
        source: 'RotoWire',
        link: cleanLink(href.startsWith('/') ? `https://www.rotowire.com${href}` : href),
        athleteIds: [],
      }
    })
    .filter(i => i.headline)
}

const rss = (source, url) => async () => parseRss(await get(url), source)

// Probed live 2026-09-04 (see docs/analysis/news-sources-2026-09.md). The
// percentage is the share of that source's items naming an active skill
// player — the reason each one is here, and the reason FantasyPros is not:
// both of its player-news endpoints return 404 and have been contributing
// nothing.
const SOURCES = [
  ['ESPN API',      espnApi],                                                                  // athlete ids
  ['RotoWire',      rss('RotoWire', 'https://www.rotowire.com/rss/news.php?sport=NFL')],       // 100%, 5/pull, exact times
  ['RotoWire page', rotowirePage],                                                             // 100%, 25/pull
  ['Yardbarker',    rss('Yardbarker', 'https://www.yardbarker.com/rss/sport/2')],              // 45%
  ['PFF',           rss('PFF', 'https://www.pff.com/feed')],                                   // 40%
  ['The Athletic',  rss('The Athletic', 'https://www.nytimes.com/athletic/rss/nfl/')],         // 33%, 100/pull
  ['ESPN RSS',      rss('ESPN', 'https://www.espn.com/espn/rss/nfl/news')],                    // 33%
  ['PFT',           rss('PFT', 'https://www.nbcsports.com/profootballtalk.rss')],              // 30%
  ['CBS',           rss('CBS', 'https://www.cbssports.com/rss/headlines/nfl/')],               // 28%
  ['Sporting News', rss('Sporting News', 'https://www.sportingnews.com/us/rss')],              // 20%
  ['Yahoo',         rss('Yahoo', 'https://sports.yahoo.com/nfl/rss/')],                        // 8% — general
]

// ---------------------------------------------------------------- fetch

const fetched = []
const sourceCounts = {}
for (const [name, fn] of SOURCES) {
  try {
    const items = await fn()
    console.log(`${name}: ${items.length} items`)
    sourceCounts[name] = items.length
    fetched.push(...items)
  } catch (err) {
    console.log(`${name}: FAILED — ${err.message}`)
    sourceCounts[name] = 0
  }
}

// ---------------------------------------------- player index (best-effort)

// Active skill players only, longest name first so a more specific name wins
// when one player's name is a substring of a longer one.
let nameIndex = []
let espnIds = new Set()
try {
  const db = await get(SLEEPER_PLAYERS, 'json')
  const actives = Object.values(db ?? {}).filter(
    p => p?.full_name && SKILL_POSITIONS.has(p.position) && p.team && p.active !== false,
  )
  nameIndex = actives
    .map(p => ({
      n: normalizeName(p.full_name),
      sleeperId: String(p.player_id),
      espnId: p.espn_id != null && !Number.isNaN(Number(p.espn_id)) ? Number(p.espn_id) : null,
    }))
    // Full names only — short fragments produce false headline hits, the same
    // rule the app's matchers use.
    .filter(x => x.n.length >= 6 && x.n.includes(' '))
    .sort((a, b) => b.n.length - a.n.length)
  espnIds = new Set(nameIndex.map(x => x.espnId).filter(id => id != null))
  console.log(`Player index: ${nameIndex.length} active skill players`)
} catch (err) {
  console.log(`Player index: FAILED — ${err.message} (ranking falls back to recency)`)
}

// Resolves an item to the players it is about and stamps the result on it.
//
// `playerIds` (Sleeper ids) is the field that matters. The app used to join
// news to players through ESPN athlete ids alone, and Sleeper's player DB
// carries NO espn_id for most of a dynasty roster — 17 of this league's 26
// owner-rostered spots have `espn_id: null` (Bo Nix, Brock Bowers, Rachaad
// White…), so those players could only ever be found by their name appearing
// in a headline. Resolving to Sleeper ids here removes that ceiling: the
// match is made once, server-side, against the whole headline AND story, and
// every client matcher reads the answer.
//
// `athleteIds` is still enriched (name match → that player's espn_id) so the
// feed keeps working for any consumer that predates `playerIds`.
function enrich(item) {
  const espn = new Set((item.athleteIds ?? []).map(Number).filter(n => !Number.isNaN(n)))
  const sleeper = new Set((item.playerIds ?? []).map(String))
  // An ESPN id we can resolve to an active skill player is what counts as
  // player news; ESPN tags coaches and retired players too.
  let named = sleeper.size > 0 || [...espn].some(id => espnIds.has(id))
  if (nameIndex.length) {
    const hay = normalizeName(`${item.headline} ${item.story ?? ''}`)
    for (const { n, sleeperId, espnId } of nameIndex) {
      if (!hay.includes(n)) continue
      named = true
      sleeper.add(sleeperId)
      if (espnId != null) espn.add(espnId)
      if (sleeper.size >= 8) break   // a roundup naming everyone is still one item
    }
  }
  return { ...item, athleteIds: [...espn], playerIds: [...sleeper], isPlayerNews: named }
}

// ------------------------------------------------------------- merge

// The previous published feed. Its items already carry `playerIds` and
// `isPlayerNews`, but we re-enrich everything so a fix to the index or the
// matcher applies to the whole retained window, not just today's pull.
let previous = []
try {
  if (existsSync(PREV_FILE)) {
    const prev = JSON.parse(readFileSync(PREV_FILE, 'utf8'))
    previous = Array.isArray(prev?.items) ? prev.items : []
  }
} catch (err) {
  console.log(`Previous feed: unreadable — ${err.message} (starting fresh)`)
}
console.log(`Previous feed: ${previous.length} items`)

// New copies win (fresher story/link/ids) but keep the earliest publish time
// we ever saw, so an item can't float back to the top of the feed by being
// re-listed with a newer date.
const merged = new Map()
for (const raw of [...previous, ...fetched]) {
  const item = enrich(raw)
  const key = keyOf(item)
  if (!key) continue
  const existing = merged.get(key)
  if (!existing) { merged.set(key, item); continue }
  // Later copies win on content (fresher story/link/ids) but the FIRST publish
  // time we ever recorded stands: retained items are seeded before this run's,
  // and within a run the sources are ordered most-precise-first, so an item
  // can neither float back to the top by being re-listed nor lose an exact
  // timestamp to a date-only reprint of itself.
  merged.set(key, { ...existing, ...item, published: existing.published ?? item.published })
}

// ------------------------------------------------- retain, rank, cap

const now = Date.now()
const ageOf = i => (i.published ? now - Date.parse(i.published) : Infinity)
const byRecency = (a, b) => new Date(b.published ?? 0) - new Date(a.published ?? 0)

const all = [...merged.values()]
// An item with no parseable date can't be aged out, so it rides in the
// general bucket where the tighter cap bounds it.
const players = all.filter(i => i.isPlayerNews && ageOf(i) <= PLAYER_MAX_AGE_MS).sort(byRecency)
const general = all.filter(i => !i.isPlayerNews && ageOf(i) <= GENERAL_MAX_AGE_MS).sort(byRecency)

const items = [...players.slice(0, PLAYER_MAX), ...general.slice(0, GENERAL_MAX)].sort(byRecency)

if (items.length === 0) {
  console.error('No items from any source and nothing retained — keeping previous feed')
  process.exit(1)
}

// Feed health, published so the app's data-status block can show it and so
// the next measurement of this pipeline has a baseline to compare against.
const times = items.map(i => Date.parse(i.published ?? '')).filter(t => !Number.isNaN(t))
const coverage = {
  total: items.length,
  playerItems: items.filter(i => i.isPlayerNews).length,
  withPlayerIds: items.filter(i => (i.playerIds ?? []).length > 0).length,
  withAthleteIds: items.filter(i => (i.athleteIds ?? []).length > 0).length,
  spanHours: times.length ? Math.round((Math.max(...times) - Math.min(...times)) / 36e5) : 0,
  sources: sourceCounts,
}

writeFileSync(OUT_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), coverage, items }))
console.log(
  `Wrote ${OUT_FILE}: ${items.length} items ` +
  `(${coverage.playerItems} player, ${coverage.withPlayerIds} resolved to players, ${coverage.spanHours}h span)`,
)
