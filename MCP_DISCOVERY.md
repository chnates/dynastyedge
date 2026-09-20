# MCP_DISCOVERY.md — design spec for a DynastyEdge MCP server

> **Status: discovery complete, nothing built.** This document is the output of a
> read-only investigation (2026-09-19) plus an owner interview. It exists so a
> fresh session can start implementing without re-deriving the codebase.
>
> **Goal:** ask DynastyEdge questions in plain English from the Claude apps —
> including mobile — and get answers grounded in live Sleeper data and this
> app's own analysis, not general knowledge.
>
> Every claim below cites the file it came from. Where something was **not**
> verified, it says so.

-----

## 1. The decisions (owner-confirmed, 2026-09-19)

| Question | Decision | Consequence |
|---|---|---|
| How does the server reuse the analysis code? | **Same repo, `mcp/` imports `src/utils` directly** | Forces three prerequisite refactors *in the app* (§4). Zero drift: one definition of a trade verdict. |
| Where does it run? | **Serverless (Workers/Vercel class) + OAuth, single user** | Only shape that reaches the mobile app. Serverless has no warm process, so the snapshot cache wants external KV, not module memory. |
| How fresh must answers be? | **~15-minute snapshot TTL, background refresh** | One assembly per conversation instead of five. |
| What on an API failure? | **Serve cache, label the age in the output** | Every tool response carries an explicit as-of timestamp. This is the primary defence against silent wrongness (§7). |
| How are players named in a trade? | **`resolve_assets` first, then grade on IDs only** | Costs a round-trip; makes grading the wrong player structurally impossible. |
| How does it sit in the repo's "no backend" contract? | **Full citizen** — CLAUDE.md section, same `ci.yml` gates, tools get tests | `@modelcontextprotocol/sdk` goes through change control. CLAUDE.md's no-backend framing needs an explicit amendment, not a quiet contradiction. |
| League / identity scope | **Parameterized from day one** | Cheap for analysis (nothing in `src/utils` reads `LEAGUE_ID`), but does **not** parameterize the static feeds (§6). |
| Weekly projections | **Yes — the free-agent tool carries this week's Sleeper projection** | Commits the projections fetch, which in turn makes lineup advice nearly free. |
| Lineup advice | **In the first release, as tool #6** | One extra fetch (the NFL schedule) beyond what projections already cost. |

Two facts the owner confirmed rather than chose:

- **Weekly tools are in-season only.** Projections do not exist in the offseason.
  A weekly tool must say so rather than return zeros — the same contract
  `LineupOptimizer` already honours.
- **Sleeper's API is read-only.** The server can say exactly what to start and
  what sitting pat costs in points. It can never set a lineup, accept a trade,
  or place a waiver claim. The user still taps it into Sleeper.

-----

## 2. What the app is, in one paragraph

React 19 + Vite 6 SPA, **plain JavaScript with no TypeScript anywhere**,
HashRouter, Tailwind 3, deployed to GitHub Pages at base path `/dynastyedge/`
on every push to `main` via `.github/workflows/deploy.yml`, gated by
lint + test + build. No backend, no database, no server. Runtime dependencies
are React, React DOM, React Router and `@dnd-kit/*` (`package.json:11-20`).
191 commits between 2026-07-19 and 2026-09-13, 140 by Claude and 51 by the
owner (`git shortlog -sne`), in four dense bursts separated by weeks of silence.

**Secrets: effectively none.** No `.env`, no `dotenv`, no `VITE_*`.
`import.meta.env` appears three times and is always `BASE_URL`. Every data
source is unauthenticated. The only secret in the project is `CFBD_API_KEY`, an
Actions repo secret used by two manual diagnostic jobs in
`.github/workflows/rookie-intel.yml:40-41,57-58`; it never reaches `src/`.
What *is* hardcoded and shipped is identity, not credentials: `LEAGUE_ID`,
`MY_ROSTER_ID`, `MY_USERNAME`, `MY_TEAM_NAME` (`src/constants.js:1-10`).

-----

## 3. Data layer — what the server must re-do

Four external sources, all unauthenticated:

- **Sleeper** (`https://api.sleeper.app/v1`, plus `SLEEPER_ROOT` without `/v1`
  for the one schedule endpoint that 404s under `/v1` — `src/constants.js:17`).
  League settings, rosters, users, traded picks, NFL state, drafts, matchups,
  transactions, projections, stats, and the ~5–8MB full player DB.
- **FantasyCalc** `/values/current` with four frozen params
  (`isDynasty=true&numQbs=2&numTeams=10&ppr=0.5`, `src/constants.js:43-48`).
  **This is the join bridge**: Sleeper returns numeric player IDs only,
  FantasyCalc rows carry `sleeperId`.
- **Unofficial ESPN** — per-player news fallback, degrades silently.
- **Four static JSON feeds** on `raw.githubusercontent.com` off orphan branches
  (`news-data`, `values-history`, `rookie-intel`), published by three cron
  workflows. This is the project's existing answer to "we need a server": do it
  in GitHub Actions and publish a file.

**Every fetch goes through `src/utils/fetchJSON.js` — 21 lines.** An
`AbortController` timeout (15s default), JSON parsing, HTTP-status errors. **No
retry, no backoff, no 429 or `Retry-After` handling, and no concurrency limiter
anywhere in the codebase.** A 429 surfaces as a generic error and, at the many
`.catch(() => [])` sites, is swallowed as "no data".

Caching in the app is per-page-load module-level singletons (~20 modules holding
`let moduleCache` / `fetchPromise` pairs — `usePlayerDB.js:10-11`,
`useFantasyCalc.js:5-7`, `matchupWeeks.js:20-23`), with in-flight dedupe and a
30-minute focus refetch (`src/App.jsx:49`). Nothing is persisted; there is no TTL.

**Volumes the server must respect:**

| Path | Requests |
|---|---|
| Cold start of the home screen | ~47 |
| `useLeagueHistory` (Manager Scouting) | **~169 concurrent** — 8 past seasons × 20 calls, unthrottled |
| One player profile, cold | ~8 |

Sleeper's published guidance is under 1,000 calls/minute. Fine for one phone;
a server plus an eager model is a different traffic shape. **Add a concurrency
limiter before the history path ever runs server-side.**

-----

## 4. Business logic — and the three things blocking reuse

**~6,000 lines of analysis live in `src/utils/` as plain functions, and 27 of
30 import cleanly under plain Node today** (verified empirically during
discovery by importing each under the repo's own resolver hook). No util
touches `window`, `document` or `localStorage`. The sole browser API is
`fetch`/`AbortController` in `fetchJSON.js`, native on Node 18+. No
`Math.random` — the Monte Carlo uses a seeded mulberry32 (`playoffOdds.js:113`).
Essentially no input mutation. One ambient clock read (`edgeBriefing.js:127`).

**There is already a working proof of this.**
`.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/run-model.mjs`
imports `playoffOdds.js`, `dynastyTrajectory.js` and `tradeAnalysis.js` under
Node and has a `--live` mode that fetches real Sleeper + FantasyCalc data. Read
it before writing anything — it is most of the feasibility spike.

### Prerequisite A — move two symbols (trivial, ~10 minutes)

The three files that fail to import — `tradeAnalysis.js`, `recommendations.js`,
`edgeBriefing.js`, i.e. the highest-value modules in the repo — fail for one
reason: three import lines reaching into hooks for two symbols.

| File:line | Imports | From |
|---|---|---|
| `src/utils/recommendations.js:16` | `getTeamName` | `../hooks/useLeague` (which imports React at `:1`) |
| `src/utils/edgeBriefing.js:6` | `getTeamName` | same |
| `src/utils/edgeBriefing.js:10` | `MIN_SPARKLINE_POINTS` | `../hooks/useValueHistory` (React at `:1`) |

`getTeamName` (`useLeague.js:254-257`) is a four-line pure string function.
`MIN_SPARKLINE_POINTS` (`useValueHistory.js:54`) is `= 4`. **Move both into
`src/utils/`, retarget three imports, and the entire analysis layer is
React-free.** Note `useLeague.js` also transitively loads `useIdentity.js`,
which reads `localStorage` at module scope (`:25`) behind a `try/catch` — so
under Node it degrades *silently* to "logged out" rather than throwing, which
is the worse failure mode.

### Prerequisite B — extract `buildLeagueState` (~140 lines, mandatory)

**This is the real blocker.** Every analysis function expects an object that
exists nowhere except a `useMemo` in `src/hooks/useLeague.js:31-173`. It joins
five sources into:

```
league = { allRosters, myRoster, userMap, leagueInfo, pickYears }
```

Each roster (`resolveRoster`, `useLeague.js:148-164`):

```
{ rosterId, owner, players[], picks[], totalValue, faabBudget, faabRemaining,
  faabSpent, record{wins,losses,ties}, hasRecord, pointsFor, pointsAgainst,
  pickCapitalScore, avgStarterAge, starterOrder[] }
```

Each player (`:101-115`) — **this shape is neither Sleeper's nor FantasyCalc's**:

```
{ sleeperId,          // ALWAYS String() — normalization is load-bearing (:70-72)
  name, position, team, age, value, overallRank, positionRank, trend30Day,
  unranked,           // true ⇒ identity from playerDB, value 0 (:88-99)
  isStarter, isTaxi, isIR }
```

Each pick (`:118-131`): `{ season, round, originalOwner, slot, slotLabel, value }`.

The good news: every helper this assembly calls (`resolvePickOwnership`,
`findExactSlotValue`, `buildDraftSlots`, `slotForRound`,
`computePickCapitalScore`, `resolvePickYears`) already lives in React-free
utils. **Only the orchestration is trapped.** Lift it to a pure
`buildLeagueState({ sleeperData, fcValues, playerDB, myRosterId, leagueId })`.

### Prerequisite C — one shared free-agent pool util

There is **no shared definition of "who is a free agent"**. It is built
independently in `src/components/roster/FreeAgentsView.jsx:161-265` and again in
`src/utils/edgeBriefing.js:139-147`. The server must not become a third copy.
Extract one util, and carry the app's standing rule with it: **a defense is
never offered as a general pickup** (League Context — exactly one is ever
rostered; `recommendFreeAgents` scores in dynasty value and FantasyCalc ranks
zero defenses).

### Smaller extractions, per tool

- `processWeeks` (`src/hooks/usePlayoffOdds.js:17-48`, ~32 lines) — splits
  fetched matchups into completed scores and remaining schedule. Needed before
  `simulatePlayoffs` can be called. A week counts complete only when *every*
  team has scored (`:33`).
- The multi-season history assembly (`src/hooks/useLeagueHistory.js:23-102`,
  ~80 lines) — the only definition of the shape `buildManagerProfiles` eats.
  Phase two.

### Logic that is stranded and would need new work

- ~200 lines of depth-room / usage / recent-games derivation in
  `src/hooks/usePlayerIntel.js` — no util home.
- ~100 lines of per-player grading in
  `src/components/shared/PlayerProfileDrawer.jsx:18-117` (A–D opportunity grade,
  role description, comparables).
- A second, independent win-window model in
  `src/components/roster/RosterAnalysisSheet.jsx:24-31` that does not agree with
  and does not call `rosterAnalysis.assignWinWindowTiers`.

**Components are overwhelmingly orchestration, not logic.**
`src/components/trade/TradeAnalyzer.jsx` contains zero domain math — eleven
`useMemo`s assembling arguments and calling the utils. **Read it as the worked
example of how an MCP tool should call the analysis layer.**

-----

## 5. The tools

Build in this order. Each row names what it reuses and what must exist first.

| # | Tool | Question | Inputs | Output | Reuses / needs |
|---|---|---|---|---|---|
| 0 | *(infra)* | — | — | — | **Prerequisites A + B.** Nothing below works without them. |
| 1 | `get_roster` | "What's on my team?" / "Show me Jake's roster." | `team` (name or roster id, defaults to configured identity) | Players with value, ranks, trend, IR/taxi flags; picks with slot labels; totals, FAAB, record, win-window tier | `buildLeagueState` + `rosterAnalysis.getWinWindowTier`. Proves the whole fetch→assemble→summarize chain. |
| 2 | `find_sell_high` | "Who's my best sell-high candidate?" | none | Risers at surplus positions, buy-low targets at deficits, underperforming opponent, with reasons | `edgeBriefing.computeEdgeSignals` + `recommendations.suggestSellMove` (which returns a concrete partner and return, not just "shop him"). Needs prerequisite A. |
| 3 | `recommend_free_agents` | "Who should I pick up and why?" | optional `position`, optional `limit` | Ranked available players with plain-English reasons, **dynasty value AND this week's Sleeper projection** | `recommendations.recommendFreeAgents` + prerequisite C + `weeklyProjections`. In-season only for the projection column. |
| 4 | `resolve_assets` | *(support)* "Which Bijan?" | free-text names | Candidate matches with team, position, current value, owning roster | `buildLeagueState` + the player DB. **Always called before #5.** |
| 5 | `analyze_trade` | "Grade this trade." | `give[]`, `get[]` (resolved IDs only), `partner` | Verdict, reasoning, value split, both-seat appeal, landing spots, fair band, counter suggestion, pitch text | `tradeAnalysis.analyzeTrade` → `getTradeVerdict` → `adjustVerdictForInjuries` → `getCounterSuggestion` → `buildTradePitch`. Mirror `TradeAnalyzer.jsx:141-256`. |
| 6 | `lineup_advice` | "What do I start, and what's it costing me?" | optional `week` | Moves with per-move gain, confidence %, must-fix flags, total points left on bench | `lineupMoves.buildLineupMoves` — pure, heavily tested. Needs projections (already committed), player DB, and the schedule for byes **and locks**. |

> **This table is the original plan, kept as the record. Two tools shipped
> beyond it** — `get_playoff_odds` (phase 2a, the first "deferred" item below)
> and `get_player_news` (phase 2c). CLAUDE.md's **The MCP Server** section is
> the live truth for all eight; this section is what was specified on
> 2026-09-19.
>
> **Row 6 gained a requirement that was not foreseen here, and it cost a wrong
> answer to find.** "The schedule for byes" is incomplete: the same payload's
> `status` field says whether a game has kicked off, and Sleeper **seals a
> lineup slot at kickoff**. Without it the tool recommended benching a player
> whose game had finished three days earlier and counted the points as
> recoverable. A weekly tool needs the schedule for byes AND locks, and the
> live box score (`players_points`) to price a slot that is already settled.

**Phase two, deliberately deferred:** playoff odds (**shipped, phase 2a** —
cheap once `processWeeks` was lifted, which became
`playoffOdds.buildPlayoffOutlook`), trade targets / fair packages
(`getTopTradeTargets` + `suggestFairPackage` — note this is the ~730ms path
in-app), manager scouting (biggest fetch burst), rookie research.

**Not foreseen here and shipped anyway: reading the static feeds.** §6 treats
the Actions-published branches as app-only. `get_player_news` reads
`news.json`, which is what makes "should I start Bowers?" answerable without a
second lookup — and it keeps the app's own Class B contract (a miss is
`available: false` with a note, never an error and never "there is no news").

### The one question that is NOT answerable today

**"Who won our league in 2023?"** `grep` for `winners_bracket` across `src/` and
`scripts/` returns nothing. `useLeagueHistory.js:58-75` fetches past seasons'
users, rosters, transactions and drafts — so **final regular-season records and
points-for are available, but the champion is not.** Answering it requires
`/league/{id}/winners_bracket`, an endpoint this app has never called.

-----

## 6. Architecture

**Two layers, two transports.** A thin `mcp/` layer owns fetching, caching,
auth and tool schemas; it imports the analysis layer rather than copying it.
Two entry points — stdio for desktop and local iteration, streamable HTTP for
the hosted deployment. Tool implementations are identical; only transport
differs. A local stdio server alone was rejected because **it cannot serve the
Claude mobile app**, which is the stated requirement.

**On the extensionless imports:** `src/` uses Vite-style extensionless relative
imports — 482 of them — which plain Node rejects. The repo solves this for tests
with a 23-line resolver hook
(`.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/loader.mjs`) that
appends `.js` when the file exists. For a *deployed* service, a bundling step is
probably cleaner than shipping a hook out of a skills directory — esbuild and
Vite both resolve extensionless specifiers, which is why the app builds at all.
**This was NOT tested during discovery. Verify it in the first spike.**

**On caching:** serverless has no warm process, so the 15-minute snapshot wants
an external store (KV or equivalent) rather than module memory. Note also that
the app's ~20 module-level singletons are **process-global** in Node — harmless
for one user, wrong the moment a second league or user exists, which the
parameterization decision makes reachable.

**On parameterization, one honest limit:** parameterizing `leagueId` does not
parameterize the four static feeds, which are published from
`raw.githubusercontent.com/chnates/dynastyedge/*` for *this* repo only
(`src/constants.js:25-41`). A second league would get working rosters, values,
trades, lineups and odds — but no news, no sparklines, no rookie research.
Design those tools to degrade cleanly and say so, rather than pretend.

-----

## 7. Risks

**The one that matters most: there is no schema validation anywhere in this
codebase, and an LLM front end turns that from a visible failure into an
invisible one.** No TypeScript, no `tsconfig`, zero `@param {` JSDoc, no
zod/valibot/ajv, no PropTypes — all four searches came back empty. Every
external payload is consumed unvalidated. In the app, a Sleeper shape change
produces a visibly broken screen. Through MCP it produces a confident, fluent,
wrong answer. **Mitigation: every tool output carries provenance** — an as-of
timestamp, counts, and explicit `unranked` / `no projection` / `offseason`
flags — so a wrong answer at least looks wrong.

Others, in order:

- **No rate-limit handling of any kind.** Add a concurrency limiter and 429
  backoff in the `mcp/` layer before the history path is ever wired.
- **Module-level singletons are process-global** — see §6.
- **Response size.** The player DB is 5–8MB and the FantasyCalc payload is
  large. Tools must return bounded, summarized projections, never raw payloads.
- **Zero component test coverage** (all 74 `.jsx` files) is not a server risk
  directly, but note `useLeague.js` — the code prerequisite B extracts — has no
  tests either. The extraction should arrive with them.
- **Governance drift.** Adding a hosted service to a repo whose contract is
  static-site-no-backend is a real departure. The owner chose to make it a full
  citizen; hold that line.

-----

## 8. Open questions

1. **Deployment mechanism** — most naturally a GitHub Actions job on push to
   `main`, matching how everything else here ships. Not yet designed.
2. **Does the bundling approach actually work** for `src/utils` under esbuild?
   Untested (§6).
3. **Projections TTL.** `weeklyProjections.js:13-15` records that Sleeper
   rewrites that endpoint in place, so a long-lived session holds stale numbers.
   Whether projections deserve a shorter TTL than the 15-minute league snapshot
   is unresolved.
4. **CLAUDE.md amendment wording** — the no-backend framing needs an explicit
   revision, not a silent contradiction. Belongs in the first implementation PR.

-----

## 9. How this was verified

Read-only session, 2026-09-19. No code was written, no packages installed, no
commands run that changed state. `node_modules` was absent throughout, so
`npm test` and `npm run build` were deliberately **not** run.

Claims were grounded by reading files directly (`src/constants.js`,
`src/utils/fetchJSON.js`, `src/context/LeagueContext.jsx`,
`src/hooks/useLeague.js`, `src/utils/lineupMoves.js`,
`.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/{reg,loader,run-model}.mjs`)
and by three parallel read-only sweeps over the data layer, the `src/utils`
import graph, and code health / build / history. The "27 of 30 utils import
cleanly" figure was measured by importing each module under Node with the
repo's resolver hook, not inferred.

**Not verified and flagged as such:** the esbuild bundling approach; anything
requiring the app to run; live payload sizes.
