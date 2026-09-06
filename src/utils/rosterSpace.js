// rosterSpace.js — how many active roster spots a trade consumes or frees.
//
// With 9 of 10 teams at or over the 24-man active cap (measured 2026-09-06,
// right after the rookie draft), roster space is a binding constraint on almost
// every trade in this league — and a real negotiating lever: a team carrying
// more players than it has slots WANTS a 2-for-1.
//
// It is deliberately NOT a legality check. Being over the cap immediately after
// a draft is a normal, expected state — teams are simply owed drops before the
// season starts — so this reports headroom and who owes drops, and never calls
// a trade illegal.
//
// Limits come from the league's own `roster_positions` (11 starters + 13 BN in
// this league), never a constant: CLAUDE.md's prose said 12 bench and was wrong.

// Sleeper lists only the starting slots and BN in `roster_positions`; taxi and
// IR are separate settings and sit outside the active roster.
export function getRosterLimits(leagueInfo) {
  const positions = leagueInfo?.roster_positions ?? []
  const activeSlots = positions.filter(p => p !== 'TAXI' && p !== 'IR').length
  if (!activeSlots) return null
  return {
    activeSlots,
    taxiSlots: leagueInfo?.settings?.taxi_slots ?? 0,
    irSlots: leagueInfo?.settings?.reserve_slots ?? 0,
  }
}

// Taxi and IR players don't occupy an active slot, so a departure from either
// frees nothing — and a trade can never place an incoming player there, so every
// arrival costs one. Picks aren't players and are ignored by the caller.
export function buildRosterSpace(roster, { arrivals = [], departures = [], limits } = {}) {
  if (!roster?.players || !limits?.activeSlots) return null

  const active = roster.players.filter(p => !p.isTaxi && !p.isIR)
  const before = active.length

  const activeIds = new Set(active.map(p => String(p.sleeperId)))
  const leavingActive = departures.filter(d => activeIds.has(String(d.sleeperId))).length

  const after = before - leavingActive + arrivals.length
  const cap = limits.activeSlots

  return {
    cap,
    before,
    after,
    net: after - before,
    headroomAfter: cap - after,
    overBefore: Math.max(0, before - cap),
    overAfter: Math.max(0, after - cap),
    // Owed drops shrink — the trade helps them get compliant. This is the
    // pitch lever, and it points the opposite way from "you're giving up value".
    relievesCrunch: before > cap && after < before,
  }
}
