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

**Transactions note:** all 18 weekly buckets fetched in parallel and cached per
session. A failed bucket contributes nothing (per-week catch), but when **all
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
  treat cadence as a range, not a constant. Tightening the cron is not a fix.
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
`trend30Day > 50`, ↓ red if `< -50`, → grey between.

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

**Layer 1 — Raw value.** FantasyCalc totals and the % difference ("You're
getting 12% more value" / "You're overpaying by 8%").

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

**Refresh:** Board and Tracker share one session-cached fetch; a Refresh button;
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
  `dynastyedge_trade_draft`; the full list is rule 21). League-wide caches are
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

**The app is gated by sign-in** (Feature 18): until an identity is set, `App`
renders `LoginScreen` instead of the router — no route is reachable, and the
drawer's footer carries the "Switch team" / "Sign out" affordance.

**Navigation is a BOTTOM TAB BAR** (`components/shared/TabBar.jsx`) — four
weekly sections plus the Index. The old rule in this section said "There is NO
bottom tab bar … do not add a bottom nav"; the owner reopened it for the
September 2026 design review and it is **dead** (DESIGN-3, 2026-09-11). What
replaced it and why:

- The drawer was the app's **only map**, and it hid all 21 destinations behind a
  top-left tap on a one-handed 390px phone. NN/g measures hidden navigation at a
  **20%+ discoverability drop**, used in **57% of cases against 86%**, and
  **15% slower** on mobile. Four weekly sections fit the 2–5 visible tabs
  Apple's HIG and the iOS 26 tab bar assume.
- Both taps also went through a **full-screen overlay that hid the screen you
  were reading** — the thing that felt like "context-wiping". A bar doesn't.

**Navigation is TEXT.** No icon set anywhere in the bar or the Index — a
thin-line icon set is a named AI-slop marker and Matchday's house rules make
navigation typographic. The bar is an **ink field** — the same material as the
hero poster, the section band, the active chip and the CTA — and it inverts with
the theme by construction (`bg-text-primary` / `text-bg-primary`): a cream slab
in dark, an ink one in light. **Inverted in BOTH themes is the owner's call**
(2026-09-11), made when asked directly whether a cream slab pinned to the bottom
of every screen reads badly at night; the alternatives offered were inverting
only in light mode, or never. It carries no top border — the inversion is the
separation. Inactive tabs sit at 55% opacity; the active one is full opacity
with a 2px marker in the bar's own ink. Red is NOT spent here — it stays
rationed to "you" accents and the contents rail's active item.

**Two sections lost their top-level rank, not their reachability.** Draft is
three seasonal views and News is a browse that already surfaces its best items
on The Edge; a third of top-level navigation was being spent on things you
don't open in a normal week. Both keep every route and every existing entry
point, and both are on the Index — which is also the tab that reads as current
while you are in one.

|#  |Tab   |Route    |Feature name|Views                                       |
|---|------|---------|-----------|---------------------------------------------|
|1  |Today |`/edge`  |The Edge   |Daily briefing home screen (default route)   |
|2  |Squad |`/my-team`|My Team   |My Roster · Lineup · Season Review · Trajectory|
|3  |Trade |`/trade` |Trade      |Partners · Analyzer · Targets · Managers · Picks (+ deadline banner)|
|4  |League|`/league`|League     |Overview · Free Agents · Activity · Movers · Playoffs|
|5  |Index |`/index` |—          |The complete map — every section, plus the four consulted views|

**The nav labels and the feature names are deliberately different.** "The Edge"
and "My Team" are what the *features* are called throughout this document and
in the product; **Today** and **Squad** are what *navigation* calls them, in
Matchday's voice. **"Picks" joined them 2026-09-13** — the feature is still the
**Pick Trade Calculator** at `/trade/pick-trades` (Feature 13), and global
search still finds it by that name via `searchLabel`; only the rail's label
shortened, so the Trade rail fits on one line. Routes are unchanged (`/edge`, `/my-team`), so no deep-link,
briefing item or redirect is affected. The app header names the section using
the nav label, read from the same map, so the header and the bar can never
disagree.

**The Index (`/index`)** is the fifth tab and a real destination, not an
overlay: a Find row that opens the same `PlayerSearchSheet` the header icon
does, then every section with its views listed, then a **"Consulted, not
daily"** group holding Season Review, Dynasty Trajectory, Manager Scouting and
Rookie Research. Those four had **zero content-level inbound links** before
this — you reached them only by already knowing they existed. They are listed
here *as well as* in their own section's contents rail, and each now also has a
content-level link from the screen that raises the question it answers.

**Within a section, views are a contents rail** — `SectionContents`
(`src/components/shared/SectionContents.jsx`), never a hand-rolled row. It
replaced `SubTabBar`, and the two differences are the point:

1. **It is no longer a duplicate.** All 17 of the old bar's entries were
   byte-identical label→route pairs with the drawer's children — two navigation
   systems over one payload. The drawer now carries no destinations at all, so
   this is the only place a section's views are listed on a content screen.
2. **It WRAPS instead of scrolling.** The old bar was `overflow-x-auto` with a
   right fade, which put "Pick Trades" — a real destination — off-screen at
   390px until you scrolled a nav bar sideways. A wrapping, left-aligned line
   cannot hide an entry. Items are not `flex-1`, which is what made the old row
   wrap *badly* before it was converted to clipping. Each item is a real 44px
   touch target; `.tap-target` is deliberately not used, because on a row that
   wraps its oversized hit area would let vertically adjacent items steal each
   other's taps — the same reason `index.css` keeps it off `Chip`.
3. **It fits on ONE line in every section, and it still wraps if it ever
   can't** (2026-09-13). It was spending a second 44px row on **three of the
   four** multi-view sections — Squad, Trade *and* League, i.e. ~16 of the
   app's 18 content routes — putting **140px** of fixed chrome (50px masthead +
   90px rail) above the content on an 844px screen. Three changes bring every
   section to **96px**: the gap (16px → 10px), the tracking
   (0.08em → 0.055em), and shortening the two labels that were over on their
   own — **"Pick Trades" → "Picks"** and **"Free Agents" → "FA"**.
   - **`flex-nowrap` is NOT the mechanism and was reverted.** A first cut used
     it and appeared to fit all three; nowrap does not *fit* an over-long rail,
     it **hides** the overflow — reintroducing the exact A4 failure this
     component was built to fix. Switching back to `flex-wrap` is what exposed
     that League had never actually fitted. **A layout that "fits" under nowrap
     has not been measured, it has been silenced.**
   - **Measured headroom at 390px** (358px available inside the gutter), so the
     next person adding a view knows the budget: **Squad 344** (14 spare) ·
     **Trade 352** (6 spare) · **League 306** (52 spare) · **Draft 196**
     (162 spare). The numbers live in the component too. **Trade is the tight
     one** — a sixth view there, or a longer label on any of its five, puts it
     back on two rows, which is the honest failure mode `flex-wrap` preserves.
   - **`railLabel` is the shortening mechanism, and it is rail-only.** "FREE
     AGENTS" was 90px, the widest label in the app, and League was over by
     exactly 21px — no tightening closes that while staying legible. But
     `label` also feeds the **Index**, whose whole job is discoverability, and
     "Overview · FA · Activity · Movers · Playoffs" is a worse map. So
     `SectionContents` reads `railLabel ?? label` and **only the rail
     shortens**; the Index and global search still say "Free Agents". Same
     precedent as `searchLabel` — one consumer with a different constraint gets
     its own string, rather than every consumer inheriting the tightest one.
     Add a `railLabel` only when a section is measurably over budget.
   - **`FA` is not a coinage** — it is already this app's own vocabulary:
     League › Activity's filter chips read *All / Trades / Waivers / FA / My
     Moves*.

**Every navigable destination lives in ONE place: `src/navigation.js`.** The
tab bar, the contents rails, the Index and global search all read from it, so a
destination can only be added or moved once. It used to exist three times — the
drawer's `NAV_TREE`, four per-section `SUB_TABS` arrays, and
`PlayerSearchSheet`'s `DESTINATIONS` — which is how Rookie Research ended up as
the one view in the app that could not be found by searching for its own name.

**The side drawer survives with ZERO destinations.** The hamburger (top-left)
now opens the app's **utility surface**: manual Refresh, the per-source
data-status block, the running build, the theme toggle and Switch team / Sign
out. Deleting its nav tree also deleted a standing rule violation — it had been
assigning Trade `text-success` and League `text-warning`, the same status
tokens used for real success/error state in the same file, so a green TRADE
above an amber LEAGUE read as "good / caution" before it read as navigation.
**Status colours and navigation identity are separate and exclusive**; nothing
in navigation may wear a status token.

**Data status — five rows** (Rosters · Values · News · History · Rookies), each showing
the app-side "last refreshed" age of that source. **News carries a second,
indented line** — the retained window's depth and how many players it reaches,
amber when depth falls under 48h. Publish age surfaces a *dead* pipeline; that
line surfaces a *degraded* one (see the `coverage` block). The three Actions-published
feeds (News, History, Rookies) additionally show their **publish age** from the feed's
own `updatedAt` — labelled separately, because that's the number that only
moves when the cron publishes, and it's how a dead pipeline becomes visible.
Amber when news > 2h or values > 36h stale; a feed age hides entirely when
that feed never loaded (standard best-effort contract — never an error).
Reads the session caches via `loadNewsFeed` / `loadHistory` on drawer open —
zero extra requests.

An **"Update available — Reload"** row appears above Refresh only when the
running bundle is behind the deployed one (see App version self-heal). Cold
starts fix themselves silently, so this row is the mid-session case.

An **"App build"** row closes the block, below a hairline: the **build number**
the running bundle was compiled from (`__BUILD_ID__`), with a leading dot and a
suffix carrying what the last version check established — green **· up to
date** (server agrees), amber **· update ready** (it does not), or nothing at
all. The number is a first-parent commit count that advances by exactly one per
merge to main (PR #32 shipped build 131), so "am I on 132?" is answerable
against the repo in a way a timestamp never was.
**"Nothing" is the honest state and is never dressed up as reassurance:** the
dev server emits no `version.json` and a failed check proves nothing, so both
show the stamp alone. This exists because the self-heal is otherwise invisible
— it reloads a stale bundle silently, so the failure it protects against
leaves no trace, and after a deploy there was no way to confirm the phone had
actually picked it up.

**Refresh** is one button over five independent sources fired in parallel and
non-blocking: a `phase` state drives the button (idle → refreshing → done)
while each source tracks its own loading/done/error tick. Live APIs keep
cached data on screen while refetching (stale-while-revalidate), so no view
blanks.
The app header shows the active section name.

**Route map (post-refactor).** My-squad views live under `/my-team`
(`/my-team` = My Roster, `/my-team/lineup`, `/my-team/season-review`,
`/my-team/trajectory`). The market / everyone-else views live under `/league`
(`/league` = Overview, `/league/free-agents`, `/league/activity`,
`/league/movers`, `/league/playoffs`). Team **scouting drill-downs** are
standalone routes (no contents rail; header reads "League"):
`/league/teams/:rosterId` (any roster) and `/league/trajectory/:rosterId` (any
team's trajectory). Trade adds `/trade/pick-trades`; Draft is just
`/draft/board` + `/draft/research` + `/draft/tracker`. Every moved/renamed path keeps a redirect
(see Navigation Refactor below) so saved deep-links and Edge briefing items
keep working: `/roster*` → `/my-team*` (or `/league*` for the team list /
drill-downs / free agents), `/lineup*` → `/my-team/*`, `/draft/trades` →
`/trade/pick-trades`, `/league/managers` → `/trade/managers`.
**The navigation rebuild (DESIGN-3) moved NO path** — it added `/index` and
renamed labels only — so it needed no redirect of its own. That is deliberate:
`edgeBriefing.js` deep-links by path (`action.to`), so a missed redirect
silently breaks the home screen, and the cheapest way not to miss one is not to
move anything.

**Global search** lives in the fixed app header (search icon, top-right, on
every screen) — opens `PlayerSearchSheet`, a bottom sheet that searches the
cached FantasyCalc dataset by name (opening the matched player's
`PlayerProfileDrawer`) *and* matches section/feature names, surfacing a
"Jump to" group that deep-links to any view. Its destination list is read from
`src/navigation.js`, not hand-maintained, and its rows carry **no section
colour dot** — a section swatch would collide with the position hues, which are
load-bearing everywhere else. See Feature 16.

**Manager Scouting moved from League to Trade** (it's trade intel — "who do I
call?"). The old `/league/managers` path redirects to `/trade/managers` so saved
deep-links and briefing items keep working. The component files still live in
`src/components/league/` (`ManagersView.jsx`, `ManagerScoutingSheet.jsx`) — only
the route changed.

-----

## Navigation Refactor (Planned — phased, not yet built)

> **SUPERSEDED IN PART, 2026-09-11 (DESIGN-3 — the navigation rebuild).**
> Phase 2's central decision — *"the drawer stays; rebuild it as an
> always-expanded hierarchical map"* — was reopened by the owner for the
> September 2026 design review and **reversed**. The drawer's `NAV_TREE` is
> gone, primary navigation is a bottom tab bar, and the sub-tab layer it
> duplicated is a contents rail. What survives, and it is the load-bearing
> half: the **information architecture** this refactor established (My Team =
> my squad · Trade = only things that help build a trade · League = everyone
> else), every route it created, and every redirect it added. Only the
> *mechanism* changed. The live design is the **Navigation** section above;
> this section stays as the historical spec/record.
>
> **Status:** Phase 1 complete. **Done:** step 1 — Overview + All Teams fused
> (`AllTeamsView` + its Roster tab gone; `/roster/teams` → `/league`; the
> `/roster/teams/:rosterId` drill-down stays). step 2 — "My Team" stood up as a
> grouped section (My Roster · Lineup · Season Review · Trajectory sibling
> sub-tabs); standalone Lineup section dissolved (`LineupLayout` gone, `/lineup*`
> redirects into My Team); Free Agents moved to League. All still served from
> `/roster/*` + `/league/*` paths. **Phase 2 complete** — the `/roster` →
> `/my-team` URL rename + full redirect set; Pick Trades moved to
> `/trade/pick-trades` (Draft → Trade); scouting drill-downs are standalone
> `/league/teams/:id` + `/league/trajectory/:id` routes (header "League"); the
> `SideDrawer` is now the always-expanded hierarchical map; and global search
> jumps to sections/features as well as players. **Phase 3 complete
> (2026-07-20)** — the "Primetime Blackout" visual refresh (owner-approved
> direction 2026-07-19, spec: `docs/archive/design/phase3-design-brief.md` + reference
> render) executed in the brief's six steps: token pass, primitive pass, red
> score-bug heroes, per-section sweeps, red/silver logo re-cut, docs. The
> **Design System section below is the live post-refresh truth** and matches
> the brief — but its *direction* was superseded 2026-09-11 (see the status
> block on that section; the refresh shipped, the look was rejected on review). Both drawer watch-items were handled in the primitive pass
> (Anton parents, 2px rails). The refactor is done — this section stays as
> the historical spec/record.

**Why:** the app grew to 17 features behind a 7-label drawer that hides ~21
real destinations one level down. Sub-tabs only render *after* you've entered a
section, so substantial features (Trajectory, Managers, Pick Trades, Movers,
Playoffs) are invisible from the only map the app has. The felt problems:
every non-home view is 2–3 taps behind a context-wiping overlay; you can't tell
where a feature lives; and two workflows are split across sections (the trade
workflow, and duplicated team-list views).

**The drawer stays — no bottom nav.** The fix is making the drawer a complete,
legible map and regrouping the IA around jobs-to-be-done, not replacing the
paradigm. The *visual* refresh is explicitly a separate, later job (Phase 3) —
it repaints the settled structure; it does not restructure.

### Target information architecture

|Group     |Sub-views                                                   |
|----------|------------------------------------------------------------|
|The Edge  |*(home — leaf)*                                             |
|My Team   |My Roster · Lineup · Season Review · Trajectory             |
|Trade     |Partners · Analyzer · Targets · Managers · Pick Trades      |
|League    |Overview *(fused with All Teams)* · Free Agents · Activity · Movers · Playoffs|
|Draft     |Board · Research · Tracker                                 |
|News      |*(feed — leaf)*                                            |

Principle: **My Team = my squad · Trade = only things that help build a trade ·
League = everyone else / the market.** Moves vs. today: Lineup + Trajectory →
My Team; Pick Trades → Trade; All Teams (fused into Overview) + Free Agents +
Movers → League. Movers stays *out* of Trade deliberately — it's market intel,
not a trade-builder (its per-row "Trade" deep-link into the Analyzer is a
cross-link, not a reason to rehouse it).

### Phase 1 — Consolidation (feature work; small, independently verifiable steps)

- **Fuse Overview + All Teams into one League view.** They're redundant today
  (both list all 10 teams, both drill into the same roster view). Collapse into
  a single team list + drill-down living under League. Remove the All Teams tab
  from Roster.
- **Stand up "My Team" as a grouped section** with My Roster · Lineup · Season
  Review · Trajectory as **sibling sub-tabs** — *not* a fused screen. (Roster
  and the weekly Optimizer are different jobs; the Optimizer is offseason-hidden
  and would break a shared scroll.) The standalone Lineup section disappears as
  its views land here.

These two steps inherently *begin* the regroup (removing All Teams from Roster,
removing the Lineup section), so Phase 1 and Phase 2 are intentionally
entangled — land the heavier feature work first, in isolation, before the
mechanical nav rewrite.

### Phase 2 — Navigation (mechanical)

- **Rebuild `SideDrawer` as an always-expanded hierarchical map.** Pattern:
  docs-sidebar / IDE-tree, *not* Material subheader+divider (parents here are
  themselves destinations).
  - **Parent row** = group anchor *and* destination: section icon in its
    identity color + label, tappable → section default view.
  - **Children** indented beneath, text-aligned past the icon, tied to the
    parent by a thin vertical guide rail in the section color; no per-child
    icons; muted until active. Active child keeps the full color + tinted
    background + edge bar already in use.
  - Leaf sections (The Edge, News) render as plain single rows — no children,
    no rail. Whitespace separates groups (no heavy dividers).
- **Route redirects for everything that moved/renamed** — same pattern as the
  existing `/league/managers` → `/trade/managers` redirect — so saved
  deep-links and The Edge's briefing/deep-link items keep working. (Notably:
  old `/roster*`, `/roster/teams/:id`, `/roster/free-agents`,
  `/roster/trajectory/:id`, `/lineup*`, `/draft/trades` all get redirects to
  their new homes. Movers stays in League, so `/league/movers` is unchanged.)
- **Extend the header search sheet to jump to sections/features** by name
  (start with feature/section names only — no verb/keyword synonym map yet).
  Reuses `PlayerSearchSheet`'s sheet contract; results list features above/below
  player matches.

### Phase 3 — Design refresh (separate, later)

The "Claude Design visual refresh" already listed under Future Features. It
repaints the now-correct structure — kept out of Phases 1–2 so we don't
restructure and restyle at once (and don't do the migration twice).

**Watch-items carried over from Phases 1–2** (structural decisions deferred to
the visual pass — surface these when doing the refresh):

- **Sub-tab bar crowding at 390px — RESOLVED (UX audit).** The hand-rolled
  `flex-1` sub-tab rows wrapped long two-word labels ("Season Review", "Free
  Agents", "Pick Trades") onto a second line, making one cell taller than its
  neighbors. Replaced by the shared `SubTabBar` (`components/shared/`; itself
  since replaced by `SectionContents` — see Navigation): an
  adaptive `flex-1 min-w-max` strip that fills the width when tabs fit and
  scrolls horizontally when they don't, never wraps, scrolls the active tab
  into view, and shows a right-edge fade only while overflowing. All four
  multi-view sections (My Team · Trade · League · Draft) use it. The Phase 3
  visual pass can still restyle it (icon+label, etc.), but the structural rough
  edge is gone.
- **Always-expanded drawer length — RESOLVED (Phase 3 primitive pass).** The
  hierarchical drawer shows all ~18 destinations at once. The visual pass made
  the hierarchy read instantly: parent rows in Anton uppercase (clear type
  scale vs. Archivo children), guide rails thickened to 2px, verified at
  390px in both themes.

### Doc upkeep during the refactor

As **each phase lands**, update: the live **Navigation** section (table + the
sub-tab/section notes), the **Features** entries whose location changed
(Feature 1 Roster, Feature 4 Lineup, Feature 5 League Overview, Feature 7
Movers, Feature 9 Season Review, Feature 13 Pick Trades, Feature 17
Trajectory), the **File Structure** if components move, and this section's
status line. The component files may keep their existing folders (as Manager
Scouting did) — note any route-only moves explicitly.

-----

## Design System

> **Status: "Matchday" is the live direction, and all five steps have landed
> (2026-09-12).** Step 1 was the accessibility floor (DESIGN-2), step 2 the
> navigation rebuild (DESIGN-3), step 3 the token + primitive layer, step 4 the
> component roll-through (law 5's three block registers, B2's inversion on Trade
> Targets, law 2's bar ruling, **lucide removed entirely** — 51 icons, 32 files,
> dependency uninstalled — the radius sweep, and all three inherited Blackout
> artefacts), and **step 5 the motion layer** (see the Motion section: the global
> reduced-motion guard, one easing curve, the press run, `.press`, the press bar,
> the sheet entrance, and a four-moment budget).
>
> **The app fails 0 of `slop-checklist.md`'s 12 markers** — 8 at the review, 3
> entering step 4, 2 entering step 5.
>
> **The same lesson has now bitten three times, so read it as a rule: deleting a
> primitive does not delete the pattern, and a grep for an API cannot find a
> shape.** `Card`'s banned left accent rail was removed in step 3. A raw
> `border-l-[3px]` on Trajectory's verdict survived every sweep of step 4. Two
> more raw `border-l-2` rails in Pick Trades survived step 4 *and* step 5's own
> component work, and were caught only by re-scoring the checklist from scratch
> at the end. **Audit for the shape, and re-score rather than inheriting a
> score.**
>
> It replaced **"Primetime Blackout"** (Phase 3, 2026-07-20), which shipped
> competently and was then rejected on review. The reason is worth keeping,
> because it is a lesson about briefs rather than about execution: Blackout's
> own law specified **two of the three aesthetics the research names as AI
> defaults** — a near-black ground with one scarce accent, and hairline rules at
> zero radius — and the shipped app failed **8 of 12** researched slop markers,
> the worst being the thin coloured accent rail that `Card`'s `accent` prop made
> a first-class primitive. **Compliance could not have fixed it, because
> compliance was what produced it.**
>
> Spec: `docs/design/review-2026-09/directions.md` (the direction and its two
> revisions) · `slop-checklist.md` (the rules any new UI passes) ·
> `findings.md` (what was measured) · `mocks/directions-2.html`, direction 3
> (the authority on palette and type — standalone, never imported by the app).

**Matchday in one line: a publication about a competition.** Poster type, flat
colour, hard edges, no shadows, no icon set in navigation, and the five position
hues promoted from 9px tags to **full-bleed section bands**.

### The five laws

1. **Colour is a FIELD, not a rail.** Ink and the position hues are painted as
   solid blocks with the type reversed out — the masthead, the hero poster, the
   section band, the inline `Mark`, the CTA, the active chip, the tab bar. **A
   thin coloured rail down a container's left edge is banned**: it is the single
   most-cited tell in the research and it was a documented primitive here. When
   something wants a colour, it either becomes a field or the colour moves onto
   the *word* that carries the finding.
2. **Magnitude is TYPE SIZE.** Never a progress bar — a meter belongs to a
   different design language, and refusing it is part of why this direction was
   chosen. A figure is sized from its own value (`<Magnitude>`); the band above
   the group carries the group total. Size reads shape *within* a position, the
   total reads weight *across* positions.

   **A bar survives only where the number is a genuine proportion of a bounded
   whole** — decided 2026-09-12, and argued from what each number *is* rather
   than from consistency. The test has three parts, all three required:
   a **real complement** (the empty track means something), **no clamp**, and
   an **absolute mapping** (a fixed reference, not one that moves).
   - **League › Playoffs' odds bar passes and STAYS.** A probability is a
     proportion of 100%; the empty track is the chance you miss; `width:
     playoffPct * 100%` never clamps and 100% genuinely means certainty. B2
     called it "by a distance the most scannable screen in the app" and it is.
   - **TeamCard's positional strength bars FAILED all three and are gone.**
     They computed `min(100, strength / (leagueAvg * 2) * 100)`, so: they
     **clamped** — anything at twice league average pinned at 100%, and the two
     strongest QB rooms rendered identically while differing by thousands
     (finding B2 re-created inside the encoding meant to fix it, visible on the
     live board); the **complement was meaningless**, since twice-league-average
     is not a whole anyone is a fraction of; and the **reference moved**, so a
     team's own bar changed length when a *different* team traded. What replaced
     them is what Feature 5 always actually specified — "above average = filled,
     below average = unfilled", a **binary**: the position letter takes its hue
     when the team is above average there and mutes when below, with the 30-day
     trend beside it.

   **`Magnitude` needs a contract reference, and a quantity without one does not
   get sized.** The player scale is FantasyCalc's documented 0–10000. A **team
   total is a different quantity** — a sum of ~26 players, live range
   58,000–118,000 — and passing it the player reference clamped all ten teams to
   the 30px ceiling. `MAGNITUDE_TEAM_REFERENCE` is the second contract:
   `MAGNITUDE_REFERENCE × ROSTER_SLOTS.length` (110,000), i.e. a lineup of
   maximum-value players, both factors constants the app already owns. A
   positional sum likewise takes `MAGNITUDE_REFERENCE × POSITION_DEPTH[pos]`,
   derived from the same depth `getPositionalStrength` sums over. **Where no
   contract ceiling exists, use a plain figure** — inventing a reference is the
   per-list-maximum failure the primitive exists to prevent.
3. **Separation is a rule, never a shadow and never a radius.** Panels are
   square with a 1px hairline (`--border-default`) or a 2px masthead rule
   (`--border-strong`, or ink for the strongest). **Sheets, modals and the side
   drawer keep their radii and their full gesture contract** — radius 0 is for
   panels, and the sheet mechanics are untouchable (failure-archaeology §2).
4. **Status colours and position colours keep separate, exclusive meanings, and
   navigation may borrow neither.** An editorial highlight takes a semantic
   colour or plain ink — never a position hue, or "down 12%" reads as a
   position. Navigation carries no colour, no swatch and no icon at all.
5. **A block is a RULED ROW, a LEDE, or a DOOR — a rectangle is the last
   resort.** This is the answer to finding **B7**, and it is not a padding
   scale. B7 measured that "every screen is a vertical stack of full-width,
   evenly-spaced, 1px-bordered rectangles… an Action Item you must act on today
   and a Market Radar row you'll never tap have the same padding, the same
   border and the same width." Matchday's mock contains **zero bordered boxes
   in its content area**, so the second density register is reached by deleting
   the rectangle, not by tuning it:

   | Register | For | Shape |
   |---|---|---|
   | **`RuledList`** of rows | many things you SCAN — 26 players, 10 teams, 20 targets | a shared column, hairline separators, no box, ~10px rhythm; the `PositionBand` above carries the group |
   | **`Lede`** | ONE thing you ACT ON | eyebrow · display headline with a `Mark` · prose · ink CTA; no box; ~3× a row's height |
   | **`NavRow`** | a way OUT of this screen | display title · detail · hairline; no icon, no chevron |

   **The register is chosen by cardinality and consequence, never by taste.**
   The corollary is the load-bearing half: an enumeration must never be built
   from `Lede`s. Three IR alerts rendered as three `Lede`s reproduce the exact
   icon+title+one-liner pattern the direction exists to kill — so repeated items
   of one kind **aggregate into a single `Lede`** (Feature 1's action items).
   `Card` survives only for a genuinely standalone panel that is none of the
   three: a chart, an explainer, a form.

### Design System Component Library

All UI routes through the shared library at **`src/components/ui`** (barrel
`index.js`). **Never hand-roll a button, card, bottom sheet, filter chip, badge,
band, value figure, or input inline** — extend a primitive instead. Class
strings inside the primitives are kept literal (no runtime colour
interpolation) so Tailwind's content scan always picks them up. The
`/design-review` skill audits every diff for bypasses and is the enforcement
mechanism — run it on the **consumers**, not on `src/components/ui` while the
primitives themselves are being edited.

Import everything from the one barrel: `import { Button, Card, Sheet } from '../ui'`
(path relative to the importing file).

|Primitive|What it is|
|---------|----------|
|`Button`|THE button, set in **mono uppercase, tracked** (the mock's `.cta`) — the same voice as every other small label in the app. Variants `primary` (the ink field) · `secondary` (2px rule) · `tinted` (quiet rule, the footer/link idiom) · `ghost` · `danger`; sizes `sm`/`md`/`lg`; `fullWidth`, `icon`/`iconRight`, polymorphic `as`/`href`. Labels **wrap** (`text-balance`) — `whitespace-nowrap` never stopped a long label overflowing 390px, it only stopped it wrapping well. `sm`/`md` render under 44px, so every Button carries `tap-target`.|
|`IconButton`|THE icon-only control — the close/affordance button in every sheet/drawer header. Always pass `label` (→ aria-label). **`md` is a real 44px box** (`w-11 h-11`); **`sm` stays 36px** (`w-9 h-9`) for the one place without room — the swap handle inline in a `LineupRow` — and borrows `tap-target`'s 44px hit area. Square.|
|`Card`|THE surface container (`rounded-none bg-bg-card border border-border-default`). Optional `tone` colour class renders a **2px kicker rule across the TOP** — a print convention, and what replaced the banned left rail. `padding` `none`/`sm`/`md` or a raw class; `interactive`/`onClick` makes it a button.|
|**`Mark`**|THE editorial highlight — a word set in reverse out of a solid block ("Five **quarterbacks**, one dead weight"). The real replacement for `Card`'s rail: colour moves off the container and onto the word that carries the finding. Tones `ink` (default) · `ground` (a second reversal, for use **inside** an ink field) · `alt` · `brand` · status. **Never a position hue.**|
|**`PositionBand`**|THE section band — a position hue at **full bleed** with the page ground reversed out, carrying the group's count and **total**. The direction's signature. A board that mixes positions takes the neutral ink band (`position` omitted) — picking a hue to make a mixed list colourful would lie about what is in it. Cancels the 16px page gutter by default (`bleed`).|
|**`Magnitude`**|THE value figure, sized from its own value. See law 2 and the note below on the reference. `null` renders `—` at the base size (rule 7).|
|**`RuledList`**|THE DENSE register — many things you SCAN. Rows on the page's own ground, separated by a hairline, **no box and no per-row background**; it draws the closing rule and strips the last row's. Identity comes from the `PositionBand` above, not from a border around each row. `flush` cancels the page gutter.|
|**`Lede`**|THE OPEN register — one thing you ACT ON. Eyebrow · headline (with a `Mark` on the word carrying the finding) · prose · a solid ink CTA. No box. A pressable `Lede` is a `<button>`, so `action` takes a **string** there; an entry needing real controls leaves `onClick` unset and passes nodes to `action` / `aside` (the dismiss slot on the eyebrow line).|
|**`Row`**|THE member of a `RuledList` — the tappable row itself. **Always carries `.focus-ring`**; renders a `<button>` for `onClick`, a `<Link>` for `to`, a plain `<div>` for neither (a row that is not tappable must not announce itself as a control). Paddings `sm`/`md`/`lg`. Extracted after `/design-review`'s judgement pass caught **eleven hand-rolled copies that had drifted apart on the focus ring** — an accessibility-floor gap the nine mechanical detectors could not see.|
|**`NavRow`**|THE DOOR — a row that takes you somewhere. Display-type title, small detail, optional mono hint, hairline, **no icon and no chevron**. Extracted from the Index's row so shortcuts stop being `Card`s with a lucide medallion.|
|**`Loading`**|THE loading indicator — a rule that prints and clears (`.press-bar`) under a mono label. **There is no spinner in this app.** `inline` for a section inside a card or drawer; the block form carries the page gutter (`padded={false}` when the caller already has one). Never render it without a label — the label is the information, the movement is only liveness.|
|`Sheet` + `SheetHeader`|THE bottom sheet. Owns the whole sheet contract (`useScrollLock`, `useSheetDrag` swipe-to-dismiss, `overscroll-contain`, safe-area bottom pad, Escape + overlay-tap close, drag handle); `zIndex` is a Tailwind z class so sheets stack. **Exception:** a *keyboard-aware* sheet driven by `window.visualViewport` (PlayerSearchSheet, TradeBuilder's add sheet) can't use `Sheet` (which is sized to the layout viewport) — those two are the sanctioned hand-rolled overlays.|
|`Modal`|THE centered dialog — confirm prompts and small forms. Owns overlay, `useScrollLock`, Escape + overlay-tap close. The bottom-docked counterpart is `Sheet`.|
|`Chip`|THE filter chip — square, mono uppercase. Inactive is quiet; `active` defaults to the **ink field**; pass `activeClass={POS_CHIP_ACTIVE[pos]}` for position-tinted active states.|
|`Badge`|THE small status/label badge — square, mono uppercase; `tone` (accent/brand/alt/success/warning/danger) and `soft` tinted variants. Solid `accent` is the ink field; **`brand` is the rationed crimson, reserved for "you" labels.** (Win-window tiers use `WinWindowBadge`; position tags use `POS_TAG`; an emphasis inside a sentence is a `Mark`.)|
|`Select`|THE dropdown field — a native `<select>` in the ruled-field voice. Native is deliberate: iOS renders it as the system wheel picker, and `<optgroup>` gives grouped options for free.|
|`Input` / `SearchInput`|THE text field + search-box variant — **ruled, not boxed** (a line under a label, the print convention). The focus affordance is the rule thickening to ink; `.focus-ring` still fires, because browsers always treat a text field as focus-visible. Keep at `text-sm` (iOS focus-zoom is handled globally).|
|`Textarea`|THE multi-line field — `Input`'s sibling, same ruled contract (bottom rule thickens to ink on focus, `.focus-ring`, `text-sm`). `resize-none` by default: `<main>` is the app's one scroller and a user-resizable box inside a bottom sheet fights the sheet's drag contract. It exists because the scout-note field was the one control in the app that **could not** route through a primitive — PR #49 found it with `focus:outline-none` and nothing in its place, and fixing it at the call site left the gap structurally open.|
|`cn`|The one styling primitive — a tiny `className` joiner that drops falsy values. Never pull in a heavier classnames dep.|

**Adopted shared primitives** are re-exported from the same barrel so the
library is the single import surface (the files stay in
`src/components/shared/`): `ErrorState`,
`SectionHeader` + `BRAND_TICK`, `SectionContents`, `TrendArrow`,
`WinWindowBadge`, `Sparkline`, `TeamAvatar`. Import these from `'../ui'`.

#### `Magnitude`'s reference is PINNED, and pinned to a contract

`14 + 16·(v/10000)^0.7`, clamped, floor 14px and ceiling 30px.

- **Pinned, not derived per list.** A per-list maximum would resize one player's
  figure because a *different* player's value moved, and 4,867 would read as
  huge on a thin board and ordinary on a deep one. The encoding only works if a
  number means the same thing on every screen.
- **10000, not the mock's 9365.** 9365 was the top-of-market dynasty value on
  the day the mock was drawn — it goes stale, and any asset above it runs off
  the top of the ramp. FantasyCalc's scale is documented as **0–10000**, so the
  ceiling is a contract rather than a snapshot. The two differ by under a pixel
  across the whole range (4,867 → 23.6px against the mock's 24.1px).
- The 0.7 exponent is the mock's: linear crushes the bottom two thirds of the
  market, where most of a roster lives, into three pixels; log flattens the top,
  where the decisions are.

### The accessibility floor (non-negotiable, enforced in the primitives)

Three rules, set in DESIGN-2 (2026-09-11) and re-derived against Matchday's
grounds the same week. They live in the primitives and in `index.css`, never at
the call site, so no screen can opt out.

- **Contrast is a contract.** `--text-tertiary` carries real content — the meta
  line on every player row, timestamps, the reason line under every trade
  target, **525 uses** — so it must clear WCAG AA body text (4.5:1). The ratio
  on each token is measured against that theme's **worst-case ground, which is a
  different surface in each**: in dark the *lightest* ground (`--bg-card`) gives
  the least contrast, in light the *darkest* (`--bg-secondary`) does.
  **ANY CHANGE TO A GROUND COLOUR MUST RE-MEASURE BOTH TEXT TOKENS IN BOTH
  THEMES** — Matchday moved every ground, which invalidated every ratio the
  floor had been set against.
  Run **`node scripts/dev/contrast-audit.mjs`**: it reads the tokens straight
  out of `index.css`, so the numbers here cannot drift from the shipped values,
  and it covers the two reversal cases a text-on-ground audit misses (paper type
  on a position band; type on an ink field). **40 of 40 pass.**
- **`.focus-ring` is the one focus definition** (`index.css`), carried by
  `Button`, `IconButton`, `Chip`, interactive `Card`, `Row`, `Input`,
  `Textarea` and `Select`.
  `:focus-visible`, not `:focus`, so a plain tap stays unmarked while
  keyboard focus and text fields render the ring. Inside an `.ink-field` the
  ring flips to the field's own ground, or it disappears into the block.
  **A control that bypasses the primitives must carry it explicitly, and 46 of
  them weren't** (measured 2026-09-13 by a static probe over every `<button>`,
  `<input>`, `<select>` and `<textarea>` in `src`; all fixed across three PRs).
  The distribution is the lesson: `DraftBoard` 10 · `DraftTracker` 10 ·
  `TradeBuilder` 7 · `EdgeView` 4, and because most sit on a **repeated row**,
  those 46 source sites were **~700 unfocusable controls in the live DOM** —
  470 on the Draft Board alone. **Run the probe, not a reading of the diff:**
  a single missed row component is two orders of magnitude of real controls.
  The only deliberate omission is `DraftBoard`'s hidden `<input type="file">`
  (`className="hidden"` ⇒ `display:none` ⇒ not focusable); its visible trigger
  carries the ring.
  **And a control that carries it at the CALL SITE is not covered — it is one
  refactor from losing it again.** That is why the scout note became a
  primitive rather than staying a hand-rolled `<textarea>` with the class
  pasted on: the floor holds because the primitives hold it, and the eleven
  divergent copies of `Row` are what the other arrangement looks like.
- **`.press` is the one press definition** (see Motion) — the third sibling of
  these two, carried by every primitive so no screen ships a control that
  doesn't answer a finger.
- **`.tap-target` guarantees a 44px hit area without moving the ink** — a
  centered pseudo-element sized `max(100%, 44px)`, so it never shrinks a target
  that is already larger and costs no layout. It is deliberately **NOT** on
  `Chip`: filter chips sit ~8px apart in a scrolling row, so a 44px hit area on
  a 40px chip would let neighbours steal each other's taps — the fix would cause
  the bug. It also carries `touch-action: manipulation`.

**Truncation is not a layout strategy for a load-bearing value.** Five fixed so
far: Trade › Targets' `Est. cost` (eliding the package on 5 of 11 live cards),
`LineupRow`'s player name ("TreVeyon He…" on the row whose whole job is telling
you who to start), `PlayerCard`'s name (which lost `truncate` when the value
column became variable-width), Market Movers' owner + reason line
("Aaronreg… · Rebuilding owner — prime tar…", where the *reason* is the point of
the row), and a free agent's name clipping by 3px. All wrap instead.

**The rule now has an instrument, because five recurrences means it needs one:**
`node scripts/dev/screenshot-app.mjs --route <path> --overflow` reports every
element actually being clipped, measured geometrically
(`scrollWidth > clientWidth`) against live data. Neither of the obvious
alternatives works — `--text` reads `innerText`, which returns the element's
FULL string because a CSS ellipsis is painted and never in the DOM, and a tall
capture downscales past it. Sweep every route with it before claiming a screen
is clean; the last full sweep found exactly one clip across 18 routes.

### Theme

- **Default:** Dark mode
- **Toggle:** In the side drawer's utility surface
- **Preference stored in:** `localStorage` key `dynastyedge_theme`

### The ink field

`.ink-field` / `.ink-field-cap` (`index.css`) is Matchday's **one structural
device**: a solid block of `--text-primary` with `--bg-primary` reversed out.
It **inverts with the theme by construction** — a cream poster on a black page
in dark, an ink poster on paper in light.

That is the resolution to **finding B4**. The old hero was `background-color:
#101013` in *both* themes, so light mode carried a near-black slab at the top of
a white page belonging to nothing else on it. An ink field belongs to
everything: the masthead rule, the section band, the CTA, the active chip and
the **bottom tab bar** are all made of it. (The tab bar is inverted in **both**
themes — the owner's call, 2026-09-11, when asked whether a cream slab reads
badly at night.)

**Content inside a field addresses the field, not the page.** Text is
`text-bg-primary`, fills are `bg-bg-primary/10`, rules are
`border-bg-primary/20`. Three rules:

- **Never `text-white`** — on the cream field dark mode paints, it is invisible.
- **The alpha floor on a field is `/60`.** Measured: the ground over the ink is
  4.92:1 in dark and 6.54:1 in light at 60%, and 4.19:1 at 55%. The old hero's
  `text-white/45` micro-labels were under it and got away with it only because
  the panel was always dark.
- **A status, tier or medal hue cannot live on a field.** The field inverts, so
  no single green/amber/cyan clears AA against both versions of it. On a field,
  direction and rank are carried by **weight, by the sign, or by a second
  reversal** (`<Mark tone="ground">`, the page's own colours, always legible).
  This is why the hero's trend chip drops its status hue, the top-3 rank medal
  becomes a Mark, and the tier dot is gone.

### Colour palette

Tokens live in `index.css` (`:root` light / `.dark` dark) and are exposed via
Tailwind (`bg-accent`, `text-brand-bright`, `bg-tier-middle/10`, …). **The
ground and every neutral carry a hue** (warm paper / warm ink, ~45–55°) —
zero-saturation greys are a named marker, and achromatic structure is why the
old palette read grey with five position hues on screen (finding B6).

**Two hues, 176° apart**, as the round-2 house rules require: the primary spot
is Falcons crimson (~350°), the secondary is **`--alt`**, a slate teal (~174°),
whose shipped job is the non-semantic editorial `Mark` — emphasis that is
neither a status nor "you". The five position hues (165–285°) are the colour
world on top of that.

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

Every position has its own identity colour — under Matchday this is the app's
colour world, not a decorative tag. Tokens live in `index.css` (`--pos-*`), are
exposed via Tailwind (`text-pos-qb`, `bg-pos-rb/15`, …), and all class maps live
in `src/utils/positionColors.js` (`POS_TEXT`, `POS_BG`, **`POS_FIELD`**,
`POS_TAG`, `POS_CHIP_ACTIVE`, `POS_SVG`). **Never
hand-roll position colours locally, and never reuse status colours
(success/warning/danger) to mean a position.**

|Position|Dark mode          |Light mode                         |
|--------|-------------------|-----------------------------------|
|QB      |`#F2758F` (pink)   |`#C4335A`                          |
|RB      |`#3AD0A4` (teal)   |`#0D7A5A` — deepened for the band  |
|WR      |`#57A9F2` (sky)    |`#1F6FC0`                          |
|TE      |`#F0964E` (orange) |`#AA5417` — deepened for the band  |
|DEF     |`#9AA3EE` (violet) |`#5A64C8`                          |

**Light RB and TE are deepened from their pre-Matchday values** (`#0F8A66`,
`#C05F1A`). A `PositionBand` reverses **paper type out of the hue**, and on the
old values that read **3.87:1** and **3.83:1** — under the AA body bar, and band
labels are small bold display type, not "large text". Every band label now
clears 4.5:1 in both themes (dark ones clear 7.1:1 or better, so that side
needed no change).

Where they apply:

- The **`PositionBand`** — a full-bleed field with the label and the group total
  reversed out. This is the primary use.
- Position labels and position rank (`#3 WR`) on player rows and in drawers
- Active position filter chips (`POS_CHIP_ACTIVE`, the tinted identity style);
  All / Picks chips keep the ink field
- The positional read on a League row — the position letter itself, lit or
  muted (`POS_TEXT`). `POS_BAR` / `POS_BAR_DIM` are **gone with the bars**
- Roster Analysis age-chart lanes (`POS_SVG` for SVG fill/stroke)
- Position tags in the trade builder / What's Fair / lineup FA drawer (`POS_TAG`)

### Pick round colors (consistent across entire app)

Class maps live in `src/utils/roundColors.js` (`ROUND_CLASSES`, `ROUND_TEXT`,
`ROUND_LABELS`) — shared by PickBadge and TeamCard, never redefined locally.

**A round is ORDINAL, so the encoding is an INK-DENSITY RAMP** (re-cut in step
4). Blackout gave the four rounds four *unrelated hues* — silver-on-charcoal,
blue, violet, grey, eight hardcoded hexes tuned to a palette the app no longer
has. Two things were wrong beyond the stale values: four unrelated hues encode
four *kinds* of thing, so the one fact the badge exists to carry (a 1st is worth
more than a 4th) had to be read off the label; and hardcoded hexes cannot invert
with the theme.

|Round|Treatment                                    |
|-----|---------------------------------------------|
|1st  |solid ink field, ground reversed out         |
|2nd  |2px ink rule, transparent                    |
|3rd  |1px `--border-strong`, `--text-secondary`    |
|4th  |1px `--border-default`, `--text-tertiary`    |

Built entirely from existing tokens, so it inverts by construction and inherits
the contrast the accessibility floor already measures — it needs no audit row of
its own. It also spends **no hue at all**, which keeps the five position colours
the only colour world on a roster screen (law 4).

### Status / verdict colors (consistent throughout)

|Status                |Color        |When used                                     |
|----------------------|-------------|----------------------------------------------|
|🔴 Hard block / Decline|Danger red   |Out, IR, bye, decline verdict                 |
|🟡 Soft flag / Counter |Warning amber|Questionable, projection flag, counter verdict|
|🟢 Confirmed / Accept  |Success green|Healthy, optimal, accept verdict              |
|🎯 Priority            |Ink          |Top trade partner tier                        |
|✅ Good Fit            |Muted green  |Second trade partner tier                     |
|⚪ Poor Fit            |Text tertiary|Lowest trade partner tier                     |

Verdict blocks (Accept/Decline/Counter) use a **flat tint** of their status
colour (`bg-x/10`). Status colours never appear on an ink field (see above) and
never mean a position or a section.

### Win window tier colors

Every tier has an identity colour — maps live in `src/utils/tierColors.js`
(`TIER_BADGE`, `TIER_TEXT`), shared by `WinWindowBadge` and the League health
banner chips. Never redefine locally. Contending takes the **ink family**:
under Matchday the structural colour is ink, not a metal.

### Rank medals

Ranking ordinals (league value rank, position rank cards, the League team list)
colour the top 3 as medals — gold/silver/bronze — via `rankClass(rank)` in
`src/utils/rankColors.js`. Everyone else stays text-tertiary. **A medal cannot
be used on an ink field** (amber vanishes on the cream one); there, top-3 is a
`<Mark tone="ground">`.

### Team avatars

`src/components/shared/TeamAvatar.jsx` shows the owner's Sleeper avatar
everywhere teams appear (team cards, position rankings, the League team list,
matchups, roster hero header). Sources, in order: custom team avatar URL
(`user.metadata.avatar`), Sleeper CDN thumb
(`https://sleepercdn.com/avatars/thumbs/{user.avatar}`), then a deterministic
**flat** initial circle (hash of team name), drawn from the app's own position
hues plus `--alt`, `--brand` and ink, with the page ground reversed out. It was
eight two-stop Tailwind gradients — the last gradient anywhere in the app, and
Matchday has none; flat also fixed a `text-white` sitting over a mid-weight ramp.
Static `<img>` tags only — this is
not an API call, so it doesn't go through `fetchJSON`. Always render the
fallback on image error; never let a broken avatar break a card.

### Ambient background — there isn't one

`.app-bg` and `.login-bg` are **flat**. Matchday is flat colour and hard edges:
no gradients anywhere (Blackout's two sanctioned score-bug gradients are gone),
no glows, no radial washes, and no `.hero-sweep` red conic — the hero is a
**field**, which needs no atmosphere behind it. The fixed app header is opaque
(`bg-bg-secondary`, no translucency or backdrop-blur — see rule 16) and closes
with a 2px ink masthead rule.

**Never re-propose an inset or neon glow on a tinted content card** — it was
built and reverted two minutes later for reading muddy (failure-archaeology
§5a). Matchday's answer to "this needs depth" is **size and ground**, never
elevation.

### Heroes, mastheads and bands

The loud moments, all made of the same ink:

- **The poster hero** — The Edge's franchise report, the Roster view's team
  header, the Optimizer's moves card, the Playoff Odds summary and the login
  screen. An `.ink-field-cap` strip (display label left, mono dateline right)
  closed by a hairline in its own ink, over an `.ink-field` panel, so cap and
  body read as one block. **The Edge's hero keeps team value as its marquee
  figure** — leading with the instruction instead was built, reviewed and
  **reverted on the owner's call (2026-09-11)**; the argument for the swap is
  recorded in `review-2026-09/unasked.md` §1 if it is ever revisited.
- **The app masthead** — the fixed header, display uppercase, closed by a 2px
  ink rule. The contents rail under it carries the same rule.
- **`SectionHeader`** — label, count, and a rule. It replaced Blackout's silver
  "lower-third": a gradient block with an 8px angled trailing cut and a small
  skewed identity slash. All three left — the gradient (flat colour), the clip
  (hard edges), and the slash (a decorative mark carrying nothing the label
  didn't). Colour moves onto the rule.
- **`PositionBand`** — the full-bleed position field. For a position group
  inside a list, prefer this over `SectionHeader`: the field is the direction's
  signature and the total says more.
- **`Mark`** — the reversed-out word inside a sentence.

### Section identity colors — GONE (2026-09-11, DESIGN-3)

**Navigation carries no colour at all.** The side drawer used to give each
section an identity hue defined inline in its `NAV_TREE` — and two of the six
were **status tokens**: Trade `text-success`, League `text-warning`, the same
values used for real success/error state in the same file. A green TRADE above
an amber LEAGUE read as "good / caution" before it read as navigation, in direct
breach of law 4.

The fix was structural, not a re-hue: navigation is **text**, in the Matchday
idiom — the tab bar, the contents rails and the Index carry no icons, no
swatches and no section hues. The Index deliberately carries no swatch either: a
section colour there would collide with the five position hues, which are
load-bearing on every other screen.

**Red is still rationed**, to two surfaces only: the "you" treatments (the
You-chip, my-row borders, my-pick highlights) and the **active contents-rail
underline**. The tab bar deliberately does not spend it — the bar is already an
ink field, and its active marker is ink in the bar's own colour.

### Logo — the Crown Crest

The mark is a crown built from analytics: three ascending bars (a rising chart)
as the crown's prongs, a jewel above each tip, and a detached base band as the
circlet. **Re-cut flat in step 4** — it wore a red-ramp gradient over a silver
crown with rounded bars, and its wordmark was set in Anton, a family the app
stopped loading in step 3 (so the in-app lockup had been falling back to a
system font).

It is now **two flat colours and one reversal**: a solid crimson field with the
crown reversed out in warm paper — the same move the hero, the band and the tab
bar make, in the brand spot rather than in ink — and the wordmark in the `Mark`
idiom, "DYNASTY" in plain ink with "EDGE" reversed out of a crimson block. Every
rect is square; the jewels were circles and the bars carried `rx="5"`.

- **In-app lockup:** `src/components/shared/DynastyEdgeLogo.jsx` — crown +
  "DYNASTY**EDGE**" wordmark.
- **App icon / favicons:** generated by `node scripts/generate-icons.mjs`
  (sharp + png-to-ico, devDependencies) into `public/`:
  `apple-touch-icon.png` (180px, **full-bleed, no border, no pre-rounded
  corners** — iOS applies its own mask), `favicon-32x32.png`,
  `favicon-16x16.png`, `favicon.ico`, `logo.svg`.
- The crown geometry lives in both the component and the script — keep them in
  sync and re-run the script after any change. Never ship an app icon with its
  own border or baked-in rounding (it clips badly on iOS).

### Typography

- **Display / headers:** **`Bricolage Grotesque`**, variable — `wght` 200–800
  (the app uses 700/800), `opsz` 12–96 driven **automatically** from font-size,
  `wdth` 75–100. Uppercase, negative tracking at display sizes. Display-only —
  never body text.
- **Body / UI:** `Archivo` (400–700, **plus italic** — the `.aside` voice)
- **Numbers / values:** `IBM Plex Mono` for FantasyCalc values and scores; also
  the **micro-label voice** — stat eyebrows, badges, chips and now **buttons**
  are IBM Plex Mono 500–600 uppercase with wide tracking.

Loaded from Google Fonts (`index.html`). Three families, as before the swap:
**Anton is gone.**

> **Why Anton went.** It ships **one weight**, so every display size carried the
> same stroke and the scale could only work through size (finding B5) — and the
> house rules ask for 300–800. Its uppercase was also, in the review's words,
> "the most generic possible sports choice".

> **MEASURED CORRECTION TO THE SPEC.** `directions.md` rev 1 change 7 pushes
> Bricolage to **`wdth 125`**. Google Fonts' Bricolage Grotesque has no such
> setting: its `wdth` axis runs **75–100 with a default of 100** (probed
> 2026-09-11 — `css2?family=Bricolage+Grotesque:wdth@75..125` returns HTTP 400,
> `@75..100` returns 200). **100 is both the maximum and the default, so the
> mock's declaration was a no-op** — which explains the recorded complaint that
> it "still reads fairly neutral even pushed onto its axes". It was never
> pushed. `font-stretch` is therefore **not** set (it would clamp silently and
> mislead the next reader); the work moves to `opsz` and `wght`. **If Bricolage
> doesn't earn its keep on device, the recorded swap candidate is Big Shoulders
> Display** — and the reason to swap is now evidence-backed, not taste.

#### The type scale

A **custom ladder on a 1.25 ratio**, replacing Tailwind's default in
`tailwind.config.js`. The default scale is itself a marker, and it is not a
ratio at all — its steps run 1.17 / 1.14 / 1.13 / 1.11 / 1.20 / 1.25 / 1.20 /
1.33. Anchored at **`sm` = 14px**, the app's most-used size, so that step is
unchanged and the blast radius falls on the display end.

|Key|px|Key|px|
|---|---|---|---|
|`2xs`|8.96|`xl`|27.34|
|`xs`|11.20|`2xl`|34.18|
|`sm`|**14.00**|`3xl`|42.72|
|`base`|17.50|`4xl`|53.40|
|`lg`|21.88|`5xl`|66.76|

Each step carries **its own line-height and letter-spacing** — default values
for both are a separate marker. The ladder tightens from 1.55 at body to 0.90 at
poster scale, and tracking runs +0.01em at caption to −0.05em at the marquee
figure. A `tracking-*` utility at the call site still wins (Tailwind emits
letterSpacing after fontSize), so the small uppercase labels keep their positive
tracking.

#### Italic, and `text-wrap: balance`

Both are on the marker list precisely because generated UI never reaches for
them.

- **`.aside`** (`index.css`) is italic, and it is **one specific voice: the
  app's honest caveat** — "values are at today's prices", "this is a local
  preview", the reason a section is empty. Never decoration, never emphasis
  (emphasis is a `Mark`). Carried by `ErrorState` and `Select`'s hint today.
- **`text-balance`** is on `Button`, `SheetHeader`'s title, `ErrorState`, the
  Index rows and the player name.
- **`::selection`** is styled as the ink field — the browser's default blue is a
  hue this palette does not contain.

### Spacing and layout

- Content padding: `16px` left/right on mobile. A `PositionBand` **cancels it**
  (`-mx-4 px-4`) to bleed.
- Panel border radius: **0**. **Sheets, modals and the drawer keep their radii**
  and their full gesture contract.
- Side drawer width: `80vw`, max `300px`; respects iPhone safe-area insets
- Section headers: Bricolage extra-bold, 12px, wide tracking, over a rule
- Player rows: compact, and **nothing load-bearing truncates** — the value
  column is variable-width, so a long name wraps

### Motion

> **Step 5 shipped 2026-09-12 and this section is the live truth.** The measured
> starting point, for reference: **one** `@keyframes`
> (`.edge-rise`, a fade-up on The Edge), 69 `transition-*` utilities of which
> **67 animate opacity or colour and one animates `transform`**, and **3**
> explicit timing values in the whole app — so virtually every transition ran
> Tailwind's default 150ms `cubic-bezier(.4,0,.2,1)`. There was no easing curve
> in this app that anyone chose. The app faded and tinted; it never moved.

#### The reduced-motion guard is GLOBAL, and it landed first

`index.css` closes with a `@media (prefers-reduced-motion: reduce)` block over
`*`, `*::before` and `*::after`. It zeroes animation and transition **duration
and delay**, caps `animation-iteration-count` at 1, and sets `scroll-behavior:
auto`. `!important` throughout: the point is that no screen and no future
primitive can opt out.

**It was written before any motion was added, deliberately.** The old guard
covered exactly one class (`.edge-rise`) — adequate only while nothing else
moved, and a trap the moment that stopped being true, because a class-scoped
guard has to be extended by whoever adds the next animation and the failure is
silent for everyone who doesn't have the setting on.

Three details are load-bearing:

- **Duration goes to 0.01ms, not 0.** Zero makes some engines skip the animation
  entirely, which also skips its `end` event; 0.01ms runs it in one frame and
  still fires.
- **Delay goes to 0 as well.** Zeroing only the duration of a jittered stagger
  leaves the delays intact, so the last row of a list would still sit blank for
  400ms — a *slower* first paint than no motion at all, the exact opposite of
  what the setting asks for.
- **CSS cannot reach a programmatic smooth scroll.** `scroll-behavior: auto`
  does not override a `scrollIntoView({ behavior: 'smooth' })` argument, and a
  long smooth scroll is a reliable vestibular trigger. The two places that jump
  the page — THE CALL's act anchors and Rookie Research's board jump — go
  through **`scrollToTopOf`** in `components/ui/motion.js`, which reads the
  media query at call time (not cached: the setting can change mid-session).

**`useSheetDrag`'s spring-back is caught by the duration rule and that is
correct** — a released sheet snaps home instead of easing. The gesture itself is
direct manipulation rather than animation and is untouched.

#### One curve, and durations scaled to element size

**`--ez: cubic-bezier(.16, 1, .3, 1)`** (`index.css`, on `:root` — motion does
not invert with the theme) is the app's only easing token, and Tailwind emits it
as the **DEFAULT `transition-timing-function`**. That is the point of setting
DEFAULT rather than adding named curves: it reaches all 69 `transition-*`
utilities at once, with no call-site change and no way for a screen to miss it.

It is an **expo-out**, and its profile is worth knowing precisely because
**nominal duration is not perceived duration on this curve**. Measured by
solving the bezier:

|fraction of duration|0.10|0.20|**0.33**|0.42|0.62|1.00|
|---|---|---|---|---|---|---|
|`--ez` travelled|49%|75%|**88%**|95%|99%|100%|
|Tailwind's default|3%|13%|41%|64%|89%|100%|

So a 620ms band wipe is 95% done in **264ms** and a 340ms sheet in **145ms** —
which is why the numbers in the ladder below look larger than they feel, and why
the press run can afford 620ms without reading as slow. Set a duration by the
*perceived* travel you want and then roughly double it.

**Duration is a function of how far a thing travels, which in practice means how
big it is.** A chip tint and a 300px drawer crossing the screen shared one number
before this. The ladder (`tailwind.config.js` → `transitionDuration`):

|token|ms|for|
|---|---|---|
|`duration-tap`|90|press feedback — must read as instantaneous|
|`duration-mark`|150|small ink: a chip, a badge, a row tint, a link|
|`duration-panel`|240|a block, or an overlay resolving|
|`duration-sheet`|340|a full-width surface crossing the screen|

`DEFAULT` stays **150ms** — the value Tailwind already shipped, restated as a
chosen one so the diff is honest about what actually changed here: the curve,
not the speed of a colour tint. An un-suffixed `transition-colors` is therefore
`mark`-speed by definition and needs no class.

**The one deliberate exception is `useSheetDrag`'s spring-back**, which sets an
inline `transform 0.25s ease-out`. It is left exactly as it is: it belongs to the
sheet-gesture family (failure-archaeology §2, six settled battles), the release
is the tail of a direct manipulation rather than an entrance, and nothing about
it is improved by a house curve.

#### The press run — the signature entrance

*"Flat colour bands wipe across the page, then type drops in behind them. Ink
hitting paper."* Three keyframes in `index.css`, fired in that order:

|class|what|duration|
|---|---|---|
|`.press-band`|a solid field prints left to right (`clip-path` inset from the right)|620ms|
|`.press-ink`|the type lands behind the band — a short drop from above with a slight vertical over-scale, `transform-origin: top`|580ms|
|`.press-set`|a row sets under a downward clip, opacity floor **0.2**, never 0|440ms|

It replaced **`.edge-rise`**, a 0.35s fade-up on Tailwind's default ease — two of
the twelve researched slop markers in one animation (a fade-up entrance, and at
the call site a linear 0/60/120/180ms stagger), and the only keyframe in the app.

Every property is compositor-cheap (`clip-path`, `opacity`, `transform`).
**Nothing animates layout** — motion must not cost a paint.

**The fill mode is `backwards`, and both alternatives are wrong.** With no fill a
delayed block paints at full opacity through its delay and then jumps to the
start of its own animation — a flash. With `both` the block keeps its final
keyframe forever, which for a wipe is a permanent `clip-path: inset(0 0 0 0)`:
visually identical, and it silently clips **`.tap-target`'s 44px hit area** back
to the element box at the block's edges, because clip-path clips hit-testing as
well as paint.

#### The stagger is jittered, and monotonic by construction

**`stagger(index)`** (`components/ui/motion.js`) is a **cumulative sum of
independently-drawn gaps**, each within 0.6×–1.45× of a 46ms base, capped at
420ms. Two properties it needs and the obvious implementations don't have:

- **Pure in the index, not `Math.random()`.** React re-renders; a random delay
  would hand a block a different number on each pass.
- **Independent of call ORDER.** The mock advanced one shared LCG per call,
  which is right for a template rendered top to bottom and wrong here —
  conditional sections mean block 5 is not always the fifth call. Hashing the
  index means a block's delay depends only on where it sits.

**Summing gaps rather than scaling a linear base is a measured choice.** The
mock's multiplicative form (`i * base * jitter`) produces 15 / 52 / 123 / 176 /
**145** / 270 / 361 / 420 / **398** on nine blocks — two inversions, where a
later block lands *before* an earlier one. That reads as broken, not irregular.
The shipped form gives 0 / 57 / 107 / 145 / 189 / 248 / 292 / 348 / 399: gaps of
38–59ms, no two alike, never out of order.

#### The press — `.press`, the third control-level contract

**`.press` (`index.css`) is the one definition of "this control answers a
finger": a 90ms dip to 60%, on `--ez`.** It is the sibling of `.focus-ring`
(focus) and `.tap-target` (hit area), and it exists for the same reason both of
those do — a control-level contract belongs in one place, not at forty call
sites. **Every pressable in the app carries it**, and the primitives carry it so
no screen can miss it.

The audit it came out of: **41 `active:` opacity states across 20 files at three
different values for one gesture** — `Button` dipped to 70%, `Card` to 80%,
everything else to 60% — plus five consumers restating `Button`'s own
`active:opacity-70` on a `Button`, and roughly a dozen real pressables with no
press state at all (the header's Menu and Find, the Playoff Odds and Roster
Analysis explainer toggles, the action-item Dismiss, the roster Back link, the
Index rows, four drawer rows, the tab bar, the contents rail, Pick Trades' mode
toggle). That is the same drift `/design-review`'s nine greps sailed past on
`.focus-ring` in step 4.

**The dip is `filter: opacity()`, not `opacity`, and that is what lets one rule
cover the app.** A flat `opacity: 0.6` is *absolute*, so it is wrong on any
control whose resting opacity already means something — and there are two: an
inactive tab-bar item sits at 55%, a drafted prospect row at 50%. Pressing
either would have moved it to 60%, i.e. **brighter**. `filter` composes:
1 × 0.6 on an ordinary control, 0.55 × 0.6 = 0.33 on the faded tab. Same
proportion, no exceptions needed.

**`.press` owns the whole transition**, colour properties included, so an
element carrying it takes no `transition-*` utility — a Tailwind
`transition-colors` sits in the utilities layer and would replace the shorthand
outright, silently dropping the dip. `:not(:disabled)` so a disabled control
does not answer at all.

**Deliberately not `.press`**, because their press already says something more
specific: the trade builder's remove controls flash `danger`/`warning`, the
login team rows tint their background, the draft board's drag handle swaps its
cursor.

**Verified by probe, not by eye** — every pressable on every route, counted in
the live DOM: The Edge 42/42, My Team 49/49, Lineup 61/61, Trade Analyzer 15/15,
Targets 43/43, Managers 15/15, Pick Trades 53/53, League 36/36, Movers 84/84,
Free Agents 155/155, Playoffs 15/15, Season Review 14/14, Trajectory 44/44,
Draft Board 486/486, Research 484/484, Tracker 60/60, News 333/333, Index 21/21.

#### There is no spinner — `Loading` and the press bar

**The app has no loading spinner.** It carried four `animate-spin` circles and
one `animate-pulse`, both on the researched marker list; the circles were also,
with the avatar and the sheet grabbers, the last radius in an app whose law 3 is
square-with-a-hairline.

**`Loading`** (`components/ui/`) replaced all five, and the replacement is not a
stock indeterminate progress bar either. There is no track and no segment
travelling along one: the rule **prints** from the left, holds, and **clears**
from the left — `.press-bar`, the press run's own wipe, looped. Waiting reads as
the press running rather than as a widget borrowed from elsewhere. Flat ink,
square, no gradient, no radius.

**The label is the information; the movement is only liveness** — which is why
the indicator never renders without one. A spinning circle answers "the app is
alive" and answers it identically for a 200ms wait and a 20s one. The app
already shipped the better idiom in WhatsFair's *"Working out what it would
cost… — N to go"*, and that is text.

That split is what makes it degrade correctly: under reduced motion the global
guard caps iterations at 1 and duration at 0.01ms, and with no fill mode the
rule reverts to its base state — **a solid, still ink rule under its label**.
Nothing throbs and nothing is lost.

Two variants. The **block** form (a view-level state) carries the page's own
16px gutter, because nearly every caller is an early `return` that replaces a
view *before* its padding wrapper exists; `padded={false}` is for the one caller
already inside one. The predecessor was centred, which is why it never exposed
this — a centred spinner cannot touch the screen edge, a full-width rule can.
The **`inline`** form (a section inside a card or drawer) is a 16px rule beside
its label, because a full-width rule there reads as a divider.

`animate-pulse` was a green dot beside the words "Live Intelligence". It is gone
rather than restyled: the dot said nothing the label did not.

#### The sheet arriving

A sheet used to appear between one frame and the next, which on a surface
covering most of the screen reads as a glitch rather than a transition. It now
**prints up from the bottom edge** (`.sheet-print`, 340ms — 95% of the travel by
145ms) while the scrim inks in behind it (`.overlay-ink`, 240ms). Carried by
`Sheet`, `Modal`, and both sanctioned hand-rolled overlays (`PlayerSearchSheet`,
`TradeBuilder`'s add sheet).

**It animates `clip-path`, never `transform`, and that is not a style choice.**
`transform` on the sheet panel belongs to `useSheetDrag`, which writes it inline
during a drag and again for the spring-back; an entrance animating the same
property would fight the gesture for it. The sheet family is six settled battles
deep (failure-archaeology §2) and none of them is visible to headless Chromium,
so the entrance was built to stay out of the gesture's way by construction.
**Nothing about `useSheetDrag`, `useScrollLock`, the arming condition, the
overscroll containment or the safe-area padding was touched.**

`backwards` again, and here for a second reason on top of the flash: the panel
is `rounded-t-2xl`, and a lingering `inset(0 0 0 0)` would leave a square clip
sitting on a rounded box forever. During the wipe the rounded corners are simply
the last thing revealed, which is correct.

#### The moment budget — four moments, and everything else is instant

| moment | where | why it earns a place |
|---|---|---|
| **the press run** | The Edge's entrance, and nowhere else | the signature |
| **the press** | every pressable, 90ms | the app answering a finger |
| **the sheet** | a sheet printing up from the bottom edge | the one surface that arrives |
| **the press bar** | loading | the app saying it is working |

**The press run is on the home screen only, and the budget is what decides
that.** A 620ms wipe on every navigation is a wipe you see forty times a day,
and it delays reading a screen you navigated to *deliberately* — you already
know what you want. The Edge is the opposite case: it is the default route, you
arrive without a target, and you read it top to bottom. **The signature stays
app-wide by being a MATERIAL rather than a page transition** — the same band
wipe carries the sheet and the loading bar, so the idiom appears on every screen
while exactly one screen animates its entrance.

Considered and cut, with the reason each failed:

- **An entrance on every screen** — see above.
- **A number roll-up on `Magnitude`.** It re-renders on every data refresh and
  every trade-builder toggle, so it would fire constantly; and law 2 says type
  size *is* the quantity, so animating the size puts the wrong quantity on
  screen while it animates.
- **A sliding tab-bar marker.** The marker would be briefly under the wrong tab,
  and a tab change should read as instant.
- **A verdict reveal on THE CALL.** It recomputes on every asset toggle — dozens
  of times per trade.

-----

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

## GitHub Pages Deployment

Every push to `main` triggers an automatic build and deploy — gated by
`npm run lint` and `npm test`, which must pass before the build and publish
steps run. No manual steps ever.

### GitHub Actions workflow

File: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      # fetch-depth: 0 is LOAD-BEARING — the build id is a first-parent commit
      # count, and a shallow clone makes that count 1 for EVERY build.
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Quality gates — a broken push fails here, BEFORE anything publishes.
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v5
        id: deployment
```

### Vite config

File: `vite.config.js` — sets `base` to the repo name, and stamps one build id
into **both** the bundle (`__BUILD_ID__`, via `define`) and an emitted
`version.json` (via a tiny inline plugin). The app compares the two — see
**App version self-heal** below.

**The build id is a BUILD NUMBER**: `git rev-list --count --first-parent HEAD`,
which advances by exactly one per merge (or direct push) to `main`. It is
deliberately **not** the PR number — `deploy.yml` runs on *push to main*, where
no PR number exists, and `values-history.yml`'s keepalive commits to `main` with
no PR at all.

**A shallow clone silently poisons it**, which is why `deploy.yml` sets
`fetch-depth: 0`: `actions/checkout` defaults to depth 1, where the count is
**1 for every build** — every deploy would share an id and the self-heal could
never detect a stale bundle. If that guard is ever lost, `vite.config.js`
detects the shallow repo (`git rev-parse --is-shallow-repository`) and falls
back to a timestamp id — uglier, but never a duplicate. `formatBuildId` renders
a digits-only id verbatim and only date-formats the fallback.

```js
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  base: '/dynastyedge/',            // must match the GitHub repo name exactly
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
```

`version.json` must be **emitted by the build**, never committed under
`public/` — a checked-in file would have to be bumped by hand and would
silently drift from the compiled-in id, which is the one thing this mechanism
cannot tolerate (drift either way means updates are never noticed, or every
launch reloads). `__BUILD_ID__` is declared in `eslint.config.js`'s browser
globals; `npm run dev` emits no `version.json`, so the check no-ops in dev.

### App version self-heal

**The problem:** on iOS a home-screen (standalone) web app keeps its own WebKit
cache, and GitHub Pages serves `index.html` with a fixed
`cache-control: max-age=600` that Pages gives **no way to configure**. A cold
launch can therefore boot **cached HTML referencing the old hashed chunks**, and
nothing in the running app notices. Reloading doesn't help — same URL, same
cached entry. Before this, the only reliable fix was deleting and re-adding the
home-screen app. (Confirmed 2026-09-04: the deploy was verified byte-identical
on the CDN while the phone still showed the previous build.)

**The mechanism (`useAppVersion` + `utils/appVersion.js`):** the running bundle
carries its own build id and fetches `version.json` to ask the server what the
current one is. A mismatch means the HTML on screen is stale.

- **Cold start reloads silently** — nothing is in flight to lose.
- **On focus it only reports** (`updateAvailable`), surfaced as an
  "Update available — Reload" row above Refresh in the side drawer. Yanking the
  page out from under a half-built trade is worse than a stale render.
- The reload target is `?v=<build id>` placed **before** the hash: it must be a
  real URL change (a hash-only edit reuses the same cache entry) and the app is
  a HashRouter, so a query after the hash would fold into the route.
- **Loop guard:** sessionStorage `dynastyedge_version_reload` records which
  build id was already reloaded toward. If the app is still stale afterwards the
  reload didn't land, so it never retries — it falls back to the drawer row.
  Without this, a reload that fails to take would cycle forever.
- The check is a **unique query per request** (`?t=<now>`) rather than
  `cache: 'no-store'`: the whole problem is caches that don't honor what
  they're told, and a URL nothing has seen can't be served from any of them.
- The hook is called **above the identity gate** in `App`, so a stale bundle
  that boots to the login screen self-heals too.
- It also returns **`buildId`** and **`versionState`** (`current` / `stale` /
  `unknown`) for the drawer's "App build" row — the mechanism's only visible
  surface. `unknown` is the default and covers both dev and a failed check;
  neither may render as "up to date".
- **Best-effort, fails open:** any fetch failure simply offers no update. It is
  deliberately **not** a service worker — a SW would also solve this, but a bad
  one can pin the app to a stale build permanently with no delete-and-re-add
  escape hatch left. This mechanism can only ever fail open.
- Caveat: the check runs after boot, so the first launch after a deploy still
  paints the old UI briefly before reloading. It removes the manual step, not
  the round trip.

### GitHub Pages setting (one-time, done manually)

In GitHub repo → Settings → Pages → Source: **GitHub Actions**
This only needs to be set once. After that, every push auto-deploys.

-----

## Constants File

`src/constants.js` — never hardcode these values anywhere else:

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

(The four feed URLs are elided above for width — they are full
`raw.githubusercontent.com/chnates/…` URLs in the real file.)

**`PICK_YEARS` is a SEED, not the source of truth.** The live three-season pick
window is derived per load by **`utils/seasonWindow.js`** and reaches the app as
**`pickYears` on `LeagueContext`**; every pick surface reads that, and the
constant is only what renders in the moment before `/state/nfl` resolves.

`resolvePickYears(nflState, drafts, seed)` asks one question — **has this
season's rookie draft been held?** The window starts at the current NFL season
until that season's non-auction draft reports `status: "complete"`, then at the
next one, plus the two seasons after it. Both inputs are already in the
`useSleeper` payload, so this costs **no extra request**. It degrades to the
seed when NFL state hasn't landed (never an empty window — every pick surface
is built from it).

**Why it stopped being a hand-rolled constant (2026-09-07).** The moment a
rookie draft completes, **FantasyCalc retires that season's pick entries** —
verified live the day this shipped: three days after the 2026 draft, all 24 of
its pick entries were 2027/2028/2029. So a stale window is not cosmetic. It
generated **40 spent picks across the league, every one priced at 0**, which
cluttered the Trade Analyzer's add sheet, roster pick badges and TeamCard grids;
and it left the newly tradable **2029** picks — four per team, priced by
FantasyCalc at 1,933 for a 1st — invisible to every surface in the app.
Measured on the live league at the fix: 120 picks, **0 priced at 0**, against
40 of 120 before.

Two things the roll must not break, both pinned by tests:

- **Year weights follow the WINDOW, not the calendar.** Feature 2's pick-capital
  score weights the nearest draft 3× / next 2× / third 1×. Keyed by literal year
  (`{ '2026': 3, … }`, as it was) the newly surfaced third season silently
  scores **0** the first time the window rolls.
- **The Draft Tracker keeps its recap.** `selectTrackedDraft` follows the
  upcoming draft whenever Sleeper has one — its whole purpose on draft day —
  and otherwise falls back to the **most recent completed** draft, so its recap
  stays on screen through the ~10 months before the league creates next year's
  board instead of collapsing to an empty "no draft yet" placeholder.
  `useSleeperDraft` therefore exports `FALLBACK_DRAFT_SEASON` (a seed), not the
  old `DRAFT_SEASON` constant, and the Tracker reads the season off the draft it
  is actually showing. **Trade › Pick Trades reads `pickYears[0]` instead** — it
  trades the *next* draft's picks — and refuses to borrow a draft board from a
  different season, so last draft's slots can never be stamped onto next
  draft's picks.

-----

## Rules Claude Code Must Always Follow

1. **Read this entire file before writing any code in a new session.**
   Then, if the task is "what should I build next?" rather than a named change,
   read **`docs/open-items.md` §0** — the plan, in priority order, with the
   trigger that makes each item ready. An item there carrying a
   **`Kickoff prompt`** block is ready-to-run work the owner has already signed
   off; paste it into a fresh session. **Never start an item whose trigger has
   not fired** — doing it early is a bug, and OPEN-2 is the worked example
   (rolling the pick window before the draft ran broke the Draft Tracker during
   the one event it exists for).
1. **Player resolution:** Sleeper returns IDs. FantasyCalc returns names + sleeperId.
   Always join on `sleeperId`. Never guess player names from IDs.
1. **Pick ownership:** Derive from traded_picks endpoint only.
   Do not guess, assume, or hardcode pick ownership.
1. **FantasyCalc caching:** Fetch once at app load via `useFantasyCalc` hook.
   Store result in React state at the app level. Pass down as props or via context.
   Never fetch inside a component that renders repeatedly.
   Auto-refresh on tab focus when data is >30 min old — silently, keeping
   cached data on screen while the refetch runs (stale-while-revalidate).
   **Sign-in must never depend on FantasyCalc.** Identity selection (the
   `LoginScreen` team list) reads `useLeague`'s Sleeper-only `signInRosters`,
   so a FantasyCalc outage can't lock the user out of their own app.
1. **Fetch timeouts:** Every network call goes through `src/utils/fetchJSON.js`
   (AbortController timeout). Never call raw `fetch()` directly.
1. **Player DB:** `/players/nfl` is fetched once per session via `usePlayerDB`.
   All consumers (rookies, injury statuses, unranked names, lineup history,
   transaction feed) read from that single cache.
1. **Unranked players:** Rostered players with no FantasyCalc value (deep
   stashes, some rookies, DEFs) are still shown — name resolved from the
   player DB, value displayed as `—`, contributing 0 to roster totals.
   Never silently drop a rostered player from a roster view.
1. **Sleeper ID normalization:** Sleeper returns IDs as strings or numbers
   depending on endpoint. Normalize to `String(id)` at ingestion (useLeague
   does this); all lookups and joins use string IDs.
1. **FAAB display:** Always format as `$XXX` (e.g. `$142`, not `142`).
1. **Dynasty values display:** Whole numbers only on 0–10000 scale.
   Never show decimals for values.
1. **Trend arrows:**
- `trend30Day > 50` → ↑ green
- `trend30Day < -50` → ↓ red
- Between → → grey
1. **Offseason mode:** Always check `/state/nfl` on load.
   If `season_type !== 'regular'`, hide: current matchups, lineup optimizer,
   weekly projections. All other features remain fully functional.
1. **Win window tiers:** Top 3 = Contending, Bottom 3 = Rebuilding, Middle 4 = Middle.
   Recalculate whenever roster data refreshes.
1. **Mobile layout:** Every component must work at 390px width. Test mentally
   before considering it done. Nothing should require horizontal scrolling
   unless explicitly designed as a swipeable horizontal list.
1. **Safe areas:** The main scroll area and the side drawer must account for
   the iPhone home indicator and notch via `env(safe-area-inset-*)`.
   `<main>` extends to the physical bottom edge (`bottom: 0`) and carries the
   home-indicator clearance as `padding-bottom` *inside* the scroll container —
   never shorten `<main>` with a bottom offset; that clips content at a dead
   bar above the home indicator. **The bottom tab bar does not relax this rule —
   it sharpens it.** `<main>` keeps `bottom: 0` and reserves the bar's height in
   its own `paddingBottom`
   (`calc(TAB_BAR_HEIGHT + env(safe-area-inset-bottom))`); the bar is a separate
   fixed element at `bottom: 0` carrying the inset as *its* bottom padding. A
   bottom bar is precisely the change that tempts you to write `bottom: 4rem` on
   `<main>`, and that re-creates the dead black bar already fixed twice
   (`86903a7`, `e8cd044`) — `overflow:hidden` on a root element clips fixed
   descendants above the bottom inset on iOS. Headless Chromium cannot show that
   failure; only a real iPhone can, so get it right by construction. (The old
   "there is no bottom nav — do not add one" clause is dead: the owner reopened
   it for the September 2026 design review — see Navigation.)
1. **Standalone web app (Add to Home Screen):** `index.html` declares
   `apple-mobile-web-app-capable` + `manifest.webmanifest` (display
   standalone, icons 192/512) so iOS draws the app edge-to-edge instead of
   letterboxing it with black bars. The standalone status bar uses the
   **`apple-mobile-web-app-status-bar-style` meta set to `default`**: iOS
   draws an opaque status bar and **auto-contrasts the clock/battery text to
   the appearance** (black on a light appearance, white on dark), so the bar
   matches the header in both themes with no hand-drawn strip. The bar color
   comes from **two static `prefers-color-scheme` `theme-color` metas** (light
   `#E8E5DC`, dark `#141413` — each matching the header, i.e. `--bg-secondary`
   in that theme). **They moved with the Matchday repaint** (from `#E7E9EC` /
   `#101013`); any future change to a ground colour must move them again, or the
   iOS status bar stops matching the header. They must be static:
   a single JS-mutated `theme-color` gets cached at launch in standalone mode,
   which is what previously rendered a stuck black band (owner-directed change
   2026-07-20 — the earlier `black-translucent` + light-mode dark strip design
   was replaced because the strip read as a hard black bar in light mode). The
   app header is **opaque** (`bg-bg-secondary`, no translucency/backdrop-blur)
   and fills the safe-area region via `paddingTop: env(safe-area-inset-top)`,
   so the bar and header read as one surface with no `-webkit-backdrop-filter`
   hairline at the boundary. Caveat inherent to `default`/system-driven bars:
   if the in-app theme toggle disagrees with the phone's system appearance,
   the iOS bar follows the system, not the toggle. Changes to these metas only
   take effect after the user removes and re-adds the home-screen app.
   Icon link tags carry a `?v=N` query — bump it to bust Safari's per-site
   icon cache when the logo changes.
   **App code updates are handled separately** — the standalone app's HTML
   cache used to require the same remove-and-re-add; it no longer does. See
   **App version self-heal** under GitHub Pages Deployment.
1. **Bottom sheets:** The app's scroll container is `<main>` — the body never
   scrolls. Every bottom sheet (PlayerProfileDrawer, RosterAnalysisSheet,
   trade add sheet, and any future sheet) must: call `useScrollLock()` while
   mounted (prevents iOS scroll chaining to the page behind), set
   `overscroll-behavior: contain` on its scroll container, pad its bottom
   with `env(safe-area-inset-bottom)`, and wire `useSheetDrag(onClose)`
   (attach `sheetRef` to the sheet panel and `scrollRef` to its scroll
   container) so swipe-down dismisses the sheet. The drag only arms when
   the content is at scroll top — without it iOS rubber-bands the content
   and the sheet won't close. Never duplicate the gesture logic locally.
1. **Error states:** Every API call needs a loading state and an error state.
   Never show a blank screen. If an API call fails, show a message and a retry button.
1. **Theme toggle:** Stored in `localStorage` key `dynastyedge_theme`.
   Default to `dark` if no preference is stored. Apply theme class to `<html>` element.
   All theme logic lives in the `useTheme` hook — never duplicate it.
1. **localStorage / sessionStorage keys** (all prefixed `dynastyedge_`):
   `dynastyedge_identity_v1` (signed-in roster — see Feature 18) ·
   `dynastyedge_theme` (theme) · `dynastyedge_watchlist_v1` (starred players) ·
   `dynastyedge_action_dismissals` (roster action items) ·
   `dynastyedge_edge_last_visit` (The Edge's last-visit timestamp) ·
   `dynastyedge_draft_*` (manual draft tracker) ·
   `dynastyedge_board_order` / `dynastyedge_prospect_notes` /
   `dynastyedge_csv_rankings` (draft board — see Feature 10) ·
   sessionStorage `dynastyedge_league_sort` / `dynastyedge_league_pos` /
   `dynastyedge_league_tier` (League tab filters, preserved across drill-downs) ·
   sessionStorage `dynastyedge_trade_draft` (in-progress trade) ·
   sessionStorage `dynastyedge_targets_team` (Trade › Targets team filter) ·
   sessionStorage `dynastyedge_version_reload` (app-version reload loop guard).
   **Roster-scoped keys** — `dynastyedge_action_dismissals`,
   `dynastyedge_trade_draft`, and `dynastyedge_targets_team` — are wiped by
   `useIdentity` on any identity change; league-wide caches are not. Add a
   new key to that wipe list if it is tied to *which team you are*.
1. **Shared components:** `ErrorState`, `SectionHeader`, and `SectionContents`
   live in `src/components/shared/` — import them, never redefine them locally.
   Within-section navigation is always `SectionContents` (pass it a section key;
   it reads that section's views from `src/navigation.js`); never hand-roll a
   section nav row. Primary navigation is `TabBar`, which reads the same map.
   **Never add a destination to a component — add it to `src/navigation.js`**,
   the one place the tab bar, the contents rails, the Index and global search
   all read.
1. **Design System library:** All new UI comes from `src/components/ui`
   (`Button`, `IconButton`, `Card`, `Mark`, `PositionBand`, `Magnitude`,
   `RuledList`, `Row`, `Lede`, `NavRow`, `Sheet`/`SheetHeader`, `Modal`, `Chip`,
   `Badge`, `Input`/`SearchInput`, `Textarea`, `Select`, `cn`, plus the re-exported shared
   primitives) — import from the
   `'../ui'` barrel. Never reintroduce a hand-rolled button, card, bottom
   sheet, filter chip, badge, band, value figure, row list, or input inline;
   extend a primitive instead. Four Matchday laws bind here specifically:
   **colour is a
   field, never a left-edge rail** (that is what `Card`'s deleted `accent` prop
   was); **magnitude is type size, never a progress bar** (`Magnitude`); a
   `Mark` **never takes a position hue**; and **a block is a ruled row, a
   `Lede`, or a `NavRow` before it is a `Card`** (law 5 — a stack of identical
   bordered rectangles is the failure, and an enumeration built from `Lede`s is
   the same failure inverted). Run `/design-review` on the CONSUMERS
   before committing component work — not on `src/components/ui` while the
   primitives themselves are being edited.
   **Run its judgement pass, not only its nine greps.** On the step-4 diff the
   detectors passed 955 added lines clean while eleven hand-rolled copies of one
   row had drifted apart on `.focus-ring`. And **audit for the SHAPE, not the
   API**: `Card`'s banned accent rail was deleted in step 3, yet a raw
   `border-l-[3px]` survived every step-4 sweep because nothing looking for the
   prop could find the pattern.
1. **Lint gate:** `npm run lint` (ESLint 9 flat config: recommended +
   react-hooks rules at error severity, scoped to `src/` + `scripts/`) must
   exit 0 before any commit, alongside `npm test` and `npm run build`. CI
   enforces all three on every branch push (`ci.yml`) and before the build
   step of every `main` deploy (`deploy.yml`). Never fix a
   `react-hooks/exhaustive-deps` error by deleting the dependency array or
   blanket-disabling the rule — either add the dependency or
   disable-with-comment on the one line, stating why the value is stable.
1. **The app name is DynastyEdge.** Use it in the page `<title>`,
   the header, and any loading/splash screen.
1. **The MCP server (`mcp/`) imports `src/utils` — it never copies it, and
   `src/` never imports from `mcp/`.** A tool is orchestration only; any math
   it needs is written in `src/utils` so the app gets the same number. Every
   tool response carries an as-of stamp, is bounded (never a raw payload), and
   takes `leagueId` / `rosterId` as parameters rather than reading the
   constants. Rate-limit and retry logic lives in `mcp/limit.js`, never in
   `fetchJSON`. See **The MCP Server**.

-----

## Future Features (Do Not Build Yet)

> **"What's next?" is answered by `docs/open-items.md` §0**, which is titled
> "read this first" and carries the current plan in priority order. It is the
> living backlog of deferred work, each item with the trigger condition that
> makes it ready, and **an item carrying a `Kickoff prompt` block is
> ready-to-run work with the owner's sign-off already on it.**
> `docs/archive/build-plan-2026-09.md` was the active queue through 2026-09; **all four
> of its phases are now resolved** (1 shipped · 2 shipped-with-a-recorded-miss ·
> 3 partial, 3b/3c null · 4 cut), so it is archived history. Its still-cited
> §0/§8 standing rules now live in `open-items.md` §0, and Phase 4b–d's spec in
> its PHASE-4BCD entry.
> Read it before proposing next steps. Some items are **not** ready work and
> say so explicitly (rolling `PICK_YEARS` before the rookie draft runs actively
> breaks the Draft Tracker). The list below is the longer-horizon feature
> backlog; `open-items.md` is the near-term one.

These are noted so the codebase is structured to support them later.
Do not implement them until explicitly asked.

- Push notifications for trade offers (requires backend — out of scope for v1;
  note Sleeper's API is read-only and may not even expose *pending* trade
  offers, so this is blocked on data availability, not just architecture)

### Already built (formerly future features)

- Rookie draft board and ADP tracker → Draft section
- Injury-status player news → PlayerProfileDrawer + trade analysis
- Player intelligence panel (production, depth chart, peak window, ESPN news)
  → PlayerProfileDrawer + trade Live Intelligence (`usePlayerIntel`)
- League transaction feed with FAAB bids → League › Activity
- Market movers / buy-low / sell-high → League › Movers
- Watchlist (star players, surfaced in Trade Partners) → `useWatchlist`
- Lineup efficiency season review → Squad › Season Review
- Playoff odds / rest-of-season simulator (engine + page) → League › Playoffs
  (Feature 14); strength-of-schedule outlook is subsumed by it. Odds feed
  Trade Analyzer Layer 3, Trade Partner Finder (buyer/seller flags), and The
  Edge (briefing item)
- League-wide news feed page → News section (Feature 15)
- FAAB bid recommender → League › Free Agents (beside each Recommended
  Pickup) and the MCP server's `recommend_free_agents`, from one util,
  `utils/faabBid.js` (OPEN-3, shipped 2026-10-07; see the recommendation
  engine). Graded at Weeks 13–15 against the bars pre-registered in
  `docs/analysis/faab-bid-corpus-2026-08.md` §10
- Claude Design visual refresh → the "Primetime Blackout" rebrand
  (Navigation Refactor Phase 3, shipped 2026-07-20) — see Design System
