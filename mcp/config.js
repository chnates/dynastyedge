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
import { DEFAULT_SEASON_TTL_MS } from './season.js'
import { DEFAULT_TRANSACTIONS_TTL_MS, DEFAULT_FROZEN_TTL_MS } from './transactions.js'
import { DEFAULT_HISTORY_TTL_MS } from './history.js'
import { DEFAULT_FEED_TTL_MS } from './feeds.js'

// The GitHub OAuth App this server authenticates against. A client ID is
// PUBLIC by design — it travels in the browser's address bar on every
// authorization request, and GitHub documents it as non-secret — so it lives
// here as a default exactly as LEAGUE_ID does, and an env var still overrides
// it. The client SECRET is never in this repo: it is read from the
// environment and has no default, so a missing one fails loudly at startup
// rather than silently authenticating nobody.
export const DEFAULT_GITHUB_CLIENT_ID = 'Ov23lipGgde1WRtguwMc'

// Only this GitHub login may obtain a token. One user, one allowlist entry —
// the whole authorization rule, stated in one place.
export const DEFAULT_ALLOWED_GITHUB_LOGIN = 'chnates'

// The server's canonical URL. It is the OAuth token AUDIENCE, so it must not
// be derived from the request's Host header — a spoofed Host would mint a
// token stamped for somewhere else. Configured, with an env override for a
// different deployment.
export const DEFAULT_ORIGIN = 'https://dynastyedge-mcp.vercel.app'

// The MCP client's id. Public, fixed, and not a secret: this is a PUBLIC
// OAuth client protected by PKCE, so there is no client secret to guard.
export const DEFAULT_MCP_CLIENT_ID = 'dynastyedge-claude'

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
    seasonTtlMs: Number(env.DYNASTYEDGE_SEASON_TTL_MS) || DEFAULT_SEASON_TTL_MS,
    // The transaction feed is TWO domains under one name (mcp/transactions.js):
    // the live week changes on an event — the very events that make a roster
    // wrong — so it rides the SNAPSHOT's freshness, not season.js's 60 minutes.
    // A settled bucket is frozen, so its number is eviction pressure.
    transactionsTtlMs: Number(env.DYNASTYEDGE_TRANSACTIONS_TTL_MS) || DEFAULT_TRANSACTIONS_TTL_MS,
    frozenTtlMs: Number(env.DYNASTYEDGE_FROZEN_TTL_MS) || DEFAULT_FROZEN_TTL_MS,
    // Past seasons never change. The longest TTL here, and for that reason.
    historyTtlMs: Number(env.DYNASTYEDGE_HISTORY_TTL_MS) || DEFAULT_HISTORY_TTL_MS,
    // rookie-intel and trade-values publish at most daily (mcp/feeds.js).
    feedTtlMs: Number(env.DYNASTYEDGE_FEED_TTL_MS) || DEFAULT_FEED_TTL_MS,
    concurrency: Number(env.DYNASTYEDGE_CONCURRENCY) || 6,
    githubClientId: env.GITHUB_CLIENT_ID || DEFAULT_GITHUB_CLIENT_ID,
    // No default, deliberately. A server that starts without this would
    // accept nobody while looking healthy.
    githubClientSecret: env.GITHUB_CLIENT_SECRET || null,
    allowedGithubLogin: env.DYNASTYEDGE_ALLOWED_LOGIN || DEFAULT_ALLOWED_GITHUB_LOGIN,
    origin: (env.DYNASTYEDGE_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, ''),
    mcpClientId: env.DYNASTYEDGE_MCP_CLIENT_ID || DEFAULT_MCP_CLIENT_ID,
  }
}
