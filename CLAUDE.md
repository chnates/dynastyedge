# CLAUDE.md — DynastyEdge

> This file is the single source of truth for the DynastyEdge app.
> Read it entirely at the start of every session before writing any code.
> Every feature, data source, design decision, and rule is documented here.
> The dated evidence behind them — measurements, superseded rulings, incident
> narratives — lives in `docs/history/`, one file per section (CLEANUP-2).

-----

## What This App Is

**DynastyEdge** is a personal dynasty fantasy football web app built for one user
(chnates / Nix Cage) playing in a 10-team Superflex Half PPR dynasty league on Sleeper.
It layers two free public APIs — Sleeper and FantasyCalc — into intelligence the
Sleeper app lacks: dynasty values on live rosters, trade partners, lineup
optimization, and the league-wide competitive picture.

**Target device:** iPhone Safari (390px width — iPhone 15 Pro)
**Hosting:** GitHub Pages (static site — the APP has no backend)
**Live URL:** <https://chnates.github.io/dynastyedge/>

> **"No backend" means the APP has no backend** (amended 2026-09-19). The repo
> also holds **`mcp/`**, a Model Context Protocol server (a real server process)
> for asking the same questions from the Claude apps. The web app is still a
> pure static site: it calls no server of ours, the MCP server is not in its
> bundle, and **nothing in `src/` imports from `mcp/`** — the dependency runs one
> way. The constraint chain (one user, $0, zero ops → static hosting → free
> unauthenticated APIs + GitHub Actions as the "server") still governs every
> decision inside `src/`: **a feature may not grow a backend.** See **The MCP
> Server**. (History: `docs/history/overview.md`.)

-----

## Tech Stack

|Layer     |Tool            |Notes                              |
|----------|----------------|-----------------------------------|
|Framework |React (via Vite)|Functional components + hooks only |
|Styling   |Tailwind CSS    |Dark mode default, mobile-first    |
|Navigation|React Router v7 (HashRouter)|Bottom tab bar + per-section contents rails (see Navigation)|
|Build tool|Vite            |Outputs to `dist/` for GitHub Pages|
|Deployment|GitHub Pages    |Auto-deploys via GitHub Actions    |
|CI/CD     |GitHub Actions  |Every push to `main`: lint + test, then deploy|
|MCP server|`@modelcontextprotocol/sdk` (Node)|`mcp/`, stdio + HTTP — **not** part of the web bundle|

### Non-negotiable rules

- Always use **functional React components with hooks**. Never class components.
- All API calls live in **custom hooks** (`/src/hooks/`) or utility files. Never call APIs directly inside a component render.
- **Mobile-first always.** Every component must look correct at 390px before anything else.
- **FantasyCalc data is fetched once per app load and cached in memory.** Never re-fetch on every render — it is a large response. The app silently refetches when the tab regains focus with data older than 30 minutes (stale-while-revalidate: cached data stays on screen during the refresh).
- **All fetches go through `src/utils/fetchJSON.js`** — it adds a hard timeout via AbortController so a hung API can never leave the app on a permanent spinner. Never call raw `fetch()` in a hook.
- **Sleeper's full player DB (`/players/nfl`, ~5–8MB) is fetched at most once per session** via the shared `usePlayerDB` hook. Never fetch it anywhere else — rookie detection, injury statuses, unranked-player names, and lineup history all read from that one cache.
- **Never hardcode player names, values, or roster data.** Everything comes live from APIs.
- **Dark mode is the default.** The app ships in dark mode. A toggle is available to switch to light mode — store the preference in `localStorage`.

-----

## League Context

|Setting              |Value                                          |
|---------------------|-----------------------------------------------|
|Platform             |Sleeper                                        |
|League ID            |`1313933520715907072`                          |
|Format               |10-team Dynasty                                |
|Scoring              |Half PPR (0.5 per reception)                   |
|QB format            |Superflex (QB eligible in flex)                |
|Passing TDs          |4 pts                                          |
|Rushing/Receiving TDs|6 pts                                          |
|Trade deadline       |Week 13                                        |
|Trade review         |None — executes immediately                    |
|FAAB budget          |**$1000 for 2026** — was $100 in 2023–25 (see below)|
|Playoff teams        |6, starting Week 15                            |
|My team name         |Nix Cage                                       |
|My Sleeper username  |chnates                                        |
|My roster ID         |**6** — original-owner reference only (see below)|
|My owner ID          |965787707299430400                             |

**FAAB — read the budget from `league.settings.waiver_budget`, never assume
100.** It went $100 → $1000 for 2026, so any cross-season bid comparison
normalizes to **percent of budget** (`docs/analysis/faab-bid-corpus-2026-08.md`).

**It also RESETS TWICE a league year** (offseason, then the regular season;
offseason money unspent is lost — owner, 2026-09-20). Two consequences that are
easy to get backwards:

- **`roster.settings.waiver_budget_used` tracks only the CURRENT period**, so
  `leagueState.js`'s `faabRemaining` / `faabSpent` are correct as written and
  must **never** be "reconciled" against a transaction-log total.
- **A season's transaction log routinely exceeds one budget** (it spans both
  periods; none has ever exceeded two). Anything that caps a season at one
  budget discards real spend.

A *single bid* needs no period split (`bid ÷ waiver_budget` is exact either
side of the reset). A *total* is a **count of budgets committed**, never a
percent of an allocation.

**Identity is runtime state, not a constant.** The signed-in roster comes from
`useIdentity` (Feature 18); every "is this me?" check reads `myRosterId` from
`LeagueContext` / `useIdentity`. `MY_ROSTER_ID` is only the original-owner
reference.

### Roster slots

QB · RB · RB · WR · WR · TE · FLEX × 3 (RB/WR/TE) · Superflex (QB/WR/RB/TE) · DEF
**13 bench** · 5 taxi · 2 IR — **24 active slots** in total.

**Read the cap from `leagueInfo.roster_positions`, never from prose** (this
line was wrong once). Taxi and IR sit *outside* the 24.

**Taxi rules (Sleeper settings):** only rookies can be *added*, but taxi
duration is **2 years** — a player may stay through their rookie and 2nd-year
seasons. Players entering their 3rd NFL season (`years_exp >= 2`) must be
activated before the regular season starts. Taxi action items flag
`years_exp >= 2`, never 2nd-year players.

**No kicker in this league.**

**Exactly one defense is ever rostered** (owner doctrine, 2026-09-04): one DEF
slot, one starts, and a defense carries no dynasty value (FantasyCalc ranks
zero), so a second is a wasted bench spot. The app must **never suggest adding
a defense as a pickup**: defenses appear only against the DEF slot (the
Optimizer's waiver drawer) or the DEF filter (League › Free Agents) — never in
a general free-agent pool, never in `recommendFreeAgents`, never with
dynasty-asset framing (no opportunity grade, no value card, no trade CTA). The
one question there is "is there a reason to replace the one I have?" — almost
always no (Feature 4's free-agent layer).

3 FLEX spots means starting 5–6 RBs/WRs is common, so RB/WR depth is
disproportionately valuable. Superflex makes elite QBs the most valuable
dynasty asset despite 4-pt passing TDs. (History: `docs/history/league-context.md`.)

-----

## Data Sources

> History (probe logs, cadence measurements, coverage tallies, the NEWS-1/4/7
> narratives): `docs/history/data-sources.md`.

### Sleeper API

**Base URL:** `https://api.sleeper.app/v1`
No authentication required. Read-only. Stay under 1,000 API calls per minute.

|Data needed                    |Endpoint                                         |
|-------------------------------|-------------------------------------------------|
|League settings (FAAB budget, trade deadline)|`/league/1313933520715907072`      |
|All rosters + player IDs + records|`/league/1313933520715907072/rosters`         |
|All users + team names         |`/league/1313933520715907072/users`              |
|Traded picks                   |`/league/1313933520715907072/traded_picks`       |
|Matchups (week N)              |`/league/1313933520715907072/matchups/{week}`    |
|Transactions (week N)          |`/league/1313933520715907072/transactions/{week}`|
|NFL state (current week/season)|`/state/nfl`                                     |
|Full player DB (names/positions/injuries)|`/players/nfl` (once per session, via `usePlayerDB`)|
|Weekly projections             |`/projections/nfl/regular/{year}/{week}`         |
|Weekly stats                   |`/stats/nfl/regular/{year}/{week}`               |
|Season stats (player intel)    |`/stats/nfl/regular/{year}` (lazy, once per session)|
|NFL schedule                   |`/schedule/nfl/regular/{year}` — **NOT under `/v1`** (see below)|
|League drafts (rookie draft sync)|`/league/1313933520715907072/drafts`           |
|Live draft picks / in-draft pick trades|`/draft/{draft_id}/picks` · `/draft/{draft_id}/traded_picks`|
|Playoff bracket (**MCP server only** — `get_league_results`)|`/league/{id}/winners_bracket` — champion = `w` of the `p: 1` game; see Tool 12|
|League history (manager scouting)|`/league/{id}` → `previous_league_id` chain, then per past season: users · rosters · transactions · drafts + picks (lazy, once per session, via `useLeagueHistory`)|

**Critical Sleeper note:** Roster endpoints return **numeric player IDs only** —
not names. Names resolve by matching Sleeper IDs against FantasyCalc's
`sleeperId` field — the bridge between the two APIs. Always join on `sleeperId`
(normalized to strings). Players FantasyCalc doesn't rank fall back to the
shared player DB for name/position and display `—` as their value.

**Critical schedule note — THREE fields, and all three have bitten.** The
payload is `{ status, date, home, week, game_id, away }`.
- **`status` says whether a game has kicked off** (`pre_game` → `in_game` →
  `complete`). Sleeper **locks a lineup slot at kickoff**; ignoring this field
  had the Optimizer offering moves that could not be made (Feature 4's game
  locks, `utils/projections.js`'s `parseLockedTeams`).
- **The schedule is the ONE Sleeper endpoint NOT under `/v1`** —
  `/v1/schedule/...` 404s for every season. Use `SLEEPER_ROOT`
  (`https://api.sleeper.app`).
- **Fields are `home` / `away`**, not `home_team` / `away_team`.
Both of the last two fail *silently* — the wrong path or field names yield "no
games", killing bye detection and opponent lookup.

**Critical stats note:** `/stats/nfl/regular/{year}/{week}` entries carry **no
`pos` / `opp` / `tm`** (null on every entry, 2022–2026). Position, team or
opponent must join to the shared player DB (`usePlayerDB` keeps `position` +
`team`) and to the schedule. The stats payload supplies points and nothing else.

**`TEAM_*` trap — two kinds of team key, and only one is an asset.** Stats
payloads carry **`ARI`** (the **team defense**, a real asset, ≈ −4…20 pts)
*and* **`TEAM_ARI`** (**team offense totals**, ≈ 110–120 pts). Both are
non-numeric, so **any `!isNumeric(id)` test meaning "this is a defense"
silently sweeps in a 110-point row.** `computeDefenseRankings` is safe only *by
accident* (`TEAM_ARI` is absent from the player DB). **Anything new touching
defenses must exclude the `TEAM_` prefix explicitly** (`utils/freeAgents.js`
exports `isTeamTotalsKey`). The one legitimate read of a `TEAM_*` row is as a
**denominator** (`usePlayerIntel`'s target/rush share).

**Standings note:** records and points for/against come from `roster.settings`
(`wins`, `losses`, `ties`, `fpts`, `fpts_against`) — no extra call.

**Transactions note:** all 18 weekly buckets in parallel, cached per session. A failed bucket contributes nothing (per-week catch), but when **all
18** fail the load rejects, so League › Activity shows `ErrorState` + retry
rather than an empty feed masquerading as "no moves". Waiver claims carry the
winning bid in `settings.waiver_bid`.

**Offseason detection:** call `/state/nfl` on load. If `season_type !==
'regular'`, hide all in-season UI (current matchups, weekly projections,
lineup optimizer flags). Everything else works fully in the offseason.

**Player intelligence (`usePlayerIntel`)** — the PlayerProfileDrawer and the
trade Live Intelligence cards:

- **Production:** Sleeper season stats (half-PPR points, games, positional
  finish ranked client-side); in-season also the last 3 weekly buckets.
  Offseason shows the last completed season.
- **Depth room:** `depth_chart_position`, `depth_chart_order`, `news_updated`
  and `espn_id` are kept in the trimmed `usePlayerDB` cache. `buildDepthRoom`
  ranks his NFL position room by depth order (card hidden when Sleeper has no
  order); every row carries **that teammate's dynasty value** from the cached
  `playerMap` — zero extra fetch, unranked shows `—` (rule 7).
- **Usage — DISPLAY ONLY:** snap share, target share and (RBs) rush share over
  the **`TEAM_{team}`** totals, plus red-zone targets, on a "Usage · {year}
  season" card that always names its year (falls back one season at Week 1).
  **This must never feed a projection, a score, or a recommendation ranking**
  (owner call 2026-09-04: usage gains 0.026 MAE with unstable coefficients —
  `docs/analysis/optimizer-data-sources-2026-09.md` §5). Sleeper already prices
  usage in; the value here is description.
- **Peak window:** `utils/peakWindows.js` (shared with Roster Analysis).
- **Unranked players get no fabricated grade.** The opportunity grade (A–D) and
  Dynasty Outlook derive from a FantasyCalc positional rank, so they render
  only when one exists — never a `?? 99` fallthrough to "D — Deep Stash".
- **A defense gets no dynasty framing at all** — no Dynasty Value card, no
  Analyze Trade CTA. What remains: status, production, which defense it would
  replace.
- All fetches lazy (first profile open) and session-cached — nothing at load.

-----

### Player news pipeline (GitHub Actions + multi-source aggregation)

News sources block browser/CORS access, so news is aggregated **server-side in
GitHub Actions** and served as a static file — keeping the app backend-free.

- `.github/workflows/news.yml` **asks** to run twice an hour (cron
  `17,47 * * * *`, plus `workflow_dispatch`). `scripts/fetch-news.mjs` pulls
  **ten** sources, merges them into the **previously published feed**, resolves
  each item to the players it names, ranks player news above general, and
  **force-pushes a single-commit `news-data` branch** with `news.json`. Items
  carry `headline`, `story` (≤600 chars), `published`, `source`, `link`
  (validated http(s) or null), `athleteIds`, `playerIds`, `isPlayerNews`.
- **ONLY `main` PUBLISHES — a dispatch from any other branch is a DRY RUN.**
  All three pipelines' publish steps carry
  `if: github.ref_name == github.event.repository.default_branch`; the script
  and its coverage log still run. (A branch dispatch had twice published
  unreviewed code to the live feed before the guard.) **To verify a pipeline
  change:** dry-run from the branch and read the log; after merge, dispatch on
  `main` and read the *published* file.
- **THE CRON IS A REQUEST, NOT A SCHEDULE.** GitHub delivers **~5.5–7.4
  runs/day** (3.3–4.4h mean gap, 6.0h worst observed — measured 2026-09-21 and
  09-25), not 48, and does not make up skipped runs. **Anything that matters to
  freshness must be measured from run timestamps, never read off the cron**;
  treat cadence as a range, not a constant, and never re-derive a number from a
  single window. Tightening the cron is not a fix.
- **Sources, in priority order** (each probed before adoption —
  `docs/analysis/news-sources-2026-09.md`): ESPN news API (the only one shipping
  `athleteIds`), **RotoWire's news page**, RotoWire RSS, Yardbarker, PFF, The
  Athletic, PFT, CBS, Sporting News, Yahoo.
  - **RotoWire is scraped from `rotowire.com/football/news.php`**, not its RSS
    (hard-capped at 5 items; every param ignored). The page carries 25 updates
    as `Player: Note` headlines. Markup is fragile, so it sits in the same
    best-effort `try`.
  - **ESPN RSS is gone (NEWS-7):** GitHub's runners get **HTTP 202 with an
    empty body** — `res.ok`, so nothing threw. **An RSS source that 2xx-parses
    to nothing now logs status, final URL, content-type, size and first
    bytes.** The ESPN news *API* is unaffected.
  - **FantasyPros is gone** — all three endpoints dead.
  - **ESPN's per-team RSS is a trap** — every `/rss/nfl/team/news/_/name/{team}`
    (and `/rss/nfl/injuries`) is the same national all-sports feed. Never adopt.
- **The feed ACCUMULATES.** Each run merges into the last run's output,
  retaining **player items 7 days (1200 max, ~3 per player)** and **general
  items 48 hours (80 max)**. The previous `news.json` is read off `news-data`
  **via git, not the raw CDN** (which caches ~5 min and would hand a run its own
  grandparent); a branch that exists but won't yield the file **fails the job
  before publish**, so the window is never force-pushed away.
- **Eviction is DIVERSITY-AWARE — the cap must never bind before the time
  window does.** Newest-first, an item is admitted while **any** player it
  names is still under `PER_PLAYER_MAX` (3); an item with no Sleeper id rides
  on recency. The policy is pure in `scripts/newsRetention.mjs`, pinned by
  `tests/newsRetention.test.mjs` — **do not inline it into the fetch script, and
  do not "simplify" it to a `slice`.** (Recency-only eviction once collapsed the
  window from 159h to 27.5h with the cap pinned — see history.)
  **`PER_PLAYER_MAX` is a SOFT quota, deliberately:** quota is charged to every
  player an item names, so a roundup carrying one rare player is admitted and
  bills the stars too. A hard ceiling would drop the rare player the rule
  protects. **Do not "fix" the overflow.**
  **The cap is 1200 (raised from 400 on 2026-09-22, NEWS-4).** Until
  `depthHours` reaches ~168h, "7 days" is the policy's ceiling, not a measured
  depth. If the cap pins again below 168h, correct this line to the measured
  depth rather than raising the cap again on the same argument.
- **Watch `depthHours`, never `playerItems`** (a feed pinned at its cap looks
  exactly like a healthy full one) — nor `spanHours` (max − min, set by a few
  stragglers).
- **Size the feed by WIRE bytes, not raw.** `raw.githubusercontent.com` gzips
  it (~112 B/item); the 1200+80 cap projects to **~144KB on the wire**.
- **Per-source density numbers go stale — re-measure against the live feed
  before acting on one.** Yahoo, measured at 8% in the preseason, is the largest
  contributor of player items and of players no other source covers. A
  high-volume general source **cannot** crowd out player news (independent
  caps).
- **Later copies win on content, but the FIRST publish time recorded stands** —
  retained items are seeded before the current pull and sources run
  most-precise-first.
- The app fetches `NEWS_FEED_URL` (`raw.githubusercontent.com/.../news-data/news.json`,
  CORS `*`) once per session in `usePlayerIntel`.
- **Player matching — `playerIds` is the join, not `athleteIds`.** The feed
  resolves every item server-side (ESPN athlete id first, then normalized full
  name across headline **and** story) and stamps Sleeper ids. All three client
  matchers (`matchFeedItems`, `useLeagueNews`, `useNewsFeed`) read `playerIds`,
  then `athleteIds`, then the headline name. **Why:** `espn_id` is null for
  most of a dynasty roster. Multi-player articles surface on every player they
  name, by design; the article sheet flags it (reading whichever of the two id
  arrays is longer).
- **`coverage` block** next to `updatedAt`: `{ total, playerItems, playerCap,
  distinctPlayers, withPlayerIds, withAthleteIds, spanHours, depthHours,
  sources, sourceMisses }`. **`sourceMisses` counts CONSECUTIVE empty runs per
  source** (carried in the feed, which has no history of its own — see the
  source-health alarm). **`depthHours`** (`scripts/newsCoverage.mjs`, pinned by
  `tests/newsCoverage.test.mjs`) is the **p90 age of the player items from the
  newest one**. `node scripts/dev/news-coverage.mjs` reports it plus how many
  of the owner's rostered players resolve — the pipeline's acceptance metric.
  **The drawer's News row reads it** (NEWS-2): *"5d deep · 119 players"*, amber
  under `NEWS_SPAN_THIN_HOURS` (48), `depthHours` falling back to `spanHours`
  only for an older feed. It shows **depth, never item count**; a feed with no
  `coverage` renders a shorter line or none, never an error.
- **News items are tappable everywhere** (profile drawer "Latest News", The
  Edge "Headlines") → `NewsArticleSheet` (z-60, above the profile drawer): full
  stored story, "Read full article" when a link exists, a multi-player note,
  and (from The Edge) "View profile". Full articles are never embedded —
  sources block cross-origin framing.
- With no feed items for a player, the client falls back to ESPN's unofficial
  per-player endpoints — CORS-blocked in practice; they cost nothing and
  degrade silently.
- **News must never block a panel, show an error, or retry-loop** — on any
  failure the section hides. With every source and the player DB unreachable
  the script republishes the retained window; with no previous feed either, it
  exits 1 without writing.
- Coverage is volume-limited, not matching-limited (every player the matcher
  can find already resolves). **Re-measure after accumulation before adding
  sources.**
- **GitHub disables cron workflows after ~60 days without repo activity**; the
  data-branch force-pushes do NOT reset that clock. `values-history.yml`'s
  keepalive step protects every pipeline, and the drawer's feed-age line
  surfaces a dead feed.

-----

### The source-health alarm (both multi-source pipelines)

Per-source best effort is the right contract (one dead source must never cost
the others), but it had become **"fails invisibly"**: ESPN RSS and, before it,
FantasyPros each contributed 0 for months with nothing saying so. Twice is a
pattern, so it gets an instrument (NEWS-6).

- **`scripts/sourceHealth.mjs`** is the policy — pure, shared by both
  pipelines, pinned by `tests/sourceHealth.test.mjs`. **Do not inline it into a
  fetch script.**
- **`scripts/check-source-health.mjs`** runs **after the publish step** and
  **fails the workflow** when a source has gone dark — failing is what turns
  GitHub's notification into the warning, and running after publish means
  **the alarm can never cost data.**
- **ALARM ON A PERSISTENT GAP, NEVER ON A SINGLE MISS.** An alarm that cries at
  CDN hiccups gets ignored. Pinned both ways: a 3-day gap fires, a 1-day blip
  does not.
- **Thresholds are sized off MEASURED cadence, never the cron** (`DARK_AFTER`):
  the archive alarms after **3** consecutive daily runs, the news feed after
  **12** (~1.6–2.2 days at the delivered rate). Both mean "a day or more of
  total silence". **12 was deliberately not retuned** when cadence fell;
  revisit only if delivered cadence settles below ~4/day.
- **The archive diagnoses itself** — `values-consensus.json`'s per-source
  `coverage[]` already records a missed read as a null column; the news feed
  has no history, so its counter rides in `coverage.sourceMisses`.
- **A MISSING FILE IS ITSELF AN ALARM** — every snapshot step is
  `continue-on-error`, so a script that died outright leaves the run green.
- **A fresh archive never alarms** — the check needs a full window of history.
- The message names the source, how long it has been silent, the likeliest
  cause, and that **a genuinely dead source should be removed** — an alarm
  nobody can clear stops meaning anything.

-----

### Value history pipeline (GitHub Actions + daily snapshots)

FantasyCalc exposes only a `trend30Day` scalar, so per-player history is
accumulated by a daily snapshot, same architecture as news:

- `.github/workflows/values-history.yml` runs daily (cron `41 9 * * *`, plus
  `workflow_dispatch`). `scripts/snapshot-values.mjs` appends today's column
  and force-pushes a single-commit `values-history` branch with
  `values-history.json`. It starts a fresh history **only** when the existing
  file 404s; any other load failure aborts non-zero so a transient error can't
  force-push a one-day file over the rolling window. **Only `main` publishes.**
  The publish step recovers missing output **via git from the existing branch**
  (not the raw CDN) and hard-fails rather than push without a file it can't
  recover. The workflow runs under a `concurrency` group (news.yml and
  deploy.yml too) so overlapping runs can't race force-pushes.
- **Columnar format:** `{ updatedAt, dates: ['YYYY-MM-DD', …], players: {
  sleeperId: [v|null, …] } }`, arrays aligned to `dates`. Rolling 90 days, top
  500 by current value (tracked players keep their row until all-null). One
  column per UTC day; same-day re-runs replace it.
- The app fetches `VALUES_HISTORY_URL` lazily, once per session, via
  `useValueHistory`. `getSeries(sleeperId)` (a thin call to `getValueSeries` in
  `src/utils/valueHistory.js`, which the MCP server reads too) returns the
  non-null points, or `null` under `MIN_SPARKLINE_POINTS` (4) — fewer reads as a
  broken graph. The Edge's team-value line (`buildTeamValueSeries`) uses the
  same threshold.
- **Strictly best-effort:** missing branch / bad shape / fetch failure ⇒
  sparklines hide. **Never show an error or a loading state for history.**
- `Sparkline` (shared) — green when net-up, red when net-down, muted when flat.
- **`scripts/snapshot-trade-values.mjs`** (`continue-on-error`) archives asset
  values for trades completed in the last 8 days into `trade-values.json` —
  permanent, read lazily by `useTradeTimeValues` for Feature 11's "at trade
  time" line. On script failure the publish step carries the previous archive
  forward via git, and aborts rather than erase it.
  **A pick it cannot price archives as `null`, never 0** — the archive is
  permanent and trade-time prices cannot be recomputed. Pricing walks the app's
  ladder (season round median → generic round median → null). The script
  **self-heals** any stored pick value of exactly 0 to null (FantasyCalc never
  prices a pick at 0, so a 0 is the old classifier's output) through the normal
  publish path.
- **`scripts/snapshot-values-archive.mjs`** (`continue-on-error`) keeps a
  **permanent MONTHLY archive** (`values-archive.json`): one column per UTC
  month, top 500, never pruned by time (rows age out after `INACTIVE_MONTHS =
  24` all-null). It exists to back-test the multi-season trajectory model.
  **The app never fetches it.** Same carry-forward publish contract.
  (`docs/analysis/trajectory-calibration-2026-07.md`.)
- **`scripts/snapshot-consensus.mjs`** (`continue-on-error`) — **phase 4a**, the
  three-source valuation archive. **FantasyCalc**, **DynastyProcess**
  (`value_2qb` = Superflex) and **KeepTradeCut**, joined to Sleeper ids, one
  **daily** column in `values-consensus.json`, permanent:
  `{ updatedAt, dates, sources: { <key>: { asOf[], coverage[], players: { sleeperId: [v|null, …] } } } }`.
  **The app never fetches it.** It ships before any UI because a day not
  archived cannot be recovered.
  - **The join is ID-BASED END TO END, never by name**, through
    DynastyProcess's `files/db_playerids.csv` (see `dynastyedge-data-contracts`).
    Two silent traps: **`sleeper_id` is the literal string `"NA"`** on ~half its
    rows — `crosswalkCell` treats `"NA"` as null (this crosswalk's `'0'`
    sentinel, rule 8); and **KeepTradeCut joins on `mfl_id`, NOT `ktc_id`** —
    `ktc_id` maps Frank Gore Jr. onto Frank Gore **Sr.** `ktc_id` is a fallback
    only.
  - **KeepTradeCut is a PAGE, not an API**: read the typed JSON island
    `<script type="application/json" id="ktc-players">`; values from
    **`superflexValues.value`** — never the `tep`/`tepp`/`teppp` siblings
    (TE-premium, not this league). `position: 'RDP'` entries are picks.
  - **Best-effort PER SOURCE:** an unreadable source contributes an **all-null
    column** with `asOf: null` / `coverage: null`; the others publish. **Neither
    "not observed" nor "priced nobody" is ever written as a 0.** All three
    failing → exit 1, no file, yesterday carried forward. A 200 with the
    **wrong shape** also aborts — only a 404 starts fresh.
  - **Sized by wire bytes** (~43KB at 90 days, ~53KB at a year), which is what
    makes daily affordable. Each column stamps DynastyProcess's own
    `scrape_date`, because DP repeats.
  - **A DP null is not a value collapse** (PIPE-3): its weekly board depth
    swings ±30%, so **4b/4d must compare sources only over players every
    source priced that day.** No coverage-drop alarm, deliberately.
  - **It does NOT replace FantasyCalc and does NOT average the sources** —
    every model is calibrated on FantasyCalc's scale, and an average destroys
    the disagreement, which is the product. 4b/4c are not built.
- **Keepalive step** (first step, `continue-on-error`): GitHub disables
  scheduled workflows after ~60 days without default-branch commits, and
  data-branch force-pushes don't count. When `main`'s last commit is 45+ days
  old it pushes an empty bot commit to `main` (guarded to the `main` ref). A
  `GITHUB_TOKEN` push triggers no workflow, so no redeploy. This keeps every
  cron pipeline alive through the offseason.

-----

### Rookie intel pipeline (GitHub Actions + nflverse)

The two signals that predict a rookie season live in **nflverse** CSVs (CORS-
blocked, ~39MB), so they are aggregated in Actions and served as a static file:

- `.github/workflows/rookie-intel.yml` runs daily (cron `23 10 * * *`, plus
  `workflow_dispatch`; only `main` publishes). `scripts/snapshot-rookie-intel.mjs`
  reads `draft_picks.csv`, `roster_{season}.csv` (the **`sleeper_id`
  crosswalk**), `depth_charts_{season}.csv`, plus Sleeper `/state/nfl` and
  `/players/nfl`, and **force-pushes a single-commit `rookie-intel` branch**
  with `rookie-intel.json` (~52KB).
- **The messy join is resolved server-side**; the app receives Sleeper ids and
  never name-matches. `sleeper_id` is authoritative; names backfill
  (suffix-stripped, plus an unambiguous initial+surname key). **Every
  name-based match is position-guarded** — without it Jordan Love (QB) resolves
  onto Jeremiyah Love (RB), because the name index holds rookies only.
- Columnar: `{ updatedAt, season, asOf, dates, players: { sleeperId: { name,
  pos, team, round, pick, rank, slot, ranks, ahead, age, ht, wt, forty, vert,
  broad } } }`, `ranks` aligned to `dates`, **one column per ISO week**.
- **`ht`/`wt` and the combine drills are DISPLAY ONLY — never a score input.
  `age` at the draft is the one exception, and it is scored** (Feature 19's age
  tilt). `tests/rookieResearch.test.mjs` pins both halves. Measured nulls:
  `docs/analysis/rookie-longterm-signals-2026-09.md`.
  - The combine join is **ID-based end to end, never name-matched**
    (`pfr_player_id` → `combine.pfr_id`; `pfr_id` → `gsis_id` → crosswalk; and
    `pfr_id` → `espn_id` → Sleeper `espn_id` for undrafted invitees).
  - Both extra fetches are best-effort and can never abort the run. Coverage is
    partial and always will be; missing shows `—`, a rookie is never dropped.
- No keepalive step of its own (`values-history.yml`'s covers every workflow).
- Publish contract matches `values-history.yml` (recover via git, never push
  empty).
- The app reads it lazily via `useRookieIntel` (Draft › Research and the
  profile drawer — Feature 19) — **Class B / best-effort**: a missing branch or
  failed fetch shows Research's "hasn't published yet" explainer, never an
  `ErrorState`. It has published since 2026-08-14.

**Preseason stats are deliberately NOT in this pipeline.** Sleeper exposes them
(`/stats/nfl/pre/{year}/{week}`), but they predict a rookie season at **rho
−0.195** — the best rookies are protected in August
(`docs/analysis/rookie-research-signals-2026-08.md`).

-----

### FantasyCalc API

**Base URL:** `https://api.fantasycalc.com`
No authentication required. Fetch once per app load, cache in memory.

```
GET https://api.fantasycalc.com/values/current
  ?isDynasty=true
  &numQbs=2
  &numTeams=10
  &ppr=0.5
```

`numQbs=2` = Superflex. `ppr=0.5` = Half PPR. **These parameters must never change.**

|Field             |What it is                             |
|------------------|---------------------------------------|
|`player.name`     |Full player name                       |
|`player.position` |QB / RB / WR / TE                      |
|`player.maybeTeam`|NFL team abbreviation                  |
|`player.maybeAge` |Age as decimal (e.g. 24.3)             |
|`player.sleeperId`|**Sleeper player ID — the join key**   |
|`value`           |Dynasty trade value (0–10000 scale)    |
|`overallRank`     |Overall dynasty rank                   |
|`positionRank`    |Rank within position                   |
|`trend30Day`      |30-day value change (positive = rising)|

**Display rules:** whole numbers, no decimals. Trend arrow ↑ green if
`trend30Day > 50`, ↓ red if `< -50`, → grey between. **The ±50 and the
buy-low / sell-high eligibility rule live ONLY in `src/utils/marketTrend.js`**
(rule 11).

**Picks** come from FantasyCalc too — "2026 1st" (round-level) and "2026 Pick
1.09" (exact slot, once the order is set) — include them in the dataset.
**Classify player vs pick by id SHAPE, never by presence** (`useFantasyCalc`):
pick entries carry **synthetic non-numeric `sleeperId`s** (`FP_2026_1`,
`DP_0_8`); real players carry a **numeric** one. Numeric → `playerMap`;
non-numeric-or-absent → `pickEntries`. A presence test files every pick under a
key no roster references and prices every pick at 0 app-wide.
**The same rule binds the Actions pipelines**, which got it wrong for two months
longer (`snapshot-trade-values.mjs` archived every pick at 0 until 2026-09-21).
The classifier and pick pricer live once in **`scripts/fantasyCalcValues.mjs`**
(pure, pinned by `tests/fantasyCalcValues.test.mjs`) — **do not inline it back
into a fetch script.**

**Rookie ADP rule:** FantasyCalc has no rookie ADP field, and its `rookiesOnly`
endpoint returns non-rookies — **never use it**. "Rk ADP" is derived locally
(`utils/rookieAdp.js`): the Sleeper-verified rookie class re-ranked 1..N by
FantasyCalc overall rank; unranked rookies show `—` and sort last.
**The rookie→FantasyCalc join is by `sleeperId` ONLY — no name fallback**
(ROOKIE-1, 2026-09-25): a name hit could only land on an entry attached to a
*different* Sleeper player, and a position guard would not close the
same-name-same-position collisions. Draft Board, Tracker, Pick Trades,
Research and `research_rookies` all read this one join.

-----

## The MCP Server (`mcp/`)

**Purpose:** ask DynastyEdge questions in plain English from the Claude apps,
including mobile, answered from live Sleeper data and **this app's own analysis
code** — not general knowledge. Design spec and owner decisions:
`MCP_DISCOVERY.md`.

**Status: LIVE at `https://dynastyedge-mcp.vercel.app/mcp`, thirteen tools,**
over **both** transports (stdio locally, streamable HTTP for the Claude apps),
authenticated by GitHub against a single-account allowlist. **After any new
tool deploys, the owner re-checks the connector's tool list on the phone** —
no probe can reach what the client actually enumerates.

> History (phase chronology, every "measured live / verified end to end"
> paragraph, the connector-verification log): `docs/history/mcp-server.md`.

**Two tools are IN-SEASON ONLY**, and both say so rather than returning zeros:
`lineup_advice` entirely, and `recommend_free_agents`' projection column.

**It is a full citizen** (owner decision, `MCP_DISCOVERY.md` §1): `npm run lint`
covers `mcp/`, `npm test` covers its logic, and `ci.yml` / `deploy.yml` gate it
like `src/`.

**`@modelcontextprotocol/sdk` is OWNER-APPROVED (2026-09-19, PR #56)** — the
first new runtime dependency since `@dnd-kit`. **It is not precedent for the
next dependency, which needs its own approval** (change-control §2 rule 5). It
brings `zod`, used for tool input **and output** schemas — the first schema
validation in this repo. **It never reaches the web bundle.**

### Architecture — two layers, and the dependency runs one way

`mcp/` owns fetching, caching, rate discipline and tool schemas. It **imports**
`src/utils` and never copies it, so the app and the server can never disagree.
`src/` imports nothing from `mcp/`. **A tool is orchestration only** — assemble
arguments, call the utils, bound and stamp the result
(`TradeAnalyzer.jsx` is the model: eleven `useMemo`s, zero domain math). **Any
math a tool needs is written in `src/utils`, where the app gets it too.** The
file map is in File Structure (`mcp/`).

### The HTTP transport (phase 2) — stateless, by necessity

`mcp/http.js`'s `createMcpHandler()` returns a **Web-standard `(Request) =>
Promise<Response>`**, so the host stays a packaging decision. stdio and HTTP
expose the same tools, **pinned by name in a test** — a tool added to
`createServer` and not the transport fails the suite.

- **THE TRAP: a session held in RAM is what serverless cannot keep** — the
  failure is intermittent (warm passes, cold fails). The transport runs
  **stateless** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`),
  a fresh server per request; a test asserts no `mcp-session-id` is minted.
  **Anything remembered between requests must live where a second instance can
  see it** (the same reasoning as `store.js`).
- **The limiter is hoisted to module scope** — a per-request limiter would hand
  every concurrent request the full budget. `createServer` takes `fetcher` and
  `store` so a warm instance shares one of each.
- **The gate fails CLOSED:** a throwing authenticator is 500, never 200; falsy
  or `ok: false` is 401; **every POST is authenticated**. A 401 carries
  `WWW-Authenticate: Bearer resource_metadata="…"` (RFC 9728). `GET` is a
  liveness probe that **must leak no roster, player, value or league data**.

### The auth model (phase 2) — OAuth 2.1, and STATELESS

`mcp/oauth.js` (crypto + policy) and `mcp/oauthRoutes.js` (the endpoints) make
the server the OAuth **resource server** and its own **authorization server**,
with **GitHub as upstream identity**; `mcp/app.js` composes them. Claude's
custom-connector UI is OAuth-only — there is no static-token path.

1. **Dynamic client registration, without a registry.** Claude's connector
   registers itself — without `/register` it fails with "Couldn't start
   sign-in". **The `client_id` IS the registration:** `mintClientId` signs the
   redirect URIs into it, so any instance verifies it. **The origin allowlist
   binds at registration**, and a registered client is held to its exact URIs.
   The client is **public** (`token_endpoint_auth_methods_supported: ['none']`)
   — allowed because PKCE protects the exchange.
2. **Everything else is signed, not stored** — codes and access tokens are a
   payload plus an HMAC.

- **The signing key is DERIVED** (`hkdfSync` over `GITHUB_CLIENT_SECRET` with a
  distinct `info`); `DYNASTYEDGE_TOKEN_SECRET` overrides it.
- **No JWT library, deliberately** — `base64url(payload).base64url(hmac)`: no
  `alg` header, no algorithm confusion, and the auth tests run with no
  `node_modules`.
- **What signed-not-stored COSTS:** a token **cannot be revoked** before expiry
  (so access tokens live **1 hour**; revocation = rotating the GitHub secret);
  a code **cannot be marked used** (replay bounded by its **60-second** life).
  **PKCE therefore IS the defence**: `S256` required, **`plain` refused**.
  Acceptable for one user, not for a multi-tenant server.
- **Two discovery details fail silently:** the protected-resource `resource`
  MUST be the **canonical URI including `/mcp`**, and the document must be
  served at **`/.well-known/oauth-protected-resource/mcp`** as well as the bare
  path. The token audience accepts `${origin}/mcp` and the bare origin, nothing
  else.
- **THE LOAD-BEARING CHECK IS REDIRECT-URI VALIDATION:** an **origin
  allowlist** (`claude.ai`, `claude.com`, loopback) matched on **exact
  hostname** (`evil.claude.ai`, `claude.ai.evil.com` fail), checked **before
  anything is minted**, failing to an error page — **redirecting an unvalidated
  URI is the attack.** Later errors bounce an OAuth error to the vetted client.
- Pinned as attacks: a token for another audience is refused; **the allowlist
  is re-checked on every request**; the `kind` discriminator keeps the three
  token types apart.
- **GitHub is asked for NO scopes**; its token is read once for the login and
  discarded — never stored, returned or forwarded.
- **The server refuses to start without `GITHUB_CLIENT_SECRET`.**

### Deployment (phase 2) — LIVE at `dynastyedge-mcp.vercel.app`

Vercel project `dynastyedge-mcp` (team `dynastyedge`); `api/mcp.js` is the
function, `vercel.json` rewrites every path to it. The GitHub integration
deploys `main` automatically (connected 2026-09-20). **If it is ever
disconnected the failure is silent**; the tells: `main` has no Vercel commit
status, `github-pages` is the only deployment environment, a feature-branch
commit shows `target: production`. Fallback: a `gitSource` deployment.

**Three traps, each cost a deploy cycle:**
1. **Vercel detects functions from the SOURCE tree, not build output** — and a
   functionless deploy still reports `READY` / `LAMBDAS`. **Curl the route.**
2. **Vercel TRACES dependencies, it does not bundle** — Node's ESM resolver
   won't resolve `src/utils`' extensionless imports. So the esbuild bundle is
   **committed** (`scripts/build-mcp.mjs` → `api/mcp.js`) and **`ci.yml`
   rebuilds and diffs it on every push** — a stale bundle is drift.
3. **The host may call with EITHER convention** (Web `Request` or Node
   `req/res`); `vercelEntry.js` detects the shape with one property check.

- **Nothing reaches an opaque 500** — failures answer with a message, **never a
  stack** (Vercel's runtime logs 403 to the deploy tooling).
- **The Vercel integration builds every branch, including the data branches.**
  The fix is a **project-level Ignored Build Step** (dashboard setting — this
  paragraph is its only record):
  ```sh
  case "$VERCEL_GIT_COMMIT_REF" in news-data|values-history|rookie-intel) exit 0 ;; *) exit 1 ;; esac
  ```
  **Not `vercel.json`'s `git.deploymentEnabled`** — Vercel reads that file from
  the pushed branch, and the data branches carry only JSON. If data-branch
  builds reappear, this setting was lost.
- **Deployment protection does NOT cover the production alias**, so **the
  OAuth gate is the only lock** — any change to it is a change to the only lock.

Run locally with `npm run mcp`; the **`--import ./mcp/register.mjs` hook is
mandatory** (extensionless imports). The hook is a deliberate copy of the test
suite's — a runnable server must not depend on `.claude/skills/`.

### The three non-negotiables for every tool

Each answers a risk in `MCP_DISCOVERY.md` §7; enforced in `mcp/snapshot.js`,
pinned by tests.

1. **Every response carries an as-of timestamp.** Nothing in this codebase
   validates an external payload, so a shape change becomes a *confident,
   fluent, wrong answer* through an LLM. Provenance makes it **look** wrong: a
   per-source `fetchedAt` / `ageSeconds` / `stale` / `error`, counts, and
   explicit `unranked` / `isOffseason` flags. **`asOf.oldestSourceAt` is the
   STALEST source**, never the newest.
2. **Bounded output.** Never return a raw payload: cap every list, report the
   true count beside the capped one, disclose truncation in `notes`.
3. **`leagueId` and `rosterId` are parameters, not constants** — defaulting to
   `DYNASTYEDGE_LEAGUE_ID` / `DYNASTYEDGE_ROSTER_ID`, then the constants.

### Caching and freshness

**~15-minute snapshot TTL** (`DYNASTYEDGE_SNAPSHOT_TTL_MS`) — one assembly per
conversation. **On an upstream failure, serve the cache and label its age**,
per source; a *cold* failure still throws (a real "I don't know"). **FantasyCalc
and the player DB are cached ACROSS leagues**; only league data keys by
`leagueId`. The player DB is best-effort (without it, unranked rostered players
are absent, with a note).

**The BACKEND is a parameter; the POLICY is shared (`mcp/store.js`).** Every
layer calls one `loadSource(store, key, ttlMs, load)`. stdio uses
`memoryStore()` — and **so does the deployed HTTP server: no KV is wired**
(`restKvStore` exists, is tested against a fake, and has never run live — see
MCP-CARRY).

- **Trap 1 — a store-level TTL would break provenance.** `loadSource` reads an
  **expired** entry on purpose (that is "serve stale and label it"); a native
  `EX` would turn a minute-16 outage into a cold throw. **Freshness is decided
  in `loadSource` from `fetchedAt`, never by the store**; `STORE_GC_SECONDS`
  (7 days) is eviction only. Pinned by test.
- **Trap 2 — compress the player DB going into KV** (gzip+base64 via
  `node:zlib`; the raw entry is ~2MB).
- **`fetchedAt` must round-trip byte-for-byte** — pinned by test.
- **A store failure degrades to "slower", never "broken"** — a failed read is a
  miss, a failed write is dropped; **the guard lives in `loadSource`**, not only
  in a well-behaved backend.

### Rate discipline lives in `mcp/`, never in `fetchJSON`

`fetchJSON` is a timeout and **nothing else**; changing it would change the
*app* to fix a *server* problem — **don't.** `mcp/limit.js` wraps it with a
**process-wide** concurrency gate (default 6) and bounded exponential backoff
with full jitter. **Retries only 408/425/429/5xx — a 404 is an answer.**
**`Retry-After` is honoured:** `fetchJSON` attaches `status` and the raw
`retryAfter` header to the Error it already threw (message byte-identical,
app-neutral). `limit.js` parses both RFC 9110 forms (junk falls back to the
schedule), **caps the wait at `MAX_RETRY_AFTER_MS` (4s)**, and still never
retries a 404. `get.stats().advised` counts advised retries.

### Tool 1 — `get_roster`

"What's on my team?" `team` (name, manager handle or roster id; default the
configured identity). Players with value, ranks, trend and **STARTER / BENCH /
TAXI / IR** slot; picks with exact slot labels; total, value rank, win-window
tier, record, FAAB. Caps 60 players / 40 picks.
- **It never guesses which team you meant** — ambiguous returns candidates and
  `ok: false`.
- **Handles match `display_name`** — Sleeper's `/users` returns **no
  `username`** (`resolveTeam` in `mcp/teams.js`, shared by three tools).
- **Rule 7:** unranked is `value: null` **and** `unranked: true`, never 0; no
  games played is `record: null`.
- **Taxi and IR are their own slots** (outside the 24). Picks report `pricing:
  'exact-slot' | 'round-median'`.

### Caching the weekly data — a DIFFERENT TTL, deliberately

`mcp/weekly.js`: projections + schedule, **60 minutes**
(`DYNASTYEDGE_WEEKLY_TTL_MS`). **League data changes on an EVENT; projections on
a DRIP** (0.06% per 10 hours). **`mergeAsOf` recomputes `oldestSourceAt` and
`stale` over the UNION** of sources — a tool that adds a source without
re-deriving them overstates its freshness. `refresh: true` forces a refetch
near kickoff.

### Tool 2 — `find_sell_high`

`edgeBriefing.computeEdgeSignals` + `recommendations.suggestSellMove`. **Names a
CONCRETE partner and a CONCRETE return**, not "shop him" (partners scored on
need, whether he'd start for them, and whether they own a comparable piece at
my deficit). Also returns the buy-low target and the underperforming opponent.
`watchlist` is passed empty (a browser concept). **"No sell-high right now" is
an ANSWER**, with the condition named. Copy states acceptance is **not
modelled**.

### Tool 3 — `recommend_free_agents`

`recommendFreeAgents` over `buildFreeAgentPool`.
- **A DEFENSE IS NEVER A GENERAL PICKUP, by construction** — the tool calls only
  the general pool and has **no `position: 'DEF'` escape hatch**. Asking for DEF
  returns the measured explanation **plus the incumbent and its projection**.
- **The projection never enters the ranking** (dynasty value ranks; projection
  rides beside it, r = 0.427). **Offseason: `projectedPoints: null` with a
  reason — never 0**; a failed fetch reports a different reason.
- **Every row carries `faabBid`** and the answer a `faab` block — orchestration
  only, `recommendFaabBid` with `readFaabPeriod`, so it quotes exactly the app's
  bid. No budget ⇒ `bid: null`, never an assumed scale. **Both fields are
  declared in the zod output schema** (the closed-object trap).

### Tool 4 — `resolve_assets`

*(support)* Free-text names → candidates. **Always called before
`analyze_trade`.**
- **An ambiguous name resolves to NOTHING** — `match` only on a unique hit;
  never the higher-valued of two ("Brown" returns six).
- **Resolves picks too**; a pick's id is **`season-round-originalOwner`**,
  byte-identical to `TradeAnalyzer.jsx`'s, so it round-trips.
- Rule 7: unranked stashes and defenses are findable with `value: null`. Free
  agents included, flagged `isFreeAgent`.

### Tool 5 — `analyze_trade`

`give[]` / `get[]` as **resolved ids only**, plus `partner`. Mirrors the
Analyzer: `analyzeTrade` → `getTradeVerdict` → `adjustVerdictForInjuries` →
`getCounterSuggestion` → `buildTradePitch`.
- **IDS ONLY, ENFORCED IN CODE.** A free-text name is **rejected with a pointer
  to `resolve_assets`, even when unambiguous** — the tool does no name matching,
  which makes grading the wrong player structurally impossible.
- **Price is read from the OWNING roster, never the caller**, and sides are
  checked (a player not on my roster cannot be on `give`).
- Returns verdict, value split, **both seats' appeal**, landing spots, fair
  band, counter, pitch.
- **`concerns` is a SUBSET of `reasons`** — a renderer must mark the overlap,
  not print both. **`fairBand`'s field is `inside`; `buildTradePitch` returns
  `{ text, lines, bullets }`.**
- **Layer 3 runs on LIVE ODDS in season, and `winWindow.basis` says which basis
  ran** (`'odds'` / `'tier'`) — see Layer 3 below.
- All eight optional `analyzeTrade` signals are wired; each fetched **only when
  it can matter**. A **one-sided** trade is valid: totals render, verdict `null`.

### Tool 6 — `lineup_advice`

`lineupMoves.buildLineupMoves`. Optional `week`, `team`.
- **IN-SEASON ONLY:** the offseason returns `ok: false`, `unavailable: true`,
  `reason: 'offseason'` — **no summary, no moves, no zeros.** A failed fetch is
  `reason: 'projections-unavailable'`.
- **The schedule traps** (off `/v1`, `home`/`away`) live in `weekly.js`, pinned
  by `tests/mcpWeekly.test.mjs`. **An empty `playingTeams` means "byes
  unknown", never "everyone on bye".**
- **A must-fix carries NO confidence** (`null`, passed through).
- **`confidencePct` is a PERCENTAGE (0–100) and the ONLY confidence field** —
  carrying two produced "6530% likely".
- **A blocked starter contributes 0**; `projected` and `effective` both shown.
- **Coin-flip moves are demoted, never dropped** (`meaningful: false`).
- **Game locks:** a sealed slot is never a move (Feature 4); locks come from the
  schedule, so a missing box score can never restore an impossible move.

### Tool 7 — `get_playoff_odds`

`playoffOdds.buildPlayoffOutlook` — the League › Playoffs Monte Carlo over
`mcp/season.js`.
- **THREE STATES, AND ONLY ONE HAS ODDS.** `active` is real; `complete` is
  deterministic 100%/0% and says so; **`preseason` returns `playoffPct: null`
  and a strength-ranked PREVIEW — never 0**, which reads as "eliminated".
- **A posted-but-unplayed schedule is `active`, not `preseason`** (Week 1 runs
  off the strength prior). Only no schedule at all is preseason.
- **A total matchup-fetch failure is NOT a preseason** → `ok: false`, `reason:
  'unavailable'`.
- **`seedDist` is computed and deliberately not returned** (notes say so).
- `getDeadlineVerdict` supplies the stance, so it **cannot disagree with
  `analyze_trade`**. Notes state **60% (6 of 10) is the coin-flip baseline**.

### Tool 8 — `get_player_news`

"What's the latest on Bowers?" / "Who on my team is hurt?" Sleeper injury fields
plus the news feed. It exists because the server once answered a bare
"Doubtful" while holding the injury detail and a fresh RotoWire item.
- **`injury_body_part`, `injury_notes`, `espn_id` are in the player-DB trim.**
- **A free-text name is allowed** but resolves through **`buildResolveAnswer`**
  — ambiguous returns candidates and refuses.
- **The join is `playerIds`, with NO headline-name fallback** — the pipeline
  already name-matched with the whole player DB; the live DB holds **two "DJ
  Moore"s** (`4961` CB, `4983` WR).
- **A roster sweep leads with the hurt players**, then recency; a player with no
  status and no items is omitted.
- **Silence is a gap in coverage, never good health.**
- **It rides along:** `lineup_advice` attaches injury detail + latest items to
  every **flagged** player (only those — bounded output); `get_roster` carries
  the detail plus one headline for any player with a status.

### Tool 9 — `find_trade_targets`

"Who should I call about, and what would it cost?" — the question before
`analyze_trade`. `getTopTradeTargets` + `suggestFairPackage`, the same two
functions Trade › Targets runs.
- Every row carries **both seats** and **`inFairBand`** — `false` means nothing
  you can spare reaches the band (an honest near-miss). **`alternative`'s
  premium is often the most actionable field**, a property of fair pricing; the
  notes say why most rows read Weak to the partner.
- **The position filter pushes INTO the ranking, never onto the returned rows**
  (filtering a pre-sliced list can return empty when the board is full).
  `position` is an additive `getTopTradeTargets` option; nothing in `src/`
  passes it.
- Never guesses `team`; scouting your own roster is refused.
- **A pick's id is READ OFF THE ASSET** (`season` / `round` / `originalOwner`),
  never recovered from its label — several picks can share a label. A pick
  missing the triple reports `id: null` (a guard, not the mechanism).
- **Bounded:** default 8, max 20 (the app board's depth), `counts.board`
  beside. Only returned rows are priced.
- **It does NOT grade** — hand the ids to `analyze_trade`.

### Tool 10 — `research_rookies`

`rookieResearch.buildRookieBoard` — the SAME board Draft › Research reads.
Optional `player`, `position`, `sort` (`fit` | `score` | `value`), `team`,
`limit`. (Prerequisite E moved the composition out of hooks into
`utils/rookieResearch.js` + `utils/rookieAdp.js`; equivalence proved on live
data; the hooks keep only the memo.)
- **ONE score** — `dynastyOpportunityScore` (with the age tilt); age and
  combine ride under `context` and never move it (test-pinned).
- **Rule 7 for a model:** no feed entry is `score: null` / `fit: null`, never 0;
  unpriced is `value: null` + `unranked`.
- **Class B, and never "no rookies":** an unreadable feed is `ok: true`,
  `available: false`, scores null, board in value order. Only a missing
  **player DB** refuses.
- Roster fit is read **for the requested team**. **The name search refuses
  rather than guesses**, over the rookie class itself.
- Adds `rookieIntel` to `asOf` (declared in the closed object).

### Caching the other static feeds — `mcp/feeds.js`

One Class B loader for `rookie-intel.json`, `trade-values.json` and
`values-history.json`: never throws; a miss is `available: false` with the
reason; **a 200 with the wrong shape is a miss and is never cached**. **60
minutes** (`DYNASTYEDGE_FEED_TTL_MS`) for the first two (both publish at most
daily); **six hours** (`DYNASTYEDGE_VALUE_HISTORY_TTL_MS`) for value history
(one column per UTC day; today's live endpoint comes from the snapshot, not the
feed).

### Tool 11 — `scout_managers`

`managerAnalysis.buildManagerProfiles` — the SAME function Trade › Managers
runs, on the WIDE history walk. Omit `team` for the league overview plus my
report card; pass `team` for one manager's ledger (default 10 / max 40, true
count beside).
- **"Never traded" vs "we could not read" is the contract.** The tool tracks
  `ledger.seasonsRead` / `seasonsMissing`: nothing read ⇒ every trade/FAAB field
  and `activity` are **null**, never 0 or "No trades yet"; a partial read says
  *"No trades in the N seasons we could read"* and drops *"You haven't completed
  a trade yet"*. A complete read of a quiet manager still says "No trades yet".
  Pinned both ways.
- **FAAB in BUDGETS, never dollars** — no `dollars` / `avgBid` / `valuePer100`
  field leaves the tool (test-pinned).
- **Rule 7 on a ledger:** a zero-value asset reports `value: null`.
- **`tradeTimeTotals`** (extracted to `utils/managerAnalysis.js`, shared with
  `useTradeTimeValues`): an archived **null** hides the whole "at trade time"
  line rather than under-count.
- Tendencies **describe**; acceptance modelling was tested and disconfirmed.
- Adds `tradeValues` to `asOf`. `transactions.js` stamps each transaction's
  **`week`** from its bucket.

### Tool 12 — `get_league_results`

"Who won our league in 2023?" `leagueResults.buildSeasonResult` + `countTitles`
(`src/utils/leagueResults.js`, pure) over `mcp/results.js`, reading
`/league/{id}/winners_bracket` — the one question `MCP_DISCOVERY.md` §5 called
unanswerable.
- **Shape (probed before any code):** `[{ m, r, t1, t2, w, l, p?, … }]`; **`p: 1`
  is the championship** (`w` champion, `l` runner-up). The bracket is read; the
  league's `latest_league_winner_roster_id` is only a cross-check
  (`metadataAgrees` — a disagreement is a note, never a silent pick).
- **Its own tool, for cost** — the NARROW walk plus a bracket and a users call
  per season; **no transaction bucket** (pinned).
- **Titles are credited by `owner_id`** (roster ids are season-scoped), so a
  title follows the manager across renames. Names fall back season user →
  current team name → `Roster N`, never undefined.
- **Three states that must not be confused:** a current bracket with every
  `w`/`l` null is **`in-progress`**, never "nobody won"; an unreadable one is
  **`unavailable`** (named, **not cached**, retried); a season with none is
  `no-bracket`.
- **Two TTLs:** a past bracket is frozen (history TTL, per-season key); the
  current one rides the snapshot's 15 minutes. Adds `brackets` to `asOf`.

### Tool 13 — `get_value_history`

"How has his value moved?" / "…my team's, and who drove it?" Reads
`values-history.json`, the fourth static feed. Optional `player`, `team`, `days`
(4–90), `limit`.
- **The rule is the app's, extracted rather than copied:** `getSeries` moved to
  `src/utils/valueHistory.js` as **`getValueSeries`** (the hook calls it), with
  `getDatedValueSeries`, `valueHistoryCoverage`, `sliceValueHistory`,
  `summarizeValueSeries`. The team line is The Edge's `buildTeamValueSeries`.
- **Its own tool** — folding it into `get_roster` would put an ~82KB fetch
  behind every roster question and blow its bounded answer.
- **"Not enough history yet" is an answer, never a flat line and never 0:**
  under `MIN_SPARKLINE_POINTS` (4), `series: null`, `summary: null`, the count
  and a sentence. **`not-enough-history` and `untracked` are distinct
  statuses** (the feed keeps the top 500 only).
- **The team line is TODAY'S roster valued back** (carry-forward, picks
  excluded), and the notes say so. Movers bounded (default 5, max 15 per
  direction), true totals in `counts`.
- Resolver discipline holds; a pick is refused. Adds `valueHistory` to `asOf`.

### The board's freshness — the one layer here with NO TTL of its own

`find_trade_targets` owns no fetch — its inputs are the stamped ~15-minute
snapshot — so a TTL of its own would only be **a second clock disagreeing with
the first**. A derived cache was rejected: `getSnapshot` builds a fresh object
every call, so identity-keyed caching never hits. Its ~730ms is **CPU, bounded
by how many targets are priced**, never by truncating the search inside one.

### Caching the news feed — and WHY A TOOL beats "let the model search"

`mcp/news.js`, **10 minutes** (`NEWS_STALE_MINUTES` governs the warning, not the
cache). The tool is the primary source because **the join is already done**
(the two DJ Moores), **it arrives unasked** inside other answers, and **every
item carries provenance**. **Where it loses:** the feed is hours stale in the
worst case (GitHub delivers ~5.5–7.4 runs/day), precisely when a late inactive
lands — so **`staleForKickoff` marks that condition and the tools print an
explicit instruction to confirm against a live source.** Filtered to a roster
the feed is ~2KB.

### Caching the live box score — a FIFTH TTL, and the only SHORT one

`mcp/liveScores.js`, **5 minutes** (`DYNASTYEDGE_LIVE_TTL_MS`) — a live score
changes every few plays and decides whether a slot is still a decision. **Not
reused from `season.js`**, whose TTL is long *because* the odds model discards a
partially-played week. **Strictly best-effort, asymmetric in the right
direction:** locks come from the schedule, so without live scores only the
banked figure degrades to a projection (with a note) — **a missing box score can
never restore an impossible move.**

### Caching the rest of the season — a THIRD TTL, and its own argument

`mcp/season.js`: every regular-season week's matchups (weeks 1 …
`playoff_week_start − 1`, **read from league settings, never assumed**), **60
minutes** (`DYNASTYEDGE_SEASON_TTL_MS`) — **its own constant, not an alias** of
weekly's. A completed week is frozen; the current week's scores are discarded by
`splitCompletedWeeks`, so **odds only move when a whole week lands.** Per-week
keys, so a failed week degrades alone (empty entries + a note); **all of them
failing must never be reported as a preseason.** The stamp is the **oldest**
week.

### Layer 3 now scores on LIVE ODDS in `analyze_trade`

`myPlayoffPct` is wired (phase 2a) and is the only signal that moves a
**score**. The tier is a ranking of accumulated assets and tracks the starting
lineup at Spearman 0.721; odds track it at **0.988**, and the tier has no
`Middle` branch.
- **`windowBasis` names which ran** (`'odds'` in season, `'tier'` offseason or
  when the schedule would not load), and the note says *which reason* — "nothing
  to simulate" and "could not find out" are different answers.
- **The season fetch is in-season only.**
- **A missing odds entry falls back to the tier; a genuine 0% scores** — the
  `?? null` guard matters (absent-as-0% would grade every trade as a fire sale).

### Caching the transaction feed — a FOURTH TTL, and it is SPLIT

`mcp/transactions.js`: **a settled week is FROZEN** (long TTL, eviction only);
**the live week rides the SNAPSHOT's 15 minutes** — its events are the ones that
make a roster wrong, and 60 would let this layer disagree with the snapshot. A
cached refresh costs **one** request. **It reads weeks 1..current only** — a
bucket past the current week is empty by construction (Sleeper buckets by
processed week). **An unknown week reads all 18** rather than guessing low.

### The league-history walk — DELIBERATELY narrower than the app's

`mcp/history.js`'s `getLeagueHistory` walks `previous_league_id` for the
rookie-draft record only: **leagues + rosters + drafts + picks, zero
transactions, zero users** (14 requests vs the app's ~169; both zeros asserted
in `tests/mcpHistory.test.mjs`).
- **Paired with `buildDraftGrades`, never `buildManagerProfiles`** — a profile on
  this walk would read "has never traded" when the truth is "we did not ask".
  **Do not quietly widen this walk**; a tool that needs the ledger widens it in
  the open (below).
- **The drafts LIST error is not swallowed; a per-draft picks error is.** A
  failed list returning `[]` would read as "never drafted" — an outage rendering
  as a fact about the owner. Learning nothing returns `available: false`.
- **`buildDraftGrades`** (`src/utils/managerAnalysis.js`) calls the **same**
  `buildDraftRecords` as the app; equivalence is test-proved.

### The WIDE walk — `getLedgerHistory`, widened in the open (2026-09-22)

`scout_managers`' walk is **its own exported function built on top of** the
narrow one, adding each past season's **users** and **transaction buckets**
(weeks 1..`last_scored_leg`, falling back to 18). The narrow walk is unchanged
and its zero assertions still hold. Each past season is frozen and cached **per
season**. **A season whose buckets all fail throws inside its load — nothing is
cached** (a cached empty ledger would read "never traded") — and is named in
`failedSeasons`; one failed bucket is disclosed as a partial season.

### The last two signals — context, wired without touching a score (phase 2b)

`myDraftGrade` and `partnerActivity` **never reach a verdict** — the rule is
*roster facts may score; second opinions describe.*
- **`partnerActivity`** (`mcp/transactions.js`) — a 21-day window; descriptive
  only (behaviour modelling was disconfirmed).
- **`myDraftGrade`** (`mcp/history.js` + `buildDraftGrades`) — adjusts
  **confidence** in acquired pick capital, never its value; gated at ≥ 5 graded
  picks; stated as a record, not a skill.
- **A failure of either says "we could not find out", never the absence
  itself** — "they made no moves" is a real answer about a quiet manager.
  Pinned both ways.

**THE ZOD OUTPUT SCHEMA IS CLOSED — every new `asOf` source must be declared.**
An undeclared source makes a real client reject the whole response ("must NOT
have additional properties") while lint, tests and build all pass, because the
tests call the builders directly. **Verify every new source over the real
transport.** Declared so far beyond the base three: `matchups`, `transactions`,
`history`, `liveScores`, `news`, `rookieIntel`, `tradeValues`, `brackets`,
`valueHistory`. A tool that adds no source is still verified over the
transport.

### Prerequisite refactors this shipped with

Each moved logic out of a hook so the server could reach it, and each
equivalence was **proved, not inspected** (old body lifted from git, run beside
the new function, `deepStrictEqual`):
- **`src/utils/teamName.js` + `src/utils/valueHistory.js`** — `getTeamName` and
  `MIN_SPARKLINE_POINTS` out of hooks, so no analysis util is React-tainted
  (re-exported from their old locations). **The right instrument is a resolver
  hook that throws on `react`** — a plain import check passes whenever
  `node_modules` exists.
- **`src/utils/leagueState.js` — `buildLeagueState`**, the five-source join;
  `useLeague` calls it and nothing else.
- **`src/utils/playoffOdds.js` — `splitCompletedWeeks` + `buildPlayoffOutlook`**;
  `usePlayoffOdds` keeps only the memo.
- **`buildFreeAgentPool` / `buildAvailableDefenses`** (`utils/freeAgents.js`):
  **the general pool cannot return a defense**; getting one requires calling
  `buildAvailableDefenses` by name.

### What the server can never do

**Sleeper's API is read-only.** The server can say what to start and what
sitting pat costs; it can never set a lineup, accept a trade or place a claim.
**Say so rather than implying otherwise.**

**Weekly tools are in-season only** — say so, never return zeros.

**The four static feeds are not parameterized** — published from *this* repo, so
a second league gets rosters, values, trades, lineups and odds but no news,
rookie research or trade archive (value history is league-agnostic per player).
**All four are read** (`news.json` via `mcp/news.js`; the other three via
`mcp/feeds.js`), and each degrades to `available: false` with a note — never an
error and never an empty result dressed up as "no news" / "no rookies" /
"never archived" / "value has not moved".

**"Who won our league in 2023?" is answerable — by the server, not the app.**
A champions screen would reuse `src/utils/leagueResults.js`.

-----

## Features

> History (dated rulings and their reversals, live-board measurements, sweep
> tables, the incidents behind each rule): `docs/history/features.md`.

-----

### Feature 1 — Roster + Picks Viewer

**Purpose:** view any team's full roster with dynasty values and all pick capital.

**My team (default on load):** roster grouped QB · RB · WR · TE · Bench · Taxi ·
IR; each player shows NFL team, value, overall and position rank, 30-day trend.
Picks below, grouped by year and coloured by round, with original owner when
different. Total roster value (players + picks) at top.

**Action Items** (`RosterActionItems`, shared with The Edge) under an **"Action
Items"** band — deliberately *not* "On your desk", which The Edge's GM line uses
for a different count. Each is a **`Lede`** with a real CTA. Four types, all
from live data:
1. **Taxi deadline** — a taxi player with `years_exp >= 2`.
2. **Bloated QB room** — 4+ QBs; names the most expendable and, via
   `suggestSellMove`, a concrete partner and return, deep-linking the Analyzer
   with `preloadTrade` filling both sides.
3. **IR slot opportunity** — an active player `Out` or `PUP` not yet on IR.
4. **Missing future 1st** — no 1st in a `pickYears` season after the current
   one; deep-links to Trade Partners.

**Types 1, 3 and 4 aggregate — one item per type, never one per player**; an
enumeration of identical `Lede`s is the slop pattern in editorial clothes. The
aggregated item names every player in its prose. Items are **dismissible**
(`dynastyedge_action_dismissals`) against a `conditionSnapshot`, so a dismissal
holds only while the condition is unchanged. **An aggregated item snapshots the
SET (sorted ids), not the count** — a swap that keeps the count must
re-surface.

**Roster Analysis** — a `NavRow` beside Dynasty Trajectory → `RosterAnalysisSheet`:
age chart with one lane per position shaded by its peak window (RB 23–26, WR
24–28, TE 25–29, QB 26–33), tappable dots, a position filter; stat cards (avg
starter age, league avg, core win window, direction); a per-position age table
and a "How to read this" explainer. LeagueContext only — no extra fetch.
**Win-window years derive from `nflState.season`, never hardcoded.**

**League-wide:** My Roster lives in **Squad**; the all-10-teams list lives in
**League › Overview** (Feature 5). **Free Agents** lives under **League**:
search, position filter, **Upgrades Only** and **Hide Rookies** toggles
(default off; rookie = `years_exp === 0` with the age ≤ 25 fallback). Above the
list, **Recommended Pickups** (top 4 from `recommendFreeAgents`) with
plain-English reasons; respects the position filter, hidden while searching.
- **Each Recommended Pickup carries a FAAB bid** (OPEN-3) — *"BID $110 · Value
  play · 11% of budget"* — from `utils/faabBid.js`, the same function
  `recommend_free_agents` quotes, read against the **current period's** budget.
  A caption states the calibration honestly, that the bid is sized by what the
  player does for this roster (not by who else bids), and the batch trap (order
  your claims). Only those four rows carry a bid.
- **Two axes, not one.** Dynasty value and this week's projection correlate at
  only r = 0.427, so each row carries **this week's Sleeper projection** beside
  the value, with a **Proj** sort (`useWeeklyProjections`, shared with the
  Optimizer — one fetch per session). **In-season only**; offseason hides the
  column and sort. A line states what a projection buys (0–2 → 0.9% chance of
  15+; 6–8 → 10.6%).
- **DEF is a separate pool behind its own chip — never mixed in** (one defense,
  ever). Defenses come from `usePlayerDB` (FantasyCalc ranks none) and never
  enter `recommendFreeAgents`. Under the DEF chip a `DefenseRosterNote` leads
  with the incumbent and its projection, says streaming measured worth nothing,
  and turns urgent only for **no defense rostered** or **mine on bye** (bye =
  no row in the projections payload — no schedule fetch). Upgrades Only, Hide
  Rookies, the sort toggle and the Value column hide there — a column no row
  can fill is noise.
- Tap a team → `/league/teams/:rosterId`; back returns with filters preserved.

**Sorting and filtering (league-wide):** default total value; toggle Overall
value / Pick capital / FAAB remaining; a position filter re-ranks teams by that
position's strength.

#### Pick capital rules

- **Show the live three-season window** — `pickYears` on `LeagueContext` (the
  upcoming rookie draft plus the next two). It rolls itself when a rookie draft
  completes. **Never hardcode a season list, and never take `PICK_YEARS` as the
  truth.**
- Fetch `/traded_picks`. **A pick NOT in it is still owned by its original
  team; a pick in it belongs to `owner_id`.**
- **Exact slot resolution:** `useSleeper` also fetches `/league/{id}/drafts`
  (best-effort; failure falls back to round medians). For the upcoming draft
  season `useLeague` resolves each pick's slot from `slot_to_roster_id`, else
  `draft_order` (set in `pre_draft`, so slots are known a month early), via
  `buildDraftSlots` + `slotForRound` (snake/linear). **A pick sits at its
  ORIGINAL owner's slot.** Enriched picks carry `slot` + `slotLabel` ("1.09")
  and are priced at the exact-slot value (`findExactSlotValue`), falling back
  to the round median. This flows to every roster-derived surface; League
  Activity and the Manager ledger price *historical* picks separately
  (Features 6 and 11).

-----

### Feature 2 — Trade Partner Finder

**Purpose:** answer **"who do I call?"** — not "what do I offer?" A filter bar
(**QB · RB · WR · TE · Picks**) re-ranks all teams by that need; default ranks
by overall fit.

**Per opponent:** positional strength (summed top players), my and their
surpluses/deficits vs league average, a **match score** (their surplus covers my
deficit and vice versa), a **pick capital score** (nearest draft 3×, next 2×,
third 1× — **weighted by distance from the upcoming draft, never by literal
year**), and the win-window tier.

**Win window tier:** score = total value × 0.5 + pick capital × 0.3 + youth
(inverted avg starter age) × 0.2. **Top 3 Contending, bottom 3 Rebuilding,
middle 4 Middle.**

**Each card (all 9 opponents):** 🎯 Priority / ✅ Good Fit / ⚪ Poor Fit; their
needs and surpluses; pick capital Rich / Neutral / Depleted; tier badge; a ⚠️
**win-window mismatch warning** (*"They're rebuilding — expect them to ask for
picks"*) — **shown, never hidden or deprioritized**; a buyer/seller read from
live playoff odds (< 35% "likely seller", ≥ 70% "buying win-now"; hidden
offseason); a trajectory read from `getTrajectoryRead` (Feature 17). **Tap →
Analyzer pre-loaded with this team.** A **"See their targets →"** footer button
— **a sibling *below* the card, never nested in its `<button>`** — opens Trade ›
Targets scoped to them.

-----
### Feature 3 — Trade Analyzer

**Purpose:** evaluate any trade with a verdict, then build or refine offers.

**Setup.** Nix Cage is always "Your team". The opponent comes from a dropdown
(`PartnerSelect` — grouped Priority / Good Fit / Poor Fit by
`rankTradePartners`, each with tier + record) or pre-loaded from Partners. A
`PartnerContextStrip` under it carries their needs/surpluses, pick capital,
tier and the mismatch warning. Two columns, **"You give"** / **"You get"**, each
with **+ Add** opening a roster-browser sheet.

**Building the trade.** **Players come from actual Sleeper rosters only; picks
from actual pick inventories only.** The add sheet has search, position chips,
a Draft Picks section, and live Give ⇄ Get totals + % diff; taps toggle and the
sheet stays open. A **sticky summary bar** pins below the rail. Every player
shows its trend. **The in-progress trade persists in sessionStorage
(`dynastyedge_trade_draft`); nav state (Partners / Targets / preloads) takes
priority over the draft.** "× Clear trade" resets it. **No saved history** —
that lives in Sleeper.

#### Analysis — three layers, always shown together

**Layer 1 — Raw value.** FantasyCalc totals. Show the % difference clearly
("You're getting 12% more value" / "You're overpaying by 8%").

**Layer 2 — Roster fit (post-trade lineup simulation).** `analyzeTrade`
re-simulates my optimal lineup by dynasty value (`buildValueLineup`, the shared
slot-fill in `utils/lineupBuild.js`, fed value instead of points, so it works
year-round) before and after:
- **A need is filled only by a player who would actually START post-trade** at
  a below-average position; a benched acquisition is depth (`benchNote`).
- **Giving a player hurts only when it drops that position below league
  average** (post-trade delta < 0 and worse than before).
- **Shipping a lineup regular that doesn't crater the position is a heads-up**
  (`starterLossNote`), not a hurt.
- **Depth context both ways** (`giveContext` / `getContext`): a mini depth chart
  per position dealt from (**Giving Up**, `OUT` amber) and acquired into
  (**Coming In**, `IN` green), marking starters (`ST`), taxi/IR excluded, ≤ 6
  rows, unranked `—`. **`getContext` reads the POST-trade roster on purpose**
  (so a WR-for-WR chart stays true). Picks are excluded. **Descriptive only —
  never a verdict input.**

**Layer 3 — Win window fit.** Buyer/Contending favours proven players;
Seller/Rebuilding favours picks and young players.
- **Live playoff odds decide the lean in season; the tier is the offseason
  fallback.** `analyzeTrade` exposes `windowBasis` (`'odds'` | `'tier'`) and the
  panel names it. Why: the tier ranks accumulated assets (tracks the starting
  lineup at 0.721) and has no `Middle` branch — a fixed bucket of four teams
  that got no read; odds track the lineup at 0.988.
- **`getDeadlineVerdict` is THE one definition of buyer/seller** (shared with
  Playoffs, Partners, The Edge), called **once** per analysis so the badge can
  never contradict the note. Thresholds ≥ 70% Buyer / < 35% Seller are
  unchanged; **60% is baseline here (6 of 10 make it)** — recalibrating is a
  separate, unmeasured change touching three surfaces.
- **Offseason / odds not loaded ⇒ `'tier'` and the exact tier behaviour** (copy
  names the basis, not a guessed reason).
- **Only Layer 3's score moved** — `assignWinWindowTiers` still backs its eight
  other consumers.
- **Partner trajectory line** (`opponentTrajectoryRead`): declining partner =
  buy window, ascending = caution; hidden for balanced.
- **My-side trajectory lens** (`curves`): selling a player projected to keep
  climbing is the sharpest flag (`myTrajectoryNote`); a note, never a rewrite of
  Layer 1.
- **Draft-grade confidence nudge** (`myDraftGrade`): when acquiring picks, my
  rookie **hit rate** (share of picks now ≥ 1000) adjusts *confidence*, never
  value — ≥ 70% "tended to pan out", ≤ 35% "value at market". **Gated at ≥ 5
  graded picks**; stated as a record. Best-effort.

**Layer 4 — Their side (would they even want this?).** Layer 2 run on the
partner's roster:
- **`startersDelta`** — the change in their best startable lineup, the honest
  measure of "does this help them" (a bench-stacker moves it by 0).
- **`fills`** (an arrival who'd start at their deficit), **`stacks`** (arriving
  where they're above average), **`weakens`** (the trade drops them below
  average — the same test Layer 2 applies to me).
- **`landingSpots`** (`{position}{rank} of {count}`, starts?, slot); the mirror
  `myLandingSpots` renders in Roster Fit. **`giveContext`** — their depth chart
  where I'm asking.
- **`appeal`** (Strong / Fair / Weak) from a signed score over those facts plus
  the pick lean.
- **A stack scores against the deal ONLY when he can't crack their lineup**;
  when he starts, `startersDelta` already measures it. **The same rule holds on
  the positive side: a fill earns its point only when the lineup delta did not
  already score it** — one event, never counted twice. Both sentences still
  render.
- **ONE engine, both seats (`buildSideFit`).** `buildPartnerFit` is the
  `seat: 'them'` wrapper (pinned deep-equal). `analyzeTrade` calls it again
  from my seat → **`myFit`** (`appeal`, `summary`, `reasons`, `concerns`,
  `startersDelta`, `lineupNote`). **`myFit` is DISPLAY ONLY — it never enters
  `baseTradeVerdict` or either gate** (my side is already scored by Layers 1–3
  and the `myStartersDelta` gate). **Copy is spelled out per seat
  (`SEAT_VOICE`)**, so the partner's sentences stay byte-identical (the gate and
  the pitch quote them). **My seat scores on the odds stance, theirs on the
  tier.**
- **Exported as `buildPartnerFit` and shared with the recommenders** —
  `suggestFairPackage` scores candidates with it, so a suggested package and
  the Analyzer's appeal cannot disagree. It is extracted (not reached through
  `analyzeTrade`) for speed; injected `leagueAverages` / `winWindowTiers` can
  never change the answer.
- **This is roster logic, never a prediction they will accept** — behavioural
  profiling was tested on the full corpus and **disconfirmed**
  (`docs/analysis/trade-structure-stability-2026-08.md`). The copy says so.

#### The pitch (`buildTradePitch`)

"Pitch It" card with Copy: the message stated entirely from **their** side —
what they get and give, value from their seat, where each piece lands in their
lineup, and why the piece you want is spareable (or, when `weakens` fires,
honestly that it isn't). **Every line is a number Layer 4 computed, so it can
never oversell.** Needs both sides; null otherwise.

#### The negotiating layer (five signals — none of them moves the verdict)

**Verdict provenance is raw value / lineup-sim fit / win window / partner
appeal** (owner call 2026-09-06). These five change understanding, not the
call; each degrades to `null` and hides.
- **Fair band** (`buildFairBand`, `utils/fairBand.js`) — the ±5% window of
  "you give" totals that lands the deal fair, drawn as a track in THE CALL;
  carries `gapToBand`.
- **Scarcity / value over replacement** (`utils/positionalValue.js`) —
  **replacement level is derived from the league, never hardcoded** (slot-fill
  over all rosters; the (S+1)-th best is replacement). **The flag speaks ONLY
  when the two scales disagree** (10 points or a different winner). FantasyCalc
  stays the headline.
- **Roster space** (`utils/rosterSpace.js`) — **never a legality check**;
  reports headroom and owed drops (over-cap after the draft is normal). Taxi/IR
  free nothing; every arrival costs a slot.
- **Weekly lineup impact** — both lineups re-solved on this week's projections
  (`weeklyProjections` cache). In-season only; labelled one week of context.
- **Partner recent moves** (`utils/partnerActivity.js`) — a 21-day window over
  the cached feed. Descriptive only.

#### Panel layout — THE CALL, then three acts

**The panel leads with its answer.** **THE CALL** (`components/trade/TheCall.jsx`)
— verdict + reasoning, fair band, counter with Apply, and three tappable rows
(`FOR YOU` · `FOR THEM` · `ROSTER`), both seats phrased alike
(*"{appeal} for you/them — …"*). Injury alerts directly beneath. Then **YOUR
SIDE** (`#act-yours` — "Is it good for you?", raw value + scarcity, roster fit
+ landing spots + weekly lineup, Coming In then Giving Up, roster space, win
window), **THEIR SIDE** (`#act-theirs`), **CLOSING IT** (`#act-closing` — pitch,
Live Intelligence). **Nothing collapses and nothing hides.** Anchors carry
`scroll-mt-28` to clear the fixed chrome.

#### Verdict

- **✅ Accept / ❌ Decline / 🔄 Counter** with one plain-English sentence. **When
  Layers 2–3 conflict with Layer 1, flag it explicitly** (*"✅ Accept — you're
  overpaying 8% on raw value, but this fills your WR2 gap…"*).
- **The verdict renders only once BOTH sides have an asset**; until then a quiet
  hint (totals still show).
- **TWO gates, and both only ever downgrade an Accept to a Counter:**
  - **My lineup (`myStartersDelta`)** — a drop clearing
    **`MY_LINEUP_MATERIAL_PCT` (1%) of my current starting lineup** ("…the
    position count balances, the players don't"). **Proportional, never
    absolute** (lineups span 27k–63k). **It gates; it does NOT feed
    `fitScore`** — a rebuild trade *should* lower today's lineup, and
    `fitScore < 0` is a hard Decline.
  - **Partner appeal** — a `Weak` deal turns a clean Accept into a Counter,
    quoting the objection.
  - **Neither ever upgrades** — their enthusiasm is evidence against, not for.
- **Counter names a specific player or pick, never vague**, moving the deal
  within ~5%. `getCounterSuggestion` returns `{side, type, item, text}` with an
  **Apply** button. **Assets already in the trade are never suggested.**

#### “What’s fair” (Targets sub-tab + scale icon)

Not a mode — a starting point that pre-fills the trade, from the **Targets**
sub-tab (targets ranked by need × value × movability → tap pre-fills You Get
and a fair package in You Give) or the **scale icon** on a row in the
their-roster add sheet. All layers apply to the suggestion; the callout is
dismissible.

##### The package search runs off the render path

Pricing every package is ~730ms, so it **must not run in a `useMemo`** (that
blocks the paint that would show loading). `WhatsFair` walks targets **one per
tick in an effect**: the board paints at once, each card says *"Working out what
it would cost…"*, a line counts down. **A team switch or refresh cancels the
walk in flight.** **If a deeper roster ever makes it bite, chunk WITHIN a
target — never truncate the search.**

##### Targets has two modes — league-wide and team-scoped

A team selector (`PartnerSelect`) sits above the position chips.
- **All teams (default)** — every opponent's players at my deficit positions,
  ranked `need × value × movability`, top 20.
- **One team** — `getTopTradeTargets`' `ownerRosterId` **scopes the ranking and
  keeps their non-deficit pieces** (ranked below, tagged `Depth`; need-matched
  tag `Your need`). **The filter must push INTO the ranking, never sit on top**
  of a pre-sliced list — and an explicitly chosen team never renders empty. A
  line states the split honestly. Scoping also renders the
  `PartnerContextStrip`; row 2 swaps owner ↔ need tag by mode.
- Selection persists in `dynastyedge_targets_team`; **nav state takes
  priority**; a stale or foreign roster id falls back to league-wide.

##### The board is two-sided too — movability, and a package they'd take

- **`getTopTradeTargets` ranks by `need × value × movability`.**
  `assetMovability` reads three roster facts about the holder (his depth rank,
  whether he starts for them, whether dealing him drops them below average).
  **It is a TILT, not a co-equal factor** — `MOVABILITY_RANGE` `[0.70, 1.35]`,
  so a player must be worth under half as much to lose on movability alone.
  **It multiplies, never gates** — nothing is hidden.
- **`suggestFairPackage` is two-phase.** Phase 1 enumerates every package in
  the **assembly window** (`PACKAGE_BAND`, `[0.9×, 1.15×]`) ranked by cost to
  **me** (surplus and depth first, **core starters never auto-included** —
  `PROTECT_THRESHOLD`, win-window lean). Phase 2 scores **every** candidate with
  **`buildPartnerFit`** and picks on **`APPEAL_BONUS[appeal] − my keep-pain`**.
  - **Phase 2 is deliberately NOT truncated** — phase 1 knows nothing about
    their side, so cutting it hides packages they'd want.
  - **Phase 2 reorders; it never widens the pool** (window and protect rule
    unchanged).
  - **`APPEAL_BONUS` = Weak −1 · Fair 0 · Strong +0.4**, asymmetric (Weak is a
    real failure, Strong is comfort), set **mid-plateau** from a sweep. These
    are **preference weights, not measured constants.** (Appeal-first
    lexicographic ranking was the 2026-09-06 owner call, reversed 2026-09-07 —
    see history; if revisited, answer the original objection.)
  - **THE SUGGESTION MUST LAND INSIDE `buildFairBand`; the assembly window only
    feeds `alternative`** (OPEN-10). **Ask `buildFairBand` — never re-derive the
    band from a 0.95/1.05 literal.** The overpay a partner would say yes to
    becomes `alternative`, carrying `premiumPct` (*"To get a yes: 2027 2nd +
    Jonathan Taylor (+7% over fair)"*). **`APPEAL_BONUS` and the assembly window
    are one measurement — if either changes, sweep them together.** When nothing
    reaches the band the search falls back to the window and returns
    `inFairBand: false`, and the card says so. `PACKAGE_BAND` and
    `requireFairBand` are sweep hooks; nothing in `src/` passes them
    (`docs/analysis/trade-fair-band-2026-09.md`).
  - **A suggested pick CARRIES ITS IDENTITY** (`season` + `round` +
    `originalOwner`); **every consumer matches on the triple, never on the
    label** — a roster can hold several picks under one label. A preload must
    resolve to exactly what the add sheet produces, **by identity**.
  - **A surviving `Weak` is information** (nothing you can spare interests them
    at this price) — the row stays.
  - Without a partner roster it degrades to phase 1 with `appeal: null`.
  - **The `rationale` is CHECKED against the lineup, never asserted.**
    `packageRationale` takes `buildValueLineup(myRoster.players).starterIds` and
    **names a starter being sent** instead of claiming "protects your starters".
  - **`alternative` points the OTHER way** — the higher-appeal package the
    search declined to pay for, drawn from the whole window; it never reorders.
    **`ALTERNATIVE_MIN_SAVING` (0.25) applies in EITHER currency** (keep-pain or
    value sent).
- **Each target is a ruled row, not a card** (law 5), under a neutral ink band;
  the name is body text, value a **`Magnitude`**, and the appeals labelled
  `YOU` / `THEM` lines. **Only `Strong` and `Weak` are `Mark`ed** (`Fair` is the
  null result). **Never brand red.** `myAppeal` / `mySummary` /
  `myStartersDelta` / `myConcern` are computed **once, for the winning package,
  after phase 2 chose it**, so they never reorder.
- **The five negotiating signals stay out of all of this.** *Roster facts may
  score; second opinions describe* — one rule for verdicts and rankings alike.

-----
### Feature 4 — Lineup Optimizer

**Purpose:** **"what should I change, and what does it cost me if I don't?"** —
a start/sit engine that solves the whole lineup, names the moves, and lets you
build the result. It is **Squad › Lineup** (`/my-team/lineup`; `/lineup`
redirects). **Hidden in the offseason** (`season_type !== 'regular'`): the tab
shows a placeholder (biggest need, rookie capital, win window).

**Data:** projections `/projections/nfl/regular/{year}/{week}`; injury status
from the player DB; byes **and game locks** from the schedule (off `/v1`,
`home`/`away`, **plus `status`**); points already scored from `players_points`
on the matchups `useSleeper` already fetches; matchup quality from weekly stats
joined to the player DB and schedule; dynasty value from FantasyCalc.
**Sleeper's projections carry no floor/ceiling — inventing a boom/bust read
would be fabrication.**

#### The engine (`utils/lineupMoves.js`, pure)

`buildLineupMoves` solves the **whole lineup at once** (`selectOptimalStarters`,
the shared slot-fill, fed weekly points) and **diffs** the optimal set against
the one you start; the difference is the move list. This replaced a per-slot
check that **double-counted gains** and **could not see cascading moves**. **The
per-move gains sum exactly to the headline** ("points sitting on your bench") —
pinned in `tests/lineupMoves.test.mjs` with both old bugs.

#### Game locks — the difference between "best lineup" and "best lineup you can still reach"

**Sleeper seals a slot at kickoff.** Ignoring that once told the owner to bench a
player whose game had finished, claimed he'd score 0 when he had banked −0.1,
and called the points recoverable.
- **`parseLockedTeams`** (`utils/projections.js`) reads `status`.
  `getAvailability` gains **`locked`, orthogonal to `blocked`**: `blocked` says
  "he will score 0, take him out"; `locked` says "you cannot take him out".
- **Locked starters are PINNED** (`selectOptimalStarters`' `pinned`) at their
  real score; **locked bench players leave the pool.** Neither produces a move.
- **The Σ-gains invariant survives** — a locked contribution cancels out.
- **A played game is FACT and outranks both the projection and the
  blocked-scores-0 rule** (`weeklyPlayerPoints` from `useLeague`, no extra
  request). **A locked player with no live score falls back to his projection,
  NEVER to 0.**
- **An empty locked set means "locks unknown", never "everything locked"**; an
  absent or unrecognised `status` does not lock.
- **The UI drops the swap handle on a locked row**, refuses to arm or target it,
  and **replaces the matchup pill with `FINAL` / `LOCKED`**. That also fixes a
  name wrapping to seven lines at 390px — **`--overflow` cannot see a wrap; look
  at the screenshot.**
- The moves card reads **"Nothing left to change · 6 slots locked · 9.2
  banked"**, never "Lineup is optimal", and labels the figure **Live total**
  once any slot is sealed.

**Two more contracts:**
- **A blocked player is dropped from the eligible pool outright**, never given a
  0 metric (a 0-metric player still gets *placed* when nothing else fits). An
  unfillable slot stays empty: "no eligible replacement on your bench".
- **A blocked starter contributes 0 to the current total** whatever Sleeper
  still projects.

**`getAvailability` is THE availability verdict** — `{ blocked, status, label,
short, locked }` from `(player, playerStatuses, playingTeams, lockedTeams)`;
omitting the fourth argument reproduces pre-lock behaviour. `label` is prose,
`short` is the row chip (a full-width badge squeezes the name). **The DEF slot
is part of the lineup** — an unset or bye DEF must be visible.

**Main view:** the **moves card** (red score-bug hero: points on the bench, `now
→ optimal`, must-fix / upgrades / coin-flips; green "optimal" state), then one
card per move (`SIT` / `START`, its gain, Must fix / Upgrade, a confidence line,
a plain reason). A pairing that isn't directly legal is labelled part of a
reshuffle.

#### Confidence — how much to believe the recommendation

`utils/lineupConfidence.js` ships the **measured** hit-rate curve (N = 666,026
FLEX-eligible pairs, 2022–25, monotone): *"61% likely to be the right call."*

|gap|right|
|---|---|
|0–1|52.0%|
|1–2|56.9%|
|2–3|61.2%|
|3–4|65.3%|
|4–5|69.4%|
|5–8|74.7%|
|8–12|82.5%|
|12+|87.2%|

- **Regenerate with `scripts/dev/optimizer-signal-backtest.mjs` §3 — never
  hand-edit the numbers.** One curve (QB and DEF track it within ~3 points); a
  cross-position slot-fill is *not* measured, and the file says so.
- **A must-fix carries NO confidence** — it scores 0 by rule, not projection.
- **Sub-1-point moves are demoted, never dropped**, into a collapsed "N swaps
  with no meaningful edge" group stating 52% — the headline must stay explained.
- Lineup + bench render through the shared `LineupRow`.

#### The sandbox — swapping

**Sleeper's API is read-only, so the lineup is a local scratchpad** seeded from
Sleeper's starters. Row body → `PlayerProfileDrawer`; the **⇄ handle** arms a
swap; while armed **the whole row is the target**, and only **legal** targets
highlight (starter↔starter needs both eligible for the other's slot). **Apply N
moves** / **Reset**; while edited a line says it is a local preview. An empty
slot has its own "Tap to fill". The armed banner offers **Waiver options** —
**the free-agent list is an explicit action, never the accident of tapping a
flagged player.** **Free agents are NOT folded into the optimal lineup** (owner
decision 2026-09-04) — you can't start a player you don't own.

#### Status flags — shown on every player

- 🔴 **Hard block:** Out, IR, Suspended, PUP, or bye — scores 0, excluded, always
  **Must fix**.
- 🟡 **Soft flag:** Questionable / Doubtful — startable, counted, surfaced.
- 🟢 **Confirmed:** healthy and optimal — a tick.

#### Free agent layer

The **Waiver options** drawer lists available players at the slot's positions
by projection, each showing **both** projection and dynasty value (prefer the
higher value on a tie). **The list is NEVER gated on FantasyCalc** — it once
emptied the DEF slot (FantasyCalc ranks zero defenses). Unranked players come
from `usePlayerDB` with `—`. Built by `utils/freeAgents.js`
(`buildWaiverOptions`, which carries the `TEAM_*` guard). **For the DEF slot the
drawer says it is for filling an empty slot or a bye, not a streaming edge** —
streaming measured **−0.00 pts/wk over 408 team-weeks**.

#### Matchup quality indicator

🟢 **Easy** — opponent ranks bottom third vs the position; 🔴 **Tough** — top
third; **the middle third shows nothing**. `computeDefenseRankings` uses the
previous week's **total** half-PPR points allowed per position (**totalled, not
averaged** — an average punishes facing a deep bench), joined through the player
DB and schedule. **Week 1 degrades honestly:** no prior week, so the pills
**hide** and a line says ratings start in Week 2. **The schedule and prior-week
stats are best-effort — either failing must never blank the Optimizer behind an
`ErrorState`.**

-----
### Feature 5 — League-Wide Overview

**Purpose:** the state-of-the-league dashboard, and **the single all-10-teams
list** (the old Roster › All Teams was fused in; `/roster/teams` redirects to
`/league`, drill-down at `/league/teams/:rosterId`).

- **Current matchups** — all 5 games with projected scores. **In-season only.**
- **League health banner** — three tappable tier chips ("3 Contending · 4
  Middle · 3 Rebuilding") plus "You: <tier>". A chip filters the list
  (`dynastyedge_league_tier`, sessionStorage); ranks stay league-wide — the
  filter only hides rows.
- **Team list** — sorted by total value; every card shows its rank ordinal for
  the current sort, **computed before the tier filter**. My card: accent border
  + "You" chip. **Sort:** Overall value / Record (wins, then PF) / Pick capital /
  FAAB (remaining + spent). **The Record option hides when no team has played**;
  a persisted `record` sort falls back to value. **Position filter** switches
  to a 1–10 ranking. Sort and position persist in sessionStorage.
- **Divergence badges** when value rank and record rank differ by ≥ 4:
  **Underperforming** (amber — a buy window) / **Overachieving** (blue —
  regression candidate).
- **Each card:** name + owner (+ record), tier badge, total value, a
  **positional read** — each position letter **lit in its hue when above league
  average, muted when below**, with the trend arrow (this replaced a clamped
  fill bar — Design System law 2), pick counts per year, FAAB as `$XXX`. **Tap →
  the roster + picks drill-down.**

-----

### Feature 6 — League Activity (League › Activity)

Season-wide transaction feed — trades, waivers (with winning bid), FA moves —
newest first, 25 per page with "Show more". Filter chips **All / Trades /
Waivers / FA / My Moves** (resetting pagination). Trades show each side's
players, picks (with original owner) and FAAB.
- **Every asset shows its current FantasyCalc value** with a per-side total;
  when totals differ by > 5% the larger haul renders green. **FAAB displays but
  never counts.** A note says values are today's prices. Unranked show `—`.
- **A pick spent in the same season it was traded is priced in three tiers,
  best first** — the same ladder as the manager ledger, from the same two
  helpers in `utils/pickCapital.js`, so the two screens can never disagree:
  1. **What it became** (`buildDraftPickIndex`) — `2026 1.10 → Jonah Coleman`,
     tappable.
  2. **The market price** (`findPickValue`) for a pick whose draft hasn't
     happened.
  3. **The generic round median** (`buildGenericRoundValues`), marked **≈**.
  `—` only when FantasyCalc lists no picks at all. **Why it matters:**
  FantasyCalc retires a season's picks when its draft completes, so a spent pick
  priced 0 — and zeroed the totals that pick the larger-haul flag. The draft
  pick list comes from `useSleeperDraft` (best-effort).
- **Player names are tappable** (dotted underline) **only for ranked players**;
  unranked names are plain text. My transactions: accent border + "You".
- Names resolve via `playerMap`, falling back to the player DB. Data: all 18
  buckets in parallel, `status === 'complete'`, cached per session.

-----

### Feature 7 — Market Movers (League › Movers)

30-day trends as actionable lists: **Watching** (every watchlisted player by
absolute trend; hidden when empty) · **Buy-Low** (falling < −50 at my deficit,
not mine, value ≥ 1000; a rebuilding owner flagged) · **Sell-High** (my risers
> +50 at a surplus) · **Top Risers / Fallers** (rostered plus FAs ≥ 500).
- **Trend shows absolute and %.**
- **Buy-Low and Sell-High never vanish silently** — empty renders a one-line
  reason. Watching/Risers/Fallers hide when empty.
- **Every rostered row has a Trade button** — an opponent's player arrives as a
  What's Fair target, my own pre-loaded in You Give; FAs get none.
- **The row SPLITS around that button — a sibling, never a child** (a
  `<button>` in a `<button>` is invalid HTML). `MoverRow` renders `Row` as a
  `<div>` holding two sibling buttons. **This deliberately does NOT copy the
  Partners footer-button precedent — the difference is cardinality** (law 5): a
  footer per row on ~30 dense rows adds ~24% height; the split row costs
  nothing. Both targets carry `.focus-ring` and `.press`.
- Sparklines when ≥ 4 snapshots exist. Tap → profile. Zero extra calls beyond
  the lazy history fetch.

-----

### Feature 8 — Watchlist

Star any player from the profile drawer header. `localStorage`
`dynastyedge_watchlist_v1` via `useWatchlist` (a shared external store). Trade
Partner Finder shows "Watching: …" on cards holding watched players.

-----

### Feature 9 — Lineup Efficiency (Squad › Season Review)

"How many points did I leave on the bench?" — actual vs optimal for every
completed week. Optimal from `players_points`, **filling single-position slots
first, then FLEX, then Superflex** (`utils/lineupHistory.js` → the shared
`lineupBuild.js`). Summary card (efficiency %, total left), per-week rows.
**Shows in the offseason too.** Data from the shared matchup-weeks cache
(`src/hooks/matchupWeeks.js`, shared with Playoff Odds — one fetch per week per
session); **if every week fails, error + retry, never "no data".** Its own view
(`/my-team/season-review`; `/lineup/season-review` redirects), **reached from
the Optimizer's footer link** — where the question gets asked.

-----

### Feature 10 — Draft (Draft › Board · Tracker)

**Board:** the rookie class (`years_exp === 0`) with FantasyCalc values in
tiers. Two modes — FantasyCalc order and **My Board** (drag-to-reorder,
persisted). Notes shared with the Tracker. Search + position chips. A
pre-loaded FantasyPros CSV column plus uploaded CSV columns (syncable via
`public/rankings.json`). With a synced draft, drafted players grey out and amber
badges show my latest remaining pick where each prospect is projected available
(by rookie ADP). A footer link opens **Research** (Feature 19), which answers
what value ordering cannot: who will play.

**Tracker — synced via `useSleeperDraft`** (`/league/{id}/drafts` →
`/draft/{draft_id}` + `/picks` + `/traded_picks`).
- **The single-draft call is load-bearing: `/league/{id}/drafts` OMITS
  `slot_to_roster_id`**; only `/draft/{draft_id}` carries it. Without it
  `buildDraftOrder` returns `null` and the whole live path (on-the-clock, "N
  picks until yours", Best Available, slot capital) **silently disappears**. The
  fetch merges the single-draft object over the listed one and **falls back to
  `draft_order` + rosters** (Feature 1's two-tier contract).
- **All live-path derivation is pure in `utils/draftLive.js`**
  (`deriveDraftState`, `buildBestAvailable`, `buildMyCapital`, `buildRecap`), so
  `tests/draftLive.test.mjs` replays a real draft pick by pick.
- Shows real order with in-draft trades, live picks, the on-the-clock banner,
  "N picks until yours", My Draft Capital, a **Best Available** card (best
  overall + top prospect at each deficit), and an undrafted list with My Board /
  ADP sort. Rows open the profile. Complete: recap, steals/reaches (slot vs
  rookie ADP), results.

**Draft recap — the standing is Value Over Expected, not value drafted** (raw
totals rank *volume*). Three numbers per team, strongest first:
- **VOE (the sort)** — value drafted minus what the team's *slots* were owed.
  The expected curve is the class itself (k-th best value = the k-th pick's
  expectation), so **VOE sums to exactly zero league-wide** (test-pinned) and
  pick count cancels out. Coloured outside `VOE_NEUTRAL` (100).
- **Value per pick** — secondary column, not a sort.
- **Hits** — picks ≥ `DRAFT_HIT_VALUE` (1000), **exported from
  `managerAnalysis.js` so the two can't drift.**
- **The expected curve must NOT come from FantasyCalc's pick entries** — they
  are retired when the draft completes, and a later season's picks are a year
  cheaper (re-creating "more picks = better draft").
- **With no priced player in the class, there is no grade:** `graded: false`,
  `voe`/`expected` null, header falls back to "Value Drafted by Team" (rule 7).
  The card closes noting it grades at today's prices (Trade › Managers regrades
  in hindsight).

**Refresh model:** Board and Tracker share one session-cached fetch; a Refresh button;
refetch on focus (aggressive while live); **30s polling while `drafting` and
visible.**

**Which draft the Tracker shows** — `selectTrackedDraft`
(`utils/seasonWindow.js`): the **upcoming** draft whenever Sleeper has one, else
the **most recent completed** one, so a recap stays on screen until next year's
board exists. The Tracker reads its season off the draft it renders; the manual
fallback uses `pickYears[0]`.

**Manual fallback:** until Sleeper has the draft, manual logging (slots
provisionally in roster-ID order, labelled so) plus "Check". Stored per season
in `dynastyedge_draft_tracker_{season}` so one draft can't leak into the next.

Storage keys live in `src/components/draft/boardStorage.js`:
`dynastyedge_board_order` · `dynastyedge_prospect_notes` ·
`dynastyedge_csv_rankings`.

-----

### Feature 11 — Manager Scouting (Trade › Managers)

Behavioural trading profiles for every manager from **every season of league
history**, plus a report card on me.

> **Location:** **Trade › Managers** (`/trade/managers`; `/league/managers`
> redirects). Components remain in `src/components/league/`. **Reached from
> Trade › Partners' footer link.**

**History (`useLeagueHistory`):** walks `previous_league_id` (cap 8 hops); per
past season fetches users, rosters, all 18 buckets, and every draft with picks;
also the current league's drafts. Lazy + session-cached (past seasons are
frozen). If the league was ever recreated instead of renewed, the chain ends
there.

**Analysis (`utils/managerAnalysis.js` via `useManagerProfiles`):**
- **Managers are keyed by `owner_id`** (stable across seasons); roster ids
  resolve only within their own season. Departed owners appear as named
  counterparties.
- **Trade ledger** per participant — got / gave / net / W-L-E at **±5% of trade
  size**.
- **Hindsight valuation at today's prices.** Traded picks whose draft happened
  resolve to the player drafted (`slot_to_roster_id` + pick list, falling back
  to `draft_order` + that season's user → roster map). Future picks use
  `findPickValue`; unresolvable past picks use the round median (shown ≈) —
  **never 0 just because the draft year passed.** FAAB in trades counts 0.
- **Tendencies:** pick accumulator/shipper, youth/veterans, position chasing,
  FAAB aggression.
- **FAAB efficiency — measured in BUDGETS, never raw dollars.** Every bid is
  divided by **its own season's `waiver_budget`** before aggregating.
  `budgetsCommitted` is a **multiple** (1.73×); `valuePerBudget` is value per
  **full budget** committed; `avgBidPct` is a **percent** (a single bid is
  exact either side of a reset).
  - **The total is a COUNT, not a percent**, because the budget resets twice a
    year — "173%" invites "of what?".
  - **A cross-season dollar total is a number in no unit** ($100 → $1000);
    summing dollars inverted real tendency chips.
  - `valuePerBudget` equals the old "value per $100" on a $100 budget, so **no
    pre-2026 history is restated.**
  - **No raw-dollar field leaves `buildFaabStats`** (`dollars`, `avgBid`,
    `valuePer100` are gone; a test pins their absence and that no `budgetPct`
    returns).
  - The **`budgetsCommitted >= 0.2`** coaching gate means "committed ≥ 20% of a
    budget" (on raw dollars it tripped at 2% of 2026's $1000).
  - A season with no `waiver_budget` falls back to **100** (matching
    `leagueState.js`). UI: **"Budgets Used · 1.7×"**, **"Value / Full Budget"**.
- **Rookie draft grades:** slot vs current-value rank within the class (Δ ≥ +5
  Steal, ≤ −5 Reach; ≥ 1000 = hit). Startup drafts (> 6 rounds) excluded.
- **Head-to-head:** trade count + my net vs each opponent.

**UI:** **My Report Card** on top (trade record, net, rookie hits, FAAB
efficiency, generated **"Your Edge"** / **"Work On"** bullets); scouting cards
for all 9 opponents by activity; tap → **`ManagerScoutingSheet`** (stats,
tendencies, H2H, draft record with badges, full paginated ledger grouped by
receiving team). Re-traded assets carry **"↪ flipped"**. **Zero-value assets
display `—`, never a raw 0.** Partner cards get a one-line behavioural read
(best-effort).

**Trade-time value archive (second lens):** `trade-values.json` (Value history
pipeline); `useTradeTimeValues` — whose completeness rule is
`tradeTimeTotals`, shared with `scout_managers` — shows "At trade time: got X ⇄
gave Y" when an entry is complete. **Missing ⇒ the line hides; never an error or
loading state.**

-----
### Feature 12 — The Edge (home screen / daily briefing)

**Purpose:** the assistant-GM landing page — "what happened since I last looked,
and is there a move to make?" **The default route** (`/` → `/edge`), useful in
season and out. **Zero new data sources** — composes LeagueContext,
`useTransactions`, `useLeagueNews`, `useValueHistory`, `useSleeperDraft`. Pure
logic in `utils/edgeBriefing.js`.

**Sections (top to bottom, the press-run entrance):**
- **Hero (poster):** cap bar (team · "Franchise Report", dateline) over the ink
  field: greeting, a generated GM line ("2 items on your desk · 3 new league
  moves"), **team value as the marquee figure** with its 30-day trend and a
  team-value sparkline (carry-forward; hides without history), and a stat strip
  (value rank, record when it exists, tier, FAAB). Value → My Roster; rank /
  window → League.
- **Action Items:** the shared `RosterActionItems` (dismissals included).
- **Roster Analysis shortcut:** a `NavRow` to `RosterAnalysisSheet`.
- **Your Briefing:** up to 5 items from `buildBriefing`, each a **`Lede`**
  (eyebrow, display headline with the finding `Mark`ed, prose, ink CTA) —
  **never a tinted icon medallion + title + one-liner** (two slop markers).
  Items carry presentational `mark` and `cta` in `edgeBriefing.js` because only
  the builder knows which fact the item turned on; **`markedHeadline` degrades
  to a plain headline when `mark` no longer occurs.** Each deep-links: live
  draft → Tracker; deadline ≤ 2 weeks → Trade; `pre_draft` → Board; N moves
  since last visit → Activity; buy-low → Analyzer as a What's Fair target;
  sell-high → Analyzer in You Give; watchlist mover → profile; underperforming
  opponent (rank gap ≥ 4) → their roster; **closing-window opponent** (most
  valuable declining trajectory) → their trajectory; playoff odds (in-season) →
  League › Playoffs.
- **Headlines:** feed items matched to my roster + watchlist (≤ 5), "New" since
  last visit; **hides when nothing matches — never an error.** Footer "All
  headlines →" to `/news`.
- **Market Radar:** watchlist + my movers (> ±50) lead, deduped, then backfills
  with my biggest remaining movers to ≤ 6 rows; sparklines; footer to Movers.
- **Around the League:** one-line transaction summaries (since last visit, or
  the latest 3) → Activity.
- **League pulse footer:** tier chips; tapping writes `dynastyedge_league_tier`
  and opens League pre-filtered.

**Last-visit model (`useLastVisit`, `dynastyedge_edge_last_visit`):** the
previous timestamp is read **once per session** (stable all session) and the
stored value bumped on that read. First visit ⇒ no "New" badges.

-----

### Feature 13 — Pick Trade Calculator (Trade › Pick Trades)

> **Location:** `/trade/pick-trades` (`/draft/trades` redirects); the rail
> label is **"Picks"**. Component stays in `src/components/draft/`.

**Purpose:** "What does it cost to move up — and what should moving down bring
back?" Zero new data sources. Pure logic in `utils/pickTrades.js`. Trade
Partners carries a footer link here.

- **It plans the NEXT draft, always** — `pickYears[0]`, not whatever draft
  `useSleeperDraft` shows. **It refuses to borrow another season's draft
  board** (stamping last draft's slots on next year's picks); round medians are
  the honest price until the new order exists, and the page says so.
- **Slot-level pricing:** FantasyCalc names slots "2026 Pick 1.09". Picks arrive
  resolved by `useLeague` and priced via `findExactSlotValue`;
  `buildPickMarket` reads that, falling back to a live board
  (`buildDraftOrder`) for in-draft trades, else round medians
  (`findPickValue`) with a note. A price board shows each round's median; the
  exact price lives on each row.
- **Move Up:** opponent picks in draft order → up to 3 packages from my
  inventory (1–3 picks, **each strictly worth less than the target**, totalling
  80–145%; **undershoot penalized 1.6× over overshoot**).
- **Move Down:** my picks → the best return from each opponent (top 4).
- **"Build →"** hands the Analyzer `preloadTrade` with **the owner's actual
  roster pick objects** (same ids, so toggles dedupe) at slot precision with
  `slotLabel`. Picks added later via the add sheet use medians — mixed precision
  is accepted.
- **No package reaches fair ⇒ a one-line hint**, never silently empty.

-----

### Feature 14 — Playoff Odds (League › Playoffs)

**Purpose:** "Am I making the playoffs, and should I be buying or selling?" — a
rest-of-season Monte Carlo, **every number defined on the page.**

**One new data source, lazy + session-cached (`usePlayoffOdds`):** every
regular-season week's matchups (weeks 1 … `playoff_week_start − 1` from
settings) via the **shared matchup-weeks cache**. One pass yields the remaining
schedule **and** completed scores. A failed week degrades to empty entries;
**when every week fails the load rejects** (ErrorState + retry, never a fake
preseason). **A week counts as complete only when EVERY team in it has
scored.** **The fetch waits for league settings / NFL state** rather than
guessing the week range. **Model + sim results are memoized at module scope**,
so the four consumers share one simulation per data load.

**The model (`utils/playoffOdds.js`, pure):**
- **`buildScoringModel`:** weekly score ~ `Normal(mean, std)`, the mean a
  shrinkage blend (4-game pseudo-count) of a **roster-strength prior** (best
  lineup value mapped to points) and **actual** scores; at ≥ 3 games the
  empirical std takes over.
- **`simulatePlayoffs`:** 10,000 iterations with a **fixed-seed RNG**
  (mulberry32 + Box–Muller) so numbers never reshuffle; accumulates wins +
  points-for on top of current standings, seeds by wins then points-for, records
  who lands in the top `playoff_teams`. Returns playoff %, #1-seed %, avg seed,
  seed distribution, projected record.
- **`getDeadlineVerdict(playoffPct, tier)`** → Buyer / On the bubble / Seller.
- **`buildStrengthPreview`** — the preseason fallback, labelled a preview.

**Three page states:** **Preseason** (no games *and* no posted schedule) — a
hero saying odds activate when the schedule posts, plus the preview; **Active**
— my hero (%, record, seed, verdict chip), a basis line, every team ranked by
odds with a likelihood bar; **Complete** — deterministic 100%/0% with a note. A
collapsible **"How this works"** defines every term.

**Consumers:** **Trade Analyzer Layer 3** — the odds **SCORE** the window in
season (the only consumer where they affect a score); **Partner Finder**
(seller < 35%, buyer ≥ 70%); **The Edge** briefing item. **All degrade silently
in the offseason.**

**Baseline caveat:** 6 of 10 make it, so **60% is the coin-flip** and the
thresholds compress the middle. Recalibrating to `playoff_teams / numTeams` is
unmeasured and moves three surfaces — **do not change them casually.**

-----

### Feature 15 — News (top-level drawer section)

The browsable, filterable **entire** feed (`/news`). **Zero new data sources**
— `loadNewsFeed`, the same once-per-session feed (up to ~1,280 items).
**Rendered 50 at a time with "Show more"**; date-band counts are the full bucket.
- **`useNewsFeed`** returns the full feed newest-first, each item enriched with
  the best-matched ranked player (`playerIds` → `athleteIds` → longest-first
  normalized name) and `isMine`. Unlike `useLeagueNews` it **keeps unmatched
  general items** (tagged "NFL"). Any failure ⇒ `[]`.
- **`NewsView`:** search + `All / My Players / Watchlist` chips; Today /
  Yesterday / Earlier; tap → `NewsArticleSheet` → "View profile".
- **States:** loading; **"No news right now"** when empty/unreachable; "No
  stories match your filter" — **never an error or retry-loop.**

-----

### Feature 16 — Global Player & Feature Search

A search icon in the **fixed app header** on every screen opens
**`PlayerSearchSheet`** (the full sheet contract, auto-focus). **Zero new data
sources:** players from `values.playerMap` by normalized name (≥ 2 chars),
ranked by `overallRank`, cap 40. **Feature jump:** the query also matches every
destination **read from `src/navigation.js`** (names only — no synonym map yet),
shown as **"Jump to"** above players (cap 8). Rows carry **no section colour
dot** (it would collide with position hues). **A player result opens
`PlayerProfileDrawer` rendered by the sheet itself**, after the results in the
DOM, so it stacks on top; closing returns to the results. Picks aren't in
`playerMap`, so player search is players only.

-----

### Feature 17 — Dynasty Trajectory (Squad › Trajectory)

**Purpose:** the app's one forward-looking lens — **"when does my window peak —
am I a buy-now or a build team?"** Works year-round. **Zero new data sources.**

**Location:** **Squad › Trajectory** (`/my-team/trajectory`) and **any team's**
at `/league/trajectory/:rosterId`. `RosterView` carries a "Dynasty Trajectory
→" card **on both seats** (my own trajectory once had no inbound link).

**Consumers (via `getTrajectoryRead`, zero extra fetch):** Partner Finder's
one-line read, Analyzer Layer 3's partner line, The Edge's closing-window item.

**The model (`utils/dynastyTrajectory.js`, pure):**
- **`buildAgeCurves`** — per position, a Gaussian-kernel (2.5y) weighted
  *median* of value by age from today's FantasyCalc pool, blended toward a
  `peakWindows.js`-shaped prior (pseudo-count 3). No hardcoded decay rates.
- **THE CURVE IS A CROSS-SECTION, SO IT MUST NEVER FEED A SCORE, A RANKING, OR
  A RECOMMENDATION** — it reads survivorship as aging (the only old TE still
  valued is the one who didn't decline). It is descriptive shape only. The
  shipped aging signal is the longitudinal one
  (`docs/analysis/asset-aging-and-pick-value-2026-09.md` §2); the real fix
  waits for `values-archive.json` (OPEN-9).
- **Projection:** value `n` seasons out = `currentValue × curve(age + n) /
  curve(age)`, clamped per year 0.55×–1.18×. **Unranked / no-age players hold
  flat** (never an invented curve) and contribute 0.
- **Picks mature into rookies** — hold at current value until their draft year,
  then age from 22 on a blended curve.
- **`buildRosterTrajectory`** sums a current→+3 series plus per-position series.
  `getTrajectoryVerdict` / `getTrajectoryRead` read the **net 3-yr change**:
  **declining** < −1% ("selling vets"), **ascending** > +5% ("building"), else
  **balanced**. Asymmetric because pick maturation lifts every roster ~2–3%;
  classified on **net change, not interim peak** (maturation pushes peaks
  later). Per-player/position tags use symmetric ±5% (`seriesDirection`) and
  `peakStatusShort`.

**UI (`TrajectoryView.jsx`):** a **`Lede`** verdict (eyebrow "Window peaks
{year}", direction `Mark`ed) — **never a coloured left rail**; a forward value
chart with the peak ringed and a dashed league-average line; stat cards; By
Position rows with sparklines; a Player Projections table; a "How this works"
stating it is a model, not a forecast.

-----

### Feature 18 — Sign-in & Identity

**Purpose:** answer "which team am I?" at runtime. **Gates the entire app** —
nothing renders until an identity is set.

- **Zero new data sources:** `useLeague`'s Sleeper-only `signInRosters` plus one
  `/user/{username}` lookup. **Never gate sign-in on FantasyCalc** (rule 4).
- **"Login" is read-only identity resolution** — no password, token or OAuth;
  it never touches the Sleeper account.
- **`LoginScreen`:** username → `user_id` → this league's roster. Two
  recoverable failures (unknown username / not in this league), and **the
  tap-to-pick team list is always shown as a fallback.** It owns its own
  full-viewport scroller and the `.login-bg`.
- **`useIdentity`** — a `useSyncExternalStore` store (like `useWatchlist`),
  persisted in `dynastyedge_identity_v1` as `{ userId, rosterId }`. **Valid only
  with a numeric `rosterId`**; anything else is logged-out. Storage failures
  degrade to in-memory.
- **Switching identity wipes roster-scoped state** (`dynastyedge_action_dismissals`,
  `dynastyedge_trade_draft`; the full list is rule 20). League-wide caches are
  deliberately left alone.
- **Sign out / Switch team** at the bottom of the side drawer. `MY_ROSTER_ID` /
  `MY_USERNAME` / `MY_TEAM_NAME` are original-owner reference only — **use
  `myRosterId` from `LeagueContext` / `useIdentity`.**

-----

### Feature 19 — Rookie Research (Draft › Research)

**Purpose:** "which rookies become something?" — value prices consensus, not
opportunity. The **Research** sub-tab (`/draft/research`). **One new data
source** — the rookie intel feed.

**The model (`utils/rookieResearch.js`, pure):** an **opportunity score** (0–100
on screen) = **30% depth-chart standing / 70% NFL draft capital**, calibrated on
n = 396 drafted skill rookies 2021–25 (blended rho +0.664;
`docs/analysis/rookie-research-signals-2026-08.md`).
`scripts/dev/rookie-signal-backtest.mjs` **imports the shipped constants, so
analysis and app cannot drift.**
- `DEPTH_WEIGHT` sits on a flat curve — no annual re-tuning.
- **`DEPTH_VALUE` is measured medians — re-derive from the back-test, never
  nudge by feel.**
- **All depth scores share ONE points scale (`DEPTH_MAX`)** — per-position
  scaling put five backup TEs in the top six.
- Off the chart = rank-4+; undrafted floors at `UDFA_SCORE`, not 0.

**Market vs Model** (the product) compares market rank and model rank **WITHIN
POSITION** — cross-position comparison measures the difference between
yardsticks and flags every TE. Default `minGap` 5.

**Camp movement is shown, not scored** (no pre-camp baseline to back-test).
**Age and combine athleticism are shown, not scored as a second axis** —
measured nulls (`docs/analysis/rookie-longterm-signals-2026-09.md`): a two-axis
long-term score correlates 0.934 with the shipped one and loses at years 2–3.
**There is no second axis; Draft › Research keeps one score.**
`COMBINE_BASELINE` is display-only; `AGE_BASELINE` feeds the age tilt.

**The age tilt — the one Phase 3 signal in the score.** The board number is
`dynastyOpportunityScore`: the year-1 `opportunityScore` tilted **10% toward
youth measured within position** (+0.018 per-class Spearman vs years 2+3, t =
+3.35, 8 of 9 classes; no cost at year 1). Three contracts, all test-pinned:
1. **`opportunityScore` still means exactly the year-1 core** — the tilt is a
   separate function on top.
2. **An unknown age is a no-op, not an imputed average** — the form is
   re-centred (`base + 0.0278·z`), ranking identically to the measured blend
   without pulling unknown-age UDFAs toward 0.5.
3. **It is a tilt, not a second axis** (two-axis UI rejected twice).

**College production is also a null** (dominator, breakout age —
`docs/analysis/rookie-college-production-2026-09.md`). **The app calls no
college endpoint and the two-axis question is closed.**

**Roster fit (`buildTeamFit` / `topTargets`)** — "which should *I* take?" — **a
re-ranking over the back-tested score, never a change to it.** `fit` blends the
score with market price (`FIT_MARKET_WEIGHT` 0.45) plus bonuses for my deficit
position (`FIT_NEED_BONUS`), a ≥ 5-spot model-over-market gap, and a
win-window lean. Deficits and tier come from `getDeficitPositions` /
`getWinWindowTier`, so "you need a TE" means what it means everywhere. **An
unscored rookie gets `fit: null` and is never a target**, but keeps his need
badge.

**UI (`RookieResearchView.jsx`):** an always-visible explainer, **Your
Targets**, the Market vs Model cards, then an Opportunity Board (search, chips,
legend, sort Best for me / Opportunity / Dynasty value / Camp risers — default
**Best for me**, with a line naming the sort). Rows: score, position-aware depth
read, capital, slot, movement, "Your need"; tap → profile. Value is the
tiebreaker (useful when degraded). **Unranked rookies show `—` and are never
dropped.**

**The drawer carries the research read everywhere a rookie opens.** The
composition is **`buildRookieBoard`** (`utils/rookieResearch.js`, with the class
rule `buildRookieMap` in `utils/rookieAdp.js`), shared with `research_rookies`;
**`useRookieResearch`** holds only the memo, and the drawer resolves its row via
`useRookieResearchFor(sleeperId)` (an explicit `research` prop wins).
- **`useRookieIntel(enabled)` stays lazy** — the drawer passes `false` until the
  player is in the rookie map, so opening a veteran costs nothing.
- **Outside Research, a rookie with no feed entry renders no card.**
- The **Rookie Opportunity** card: score + tier, depth read, capital, camp move,
  a **"Measurables · context, not scored"** block, reasons, the market-vs-model
  sentence, fit reasons. **The row carries `positionRank` and `age`** — without
  them the drawer stamped every rookie "D — Deep Stash".

-----

### The recommendation engine (`utils/recommendations.js`)

The one place that decides **how willing we are to part with each asset**, so
every recommendation surface reasons about the roster the same way. Pure;
zero new data sources.

**A keep score, not a value.** `assetKeepScore` returns 0 (expendable) → 1
(untouchable), from `buildGivabilityContext` (my surpluses/deficits, tier, each
player's depth rank):
- **`CORE_DEPTH` = QB 2 · RB 3 · WR 3 · TE 1** — the starters protected hardest.
- **A deficit protects everyone at the position; a surplus unlocks only depth
  pieces** (rank ≥ `CORE_DEPTH`). **A surplus must NEVER discount a core
  starter.**
- **Cliff protection:** my best at a position with a steep drop to the next is
  protected regardless of the summed value.
- **Picks are priced by ROUND (`PICK_ROUND_KEEP` = 1st 0.65 · 2nd 0.50 · 3rd
  0.40 · 4th 0.30)** — resolution steepens the pick curve the market flattens.
  **An unknown round falls back to `PICK_KEEP_DEFAULT` (0.5), never the
  cheapest. `PICK_KEEP_CAP` (0.85) holds every pick below `PROTECT_THRESHOLD`**
  (that threshold is for irreplaceable *players*). Re-derive with
  `scripts/dev/asset-aging-backtest.mjs` once the 2027 class resolves (OPEN-8;
  `docs/analysis/asset-aging-and-pick-value-2026-09.md` §3).
- **Win-window lean on age:** contenders cash picks and fliers; rebuilders hoard
  youth.
- **Past-peak age tilt (`pastPeakTilt`)** — more expendable past the
  `peakWindows.js` window, saturating at `AGE_TILT_SPAN` (3) years.
  **Decline-only** (protecting young players was disconfirmed). **Per position**
  `AGE_TILT_BY_POSITION` = RB 1.00 · WR 0.65 · QB 0.40 · TE 0.15 (QB/TE take
  their unproven effect halved). **By tier** `AGE_TILT_BY_TIER` = Contending
  0.04 · Middle 0.10 · Rebuilding 0.16 — a preference weight. **It can never
  protect an asset, reach past `PROTECT_THRESHOLD`, or undo cliff protection;
  an unknown age is a no-op.** Peak windows are not re-tuned (§2).
- **`PROTECT_THRESHOLD` = 0.9** — never *auto-*included in a package; the user
  can still add manually.

**Consumers:**
- **Action Items — `suggestSellMove`** picks a partner **two-sided**: need at the
  position, whether he'd **start** for them (`buildValueLineup`), and whether
  they own a comparable player at **my** deficit. **A partner with a real return
  beats a needier one without**; it falls back to the neediest. Returns
  nav-ready `preloadTrade` plus `startsForThem`.
- **Free Agents + The Edge's `pickup` item — `recommendFreeAgents`:** fills a
  deficit, beats my replacement level (`CORE_DEPTH`-th best), rides a rising
  trend, fits my window — **only players that move the needle**, with reasons.
  Its roster facts are **`buildPickupContext`**, exported so the FAAB bid reads
  the same "fills your need".
- **The FAAB bid (`utils/faabBid.js` → `recommendFaabBid`, OPEN-3)** — spec,
  live run and grading bars: `docs/analysis/faab-bid-corpus-2026-08.md` §10.
  - **It does NOT predict whether anyone else will bid** (the contest rate
    barely moves with value). The tier is **how much winning matters to my
    roster**: **must-win 23%** (fills a need AND starts in my value lineup) ·
    **default 16%** (starts, or fills a need AND beats my depth) · **value play
    11%** (beats my depth, or sits at a need) · **floor**.
  - **The floor is what the league pays uncontested** (owner, 2026-10-07):
    **0.2% of budget, min $1, never under `waiver_bid_min`** — $2 on $1000, $1
    on $100.
  - **Priced against the FULL budget, capped at what is left** — never "% of
    remaining". Week scaling **0.8×** weeks 1–4, **1.0×** 5–14, **0.3×** from 15;
    offseason 1.0×; **the floor never scales.**
  - **The budget is READ, never assumed:** `readFaabPeriod` takes
    `waiver_budget` and the roster's `waiver_budget_used` (current period).
    **No budget ⇒ no bid**, not a 100 or a 1000.
  - **Rule 7 and one-defense:** a defense or an unpriced player gets `bid:
    null`.
  - **Graded at Weeks 13–15 against the pre-registered bars** (wins ≥ 75% of
    contested auctions entered; cost per contested win ≤ league median). **Do
    not move the bars.**
- **Trade Analyzer:** `buildGivabilityContext`, `assetKeepScore`,
  `getDeficitPositions` back Giving Up and package suggestions.
- **Trade › Targets cash-out board (`buildCashOutBoard`)** — the move the
  deficit-ranked board cannot surface. `pickCashOutAsset` names the asset with
  the most **value at risk** (`value × years past peak` — neither "my oldest"
  nor "my most valuable"), excluding anything at `PROTECT_THRESHOLD`, then lists
  younger targets (`CASH_OUT_MIN_YEARS_YOUNGER` = 2) around his price, tilted by
  the same movability (`buildMovabilityIndex`, shared so they can't drift), each
  **labelled with how it misses fair**. **The band and every gap come from
  `fairBand.js`, never from the package window** (else THE CALL contradicts the
  board one screen later). The preload uses **full roster objects**. League-wide
  mode only; **no past-peak asset ⇒ no block, never an invented one.**

-----

### Trade deadline banner

Under the Trade rail during the regular season (deadline week from league
settings): > 2 weeks out neutral "Trade deadline: Week 13 · N weeks away";
≤ 2 weeks amber, deadline week "THIS WEEK"; after, muted "Trade deadline
passed". **Hidden in the offseason.**

-----

## Navigation

> History (the NN/g evidence, the DESIGN-3 story, the rail-headroom
> measurements): `docs/history/navigation.md`.

**The app is gated by sign-in** (Feature 18): until an identity is set, `App`
renders `LoginScreen` instead of the router.

**Navigation is a BOTTOM TAB BAR** (`components/shared/TabBar.jsx`) — four
weekly sections plus the Index (DESIGN-3, 2026-09-11, owner-reopened). The old
"no bottom tab bar" rule is **dead**: the drawer hid every destination behind a
full-screen overlay on a one-handed phone.

**Navigation is TEXT — no icon set anywhere in the bar or the Index** (a
thin-line icon set is a named slop marker). The bar is an **ink field**
(`bg-text-primary` / `text-bg-primary`), **inverted in BOTH themes (owner's
call)**, with no top border. Inactive tabs 55% opacity; active full opacity with
a 2px marker in the bar's own ink. **Red is NOT spent here.**

**Draft and News lost top-level rank, not reachability** — every route and entry
point kept, both on the Index.

|#  |Tab   |Route    |Feature name|Views                                       |
|---|------|---------|-----------|---------------------------------------------|
|1  |Today |`/edge`  |The Edge   |Daily briefing home screen (default route)   |
|2  |Squad |`/my-team`|My Team   |My Roster · Lineup · Season Review · Trajectory|
|3  |Trade |`/trade` |Trade      |Partners · Analyzer · Targets · Managers · Picks (+ deadline banner)|
|4  |League|`/league`|League     |Overview · Free Agents · Activity · Movers · Playoffs|
|5  |Index |`/index` |—          |The complete map — every section, plus the four consulted views|

**Nav labels and feature names differ deliberately** — "The Edge" / "My Team" /
"Pick Trade Calculator" are feature names; **Today** / **Squad** / **Picks** are
navigation's. Routes are unchanged, so no deep link or redirect is affected.
The header names the section from the same map, so header and bar can never
disagree.

**The Index (`/index`)** is a real destination: a Find row (the same
`PlayerSearchSheet`), every section with its views, then **"Consulted, not
daily"** — Season Review, Dynasty Trajectory, Manager Scouting, Rookie Research.
Each of those four is also in its section's rail **and** has a content-level
link from the screen that raises its question.

**Within a section, views are a contents rail — `SectionContents`
(`src/components/shared/SectionContents.jsx`), never a hand-rolled row.**
1. **It is the only place a section's views are listed** on a content screen
   (the drawer carries no destinations).
2. **It WRAPS instead of scrolling** — a wrapping line cannot hide an entry.
   Items are not `flex-1`. Each item is a real 44px target; **`.tap-target` is
   deliberately not used** (on a wrapping row its oversized hit area would let
   adjacent items steal taps).
3. **It fits on ONE line in every section, and still wraps if it can't.**
   **`flex-nowrap` is NOT the mechanism — nowrap does not fit an over-long rail,
   it HIDES the overflow.** *A layout that "fits" under nowrap has not been
   measured, it has been silenced.* Budget at 390px (358px available): **Squad
   344 · Trade 352 (the tight one — a sixth view or longer label breaks it) ·
   League 306 · Draft 196.**
   **`railLabel` is the shortening mechanism, and it is rail-only**
   (`SectionContents` reads `railLabel ?? label`; the Index and search keep
   "Free Agents"). Add one only when a section is measurably over budget. `FA`
   is already this app's vocabulary.

**Every navigable destination lives in ONE place: `src/navigation.js`** — read
by the tab bar, the rails, the Index and global search. A destination is added
or moved once.

**The side drawer survives with ZERO destinations** — the hamburger opens the
utility surface: Refresh, data status, app build, theme toggle, Switch team /
Sign out. **Status colours and navigation identity are separate and exclusive;
nothing in navigation may wear a status token.**

**Data status — five rows** (Rosters · Values · News · History · Rookies), each
the app-side "last refreshed" age. **News carries a second indented line** —
depth and players reached, amber under 48h (a *degraded* pipeline). The three
Actions feeds also show **publish age** from their own `updatedAt` (a *dead*
pipeline), labelled separately; amber when news > 2h or values > 36h; a feed age
hides when that feed never loaded. Reads session caches on open — zero extra
requests.

An **"Update available — Reload"** row appears only when the running bundle is
behind (see App version self-heal). An **"App build"** row shows the build
number (`__BUILD_ID__`) with **· up to date** (green) or **· update ready**
(amber) — **or nothing: dev and a failed check prove nothing, and must never
render as reassurance.**

**Refresh** fires five sources in parallel, non-blocking (`phase` idle →
refreshing → done; each source ticks its own state). Live APIs keep cached data
on screen (stale-while-revalidate) — no view blanks.

**Route map.** `/my-team` (= My Roster), `/my-team/lineup`,
`/my-team/season-review`, `/my-team/trajectory`; `/league` (= Overview),
`/league/free-agents`, `/league/activity`, `/league/movers`, `/league/playoffs`;
standalone scouting drill-downs (no rail, header "League")
`/league/teams/:rosterId` and `/league/trajectory/:rosterId`;
`/trade/pick-trades`, `/trade/managers`; `/draft/board`, `/draft/research`,
`/draft/tracker`; `/news`; `/index`. **Every moved path keeps a redirect** so
saved deep links and Edge briefing items keep working: `/roster*` → `/my-team*`
(or `/league*` for the team list, drill-downs and free agents), `/lineup*` →
`/my-team/*`, `/draft/trades` → `/trade/pick-trades`, `/league/managers` →
`/trade/managers`. **`edgeBriefing.js` deep-links by path, so a missed redirect
silently breaks the home screen** — the cheapest way not to miss one is not to
move a path (DESIGN-3 moved none).

**Global search** — see Feature 16. **Manager Scouting lives under Trade** (it
is trade intel); its components stay in `src/components/league/`.

-----

## Navigation Refactor (complete — history)

**Phases 1–3 shipped (2026-07-20); the drawer-as-map half was reversed by
DESIGN-3 (2026-09-11).** What survives is the information architecture — **My
Team = my squad · Trade = only things that help build a trade · League =
everyone else / the market** — plus every route and redirect it created. The
live design is **Navigation** above; the full plan, its phases, watch-items and
doc-upkeep checklist are in `docs/history/navigation-refactor.md`.

-----

## Design System

> **Status: "Matchday" is the live direction; all five steps landed
> (2026-09-12). The app fails 0 of `slop-checklist.md`'s 12 markers.** It
> replaced "Primetime Blackout" (Phase 3), rejected on review because its own
> brief *specified* two AI-default aesthetics — compliance could not have fixed
> it. Spec: `docs/design/review-2026-09/` (`directions.md`, `slop-checklist.md`,
> `findings.md`, `mocks/directions-2.html` direction 3 — the authority on
> palette and type, never imported by the app). History (the Blackout story,
> step-by-step measurements, probe counts, rejected options):
> `docs/history/design-system.md`.
>
> **Deleting a primitive does not delete the pattern, and a grep for an API
> cannot find a shape** — a banned rail survived three sweeps as raw
> `border-l-*` classes after `Card`'s `accent` prop was removed. **Audit for the
> shape, and re-score the checklist from scratch rather than inheriting a
> score.**

**Matchday in one line: a publication about a competition.** Poster type, flat
colour, hard edges, no shadows, no icon set in navigation, and the five position
hues promoted to **full-bleed section bands**.

### The five laws

1. **Colour is a FIELD, not a rail.** Ink and the position hues are solid blocks
   with type reversed out (masthead, hero, band, `Mark`, CTA, active chip, tab
   bar). **A thin coloured rail down a container's left edge is banned.** When
   something wants colour, it becomes a field or the colour moves onto the
   *word* that carries the finding.
2. **Magnitude is TYPE SIZE, never a progress bar** (`<Magnitude>`); the band
   above a group carries its total. **A bar survives only where the number is a
   genuine proportion of a bounded whole — all three required: a real
   complement, no clamp, an absolute mapping.** League › Playoffs' odds bar
   passes and stays. TeamCard's positional bars failed all three (clamped at 2×
   league average, a meaningless complement, a reference that moved when *other*
   teams traded) and became a lit/muted position letter — the binary Feature 5
   always specified.
   **`Magnitude` needs a contract reference; a quantity without one does not get
   sized.** Players: FantasyCalc's 0–10000. **Team totals:
   `MAGNITUDE_TEAM_REFERENCE` = `MAGNITUDE_REFERENCE × ROSTER_SLOTS.length`.**
   Positional sums: `MAGNITUDE_REFERENCE × POSITION_DEPTH[pos]`. **Where no
   contract ceiling exists, use a plain figure** — never invent a reference.
3. **Separation is a rule, never a shadow and never a radius.** Panels are
   square with a 1px hairline (`--border-default`) or a 2px rule
   (`--border-strong` / ink). **Sheets, modals and the side drawer keep their
   radii and their full gesture contract.**
4. **Status colours and position colours keep separate, exclusive meanings, and
   navigation may borrow neither.** An editorial highlight takes a semantic
   colour or ink — never a position hue.
5. **A block is a RULED ROW, a LEDE, or a DOOR — a rectangle is the last
   resort** (finding B7: everything was an identical bordered rectangle).

   | Register | For | Shape |
   |---|---|---|
   | **`RuledList`** of rows | many things you SCAN | a shared column, hairline separators, no box; the `PositionBand` above carries the group |
   | **`Lede`** | ONE thing you ACT ON | eyebrow · display headline with a `Mark` · prose · ink CTA; no box |
   | **`NavRow`** | a way OUT of this screen | display title · detail · hairline; no icon, no chevron |

   **Chosen by cardinality and consequence, never by taste.** **An enumeration
   must never be built from `Lede`s** — repeated items of one kind aggregate into
   a single `Lede`. `Card` survives only for a standalone panel that is none of
   the three (a chart, an explainer, a form).

### Design System Component Library

All UI routes through **`src/components/ui`** (barrel `index.js`). **Never
hand-roll a button, card, bottom sheet, filter chip, badge, band, value figure,
or input inline — extend a primitive.** Class strings inside primitives stay
**literal** (no runtime interpolation) so Tailwind's content scan sees them.
`/design-review` is the enforcement — run it on the **consumers**, not on
`src/components/ui` while the primitives themselves are being edited. Import
from the barrel: `import { Button, Card, Sheet } from '../ui'`.

|Primitive|What it is|
|---------|----------|
|`Button`|THE button, **mono uppercase, tracked**. Variants `primary` (ink field) · `secondary` · `tinted` · `ghost` · `danger`; sizes `sm`/`md`/`lg`; `fullWidth`, `icon`/`iconRight`, polymorphic `as`/`href`. Labels **wrap** (`text-balance`), never `whitespace-nowrap`. Carries `tap-target`.|
|`IconButton`|THE icon-only/close control — always pass `label`. `md` is a real 44px box; `sm` (36px) only for the inline swap handle, borrowing `tap-target`. Square.|
|`Card`|THE surface container (`rounded-none bg-bg-card border`). Optional `tone` draws a **2px kicker rule across the TOP** (the left rail is banned). `padding`; `interactive`/`onClick` makes it a button.|
|**`Mark`**|THE editorial highlight — a word reversed out of a block. Tones `ink` · `ground` (inside an ink field) · `alt` · `brand` · status. **Never a position hue.**|
|**`PositionBand`**|THE section band — a position hue at **full bleed**, carrying count and **total**. A mixed-position board takes the neutral ink band (`position` omitted). `bleed` cancels the gutter.|
|**`Magnitude`**|THE value figure, sized from its own value (law 2). `null` renders `—` (rule 7).|
|**`RuledList`**|THE DENSE register — rows on the page ground, hairline separators, **no box and no per-row background**. `flush` cancels the gutter.|
|**`Row`**|THE member of a `RuledList` — **always carries `.focus-ring`**; `<button>` for `onClick`, `<Link>` for `to`, plain `<div>` for neither. Extracted after eleven hand-rolled copies drifted apart on the focus ring.|
|**`Lede`**|THE OPEN register — eyebrow · headline · prose · ink CTA, no box. A pressable `Lede` is a `<button>`, so `action` is a **string** there; real controls go in `action` / `aside` with `onClick` unset.|
|**`NavRow`**|THE DOOR — display title, detail, optional mono hint, hairline, **no icon and no chevron**.|
|**`Loading`**|THE loading indicator — a printing rule under a mono label. **There is no spinner.** `inline` for a section; the block form carries the gutter (`padded={false}` when already padded). **Never without a label.**|
|`Sheet` + `SheetHeader`|THE bottom sheet — owns the whole sheet contract (rule 17). `zIndex` is a Tailwind class. **Exception:** the two *keyboard-aware* sheets driven by `window.visualViewport` (`PlayerSearchSheet`, TradeBuilder's add sheet) are the sanctioned hand-rolled overlays.|
|`Modal`|THE centered dialog — overlay, `useScrollLock`, Escape + overlay close.|
|`Chip`|THE filter chip — square, mono uppercase; `active` is the ink field, or `activeClass={POS_CHIP_ACTIVE[pos]}`.|
|`Badge`|THE small badge — `tone`, `soft`. Solid `accent` is ink; **`brand` crimson is reserved for "you" labels.**|
|`Select`|THE dropdown — a **native** `<select>` (iOS wheel picker, free `<optgroup>`).|
|`Input` / `SearchInput`|THE text field — **ruled, not boxed**; the rule thickens to ink on focus and `.focus-ring` still fires. Keep `text-sm` (iOS focus-zoom is handled globally).|
|`Textarea`|`Input`'s sibling — same contract; `resize-none` (a resizable box fights the sheet drag). Exists because a hand-rolled textarea was the one control with no focus state.|
|`cn`|THE className joiner — never add a classnames dependency.|

**Re-exported shared primitives** (files stay in `src/components/shared/`):
`ErrorState`, `SectionHeader` + `BRAND_TICK`, `SectionContents`, `TrendArrow`,
`WinWindowBadge`, `Sparkline`, `TeamAvatar` — import them from `'../ui'`.

**`Magnitude`'s reference is PINNED to a contract:** `14 + 16·(v/10000)^0.7`,
clamped 14–30px. **Never derived per list** (a figure must mean the same thing on
every screen). **10000, not the mock's 9365** — a contract, not a snapshot. The
0.7 exponent keeps the bottom of the market legible without flattening the top.

### The accessibility floor (non-negotiable, enforced in the primitives)

Lives in the primitives and `index.css`, never at a call site, so no screen can
opt out.

- **Contrast is a contract.** `--text-tertiary` carries real content, so it must
  clear **WCAG AA (4.5:1)** against each theme's **worst-case ground** (dark:
  the lightest, `--bg-card`; light: the darkest, `--bg-secondary`). **ANY CHANGE
  TO A GROUND COLOUR MUST RE-MEASURE BOTH TEXT TOKENS IN BOTH THEMES** — run
  **`node scripts/dev/contrast-audit.mjs`** (reads the tokens from `index.css`,
  covers the band and ink-field reversals; 40 of 40 pass).
- **`.focus-ring` is THE focus definition** (`index.css`), carried by `Button`,
  `IconButton`, `Chip`, interactive `Card`, `Row`, `Input`, `Textarea`,
  `Select`. `:focus-visible`, not `:focus`. Inside `.ink-field` it flips to the
  field's ground. **A control that bypasses the primitives must carry it
  explicitly — check with a static probe over every
  `<button>`/`<input>`/`<select>`/`<textarea>`, not by reading the diff** (one
  missed row component is hundreds of live controls). **A control carrying it at
  the call site is one refactor from losing it** — that is why primitives exist.
  The only deliberate omission is `DraftBoard`'s hidden file input.
- **`.press`** is the one press definition (see Motion).
- **`.tap-target` guarantees a 44px hit area without moving the ink** (centered
  pseudo-element, `max(100%, 44px)`; also `touch-action: manipulation`). **It is
  deliberately NOT on `Chip`** (neighbours ~8px apart would steal each other's
  taps).

**Truncation is not a layout strategy for a load-bearing value** — five values
had to be fixed to wrap instead of elide. **The instrument:**
`node scripts/dev/screenshot-app.mjs --route <path> --overflow` reports every
element actually clipped (`scrollWidth > clientWidth`) against live data.
`--text` cannot see a CSS ellipsis (it is painted, never in the DOM), and a tall
capture downscales past it. **Sweep every route with it before calling a screen
clean.**

### Theme

Default **dark**; toggle in the side drawer's utility surface; stored in
`localStorage` `dynastyedge_theme`.

### The ink field

`.ink-field` / `.ink-field-cap` (`index.css`) — a solid block of `--text-primary`
with `--bg-primary` reversed out — is **the one structural device**, and it
**inverts with the theme by construction** (cream poster in dark, ink in light).
That resolved finding B4 (a near-black hero slab in light mode).
**Content inside a field addresses the field:** `text-bg-primary`,
`bg-bg-primary/10`, `border-bg-primary/20`.
- **Never `text-white`** — invisible on the cream field.
- **Alpha floor on a field is `/60`.**
- **No status, tier or medal hue on a field** — no single hue clears AA against
  both versions. Carry direction and rank by weight, sign, or a second reversal
  (`<Mark tone="ground">`).

### Colour palette

Tokens live in `index.css` (`:root` light / `.dark` dark), exposed via Tailwind.
**The ground and every neutral carry a hue** (warm, ~45–55°) — zero-saturation
greys are a named marker. **Two hues, 176° apart:** Falcons crimson (~350°,
rationed) and **`--alt`** slate teal (~174°, the non-semantic `Mark`). The five
position hues are the colour world on top.

#### Dark mode

|Role                     |Value                                   |
|-------------------------|----------------------------------------|
|Background primary       |`#0E0E0D` (warm near-black, not `#000`) |
|Background secondary     |`#141413` — header, rails, sunken rows  |
|Background card          |`#171716` — **the worst-case ground**   |
|Border (hairline)        |`#302F2C`                               |
|Border strong (rule)     |`#67655D` — 3.07:1, non-text bar        |
|Text primary             |`#F6F4EE` — 16.31:1                     |
|Text secondary           |`#A8A49A` — 7.21:1                      |
|Text tertiary            |`#888377` — 4.75:1                      |
|Accent (structure)       |`#E4E0D6` — warm near-ink               |
|Alt (secondary hue)      |`#6FB3AC` — slate teal, 7.45:1          |
|Brand crimson (rationed) |`--brand #C8102E` · `--brand-deep #7E0E22` · text-on-ink `--brand-bright #EA465B` (4.72:1)|
|Success                  |`#5CC98C` — 8.70:1                      |
|Warning                  |`#E3AA42` — 8.62:1                      |
|Danger (trend/status)    |`#EE7A72` — 6.55:1, never the brand red |
|Tier: Contending         |`#E4E0D6` (the ink family)              |
|Tier: Middle             |`#57C4E8`                               |
|Tier: Rebuilding         |`#9AA3EE`                               |

#### Light mode

|Role                     |Value                                   |
|-------------------------|----------------------------------------|
|Background primary       |`#F4F2EC` (paper)                       |
|Background secondary     |`#E8E5DC` — **the worst-case ground**   |
|Background card          |`#FBFAF6` — lifts by tone, never shadow |
|Border (hairline)        |`#CDC9BD`                               |
|Border strong (rule)     |`#868274` — 3.05:1, non-text bar        |
|Text primary             |`#111110` — 15.00:1                     |
|Text secondary           |`#4C4941` — 7.14:1                      |
|Text tertiary            |`#686456` — 4.70:1                      |
|Accent (structure)       |`#2E2C27`                               |
|Alt (secondary hue)      |`#2C6760` — 5.18:1                      |
|Brand crimson            |`#A71930` (`--brand-bright` the same)   |
|Success                  |`#147247` — 4.73:1                      |
|Warning                  |`#7A5606` — 5.27:1                      |
|Danger                   |`#AB3831` — 4.99:1                      |
|Tiers                    |Contending `#2E2C27` · Middle `#0E6E8C` · Rebuilding `#4A55BE`|

### Position identity colors (consistent across entire app)

Tokens `--pos-*`; all class maps in `src/utils/positionColors.js` (`POS_TEXT`,
`POS_BG`, **`POS_FIELD`**, `POS_TAG`, `POS_CHIP_ACTIVE`, `POS_SVG`). **Never
hand-roll position colours, and never reuse status colours to mean a position.**

|Position|Dark mode          |Light mode                         |
|--------|-------------------|-----------------------------------|
|QB      |`#F2758F` (pink)   |`#C4335A`                          |
|RB      |`#3AD0A4` (teal)   |`#0D7A5A` — deepened for the band  |
|WR      |`#57A9F2` (sky)    |`#1F6FC0`                          |
|TE      |`#F0964E` (orange) |`#AA5417` — deepened for the band  |
|DEF     |`#9AA3EE` (violet) |`#5A64C8`                          |

**Light RB and TE are deepened** so paper type on a `PositionBand` clears 4.5:1
(band labels are small bold type, not "large text"). Applied in: the
`PositionBand` (primary use), position labels/ranks, active position chips,
League rows' lit/muted letters (`POS_TEXT`; `POS_BAR*` are gone with the bars),
Roster Analysis lanes (`POS_SVG`), and `POS_TAG` tags.

### Pick round colors (consistent across entire app)

`src/utils/roundColors.js` (`ROUND_CLASSES`, `ROUND_TEXT`, `ROUND_LABELS`),
shared by PickBadge and TeamCard — never redefined locally. **A round is
ORDINAL, so the encoding is an INK-DENSITY RAMP, built only from existing
tokens** (it inverts by construction and spends no hue — the position colours
stay the only colour world on a roster screen).

|Round|Treatment                                    |
|-----|---------------------------------------------|
|1st  |solid ink field, ground reversed out         |
|2nd  |2px ink rule, transparent                    |
|3rd  |1px `--border-strong`, `--text-secondary`    |
|4th  |1px `--border-default`, `--text-tertiary`    |

### Status / verdict colors (consistent throughout)

|Status                |Color        |When used                                     |
|----------------------|-------------|----------------------------------------------|
|🔴 Hard block / Decline|Danger red   |Out, IR, bye, decline verdict                 |
|🟡 Soft flag / Counter |Warning amber|Questionable, projection flag, counter verdict|
|🟢 Confirmed / Accept  |Success green|Healthy, optimal, accept verdict              |
|🎯 Priority            |Ink          |Top trade partner tier                        |
|✅ Good Fit            |Muted green  |Second trade partner tier                     |
|⚪ Poor Fit            |Text tertiary|Lowest trade partner tier                     |

Verdict blocks use a **flat tint** (`bg-x/10`). **Status colours never appear on
an ink field and never mean a position or a section.**

### Win window tier colors

`src/utils/tierColors.js` (`TIER_BADGE`, `TIER_TEXT`), shared by
`WinWindowBadge` and the League banner — never redefined. Contending takes the
**ink family**.

### Rank medals

Top 3 ordinals are gold/silver/bronze via `rankClass(rank)`
(`src/utils/rankColors.js`); others text-tertiary. **Never on an ink field** —
there, top 3 is a `<Mark tone="ground">`.

### Team avatars

`src/components/shared/TeamAvatar.jsx`: custom team avatar
(`user.metadata.avatar`) → Sleeper CDN thumb → a deterministic **flat** initial
circle (hash of team name; position hues, `--alt`, `--brand`, ink). Static
`<img>` — not an API call, so not through `fetchJSON`. **Always render the
fallback on image error; a broken avatar must never break a card.**

### Ambient background — there isn't one

`.app-bg` and `.login-bg` are **flat**. **No gradients anywhere, no glows, no
radial washes, no conic sweep.** The fixed header is opaque (`bg-bg-secondary`,
no blur — rule 16) under a 2px ink rule. **Never re-propose an inset or neon
glow on a tinted content card** (built and reverted for reading muddy —
failure-archaeology §5a). Depth comes from **size and ground**, never elevation.

### Heroes, mastheads and bands

- **The poster hero** — The Edge, the Roster header, the Optimizer moves card,
  Playoff Odds, login: an `.ink-field-cap` strip over an `.ink-field` panel.
  **The Edge's hero keeps team value as its marquee figure** — leading with the
  instruction was built and **reverted on the owner's call (2026-09-11)**; the
  argument is in `review-2026-09/unasked.md` §1.
- **The app masthead** — display uppercase, a 2px ink rule; the contents rail
  carries the same rule.
- **`SectionHeader`** — label, count, a rule (Blackout's gradient/angled-cut
  lower-third is gone). For a position group, prefer **`PositionBand`**.
- **`Mark`** — the reversed-out word.

### Section identity colors — GONE (2026-09-11, DESIGN-3)

**Navigation carries no colour at all** — the old drawer gave Trade
`text-success` and League `text-warning`, status tokens reading as "good /
caution". Navigation is **text**: no icons, swatches or section hues, and the
Index carries no swatch (it would collide with position hues). **Red is rationed
to two surfaces:** the "you" treatments (You-chip, my-row borders, my-pick
highlights) and the **active contents-rail underline**.

### Logo — the Crown Crest

A crown of three ascending bars (a rising chart) with a jewel above each and a
detached base band. **Flat: two colours and one reversal** — a crimson field with
the crown in warm paper; wordmark "DYNASTY" in ink with **"EDGE"** reversed out
of crimson. **Every rect is square.**
- In-app lockup: `src/components/shared/DynastyEdgeLogo.jsx`.
- App icons: `node scripts/generate-icons.mjs` (sharp + png-to-ico, devDeps) →
  `public/`: `apple-touch-icon.png` (180px, **full-bleed, no border, no
  pre-rounded corners** — iOS masks it), `favicon-32x32.png`,
  `favicon-16x16.png`, `favicon.ico`, `logo.svg`.
- **The crown geometry lives in both the component and the script — keep them
  in sync and re-run the script after any change.** Never ship an icon with its
  own border or baked-in rounding.

### Typography

- **Display:** **Bricolage Grotesque**, variable — `wght` 200–800 (app uses
  700/800), `opsz` 12–96 driven automatically, `wdth` 75–100. Uppercase,
  negative tracking at display sizes. **Display-only — never body text.**
- **Body / UI:** `Archivo` (400–700, **plus italic** — the `.aside` voice).
- **Numbers / values / micro-labels:** `IBM Plex Mono` — values, scores, stat
  eyebrows, badges, chips, buttons (500–600 uppercase, wide tracking).

Three families from Google Fonts (`index.html`); **Anton is gone** (one weight,
the most generic sports face).

**Measured correction to the spec:** Google Fonts' Bricolage `wdth` axis runs
**75–100 with default 100** (`wdth@75..125` returns HTTP 400), so the spec's
`wdth 125` was a no-op. **`font-stretch` is NOT set** (it would clamp silently);
the work is in `opsz` and `wght`. **If Bricolage doesn't earn its keep on
device, the recorded swap candidate is Big Shoulders Display.**

**The type scale** — a custom ladder on a **1.25 ratio** in
`tailwind.config.js` (Tailwind's default is not a ratio), anchored at **`sm` =
14px**:

|Key|px|Key|px|
|---|---|---|---|
|`2xs`|8.96|`xl`|27.34|
|`xs`|11.20|`2xl`|34.18|
|`sm`|**14.00**|`3xl`|42.72|
|`base`|17.50|`4xl`|53.40|

**Each step carries its own line-height and letter-spacing** (1.55 at body to
0.90 at poster; +0.01em to −0.05em). A `tracking-*` utility at the call site
still wins.

- **`.aside`** (italic) is **one voice: the app's honest caveat** — never
  decoration, never emphasis (emphasis is a `Mark`).
- **`text-balance`** on `Button`, `SheetHeader`, `ErrorState`, Index rows, the
  player name.
- **`::selection`** is the ink field.

### Spacing and layout

- Content padding `16px` left/right; a `PositionBand` **cancels it** to bleed.
- **Panel radius 0**; sheets, modals and the drawer keep their radii and gesture
  contract.
- Side drawer `80vw`, max `300px`, safe-area aware.
- Section headers: Bricolage extra-bold 12px, wide tracking, over a rule.
- Player rows compact, and **nothing load-bearing truncates** — a long name
  wraps.

### Motion

> **Step 5 shipped 2026-09-12; this section is the live truth.** History (the
> pre-step-5 inventory, the bezier profile table, the press-probe counts, the
> cut options): `docs/history/design-system.md`.

**The reduced-motion guard is GLOBAL** — `index.css` closes with
`@media (prefers-reduced-motion: reduce)` over `*`, `*::before`, `*::after`,
zeroing animation/transition **duration and delay**, capping
`animation-iteration-count` at 1, setting `scroll-behavior: auto`, all
`!important` so **no screen or future primitive can opt out.** It was written
before any motion so nobody has to remember to extend it.
- **Duration 0.01ms, not 0** (0 skips the `end` event).
- **Delay → 0 too** (else a stagger leaves the last row blank).
- **CSS cannot reach a programmatic smooth scroll** — THE CALL's act anchors and
  Research's board jump go through **`scrollToTopOf`**
  (`components/ui/motion.js`), which reads the media query at call time.
- `useSheetDrag`'s spring-back is caught by the duration rule — correct.

**One curve: `--ez: cubic-bezier(.16, 1, .3, 1)`** (on `:root`), emitted as
Tailwind's **DEFAULT `transition-timing-function`**, so every `transition-*`
utility uses it with no call-site change. It is an expo-out — **nominal duration
is not perceived duration** (~88% of travel by a third of the duration), so set
a duration by the perceived travel you want, then roughly double it.

**Duration scales with how far a thing travels** (`tailwind.config.js` →
`transitionDuration`); `DEFAULT` stays 150ms:

|token|ms|for|
|---|---|---|
|`duration-tap`|90|press feedback — must read as instantaneous|
|`duration-mark`|150|small ink: a chip, a badge, a row tint, a link|
|`duration-panel`|240|a block, or an overlay resolving|
|`duration-sheet`|340|a full-width surface crossing the screen|

**The one exception is `useSheetDrag`'s inline `transform 0.25s ease-out`
spring-back — leave it exactly as it is** (gesture family, six settled battles).

**The press run — the signature entrance** (it replaced `.edge-rise`, a fade-up
with a linear stagger — two slop markers):

|class|what|duration|
|---|---|---|
|`.press-band`|a solid field prints left to right (`clip-path` inset from the right)|620ms|
|`.press-ink`|the type lands behind the band — a short drop from above with a slight vertical over-scale, `transform-origin: top`|580ms|
|`.press-set`|a row sets under a downward clip, opacity floor **0.2**, never 0|440ms|

**Compositor-cheap properties only (`clip-path`, `opacity`, `transform`);
nothing animates layout.** **The fill mode is `backwards`** — no fill flashes the
block during its delay; `both` leaves a permanent `clip-path` that **clips
`.tap-target`'s 44px hit area** (clip-path clips hit-testing).

**`stagger(index)`** (`components/ui/motion.js`) is a **cumulative sum of
independently drawn gaps** (0.6×–1.45× of 46ms, capped 420ms): **pure in the
index** (never `Math.random()` — React re-renders), **independent of call
order** (conditional sections), and **monotonic by construction** (a scaled
linear base inverts blocks).

**`.press` (`index.css`) is THE press definition** — a 90ms dip to 60% on `--ez`,
the third control-level contract beside `.focus-ring` and `.tap-target`. **Every
pressable carries it, and the primitives carry it** (one definition replaced 41
`active:` states at three values). **The dip is `filter: opacity()`, not
`opacity`** — it composes with a control's resting opacity (a 55% tab must not
get *brighter* when pressed). **`.press` owns the whole transition, so an element
carrying it takes no `transition-*` utility** (that would silently drop the dip).
`:not(:disabled)`. **Deliberately not `.press`:** the trade builder's remove
controls (danger/warning flash), the login team rows (background tint), the draft
board's drag handle. **Verify coverage by probing every pressable in the live
DOM, not by eye.**

**There is no spinner** (`animate-spin` and `animate-pulse` are named markers).
**`Loading`** prints a rule from the left, holds, clears (`.press-bar`, the press
run's wipe looped) — no track, no travelling segment. **The label is the
information; the movement is only liveness**, so under reduced motion it
degrades to a still rule under its label. The block form carries the 16px
gutter; `inline` is a 16px rule beside its label.

**The sheet arriving** prints up from the bottom edge (`.sheet-print`, 340ms)
while the scrim inks in (`.overlay-ink`, 240ms) — `Sheet`, `Modal`, and both
hand-rolled overlays. **It animates `clip-path`, never `transform`** —
`transform` belongs to `useSheetDrag`. **Nothing in `useSheetDrag`,
`useScrollLock`, arming, overscroll or safe-area padding was touched.**
`backwards` again (a lingering square clip would sit on the rounded panel).

**The moment budget — four moments; everything else is instant:**

| moment | where | why it earns a place |
|---|---|---|
| **the press run** | The Edge's entrance, and nowhere else | the signature |
| **the press** | every pressable, 90ms | the app answering a finger |
| **the sheet** | a sheet printing up from the bottom edge | the one surface that arrives |
| **the press bar** | loading | the app saying it is working |

**The press run is on the home screen only** — a 620ms wipe on every navigation
delays a screen you went to deliberately. **The signature stays app-wide as a
MATERIAL** (the same wipe carries the sheet and the loading bar), not a page
transition. Cut: per-screen entrances, a `Magnitude` roll-up (fires constantly,
and animating size shows the wrong quantity), a sliding tab marker, a verdict
reveal on THE CALL.

-----

## File Structure

```
dynastyedge/
├── .github/
│   ├── pull_request_template.md ← THE PR body layout (measured-result + evidence + docs + rollback gates)
│   └── workflows/
│       ├── deploy.yml          ← GitHub Actions auto-deploy (lint + test gate before build)
│       ├── ci.yml              ← lint + test + build on branch pushes / PRs (no deploy)
│       ├── news.yml            ← news aggregation (cron asks 2×/h; only main publishes) → news-data branch; ends with the source-health alarm
│       ├── values-history.yml  ← daily value snapshot + trade archive + monthly archive + consensus archive → values-history (only main publishes); ends with the source-health alarm (its snapshot steps are continue-on-error)
│       └── rookie-intel.yml   ← daily rookie depth-chart + draft-capital feed → rookie-intel branch; `mode` also runs the CFBD analyses (publish nothing)
├── scripts/
│   ├── fetch-news.mjs          ← multi-source news fetcher (runs in Actions)
│   ├── newsCoverage.mjs        ← THE feed depth metric (`coverage.depthHours`, p90 age of the player window), pure + tested — `spanHours` is set by stragglers
│   ├── newsRetention.mjs       ← THE feed retention policy, pure + tested: diversity-aware eviction so the cap never binds before the 7-day window
│   ├── fantasyCalcValues.mjs   ← THE pipelines' FantasyCalc reader, pure + tested: classify by id SHAPE; price a pick down the app's ladder, ending in NULL, never 0
│   ├── sourceHealth.mjs        ← THE source-alarm policy, pure + tested, shared by both pipelines: a persistent gap, never a blip
│   ├── check-source-health.mjs ← THE alarm: runs AFTER publish (can never cost data) and FAILS the workflow; a missing file is itself an alarm
│   ├── valuationSources.mjs    ← THE multi-source valuation readers, pure + tested (imports fantasyCalcValues.mjs, never copies it): crosswalk (`"NA"` = null), DynastyProcess, KTC JSON island joined on mfl_id (NOT ktc_id), archive merge
│   ├── snapshot-consensus.mjs  ← phase 4a: permanent DAILY three-source archive (app never fetches it); a failed source is an all-null column, never 0
│   ├── snapshot-values.mjs     ← daily FantasyCalc snapshot appender (runs in Actions)
│   ├── snapshot-values-archive.mjs ← permanent MONTHLY values archive for trajectory back-testing (app never fetches it)
│   ├── snapshot-trade-values.mjs ← permanent trade-time value archiver (runs in Actions)
│   ├── snapshot-rookie-intel.mjs ← daily nflverse → Sleeper rookie intel feed (runs in Actions)
│   └── dev/
│       ├── screenshot-app.mjs  ← headless-Chromium screenshotter (390px; --route, --player, --drawer, --seed-session, --click, --text, --overflow — see dynastyedge-visual-capture). `--overflow` is THE truncation instrument; `--text` cannot see a CSS ellipsis
│       ├── replay-live.mjs     ← drives the running app against a SYNTHETIC draft / regular season, so the two once-a-year surfaces can be rehearsed on demand
│       ├── faab-corpus.mjs     ← analysis-only: pulls the league's full FAAB bid corpus (see docs/analysis/faab-bid-corpus-2026-08.md); nothing imports it
│       ├── rookie-signal-backtest.mjs ← analysis-only: grades the SHIPPED rookie model against 2021–2025 (imports src/utils/rookieResearch.js so it cannot drift)
│       ├── rookie-longterm-backtest.mjs ← analysis-only: Phase 3c two-axis rookie score — REJECTED (docs/analysis/rookie-longterm-signals-2026-09.md)
│       ├── cfbd-probe.mjs        ← analysis-only, RUNS IN ACTIONS (needs CFBD_API_KEY): proves CFBD's athlete id IS the ESPN athlete id, so college data joins by ID and never by name
│       ├── rookie-college-backtest.mjs ← analysis-only, RUNS IN ACTIONS: Phase 3b college production — REJECTED (docs/analysis/rookie-college-production-2026-09.md)
│       ├── trade-structure-backtest.mjs ← analysis-only: the DISCONFIRMED trade-structure profiling test (frontier Item 3); drives the shipped buildManagerProfiles so it cannot drift
│       ├── optimizer-signal-backtest.mjs ← analysis-only: is a better weekly projection obtainable (no) and what DEF streaming is worth (docs/analysis/optimizer-data-sources-2026-09.md)
│       ├── asset-aging-backtest.mjs ← analysis-only: THE keep-score calibration — longitudinal aging + pick realization (docs/analysis/asset-aging-and-pick-value-2026-09.md)
│       ├── trade-fair-band-sweep.mjs ← analysis-only: THE OPEN-10 sweep — assembly window × APPEAL_BONUS jointly (one measurement), all ten seats, via the shipped suggestFairPackage's hooks
│       ├── contrast-audit.mjs ← THE accessibility-floor instrument: tokens from src/index.css vs each theme's worst-case ground, plus band/ink reversals; exits non-zero — re-run after ANY ground-colour change
│       └── news-coverage.mjs ← analysis-only: THE news acceptance metric — how many of my rostered players resolve in the feed (docs/analysis/news-sources-2026-09.md)
├── api/
│   └── mcp.js                  ← THE deployed Vercel function — a COMMITTED esbuild bundle (Vercel traces, doesn't bundle); ci.yml rebuilds and diffs it
├── vercel.json                 ← rewrites every path to the one function + pins an empty static root (without outputDirectory, Vercel can serve the repo root as static files)
├── mcp/                        ← THE MCP SERVER (see The MCP Server section). Imports src/utils, never copies it; src/ imports nothing from here.
│   ├── README.md               ← how to run it, the three rules a new tool must keep, phase-2 notes
│   ├── stdio.js                ← entry point (stdio transport). Needs --import ./mcp/register.mjs
│   ├── server.js               ← the McpServer: tool schemas + wiring, ZERO domain math
│   ├── snapshot.js             ← league fetch + ~15-min cache + THE as-of stamp (provenance makes a wrong answer LOOK wrong); mergeAsOf RECOMPUTES age over the union
│   ├── vercelEntry.js          ← the bundle's entry: accepts BOTH calling conventions, imports lazily, reports failures with a message — never a stack
│   ├── app.js                  ← THE hosted server: OAuth in front of MCP. Refuses to start without GITHUB_CLIENT_SECRET
│   ├── oauth.js                ← THE auth crypto + policy: HMAC tokens (no JWT lib), HKDF-derived key, PKCE S256-only, audience binding; no revocation (1h tokens), codes 60s
│   ├── oauthRoutes.js          ← the OAuth endpoints. Owns THE load-bearing check: redirect-URI exact-hostname allowlist BEFORE minting, failing to an error page
│   ├── http.js                 ← THE streamable-HTTP transport: Web-standard (Request) => Response, STATELESS by necessity; owns the auth gate, which fails CLOSED
│   ├── store.js                ← THE cache backend boundary + the ONE freshness policy (loadSource). memoryStore for stdio AND deployed HTTP (no KV wired). Traps: no store-level TTL; gzip the player DB into KV
│   ├── transactions.js         ← season transaction feed. A FOURTH, SPLIT TTL: settled weeks frozen, live week on the snapshot's 15 min. Reads weeks 1..current only
│   ├── history.js              ← the history walk, TWO widths: getLeagueHistory NARROW (no transactions, no users) → buildDraftGrades only; getLedgerHistory WIDE (+ users + buckets), per-season cache, an unread season NAMED, never cached
│   ├── liveScores.js           ← this week's box score — a FIFTH, SHORT TTL (5 min). NOT season.js's cache
│   ├── results.js              ← every season's winners bracket for get_league_results, on the NARROW walk (+ bracket + users, no transaction bucket); an unreadable bracket is NAMED, never cached
│   ├── feeds.js                ← ONE Class B loader for rookie-intel / trade-values / values-history: never throws; a wrong-shape 200 is a miss, never cached; 60 min / 60 min / 6 h
│   ├── news.js                 ← the news feed + matcher: `playerIds` only, NO headline-name fallback (two DJ Moores); carries its own age
│   ├── season.js               ← every regular-season week's matchups — a THIRD TTL; a total outage is never reported as a preseason
│   ├── weekly.js               ← projections + schedule, OWN ~60-min TTL. Owns the silent traps: schedule off /v1, fields home/away
│   ├── teams.js                ← resolveTeam, shared by three tools. Reads display_name — /users returns NO username
│   ├── limit.js                ← concurrency gate + backoff, honours Retry-After (capped 4s). NEVER in fetchJSON
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
│       ├── playerNews.js           ← #8 "latest on him?" — injury detail + the feed; ambiguous refused; silence is a coverage gap, never good health
│       ├── valueHistory.js         ← #13 "how has his value moved?" — getValueSeries + buildTeamValueSeries; < 4 snapshots is "not enough history yet", never flat or 0; untracked kept distinct
│       ├── leagueResults.js        ← #12 "who won in 2023?" — the p:1 winner; titles by OWNER; in-progress/unreadable never "no champion"
│       ├── scoutManagers.js        ← #11 "how does this manager trade?" — buildManagerProfiles; tracks seasons READ (unread ≠ non-trader); FAAB in budgets; tradeTimeTotals
│       ├── researchRookies.js      ← #10 "which rookies?" — buildRookieBoard; ONE score; no feed entry is NULL, never 0; unreadable feed = available:false, never "no rookies"
│       └── findTradeTargets.js     ← #9 "who do I call about?" — no TTL of its own (the snapshot's); a pick's id READ OFF the asset, never a label
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
│   │   │   ├── Magnitude.jsx        ← THE value figure: type SIZE is the quantity; reference PINNED to a contract, never per list
│   │   │   ├── Loading.jsx          ← THE loading indicator — a printing rule under a label. There is NO spinner
│   │   │   ├── RuledList.jsx        ← THE DENSE register (finding B7): rows on the page's ground, hairline separators, NO box
│   │   │   ├── Row.jsx              ← THE member of a RuledList — always carries .focus-ring
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
│   │   ├── useRookieResearch.js ← THE rookie board's memo for Research AND the drawer; the composition is buildRookieBoard (shared with the MCP server)
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
│   │   ├── leagueState.js       ← THE five-source join (buildLeagueState) every analysis function eats; useLeague only calls it
│   │   ├── teamName.js         ← getTeamName — in utils, not hooks, so the analysis layer stays React-free (re-exported from useLeague for the 22 components that import it there)
│   │   ├── valueHistory.js     ← MIN_SPARKLINE_POINTS + THE per-player series rule (getValueSeries) and its dated/coverage/slice/summary companions
│   │   ├── appVersion.js        ← pure reload-URL builder for the version self-heal
│   │   ├── positionColors.js    ← position identity color class maps — use everywhere
│   │   ├── roundColors.js       ← pick round color classes (PickBadge, TeamCard)
│   │   ├── tierColors.js        ← win-window tier colors (badge + banner chips)
│   │   ├── rankColors.js        ← gold/silver/bronze medal colors for rank ordinals
│   │   ├── tradeAnalysis.js     ← trade scoring, verdict logic; buildSideFit is ONE fit engine called from BOTH seats (buildPartnerFit = the `them` wrapper, myFit = my seat, display-only)
│   │   ├── edgeBriefing.js      ← The Edge: signals, briefing items, GM line
│   │   ├── managerAnalysis.js   ← manager scouting: ledgers, tendencies, draft grades; buildDraftGrades (draft record without the ledger, same buildDraftRecords); tradeTimeTotals (shared with scout_managers)
│   │   ├── rosterAnalysis.js    ← positional strength, win window tiers, Targets ranking (need × value × movability)
│   │   ├── recommendations.js   ← THE assistant-GM brain: keep/givability scores (round-priced picks, past-peak age tilt), FA pickups, two-sided sell moves, the cash-out board
│   │   ├── faabBid.js           ← THE FAAB bid (OPEN-3), shared with recommend_free_agents: CURRENT period's budget from settings (never assumed), 11/16/23% of the FULL budget capped at what is left, $2 floor on $1000, null for DEF/unpriced
│   │   ├── marketTrend.js       ← THE market-trend rules (±50, buy-low/sell-high eligibility, % move) — one home, read by every arrow, list and MCP tool
│   │   ├── fairBand.js          ← THE definition of "fair" (±5%), shared by the Analyzer's verdict and every surface that PREDICTS it
│   │   ├── dynastyTrajectory.js ← forward value projection: market age curves + pick maturation
│   │   ├── seasonWindow.js      ← THE "has the rookie draft happened yet?" resolver — the live pick window + which draft the Tracker shows (replaced the hand-rolled PICK_YEARS)
│   │   ├── pickCapital.js       ← pick ownership (year weights relative to the window, never literal years) + THE spent-pick ladder shared by Activity and the ledger (buildDraftPickIndex, buildGenericRoundValues)
│   │   ├── leagueResults.js     ← THE bracket reader: champion = w of the p:1 game, placements carry owner_id; pure, used by get_league_results
│   │   ├── rookieAdp.js         ← derived rookie-class ADP for the Draft section + buildRookieMap, THE rookie-class rule (moved out of useSleeperRookies)
│   │   ├── rookieResearch.js    ← rookie opportunity model: depth × capital, within-position divergence; buildRookieBoard is THE board composition
│   │   ├── positionalValue.js   ← scarcity / value over replacement — replacement levels LEARNED from the live league, DISPLAY ONLY
│   │   ├── rosterSpace.js       ← active-slot headroom for a trade; reports owed drops, NEVER calls a trade illegal
│   │   ├── partnerActivity.js   ← a partner's recent adds from the cached transaction feed (descriptive only)
│   │   ├── pickTrades.js        ← pick trade calculator: slot pricing + packages
│   │   ├── peakWindows.js       ← position peak-age windows + status helper
│   │   ├── draftLive.js         ← THE rookie draft live path (on the clock, countdown, Best Available, capital, recap grades) — pure, extracted from DraftTracker so it is testable
│   │   ├── lineupBuild.js       ← THE optimal starting-lineup slot-fill (metric-agnostic); fed points (Optimizer) or dynasty value (Trade Analyzer fit sim)
│   │   ├── lineupMoves.js       ← THE weekly start/sit engine: solves the lineup, diffs it against yours, emits the move list (gains sum to the headline)
│   │   ├── lineupConfidence.js  ← the MEASURED hit-rate curve behind "61% likely to be the right call" — regenerate, never hand-edit
│   │   ├── freeAgents.js        ← THE waiver-options list (never gated on FantasyCalc; TEAM_* guard) AND the dynasty FA pool, which can never return a defense
│   │   ├── lineupHistory.js     ← optimal-lineup POINTS math for efficiency review (delegates to lineupBuild)
│   │   ├── playoffOdds.js       ← scoring model + Monte Carlo + deadline verdict; buildPlayoffOutlook is THE composition (the hook keeps only the memo)
│   │   └── projections.js       ← lineup optimization, matchup quality
│   ├── context/
│   │   └── LeagueContext.jsx
│   ├── navigation.js            ← THE navigation map — one tree read by TabBar, SectionContents, IndexView and global search
│   ├── constants.js             ← league ID, API base URLs, feed URLs, PICK_YEARS, ROSTER_SLOTS
│   ├── App.jsx
│   └── main.jsx
├── docs/                        ← durable analysis + design records (not shipped)
│   ├── open-items.md                ← THE living "what's next" backlog — deferred work + trigger conditions
│   ├── archive/                     ← SPENT docs, kept and never deleted (CLEANUP-1); README.md indexes it (incl. open-items-2026.md, every closed record)
│   ├── analysis/                    ← model calibration + research notes (trade-fair-band-2026-09.md supersedes §4 of trade-my-side-read-2026-09.md)
│   └── design/review-2026-09/       ← THE review that superseded Phase 3: findings · inventory · slop-checklist · directions (Matchday) · unasked · mocks/ (never imported)
├── tests/                       ← plain-Node test suite (node:test + node:assert/strict, zero deps)
│   ├── fixtures/
│   │   └── draft-2025.json          ← this league's REAL 2025 rookie draft (board, 40 picks, 24 traded picks) — replayed by truncation to synthesize every mid-draft state
│   ├── draftLive.test.mjs           ← draft live path on the real 2025 draft: order (both tiers), clock/countdown at every pick, Best Available, capital; recap VOE sums to zero, volume never earns a grade, unpriced class = no grade
│   ├── sleeperDraft.test.mjs        ← mocked-fetch: single-draft endpoint merged over the list (slot_to_roster_id), session cache, best-effort sub-fetch degradation
│   ├── projections.test.mjs         ← lineup engine inputs: defense rankings via player DB + schedule, home/away, Week-1 empty stats, flags
│   ├── playoffOdds.test.mjs         ← fixed-seed determinism, Σ odds = playoff teams, thresholds; buildPlayoffOutlook's three states (posted-but-unplayed is ACTIVE)
│   ├── seasonWindow.test.mjs        ← the draft-completion boundary (only `complete` rolls a season; auctions never count); Tracker selection; no NFL state → seed
│   ├── pickCapital.test.mjs         ← ownership, round medians, year weights BY DISTANCE (a rolled year never scores 0), the spent-pick ladder
│   ├── pickTrades.test.mjs          ← slot tiers (as coded), slot pricing fallback, package constraints
│   ├── faabBid.test.mjs             ← the FAAB bid: budget read (none → no bid), current remainder, same % at $100/$1000, every tier, $2/$1 floor + waiver_bid_min, week scaling, the cap, null for DEF/unpriced, shared pickup context
│   ├── managerAnalysis.test.mjs     ← past-pick ≈ round-median fallback, ±5% win/loss banding
│   ├── appVersion.test.mjs          ← reload URL: ?v= before the hash (HashRouter), encoding, null build id
│   ├── tradeTargets.test.mjs        ← Targets: deficit gate, scoped mode keeps depth (never empty), movability TILT (nothing hidden), position filter INSIDE the ranking
│   ├── tradeAnalysis.test.mjs       ← the trade engine: suggestion inside buildFairBand (asked, never a literal; old search kept as an executable bug statement), Layer 3 odds/tier basis, alternative, phase-2 trade-off, fills scored once, my-lineup gate (only downgrades), verdict ladder, counter, lineup-sim fit, myFit can NEVER move a verdict, depth charts (post-trade getContext), two-phase builder, pick identity triple
│   ├── tradeContext.test.mjs        ← the five negotiating signals — NONE may move the verdict
│   ├── dynastyTrajectory.test.mjs   ← per-year clamps, hold-flat contract, pick maturation
│   ├── lineupBuild.test.mjs         ← slot-fill order (singles → FLEX → SFLX), IR/taxi excluded, who-starts identity
│   ├── lineupMoves.test.mjs         ← start/sit engine: GAME LOCKS (no move from a sealed slot; played score is fact; no live score → projection, NEVER 0; empty set = unknown), Σ gains = headline, both old per-slot bugs, empty DEF, confidence + coin-flip demotion
│   ├── freeAgents.test.mjs          ← waiver options: FantasyCalc must not gate the list, TEAM_* guard, `—` for unranked, one-defense rule
│   ├── lineupHistory.test.mjs       ← optimal-lineup slot-fill order (singles → FLEX → SFLX)
│   ├── matchupWeeks.test.mjs        ← mocked-fetch: one fetch/week across both consumers, all-fail rejection
│   ├── rookieAdp.test.mjs           ← ROOKIE-1: rookie→FantasyCalc join by sleeperId only (the two Jaylen Smiths; a same-name-same-position veteran)
│   ├── valueHistory.test.mjs        ← the sparkline rule: 4-point threshold, dated series = getValueSeries, tracked-short vs untracked, slicing never widens
│   ├── rookieResearch.test.mjs      ← opportunity blend, one points scale, within-position divergence, fit re-ranking (score untouched), measurables can never move a score
│   ├── marketTrend.test.mjs         ← the ±50 boundary (exactly 50 is flat), predicates = the literals they replaced, AND a source scan that fails on a second copy
│   ├── recommendations.test.mjs     ← suggestSellMove two-sided; pick keep by round; past-peak tilt (decline-only, never protects); cash-out gap = buildFairBand's
│   ├── fantasyCalcValues.test.mjs   ← pipeline FantasyCalc reader: non-numeric id is a PICK, NULL not 0, old presence classifier as a regression statement
│   ├── sourceHealth.test.mjs        ← the alarm AND its restraint: 3-day gap fires, 1-day blip doesn't, fresh archive never alarms, one dark source implicates no other
│   ├── valuationSources.test.mjs    ← three-source readers: "NA" null, KTC on mfl_id (Gore Jr./Sr.), superflexValues only; a failed source all-null, never 0, never prunes
│   ├── newsCoverage.test.mjs        ← the depth metric: stragglers cannot set it; general items excluded
│   ├── newsRetention.test.mjs       ← retention: newest-N-per-player, breadth preserved, roundups charge every player, id-less items never dropped by quota
│   ├── transactions.test.mjs        ← mocked-fetch: all-18-buckets-failed rejection, per-bucket degradation
│   ├── leagueState.test.mjs         ← buildLeagueState: string ids + '0' sentinel (rule 8), unranked kept (rule 7), ORIGINAL owner's slot, FAAB from settings, immutability
│   ├── mcpOauth.test.mjs            ← auth as ATTACKS: foreign/lookalike redirect refused without redirect, PKCE plain refused, wrong audience refused, allowlist per request, token kinds distinct
│   ├── mcpHttp.test.mjs             ← HTTP gate: throwing authenticator never authorized, EVERY post authenticated, RFC 9728 401, no session id, GET leaks nothing, same tools as stdio BY NAME
│   ├── mcpStore.test.mjs            ← store: fetchedAt round-trips, gzip, stale fallback vs cold throw, THE evicting-store trap, broken store = slower never broken
│   ├── mcpLimit.test.mjs            ← limiter: concurrency cap, bounded backoff on 429/503, a 404 never retried
│   ├── mcpSnapshot.test.mjs         ← snapshot: 15-min TTL, values + player DB cached ACROSS leagues, oldestSourceAt = stalest, serve-stale vs cold throw, shape guards
│   ├── mcpGetRoster.test.mjs        ← get_roster: never guesses a team, value:null + unranked:true, taxi/IR slots, bounded output
│   ├── mcpWeekly.test.mjs           ← weekly layer: offseason ZERO requests, schedule off /v1, home/away (wrong names = empty set), empty playingTeams = byes unknown, TTL > snapshot's, mergeAsOf
│   ├── mcpFindSellHigh.test.mjs     ← find_sell_high: a CONCRETE partner and return; "no sell-high" stated as the answer
│   ├── mcpRecommendFreeAgents.test.mjs ← recommend_free_agents: never a defense in the general list; DEF refusal names the incumbent; offseason projectedPoints null, never 0
│   ├── mcpResolveAssets.test.mjs    ← resolve_assets: ambiguous resolves to NOTHING; pick ids round-trip; unranked findable
│   ├── mcpAnalyzeTrade.test.mjs     ← analyze_trade: free text REJECTED even if unambiguous; owning-roster price; both seats; concerns ⊂ reasons
│   ├── mcpTransactions.test.mjs     ← transactions: weeks 1..current, SPLIT TTL (one request on refresh), outage ≠ "no moves" and a quiet partner still is
│   ├── mcpLeagueResults.test.mjs    ← get_league_results: p:1 winner, in-progress never "nobody won", titles by owner, no transaction bucket, unreadable named and not cached
│   ├── mcpScoutManagers.test.mjs    ← scout_managers + wide walk: never-traded vs couldn't-read both ways, FAAB in budgets, null for zero value, unread season NOT cached
│   ├── mcpHistory.test.mjs          ← narrow walk: zero transaction and user URLs, '0' sentinel, a failed drafts LIST is unavailable not "never drafted"
│   ├── mcpSeason.test.mjs           ← season layer: total failure never a preseason, one bad week alone, range from settings, its OWN TTL literal
│   ├── mcpPlayoffOdds.test.mjs      ← get_playoff_odds: preseason null + PREVIEW (never 0), posted-but-unplayed ACTIVE, unavailable ≠ preseason, Σ odds = field
│   ├── mcpNews.test.mjs             ← news: playerIds THE join, NO headline fallback (two DJ Moores), roundups flagged, Class B degradation, stale-feed warning
│   ├── mcpLineupAdvice.test.mjs     ← lineup_advice: offseason no zeros, Σ gains = headline, must-fix no confidence, confidencePct a percentage
│   ├── mcpValueHistory.test.mjs     ← get_value_history + loader: not-enough-history null (never flat/0), untracked distinct, team line = buildTeamValueSeries, Class B
│   ├── mcpResearchRookies.test.mjs ← research_rookies + feeds.js: score IS the util's, combine moves nothing, null never 0, unreadable feed = whole class in value order
│   ├── mcpFindTradeTargets.test.mjs ← find_trade_targets: position filter INSIDE the ranking, cap disclosed, twin picks resolve to the RIGHT one
│   └── helpers/mcpFixtures.mjs      ← ONE synthetic league shared by the MCP suites — never divergent copies
├── index.html
├── eslint.config.js             ← ESLint 9 flat config (recommended + react-hooks, src/ + scripts/)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

**Install dependencies first: `npm ci`** (never `npm install` — it can rewrite
the lockfile). A fresh clone has no `node_modules`, and **`npm test` does not
report that honestly**: it prints failing tests that read like a code regression,
because a file that cannot load never runs its tests. `npm run build` in the
same state fails with `sh: 1: vite: not found`.

**Current counts (verified 2026-10-07 by moving `node_modules` aside):** with
dependencies **`# tests 835 / # pass 835`**; without them **`# tests 792 / #
pass 787 / # fail 5`**. **If the test count isn't 835, run `npm ci` before
debugging anything.**
- **Check the GAP, not the totals: it is 43 and has never moved** — the tests in
  the five files that cannot load without `node_modules`. Four reach React
  through a hook (`draftLive`, `matchupWeeks`, `sleeperDraft`, `transactions`)
  and **`mcpHttp`** imports the MCP SDK, a genuine runtime dependency. An
  unchanged gap means every test added loads with no `node_modules`.
- **Re-measure both counts whenever the suite grows**, and update this block —
  it is the one place the live totals are kept. **An uneven delta is acceptable
  only when you can name the file that caused it and why**; an unexplained one
  means a test reached something it should not (React, or `zod` out of
  `mcp/server.js`). The full re-measurement history:
  `docs/history/file-structure.md`.

**Tests:** `npm test` runs `tests/` — plain `.mjs` on Node's built-in
`node:test` with `node:assert/strict`, **zero new dependencies**. One committed
fixture, `tests/fixtures/draft-2025.json` (this league's real 2025 draft),
truncated to synthesize every mid-draft state. The script registers the resolver
hook at `.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs`
(extensionless imports). Scope: **the pure analytical utils plus the
module-level fetch loaders** (mocked `globalThis.fetch`); components and hook
rendering stay out. **Every assertion cites the documented behaviour it pins**,
so a failure is a regression or doc drift, never a mystery. The suite proves
logic is deterministic and threshold-correct — **not that the models are
calibrated** (that bar is real-data verification).

**Live-surface rehearsals:** `scripts/dev/replay-live.mjs` drives the running
app in headless Chromium over a synthetic world on a few endpoints:

```bash
npm run dev &
node scripts/dev/replay-live.mjs --scenario draft            # pre → clock → mid → complete
node scripts/dev/replay-live.mjs --scenario week1            # Week 1, offseason gates open
node scripts/dev/replay-live.mjs --scenario week1 --week 6   # mid-season (real matchup quality)
```

Screenshots land in `.screenshots/replay-<scenario>/` (sandbox gotchas: the
`dynastyedge-visual-capture` skill). The tests pin the logic; this proves the
components render it.

**NEITHER LINT NOR BUILD CAN CATCH AN UNDEFINED COMPONENT.** eslint-scope does
not resolve a `JSXIdentifier` (`react/jsx-no-undef` is not installed), and Vite
fails only at runtime, so `<Foo />` with no `Foo` passes lint, tests and build
and **white-screens the view and the whole app tree** (no error boundary). This
has shipped to `main` twice. Two instruments:
- **Whenever a prop is removed from a lookup map, run**
  `grep -rnoE '<[a-z][A-Za-z0-9]*\.[A-Z][A-Za-z0-9]*' src --include=*.jsx` —
  it finds the whole `<meta.Icon />` family; a route sweep finds only what a
  given data state reaches.
- **Render every route** with `scripts/dev/screenshot-app.mjs`, failing on
  `pageerror`; **run the suspect route first or reload between routes** (a crash
  kills the tree and every later route reports empty).
- **A route sweep whose data never loads is not a route sweep** — a view stuck
  on `ErrorState` never renders the crashing component. **Assert the data
  arrived** (rendered text length is a cheap proxy). With `curl -L`, headers
  arrive per hop — parse accordingly.

**Lint:** `npm run lint` — ESLint 9 flat config (`eslint.config.js`) over
`src/`, `scripts/` and `mcp/`: `@eslint/js` recommended plus
`react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`, **all at error
severity**. `eslint` + `eslint-plugin-react-hooks` are the two owner-sanctioned
lint devDependencies (globals are hand-written literals). `no-unused-vars` uses
`varsIgnorePattern`/`argsIgnorePattern` `^[A-Z_]` (JSX references aren't
counted); lowercase unused variables still fail. `ci.yml` runs lint + test +
build on every branch push and PR, and `deploy.yml` runs the same gate before
building `main`. **Both run Node 22 — never pin them back to Node 20** (the test
glob needs Node ≥ 21; the news/values pipelines, which run no tests, use 20).

**Action runtimes are a separate axis from `node-version`.** Every workflow pins
`actions/checkout@v5` + `actions/setup-node@v5`, and `deploy.yml`
`actions/deploy-pages@v5` (all `node24`) — **don't downgrade to v4.**
`actions/configure-pages` stays at **v4** (its v5 is also node20);
`upload-pages-artifact@v3` is composite. Re-check when GitHub ships a node24
`configure-pages`.

-----

## GitHub Pages Deployment

Every push to `main` builds and deploys automatically — **gated by `npm run
lint` and `npm test`, which must pass before build and publish.** No manual
steps. (History — the full workflow listing and the iOS cache diagnosis:
`docs/history/deployment.md`.)

### GitHub Actions workflow

`.github/workflows/deploy.yml` (the file is the source of truth): on push to
`main` → `actions/checkout@v5` with **`fetch-depth: 0`** → `setup-node@v5`
(Node 22, npm cache) → `npm ci` → `npm run lint` → `npm test` → `npm run build`
→ `configure-pages@v4` → `upload-pages-artifact@v3` (`dist`) →
`deploy-pages@v5`. Permissions `contents: read`, `pages: write`, `id-token:
write`; `concurrency: pages` (no cancel-in-progress). **`fetch-depth: 0` is
LOAD-BEARING** — the build id is a first-parent commit count, and a shallow
clone makes it 1 for every build.

### Vite config

`vite.config.js` sets **`base: '/dynastyedge/'`** (must match the repo name
exactly) and stamps one build id into **both** the bundle (`__BUILD_ID__`, via
`define`) and an emitted `version.json` (an inline plugin).
- **The build id is a BUILD NUMBER**: `git rev-list --count --first-parent
  HEAD`, +1 per merge to `main`. Not the PR number (pushes to `main`, including
  the keepalive commit, have none).
- **If the repo is shallow** (`git rev-parse --is-shallow-repository`), it falls
  back to a timestamp id — never a duplicate. `formatBuildId` renders digits
  verbatim and date-formats only the fallback.
- **`version.json` must be EMITTED by the build, never committed under
  `public/`** — a checked-in copy drifts from the compiled id, and drift either
  way breaks the self-heal. `__BUILD_ID__` is declared in `eslint.config.js`;
  `npm run dev` emits no `version.json`, so the check no-ops in dev.

### App version self-heal

**The problem:** an iOS home-screen app keeps its own WebKit cache, and Pages
serves `index.html` with a fixed, unconfigurable `max-age=600`, so a cold launch
can boot **cached HTML pointing at old chunks**; a reload hits the same cache
entry.

**The mechanism (`useAppVersion` + `utils/appVersion.js`):** the bundle fetches
`version.json` and compares build ids.
- **Cold start reloads silently** (nothing in flight). **On focus it only
  reports** (`updateAvailable` → the drawer's "Update available — Reload"
  row) — yanking a half-built trade is worse than a stale render.
- **The reload target is `?v=<build id>` placed BEFORE the hash** — it must be a
  real URL change (a hash edit reuses the cache entry), and the app is a
  HashRouter, so a query after the hash folds into the route.
- **Loop guard:** sessionStorage `dynastyedge_version_reload` records which id
  was already reloaded toward; still stale ⇒ never retry, fall back to the row.
- **The check uses a unique query per request (`?t=<now>`), not `cache:
  'no-store'`** — the problem is caches that don't honour instructions.
- **Called above the identity gate**, so a stale login screen self-heals too.
- Returns **`buildId`** and **`versionState`** (`current` / `stale` /
  `unknown`) for the drawer's "App build" row; **`unknown` (dev or a failed
  check) must never render as "up to date".**
- **Best-effort, fails open — deliberately NOT a service worker**, which could
  pin the app to a stale build with no escape hatch.
- Caveat: the first launch after a deploy still paints the old UI briefly.

### GitHub Pages setting (one-time, done manually)

Repo → Settings → Pages → Source: **GitHub Actions**. Set once.

-----

## Constants File

`src/constants.js` — **never hardcode these values anywhere else:**

```js
export const LEAGUE_ID = '1313933520715907072'

// Identity is runtime state, not a constant — the signed-in roster comes from
// the `useIdentity` store (see Feature 18). These remain only as the league's
// original-owner reference; nothing reads them as the source of truth.
export const MY_ROSTER_ID = 6
export const MY_USERNAME = 'chnates'
export const MY_TEAM_NAME = 'Nix Cage'

export const SLEEPER_BASE = 'https://api.sleeper.app/v1'
// The NFL schedule is the ONE Sleeper endpoint NOT under /v1 (that path 404s
// for every season). Fields are `home`/`away`, not `home_team`/`away_team`.
export const SLEEPER_ROOT = 'https://api.sleeper.app'
export const FANTASYCALC_BASE = 'https://api.fantasycalc.com'
// Unofficial ESPN API — no auth; per-player news only, degrades silently
export const ESPN_BASE = 'https://site.api.espn.com'
export const ESPN_WEB_BASE = 'https://site.web.api.espn.com'

// Static feeds published by GitHub Actions to their data branches
export const NEWS_FEED_URL      = '…/dynastyedge/news-data/news.json'
export const VALUES_HISTORY_URL = '…/dynastyedge/values-history/values-history.json'
export const TRADE_VALUES_URL   = '…/dynastyedge/values-history/trade-values.json'
export const ROOKIE_INTEL_URL   = '…/dynastyedge/rookie-intel/rookie-intel.json'

export const FANTASYCALC_PARAMS = {
  isDynasty: true,
  numQbs: 2,       // Superflex
  numTeams: 10,
  ppr: 0.5,        // Half PPR
}

// SEED ONLY — the live window is derived per load (see the note below).
export const PICK_YEARS = ['2026', '2027', '2028']
export const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// Ordered roster slots — indices match Sleeper's `starters` array positions.
// The shared slot-fill engine (utils/lineupBuild.js) reads this.
export const ROSTER_SLOTS = [ /* QB · RB×2 · WR×2 · TE · FLEX×3 · SFLX · DEF */ ]
```

(The four feed URLs are full `raw.githubusercontent.com/chnates/…` URLs in the
real file.)

**`PICK_YEARS` is a SEED, not the source of truth.** The live three-season
window comes from **`utils/seasonWindow.js`** and reaches the app as
**`pickYears` on `LeagueContext`**; every pick surface reads that, and the
constant only renders before `/state/nfl` resolves.
`resolvePickYears(nflState, drafts, seed)` asks one question — **has this
season's rookie draft been held?** The window starts at the current NFL season
until that season's non-auction draft reports `status: "complete"`, then at the
next one, plus the two after. **No extra request; with no NFL state it degrades
to the seed — never an empty window.** Why it stopped being hand-rolled:
**FantasyCalc retires a season's pick entries the moment its draft completes**,
so a stale window manufactures picks priced at 0 and hides the newest season.
(History: `docs/history/constants.md`.)

Two things the roll must not break, both test-pinned:
- **Year weights follow the WINDOW, not the calendar** (nearest draft 3×, next
  2×, third 1×). Keyed by literal year, a newly surfaced season scores 0.
- **The Draft Tracker keeps its recap** — `selectTrackedDraft` follows the
  upcoming draft whenever Sleeper has one, else the most recent completed one.
  `useSleeperDraft` exports `FALLBACK_DRAFT_SEASON` (a seed), and the Tracker
  reads its season off the draft it shows. **Trade › Pick Trades reads
  `pickYears[0]`** and refuses to borrow another season's draft board.

-----

## Rules Claude Code Must Always Follow

(History — the incident narratives behind rules 15–16 and the drift record:
`docs/history/rules.md`.)

1. **Read this entire file before writing any code in a new session.**
   Then, if the task is "what should I build next?" rather than a named change,
   read **`docs/open-items.md` §0** — the plan in priority order, each item with
   the trigger that makes it ready. An item carrying a **`Kickoff prompt`** is
   ready-to-run work the owner has signed off. **Never start an item whose
   trigger has not fired** — doing it early is a bug (OPEN-2: rolling the pick
   window before the draft broke the Tracker during the one event it exists
   for).
1. **Player resolution:** Sleeper returns IDs; FantasyCalc returns names +
   `sleeperId`. **Always join on `sleeperId`. Never guess player names from IDs.**
1. **Pick ownership:** derive from the `traded_picks` endpoint only. **Do not
   guess, assume, or hardcode pick ownership.**
1. **FantasyCalc caching:** fetch once at app load via `useFantasyCalc`; store
   at the app level and pass down via props or context. **Never fetch inside a
   component that renders repeatedly.** Auto-refresh on tab focus when data is
   > 30 min old, silently (stale-while-revalidate). **Sign-in must never depend
   on FantasyCalc** — `LoginScreen` reads `useLeague`'s Sleeper-only
   `signInRosters`, so a FantasyCalc outage can't lock the user out.
1. **Fetch timeouts:** every network call goes through `src/utils/fetchJSON.js`
   (AbortController timeout). **Never call raw `fetch()` directly.**
1. **Player DB:** `/players/nfl` once per session via `usePlayerDB`; all
   consumers (rookies, injuries, unranked names, lineup history, transaction
   feed) read that single cache.
1. **Unranked players:** rostered players with no FantasyCalc value (deep
   stashes, some rookies, DEFs) are still shown — name from the player DB, value
   `—`, contributing 0 to totals. **Never silently drop a rostered player from a
   roster view.**
1. **Sleeper ID normalization:** IDs arrive as strings or numbers by endpoint.
   **Normalize to `String(id)` at ingestion** (`useLeague` does); all lookups and
   joins use string IDs.
1. **FAAB display:** always `$XXX` (`$142`, not `142`).
1. **Dynasty values display:** whole numbers only, 0–10000 scale. **Never
   decimals.**
1. **Trend arrows:** `trend30Day > 50` → ↑ green · `< -50` → ↓ red · between →
   → grey. **One home: `src/utils/marketTrend.js`** (`TREND_THRESHOLD`,
   `MIN_TARGET_VALUE`, `trendDirection`, `trendPct`, `isBuyLowCandidate`,
   `isSellHighCandidate`, `trendTag`) — every arrow, Market Movers, The Edge,
   the pickup recommender and the MCP tools read it. Until 2026-10-07 the ±50
   was written out in ten places; `tests/marketTrend.test.mjs` fails if a
   second copy reappears in `src/` or `mcp/`.
1. **Offseason mode:** always check `/state/nfl` on load. If `season_type !==
   'regular'`, hide current matchups, the lineup optimizer and weekly
   projections; everything else stays fully functional.
1. **Win window tiers:** top 3 Contending, bottom 3 Rebuilding, middle 4
   Middle. **Recalculate whenever roster data refreshes.**
1. **Mobile layout:** every component works at 390px. **Nothing requires
   horizontal scrolling** unless explicitly designed as a swipeable list.
1. **Safe areas:** the main scroll area and the side drawer account for the
   home indicator and notch via `env(safe-area-inset-*)`. **`<main>` extends to
   the physical bottom (`bottom: 0`) and carries the clearance as
   `padding-bottom` INSIDE the scroll container — never shorten `<main>` with a
   bottom offset**, which clips content at a dead bar above the home indicator.
   **The bottom tab bar sharpens this rule:** `<main>` keeps `bottom: 0` and
   reserves the bar in its own `paddingBottom`
   (`calc(TAB_BAR_HEIGHT + env(safe-area-inset-bottom))`); the bar is its own
   fixed element at `bottom: 0` with the inset as *its* padding. **Writing
   `bottom: 4rem` on `<main>` re-creates the dead black bar already fixed twice**
   (`86903a7`, `e8cd044`). Headless Chromium cannot show it — get it right by
   construction.
1. **Standalone web app (Add to Home Screen):** `index.html` declares
   `apple-mobile-web-app-capable` + `manifest.webmanifest` (standalone, icons
   192/512) so iOS draws edge-to-edge. The status bar uses
   **`apple-mobile-web-app-status-bar-style` = `default`** (iOS auto-contrasts
   its text). Its colour comes from **two static `prefers-color-scheme`
   `theme-color` metas** — light `#E8E5DC`, dark `#141413`, each equal to that
   theme's `--bg-secondary` (the header). **Any ground-colour change must move
   them too**, or the bar stops matching the header. **They must be STATIC** — a
   JS-mutated `theme-color` is cached at launch in standalone mode (it once
   rendered a stuck black band). The header is **opaque** (`bg-bg-secondary`,
   no translucency or backdrop-blur) and fills the inset via `paddingTop:
   env(safe-area-inset-top)`. Caveat: the bar follows the system appearance,
   not the in-app toggle. **Meta changes take effect only after the user removes
   and re-adds the home-screen app.** Icon links carry `?v=N` — **bump it when
   the logo changes.** App *code* updates no longer need a re-add (App version
   self-heal).
1. **Bottom sheets:** `<main>` is the scroll container — the body never scrolls.
   **Every bottom sheet must:** call `useScrollLock()` while mounted, set
   `overscroll-behavior: contain` on its scroll container, pad its bottom with
   `env(safe-area-inset-bottom)`, and wire `useSheetDrag(onClose)` (`sheetRef`
   on the panel, `scrollRef` on its scroller) so swipe-down dismisses. **The drag
   arms only at scroll top. Never duplicate the gesture logic locally.**
1. **Error states:** every API call needs a loading state and an error state.
   **Never a blank screen** — on failure show a message and a retry button.
1. **Theme toggle:** `localStorage` `dynastyedge_theme`, default `dark`, theme
   class on `<html>`. **All theme logic lives in `useTheme` — never duplicate
   it.**
1. **localStorage / sessionStorage keys** (all prefixed `dynastyedge_`):
   `dynastyedge_identity_v1` (signed-in roster — Feature 18) ·
   `dynastyedge_theme` · `dynastyedge_watchlist_v1` ·
   `dynastyedge_action_dismissals` · `dynastyedge_edge_last_visit` ·
   `dynastyedge_draft_*` (manual draft tracker) · `dynastyedge_board_order` /
   `dynastyedge_prospect_notes` / `dynastyedge_csv_rankings` (Feature 10) ·
   sessionStorage `dynastyedge_league_sort` / `dynastyedge_league_pos` /
   `dynastyedge_league_tier` · sessionStorage `dynastyedge_trade_draft` ·
   sessionStorage `dynastyedge_targets_team` · sessionStorage
   `dynastyedge_version_reload` (self-heal loop guard).
   **Roster-scoped keys** — `dynastyedge_action_dismissals`,
   `dynastyedge_trade_draft`, `dynastyedge_targets_team` — are wiped by
   `useIdentity` on any identity change; league-wide caches are not. **Add a new
   key to that wipe list if it is tied to *which team you are*.**
1. **Shared components:** `ErrorState`, `SectionHeader` and `SectionContents`
   live in `src/components/shared/` — **import them, never redefine them.**
   Within-section navigation is always `SectionContents` (pass it a section key);
   primary navigation is
   `TabBar`. **Never add a destination to a component — add it to
   `src/navigation.js`**, which the tab bar, rails, Index and search all read.
1. **Design System library:** all new UI comes from `src/components/ui`
   (`Button`, `IconButton`, `Card`, `Mark`, `PositionBand`, `Magnitude`,
   `RuledList`, `Row`, `Lede`, `NavRow`, `Sheet`/`SheetHeader`, `Modal`, `Chip`,
   `Badge`, `Input`/`SearchInput`, `Textarea`, `Select`, `cn`, plus the
   re-exported shared primitives), imported from `'../ui'`. **Never reintroduce
   a hand-rolled button, card, sheet, chip, badge, band, value figure, row list
   or input — extend a primitive.** Four laws bind here: **colour is a field,
   never a left-edge rail**; **magnitude is type size, never a progress bar**; a
   **`Mark` never takes a position hue**; **a block is a ruled row, a `Lede` or a
   `NavRow` before it is a `Card`** (and never an enumeration of `Lede`s). Run
   `/design-review` on the CONSUMERS before committing component work — **and
   its judgement pass, not only its greps**; **audit for the SHAPE, not the
   API.**
1. **Lint gate:** `npm run lint` (ESLint 9, recommended + react-hooks at error
   severity, `src/` + `scripts/` + `mcp/`) **must exit 0 before any commit**,
   alongside `npm test` and `npm run build`; CI enforces all three. **Never fix
   a `react-hooks/exhaustive-deps` error by deleting the dependency array or
   blanket-disabling the rule** — add the dependency, or disable-with-comment on
   the one line stating why the value is stable.
1. **The app name is DynastyEdge** — in the page `<title>`, the header, and any
   loading/splash screen.
1. **The MCP server (`mcp/`) imports `src/utils` — it never copies it, and
   `src/` never imports from `mcp/`.** A tool is orchestration only; any math it
   needs is written in `src/utils`. Every tool response carries an as-of stamp,
   is bounded, and takes `leagueId` / `rosterId` as parameters. **Rate-limit and
   retry logic lives in `mcp/limit.js`, never in `fetchJSON`.** See **The MCP
   Server**.
1. **The proper fix beats the convenient one** (owner, 2026-10-07). When the
   technically correct change and the quick one differ, do the correct one, or
   name both and recommend the correct one. **When a rule, threshold or
   formula is written in more than one place, give it ONE home and have every
   consumer import it** — as its own change, with a test that fails if a copy
   reappears (the `marketTrend.js` pattern). A scope limit written by an
   earlier session is not the owner's rule unless the owner set it; when one
   blocks the proper fix, say so and ask.
1. **The owner is not technical — explain in plain English** (owner,
   2026-10-07). Decisions, trade-offs and results are written for a reader who
   does not read code: what it does, why it matters, what it costs. Code terms
   only where unavoidable, and explained when used.

-----

## Future Features (Do Not Build Yet)

> **"What's next?" is answered by `docs/open-items.md` §0** — the living backlog,
> in priority order, each item with the trigger that makes it ready. **An item
> carrying a `Kickoff prompt` is ready-to-run work with the owner's sign-off.**
> Some items are explicitly **not** ready (doing them before their trigger is a
> bug). The September 2026 build plan is archived
> (`docs/archive/build-plan-2026-09.md`); its still-cited §0/§8 rules live in
> `open-items.md` §0 and Phase 4b–d's spec in its PHASE-4BCD entry. The list
> below is the longer-horizon backlog.

These are noted so the codebase can support them later. **Do not implement them
until explicitly asked.**

- Push notifications for trade offers — needs a backend (out of scope), and
  Sleeper's read-only API may not even expose *pending* offers, so it is blocked
  on data availability, not just architecture.

### Already built (formerly future features)

- Rookie draft board and ADP tracker → Draft section
- Injury-status player news → PlayerProfileDrawer + trade analysis
- Player intelligence panel → PlayerProfileDrawer + trade Live Intelligence
  (`usePlayerIntel`)
- League transaction feed with FAAB bids → League › Activity
- Market movers / buy-low / sell-high → League › Movers
- Watchlist → `useWatchlist`
- Lineup efficiency season review → Squad › Season Review
- Playoff odds / rest-of-season simulator → League › Playoffs (Feature 14);
  strength-of-schedule is subsumed by it
- League-wide news feed page → News section (Feature 15)
- FAAB bid recommender → League › Free Agents and `recommend_free_agents`, from
  `utils/faabBid.js` (OPEN-3, 2026-10-07; graded Weeks 13–15 against
  `docs/analysis/faab-bid-corpus-2026-08.md` §10)
- Claude Design visual refresh → "Primetime Blackout" (2026-07-20), since
  superseded by "Matchday" — see Design System
