// server.js — the MCP server: tool schemas and wiring, nothing else.
//
// The two-layer split from MCP_DISCOVERY.md §6: this thin layer owns fetching,
// caching and tool schemas; it IMPORTS the analysis layer rather than copying
// it, so there is exactly one definition of a roster, a value, or a verdict.
// Transport is chosen by the caller (stdio today; streamable HTTP is phase 2),
// and the tool implementations are identical across both.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { loadConfig } from './config.js'
import { getSnapshot } from './snapshot.js'
import { createFetcher } from './limit.js'
import { buildRosterAnswer, renderRosterText } from './tools/getRoster.js'

export const SERVER_NAME = 'dynastyedge'
export const SERVER_VERSION = '0.1.0'

// The as-of block every tool response carries. Declared once, shared by every
// output schema, because provenance is not per-tool garnish — it is the
// mitigation for this design's biggest risk (§7): nothing in this codebase
// validates an external payload, so through an LLM a shape change becomes a
// confident wrong answer instead of a visibly broken screen. The stamp is what
// makes a wrong answer look wrong.
const sourceStamp = z.object({
  fetchedAt: z.string().nullable(),
  ageSeconds: z.number().nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
})

const asOfSchema = z.object({
  generatedAt: z.string(),
  oldestSourceAt: z.string().nullable(),
  stale: z.boolean(),
  sources: z.object({
    sleeper: sourceStamp,
    fantasycalc: sourceStamp,
    playerDB: sourceStamp,
  }),
})

export function createServer({ env = process.env, fetcher } = {}) {
  const config = loadConfig(env)
  // One limiter for the whole process, so concurrency is bounded ACROSS tool
  // calls rather than per call — an eager model firing three tools at once
  // must not get 3× the request budget.
  const get = fetcher ?? createFetcher({ concurrency: config.concurrency })

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'DynastyEdge answers questions about one Sleeper dynasty fantasy football league ' +
        '(10-team Superflex, Half PPR) using live Sleeper data and the app\'s own analysis. ' +
        'Every response carries an `asOf` stamp — quote its age when the data is stale, and ' +
        'never present a stale number as current. A player with `unranked: true` has no ' +
        'FantasyCalc price; report that as "no value", never as zero. Sleeper\'s API is ' +
        'read-only: this server can tell the user what to do, never do it for them.',
    }
  )

  server.registerTool(
    'get_roster',
    {
      title: 'Get a team roster',
      description:
        'Full dynasty roster for one team in the league: every player with value, overall ' +
        'and positional rank, 30-day trend and starter/bench/taxi/IR slot; every draft pick ' +
        'owned, with its exact slot label where the draft order is known; plus total value ' +
        'and league value rank, win-window tier, record and FAAB. Defaults to the ' +
        'configured team when `team` is omitted. Accepts a team name, a manager username, ' +
        'or a roster id — an ambiguous name returns the candidates rather than guessing.',
      inputSchema: {
        team: z.string().optional()
          .describe('Team name, manager username, or roster id. Omit for your own team.'),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the ~15 minute snapshot cache and refetch.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        candidates: z.array(z.object({
          rosterId: z.number(), teamName: z.string(), username: z.string(),
        })).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(),
          name: z.string().nullable(),
          season: z.string().nullable(),
          week: z.number().nullable(),
          isOffseason: z.boolean(),
          teams: z.number(),
        }).optional(),
        team: z.object({
          rosterId: z.number(),
          teamName: z.string(),
          username: z.string().nullable(),
          isYou: z.boolean(),
        }).optional(),
        record: z.object({
          wins: z.number(), losses: z.number(), ties: z.number(),
          pointsFor: z.number(), pointsAgainst: z.number(),
        }).nullable().optional(),
        faab: z.object({
          budget: z.number(), remaining: z.number(), spent: z.number(), display: z.string(),
        }).optional(),
        winWindow: z.string().optional(),
        totals: z.object({
          totalValue: z.number(),
          playerValue: z.number(),
          pickValue: z.number(),
          valueRank: z.number(),
          pickCapitalScore: z.number(),
          avgStarterAge: z.number().nullable(),
          playerCount: z.number(),
          pickCount: z.number(),
          unrankedCount: z.number(),
          slotCounts: z.record(z.string(), z.number()),
        }).optional(),
        players: z.array(z.object({
          sleeperId: z.string(),
          name: z.string(),
          position: z.string(),
          nflTeam: z.string().nullable(),
          age: z.number().nullable(),
          // null, never 0 — see rule 7.
          value: z.number().nullable(),
          unranked: z.boolean(),
          overallRank: z.number().nullable(),
          positionRank: z.number().nullable(),
          trend30Day: z.number(),
          slot: z.enum(['STARTER', 'BENCH', 'TAXI', 'IR']),
        })).optional(),
        picks: z.array(z.object({
          season: z.string(),
          round: z.number(),
          slotLabel: z.string().nullable(),
          label: z.string(),
          originalOwnerRosterId: z.number(),
          originalOwnerTeam: z.string().nullable(),
          value: z.number().nullable(),
          pricing: z.enum(['exact-slot', 'round-median']),
        })).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ team, leagueId, refresh }) => {
      const snapshot = await getSnapshot({
        leagueId: leagueId || config.defaultLeagueId,
        myRosterId: config.defaultRosterId,
        ttlMs: config.snapshotTtlMs,
        force: !!refresh,
        fetcher: get,
      })
      const answer = buildRosterAnswer(snapshot, {
        team,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
      })
      return {
        content: [{ type: 'text', text: renderRosterText(answer) }],
        structuredContent: answer,
        // An unresolvable team is a bad argument, not a server fault — the
        // model should re-ask with one of the candidates rather than retry.
        isError: !answer.ok,
      }
    }
  )

  return { server, config }
}
