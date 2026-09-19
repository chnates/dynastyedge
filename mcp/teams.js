// teams.js — resolving a free-text team reference to exactly one roster.
//
// Extracted from tools/getRoster.js in phase 1b because analyze_trade needs
// the SAME discipline for its `partner` argument. Two copies of "which team
// did they mean?" is exactly the divergence prerequisite C existed to remove
// from src/ — a tool layer must not reintroduce it.
//
// It NEVER guesses between two plausible matches. MCP_DISCOVERY.md §1 sets
// that rule for resolve_assets ("makes grading the wrong player structurally
// impossible"); grading the wrong TEAM is the same class of error, and an
// ambiguous name returns the candidate list instead.

import { getTeamName } from '../src/utils/teamName.js'

// The manager's handle. Sleeper's `/league/{id}/users` returns
// **`display_name`, NOT `username`** — verified against the live league
// 2026-09-19, where all 10 users carry a display_name and none carries a
// username. Reading `username` alone (phase 1) meant the advertised
// "manager username" match path could never fire and every candidate list
// rendered a bare "@". Same fallback order getTeamName already uses.
const handleOf = user => user?.display_name || user?.username || ''

export function describeTeams(rosters) {
  return (rosters ?? []).map(r => ({
    roster: r,
    rosterId: r.rosterId,
    teamName: getTeamName(r.owner),
    username: handleOf(r.owner),
  }))
}

const asCandidate = d => ({ rosterId: d.rosterId, teamName: d.teamName, username: d.username })

// Returns { roster } on a unique match, or { error, candidates } otherwise.
export function resolveTeam(league, team, defaultRosterId) {
  const rosters = league.allRosters

  if (team == null || team === '') {
    const mine = rosters.find(r => r.rosterId === defaultRosterId)
    return mine
      ? { roster: mine }
      : { error: `No roster ${defaultRosterId} in this league. Name a team explicitly.` }
  }

  const raw = String(team).trim()

  // A bare integer is a roster id.
  if (/^\d+$/.test(raw)) {
    const byId = rosters.find(r => r.rosterId === Number(raw))
    return byId ? { roster: byId } : { error: `No roster with id ${raw} in this league.` }
  }

  const q = raw.toLowerCase()
  const described = describeTeams(rosters)

  const exact = described.filter(
    d => d.teamName.toLowerCase() === q || d.username.toLowerCase() === q
  )
  if (exact.length === 1) return { roster: exact[0].roster }

  const partial = described.filter(
    d => d.teamName.toLowerCase().includes(q) || d.username.toLowerCase().includes(q)
  )
  if (partial.length === 1) return { roster: partial[0].roster }
  if (partial.length > 1) {
    return {
      error: `"${raw}" matches ${partial.length} teams. Say which one.`,
      candidates: partial.map(asCandidate),
    }
  }
  return {
    error: `No team matching "${raw}".`,
    candidates: described.map(asCandidate),
  }
}
