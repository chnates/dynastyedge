// leagueResults.js — who won, from Sleeper's playoff bracket.
//
// "Who won our league in 2023?" was the one question MCP_DISCOVERY.md §5
// recorded as unanswerable: past seasons' records and points-for were always
// fetched, but the champion lives only in `/league/{id}/winners_bracket`, an
// endpoint nothing here had called. This is the pure reader for it, in
// src/utils so the app can reach it the day it wants a champions list.
//
// ── THE BRACKET'S SHAPE, PROBED LIVE 2026-09-22 (not remembered) ──────────
//
// An array of matchups:
//   { m, r, t1, t2, w, l, p?, t1_from?, t2_from? }
//   m  matchup id          r  round (1..)
//   t1 / t2  roster ids    w / l  winner / loser roster id, null until played
//   p  PLACEMENT the match decides — present only on placement games:
//      p: 1 is the championship (w = champion, l = runner-up),
//      p: 3 the third-place game, p: 5 the fifth-place game.
//
// Probed on this league's three complete seasons: the p:1 winner is 3 (2023),
// 1 (2024) and 1 (2025), and each league's own
// `metadata.latest_league_winner_roster_id` says the same — so the bracket is
// read, and the metadata is kept only as a cross-check. The CURRENT season's
// bracket already exists in September, with every `w`/`l` null: that is
// "in progress", never "nobody won".
//
// Roster ids are SEASON-scoped. The stable identity across seasons is the
// roster's `owner_id`, so every placement carries it — which is how a title
// won under an old team name is credited to the manager who still holds it.

import { getTeamName } from './teamName'

const PLACES = [
  { p: 1, win: 'champion', lose: 'runnerUp' },
  { p: 3, win: 'third', lose: 'fourth' },
  { p: 5, win: 'fifth', lose: 'sixth' },
]

// { champion, runnerUp, third, fourth, fifth, sixth } as roster ids (null when
// that game is unplayed or absent), plus whether the title game is decided.
export function readBracketPlacements(bracket) {
  const out = { champion: null, runnerUp: null, third: null, fourth: null, fifth: null, sixth: null }
  if (!Array.isArray(bracket) || bracket.length === 0) return { ...out, decided: false, hasBracket: false }
  for (const { p, win, lose } of PLACES) {
    const game = bracket.find(g => Number(g?.p) === p)
    if (game && game.w != null) {
      out[win] = Number(game.w)
      out[lose] = game.l != null ? Number(game.l) : null
    }
  }
  return { ...out, decided: out.champion != null, hasBracket: true }
}

// One season's result, joined to that season's rosters and users.
//
//   season      '2023'
//   bracket     the winners_bracket payload (null/[] when unavailable)
//   rosters     that season's /rosters payload
//   users       that season's /users payload (may be [] — names then fall
//               back to `nameForOwner`, e.g. the manager's CURRENT team name)
//   metadataWinner  leagueInfo.metadata.latest_league_winner_roster_id
export function buildSeasonResult({ season, bracket, rosters = [], users = [], metadataWinner = null, nameForOwner = null }) {
  const placements = readBracketPlacements(bracket)
  const userById = new Map((users ?? []).map(u => [u.user_id, u]))
  const rosterById = new Map((rosters ?? []).map(r => [Number(r.roster_id), r]))

  // The house team-name rule, applied only when the season's user is known —
  // an unknown user falls through to the caller's fallback, not to
  // getTeamName's generic placeholder.
  const teamName = user => (user ? getTeamName(user) : null)
  const describe = rosterId => {
    if (rosterId == null) return null
    const r = rosterById.get(rosterId)
    const ownerId = r?.owner_id ?? null
    const seasonName = teamName(userById.get(ownerId))
    return {
      rosterId,
      ownerId,
      // The name that season, when we have it; otherwise the caller's
      // fallback (the owner's name today); otherwise a stable placeholder.
      teamName: seasonName ?? (ownerId && nameForOwner ? nameForOwner(ownerId) : null) ?? `Roster ${rosterId}`,
    }
  }

  const standings = (rosters ?? [])
    .map(r => {
      const s = r.settings ?? {}
      return {
        ...describe(Number(r.roster_id)),
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        ties: s.ties ?? 0,
        pointsFor: Math.round(((s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100) * 100) / 100,
      }
    })
    // Sleeper's default tiebreak, the same one the playoff simulation seeds by.
    .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
    .map((row, i) => ({ ...row, regularSeasonRank: i + 1 }))

  const meta = metadataWinner != null && metadataWinner !== '' ? Number(metadataWinner) : null
  return {
    season: String(season),
    status: !placements.hasBracket ? 'no-bracket' : placements.decided ? 'complete' : 'in-progress',
    champion: describe(placements.champion),
    runnerUp: describe(placements.runnerUp),
    third: describe(placements.third),
    fourth: describe(placements.fourth),
    fifth: describe(placements.fifth),
    sixth: describe(placements.sixth),
    // Present only when the metadata names a winner; false is worth a note,
    // because it means Sleeper's two records of the same fact disagree.
    metadataAgrees: meta != null && placements.decided ? meta === placements.champion : null,
    standings,
  }
}

// Titles per owner across a set of season results (newest first in, any order
// out). Owner-keyed, because a roster id means nothing outside its season.
export function countTitles(results) {
  const byOwner = new Map()
  for (const r of results ?? []) {
    const c = r?.champion
    if (!c?.ownerId) continue
    const row = byOwner.get(c.ownerId) ?? { ownerId: c.ownerId, titles: 0, seasons: [] }
    row.titles += 1
    row.seasons.push(r.season)
    byOwner.set(c.ownerId, row)
  }
  return [...byOwner.values()].sort((a, b) => b.titles - a.titles || a.seasons[0].localeCompare(b.seasons[0]))
}
