// lineupAdvice.js — tool #6: "What do I start, and what's it costing me?"
//
// MCP_DISCOVERY.md §5: `lineupMoves.buildLineupMoves` — pure, five plain
// args, heavily tested. This tool feeds it and formats the result; it adds no
// lineup logic of its own, because the invariant that makes the engine
// trustworthy (per-move gains sum EXACTLY to the headline) only holds if
// nothing downstream re-derives a gain.
//
// ── IN-SEASON ONLY, AND IT SAYS SO ───────────────────────────────────────
//
// This is the one tool that is dead half the year. Sleeper publishes no
// projections in the offseason, so there is no start/sit question to answer —
// and the honest response is to say that, not to report a lineup of zeros.
// `mcp/weekly.js` returns `available: false` with a reason and this tool
// surfaces it, the same contract LineupOptimizer honours by hiding itself.
//
// ── THE TWO SILENT TRAPS, BOTH UPSTREAM IN weekly.js ─────────────────────
//
// Bye detection needs the NFL schedule, which is the ONE Sleeper endpoint not
// under /v1 (SLEEPER_ROOT) and whose fields are `home`/`away`, not
// `home_team`/`away_team`. Both mistakes fail SILENTLY as "no games", which
// reads as "every team is on bye" and would have this tool confidently
// benching a healthy starting lineup. weekly.js owns both, and an empty
// `playingTeams` means "byes unknown" — never "everyone is on bye".
//
// ── A MUST-FIX CARRIES NO CONFIDENCE, BY RULE ────────────────────────────
//
// The measured hit-rate curve (lineupConfidence.js, n=666,026) answers "how
// often does the higher-projected player actually outscore the lower?". A
// must-fix is a bye, an Out, or an empty slot: that player scores 0 BY RULE,
// not by projection, so there is no "higher-projected player" question to be
// 61% sure about. The engine sets `confidence: null` there and this tool
// passes the null through rather than borrowing the curve's authority for a
// question it never measured.

import { buildLineupMoves, lineupFromRoster } from '../../src/utils/lineupMoves.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { ROSTER_SLOTS } from '../../src/constants.js'
import { resolveTeam } from '../teams.js'

// Bounded output (§7). A dynasty lineup is 11 slots over ~24 active players,
// so these caps are well clear of anything real — they exist so a malformed
// upstream response cannot become a megabyte of tool output.
const MAX_MOVES = 20
const MAX_BENCH = 30

export function buildLineupAnswer(snapshot, weekly, { team, defaultRosterId, myRosterId } = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  const resolved = resolveTeam(league, team, defaultRosterId)
  if (resolved.error) {
    return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] }
  }
  const roster = resolved.roster

  // The in-season gate. Reported as a first-class condition rather than an
  // error: "there is no lineup question right now" is an answer.
  if (!weekly.available) {
    return {
      ok: false,
      unavailable: true,
      reason: weekly.isOffseason ? 'offseason' : 'projections-unavailable',
      error: weekly.isOffseason
        ? 'It is the offseason, so Sleeper publishes no weekly projections and there is no start/sit ' +
          'question to answer. This tool returns nothing rather than a lineup of zeros, which would ' +
          'read as "nobody is worth starting". Ask again once the regular season starts.'
        : `This week's projections did not load, so no lineup advice can be given. ` +
          'That is a missing input, not a verdict that your lineup is fine.',
      team: { rosterId: roster.rosterId, teamName: getTeamName(roster.owner) },
      asOf: snapshot.asOf,
      notes: weekly.notes,
    }
  }

  // Sleeper's actual starters, mapped onto ROSTER_SLOTS. `playerStatuses` is
  // the trimmed player DB — injury_status lives there — which is exactly what
  // the app passes.
  const lineup = lineupFromRoster(roster)
  const result = buildLineupMoves({
    players: roster.players,
    lineup,
    projMap: weekly.projMap,
    playerStatuses: snapshot.playerDB,
    playingTeams: weekly.playingTeams,
  })

  const moves = result.moves.slice(0, MAX_MOVES).map(m => ({
    action: m.in && m.out ? 'swap' : m.in ? 'fill' : 'bench',
    sit: m.out ? entryRow(m.out) : null,
    start: m.in ? entryRow(m.in) : null,
    gain: round1(m.gain),
    mustFix: m.mustFix,
    // ONE field, with the unit in its name. confidenceForGap returns a
    // PERCENTAGE (65.3), not a fraction — the app renders it directly as
    // `m.confidence.toFixed(0)%`. Carrying both a `confidence` and a
    // `confidencePct` invites exactly the ×100 error that shipped here first
    // and printed "6530% likely to be the right call".
    // null on a must-fix, by rule — see the header.
    confidencePct: m.confidence != null ? Math.round(m.confidence) : null,
    // False when the swap is a limb of a multi-player reshuffle rather than a
    // legal one-for-one. Saying so beats implying an illegal swap.
    directSwap: m.direct,
    meaningful: m.meaningful,
    reason: m.reason,
  }))

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: weekly.season,
      week: weekly.week,
      isOffseason: false,
    },
    team: {
      rosterId: roster.rosterId,
      teamName: getTeamName(roster.owner),
      isYou: myRosterId != null && roster.rosterId === myRosterId,
    },
    // The headline: what sitting pat costs. optimal − current, and the
    // per-move gains sum to exactly this.
    summary: {
      pointsLeftOnBench: round1(result.pointsLeft),
      currentProjected: round1(result.currentTotal),
      optimalProjected: round1(result.optimalTotal),
      mustFixCount: result.mustFixCount,
      upgradeCount: result.upgradeCount,
      // Sub-1-point swaps: 52/48 coin flips. Counted separately so they are
      // demoted rather than dropped — the headline includes their points, so
      // hiding them outright would leave points unexplained.
      coinFlipCount: result.coinFlipCount,
      emptySlots: result.emptySlots,
      isOptimal: result.moves.length === 0,
    },
    moves,
    lineup: result.slots.map(s => ({
      slot: s.slot?.label ?? ROSTER_SLOTS[s.idx]?.label ?? String(s.idx),
      eligible: s.slot?.eligible ?? null,
      player: s.entry ? entryRow(s.entry) : null,
      isOptimal: s.isOptimal,
    })),
    bench: result.bench.slice(0, MAX_BENCH).map(entryRow),
    notes: buildNotes({ snapshot, weekly, result, roster, moves }),
  }
}

// One player, as the engine sees him. `projected` is Sleeper's number;
// `effective` is what he actually contributes — 0 for anyone blocked,
// whatever Sleeper still carries for him.
function entryRow(e) {
  return {
    sleeperId: e.id,
    name: e.player?.name ?? null,
    position: e.player?.position ?? null,
    nflTeam: e.player?.team || null,
    projected: round1(e.projPts),
    effective: round1(e.effPts),
    blocked: !!e.availability?.blocked,
    status: e.availability?.status ?? null,
    statusLabel: e.availability?.label ?? null,
  }
}

function buildNotes({ snapshot, weekly, result, roster, moves }) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  ;(weekly.notes ?? []).forEach(n => notes.push(n))

  if (!snapshot.counts.playerDBEntries) {
    notes.push(
      'Sleeper\'s player DB did not load, so injury statuses are unknown — an Out or Questionable ' +
      'player will not be flagged. Bye detection is unaffected.'
    )
  }
  if (result.moves.length === 0) {
    notes.push('Your lineup is already optimal on this week\'s projections — there is nothing to change.')
  }
  if (result.mustFixCount) {
    notes.push(
      `${result.mustFixCount} must-fix move(s): a player on bye, Out, on IR, or an empty slot. ` +
      'These score 0 BY RULE, not by projection, so they carry no confidence percentage — there is no ' +
      'closer call to be uncertain about.'
    )
  }
  if (result.coinFlipCount) {
    notes.push(
      `${result.coinFlipCount} move(s) gain under a point. Residual weekly scoring noise is 5.6-7.3 points ` +
      'per player, so a sub-point edge is a 52/48 coin flip. They are listed (meaningful: false) rather than ' +
      'dropped, because the headline includes their points.'
    )
  }
  if (moves.some(m => !m.directSwap)) {
    notes.push(
      'At least one move is part of a multi-player reshuffle rather than a legal one-for-one swap — ' +
      'apply the whole set, not that pair alone.'
    )
  }
  if (result.moves.length > moves.length) {
    notes.push(`Move list truncated to ${moves.length} of ${result.moves.length}.`)
  }
  notes.push(
    'Confidence is the measured hit rate from 666,026 same-week FLEX-eligible pairs (2022-25): how often ' +
    'the higher-projected player actually outscores the lower, at that points gap.'
  )
  notes.push(
    `Sleeper's API is READ-ONLY: this cannot set ${roster.rosterId === undefined ? 'a' : 'your'} lineup. ` +
    'Make these changes yourself in the Sleeper app.'
  )
  return notes
}

const round1 = n => Math.round((n ?? 0) * 10) / 10

export function renderLineupText(a) {
  if (!a.ok) {
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.rosterId}. ${c.teamName} (@${c.username})`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(`${a.team.teamName}${a.team.isYou ? ' (you)' : ''} — week ${a.league.week} lineup`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')

  if (a.summary.isOptimal) {
    L.push(`LINEUP IS OPTIMAL — projecting ${a.summary.currentProjected}. No changes needed.`)
  } else {
    L.push(`${a.summary.pointsLeftOnBench} POINTS SITTING ON YOUR BENCH`)
    L.push(`  ${a.summary.currentProjected} now → ${a.summary.optimalProjected} optimal`)
    const bits = []
    if (a.summary.mustFixCount) bits.push(`${a.summary.mustFixCount} must fix`)
    if (a.summary.upgradeCount) bits.push(`${a.summary.upgradeCount} upgrade${a.summary.upgradeCount > 1 ? 's' : ''}`)
    if (a.summary.coinFlipCount) bits.push(`${a.summary.coinFlipCount} coin-flip${a.summary.coinFlipCount > 1 ? 's' : ''}`)
    if (bits.length) L.push(`  ${bits.join(' · ')}`)
  }
  L.push('')

  const real = a.moves.filter(m => m.meaningful)
  if (real.length) {
    L.push('MOVES')
    real.forEach(m => {
      const tag = m.mustFix ? 'MUST FIX' : 'UPGRADE'
      L.push(`  [${tag}] ${m.sit ? `SIT ${m.sit.name}` : 'FILL empty slot'}${m.start ? ` → START ${m.start.name} (${m.start.position})` : ''}`)
      L.push(`      ${m.gain >= 0 ? '+' : ''}${m.gain} pts · ${m.reason}`)
      // A must-fix deliberately shows no percentage.
      if (m.confidencePct != null) L.push(`      ${m.confidencePct}% likely to be the right call`)
      if (!m.directSwap) L.push('      part of a multi-player reshuffle, not a one-for-one swap')
    })
    L.push('')
  }
  const flips = a.moves.filter(m => !m.meaningful)
  if (flips.length) {
    L.push(`${flips.length} swap(s) with no meaningful edge (~52% — a coin flip)`)
    flips.forEach(m => L.push(`  ${m.sit?.name ?? 'empty'} → ${m.start?.name ?? 'nobody'} (+${m.gain})`))
    L.push('')
  }

  L.push('STARTING LINEUP')
  a.lineup.forEach(s => {
    if (!s.player) { L.push(`  ${String(s.slot).padEnd(5)} — EMPTY, tap to fill`); return }
    const p = s.player
    const flag = p.blocked ? ` [${p.statusLabel ?? p.status}]` : p.status === 'questionable' ? ` [${p.statusLabel}]` : ''
    L.push(`  ${String(s.slot).padEnd(5)} ${p.name} (${p.position}${p.nflTeam ? ` · ${p.nflTeam}` : ''}) — ${p.projected}${flag}${s.isOptimal ? ' ✓' : ''}`)
  })
  L.push('')
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
