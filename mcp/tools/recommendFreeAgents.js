// recommendFreeAgents.js — tool #3: "Who should I pick up and why?"
//
// MCP_DISCOVERY.md §5: `recommendations.recommendFreeAgents` over
// prerequisite C's `buildFreeAgentPool`, carrying dynasty value AND this
// week's Sleeper projection.
//
// ── THE STANDING RULE: A DEFENSE IS NEVER A GENERAL PICKUP ─────────────────
//
// You roster exactly one defense, ever (CLAUDE.md League Context, owner
// doctrine 2026-09-04), and a defense carries no dynasty value at all —
// FantasyCalc ranks zero of them. A list that mixes fourteen of them into the
// pool reads as "pick up some defenses", which is advice this app must never
// give.
//
// Prerequisite C made that structural: `buildFreeAgentPool` CANNOT return a
// defense, and getting one requires calling `buildAvailableDefenses` by name.
// This tool therefore calls only the former, and does not route around it —
// there is no `position: 'DEF'` escape hatch here, and asking for one gets an
// explanation instead of a list. That is the rule holding, not a limitation.
//
// ── TWO AXES, AND THE SECOND ONE IS IN-SEASON ONLY ────────────────────────
//
// Dynasty value and this week's projection correlate at only r = 0.427, and
// three of the current dynasty top ten project 0.0 points (rookies who will
// not play). So the projection is carried beside the value, never folded into
// it — `recommendFreeAgents` scores in dynasty value alone, and the
// projection decorates.
//
// In the OFFSEASON there are no projections, and this tool SAYS so rather
// than reporting zeros. A 0.0 beside every name would read as "nobody is
// worth starting", which is a different and false claim.

import {
  buildFreeAgentPool,
  buildRosteredIdSet,
  buildAvailableDefenses,
} from '../../src/utils/freeAgents.js'
import { recommendFreeAgents } from '../../src/utils/recommendations.js'
import { getProjPts } from '../../src/utils/projections.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { POSITIONS } from '../../src/constants.js'

// Bounded output (§7). The free-agent pool is the whole FantasyCalc universe
// minus ~295 rostered players — several thousand entries. This is a
// recommendation, not a database export.
export const DEFAULT_LIMIT = 8
export const MAX_LIMIT = 25

// What a projection is actually worth knowing, measured among waiver-tier
// players: a 0-2 projection means a 0.9% chance of a 15+ point game, 6-8 means
// 10.6% (docs/analysis/optimizer-data-sources-2026-09.md R2). Stated so the
// model does not over-read a two-point difference.
const PROJECTION_CAVEAT =
  'Among waiver-tier players a 0-2 point projection means roughly a 0.9% chance of a 15+ point game, ' +
  'and 6-8 means 10.6% — so treat the projection as a coarse tier, not a precise forecast.'

export function buildFreeAgentAnswer(snapshot, weekly, { position, limit, myRosterId } = {}) {
  const { league, values } = snapshot
  if (!league) throw new Error('League state unavailable')

  if (!league.myRoster) {
    return {
      ok: false,
      error: `No roster ${myRosterId} in this league, so there is no roster to recommend FOR. ` +
             'Pass a leagueId whose rosters include yours, or set DYNASTYEDGE_ROSTER_ID.',
      candidates: league.allRosters.map(r => ({
        rosterId: r.rosterId, teamName: getTeamName(r.owner), username: r.owner?.username ?? '',
      })),
    }
  }

  const wanted = position ? String(position).toUpperCase() : null

  // The standing rule, enforced at the door. DEF is deliberately NOT a valid
  // filter here: it is not a general pickup, and the honest answer names the
  // one question actually worth asking about a defense.
  if (wanted === 'DEF') {
    return {
      ok: false,
      error:
        'A defense is never a general pickup in this league. You roster exactly one, ever — there is one DEF ' +
        'slot, only one can start in any week, and a defense carries no dynasty value (FantasyCalc ranks zero ' +
        'of them), so a second is a wasted bench spot. The only question worth asking is whether to REPLACE ' +
        'the one you have, and the measured answer is almost always no: streaming defenses on Sleeper\'s ' +
        'projection was worth -0.00 points per week over 408 team-weeks (2023-25). Ask for lineup advice if ' +
        'your defense is on bye or your DEF slot is empty — that is the case that actually costs points.',
      incumbentDefense: describeIncumbentDefense(league, weekly),
    }
  }
  if (wanted && !POSITIONS.includes(wanted)) {
    return {
      ok: false,
      error: `"${position}" is not a position this tool ranks. Use one of ${POSITIONS.join(', ')}, or omit it for all.`,
    }
  }

  const cap = clampLimit(limit)

  // Prerequisite C's single definition of "who is available". It cannot return
  // a defense by construction; see the header.
  const rosteredIds = buildRosteredIdSet(league.allRosters)
  const pool = buildFreeAgentPool({ fcPlayerMap: values.playerMap, allRosters: league.allRosters, rosteredIds })
  const filtered = wanted ? pool.filter(p => p.position === wanted) : pool

  // The app's own engine, unchanged. It scores in DYNASTY VALUE and returns
  // only players that genuinely move the roster — a need, an upgrade over my
  // depth, or a real riser. "Available value" is not a recommendation.
  const ranked = recommendFreeAgents(filtered, league.myRoster, league.allRosters, { limit: cap })

  const inSeason = weekly?.available && !weekly.isOffseason
  const projMap = inSeason ? weekly.projMap : null

  const recommendations = ranked.map(r => ({
    sleeperId: String(r.player.sleeperId),
    name: r.player.name,
    position: r.player.position,
    nflTeam: r.player.team || null,
    age: r.player.age ?? null,
    value: r.player.value ?? null,
    overallRank: r.player.overallRank ?? null,
    positionRank: r.player.positionRank ?? null,
    trend30Day: r.trend ?? 0,
    // In-season only. NULL in the offseason, never 0 — the two mean opposite
    // things and a model cannot tell them apart from a number alone.
    projectedPoints: projMap ? round2(getProjPts(r.player.sleeperId, projMap)) : null,
    fillsNeed: r.isNeed,
    isUpgrade: r.isUpgrade,
    upgradeMargin: r.isUpgrade ? Math.round(r.upgradeMargin) : null,
    reasons: r.reasons,
  }))

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: snapshot.nflState?.season ?? null,
      week: inSeason ? weekly.week : null,
      isOffseason: snapshot.isOffseason,
      teams: league.allRosters.length,
    },
    team: {
      rosterId: league.myRoster.rosterId,
      teamName: getTeamName(league.myRoster.owner),
      faabRemaining: league.myRoster.faabRemaining,
      faabBudget: league.myRoster.faabBudget,
      faabDisplay: `$${league.myRoster.faabRemaining}`,
    },
    filter: { position: wanted, limit: cap },
    projections: {
      // Explicit, so "why is projectedPoints null?" is answerable from the
      // response itself rather than by guessing.
      available: !!projMap,
      week: projMap ? weekly.week : null,
      reason: projMap
        ? null
        : snapshot.isOffseason
          ? 'offseason — Sleeper publishes no weekly projections'
          : 'this week\'s projections did not load',
    },
    counts: {
      poolSize: filtered.length,
      returned: recommendations.length,
      // The true count beside the capped one (§7).
      recommendedTotal: recommendFreeAgents(filtered, league.myRoster, league.allRosters, { limit: Infinity }).length,
    },
    recommendations,
    notes: buildNotes({ snapshot, weekly, projMap, recommendations, wanted, filtered, cap, league }),
  }
}

// A defense is not a pickup, but "should I replace the one I have?" is a real
// question, so the refusal above carries the incumbent rather than just saying
// no. `buildAvailableDefenses` is called BY NAME here — the only way to reach
// a defense, exactly as prerequisite C intends.
function describeIncumbentDefense(league, weekly) {
  const mine = league.myRoster.players.find(p => p.position === 'DEF') ?? null
  const projMap = weekly?.available ? weekly.projMap : null
  const available = weekly
    ? buildAvailableDefenses({ playerDB: league.playerDB, allRosters: league.allRosters }).length
    : null
  return {
    rostered: mine
      ? {
        sleeperId: String(mine.sleeperId),
        name: mine.name,
        nflTeam: mine.team || null,
        // A defense is never FantasyCalc-ranked; null is the honest value.
        value: null,
        projectedPoints: projMap ? round2(getProjPts(mine.sleeperId, projMap)) : null,
      }
      : null,
    note: mine
      ? 'This is the defense you roster. Replacing it is only worth doing if it is on bye or you have none.'
      : 'You have NO defense rostered — that is the one case worth acting on, and it costs you points every week it lasts.',
    availableCount: available,
  }
}

function clampLimit(limit) {
  const n = Number(limit)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

function buildNotes({ snapshot, weekly, projMap, recommendations, wanted, filtered, cap, league }) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  ;(weekly?.notes ?? []).forEach(n => notes.push(n))

  if (projMap) {
    notes.push(PROJECTION_CAVEAT)
    notes.push(
      'Dynasty value and this week\'s projection are two different axes — they correlate at only r = 0.427, ' +
      'and a high-value rookie who will not play projects 0.0. The ranking is by DYNASTY value; the projection is context.'
    )
  }
  if (!recommendations.length) {
    notes.push(
      filtered.length
        ? `None of the ${filtered.length} available ${wanted ?? ''} players would fill a need, beat your depth, or is trending up. ` +
          'That is the answer — there is nothing on the wire worth adding, not a failure to find anything.'
        : `No available players${wanted ? ` at ${wanted}` : ''} carry a FantasyCalc value.`
    )
  }
  notes.push(
    'Defenses are excluded by design: you roster exactly one, ever, and a defense carries no dynasty value. ' +
    'They are reachable only as a lineup question, never as a general pickup.'
  )
  if (recommendations.length === cap) {
    notes.push(`Showing the top ${cap}; raise \`limit\` (max ${MAX_LIMIT}) for more.`)
  }
  notes.push(
    `Sleeper's API is read-only: place the claim yourself in the Sleeper app. You have $${league.myRoster.faabRemaining} of ` +
    `$${league.myRoster.faabBudget} FAAB left.`
  )
  return notes
}

const round2 = n => Math.round((n ?? 0) * 100) / 100
const num = n => (n == null ? '—' : n.toLocaleString('en-US'))

export function renderFreeAgentText(a) {
  if (!a.ok) {
    if (a.incumbentDefense) {
      const d = a.incumbentDefense
      const r = d.rostered
      return [
        a.error, '',
        r
          ? `Your defense: ${r.name}${r.nflTeam ? ` (${r.nflTeam})` : ''}${r.projectedPoints != null ? ` — projects ${r.projectedPoints} this week` : ''}`
          : 'You have no defense rostered.',
        d.note,
      ].join('\n')
    }
    return a.error
  }
  const L = []
  L.push(`${a.team.teamName} — free agent recommendations${a.filter.position ? ` · ${a.filter.position}` : ''}`)
  L.push(`${a.league.name ?? 'League'}${a.league.week ? ` · week ${a.league.week}` : a.league.isOffseason ? ' · offseason' : ''} · FAAB ${a.team.faabDisplay} of $${a.team.faabBudget}`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')
  if (!a.recommendations.length) {
    L.push('Nothing on the wire is worth adding right now.')
  } else {
    L.push(`${a.recommendations.length} of ${a.counts.recommendedTotal} worth adding (from ${a.counts.poolSize} available)`)
    L.push('')
    a.recommendations.forEach((p, i) => {
      const proj = p.projectedPoints != null ? ` · proj ${p.projectedPoints}` : ''
      const tr = p.trend30Day > 50 ? ` ↑${p.trend30Day}` : p.trend30Day < -50 ? ` ↓${p.trend30Day}` : ''
      L.push(`${String(i + 1).padStart(2)}. ${p.position.padEnd(3)} ${p.name}${p.nflTeam ? ` (${p.nflTeam})` : ''} — ${num(p.value)}${proj}${tr}`)
      p.reasons.forEach(r => L.push(`      ${r}`))
    })
  }
  L.push('')
  if (!a.projections.available) {
    L.push(`No weekly projection column: ${a.projections.reason}.`)
  }
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
