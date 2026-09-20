// playoffOdds.js — tool #7: "Am I making the playoffs, and should I be buying
// or selling?"
//
// Mirrors src/components/league/PlayoffOdds.jsx and the hook behind it. Zero
// domain math here: the model, the 10,000-iteration simulation and the
// buyer/seller call all come out of src/utils/playoffOdds.js, which is where
// the app gets them — so the phone and the server cannot report different
// odds for the same league.
//
// The composition itself (`buildPlayoffOutlook`) was lifted out of
// `usePlayoffOdds` for this tool, with equivalence proved rather than
// inspected: the pre-extraction memo body run beside the new function,
// deepStrictEqual across preseason / active / complete / partially-played /
// no-schedule at two field sizes each.
//
// ── THREE STATES, AND ONLY ONE OF THEM HAS ODDS ───────────────────────────
//
// preseason — no games played AND no schedule posted. There is nothing to
//   simulate, so `odds` is NULL and a strength-ranked PREVIEW is returned in
//   its place, labelled as a preview. It is the same discipline lineup_advice
//   keeps about the offseason: a fabricated 50% would read as a real
//   measurement, and "there is nothing to know yet" is the true answer.
// active — games remain. The real thing.
// complete — every week played. Deterministic 100%/0%, stated as such.
//
// A fourth condition is NOT one of the three and is the one worth guarding:
// if every matchup week fails to load, fourteen empty weeks look exactly like
// a preseason. `getSeasonWeeks` refuses to report that as one; this tool
// passes the refusal through as ok:false / reason 'unavailable'.
//
// ── BOUNDED OUTPUT ────────────────────────────────────────────────────────
//
// `seedDist` (one probability per seed, per team — 100 numbers in a 10-team
// league) is deliberately NOT returned. avgSeed and topSeedPct carry what a
// reader actually asks, and the notes say the distribution was dropped rather
// than letting its absence read as "the model does not compute it".

import { getDeadlineVerdict, buildPlayoffOutlook } from '../../src/utils/playoffOdds.js'
import { getWinWindowTier } from '../../src/utils/rosterAnalysis.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { resolveTeam } from '../teams.js'

export const MAX_TEAMS = 32

const pct = n => (n == null ? null : Math.round(n * 1000) / 10)

export function buildOddsAnswer(snapshot, season, { team, defaultRosterId, myRosterId } = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  const resolved = resolveTeam(league, team, defaultRosterId)
  if (resolved.error) {
    return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] }
  }
  const roster = resolved.roster

  // The total-outage case — NOT a preseason. See the header.
  if (!season?.available) {
    return {
      ok: false,
      unavailable: true,
      reason: season?.reason ?? 'unavailable',
      asOf: snapshot.asOf,
      notes: season?.notes ?? ['The regular-season schedule could not be loaded.'],
    }
  }

  const outlook = buildPlayoffOutlook({
    allRosters: league.allRosters,
    perWeek: season.perWeek,
    playoffTeams: season.playoffTeams,
    firstPlayoffWeek: season.firstPlayoffWeek,
  })
  if (!outlook) throw new Error('Playoff outlook unavailable — roster data missing')

  const myTier = getWinWindowTier(roster.rosterId, league.allRosters)
  const mine = outlook.oddsByRoster[roster.rosterId] ?? null
  // The ONE definition of buyer/seller in this app — the Playoffs page, Trade
  // Partner Finder, The Edge and analyze_trade's Layer 3 all call it, so this
  // tool can never disagree with a trade grade about your own stance.
  const verdict = getDeadlineVerdict(mine ? mine.playoffPct : null, myTier)

  const ranked = (outlook.results ?? [])
    .slice()
    .sort((a, b) => b.playoffPct - a.playoffPct)
  const teams = ranked.slice(0, MAX_TEAMS).map(r => {
    const rr = league.allRosters.find(x => x.rosterId === r.rosterId)
    return {
      rosterId: r.rosterId,
      teamName: rr ? getTeamName(rr.owner) : `Roster ${r.rosterId}`,
      isYou: r.rosterId === myRosterId,
      playoffPct: pct(r.playoffPct),
      topSeedPct: pct(r.topSeedPct),
      avgSeed: Math.round(r.avgSeed * 10) / 10,
      projWins: Math.round(r.projWins * 10) / 10,
      projLosses: Math.round(r.projLosses * 10) / 10,
      remainingGames: r.remGames,
      winWindow: getWinWindowTier(r.rosterId, league.allRosters),
      record: rr?.record
        ? { wins: rr.record.wins ?? 0, losses: rr.record.losses ?? 0, ties: rr.record.ties ?? 0 }
        : null,
    }
  })

  const preview = (outlook.strengthPreview ?? []).slice(0, MAX_TEAMS).map(p => ({
    rosterId: p.rosterId,
    teamName: getTeamName(p.owner),
    isYou: p.rosterId === myRosterId,
    projSeed: p.projSeed,
    projectedIn: p.projectedIn,
  }))

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: snapshot.nflState?.season ?? null,
      playoffTeams: outlook.playoffTeams,
      firstPlayoffWeek: outlook.firstPlayoffWeek,
      teamCount: league.allRosters.length,
    },
    status: outlook.status,
    basis: {
      completedWeeks: outlook.completedWeeks,
      remainingWeeks: outlook.remainingWeeks,
      remainingGames: outlook.remainingGames,
      iterations: outlook.status === 'preseason' ? 0 : 10000,
    },
    you: {
      rosterId: roster.rosterId,
      teamName: getTeamName(roster.owner),
      winWindow: myTier,
      // NULL in the preseason, never a fabricated percentage.
      playoffPct: mine ? pct(mine.playoffPct) : null,
      topSeedPct: mine ? pct(mine.topSeedPct) : null,
      avgSeed: mine ? Math.round(mine.avgSeed * 10) / 10 : null,
      projWins: mine ? Math.round(mine.projWins * 10) / 10 : null,
      projLosses: mine ? Math.round(mine.projLosses * 10) / 10 : null,
      stance: verdict.stance,
      stanceText: verdict.text,
    },
    teams,
    // Present ONLY in the preseason, and it is a preview, not odds.
    strengthPreview: outlook.status === 'preseason' ? preview : null,
    notes: buildNotes({ snapshot, season, outlook, teamCount: league.allRosters.length }),
  }
}

function buildNotes({ snapshot, season, outlook, teamCount }) {
  const notes = [...(season.notes ?? [])]
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  if (outlook.status === 'preseason') {
    notes.push(
      'No games have been played and no schedule has posted, so there is nothing to simulate: ' +
      'playoffPct is NULL rather than a made-up number. What is returned instead is a projected ' +
      'seeding ranked purely by roster strength — a PREVIEW, not odds.'
    )
  } else {
    notes.push(
      `Based on ${outlook.completedWeeks} completed week(s) and ${outlook.remainingGames} remaining game(s), ` +
      'simulated 10,000 times with a fixed seed — so these numbers are stable across calls on the same data, ' +
      'not re-rolled each time you ask.'
    )
    notes.push(
      'Each team\'s weekly score is drawn from a normal distribution whose mean is a shrinkage blend ' +
      '(4-game pseudo-count) of its roster-strength prior and its actual scores so far. Early in the season ' +
      'the roster prior dominates; it gives way to real results as games accumulate.'
    )
  }
  if (outlook.status === 'complete') {
    notes.push('The regular season is complete, so these are outcomes rather than odds — 100% or 0%.')
  }
  notes.push(
    `This league seats ${outlook.playoffTeams} of ${teamCount}, so ` +
    `${Math.round(outlook.playoffTeams / teamCount * 100)}% is the coin-flip baseline, not 50%. ` +
    'The Buyer (>=70%) and Seller (<35%) thresholds separate the top and bottom of the league cleanly ' +
    'and compress the middle — read a bubble team\'s number against that baseline, not against 50.'
  )
  notes.push(
    'The full per-seed distribution is computed but not returned, to keep the response bounded; ' +
    'avgSeed and topSeedPct summarise it.'
  )
  return notes
}

const n1 = n => (n == null ? '—' : n.toFixed(1))

export function renderOddsText(a) {
  if (!a.ok) {
    if (a.unavailable) return (a.notes ?? []).join('\n')
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.rosterId}. ${c.teamName} (@${c.username})`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(`PLAYOFF ODDS — ${a.league.name ?? a.league.leagueId} (${a.league.season ?? '?'})`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')

  if (a.status === 'preseason') {
    L.push(`${a.you.teamName} — no odds yet (${a.you.stance}: ${a.you.stanceText})`)
    L.push('')
    L.push(`PROJECTED SEEDING BY ROSTER STRENGTH — a preview, not odds (top ${a.league.playoffTeams} make it)`)
    ;(a.strengthPreview ?? []).forEach(p => {
      L.push(`  ${String(p.projSeed).padStart(2)}. ${p.teamName}${p.isYou ? ' (you)' : ''}${p.projectedIn ? '' : '  — outside'}`)
    })
  } else {
    L.push(`${a.you.teamName} — ${n1(a.you.playoffPct)}% to make the playoffs`)
    L.push(`  Projected ${n1(a.you.projWins)}-${n1(a.you.projLosses)}, average seed ${n1(a.you.avgSeed)}, #1 seed ${n1(a.you.topSeedPct)}%`)
    L.push(`  ${a.you.stance} — ${a.you.stanceText}`)
    L.push('')
    L.push(`Based on ${a.basis.completedWeeks} completed week(s) + ${a.basis.remainingGames} remaining game(s)`)
    L.push('')
    L.push(`THE FIELD (top ${a.league.playoffTeams} of ${a.league.teamCount} make it)`)
    a.teams.forEach((t, i) => {
      L.push(
        `  ${String(i + 1).padStart(2)}. ${t.teamName}${t.isYou ? ' (you)' : ''}` +
        `  ${String(n1(t.playoffPct)).padStart(5)}%` +
        `  proj ${n1(t.projWins)}-${n1(t.projLosses)}  seed ${n1(t.avgSeed)}  ${t.winWindow}`
      )
    })
  }
  L.push('')
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
