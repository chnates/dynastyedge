# History — File Structure

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## File Structure

```
dynastyedge/
├── .github/
│   ├── pull_request_template.md ← THE PR body layout (measured-result + evidence + docs + rollback gates)
│   └── workflows/
│       ├── deploy.yml          ← GitHub Actions auto-deploy (lint + test gate before build)
│       ├── ci.yml              ← lint + test + build on branch pushes / PRs (no deploy)
│       ├── news.yml            ← (only main publishes; a branch dispatch is a dry run) twice-hourly news aggregation (accumulates into the feed) → news-data branch; closes with the source-health alarm, which FAILS the run when a source has gone dark
│       ├── values-history.yml  ← (only main publishes) daily value snapshot + trade archive + monthly archive + the three-source consensus archive → values-history branch; closes with the source-health alarm (its three snapshot steps are continue-on-error, so without it a dead source leaves the run GREEN forever)
│       └── rookie-intel.yml   ← daily rookie depth-chart + draft-capital feed → rookie-intel branch; `mode` input also runs the two CFBD analyses (probe · college-backtest), which publish nothing
├── scripts/
│   ├── fetch-news.mjs          ← multi-source news fetcher (runs in Actions)
│   ├── newsCoverage.mjs        ← THE feed's depth metric (`coverage.depthHours`), pure + tested: p90 age of the player window. Exists because `spanHours` is max − min and three stragglers moved it 54h → 147h the moment the cap stopped evicting them
│   ├── newsRetention.mjs       ← THE feed's retention policy, pure + tested: diversity-aware eviction, so the item cap can never again bind before the 7-day time window (which is what silently collapsed the feed to 30h)
│   ├── fantasyCalcValues.mjs   ← THE snapshot pipelines' FantasyCalc reader, pure + tested: classify by id SHAPE (picks carry synthetic non-numeric ids since 2026-07) and price a pick down the app's own ladder, ending in NULL rather than 0. Three scripts each carried a copy; two were wrong, and the trade archive wrote every pick as 0 for two months
│   ├── sourceHealth.mjs        ← THE multi-source alarm policy, pure + tested and shared by BOTH pipelines: when has a source stopped contributing, and when is that a persistent gap rather than a blip. Exists because "degrades quietly" had become "fails invisibly" — ESPN RSS sat at 0 items in the live feed, and FantasyPros before it, both found by hand months late
│   ├── check-source-health.mjs ← THE alarm itself: runs in Actions AFTER the publish step (so it can never cost data) and FAILS THE WORKFLOW, which is what turns GitHub's own notification into a warning. A missing file is itself an alarm — every snapshot step is continue-on-error, so a script that died outright leaves the run green
│   ├── valuationSources.mjs    ← THE multi-source valuation readers, pure + tested, BESIDE fantasyCalcValues.mjs (whose reader it imports rather than copies — PIPE-1's lesson): the db_playerids crosswalk with its "NA" null sentinel, DynastyProcess, KeepTradeCut's JSON island (joined on mfl_id, NOT the ktc_id that maps Frank Gore Jr. onto Frank Gore Sr.), and the archive merge policy
│   ├── snapshot-consensus.mjs  ← phase 4a: the permanent DAILY three-source valuation archive (app never fetches it). Best-effort PER SOURCE — a failed source is an all-null column, never a 0, and never erases the others
│   ├── snapshot-values.mjs     ← daily FantasyCalc snapshot appender (runs in Actions)
│   ├── snapshot-values-archive.mjs ← permanent MONTHLY values archive for trajectory back-testing (app never fetches it)
│   ├── snapshot-trade-values.mjs ← permanent trade-time value archiver (runs in Actions)
│   ├── snapshot-rookie-intel.mjs ← daily nflverse → Sleeper rookie intel feed (runs in Actions)
│   └── dev/
│       ├── screenshot-app.mjs  ← headless-Chromium screenshotter for the running app (390px UI verification; --route, --player, --drawer, --seed-session, --click, --text, --overflow — see the dynastyedge-visual-capture skill). `--text` dumps the RENDERED text, which beats pixels for "does this value render?" because a tall view downscales to illegibility. `--overflow` is THE truncation instrument: it reports every element actually being clipped (scrollWidth > clientWidth) — `--text` cannot see a CSS ellipsis, because the ellipsis is painted and never in the DOM.
│       ├── replay-live.mjs     ← drives the running app against a SYNTHETIC draft / regular season, so the two once-a-year surfaces can be rehearsed on demand
│       ├── faab-corpus.mjs     ← analysis-only: pulls the league's full FAAB bid corpus (see docs/analysis/faab-bid-corpus-2026-08.md); nothing imports it
│       ├── rookie-signal-backtest.mjs ← analysis-only: grades the SHIPPED rookie model against 2021–2025 (imports src/utils/rookieResearch.js so it cannot drift)
│       ├── rookie-longterm-backtest.mjs ← analysis-only: THE Phase 3c gate — a two-axis "long-term" rookie score, tested against years 2–3 and REJECTED; see docs/analysis/rookie-longterm-signals-2026-09.md
│       ├── cfbd-probe.mjs        ← analysis-only, RUNS IN ACTIONS (needs CFBD_API_KEY): proves CFBD's athlete id IS the ESPN athlete id, so college data joins by ID and never by name
│       ├── rookie-college-backtest.mjs ← analysis-only, RUNS IN ACTIONS: THE Phase 3b gate — dominator rating + breakout age vs years 2–3, also REJECTED; see docs/analysis/rookie-college-production-2026-09.md
│       ├── trade-structure-backtest.mjs ← analysis-only: the DISCONFIRMED trade-structure profiling test (frontier Item 3); drives the shipped buildManagerProfiles so it cannot drift
│       ├── optimizer-signal-backtest.mjs ← analysis-only: measures whether a better weekly PROJECTION is obtainable (it is not) and what DEF streaming is worth; see docs/analysis/optimizer-data-sources-2026-09.md
│       ├── asset-aging-backtest.mjs ← analysis-only: THE keep-score calibration — longitudinal player aging (the survivorship trap the trajectory curves fall into) + whether rookie picks deliver their market price; see docs/analysis/asset-aging-and-pick-value-2026-09.md
│       ├── trade-fair-band-sweep.mjs ← analysis-only: THE OPEN-10 measurement — sweeps the package ASSEMBLY window against APPEAL_BONUS jointly (they were tuned together, so they must be re-measured together) over the live board from all ten seats, and prints keep-pain / appeal / verdict / value sent in ONE table because they trade against each other. Drives the shipped suggestFairPackage through its `band` / `appealBonus` / `requireFairBand` hooks, so the analysis and the product cannot drift
│       ├── contrast-audit.mjs ← THE accessibility-floor instrument: reads the tokens out of src/index.css and measures each against its theme's WORST-CASE ground, plus the two reversal cases a text-on-ground audit misses (paper type on a position band, type on an ink field). Exits non-zero on any failure — re-run after ANY ground-colour change.
│       └── news-coverage.mjs ← analysis-only: THE news-pipeline acceptance metric — how many of my rostered players the app can actually resolve in the feed (no arg = live feed); see docs/analysis/news-sources-2026-09.md
├── api/
│   └── mcp.js                  ← THE deployed Vercel function — a COMMITTED esbuild bundle. Vercel detects functions from the source tree and TRACES rather than bundles, so a shim importing mcp/ crashed on Node's ESM resolver; ci.yml rebuilds and diffs this to stop it drifting
├── vercel.json                 ← rewrites every path to the one function + pins an empty static root (without outputDirectory, Vercel can serve the repo root as static files)
├── mcp/                        ← THE MCP SERVER (see The MCP Server section). Imports src/utils, never copies it; src/ imports nothing from here.
│   ├── README.md               ← how to run it, the three rules a new tool must keep, phase-2 notes
│   ├── stdio.js                ← entry point (stdio transport). Needs --import ./mcp/register.mjs
│   ├── server.js               ← the McpServer: tool schemas + wiring, ZERO domain math
│   ├── snapshot.js             ← league fetch + ~15-min cache + THE as-of stamp (the §7 mitigation: nothing in this repo validates an external payload, so provenance is what makes a wrong answer LOOK wrong). Also mergeAsOf, which RECOMPUTES oldestSourceAt over the union so an added source can't overstate freshness
│   ├── vercelEntry.js          ← the bundle's entry: accepts BOTH calling conventions (a host may hand you a Web Request or Node's req/res), imports lazily so a resolution failure is an HTTP body rather than an opaque platform 500, and reports every failure with a message — never a stack
│   ├── app.js                  ← THE hosted server: OAuth routes in front of the MCP endpoint. Refuses to start without GITHUB_CLIENT_SECRET — no signing key means no auth, and a failed deploy beats an open one
│   ├── oauth.js                ← THE auth crypto + policy: HMAC tokens (no JWT lib, no `alg` to confuse), HKDF-derived key, PKCE S256-only, audience binding. Documents what signed-not-stored COSTS: no revocation (1h tokens), no single-use codes (60s + PKCE)
│   ├── oauthRoutes.js          ← the five OAuth endpoints. Owns THE load-bearing check: redirect-URI origin allowlist, exact-hostname, checked BEFORE anything is minted, failing to an error page because redirecting an unvalidated URI IS the attack
│   ├── http.js                 ← THE streamable-HTTP transport: a Web-standard (Request) => Response, so the host is a packaging decision. STATELESS by necessity (a serverless instance cannot hold a session — the failure is intermittent, warm-passes/cold-fails). Owns the auth gate, which fails CLOSED
│   ├── store.js                ← THE cache backend boundary + the ONE freshness policy (loadSource). Backend is a parameter (memory for stdio AND, today, for the deployed HTTP server — no KV is wired; `restKvStore` exists but has never run against a live store); the policy is shared. Owns the two traps: a store-level TTL would break the stale-fallback contract, and the 1.20MB player DB must be gzipped into KV
│   ├── transactions.js         ← the season-wide transaction feed behind analyze_trade's partner-activity read. A FOURTH TTL and the only SPLIT one: a settled bucket is frozen, the live week rides the SNAPSHOT's 15 minutes because its events are the ones that make a roster wrong. Reads weeks 1..current only — a later bucket is empty by construction (measured: 71/6/0/0/0), so 2 requests where the phone spends 18
│   ├── history.js              ← the league-history walk, TWO widths. getLeagueHistory is DELIBERATELY narrow: leagues + rosters + drafts + picks, no transactions and no users, 14 requests — feeds ONLY buildDraftGrades. getLedgerHistory is the WIDE walk scout_managers needs, widened in the open as its own function on top of the narrow one: + users + transaction weeks 1..last_scored_leg per past season, 68 cold / 0 cached, each frozen season cached under its own key, and a season that could not be read is NAMED, never cached as empty
│   ├── liveScores.js           ← this week's box score. A FIFTH TTL and the only SHORT one (5 min): every other layer here caches LONGER than instinct, because their inputs change on an event, a drip, or once a week — a live score changes every few plays. NOT season.js's cache, whose long TTL exists BECAUSE the odds model discards a partially-played week
│   ├── results.js              ← every season's playoff bracket (/league/{id}/winners_bracket — first called 2026-09-22) behind get_league_results, built on the NARROW history walk: +1 bracket +1 users per season, no transaction bucket. Past brackets frozen per-season on the history TTL, the current one on the snapshot's; an unreadable bracket is NAMED and never cached
│   ├── feeds.js                ← rookie-intel.json + trade-values.json + values-history.json: ONE Class B loader for the other three static feeds the server reads. Never throws; a 200 with the wrong shape is a miss and is never cached; 60-minute TTL for the first two (both publish at most daily), SIX hours for value history (one column per UTC day, and the live endpoint comes from the snapshot, not the feed)
│   ├── news.js                 ← the player-news feed + the matcher. `playerIds` only, NO headline-name fallback: the pipeline already name-matched server-side, and the live player DB holds TWO "DJ Moore"s. Carries its own age so a tool can say when to confirm against a live source instead of being silently 30 minutes behind
│   ├── season.js               ← every regular-season week's matchups, on a THIRD TTL with its own argument (a completed week is frozen forever; the model discards a partially-played one, so the odds move once a WEEK). Owns the state that must never happen: 14 empty weeks and a season that hasn't started are identical, so a total outage is never reported as a preseason
│   ├── weekly.js               ← projections + the schedule, on their OWN ~60-min TTL (league data changes on an EVENT, projections on a 0.06%/10h DRIP). Owns the two silent traps: the schedule is off /v1 (SLEEPER_ROOT) and its fields are home/away
│   ├── teams.js                ← resolveTeam, shared by get_roster / analyze_trade / lineup_advice so "which team did they mean?" has one definition. Reads display_name — Sleeper's /users returns NO username
│   ├── limit.js                ← concurrency gate + backoff, honouring a 429/503's Retry-After (both forms, capped at 4s) off the status fetchJSON now attaches. Lives here, NEVER in fetchJSON — that would change the app's behaviour to fix a server problem
│   ├── config.js               ← league / identity / TTLs, env-first: leagueId and rosterId are parameters, not constants
│   ├── register.mjs            ← registers loader.mjs (deliberate copy of the test suite's — a runnable server must not depend on .claude/skills/)
│   ├── loader.mjs              ← the extensionless-import resolver hook
│   └── tools/                  ← all THIRTEEN are orchestration only, in the shape of TradeAnalyzer.jsx
│       ├── getRoster.js            ← #1 "what's on my team?"
│       ├── findSellHigh.js         ← #2 "who's my best sell-high?" — names a CONCRETE partner and return
│       ├── recommendFreeAgents.js  ← #3 "who should I pick up?" — dynasty value AND this week's projection; a defense is never a general pickup
│       ├── resolveAssets.js        ← #4 (support) "which Bijan?" — an ambiguous name resolves to NOTHING
│       ├── analyzeTrade.js         ← #5 "grade this trade" — IDS ONLY; a free-text name is rejected, never guessed
│       ├── lineupAdvice.js         ← #6 "what do I start?" — IN-SEASON ONLY; a must-fix carries no confidence; a LOCKED slot is never a move
│       ├── playerNews.js           ← #8 "what's the latest on him?" — injury body part + notes + the feed; an ambiguous name is refused, and silence is a gap in coverage, never good health
│       ├── valueHistory.js         ← #13 "how has his value moved?" — the last static feed read; the series rule is getValueSeries (lifted out of useValueHistory, equivalence proved on the live feed) and the team line is The Edge's buildTeamValueSeries; fewer than 4 snapshots is "not enough history yet", never a flat line or 0, and untracked is kept distinct from too-few-points
│       ├── leagueResults.js        ← #12 "who won our league in 2023?" — the p:1 game's winner from the bracket, titles credited by OWNER so a renamed team keeps them; in-progress and unreadable are never reported as "no champion"
│       ├── scoutManagers.js        ← #11 "how does this manager trade, and how have I done?" — buildManagerProfiles, the SAME function Trade › Managers runs; tracks which seasons it READ, so an unread season never makes anyone a non-trader; FAAB in budgets; the "at trade time" line from trade-values.json via tradeTimeTotals
│       ├── researchRookies.js      ← #10 "which rookies become something, and which should I take?" — buildRookieBoard, the SAME board Draft › Research reads; ONE score (the age tilt included), combine numbers as context only; no feed entry is score NULL, never 0; an unreadable feed is available:false with the board in value order, never "no rookies"
│       └── findTradeTargets.js     ← #9 "who do I call about, and what would it cost?" — the question BEFORE analyze_trade. The one layer here with NO TTL: it owns no fetch, so its freshness IS the snapshot's and a number of its own would be a second clock. A pick's id is READ OFF the asset (season/round/originalOwner), never recovered from a label several picks can share
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── ui/                      ← Design System library — route ALL UI through it (barrel index.js)
│   │   │   ├── index.js             ← the single import surface (re-exports every primitive)
│   │   │   ├── Button.jsx           ← THE button (primary/secondary/tinted/ghost/danger · sm/md/lg)
│   │   │   ├── IconButton.jsx       ← THE icon-only/close control (pass `label`)
│   │   │   ├── Card.jsx             ← THE surface container (+ optional `tone` kicker rule; the left accent RAIL is banned)
│   │   │   ├── Mark.jsx             ← THE editorial highlight — a word reversed out of a block; what REPLACED Card's accent rail. Never a position hue.
│   │   │   ├── PositionBand.jsx     ← THE full-bleed position field + group total — Matchday's signature
│   │   │   ├── Magnitude.jsx        ← THE value figure: type SIZE is the quantity (finding B2). Reference PINNED to FantasyCalc's 0–10000 contract (and MAGNITUDE_TEAM_REFERENCE for roster sums), never derived per list.
│   │   │   ├── Loading.jsx          ← THE loading indicator — a printing rule under a label. There is NO spinner: `animate-spin`/`animate-pulse` are named markers and the circle was one of the app's last radii.
│   │   │   ├── RuledList.jsx        ← THE DENSE register (finding B7): rows on the page's ground, hairline separators, NO box
│   │   │   ├── Row.jsx              ← THE member of a RuledList — always carries .focus-ring. Extracted after /design-review caught eleven hand-rolled copies that had drifted apart on it.
│   │   │   ├── Lede.jsx             ← THE OPEN register: eyebrow · marked headline · prose · ink CTA. What replaced The Edge's icon+title+one-liner briefing cards.
│   │   │   ├── NavRow.jsx           ← THE DOOR — a row that takes you somewhere; no icon, no chevron
│   │   │   ├── Sheet.jsx            ← THE bottom sheet + SheetHeader (owns scroll-lock/drag/safe-area)
│   │   │   ├── Modal.jsx            ← THE centered dialog (confirms / small forms)
│   │   │   ├── Chip.jsx             ← THE filter chip (toggle pill, position-tinted active)
│   │   │   ├── Badge.jsx            ← THE small status/label badge (New/You, tone/soft)
│   │   │   ├── Input.jsx            ← THE text field + SearchInput variant
│   │   │   ├── Textarea.jsx         ← THE multi-line field — Input's sibling; the scout note was the app's ONE control with no primitive to route through
│   │   │   ├── Select.jsx           ← THE dropdown field (native select + label/hint)
│   │   │   ├── motion.js            ← the JS half of the reduced-motion guard (`prefersReducedMotion`, `scrollToTopOf`) + `stagger()`, the jittered press-run delays
│   │   │   └── cn.js                ← tiny className joiner (the one styling primitive)
│   │   ├── auth/
│   │   │   └── LoginScreen.jsx      ← Sleeper-username sign-in + team-picker fallback (gates the app)
│   │   ├── edge/
│   │   │   └── EdgeView.jsx         ← The Edge: daily briefing home screen
│   │   ├── roster/
│   │   │   ├── RosterLayout.jsx     ← Squad (My Team) contents rail: My Roster / Lineup / Season Review / Trajectory (renders ../lineup views)
│   │   │   ├── RosterView.jsx       ← own roster + drill-down for any team
│   │   │   ├── FreeAgentsView.jsx   ← now routed under League (file stays here)
│   │   │   ├── RosterActionItems.jsx
│   │   │   ├── RosterAnalysisSheet.jsx  ← age-lane chart + win window bottom sheet
│   │   │   ├── TrajectoryView.jsx   ← multi-year forward value projection (any team)
│   │   │   ├── PlayerCard.jsx
│   │   │   └── PickBadge.jsx
│   │   ├── trade/
│   │   │   ├── TradeLayout.jsx      ← sub-tabs (Partners/Analyzer/Targets/Managers) + deadline banner
│   │   │   ├── TradePartnerFinder.jsx
│   │   │   ├── TradeAnalyzer.jsx
│   │   │   ├── TradeBuilder.jsx
│   │   │   ├── TradeVerdict.jsx
│   │   │   ├── PartnerSelect.jsx    ← THE opponent picker (fit-grouped) — Analyzer + Targets
│   │   │   ├── TheCall.jsx         ← THE Analyzer hero: verdict + fair band + the three act summaries (FOR YOU / FOR THEM both graded)
│   │   │   ├── PartnerContextStrip.jsx ← THE partner intelligence strip — Analyzer + Targets
│   │   │   └── WhatsFair.jsx        ← Targets: league-wide board + per-team scouting mode
│   │   ├── lineup/                  ← rendered as Squad (My Team) views (no own layout)
│   │   │   ├── LineupOptimizer.jsx  ← Squad › Lineup: the swap sandbox + orchestration
│   │   │   ├── LineupMovesCard.jsx  ← the start/sit hero + move list ("what do I change?")
│   │   │   ├── LineupRow.jsx        ← THE lineup row — starters AND bench, so a player reads the same either side of the line
│   │   │   ├── LineupEfficiency.jsx ← Squad › Season Review: actual vs optimal points
│   │   │   └── FreeAgentDrawer.jsx  ← per-slot waiver options (an explicit action)
│   │   ├── league/
│   │   │   ├── LeagueLayout.jsx     ← sub-tabs: Overview / Free Agents / Activity / Movers / Playoffs
│   │   │   ├── LeagueOverview.jsx
│   │   │   ├── LeagueActivity.jsx   ← transaction feed (trades, waivers, FAAB bids)
│   │   │   ├── MarketMovers.jsx     ← risers/fallers, buy-low / sell-high
│   │   │   ├── PlayoffOdds.jsx      ← Monte Carlo rest-of-season playoff odds + seeding
│   │   │   ├── ManagersView.jsx     ← manager scouting: my report card + opponent profiles
│   │   │   ├── ManagerScoutingSheet.jsx ← per-manager sheet: ledger, drafts, tendencies
│   │   │   ├── TeamCard.jsx
│   │   │   └── MatchupCard.jsx
│   │   ├── news/
│   │   │   └── NewsView.jsx         ← League-wide aggregated news feed (browsable)
│   │   ├── draft/
│   │   │   ├── DraftLayout.jsx      ← sub-tabs: Board / Tracker
│   │   │   ├── DraftBoard.jsx       ← rookie board: tiers, My Board, CSV columns
│   │   │   ├── RookieResearchView.jsx ← Draft › Research: opportunity score, market-vs-model divergence
│   │   │   ├── DraftTracker.jsx     ← Sleeper-synced live tracker + manual fallback
│   │   │   ├── PickTradeCalculator.jsx ← move-up/move-down pick package planner (routed under Trade › Pick Trades; file stays here)
│   │   │   └── boardStorage.js      ← shared draft-section localStorage keys
│   │   └── shared/
│   │       ├── SideDrawer.jsx       ← the utility surface (refresh, data status, theme, sign out) — ZERO destinations
│   │       ├── TabBar.jsx           ← THE primary navigation (bottom tab bar, text-only) — reads src/navigation.js
│   │       ├── SectionContents.jsx  ← THE within-section nav (wrapping contents rail) — never duplicate it
│   │       ├── IndexView.jsx        ← THE complete map (the 5th tab): every section + the four consulted views
│   │       ├── ErrorState.jsx       ← THE error component — never duplicate it
│   │       ├── SectionHeader.jsx    ← THE section header — never duplicate it
│   │       ├── PlayerProfileDrawer.jsx
│   │       ├── NewsArticleSheet.jsx    ← tappable news reader bottom sheet
│   │       ├── PlayerSearchSheet.jsx   ← global player search (header icon → profile)
│   │       ├── WinWindowBadge.jsx
│   │       ├── TrendArrow.jsx
│   │       ├── DynastyEdgeLogo.jsx
│   │       ├── TeamAvatar.jsx       ← Sleeper avatar + FLAT initial fallback (the gradient went in step 4)
│   │       └── Sparkline.jsx        ← tiny SVG trend line for value history
│   ├── hooks/
│   │   ├── useSleeper.js        ← league/rosters/users/picks/state fetch
│   │   ├── useFantasyCalc.js    ← FantasyCalc fetch + module cache
│   │   ├── usePlayerDB.js       ← shared /players/nfl cache (one fetch/session)
│   │   ├── useLeague.js         ← combined league state, player resolution (+ Sleeper-only `signInRosters` for login)
│   │   ├── useIdentity.js       ← logged-in roster identity (localStorage store); wipes roster-scoped keys on switch
│   │   ├── useTransactions.js   ← season-wide transaction feed
│   │   ├── useLeagueHistory.js  ← walks previous_league_id chain: past seasons' tx/drafts
│   │   ├── useManagerProfiles.js← composes history + current season into scouting profiles
│   │   ├── useTradeTimeValues.js← trade-time value archive for the ledger (best-effort); the completeness rule is utils/managerAnalysis.js's tradeTimeTotals
│   │   ├── matchupWeeks.js      ← shared /matchups/{week} session cache (playoff odds + lineup history)
│   │   ├── useLineupHistory.js  ← my past matchups for efficiency review (reads matchupWeeks)
│   │   ├── usePlayoffOdds.js    ← regular-season schedule (via matchupWeeks) + Monte Carlo sim
│   │   ├── weeklyProjections.js ← shared /projections + /state session cache (Optimizer + Free Agents)
│   │   ├── useLineupData.js     ← projections (via weeklyProjections), statuses, schedule, def stats
│   │   ├── useWatchlist.js      ← starred players (localStorage-backed store)
│   │   ├── useLastVisit.js      ← The Edge's "since your last visit" anchor
│   │   ├── useLeagueNews.js     ← news feed matched to my roster + watchlist
│   │   ├── useNewsFeed.js       ← full aggregated feed for the News section
│   │   ├── useValueHistory.js   ← daily value snapshots for sparklines (best-effort); getSeries now delegates to utils/valueHistory.js's getValueSeries
│   │   ├── useRookieIntel.js    ← rookie depth-chart + draft-capital feed (best-effort; `enabled` keeps it unfetched for a consumer with no rookie to show)
│   │   ├── useRookieResearch.js ← THE rookie board's memo for Draft › Research AND the profile drawer's per-player row — the composition itself is utils/rookieResearch.js's buildRookieBoard (so the MCP server builds the same board)
│   │   ├── usePlayerIntel.js    ← production stats + depth chart + ESPN news
│   │   ├── useScrollLock.js     ← freezes <main> while a bottom sheet is open
│   │   ├── useSheetDrag.js      ← swipe-down-to-dismiss gesture for bottom sheets
│   │   ├── useTheme.js          ← dark/light toggle
│   │   ├── useAppVersion.js     ← build-id self-heal: reload off cached HTML (iOS standalone)
│   │   ├── usePlayerNews.js     ← per-player injury status
│   │   ├── useSleeperRookies.js ← rookie map derived from usePlayerDB
│   │   ├── useSleeperDraft.js   ← live rookie draft sync (order, picks, refresh/polling)
│   │   └── useRookieADP.js
│   ├── utils/
│   │   ├── fetchJSON.js         ← shared fetch wrapper with timeout — use everywhere
│   │   ├── leagueState.js       ← THE five-source join (buildLeagueState): the object EVERY analysis function eats. Extracted from useLeague's useMemo so it runs under plain Node; equivalence to the old memo proved against live payloads, not inspected
│   │   ├── teamName.js         ← getTeamName — in utils, not hooks, so the analysis layer stays React-free (re-exported from useLeague for the 22 components that import it there)
│   │   ├── valueHistory.js     ← MIN_SPARKLINE_POINTS, same reason (re-exported from useValueHistory), plus THE per-player series rule (getValueSeries — the body of the hook's getSeries, extracted 2026-09-25 so get_value_history draws by the phone's rule) and its dated/coverage/slice/summary companions
│   │   ├── appVersion.js        ← pure reload-URL builder for the version self-heal
│   │   ├── positionColors.js    ← position identity color class maps — use everywhere
│   │   ├── roundColors.js       ← pick round color classes (PickBadge, TeamCard)
│   │   ├── tierColors.js        ← win-window tier colors (badge + banner chips)
│   │   ├── rankColors.js        ← gold/silver/bronze medal colors for rank ordinals
│   │   ├── tradeAnalysis.js     ← trade scoring, verdict logic; buildSideFit is ONE fit engine called from BOTH seats (buildPartnerFit = the `them` wrapper, myFit = my seat, display-only)
│   │   ├── edgeBriefing.js      ← The Edge: signals, briefing items, GM line
│   │   ├── managerAnalysis.js   ← manager scouting: ledgers, tendencies, draft grades. buildDraftGrades exposes the draft record WITHOUT the ledger beside it, so the MCP server can reach it on a 14-request walk instead of ~169 — same buildDraftRecords both ways, equivalence proved by test. tradeTimeTotals is the "at trade time" rule, shared by useTradeTimeValues and scout_managers
│   │   ├── rosterAnalysis.js    ← positional strength, win window tiers, Targets ranking (need × value × movability)
│   │   ├── recommendations.js   ← THE assistant-GM brain: keep/givability scores (round-priced picks, past-peak age tilt), FA pickups, two-sided sell moves, the cash-out board
│   │   ├── faabBid.js           ← THE FAAB bid (OPEN-3): one pure function behind League › Free Agents AND recommend_free_agents; reads the CURRENT period's budget from settings (never assumes 100/1000), ladder 11/16/23% of the FULL budget capped at what is left, $2 floor on $1000, null for a defense or an unpriced player
│   │   ├── fairBand.js          ← THE definition of "fair" (±5%), shared by the Analyzer's verdict and every surface that PREDICTS it
│   │   ├── dynastyTrajectory.js ← forward value projection: market age curves + pick maturation
│   │   ├── seasonWindow.js      ← THE "has the rookie draft happened yet?" resolver — the live pick window + which draft the Tracker shows (replaced the hand-rolled PICK_YEARS)
│   │   ├── pickCapital.js       ← pick ownership resolution logic (year weights are relative to the window, never literal years); also THE spent-pick answer shared by League › Activity and the manager ledger — buildDraftPickIndex (what it became) + buildGenericRoundValues ("a 2nd is a 2nd")
│   │   ├── leagueResults.js     ← THE bracket reader (readBracketPlacements / buildSeasonResult / countTitles): champion = w of the p:1 game, placements carry owner_id, standings by W then PF. Pure; read by the MCP server's get_league_results, and by any future champions screen
│   │   ├── rookieAdp.js         ← derived rookie-class ADP for the Draft section + buildRookieMap, THE rookie-class rule (moved out of useSleeperRookies)
│   │   ├── rookieResearch.js    ← rookie opportunity model: depth × capital, market-vs-model divergence; buildRookieBoard is THE whole-board composition (extracted from useRookieResearch; equivalence proved on live data)
│   │   ├── positionalValue.js   ← scarcity / value over replacement — replacement levels LEARNED from the live league, DISPLAY ONLY
│   │   ├── rosterSpace.js       ← active-slot headroom for a trade; reports owed drops, NEVER calls a trade illegal
│   │   ├── partnerActivity.js   ← a partner's recent adds from the cached transaction feed (descriptive only)
│   │   ├── pickTrades.js        ← pick trade calculator: slot pricing + packages
│   │   ├── peakWindows.js       ← position peak-age windows + status helper
│   │   ├── draftLive.js         ← THE rookie draft live path (on the clock, countdown, Best Available, capital, recap grades) — pure, extracted from DraftTracker so it is testable
│   │   ├── lineupBuild.js       ← THE optimal starting-lineup slot-fill (metric-agnostic); fed points (Optimizer) or dynasty value (Trade Analyzer fit sim)
│   │   ├── lineupMoves.js       ← THE weekly start/sit engine: solves the lineup, diffs it against yours, emits the move list (gains sum to the headline)
│   │   ├── lineupConfidence.js  ← the MEASURED hit-rate curve behind "61% likely to be the right call" — regenerate, never hand-edit
│   │   ├── freeAgents.js        ← THE waiver-options list (never gated on FantasyCalc; carries the TEAM_* guard) AND the one dynasty free-agent pool (buildFreeAgentPool / buildAvailableDefenses), which by construction can never return a defense as a general pickup
│   │   ├── lineupHistory.js     ← optimal-lineup POINTS math for efficiency review (delegates to lineupBuild)
│   │   ├── playoffOdds.js       ← scoring model + Monte Carlo + deadline verdict; also buildPlayoffOutlook, THE whole composition — extracted from usePlayoffOdds so the MCP server runs the same model the phone does (the hook keeps only the memo)
│   │   └── projections.js       ← lineup optimization, matchup quality
│   ├── context/
│   │   └── LeagueContext.jsx
│   ├── navigation.js            ← THE navigation map — one tree read by TabBar, SectionContents, IndexView and global search
│   ├── constants.js             ← league ID, API base URLs, feed URLs, PICK_YEARS, ROSTER_SLOTS
│   ├── App.jsx
│   └── main.jsx
├── docs/                        ← durable analysis + design records (not shipped)
│   ├── open-items.md                ← THE living "what's next" backlog — deferred work + trigger conditions
│   ├── archive/                     ← SPENT docs, kept as history and never deleted (CLEANUP-1): the Sept 2026 build plan, the Aug 2026 status snapshot, the July 2026 repo review, the Phase 3 "Primetime Blackout" brief, DESIGN-1's handoff prompts, open-items-2026.md (every closed open-items record, same IDs) and the one-off archive-branches workflow. README.md indexes it
│   ├── analysis/                    ← model calibration + research notes (incl. optimizer-data-sources-2026-09.md: the Optimizer data-source feasibility study; asset-aging-and-pick-value-2026-09.md: THE keep-score calibration — player aging + pick realization; trade-my-side-read-2026-09.md: the one-engine-both-seats change, whose §4 is SUPERSEDED by trade-fair-band-2026-09.md: which of the two "fair" windows is allowed to answer which question — the suggestion is held inside buildFairBand and the wider assembly window is demoted to feeding `alternative`)
│   └── design/review-2026-09/       ← THE UX/IA + visual review that superseded Phase 3: findings.md (audit) · inventory.md (all 21 destinations) · slop-checklist.md (researched AI-slop markers + how the shipped app scores) · directions.md (six mocked directions + the Matchday decision) · unasked.md · mocks/ (standalone, never imported by the app)
├── tests/                       ← plain-Node test suite (node:test + node:assert/strict, zero deps)
│   ├── fixtures/
│   │   └── draft-2025.json          ← this league's REAL 2025 rookie draft (board, 40 picks, 24 traded picks) — replayed by truncation to synthesize every mid-draft state
│   ├── draftLive.test.mjs           ← draft live path: order resolution (both tiers), real traded-pick replay, on-the-clock/countdown at all 40 board positions, Best Available, capital, recap steal/reach banding, and the recap GRADE — VOE sums to zero league-wide, volume never earns a better grade, per-pick/hits banding, the unpriced-class no-grade contract, board-order-not-argument-order pairing
│   ├── sleeperDraft.test.mjs        ← mocked-fetch: single-draft endpoint merged over the list (slot_to_roster_id), session cache, best-effort sub-fetch degradation
│   ├── projections.test.mjs         ← Week 1 lineup engine: defense rankings joined via player DB + schedule, home/away fields, Week-1 empty-stats contract, red/yellow/green flags, best bench
│   ├── playoffOdds.test.mjs         ← fixed-seed determinism, Σ odds = playoff teams, verdict thresholds; plus buildPlayoffOutlook's three states — a week counted only when EVERY team has scored, a posted-but-unplayed schedule being ACTIVE (odds off the strength prior alone), and the preseason returning no results rather than a fabricated percentage
│   ├── seasonWindow.test.mjs        ← the draft-completion boundary: pre_draft/drafting/paused keep a season current, `complete` rolls it, an auction never counts, a past season's draft never rolls it; the Tracker prefers the upcoming draft and falls back to the most recent completed one; no NFL state degrades to the seed
│   ├── pickCapital.test.mjs         ← pick ownership resolution, round-median pick values, year weights BY DISTANCE from the upcoming draft (a rolled year is never scored 0), and the spent-pick ladder (slot→player join incl. the string-roster-id trap and the draft_order fallback; season-agnostic round medians)
│   ├── pickTrades.test.mjs          ← slot tiers (as coded), slot pricing fallback, package constraints
│   ├── faabBid.test.mjs             ← the FAAB bid: budget read from settings (no budget → no bid, never an assumed scale), the current period's remainder, the same PERCENT at $100 and $1000, each tier reachable, the $2/$1 floor (not the spec's $10) and waiver_bid_min, week scaling, the full-budget-not-remainder pricing and the cap, null for a defense and an unpriced player, and the shared pickup context with recommendFreeAgents
│   ├── managerAnalysis.test.mjs     ← past-pick ≈ round-median fallback, ±5% win/loss banding
│   ├── appVersion.test.mjs          ← reload URL: ?v= before the hash (HashRouter), encoding, null build id
│   ├── tradeTargets.test.mjs        ← Targets ranking: deficit gate + value floor league-wide, team-scoped mode keeps depth (never empty), fillsNeed flag, the movability TILT (band under 2×, spare depth outranks an equal-value untouchable, nothing ever hidden), and the POSITION filter applied inside the ranking rather than to the slice — pinned by the case where filtering the sliced top-1 returns nothing
│   ├── tradeAnalysis.test.mjs       ← OPEN-10 (the suggestion lands inside buildFairBand — asked of that function, never a 0.95/1.05 literal; the pre-2026-09-21 search kept as an EXECUTABLE statement of the bug, so the fixture cannot silently stop exercising it; the overpay demoted to `alternative` with its premium; a target nothing can price fairly still answered and flagged; PROTECT_THRESHOLD unmoved), Layer 3's basis swap (odds score the window in season, tier is the offseason fallback byte-for-byte, a bubble team gets a real read, the printed stance is the one that scored it), the `alternative` (now always HIGHER-appeal — the pricier road the cost-aware search passed over), the phase-2 trade-off (a Strong package costing more than APPEAL_BONUS loses to a Fair one; the fair band and protect threshold still bind), Layer 4's fills/lineup-gain scored ONCE, the my-lineup verdict gate (downgrades an Accept, never upgrades, never fires on noise), verdict ladder, % vs larger side, counter never re-suggests, lineup-sim fit (bench ≠ fill, starter-loss hurt), trajectory lens, draft nudge, Layer 4 (a benched acquisition reads Weak however valued; the gate downgrades an Accept but never lifts a Decline; landing spots both directions; the pitch speaks from their side), buildPartnerFit's extraction contract (standalone == via analyzeTrade) and its wrapper contract (== buildSideFit from the `them` seat), the my-side read (myFit's facts equal Layer 2's own, it speaks in the second person, and it can NEVER move a verdict — swapped for its opposite or removed, the whole ladder is deepEqual), the two depth charts (marker in/out, getContext read off the POST-trade roster so a WR-for-WR chart stays true), the package's my-side read (present without a partner roster, null without a league, computed after the choice so it never reorders), the two-phase package builder (phase 2 rejects the piece they have no use for, never unlocks a protected asset, reports no appeal without a partner), and a suggested PICK carrying the season/round/originalOwner triple that identifies it — pinned against a roster holding three picks under one label, where a label match is a coin toss
│   ├── tradeContext.test.mjs        ← the five negotiating signals (fair band, scarcity, roster space, weekly impact, partner activity) — and the contract that NONE of them may move the verdict
│   ├── dynastyTrajectory.test.mjs   ← per-year clamps, hold-flat contract, pick maturation
│   ├── lineupBuild.test.mjs         ← slot-fill order (singles → FLEX → SFLX), IR/taxi excluded, who-starts identity
│   ├── lineupMoves.test.mjs         ← start/sit engine: GAME LOCKS (a sealed slot never yields a move however much better the bench is, a locked bench player is never started, a played game's ACTUAL score outranks both the projection and the blocked-scores-0 rule, a locked player with no live score falls back to his projection and NEVER to 0, the Σ-gains invariant survives locks, and an empty locked set means "unknown" not "everything"); Σ gains = headline invariant, the two superseded per-slot bugs (double-count, missed cascade), hard-block exclusion, empty DEF slot, swap algebra, confidence lookup + coin-flip demotion (demoted moves still sum to the headline)
│   ├── freeAgents.test.mjs          ← waiver options: the DEF blind spot (FantasyCalc must not gate the list), TEAM_* offense-totals guard, rule-7 `—` for unranked, rostered exclusion, and the one-defense rule (a skill slot never returns a DEF, however it projects)
│   ├── lineupHistory.test.mjs       ← optimal-lineup slot-fill order (singles → FLEX → SFLX)
│   ├── matchupWeeks.test.mjs        ← mocked-fetch: one fetch/week across both consumers, all-fail rejection
│   ├── rookieAdp.test.mjs           ← ROOKIE-1: the rookie→FantasyCalc join is by sleeperId only — the two Jaylen Smiths (the unpriced RB never takes the priced WR's entry) and a same-name-SAME-POSITION veteran (the collision a position guard would have missed); no FantasyCalc still renders the whole class, unpriced
│   ├── valueHistory.test.mjs        ← the extracted sparkline rule: the 4-point threshold, the dated series carrying exactly getValueSeries' values, tracked-short vs untracked, trailing-window slicing that never widens, and a summary that never divides by a zero start
│   ├── rookieResearch.test.mjs      ← opportunity blend, shared points scale (the backup-TE trap), within-position divergence, roster-fit re-ranking (need/window bonuses, score untouched), drawer hand-off fields, best-effort feed degradation, and the measurables NULL (age/combine can never move a score)
│   ├── recommendations.test.mjs     ← suggestSellMove's two-sided partner pick (a concrete return beats a needier team with nothing, the neediest-team fallback, startsForThem, nav-ready shape); pick keep-scores by round (strict ordering under every tier, nothing auto-excluded, unknown round falls back); the past-peak age tilt (decline-only, per-position, saturating, never positive, cliff protection survives it); and the cash-out board (value-at-risk selection, the reach/premium labels, and the pin that its gap equals buildFairBand's)
│   ├── fantasyCalcValues.test.mjs   ← the pipelines' FantasyCalc reader: a synthetic non-numeric id is a PICK (the live bug), a pick with no id still is (the pre-2026-07 shape), the season-median → generic-median → NULL ladder, a slot entry never polluting a round median, and the old presence-based classifier kept as an executable regression statement
│   ├── sourceHealth.test.mjs        ← the alarm, and the RESTRAINT as much as the firing: a 3-day gap fires, a 1-day blip does NOT, recovery resets a consecutive count, a fresh archive never alarms before it has a window of history, a short coverage array reads as unread rather than read, one dark source never implicates the healthy ones, and the feed's threshold is deliberately NOT the archive's
│   ├── valuationSources.test.mjs    ← the three-source readers: "NA" as a NULL sentinel rather than a key every unmapped player collapses onto, KTC joined on mfl_id with the Frank Gore Jr./Sr. collision pinned from both sides, superflexValues.value never the TE-premium siblings, the old `var playersArray` shape kept as an executable regression statement, and the merge contract — a failed source is all-null with asOf null (never 0), erases nothing, back-fills nothing, and columns are NEVER pruned by time
│   ├── newsCoverage.test.mjs        ← the depth metric: a few stragglers cannot set it (the 54h → 147h case), a genuinely deep window reads deep, general items excluded, measured from the newest player item
│   ├── newsRetention.test.mjs       ← the news window's retention policy: newest-N-per-player, a redundant item losing to an OLDER item about an uncovered player, breadth preserved at every k, roundups charging every player they name, and an id-less item never dropped by quota
│   ├── transactions.test.mjs        ← mocked-fetch: all-18-buckets-failed rejection, per-bucket degradation
│   ├── leagueState.test.mjs         ← buildLeagueState: string-id normalization across mixed-shape payloads + the '0' sentinel (rule 8), unranked players kept at value 0 and the skip-then-self-heal path (rule 7), a pick at its ORIGINAL owner's slot vs round medians (Feature 1), FAAB read from settings, identity as runtime state, input immutability
│   ├── mcpOauth.test.mjs            ← the auth layer, written as ATTACKS: a foreign redirect_uri refused without redirecting, lookalike hosts (evil.claude.ai, claude.ai.evil.com) refused, PKCE `plain` refused, a stolen code useless without the verifier, a token for another audience refused, the allowlist re-checked at every request, and the three token kinds never interchangeable
│   ├── mcpHttp.test.mjs             ← the HTTP transport + its gate: a throwing authenticator is never authorized, EVERY post is authenticated (not initialize-only), 401 advertises RFC 9728 discovery, no session id is ever minted, GET leaks no league data, and the same tools as stdio — asserted BY NAME, so a tool added to createServer and not to the transport fails here instead of shipping a fork
│   ├── mcpStore.test.mjs            ← the cache backend: fetchedAt round-tripping byte-for-byte (the provenance contract), gzip on a player-DB-shaped payload, the stale-on-failure fallback AND its cold-failure throw, THE TRAP (an evicting store loses the fallback that a keeping store answers with), and a broken store degrading to slower-never-broken on both read and write
│   ├── mcpLimit.test.mjs            ← the rate discipline fetchJSON does NOT have: concurrency cap, a rejecting job freeing its slot, 429/503 retried with bounded backoff, and a 404 never retried (it is an answer, not a failure)
│   ├── mcpSnapshot.test.mjs         ← mocked-fetch: the 15-min TTL, values + player DB cached ACROSS leagues (a second league must not re-download 5-8MB), per-source as-of stamps with oldestSourceAt as the STALEST input, serve-cache-and-label-stale on failure vs a cold throw, and the FantasyCalc shape guards
│   ├── mcpGetRoster.test.mjs        ← get_roster: never guessing between two teams (candidates instead), rule 7 as value:null + unranked:true (never 0), taxi/IR as their own slots, pick pricing basis, bounded output with the truncation disclosed
│   ├── mcpWeekly.test.mjs           ← the weekly layer: the offseason costing ZERO requests and reporting no projMap (never zeros), the schedule fetched off SLEEPER_ROOT not /v1, parseByeTeams reading home/away (and the wrong field names yielding an empty set — the silent bug), an empty playingTeams meaning "byes unknown" not "everyone on bye", the 60-min TTL being LONGER than the snapshot's, and mergeAsOf recomputing age over the union
│   ├── mcpFindSellHigh.test.mjs     ← find_sell_high: a CONCRETE partner and return (not "shop him"), the two-sided partner pick, every alternative genuinely at a surplus position, and "no sell-high" stated as the answer rather than hidden
│   ├── mcpRecommendFreeAgents.test.mjs ← recommend_free_agents: no defense in the general list EVER, the DEF refusal still naming the incumbent, the ranking being by dynasty value not projection, and the offseason reporting projectedPoints null — never 0
│   ├── mcpResolveAssets.test.mjs    ← resolve_assets: an ambiguous name resolving to NOTHING (never the higher-valued of two), pick parsing to the season-round-originalOwner id analyze_trade accepts, rule 7 keeping unranked players findable
│   ├── mcpAnalyzeTrade.test.mjs     ← analyze_trade: a free-text name REJECTED even when unambiguous (the tool does no name matching at all), an id on the wrong roster refused, the price read from the owning roster not the caller, both seats graded, concerns as a subset of reasons, and windowBasis naming the tier
│   ├── mcpTransactions.test.mjs     ← the transaction feed: weeks 1..current only (a later bucket is empty by construction), the SPLIT TTL proved by a cached refresh costing ONE request, and the degradation contract from BOTH sides — an outage is never reported as "they made no moves", and a genuinely quiet partner still is
│   ├── mcpLeagueResults.test.mjs    ← get_league_results + the bracket reader + mcp/results.js: the p:1 winner on the live 2023 payload, a posted-but-unplayed bracket IN PROGRESS (never "nobody won"), titles by owner across seasons, name fallbacks that never go undefined, the walk adding brackets + users and NO transaction bucket, and an unreadable bracket named, not cached, and reported as unknown
│   ├── mcpScoutManagers.test.mjs    ← scout_managers + the wide walk, the "never traded" contract from BOTH directions (a quiet manager read in full IS reported as one; nothing read makes every trade field null; a partial read never calls anyone a non-trader and drops "you haven't completed a trade"), FAAB in budgets with no dollar field leaving the tool, zero-value assets as null, an archived null hiding the at-trade-time line, and the wide walk reading weeks 1..last_scored_leg while the narrow walk still fetches no transactions or users; a season whose buckets all fail is named and NOT cached
│   ├── mcpHistory.test.mjs          ← the narrow walk: zero transaction URLs and zero user URLs (the ~169-vs-14 claim, proved rather than asserted), '0' as the chain sentinel, a broken hop ending the chain rather than failing it, and a failed drafts LIST reported as unavailable instead of as "this league has never drafted"
│   ├── mcpSeason.test.mjs           ← the rest-of-season layer: THE contract that a total fetch failure is never reported as a preseason (the two shapes are identical on the wire), one bad bucket degrading alone, the week range read from league settings, per-week + per-league cache keys, and the TTL pinned as its OWN literal so re-deriving weekly.js's can never silently move it
│   ├── mcpPlayoffOdds.test.mjs      ← get_playoff_odds: the preseason returning a NULL percentage and a labelled PREVIEW (never 0, which reads as eliminated), a POSTED-but-unplayed schedule being ACTIVE rather than preseason, unavailable ≠ preseason, Σ odds === the field size, seedDist computed but not returned, and the stance being getDeadlineVerdict's so a trade grade cannot disagree
│   ├── mcpNews.test.mjs             ← the news layer + tool 8: `playerIds` as THE join with NO headline-name fallback (the two-DJ-Moores collision, pinned from both sides), athleteIds as the second hop, a roundup FLAGGED as one, Class B degradation stated as a missing source rather than as "no news", and the stale-feed warning near kickoff
│   ├── mcpLineupAdvice.test.mjs     ← lineup_advice: the offseason returning no summary and no zeros, per-move gains summing EXACTLY to the headline, a must-fix carrying NO confidence, confidencePct being a percentage not a fraction (the ×100 bug that printed "6530%"), and a blocked starter contributing 0
│   ├── mcpValueHistory.test.mjs     ← get_value_history + its loader: a dated series beside the LIVE current value, "not enough history yet" as null series/summary (never flat, never 0), untracked distinct from too-few, the team line IS buildTeamValueSeries, movers bounded with true counts, an unreadable feed ok:true/available:false, an ambiguous name refused; the loader never throws, never caches a wrong shape, and has its own longer TTL
│   ├── mcpResearchRookies.test.mjs ← research_rookies + mcp/feeds.js: the tool's score IS the util's, a faster 40 moves neither score nor fit, no feed entry is null never 0, an unreadable feed returns the whole class in value order rather than an empty board, an ambiguous name refuses, bounded output with the true count; and the loader never throws, never caches a wrong-shape 200
│   ├── mcpFindTradeTargets.test.mjs ← find_trade_targets: the position filter applied INSIDE the ranking (a filter over the sliced top-1 returns nothing where the real answer is a row), the cap disclosed with the true board beside it, scoped mode keeping their depth pieces, a near-miss stated rather than implying the Analyzer will agree, and twin picks resolving to the RIGHT one rather than the first match (one label, two distinguishable assets)
│   └── helpers/mcpFixtures.mjs      ← ONE synthetic league shared by the MCP tool suites — four tools read the same object, and four divergent copies is the drift prerequisite C removed from src/
├── index.html
├── eslint.config.js             ← ESLint 9 flat config (recommended + react-hooks, src/ + scripts/)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

**Install dependencies first: `npm ci`** (never `npm install` — it can rewrite
the lockfile). A fresh clone has no `node_modules`, and every session on a
remote/cloud runner starts from one. **`npm test` does not report that
honestly:** instead of "cannot find module" it prints `# tests 785 / # pass 780
/ # fail 5`, which reads like a code regression. A file that cannot load never
runs its tests, so the count silently drops from **828** to 785.
`npm run build` in the same state fails with `sh: 1: vite: not found`.
**If the test count isn't 828, run `npm ci` before debugging anything.**

The pair was re-measured 2026-09-19 (MCP phase 1b) by renaming `node_modules`
aside, and it had drifted seven times before that: 178/130, 177/115, 219/136,
242/136, 275/152, 284/161, 357/323.

**The number of failing files changed for the first time — 7 → 4** — and that
is a real result, not drift. It had been the one constant across every
re-measurement. The MCP prerequisite work moved `getTeamName` and
`MIN_SPARKLINE_POINTS` out of hooks (see The MCP Server), which un-tainted
`tradeAnalysis.js`, `recommendations.js` and `edgeBriefing.js` — so
`tradeAnalysis.test.mjs`, `tradeContext.test.mjs`, `tradeTargets.test.mjs` and
`recommendations.test.mjs` now run without `node_modules`. The remaining four
are the ones that load a **hook** directly, which no refactor to `src/utils`
can fix: `draftLive`, `matchupWeeks`, `sleeperDraft`, `transactions`.

Note the two counts do **not** always move together: tests added to one of
those four raise only the first number. The 2026-09-07 trade-engine work added
6 tests to `tradeAnalysis.test.mjs` and moved the full count 258 → 275 while
the broken-state count stayed at 152; the 2026-09-12 news-retention work moved
both, because `newsRetention.test.mjs` imports only a zero-dependency pure
module. **Re-measure both whenever the suite grows.**

OPEN-3, the FAAB bid recommender (2026-10-07), moved both by the same 20
(808/765 → **828/785**), the gap holding at 43: `faabBid.test.mjs` (+17)
imports only `src/utils` and the shared fixture, and the three new
`mcpRecommendFreeAgents` tests reach neither React nor `zod`.

The round-label one-home fix (2026-10-07, CODE-REVIEW-1 #7) moved both by the
same 3 (878/835 → **881/838**), the gap holding at 43: the new cases sit in
`pickCapital.test.mjs`, which imports only pure utils and `node:fs`.

The unknown-FAAB-budget fix (2026-10-07, CODE-REVIEW-1 #11) moved both by the
same 1 (877/834 → **878/835**), the gap holding at 43: the old "falls back to
100" test was rewritten to the owner's new rule and `faabDisplay` gained one.

The hindsight-even one-home fix (2026-10-07, CODE-REVIEW-1 #5) moved both by
the same 5 (872/829 → **877/834**), the gap holding at 43: `fairBand.test.mjs`
imports only the pure `fairBand.js`.

The history-walk one-home fix (2026-10-07, CODE-REVIEW-1 #3) moved both by the
same 10 (862/819 → **872/829**), the gap holding at 43: `leagueHistory.test.mjs`
(8) and two `mcpHistory` cases import only pure utils and `mcp/history.js`.

The Trajectory one-rule fix (2026-10-07, CODE-REVIEW-1 #4) moved both by the
same 3 (859/816 → **862/819**), the gap holding at 43: the new cases sit in
`dynastyTrajectory.test.mjs`, which imports only pure utils and `node:fs`.

The buyer/seller one-home fix (2026-10-07, CODE-REVIEW-1 #2) moved both by the
same 3 (856/813 → **859/816**), the gap holding at 43:
`deadlineThresholds.test.mjs` imports only the pure `playoffOdds.js`.

The injury-status one-home fix (2026-10-07, CODE-REVIEW-1 #1) moved both by
the same 15 (841/798 → **856/813**), the gap holding at 43: the new
`injuryStatus.test.mjs` imports only pure utils, and the three new
`mcpAnalyzeTrade` cases ride a file that already loads without `node_modules`.

The market-trend one-home refactor (2026-10-07) moved both by the same 7
(828/785 → **835/792**), the gap holding at 43: `marketTrend.test.mjs` imports
only the zero-dependency `src/utils/marketTrend.js` plus `node:fs`.

The consensus-archive backfill (2026-10-07) moved both by the same 6
(835/792 → **841/798**), the gap holding at 43: the new
`valuationSources.test.mjs` cases import only `scripts/valuationSources.mjs`.

The MCP-CARRY closeout (2026-09-25) moved both by the same 25
(783/740 → **808/765**), the gap holding at 43, across four commits: ROOKIE-1's
`rookieAdp.test.mjs` (+4), `get_value_history` and the extracted sparkline
rule (`valueHistory.test.mjs` +5, `mcpValueHistory.test.mjs` +9, the transport
parity test's count moved rather than added), and the `Retry-After` limiter
(+7, in `mcpLimit.test.mjs`). The equality is the check that matters for the
last one: those tests import `fetchJSON.js` and `limit.js` and nothing else, so
a limiter that had reached the SDK would have shown up as a gap.

`get_league_results` and the bracket reader (2026-09-22) moved both by the
same 10 (773/730 → **783/740**), the gap holding at 43 —
`src/utils/leagueResults.js` imports only `teamName.js`, and the tool suite
reaches neither React nor `zod`.

`scout_managers` and the wide history walk (2026-09-22) moved both by the
same 12 (761/718 → **773/730**), the gap holding at 43 — `managerAnalysis.js`
gained `tradeTimeTotals` and stayed React-free, which is what lets the hook and
the tool share it.

`research_rookies` and prerequisite E (2026-09-22) moved both by the same
14 (747/704 → **761/718**), the gap holding at 43: the new suite imports the
tool, `mcp/feeds.js`, `mcp/store.js` and `src/utils`, and none of them reaches
React or pulls `zod` down out of `mcp/server.js`.

The news depth metric (2026-09-22, NEWS-4) moved both by the same 5
(742/699 → **747/704**), the gap holding at 43: `newsCoverage.test.mjs`
imports one zero-dependency script module and nothing else.

`find_trade_targets`, SMALL-1 and the pick-identity fix (2026-09-22) moved
both by the same 23 (719/676 → **742/699**), the gap holding at 43 — and here
that equality is the
check that matters: `mcpFindTradeTargets.test.mjs` drives a tool, so it would
have shown up as a gap had the tool reached `zod` out of `mcp/server.js` or
pulled React in through a util. It imports `mcp/tools/findTradeTargets.js` and
the shared fixture, and nothing else.

OPEN-10 — holding the suggested package inside `buildFairBand` (2026-09-21) —
moved both by the same 5 (714/671 → **719/676**), the gap holding at 43:
`tradeAnalysis.test.mjs` has been loadable without `node_modules` since the MCP
prerequisite work un-tainted it, and the five new tests import only `src/utils`.

The source-health alarm (2026-09-21) moved both by the same 16
(698/655 → **714/671**), the gap holding at 43 — `sourceHealth.mjs` imports
nothing at all, which is what a policy module shared by two pipelines should
look like.

Phase 4a — the three-source valuation archive (2026-09-21) — moved both by the
same 19 (679/636 → **698/655**), the gap holding at 43. That equality is the
check that matters for this change specifically: `valuationSources.mjs` imports
`fantasyCalcValues.mjs` and nothing else, so a reader that had reached into
`src/` for a util — the easy mistake when three sources want the same
normalization — would show up here as a gap between the two deltas.

The snapshot-pipeline fix (2026-09-21) moved both by the same 10
(669/626 → **679/636**), the gap holding at 43 — `fantasyCalcValues.test.mjs`
imports one zero-dependency script module and nothing else, which is the check
that the extraction did not accidentally reach into `src/`.

Phase 2c — game locks, live scores and the news layer — moved both by the same
30 (639/596 → **669/626**), the gap holding at 43. That equality is the check
that matters here: it proves `mcp/news.js`, `mcp/liveScores.js` and
`mcp/tools/playerNews.js` reach neither React nor `zod`, which a tool reading a
new feed could easily have done.

The FAAB normalization (2026-09-20) moved both by the same 9 (630/587 →
**639/596**), the gap holding at 43 — `managerAnalysis.test.mjs` imports one
`src/utils` module and nothing else, so its seven new FAAB tests run with no
`node_modules` at all.

Phase 2b — `partnerActivity` and `myDraftGrade`, the last two unwired signals —
moved both by the same 41 (589/546 → **630/587**), the gap holding at 43: the
two new data layers and the `buildDraftGrades` equivalence tests all load with
no `node_modules` at all, which is the check that would have caught either
reaching React or pulling `zod` down out of `mcp/server.js`.

Phase 2a — `get_playoff_odds` plus the Layer 3 wiring — moved both by the same
46 (543/500 → **589/546**). 589 and 546 were measured; **500 is derived**, not
run — the 5 commits-after-phase-2 tests went into `mcpOauth.test.mjs`, which
loads dependency-free, so `main`'s broken count was its 543 less the same 43.
Note the starting point: `main` was at **543**, not
the 538 recorded below, because the dynamic-client-registration commit added 5
tests after phase 2's PR merged and this block was not updated with it. **The
drift is the lesson, not the numbers** — a stale count here reads as a code
regression to the next session, which is the exact confusion the block exists
to prevent, so re-measure rather than incrementing what is written.

The useful invariant survived the drift and is worth preferring to either
count: **the gap between them is 43 and has not moved.** 828 − 785 = 43,
808 − 765 = 43,
783 − 740 = 43,
773 − 730 = 43,
761 − 718 = 43,
747 − 704 = 43,
742 − 699 = 43,
719 − 676 = 43, 714 − 671 = 43, 698 − 655 = 43,
679 − 636 = 43, 669 − 626 = 43, 639 − 596 = 43,
630 − 587 = 43, 589 − 546 = 43, and 538 − 495 = 43 before that. That is the number of tests living in the five files
that cannot load, so an unchanged gap means every test added since loads with
no `node_modules` at all — which is what the equal-delta checks below were
reaching for, stated as one number instead of a subtraction per change.

Phase 2's OAuth layer moved both by the same 25 (513/470 → **538/495**) —
the equality check passing again, and here it proves something specific:
`mcp/oauth.js` and `mcp/oauthRoutes.js` reach nothing outside Node's
builtins, so every one of their 25 tests loads with no `node_modules` at all.
That is the measurement behind the decision not to use `jose` (see the auth
section): the vanilla version is not merely dependency-free on paper, it is
dependency-free under test.

**The failing-file count changed for the second time ever, 4 → 5, and the
fifth is a different KIND.** `tests/mcpHttp.test.mjs` imports
`@modelcontextprotocol/sdk` to exercise the HTTP transport, so it cannot load
without `node_modules` — that is a legitimate runtime dependency, not the
React taint the other four carry, and no refactor of `src/utils` will fix it.
Note the deltas therefore do NOT match here (full +10, broken +1): a file that
fails to load contributes one failed entry and zero passing tests, which is
why `# pass` held at 465. **An uneven delta is only acceptable when you can
say which file caused it and why** — an unexplained one means a test reached
something it should not have.

Phase 2's cache work moved both by the same 14 (489/455 → **503/469**), the
same equality check applied again: `mcpStore.test.mjs` imports one
zero-dependency module, so a store that had reached React — or pulled `zod`
down out of `mcp/server.js` — would have shown up as a gap between the two
deltas. Phase 1b moved both by the same 132 (357/323 → **489/455**), and that
equality is itself a check worth keeping: it means all six new test files —
five tool suites plus `mcpWeekly` — load with no `node_modules` at all. A tool
that had reached React, or pulled `zod` down out of `mcp/server.js`, would
have shown up as a gap between the two deltas.

**Tests:** `npm test` runs the `tests/` suite — plain `.mjs` scripts on Node's
built-in `node:test` runner with `node:assert/strict`, zero new dependencies
(the sanctioned no-deps pattern). One committed fixture,
`tests/fixtures/draft-2025.json`, holds this league's real 2025 rookie draft;
truncating its pick list to the first N picks synthesizes every intermediate
draft state, so the live path is tested against genuine payload shapes rather
than invented ones. The script registers the module-resolver hook
at `.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs` so
`src/utils`' extensionless imports load under plain Node. Scope is the **pure
analytical utils** plus the **module-level fetch loaders**
(`matchupWeeks.test.mjs`, `transactions.test.mjs` run against a mocked
`globalThis.fetch` — React components and hook *rendering* stay out, they
need the browser); every assertion cites the documented behavior it pins, so a
failing test is either a code regression or doc drift, never a mystery. The
suite runs on synthetic fixtures — it proves the logic is deterministic and
threshold-correct, not that the models are well-calibrated (that bar is
real-data verification).

**Live-surface rehearsals:** `scripts/dev/replay-live.mjs` drives the real
running app in headless Chromium while overlaying a synthetic world on a few
endpoints, so the two once-a-year surfaces can be exercised before they happen:

```bash
npm run dev &
node scripts/dev/replay-live.mjs --scenario draft            # pre → clock → mid → complete
node scripts/dev/replay-live.mjs --scenario week1            # Week 1, offseason gates open
node scripts/dev/replay-live.mjs --scenario week1 --week 6   # mid-season (real matchup quality)
```

It reuses `screenshot-app.mjs`'s request-interception approach (see the
`dynastyedge-visual-capture` skill for the three sandbox gotchas), fakes only
the draft/state/matchup endpoints, and leaves everything else on the live API.
Screenshots land in `.screenshots/replay-<scenario>/`. It complements the
`tests/` suite rather than replacing it: the tests pin the pure logic, this
proves the components actually render it.

**NEITHER LINT NOR BUILD CAN CATCH AN UNDEFINED COMPONENT.** `no-undef` is on
(via `js.configs.recommended`), but eslint-scope does not resolve a
**`JSXIdentifier`** as a variable reference — that is what `react/jsx-no-undef`
exists for, and this repo does not carry eslint-plugin-react. Vite does not
catch it either: a bad element type is a *runtime* `Element type is invalid`,
thrown during render. So `<Foo />` with no `Foo` in scope passes lint, passes
`npm run build`, and white-screens the view — and with no error boundary, the
whole app tree with it.

**The only proof is rendering every route.** This is not hypothetical: step 4's
lucide removal emptied `LeagueActivity`'s `TYPE_META` of its `Icon` field and
left the `<meta.Icon />` render behind, and **League › Activity shipped to
`main` as a white screen** — found in step 5 by a route sweep, after lint, 284
tests and a clean build had all passed on it. Sweep with
`scripts/dev/screenshot-app.mjs`, hash-navigating each route and failing on
`pageerror`; a crash kills the tree, so **run the suspect route FIRST or reload
between routes** — otherwise every route after the first failure reports an
empty page and no error of its own, which reads like a different bug.

**`<lowercase.Uppercase />` is the lucide removal's residue, and there were
FOUR of them, not one.** Step 5 fixed `LeagueActivity` and stopped there. The
2026-09-13 cleanup swept for the *shape* —
`grep -rnoE '<[a-z][A-Za-z0-9]*\.[A-Z][A-Za-z0-9]*' src --include=*.jsx` — and
found three more, all in Trade: `badge.Icon` (`TradePartnerFinder`),
`chip.Icon` (`TradeAnalyzer`) and `vs.Icon` (`TheCall`). Every one of their maps
had had its `Icon` field deleted with a comment explaining that the word carries
the verdict; only the render call was left behind. **`TradePartnerFinder`'s
crashed unconditionally, so `/trade` — Trade › Partners, the section's landing
screen — was a white screen on `main` for a day.** Run that grep whenever a
prop is removed from a lookup map: it costs nothing and it finds the whole
family, where a route sweep only finds the ones a given data state reaches.

**A ROUTE SWEEP WHOSE DATA NEVER LOADS IS NOT A ROUTE SWEEP — this is why step
5's sweep missed three of the four.** With the APIs unreachable, a view
short-circuits to `ErrorState` long before it renders the component that
crashes, and the sweep records a confident OK. Measured on the same commit: the
first pass of the 2026-09-13 sweep had a broken curl header parse (with `-L`,
curl emits one header block PER HOP, so the redirect's headers land at the head
of the body and every JSON parse dies on `"HTTP/2 200"`), and it passed
**21 of 22 routes** — `/trade` included. With the parse fixed and real data
flowing, `/trade` threw on the first render. **Assert the data actually
arrived** (a route's rendered text length is a cheap proxy) before believing a
green sweep.

**Lint:** `npm run lint` runs ESLint 9 (flat config, `eslint.config.js`) over
`src/`, `scripts/` and `mcp/` — `@eslint/js` recommended rules plus
`react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`, all at error
severity so CI actually fails. `eslint` + `eslint-plugin-react-hooks` are the
two owner-sanctioned lint devDependencies (the config imports `@eslint/js`,
which ships as a direct dependency of `eslint` — nothing else was added; the
browser/node globals are hand-written literals in the config for the same
reason). Core ESLint's scope analysis doesn't count JSX references, so
`no-unused-vars` runs with `varsIgnorePattern`/`argsIgnorePattern` `^[A-Z_]`
(the Vite React template's convention) — capitalized component identifiers are
exempt; lowercase unused variables still fail. CI runs lint + test + build on
every branch push and PR (`ci.yml`), and the same gate runs in `deploy.yml`
before the build step, so a broken push to `main` fails before anything
publishes. Both workflows run Node 22 — the test script's
`node --test 'tests/*.test.mjs'` glob needs Node ≥ 21, so never pin these two
workflows back to Node 20 (the news/values pipelines, which run no tests,
still use 20).

**Action runtimes are a separate axis from `node-version`.** `node-version`
picks the Node that runs *our* scripts; the `uses:` tag picks the Node the
*action itself* runs on. GitHub deprecated the Node 20 action runtime, so every
workflow pins `actions/checkout@v5` + `actions/setup-node@v5` and `deploy.yml`
uses `actions/deploy-pages@v5` — all four declare `using: node24`. Don't
downgrade them to v4 (that's the deprecation warning coming back).
`actions/configure-pages` is knowingly left at **v4**: its v5 is *also* node20,
so bumping it fixes nothing. `actions/upload-pages-artifact@v3` is a composite
action and has no Node runtime at all. Re-check both when GitHub ships a node24
`configure-pages`.

-----


