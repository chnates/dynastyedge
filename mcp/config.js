// config.js — what league, and whose team.
//
// MCP_DISCOVERY.md §1: "League / identity scope — parameterized from day one."
// src/constants.js hardcodes this league and this owner because the app is
// one person's phone. A server must not: every tool takes a league and a
// roster, and these are only the DEFAULTS when a call omits them.
//
// Defaults come from the environment first, the constants second — so pointing
// the server at another league is an env var, not a code edit.

import { LEAGUE_ID, MY_ROSTER_ID } from '../src/constants.js'
import { DEFAULT_WEEKLY_TTL_MS } from './weekly.js'

export function loadConfig(env = process.env) {
  const rosterEnv = env.DYNASTYEDGE_ROSTER_ID
  const parsedRoster = rosterEnv != null && rosterEnv !== '' ? Number(rosterEnv) : null
  return {
    defaultLeagueId: env.DYNASTYEDGE_LEAGUE_ID || LEAGUE_ID,
    // A roster id is the join key for every "is this me?" check, so it must be
    // a number or absent — never NaN (Feature 18's identity contract).
    defaultRosterId: Number.isFinite(parsedRoster) ? parsedRoster : MY_ROSTER_ID,
    snapshotTtlMs: Number(env.DYNASTYEDGE_SNAPSHOT_TTL_MS) || 15 * 60 * 1000,
    // Deliberately LONGER than the league snapshot, not inherited from it.
    // League data changes on an event (a trade lands and a roster is wrong);
    // projections change on a drip (6 of 9,419 entries moved in ten hours).
    // The full argument is in mcp/weekly.js's header.
    weeklyTtlMs: Number(env.DYNASTYEDGE_WEEKLY_TTL_MS) || DEFAULT_WEEKLY_TTL_MS,
    concurrency: Number(env.DYNASTYEDGE_CONCURRENCY) || 6,
  }
}
