// getRoster.js — tool #1: "What's on my team?" / "Show me Jake's roster."
//
// MCP_DISCOVERY.md §5 puts this first because it proves the whole chain —
// fetch → buildLeagueState → an analysis util → a bounded, stamped answer.
// It is pure orchestration over src/utils, the shape TradeAnalyzer.jsx uses:
// no domain math lives here, and none should. If a number needs computing,
// it is computed in src/utils and the app shows the same number.

import { getWinWindowTier } from '../../src/utils/rosterAnalysis.js'
import { getTeamName } from '../../src/utils/teamName.js'
// Team resolution moved to mcp/teams.js in phase 1b so analyze_trade's
// `partner` argument resolves through the SAME code. Re-exported here because
// this module's existing tests (and its contract) name it.
import { resolveTeam } from '../teams.js'

export { resolveTeam }

// Bounded output is a hard requirement (§7): the player DB is 5–8MB and the
// FantasyCalc payload is large, so a tool must never hand back a raw payload.
// A dynasty roster is ~24 active + 5 taxi + 2 IR, so this cap is well clear of
// anything real — it exists so a malformed upstream response cannot become a
// megabyte of tool output.
const MAX_PLAYERS = 60
const MAX_PICKS = 40

// Where a player actually sits. Checked in this order because taxi and IR sit
// OUTSIDE the 24 active slots — a taxi player is not "bench depth", he is
// unavailable, and conflating them misstates the roster.
function slotOf(p) {
  if (p.isIR) return 'IR'
  if (p.isTaxi) return 'TAXI'
  if (p.isStarter) return 'STARTER'
  return 'BENCH'
}

const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, DEF: 4 }

// Build the answer. `snapshot` comes from mcp/snapshot.js and carries its own
// provenance, which is copied onto the response verbatim — every tool response
// says how old it is (§7).
export function buildRosterAnswer(snapshot, { team, defaultRosterId, myRosterId } = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  const resolved = resolveTeam(league, team, defaultRosterId)
  if (resolved.error) return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] }

  const roster = resolved.roster
  const { allRosters, userMap } = league

  const players = [...roster.players]
    .sort((a, b) =>
      (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) ||
      (b.value ?? 0) - (a.value ?? 0) ||
      a.name.localeCompare(b.name)
    )
    .slice(0, MAX_PLAYERS)
    .map(p => ({
      sleeperId: p.sleeperId,
      name: p.name,
      position: p.position,
      nflTeam: p.team || null,
      age: p.age ?? null,
      // Rule 7: an unranked player is KEPT and reported as unranked with a
      // null value — never a fabricated 0, and never dropped. `unranked` is
      // an explicit flag so the reader can tell "worth nothing" from
      // "not priced by FantasyCalc".
      value: p.unranked ? null : p.value,
      unranked: !!p.unranked,
      overallRank: p.overallRank ?? null,
      positionRank: p.positionRank ?? null,
      trend30Day: p.trend30Day ?? 0,
      slot: slotOf(p),
    }))

  const picks = [...roster.picks]
    .sort((a, b) => String(a.season).localeCompare(String(b.season)) || a.round - b.round)
    .slice(0, MAX_PICKS)
    .map(pk => ({
      season: String(pk.season),
      round: pk.round,
      // "1.09" once the draft order is known; null before that, when the pick
      // is priced at the round median instead (Feature 1).
      slotLabel: pk.slotLabel ?? null,
      label: pk.slotLabel ? `${pk.season} ${pk.slotLabel}` : `${pk.season} round ${pk.round}`,
      originalOwnerRosterId: pk.originalOwner,
      originalOwnerTeam: pk.originalOwner === roster.rosterId
        ? null
        : getTeamName(userMap[pk.originalOwner]),
      value: pk.value || null,
      pricing: pk.slotLabel ? 'exact-slot' : 'round-median',
    }))

  const playerValue = roster.players.reduce((s, p) => s + (p.value ?? 0), 0)
  const pickValue = roster.picks.reduce((s, p) => s + (p.value ?? 0), 0)
  const valueRank = [...allRosters]
    .sort((a, b) => b.totalValue - a.totalValue)
    .findIndex(r => r.rosterId === roster.rosterId) + 1

  const counts = players.reduce((acc, p) => {
    acc[p.slot] = (acc[p.slot] ?? 0) + 1
    return acc
  }, {})

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: snapshot.nflState?.season ?? null,
      week: snapshot.nflState?.week ?? null,
      isOffseason: snapshot.isOffseason,
      teams: allRosters.length,
    },
    team: {
      rosterId: roster.rosterId,
      teamName: getTeamName(roster.owner),
      username: roster.owner?.username ?? null,
      isYou: myRosterId != null && roster.rosterId === myRosterId,
    },
    record: roster.hasRecord
      ? { ...roster.record, pointsFor: round1(roster.pointsFor), pointsAgainst: round1(roster.pointsAgainst) }
      // Honest about the offseason rather than reporting 0-0 as a result.
      : null,
    faab: {
      budget: roster.faabBudget,
      remaining: roster.faabRemaining,
      spent: roster.faabSpent,
      display: `$${roster.faabRemaining}`,
    },
    winWindow: getWinWindowTier(roster.rosterId, allRosters),
    totals: {
      totalValue: roster.totalValue,
      playerValue,
      pickValue,
      valueRank,
      pickCapitalScore: roster.pickCapitalScore,
      avgStarterAge: roster.avgStarterAge != null ? round1(roster.avgStarterAge) : null,
      playerCount: roster.players.length,
      pickCount: roster.picks.length,
      unrankedCount: roster.players.filter(p => p.unranked).length,
      slotCounts: counts,
    },
    players,
    picks,
    // Caveats the reader needs in order to read the numbers correctly. These
    // are conditions, not decoration — each one changes what a number means.
    notes: buildNotes(snapshot, roster, players, picks),
  }
}

function buildNotes(snapshot, roster, players, picks) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push(
      'At least one source failed to refresh, so this is cached data — see asOf.sources for which and how old.'
    )
  }
  if (!snapshot.counts.playerDBEntries) {
    notes.push(
      'Sleeper\'s player DB did not load, so rostered players FantasyCalc does not rank are missing from this list rather than shown with no value.'
    )
  }
  const unranked = players.filter(p => p.unranked)
  if (unranked.length) {
    notes.push(
      `${unranked.length} rostered player(s) carry no FantasyCalc value (deep stashes, some rookies, and every defense — FantasyCalc ranks zero defenses). They are listed with value null and count 0 toward totals.`
    )
  }
  if (picks.length && picks.every(p => p.pricing === 'round-median')) {
    notes.push(
      'No draft order is set for the upcoming rookie draft yet, so picks are priced at the round median rather than their exact slot.'
    )
  }
  if (roster.players.length > players.length) {
    notes.push(`Player list truncated to ${players.length} of ${roster.players.length}.`)
  }
  return notes
}

const round1 = n => Math.round(n * 10) / 10

// A compact human-readable rendering. The model gets structuredContent; this
// is what a person reads in the transcript, so it leads with the as-of stamp.
export function renderRosterText(a) {
  if (!a.ok) {
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.rosterId}. ${c.teamName} (@${c.username})`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(`${a.team.teamName}${a.team.isYou ? ' (you)' : ''} — roster ${a.team.rosterId}`)
  L.push(`${a.league.name ?? 'League'} · ${a.league.teams} teams · ${a.league.season ?? '?'}${a.league.isOffseason ? ' offseason' : ` week ${a.league.week}`}`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')
  L.push(`Total value ${a.totals.totalValue.toLocaleString('en-US')} (#${a.totals.valueRank} of ${a.league.teams}) · players ${a.totals.playerValue.toLocaleString('en-US')} · picks ${a.totals.pickValue.toLocaleString('en-US')}`)
  L.push(`Win window: ${a.winWindow}${a.record ? ` · ${a.record.wins}-${a.record.losses}${a.record.ties ? '-' + a.record.ties : ''} · ${a.record.pointsFor} PF` : ' · no games played yet'}`)
  L.push(`FAAB ${a.faab.display} of $${a.faab.budget}${a.totals.avgStarterAge ? ` · avg starter age ${a.totals.avgStarterAge}` : ''}`)
  L.push('')
  for (const group of ['STARTER', 'BENCH', 'TAXI', 'IR']) {
    const rows = a.players.filter(p => p.slot === group)
    if (!rows.length) continue
    L.push(`${group} (${rows.length})`)
    rows.forEach(p => {
      const val = p.value == null ? '—' : p.value.toLocaleString('en-US')
      const rank = p.positionRank ? ` ${p.position}${p.positionRank}` : ''
      const tr = p.trend30Day > 50 ? ` ↑${p.trend30Day}` : p.trend30Day < -50 ? ` ↓${p.trend30Day}` : ''
      L.push(`  ${p.position.padEnd(3)} ${p.name}${p.nflTeam ? ` (${p.nflTeam})` : ''} — ${val}${rank}${tr}${p.unranked ? ' [unranked]' : ''}`)
    })
    L.push('')
  }
  if (a.picks.length) {
    L.push(`PICKS (${a.picks.length})`)
    a.picks.forEach(pk => {
      L.push(`  ${pk.label}${pk.originalOwnerTeam ? ` (via ${pk.originalOwnerTeam})` : ''} — ${pk.value == null ? '—' : pk.value.toLocaleString('en-US')}${pk.pricing === 'round-median' ? ' ≈' : ''}`)
    })
    L.push('')
  }
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
