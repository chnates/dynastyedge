// freeAgents.js — who is actually available, resolved honestly.
//
// The Optimizer's waiver drawer used to build its list from the weekly
// projections payload and then gate every row on FantasyCalc. FantasyCalc
// ranks ZERO defenses (473 entries: RB/WR/QB/TE/PICK — verified 2026-09-04),
// so the DEF slot's list rendered 0 rows against 14 available defenses, while
// the Optimizer marked that same slot "Tap to fill". A shipped defect, not a
// missing feature.
//
// Rule 7 already had the answer: resolve unranked players from the shared
// player DB and show `—` for value. This is that, made pure and testable.
//
// TRAP — the stats payload's `TEAM_*` keys: `/stats/nfl/regular/{y}/{w}`
// carries BOTH `ARI` (the team defense, a real fantasy asset scoring ≈ −4…20)
// and `TEAM_ARI` (team OFFENSE totals, ≈110–120 pts). Both are non-numeric, so
// any `!isNumeric(id)` test meaning "this is a defense" sweeps in a 110-point
// row. The projections payload carries none today, but this filter is explicit
// so the next surface that iterates a Sleeper payload inherits the guard.

export function isTeamTotalsKey(id) {
  return String(id).startsWith('TEAM_')
}

// One row per available player at the slot's eligible positions, ranked by this
// week's Sleeper projection.
//
//   projMap      Sleeper /projections/nfl/regular/{y}/{w}
//   rosteredIds  Set of sleeperIds owned by any team in the league
//   fcPlayerMap  cached FantasyCalc map (may be empty — never a gate)
//   playerDB     the shared trimmed /players/nfl cache (name/position/team)
//   eligible     positions the slot accepts, e.g. ['RB','WR','TE'] or ['DEF']
export function buildWaiverOptions({
  projMap, rosteredIds, fcPlayerMap = {}, playerDB = {}, eligible = [], limit = 25,
}) {
  if (!projMap) return []
  const owned = rosteredIds ?? new Set()

  return Object.entries(projMap)
    .filter(([id]) => !owned.has(id) && !isTeamTotalsKey(id))
    .map(([id, proj]) => {
      const fc = fcPlayerMap?.[id]
      const db = playerDB?.[id]
      const name = fc?.name ?? db?.name ?? null
      const position = fc?.position ?? db?.position ?? null
      if (!name || !position) return null
      return {
        sleeperId: id,
        projPts: proj?.pts_half_ppr ?? 0,
        name,
        position,
        team: fc?.team ?? db?.team ?? '',
        // Unranked (every defense, plus deep stashes) shows `—`, never 0.
        value: fc?.value ?? null,
      }
    })
    .filter(fa => fa && eligible.includes(fa.position))
    .sort((a, b) => b.projPts - a.projPts)
    .slice(0, limit)
}

// ───────────────────────────────────────────────────────────────────────────
// The DYNASTY free-agent pool — a different question from buildWaiverOptions
// above. That one asks "who can fill this lineup slot this week?" and ranks by
// Sleeper projection. This one asks "who is available as an asset?" and is what
// `recommendFreeAgents` scores, in dynasty value.
//
// It existed twice — once in FreeAgentsView.jsx and once in edgeBriefing.js —
// with no shared definition, so League › Free Agents and The Edge's pickup item
// were one edit away from disagreeing about who is even available. This is the
// single definition; the MCP server must not become a third copy.
//
// THE STANDING RULE TRAVELS WITH IT: a defense is never offered as a general
// pickup. You roster exactly one, ever (CLAUDE.md League Context), FantasyCalc
// ranks zero of them so they carry no dynasty value to rank on, and a list that
// mixes 14 defenses into the pool reads as "pick up some defenses" — advice
// this app must never give. That is enforced here by construction rather than
// by each caller remembering: the general pool cannot return a DEF, and getting
// one requires calling buildAvailableDefenses by name.

// The positions that carry a dynasty value. Deliberately NOT `POSITIONS` from
// constants — that is the app's general position list, and this is the narrower
// "has a FantasyCalc price" set. They coincide today; conflating them is how a
// defense gets into a value-ranked list the day DEF is added to one of them.
export const VALUED_POSITIONS = ['QB', 'RB', 'WR', 'TE']

// Every rostered sleeperId in the league, normalized to strings (rule 8).
export function buildRosteredIdSet(allRosters) {
  const owned = new Set()
  ;(allRosters ?? []).forEach(r =>
    (r.players ?? []).forEach(p => owned.add(String(p.sleeperId)))
  )
  return owned
}

// Available, dynasty-valued players — the pool `recommendFreeAgents` scores.
//
//   fcPlayerMap  the cached FantasyCalc playerMap (string-keyed)
//   allRosters   the league's resolved rosters; pass `rosteredIds` instead when
//                the caller already built the set
export function buildFreeAgentPool({ fcPlayerMap, allRosters, rosteredIds } = {}) {
  if (!fcPlayerMap) return []
  const owned = rosteredIds ?? buildRosteredIdSet(allRosters)
  return Object.values(fcPlayerMap).filter(p =>
    !owned.has(String(p.sleeperId)) &&
    VALUED_POSITIONS.includes(p.position) &&
    (p.value ?? 0) > 0
  )
}

// Available defenses, resolved from the shared player DB — FantasyCalc ranks
// none, so they carry no dynasty value and show `—` (rule 7). Kept a separate
// call, never merged into the pool above: see the standing rule.
export function buildAvailableDefenses({ playerDB, allRosters, rosteredIds } = {}) {
  if (!playerDB) return []
  const owned = rosteredIds ?? buildRosteredIdSet(allRosters)
  return Object.entries(playerDB)
    .filter(([id, p]) => p.position === 'DEF' && p.team && !owned.has(String(id)))
    .map(([id, p]) => ({
      sleeperId: String(id),
      name: p.name,
      position: 'DEF',
      team: p.team,
      value: null,
      age: null,
      overallRank: null,
      trend30Day: 0,
    }))
}
