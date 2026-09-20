// playerNews.js — tool #8: "What's the latest on my guys?"
//
// The eighth tool exists because of a concrete failure. Asked whether to start
// Brock Bowers, the server answered with the word "Doubtful" and advised
// checking Sleeper — while the player DB it already held said "Knee -
// Meniscus, Surgery" and the news feed it did not read carried a RotoWire item
// from four hours earlier headlined "Brock Bowers: Trending toward Week 3
// return". Every part of the answer was in the building.
//
// ── THE RESOLVER DISCIPLINE APPLIES HERE TOO ─────────────────────────────
//
// A free-text name is allowed, unlike `analyze_trade` — asking "what's the
// news on Bowers?" should not cost a round trip. But it is resolved through
// the SAME `buildResolveAnswer` that backs `resolve_assets`, so an ambiguous
// name returns candidates and refuses rather than picking the higher-valued of
// two. That is not theoretical: the live player DB holds two DJ Moores, a
// cornerback and the wide receiver on this roster, and attaching one man's
// injury report to the other is exactly the fluent, confident, wrong answer
// this server is built to avoid.
//
// ── CLASS B ──────────────────────────────────────────────────────────────
//
// The feed is published by GitHub Actions to a data branch, so a missing
// branch or a failed fetch is a normal state, not an error. This tool answers
// `ok: true` with `available: false` and says what is missing — an outage must
// never read as "there is no news about this player", which is a claim about
// the world rather than about our data.

import { getTeamName } from '../../src/utils/teamName.js'
import { resolveTeam } from '../teams.js'
import { buildResolveAnswer } from './resolveAssets.js'
import { newsForPlayer, newsNotes } from '../news.js'

export const MAX_NEWS_LIMIT = 30
const DEFAULT_LIMIT = 12
// Per player, when sweeping a whole roster: enough to see a developing story,
// small enough that 26 players stay inside the bounded-output rule.
const PER_PLAYER_ON_ROSTER = 2

export function buildNewsAnswer(snapshot, news, {
  player, team, limit = DEFAULT_LIMIT, defaultRosterId, myRosterId,
} = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  const cap = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_NEWS_LIMIT)
  const base = {
    ok: true,
    asOf: snapshot.asOf,
    available: !!news?.available,
    feed: news?.available
      ? { updatedAt: news.updatedAt, ageMinutes: news.ageMinutes, staleForKickoff: news.staleForKickoff }
      : null,
  }

  // ── One named player ────────────────────────────────────────────────────
  if (player) {
    const resolved = buildResolveAnswer(snapshot, { names: [player], includeFreeAgents: true })
    const first = resolved.results?.[0]
    if (!first?.match) {
      return {
        ...base,
        ok: false,
        error: first?.candidates?.length
          ? `"${player}" matches more than one player. Name which one you mean — this tool will not guess ` +
            'between two players and attach the wrong man\'s injury report.'
          : `No player matching "${player}" is in this league's universe.`,
        candidates: first?.candidates ?? [],
      }
    }
    const m = first.match
    if (m.kind === 'pick') {
      return { ...base, ok: false, error: 'Draft picks have no player news. Name a player instead.' }
    }
    const items = newsForPlayer(news, m.sleeperId, { limit: cap, playerDB: snapshot.playerDB })
    return {
      ...base,
      scope: 'player',
      player: playerRow(m, snapshot, myRosterId),
      items,
      notes: buildNotes({ news, items, scope: 'player', name: m.name }),
    }
  }

  // ── A whole roster ──────────────────────────────────────────────────────
  const resolvedTeam = resolveTeam(league, team, defaultRosterId)
  if (resolvedTeam.error) {
    return { ...base, ok: false, error: resolvedTeam.error, candidates: resolvedTeam.candidates ?? [] }
  }
  const roster = resolvedTeam.roster

  const rows = (roster.players ?? []).map(p => {
    const meta = snapshot.playerDB?.[String(p.sleeperId)] ?? null
    return {
      sleeperId: String(p.sleeperId),
      name: p.name ?? meta?.name ?? null,
      position: p.position ?? meta?.position ?? null,
      nflTeam: p.team || meta?.team || null,
      injuryStatus: meta?.injury_status ?? null,
      injuryBodyPart: meta?.injury_body_part ?? null,
      injuryNotes: meta?.injury_notes ?? null,
      items: newsForPlayer(news, p.sleeperId, { limit: PER_PLAYER_ON_ROSTER, playerDB: snapshot.playerDB }),
    }
  })

  // A hurt player leads, then whoever has the freshest item. Recency alone
  // would bury the one name the reader most needs under three transaction
  // blurbs about healthy starters.
  const withSomethingToSay = rows.filter(r => r.injuryStatus || r.items.length)
  withSomethingToSay.sort((a, b) => {
    const hurt = Number(!!b.injuryStatus) - Number(!!a.injuryStatus)
    if (hurt) return hurt
    return new Date(b.items[0]?.published ?? 0) - new Date(a.items[0]?.published ?? 0)
  })
  const players = withSomethingToSay.slice(0, cap)

  return {
    ...base,
    scope: 'roster',
    team: {
      rosterId: roster.rosterId,
      teamName: getTeamName(roster.owner),
      isYou: myRosterId != null && roster.rosterId === myRosterId,
    },
    players,
    counts: {
      rostered: (roster.players ?? []).length,
      withNewsOrInjury: withSomethingToSay.length,
      returned: players.length,
    },
    notes: buildNotes({
      news, scope: 'roster',
      truncated: withSomethingToSay.length > players.length
        ? `${players.length} of ${withSomethingToSay.length}` : null,
      silent: (roster.players ?? []).length - withSomethingToSay.length,
    }),
  }
}

// The resolver already reports ownership and honours rule 7, so this adds only
// the injury detail the news question actually turns on.
function playerRow(m, snapshot, myRosterId) {
  const meta = snapshot.playerDB?.[String(m.sleeperId)] ?? null
  return {
    sleeperId: String(m.sleeperId),
    name: m.name,
    position: m.position ?? meta?.position ?? null,
    nflTeam: m.nflTeam ?? meta?.team ?? null,
    // Rule 7: an unpriced player is findable and reported as having no value,
    // never as worth 0.
    value: m.value ?? null,
    unranked: !!m.unranked,
    injuryStatus: meta?.injury_status ?? null,
    injuryBodyPart: meta?.injury_body_part ?? null,
    injuryNotes: meta?.injury_notes ?? null,
    ownerRosterId: m.ownerRosterId ?? null,
    ownerTeam: m.ownerTeam ?? null,
    isYours: m.ownerRosterId != null && myRosterId != null && m.ownerRosterId === myRosterId,
  }
}

function buildNotes({ news, items, scope, name, truncated, silent }) {
  const notes = []
  const feedNotes = newsNotes(news)
  feedNotes.forEach(n => notes.push(n))

  if (news?.available && scope === 'player' && !items?.length) {
    notes.push(
      `The feed carries nothing about ${name} in its retained window (about a week of player news). ` +
      'That means no covered source has written about him recently — it is not a statement that he is ' +
      'healthy or that nothing has happened. His injury status above, if any, comes from Sleeper and is ' +
      'independent of the feed.'
    )
  }
  if (truncated) notes.push(`Showing ${truncated} players with news or an injury status.`)
  if (silent > 0) {
    notes.push(`${silent} rostered player(s) have no injury status and no recent items, so they are omitted.`)
  }
  if (news?.available) {
    notes.push(
      'ESPN and the aggregator tag a roundup with every player it mentions, so an item marked ' +
      '`multiPlayer` may mention this player rather than be about him.'
    )
  }
  return notes
}

export function renderNewsText(a) {
  if (!a.ok) {
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.name ?? c.teamName}${c.position ? ` (${c.position}${c.nflTeam ? ` · ${c.nflTeam}` : ''})` : ''}${c.ownerTeam ? ` — ${c.ownerTeam}` : ''}`).join('\n')
      : ''
    return `${a.error}${list}`
  }

  const L = []
  const stamp = a.feed
    ? `News feed published ${a.feed.ageMinutes}m ago${a.feed.staleForKickoff ? ' — MAY BE BEHIND A LIVE REPORT' : ''}`
    : 'News feed unavailable'
  L.push(stamp)
  L.push('')

  if (a.scope === 'player') {
    const p = a.player
    const inj = [p.injuryStatus, p.injuryBodyPart, p.injuryNotes].filter(Boolean).join(' · ')
    L.push(`${p.name} (${p.position ?? '?'}${p.nflTeam ? ` · ${p.nflTeam}` : ''})${p.isYours ? ' — YOURS' : p.ownerTeam ? ` — ${p.ownerTeam}` : ' — free agent'}`)
    if (inj) L.push(`  STATUS: ${inj}`)
    L.push('')
    if (!a.items.length) L.push('  No recent items in the feed.')
    a.items.forEach(n => {
      L.push(`  "${n.headline}" — ${n.source}${n.published ? `, ${n.published}` : ''}${n.multiPlayer ? ' [roundup]' : ''}`)
      if (n.story) L.push(`     ${n.story}`)
      if (n.link) L.push(`     ${n.link}`)
    })
  } else {
    L.push(`${a.team.teamName}${a.team.isYou ? ' (you)' : ''} — ${a.counts.withNewsOrInjury} of ${a.counts.rostered} players have news or a status`)
    L.push('')
    a.players.forEach(p => {
      const inj = [p.injuryStatus, p.injuryBodyPart, p.injuryNotes].filter(Boolean).join(' · ')
      L.push(`${p.name} (${p.position ?? '?'}${p.nflTeam ? ` · ${p.nflTeam}` : ''})${inj ? ` — ${inj}` : ''}`)
      p.items.forEach(n => {
        L.push(`   "${n.headline}" — ${n.source}${n.published ? `, ${n.published}` : ''}${n.multiPlayer ? ' [roundup]' : ''}`)
        if (n.story) L.push(`      ${n.story.slice(0, 220)}`)
      })
      L.push('')
    })
  }

  L.push('')
  ;(a.notes ?? []).forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
