# `mcp/` — the DynastyEdge MCP server

Ask DynastyEdge questions in plain English from the Claude apps, answered from
live Sleeper data and **this app's own analysis code** rather than general
knowledge.

Design spec: [`../MCP_DISCOVERY.md`](../MCP_DISCOVERY.md). Read it first — this
file covers only what is built.

**Phase 1 (this): the prerequisite refactors plus one tool over stdio.**
Remote transport, OAuth and deployment are phase 2 and deliberately absent.

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
| `DYNASTYEDGE_SNAPSHOT_TTL_MS` | `900000` (15 min) | Snapshot cache TTL |
| `DYNASTYEDGE_CONCURRENCY` | `6` | Max in-flight upstream requests |

Every tool also takes `leagueId` per call; these are only the fallbacks.

## Tools

| Tool | Question | Status |
|---|---|---|
| `get_roster` | "What's on my team?" / "Show me Jake's roster." | **built** |
| `find_sell_high`, `recommend_free_agents`, `resolve_assets`, `analyze_trade`, `lineup_advice` | — | phase 1b, `MCP_DISCOVERY.md` §5 |

## Layout

```
mcp/
  stdio.js        entry point — stdio transport
  server.js       the McpServer: tool schemas and wiring, no domain math
  snapshot.js     fetch + cache + the as-of stamp
  limit.js        concurrency gate + retry/backoff
  config.js       league / identity / TTL, env-first
  register.mjs    the extensionless-import resolver hook
  loader.mjs      (the hook itself)
  tools/
    getRoster.js  tool #1
```

Tests live with the rest of the suite: `tests/mcpLimit.test.mjs`,
`tests/mcpSnapshot.test.mjs`, `tests/mcpGetRoster.test.mjs`, plus
`tests/leagueState.test.mjs` for the join this all rests on. `npm run lint`
covers `mcp/`, and `npm test` / `npm run build` gate it exactly as they gate
`src/`.

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

## Behaviour worth knowing

- **Snapshot TTL ~15 min.** One assembly per conversation instead of five.
  Measured on the live league: cold call 539ms, cached call 3ms.
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
