# DynastyEdge — Open Items

**This file is the answer to "what's next?"** It is a **living list**, not a
dated snapshot: unlike `docs/project-status-2026-*.md` (which gets superseded
by a newer dated file), this one is edited in place forever. Anything deferred
with a reason belongs here, or it will be forgotten.

**Last reviewed:** 2026-09-21 (**the backlog audit + day 1 of the week plan** —
this file had drifted two weeks behind the code, and the audit that caught up
with it also turned up three things no doc knew about. Two were bugs and are
fixed here: **PIPE-1**, the trade-value archive writing every pick as 0 into a
*permanent* file, and **OPS-1**, ~48 junk Vercel builds a day created the
moment the GitHub integration was connected. The third was good news —
**NEWS-3**'s trigger fired and it **PASSED at 18 of 31**, against a target of
12 and this file's own prediction of 9–11 — though the item cap is binding
again at 78h, which is **NEWS-4**. Also closed on paper: **DESIGN-4**, whose
items 2–5 all shipped 2026-09-13 while this file still called them pending.
The week's plan is §0. Previously **MCP-2c** — the Optimizer stopped recommending
moves that cannot be made. Sleeper seals a lineup slot at kickoff and the
schedule payload has always carried the `status` field that says so; both
`parseByeTeams` implementations discarded it, so the tool told the owner on a
Sunday to bench a player whose game had finished on Thursday — and counted the
points as sitting on his bench. Also shipped: an eighth tool,
`get_player_news`, and injury detail + beat reporting attached to the flagged
players in `lineup_advice` and `get_roster`, because "Doubtful" sent the owner
to Sleeper for something the server already held. Two new TTLs, each with its
own argument. Previously **MCP-2b** — `analyze_trade`'s last two unwired
signals are in: `partnerActivity` over a new season-wide transaction feed and
`myDraftGrade` over a deliberately narrow league-history walk (14 requests
against the app's ~169). Neither touches a score. Two measured sizing wins —
the transaction feed reads weeks 1..current, because a later bucket is empty
by construction (2 requests, not 18), on the server's only SPLIT TTL. Also
closed: PR #59's unmet 390px sweep (never actually blocked — the visual-capture
skill sanctions `playwright-core` in a throwaway dir), and the discovery that
**the Vercel project has no GitHub integration at all**, so merging to `main`
has never deployed the MCP server. Previously **MCP-2a** — a seventh tool, `get_playoff_odds`,
and `analyze_trade`'s Layer 3 moved off the win-window tier onto live playoff
odds (0.988 vs 0.721 against the starting lineup). Prerequisite D extracted the
odds model out of `usePlayoffOdds` so the server runs the same one the phone
does. Previously **MCP-1b** — all six MCP tools shipped over
stdio; see MCP-1b. Previously **MCP-1** — the MCP server's phase 1 shipped:
the three prerequisite refactors plus `get_roster` over stdio. Phase 2 (remote
transport, OAuth, deployment) is **MCP-2**, deferred with its trigger, and
needs two owner decisions before it is ready work. Previously 2026-09-12:
DESIGN-1 **CLOSED** — step 5, motion, shipped and
the Matchday rebuild is complete: the global reduced-motion guard, one easing
curve reaching all 69 transitions, the press run, `.press` as the third
control-level contract, `Loading` in place of every spinner, the sheet entrance,
and a written four-moment budget. **0 of 12** slop markers, re-scored from
scratch rather than inherited — which is how two live accent rails and a
clipping player name were found. Step 5 also fixed a **white screen shipped to
`main`** by step 4 (League › Activity) and recorded why neither lint nor build
could see it. What it hands on is in §3's DESIGN-1 record: 21 hand-rolled panels
across nine files, the nested-button bug in Market Movers, and the on-device PWA
verification. Earlier the same day, step 4 rolled the components through the
screens. Previously 2026-09-11: UX/IA + visual review — `docs/design/review-2026-09/`.
The owner approved a replacement visual direction ("Matchday") and the Phase 3
"Primetime Blackout" law is superseded; the audit also turned up four
independent, ready-now bugs. New: **DESIGN-1**, **DESIGN-2**, **DESIGN-3**.
Previously 2026-09-07: the my-side read: one fit engine, both seats —
the Analyzer and the Targets board now grade what a trade is worth to *me* in
the same words they always used for the partner, and acquired players get the
same depth chart departing ones always had. Measuring it opened **OPEN-10**.
Earlier the same day, trade-engine review: the package search now
weighs my own cost against the partner's appeal, my starting lineup is measured
and gates the verdict, and Layer 3 is scored on live playoff odds instead of the
win-window tier. One 2026-09-06 owner ruling reversed — marked in place, not
deleted. The active work queue remains `docs/build-plan-2026-09.md`).

**How to use it:**
- Each item states its **trigger** — the condition that makes it ready. An item
  whose trigger hasn't fired is **not** ready work; doing it early is a bug.
  (OPEN-2 was the canonical example — rolling the pick window before the draft
  ran broke the Tracker during the one event it exists for. It is now closed,
  and closed in the way to prefer: the trigger was designed out rather than
  waited on.)
- Items marked **[owner ask required]** must not be built without an explicit
  request, per CLAUDE.md's Future Features gate.
- When you close an item, move it to §3 with the date and commit. Don't delete
  it — the record is why nobody re-litigates it.

---

## 0. The plan (set 2026-09-21 — read this first)

**A one-week plan, ordered by irreversibility × cheapness rather than by
size.** The reasoning is worth more than the order: two of these items cost
something *every day they are not done* and cannot be recovered afterwards,
which beats any amount of feature value.

| Day | Work | Why it sits here |
|---|---|---|
| **1** | **PIPE-1 + OPS-1 + this catch-up** — **DONE 2026-09-21** | Both were actively bleeding. The archive wrote unrecoverable wrong data on every run; the Vercel builds were pure waste |
| **2** | **Phase 4a — archive all three valuation sources daily** (`docs/build-plan-2026-09.md` §10) | **The only item on this list where waiting has a permanent cost.** 4a's own instruction is "do this first and immediately", and it has been sitting since 2026-09-04. It starts the clock on 4d ("when sources disagree, which one moves?"), which is unanswerable forever without an archive. Pipeline-only, no UI |
| **3–4** | **One substantial thing:** either the MCP trade-targets tool (**MCP-CARRY**) or **OPEN-10** | New capability vs. fixing the thing that makes the Targets board read wrong on 17 of 20 cards. Owner's call |
| **5** | **NEWS-4** (the cap decision) + the **MCP connector re-check** on the phone | Both small; the second needs the owner's GitHub login and no sandbox can do it |

**What is deliberately NOT in the week**, so nobody picks it up by accident:
OPEN-8 (trigger: autumn 2028), OPEN-9 (trigger: ~2027-07, needs 12 monthly
archive columns and currently holds 3), OPEN-3 (owner ask required), and the
two device checks in DESIGN-4 (owner-only, uncheckable in any sandbox).

**The single biggest unbuilt approved item is Phase 4**, and it is worth
naming plainly: FantasyCalc is still the app's only valuation source, so every
trade verdict, roster total, trajectory curve and pick price traces to one
provider's opinion.

---

## 1. Active

### MCP-1 — MCP server phase 1 **SHIPPED 2026-09-19**

`mcp/`, a Model Context Protocol server, so the owner can ask DynastyEdge
questions from the Claude apps and get answers grounded in live Sleeper data
and this app's own analysis. Spec: `MCP_DISCOVERY.md` (discovery 2026-09-19).
Behaviour and rules: CLAUDE.md's **The MCP Server** section.

What shipped: the three prerequisite refactors (§4 A/B/C) plus **one** tool,
`get_roster`, over stdio.

- **Prerequisite A** — `getTeamName` → `src/utils/teamName.js`,
  `MIN_SPARKLINE_POINTS` → `src/utils/valueHistory.js`, both re-exported from
  their old homes. Measured with a resolver hook that throws on any resolution
  of `react`: **3 of 30 utils React-tainted before, 0 after.** That probe is
  the right instrument — a plain "does it import?" check passes whenever
  `node_modules` is present, which is why §4 recorded 27 of 30. Side effect:
  the no-`node_modules` failing-file count moved **7 → 4**, the first time that
  constant has ever changed.
- **Prerequisite B** — `buildLeagueState` (`src/utils/leagueState.js`), lifted
  out of `useLeague`'s `useMemo`, with the 23 tests it never had. Equivalence
  **proved, not inspected**: the old memo body run verbatim beside the new
  function on live payloads, `deepStrictEqual` at three identity settings.
- **Prerequisite C** — one free-agent pool (`buildFreeAgentPool` /
  `buildAvailableDefenses`), replacing two divergent copies. The "never offer a
  defense as a general pickup" rule is now enforced by construction.

**Deliberately NOT in phase 1:** the other five tools, HTTP transport, OAuth,
deployment. The five tools became **MCP-1b**, below; the rest is MCP-2.

**It also closed `MCP_DISCOVERY.md` §8 question 2** (flagged there as
untested): esbuild, already present via Vite, bundles `mcp/stdio.js` plus all
of `src/utils` into a single 1.4MB ESM file that boots with **no resolver
hook**. Not shipped as a build step — that belongs to MCP-2 — but the approach
is de-risked.

### MCP-1b — MCP server phase 1b: the remaining five tools **SHIPPED 2026-09-19**

All six tools from `MCP_DISCOVERY.md` §5 now exist, still stdio only. (Two
more shipped later: `get_playoff_odds` in MCP-2a, `get_player_news` in MCP-2c.)
`find_sell_high`, `recommend_free_agents`, `resolve_assets`, `analyze_trade`
and `lineup_advice`, each documented with its contract and traps in CLAUDE.md's
**The MCP Server** section.

Every one is orchestration over `src/utils` in `getRoster.js`'s shape — no
domain math was added anywhere, so the server and the phone cannot disagree.

**New supporting pieces:**

- **`mcp/weekly.js`** — projections + the NFL schedule, on a **deliberate
  60-minute TTL** rather than the league snapshot's 15. League data changes on
  an event; the projections endpoint drifts 0.06% per ten hours
  (`weeklyProjections.js:13-15`). `mergeAsOf` recomputes `oldestSourceAt` over
  the union so a stale projection cannot hide behind a fresh roster fetch.
- **`mcp/teams.js`** — `resolveTeam` extracted from `getRoster` so
  `analyze_trade`'s `partner` and `lineup_advice`'s `team` resolve through one
  definition.

**Two real bugs found and fixed on the way:**

1. **Sleeper's `/league/{id}/users` returns `display_name`, NOT `username`** —
   verified live, all 10 users. Phase 1's `resolveTeam` matched on `username`
   alone, so the advertised "manager username" path had never fired and every
   candidate list rendered a bare `@`. Fixed once in the extracted resolver,
   so all three consumers get it.
2. **The output schemas caught two wrong assumptions before a reader saw
   them** — `fairBand.inside` (written as `inBand`) and `buildTradePitch`
   returning `{ text, lines, bullets }` rather than a string. This is the
   concrete first payoff of the zod validation `MCP_DISCOVERY.md` §7 asked
   for, landing on its first live call.

**Measured on the live league:** one 614ms cold snapshot assembly, then
3–47ms per tool; largest response 8,964B. `find_sell_high` returns a real
two-sided move (sell Jaxson Dart to Crippled Gang for Chris Olave, filling the
WR deficit). `resolve_assets` returns **six candidates for "Brown"** and
refuses to pick — the exact failure the resolve-then-grade rule exists to
prevent. Tests **357 → 489**; without `node_modules` **323 → 455**, the same
four hook-loading files. `dist` byte-identical at 995,441 bytes.

**Known gap, stated rather than hidden:** `analyze_trade` scores Layer 3 on
the win-window **tier**, not live playoff odds, because the server does not
fetch the rest-of-season simulation — and the response says so via
`winWindow.basis`. `myPlayoffPct`, `myDraftGrade` and `partnerActivity` are
likewise unwired. Each needs a fetch beyond the league snapshot; wiring them
is a natural phase-2-or-later increment, not a correctness bug.

### MCP-2 — MCP server phase 2: remote transport, OAuth, deployment **SHIPPED 2026-09-19**

**Both owner decisions are now SETTLED.** Host: **Vercel** (owner call — an
account and a `dynastyedge` team already existed, so nothing new was signed up
for; project `dynastyedge-mcp`, production domain
`dynastyedge-mcp.vercel.app`). OAuth: a **GitHub OAuth App**, registered by the
owner, client id `Ov23lipGgde1WRtguwMc` in `mcp/config.js` (public by design)
and the secret set as `GITHUB_CLIENT_SECRET` in Vercel (Production, Sensitive).

**Shipped on `claude/dynastyedge-mcp-phase-2-unblock-fyze45`:**

- **`mcp/store.js`** — the cache backend is a parameter, the freshness policy
  is shared. stdio keeps `memoryStore()` unchanged; HTTP passes its own. It
  *deleted* a duplicate: `snapshot.js` and `weekly.js` each carried a verbatim
  `loadSource`. Two traps pinned by test — a store-level TTL would break the
  stale-fallback contract, and the 1.20MB player DB must be gzipped (208KB).
- **`mcp/http.js`** — streamable HTTP as a Web-standard `(Request) => Response`,
  so the host is a packaging decision. **Stateless by necessity**: a session in
  RAM is what serverless cannot keep, and the failure would be intermittent
  (passes warm, fails cold). The limiter is hoisted so a warm instance does not
  hand every request the full concurrency budget.
- **`mcp/oauth.js` + `mcp/oauthRoutes.js` + `mcp/app.js`** — OAuth 2.1,
  stateless, GitHub upstream. No DCR (one pre-registered public client, the
  spec's named alternative), no JWT library (HMAC over base64url; all 25 auth
  tests run with no `node_modules`), HKDF-derived signing key so there is no
  second secret. Costs stated: 1-hour unrevocable tokens, 60-second codes
  where **PKCE is the defence rather than defence in depth**.

**Verified end to end against the live league**, only GitHub's identity call
faked: 401 + discovery → authorize → callback → token → `get_roster` in 608ms
(Nix Cage, 86,090, rank 3, 31 players, 12 picks, stamped, not stale); tampered
token 401s; unknown path 404s. Tests 489 → **538**; without `node_modules`
455 → **495**, and the failing-file count moved 4 → **5** (the fifth is
`mcpHttp.test.mjs`, which imports the SDK — a real dependency, not React
taint). `dist` byte-identical at 995,441 throughout.

**KV was NOT needed, and that is now a verified finding rather than a hope.**
It was considered twice and declined twice for different reasons: for
*caching*, a warm instance holds the store and the second request measured
21ms; for *OAuth state*, Claude's connector supports a pre-registered client,
which removes the registry that was the only thing genuinely requiring
storage. A multi-tenant server would still want it.

**All three remaining items are DONE, and each taught something.**

1. **Vercel packaging.** Three findings, one deploy cycle each, all in
   CLAUDE.md's Deployment section: function detection reads the **source
   tree**, not build output (and a deployment reporting `READY`/`LAMBDAS` can
   contain no function — curl the route); Vercel **traces** rather than
   bundles, so `src/utils`' extensionless imports fail on Node's ESM resolver
   exactly as they do under plain `node`, which is why `api/mcp.js` is a
   committed esbuild bundle with a CI drift guard; and the host may invoke a
   Node function with **either** calling convention.
2. **Deployment protection turned out not to apply** to the production alias
   at all — only to deployment-specific URLs. So the sequencing constraint
   recorded here was moot: the OAuth gate has always been the only lock, and
   it was verified from the public internet (401 unauthenticated, 401 forged
   token, 403 hostile `redirect_uri` with no `Location`, 403 lookalike host,
   PKCE `plain` refused, 404 unknown path).
3. **Connected.** The first attempt failed with *"Couldn't start sign-in"* —
   three silent discovery bugs, all mine, all now fixed and pinned:
   **no `registration_endpoint`** (RFC 7591 is a SHOULD, but Claude's
   connector registers itself, so a missing SHOULD is a hard failure);
   `resource` returning the **bare origin** rather than the canonical `/mcp`
   URL the user typed; and the protected-resource document served **only at
   the bare well-known path**, not the `/mcp`-suffixed one RFC 9728 §3.1
   specifies. **The lesson worth carrying: a discovery bug fails before any
   browser opens and logs nothing anyone reads.** Registration stays
   stateless — the signed `client_id` *is* the registration, and the origin
   allowlist binds when it is minted.

**Verified through Claude's own connector**, which is the acceptance test this
item always wanted: `find_sell_high` returned the live two-sided move (Jaxson
Dart → Crippled Gang for Chris Olave) with every source stamped fresh.

**Still open, unchanged:** `mcp/limit.js` backs off on a fixed schedule because
`fetchJSON` discards the `Response`, so a 429's `Retry-After` is unreachable.
One user makes this academic; a hosted endpoint may not.

**Historical — the trigger, now discharged:**

1. ~~**Is `@modelcontextprotocol/sdk` approved as a runtime dependency?**~~
   **APPROVED by the owner 2026-09-19 (PR #56).** The hand-rolled JSON-RPC
   fallback is off the table; `mcp/` stays as built. Note the approval is for
   **this** dependency only — the next one needs its own, per
   `dynastyedge-change-control` §2 rule 5.
2. **Which host, and the OAuth app registration — STILL OPEN, and the only
   thing blocking phase 2.** Both need an account and a secret, so no sandbox
   can do them. `MCP_DISCOVERY.md` §1 chose "serverless (Workers/Vercel class)
   + OAuth, single user" as the only shape that reaches the Claude **mobile**
   app; §8 question 1 leaves the deployment mechanism undesigned.

**What phase 2 must change, beyond adding a transport:**

- **The caches.** `mcp/snapshot.js` uses module-level singletons — correct for
  a long-lived stdio process, **wrong for serverless**, which has no warm
  process. §6 calls for external KV.
- **The resolver hook.** A deployed server must not depend on `mcp/loader.mjs`.
  Use the bundling step MCP-1 verified.
- **The rate limiter's blind spot.** `mcp/limit.js` backs off on a fixed
  schedule because `fetchJSON` discards the `Response`, so a 429's
  `Retry-After` is unreachable. One user over stdio makes this academic; a
  hosted endpoint may not.

**Not blocked on any of the above: the remaining five tools** (`find_sell_high`,
`recommend_free_agents`, `resolve_assets`, `analyze_trade`, `lineup_advice` —
`MCP_DISCOVERY.md` §5, in build order). They work over stdio today and need no
host. Treat them as phase 1b if the owner wants more capability before more
infrastructure.

### MCP-2a — playoff odds, and Layer 3 on live odds **SHIPPED 2026-09-20**

A seventh tool, `get_playoff_odds`, and the thing it was really for: wiring
`myPlayoffPct` so `analyze_trade`'s Layer 3 scores on **live playoff odds**
instead of the win-window tier. Done together because they share one fetch —
which is why MCP-2's carry-over list called the odds signal "most valuable and
most expensive".

**Why it was worth ~14 requests.** The tier ranks *accumulated assets*, bench
and picks included, and tracks the actual **starting lineup** — the question
Layer 3 asks — at Spearman **0.721**, against odds' **0.988**. It also has no
`Middle` branch, so 40% of this league took no lean and scored a flat 0.

**Prerequisite D, in the shape of A/B/C.** The whole odds composition lived
inside `usePlayoffOdds`, so no tool could reach it. `splitCompletedWeeks` and
`buildPlayoffOutlook` moved to `src/utils/playoffOdds.js`; the hook keeps the
**memo and nothing else**, which is the right split (caching by input identity
is a rendering concern). Equivalence **proved, not inspected** — the
pre-extraction body run beside the new function across five season shapes at
two field sizes, `deepStrictEqual` on all 20.

**`mcp/season.js` is a THIRD TTL with its own argument**, deliberately not an
alias of `weekly.js`'s equal number: a completed week is frozen forever, and
the model *discards* a partially-played one, so the odds output moves once a
**week**. It owns the state that must never happen — fourteen empty weeks and a
season that has not started are identical on the wire, so a total outage is
reported `unavailable`, never as a preseason.

**One distinction the fixtures got wrong first and the code got right:** a
**posted but unplayed** schedule is `active`, not `preseason` — the model runs
Week 1 off the roster-strength prior alone. Only *no schedule at all* is
preseason. Both are now pinned.

**Verified live over the real transport** (2026 Week 2, a real MCP client on
`StreamableHTTPClientTransport`): 7 tools; `get_playoff_odds` 948ms cold /
71ms cached / 6,152B; Nix Cage **58.1%**, projected 6.5-7.5, seed 5.9, "On the
bubble" — which at this league's 60% baseline is what it should read; Σ odds
across the field **600.3%** against the 600% the field size demands; identical
across repeat calls (fixed seed); `matchups` stamped into `asOf`; `seedDist`
absent as designed. Then `analyze_trade` returning **`windowBasis: 'odds'`**
with the note quoting *"on the bubble at 58% playoff odds"*.

Tests 543 → **589**; without `node_modules` **546**, the same five failing
files. **The gap between the two counts is 43 and did not move**, which is the
cleaner form of the equal-delta check this repo has been doing by subtraction:
an unchanged gap means every test added loads with no `node_modules`.

**Doc drift found and fixed on the way:** CLAUDE.md, the PR template and this
file all said **538** when `main` was at **543** — the dynamic-client-
registration commit added 5 tests after phase 2's PR merged without updating
the block. A stale count there reads as a code regression to the next session,
which is the exact confusion it exists to prevent.

**Still open from MCP-2's carry-over list:** `MCP_DISCOVERY.md` §5's remaining
phase-two tools (trade targets / fair packages, manager scouting, rookie
research); `/league/{id}/winners_bracket`, still never called; `mcp/limit.js`'s
fixed backoff; and `restKvStore`, still never verified against a live store.
The two unwired `analyze_trade` signals are **closed by MCP-2b below**.

### MCP-2c — game locks, live scores, and news that arrives unasked **SHIPPED 2026-09-20**

**The bug, in full, because it is the most instructive one this server has
produced.** Asked for lineup advice on a Sunday lunchtime in Week 2, the tool
answered:

> `[MUST FIX] SIT DJ Moore → START TreVeyon Henderson · +8.5` ·
> "DJ Moore is listed Out and will likely score 0" ·
> **8.4 points sitting on your bench**

Moore's game (DET @ BUF) had finished on **Thursday**. Three claims were false
at once: he could not be benched, he had not scored 0 — he had banked **−0.1**
before leaving with an AC joint sprain — and the 8.5 points were reported as
recoverable when nothing could recover them. Reproduced live with
`refresh: true`, every source **0 seconds old**, so this was never a staleness
problem: the schedule payload had carried `status: "complete"` the whole time
and `parseByeTeams` read only `home`/`away`/`week`.

**What shipped, and where.** The math is in `src/utils`, so the phone's
Optimizer had the identical bug and is fixed by the same change:

- `parseLockedTeams` (`utils/projections.js`) reads `status`.
  `getAvailability` gains **`locked`**, orthogonal to `blocked` — one is a
  claim about the future, the other about whether the transaction is open at
  all. Moore was both.
- `selectOptimalStarters` gains a `pinned` option. Locked starters hold their
  slots at their **real** score; locked bench players leave the pool. The
  question narrows to *"the best lineup you can still reach"*, which is the
  better question because the first one has an answer you may not be allowed
  to act on.
- Actual points come from `players_points` on the current week's matchups,
  which `useSleeper` **already fetches** — so the phone pays nothing;
  `useLeague` exposes `weeklyPlayerPoints`. On the server that is
  `mcp/liveScores.js`, a fifth TTL at **5 minutes**.
- `get_player_news` (tool 8) plus injury detail (`injury_body_part`,
  `injury_notes`, `espn_id` joined the MCP player-DB trim) and beat reporting
  attached to flagged players in `lineup_advice` and `get_roster`.

**Measured, same roster, minutes apart:** `128.5 → 136.9, 8.4 left on bench,
1 must-fix` became `76.4 total, 0.0 left, 0 must-fix, 6 slots locked, 9.1
banked`.

**Three lessons worth carrying forward.**

1. **A payload field nobody reads is not a field nobody needs.** The schedule
   has three useful fields and the repo documented two. Both `parseByeTeams`
   copies were written to answer "who is on bye" and never revisited when the
   question widened.
2. **`--overflow` cannot see a wrapping failure.** The `FINAL` badge squeezed
   the name column hard enough to break "DJ Moore" into **seven lines** at
   390px, and the truncation instrument reported zero clipped elements —
   correctly, because the name *wraps* rather than clips. The fix was also
   better information design: a locked row drops the matchup pill, since a
   rating that forecasts the defense a player is *due to face* is meaningless
   once his game is over.
3. **The closed `asOf.sources` schema earned its keep a fourth time** — two new
   sources (`liveScores`, `news`) had to be declared or a real client rejects
   the whole response.

**Open, deliberately.**

- **The news feed can be ~35 minutes behind a wire report** (publishes twice an
  hour through a ~5-minute CDN cache), which is exactly when a late inactive
  lands. `staleForKickoff` marks the condition and the tools tell the reader to
  confirm against a live source. **The honest fix is not a shorter TTL** — it
  is the pipeline's publish interval, and tightening `news.yml`'s cron is a
  separate, unmeasured change. Revisit only if the warning proves insufficient
  in practice.
- **`get_player_news` is the first tool to read a static feed**, and the other
  three (`values-history`, `trade-values`, `rookie-intel`) remain unread. A
  second league still gets no news; the tool says so.
- **The connector's own tool list has not been re-checked since phase 2b**
  (seven tools, 2026-09-20). Eight is expected after this deploys; that check
  is the end of the chain no probe can reach, so it is owed.

### MCP-2b — the last two signals, and the deploy gap **SHIPPED 2026-09-20**

`partnerActivity` and `myDraftGrade` — the two signals `analyze_trade` had
been naming in its own notes as absent — are wired. **Neither touches a
score**, which is the rule this app runs on: *roster facts may score; second
opinions describe.*

**Two new data layers, each sized by measurement rather than by copying the
app's:**

- **`mcp/transactions.js`** — a **FOURTH TTL, and the only SPLIT one**. A
  settled bucket is frozen (week 1's newest entry is 2026-09-16, week 2's
  oldest 09-17); the live week changes on an **event**, and those are the very
  events that make a roster wrong, so it rides the **snapshot's** 15 minutes
  rather than inheriting `season.js`'s 60. A cached refresh costs **0**
  requests. It also reads weeks 1..current only: Sleeper buckets by the week a
  move was *processed*, so a later bucket is empty by construction — measured
  71 / 6 / 0 / 0 / 0, i.e. **2 requests, 63ms, all 77 moves** where the phone's
  path spends 18.
- **`mcp/history.js`** — the league-history walk, **deliberately narrower**
  than `useLeagueHistory`'s ~169 concurrent requests. Draft grading reads no
  transactions and no users, so it fetches leagues + rosters + drafts + picks:
  **14 requests, 199ms** over three past seasons, with zero transaction URLs
  and zero user URLs *asserted by test* rather than claimed.

**`buildDraftGrades` is a prerequisite refactor in the A–D shape** — the draft
record reachable without the ledger beside it, calling the same
`buildDraftRecords` the app runs, equivalence **proved** field for field
against `buildManagerProfiles`. Pairing the narrow walk with the full profile
builder would have reported an empty ledger as "this manager has never
traded"; that is why the narrow function exists.

**The degradation contract is the sharpest thing here, and it cuts both ways.**
"They have made no moves" is a **real answer about a quiet manager**, so an
outage must never render as one — and a genuinely quiet partner must still be
reported as quiet. Both directions are pinned. The first cut of the history
walk got the mirror case wrong: everything failing produced an *empty* history,
which reads as "you have no rookie-draft record" — a claim about the owner made
on no evidence. The test caught it; the drafts **list** error is no longer
swallowed while a per-draft picks error still is.

**THE ZOD OUTPUT SCHEMA CAUGHT A BUG LINT, 630 TESTS AND A CLEAN BUILD ALL
MISSED.** `asOf.sources` is closed, so two undeclared sources made a real MCP
client reject the entire response. The tests call `buildTradeAnswer` directly
and never cross the wire — only driving the real transport found it. Third
time this schema has paid for itself.

**The connector itself lists all seven, confirmed on the owner's phone
2026-09-20** — the one check no probe can make, since it needs the GitHub
browser login. MCP-2b is closed end to end.

**Verified live over the real transport** (2026 week 2): 7 tools;
`analyze_trade` acquiring a pick **512ms cold / 78ms cached**, `windowBasis:
'odds'` intact, `transactions` and `history` stamped into `asOf` beside the
other six. Partner activity read *"Added Raheim Sanders (RB), Michael Mayer
(TE), Garrett Nussmeier (QB) +1 more in the last 3 weeks"* — which
cross-validates against the live transaction feed — and the nudge read *"7 of
your 11 graded rookie picks"*. The nudge stays silent on a player-for-player
trade, as designed.

Tests 589 → **630**; without `node_modules` **587**, the same five failing
files, **the gap holding at 43**.

**Also closed here — two findings about phase 2a that were not about code:**

1. **PR #59's one unmet gate is now met.** The 390px route sweep was recorded
   as blocked on `playwright-core`. It was not: the `dynastyedge-visual-capture`
   skill **sanctions** installing it in a throwaway `/tmp/pw`, explicitly never
   in `package.json`, and Chromium is already on disk. All four
   `usePlayoffOdds` consumers were swept against live data — `/league/playoffs`
   (Nix Cage 58%, matching the MCP number), `/edge`, `/trade` (odds-driven
   buyer/seller flags on all nine partner cards) and `/trade/analyze` — with
   **zero page errors**. *Read a skill before recording something as blocked.*

2. **The Vercel project had NO GitHub integration — so merging to `main` had
   never once deployed the MCP server. FIXED 2026-09-20: the owner connected
   the repo.** Phase 2a sat merged and undeployed for an hour; production was
   still serving the six-tool build from `9051ea6`, whose committed bundle
   contains **zero** occurrences of `get_playoff_odds`.

   **The diagnosis is the durable part, because the failure is silent** — the
   dashboard shows deploys with branch names and commit messages on them, so it
   reads exactly like auto-deploy. Three signals said otherwise, and any one of
   them is enough to check next time:
   - `main` HEAD carried **0** commit statuses — no Vercel check at all.
   - The only GitHub deployment environment was `github-pages`.
   - A **feature-branch** commit had deployed to `target: production`, which
     git integration never does — it sends non-default branches to *preview*.

   Every deploy before this was a manual CLI/API push from a session checkout,
   which stamps git metadata and therefore *looks* auto-deployed.

   **The manual path still works and is the fallback**: a `gitSource`
   deployment against the public repo needs no integration at all (that is how
   phase 2a and 2b were both shipped). Keep it in mind if the integration is
   ever disconnected.

   **A connection is not a proof.** Connecting does not backfill: commits
   pushed before it keep their zero statuses, so the first push *after*
   connecting is the real test — a Vercel check on the commit and a
   `Production` deployment environment appearing on GitHub. Verified by the
   doc-fix commit that carries this paragraph.


### PIPE-1 — the trade-value archive priced every pick at 0 **SHIPPED 2026-09-21**

**Found by reading the published feed, not the code** — which is the
transferable half. `scripts/snapshot-trade-values.mjs` looked entirely
reasonable; its output did not. Both archived trades carried picks valued
`0`, including a four-pick trade rendering *"at trade time: got 0 ⇄ gave 0"*.

**Root cause:** the script classified FantasyCalc entries with `if (sid)`.
FantasyCalc began stamping pick entries with **synthetic non-numeric
`sleeperId`s** (`FP_2027_1`, `DP_0_8`) in 2026-07 — verified live 2026-09-21,
**0 of 418 entries carry a falsy id** — so `pickEntries` was always empty and
`pickValue()` returned 0 for every pick, on every run, for two months.

**This is the same bug CLAUDE.md documents as FIXED.** `useFantasyCalc` and
`mcp/snapshot.js` were corrected in 2026-07; the three `scripts/snapshot-*.mjs`
carry their own copies (Actions cannot resolve `src/utils`' extensionless
imports) and were not. **A fix to the app is not a fix to the pipelines** —
recorded as failure-archaeology §3d, the fourth member of the pick-valuation
family and the first outside `src/`.

**Why it mattered more here than in the app.** The archive is **permanent and
never pruned**, and trade-time prices cannot be recomputed in hindsight — so
every run wrote data that could never be corrected, only deleted. And
`useTradeTimeValues` already had the right guard (any missing asset hides the
line, because a partial total misleads): a `null` trips it, a **0 sails
through it** and renders as fact.

**Shipped:**
- **`scripts/fantasyCalcValues.mjs`** — one pure classifier + pick pricer,
  shared by all three snapshot scripts, pinned by
  `tests/fantasyCalcValues.test.mjs` (10 tests, including the old
  presence-based classifier kept as an **executable** regression statement so
  nobody "simplifies" the shape check back to a truthiness test). Same
  precedent as `scripts/newsRetention.mjs`.
- **The ladder ends in `null`, never 0** — that season's round median, then
  the generic round median across every season listed, then null.
- **A self-heal for the published archive:** any pick value of exactly 0 is
  rewritten to null on the next run. FantasyCalc never prices a pick at 0, so
  a stored 0 can only be this bug's output. It goes through the **normal
  publish path**, not a hand-edit of the data branch.

**Verified against live data**, not fixtures: the fixed script reads
**394 players + 24 pick entries** (was 418 + 0), healed the 5 archived zeros,
and prices every round in the live window — 2027 1st **3204**, 2nd 1655,
3rd 1098, 4th 898, 2028 1st 2203, 2029 1st 1961 — with the **retired** 2026
season correctly falling back to the generic median (3022) rather than 0 or
null. Both other scripts run clean and their stale pick rows now age out of
the window by themselves. Tests 669 → **679**, without `node_modules`
**636**, the gap holding at **43**.

**The two harmless copies were fixed too**, for consistency rather than
damage: `snapshot-values.mjs` / `snapshot-values-archive.mjs` merely spent
rows on pick entries no consumer looks up, and their 500-row cap never binds
because FantasyCalc lists only ~418.

### OPS-1 — the Vercel integration was building every data-branch push **SHIPPED 2026-09-21**

**MCP-2b's win created this, and the two belong together.** Connecting the
GitHub integration on 2026-09-20 fixed the silent no-deploy problem — and
immediately started deploying **every branch**, including the three
force-pushed data branches. `news.yml` pushes twice an hour, so the project
was producing **~48 junk preview deployments a day** (plus one each for
values-history and rookie-intel) that build a JSON file nobody requests.
Measured 2026-09-21: three of the last four deployments were `news-data`
"Update news feed" commits.

**The fix is a PROJECT-LEVEL Ignored Build Step, and the rejected option is
the durable lesson.** `git.deploymentEnabled` in `vercel.json` is the
documented way to disable a branch — and it would have been a **dead no-op
that reads like a fix**, because Vercel reads `vercel.json` from *the branch
being pushed* and these branches carry only their JSON payload (verified:
`news-data` holds `news.json` and nothing else). It was written, then
reverted before commit. What shipped instead:

```sh
case "$VERCEL_GIT_COMMIT_REF" in news-data|values-history|rookie-intel) exit 0 ;; *) exit 1 ;; esac
```

Exit 0 skips the build, exit 1 proceeds — `main` and every `claude/*` branch
are untouched, so feature-branch previews still work.

**It is a Vercel dashboard setting, so it is invisible in this repo.** Its
only records are CLAUDE.md's Deployment section and
`dynastyedge-run-and-operate` §3. **A fourth data branch must be added to that
`case`**, and if data-branch builds ever reappear in the deployment list, that
setting is what was lost.

**Post-merge check owed:** confirm the next `news-data` push produces no
deployment (or a skipped one). The setting was applied 2026-09-21 and the
cron fires at :17 and :47 UTC.

### NEWS-4 — the news item cap is binding again, at 78h

**Status:** open, and it is a **decision, not a bug**. **Trigger: fired** —
measured 2026-09-21 while closing NEWS-3.

Live `coverage`: `playerItems 400 / playerCap 400`, `spanHours 78`,
`distinctPlayers 198`, 480 items total. **The cap is binding before the time
window does** — the same signature as the 2026-09 collapse, one level up (400
instead of 240) — against a documented 7-day/168h window that has now never
bound at either cap.

**What is different this time, and why it is not the same failure.** The 2026-09
collapse was a *breadth* failure: 240 items resolving to 97 distinct players,
3.14 each, one carrying 23. Diversity-aware eviction fixed that and it has
held — **198 distinct players** now, double the collapse figure. So the cap is
buying breadth as intended; there is simply more qualifying news than 400
slots at the current arrival rate.

**The decision:**
- **Raise the cap.** The feed is 210KB raw, and CLAUDE.md's own rule is to
  size it by **wire** bytes (~114 B/item gzipped), which puts 400 items around
  55KB and leaves real headroom. This is the option the evidence favours.
- **Or accept 78h as the honest operating depth** and correct the 7-day claim
  in CLAUDE.md, which has now been aspirational for two cap settings running.

**Do not "fix" it by adding sources** — NEWS-1's standing ruling, unchanged.
Whichever way it goes, `spanHours` stays the number to watch: `playerItems`
sitting at its cap is exactly what a healthy full feed looks like, which is
how the last collapse ran for days unnoticed.

### MCP-CARRY — what the MCP server still owes

**Status:** open, consolidated 2026-09-21 from the tails of MCP-2a/2b/2c,
which had scattered it across three items. Nothing here is a correctness bug;
it is the honest remainder.

**Capability not built:**
- **Three of `MCP_DISCOVERY.md` §5's phase-two tools** — trade targets / fair
  packages (note: the ~730ms path in-app), manager scouting (the biggest fetch
  burst), rookie research.
- **Three of the four static feeds are still unread** — `values-history`,
  `trade-values`, `rookie-intel`. `get_player_news` was the first to read one.
  So a second league gets no sparklines, no at-trade-time values and no rookie
  research, and the tools say so.
- **`/league/{id}/winners_bracket` has still never been called**, so *"who won
  our league in 2023?"* remains unanswerable. One endpoint.

**Known limits, stated rather than hidden:**
- **`mcp/limit.js` backs off on a fixed schedule.** `fetchJSON` throws an
  `Error` that embeds the status and discards the `Response`, so a 429's
  `Retry-After` is unreachable. One user makes this academic; a hosted
  endpoint may not. **Do not fix it by adding retry logic to `fetchJSON`** —
  that changes the app's behaviour to solve a server problem.
- **`restKvStore` has never been verified against a live store.** KV was not
  needed (a warm instance holds the cache; the second request measured 21ms),
  so the code path exists untested.
- **The news feed can trail a wire report by ~35 minutes** near kickoff — it
  publishes twice an hour through a ~5-minute CDN cache. `staleForKickoff`
  marks the condition and the tools tell the reader to confirm against a live
  source. **The honest fix is the publish interval, not a shorter TTL**, and
  tightening `news.yml`'s cron is a separate, unmeasured change.

**Owed, and owner-only:** re-confirm the connector lists all **eight** tools
on the phone. Phase 2c's deploy *did* land (`bcf5c6a` is `target: production`,
verified 2026-09-21), but the tool list is the end of the chain no probe can
reach — it needs the GitHub browser login.

### ACTIVE-3 — the September 2026 build plan (owner-approved 2026-09-04)

**`docs/build-plan-2026-09.md` is the active work queue.** It carries four
phases, each with its own kickoff prompt, verification criteria, and — where the
evidence didn't support building — an explicit decision not to. It came out of
`docs/analysis/optimizer-data-sources-2026-09.md`; read that study's REVISION
block before touching any of it, because two of its original conclusions were
overturned.

- **Phase 1 — SHIPPED 2026-09-04.** Confidence percentages on lineup moves
  (`utils/lineupConfidence.js`, table regenerated from
  `scripts/dev/optimizer-signal-backtest.mjs` §3) with sub-1-point swaps
  demoted; the DEF free-agent fix (`utils/freeAgents.js` — the waiver drawer
  returns 14 defenses against live data, and DEF is a Free Agents filter);
  weekly projections + a Proj sort in League › Free Agents
  (`hooks/weeklyProjections.js`, shared with the Optimizer); snap/target/rush
  share on the player profile drawer, DISPLAY ONLY. The `TEAM_*` stats trap is
  now in CLAUDE.md's Critical stats note. Owner correction on review: defenses
  are reachable only through the DEF chip/slot and carry no dynasty framing —
  you roster exactly one, so the app must never suggest adding them (now
  League Context doctrine in CLAUDE.md). 163 tests, lint + build clean.
- **Phase 2 — SHIPPED 2026-09-04, acceptance test MISSED (10 of 25 vs a target
  of 12) — see NEWS-3 below, `docs/analysis/news-sources-2026-09.md`, and
  `docs/analysis/news-retention-2026-09.md` (which found the accumulation
  described two lines down was never actually reaching 7 days).**
  FantasyPros dropped (all three endpoints dead); ten sources probed and
  adopted, ten rejected; the feed now accumulates across runs (7d player / 48h
  general) instead of being a 20-hour snapshot; and items carry `playerIds`
  (Sleeper ids resolved server-side) because `espn_id` is null for 17 of the
  owner's 26 rostered spots. Coverage doubled, 5 → 10.
- **Phase 3** — rookie research split into "impact now" vs "long-term stash",
  adding age + athleticism from nflverse and (gated on a key) college
  production. **3c is a hard gate:** if the long-term score doesn't beat draft
  capital out of sample, report the null and stop.
- **Phase 4** — a real valuation consensus. FantasyCalc is currently the app's
  only valuation source. Three are obtainable free and ID-joinable: FantasyCalc
  (actual trades), DynastyProcess (FantasyPros expert consensus), KeepTradeCut
  (crowdsourced votes). **FantasyCalc and KTC agree at 0.975 even among the top
  25; DynastyProcess is the lone outlier at ~0.51** — market view vs expert
  view. Archive all three daily first (starts the clock on "which source
  leads?"), then surface the disagreement. Do not average them; do not replace
  FantasyCalc. See the plan's §10.

- ~~**Phase 4 (original)** — the breakout alert~~ **CUT 2026-09-04.** It became testable
  when nflverse's historical injury reports were found, and it tested null:
  players whose position-mate was ruled Out beat their projection by +1.13
  against a +0.98 control (n=318). Sleeper had already raised their projections.
  See the plan's §9c.

### NEWS-3 — ~~re-measure news coverage once the window fills to 7 days~~ **CLOSED 2026-09-21 — PASS**

**The trigger fired and the measurement beat both its target and this file's
own prediction.** `node scripts/dev/news-coverage.mjs` against the live feed:

```
resolved by the app:            18 / 31   <- the acceptance number
ceiling (headline+story match): 18 / 31
items: 480 · span: 77.5h · resolved to playerIds: 381 (79%)
RESULT: PASS
```

**18 of 31 against a target of ≥12**, where the pre-registered prediction
below was **9–11**. Recording the beat as carefully as a miss: the target was
set at 25 rostered players and the denominator is now 31, but the *rate* moved
too — 58% against the 40% the old 10-of-25 represented.

**Matching is still saturated** (achieved == ceiling, 18 == 18), which is the
same finding as before and still means **no matching work can move this
number**. What changed is volume: accumulation finally had time to run. The
13 uncovered are the same *kind* the memo identified — healthy starters on a
quiet week, plus a team defense and taxi rookies the player index cannot
reach.

**NEWS-1's standing ruling is unchanged and now has a second data point
behind it: do not bolt on low-signal feeds to chase this number.** The lever
that worked was retention, twice.

**What the measurement also surfaced is NEWS-4** — the item cap is binding
again at 78h against a documented 168h window. Coverage passing and the
window being short are not in tension: the cap is buying breadth (198 distinct
players, double the collapse figure), there is just more qualifying news than
400 slots hold.

The original entry is kept below as the record of the deferral.

**Trigger (original):** on or after **2026-09-19** (the retention fix landed 2026-09-12
with the window at 112h of its 168h target).

NEWS-1 fired, found a **regression**, and the cause was a retention bug rather
than a coverage ceiling — eviction was recency-only, so the item cap bound at
~30 hours and the documented 7-day window had never once bound. Fixed
2026-09-12 (diversity-aware eviction + cap 240 → 400). One published run moved
span **27.5h → 112h** and the acceptance number **6 → 8 of 30**. Full memo:
`docs/analysis/news-retention-2026-09.md`.

**Do this:** run `node scripts/dev/news-coverage.mjs` against the live feed.

**Predicted before the fact: 9–11, i.e. still short of the ≥12 target.** Record
whatever it actually is. Then make the owner call §9 of the memo sets up, which
is *not* "add sources":

- Matching is saturated — the metric's achieved number equals its ceiling
  again, so no matching work can move it.
- The residual is **source-kind, not source-count**. CeeDee Lamb, Jonathan
  Taylor, DJ Moore, Mark Andrews and Jordan Love had **zero** occurrences in
  266 items over 112 hours of eleven national sources — not even a bare
  surname. These feeds publish injury/transaction/storyline news; a healthy
  starter on a quiet week generates no item anywhere in them.
- The denominator can't reach 30: **1 of the 30 is a team defense** (the player
  index is skill positions only) and **5 are taxi**, 4 of those never-played
  rookies. ≥12 of 30 means 12 of the ~24 reachable.

So the two live options are **move the target** to what this source population
can deliver, or find a per-player notes feed covering *all* rostered NFL
players. NEWS-1's standing ruling still holds either way: **do not bolt on
low-signal feeds to chase the number.**

### NEWS-2 — wire the feed's `coverage` block into the drawer's data-status row

**CLOSED 2026-09-12** — built alongside the retention fix, which is what made
it newly relevant. The News row now carries one indented line ("5d deep · 119
players"), amber under 48h of depth. It surfaces **depth, not item count**, for
the reason the re-spec below gives. Verified in both states against real feed
payloads (healthy 112h, and the pre-fix 28h feed rendering amber and correctly
dropping the player count it has no field for). Original item kept below.

**Trigger (original):** ready now; small, and gated only on whether it earns its
screen space. Owner call.

Phase 2's step 5 asked for a relevance/source breakdown "in the feed JSON so
the side drawer's data-status block can show feed health". **The data shipped;
the UI did not.** `news.json` now carries
`{ total, playerItems, playerCap, distinctPlayers, withPlayerIds,
withAthleteIds, spanHours, sources }` next to `updatedAt`, and nothing in the
app reads it — the drawer still shows only the News row's refresh age and
publish age.

What it would add: a dead pipeline is already visible through publish age, but
a **degraded** one is not. A run where RotoWire's markup changed, or where the
player DB fetch failed and every new item landed in the general bucket, still
publishes a fresh `updatedAt` while `playerItems` quietly collapses. That is
the failure this block was published to make visible.

**SURFACE `spanHours`, NOT `playerItems` — this item as originally specified
would NOT have caught the 2026-09 collapse.** That failure ran for days with
`playerItems` sitting at *exactly* its cap, which is what a full, healthy feed
looks like; depth had meanwhile fallen 159h → 27.5h. Span was the number that
told the story, and `distinctPlayers` was what the cap was failing to buy.
`playerCap` now ships beside `playerItems` so "is the cap binding?" is
answerable from the feed alone. A useful one-liner is span + distinct players,
with the amber rule on **span**, not on item count.

Keep it to one line under the existing News row — the drawer is already dense,
and this is diagnostic, not daily information.

**Blocked, owner action:** Phase 3b needs a free CollegeFootballData API key
stored as repo secret `CFBD_API_KEY`. Nothing else in the plan is blocked.

### 2026-09-04 — Phase 3 landed partial: 3a shipped, 3c a null, 3b and 3d NOT built

Full memo: `docs/analysis/rookie-longterm-signals-2026-09.md`.

- **3a shipped.** `rookie-intel.json` now carries age at the NFL draft,
  height/weight and the three well-covered combine drills, joined **by ID only**
  (`pfr_id` → `gsis_id`/`espn_id` → `sleeperId`). Rendered on the profile
  drawer as *"Measurables · context, not scored"*.
- **3b NOT attempted — still the open owner action.** `CFBD_API_KEY` could not
  be verified from the session: the agent proxy blocks the GitHub Actions API
  (`/actions/secrets` → 403), and nothing in the repo references the secret.
  Per the instruction to build 3b only if the secret exists, it was skipped.
  The pipeline reads no key and publishes fine without one.
- **3c is a null and 3d is stopped.** A "long-term" score from age +
  athleticism beats *draft capital alone* out of sample by only +0.012 rho
  (95% CI includes zero), is a **worse** predictor of years 2–3 than the score
  already shipped (+0.602 vs +0.632), and correlates **0.934** with it. The
  "low impact now / high upside later" quadrant a two-axis UI exists to surface
  held **0 rookies across nine real draft classes**. Combine athleticism
  specifically is null (+0.002).

**RESOLVED 2026-09-04 — the key arrived and college production was tested. It
is also a null.** See `docs/analysis/rookie-college-production-2026-09.md`
(run 33931139020). Dominator rating IS orthogonal to draft capital
(r = +0.05…+0.09) and does produce a different ranking (0.725 vs the shipped
score), but the long-term score built on it predicts years 2–3 **worse than the
shipped score and worse than capital alone**, adds +0.011 at t = 1.71 on top of
the shipped score, and populates the taxi-stash quadrant with 6 of 391. Nothing
ships; **the two-axis rookie question is closed.**

The one thing from 3b that did not get its own gate and might deserve one:
**breakout age** (n = 306, univariate +0.262 vs years 2–3, the strongest single
college number measured). It is currently dated off age at the draft rather than
a real birthday, which is coarse. Also worth re-running everything if CFBD ever
backfills ESPN ids before college season 2015 — that roughly doubles the usable
frame.

**One measured follow-up — SHIPPED 2026-09-05 on the owner's ask.** The 0.10
age tilt (+0.018 rho against years 2–3, t = 3.35, 8 of 9 classes, no measurable
cost to year 1) is now the board score, as `dynastyOpportunityScore`. See §5 of
the long-term memo for the implementation contracts — in particular that an
unknown age is a no-op rather than an imputed average, which matters because
only 78 of 237 published rookies carry one.

**Open, and worth a look eventually:** the board's bottom is dense — 172 of 237
rookies share just 26 distinct scores under 6/100 — so tiny score differences
produce enormous *rank* movement among players who all read "thin opportunity".
That predates the tilt and is a presentation problem, not a model one. If the
Opportunity sort ever feels jumpy, this is why.

**Do not** re-test multi-source projections, a boom/bust score, weekly defense
streaming, or usage-as-prediction. All four were measured and rejected; §0 of
the plan carries the numbers.

The previously-listed deferred items below are unchanged — every trigger was
re-checked 2026-08-14 and none has fired. The calendar-driven ones (the rookie
draft, OPEN-2; Week 1, OPEN-5) still have no date.

### Verified 2026-08-14 — ACTIVE-2 closed: the rookie-intel pipeline's first run

`rookie-intel.yml` published for the first time on **2026-08-14 11:12Z**, which
fired ACTIVE-2's trigger. All three verification steps pass.

**1 — Feed shape.** `meta` = `{ rookieClass: 440, published: 235, withCapital:
80, withDepth: 234 }`, matching the 2026-08-08 local dry run (~236 / ~80). 22
weekly columns, `2026-03-16` … `2026-08-10`; `asOf: 2026-08-14`; 53,740 bytes
(the ~52KB the pipeline was sized for).

**2 — Market vs Model populates.** Replaying the shipped path under Node
(`buildRookieProspects` → `buildRookieResearch` → `splitDivergence`) against
the live feed + live Sleeper/FantasyCalc: 440 prospects → 235 scored → 71
divergence-eligible (the FantasyCalc-valued subset). **8 undervalued / 7
overvalued** raw at the default `minGap` 5, displayed as 6/6 (`splitDivergence`'s
`limit`). The gap distribution is exactly what the calibration memo predicted
for within-position ranking: median |gap| 2, max 12.

The rendered page agrees value-for-value with the Node replay — Nate
Boerkircher +10, Sam Roush +10, Caleb Douglas +7, Mike Washington +6, Brenen
Thompson +6, Colbie Young +6; Cyrus Allen −12, Malik Benson −6, Justin Joly −6.
Your Targets resolves against real deficits (WR, Contending): Carnell Tate,
Jeremiyah Love, Jordyn Tyson, Fernando Mendoza. No backup tight ends lead the
undervalued list — the shared-points-scale trap the model was built to avoid
stayed avoided on live data.

**3 — Drawer status row.** The **Rookies** row reads `just now · feed 8h`.

Health: `npm ci` → **126/126 tests**, lint clean.

> ⚠ **Capture artifact — do not chase it as a bug.** In that same drawer
> capture, **News and History read `—`** while Rookies resolves, and it persists
> at a 9s settle. It is the screenshot harness, not the app: `screenshot-app.mjs`
> serves external requests with **synchronous** `execFileSync` curl calls, so
> the multi-MB `/players/nfl` fetch blocks Node's event loop past `fetchJSON`'s
> 10s AbortController timeout for the feeds racing it on The Edge. `loadNewsFeed`
> memoizes the *promise* and a failure resolves to `[]` with `newsFeedFetchedAt`
> never set, so the drawer's later call gets the cached empty result and the row
> stays `—` for the session. Discriminator: `/news` renders the feed normally
> (97 fresh items), and the drawer's Refresh button passes `force`. Recorded as
> gotcha 5 in the `dynastyedge-visual-capture` skill.

**Next season's chore** (unchanged): re-run the back-test and reconcile
`DEPTH_VALUE` against its drift output. Combine athleticism stays unused (the
2026 `combine.csv` ships with empty `forty`/`vertical`), and **camp movement
stays displayed-but-not-scored** — but its blocker now has an end date. The
reason it could not be scored was that nflverse's 2025 depth charts begin
2025-08-03, leaving no pre-camp baseline to validate a climb against. The 2026
feed carries weekly columns from **2026-03-16**, so this class is accumulating
exactly that baseline; a camp-movement signal becomes back-testable once the
2026 rookie season's outcomes exist (i.e. during the 2027 pre-draft window).

### ACTIVE-1 — closed

ACTIVE-1 closed 2026-08-08; it is retained
below in full because what it found — three silent live-API contract breaks —
is the durable part, and the re-verification commands are needed again next
season.

### Trigger sweep — 2026-08-14

Re-run against the live API. **None has fired**, so there is still no ready
work beyond the ACTIVE-2 verification above.

| Item | Trigger | State on 2026-08-14 |
|---|---|---|
| OPEN-1 | ~4–6 weeks of 2026 waivers | `/state/nfl` → `season_type: pre`, `week: 1` — no regular-season waivers exist |
| OPEN-2 | 2026 rookie draft done + picks spent | draft still `pre_draft`, **0 picks made**, `start_time: null` |
| OPEN-3 | owner ask + live 2026 waiver data | neither |
| OPEN-5 | Week 1 | still preseason (`season_start_date: 2026-08-06` is *preseason*) |

All four published feeds live and fresh on the day: `news.json` (2026-08-14
19:16Z), `values-history.json` (10:39Z), `trade-values.json` (10:39Z — 172
bytes, correct: it archives only trades completed in the last 8 days, and there
have been none), `rookie-intel.json` (11:12Z, first run).

### Trigger sweep — 2026-08-08

Every deferred item's trigger checked against the live API. **None has fired**,
so there is no ready work. Re-run this sweep rather than re-deriving it.

| Item | Trigger | State on 2026-08-08 |
|---|---|---|
| OPEN-1 | ~4–6 weeks of 2026 waivers | `/state/nfl` → `season_type: pre` — no regular-season waivers exist |
| OPEN-2 | 2026 rookie draft done + picks spent | draft `status: pre_draft`, **0 picks made** — rolling now breaks the Tracker |
| OPEN-3 | owner ask + live 2026 waiver data | neither |
| OPEN-5 | Week 1 | ~1 month out (`season_start_date: 2026-08-06` is *preseason*) |

Health at sweep time: `npm ci` → **107/107 tests**, lint clean. All four
published feeds live — `news.json` (100 items, 3 sources), `values-history.json`
(59 days / 579 players), `trade-values.json`, `values-archive.json`
(2026-07, 2026-08). The three ACTIVE-1 contract fixes still hold (commands in
ACTIVE-1 below; all three returned the expected results).

### Verified 2026-08-08 — exact-slot pick pricing, against a real draft order

**Why this was worth doing once:** the 2026 rookie draft order was only just
set, so `useLeague`'s exact-slot pricing path — and in particular
`buildDraftSlots`' **second** tier — had never run against real data. Until
now the `draft_order` fallback existed only under synthetic fixtures, and it is
the tier that carries the app for the weeks before Sleeper builds the board.

Live state: draft `pre_draft`, `type: linear`, 4 rounds, 22 in-draft traded
picks, 0 picks made, **`start_time: null`** — the draft is imminent but
unscheduled, so the Tracker's one day a year can arrive without warning.

Replaying `useLeague`'s enrichment (`resolvePickOwnership` → `buildDraftSlots`
→ `slotForRound` → `findExactSlotValue`) under plain Node against live Sleeper
+ FantasyCalc:

- **Both slot-resolution tiers agree on all 10 rosters** — `slot_to_roster_id`
  and the `draft_order`-through-`owner_id` fallback produce identical maps.
  The fallback is real-data validated for the first time.
- **All 40 of the 2026 picks priced at their exact slot**; zero fell back to a
  round median. FantasyCalc carries 48 slot-level entries (`DP_0_0` …) plus
  round-level entries for 2026–2029.
- Round-1 slot prices are monotonically non-increasing (7169 → 2581), and pick
  counts reconcile: 40 = 10 teams × 4 rounds.

So slot-accurate pick capital is correct on every roster-derived surface today.

Note for OPEN-2: FantasyCalc already lists 2029 round-level picks, but
`PICK_YEARS` must still not roll until the 2026 draft runs and its picks are
spent. *(Superseded 2026-09-07 — the window now derives itself from the draft's
own `status`, so "not until the draft runs" is enforced by the code rather than
by a note. OPEN-2 closed.)*

### Verified 2026-08-08 — draft render rehearsal

The data layer above proves the numbers; this proves the *components render
them*. Both halves were run, because they answer different questions.

**Half 1 — the real 2026 order, no overrides.** Screenshotting the running app
against live APIs, all three slot-consuming surfaces agree with the Node
replay, value for value:

| Surface | Rendered |
|---|---|
| Draft Tracker › My Draft Capital | `1.06 3,413` · `3.06 1,158` · `4.06 870` · `4.10 803` · `Taxi 2/5` |
| My Team › Pick Capital | 2026 as `1.06 · 3.06 · 4.10 (via Ministry Of Touchdowns) · 4.06`; 2027/2028 fall back to `1st…4th` — correct, no order exists for those seasons |
| Trade › Pick Trades | every opponent pick at its exact slot (`1.01` = 7,169, matching FantasyCalc); my own picks correctly absent from "picks you could target" |

**Half 2 — the synthetic walk** (`replay-live.mjs --scenario draft`), covering
the three states that cannot exist yet: **7/7 assertions passed** across
`pre` → `clock` → `mid` → `complete`. On-the-clock banner ("YOU'RE ON THE
CLOCK · 1.04"), Best Available (best overall + top-need), the picks-until-yours
countdown, and the completion recap (team totals, my row in brand red with the
You chip, full results) all render.

> ⚠ **Replay artifact — do not chase it as a bug.** In the `clock`/`mid`
> captures the capital card shows `2.04` and `2.09` with **no value**, while
> `1.04` shows one. Cause: the replay overrides `/league/{id}/drafts`, so
> `useLeague` prices off the 2025 fixture board — but pick *ownership* still
> comes from real 2026 `traded_picks`. The fixture says I hold two 2nd-rounders;
> my real 2026 inventory has none, so `buildMyCapital`'s join on
> `round` + `originalOwner` (`utils/draftLive.js`) misses and falls to
> `value: 0`, which `DraftTracker.jsx:120` renders as blank via
> `{c.value > 0 && …}`. The real-order capture (Half 1) joins all four picks
> correctly — that is the discriminator. Any future replay mixing a fixture
> board with live ownership will show this.

**Remaining gap, honestly stated:** the rehearsal proves the components render
the live path; it does not prove Sleeper will behave on the day. The API
contracts are the fragile part (they changed once already, unannounced) — so
re-run the ACTIVE-1 curl checks above if draft day looks wrong.

### ACTIVE-1 — Season-readiness tests (draft day + Week 1)

**Status:** ✅ closed 2026-08-08 — see §3. Kept here in expanded form because
what it *found* is the durable part.

The exercise was not academic: running it turned up **three live contract
breaks** that months of code-reading had missed, all of which would have fired
for the first time on the two deadlines themselves.

| # | Break | Would have surfaced as |
|---|---|---|
| P0 | `/v1/schedule/nfl/regular/{y}` **404s for every season**; the endpoint lives off `/v1` and uses `home`/`away`, not `home_team`/`away_team` | Unguarded in a `Promise.all`, so Week 1 flipped the Lineup Optimizer to `ErrorState` (rendered *before* the offseason check) — no lineup, all season |
| P0 | `/league/{id}/drafts` **omits `slot_to_roster_id`**; only `/draft/{draft_id}` carries it, and the hook read only the list endpoint | `buildDraftOrder` returned `null` always → no on-the-clock banner, no "N picks until yours", no Best Available, no slot-accurate capital, on the one day they exist |
| P1 | `/v1/stats/nfl/regular/{y}/{w}` carries **no `pos`/`opp`/`tm`** (null in 2022–2026) | `computeDefenseRankings` returned `{}` → every player's matchup quality read ⚪ Neutral forever, silently |

All three are fixed and pinned. The general lesson is worth keeping: **every one
of them degraded silently or was gated behind a flag that had never flipped**,
which is exactly the class of bug a green build and a careful read cannot catch.

**What now guards them**

- `tests/projections.test.mjs`, `tests/draftLive.test.mjs`,
  `tests/sleeperDraft.test.mjs` — suite went 72 → 107.
- `tests/fixtures/draft-2025.json` — the league's real 2025 rookie draft
  (board + 40 picks + 24 traded picks). Truncating its pick list synthesizes
  every mid-draft state, so the live path is tested on real payload shapes.
- `scripts/dev/replay-live.mjs` — drives the real app in headless Chromium
  against a synthetic draft / regular season. Re-runnable any time.

**Re-verify the API contracts before next season** (they are the fragile part —
Sleeper changed them once already, without notice):

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'https://api.sleeper.app/schedule/nfl/regular/2026'   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' 'https://api.sleeper.app/v1/schedule/nfl/regular/2026' # expect 404
curl -s 'https://api.sleeper.app/v1/league/1313933520715907072/drafts' | grep -c slot_to_roster_id # expect 0
```

---

## 2. Deferred — waiting on a trigger

### OPEN-1 — ~~Normalize FAAB stats to percent-of-budget~~ **CLOSED 2026-09-20**

**The trigger fired and the fix shipped.** 2026 week 1 alone carried 21
completed bid-bearing claims on the new scale (top bid **$695**), which is the
live history the fix was waiting on. `buildFaabStats` now divides every bid by
**its own season's `waiver_budget`** before aggregating, and carries out
`budgetsCommitted` / `avgBidPct` / `valuePerBudget` — no raw-dollar field
survives, so the next consumer cannot render a mixed-scale total. The total is
a **count of budgets**, not a percent, because the budget **resets twice a
league year** (offseason, then at the season start, unspent money lost) —
confirmed by the owner and measured: six manager-seasons exceed one budget,
none has ever exceeded two. CLAUDE.md Feature 11
carries the detail and the live measurement.

**What the bug was actually costing, measured on the live league** (four
seasons, 287 bid-bearing claims): **four of ten** tendency chips were wrong and
**two were inverted** — the biggest raw spender ($1,071, avg bid 26.1) wore
"Aggressive bidder" while bidding 10.7% of budget, *below* the league's 12.5%;
a manager reading mid-pack at $132 was really a 4.8%-average "Bargain hunter",
with his efficiency understated **4.6×**. The acceptance bar ("a manager's
efficiency doesn't jump 10× on the same behavior") is met by construction and
verified: every manager with no 2026 spend scores **byte-identically** before
and after, because a full budget on the old scale *was* $100.

The original entry is kept below as the record of the deferral.

**Status:** ~~known bug, documented, deliberately not fixed.~~
**Trigger:** ~~enough 2026 waiver history to verify against — roughly 4–6 weeks
of regular-season waivers. (11 claims existed as of 2026-08-08, far too few.)~~

The league's FAAB budget changed **$100 → $1000 for 2026**. `useLeague` reads
it from league settings, so roster-level FAAB display is correct. But
`buildFaabStats` (`src/utils/managerAnalysis.js`) aggregates **raw dollars
across seasons with no normalization** (`e.dollars += bid`), so as 2026 waiver
spend accumulates:

| Symptom | Mechanism |
|---|---|
| "Value / $100 FAAB" collapses ~10× for active managers | `valuePer100 = valueAcquired / dollars × 100` — denominator now 10× larger |
| "Aggressive bidder" / "Bargain hunter" chips misfire | `avgBid` mixes $100- and $1000-scale bids against a mixed `leagueAvgBid` |
| Coaching gate trips 10× too easily | `me.faab.dollars >= 20` meant "spent ≥20% of a budget"; on the new scale that's 2% |

**Fix:** normalize each bid to percent-of-budget using that season's
`waiver_budget` before aggregating, then re-express the derived stats
(`valuePer100`, `avgBid`, the tendency thresholds, the `>= 20` gate) on the
normalized scale.

**Why deferred:** it is a behavior change, so CLAUDE.md's same-commit doctrine
plus real-data verification apply — and there is no meaningful 2026 waiver
history to verify against yet. Fixing it blind risks trading a known
distortion for an unknown one.

**Acceptance:** Manager Scouting's FAAB stats and tendency chips are stable
across the 2025→2026 boundary (a manager's efficiency doesn't jump 10× on the
same behavior); `npm test` green; verified against the live league, not
fixtures. Context: `docs/analysis/faab-bid-corpus-2026-08.md`; documented in
CLAUDE.md Feature 11.

### OPEN-2 — ~~Roll `PICK_YEARS` forward after the rookie draft~~ **CLOSED 2026-09-07**

**Closed by removing the chore, not by doing it.** The 2026 rookie draft
completed 2026-09-04 (`status: "complete"`), and the owner reported the Trade
Analyzer still offering 2026 picks. Rather than roll the constant and re-book
the same maintenance for next September, the window is now **derived from live
data** by `src/utils/seasonWindow.js` — `/state/nfl` plus the league's drafts
list, both already in the `useSleeper` payload, so **zero extra requests**. It
reaches the app as `pickYears` on `LeagueContext`; `PICK_YEARS` survives only as
the pre-resolution seed.

**What the stale window actually cost, measured on the live league the day it
was fixed:** FantasyCalc retires a season's pick entries the moment its draft
completes (all 24 of its pick entries were 2027/2028/2029 three days after the
draft), so the app was generating **40 spent picks priced at 0** across the ten
rosters, and **2029's 40 picks — four per team, a 1st worth 1,933 — were
invisible everywhere**. After: 120 picks, **0 priced at 0**.

Three traps the roll exposed, all now pinned by tests:

1. `computePickCapitalScore`'s weights were keyed by literal year
   (`{ '2026': 3, '2027': 2, '2028': 1 }`), so the newly surfaced third season
   would have scored **0** — silently deflating the pick-capital ranking that
   drives Trade Partner Finder and the League sort. Now keyed by distance from
   the upcoming draft.
2. Pointing the Draft Tracker at the next season would have replaced a
   completed recap with an empty "no 2027 draft yet" placeholder for ~10
   months. `selectTrackedDraft` prefers the upcoming draft and falls back to
   the most recent completed one.
3. Trade › Pick Trades must plan the **next** draft (`pickYears[0]`) while the
   Tracker shows the finished one — and must not borrow the finished draft's
   board to price next year's slots.

**Verified:** live pick window resolves `['2027','2028','2029']`; per-roster
pick counts and capital scores recomputed against the live Sleeper +
FantasyCalc payloads; League Overview TeamCards render `'27 · '28 · '29`
matching those counts team for team; Pick Trades targets 2027 at round medians
with the correct "Sleeper hasn't set the 2027 draft order yet" note; the Draft
Tracker still renders the completed 2026 recap with VOE summing to zero.
`npm run lint` clean, `npm test` 253/253, `npm run build` clean. Documented in
CLAUDE.md's Constants File section and Features 1, 10 and 13.

### OPEN-3 — FAAB bid recommender **[owner ask required]**

**Status:** research complete, build gated.
**Trigger:** an explicit owner ask, ideally after ~6 weeks of live 2026 waiver
data on the $1000 scale (the first evidence that tests the rule spec without
hindsight).

Research is done: corpus, the "failed ≠ outbid" finding, held-out backtest,
and a proposed two-part rule spec live in
`docs/analysis/faab-bid-corpus-2026-08.md` (re-runnable via
`node scripts/dev/faab-corpus.mjs`). The recommender itself remains under
CLAUDE.md's **Future Features (Do Not Build Yet)**. Note OPEN-1 is effectively
a prerequisite — both need percent-of-budget normalization.

### OPEN-4 — Accepted-risk findings from the July 2026 review

**Status:** recorded as accepted, not oversights. Re-flagging them as new
findings wastes a session. Full detail in `docs/repo-review-2026-07.md`.

- **F12** — client-side news-link scheme validation (defense-in-depth only;
  pipeline-side validation is correct and exploiting it needs repo write
  access).
- **F15** — exact standings ties resolve by roster-array order (vanishingly
  rare with fractional scoring; the code comments the behavior).
- **F16b** — the "↪ flipped" ledger marker needs strictly-greater timestamps,
  so date-less trade pairs miss it (the net-value wash is arithmetic-invariant
  and unaffected).

### 2026-09-07 — the trade engine's two sides rebalanced, and Layer 3 rebased

Opened by an owner question: *"did we make it to where it cares too much about
the other team and not enough about me?"* Yes, in three places, all measured
against the live league and all fixed. Memo:
`docs/analysis/trade-engine-my-side-2026-09.md`. PR: see the branch
`claude/trade-analysis-engine-review-icz0ha`.

**A false start worth keeping.** The first measurement compared each suggestion
against the *cheapest fair package overall* and reported "18 of 20 overpay,
11,293 excess value". That framing was wrong — the cheapest package is almost
always `Weak`, and picking those is the failure the two-phase search exists to
prevent (§4e-v of `dynastyedge-failure-archaeology`). Against the correct
baseline — the cheapest package at an *acceptable* appeal tier — the old rule
overpaid on **2 of 20**. The mechanism was real; the magnitude was not. Recorded
because the wrong baseline made a small bug look like a large one.

**Shipped:**

1. **Phase 2 of `suggestFairPackage` is a trade-off, not an override.** It
   ranked by partner appeal lexicographically, so inside the fair band my own
   cost had no vote. Now `APPEAL_BONUS[appeal] − keep-pain`, asymmetric on
   purpose: `Weak −1` (a near-prohibitive guard — an unanswered offer is a real
   failure), `Fair 0`, `Strong +0.4` (a nudge, bought only when nearly free).
   The weight is **mid-plateau from a sweep**, not chosen: w ≤ 0.20 → 17.79
   keep-pain (5/20 changed) · 0.30–0.50 → 18.46 (2/20) · 1.00 → 19.84 (0/20,
   the old rule). Effect: 2 of 20 suggestions changed, −1.38 keep-pain, raw
   value sent unmoved (−13). Both changed targets had reached for an asset at
   0.85 keep — just under `PROTECT_THRESHOLD` — when a Fair package at ~0.4 was
   available. Narrow because **the fair band already bounded the damage**.
2. **My own starting lineup is measured.** `analyzeTrade` computed the change in
   the *partner's* best startable lineup and called it "the single honest
   measure of does this help them", and never computed it for me — though both
   lineups were already built. My side was graded by a position COUNT that was
   **0 on 18 of 20** trades, and two Accepts sat on a lineup that got worse
   while reading "this fills your WR need". `myStartersDelta` now **gates** the
   verdict (a drop clearing `MY_LINEUP_MATERIAL_PCT` = 1% of my current lineup
   downgrades a clean Accept to Counter). Proportional because live lineups span
   27k–63k. **It gates rather than feeding `fitScore`**, whose negative branch is
   a hard Decline — a rebuild trade *should* lower today's lineup.
3. **Layer 4 scored one fact twice.** A `fill` is by definition an arriving
   player who starts at a hole, which is exactly what raises `startersDelta`;
   both scored +1, so one event earned the two points that mean `Strong`. This
   is the identical double-count already removed from the `stacks` branch and
   never checked on the positive side. Scored once now; both sentences still
   render. Live: `Strong` 7 → 5.
4. **Layer 3 is rebased on live playoff odds** (owner-approved after a separate
   measurement). The win-window tier tracks **total assets at 0.952** but the
   **starting lineup at only 0.721**; playoff odds track the starting lineup at
   **0.988**, which is the question the layer asks. Two live mislabels fixed:
   roster 5 (2nd-best lineup, 87.7% odds) read `Rebuilding`; Jake & Bake (9th
   lineup, 8.3% odds) read `Middle`. The sharper bug: **`Middle` had no branch
   at all** and top-3/bottom-3 makes it a fixed bucket of four teams every
   season — so `windowScore` was **0 on 20 of 20** and the panel printed the
   same placeholder every time. On odds: 15 aligned / 5 conflicting. Tier is
   the offseason fallback, pinned byte-for-byte by test.

**Honest limits, all recorded:**

- **Verdicts did not move on the live board** for #4 (17 Counter · 1 Decline ·
  2 Accept before and after). `windowScore` reaches the ladder only via the
  clean-Accept gate and the winning-value-but-off-window branch. The gain is a
  layer that says something true; it bites when odds fall.
- **#2 flips no current verdict either** — the live drops are below the
  materiality floor. What is closed is the *class* of bug.
- Measured at **Week 1 with zero games played**, so the odds are a
  roster-strength prior plus schedule. Established: they ask the right
  question. Not established: that they are calibrated. **Re-run in November.**

**Scope deliberately held.** `assignWinWindowTiers` still backs its eight other
consumers; only Layer 3's *score* moved.

**Owner ruling reversed this session:** the 2026-09-06 "appeal stays
lexicographically first" call, above. Marked in place rather than deleted.

**Left alone, with reasons (each is a bigger win than what shipped):**

1. **`fitScore` is still a position count**, so it ties on most trades. The gate
   covers the dangerous case; making fit magnitude-aware end to end would
   redefine every verdict at once and is a separate job.
2. **The deficit test is binary** (`delta < 0`) in the verdict and in
   `getDeficitPositions`, which also feeds free agents, rookie fit, keep-scores
   and the cash-out board. Note the Targets board *does* scale by magnitude —
   an earlier claim that the whole app was binary was too broad.
3. **`getDeadlineVerdict`'s thresholds are uncalibrated for this league.** 6 of
   10 teams make these playoffs, so 60% is baseline and ≥70% Buyer sits only
   modestly above it; five teams bunched 76–88% at Week 1. Making them relative
   to `playoff_teams / numTeams` is a real option that would move three
   surfaces at once. **[owner ask required]**

### 2026-09-06 — OPEN-6 closed: the recommendation surfaces are two-sided

The Analyzer went two-sided in PR #36; the surfaces that *suggest* a trade did
not, which produced a loop worth naming — tap a target, the app pre-fills a
package, the Analyzer grades it `Weak` and downgrades its own suggestion.

**Measured on the live league before the change: 19 of 20 suggested packages
graded `Weak` appeal, none graded `Strong`, and all 20 verdicts came back
Counter or Decline.** The board did not recommend a single trade its own panel
would stand behind. Root cause was `suggestFairPackage`'s objective, not the
ranking: minimizing my own pain selects, by construction, the pieces a partner
has least use for — my cheapest asset by keep-score was a third quarterback, and
it appeared in 11 of the 20 packages.

An exhaustive search proved the ceiling: **a Fair-or-better package existed for
all 20 targets (8 Strong, 12 Fair) inside the same fair band, without touching a
protected asset.** Phase 1 never looked at their side. After the fix the live
board reads **Strong 4 · Fair 13 · Weak 3** with 5 Accepts; the surviving Weaks
are the two targets I genuinely cannot pay for, which is information rather than
a failure.

What shipped: `buildPartnerFit` extracted from `analyzeTrade` and shared;
`suggestFairPackage` two-phase (cheap enumeration → 40-candidate shortlist →
exact Layer 4 appeal — **the shortlist is gone as of the 2026-09-06 keep-score
work below; do not reintroduce it**); `getTopTradeTargets` ranked by `need × value ×
movability`; `suggestSellMove`'s partner pick made two-sided; the appeal read
surfaced on each target card. 219 tests (up from 204), lint + build clean, all
of it verified against the live league.

**Owner ruling, 2026-09-06 — the rule is now "roster facts may score; second
opinions describe."** This replaces the narrower "the five negotiating signals
never move a verdict" with one rule covering verdicts and rankings alike. Layer
4 and movability are arithmetic over a roster, so they score. Scarcity, roster
space, weekly lineup impact and a partner's recent moves are unbacktested second
opinions about value or intent, so they describe and never reorder a
recommendation. Roster space was considered as an exception and rejected: "they
are 3 over the cap" is a fact, but "so they want a 2-for-1" is a guess about
behavior, and behavioral modelling is disconfirmed here.

**Two findings recorded but NOT acted on:**

1. **The league-wide board is single-position by construction.** `need` is a
   per-position constant, so `need × value` collapses to a value sort within
   whichever position I'm thinnest at — today that is WR, and all 20 rows are
   WRs. Owner call 2026-09-06: **keep the deficit gate.** That is the board's
   job; converting a surplus is `suggestSellMove`'s, and the team-scoped mode
   already shows non-deficit pieces.
2. **Movability's band is load-bearing and was tuned once already.** The first
   cut, `[0.35, 1.6]`, let a 2,174 WR5 outrank a 4,395 WR2 on live data. If it
   is ever widened past a 2× swing, that inversion comes back —
   `tests/tradeTargets.test.mjs` pins the ratio.

### OPEN-8 — Re-derive `PICK_ROUND_KEEP` once the 2027 class resolves

**Status:** deferred. **Trigger:** the 2027 rookie draft has happened *and* that
class has played a season — realistically autumn 2028.

The shipped keep-scores (1st 0.65 · 2nd 0.50 · 3rd 0.40 · 4th 0.30) rest on
three classes of this league's own picks, n=10 per round per class, and the
newest of them has not resolved at all. Every class points the same way — round
1 beat the dearest future 1st on the board 3/3, round 4 missed the cheapest 4th
0/3 — but three classes cannot distinguish "the market underprices firsts" from
"this league drafts well".

`node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scripts/dev/asset-aging-backtest.mjs`
re-runs it and prints a drift check; the script imports the shipped constants,
so it fails loudly if the measured ordering stops matching them. **If round 1
ever stops beating its price in a resolved class, re-derive rather than nudge.**
Full method: `docs/analysis/asset-aging-and-pick-value-2026-09.md` §3.

### OPEN-10 — The two "fair" windows disagree

**Status:** deferred, and it is the reason 17 of 20 suggested packages read
`Weak for you`. **Trigger:** an owner ask, or the next deliberate pass over
`suggestFairPackage`'s tuning — it is not a bug to fix in passing.

`suggestFairPackage` builds inside **`[0.9×, 1.15×]`** of the target, with
undershoot penalised 1.6× (sellers don't take light offers). `buildFairBand` —
THE definition of fair, shared with the Analyzer's verdict and every surface
that predicts it — is **±5%**. So the search routinely proposes packages the
Analyzer then scores as an overpay. Measured live 2026-09-07 on the 20-target
board: every suggestion landed **6–11% in the partner's favour**, which is why
16 of 20 come back `Counter` and why the new my-side read grades 17 of 20
`Weak` (my seat takes −1 on value; theirs takes +1).

**The grader is not the problem.** Swept across price, 8 of the first 8 targets
reach `Strong for you` at 58–94% of the target's value, and a user-built trade
winning 8% on value renders `Fair for you`. The board's *offers* are what sit
outside the band.

**Why it wasn't touched:** narrowing the search band moves package selection on
every surface that consumes it, and `APPEAL_BONUS` (Weak −1 · Fair 0 · Strong
+0.4) was swept and set at the current band — changing one without re-measuring
the other invalidates the sweep. Whoever picks this up should re-run the
20-target board before and after and report the keep-pain / appeal / verdict
deltas together, exactly as `docs/analysis/trade-engine-my-side-2026-09.md` §1
did. Full context: `docs/analysis/trade-my-side-read-2026-09.md` §3–4.

### OPEN-9 — Rebuild the trajectory age curves longitudinally

**Status:** deferred, and it blocks a standing prohibition. **Trigger:**
`values-archive.json` holds ~12 monthly columns (started 2026-07, so around
2027-07).

`buildAgeCurves` learns what the market pays at each age from *today's*
FantasyCalc pool — a cross-section. The only 33-year-old TE still carrying value
is the one who didn't decline, so the curve reads survivorship as aging: TE 31 =
641 against TE 33 = 1,020, QB 25–26 = 790 against QB 30–31 = 2,255. Fed into a
keep-score tilt it projected a 31-year-old Mark Andrews **+47%**.

**Standing ruling until this is fixed: `projectPlayer` / `buildAgeCurves` are
descriptive shape only and must never feed a score, a ranking, or a
recommendation** (recorded in CLAUDE.md Feature 17 and
`dynastyedge-failure-archaeology`). Feature 17's own UI is fine — it reads the
shape and says so. The aging signal that *does* score is the longitudinal one in
`asset-aging-and-pick-value-2026-09.md` §2, built from production rather than
price. Rebuilding the curves from the monthly archive would let the trajectory
model itself be scored, and is a prerequisite for OPEN-5's multi-season
back-test.

### 2026-09-06 — OPEN-7 closed: the keep-score learns age and pick rounds

Opened by an owner question about a live board: *"it wants me to give up Chase
Brown for A.J. Brown — why him and not Jonathan Taylor?"* The answer was that
`assetKeepScore` scored both at **exactly 0.85** — every player inside
`CORE_DEPTH` got a flat rate, age only entered the function inside the
Contending and Rebuilding branches (this roster is Middle), and every pick
scored 0.5 regardless of round or year. Taylor was never a candidate at all: at
5,705 against a 4,106 target he is a 39% overpay, excluded by the band before
scoring. Nothing was broken; the function had never been given the facts.

**Measured before changing anything** (`scripts/dev/asset-aging-backtest.mjs`,
memo `docs/analysis/asset-aging-and-pick-value-2026-09.md`):

- **Aging, longitudinally** — n=762 player-seasons 2020–2025, same player year
  over year, a player who required a real season and then left the league
  counted as 0 rather than dropped. RB past 26 retains 0.66 vs 0.94
  (p=0.0001); WR past 28, 0.67 vs 0.84 (p=0.0016); QB and TE not significant.
  **`PEAK_WINDOWS` survives at the boundaries it already shipped** — do not
  re-tune it.
- **Picks** — all 120 rookie picks this league has made, at today's prices.
  Round 1 beat the dearest future 1st on the board in 3/3 classes (30/30 hits);
  round 4 missed the cheapest 4th in 3/3 (8/30). Hype flattens the pick curve,
  resolution steepens it: the market prices a 1st at 3.5× a 4th, the
  most-resolved class delivered **8.0×**.

**Three things the evidence killed, recorded so they stay dead:**

1. **The obvious implementation.** Tilting the keep-score with the shipped
   `dynastyTrajectory` curves projects a 31-year-old Mark Andrews **+47%** —
   they are a survivorship-biased cross-section. See OPEN-9; the prohibition on
   scoring off them stands until the curves are rebuilt longitudinally.
2. **The pre-peak half of the age tilt.** Protecting players *younger* than
   their window is absent at RB (−0.02, p=0.853) — the position the tilt exists
   for — with one near-hit in four tests. The tilt is decline-only.
3. **A single 30-day trend snapshot as an aging signal.** It puts old RBs
   rising and young QBs falling; one September window measures Week 1 news.
   `§1` of the back-test reproduces the null so nobody re-runs it.

**Shipped:** `PICK_ROUND_KEEP` (1st 0.65 · 2nd 0.50 · 3rd 0.40 · 4th 0.30, with
`PICK_KEEP_CAP` holding every pick below `PROTECT_THRESHOLD` at every tier);
`pastPeakTilt` (decline-only, per-position RB 1.00 / WR 0.65 / QB 0.40 / TE
0.15, saturating over 3 years, magnitude by tier); `buildCashOutBoard`;
`suggestFairPackage`'s cheaper `alternative`; and the removal of
`PACKAGE_SHORTLIST`. 242 tests (up from 219), lint + build clean, every change
verified against the live league.

**Owner rulings this session:**

- **Appeal stays lexicographically first in the package search.**
  ⚠️ **SUPERSEDED 2026-09-07 — see the entry below.** Making it trade off
  against my own cost was proposed and declined here: knowing whether they
  would accept is the information the search exists to produce, and a package
  needing a pick to bridge it is a different trade rather than a cheaper one.
  The `alternative` line adds that information beside the suggestion instead.
  The owner reversed this the next day, after the review measured what the
  lexicographic rule was costing (18 of 20 suggestions were not the cheapest
  fair package; 2 of 20 were genuine overpays). The original objection is
  preserved because it is the thing to answer if the trade-off is revisited —
  and it *is* answered: the appeal read still renders on every card, and the
  higher-appeal package the search passed over is now named explicitly.
- **`CORE_DEPTH` stays rank-blind.** Making it rank-sensitive would protect the
  *older* RB1 hardest, which is backwards for the question that opened this.
  The age tilt addresses the same ordering from the correct direction.

**Two findings recorded but NOT acted on:**

1. **`packageRationale` still says "protects your starters" unconditionally**
   whenever a package draws from a surplus. On the live board it said that
   while spending the owner's RB2 — who starts in `buildValueLineup`. It means
   "touched nothing scoring ≥ 0.9", which is not what it says. The honest fix
   is to check the package against `buildValueLineup(myRoster).starterIds` and
   name the starter when one is in it. Small, and not blocked on anything.
2. **`PROTECT_THRESHOLD` (0.9) protects almost nothing on a healthy roster.**
   Core starters land on exactly 0.85; only a position in deficit (+0.22, which
   clamps to 1.0) or a cliff (0.95) ever crosses it. That is *by design* —
   ff116ba's ruling is about the irreplaceable starter — but it means the
   threshold is doing less work than its name suggests, and anyone reading
   "protected" should know it means "deficit or cliff", not "starter".

### DESIGN-4 — ~~finish the Matchday cleanup~~ **CLOSED 2026-09-21 (code); two DEVICE checks remain**

**Closed on paper by an audit, not by new work — every code item had already
shipped 2026-09-13 while this file still called three of them "pending".**
Verified in the tree 2026-09-21: `MarketMovers` renders the split row (no
nested `<button>`), `SectionContents` carries `railLabel` and stays
`flex-wrap`, `src/components/ui/Textarea.jsx` exists, and a static probe over
every `<button>`/`<input>`/`<select>`/`<textarea>` in `src` finds **no control
missing `.focus-ring`** (item 5's 46 are all fixed). That drift is the lesson
worth keeping: **this file is only as good as its last review, and a "pending"
that shipped a week ago costs the next session a wasted investigation.**

**What genuinely remains, and it is the owner's to run — neither is checkable
in any sandbox:**

1. **Verify the PWA metas and the app icon on device.** Carried since step 4.
   A meta or icon change is **silent** until the home-screen app is removed
   and re-added (failure-archaeology §1). `index.html`'s icon `?v=` is at 4.
   Note the Matchday repaint moved both `theme-color` metas (light `#E8E5DC`,
   dark `#141413`), so this is checking a real change, not a no-op.
2. **Bricolage Grotesque on glass.** Step 3 measured that the spec's
   `wdth 125` is not executable (the axis tops out at 100), so the face has
   never been seen doing what the brief asked. If it doesn't earn its keep on
   a real phone, the recorded swap candidate is **Big Shoulders Display**.

The original entry is kept below as the record.

**Status (original):** in progress. **Trigger: fired** — the owner asked for
it directly after the post-merge review. Four items, landing as separate PRs
so the two carrying a layout decision stay reviewable.

1. **The hand-rolled panels — DONE 2026-09-13.** 27 converted (the handoff said
   21; the sweep found six more the note never named). Detail in §3.
2. **`MarketMovers`' nested `<button>`** — pending; needs a layout call at
   390px, because the Partners-card precedent (a sibling *below*) costs a row
   of height and Movers is a dense list of up to ~30 rows across six sections.
3. **The contents rail wrapping to two lines** — pending; one deliberate
   decision rather than an inherited default, measured at 390px in both themes.
4. **A `Textarea` primitive** — pending; only if it stays genuinely small.

**Found while doing (1), and worth more than (1):** see §3's record — three more
`<lowercase.Uppercase />` lucide leftovers, one of them a live white screen on
`main`, plus a seventh truncation of a load-bearing value that the crash had
been hiding.

### SMALL-1 — `packageRationale` claims it protected your starters when it didn't

**Status:** open, small, and **blocked on nothing.** **Trigger: fired** — it
has been ready since it was recorded on 2026-09-06 and was simply never
picked up.

`packageRationale` says *"protects your starters"* unconditionally whenever a
suggested package draws from a surplus. On the live board it said that while
spending the owner's **RB2, who starts** in `buildValueLineup`. What it
actually means is "touched nothing scoring ≥ 0.9" — which is not what it says,
and `PROTECT_THRESHOLD` protects less than its name suggests anyway (core
starters land on exactly 0.85; only a deficit or a cliff crosses 0.9).

**The honest fix:** check the package against
`buildValueLineup(myRoster).starterIds` and name the starter when one is in
it. It is a copy fix over a fact the engine already has — no model change, no
recalibration.

Recorded in §1's 2026-09-06 entry as "found but not acted on"; promoted here
so it stops living inside another item's write-up.

### OPEN-5 — Model calibration (open research)

**Status:** open. **Trigger: FIRED** — the regular season is under way
(2026 Week 3 as of this review), so the clock Week 1 started is running and
completed weeks are accumulating.

The models are verified *correct* (deterministic, threshold-accurate) but not
verified *accurate*: nobody can yet say whether 72% playoff odds means 72%.
Owned by `dynastyedge-model-quality-campaign`; the multi-season trajectory
back-test additionally needs ~a year of the monthly values archive
(`values-archive.json`, started 2026-07). Related open frontier items (briefing
decision-quality, buy-low timing) are in `dynastyedge-research-frontier`.

---

## 3. Closed

| Item | Closed | How |
|---|---|---|
| PIPE-1 — the trade-value archive priced every pick at 0 | 2026-09-21 | The snapshot scripts kept the `if (sid)` classifier the app fixed in 2026-07, so `pickEntries` was empty and every pick archived as 0 into a **permanent** file. One shared `scripts/fantasyCalcValues.mjs` (pure, 10 tests), a ladder ending in **null not 0**, and a self-heal that rewrites the archived zeros through the normal publish path. Found by reading the published feed, not the code. Detail in §1 |
| OPS-1 — Vercel built every data-branch push | 2026-09-21 | MCP-2b's integration fix started ~48 junk preview builds a day. Fixed with a project-level Ignored Build Step; `git.deploymentEnabled` in `vercel.json` was written and **reverted** as a dead no-op (Vercel reads that file from the pushed branch, and the data branches carry only JSON). Detail in §1 |
| NEWS-3 — re-measure coverage at a 7-day window | 2026-09-21 | **PASS, 18 of 31** against a ≥12 target and a 9–11 prediction. Matching still saturated (achieved == ceiling); volume was the lever, as NEWS-1 ruled. Surfaced NEWS-4. Detail in §1 |
| DESIGN-4 — finish the Matchday cleanup | 2026-09-21 | Closed by audit: all four code items (plus item 5's 46 focus rings) had shipped 2026-09-13 while this file still said "pending". Two owner-only device checks remain. Detail in §2 |
| NEWS-1 — re-measure news coverage after accumulation | 2026-09-12 | **Measured, and it was a REGRESSION: 6 of 30, worse than the 10 of 26 it was opened on, with span collapsed 159h → 27.5h.** Cause was retention, not coverage: eviction was recency-only, so the 240-item cap bound at ~30h and the 7-day window had never once bound; the cap was also spent on redundancy (240 items → just 97 distinct players, one carrying 23). Fixed with diversity-aware eviction (≤3 per player, soft) + cap 240 → 400, sized off **wire** bytes (37KB gzipped, not the 141KB raw the docs assumed). One published run: span **112h**, cap unpinned **186/400**, distinct players **97 → 119**, feed *smaller* on the wire, acceptance **6 → 8 of 30**. Still a MISS; matching is saturated (achieved = ceiling) and the residual is source-*kind*, not source-count. Re-measure at 7 days = **NEWS-3**. Detail retained in §3 below |
| DESIGN-1 — build the "Matchday" visual direction | 2026-09-12 | All five steps shipped. Step 5 (motion) landed the GLOBAL `prefers-reduced-motion` guard first, one easing token (`--ez`) emitted as Tailwind's DEFAULT so all 69 transitions moved at once, a duration ladder scaled to element size, the press run replacing `.edge-rise`'s fade-up and linear stagger, `.press` as the third control-level contract (one definition replacing 41 `active:` states at three values across 20 files), `Loading` replacing every spinner, the sheet entrance, and a written four-moment budget. **0 of 12 slop markers**, re-scored from scratch. Detail retained in §3 below |
| DESIGN-3 — the navigation rebuild | 2026-09-11 | Primary navigation is a bottom tab bar (Today · Squad · Trade · League · Index); the drawer keeps its utilities and carries zero destinations. `SubTabBar` → `SectionContents`, which wraps instead of scrolling, so "Pick Trades" no longer clips. New `/index` route is the complete map and holds the four consulted views. All three copies of the nav payload collapsed into `src/navigation.js`. Draft and News lost top-level rank, not reachability. The four orphans each got a content-level inbound link, and Rookie Research entered global search. No path moved, so no redirect was needed. Detail retained in §3 below |
| DESIGN-2 — four ready-now accessibility/truncation bugs | 2026-09-11 | All four fixed in the primitives and tokens, not at 525 call sites: `--text-tertiary` re-derived to clear WCAG AA in both themes (dark 2.51→4.53:1, light 3.23→4.51:1); `.focus-ring` added as the one focus definition and `Input`/`Select`'s `focus:outline-none` removed; `.tap-target` guarantees a 44px hit area with no layout cost (`IconButton` `md` made a real 44px box) — deliberately NOT on `Chip`, where it would cause the bug it fixes; `Est. cost` and the lineup player name now wrap instead of eliding. Detail retained in §3 below |
| Trade engine over-weighted the partner (3 fixes) | 2026-09-07 | Phase 2 made a cost/appeal trade-off (weight set mid-plateau from a sweep); `myStartersDelta` added and gating the verdict; Layer 4's fill/lineup double-count removed. Detail retained in §1 |
| Layer 3 scored on a tier that measured the wrong thing | 2026-09-07 | Live playoff odds now score the win window in season (0.988 vs the starting lineup, against the tier's 0.721); tier is the offseason fallback. Killed the dead `Middle` branch that left 40% of the league with no read. Detail retained in §1 |
| OPEN-2 — roll `PICK_YEARS` after the rookie draft | 2026-09-07 | Removed the annual chore instead: the pick window is derived from `/state/nfl` + the drafts list (`utils/seasonWindow.js`, zero extra fetches). Killed 40 ghost 0-value picks and surfaced 2029 league-wide. Detail retained in §2 |
| OPEN-7 — the keep-score had no opinion about age or about which pick is which | 2026-09-06 | Measured both (n=762 player-seasons; all 120 of this league's rookie picks), then shipped `PICK_ROUND_KEEP`, `pastPeakTilt`, the cash-out board, the cheaper-`alternative` line, and the untruncated package search. Detail retained in §1 |
| OPEN-6 — push Layer 4 into Targets and the fair-package builder | 2026-09-06 | Layer 4 extracted as `buildPartnerFit` and shared; `suggestFairPackage` made two-phase; Targets ranked by `need × value × movability`; `suggestSellMove` partner pick made two-sided. Detail retained in §1 |
| July 2026 repo-review backlog B1–B11 | 2026-07/08 | All eleven landed — mapping in `docs/repo-review-2026-07.md`'s status banner |
| Navigation Refactor Phases 1–3 | 2026-07-20 | Consolidation → `/my-team` + `/league` rename → "Primetime Blackout" visual pass |
| OPEN-1 — FAAB stats mixed two budget scales | 2026-09-20 | The $100 → $1000 change went live, so the trigger fired. Bids are now normalized to percent-of-budget per season; `valuePerBudget` replaces "value per $100" and is continuous with it, so no pre-2026 history is restated. Measured on the live league: four of ten tendency chips corrected, two inverted. Detail retained in §2 |
| Frontier Item 2 blocking question (are losing FAAB bids visible?) | 2026-08-08 | Verified yes; see `docs/analysis/faab-bid-corpus-2026-08.md`. Superseded by OPEN-3 |
| ACTIVE-1 — season-readiness tests (draft day + Week 1) | 2026-08-08 | Three live contract breaks found and fixed (schedule endpoint, draft `slot_to_roster_id`, stats `pos`/`opp`); 35 new tests (72 → 107) + `scripts/dev/replay-live.mjs`. Detail retained in §1 |
| ACTIVE-2 — Draft › Research: verify the first pipeline run | 2026-08-14 | Pipeline published 2026-08-14 11:12Z; feed shape, Market vs Model output, and the drawer's Rookies row all verified against live data. Detail retained in §1 |

---

### DESIGN-4 item 1 — the record (panels + what the sweep found, 2026-09-13)

**The panels.** 27 hand-rolled `bg-bg-card border …` panels routed through
`Card`, across eleven files. The step-5 handoff named 21 across nine; the shape
grep found **six more it had not**: four in `DraftTracker` (a file step 5's own
Card pass *did* open, and still missed these) and two in `LoginScreen`, which no
step had ever opened because it renders above the app shell. The grep
(`bg-bg-card` + `border`) now returns **zero** hand-rolled panels app-wide.

Converted with the same JSX tag balancer step 5 used — the opening is one line
and its `</div>` is anywhere from 3 to 140 lines below, nested inside other
divs. Two openings span multiple lines (a conditional `className` on
`PlayoffOdds`' team row and `LeagueActivity`' transaction card); the balancer
refuses those rather than guessing, and they were done by hand. Padding was
normalised (`px-3 py-2.5` and `px-3 py-3` both → `padding="sm"`); four panels
keep a raw padding because their geometry is load-bearing (two chart gutters, a
row list whose rows carry their own `py`, and three collapsibles whose toggle
button owns the padding).

**The accessibility half the handoff predicted was real.** PR #49 fixed four
fields that had stripped their focus ring by bypassing the primitives; the same
bug is in these files. A static probe over every `<button>`/`<input>`/`<select>`
/`<textarea>` in `src` counted **49 controls with no `.focus-ring`**. Eight were
in files this PR touches and are fixed here. **41 remain**, concentrated in
`DraftBoard` (11), `DraftTracker` (10), `TradeBuilder` (7) and `EdgeView` (4) —
recorded as DESIGN-4 item 5 rather than smuggled into a panel diff.

**Three `<lowercase.Uppercase />` lucide leftovers, and one was a live white
screen.** Step 5 fixed `LeagueActivity`'s `<meta.Icon />` and stopped at the one
it happened to hit. Grepping for the *shape* found three more, every one in
Trade, every one with its map's `Icon` field already deleted and a comment
explaining why the word carries the verdict:

| site | map | reachable when |
|---|---|---|
| `TradePartnerFinder:124` `badge.Icon` | `FIT_BADGE` | **always** — `/trade` was a white screen on `main` |
| `TradeAnalyzer:94` `chip.Icon` | `VERDICT_CHIP` | a trade has a verdict |
| `TheCall:149` `vs.Icon` | `VERDICT_STYLES` | a trade has a verdict |

**Why step 5's route sweep passed `/trade`:** a sweep whose data never loads is
not a sweep. Measured on this very commit — the first pass here had a broken
curl header parse (with `-L`, curl emits a header block per hop, so the
redirect's headers land at the head of the body and every JSON parse dies on
`"HTTP/2 200"`) and reported **21 of 22 routes OK, `/trade` included**, because
every view short-circuited to `ErrorState` before reaching the component that
throws. With the parse fixed, `/trade` threw on first render. The sweep now
records each route's rendered text length so "did the data arrive?" is
answerable from its own output.

**Seventh truncation of a load-bearing value.** With `/trade` rendering for the
first time, the `--overflow` probe immediately caught the partner card's team
name clipped by 10px ("Ministry Of Touchdowns") — the single most
decision-relevant field on a card answering *"who do I call?"*. It wraps now.
It had been invisible precisely because the crash meant the card never painted:
**a crashed route hides every other bug on it.**

---

### NEWS-1 — the record (closed 2026-09-12)

### NEWS-1 — re-measure news coverage after a week of accumulation

**Trigger:** `news.yml` has been running with the accumulating feed for ~7 days
(i.e. on or after **2026-09-11**).

Phase 2's pre-registered acceptance test — ≥12 of 25 rostered players resolved
in a fresh pull — **missed at 10**. It was measured on a *cold* feed, before
any accumulation had happened, which is not the shipped design: the window
holds 240 player items and a single cold pull only produces 127.

Two facts bound what more work could buy, and both argue for measuring before
building:

- The app now resolves **every** player the matcher can find (achieved =
  ceiling). No further matching work can move the number.
- All 15 misses are **genuine absence** — each was verified present in the
  player index and absent from the feed's entire text. There simply was no
  news about Jordan James or Jalen Royals in any of eleven sources on
  2026-09-04, in the preseason.

**Do this:** run `node scripts/dev/news-coverage.mjs` (no argument reads the
live feed). If a saturated window clears 12, close this item. If it doesn't,
the honest read is that free NFL news does not cover a 26-deep dynasty roster
carrying taxi-squad rookies, and the **target should move rather than the
sources** — do not bolt on low-signal feeds to chase the number. Record
whichever way it goes.

**Outcome:** see the closed-table row above and
`docs/analysis/news-retention-2026-09.md`. The item's own prediction — that
the target should move rather than the sources — is now measured, twice over.

-----

### DESIGN-1 — the record (closed 2026-09-12)

**Step 5 — motion — shipped 2026-09-12** (branch
`claude/matchday-step-5-motion-ox7q58`). What it landed, in the order it landed:

1. **The global reduced-motion guard, first and deliberately.** The old one
   covered one class. A class-scoped guard has to be extended by whoever adds
   the next animation, and the failure is silent for everyone who doesn't have
   the setting on — so it went in before any motion did, and the step would have
   been safe to abandon at that commit. Includes the JS half (`scrollToTopOf`),
   because CSS cannot reach a `scrollIntoView({ behavior: 'smooth' })` argument.
2. **One curve, one ladder.** `--ez` as Tailwind's DEFAULT timing function
   reaches all 69 transitions with no call-site change. The curve's real profile
   was measured, not assumed: 88% of the travel in the first third, 95% at 42%.
   Nominal duration is not perceived duration — pick the travel you want and
   roughly double it.
3. **The press run**, replacing `.edge-rise` (a fade-up) and its linear
   0/60/120/180 stagger — the last two live slop markers.
4. **`.press`**, the third control-level contract beside `.focus-ring` and
   `.tap-target`. Verified by DOM probe at 100% coverage on all 18 routes.
5. **`Loading`** — the app has no spinner. Four `animate-spin` and one
   `animate-pulse` gone.
6. **The sheet entrance**, animating `clip-path` so it cannot contend with
   `useSheetDrag` for `transform`.
7. **A four-moment budget, written down** with the reason each cut item failed.

**What step 5 hands on:**

- ~~**21 hand-rolled `bg-bg-card border` panels across nine files**~~ —
  **DONE 2026-09-13** (DESIGN-4 below). The count was right and was also low:
  the same sweep found **six more** the step-5 note never named — four in
  `DraftTracker` that its own pass missed, and two in `LoginScreen`, which no
  step had ever opened. **27 converted**, and the shape grep now returns zero
  hand-rolled panels app-wide.
- ~~**`MarketMovers` nests a `<button>` inside a `<button>`**~~ — **FIXED
  2026-09-13.** `MoverRow` now renders `Row` as a plain `<div>` holding two
  **sibling** buttons: the content (opens the profile) and the Trade action.
  **It deliberately does not follow the Partners precedent**, and the reason is
  the one law 5 already names — **cardinality**. Both layouts were built and
  measured at 390px, and the owner chose the split row:

  | | page height | nested interactives | React warnings |
  |---|---|---|---|
  | nested (before) | 3,175px | 33 | 1 |
  | Partners precedent — footer button per row | 3,927px (**+24%**) | 0 | 0 |
  | **split row (shipped)** | **3,020px (−155)** | **0** | **0** |

  Nine tall partner cards can afford a full-width footer button; ~30 dense rows
  across six sections cannot — it turns a list you SCAN into a wall of buttons
  whose CTA out-shouts the value and the trend. Verified in both themes.
- ~~**The contents rail spends a second row on most screens**~~ — **DONE
  2026-09-13.** Not in the step-5 handoff list, but reopened alongside it.
  The rail was wrapping on **three** of the four multi-view sections (Squad,
  Trade AND League — the review had it as two), costing 44px on ~16 of the
  app's 18 content routes and putting 140px of chrome above the content.
  Tightened gap (16 → 10px) + tracking (0.08 → 0.055em) and shortened the two
  labels that were over on their own — "Pick Trades" → "Picks" and
  "Free Agents" → "FA". **All four sections now fit on one line**, header 140px
  → 96px. Measured at 390px against 358px available — Squad 344 (14 spare) ·
  Trade 352 (6) · League 306 (52) · Draft 196 (162).
  - **Owner chose this (option d) over retiring the layer**, because moving the
    views onto the section landing screen would have cost the Analyzer ↔
    Targets round trip a tap, and that is the Trade section's most-used loop.
  - **The rename landed as `railLabel`, not as a change to `label`.** `label`
    also feeds the **Index**, whose whole job is discoverability, and "Overview
    · FA · Activity · Movers · Playoffs" is a worse map than the full names.
    `SectionContents` reads `railLabel ?? label`, so **only the width-
    constrained consumer shortens**; the Index and global search still say
    "Free Agents". Same precedent as `searchLabel`. Add one only when a section
    is measurably over budget. `FA` is not a coinage — League › Activity's
    filter chips already read *All / Trades / Waivers / FA / My Moves*.
  - **Trade is the tight one at 6px spare.** A sixth Trade view, or a longer
    label on any of its five, puts that section back on two rows — which is the
    honest failure mode, and why `flex-wrap` stayed.
  - **Method note worth keeping.** The first cut used `flex-nowrap` and
    appeared to fit all three sections. It didn't: nowrap does not *fit* an
    over-long rail, it **hides** the overflow — the A4 clipping failure
    `SectionContents` exists to fix. Reverting to `flex-wrap` is what exposed
    that League had never fitted. **A layout that "fits" under nowrap has not
    been measured, it has been silenced.**
- ~~**Controls that bypass the primitives have no focus ring**~~ — **DONE
  2026-09-13.** Not in the step-5 handoff either; found while doing the panel
  conversion, because PR #49 had just fixed four fields with exactly this bug
  and the handoff predicted more of the same class. A static probe over every
  `<button>` / `<input>` / `<select>` / `<textarea>` in `src` found **46
  controls with no `.focus-ring`**, fixed across three PRs (8 in the panel PR,
  1 in the Movers PR, **37 here**).
  **The source count badly understates it.** Most of those sites sit on a
  *repeated row*, so 46 source sites were **~700 unfocusable controls in the
  live DOM** — measured per route: Draft Board **470**, Free Agents **128**,
  Draft Research, Pick Trades 36, Movers 33, Trajectory 29, Lineup 23, The Edge
  6. **Run the probe; do not eyeball the diff.** One missed row component is
  two orders of magnitude of real controls.
  - Distribution, which is where the next gap will be: `DraftBoard` 10 ·
    `DraftTracker` 10 · `TradeBuilder` 7 · `EdgeView` 4 · `FreeAgentsView` 2 ·
    `TradeVerdict` 2 · `LineupRow` 1 · `TheCall` 1 (this PR), plus the 9 the
    other two PRs own.
  - **One deliberate omission:** `DraftBoard`'s hidden `<input type="file">` —
    `className="hidden"` is `display:none`, so it is not focusable at all, and
    its visible trigger button carries the ring.
  - **Follow-up, not done here:** several of these are hand-rolled controls
    that should really *be* `Button` or `Row`, which would make the floor
    structural instead of per-site. That is a much larger, riskier diff than
    adding the class, and it was kept out so this one stays mechanical and
    reviewable. Same reasoning as the panel conversion.
- **Verify the PWA metas and the app icon on device.** Carried from step 4 and
  still not done — a meta or icon change is silent until the home-screen app is
  removed and re-added (failure-archaeology §1). `index.html`'s icon `?v=` is
  at 4.
- **Bricolage Grotesque on device.** Step 3 measured that the spec's `wdth 125`
  is not executable (the axis tops out at 100). If the face doesn't earn its
  keep on a real phone, the recorded swap candidate is Big Shoulders Display.

**Handoff status (2026-09-13).** The three code items above are closed by the
Matchday-cleanup PRs: the 21 panels (**27** in the end — `DraftTracker` and
`LoginScreen` carried six the audit had missed), `MarketMovers`' nested button,
and the two-line contents rail, plus the `Textarea` primitive the PR #49 record
above had left as a recurrence risk. **The two device items — the PWA metas /
app icon, and Bricolage on glass — remain open and are the owner's to run**;
neither is checkable in headless Chromium. The cleanup also found what the
handoff could not: `<badge.Icon />` and two siblings left behind by step 4's
lucide removal, which had **`/trade` white-screening on `main`** exactly as
`LeagueActivity` had. Lesson 1 held, and its corollary is new — a route sweep
whose data never loads is not a route sweep: every view short-circuits to
`ErrorState` before it can reach the crashing component.

**Three lessons worth more than the diff, all of them about verification:**

1. **Neither lint nor build can catch an undefined component.** eslint-scope
   does not resolve a `JSXIdentifier`, and a bad element type is a runtime
   throw. Step 4's lucide removal left `<meta.Icon />` behind in
   `LeagueActivity` and **shipped League › Activity to `main` as a white
   screen** — found here by a route sweep, after lint, 275 tests and a clean
   build had all passed on it. The route sweep is now a documented gate.
2. **Re-score, don't inherit a score.** Step 4 recorded 0 of 12. Two raw
   `border-l-2` accent rails in Pick Trades were live the whole time and were
   found only by re-running the checklist from scratch at the end of step 5.
3. **A rule needs an instrument.** The `--overflow` sweep found a sixth
   truncation of a load-bearing value (a player's name on the Draft Board,
   clipped by 4px) that no amount of looking at screenshots had caught.

**What it was, as originally recorded:**

### DESIGN-1 — build the "Matchday" visual direction **[owner-approved 2026-09-11]**

**Trigger: fired — the owner selected the direction and asked for the build to
start in a fresh session.** Not started in the review: it was scoped as
diagnosis + mocks only, and the app was deliberately left untouched.

**STATUS: ALL FIVE STEPS SHIPPED — closed 2026-09-12.** (This table is the
historical record; the closing summary is above.)

| Step | What | State |
|---|---|---|
| 1 | The accessibility floor + the truncation bugs (DESIGN-2) | shipped 2026-09-11, closed in §3 |
| 2 | The navigation rebuild — tab bar, contents rail, Index (DESIGN-3) | shipped 2026-09-11, closed in §3 |
| 3 | Tokens and primitives | shipped 2026-09-11 |
| 4 | Roll the components through the screens | shipped 2026-09-12 |
| 5 | Motion — the guard, the curve, the press run, `.press`, `Loading`, the sheet, the budget | **shipped 2026-09-12** |

**What step 4 landed.** The three block registers that answer finding **B7** and
are now **law 5** — `RuledList` (many things you scan), `Lede` (one thing you act
on), `NavRow` (a way out) — plus `Row`, the tappable member of a list. B7's fix
turned out to be *deleting the rectangle*, not tuning its padding: Matchday's
mock has zero bordered boxes in its content area. **B2's unfixed case** (Trade
Targets) is inverted — the name out of display type, the value into a
`Magnitude`, the two appeal reads out of 9px badges into marked lines. **Law 2
gained a measured bar test**: Playoff Odds' bar stays (a real proportion of a
bounded whole), TeamCard's strength bars are gone (they clamped, their complement
was meaningless, and their reference moved when a *different* team traded).
**lucide is entirely removed** — 51 icons, 32 files, dependency uninstalled. The
radius sweep took 63 consumer uses to 3 (avatar, sheet grabbers, spinners). All
three inherited Blackout artefacts are cleared: `roundColors` re-cut as an
ink-density ramp, the logo and generated icons re-cut flat.

**The app now fails 0 of `slop-checklist.md`'s 12 markers** (8 at the review, 3
entering step 4). The two still technically live are motion's, and they are step
5's.

**Three lessons worth more than the diff:**

1. **Deleting a primitive does not delete the pattern.** `Card`'s banned left
   accent rail went in step 3, and a raw `border-l-[3px]` on Trajectory's
   verdict survived every step-4 sweep because nothing looking for the *prop*
   could find the *shape*. Audit for the shape.
2. **An enumeration must never be built from `Lede`s.** The first pass rendered
   three IR alerts as three near-identical editorial blocks — the exact
   icon+title+one-liner pattern the direction exists to kill, three times
   taller. Repeated items of one kind aggregate into one.
3. **`/design-review`'s nine greps are not the review.** They passed 955 added
   lines clean while eleven hand-rolled copies of one row had drifted apart on
   `.focus-ring` — an accessibility-floor gap. Run the judgement pass.

~~**Carried into step 5, explicitly:**~~ **All four done 2026-09-12 — see the
closing record above for what step 5 in turn hands on.**

- **Motion, the whole of it.** Widen the `prefers-reduced-motion` guard from one
  class to a global rule FIRST; then the press run, custom easing
  `cubic-bezier(.16,1,.3,1)`, jittered stagger (The Edge's is linear 60ms
  today), clip/wipe entrances rather than `edge-rise`'s fade-up, `:active` on
  every pressable, a 3–5 moment budget.
- **Five pre-existing hand-rolled rows** the step-4 diff deliberately did not
  widen into: `PlayerSearchSheet` (×2), `TradeBuilder`'s add sheet,
  `PlayerProfileDrawer`'s news list, `DraftTracker`. Plus **two chip ladders**
  in `DraftBoard` and `DraftTracker`. All should take `Row` / `Chip`.
- **Draft Board, Draft Tracker and the profile drawer** still hold hand-rolled
  `bg-bg-card border` panels inside them. They are the densest remaining
  screens and were out of step 4's named scope.
- **Verify the PWA metas and the new app icon on device** — a meta or icon
  change is silent until the home-screen app is removed and re-added
  (failure-archaeology §1). `index.html`'s icon `?v=` went to 4.

**What step 3 landed.** The Matchday palette in both themes (warm paper/ink,
neutrals carrying the ground's hue, `--alt` as a secondary hue 176° from the
crimson spot, styled `::selection`); a custom 1.25 type scale replacing
Tailwind's default, anchored at `sm` = 14px; Bricolage Grotesque in place of
Anton; `.ink-field` as the one structural device, which is what resolves
finding **B4**; the three new primitives — **`Mark`** (what replaced `Card`'s
banned left accent rail), **`PositionBand`** (the full-bleed position field
carrying the group total) and **`Magnitude`** (type size as the quantity, the
answer to finding **B2**); every other primitive repainted; and the step-2
navigation surfaces finished in the new palette. `PositionBand` and `Magnitude`
are wired into **My Roster only**, deliberately — it is the screen B2 was
measured on, so the step's central claim is verifiable rather than shipped
untested. `scripts/dev/contrast-audit.mjs` is the new accessibility-floor
instrument: **40 of 40 pass**.

**Two measured corrections to the spec, both recorded in CLAUDE.md:**

- **`directions.md`'s `wdth 125` for Bricolage is not executable.** The Google
  Fonts face has `wdth` 75–**100** with a default of 100 — probed 2026-09-11,
  `wdth@75..125` returns HTTP 400. 100 is both the maximum and the default, so
  the mock's declaration was a no-op, which explains the recorded complaint
  that Bricolage "still reads fairly neutral even pushed onto its axes". It was
  never pushed. **If the swap to Big Shoulders Display is ever made, this is
  now the evidence for it rather than a taste call.**
- **`Magnitude`'s reference is pinned to 10000, not the mock's 9365.** 9365 was
  a top-of-market snapshot; FantasyCalc's scale is a documented 0–10000
  contract. Under a pixel of difference across the range.

~~**Carried into step 4, explicitly:** the radius sweep on consumers (~36
`rounded-full` and ~35 `rounded-lg` remain outside the primitives); lucide's
icon medallions on The Edge's briefing items and the roster shortcuts; the pick
round colours in `roundColors.js`, which are hardcoded hexes still tuned to the
Blackout palette and are the largest remaining Blackout artefact; and the logo
+ generated app icons, which still wear the red-ramp gradient and set the
wordmark in a font the app no longer loads.~~ **All four done 2026-09-12** —
see "What step 4 landed" above.

**Verify on device, and note it is SILENT until then:** the PWA `theme-color`
metas moved with `--bg-secondary` (light `#E7E9EC` → `#E8E5DC`, dark `#101013`
→ `#141413`). Per failure-archaeology §1, a meta change does not take effect
until the home-screen app is removed and re-added — the original regression of
this kind hid for weeks.

**What was decided.** Six directions were mocked across two rounds. Round one
(Instrument / Dispatch / Control) was rejected — scored against a researched
AI-slop marker list, two of the three failed **10 and 11 of 12**. Round two
(Almanac / Blueprint / Matchday) was built to that checklist and all three
score 0. **The owner chose Matchday.**

Matchday in one line: *a publication about a competition* — poster type
(Bricolage Grotesque on its width/optical axes), flat colour with hard edges,
zero radius, no shadows, no icon set, text navigation, and **the five position
hues promoted from 9px tags to full-bleed section bands**. Magnitude is encoded
as **type size**, not a bar, with the band carrying the group total.

**Where the spec lives:** `docs/design/review-2026-09/directions.md` (the
direction, its two revisions, and the build sequence) ·
`slop-checklist.md` (the rules any new UI must pass) · `mocks/directions-2.html`
(the working mock — standalone, never imported by the app).

**Known costs, already measured and accepted:** it is the least dense of the
three (~3–4 targets per screen against Almanac's 7); it needs one new font
family; and Bricolage may not earn its keep on device, in which case the swap
candidate recorded is Big Shoulders Display.

**Settled during review, do not re-litigate:** the home hero keeps team value
as its marquee figure. Leading with the instruction instead was built, reviewed
and **reverted on the owner's call (2026-09-11)** — he preferred the look. The
argument for the swap is still recorded in `unasked.md` §1 if it is ever
revisited.

---

### DESIGN-3 — the record (closed 2026-09-11)

Shipped as step 2 of the Matchday rebuild (PR after #43). **What it was, as
originally recorded:**

### DESIGN-3 — the navigation rebuild

**Trigger: fires with DESIGN-1** (they touch the same files; doing them apart
means migrating twice). Measured in `review-2026-09/inventory.md`:

- **Four destinations have zero content-level inbound links** — Season Review,
  my own Trajectory, Manager Scouting, Rookie Research. Rookie Research is also
  **missing from `PlayerSearchSheet.jsx`'s `DESTINATIONS`**, so it is the one
  view that cannot be found by searching its own name. That one is a two-line
  fix and can ship immediately.
- **All 17 sub-tabs are byte-identical duplicates of the drawer's children** —
  two navigation systems over one payload.
- **Section colours reuse the status tokens**: `SideDrawer.jsx:74,85` assign
  Trade `text-success` and League `text-warning`, the same tokens used for
  actual status in the same file. Violates CLAUDE.md's own exclusivity rule.
- **"Pick Trades" is clipped off its own sub-tab row** at 390px.
- The **"no bottom tab bar" rule is re-litigable** — the owner reopened it for
  this review. NN/g measures hidden navigation at a 20%+ discoverability drop
  and 15% slower mobile tasks; the four weekly sections fit a 2–5 tab bar.

**What shipped, and the one decision not pre-specified.** The brief left "what
replaces the sub-tab layer" as the step's core design call. The answer was a
**wrapping contents rail**, not a hidden or collapsed one: the whole reason for
this step is NN/g's measurement that hidden navigation costs 20%+
discoverability, so hiding a section's siblings behind a tap to remove a
duplicate would have traded one measured problem for the same one. What made
the duplication go away was deleting the drawer's tree, not the rail; what made
A4's clipping go away was wrapping instead of scrolling, which no entry can
hide behind. Live at 390px all five Trade labels now fit one line.

**Labels renamed to the mock's, routes deliberately not.** Today · Squad ·
Trade · League · Index are navigation labels; `/edge` and `/my-team` are
unchanged, so no deep-link, briefing item or redirect was affected and none was
needed. Feature names in CLAUDE.md are unchanged and the mapping is stated once
in the Navigation section. "my team" and "the edge" stay matchable in search.

**Not done here, on purpose:** the tab bar and Index are built in the CURRENT
(Primetime Blackout) tokens, in Matchday's *form* — text-only, no icons, zero
radius, the bar inverted against the page. Re-tinting them to the Matchday
palette belongs to DESIGN-1 (steps 3–5), which is the visual step; doing both
at once means migrating twice.

---

### DESIGN-2 — the record (closed 2026-09-11)

Kept per this file's own rule: closed items move, they are never deleted.
The four bugs as originally recorded:

**Trigger: fired.** These are independent of any visual direction, cost nothing
to fix, and should land *before* the rebuild so the rebuild isn't carrying them.
Evidence: `docs/design/review-2026-09/findings.md` §X1–X3, B3.

1. **`--text-tertiary` fails WCAG AA in both themes** — dark `#54565C` on
   `--bg-card #141417` = **2.5:1**; light `#8A9096` on `#FFFFFF` = **3.2:1**
   (AA body needs 4.5:1). It is used **525 times** and carries real content:
   the meta line on every player row, timestamps, trade-target reasons. Fix is
   a token change in `src/index.css`, not 525 edits.
2. **No `focus-visible` anywhere in the design system.** `Button`,
   `IconButton`, `Card` (interactive), `Chip`, `Badge` define no focus ring;
   `Input`/`Select` actively remove the outline
   (`focus:outline-none focus:border-accent`).
3. **Touch targets under 44px.** `IconButton` is 32/36px and is the close
   control in every sheet header; `Button` `sm` (~30px) and `md` (~36px) are
   also under. The app header's own buttons are correctly `w-11 h-11`, so the
   rule is known and broken elsewhere.
4. **The trade price truncates.** `WhatsFair.jsx:198` sets `truncate min-w-0`
   on the `Est. cost:` value; live at 390px it elides on **5 of 11** target
   cards — the most actionable field on the board. `LineupRow` has the same
   class of bug on long player names ("TreVeyon He…").

**How each was closed**, with the reasoning that is worth more than the fix:

1. **Contrast.** The replacement values are measured against each theme's
   *worst-case* ground, and that is a **different surface in each theme** —
   dark's least-contrasting ground is the *lightest* one (`--bg-card`), light's
   is the *darkest* (`--bg-secondary`). Checking only `--bg-card`, as the
   finding did, passes light mode too easily. AA also puts a floor under the
   bottom step of a three-step text ramp, so tertiary now sits closer to
   secondary than before; that compression is the price of legibility and is
   recorded in `index.css` so nobody "fixes" it back.
2. **Focus — REOPENED AND RE-CLOSED 2026-09-13.** The fix was correct and
   incomplete, and the gap is worth more than the fix: `.focus-ring` was
   carried by every *primitive*, so the four fields that never routed through
   one kept stripping the outline. A post-merge review found them
   (`grep focus:outline-none src` → 4 live hits, all outside
   `src/components/ui/`). `PlayerProfileDrawer`'s scout-note textarea was the
   sharp one: `focus:outline-none` with **nothing** in its place, the only
   control in the app where focus was completely unmarked. The other three
   (`TradeBuilder`'s add-sheet search, `DraftBoard`'s and `DraftTracker`'s
   prospect search) replaced it with a border or ring tint rather than the
   shared ring.
   **Closed by routing three through `Input`/`SearchInput` and giving the
   textarea `.focus-ring` directly** — there was no `Textarea` primitive, which
   is why that one field could not be fixed structurally and was left as the
   standing recurrence risk.
   **That risk is now closed too (2026-09-13): `src/components/ui/Textarea.jsx`
   ships as `Input`'s sibling and the scout note routes through it**, so the
   floor is held by the primitive rather than by a class pasted on one call
   site. The app has exactly one `<textarea>` and it is now inside the
   library — `grep -rn '<textarea' src` returns only `Textarea.jsx`. Two incidental wins: the two prospect searches carried
   `relative` + `pl-9` wrappers reserving space for magnifier icons that left
   with lucide in step 4, and `DraftBoard` had been importing `Input` without
   using it for its own search box. `grep focus:outline-none src` is now 0.
   **The lesson is step 5's own, one layer down: a primitive-level fix only
   reaches call sites that use the primitive.** The 21 hand-rolled panels this
   record hands on are a design-consistency debt *and* an accessibility one.
   Original closure follows.

   One `.focus-ring` rule in `index.css`, `:focus-visible` not
   `:focus`, carried by every interactive primitive. Verified rendering: the
   global search sheet auto-focuses its input, and browsers always treat text
   input focus as focus-visible, so the ring is visible in a plain capture.
3. **Touch targets.** `.tap-target` grows the hit area via a centered
   pseudo-element sized `max(100%, 44px)` — no layout cost, and it can never
   shrink an already-large target. `IconButton` `md` became a *real* 44px box
   instead (it is the sheet close control and headers have room); `sm` kept its
   36px ink for the one place that doesn't. **`Chip` was deliberately excluded**
   — chips sit ~8px apart in a scrolling filter row, so a 44px hit area on a
   40px chip would let neighbours steal each other's taps.
4. **Truncation.** Verified with a new `--text` flag on `screenshot-app.mjs`
   that dumps rendered text: all **18** live target packages now read in full,
   including three-player ones like `Gunnar Helm + Jordan Love + Jonathan
   Taylor (~10,702)`. `innerText` alone can't prove this (CSS ellipsis doesn't
   change it), so the lineup name fix was confirmed in pixels instead.
