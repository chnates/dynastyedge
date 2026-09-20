// tests/mcpNews.test.mjs — pins the news layer (mcp/news.js) and tool #8.
//
// Behaviors pinned (with their source):
//  - CLAUDE.md, player news pipeline: "`playerIds` is the join, not
//    `athleteIds`" — the feed resolves items to Sleeper ids server-side, and
//    every consumer reads that first.
//  - The architecture contract's Class B rule: an Actions-published feed may
//    never error, block an answer, or retry-loop. A miss means "we could not
//    read the feed", NEVER "this player has no news".
//  - MCP_DISCOVERY.md §1 / resolve_assets: an ambiguous name resolves to
//    NOTHING. The live player DB holds TWO "DJ Moore"s (4961 CB, 4983 WR), so
//    guessing attaches one man's injury report to another.
//  - CLAUDE.md non-negotiable 2: bounded output.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { newsForPlayer, newsForPlayers, newsNotes, NEWS_STALE_MINUTES } from '../mcp/news.js'
import { buildNewsAnswer, renderNewsText } from '../mcp/tools/playerNews.js'
import { makeSnapshot, LEAGUE, MINE, player } from './helpers/mcpFixtures.mjs'

const item = (o) => ({
  headline: o.headline ?? 'A headline',
  story: o.story ?? 'A story.',
  source: o.source ?? 'RotoWire',
  published: o.published ?? '2026-09-20T13:00:00.000Z',
  link: o.link ?? null,
  playerIds: o.playerIds ?? [],
  athleteIds: o.athleteIds ?? [],
  isPlayerNews: true,
})

const feed = (items, over = {}) => ({
  available: true, items, updatedAt: '2026-09-20T14:00:00.000Z',
  ageMinutes: 10, coverage: null, staleForKickoff: false, source: null, notes: [],
  ...over,
})

// ── MATCHING ──────────────────────────────────────────────────────────────

test('playerIds is the join — a resolved Sleeper id matches', () => {
  const f = feed([item({ playerIds: ['4983'], headline: 'DJ Moore: Viewed as day-to-day' })])
  const hits = newsForPlayer(f, '4983')
  assert.equal(hits.length, 1)
  assert.match(hits[0].headline, /day-to-day/)
})

test('athleteIds is the SECOND join, via the player DB espn_id', () => {
  const f = feed([item({ athleteIds: ['3915416'], playerIds: [] })])
  const playerDB = { 4983: { espn_id: 3915416 } }
  assert.equal(newsForPlayer(f, '4983', { playerDB }).length, 1,
    'espn_id is null for most of a dynasty roster, so it is a fallback — but it is a real one')
  assert.equal(newsForPlayer(f, '4983').length, 0,
    'without the player DB there is no espn_id to join on')
})

test('there is NO headline-name fallback — an id is required', () => {
  // The exact collision that makes this non-negotiable: two DJ Moores.
  const f = feed([item({ headline: 'DJ Moore: Viewed as day-to-day', playerIds: ['4961'] })])
  assert.equal(newsForPlayer(f, '4983').length, 0,
    'the cornerback\'s item must never attach to the wide receiver. The feed already ' +
    'name-matched server-side with the whole player DB in hand; a weaker second attempt ' +
    'here could only add the errors the first one avoided')
  assert.equal(newsForPlayer(f, '4961').length, 1)
})

test('items come back newest first and bounded', () => {
  const f = feed([
    item({ playerIds: ['1'], published: '2026-09-18T10:00:00.000Z', headline: 'old' }),
    item({ playerIds: ['1'], published: '2026-09-20T10:00:00.000Z', headline: 'new' }),
    item({ playerIds: ['1'], published: '2026-09-19T10:00:00.000Z', headline: 'mid' }),
  ])
  const hits = newsForPlayer(f, '1', { limit: 2 })
  assert.deepEqual(hits.map(h => h.headline), ['new', 'mid'])
})

test('a multi-player roundup is FLAGGED as one', () => {
  const f = feed([item({ playerIds: ['1', '2', '3'], headline: 'Week 2 inactives' })])
  const [hit] = newsForPlayer(f, '1')
  assert.equal(hit.multiPlayer, true,
    'a roundup is tagged with every player it mentions, so it can surface on a player ' +
    'its headline is not about — the reader has to be told which they are looking at')
  assert.equal(hit.playersNamed, 3)
  assert.equal(newsForPlayer(feed([item({ playerIds: ['1'] })]), '1')[0].multiPlayer, false)
})

test('newsForPlayers bounds both dimensions', () => {
  const items = []
  for (let i = 0; i < 20; i++) items.push(item({ playerIds: ['1'] }))
  const out = newsForPlayers(feed(items), ['1', '2'], { perPlayer: 2 })
  assert.equal(out['1'].length, 2)
  assert.equal(out['2'], undefined, 'a player with no items is omitted, not given an empty array')
})

// ── CLASS B ───────────────────────────────────────────────────────────────

test('an unavailable feed yields nothing and never throws', () => {
  const down = { available: false, items: [] }
  assert.deepEqual(newsForPlayer(down, '1'), [])
  assert.deepEqual(newsForPlayers(down, ['1', '2']), {})
  const notes = newsNotes(down)
  assert.ok(notes.some(n => /missing source, not evidence/.test(n)),
    'an outage must not read as "there is no news about this player" — that is a claim ' +
    'about the world, not about our data')
})

test('a feed older than the publish interval says so', () => {
  const stale = feed([], { ageMinutes: NEWS_STALE_MINUTES + 5, staleForKickoff: true })
  assert.ok(newsNotes(stale).some(n => /confirm a questionable status against a live source/.test(n)),
    'the feed publishes twice an hour, so near kickoff it can trail a wire report — a tool ' +
    'that knows its own blind spot is more useful than one silently behind')
  assert.equal(newsNotes(feed([])).length, 0, 'a fresh feed adds no warning')
})

// ── THE TOOL ──────────────────────────────────────────────────────────────

function snapWith(injury = {}) {
  const players = [
    player({ id: '4983', name: 'DJ Moore', pos: 'WR', starter: true, nfl: 'BUF' }),
    player({ id: '11604', name: 'Brock Bowers', pos: 'TE', nfl: 'LV' }),
  ]
  const roster = { ...MINE, players, starterOrder: ['4983'] }
  const league = { ...LEAGUE, myRoster: roster, allRosters: [roster, ...LEAGUE.allRosters.slice(1)] }
  return makeSnapshot({ league, playerDB: { ...injury } })
}

test('the tool refuses an ambiguous name rather than guessing', () => {
  const snap = snapWith()
  const a = buildNewsAnswer(snap, feed([]), { player: 'zzzznotaplayer', defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.ok, false)
  assert.match(a.error, /No player matching/)
})

test('injury DETAIL is what turns a label into an answer', () => {
  const snap = snapWith({
    11604: { name: 'Brock Bowers', position: 'TE', team: 'LV',
      injury_status: 'Doubtful', injury_body_part: 'Knee - Meniscus', injury_notes: 'Surgery' },
  })
  const f = feed([item({
    playerIds: ['11604'], source: 'RotoWire',
    headline: 'Brock Bowers: Trending toward Week 3 return',
  })])
  const a = buildNewsAnswer(snap, f, { player: 'Brock Bowers', defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.ok, true)
  assert.equal(a.player.injuryBodyPart, 'Knee - Meniscus')
  assert.equal(a.player.injuryNotes, 'Surgery')
  const text = renderNewsText(a)
  assert.match(text, /Doubtful · Knee - Meniscus · Surgery/,
    '"Doubtful" sends the reader to Sleeper; the body part and the note answer it here')
  assert.match(text, /Trending toward Week 3 return/)
})

test('no items for a player is stated as a gap in coverage, not as good health', () => {
  const snap = snapWith({ 11604: { name: 'Brock Bowers', position: 'TE', team: 'LV' } })
  const a = buildNewsAnswer(snap, feed([]), { player: 'Brock Bowers', defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.items.length, 0)
  assert.ok(a.notes.some(n => /not a statement that he is/.test(n)),
    'silence in a news feed is not evidence of health')
})

test('a roster sweep leads with the hurt players', () => {
  const snap = snapWith({
    11604: { name: 'Brock Bowers', position: 'TE', team: 'LV', injury_status: 'Doubtful' },
  })
  const f = feed([item({ playerIds: ['4983'], published: '2026-09-20T23:00:00.000Z' })])
  const a = buildNewsAnswer(snap, f, { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.scope, 'roster')
  assert.equal(a.players[0].sleeperId, '11604',
    'a hurt player outranks a newer item about a healthy one — recency alone buries the ' +
    'one name the reader most needs')
})

test('the feed being down still answers ok, with the status Sleeper knows', () => {
  const snap = snapWith({
    11604: { name: 'Brock Bowers', position: 'TE', team: 'LV', injury_status: 'Doubtful' },
  })
  const a = buildNewsAnswer(snap, { available: false, items: [] }, { defaultRosterId: 6, myRosterId: 6 })
  assert.equal(a.ok, true)
  assert.equal(a.available, false)
  assert.ok(a.players.some(p => p.injuryStatus === 'Doubtful'),
    'the injury status comes from Sleeper and is independent of the feed')
})
