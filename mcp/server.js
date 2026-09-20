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
import { getWeekly } from './weekly.js'
import { getSeasonWeeks } from './season.js'
import { buildPlayoffOutlook } from '../src/utils/playoffOdds.js'
import { mergeAsOf } from './snapshot.js'
import { buildRosterAnswer, renderRosterText } from './tools/getRoster.js'
import { buildSellHighAnswer, renderSellHighText } from './tools/findSellHigh.js'
import { buildFreeAgentAnswer, renderFreeAgentText, MAX_LIMIT } from './tools/recommendFreeAgents.js'
import { buildResolveAnswer, renderResolveText, MAX_QUERIES } from './tools/resolveAssets.js'
import { buildTradeAnswer, renderTradeText } from './tools/analyzeTrade.js'
import { buildLineupAnswer, renderLineupText } from './tools/lineupAdvice.js'
import { buildOddsAnswer, renderOddsText } from './tools/playoffOdds.js'

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
    // Present only on the weekly tools. They are folded in by mergeAsOf,
    // which RECOMPUTES oldestSourceAt and stale over the union — a 50-minute
    // -old projection has to drag the whole answer's stated age down with it.
    projections: sourceStamp.optional(),
    schedule: sourceStamp.optional(),
    // Present on the tools that run the rest-of-season simulation. It stamps
    // the OLDEST of the ~14 matchup weeks, for the same reason
    // oldestSourceAt is the stalest source: an answer assembled from fourteen
    // fetches is only as fresh as the oldest one of them.
    matchups: sourceStamp.optional(),
  }),
})

// Repeated on every tool: the candidate list a resolver returns instead of
// guessing. See MCP_DISCOVERY.md §1.
const teamCandidate = z.object({
  rosterId: z.number(), teamName: z.string(), username: z.string(),
})

// A player as the recommendation tools report him. `value` is NULLABLE and
// paired with `unranked` throughout, because rule 7 says an unpriced player
// is kept and shown as `—`, never fabricated as 0 — and to a model reading
// JSON, 0 and null are the difference between "worthless" and "unpriced".
const playerRowSchema = z.object({
  sleeperId: z.string(),
  name: z.string(),
  position: z.string(),
  nflTeam: z.string().nullable(),
  age: z.number().nullable(),
  value: z.number().nullable(),
  unranked: z.boolean(),
  positionRank: z.number().nullable(),
  trend30Day: z.number(),
})

const playerCandidateSchema = playerRowSchema.extend({
  kind: z.literal('player'),
  type: z.literal('player'),
  overallRank: z.number().nullable(),
  ownerRosterId: z.number().nullable(),
  ownerTeam: z.string().nullable(),
  isFreeAgent: z.boolean(),
})

const pickCandidateSchema = z.object({
  kind: z.literal('pick'),
  type: z.literal('pick'),
  // The SAME id TradeAnalyzer.jsx builds, so it round-trips into analyze_trade.
  id: z.string(),
  season: z.string(),
  round: z.number(),
  slot: z.number().nullable(),
  slotLabel: z.string().nullable(),
  name: z.string(),
  value: z.number().nullable(),
  pricing: z.enum(['exact-slot', 'round-median']),
  ownerRosterId: z.number(),
  ownerTeam: z.string(),
  originalOwnerRosterId: z.number(),
  originalOwnerTeam: z.string().nullable(),
})

// A player on a lineup row. `projected` is Sleeper's number; `effective` is
// what he actually contributes — 0 for anyone blocked, whatever Sleeper still
// carries for him, because an "Out" starter holding 12.4 would otherwise
// inflate the current total and hide the gap the tool exists to surface.
const lineupPlayerSchema = z.object({
  sleeperId: z.string(),
  name: z.string().nullable(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  projected: z.number(),
  effective: z.number(),
  blocked: z.boolean(),
  status: z.string().nullable(),
  statusLabel: z.string().nullable(),
})

// An asset as it appears on one side of a graded trade.
const tradeAssetSchema = z.object({
  id: z.string(),
  type: z.enum(['player', 'pick']),
  name: z.string(),
  position: z.string().optional(),
  nflTeam: z.string().nullable().optional(),
  age: z.number().nullable().optional(),
  value: z.number().nullable(),
  unranked: z.boolean().optional(),
  positionRank: z.number().nullable().optional(),
  trend30Day: z.number().optional(),
  season: z.string().optional(),
  round: z.number().optional(),
  pricing: z.enum(['exact-slot', 'round-median']).optional(),
})

// ONE shape for both seats. buildSideFit is a single engine called twice
// (tradeAnalysis.js), so the two reads are phrased alike by construction —
// giving them one schema keeps that true at the wire too.
const sideFitSchema = z.object({
  appeal: z.string().nullable(),
  summary: z.string().nullable(),
  reasons: z.array(z.string()),
  concerns: z.array(z.string()),
  startersDelta: z.number().nullable(),
  lineupNote: z.string().nullable().optional(),
  fills: z.array(z.any()).optional(),
  hurts: z.array(z.any()).optional(),
  stacks: z.array(z.any()).optional(),
  weakens: z.array(z.any()).optional(),
  benchNote: z.string().nullable().optional(),
  starterLossNote: z.string().nullable().optional(),
  landingSpots: z.array(z.any()).optional(),
})

// `store` and `fetcher` are injectable so the HTTP transport can share ONE of
// each across requests on a warm instance. Without that, a per-request server
// would mint a per-request limiter and defeat the process-wide concurrency
// gate — three simultaneous tool calls would each get the full budget, which
// is the exact failure mcp/limit.js exists to prevent. Omitted (stdio), both
// fall back to the module-level defaults.
export function createServer({ env = process.env, fetcher, store } = {}) {
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
        candidates: z.array(teamCandidate).optional(),
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
        ...(store ? { store } : {}),
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

  // ── A shared loader for the tools that need it ──────────────────────────
  // Every tool resolves its own league and identity, because §1 makes both
  // parameters rather than constants.
  const snapshotFor = (leagueId, refresh) => getSnapshot({
    leagueId: leagueId || config.defaultLeagueId,
    myRosterId: config.defaultRosterId,
    ttlMs: config.snapshotTtlMs,
    force: !!refresh,
    fetcher: get,
    ...(store ? { store } : {}),
  })

  const weeklyFor = (snapshot, week, refresh) => getWeekly({
    nflState: snapshot.nflState,
    week,
    ttlMs: config.weeklyTtlMs,
    force: !!refresh,
    fetcher: get,
    ...(store ? { store } : {}),
  })

  // The rest-of-season matchup weeks — ~14 requests, so it is loaded only by
  // the tools that genuinely need the simulation, and its own TTL (60 min,
  // see season.js) means a conversation pays for it once.
  const seasonFor = (snapshot, leagueId, refresh) => getSeasonWeeks({
    leagueId: leagueId || config.defaultLeagueId,
    leagueInfo: snapshot.league?.leagueInfo ?? null,
    ttlMs: config.seasonTtlMs,
    force: !!refresh,
    fetcher: get,
    ...(store ? { store } : {}),
  })

  // ── Tool 2 — find_sell_high ─────────────────────────────────────────────

  server.registerTool(
    'find_sell_high',
    {
      title: 'Find a sell-high candidate',
      description:
        'Scans your roster for the best sell-high candidate — a player rising over 30 days at a ' +
        'position you are DEEP at — and names a concrete trade partner and a concrete return, not ' +
        '"shop him to someone". Also returns the best buy-low target at a position you are short ' +
        'of, and the opponent whose record most badly trails their roster value (a frustrated ' +
        'owner is a buy window). Works in season and offseason alike. Takes no arguments.',
      inputSchema: {
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the ~15 minute snapshot cache and refetch.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        candidates: z.array(teamCandidate).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), isOffseason: z.boolean(), teams: z.number(),
        }).optional(),
        team: z.object({
          rosterId: z.number(), teamName: z.string(), winWindow: z.string(),
          valueRank: z.number(), teamTrend: z.number(),
        }).optional(),
        positions: z.object({
          surpluses: z.array(z.string()), deficits: z.array(z.string()),
        }).optional(),
        sellHigh: z.object({
          player: playerRowSchema,
          reason: z.string(),
          move: z.object({
            partnerRosterId: z.number(),
            partnerName: z.string(),
            returnPlayer: playerRowSchema.nullable(),
            fillsDeficit: z.string().nullable(),
            startsForThem: z.boolean(),
            summary: z.string(),
          }).nullable(),
        }).nullable().optional(),
        alternatives: z.array(playerRowSchema).optional(),
        buyLow: z.object({
          player: playerRowSchema,
          ownerRosterId: z.number().nullable(),
          ownerTeam: z.string().nullable(),
          ownerWinWindow: z.string().nullable(),
          reason: z.string(),
        }).nullable().optional(),
        underperformer: z.object({
          rosterId: z.number(), teamName: z.string(), totalValue: z.number(),
          record: z.object({ wins: z.number(), losses: z.number(), ties: z.number() }).nullable(),
          reason: z.string(),
        }).nullable().optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const answer = buildSellHighAnswer(snapshot, { myRosterId: config.defaultRosterId })
      return {
        content: [{ type: 'text', text: renderSellHighText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 3 — recommend_free_agents ──────────────────────────────────────

  server.registerTool(
    'recommend_free_agents',
    {
      title: 'Recommend free agents',
      description:
        'Ranks available players by what they would actually do for YOUR roster — fill a positional ' +
        'deficit, beat your current depth at the spot, or ride a rising 30-day trend — each with ' +
        'plain-English reasons. Carries BOTH dynasty value and this week\'s Sleeper projection, ' +
        'which are different axes (they correlate at only r = 0.427). IN-SEASON ONLY for the ' +
        'projection column: in the offseason `projectedPoints` is null and the response says why, ' +
        'never zero. Defenses are excluded by design — you roster exactly one, ever.',
      inputSchema: {
        position: z.string().optional()
          .describe('Limit to QB, RB, WR or TE. Omit for all. DEF is not a general pickup and is rejected with an explanation.'),
        limit: z.number().int().optional()
          .describe(`How many to return (default 8, max ${MAX_LIMIT}).`),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        week: z.number().int().optional()
          .describe('Projection week. Omit for the current week.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches and refetch. Use near kickoff, when a late inactive can move a projection faster than its ~60 minute TTL.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        candidates: z.array(teamCandidate).optional(),
        incumbentDefense: z.object({
          rostered: z.object({
            sleeperId: z.string(), name: z.string(), nflTeam: z.string().nullable(),
            value: z.null(), projectedPoints: z.number().nullable(),
          }).nullable(),
          note: z.string(),
          availableCount: z.number().nullable(),
        }).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), week: z.number().nullable(),
          isOffseason: z.boolean(), teams: z.number(),
        }).optional(),
        team: z.object({
          rosterId: z.number(), teamName: z.string(),
          faabRemaining: z.number(), faabBudget: z.number(), faabDisplay: z.string(),
        }).optional(),
        filter: z.object({
          position: z.string().nullable(), limit: z.number(),
        }).optional(),
        projections: z.object({
          available: z.boolean(), week: z.number().nullable(), reason: z.string().nullable(),
        }).optional(),
        counts: z.object({
          poolSize: z.number(), returned: z.number(), recommendedTotal: z.number(),
        }).optional(),
        recommendations: z.array(z.object({
          sleeperId: z.string(), name: z.string(), position: z.string(),
          nflTeam: z.string().nullable(), age: z.number().nullable(),
          value: z.number().nullable(),
          overallRank: z.number().nullable(), positionRank: z.number().nullable(),
          trend30Day: z.number(),
          // null in the offseason — never 0, which would read as "not worth starting".
          projectedPoints: z.number().nullable(),
          fillsNeed: z.boolean(), isUpgrade: z.boolean(),
          upgradeMargin: z.number().nullable(),
          reasons: z.array(z.string()),
        })).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ position, limit, leagueId, week, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const weekly = await weeklyFor(snapshot, week, refresh)
      const answer = buildFreeAgentAnswer(snapshot, weekly, {
        position, limit, myRosterId: config.defaultRosterId,
      })
      // The weekly sources join the stamp, and mergeAsOf recomputes the
      // overall age over the union — a stale projection must not hide behind
      // a fresh roster fetch.
      if (answer.ok) answer.asOf = mergeAsOf(answer.asOf, weekly.sources)
      return {
        content: [{ type: 'text', text: renderFreeAgentText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 4 — resolve_assets ─────────────────────────────────────────────

  server.registerTool(
    'resolve_assets',
    {
      title: 'Resolve player and pick names to ids',
      description:
        'Turns free-text player or draft-pick names into resolved ids, with each candidate\'s team, ' +
        'position, current dynasty value and owning roster. CALL THIS BEFORE analyze_trade, which ' +
        'accepts ids only. A name matching more than one asset returns the candidate list and NO ' +
        'match — it never guesses, because grading the wrong player produces a confident wrong ' +
        'verdict nothing downstream can catch. Understands picks too ("2027 1st", "2026 1.05").',
      inputSchema: {
        names: z.array(z.string()).min(1)
          .describe(`Names to resolve, e.g. ["Bijan", "2027 1st"]. Max ${MAX_QUERIES}.`),
        includeFreeAgents: z.boolean().optional()
          .describe('Search unrostered players too (default true).'),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the ~15 minute snapshot cache and refetch.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), teams: z.number(),
        }).optional(),
        results: z.array(z.object({
          query: z.string(),
          kind: z.enum(['player', 'pick']),
          parsed: z.object({
            season: z.string(), round: z.number(), slot: z.number().nullable(),
          }).optional(),
          marketValue: z.number().nullable().optional(),
          // Non-null ONLY on a unique match. Two candidates means null.
          match: z.union([playerCandidateSchema, pickCandidateSchema]).nullable(),
          candidates: z.array(z.union([playerCandidateSchema, pickCandidateSchema])),
          truncated: z.boolean().optional(),
          totalCandidates: z.number().optional(),
          reason: z.string(),
        })).optional(),
        counts: z.object({
          queries: z.number(), resolved: z.number(),
          ambiguous: z.number(), unmatched: z.number(),
        }).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ names, includeFreeAgents, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const answer = buildResolveAnswer(snapshot, { names, includeFreeAgents })
      return {
        content: [{ type: 'text', text: renderResolveText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 5 — analyze_trade ──────────────────────────────────────────────

  server.registerTool(
    'analyze_trade',
    {
      title: 'Grade a trade',
      description:
        'Grades a proposed trade: verdict (Accept / Decline / Counter) with its one-sentence ' +
        'reasoning, the raw value split, BOTH seats\' appeal (is it good for you, and would they ' +
        'even want it), where each arriving player lands in the receiving lineup, the fair-value ' +
        'band, a specific counter suggestion, and the pitch text to actually send. ' +
        'ASSETS ARE RESOLVED IDS ONLY — a numeric Sleeper player id, or a pick id like ' +
        '"2027-1-4". Call resolve_assets first; a free-text name is rejected, never guessed at.',
      inputSchema: {
        give: z.array(z.string())
          .describe('Asset ids leaving YOUR roster. Sleeper player ids or "SEASON-ROUND-OWNERROSTERID" pick ids — never names.'),
        get: z.array(z.string())
          .describe('Asset ids coming from the PARTNER\'s roster. Same id forms — never names.'),
        partner: z.string()
          .describe('The other team: name, manager username, or roster id. An ambiguous name returns candidates.'),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        week: z.number().int().optional()
          .describe('Week for the weekly lineup-impact read. Omit for the current week.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches and refetch.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        candidates: z.array(teamCandidate).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), isOffseason: z.boolean(),
        }).optional(),
        sides: z.object({
          you: z.object({ rosterId: z.number(), teamName: z.string() }),
          them: z.object({ rosterId: z.number(), teamName: z.string() }),
          give: z.array(tradeAssetSchema),
          get: z.array(tradeAssetSchema),
        }).optional(),
        // null until BOTH sides carry an asset — the app's own gate.
        verdict: z.object({
          verdict: z.string().nullable(),
          reasoning: z.string().nullable(),
          injuryAdjusted: z.boolean(),
        }).nullable().optional(),
        value: z.object({
          giveTotal: z.number(), getTotal: z.number(), diff: z.number(),
          pctDiff: z.number(), winner: z.string(),
        }).optional(),
        forYou: sideFitSchema.optional(),
        forThem: sideFitSchema.optional(),
        winWindow: z.object({
          // 'odds' or 'tier' — which basis actually scored the layer.
          basis: z.string().nullable(),
          note: z.string().nullable(),
          score: z.number().nullable(),
          myTier: z.string().nullable(),
          theirTier: z.string().nullable(),
          partnerTrajectory: z.string().nullable(),
          myTrajectory: z.string().nullable(),
        }).optional(),
        fairBand: z.object({
          low: z.number(), high: z.number(),
          target: z.number(), current: z.number(),
          inside: z.boolean(), gapToBand: z.number(),
        }).nullable().optional(),
        counter: z.object({
          side: z.string(), type: z.string(),
          item: z.string().nullable(), text: z.string(),
        }).nullable().optional(),
        pitch: z.object({
          text: z.string(), bullets: z.array(z.string()),
        }).nullable().optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ give, get: getIds, partner, leagueId, week, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const weekly = await weeklyFor(snapshot, week, refresh)

      // Layer 3 scores on LIVE playoff odds when they exist — the ~14-request
      // season fetch is worth it, because the tier it replaces tracks the
      // starting lineup at 0.721 against odds' 0.988 (see tools/analyzeTrade.js).
      //
      // IN SEASON ONLY. The offseason has no schedule to simulate, so fetching
      // would be fourteen calls to learn nothing; Layer 3 falls back to the
      // tier and the response says `windowBasis: 'tier'`, which is exactly the
      // behaviour this tool shipped with. A schedule that fails to load lands
      // in the same fallback rather than failing the grade.
      let myPlayoffPct = null
      let seasonSources = null
      if (!snapshot.isOffseason) {
        const season = await seasonFor(snapshot, leagueId, refresh)
        if (season.available) {
          const outlook = buildPlayoffOutlook({
            allRosters: snapshot.league.allRosters,
            perWeek: season.perWeek,
            playoffTeams: season.playoffTeams,
            firstPlayoffWeek: season.firstPlayoffWeek,
          })
          // A preseason outlook has no results at all — `?? null` keeps the
          // tier fallback rather than reading a missing entry as 0% odds,
          // which would score every trade as a fire sale.
          myPlayoffPct = outlook?.oddsByRoster?.[config.defaultRosterId]?.playoffPct ?? null
          seasonSources = season.sources
        }
      }

      const answer = buildTradeAnswer(snapshot, weekly, {
        give, get: getIds, partner, myRosterId: config.defaultRosterId, myPlayoffPct,
      })
      if (answer.ok) answer.asOf = mergeAsOf(answer.asOf, { ...weekly.sources, ...(seasonSources ?? {}) })
      return {
        content: [{ type: 'text', text: renderTradeText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 6 — lineup_advice ──────────────────────────────────────────────
  //
  // IN-SEASON ONLY. The offseason returns ok:false with `unavailable: true`
  // and a reason, never a lineup of zeros.

  server.registerTool(
    'lineup_advice',
    {
      title: 'Weekly start/sit advice',
      description:
        'Solves your optimal starting lineup on this week\'s Sleeper projections and diffs it against ' +
        'what you are actually starting: the points sitting on your bench, every move with its own ' +
        'point gain, a must-fix flag for anyone on bye / Out / IR or an empty slot, and a measured ' +
        'confidence percentage for the genuine judgement calls. IN-SEASON ONLY — in the offseason it ' +
        'says so rather than returning zeros. Sleeper is read-only, so it tells you what to change; ' +
        'you make the change in the Sleeper app.',
      inputSchema: {
        week: z.number().int().optional()
          .describe('Week to advise on. Omit for the current week.'),
        team: z.string().optional()
          .describe('Team name, manager username, or roster id. Omit for your own team.'),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches and refetch. Use near kickoff, when a late inactive can move a projection faster than its ~60 minute TTL.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        // True when there is simply no lineup question to answer (offseason,
        // or projections down) — distinct from a bad argument.
        unavailable: z.boolean().optional(),
        reason: z.enum(['offseason', 'projections-unavailable']).optional(),
        candidates: z.array(teamCandidate).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), week: z.number().nullable(),
          isOffseason: z.boolean(),
        }).optional(),
        team: z.object({
          rosterId: z.number(), teamName: z.string(), isYou: z.boolean().optional(),
        }).optional(),
        summary: z.object({
          pointsLeftOnBench: z.number(),
          currentProjected: z.number(),
          optimalProjected: z.number(),
          mustFixCount: z.number(),
          upgradeCount: z.number(),
          coinFlipCount: z.number(),
          emptySlots: z.number(),
          isOptimal: z.boolean(),
        }).optional(),
        moves: z.array(z.object({
          action: z.enum(['swap', 'fill', 'bench']),
          sit: lineupPlayerSchema.nullable(),
          start: lineupPlayerSchema.nullable(),
          gain: z.number(),
          mustFix: z.boolean(),
          // A PERCENTAGE (0-100), and NULL on a must-fix by rule: a bye /
          // Out / empty slot scores 0 by rule rather than by projection, so
          // the measured hit-rate curve has no question to answer there.
          confidencePct: z.number().nullable(),
          directSwap: z.boolean(),
          meaningful: z.boolean(),
          reason: z.string(),
        })).optional(),
        lineup: z.array(z.object({
          slot: z.string(),
          eligible: z.array(z.string()).nullable(),
          player: lineupPlayerSchema.nullable(),
          isOptimal: z.boolean(),
        })).optional(),
        bench: z.array(lineupPlayerSchema).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ week, team, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const weekly = await weeklyFor(snapshot, week, refresh)
      const answer = buildLineupAnswer(snapshot, weekly, {
        team,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
      })
      if (answer.asOf) answer.asOf = mergeAsOf(answer.asOf, weekly.sources)
      return {
        content: [{ type: 'text', text: renderLineupText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 7 — get_playoff_odds ───────────────────────────────────────────
  //
  // THREE STATES, AND ONLY ONE OF THEM HAS ODDS. The preseason returns
  // `you.playoffPct: null` and a strength-ranked PREVIEW rather than a
  // fabricated percentage — same discipline lineup_advice keeps about the
  // offseason. A total matchup-fetch failure is NOT a preseason and says so
  // (`reason: 'unavailable'`), because fourteen empty weeks and a season that
  // has not started look identical on the wire.

  server.registerTool(
    'get_playoff_odds',
    {
      title: 'Rest-of-season playoff odds',
      description:
        'Simulates the rest of the regular season 10,000 times and reports your playoff odds, ' +
        'projected record and seed, the whole field ranked, and whether you should be buying or ' +
        'selling at the deadline. Each team\'s weekly score is drawn from a model that blends its ' +
        'roster strength with its actual scores so far, so it is useful from Week 1. Fixed seed, so ' +
        'the numbers are stable across calls. Before any game is played it returns a roster-strength ' +
        'PREVIEW and a null percentage rather than inventing odds.',
      inputSchema: {
        team: z.string().optional()
          .describe('Team name, manager username, or roster id to report "you" for. Omit for your own team.'),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches and refetch. Worth it just after a week completes, which is the only time these numbers move.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        // True when the schedule could not be loaded at all — distinct from a
        // preseason, which is ok:true with a null percentage.
        unavailable: z.boolean().optional(),
        reason: z.enum(['unavailable']).optional(),
        candidates: z.array(teamCandidate).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(),
          name: z.string().nullable(),
          season: z.string().nullable(),
          playoffTeams: z.number(),
          firstPlayoffWeek: z.number(),
          teamCount: z.number(),
        }).optional(),
        status: z.enum(['preseason', 'active', 'complete']).optional(),
        basis: z.object({
          completedWeeks: z.number(),
          remainingWeeks: z.number(),
          remainingGames: z.number(),
          iterations: z.number(),
        }).optional(),
        you: z.object({
          rosterId: z.number(),
          teamName: z.string(),
          winWindow: z.string(),
          // NULL in the preseason. Never 0, never a guess — a 0 would read as
          // "eliminated" and a guess would read as a measurement.
          playoffPct: z.number().nullable(),
          topSeedPct: z.number().nullable(),
          avgSeed: z.number().nullable(),
          projWins: z.number().nullable(),
          projLosses: z.number().nullable(),
          stance: z.string(),
          stanceText: z.string(),
        }).optional(),
        teams: z.array(z.object({
          rosterId: z.number(),
          teamName: z.string(),
          isYou: z.boolean(),
          playoffPct: z.number().nullable(),
          topSeedPct: z.number().nullable(),
          avgSeed: z.number(),
          projWins: z.number(),
          projLosses: z.number(),
          remainingGames: z.number(),
          winWindow: z.string(),
          record: z.object({
            wins: z.number(), losses: z.number(), ties: z.number(),
          }).nullable(),
        })).optional(),
        // Preseason only, and it is a PREVIEW, not odds.
        strengthPreview: z.array(z.object({
          rosterId: z.number(),
          teamName: z.string(),
          isYou: z.boolean(),
          projSeed: z.number(),
          projectedIn: z.boolean(),
        })).nullable().optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ team, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const season = await seasonFor(snapshot, leagueId, refresh)
      const answer = buildOddsAnswer(snapshot, season, {
        team,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
      })
      if (answer.asOf) answer.asOf = mergeAsOf(answer.asOf, season.sources)
      return {
        content: [{ type: 'text', text: renderOddsText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  return { server, config }
}
