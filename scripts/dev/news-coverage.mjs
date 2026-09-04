#!/usr/bin/env node
// Analysis-only: measures how much of a news feed is actually about MY players.
// This is the pre-registered acceptance test for the Phase 2 news work
// (docs/build-plan-2026-09.md §3): >= 12 of the owner's 25 rostered players
// mentioned in a fresh pull, versus a baseline of 3.
//
//   node scripts/dev/news-coverage.mjs                       # measure the LIVE published feed
//   node scripts/dev/news-coverage.mjs path/to/news.json     # measure a local file
//
// Matching mirrors the app exactly (useLeagueNews / usePlayerIntel /
// useNewsFeed): the feed's own resolved `playerIds` first, ESPN athlete id
// against Sleeper's espn_id second, normalized full name in the HEADLINE
// last. The headline-only number is what the app resolves; the
// "headline+story" number is the ceiling a perfect matcher would reach, and
// the gap between them is the value of the feed's server-side resolution.
// Nothing in src/ imports this.

import { readFileSync } from 'node:fs'

const LEAGUE_ID = '1313933520715907072'
const MY_ROSTER_ID = 6
const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

const arg = process.argv[2]
const NEWS_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json'

const normalizeName = s => (s ?? '').toLowerCase().replace(/[.'’-]/g, '').replace(/\s+/g, ' ').trim()

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

const feed = arg
  ? JSON.parse(readFileSync(arg, 'utf8'))
  : await getJson(NEWS_URL)
const items = feed.items ?? []

const [rosters, playerDB] = await Promise.all([
  getJson(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`),
  getJson('https://api.sleeper.app/v1/players/nfl'),
])

const mine = rosters.find(r => r.roster_id === MY_ROSTER_ID)
const myIds = [...new Set([...(mine.players ?? []), ...(mine.taxi ?? []), ...(mine.reserve ?? [])])].map(String)

// Every active skill player, longest name first so a more specific name wins.
const actives = Object.values(playerDB).filter(
  p => p.full_name && SKILL.has(p.position) && p.team && p.active !== false,
)
const nameIndex = actives
  .map(p => ({ n: normalizeName(p.full_name), p }))
  .filter(x => x.n.length >= 6 && x.n.includes(' '))
  .sort((a, b) => b.n.length - a.n.length)
const espnIndex = new Map()
actives.forEach(p => {
  const id = p.espn_id != null ? Number(p.espn_id) : null
  if (id != null && !Number.isNaN(id) && !espnIndex.has(id)) espnIndex.set(id, p)
})

const matchOne = (item, haystack) => {
  for (const id of item.athleteIds ?? []) {
    const hit = espnIndex.get(Number(id))
    if (hit) return hit
  }
  const h = normalizeName(haystack)
  const hit = nameIndex.find(({ n }) => h.includes(n))
  return hit ? hit.p : null
}

let namesSkillHeadline = 0
let withAthleteIds = 0
let withPlayerIds = 0
const bySource = new Map()
const mentionedHeadline = new Set()
const mentionedStory = new Set()

// Which of MY players appear — headline-only (what the app matches on) and
// headline+story (what a reader of the article sheet would see).
const myByEspn = new Map()
const myByName = []
myIds.forEach(id => {
  const p = playerDB[id]
  if (!p?.full_name) return
  const e = p.espn_id != null ? Number(p.espn_id) : null
  if (e != null && !Number.isNaN(e)) myByEspn.set(e, id)
  const n = normalizeName(p.full_name)
  if (n.length >= 6 && n.includes(' ')) myByName.push({ n, id })
})

const mySet = new Set(myIds)
items.forEach(item => {
  const src = item.source ?? '?'
  bySource.set(src, (bySource.get(src) ?? 0) + 1)
  if ((item.athleteIds ?? []).length) withAthleteIds++
  if ((item.playerIds ?? []).length) withPlayerIds++
  if (matchOne(item, item.headline)) namesSkillHeadline++

  const headline = normalizeName(item.headline ?? '')
  const both = normalizeName(`${item.headline ?? ''} ${item.story ?? ''}`)
  // What the app resolves: feed playerIds, then espn ids, then headline names.
  for (const id of item.playerIds ?? []) {
    if (mySet.has(String(id))) { mentionedHeadline.add(String(id)); mentionedStory.add(String(id)) }
  }
  for (const id of item.athleteIds ?? []) {
    const hit = myByEspn.get(Number(id))
    if (hit) { mentionedHeadline.add(hit); mentionedStory.add(hit) }
  }
  myByName.forEach(({ n, id }) => {
    if (headline.includes(n)) mentionedHeadline.add(id)
    if (both.includes(n)) mentionedStory.add(id)
  })
})

const times = items.map(i => new Date(i.published ?? 0).getTime()).filter(t => t > 0)
const spanHrs = times.length ? (Math.max(...times) - Math.min(...times)) / 36e5 : 0

const name = id => playerDB[id]?.full_name ?? id
console.log(`\nFeed: ${arg ?? NEWS_URL}`)
console.log(`updatedAt: ${feed.updatedAt ?? '—'}`)
console.log(`\nitems:                 ${items.length}`)
console.log(`span:                  ${spanHrs.toFixed(1)}h`)
console.log(`carry athleteIds:      ${withAthleteIds} (${((withAthleteIds / (items.length || 1)) * 100).toFixed(0)}%)`)
console.log(`resolved to playerIds: ${withPlayerIds} (${((withPlayerIds / (items.length || 1)) * 100).toFixed(0)}%)`)
console.log(`name a skill player:   ${namesSkillHeadline} (${((namesSkillHeadline / (items.length || 1)) * 100).toFixed(0)}%) — headline match, app rules`)
console.log('\nby source:')
;[...bySource].sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`  ${String(s).padEnd(16)} ${n}`))

console.log(`\n=== ACCEPTANCE TEST (target >= 12 of ${myIds.length}) ===`)
console.log(`resolved by the app:            ${mentionedHeadline.size} / ${myIds.length}   <- the acceptance number`)
console.log(`ceiling (headline+story match): ${mentionedStory.size} / ${myIds.length}`)
console.log(`\ncovered: ${[...mentionedHeadline].map(name).sort().join(', ') || '(none)'}`)
console.log(`uncovered: ${myIds.filter(id => !mentionedHeadline.has(id)).map(name).sort().join(', ')}`)
console.log(mentionedHeadline.size >= 12 ? '\nRESULT: PASS' : '\nRESULT: MISS')
