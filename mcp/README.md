# `mcp/` — the DynastyEdge MCP server

Ask DynastyEdge questions in plain English from the Claude apps, answered from
live Sleeper data and **this app's own analysis code** rather than general
knowledge.

Design spec: [`../MCP_DISCOVERY.md`](../MCP_DISCOVERY.md). Read it first — this
file covers only what is built.

**Phase 1b (this): all six tools over stdio.** Phase 1 shipped the three
prerequisite refactors plus `get_roster`; 1b added the other five and the
weekly data layer. Remote transport, OAuth and deployment are phase 2 and
deliberately absent.

## Run it

```bash
npm ci
npm run mcp          # = node --import ./mcp/register.mjs mcp/stdio.js
```

The `--import` hook is **mandatory**: `src/utils` uses Vite-style extensionless
relative imports that plain Node cannot resolve (see `register.mjs`).

Claude Desktop / Claude Code config:

```json
{
  "mcpServers": {
    "dynastyedge": {
      "command": "node",
      "args": ["--import", "./mcp/register.mjs", "mcp/stdio.js"],
      "cwd": "/absolute/path/to/dynastyedge"
    }
  }
}
```

### Configuration

Everything is a parameter with a default, never a constant
(`MCP_DISCOVERY.md` §1, "parameterized from day one"):

| Env var | Default | Meaning |
|---|---|---|
| `DYNASTYEDGE_LEAGUE_ID` | `LEAGUE_ID` from `src/constants.js` | Which Sleeper league |
| `DYNASTYEDGE_ROSTER_ID` | `MY_ROSTER_ID` | Whose team "mine" means |
| `DYNASTYEDGE_SNAPSHOT_TTL_MS` | `900000` (15 min) | League snapshot cache TTL |
| `DYNASTYEDGE_WEEKLY_TTL_MS` | `3600000` (60 min) | Projections + schedule TTL — deliberately LONGER; see below |
| `DYNASTYEDGE_CONCURRENCY` | `6` | Max in-flight upstream requests |

Every tool also takes `leagueId` per call; these are only the fallbacks.

## Tools

| Tool | Question | Notes |
|---|---|---|
| `get_roster` | "What's on my team?" / "Show me Jake's roster." | |
| `find_sell_high` | "Who's my best sell-high candidate?" | Names a concrete partner **and** return |
| `recommend_free_agents` | "Who should I pick up and why?" | Projection column **in-season only**; a defense is never a general pickup |
| `resolve_assets` | "Which Bijan?" | Support — **call before `analyze_trade`** |
| `analyze_trade` | "Grade this trade." | **Resolved ids only**; a name is rejected, never guessed |
| `lineup_advice` | "What do I start, and what's it costing me?" | **In-season only** — the offseason says so, never zeros |

All six are documented with their contracts and traps in CLAUDE.md's
**The MCP Server** section. Read that before changing one.

### The two in-season-only tools

`lineup_advice` is dead half the year and `recommend_free_agents` loses its
projection column. Both report the condition explicitly — `unavailable: true`
with a `reason`, or `projectedPoints: null` with `projections.reason` — rather
than returning zeros. **A zero and a null mean opposite things to a model
reading JSON**, and "0.0 projected" reads as "not worth starting" when the
truth is "there is no number".

## Layout

```
mcp/
  stdio.js        entry point — stdio transport
  server.js       the McpServer: tool schemas and wiring, no domain math
  snapshot.js     league fetch + cache + the as-of stamp + mergeAsOf
  weekly.js       projections + schedule, on their own longer TTL
  teams.js        resolveTeam — one definition, three tools
  limit.js        concurrency gate + retry/backoff
  config.js       league / identity / TTLs, env-first
  register.mjs    the extensionless-import resolver hook
  loader.mjs      (the hook itself)
  tools/
    getRoster.js  findSellHigh.js  recommendFreeAgents.js
    resolveAssets.js  analyzeTrade.js  lineupAdvice.js
```

Tests live with the rest of the suite: `mcpLimit`, `mcpSnapshot`, `mcpWeekly`,
and one file per tool (`mcpGetRoster`, `mcpFindSellHigh`,
`mcpRecommendFreeAgents`, `mcpResolveAssets`, `mcpAnalyzeTrade`,
`mcpLineupAdvice`), plus `tests/leagueState.test.mjs` for the join this all
rests on. The six tool suites share `tests/helpers/mcpFixtures.mjs` — one
synthetic league, because four tools read the same object and four divergent
copies is the drift prerequisite C removed from `src/`. `npm run lint` covers
`mcp/`, and `npm test` / `npm run build` gate it exactly as they gate `src/`.

## The three rules a new tool must keep

These are not style preferences. Each answers a specific risk in
`MCP_DISCOVERY.md` §7.

1. **Every response carries an as-of stamp.** There is no schema validation
   anywhere in this codebase. In the app a Sleeper shape change produces a
   visibly broken screen; through an LLM it produces a confident, fluent,
   wrong answer. The stamp, the counts and the explicit `unranked` /
   `offseason` flags are what make a wrong answer *look* wrong. Copy
   `snapshot.asOf` onto the response and surface conditions as `notes`.
2. **Bounded output.** The player DB is 5–8MB and the FantasyCalc payload is
   large. Cap every list, report the true count beside the capped one, and
   disclose the truncation.
3. **`leagueId` and `rosterId` are parameters.** `src/constants.js` hardcodes
   one league and one owner because the app is one person's phone. A server
   must not.

And the standing repo rule: **a tool imports `src/utils`, it never reimplements
it.** `tools/getRoster.js` contains no domain math — it is orchestration, in
the shape of `src/components/trade/TradeAnalyzer.jsx`. One definition of a
roster, a value, or a verdict.

A fourth rule earned its place in phase 1b: **write the output schema against
the util's REAL field names, and let zod tell you when you guessed wrong.**
The first cut of `analyze_trade` assumed `fairBand.inBand` (it is `inside`)
and that `buildTradePitch` returns a string (it returns
`{ text, lines, bullets }`). Both were caught by the output schema at the
first live call, before either reached a reader — which is the concrete payoff
`MCP_DISCOVERY.md` §7 predicted from having any validation at all.

## Behaviour worth knowing

- **Snapshot TTL ~15 min.** One assembly per conversation instead of five.
  Measured on the live league: cold call 539ms, cached call 3ms. Phase 1b
  measured the same shape across all six tools — one 614ms cold assembly,
  then 3-47ms per tool.
- **Weekly TTL ~60 min — LONGER than the snapshot, deliberately.** League data
  changes on an EVENT (a trade lands and a roster is wrong); projections
  change on a DRIP (`weeklyProjections.js:13-15`: 6 of 9,419 entries moved in
  ten hours, 0.06%). Refetching a 1-2MB payload four times as often buys a
  change that measurably almost never happens. `mergeAsOf` recomputes
  `oldestSourceAt` over the union so a stale projection cannot hide behind a
  fresh roster fetch, and `refresh: true` is the near-kickoff escape hatch.
- **On an upstream failure the cache is served and labelled stale**, per
  source, with the error attached. A *cold* failure still throws — that is a
  real "I don't know".
- **FantasyCalc values and the player DB are cached across leagues**; only
  league data is keyed by `leagueId`. A second league must not re-download 8MB.
- **The player DB is best-effort.** Without it, rostered players FantasyCalc
  does not rank are absent rather than shown with `—` — exactly how the app
  behaves before that background fetch lands — and a note says so.
- **Sleeper's API is read-only.** The server can say exactly what to do. It can
  never set a lineup, accept a trade, or place a waiver claim.

## Known limits

- **Rate limiting is approximate.** `fetchJSON` throws an `Error` with the
  status in its message and discards the `Response`, so a 429's `Retry-After`
  is unreachable without changing `fetchJSON` — which would change the app's
  behaviour to fix a server problem. `limit.js` backs off on a fixed
  exponential schedule with jitter instead.
- **Module-level caches are process-global**, the same pattern as the app's
  ~20 hook singletons. Correct for a long-lived stdio process; **wrong for the
  serverless phase-2 deployment**, which has no warm process and wants
  external KV.
- **The schedule is the ONE Sleeper endpoint not under `/v1`**, and its fields
  are `home`/`away`, not `home_team`/`away_team`. Both mistakes fail
  **silently** as "no games", which reads as "every team is on bye".
  `weekly.js` owns both and `tests/mcpWeekly.test.mjs` pins each.
- **The four static feeds are not parameterized.** `news.json`,
  `values-history.json`, `trade-values.json` and `rookie-intel.json` are
  published from this repo's own branches. A second league gets working
  rosters, values and trades — but no news, sparklines or rookie research.
  No tool reads them yet; the ones that will must degrade cleanly and say so.

## Phase 2 notes

- **Bundling works — verified, 2026-09-19.** `MCP_DISCOVERY.md` §6 flagged
  this as untested. esbuild (already present via Vite) bundles `mcp/stdio.js`
  and all of `src/utils` into a single 1.4MB ESM file that boots with **no
  resolver hook**:

  ```bash
  node -e "import('esbuild').then(e=>e.build({entryPoints:['mcp/stdio.js'],\
  bundle:true,platform:'node',format:'esm',target:'node22',outfile:'/tmp/b.mjs'}))"
  ```

  Not shipped as a build step here — deployment is phase 2 — but the approach
  is de-risked, and it is the right answer for a deployed service, which
  should not depend on a resolver hook.
- Remaining phase-2 unknowns: host choice, OAuth registration, whether
  projections deserve a shorter TTL than the league snapshot
  (`weeklyProjections.js:13-15` notes Sleeper rewrites that endpoint in place).
