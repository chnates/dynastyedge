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
