#!/usr/bin/env node
// Fetches NFL player news from several free sources, merges + dedupes them,
// and writes news.json. Runs in GitHub Actions (.github/workflows/news.yml)
// where requests are server-side — no browser CORS restrictions. The app
// reads the published file from the news-data branch via
// raw.githubusercontent.com (which sends Access-Control-Allow-Origin: *).
//
// Every source is best-effort: a source that fails or changes shape is
// logged and skipped. The script only fails (exit 1, keeping the previous
// feed) when ALL sources return nothing.

import { writeFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const MAX_ITEMS = 100
const MAX_STORY = 600

async function get(url, type = 'text') {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: type === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return type === 'json' ? res.json() : res.text()
}

function decodeEntities(s) {
  return (s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
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

// Only keep real http(s) article URLs — the app renders these as
// "Read full article" links, so a malformed value must become null.
function cleanLink(u) {
  const s = typeof u === 'string' ? u.trim() : ''
  return /^https?:\/\//.test(s) ? s : null
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

const SOURCES = [
  ['ESPN API',    espnApi],
  ['FantasyPros', async () => parseRss(await get('https://www.fantasypros.com/nfl/rss/player-news.php'), 'FantasyPros')],
  ['Yahoo',       async () => parseRss(await get('https://sports.yahoo.com/nfl/rss.xml'), 'Yahoo')],
  ['ESPN RSS',    async () => parseRss(await get('https://www.espn.com/espn/rss/nfl/news'), 'ESPN')],
  ['CBS',         async () => parseRss(await get('https://www.cbssports.com/rss/headlines/nfl/'), 'CBS')],
]

const all = []
for (const [name, fn] of SOURCES) {
  try {
    const items = await fn()
    console.log(`${name}: ${items.length} items`)
    all.push(...items)
  } catch (err) {
    console.log(`${name}: FAILED — ${err.message}`)
  }
}

// Newest first, dedupe by normalized headline
const seen = new Set()
const items = all
  .sort((a, b) => new Date(b.published ?? 0) - new Date(a.published ?? 0))
  .filter(i => {
    const key = i.headline.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  .slice(0, MAX_ITEMS)

if (items.length === 0) {
  console.error('No items from any source — keeping previous feed')
  process.exit(1)
}

writeFileSync('news.json', JSON.stringify({ updatedAt: new Date().toISOString(), items }))
console.log(`Wrote news.json with ${items.length} items`)
