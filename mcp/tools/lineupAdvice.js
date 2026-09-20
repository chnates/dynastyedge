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
// ── A LOCKED SLOT IS NOT A DECISION ──────────────────────────────────────
//
// Sleeper seals a player's slot the moment his NFL game kicks off. Until this
// tool read the schedule's `status` field it did not know that, and on a
// Sunday morning it told the owner: "SIT DJ Moore -> START TreVeyon Henderson,
// +8.5, must fix". Moore's game had finished on Thursday. He could not be
// benched, he had not scored 0 (he had banked -0.1 before leaving injured),
// and the 8.5 points were in a headline that claimed they were sitting on the
// bench waiting to be collected. Three false statements from one missing
// field, delivered with the authority of a solved optimisation.
//
// So the question narrows to "what is the best lineup you can still REACH",
// locked starters hold their slots at their real scores, and locked bench
// players leave the pool. See src/utils/lineupMoves.js for the mechanics.
//
// ── NEWS RIDES ALONG, BECAUSE THE SECOND QUESTION IS ALWAYS "WHY?" ───────
//
// A row reading `Doubtful` makes a reader go and look something up, which is
// the failure this tool exists to remove. Every flagged player now carries his
// injury detail from the player DB and his latest beat items from the news
// feed, so "should I start Bowers?" is answered in the same response. Both are
// Class B: if either is missing the block is simply absent.
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
import { newsForPlayers, newsNotes } from '../news.js'

// Bounded output (§7). A dynasty lineup is 11 slots over ~24 active players,
// so these caps are well clear of anything real — they exist so a malformed
// upstream response cannot become a megabyte of tool output.
const MAX_MOVES = 20
const MAX_BENCH = 30

export function buildLineupAnswer(snapshot, weekly, { team, defaultRosterId, myRosterId, live, news } = {}) {
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
  // Live scores are per-roster, so one fetch answers for whichever team was
  // asked about — not only the configured one.
  const actualPoints = live?.available ? (live.pointsByRoster?.[roster.rosterId] ?? null) : null
  const result = buildLineupMoves({
    players: roster.players,
    lineup,
    projMap: weekly.projMap,
    playerStatuses: snapshot.playerDB,
    playingTeams: weekly.playingTeams,
    lockedTeams: weekly.lockedTeams,
    actualPoints,
  })

  // Who is worth attaching news to: anyone the advice flagged. A healthy
  // starter needs no beat report, and attaching one to all 24 would blow the
  // bounded-output rule for no gain.
  const flagged = [
    ...result.slots.map(s => s.entry).filter(e => e && (e.availability?.blocked || e.availability?.status === 'questionable')),
    ...result.bench.filter(e => e.availability?.status === 'questionable' || e.availability?.blocked),
  ]
  const flaggedIds = [...new Set(flagged.map(e => e.id))]
  const newsByPlayer = newsForPlayers(news, flaggedIds, { perPlayer: 2, maxPlayers: 8, playerDB: snapshot.playerDB })

  const entryRow = makeEntryRow(snapshot.playerDB, weekly.gameStatus)

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
      // ── The settled half of the lineup ────────────────────────────────
      // `currentProjected` stops being one kind of number the moment a game
      // kicks off: part of it is banked and part is still forecast. Splitting
      // them out is what lets a reader see that "69.3" on a Sunday afternoon
      // is 2.0 already scored plus 67.3 still to play, rather than a
      // collapsing projection.
      lockedSlots: result.lockedStarters,
      pointsBanked: result.lockedPoints,
      lockedOnBench: result.lockedBench,
    },
    moves,
    lineup: result.slots.map(s => ({
      slot: s.slot?.label ?? ROSTER_SLOTS[s.idx]?.label ?? String(s.idx),
      eligible: s.slot?.eligible ?? null,
      player: s.entry ? entryRow(s.entry) : null,
      isOptimal: s.isOptimal,
    })),
    bench: result.bench.slice(0, MAX_BENCH).map(entryRow),
    // Latest beat reporting for every flagged player, keyed by Sleeper id.
    // Absent entirely when the feed did not load (Class B) — never an error,
    // and never an empty object pretending to be "no news".
    news: news?.available ? { updatedAt: news.updatedAt, ageMinutes: news.ageMinutes, byPlayer: newsByPlayer } : null,
    notes: buildNotes({ snapshot, weekly, result, roster, moves, live, news }),
  }
}

// One player, as the engine sees him. `projected` is Sleeper's number;
// `effective` is what he actually contributes — 0 for anyone blocked,
// whatever Sleeper still carries for him.
function makeEntryRow(playerDB, gameStatus) {
  return function entryRow(e) {
    const meta = playerDB?.[String(e.id)] ?? null
    const locked = !!e.locked
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
      // ── The lock ──────────────────────────────────────────────────────
      // `locked` is the one field that decides whether anything below is
      // actionable. `actualPoints` is non-null only when his game has started
      // AND the live score arrived, so "he scored 3.2" stays distinguishable
      // from "his game is under way and we could not read the score".
      locked,
      gameState: locked ? (gameStatus?.[e.player?.team] ?? 'started') : null,
      actualPoints: e.actualPts != null ? round1(e.actualPts) : null,
      // ── Why he is flagged ─────────────────────────────────────────────
      // A bare "Doubtful" sends the reader to Sleeper; the body part and the
      // note are what answer the question in place.
      injuryBodyPart: meta?.injury_body_part ?? null,
      injuryNotes: meta?.injury_notes ?? null,
    }
  }
}

function buildNotes({ snapshot, weekly, result, roster, moves, live, news }) {
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
  // ── The lock notes ────────────────────────────────────────────────────
  // Stated FIRST when they apply, because they change what every number below
  // means: they are the difference between "you are leaving points on the
  // bench" and "there are no points left to move".
  if (result.lockedStarters) {
    notes.push(
      `${result.lockedStarters} of your starting slots ${result.lockedStarters === 1 ? 'is' : 'are'} LOCKED — ` +
      'those games have kicked off, so Sleeper will not let you change them whatever the projection or ' +
      `injury status now says. They have banked ${result.lockedPoints} points so far, and that is a result, ` +
      'not a forecast. No move is offered for them because no move is possible.'
    )
  }
  if (result.lockedBench) {
    notes.push(
      `${result.lockedBench} bench player(s) are also locked and cannot be started this week — their games ` +
      'have already begun.'
    )
  }
  if (result.lockedWithoutScore) {
    notes.push(
      `${result.lockedWithoutScore} locked player(s) have no live score available, so they are still shown ` +
      'at their projection. Which slots are locked is unaffected — that comes from the NFL schedule, not ' +
      'from the box score.'
    )
  }
  ;(live?.notes ?? []).forEach(n => notes.push(n))

  if (result.moves.length === 0) {
    notes.push(
      result.lockedStarters
        ? 'There is nothing left to change: every move still available to you is already the best one.'
        : 'Your lineup is already optimal on this week\'s projections — there is nothing to change.'
    )
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
  newsNotes(news).forEach(n => notes.push(n))
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

  if (a.summary.lockedSlots) {
    L.push(
      `${a.summary.lockedSlots} of 11 slots LOCKED (games under way or finished) — ` +
      `${a.summary.pointsBanked} pts already banked. Those slots cannot be changed.`
    )
    L.push('')
  }

  if (a.summary.isOptimal) {
    L.push(
      a.summary.lockedSlots
        ? `NOTHING LEFT TO CHANGE — ${a.summary.currentProjected} total. Every slot you can still move is already optimal.`
        : `LINEUP IS OPTIMAL — projecting ${a.summary.currentProjected}. No changes needed.`
    )
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
    // A locked slot prints what he SCORED, and says so — printing a
    // projection for a game that has finished is the original bug in
    // miniature.
    const lock = p.locked
      ? (p.actualPoints != null
        ? ` — LOCKED, scored ${p.actualPoints}`
        : ' — LOCKED (game started; live score unavailable)')
      : ''
    const shown = p.locked && p.actualPoints != null ? p.actualPoints : p.projected
    L.push(`  ${String(s.slot).padEnd(5)} ${p.name} (${p.position}${p.nflTeam ? ` · ${p.nflTeam}` : ''}) — ${shown}${flag}${lock}${p.locked ? '' : (s.isOptimal ? ' ✓' : '')}`)
  })
  L.push('')

  // Why the flagged players are flagged, so the reader never has to go and
  // look it up — which is the whole reason this block exists.
  const flaggedRows = [...a.lineup.map(s => s.player).filter(Boolean), ...a.bench]
    .filter(p => p.status === 'questionable' || p.blocked)
  const newsByPlayer = a.news?.byPlayer ?? {}
  const detail = flaggedRows.filter(p => p.injuryBodyPart || p.injuryNotes || newsByPlayer[p.sleeperId]?.length)
  if (detail.length) {
    L.push(`STATUS DETAIL${a.news?.ageMinutes != null ? ` (news published ${a.news.ageMinutes}m ago)` : ''}`)
    detail.forEach(p => {
      const bits = [p.statusLabel ?? p.status, p.injuryBodyPart, p.injuryNotes].filter(Boolean)
      L.push(`  ${p.name} — ${bits.join(' · ')}`)
      ;(newsByPlayer[p.sleeperId] ?? []).forEach(n => {
        L.push(`      "${n.headline}" (${n.source}${n.published ? `, ${n.published}` : ''})${n.multiPlayer ? ' [roundup — mentions several players]' : ''}`)
        if (n.story) L.push(`         ${n.story.slice(0, 220)}`)
      })
    })
    L.push('')
  }

  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
