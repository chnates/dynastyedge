# `mcp/` — the DynastyEdge MCP server

Ask DynastyEdge questions in plain English from the Claude apps, answered from
live Sleeper data and **this app's own analysis code** rather than general
knowledge.

Design spec: [`../MCP_DISCOVERY.md`](../MCP_DISCOVERY.md). Read it first — this
file covers only what is built.

**Phase 2b (this): seven tools, over stdio AND streamable HTTP, with every
one of `analyze_trade`'s eight optional signals wired.** Phase 1
shipped three prerequisite refactors plus `get_roster`; 1b added the other four
of `MCP_DISCOVERY.md` §5's set and the weekly data layer; phase 2 added the
HTTP transport, stateless OAuth and the Vercel packaging, and is **live at
`https://dynastyedge-mcp.vercel.app/mcp`**. Phase 2a added `get_playoff_odds`
and the rest-of-season layer behind it, and used the same fetch to put
`analyze_trade`'s Layer 3 on **live playoff odds** instead of the win-window
tier.

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
| `DYNASTYEDGE_SEASON_TTL_MS` | `3600000` (60 min) | Regular-season matchup weeks — the same number, a different argument |
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
| `get_playoff_odds` | "Am I making the playoffs — buying or selling?" | The preseason returns a **null** percentage and a labelled preview, never a made-up one |

All seven are documented with their contracts and traps in CLAUDE.md's
**The MCP Server** section. Read that before changing one.

### The in-season-only tools, and the one that is season-aware

`get_playoff_odds` is the third member of this family and it answers a
**different** condition, so it does not say "in-season only": before a schedule
posts there is nothing to simulate and it returns `playoffPct: null` with a
strength-ranked PREVIEW, and a **posted but unplayed** schedule is `active`
(the model runs off the roster-strength prior alone, which is what makes it
useful in Week 1). Conflating those two would put a ranking on screen when real
odds were available.

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
  app.js          the hosted server: OAuth in front of MCP
  oauth.js        auth crypto + policy (HMAC tokens, PKCE, audience)
  oauthRoutes.js  the five OAuth endpoints
  http.js         the streamable-HTTP transport (Web-standard handler)
  store.js        THE cache backend boundary + the one freshness policy
  snapshot.js     league fetch + cache + the as-of stamp + mergeAsOf
  weekly.js       projections + schedule, on their own longer TTL
  season.js       every regular-season week's matchups, on a third TTL
  teams.js        resolveTeam — one definition, three tools
  limit.js        concurrency gate + retry/backoff
  config.js       league / identity / TTLs, env-first
  register.mjs    the extensionless-import resolver hook
  loader.mjs      (the hook itself)
  tools/
    getRoster.js  findSellHigh.js  recommendFreeAgents.js
    resolveAssets.js  analyzeTrade.js  lineupAdvice.js
    playoffOdds.js
```

Tests live with the rest of the suite: `mcpLimit`, `mcpSnapshot`, `mcpWeekly`,
`mcpSeason`, `mcpStore`, `mcpHttp`, `mcpOauth`, and one file per tool
(`mcpGetRoster`, `mcpFindSellHigh`, `mcpRecommendFreeAgents`,
`mcpResolveAssets`, `mcpAnalyzeTrade`, `mcpLineupAdvice`, `mcpPlayoffOdds`),
plus `tests/leagueState.test.mjs` and `tests/playoffOdds.test.mjs` for the join
and the model this all rests on. The tool suites share
`tests/helpers/mcpFixtures.mjs` — one synthetic league, because several tools
read the same object and divergent copies is the drift prerequisite C removed
from `src/`. `npm run lint` covers
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
- **Season TTL ~60 min — a THIRD domain, not an alias of the weekly one.** A
  completed week is frozen forever, and the model *discards* a partially-played
  one (a week counts only when every team has scored), so the odds output moves
  **once a week**. It is its own constant so that re-deriving `weekly.js`'s
  number — which is argued from projection drift — can never silently move
  this one. Per-week cache keys, so one bad bucket degrades alone.
- **Fourteen empty weeks and a season that has not started are identical on
  the wire.** So a total matchup-fetch failure is reported as
  `available: false` / `reason: 'unavailable'`, never as a preseason. The app
  rejects for the same reason, so League › Playoffs shows an `ErrorState`
  instead of a confident "the season hasn't started".
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
- **The cache backend is now a parameter** (`mcp/store.js`). stdio keeps
  `memoryStore()` — process-global, the app's hook-singleton pattern, and
  correct here (1ms cached against a 658ms cold assembly). The HTTP transport
  passes a KV-backed store instead. The freshness POLICY is shared by both, in
  one `loadSource`, because two copies of the stale-fallback contract is the
  drift prerequisite C removed from `src/`.
  Two traps it exists to hold, both pinned by `tests/mcpStore.test.mjs`:
  **a store-level TTL would break the stale-fallback contract** (an entry
  evicted at the TTL leaves nothing to serve when the upstream fails, turning
  a usable 20-minute-old answer into a cold throw — so `STORE_GC_SECONDS` is
  7 days and freshness is decided from `fetchedAt`), and **the 1.20MB trimmed
  player DB must be gzipped into KV** (208KB/180KB compressed; `node:zlib` is
  built in, so no dependency).
- **The schedule is the ONE Sleeper endpoint not under `/v1`**, and its fields
  are `home`/`away`, not `home_team`/`away_team`. Both mistakes fail
  **silently** as "no games", which reads as "every team is on bye".
  `weekly.js` owns both and `tests/mcpWeekly.test.mjs` pins each.
- **The history walk is narrow, and a future tool must widen it deliberately.**
  `mcp/history.js` fetches leagues + rosters + drafts + picks — 14 requests
  against `useLeagueHistory`'s ~169 — because draft grading reads none of the
  weekly transaction buckets that make up the difference. A manager-scouting
  tool needs the trade ledger and therefore needs those buckets; widen it
  there with its own argument for the cost, and keep pairing this walk with
  `buildDraftGrades` rather than `buildManagerProfiles`, whose empty ledger
  would read as "this manager has never traded".
- **`asOf.sources` is a CLOSED zod schema.** A new source that is not declared
  in `server.js`'s `asOfSchema` makes a real MCP client reject the whole
  response with *"must NOT have additional properties"* — and lint, the full
  test suite and a clean build all pass it, because the tests call the tool
  builders directly and never cross the wire. It has now caught three real
  bugs; verify over the transport, not only under test.
- **The four static feeds are not parameterized.** `news.json`,
  `values-history.json`, `trade-values.json` and `rookie-intel.json` are
  published from this repo's own branches. A second league gets working
  rosters, values and trades — but no news, sparklines or rookie research.
  No tool reads them yet; the ones that will must degrade cleanly and say so.

## Auth (phase 2)

OAuth 2.1, with this server as both resource server and authorization server
and **GitHub as the upstream identity provider**. Claude's connector UI is
OAuth-only — there is no static-token path — and the MCP spec requires RFC
9728 discovery, PKCE and audience-bound tokens.

**It is stateless**, because serverless has nowhere to keep state. Two facts
make that possible: **the signed `client_id` IS the registration** — dynamic
client registration exists (RFC 7591, and Claude's connector uses it: without
it the connector reported *"Couldn't start sign-in"* before a browser ever
opened), but `mintClientId` signs the redirect URIs into the id, so any
instance honours what any other issued with nothing stored — and **everything
else is signed rather than stored** (an HMAC over a payload; any instance
verifies what any other minted). The signing key is HKDF-derived from `GITHUB_CLIENT_SECRET`, so
there is no second secret to manage, and no JWT library is used — the token
has no `alg` header, so there is no algorithm confusion to defend against.
All 25 auth tests run with no `node_modules`.

**What it costs, stated rather than hidden:** a token cannot be revoked before
it expires (so they live 1 hour; rotating the GitHub secret invalidates all of
them at once), and an authorization code cannot be marked used (so replay is
bounded by its 60-second life). **PKCE is therefore not defence in depth here,
it IS the defence** — `S256` required, `plain` refused.

**The load-bearing control is redirect-URI validation.** With no client
registry, an exact-hostname origin allowlist (`claude.ai`, `claude.com`,
loopback) replaces the spec's pre-registered values. It is checked before
anything is minted, and it fails to an error page rather than a redirect —
redirecting an unvalidated URI is the attack. `tests/mcpOauth.test.mjs` is
written as attacks rather than happy paths.

**The server refuses to start without `GITHUB_CLIENT_SECRET`**: no key means
no authentication or a guessable one, and a failed deploy beats an open
endpoint.

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
- **The KV backend is WRITTEN BUT NOT VERIFIED against a live store.**
  `restKvStore` speaks the generic Redis-over-HTTP command form
  (`POST <url>` with `["GET", key]`) that Upstash and its work-alikes serve,
  and it round-trips through a fake transport in the tests — but no hosted KV
  has been provisioned, so under `dynastyedge-validation-and-qa`'s evidence
  bar this is synthetic-only and does **not** count as done. The vendor
  specifics are confined to one function: a different KV is a different
  `command`, not a change anywhere else.
- **`restKvStore` does not use `fetchJSON`, deliberately.** `fetchJSON` is
  GET-only with no headers and no body, so it structurally cannot issue an
  authenticated POST; teaching it to would change the app's 21-line wrapper to
  serve a server's needs, the exact trade `limit.js` already declined. The
  rule that wrapper enforces — a hung request must never hang the caller — is
  kept here with the same AbortController discipline. It also deliberately
  skips the concurrency limiter: that gate protects Sleeper's rate budget, and
  a cache read queueing behind the API calls the cache exists to avoid would
  be backwards.
- **Phase 2 is done and connected.** Host: Vercel (`api/mcp.js` is a committed
  esbuild bundle, because Vercel *traces* rather than bundles and detects
  functions from the **source** tree — `ci.yml` rebuilds and diffs it, so a
  stale bundle fails CI). The three findings that each cost a deploy cycle are
  in CLAUDE.md's Deployment section; read them before touching the packaging.
- Still open: `myDraftGrade` and `partnerActivity` on `analyze_trade` (each
  needs a fetch beyond the snapshot — the league-history walk and the
  transaction feed), `MCP_DISCOVERY.md` §5's remaining phase-two tools (trade
  targets, manager scouting, rookie research), and `/league/{id}/winners_bracket`,
  which no code here has ever called.
