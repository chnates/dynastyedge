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
import { getTransactions } from './transactions.js'
import { getLeagueHistory, getLedgerHistory } from './history.js'
import { buildDraftGrades } from '../src/utils/managerAnalysis.js'
import { buildPlayoffOutlook } from '../src/utils/playoffOdds.js'
import { mergeAsOf } from './snapshot.js'
import { buildRosterAnswer, renderRosterText } from './tools/getRoster.js'
import { buildSellHighAnswer, renderSellHighText } from './tools/findSellHigh.js'
import { buildFreeAgentAnswer, renderFreeAgentText, MAX_LIMIT } from './tools/recommendFreeAgents.js'
import { buildResolveAnswer, renderResolveText, MAX_QUERIES } from './tools/resolveAssets.js'
import { buildTradeAnswer, renderTradeText, isPickId } from './tools/analyzeTrade.js'
import { buildLineupAnswer, renderLineupText } from './tools/lineupAdvice.js'
import { buildOddsAnswer, renderOddsText } from './tools/playoffOdds.js'
import { buildNewsAnswer, renderNewsText, MAX_NEWS_LIMIT } from './tools/playerNews.js'
import { buildTradeTargetsAnswer, renderTradeTargetsText, DEFAULT_LIMIT as TARGETS_DEFAULT_LIMIT, MAX_LIMIT as MAX_TARGETS } from './tools/findTradeTargets.js'
import { buildRookieResearchAnswer, renderRookieResearchText, DEFAULT_LIMIT as ROOKIES_DEFAULT_LIMIT, MAX_LIMIT as MAX_ROOKIES } from './tools/researchRookies.js'
import { getLiveScores } from './liveScores.js'
import { getRookieIntel, getTradeValues } from './feeds.js'
import { buildResultsAnswer, renderResultsText } from './tools/leagueResults.js'
import { getLeagueResults } from './results.js'
import { buildScoutAnswer, renderScoutText, DEFAULT_TRADE_LIMIT, MAX_TRADE_LIMIT } from './tools/scoutManagers.js'
import { getNews } from './news.js'

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
    // Present on analyze_trade's two CONTEXT signals. Neither reaches a
    // score, but both still carry provenance and both still feed
    // oldestSourceAt — non-negotiable 1 is about every source an answer was
    // assembled from, not only the ones that changed a number.
    //
    // This object is CLOSED, and that is load-bearing: adding a source
    // without adding it here makes a real client reject the whole response
    // with "must NOT have additional properties". That is the schema doing
    // its job — it caught exactly this during live verification, where lint,
    // 630 tests and a clean build had all passed.
    transactions: sourceStamp.optional(),
    history: sourceStamp.optional(),
    // This week's live box score, behind the lock handling in lineup_advice.
    // It is the fastest-moving source here (5-minute TTL — see
    // mcp/liveScores.js), so it drags `oldestSourceAt` least, which is
    // correct: it is the one number that is never stale for long.
    liveScores: sourceStamp.optional(),
    // The Actions-published player-news feed. Class B, so a failure leaves it
    // absent rather than erroring — but when it IS used it is stamped like
    // everything else, because an answer quoting a beat report has to be
    // datable.
    news: sourceStamp.optional(),
    // The Actions-published rookie depth-chart + draft-capital feed, behind
    // research_rookies. Class B like news: absent when the feed could not be
    // read, stamped when it was used.
    rookieIntel: sourceStamp.optional(),
    // The permanent trade-time value archive, behind scout_managers' "at
    // trade time" line. Class B; stamped only when it was read.
    tradeValues: sourceStamp.optional(),
    // Every season's playoff bracket, behind get_league_results. Stamps the
    // OLDEST bracket read, for the reason oldestSourceAt is the stalest source.
    brackets: sourceStamp.optional(),
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
  // `locked` — his game has kicked off, so Sleeper has sealed the slot and NO
  // move involving him is possible whatever the numbers say. `actualPoints` is
  // non-null only when the live score also arrived, keeping "he scored 3.2"
  // distinct from "his game is under way and we could not read the box score".
  locked: z.boolean().optional(),
  gameState: z.string().nullable().optional(),
  actualPoints: z.number().nullable().optional(),
  injuryBodyPart: z.string().nullable().optional(),
  injuryNotes: z.string().nullable().optional(),
})

// One item off the aggregated news feed. `multiPlayer` is load-bearing: a
// roundup is tagged with every player it mentions, so an item can surface on a
// player its headline is not about.
const newsItemSchema = z.object({
  headline: z.string().nullable(),
  story: z.string().nullable(),
  source: z.string().nullable(),
  published: z.string().nullable(),
  link: z.string().nullable(),
  multiPlayer: z.boolean(),
  playersNamed: z.number(),
  forSleeperId: z.string().nullable(),
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

// One asset inside a suggested package, carrying the id analyze_trade accepts
// so the handoff is a second call rather than a re-resolution. A pick's id is
// built from the season/round/originalOwner triple the asset carries — never
// recovered from its label, which several picks on one roster can share
// ("2027 1st"). `id` stays NULLABLE as a guard: an asset missing part of that
// triple is reported unidentified rather than guessed at, the same rule
// resolve_assets keeps about two players sharing a surname.
const packageAssetSchema = z.object({
  id: z.string().nullable(),
  type: z.enum(['player', 'pick']),
  name: z.string(),
  position: z.string().optional(),
  age: z.number().nullable().optional(),
  value: z.number().nullable(),
  round: z.number().optional(),
  season: z.string().optional(),
})

// One seat's read of a suggested package — the compact form of sideFitSchema,
// because a board of eight targets showing both seats' full reason arrays is
// exactly the unbounded output non-negotiable 2 forbids. `concern` is the one
// line worth the bytes: it is what you would counter with.
const seatAppealSchema = z.object({
  appeal: z.string().nullable(),
  summary: z.string().nullable(),
  concern: z.string().nullable(),
  startersDelta: z.number().nullable(),
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
          // Present only on a player Sleeper is carrying a status for. Their
          // ABSENCE is not a claim that he is healthy — it is the absence of a
          // report, which is a different thing and must not be read as one.
          injuryStatus: z.string().nullable().optional(),
          injuryBodyPart: z.string().nullable().optional(),
          injuryNotes: z.string().nullable().optional(),
          latestNews: z.object({
            headline: z.string().nullable(),
            source: z.string().nullable(),
            published: z.string().nullable(),
            multiPlayer: z.boolean(),
          }).nullable().optional(),
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
      // Best-effort: a roster read must never fail because a news branch is
      // missing, so a rejection here degrades to no headlines and nothing else.
      const news = await getNews({ force: refresh, fetcher: get, store }).catch(() => null)
      const answer = buildRosterAnswer(snapshot, {
        team,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
        news,
      })
      if (answer.asOf && news?.source && news.available) {
        answer.asOf = mergeAsOf(answer.asOf, { news: news.source })
      }
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

  // The season-wide transaction feed — weeks 1..current only, because a
  // bucket past the current week is empty by construction (measured; see
  // transactions.js). The settled buckets are frozen, so after the first pass
  // a refresh costs ONE request rather than one per week.
  const transactionsFor = (snapshot, leagueId, refresh) => getTransactions({
    leagueId: leagueId || config.defaultLeagueId,
    nflState: snapshot.nflState ?? null,
    ttlMs: config.transactionsTtlMs,
    frozenTtlMs: config.frozenTtlMs,
    force: !!refresh,
    fetcher: get,
    ...(store ? { store } : {}),
  })

  // The league-history walk, deliberately narrower than the app's ~169-request
  // one: leagues + rosters + drafts + picks, no transactions (see history.js).
  const historyFor = (snapshot, leagueId, refresh) => getLeagueHistory({
    leagueId: leagueId || config.defaultLeagueId,
    leagueInfo: snapshot.league?.leagueInfo ?? null,
    ttlMs: config.historyTtlMs,
    force: !!refresh,
    fetcher: get,
    ...(store ? { store } : {}),
  })

  // The WIDE walk: the narrow one above plus each past season's users and
  // transaction buckets, which the trade ledger needs. Its own function with
  // its own measured cost (see history.js), so historyFor stays narrow.
  const ledgerHistoryFor = (snapshot, leagueId, refresh) => getLedgerHistory({
    leagueId: leagueId || config.defaultLeagueId,
    leagueInfo: snapshot.league?.leagueInfo ?? null,
    ttlMs: config.historyTtlMs,
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

      // ── The two context signals, each fetched ONLY when it can matter ──
      //
      // Neither touches a score, so neither may ever fail the grade: both are
      // wrapped, and a failure is reported in the notes as "we could not find
      // out" rather than as an absence the reader would misread.
      //
      // The activity read needs the partner's moves, so it is fetched for
      // every graded trade. The draft nudge only ever speaks when I am
      // ACQUIRING picks, so `isPickId` gates the ~14-request history walk on
      // the ids themselves — decidable before the fetch, which is why that
      // predicate is exported rather than the trade being resolved first.
      const activity = await transactionsFor(snapshot, leagueId, refresh)
        .catch(() => ({ available: false, transactions: null, sources: null }))

      const wantsDraftNudge = (getIds ?? []).some(isPickId)
      const history = wantsDraftNudge
        ? await historyFor(snapshot, leagueId, refresh)
            .catch(() => ({ available: false, history: null, sources: null }))
        : null

      // buildDraftGrades is the SAME buildDraftRecords the app's Manager
      // Scouting runs, so a grade cannot mean two things (src/utils).
      let draftGrades = null
      if (history?.available && history.history) {
        try {
          draftGrades = buildDraftGrades({
            history: history.history,
            currentLeague: snapshot.league,
            playerMap: snapshot.values?.playerMap ?? null,
            pickEntries: snapshot.values?.pickEntries ?? [],
            playerDB: snapshot.playerDB ?? null,
          })
        } catch {
          draftGrades = null
        }
      }

      const answer = buildTradeAnswer(snapshot, weekly, {
        give, get: getIds, partner, myRosterId: config.defaultRosterId, myPlayoffPct,
        transactions: activity.available ? activity.transactions : null,
        draftGrades,
        activityAvailable: activity.available,
        historyAvailable: history ? history.available : null,
      })
      if (answer.ok) {
        answer.asOf = mergeAsOf(answer.asOf, {
          ...weekly.sources,
          ...(seasonSources ?? {}),
          ...(activity.sources ?? {}),
          ...(history?.sources ?? {}),
        })
      }
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
          // Slots already sealed by kickoff, and what they have banked. On a
          // Sunday `currentProjected` is part result and part forecast; these
          // two split it, so a reader is never shown one number made of two
          // different kinds of thing.
          lockedSlots: z.number().optional(),
          pointsBanked: z.number().optional(),
          lockedOnBench: z.number().optional(),
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
        // Beat reporting for the flagged players only, so "why is he
        // Doubtful?" is answered in the same response instead of sending the
        // reader to Sleeper. Null when the feed did not load — a missing
        // source, never an assertion that there is no news.
        news: z.object({
          updatedAt: z.string().nullable(),
          ageMinutes: z.number().nullable(),
          byPlayer: z.record(z.string(), z.array(newsItemSchema)),
        }).nullable().optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ week, team, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const weekly = await weeklyFor(snapshot, week, refresh)
      // Both are best-effort and neither can fail the answer: the LOCKS come
      // from the schedule (already in `weekly`), so without live scores the
      // set of moves offered is unchanged — only the banked figure degrades to
      // a projection. News degrades to absent.
      const [live, news] = await Promise.all([
        getLiveScores({
          leagueId: leagueId || config.defaultLeagueId, week: weekly.week,
          force: refresh, fetcher: get, store,
        }).catch(() => null),
        getNews({ force: refresh, fetcher: get, store }).catch(() => null),
      ])
      const answer = buildLineupAnswer(snapshot, weekly, {
        team,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
        live,
        news,
      })
      if (answer.asOf) {
        answer.asOf = mergeAsOf(answer.asOf, {
          ...weekly.sources,
          ...(live?.source ? { liveScores: live.source } : {}),
          ...(news?.source && news.available ? { news: news.source } : {}),
        })
      }
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

  // ── Tool 8 — get_player_news ────────────────────────────────────────────
  //
  // Why a tool rather than letting the client search the web: the feed's
  // player ids were resolved server-side against the full player DB, and the
  // live DB contains two "DJ Moore"s. A model name-matching a headline to a
  // roster gets one of them wrong eventually. See mcp/news.js for the full
  // argument, including the case where web search legitimately wins (this feed
  // publishes twice an hour, so `staleForKickoff` tells the reader when to go
  // and confirm rather than pretending to be current).

  server.registerTool(
    'get_player_news',
    {
      title: 'Latest player news and injury detail',
      description:
        'The latest beat reporting and injury detail for one player, or for every player on a roster ' +
        'who is hurt or in the news. Combines Sleeper\'s injury status — including body part and notes, ' +
        'so "Doubtful" becomes "Doubtful, knee/meniscus, surgery" — with an aggregated feed of eleven ' +
        'sources resolved to Sleeper player ids. Names are matched with the same discipline as ' +
        'resolve_assets: an ambiguous name returns candidates rather than guessing. The feed republishes ' +
        'about twice an hour, so it reports its own age and says when to confirm against a live source.',
      inputSchema: {
        player: z.string().optional()
          .describe('A player name. Omit to sweep a whole roster instead. Ambiguous names are refused with candidates, never guessed.'),
        team: z.string().optional()
          .describe('Team name, manager username, or roster id, when sweeping a roster. Omit for your own team.'),
        limit: z.number().int().optional()
          .describe(`Max players (roster sweep) or items (one player). Default 12, max ${MAX_NEWS_LIMIT}.`),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the ~10 minute news cache and refetch. Use when a status is about to matter.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        // The feed is published by GitHub Actions to a data branch, so a miss
        // is a normal state. `available: false` means "we could not read the
        // feed", never "this player has no news" — the difference between a
        // gap in our data and a claim about the world.
        available: z.boolean(),
        feed: z.object({
          updatedAt: z.string().nullable(),
          ageMinutes: z.number().nullable(),
          staleForKickoff: z.boolean(),
        }).nullable().optional(),
        scope: z.enum(['player', 'roster']).optional(),
        candidates: z.array(z.any()).optional(),
        asOf: asOfSchema.optional(),
        player: z.object({
          sleeperId: z.string(),
          name: z.string().nullable(),
          position: z.string().nullable(),
          nflTeam: z.string().nullable(),
          value: z.number().nullable(),
          unranked: z.boolean(),
          injuryStatus: z.string().nullable(),
          injuryBodyPart: z.string().nullable(),
          injuryNotes: z.string().nullable(),
          ownerRosterId: z.number().nullable(),
          ownerTeam: z.string().nullable(),
          isYours: z.boolean(),
        }).optional(),
        items: z.array(newsItemSchema).optional(),
        team: z.object({
          rosterId: z.number(), teamName: z.string(), isYou: z.boolean(),
        }).optional(),
        players: z.array(z.object({
          sleeperId: z.string(),
          name: z.string().nullable(),
          position: z.string().nullable(),
          nflTeam: z.string().nullable(),
          injuryStatus: z.string().nullable(),
          injuryBodyPart: z.string().nullable(),
          injuryNotes: z.string().nullable(),
          items: z.array(newsItemSchema),
        })).optional(),
        counts: z.object({
          rostered: z.number(), withNewsOrInjury: z.number(), returned: z.number(),
        }).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ player, team, limit, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const news = await getNews({ force: refresh, fetcher: get, store }).catch(() => null)
      const answer = buildNewsAnswer(snapshot, news, {
        player, team, limit,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
      })
      if (answer.asOf && news?.source && news.available) {
        answer.asOf = mergeAsOf(answer.asOf, { news: news.source })
      }
      return {
        content: [{ type: 'text', text: renderNewsText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 9 — find_trade_targets ─────────────────────────────────────────
  //
  // The question that comes BEFORE analyze_trade. It reads the snapshot and
  // nothing else — no new source, so `asOf.sources` is the base three and the
  // closed object it is declared in stays satisfied by construction.

  server.registerTool(
    'find_trade_targets',
    {
      title: 'Find trade targets and what they would cost',
      description:
        'Answers "who should I call about, and what would it cost me?" — the question that comes ' +
        'BEFORE grading a trade. Ranks opponents\' players by your positional need x their value x how ' +
        'movable they are (three roster facts about the team that holds them), then prices each one with ' +
        'a concrete package from your own roster, held inside the Analyzer\'s fair band. Every row carries ' +
        'BOTH seats\' appeal and, where one exists, the pricier package the search declined to pay for ' +
        'with the premium it would cost — on a fairly-priced offer that premium is usually the thing that ' +
        'buys a yes. Pass `team` to scout one opponent instead of the league. Works in season and ' +
        'offseason alike. It does NOT grade: hand the ids to analyze_trade for a verdict.',
      inputSchema: {
        position: z.enum(['QB', 'RB', 'WR', 'TE']).optional()
          .describe('Only target this position. Applied inside the ranking, not to the returned rows, ' +
                    'so an empty answer means the league has nobody rather than your top few being someone else.'),
        team: z.string().optional()
          .describe('Scout ONE opponent: team name, manager handle, or roster id. Scoped mode also keeps ' +
                    'their best movable pieces at positions you are not short of, flagged fillsNeed: false. ' +
                    'Omit for the league-wide board. An ambiguous name returns candidates and refuses.'),
        limit: z.number().int().min(1).max(MAX_TARGETS).optional()
          .describe(`How many targets to price (default ${TARGETS_DEFAULT_LIMIT}, max ${MAX_TARGETS}). ` +
                    'The board is always ranked 20 deep, so counts.board is the true total either way.'),
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
          rosterId: z.number(), teamName: z.string(), winWindow: z.string().nullable(),
        }).optional(),
        positions: z.object({ deficits: z.array(z.string()) }).optional(),
        mode: z.enum(['league-wide', 'scoped']).optional(),
        scopedTo: z.object({ rosterId: z.number(), teamName: z.string() }).nullable().optional(),
        filter: z.object({ position: z.string().nullable() }).optional(),
        counts: z.object({
          board: z.number(), returned: z.number(), truncated: z.boolean(),
          fillsNeed: z.number(), priced: z.number(), inFairBand: z.number(),
        }).optional(),
        targets: z.array(z.object({
          player: playerRowSchema,
          owner: z.object({
            rosterId: z.number(), teamName: z.string(), winWindow: z.string().nullable(),
          }),
          fillsNeed: z.boolean(),
          movability: z.number(),
          package: z.object({
            assets: z.array(packageAssetSchema),
            totalValue: z.number(),
            gapPct: z.number(),
            over: z.boolean(),
            inFairBand: z.boolean(),
            short: z.boolean(),
            rationale: z.string(),
            you: seatAppealSchema,
            them: seatAppealSchema,
            alternative: z.object({
              assets: z.array(packageAssetSchema),
              totalValue: z.number(),
              appeal: z.string().nullable(),
              premiumPct: z.number(),
            }).nullable(),
          }).nullable(),
          packageNote: z.string().nullable(),
        })).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ position, team, limit, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const answer = buildTradeTargetsAnswer(snapshot, {
        team, position, limit, myRosterId: config.defaultRosterId,
      })
      return {
        content: [{ type: 'text', text: renderTradeTargetsText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 10 — research_rookies ──────────────────────────────────────────
  //
  // The second static feed the server reads. It adds ONE source to asOf —
  // `rookieIntel`, declared in the closed object above — and only when the
  // feed was actually used.

  const rookieRowSchema = z.object({
    sleeperId: z.string(),
    name: z.string(),
    position: z.string().nullable(),
    nflTeam: z.string().nullable(),
    value: z.number().nullable(),
    unranked: z.boolean(),
    positionRank: z.number().nullable(),
    rookieAdp: z.number().nullable(),
    score: z.number().nullable(),
    scoreTier: z.string().nullable(),
    ageTilted: z.boolean(),
    reasons: z.array(z.string()),
    depth: z.object({
      rank: z.number().nullable(),
      read: z.string().nullable(),
      campMove: z.object({
        from: z.number(), to: z.number(), delta: z.number(), direction: z.string(),
      }).nullable(),
    }),
    nflDraft: z.object({ round: z.number().nullable(), pick: z.number() }).nullable(),
    undrafted: z.boolean(),
    noFeedEntry: z.boolean(),
    marketRank: z.number().nullable(),
    modelRank: z.number().nullable(),
    divergence: z.number().nullable(),
    fit: z.number().nullable(),
    fitReasons: z.array(z.string()),
    fitsNeed: z.boolean(),
    ownerRosterId: z.number().nullable(),
    ownerTeam: z.string().nullable(),
    isYours: z.boolean(),
    isFreeAgent: z.boolean(),
    context: z.object({
      ageAtDraft: z.number().nullable(),
      heightIn: z.number().nullable(),
      weightLb: z.number().nullable(),
      forty: z.number().nullable(),
      vertical: z.number().nullable(),
      broadJump: z.number().nullable(),
    }),
  })

  server.registerTool(
    'research_rookies',
    {
      title: 'Research the rookie class',
      description:
        'Answers "which rookies become something, and which should I take?" — the question a dynasty ' +
        'value cannot, because value prices consensus rather than opportunity. Returns the ONE opportunity ' +
        'score the app ships (0-100: NFL depth-chart standing x NFL draft capital, back-tested, with a small ' +
        'youth tilt), the within-position disagreement between that model and the market, and a roster-fit ' +
        'ranking for one team. Age and combine numbers are returned as context only and never score. Pass ' +
        '`player` for one rookie. A rookie the feed has no entry for is unscored (null), never zero.',
      inputSchema: {
        player: z.string().optional()
          .describe('One rookie by name or Sleeper id. An ambiguous name returns candidates and refuses.'),
        position: z.enum(['QB', 'RB', 'WR', 'TE']).optional()
          .describe('Only this position (applies to the board, the shortlist and the divergence lists).'),
        sort: z.enum(['fit', 'score', 'value']).optional()
          .describe('fit (default, for the team) · score (opportunity alone) · value (dynasty market).'),
        team: z.string().optional()
          .describe('Whose roster fit to read: team name, manager handle or roster id. Omit for your own.'),
        limit: z.number().int().min(1).max(MAX_ROOKIES).optional()
          .describe(`Board rows to return (default ${ROOKIES_DEFAULT_LIMIT}, max ${MAX_ROOKIES}). counts carries the true size.`),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches (~15 min snapshot, ~60 min feed) and refetch.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        candidates: z.array(teamCandidate).optional(),
        rookieCandidates: z.array(z.object({
          sleeperId: z.string(), name: z.string(), position: z.string().nullable(), nflTeam: z.string().nullable(),
        })).optional(),
        asOf: asOfSchema.optional(),
        // False means the rookie intel feed could not be read — every score
        // is then null and the board is in dynasty-value order. Never "no
        // rookies": the class comes from the player DB, not the feed.
        available: z.boolean().optional(),
        feed: z.object({
          updatedAt: z.string().nullable(), ageHours: z.number().nullable(), season: z.string().nullable(),
        }).nullable().optional(),
        team: z.object({
          rosterId: z.number(), teamName: z.string(), isYou: z.boolean(),
          deficits: z.array(z.string()), winWindow: z.string().nullable(),
        }).optional(),
        scope: z.enum(['board', 'player']).optional(),
        filter: z.object({ position: z.string().nullable(), sort: z.string() }).optional(),
        counts: z.object({
          rookieClass: z.number(), scored: z.number(), noFeedEntry: z.number(),
          matchingFilter: z.number().optional(), returned: z.number().optional(), truncated: z.boolean().optional(),
        }).optional(),
        rookie: rookieRowSchema.optional(),
        targets: z.array(rookieRowSchema).optional(),
        undervalued: z.array(rookieRowSchema).optional(),
        overvalued: z.array(rookieRowSchema).optional(),
        board: z.array(rookieRowSchema).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ player, position, sort, team, limit, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const intel = await getRookieIntel({
        force: !!refresh, fetcher: get, ttlMs: config.feedTtlMs, ...(store ? { store } : {}),
      })
      const answer = buildRookieResearchAnswer(snapshot, intel, {
        player, position, sort, team, limit,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
      })
      if (answer.asOf && intel.available) {
        answer.asOf = mergeAsOf(answer.asOf, { rookieIntel: intel.source })
      }
      return {
        content: [{ type: 'text', text: renderRookieResearchText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 11 — scout_managers ────────────────────────────────────────────
  //
  // Three sources beyond the snapshot: the wide history walk (`history`), the
  // current season's transactions (`transactions`) and the trade-time archive
  // (`tradeValues`) — all three declared in the closed asOf object above.

  const assetRowSchema = z.object({
    type: z.string(), id: z.string().nullable(), label: z.string(), position: z.string().nullable(),
    value: z.number().nullable(), approx: z.boolean(), flipped: z.boolean(),
  })
  const scoutTradeSchema = z.object({
    txId: z.string().nullable(), season: z.string(), week: z.number().nullable(), date: z.string().nullable(),
    result: z.string(), gotValue: z.number(), gaveValue: z.number(), net: z.number(),
    partners: z.array(z.string()), got: z.array(assetRowSchema), gave: z.array(assetRowSchema),
    atTradeTime: z.object({ got: z.number(), gave: z.number() }).nullable(),
  })
  const managerSummarySchema = z.object({
    rosterId: z.number(),
    teamName: z.string(),
    handle: z.string().nullable(),
    isYou: z.boolean(),
    seasonsActive: z.array(z.string()),
    record: z.object({ wins: z.number(), losses: z.number(), ties: z.number() }),
    // Null means we could not read the ledger — NEVER "no trades".
    activity: z.string().nullable(),
    trades: z.object({
      count: z.number(), wins: z.number(), losses: z.number(), evens: z.number(),
      thisSeason: z.number().nullable(), netValue: z.number(),
    }).nullable(),
    tendencies: z.array(z.string()),
    faab: z.object({
      budgetsCommitted: z.number(), claims: z.number(), avgBidPct: z.number().nullable(),
      valuePerBudget: z.number().nullable(), faMoves: z.number(),
    }).nullable(),
    draft: z.object({ count: z.number(), hits: z.number(), avgDelta: z.number() }).nullable(),
    vsMe: z.object({ trades: z.number(), myNet: z.number() }).nullable(),
  })

  server.registerTool(
    'scout_managers',
    {
      title: 'Scout how a manager trades',
      description:
        'Answers "how does this manager trade, and how have I done?" from every season of league history: ' +
        'each manager\'s trade record graded in hindsight at today\'s values, tendencies (pick accumulator, ' +
        'buys youth, chases a position, aggressive or bargain FAAB bidder), FAAB efficiency counted in BUDGETS ' +
        'rather than dollars, rookie-draft hit rate, and head-to-head with you — plus your own report card. ' +
        'Pass `team` to open one manager\'s full trade ledger, with an "at trade time" total where the ' +
        'archive has one. A season whose transactions could not be read is named, and nobody is called a ' +
        'non-trader over it. Tendencies describe the record; they do not predict acceptance.',
      inputSchema: {
        team: z.string().optional()
          .describe('One manager to open in full: team name, manager handle or roster id. Omit for the league overview and your report card.'),
        limit: z.number().int().min(1).max(MAX_TRADE_LIMIT).optional()
          .describe(`Trades to return from that manager's ledger, newest first (default ${DEFAULT_TRADE_LIMIT}, max ${MAX_TRADE_LIMIT}).`),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches and refetch. Past seasons are frozen, so this rarely changes anything but the current season.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        candidates: z.array(teamCandidate).optional(),
        asOf: asOfSchema.optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), teams: z.number(),
        }).optional(),
        ledger: z.object({
          available: z.boolean(), complete: z.boolean(),
          seasonsRead: z.array(z.string()), seasonsMissing: z.array(z.string()),
          tradeTimeArchive: z.boolean(),
        }).optional(),
        you: managerSummarySchema.extend({
          strengths: z.array(z.string()), workOn: z.array(z.string()),
        }).nullable().optional(),
        managers: z.array(managerSummarySchema).optional(),
        manager: managerSummarySchema.extend({
          tendencyDetail: z.object({
            picksGot: z.number(), picksGave: z.number(),
            avgAgeGot: z.number().nullable(), avgAgeGave: z.number().nullable(),
            playersGotByPosition: z.record(z.string(), z.number()),
          }).nullable(),
          biggestWin: scoutTradeSchema.nullable(),
          biggestLoss: scoutTradeSchema.nullable(),
          draftPicks: z.array(z.object({
            season: z.string(), slotLabel: z.string(), overall: z.number().nullable(),
            player: z.string(), position: z.string().nullable(), value: z.number().nullable(),
            slotsBeaten: z.number(), hit: z.boolean(),
          })),
          tradeLedger: z.array(scoutTradeSchema),
        }).optional(),
        counts: z.object({
          trades: z.number().nullable(), returned: z.number(), truncated: z.boolean(),
          withTradeTimeValues: z.number(), draftPicks: z.number().nullable(),
        }).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ team, limit, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const [history, transactions, tradeValues] = await Promise.all([
        ledgerHistoryFor(snapshot, leagueId, refresh),
        transactionsFor(snapshot, leagueId, refresh),
        getTradeValues({ force: !!refresh, fetcher: get, ttlMs: config.feedTtlMs, ...(store ? { store } : {}) }),
      ])
      const answer = buildScoutAnswer(snapshot, { history, transactions, tradeValues }, {
        team, limit,
        defaultRosterId: config.defaultRosterId,
        myRosterId: config.defaultRosterId,
      })
      if (answer.asOf) {
        answer.asOf = mergeAsOf(answer.asOf, {
          ...history.sources,
          ...transactions.sources,
          ...(tradeValues.available ? { tradeValues: tradeValues.source } : {}),
        })
      }
      return {
        content: [{ type: 'text', text: renderScoutText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  // ── Tool 12 — get_league_results ────────────────────────────────────────
  //
  // "Who won our league in 2023?" — the first call this repo has ever made to
  // /league/{id}/winners_bracket. Its own small tool rather than a field on
  // scout_managers: it reads the NARROW walk plus a bracket per season, not
  // the ledger's 68 requests. Adds `brackets` (declared above) and `history`.

  const placementSchema = z.object({
    rosterId: z.number(), ownerId: z.string().nullable(), teamName: z.string(),
  }).nullable()

  server.registerTool(
    'get_league_results',
    {
      title: 'Past league champions and results',
      description:
        'Answers "who won our league in 2023?" and "who has the most titles?" from Sleeper\'s playoff bracket ' +
        'for every season of this league\'s history: champion, runner-up and third place, the regular-season ' +
        'standings, and titles counted by manager (so a renamed team keeps its titles). The current season ' +
        'reports in-progress until its championship game is decided. A season whose bracket could not be read ' +
        'is reported as unknown, never as having no winner.',
      inputSchema: {
        season: z.string().optional()
          .describe('One season, e.g. "2023". Omit for every season in the league\'s history.'),
        leagueId: z.string().optional()
          .describe('Sleeper league id. Omit for the configured league.'),
        refresh: z.boolean().optional()
          .describe('Bypass the caches and refetch. Past brackets are frozen; this only matters for the current season.'),
      },
      outputSchema: {
        ok: z.boolean(),
        error: z.string().optional(),
        seasonsAvailable: z.array(z.string()).optional(),
        asOf: asOfSchema.optional(),
        available: z.boolean().optional(),
        league: z.object({
          leagueId: z.string().nullable(), name: z.string().nullable(),
          season: z.string().nullable(), teams: z.number(),
        }).optional(),
        seasons: z.array(z.object({
          season: z.string(),
          status: z.enum(['complete', 'in-progress', 'no-bracket', 'unavailable']),
          champion: placementSchema,
          runnerUp: placementSchema,
          third: placementSchema,
          fourth: placementSchema,
          fifth: placementSchema,
          sixth: placementSchema,
          metadataAgrees: z.boolean().nullable(),
          standings: z.array(z.object({
            rosterId: z.number(), ownerId: z.string().nullable(), teamName: z.string(),
            wins: z.number(), losses: z.number(), ties: z.number(), pointsFor: z.number(),
            regularSeasonRank: z.number(),
          })),
        })).optional(),
        titles: z.array(z.object({
          ownerId: z.string(), teamName: z.string(), stillInLeague: z.boolean(),
          titles: z.number(), seasons: z.array(z.string()),
        })).optional(),
        counts: z.object({ seasons: z.number(), returned: z.number() }).optional(),
        notes: z.array(z.string()).optional(),
      },
    },
    async ({ season, leagueId, refresh }) => {
      const snapshot = await snapshotFor(leagueId, refresh)
      const results = await getLeagueResults({
        leagueId: leagueId || config.defaultLeagueId,
        leagueInfo: snapshot.league?.leagueInfo ?? null,
        ttlMs: config.historyTtlMs,
        currentTtlMs: config.snapshotTtlMs,
        force: !!refresh,
        fetcher: get,
        ...(store ? { store } : {}),
      })
      const answer = buildResultsAnswer(snapshot, results, { season })
      if (answer.asOf) answer.asOf = mergeAsOf(answer.asOf, results.sources)
      return {
        content: [{ type: 'text', text: renderResultsText(answer) }],
        structuredContent: answer,
        isError: !answer.ok,
      }
    }
  )

  return { server, config }
}
