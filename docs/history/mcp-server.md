# History — The MCP Server (`mcp/`)

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## The MCP Server (`mcp/`)

**Purpose:** ask DynastyEdge questions in plain English from the Claude apps,
including mobile, and get answers grounded in live Sleeper data and **this
app's own analysis code** — not general knowledge. Design spec and the
owner-confirmed decisions: `MCP_DISCOVERY.md`.

**Status: phase 2c — LIVE and CONNECTED at `https://dynastyedge-mcp.vercel.app/mcp`.**
**Thirteen** tools answer over **both** transports: stdio for local runs,
streamable HTTP for the Claude apps, authenticated by GitHub against a
single-account allowlist. Six are `MCP_DISCOVERY.md` §5's set; the seventh,
`get_playoff_odds`, came with phase 2a (2026-09-20) alongside the wiring that
put `analyze_trade`'s Layer 3 on live odds. The eighth,
**`get_player_news`**, came with phase 2c (2026-09-20) alongside game locks in
`lineup_advice` — the first tools to read one of the Actions-published static
feeds. The ninth, **`find_trade_targets`** (2026-09-22), is the first of §5's
three deferred phase-two tools and the question that comes *before*
`analyze_trade`: the server could grade a trade you had already thought of and
could not answer *"who do I call about?"*. The tenth, **`research_rookies`**
(2026-09-22), is the second of the three and the second static feed the server
reads (`rookie-intel.json`): it answers the question a dynasty value cannot —
*"which rookies become something, and which should I take?"*. The eleventh,
**`scout_managers`** (2026-09-22), is the last of the three: Trade › Managers
for the chat, on a history walk widened **openly** as its own function so the
narrow one `analyze_trade` reads stays exactly as it was. The twelfth,
**`get_league_results`** (2026-09-22), answers the one question
`MCP_DISCOVERY.md` §5 recorded as unanswerable — *"who won our league in
2023?"* — from `/league/{id}/winners_bracket`, the first call this repo has
ever made to it. The thirteenth, **`get_value_history`** (2026-09-25), reads
the last of the four static feeds (`values-history.json`) and answers *"how
has his value moved?"* by the same rule the app's sparklines draw by.

Phase 1 shipped the three prerequisite refactors plus `get_roster`; phase 1b
added `find_sell_high`, `recommend_free_agents`, `resolve_assets`,
`analyze_trade` and `lineup_advice`, plus the weekly data layer the last three
share. Phase 2 added the swappable cache backend (`store.js`), the HTTP
transport (`http.js`), stateless OAuth 2.1 (`oauth.js` / `oauthRoutes.js` /
`app.js`) and the Vercel packaging (`api/mcp.js`, `vercel.json`).

**All SEVEN tools confirmed in the connector's own tool list, 2026-09-20** —
the owner's phone, after phase 2b deployed (phase 2c's `get_player_news` and
2026-09-22's `find_trade_targets`, `research_rookies`, `scout_managers` and
`get_league_results` make twelve, 2026-09-25's `get_value_history` thirteen,
and the same re-check is owed after each deploys): Grade a trade · Find a sell-high
candidate · Rest-of-season playoff odds · Get a team roster · Weekly start/sit
advice · Recommend free agents · Resolve player and pick names to ids. That is
the end of the chain no probe can reach — what the client actually enumerates
after discovery, registration and OAuth.

**Verified through Claude's own connector, 2026-09-19** — not a probe, the real
client: added as a custom connector, GitHub login completed in a browser, and
`find_sell_high` returned the live answer (sell Jaxson Dart to Crippled Gang
for Chris Olave, filling the WR deficit) with all three sources stamped fresh.
That is the whole chain — discovery, self-registration, OAuth, transport,
cache, tools — exercised end to end by the thing it was built for.

**Two tools are IN-SEASON ONLY**, and both say so rather than returning zeros:
`lineup_advice` entirely, and `recommend_free_agents`' projection column.

**It is a full citizen, not a side project** (owner decision, `MCP_DISCOVERY.md`
§1). `npm run lint` covers `mcp/`, `npm test` covers its logic, and `ci.yml` /
`deploy.yml` gate it exactly as they gate `src/`. The no-backend framing at the
top of this file is amended explicitly rather than quietly contradicted.

**`@modelcontextprotocol/sdk` is the first new runtime dependency since the
`@dnd-kit` trio, and it is OWNER-APPROVED (2026-09-19, PR #56).** Change
control reserves that call for the owner
(`dynastyedge-change-control` §2 rule 5) — do not treat this as precedent for
the next dependency, which needs its own approval.

It is the reference implementation of the protocol's JSON-RPC framing,
handshake and capability negotiation — a hand-rolled version would be ~150
lines whose whole job is to match a spec we do not control. It brings `zod`,
which the server uses for tool input **and output** schemas, and that is a
genuine gain against the risk in §7 below: it is the first schema validation
anywhere in this repo. **It never reaches the web bundle** — nothing in `src/`
imports `mcp/`, verified by a byte-identical `dist` (995,441 bytes) across the
install.

### Architecture — two layers, and the dependency runs one way

`mcp/` owns fetching, caching, rate discipline and tool schemas. It **imports**
`src/utils` and never copies it, so there is exactly one definition of a
roster, a value, or a verdict, and the app and the server can never disagree.
`src/` imports nothing from `mcp/`.

A tool is **orchestration only** — assemble arguments, call the utils, bound
and stamp the result. `src/components/trade/TradeAnalyzer.jsx` is the worked
example: eleven `useMemo`s and zero domain math. **Any math a tool needs is
written in `src/utils`, where the app gets it too.**

```
mcp/
  stdio.js      entry point (stdio transport)
  server.js     the McpServer: tool schemas + wiring, no domain math
  snapshot.js   league fetch + ~15-min cache + the as-of stamp + mergeAsOf
  weekly.js     projections + schedule, on their OWN ~60-min TTL
  season.js     every regular-season week's matchups, on a THIRD TTL
  liveScores.js this week's box score, on a FIFTH and DELIBERATELY SHORT TTL
  news.js       the aggregated player-news feed + the id-only matcher
  feeds.js      rookie-intel + trade-values + values-history — the other static feeds, Class B
  history.js    the league-history walk: NARROW (analyze_trade) and WIDE (scout_managers)
  transactions.js  the current season's transaction feed, on a SPLIT TTL
  results.js    every season's playoff bracket, on top of the NARROW walk
  teams.js      resolveTeam — shared by get_roster, analyze_trade, lineup_advice
  limit.js      concurrency gate + retry/backoff
  config.js     league / identity / TTLs, env-first
  register.mjs + loader.mjs   the extensionless-import resolver hook
  tools/
    getRoster.js  findSellHigh.js  recommendFreeAgents.js
    resolveAssets.js  analyzeTrade.js  lineupAdvice.js
    playoffOdds.js    playerNews.js  findTradeTargets.js
    researchRookies.js  scoutManagers.js  leagueResults.js
    valueHistory.js
```

### The HTTP transport (phase 2) — stateless, by necessity

`mcp/http.js` exposes `createMcpHandler()`, which returns a **Web-standard
`(Request) => Promise<Response>`** — the signature Vercel Functions,
Cloudflare Workers, Deno and Bun all take, so the host stays a *packaging*
decision rather than a code one. `createServer()` was already
transport-agnostic, so **no tool was forked**: stdio and HTTP expose the same
tools, pinned by test — the assertion lists them by name, so adding one to
`createServer` and forgetting the transport fails the suite rather than
shipping a fork.

**THE TRAP: a session held in RAM is exactly what serverless cannot keep.**
The SDK's streamable transport can run session-ful — it mints a session id and
expects later requests on it to reach the *same process*. A serverless host
gives no such guarantee, and the failure is **intermittent**: it works in
testing, where one warm instance serves everything, and breaks in production
under the conditions hardest to reproduce. So the transport runs **stateless**
(`sessionIdGenerator: undefined`, `enableJsonResponse: true`), a fresh server
and transport per request, and `tests/mcpHttp.test.mjs` asserts no
`mcp-session-id` header is ever minted. Same reasoning as `store.js`: anything
remembered between requests must live where a second instance can see it.

**The limiter is hoisted to module scope, deliberately.** A per-request server
would mint a per-request rate limiter, handing every concurrent request the
full budget — precisely what `mcp/limit.js` exists to bound. `createServer`
now takes `fetcher` and `store` so a warm instance shares one of each.

**The gate fails CLOSED.** An authenticator that throws returns 500, never
200; a falsy or `ok: false` result is a 401; and **every POST is
authenticated**, so a session cannot be established once and then trusted. A
401 carries `WWW-Authenticate: Bearer resource_metadata="…"` (RFC 9728) so a
client is told where to authenticate rather than merely refused. `GET` is a
liveness probe that reports only that the process is up — a test asserts it
leaks no roster, player, value or league data, because an unauthenticated read
would defeat the gate.

**Verified over the real transport against the live league** (2026-09-19, a
real MCP client over `StreamableHTTPClientTransport`): health 200;
unauthenticated POST 401 with the discovery header; `tools/list` → the full
tool set (six at the time; eight since phase 2c);
`get_roster` 509ms cold / 11,312B, Nix Cage 0-1, 31 players + 12 picks, slots
STARTER 11 · BENCH 13 · TAXI 5 · IR 2, total 86,090, value rank 3, window
Middle, all three `asOf` sources stamped and not stale, one unranked player at
`value: null` (rule 7). Then `resolve_assets` in **21ms** — the store survived
across separate HTTP requests, which is what the `store.js` refactor was for —
returning **six candidates for "Brown" and refusing to match**, byte-matching
the behaviour phase 1b measured over stdio.

### The auth model (phase 2) — OAuth 2.1, and STATELESS

`mcp/oauth.js` (crypto + policy) and `mcp/oauthRoutes.js` (the five endpoints)
make the server both the OAuth **resource server** the MCP spec requires and
its own **authorization server**, with **GitHub as the upstream identity
provider**. `mcp/app.js` composes them in front of the MCP handler.

**The spec's own words:** *"Authorization is OPTIONAL… Implementations using
an HTTP-based transport SHOULD conform."* Conforming means RFC 9728 protected
resource metadata, RFC 8414 AS metadata, PKCE, RFC 8707 resource indicators
and audience-bound tokens. Claude's custom-connector UI is OAuth-only; there
is no static-token path.

**Normally that needs three kinds of durable state, and serverless has none.
Two facts remove the need:**

1. **DYNAMIC CLIENT REGISTRATION, WITHOUT A REGISTRY.** The first cut had no
   `/register`, reasoning that RFC 7591 is a SHOULD and that Claude's
   "Advanced settings" pre-registration is the spec's named alternative.
   **That was wrong in practice, and it is the one mistake here that a user
   actually hit:** Claude's connector registers itself, and with no
   registration endpoint it reported *"Couldn't start sign-in"* before a
   browser ever opened. A missing SHOULD is not a missing nicety when the
   client implements it.
   A registry is the one piece of OAuth state that genuinely must persist —
   **unless the `client_id` IS the registration.** `mintClientId` signs the
   redirect URIs into the id, so `/authorize` recovers them by verifying a
   MAC and any instance honours what any other issued, with nothing stored.
   **The origin allowlist binds at registration**, so a signed id can only
   ever name URIs that already passed it: registration widens *who may ask*,
   never *where a code may be sent* — and a registered client is then held to
   the exact URIs it registered, which is stricter than the allowlist alone.
   The client stays **public** (`token_endpoint_auth_methods_supported:
   ['none']`) — OAuth 2.1 allows that precisely when PKCE protects the
   exchange, and a secret would guard nothing PKCE plus the GitHub login plus
   the allowlist do not.
2. **EVERYTHING ELSE IS SIGNED, NOT STORED.** An authorization code and an
   access token are each a payload plus an HMAC. Verification is recomputing
   the MAC, so any instance verifies what any other minted.

**The signing key is DERIVED, so there is no second secret to manage.**
`crypto.hkdfSync` over `GITHUB_CLIENT_SECRET` with a distinct `info` string —
independent by construction, not reversible to the secret.
`DYNASTYEDGE_TOKEN_SECRET` overrides it if a dedicated key is ever wanted.

**No JWT library, deliberately.** `jose` ships as a transitive dep of the SDK,
but a transitive dep is one upstream release from vanishing and rule 5 says
write the ~30-line version first. The token is `base64url(payload).base64url(hmac)`
and deliberately **not** a JWT: no `alg` header means no algorithm confusion
and no `alg: none` to remember to reject. Measured payoff — all 25 auth tests
run with no `node_modules` (see the npm-ci block).

**What signed-not-stored COSTS, stated rather than buried:**

- **A token cannot be revoked before it expires**, so access tokens live
  **1 hour**. Revocation in practice is rotating the GitHub client secret,
  which changes the derived key and invalidates everything at once.
- **An authorization code cannot be marked used**, so replay is bounded by its
  **60-second** life rather than prevented. **PKCE is therefore not defence in
  depth here — it IS the defence**, which is why `S256` is required and
  `plain` is refused (under `plain` the challenge equals the verifier, so
  whoever holds the code holds everything needed to redeem it).

Both are acceptable for one user. Neither would be for a multi-tenant server —
that wants the KV the caching layer deliberately does not need.

**TWO DISCOVERY DETAILS ARE EASY TO GET WRONG AND FAIL SILENTLY.** Both did.
`resource` in the protected-resource document MUST be the **canonical URI of
the MCP server, path included** — returning the bare origin meant it did not
match the `/mcp` URL the user actually typed. And RFC 9728 §3.1 puts the
document for a resource with a path at
**`/.well-known/oauth-protected-resource/mcp`**, not only at the bare
well-known path; serving only the latter returned a 404 that nothing logs and
nobody reads. Both paths are now served and both name the same canonical
resource. The access-token audience accordingly accepts **both spellings of
this server** — `${origin}/mcp` and the bare origin — and nothing else.

**THE LOAD-BEARING CHECK IS REDIRECT-URI VALIDATION.** The spec: *"Authorization
servers MUST validate exact redirect URIs against pre-registered values."* With
no registry, an **origin allowlist** replaces it — `claude.ai`, `claude.com`
and loopback — matched on **exact hostname**, so `evil.claude.ai` and
`claude.ai.evil.com` both fail. It is checked **before anything is minted**,
and a failure renders an error page rather than redirecting: *redirecting an
unvalidated URI is the attack.* Everything else (bad PKCE, wrong client)
bounces an OAuth error to the client, because by then the redirect is vetted.

**Three more things the tests pin as attacks, not happy paths:** a token
minted for another audience is refused (the confused-deputy problem); **the
allowlist is re-checked on every request, not only at login**, so a token
minted before it changed stops working immediately; and the `kind`
discriminator keeps the three token types apart, so an access token cannot be
redeemed as an authorization code or vice versa.

**GitHub is asked for NO scopes.** The upstream token is read once to learn
the login, then discarded — never stored, never returned to the client, never
forwarded. The spec forbids passing an upstream token through, and the
cleanest way to honour that is to hold nothing worth passing.

**The server refuses to start without `GITHUB_CLIENT_SECRET`** — no key means
either no authentication or a guessable one, both worse than a failed deploy.

**Verified end to end against the flow Claude actually performs** (2026-09-19,
only GitHub's identity call faked): no-token → 401 with the discovery header →
the protected-resource document at **both** paths, naming the canonical
`/mcp` resource → AS metadata → **self-registration (201, no secret issued)** →
authorize → GitHub with `scope=""` → callback → code to
`claude.ai/api/mcp/auth_callback` with state echoed → token (Bearer, 3600s) →
**authenticated `get_roster` against the live league in 608ms** (Nix Cage,
86,090, rank 3, 31 players, 12 picks, stamped and not stale) → a tampered
token 401s → an unknown path 404s without reaching the transport.

### Deployment (phase 2) — LIVE at `dynastyedge-mcp.vercel.app`

Vercel project `dynastyedge-mcp` in team `dynastyedge`, deployed from this
repo. `api/mcp.js` is the function; `vercel.json` rewrites every path to it.

**The GitHub integration was connected 2026-09-20, and before that date it did
not exist** — so every deploy through phase 2b was a manual push, and merging
to `main` deployed the app and left the server on old code. Phase 2a shipped
that way for an hour. It matters here because the failure is **silent**: a
manual API deploy stamps branch and commit metadata, so the dashboard reads
exactly like auto-deploy. The three tells, if it is ever disconnected again:
`main` carries **no Vercel commit status**, `github-pages` is the only GitHub
deployment environment, and a **feature-branch** commit shows
`target: production` (integration sends non-default branches to *preview*).
The manual path — a `gitSource` deployment against the public repo, which
needs no integration — remains the fallback. See `docs/archive/open-items-2026.md` MCP-2b.

**Three findings cost a deploy cycle each, and none was guessable from the
docs. They are recorded because the next person will hit the same three.**

1. **Vercel detects functions from the SOURCE tree, not from build output.**
   With `api/` gitignored, a build that produced `api/mcp.js` deployed a
   static page and **no function** — `x-vercel-error: NOT_FOUND` on every
   route. Worse, **that deployment reported `readyState: READY` and
   `type: LAMBDAS`**, so "the deploy succeeded" is not evidence a function
   exists. Curl the route.
2. **Vercel TRACES module dependencies; it does not bundle them.** A
   three-line `api/mcp.js` re-exporting `../mcp/vercelEntry.js` deployed a
   function that crashed on invocation, because Node's ESM resolver — unlike
   esbuild and Vite — does not append `.js` to the extensionless relative
   imports `src/utils` uses. **This is the same resolver gap `npm run mcp`
   needs its `--import` hook for, reappearing at the host.** So the esbuild
   output is **committed** (`scripts/build-mcp.mjs` → `api/mcp.js`, 1.6MB):
   the file verified locally is byte-for-byte the file that runs.
   **`ci.yml` rebuilds and diffs it on every push**, because a stale bundle
   would mean the deployed server runs older logic than the repo describes —
   exactly the drift the "`mcp/` imports `src/utils`, never copies it" rule
   exists to prevent.
3. **The host may invoke a Node function with EITHER calling convention.**
   Handed Node's `(IncomingMessage, ServerResponse)` rather than a Web
   `Request`, `new URL(req.url)` throws — `req.url` is a bare path with no
   origin — and it surfaced as a bodiless platform 500. `vercelEntry.js`
   detects the shape with one property check instead of betting on a runtime;
   `mcp/http.js` stays Web-standard, which is what keeps the host a
   *packaging* decision.

**Nothing reaches an opaque platform 500 any more.** A missing secret, an
unresolvable module and a runtime fault inside a tool each answer with a body
naming the cause — message only, never a stack, which on a public endpoint
leaks paths and module layout for no benefit. That mattered concretely:
**Vercel's runtime logs return 403 to the deploy tooling**, so an opaque 500
is a dead end, and the server had to be made to explain itself.

**THE GITHUB INTEGRATION DEPLOYS EVERY BRANCH, INCLUDING THE DATA BRANCHES —
and that cost is invisible until you look at the deployment list.** Connecting
the integration on 2026-09-20 fixed the silent no-deploy problem below and
immediately created a new one: `news.yml` force-pushes `news-data` **twice an
hour**, so the project started building a preview deployment on every push —
serving a JSON file nobody requests — plus one each for `values-history` and
`rookie-intel`. Measured 2026-09-21: three of the last four deployments were
`news-data` "Update news feed" commits, each a ~2-second no-op build.
**Volume is ~9 a day, not the ~48 the cron implies**, because GitHub delivers
that schedule at ~5.5–7.4 runs/day (see the news pipeline section). Smaller than
it first looked, and still pure waste.

**The fix is a PROJECT-LEVEL Ignored Build Step, not `vercel.json`, and the
reason is worth keeping.** `git.deploymentEnabled` is the documented way to
turn a branch off — but Vercel reads `vercel.json` from **the branch being
pushed**, and the three data branches are single-commit force-pushes carrying
**only their JSON file** (verified: `news-data` holds `news.json` and nothing
else). A `git` block on `main` would therefore be a **dead no-op that reads
like a fix**. So the rule lives in the project's `commandForIgnoringBuildStep`
instead, where no branch can fail to carry it:

```sh
case "$VERCEL_GIT_COMMIT_REF" in news-data|values-history|rookie-intel) exit 0 ;; *) exit 1 ;; esac
```

Exit 0 skips the build, exit 1 proceeds — so `main` and every `claude/*`
feature branch are untouched. **It is a Vercel dashboard setting, so it is
invisible in this repo and this paragraph is its only record.** If data-branch
builds ever reappear in the deployment list, that setting is what was lost.

**Vercel's deployment protection does NOT cover the production alias.**
Deployment-specific URLs redirect to a Vercel login; `dynastyedge-mcp.vercel.app`
does not. So **the OAuth gate is the only thing in front of this endpoint** —
there is no second layer, and any change to it is a change to the only lock.

**Verified from the public internet 2026-09-19**, not from a sandbox: an
unauthenticated `tools/call` returns **401** with the `WWW-Authenticate`
discovery header and no data; a made-up bearer token **401**; an unknown path
**404**; a hostile `redirect_uri` (`evil.example`) **403 with no `Location`
header at all**; a lookalike host (`evil.claude.ai`) **403**; PKCE `plain`
bounced as `invalid_request`; and a valid authorize request redirects to
GitHub with **`scope=`** empty and the callback matching the registered URI.

Run it with `npm run mcp`. The `--import ./mcp/register.mjs` hook is
**mandatory**: `src/utils` uses Vite-style extensionless relative imports that
plain Node cannot resolve. The hook is a deliberate copy of the test suite's —
a runnable server must not depend on a file inside `.claude/skills/`.
**For a deployed server the answer is bundling, and it is verified**
(2026-09-19, closing `MCP_DISCOVERY.md` §8 question 2): esbuild, already
present via Vite, bundles `mcp/stdio.js` plus all of `src/utils` into one
1.4MB ESM file that boots with no hook at all. Not shipped as a build step —
that is phase 2.

### The three non-negotiables for every tool

Each answers a specific risk in `MCP_DISCOVERY.md` §7. They are enforced in
`mcp/snapshot.js` and pinned by tests.

1. **Every response carries an as-of timestamp.** This is the single most
   important rule here. **There is no schema validation anywhere in this
   codebase** — no TypeScript, no JSDoc types, no zod in `src/`, no PropTypes
   — so every external payload is consumed unvalidated. In the app a Sleeper
   shape change produces a *visibly broken screen*. Through an LLM it produces
   a *confident, fluent, wrong answer*. Provenance is the mitigation: a
   per-source `fetchedAt` / `ageSeconds` / `stale` / `error` stamp, plus
   counts, plus explicit `unranked` and `isOffseason` flags, so a wrong answer
   at least **looks** wrong. `asOf.oldestSourceAt` is the **stalest**
   contributing source, never the newest — an answer is only as fresh as its
   worst input.
2. **Bounded output.** The player DB is 5–8MB and the FantasyCalc payload is
   large. Never return a raw payload: cap every list, report the true count
   beside the capped one, and disclose the truncation in `notes`.
   `get_roster` caps at 60 players / 40 picks and answers in ~9KB.
3. **`leagueId` and `rosterId` are parameters, not constants.** `constants.js`
   hardcodes one league and one owner because the app is one person's phone; a
   server must not. Both are per-call arguments, defaulting to
   `DYNASTYEDGE_LEAGUE_ID` / `DYNASTYEDGE_ROSTER_ID` and only then to the
   constants.

### Caching and freshness

**~15-minute snapshot TTL** (`DYNASTYEDGE_SNAPSHOT_TTL_MS`) — one assembly per
conversation instead of five, because a model asks four follow-ups about the
same roster. Measured on the live league: **cold 539ms, cached 3ms**.

**On an upstream failure, serve the cache and label its age.** Per source, with
the error attached. A *cold* failure with nothing cached still throws — that is
a real "I don't know", and inventing an answer there is the failure this whole
design guards against.

**FantasyCalc values and the player DB are cached ACROSS leagues**; only league
data is keyed by `leagueId`. The player DB is 5–8MB — a second league must not
re-download it. It is also **best-effort**: without it, rostered players
FantasyCalc doesn't rank are absent rather than shown with `—` (exactly how the
app behaves before that background fetch lands), and a note says so.

**The BACKEND is a parameter; the POLICY is shared (`mcp/store.js`, phase 2).**
`snapshot.js` and `weekly.js` each kept their own module-level Maps *and* their
own verbatim copy of `loadSource` — correct for a long-lived stdio process,
where a cached snapshot resolves in **1ms against a 658ms cold assembly**, and
impossible for the serverless HTTP transport, which has no warm process to hold
a Map. Both now call one `loadSource(store, key, ttlMs, load)`. stdio keeps
`memoryStore()` and is unchanged. **HTTP in production ALSO runs
`memoryStore()` — no KV is wired** (corrected 2026-09-25: this line said "HTTP
passes a KV-backed store", which was the design, never the deployment).
`vercelEntry.js` calls `createApp()` with no `store`, and nothing reads a KV
environment variable, so the cache lives in the warm instance and a cold start
refetches — measured at 21ms for a second request on a warm instance, which is
why KV was never needed. `restKvStore` exists, is tested against a fake
transport, and has **never run against a live store**; see
`docs/open-items.md` MCP-CARRY for what verifying it would take. Two copies of
the stale-fallback contract was the same drift prerequisite C removed from
`src/`, so the refactor *deletes* a duplicate rather than adding a layer.

**Trap 1 — a store-level TTL would silently break provenance.** `loadSource`
reads the cached entry **even when it is expired**; that is precisely what
makes "serve the cache and label its age" work. Set a Redis-native `EX` to the
TTL and that path loses its fallback: a Sleeper outage at minute 16 throws a
cold "I don't know" where today it returns a usable 20-minute-old answer
stamped `stale: true`. **Freshness is decided in `loadSource` from `fetchedAt`,
never by the store**; `STORE_GC_SECONDS` (7 days) is eviction so a store cannot
grow forever, and is set far longer than any TTL a caller will pass.
`tests/mcpStore.test.mjs` pins the trap by modelling an evicting store and
asserting it throws where a keeping store answers.

**Trap 2 — the player DB must be compressed going into KV.** Measured live
2026-09-19: the whole snapshot serialises to **1.37 MB**, of which the trimmed
player DB is **1.20 MB** — at or over the per-value limit of a typical hosted
KV. Gzipped they are **208 KB** and **180 KB**. `node:zlib` is built in, so
entries are gzip+base64 on the way out and inflated on the way back for no
dependency, fewer bytes, and no size question. **Re-measured 2026-09-25 and it
has grown:** the trimmed player DB entry (three injury/ESPN fields added in
phase 2c) is **2.0 MB raw → 303 KB as the stored gzip+base64 string** — the
number a KV's per-value limit actually applies to, and a third larger than the
gzip figure because base64 is. The value-history feed entry is 262 KB → 108 KB.

**`fetchedAt` must round-trip byte-for-byte.** It is the provenance the whole
design rests on — it becomes `asOf.sources[*].fetchedAt` and feeds
`oldestSourceAt`. A store that rounds or drops it breaks non-negotiable 1, so
the round trip is pinned by test rather than assumed.

**A store failure degrades an answer to "slower", never to "broken".** A failed
read is a cache miss; a failed write is dropped, because the answer was already
correct before it. **That guard lives in `loadSource`, not only inside a
well-behaved backend** — the first cut awaited `store.set` unguarded and a
throwing write killed an already-fetched answer, which is what the test caught.

### Rate discipline lives in `mcp/`, never in `fetchJSON`

`src/utils/fetchJSON.js` is a ~30-line AbortController timeout and
**nothing else** — no retry, no backoff, no 429 handling — and there is no
concurrency limiter anywhere in the app. That is fine for one phone making ~47
calls on a cold start; it is not fine for a server driven by an eager model,
where `useLeagueHistory`'s path alone fires **~169 concurrent** requests
against Sleeper's published guidance of under 1,000/minute.

`mcp/limit.js` wraps `fetchJSON` with a **process-wide** concurrency gate
(default 6, shared across tool calls so three simultaneous tools don't get 3×
the budget) and bounded exponential backoff with full jitter. **Retries only
408/425/429/5xx — a 404 is an answer, not a failure**, and retrying one just
spends the rate budget.

Putting any of this in `fetchJSON` would change the *app's* behaviour to fix a
*server* problem. Don't.
**`Retry-After` is honoured (2026-09-25) — without `fetchJSON` retrying.**
This was the known limit here: `fetchJSON` discarded the `Response`, so a
429's advice was unreachable. The fix is **additive and app-neutral**:
`fetchJSON` attaches `status` and the raw `retryAfter` header to the `Error` it
already threw, with the **message byte-identical**. Proved by the suite, not by
reading: all 801 pre-existing test results were identical with the change in
place and before `limit.js` was touched. `limit.js` parses both RFC 9110 forms
(delta-seconds and HTTP-date; a date in the past means now; anything else —
`"-5"`, `"1.5"`, `"soon"` — falls back to the jittered schedule exactly as
before), **caps the wait at `MAX_RETRY_AFTER_MS` (4s)** so an hour-long advisory
cannot hold a serverless invocation open (the retry may 429 again, and
`MAX_ATTEMPTS` then surfaces it), and still never retries a 404, advice or
not. `isRetryable` prefers the attached `status` and keeps the message regex
for an error that did not come through `fetchJSON`'s `!ok` branch.
`get.stats().advised` counts the retries that followed a server's advice.
(A browser only exposes `Retry-After` cross-origin when the server lists it in
`Access-Control-Expose-Headers`; the app reads neither field, so that changes
nothing there.)

### Tool 1 — `get_roster`

"What's on my team?" / "Show me Jake's roster." Takes `team` (team name,
manager username, or roster id; defaults to the configured identity),
optional `leagueId`, optional `refresh`. Returns every player with value,
overall and positional rank, 30-day trend and **STARTER / BENCH / TAXI / IR**
slot; every pick owned with its exact slot label where the draft order is
known; plus total value with league value rank, win-window tier
(`rosterAnalysis.getWinWindowTier`), record and FAAB.

- **It never guesses which team you meant.** An ambiguous or unknown name
  returns the candidate list and `ok: false`. This is the same discipline §1
  sets for `resolve_assets` — picking the wrong team is the same class of
  error as grading the wrong player.
- **The manager-handle match reads `display_name`, because Sleeper's
  `/league/{id}/users` returns NO `username` field** — verified live
  2026-09-19, where all 10 users carry a `display_name` and none carries a
  `username`. Phase 1 matched on `username` alone, so the advertised handle
  path could never fire and every candidate list rendered a bare `@`. Fixed
  in phase 1b when `resolveTeam` moved to `mcp/teams.js`, which is why it is
  fixed for three tools at once. `getTeamName` had always used the same
  `display_name || username` fallback; the resolver simply had not.
- **Rule 7 holds end to end:** an unranked player is returned with
  `value: null` **and** `unranked: true`, never 0 — "unpriced" must not read
  to a model as "worthless" — and renders as `—`. A roster with no games
  played reports `record: null`, not an 0-0 result.
- **Taxi and IR are their own slots**, because they sit *outside* the 24
  active spots: a taxi player is unavailable, not bench depth.
- Picks report `pricing: 'exact-slot' | 'round-median'` so the reader knows
  which they are looking at.

### Caching the weekly data — a DIFFERENT TTL, deliberately

`mcp/weekly.js` owns this week's projections and the NFL schedule, and caches
them for **60 minutes** (`DYNASTYEDGE_WEEKLY_TTL_MS`) — four times the league
snapshot's 15, not the same number inherited.

They are different freshness domains. **League data changes on an EVENT**: a
trade or a waiver claim lands at an arbitrary moment and changes a roster
completely, so 15 minutes bounds how long the server can be wrong about who
owns whom. **Projections change on a DRIP**: `weeklyProjections.js:13-15`
records the measurement — Sleeper rewrites `/projections/.../{week}` in place,
and 6 of 9,419 entries moved between two fetches ten hours apart, 0.06%.
Refetching a 1–2MB payload every 15 minutes buys a change that measurably
almost never happens.

Two things keep the longer TTL honest:

- **`mergeAsOf` recomputes `oldestSourceAt` and `stale` over the UNION** of
  sources, so a 50-minute-old projection drags the whole answer's stated age
  down with it instead of hiding behind a fresh roster fetch. A tool that
  added a source without re-deriving those two would quietly overstate its own
  freshness.
- **`refresh: true`** forces a refetch. Near kickoff a late inactive can move
  a number faster than the drip rate, and the tool descriptions say so.

### Tool 2 — `find_sell_high`

"Who's my best sell-high candidate?" No arguments. `edgeBriefing.computeEdgeSignals`
+ `recommendations.suggestSellMove`.

- **The point of the tool is that it names a CONCRETE partner and a CONCRETE
  return**, not "shop him to someone". `suggestSellMove` scores every opponent
  on three roster facts — do they need the position, would he actually
  **start** for them (`buildValueLineup`), and do they own a comparable-value
  player at one of **my** deficit positions — so a needy team holding nothing
  I want loses to a slightly-less-needy one that can pay. Measured live
  2026-09-19: sell Jaxson Dart (+796 at a surplus QB) to Crippled Gang for
  Chris Olave, filling the WR deficit.
- It also returns the **buy-low** target to spend the sale on and the
  **underperforming opponent** (record rank trailing value rank by ≥ 4).
- **`watchlist` is passed empty on purpose.** It is a browser concept
  (localStorage, Feature 8) with no meaning on a server, and it only ever
  *adds* radar rows, which this tool does not use.
- **"There is no sell-high right now" is an ANSWER**, and the notes say which
  condition produced it — no riser at a surplus position, or no surplus at
  all — rather than returning an empty field that reads as a data gap.
- The copy states that acceptance is **not modelled**, per the standing ruling
  (`docs/analysis/trade-structure-stability-2026-08.md`).

### Tool 3 — `recommend_free_agents`

"Who should I pick up and why?" Optional `position` and `limit` (default 8,
max 25). `recommendations.recommendFreeAgents` over prerequisite C's
`buildFreeAgentPool`.

- **A DEFENSE IS NEVER A GENERAL PICKUP, and the rule holds by construction.**
  `buildFreeAgentPool` cannot return one; getting a defense requires calling
  `buildAvailableDefenses` by name. This tool calls only the former and does
  **not** route around it — there is no `position: 'DEF'` escape hatch. Asking
  for DEF returns the measured explanation (one DEF slot, no dynasty value,
  streaming worth **−0.00 pts/wk** over 408 team-weeks) **plus the incumbent
  defense and its projection**, because "should I replace the one I have?" is
  the one real question and refusing without answering it would be unhelpful.
- **Two axes, and the projection never enters the ranking.** Dynasty value and
  this week's projection correlate at only **r = 0.427**, and three of the
  dynasty top ten project 0.0 (rookies who won't play). `recommendFreeAgents`
  scores in dynasty value; the projection rides beside it as context, with the
  measured tier caveat (a 0–2 projection is a 0.9% chance of a 15+ point game;
  6–8 is 10.6%).
- **In-season only for the projection column.** The offseason reports
  `projectedPoints: null` with `projections.reason` naming why — **never 0**,
  which would read as "not worth starting". A *failed* in-season fetch reports
  a different reason, so the two are distinguishable.
- **Every row carries `faabBid` (OPEN-3, 2026-10-07)** — `{ bid, tier, label,
  pctOfBudget, capped, expectedWin, unavailable, reasons }` — and the answer
  carries a `faab` block (`budget`, `remaining`, `week`, `multiplier`,
  `calibration`). **Orchestration only**: the tool calls
  `utils/faabBid.js`'s `recommendFaabBid` with the period from
  `readFaabPeriod` and the week from `nflState`, so it quotes exactly the bid
  League › Free Agents shows. The notes carry the calibration label and the
  batch-trap warning. A league reporting no budget yields `bid: null` on every
  row, never an assumed scale. Both new fields are **declared in the zod
  output schema** (the closed-object trap) and were verified through a real
  MCP client, not only by the unit tests.

### Tool 4 — `resolve_assets`

*(support)* "Which Bijan?" Free-text names in, candidates out. **Always called
before `analyze_trade`.**

- **The load-bearing behaviour is that an ambiguous name resolves to NOTHING.**
  `match` is non-null only on a unique hit; anything else returns
  `candidates` and no match. It never prefers the higher-valued of two.
  Measured live: **"Brown" returns six candidates** — Amon-Ra St. Brown, Chase
  Brown, A.J. Brown and three free agents — which is precisely the case an LLM
  would otherwise resolve fluently and wrongly.
- **It resolves PICKS too** ("2027 1st", "2027 first", "2026 1.05", "2027
  round 2"), because "my 2027 1st" is exactly what a person types into a
  trade. A pick's id is **`season-round-originalOwner`** — byte-identical to
  what `TradeAnalyzer.jsx:38` builds, so an id resolved here round-trips into
  `analyze_trade` and dedupes against the app's own assets. An unqualified
  "2027 1st" is ambiguous by however many teams own one (live: ten).
- Rule 7 applies to search: an unranked stash and a defense are **findable**,
  with `value: null`.
- Free agents are included by default and flagged `isFreeAgent`.

### Tool 5 — `analyze_trade`

"Grade this trade." `give[]` / `get[]` as **resolved ids only**, plus
`partner`. Mirrors `TradeAnalyzer.jsx:141-256`: `analyzeTrade` →
`getTradeVerdict` → `adjustVerdictForInjuries` → `getCounterSuggestion` →
`buildTradePitch`.

- **IDS ONLY, ENFORCED IN CODE — this is the whole point.**
  `MCP_DISCOVERY.md` §1: *"resolve_assets first, then grade on IDs only —
  costs a round-trip; makes grading the wrong player structurally
  impossible."* A free-text name is **rejected with a pointer to
  `resolve_assets`**, never guessed at, **even when it happens to be
  unambiguous** — the tool does no name matching at all. Grading the wrong
  Mike Williams produces a fluent, confident, completely wrong verdict that
  nothing downstream can catch.
- **An asset's price is read from the OWNING roster, never from the caller**,
  and the side is checked: a player who is not on my roster cannot be on the
  `give` side. Ids accepted are a numeric Sleeper player id or
  `SEASON-ROUND-OWNERROSTERID`.
- Surfaces the verdict + reasoning, the value split, **both seats' appeal**
  (`myFit` and `partnerFit` off the one `buildSideFit` engine), landing spots
  both directions, the fair band, the counter suggestion and the pitch.
- **`concerns` is a SUBSET of `reasons`** — `buildSideFit`'s `against()`
  helper pushes to both — so a renderer must mark the overlap, not print the
  two arrays in sequence. Doing the latter states every objection twice.
- **`fairBand`'s field is `inside`, not "inBand", and `buildTradePitch`
  returns `{ text, lines, bullets }`, not a string.** Both were wrong on the
  first cut and both were caught by the zod **output** schema before they
  reached a reader — the concrete first payoff of the validation §7 asked for.
- **Layer 3 is scored on LIVE PLAYOFF ODDS in season, exactly as the app
  scores it, and the response SAYS which basis ran** (`winWindow.basis`:
  `'odds'` in season, `'tier'` in the offseason or when the schedule would not
  load). Odds track the starting lineup at Spearman 0.988 against the tier's
  0.721. *This bullet said "tier" until 2026-09-25* — that was the phase-1b
  truth, superseded the day phase 2a wired `myPlayoffPct`; the detail is in
  **Layer 3 now scores on LIVE ODDS in `analyze_trade`** below. Naming the
  basis is what stops a reader assuming the stronger one when the fallback ran.
- **All eight of `analyzeTrade`'s optional signals are now wired** (phase 2b,
  2026-09-20). `myPlayoffPct` came with phase 2a and is the only one that
  moves a **score**; `partnerActivity` and `myDraftGrade` are context, and the
  notes carry each one's own disclaimer so a reader cannot mistake either for
  a factor. Each is fetched **only when it can matter** — the activity read
  needs a partner, the draft nudge only ever speaks when picks are coming
  back — so an ordinary player-for-player grade costs what it always did.
- A **one-sided** trade is a valid state, not an error: totals render and the
  verdict is `null`, the app's own gate.

### Tool 6 — `lineup_advice`

"What do I start, and what's it costing me?" Optional `week` and `team`.
`lineupMoves.buildLineupMoves` — pure, five plain args, heavily tested.

- **IN-SEASON ONLY, and it is the one tool that is dead half the year.** The
  offseason returns `ok: false` with `unavailable: true` and
  `reason: 'offseason'` — **no summary, no moves, no zeros**. A lineup of
  zeros would read as "nobody is worth starting", which is a different and
  false claim. A failed projections fetch reports
  `reason: 'projections-unavailable'` instead, so "we don't know" is
  distinguishable from "there is nothing to know".
- **THE SCHEDULE IS THE ONE SLEEPER ENDPOINT NOT UNDER `/v1`** (`SLEEPER_ROOT`)
  and its fields are **`home`/`away`**, not `home_team`/`away_team`. Both
  mistakes fail **silently** as "no games", which reads as "every team is on
  bye" and would have this tool confidently benching a healthy lineup.
  `weekly.js` owns both, and `tests/mcpWeekly.test.mjs` pins each one —
  including that the wrong field names yield an empty set.
- **An empty `playingTeams` means "byes unknown", never "everyone is on
  bye"** — `getAvailability` only calls a bye when the set is non-empty, so a
  failed schedule degrades the advice and says so rather than inverting it.
- **A must-fix carries NO confidence, by rule.** A bye / Out / IR / empty slot
  scores 0 *by rule*, not by projection, so the measured hit-rate curve
  (n = 666,026) has no "higher-projected player" question to answer there.
  The engine sets `confidence: null` and the tool passes the null through.
- **`confidencePct` is a PERCENTAGE (0–100) and is the ONLY confidence field.**
  `confidenceForGap` returns `65.3`, not `0.653` — the app renders it directly
  as `m.confidence.toFixed(0)%`. Carrying both a `confidence` and a
  `confidencePct` is what produced *"6530% likely to be the right call"* on the
  first cut, so there is one field and its name carries the unit.
- **A blocked starter contributes 0** to the current total whatever Sleeper
  still projects for him; `projected` and `effective` are both reported so the
  difference is visible.
- **Coin-flip moves are demoted, never dropped.** Sub-1-point swaps are 52/48,
  but the headline is optimal − current, so hiding one would leave points
  unexplained. They ship with `meaningful: false`.

### Tool 7 — `get_playoff_odds`

"Am I making the playoffs, and should I be buying or selling?" Optional `team`,
`leagueId`, `refresh`. `playoffOdds.buildPlayoffOutlook` — the same
rest-of-season Monte Carlo League › Playoffs runs, over `mcp/season.js`'s
matchup weeks.

- **THREE STATES, AND ONLY ONE OF THEM HAS ODDS.** `active` is the real thing.
  `complete` is deterministic 100%/0% and says so. **`preseason` returns
  `playoffPct: null` and a strength-ranked PREVIEW**, never a fabricated
  percentage and never 0 — a 0 reads as "eliminated". Same discipline
  `lineup_advice` keeps about the offseason.
- **A posted-but-unplayed schedule is `active`, not `preseason`**, and the
  distinction is load-bearing: the model simulates Week 1 off the
  roster-strength prior alone, which is what makes this useful before a game is
  played. Conflating the two would replace real odds with a ranking. Only a
  season with **no schedule at all** is preseason.
- **A total matchup-fetch failure is NOT a preseason** — fourteen empty weeks
  and a season that has not started are identical on the wire. The tool returns
  `ok: false` with `reason: 'unavailable'`, mirroring the app's rejection that
  makes League › Playoffs show `ErrorState` instead of a fake preseason.
- **`seedDist` is computed and deliberately not returned** (n² numbers), and
  the notes say it was dropped — absence must not read as "the model does not
  compute it". `avgSeed` and `topSeedPct` summarise it.
- `getDeadlineVerdict` supplies the stance, so this tool **cannot disagree with
  `analyze_trade` about your own buyer/seller read**.
- The notes state the baseline: this league seats **6 of 10, so 60% is the
  coin-flip number, not 50%** — a bubble team's percentage has to be read
  against that.

Measured live 2026-09-20 (2026 Week 2): **948ms cold, 71ms cached, 6,152B**.
Nix Cage 58.1%, projected 6.5-7.5, average seed 5.9 — "On the bubble", which at
a 60% baseline is exactly what it should read. Σ odds across the field
**600.3%** against the 600% the field size demands.

### Tool 8 — `get_player_news`

"What's the latest on Bowers?" / "Who on my team is hurt?" Optional `player`,
`team`, `limit`, `refresh`. Reads Sleeper's injury fields plus the
Actions-published news feed.

**It exists because of a measured failure.** Asked whether to start Brock
Bowers, the server answered with the bare word `Doubtful` and advised checking
Sleeper — while the player DB it already held said **"Knee - Meniscus,
Surgery"** and the feed it did not read carried a RotoWire item from four hours
earlier headlined **"Brock Bowers: Trending toward Week 3 return"**. Every part
of the answer was already in the building.

- **`injury_body_part`, `injury_notes` and `espn_id` joined the player-DB
  trim.** Three fields, no extra request, and they are what turn a label into
  an answer: "Doubtful" sends a reader to Sleeper, "Doubtful · Knee - Meniscus
  · Surgery" tells them the season is the question rather than the afternoon.
- **A free-text name is allowed here, unlike `analyze_trade`** — asking about
  Bowers should not cost a round trip — but it resolves through the **same
  `buildResolveAnswer`**, so an ambiguous name returns candidates and refuses.
  Verified live: **"Brown" returns six and refuses to match.**
- **The join is `playerIds`, and there is deliberately NO headline-name
  fallback.** The pipeline already name-matched server-side with the whole
  player DB in hand; a weaker second attempt here could only add the errors the
  first one avoided. The collision is real, not hypothetical: the live player DB
  holds **two "DJ Moore"s** — `4961` (CB) and `4983` (the WR on this roster).
- A **roster sweep leads with the hurt players**, then recency — recency alone
  buries the one name the reader most needs under blurbs about healthy
  starters. A player with no status and no items is omitted, not padded.
- **Silence is reported as a gap in coverage, never as good health.** "No
  covered source has written about him recently" is a statement about our data;
  "he is fine" would be a statement about the world.

**It rides along in two other tools, which is the point.** `lineup_advice`
attaches injury detail and the latest items to every **flagged** player (a
healthy starter needs no beat report, and 24 of them would blow the
bounded-output rule to say nothing), and `get_roster` carries the detail plus a
single headline on any player Sleeper has a status for. The reader never has to
know to ask — which was the complaint that produced the tool.

### Tool 9 — `find_trade_targets`

"Who should I call about, and what would it cost?" Optional `position`,
`limit`, `team`, `leagueId`, `refresh`. `rosterAnalysis.getTopTradeTargets` +
`tradeAnalysis.suggestFairPackage` — the same two functions Trade › Targets
runs, so the board on the phone and the answer in the chat cannot disagree.

**It exists because the server could grade a trade and not find one.**
`analyze_trade` answers a question you have already had; this answers the one
before it. `MCP_DISCOVERY.md` §5 deferred it to phase two noting the ~730ms
in-app path, and OPEN-10 then rebuilt exactly the fields that make it worth
returning — `inFairBand`, both seats' appeal, and `alternative` with its
`premiumPct`.

- **Every row carries BOTH seats and whether the offer is one the Analyzer
  will call fair.** A package that reaches the band is the *default*, not a
  hope: `suggestFairPackage` is held inside `buildFairBand` since OPEN-10, and
  `inFairBand: false` means nothing you can spare reaches it — an honest
  near-miss rather than a silent overpay.
- **`alternative`'s premium is the most actionable field on most rows, and
  that is a property of fair pricing, not a defect.** A fairly-priced offer
  gives the other manager no edge on value, so a `Weak for them` is common and
  the premium that would change it is the negotiating information. Measured
  live on the owner's board: **6 of 8** read Weak to the partner, and the
  notes say why rather than leaving a reader to infer a search failure.
- **The position filter pushes INTO the ranking, never onto the returned
  rows.** `getTopTradeTargets` slices to a limit before anything downstream
  sees it, so filtering the slice answers *"which of your top few are RBs?"*
  and reads as *"who do I call about at RB?"* — and can come back empty when
  the real answer is a full board. This is the team filter's own ruling
  (Feature 3) applied to the other argument; `position` is a new **additive**
  option on `getTopTradeTargets`, and nothing in `src/` passes it — the app's
  chips still filter the visible 20, which is right for a board you can see
  all of.
- **It never guesses which team you meant** (`team`), and scouting your own
  roster is refused rather than answered with an empty board.
- **A pick's id is READ OFF THE ASSET, never recovered from its label.**
  `suggestFairPackage` carries the `season` / `round` / `originalOwner` triple
  that *is* the id — see Feature 3's note on why the label cannot be reversed.
  The first cut of this tool built a label index and refused an ambiguous one,
  which was right for the shape it had; carrying the identity is better,
  because it makes the ambiguity **impossible rather than detectable**. A pick
  missing part of the triple still reports `id: null` and points at
  `resolve_assets` — kept as a guard, not as the mechanism.
- **Bounded output, and the cap can never out-run the app.** Default **8**,
  max **20** — the app board's own depth — with `counts.board` reporting the
  full ranked total beside the returned slice and the truncation disclosed in
  `notes`. Only the returned rows are priced, which is also what bounds the
  cost.
- **It does NOT grade**, and says so: hand `package.assets[].id` plus the
  target's `sleeperId` to `analyze_trade` for a verdict. Running
  `analyzeTrade` per row is the 1.5s path the extraction of `buildPartnerFit`
  exists to avoid.

Measured live over the real transport (2026 Week 3): **927ms cold / 268ms
cached at the default 8 (17,240B)**, 722ms / 36,297B at `limit: 20`, 132ms for
a scoped scout, 18ms for a refused team name. Top of the owner's board: Malik
Nabers for Gunnar Helm + Rachaad White + Jordan Love (6,260, inside the band),
with *"to get a yes: 2029 2nd + Jonathan Taylor (+7% over fair)"*.

### Tool 10 — `research_rookies`

"Which rookies become something, and which should I take?" / "Is Jeremiyah
Love going to play?" Optional `player`, `position`, `sort`
(`fit` | `score` | `value`), `team`, `limit`, `leagueId`, `refresh`.
`rookieResearch.buildRookieBoard` — the SAME composition Draft › Research and
the profile drawer read, so the board on the phone and the answer in the chat
rank the class identically.

**Prerequisite E, in the shape of A–D.** The composition lived as `buildBoard`
inside `useRookieResearch`, and the rookie-class rule as `buildRookieMap`
inside `useSleeperRookies` — both hooks, so no server could reach them. They
moved to `utils/rookieResearch.js` (`buildRookieBoard`) and `utils/rookieAdp.js`
(`buildRookieMap`); **the hooks keep the memo and nothing else**. Equivalence
**proved, not inspected**: both pre-extraction bodies lifted verbatim from git
and run beside the new functions on the live league (444-rookie class, the
published feed) at all ten identities plus no identity, no feed and no
FantasyCalc — `deepStrictEqual` on all **14**.

- **ONE score, no second axis.** `score` is `dynastyOpportunityScore` (0–100
  as the app shows it) — the back-tested year-1 core with its measured youth
  tilt. Age at the draft and the combine drills ride along under `context` and
  never move it (Feature 19's measured nulls); a test changes the 40, vertical
  and broad and asserts the score and fit do not move.
- **Rule 7 applied to a model.** A rookie with no feed entry is `score: null`
  and `fit: null`, never 0 — absence may be a feed gap. Live: **236 of 444**
  are scored and **208** carry no entry (almost all undrafted). An unpriced
  rookie is `value: null` + `unranked`.
- **Class B, and never "no rookies".** The class comes from the player DB, not
  the feed, so an unreadable `rookie-intel.json` answers `ok: true`,
  `available: false`, every score null and the board in dynasty-value order —
  exactly Draft › Research's degraded state. Only a missing **player DB**
  refuses, because then there is genuinely no class to rank.
- **Roster fit is read for the requested team.** `team` defaults to you;
  naming an opponent reads the class from their seat (their deficits, their
  window), which is the scouting question before a rookie trade.
- **The name search refuses rather than guesses**, over the rookie class
  itself (the league-wide resolver's universe excludes unpriced free-agent
  rookies): "Smith" returns four candidates live.
- **It adds ONE source to `asOf`** — `rookieIntel`, declared in the closed
  object, stamped only when the feed was actually used.

**A latent identity bug found on the way — ROOKIE-1, CLOSED 2026-09-25 in its
own commit.** `buildRookieProspects`' name fallback was position-unguarded, so
a rookie who shared a name with a priced player took that player's FantasyCalc
entry. It was **dropped rather than guarded** (see the Rookie ADP rule): 0 of
444 live joins ever used it, and a guard would not have covered the 7 rookies
who share name *and* position with someone. The class's output was
`deepStrictEqual` before and after on the live payloads. `research_rookies`'
test now looks up the unpriced Jaylen Smith (905) and gets the RB.

Measured live over the real transport (2026 Week 3): **943ms cold / 40ms
cached, 25,888B** at the default 12 rows (9 upstream requests cold, 0 cached);
30ms / 50,029B at `limit: 40`; a single rookie 3,701B. Top of the owner's
board by fit: Carnell Tate (WR, 78/100, fills the WR need), Jeremiyah Love
(RB, 77), Fernando Mendoza (QB, 80).

### Caching the other static feeds — `mcp/feeds.js`

`rookie-intel.json` and `trade-values.json` share one small loader rather than
each growing a copy of the Class B contract: never throws, a miss is
`available: false` with the reason, and **a 200 with the wrong shape is a
miss** (checked inside the load, so it is never cached) — the same checks the
app's loaders throw `bad shape` on. **60 minutes** (`DYNASTYEDGE_FEED_TTL_MS`),
argued per feed: rookie intel publishes once a day and its depth signal is
weekly-granular; the trade archive is append-only and grows at most daily.
Anything shorter buys nothing either feed can deliver.

**`values-history.json` joined it on 2026-09-25 with its OWN number — six
hours** (`DYNASTYEDGE_VALUE_HISTORY_TTL_MS`), and the argument is not the other
two's. The file carries one column per UTC day (a same-day re-run *replaces*
that column), so between publishes there is nothing newer to fetch, and "how
has his value moved over weeks?" does not turn on hours. The one number that
does — where the line ends today — is deliberately not the feed's job: the tool
reports FantasyCalc's current value from the 15-minute snapshot beside the
series. The file is **~260KB raw / ~82KB on the wire** (measured 2026-09-25),
so the longer TTL saves ~4 fetches a day for nothing a reader could notice.

### Tool 11 — `scout_managers`

"How does this manager trade, and how have I done?" Optional `team`, `limit`,
`leagueId`, `refresh`. `managerAnalysis.buildManagerProfiles` — the SAME
function `useManagerProfiles` runs, fed the same three inputs (league state,
the current season's transactions, the walked history) — so Trade › Managers
and the chat cannot disagree about a ledger.

- **Omit `team`** for the league overview: every manager's activity, record,
  trade W-L-E and hindsight net, tendencies, FAAB efficiency and rookie-draft
  hit rate, sorted by activity, plus **my report card** (strengths / work-on).
  **Pass `team`** to open one manager's full ledger (newest first, bounded
  default 10 / max 40, true count beside it), biggest win and loss, draft
  picks and tendency detail.
- **"Never traded" vs "we could not read" — the contract it exists to keep.**
  The tool tracks exactly which seasons' transactions it **read**
  (`ledger.seasonsRead` / `seasonsMissing`). Nothing read ⇒ every trade and
  FAAB field is **null** and `activity` is null — never 0, never *"No trades
  yet"*. A partial read ⇒ a quiet manager reads *"No trades in the N seasons we
  could read"*, and `buildMyInsights`' *"You haven't completed a trade yet"* is
  dropped rather than printed. A **complete** read of a genuinely quiet manager
  still says *"No trades yet"*. Pinned from both directions.
- **FAAB in BUDGETS, never dollars** (Feature 11): `budgetsCommitted` is a
  multiple and `avgBidPct` a percent of each bid's own season's budget. A test
  asserts no `dollars` / `avgBid` / `valuePer100` field leaves the tool.
- **Rule 7 on a ledger:** a zero-value asset (FAAB, an unpriced player or pick)
  reports `value: null`, never a raw 0.
- **The third static feed.** `trade-values.json` supplies the *"at trade
  time"* line through **`tradeTimeTotals`**, extracted from
  `useTradeTimeValues` into `utils/managerAnalysis.js` for this tool (the hook
  now calls it). An archived **null** is a missing asset, so the whole line
  hides rather than under-counting. Measured live: the archive holds **2**
  trades and both carry a null pick, so **0** ledger rows print the line today
  — expected, and the notes say so rather than implying an error.
- Tendencies **describe the record**; the copy says acceptance modelling was
  tested and disconfirmed.
- **It adds ONE new source to `asOf`** — `tradeValues`, declared in the closed
  object — beside `history` and `transactions`, which were already declared.
- `transactions.js` now stamps each transaction's **`week`** from its bucket,
  exactly as `useTransactions` does; the ledger reports it and a raw Sleeper
  transaction does not carry one.

Measured live over the real transport (2026 Week 3): **1,219ms cold / 34ms
cached, 10,041B** for the overview (**80 upstream requests cold**: the
snapshot's 8, the wide walk's 68, 3 current-season buckets, 1 archive; **0**
cached); one manager's ledger 32ms / 21,665B at the default 10, 24,677B at
`limit: 40`. All four seasons read, 2023–2026. Top of the activity sort:
Ministry Of Touchdowns, 42 trades, +15,340; my card read *"11 trades
(4W-7L-0E, −8,310) · FAAB 1.73× budgets"*.

### Tool 12 — `get_league_results`

"Who won our league in 2023?" / "Who has the most titles?" Optional `season`,
`leagueId`, `refresh`. `leagueResults.buildSeasonResult` + `countTitles`
(`src/utils/leagueResults.js`, new and pure, so an app screen of past champions
would read the same rule) over `mcp/results.js`.

**It closes the one question `MCP_DISCOVERY.md` §5 recorded as unanswerable.**
Past records and points-for were always in hand; the champion lives only in
`/league/{id}/winners_bracket`, which nothing in this repo had called.

- **The shape was PROBED LIVE before any code was written against it**
  (2026-09-22): `[{ m, r, t1, t2, w, l, p?, t1_from?, t2_from? }]`. `p` marks
  a placement game — `p: 1` is the championship (`w` champion, `l`
  runner-up), `p: 3` third place, `p: 5` fifth. On all three complete seasons
  the `p: 1` winner matched each league's own
  `metadata.latest_league_winner_roster_id`, so the **bracket is read and the
  metadata kept only as a cross-check** (`metadataAgrees`; a disagreement is a
  note, not a silent pick).
- **Its own tool, not a field on `scout_managers`, and the reason is cost.**
  It reads the NARROW history walk (chain + rosters, usually already cached)
  plus a bracket and a users call per season: **29 requests cold** — the
  snapshot's 8, the narrow walk's 14, 3 users, 4 brackets — against
  `scout_managers`' 80. Folding it in would charge every "who won?" for a
  trade ledger it never reads. It adds **no transaction bucket**, pinned by
  test.
- **Titles are credited by `owner_id`**, because a roster id is
  season-scoped. So a title won under an old team name follows the manager:
  2023's champion **Post Mahomes** is today's **Mahomes Depot**, and the titles
  line says so. A placement is named by that season's user when Sleeper still
  has it, then the owner's current team name, then `Roster N` — never
  undefined.
- **Three states that must not be confused.** A current season's bracket
  **exists in September with every `w`/`l` null**: that is `in-progress`,
  never "nobody won". A bracket we could not read is `unavailable` — no
  champion, named in the notes, **not cached**, retried next call. A season
  Sleeper has no bracket for is `no-bracket`. None of them is ever reported as
  a champion-less season.
- **Two TTLs, argued.** A past bracket is frozen (the chain only holds seasons
  that renewed) and rides the history TTL under its own per-season key; the
  current season's fills in over the playoff weeks and rides the snapshot's
  15 minutes — a title game decided at 11pm should not wait six hours.
- **It adds ONE source to `asOf`** — `brackets`, declared in the closed object,
  stamping the oldest bracket read — beside `history`.

Measured live over the real transport (2026 Week 3): **1,165ms cold / 27ms
cached, 10,089B** for every season; one season 4,117B. The answer: **2023 Post
Mahomes** (bracket and metadata agree), **2024 and 2025 Ministry Of
Touchdowns**, 2026 in progress with the playoffs starting in week 15.

### Tool 13 — `get_value_history`

"How has his value moved?" / "How has my team's value moved, and who drove
it?" Optional `player`, `team`, `days` (4–90), `limit`, `leagueId`, `refresh`.
Reads `values-history.json` — the rolling 90-day daily snapshot behind every
sparkline in the app — the **fourth and last** static feed the server reads.

- **The rule is the app's, extracted rather than copied.** `getSeries` lived as
  a closure inside `useValueHistory`, so no server could reach it. It moved to
  `src/utils/valueHistory.js` as **`getValueSeries`** (the hook now calls it),
  with `getDatedValueSeries` (same filter, same threshold, plus dates — pinned
  equal by test), `valueHistoryCoverage`, `sliceValueHistory` and
  `summarizeValueSeries` beside it. Equivalence **proved, not inspected**: the
  pre-extraction body lifted verbatim from git and run beside the new function
  over the live feed (615 players × 90 dates), a 3-column truncation of it, and
  the empty/null shapes — `deepStrictEqual` on all **2,314** cases. The team
  line is The Edge's own `buildTeamValueSeries`, unchanged.
- **Its own tool, not a field on `get_roster` / `get_player_news`.** Folding
  it in would put an ~82KB wire fetch behind every roster question that never
  asked about the past, and 26 per-player 90-point series would blow
  `get_roster`'s ~9KB bounded answer several times over. News says what
  happened; this says what the market did about it — separate questions.
- **"Not enough history yet" is an answer, never a flat line and never 0.**
  Under `MIN_SPARKLINE_POINTS` (4) there is `series: null`, `summary: null`, the
  point count and a sentence saying so. **Tracked-with-too-few-points and
  untracked are distinct statuses** (`not-enough-history` / `untracked`): the
  feed keeps the top 500 by value, so an unranked stash has no row at all,
  which is different from a value that did not move.
- **The team line is TODAY'S roster valued back through the window**, exactly
  as The Edge draws it (carry-forward on a missing day, picks excluded — they
  are not in the feed), and the notes say so: a player acquired last week
  counts across the whole window. Risers and fallers are per-player
  first→last over the same window, bounded (default 5, max 15 per direction)
  with the true totals in `counts`.
- The resolver discipline holds (**"Brown" returns six and refuses**); a pick
  is refused (the feed tracks players). Rule 7: an unranked player's
  `currentValue` is null.
- **It adds ONE source to `asOf`** — `valueHistory`, declared in the closed
  object, stamped only when the feed was read.

Measured live over the real transport (2026 Week 3): **1,372ms cold / 26ms
cached, 8,100B** for the owner's team (9 upstream requests cold — the
snapshot's 8 plus the feed — and 0 cached); one player 5,084B; `days: 30` at
`limit: 15` 9,697B. The answer: Nix Cage's current roster **70,262 → 67,019
(−4.6%) over 90 days**, led up by Jonathan Taylor (+715) and down by Brock
Bowers (−796); Bo Nix 4,582 → 4,075, peaking 5,167 on 2026-09-14.

### The board's freshness — the one layer here with NO TTL of its own

`weekly.js`, `season.js`, `transactions.js` and `liveScores.js` each argue a
number, and `find_trade_targets` argues that a number is the **wrong
instrument**. The four above each own a FETCH. This one owns none:
`getTopTradeTargets` and `suggestFairPackage` are pure functions of the
snapshot the server has already fetched, already cached for ~15 minutes and
already stamped. Its freshness domain is therefore the snapshot's, exactly —
and a TTL of its own could only ever be a second clock disagreeing with the
first, which is `store.js`'s trap read from the other direction.

**A derived cache was considered and rejected on a measurement:**
`getSnapshot` assembles a **fresh object every call** (`generatedAt` is `now`,
`ageSeconds` recomputed), so a cache keyed on snapshot identity would never
hit, and one keyed on time would be that second clock.

What the ~730ms buys is **CPU, not requests**, and CPU is bounded the way
§4e-v says to bound it — by how many **targets** are priced (~32ms each,
measured on the live league), never by truncating the candidate search inside
a target. Truncation is what the untruncated search replaced, and the cost of
a `limit: 20` answer is 722ms of arithmetic over data already in hand.

### Caching the news feed — and WHY A TOOL beats "let the model search"

`mcp/news.js`, **10 minutes** (`NEWS_STALE_MINUTES` governs the warning, not
the cache): shorter than the ~30-minute publish interval, so the server never
sits on an edition longer than the pipeline takes to make the next one.

A chat client can search the open web, and the feed is a public
`raw.githubusercontent.com` URL it could fetch outright. Three things still
make the tool the right primary source, and **one thing genuinely favours
search** — which is why the answer is a handoff rather than a choice:

1. **The join is already done, server-side, on purpose** (see the two DJ Moores
   above). A model matching a headline to a roster gets one of them wrong
   eventually.
2. **It arrives unasked.** Search fires only when the model decides to search;
   news attached to a flagged player inside a lineup answer reaches a reader who
   did not know to ask.
3. **Provenance.** Every item carries a source and a publish time, and the feed
   carries its own age. A search result carries neither.
4. **AND WHERE IT LOSES, by MORE than this used to say:** the feed *asks* to
   publish twice an hour through a CDN that caches ~5 minutes, but GitHub
   delivers ~5.5–7.4 runs/day at a **3.3–4.4h mean gap and 6.0h worst
   observed** (measured 2026-09-21 and 2026-09-25). The real worst case is **hours, not the ~35 minutes
   recorded here before** — precisely when a late inactive lands. **`staleForKickoff` marks that condition and the
   tools print an explicit instruction to confirm against a live source.** A
   tool that knows its own blind spot is more useful than one silently behind.

Context economy is the quiet fourth reason: the raw feed is up to ~1,280 items
(~560KB raw, ~144KB gzipped — and gzipped into KV too), and filtered to a
roster it is ~2KB.

### Caching the live box score — a FIFTH TTL, and the only SHORT one

`mcp/liveScores.js`, **5 minutes** (`DYNASTYEDGE_LIVE_TTL_MS`). Every TTL
before it argues for caching *longer* than instinct suggests; this one argues
the other way, and the argument is not symmetry:

- The snapshot (15 min) changes on an **event**. Projections (60 min) change on
  a **0.06%-per-10-hours drip**. Season matchups (60 min) change **once a
  week**. A settled transaction bucket is **frozen**.
- A live box score changes **every few plays for three hours on a Sunday**, and
  it is the number that decides whether a slot is still a decision or already a
  result.

**Not reused from `season.js`**, whose TTL argument is the precise opposite:
it is long *because* the odds model discards a partially-played week, so its
output moves only when a whole week lands. Borrowing that cache would mean
reading a 60-minute-old box score to decide whether a game has finished.

**Strictly best-effort, and the degradation is asymmetric in the right
direction:** the **locks come from the schedule**, so without live scores the
set of moves offered is unchanged — only the banked figure degrades to a
projection, and a note says so. A missing box score can never restore an
impossible move.

### Caching the rest of the season — a THIRD TTL, and its own argument

`mcp/season.js` owns every regular-season week's matchups (weeks 1 …
`playoff_week_start − 1`, read from league settings, never assumed) and caches
them for **60 minutes** (`DYNASTYEDGE_SEASON_TTL_MS`). One pass yields **both**
halves of the model's input — the remaining schedule and every completed week's
actual score.

It is the same number as `weekly.js`'s and it is **not the same argument**,
which is why it is its own constant rather than an alias:

- **A completed week is frozen forever.** Most of what this fetch returns is
  immutable history.
- **The current week's scores move live through Sunday — and the model throws
  them away.** `splitCompletedWeeks` counts a week only when *every* team in it
  has scored, so a partially-played week is simulated fresh rather than
  counted. The consequence sets the TTL: **the odds output only changes when a
  whole week lands**, which happens once a week. What *does* change on an event
  — a roster, and so the strength prior — comes from the 15-minute snapshot.

Per-week cache keys, so a failed week degrades alone. **A single failed bucket
contributes empty entries and a disclosed note** (a missing week understates
completed results *and* drops its games from the remaining schedule); **all of
them failing is the one state that must never be reported as a preseason**. The
stamp is the **oldest** of the weeks, for the same reason `oldestSourceAt` is
the stalest source.

### Layer 3 now scores on LIVE ODDS in `analyze_trade`

`myPlayoffPct` was the first of the three unwired signals and the only one that
moves a **score**. It is wired (2026-09-20).

- **Why it was worth ~14 requests.** The win-window tier is a *ranking of
  accumulated assets* — bench and picks included — and it tracks the actual
  **starting lineup**, which is what Layer 3 asks about, at Spearman **0.721**.
  Live playoff odds track it at **0.988**. The tier also has no `Middle` branch
  at all, so 40% of this league took no lean and scored a flat 0.
- **`windowBasis` still names which one ran, and that has not become
  decoration** — it now reports `'odds'` in season and `'tier'` in the
  offseason or when the schedule would not load, and the note says *which*
  ("it is the offseason" vs "the schedule did not load" — "nothing to
  simulate" and "we could not find out" are different answers).
- **The season fetch is in-season only.** The offseason has no schedule to
  simulate, so fetching would be fourteen calls to learn nothing; the tier
  fallback there is byte-for-byte the behaviour this tool shipped with.
- **A missing odds entry falls back to the tier; a genuine 0% scores.** The
  `?? null` guard matters — reading an absent entry as 0% would grade every
  trade as a fire sale.
- Verified live: `windowBasis: 'odds'`, the note quoting *"on the bubble at 58%
  playoff odds"*, and `asOf.sources` carrying **matchups** alongside the other
  five.

### Caching the transaction feed — a FOURTH TTL, and it is SPLIT

`mcp/transactions.js` owns the season-wide transaction feed. It is the only
layer here whose TTL is **two numbers**, because it is genuinely two freshness
domains wearing one name:

- **A settled week is FROZEN.** Week 1 stopped receiving entries the moment
  week 2 began — measured on this league, its newest entry is 2026-09-16 and
  week 2's oldest is 09-17. Re-fetching it is re-fetching history, so it sits
  on a long TTL that is eviction pressure rather than freshness.
- **The live week changes on an EVENT** — a waiver clears, a trade executes —
  and those are the *very events that make a roster wrong*. So it rides the
  **snapshot's** 15 minutes, deliberately, not `season.js`'s 60. Inheriting 60
  would let this layer disagree with the snapshot for 45 of them: a roster
  showing a player the activity read swears they never acquired.

The payoff is that after the first pass **a refresh costs ONE request, not one
per week** (measured: 0 requests on a cached repeat).

**IT DOES NOT FETCH 18 WEEKS, and that is measured rather than assumed.**
CLAUDE.md describes the app's feed as "all 18 weekly buckets in parallel",
which is right for a phone paying once per session and wrong for a server.
Sleeper buckets a transaction by the week it was **processed**, so a bucket
past the current week is empty *by construction*. Measured 2026-09-20 at week
2: week 1 → **71** complete, week 2 → **6**, weeks 3 / 17 / 18 → **0**. So the
server reads weeks 1..current — **2 requests, 63ms, all 77 moves** — where the
phone's path would spend 18. Note the distribution too: the bulk of a season
sits in week 1, which is also the first bucket to freeze, which is what makes
the split TTL worth having rather than a micro-optimisation.

An **unknown** week reads all 18 rather than guessing low: absence of NFL
state is not evidence the season is young, and guessing would silently drop
most of the feed.

### The league-history walk — DELIBERATELY narrower than the app's

`mcp/history.js` walks `previous_league_id` for one signal: the rookie-draft
hindsight record. The app's `useLeagueHistory` fires **~169 concurrent
requests** (see the rate-discipline section), and almost all of them are
weekly **transaction** buckets that draft grading never reads.

`buildDraftRecords` needs exactly two things per season: the drafts with their
picks, and a roster→owner map for the fallback when a pick carries no
`picked_by`. So this walk fetches leagues + rosters + drafts + picks and
nothing else — measured **14 requests, 199ms** across this league's three past
seasons, against ~169, with **zero** transaction URLs and **zero** user URLs.
`tests/mcpHistory.test.mjs` asserts both zeros, so the narrowness is proved
rather than claimed.

**The consequence is stated rather than buried:** a profile built from this
history would have a real `.draft` and an **empty** trade ledger and FAAB
record — which would read as "this manager has never traded" when the truth is
"we did not ask". That is precisely why the walk is paired with
**`buildDraftGrades`**, which returns *only* draft records, and never with
`buildManagerProfiles`. A future manager-scouting tool needs the ledger and
must widen this walk with its own argument for the cost; **do not quietly
widen it here.**

**The drafts LIST error is not swallowed, while a per-draft picks error is**,
and the asymmetry is the whole degradation contract. A draft with no picks yet
genuinely contributes `[]`. A failed drafts *list* returning `[]` would be
indistinguishable from "this league has never drafted", which downstream reads
as "you have no rookie record" — an outage rendering as a fact about the
owner. Learning nothing at all returns `available: false` instead. The first
cut got this wrong and reported an outage as an empty history; the test caught
it.

**`buildDraftGrades` is a prerequisite refactor in the A–D shape**
(`src/utils/managerAnalysis.js`). It calls the **same** `buildDraftRecords`
the app's Manager Scouting runs, so a grade means exactly one thing on the
phone and on the server and the two cannot drift — and equivalence is
**proved, not inspected**: `tests/managerAnalysis.test.mjs` asserts it equals
`buildManagerProfiles`'s own `.draft` field for field, and that dropping the
transactions the server never fetches changes no grade.

### The WIDE walk — `getLedgerHistory`, widened in the open (2026-09-22)

`scout_managers` needs the trade ledger, so it needs what the narrow walk
skips. The widening is **its own exported function**, built *on top of*
`getLeagueHistory` rather than beside it: the chain, rosters and drafts come
from the narrow walk (and its cache), and this adds only each past season's
**users** (names for departed counterparties) and **transaction buckets**. The
narrow walk is byte-for-byte what it was, and `tests/mcpHistory.test.mjs`'s
zero-transactions / zero-users assertions still hold for it.

**Its cost, measured rather than quoted** (2026-09-22, this league's three
past seasons): **68 requests cold** — the narrow 14 + 3 users + **51**
transaction buckets — in **508ms**, and **0** cached. Every past season's
week-18 bucket is **empty** (2023, 2024, 2025 all read 0) and each league's
`settings.last_scored_leg` is 17, so it reads weeks 1..`last_scored_leg`
(falling back to 18 when absent) — the same "a bucket past the last week is
empty by construction" argument `transactions.js` makes for the live season.
**Stated honestly, the saving against the app is small:** the app's walk for
the same four seasons is ~72, not ~169 — that figure is the eight-season
projection. The real economy is the cache: each past season is **frozen**, keyed
**per season** on the history TTL, so a conversation pays the 68 once and a
failure in one season retries alone.

**The degradation contract is the whole point of the design.** A season
whose buckets **all** fail throws inside its load, so **nothing is cached**
for it (a cached empty ledger would read "never traded" for six hours) and it
is named in `failedSeasons`; one failed bucket inside a season is disclosed as
a partial season. Pinned from both directions in
`tests/mcpScoutManagers.test.mjs`.

### The last two signals — context, wired without touching a score (phase 2b)

`myDraftGrade` and `partnerActivity` were the two remaining unwired signals.
Both landed 2026-09-20, and **neither reaches a verdict** — the rule they keep
is the app's own: *roster facts may score; second opinions describe.*

- **`partnerActivity`** (`mcp/transactions.js`) — a 21-day window over the
  season feed. "They traded for a tight end last week" changes how you read
  their TE surplus: it is not spare depth, it is the thing they just went and
  bought. Descriptive **only**, because modelling manager behaviour was tested
  on this league's full 95-trade corpus and **disconfirmed**.
- **`myDraftGrade`** (`mcp/history.js` + `buildDraftGrades`) — my rookie-draft
  hindsight record, which adjusts **confidence** in pick capital I am
  acquiring, never its value. Gated at ≥ 5 graded picks, and the copy states
  the record as a record rather than as durable skill.

**A failure of either says "we could not find out", never the absence itself.**
This is the same discipline `lineup_advice` keeps between `offseason` and
`projections-unavailable`, and here it is sharper: "they have made no moves"
is a **real answer about a quiet manager**, so an outage rendering as one
would state a fact about someone on no evidence. Pinned by test from both
directions — a failed feed never prints it, and a genuinely quiet partner
still does.

**Measured live, 2026 week 2:** `analyze_trade` acquiring a pick — **512ms
cold, 78ms cached**, with `transactions` and `history` stamped into `asOf`
alongside the other six sources. Partner activity read *"Added Raheim Sanders
(RB), Michael Mayer (TE), Garrett Nussmeier (QB) +1 more in the last 3
weeks"*; the nudge read *"7 of your 11 graded rookie picks"*.

**THE ZOD OUTPUT SCHEMA CAUGHT THIS ONE TOO, and it is the third time.**
`asOf.sources` is a **closed** object, so adding two sources without declaring
them made a real MCP client reject the entire response with *"must NOT have
additional properties"*. Lint, **630 tests and a clean build all passed it** —
the tests call `buildTradeAnswer` directly and never cross the wire. Only
driving the real transport found it, which is exactly why "verify live" is a
gate and not a formality. A new source must be added to that schema. Phase 2c
added two more — `liveScores` and `news` — and declared both; the trap is
recorded twice now because it is the single easiest way to ship a response no
client will accept. **2026-09-22 added two more, declared with them:**
`rookieIntel` (`research_rookies`), `tradeValues` (`scout_managers`) and
`brackets` (`get_league_results`) — and all three were verified over the real
transport, not assumed.
**`find_trade_targets` adds none, deliberately** — it reads
the snapshot and nothing else, so its `asOf.sources` is the base three and the
closed object stays satisfied by construction. That was still verified by
driving a real client over the transport rather than assumed, because "it adds
no source" is exactly the reasoning that would skip the check.

### Prerequisite refactors this shipped with

Four changes inside `src/`, each of which stands on its own merit:

- **`src/utils/teamName.js` + `src/utils/valueHistory.js`.** `getTeamName` and
  `MIN_SPARKLINE_POINTS` moved out of hooks. Three import lines in
  `recommendations.js` and `edgeBriefing.js` reached into `../hooks/`, and both
  hooks import React (and `useLeague` transitively loads `useIdentity`, which
  reads `localStorage` at module scope). Measured with a resolver hook that
  throws on any resolution of `react`: **3 of 30 utils were React-tainted
  before, 0 after.** Both symbols are re-exported from their old locations, so
  the 22 components importing `getTeamName` from the hook are untouched.
  *That probe is the right instrument* — a plain "does it import?" check
  passes whenever `node_modules` happens to be present, which is why
  `MCP_DISCOVERY.md` §4 recorded 27 of 30.
- **`src/utils/leagueState.js` — `buildLeagueState`.** The five-source join
  that produces `league` lived only as a `useMemo` in `useLeague.js`, so the
  object every analysis function eats could not be produced outside a browser,
  and it had no tests. `useLeague` now calls it and does nothing else.
  Equivalence was **proved, not inspected**: the pre-extraction memo body was
  lifted verbatim from the previous commit and run beside the new function on
  live payloads (10 rosters / 295 players / 120 picks) at three identity
  settings plus the null-gate cases — `deepStrictEqual` on every one.
- **`src/utils/playoffOdds.js` — `splitCompletedWeeks` + `buildPlayoffOutlook`
  (2026-09-20).** The whole odds composition — split the weeks, build the
  scoring model, run the 10,000-iteration simulation, decide which of the
  three season states applies — lived only inside `usePlayoffOdds`'s
  `processWeeks` and `deriveOdds`, so it could not be produced outside a
  browser. Same shape as the three below. The hook now holds the **memo and
  nothing else**, which is the right split: caching by input identity is a
  rendering concern. Equivalence was **proved, not inspected** — the
  pre-extraction body lifted verbatim from the previous commit and run beside
  the new function across preseason / active / complete / partially-played /
  no-schedule at two field sizes each, `deepStrictEqual` on all **20**.
- **`buildFreeAgentPool` / `buildAvailableDefenses` in
  `src/utils/freeAgents.js`.** "Who is a free agent?" was built independently
  in `FreeAgentsView.jsx` and `edgeBriefing.js`. The standing rule travels with
  the code and is now enforced by construction: **the general pool cannot
  return a defense** — not because FantasyCalc ranks none, but because you
  roster exactly one, ever — and getting one requires calling
  `buildAvailableDefenses` by name.

### What the server can never do

**Sleeper's API is read-only.** The server can say exactly what to start and
what sitting pat costs in points. It can never set a lineup, accept a trade, or
place a waiver claim — the user still taps it into Sleeper. Say so rather than
implying otherwise.

**Weekly tools are in-season only.** Projections do not exist in the
offseason; a weekly tool must say so rather than return zeros, the same
contract `LineupOptimizer` honours.

**The four static feeds are not parameterized.** `news.json`,
`values-history.json`, `trade-values.json` and `rookie-intel.json` are
published from *this* repo's branches. A second league gets working rosters,
values, trades, lineups and odds — but no news, value history or rookie
research. **All four are now read** (2026-09-25): `news.json` by
`get_player_news`, `lineup_advice` and `get_roster` (`mcp/news.js`), and the
other three through `mcp/feeds.js` — **`rookie-intel.json`** by
`research_rookies`, **`trade-values.json`** by `scout_managers`, and
**`values-history.json`** by `get_value_history`. All four degrade exactly as
the contract demands: `available: false` with a note, never an error and never
an empty result dressed up as "there is no news", "there are no rookies",
"this trade was never archived" or "his value has not moved". (For the second
league the value history is *this* league's feed of league-agnostic
FantasyCalc values, so the per-player lines are still true there — only
`values-history.json`'s top-500 cut and publish schedule are ours.)

**"Who won our league in 2023?" is answerable — by the server, not the app.**
`get_league_results` reads `/league/{id}/winners_bracket` (first called
2026-09-22); the app still never calls it, and a champions screen would reuse
`src/utils/leagueResults.js` rather than re-derive the rule.

-----


