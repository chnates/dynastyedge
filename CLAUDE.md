# CLAUDE.md — DynastyEdge

> This file is the single source of truth for the DynastyEdge app.
> Read it entirely at the start of every session before writing any code.
> Every feature, data source, design decision, and rule is documented here.

-----

## What This App Is

**DynastyEdge** is a personal dynasty fantasy football web app built for one user
(chnates / Nix Cage) playing in a 10-team Superflex Half PPR dynasty league on Sleeper.

It connects to two free public APIs — Sleeper and FantasyCalc — to deliver
competitive intelligence that isn’t available in the Sleeper app itself:
dynasty trade values layered onto live roster data, trade partner recommendations,
lineup optimization with matchup context, and a full league-wide competitive landscape.

**Target device:** iPhone Safari (390px width — iPhone 15 Pro)
**Hosting:** GitHub Pages (static site, no backend, no server)
**Live URL:** <https://chnates.github.io/dynastyedge/>

> **AMENDMENT (2026-09-19) — "no backend" now means "the APP has no backend".**
> The repo also contains **`mcp/`**, a Model Context Protocol server that lets
> the owner ask the same questions from the Claude apps. It is a real server
> process, so the old blanket phrasing above is no longer literally true and is
> corrected here rather than quietly contradicted.
>
> What is unchanged, and what the rule was always protecting:
> **the web app at the URL above is still a pure static site.** It has no
> backend, calls no server of ours, and the MCP server is not in its bundle
> (verified byte-identical, 995,441 bytes, when the SDK was added). Nothing in
> `src/` imports anything from `mcp/`; the dependency runs one way only.
>
> The constraint chain that produced the rule — one user, $0, zero ops,
> therefore static hosting, therefore free unauthenticated APIs and GitHub
> Actions as the "server" — still governs every decision inside `src/`. A
> feature may **not** grow a backend. See **The MCP Server** below.

-----

## Tech Stack

|Layer     |Tool            |Notes                              |
|----------|----------------|-----------------------------------|
|Framework |React (via Vite)|Functional components + hooks only |
|Styling   |Tailwind CSS    |Dark mode default, mobile-first    |
|Navigation|React Router v7 |Side drawer menu, 6 sections       |
|Build tool|Vite            |Outputs to `dist/` for GitHub Pages|
|Deployment|GitHub Pages    |Auto-deploys via GitHub Actions    |
|CI/CD     |GitHub Actions  |Every push to `main`: lint + test, then deploy|
|MCP server|`@modelcontextprotocol/sdk` (Node)|`mcp/`, stdio — **not** part of the web bundle|

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

**The FAAB budget changed 10× for 2026** ($100 → $1000, from
`league.settings.waiver_budget`). Always read it from league settings — never
assume 100. Historical bids are on the old scale, so any cross-season bid
comparison must normalize to **percent of budget**
(see `docs/analysis/faab-bid-corpus-2026-08.md`).

**IT ALSO RESETS TWICE A LEAGUE YEAR — offseason, then again at the start of
the regular season, and anything unspent in the offseason is LOST** (owner,
2026-09-20). So one Sleeper season carries **two** budgets, and two things
follow that are easy to get backwards:

- **`roster.settings.waiver_budget_used` tracks only the CURRENT period.** That
  is why `leagueState.js`'s `faabRemaining` / `faabSpent` are correct as
  written, and must never be "reconciled" against a transaction-log total.
  Live 2026-09-20: docj11 had spent **$703** in the offseason and his
  `waiver_budget_used` read **$0** — both numbers true, answering different
  questions.
- **A season's transaction log routinely exceeds one budget**, because it spans
  both periods. Measured across 2023–26: **six manager-seasons exceed one
  budget and none has ever exceeded two** — which is the signature of exactly
  two resets. chnates 2025 spent exactly $100 in the offseason and a fresh $30
  in-season. Anything that caps a season at one budget is discarding real
  spend.

A *single bid* needs no period split: both periods carry the same
`waiver_budget` and Sleeper exposes no separate offseason figure, so
`bid ÷ waiver_budget` is exact either side of the reset. A *total* is therefore
a **count of budgets committed**, never a percent of an allocation.

**Identity is runtime state, not a constant.** The signed-in roster comes from
the `useIdentity` store (set on the login screen — see Feature 18), so
`MY_ROSTER_ID` is no longer the source of truth. Every "is this me?" check
reads `myRosterId` from `LeagueContext` / `useIdentity`; the constants above
remain only as this league's original-owner reference.

### Roster slots

QB · RB · RB · WR · WR · TE · FLEX × 3 (RB/WR/TE) · Superflex (QB/WR/RB/TE) · DEF
**13 bench** · 5 taxi · 2 IR — **24 active slots** in total.

**Read the cap from `leagueInfo.roster_positions`, never from prose.** This
line said 12 bench until 2026-09-06, when `getRosterLimits` was written against
the live payload and found 13. Taxi and IR sit *outside* the 24.

**Taxi rules (Sleeper settings):** only rookies can be *added*, but taxi
duration is **2 years** — a player may stay through their rookie and 2nd-year
seasons. Players entering their 3rd NFL season (`years_exp >= 2`) must be
activated before the regular season starts (taxi deadline: start of regular
season). Taxi action items flag `years_exp >= 2`, never 2nd-year players.

**No kicker in this league.**

**Exactly one defense is ever rostered.** There is one DEF slot, only one
defense can start in any week, and a defense carries no dynasty value
(FantasyCalc ranks zero of them) — so a second one is a wasted bench spot.
Owner doctrine, 2026-09-04. The app must therefore **never suggest adding a
defense as a pickup**: defenses appear only against the DEF slot (the
Optimizer's waiver drawer) or the DEF filter (League › Free Agents), never in
a general free-agent pool, never in `recommendFreeAgents`, and never with
dynasty-asset framing (no opportunity grade, no value card, no trade CTA).
The one question worth answering there is "is there a reason to replace the
one I have?" — and the measured answer is almost always no (see Feature 4's
free-agent layer).

3 FLEX spots means starting 5–6 RBs/WRs is common. RB and WR depth are
disproportionately valuable. Superflex makes elite QBs the single most
valuable dynasty asset despite 4-pt passing TDs.

-----

## Data Sources

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
not names. Player names are resolved by matching Sleeper IDs against FantasyCalc
data (which includes a `sleeperId` field). This is the bridge between the two APIs.
Always use `sleeperId` as the join key (normalized to strings). Players FantasyCalc
doesn't rank fall back to the shared player DB for name/position and display `—`
as their value.

**Critical schedule note — THREE fields, and the third was ignored for a year.**
The schedule payload is `{ status, date, home, week, game_id, away }`.
**`status` is what says whether a game has kicked off** (`pre_game` →
`in_game` → `complete`), and until 2026-09-20 both `parseByeTeams`
implementations read only `home`/`away`/`week` and discarded it. Sleeper
**locks a player's lineup slot at kickoff**, so throwing that field away meant
the Optimizer offered moves that could not be made — see Feature 4's game-lock
section and `utils/projections.js`'s `parseLockedTeams`.

The other two traps are the original ones: the NFL schedule is the ONE Sleeper
endpoint that does **not** live under `/v1` — ``/v1/schedule/nfl/regular/{year}`` 404s for every
season (verified 2026-08-08 against 2024/2025/2026). Use `SLEEPER_ROOT`
(`https://api.sleeper.app`, no `/v1`). Its payload also uses **`home` / `away`**,
not `home_team` / `away_team`. Both mistakes fail *silently* — the wrong field
names simply yield "no games", killing bye detection and opponent lookup — which
is why they survived until the Week 1 rehearsal (see `docs/open-items.md`).

**Critical stats note:** `/stats/nfl/regular/{year}/{week}` entries carry **no
`pos` / `opp` / `tm`** — all three are `null` on every entry in every season
checked (2022–2026). Anything needing a player's position, team, or opponent
must join to the shared player DB (`usePlayerDB` keeps `position` + `team`) and
to the schedule. The stats payload supplies points and nothing else.

**`TEAM_*` trap — two kinds of team key, and only one is an asset.** Both the
weekly and season stats payloads carry **`ARI`** (the **team defense**, a real
fantasy asset, `pts_half_ppr` ≈ −4…20) *and* **`TEAM_ARI`** (**team offense
totals** — 584 pass attempts, 549 targets, `pts_half_ppr` ≈ 110–120). Both are
non-numeric, so **any `!isNumeric(id)` test that means "this is a defense"
silently sweeps in a 110-point row.** The shipped `computeDefenseRankings` is
safe only *by accident* — `TEAM_ARI` is absent from the player DB, so its
`playerDB[id]` lookup drops it. **Anything new touching defenses must exclude
the `TEAM_` prefix explicitly** (`utils/freeAgents.js` exports `isTeamTotalsKey`
for exactly this). The one legitimate read of a `TEAM_*` row is as a
**denominator**: `usePlayerIntel`'s target/rush share divides a player's
`rec_tgt` / `rush_att` by his team's, which is what those rows are for.

**Standings note:** Win/loss records and points for/against come from
`roster.settings` (`wins`, `losses`, `ties`, `fpts`, `fpts_against`) on the
rosters endpoint — no extra call needed.

**Transactions note:** The transaction feed fetches all 18 weekly buckets in
parallel (small responses, well under the rate limit) and caches per session.
A failed bucket contributes nothing (per-week catch), but when **all 18**
fail the load rejects so League › Activity shows `ErrorState` + retry instead
of an empty feed masquerading as "no moves". Waiver claims include the
winning FAAB bid in `settings.waiver_bid`.

**Offseason detection:** Call `/state/nfl` on app load. If `season_type !== 'regular'`,
hide all in-season UI: current matchups, weekly projections, lineup optimizer flags.
The app still works fully in the offseason — it just hides irrelevant weekly features.

**Player intelligence (`usePlayerIntel`):** the PlayerProfileDrawer and the
trade Live Intelligence cards show recent fantasy production, depth chart
context, peak-window status, and recent news. Sources:

- **Production:** Sleeper season stats (`/stats/nfl/regular/{year}`, half-PPR
  points, games, positional finish ranked client-side) — in-season also the
  last 3 weekly stat buckets (points + targets/carries). Offseason shows the
  last completed season's summary.
- **Depth chart / news recency:** `depth_chart_position`, `depth_chart_order`,
  `news_updated`, and `espn_id` are kept in the trimmed `usePlayerDB` cache.
  `buildDepthRoom` turns the first two into the player's **NFL position room**
  — teammates at his position ranked by depth order, viewed player highlighted,
  the card hidden entirely when Sleeper has no order. Every room row carries
  **that teammate's dynasty value**, joined on `sleeperId` to the cached
  FantasyCalc `playerMap` (the drawer's prop, context as fallback) — the room
  alone doesn't say much, since "WR2 behind a 1,100 WR1" reads nothing like
  "WR2 behind a 7,000 one". Zero extra fetch; unranked teammates show `—`
  (rule 7).
- **Usage — DISPLAY ONLY:** snap share (`off_snp` / `tm_off_snp`), target share
  and, for RBs, rush share (`rec_tgt` / `rush_att` over the **`TEAM_{team}`**
  offense totals in the same payload — see the `TEAM_*` trap above), plus
  red-zone targets. Rendered on the profile drawer as a "Usage · {year} season"
  card labelled *"how he's being used"*. It uses the season the Production card
  uses, falling back one season when the current one has no usage yet (Week 1),
  and the card always names its year. **This must never feed a projection, a
  score, or a recommendation ranking** — owner call 2026-09-04, on the measured
  finding that adding usage to Sleeper's weekly projection gains 0.026 MAE with
  coefficient signs that flip between specifications
  (`docs/analysis/optimizer-data-sources-2026-09.md` §5, H6 disconfirmed).
  Sleeper already prices usage in; the value here is descriptive context.
- **Peak window:** `utils/peakWindows.js` (shared with Roster Analysis).
- **Unranked players get no fabricated grade.** The drawer's opportunity grade
  (A–D) and Dynasty Outlook line are derived entirely from a FantasyCalc
  positional rank, so they render only when the player actually has one — a
  team defense or an unranked stash previously fell through a `?? 99` default
  and was stamped "D — Deep Stash". Dynasty value shows `—` (rule 7).
- **A defense gets no dynasty framing at all.** It is not a dynasty asset in
  this app's model (League Context: one is rostered, ever), so on a DEF the
  drawer also drops the **Dynasty Value card** and the **Analyze Trade** CTA —
  a value card reading `—` and a trade the Analyzer would price at 0 are noise,
  not information. What remains is what a defense actually has: status,
  production, and which defense it would replace.
- All fetches are lazy (first profile open) and session-cached — nothing at
  app load.

-----

### Player news pipeline (GitHub Actions + multi-source aggregation)

News sources block browser/CORS access, so news is aggregated **server-side in
GitHub Actions** and served as a static file — keeping the no-backend
architecture:

- `.github/workflows/news.yml` **asks** to run twice an hour (cron
  `17,47 * * * *`, plus manual `workflow_dispatch`). It runs `scripts/fetch-news.mjs`, which
  pulls **ten** sources, merges them into the **previously published
  feed**, resolves each item to the players it names, ranks player news above
  general news, and **force-pushes a single-commit `news-data` branch**
  containing `news.json`. Each item carries `headline`, `story` (≤600 chars),
  `published`, `source`, `link` (validated http(s) article URL or null),
  `athleteIds`, `playerIds`, and `isPlayerNews`.
- **ONLY `main` PUBLISHES — a dispatch from any other branch is a DRY RUN.**
  All three pipelines' publish steps carry
  `if: github.ref_name == github.event.repository.default_branch`. The script
  still runs and its log still prints the coverage line (items, cap, depth,
  distinct players, per-source counts), so a branch run is inspectable; it
  just cannot force-push the production data branch. `rookie-intel.yml` always
  had this guard; **`news.yml` and `values-history.yml` did not until
  2026-09-22**, and a branch dispatch had published unreviewed code to the live
  `news-data` feed **twice** — both times as "verification" (the 2026-09-12
  retention fix and the 2026-09-22 NEWS-4/NEWS-7 work). **To verify a
  pipeline change:** dry-run it from the branch and read the log; after merge,
  dispatch it on `main` and read the *published* file. The published feed is
  only ever `main`'s code.
- **THE CRON IS A REQUEST, NOT A SCHEDULE — measured 2026-09-21, GitHub
  delivers ~7.4 runs/day at a 3.26h mean gap, not 48 at 0.5h.** Over runs
  1205–1220 (consecutive run numbers, so nothing is missing from the list)
  the gaps ran **1.8h to 5.0h**, and **not one run fired at :17 or :47** —
  the observed minutes are scattered across the hour. GitHub defers scheduled
  workflows under load and does **not** make up the skipped occurrences.
  Three documented claims were sized off the cron line rather than off
  reality and are corrected in place: the feed's staleness worst case (below,
  in the MCP news section), the "~48 preview builds a day" this caused on
  Vercel (Deployment section), and the retention window's arrival-rate
  assumptions. **Anything that matters to freshness must be measured from
  run timestamps, never read off the cron.** Tightening the cron is not a
  fix — the requested cadence is already 6× what is delivered.
- **Sources, in priority order** (each probed and parsed server-side before
  adoption — see `docs/analysis/news-sources-2026-09.md` for the full probe,
  including the ten rejected candidates): ESPN news API (the only source that
  ships `athleteIds`), **RotoWire's news page**, RotoWire RSS, Yardbarker,
  PFF, The Athletic, PFT, CBS, Sporting News, Yahoo. The percentage
  of a source's items naming a real player is the reason each is on the list;
  Yahoo (8%) still ships because the News tab wants general items too, it just
  loses every tiebreak.
  - **RotoWire is scraped from `rotowire.com/football/news.php`, not its RSS.**
    The RSS is hard-capped at 5 items — `count`, `limit`, `numitems`, `team`
    and `pos` are all ignored (probed). The page carries 25 of the same
    updates in structured `news-update__*` markup, and every headline is
    literally `Player: Note`, the shape the app matches on. It is the single
    most player-dense source in the pipeline. Markup is more fragile than an
    RSS contract, so it sits in the same best-effort `try` as everything else.
  - **ESPN RSS is gone (2026-09-22, NEWS-7) — alive everywhere except where
    this runs.** `espn.com/espn/rss/nfl/news` serves 25+ items to a browser
    or a sandbox, and to GitHub's runners it answers **HTTP 202 with an EMPTY
    `text/html` body** — a bot-manager deferral, not a feed. A 202 is
    `res.ok`, so the fetch never threw: it parsed an empty string to 0 items,
    on every run measured (8 consecutive by the time the log was read). The
    earlier diagnosis — "written from the catch branch, so it is throwing" —
    was wrong, and both candidate causes it named (403, timeout) were wrong
    with it; the empty 202 was only visible once the script was made to print
    what it received. **An RSS source that 2xx-parses to nothing now logs its
    status, final URL, content-type, size and first bytes**, so the next one
    names itself in the run log. The ESPN news API is unaffected and remains
    the first source.
  - **FantasyPros is gone.** All three of its endpoints are dead
    (`/nfl/rss/player-news.php` 404, `/nfl/rss/news.php` 404,
    `/rss/player-news.xml` 200-with-empty-body). It was the most
    player-focused source in the old list and had been contributing nothing.
  - **ESPN's per-team RSS is a trap.** `/rss/nfl/team/news/_/name/{team}`
    looks like 32 beat feeds and is the identical national all-sports feed for
    every team (kc and sf return the same 42 items, WNBA and World Cup
    included). Same for `/rss/nfl/injuries`. Never adopt either.
- **The feed ACCUMULATES.** It used to be a snapshot of one fetch capped at
  100 items, which spanned ~20 hours because 100 general-interest items
  flushed the player news out. Each run now merges into the last run's output,
  retaining **player items 7 days (1200 max, ~3 per player)** and
  **general items 48 hours (80 max)**. This is what makes a
  source like RotoWire (25 player items per pull) compound across 48 runs a
  day. The workflow therefore reads the previous `news.json` off the
  `news-data` branch **via git, not the raw.githubusercontent CDN** (which
  caches ~5 minutes and would hand a run back its own grandparent); a branch
  that exists but won't yield the file fails the job **before** the publish
  step, so the accumulated window is never force-pushed away.
- **Eviction is DIVERSITY-AWARE, not recency-only — the cap must never be
  allowed to bind before the time window does.** Newest-first, an item is
  admitted while **any** player it names is still under `PER_PLAYER_MAX` (3),
  so a 24th headline about the most newsworthy player in the league is dropped
  *before* an older item about a player nobody else covered. An item resolving
  to no Sleeper id rides on recency (it is player news by ESPN athlete id
  alone). The policy is pure and lives in `scripts/newsRetention.mjs` so
  `tests/newsRetention.test.mjs` can pin it — **do not inline it back into the
  fetch script, and do not "simplify" it to a `slice`.**
  **`PER_PLAYER_MAX` is a soft quota, deliberately.** Admission is "any player
  named still has room", and quota is charged to *every* player an item names,
  so a roundup carrying one rarely-covered player is admitted and bills the
  stars alongside him. A player can therefore exceed 3 — measured on the first
  published run, 16 of 119 players did, to a maximum of 6, and all of the
  excess arrived in multi-player items. Enforcing a hard per-player ceiling
  would mean rejecting the roundup, i.e. dropping the rare player the rule
  exists to protect. Do not "fix" the overflow.
  **Why:** with recency-only eviction the 240-item cap bound at ~30 hours and
  the documented 7-day window had never once bound. Measured 2026-09-12:
  `playerItems` pinned at exactly 240, oldest retained item 29.7h, player
  items arriving at 8.1/h (7 days would need ~1357). Depth had silently
  collapsed 159h → 27.5h and coverage regressed 10/26 → 6/30. The cap was
  being spent on redundancy rather than breadth — those 240 items resolved to
  just **97 distinct players**, 3.14 each, one carrying 23 — so capping per
  player holds the same 97 in 152 items and frees 37% of the cap for depth.
  One run of the fix moved span **27.5h → 76h** and unpinned the cap
  (165/400). See `docs/analysis/news-retention-2026-09.md`.
  **The cap bound again at 400, and was raised to 1200 (2026-09-22, NEWS-4).**
  Within ten days `playerItems` was pinned at 400/400 with the span at 78h,
  then 56h — the collapse's signature one level up, with the difference that
  breadth held (**207 distinct players** against the collapse's 97), so the
  cap was buying breadth and simply running out of room. The 7-day window had
  **never once bound at either cap**. The window retained ~7.1 player items/h
  after diversity eviction; 168h at that rate is ~1200. **Until `depthHours`
  reaches ~168h, "7 days" is the policy's ceiling, not a measured depth** — the
  cap fills over several days of accumulation (evicted items do not come
  back), so re-read `depthHours` about a week after 2026-09-22 before calling
  it met. If the cap pins again below 168h, correct this line to the measured
  depth rather than raising the cap a third time on the same argument.
  **`depthHours` is the number to watch, never `playerItems`**: a feed pinned
  at its cap is exactly what a healthy full feed looks like, which is how the
  2026-09 collapse ran for days unnoticed. (Nor `spanHours` — see the
  `coverage` block: the first run at 1200 read span 147h at depth 52h.)
- **Size the feed by its WIRE bytes, not its raw bytes.**
  `raw.githubusercontent.com` serves the feed gzipped: measured 2026-09-12,
  320 items were 141KB raw but **37KB on the wire** (~114 B/item); 2026-09-22,
  480 items were 211KB raw and **53,957 B on the wire** (~112 B/item). The
  1200+80 cap projects to **~144KB gzipped** against ~54KB at 400+80 — still a
  fraction of the 5–8MB player DB the phone already pulls once a session. Earlier notes priced this feed at "~100KB, pulled once
  per session" from its raw size and so over-priced the cap by ~4×.
- **Two per-source density traps.** The percentages in
  `docs/analysis/news-sources-2026-09.md` were measured in the **preseason on
  headlines only**, and they do not survive contact with the season: Yahoo,
  recorded there at 8%, measured **57%** on the live feed and is the single
  largest contributor of player items (62) *and* of players **no other source
  covers** (16). Dropping a source for a stale density number would lose
  coverage outright. And a high-volume general source **cannot** crowd out a
  player source — the player and general buckets have independent caps, so an
  item can only consume the player window by actually being player news.
  Re-measure density against the live feed before acting on it.
- **Later copies win on content, but the FIRST publish time we recorded
  stands** — retained items are seeded before the current pull and sources run
  most-precise-first, so an item can neither float back to the top by being
  re-listed nor lose an exact RSS timestamp to a date-only reprint of itself.
- The app fetches `NEWS_FEED_URL`
  (`raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json` —
  sends CORS `*`, ~5 min CDN cache) once per session in `usePlayerIntel`.
- **Player matching — `playerIds` is the join, not `athleteIds`.** The feed
  resolves every item against Sleeper's player DB server-side (ESPN athlete id
  first, then normalized full name across headline **and** story) and stamps
  the matched **Sleeper** ids on the item. All three client matchers
  (`usePlayerIntel`'s `matchFeedItems`, `useLeagueNews`, `useNewsFeed`) read
  `playerIds` first, then `athleteIds`, then the headline name.
  **Why:** `espn_id` is null for most of a dynasty roster — only **9 of the
  owner's 26 rostered spots** carry one — so the old id-first design could
  never reach Bo Nix, Brock Bowers, Rachaad White, Chase Brown and thirteen
  others by anything but a headline name. `athleteIds` is still enriched from
  name matches, so a consumer predating `playerIds` keeps working.
  ESPN tags roundup columns with *every* athlete mentioned, and story-level
  name matching does the same, so a multi-player article can surface on a
  player the headline isn't about — by design (we'd rather show the buried
  blurb than miss it). The article sheet flags this case explicitly, reading
  whichever of `playerIds` / `athleteIds` is longer.
- **`coverage` block.** The feed carries `{ total, playerItems, playerCap,
  distinctPlayers, withPlayerIds, withAthleteIds, spanHours, depthHours,
  sources, sourceMisses }` next to `updatedAt`, so feed health is
  inspectable and the next measurement of this pipeline has a baseline.
  **`sourceMisses` counts CONSECUTIVE runs each source has returned nothing**,
  carried forward in the feed because a force-pushed feed has no history of its
  own to count from — see **The source-health alarm** below.
  `node scripts/dev/news-coverage.mjs` reports it against the live feed (or a
  local file) along with how many of the owner's rostered players the app
  actually resolves — that is the pipeline's acceptance metric.
  **`depthHours` and `distinctPlayers` are the two numbers that diagnose a
  degraded window, and `playerItems` is the one that hides it.** The 2026-09
  collapse ran for days with `playerItems` sitting at exactly its cap, which
  reads as a full, healthy feed; depth was what told the story, and distinct
  players was what the cap was failing to buy.
  **`depthHours`, not `spanHours` (2026-09-22).** `spanHours` is max − min over
  every item, so a handful of stragglers set it — invisible while the cap
  evicted the oldest items first, and exposed the moment the cap was raised:
  one run moved `spanHours` **54h → 147h** on three week-old items from The
  Athletic's current pull, while the player window's p90 age went **51h →
  52h**. `depthHours` (`scripts/newsCoverage.mjs`, pinned by
  `tests/newsCoverage.test.mjs`) is the **p90 age of the player items,
  measured from the newest one** — under 10% of the window can move it.
  `spanHours` still ships, unchanged in meaning, for any reader that has it. `playerCap` ships alongside
  `playerItems` so "is the cap binding?" is answerable from the feed alone
  rather than by reading the script.
  **The drawer's News row reads it** (2026-09-12, NEWS-2): one indented line
  under the row — *"5d deep · 119 players"* — amber under
  `NEWS_SPAN_THIN_HOURS` (48). It reads `depthHours`, falling back to
  `spanHours` only for a feed that predates the field; on `spanHours` the
  2026-09-22 feed would have read "6d deep" at two days' real depth. It shows **depth, deliberately not item count**:
  during the collapse the item count sat at exactly its cap, which is what a
  healthy full feed looks like. Versionless and best-effort — a feed carrying
  no `coverage` (or no `distinctPlayers`) renders a shorter line or none at
  all, never an error.
- **News items are tappable everywhere they appear** (profile drawer
  "Latest News", The Edge "Headlines") → `NewsArticleSheet`, a bottom sheet
  (z-60, layers above the profile drawer) with the full stored story, a
  "Read full article" link when the item has one (opens the source site —
  in-app Safari sheet on the home-screen app), a multi-player-roundup note,
  and (from The Edge) a "View profile" action.
  Full articles are never embedded — sources block cross-origin framing.
- If the feed has no items for a player, the client falls back to ESPN's
  unofficial per-player endpoints (`site.api.espn.com/apis/fantasy/v2/...`,
  `site.web.api.espn.com/apis/common/v3/...`) — these are CORS-blocked in
  practice (and 403 server-side) but cost nothing and degrade silently.
- **News must never block a panel, show an error, or retry-loop.** On any
  failure the news section simply hides. Verified end to end: with every
  source AND the player DB unreachable the script republishes the retained
  window intact; with no previous feed either, it exits 1 without writing, so
  the branch keeps the feed it has.
- **Coverage, measured (2026-09-04).** Before: 100 items, 25.7h deep, 25%
  naming a player, **5 of 26 rostered players** resolvable. After: 207 items,
  159h deep, 57% resolved to players, **10 of 26**. That **misses** the
  pre-registered target of 12 (`docs/build-plan-2026-09.md` §3) and is
  recorded as a miss. The remaining 15 are genuine absence, not matching
  failures — each was checked, and none of their names appear anywhere in the
  feed's text; the app now resolves *every* player the matcher can find, so
  no further matching work can move the number. Volume is the remaining
  lever, and accumulation had not yet run when this was measured.
  **Re-measure after a week of accumulation before adding sources.**
- Caveat: GitHub disables cron workflows after ~60 days without repo
  activity — any push re-enables it. The workflows' own force-pushes to the
  data branches do NOT reset that clock; the values-history workflow's
  keepalive step (empty bot commit to `main` when it's 45+ days quiet)
  protects both pipelines, and the side drawer's feed-age line surfaces a
  dead feed.

-----

### The source-health alarm (both multi-source pipelines)

**"Degrades quietly" had become "fails invisibly", and that is a different
thing.** Every multi-source pipeline here is best-effort per source, which is
the right contract — one dead source must never cost the other ten. But
nothing ever *said* a source had stopped: `fetch-news.mjs` catches a failed
source, records a `0` and logs one line into a run log nobody reads, and the
three snapshot steps in `values-history.yml` are `continue-on-error`, so the
run is **green whatever they did**.

**It was not hypothetical. Measured 2026-09-21: ESPN RSS had been contributing
0 items to the live feed, while returning 25 perfectly good items to anyone who
asked from elsewhere.** Nothing surfaced it. (The cause, read from the Actions
log on 2026-09-22: ESPN answers the runners with an **empty HTTP 202** — a 2xx,
so nothing threw. The source was removed; see the news pipeline section.) That is the second instance of
this exact shape — FantasyPros, "the most player-focused source in the old
list", was dead across all three endpoints and "had been contributing nothing"
until a hand probe found it months later. Twice is a pattern, so it gets an
instrument (see `docs/open-items.md` **NEWS-6**).

- **`scripts/sourceHealth.mjs`** is the policy — pure, shared by both
  pipelines, pinned by `tests/sourceHealth.test.mjs`. Same precedent as
  `newsRetention.mjs` and `fantasyCalcValues.mjs`: **do not inline it back into
  a fetch script.**
- **`scripts/check-source-health.mjs`** runs in Actions **after the publish
  step** and **fails the workflow** when a source has gone dark. Failing is the
  point: it is what turns GitHub's own notification into the warning. Running
  after publish is also the point — the day's data is already on the branch by
  the time the alarm decides to shout, so **the alarm can never cost data.**
- **ALARM ON A PERSISTENT GAP, NEVER ON A SINGLE MISS.** A one-run blip is a
  CDN hiccup, and an alarm that cries at hiccups is one you learn to ignore —
  which would leave the pipelines exactly as silent as they were before it
  existed. Same discipline `spanHours` keeps: measure the **window**, not the
  instant. Pinned by test from both directions: a 3-day gap fires, a 1-day blip
  does not.
- **The thresholds are sized off MEASURED cadence, never off the cron line**
  (`DARK_AFTER`): the archive alarms after **3** consecutive daily runs, the
  news feed after **12** — ~1.5 days at the delivered ~7.4 runs/day, not the 48
  the cron asks for. Both mean "roughly a day or more of total silence".
- **The archive diagnoses itself.** `values-consensus.json` already carries
  `coverage[]` per source aligned to `dates[]`, so a null column *is* the
  record of a source not being read. No extra state file, and no way for a
  counter to drift from the data it describes. The news feed has no history of
  its own, so there the counter rides in `coverage.sourceMisses`.
- **A MISSING FILE IS ITSELF AN ALARM.** Every snapshot step is
  `continue-on-error`, so a script that died outright leaves the run green and
  writes nothing — silence that looks exactly like success. Absence is the
  loudest signal here and is treated as one.
- **A fresh archive never alarms**, because the check needs a full window of
  history before it can fire; otherwise every new pipeline would page on day
  one and be ignored by day two.
- The message names the source, how long it has been silent, the likeliest
  cause, and — explicitly — that **a genuinely dead source should be removed**,
  because an alarm nobody can clear stops meaning what it says.

-----

### Value history pipeline (GitHub Actions + daily snapshots)

FantasyCalc only exposes a single `trend30Day` scalar — no time series. Real
per-player value history is accumulated by a daily snapshot, same
architecture as the news pipeline:

- `.github/workflows/values-history.yml` runs daily (cron `41 9 * * *`, plus
  `workflow_dispatch`). It runs `scripts/snapshot-values.mjs`, which fetches
  FantasyCalc, appends today's column to the rolling history, and
  force-pushes a single-commit `values-history` branch containing
  `values-history.json`. The script starts a fresh history **only** when the
  existing file 404s (first run / missing branch); any other load failure
  aborts the run non-zero so a transient error can't force-push a one-day
  file over the rolling window. **Only `main` publishes** — a branch dispatch
  runs every snapshot script and the alarm, then skips the force-push (the
  guard was added 2026-09-22; see the news pipeline). The publish step recovers any missing output
  **via git from the existing `values-history` branch** (not the raw CDN —
  a different failure domain than the one the snapshot scripts read from),
  and hard-fails rather than push without a file it can't recover, so a
  correlated script+CDN outage can never erase accumulated data; the branch
  stays untouched that day and the next run self-heals. The workflow runs
  under a `concurrency` group so overlapping runs can't race force-pushes
  (news.yml and deploy.yml carry the same guard).
- **Format is columnar** to stay mobile-sized:
  `{ updatedAt, dates: ['YYYY-MM-DD', …], players: { sleeperId: [v|null, …] } }`
  — arrays aligned to `dates`. Rolling window: 90 days, top 500 players by
  current value (players already tracked keep their row until it's all-null).
  One column per UTC day; re-runs on the same day replace that column.
- The app fetches `VALUES_HISTORY_URL` lazily (first consumer mount) once per
  session via `useValueHistory`. `getSeries(sleeperId)` (since 2026-09-25 a
  thin call to `getValueSeries` in `src/utils/valueHistory.js`, which the MCP
  server's `get_value_history` reads too) returns the non-null
  points, or `null` when fewer than `MIN_SPARKLINE_POINTS` (4) exist — with
  fewer, the "graph" is a straight segment that reads as broken, so it hides
  until the daily pipeline has accumulated enough shape. The team-value line
  on The Edge (`buildTeamValueSeries`) uses the same threshold.
- **Strictly best-effort:** history starts accumulating the day the pipeline
  ships. Missing branch / bad shape / fetch failure ⇒ sparklines simply hide.
  Never show an error or a loading state for history.
- `Sparkline` (shared component) renders the series as a tiny SVG polyline —
  green when net-up over the window, red when net-down, muted when flat.
- The same workflow also runs `scripts/snapshot-trade-values.mjs`
  (`continue-on-error`), which archives asset values for trades completed in
  the last 8 days into `trade-values.json` on the same branch — permanent
  (never pruned), read lazily via `useTradeTimeValues` for the manager
  scouting ledger's "at trade time" line (see Feature 11). When the script
  fails, the publish step carries the previous archive forward from the
  branch via git — and aborts the publish entirely if it can't, so the
  archive is never erased.
  **A pick it cannot price archives as `null`, never 0** — the §3 invariant
  (a pick's value is never 0 just because its market listing is missing),
  applied here because the archive is *permanent*: a wrong number written
  today can never be recomputed, since trade-time prices do not exist in
  hindsight. `useTradeTimeValues` skips a null and hides the whole "at trade
  time" line, which is the honest outcome; a 0 would instead count into the
  total and render as fact. Pricing walks the same ladder the app does —
  that season's round median, then the generic round median across every
  season FantasyCalc lists ("a 2nd is a 2nd"), then null. The script also
  **self-heals the published archive**: any pick value of exactly 0 is
  rewritten to null on the next run, because FantasyCalc never prices a pick
  at 0, so a stored 0 can only be the pre-2026-09-21 classifier's output.
  Idempotent, and it goes through the normal publish path rather than a
  hand-edit of the data branch.
- The same workflow also runs `scripts/snapshot-values-archive.mjs`
  (`continue-on-error`), which keeps a **permanent MONTHLY archive** of values
  in `values-archive.json` on the same branch — one column per UTC calendar
  month (same-month re-runs replace that month's column), top 500 players,
  columns never pruned by time (rows age out only after `INACTIVE_MONTHS = 24`
  all-null, which bounds the player dimension). Format mirrors
  `values-history.json` but keyed by `months`. It exists so the multi-*season*
  Dynasty Trajectory model can eventually be back-tested against realized value
  (the rolling `values-history.json` prunes past 90 days, so it can't): the
  first 1-year test becomes possible ~a year after this ships. **The app never
  fetches it** — it is read only by offline analysis, so it costs the phone
  nothing (no request, no bundle weight); size grows ~2 KB/month (~26 KB/year,
  ~220 KB/decade). Same publish contract as the trade archive: the previous
  file carries forward from the branch on any miss, never force-pushed away.
  See `docs/analysis/trajectory-calibration-2026-07.md`.
- The same workflow also runs `scripts/snapshot-consensus.mjs`
  (`continue-on-error`) — **phase 4a**, the three-source valuation archive. It
  reads **FantasyCalc** (completed trades), **DynastyProcess** (FantasyPros
  expert consensus, `value_2qb` = Superflex) and **KeepTradeCut** (crowd
  "would you rather" votes), joins all three to Sleeper ids, and appends one
  **daily** column to `values-consensus.json` on the same branch — permanent,
  never pruned by time. Format mirrors `values-archive.json` but carries three
  source blocks:
  `{ updatedAt, dates, sources: { <key>: { asOf[], coverage[], players: { sleeperId: [v|null, …] } } } }`,
  every array aligned to `dates`. **The app never fetches it** (no request, no
  bundle weight); it is read only by offline analysis.
  **It exists because the question is unanswerable without it.** FantasyCalc is
  the app's only valuation source, so every trade verdict, roster total,
  trajectory curve and pick price traces to one provider. The useful question
  of three sources — *when they disagree, which one moves toward the others?*
  (`docs/build-plan-2026-09.md` §10 4d) — needs history, and a day not archived
  cannot be recovered. So the archive ships **before** any UI, which is 4a's own
  instruction.
  **The join is ID-BASED END TO END, never by name** (rule 2), through
  DynastyProcess's `files/db_playerids.csv` crosswalk — see the
  `dynastyedge-data-contracts` skill. Two traps in it, both measured live
  2026-09-21 and both silently corrupting:
  - **`sleeper_id` is the literal string `"NA"` on 6,103 of its 12,502 rows** —
    an R-flavoured null. Read as a value it is one valid key that every
    unmapped player collapses onto (four distinct players landed on it in the
    first probe). Real `sleeper_id` count is **6,399**. `crosswalkCell` treats
    `"NA"` as null everywhere; it is this crosswalk's `'0'` sentinel (rule 8).
  - **KeepTradeCut joins on `mfl_id`, NOT `ktc_id`.** The crosswalk carries
    **6,399** mfl→sleeper mappings against **434** ktc→sleeper, which joins
    **464 of KTC's 464** players against 433 — and where the two disagree,
    exactly once, the `ktc_id` row is the **wrong** one: **Frank Gore Jr.**
    resolves to Sleeper `232`, Frank Gore **Sr.** (17 years exp, no team),
    where `mfl_id` correctly gives `11573` (BUF). Same class of collision as
    the two DJ Moores. `ktc_id` survives only as a fallback for an entry
    shipping no `mflid`; it adds nothing today.
  **KeepTradeCut is a PAGE, not an API, and its shape has already changed
  once.** §10 probed `var playersArray = [ … ]` on 2026-09-04; by 2026-09-21
  that literal was gone, replaced by a typed JSON island the page parses
  itself — `<script type="application/json" id="ktc-players">`. That is a
  strictly more stable contract than a JS literal, and it is still a page, so
  every KTC failure mode returns null and the source simply goes absent.
  Values come from **`superflexValues.value`**; the sibling `tep` / `tepp` /
  `teppp` trees are the same board under **TE-premium** scoring, which this
  league does not play — reading one would be a different question wearing the
  same field name. `position: 'RDP'` entries are draft picks, not players.
  **Best-effort PER SOURCE, and the degradation contract is the point:** a
  source that cannot be read contributes an **all-null column** with
  `asOf: null` and `coverage: null`, and the other two publish normally.
  *"We did not observe"* and *"the source priced nobody"* are different
  statements, and **neither is ever written as a 0** — a null is skipped by a
  consumer, a 0 would be read by 4d as a genuine collapse in value. Verified
  live against each failure in turn: KTC unreachable → the other two publish;
  the **crosswalk** unreachable → FantasyCalc alone publishes (it needs no
  crosswalk); all three failing → exit 1 with **no file written**, so the
  publish step carries yesterday's forward. A 200 carrying the **wrong shape**
  also aborts — only a 404 starts fresh, because starting fresh on an archive
  we failed to parse would force-push a one-day file over permanent history.
  **Sized by WIRE bytes, not raw** (the news feed's rule): measured by
  replaying the live readings forward, the archive reaches **43KB wire at 90
  days and 53KB at a year** (2.5MB raw — columnar integers gzip hard), against
  6.7KB for the first day. That is what makes the **daily** cadence
  affordable; a weekly column would save bytes the budget does not need and
  cost the resolution 4d wants. **DynastyProcess repeats**, so each column
  stamps that source's own `scrape_date` — live it read **2026-09-18**, three
  days stale — and a reader can tell a fresh reading from a repeat rather than
  counting five identical columns as five observations.
  **DynastyProcess's board DEPTH also moves every week, so a DP null is not a
  value collapse** (measured 2026-09-25, PIPE-3). Its `values-players.csv`
  publishes weekly (Fridays) and truncates the FantasyPros tail at whatever
  depth that week's ECR reaches: **640 → 441 → 494 → 346 rows** over four
  consecutive publishes. The 09-25 drop took 151 players off the board, worth
  **0.14%** of its value (max 130, most 1–20); our join held at 344 of 346.
  The archive recorded them as **null, never 0**, which is the contract
  working. The consequence is for 4b/4d: **compare sources only over players
  every source priced that day**. A player who goes from a value to null in
  DP has left the list; nothing says his value fell. A coverage-drop alarm was
  considered and not built, because a ±30% weekly swing is normal here.
  **It does NOT replace FantasyCalc and does NOT average the sources**
  (§10 4c): every model in the app is calibrated on FantasyCalc's scale, and
  at ~0.96 overall agreement an average *is* FantasyCalc with the
  disagreement — the entire product — destroyed. 4b (normalization) and 4c
  (surfacing the spread) are not built.
- **Keepalive step** (first step, before the snapshots, `continue-on-error`):
  GitHub disables scheduled workflows after ~60 days without repo activity,
  and the pipelines' own data-branch force-pushes don't reset that clock —
  only default-branch commits do. When `main`'s last commit is 45+ days old,
  the step pushes an empty github-actions bot commit to `main` (guarded to
  the `main` ref so a `workflow_dispatch` from another branch can never push
  foreign commits); otherwise it's a no-op. GITHUB_TOKEN pushes trigger no
  other workflows, so the keepalive commit causes no redeploy. This keeps
  both cron pipelines (news + values) alive through a quiet offseason.

-----

### Rookie intel pipeline (GitHub Actions + nflverse)

The two signals that actually predict a rookie season live in **nflverse**
CSVs, which are CORS-blocked *and* ~39MB — so they are aggregated server-side
in Actions and served as a static file, same architecture as news and values:

- `.github/workflows/rookie-intel.yml` runs daily (cron `23 10 * * *`, plus
  `workflow_dispatch`; only `main` publishes — this workflow had that guard
  first). It runs `scripts/snapshot-rookie-intel.mjs`, which
  reads three nflverse release files — `draft_picks.csv` (NFL draft capital),
  `roster_{season}.csv` (the **`sleeper_id` crosswalk**), and
  `depth_charts_{season}.csv` (daily depth-chart snapshots) — plus Sleeper's
  `/state/nfl` and `/players/nfl`, and **force-pushes a single-commit
  `rookie-intel` branch** containing `rookie-intel.json` (~52KB).
- **The messy join is resolved server-side**, exactly as the news pipeline
  resolves `athleteIds`: the app receives clean Sleeper player IDs and never
  name-matches. `roster_{season}.csv`'s `sleeper_id` column is authoritative;
  names backfill the rest (suffix-stripped, plus an unambiguous
  initial+surname key for nicknames — "Matthew Hibner" vs "Matt Hibner").
  **Every name-based match is position-guarded.** Without that guard Jordan
  Love (QB, GB) resolves onto Jeremiyah Love (RB, ARI), because the name
  indices are built from rookies only, so a veteran looks unambiguous.
- Format is columnar: `{ updatedAt, season, asOf, dates: ['YYYY-MM-DD', …],
  players: { sleeperId: { name, pos, team, round, pick, rank, slot, ranks,
  ahead, age, ht, wt, forty, vert, broad } } }` — `ranks` aligned to `dates`,
  **one column per ISO week** (daily columns would be ~7× the bytes for no
  extra signal).
- **`ht`/`wt` and the three combine drills are DISPLAY ONLY — they never feed
  a score. `age` at the NFL draft is the one exception, and it is scored** (see
  the age tilt in Feature 19). Combine athleticism was tested as the basis of a
  second "long-term" rookie score and is a null: it buys **+0.002** held-out
  Spearman against years 2–3, and only ~half of any class runs the drills. A
  separate long-term *score* built on age was also rejected — it correlates
  **0.934** with the shipped one and *loses* to it at predicting years 2–3
  (+0.602 vs +0.632). What survived is a small **tilt**, not a second score.
  See `docs/analysis/rookie-longterm-signals-2026-09.md`.
  `tests/rookieResearch.test.mjs` pins both halves: two rookies identical but
  for their combine numbers must score identically, and two identical but for
  their age must not.
  - The combine join is **ID-based end to end, never name-matched**:
    `draft_picks.pfr_player_id` → `combine.pfr_id` for drafted rookies, plus
    `players.csv`'s `pfr_id` → `gsis_id` → the roster crosswalk, and
    `pfr_id` → `espn_id` → Sleeper's own `espn_id` as a second hop for
    **undrafted** combine invitees (who have no draft row, so `pfr_id` is
    otherwise unreachable for them).
  - Both extra fetches are best-effort: a failure omits the measurables and
    leaves capital + depth chart — the signals the model actually scores —
    untouched. Neither can abort the run.
  - Coverage is genuinely partial and always will be: nflverse publishes
    combine results only, and the best prospects skip the drill or run at a pro
    day. **49 of the 237 published 2026 rookies have a 40 time** (78 have an
    age). Missing shows `—`; a rookie is never dropped for it.
- No keepalive step: `values-history.yml`'s keepalive commits to `main`, which
  resets the 60-day cron-disable clock for **every** workflow in the repo.
- Publish contract matches `values-history.yml` — a missing output is
  recovered from the branch via git and the publish aborts rather than
  force-push an empty feed, so a bad run leaves yesterday's data in place.
- The app reads it lazily once per session via `useRookieIntel` (Draft ›
  Research, and the profile drawer for a rookie — see Feature 19) — **Class B /
  best-effort**: a missing branch or a failed fetch shows Draft › Research's
  "hasn't published yet" explainer, never an `ErrorState`. **The pipeline
  published its first run 2026-08-14** (235 rookies, 80 carrying draft capital,
  weekly columns back to 2026-03-16) and was verified end to end against live
  data — see `docs/open-items.md`. Until that day the explainer was the only
  state the page had ever rendered, so treat any "it has never published"
  phrasing in older notes as history.

**Preseason stats are deliberately NOT in this pipeline.** Sleeper *does*
expose them (`/stats/nfl/pre/{year}/{week}` — real box scores, 217 fields
including `off_snp`/`tm_off_snp`), but they predict a rookie season at
**rho −0.195**: the best rookies are protected in August, so preseason usage
measures job insecurity, not talent. See
`docs/analysis/rookie-research-signals-2026-08.md`.

-----

### FantasyCalc API

**Base URL:** `https://api.fantasycalc.com`
No authentication required. Fetch once per app load, cache in memory.

**Dynasty values endpoint:**

```
GET https://api.fantasycalc.com/values/current
  ?isDynasty=true
  &numQbs=2
  &numTeams=10
  &ppr=0.5
```

`numQbs=2` = Superflex. `ppr=0.5` = Half PPR. These parameters must never change.

**Response fields used:**

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

**Display rules for values:**

- Show as whole numbers — no decimals
- Trend arrow: ↑ green if `trend30Day > 50`, ↓ red if `trend30Day < -50`, → grey if between
- Pick values also come from FantasyCalc — they appear as entries with names
  like “2026 1st” (round-level) and “2026 Pick 1.09” (exact slot, once a draft
  season's order is set) — include them in the dataset.
  **Classifying player vs. pick (`useFantasyCalc`):** FantasyCalc now stamps
  its pick entries with **synthetic non-numeric `sleeperId`s** (`FP_2026_1`
  round-level, `DP_0_8` slot-level) — they used to have none. Real players
  carry a **numeric** `sleeperId`. So the split is by id *shape*, not mere
  presence: numeric id → player (into `playerMap`), non-numeric-or-absent →
  pick (into `pickEntries`). Classifying on presence alone (the pre-2026-07
  bug) dumped every pick into `playerMap` under a key no roster references,
  left `pickEntries` empty, and priced every pick at 0 app-wide.
  **The same rule binds the Actions pipelines, where it was wrong for two
  months longer.** `useFantasyCalc` and `mcp/snapshot.js` were fixed in
  2026-07; the three `scripts/snapshot-*.mjs` were not, and
  `snapshot-trade-values.mjs` archived **every pick at 0** until 2026-09-21.
  The classifier and the pick pricer now live once, in
  **`scripts/fantasyCalcValues.mjs`** — pure, shared by all three scripts and
  pinned by `tests/fantasyCalcValues.test.mjs` (which keeps the old
  presence-based classifier as an executable regression statement). **Do not
  inline it back into a fetch script**, for the same reason
  `scripts/newsRetention.mjs` exists. Measured live 2026-09-21: **0 of 418
  entries carry a falsy `sleeperId`**, so `if (sid)` recognises no picks at
  all.

**Rookie ADP rule:** FantasyCalc has no rookie-specific ADP field, and its
`rookiesOnly` endpoint returns non-rookies — never use it. The Draft section's
"Rk ADP" is derived locally (`utils/rookieAdp.js`): the Sleeper-verified rookie
class re-ranked 1..N by FantasyCalc overall rank. Rookies with no FantasyCalc
rank show `—` and sort to the bottom.
**The rookie→FantasyCalc join is by `sleeperId` ONLY — there is no name
fallback** (ROOKIE-1, dropped 2026-09-25). `playerMap` is keyed by
FantasyCalc's own `sleeperId`, so a name hit could only land on an entry
FantasyCalc had attached to a *different* Sleeper player. Measured live: 0 of
444 rookies ever joined by name, all 395 FantasyCalc player ids resolve in the
player DB under the same name (nothing for a fallback to rescue), and 7 rookies
share both name **and** position with another player — so a position guard
would not have closed the collision. Draft Board, Tracker, Pick Trades,
Research and `research_rookies` all read this one join.

-----

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
needs no integration — remains the fallback. See `docs/open-items.md` MCP-2b.

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
that schedule at ~7.4 runs/day (see the news pipeline section). Smaller than
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
   delivers ~7.4 runs/day at a **3.26h mean gap and 5.0h worst observed**
   (measured 2026-09-21). The real worst case is **hours, not the ~35 minutes
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

## Features

-----

### Feature 1 — Roster + Picks Viewer

**Purpose:** View any team’s full roster with dynasty values and all pick capital
across future seasons.

#### Your team view (Nix Cage — default on load)

- Roster grouped by position: QB · RB · WR · TE · Bench · Taxi · IR
- Each player shows: name, NFL team, dynasty value, overall rank, position rank,
  30-day trend arrow
- Draft picks section below roster: all picks owned, grouped by year (2026 / 2027 / 2028),
  color-coded by round (see color system below)
- Each pick shows original owner if different from current owner
- Total roster value score at top (sum of all player values + pick values)
- **Action Items** (`RosterActionItems`, shared with The Edge — see Feature 12),
  under an **"Action Items"** neutral band — deliberately *not* "On your desk",
  which The Edge's generated GM line already uses for a different count
  (briefing items), and two counts under one phrase on one screen read as a bug: generated roster alerts, each a
  **`Lede`** — eyebrow, a headline with the finding in a `Mark`, the sentence,
  and a real CTA. Four types, all derived from live data:
  1. **Taxi deadline** — any taxi player with `years_exp >= 2` must be
     activated before the regular season (see League Context taxi rules).
  2. **Bloated QB room** — 4+ rostered QBs. Names the most expendable
     QB (lowest dynasty value) and, via `suggestSellMove`, a concrete partner
     and return; the action deep-links into the Analyzer with `preloadTrade`
     already filling both sides.
  3. **IR slot opportunity** — an active player whose `injury_status`
     is `Out` or `PUP` and who isn't on IR yet.
  4. **Missing future 1st** — no 1st-round pick in a `pickYears` season
     later than the current one; deep-links to Trade Partners.

  **Types 1, 3 and 4 aggregate — one item per type, never one per player.**
  A `Lede` is the open density register, for *one* decision; three stacked
  entries reading "X can go on IR" with identical prose is the
  icon+title+one-liner pattern wearing editorial clothes, and it was what the
  first Matchday pass produced (measured on screen, 2026-09-12: three
  near-identical blocks where the old tinted rectangles had at least been
  short). An aggregated item names every player it covers in its prose.

  Items are **dismissible**, persisted in `dynastyedge_action_dismissals`
  against a `conditionSnapshot` — a dismissal only holds while the condition
  is unchanged, so a re-bloated QB room or a newly injured player re-surfaces
  rather than staying silently hidden forever. **An aggregated item snapshots
  the SET, not the count** (sorted sleeper ids, joined): one player aging off
  taxi while another ages on would leave the count unchanged, and a dismissal
  must not survive that swap.
- **Roster Analysis** — a `NavRow` beside Dynasty Trajectory → bottom sheet
  (`RosterAnalysisSheet`): age chart with one lane per position (QB/RB/WR/TE),
  each lane shaded with its position-specific peak window (RB 23–26, WR 24–28,
  TE 25–29, QB 26–33); dots are tappable (detail row below the chart) and a
  position filter expands a single lane. Stat cards: avg starter age, league
  avg, core win window years, direction (Ascending / At Peak / Declining).
  Plus per-position age table vs league average and a collapsible
  "How to read this" explainer. All data from LeagueContext — no extra fetches.
  Win-window years derive from `nflState.season`, never hardcoded.

#### League-wide view

- **My Roster** lives in the **Squad** tab's contents rail (My Roster · Lineup ·
  Season Review · Trajectory — Squad is the navigation label for the My Team
  section; the route is `/my-team`). The all-10-teams list lives in **League ›
  Overview** — see Feature 5 — which fused in the old "All Teams" view.
- **Free Agents** now lives under **League** (League › Free Agents): search +
  position filter + **Upgrades Only** and **Hide Rookies** toggles (both default
  off; rookie detection = Sleeper `years_exp === 0` with the age≤25 fallback,
  same logic as the Rookie badge). Above the list, **Recommended Pickups** (top
  4 from `recommendFreeAgents` — see The recommendation engine below) turns the
  list from a filter into actual advice: each row carries plain-English reasons
  ("fills your TE deficit", "rising 30-day trend"). Respects the position
  filter; hidden while searching.

  **Two axes, not one.** The list used to rank purely by dynasty value, which
  is the wrong yardstick for a waiver list — the two orderings correlate at
  only r = 0.427 and three of the current dynasty top ten project **0.0 points**
  (rookies who won't play). So each row now carries **this week's Sleeper
  projection** beside the dynasty value, with a **Proj** sort mode
  (`useWeeklyProjections`, the shared session cache the Optimizer also reads —
  one projections fetch per session across both). In-season only: offseason
  hides the column and the sort mode, like every other weekly surface. A line
  under the sort row states what the projection buys — among waiver-tier
  players a 0–2 projection means a **0.9%** chance of a 15+ point game, 6–8
  means **10.6%** (`docs/analysis/optimizer-data-sources-2026-09.md` R2).

  **DEF is a separate pool behind its own chip — never mixed in.** The pool
  used to be built from FantasyCalc's `playerMap` filtered to QB/RB/WR/TE, and
  FantasyCalc ranks **zero** defenses, so every available defense was invisible
  in a league that starts one. Defenses now come from the shared `usePlayerDB`
  cache — but they are reachable **only** through the DEF chip, because you
  roster exactly one (see League Context) and a list mixing 14 of them into the
  general pool reads as "pick up some defenses", which is advice this app must
  never give. Under the Proj sort they would rank mid-list too: a defense
  projects 4–8 and plenty of real stashes project less. They never enter
  `recommendFreeAgents` (which scores in dynasty value).

  Under the DEF chip the view answers the only question that matters — **"is
  there a reason to replace the one I have?"** A `DefenseRosterNote` card leads
  with the incumbent and its projection, states that only one starts and that
  streaming measured worth nothing, and turns urgent in the two cases that
  actually cost points: **no defense rostered**, or **mine on bye**. Bye
  detection needs no schedule fetch — a defense on bye has **no row at all** in
  the projections payload (verified against 2025 W6: 30 of 32 defenses
  projected, the two bye teams absent). The dead controls hide with it: Upgrades
  Only and Hide Rookies (a defense has no value and is never a rookie), the
  sort toggle (projection is the only real ordering), and the Value column (a
  column of `—`). Rule 7 is about never dropping a *player*; a column no row in
  the view can ever fill is noise, and the card says why.
- Tap any team card → full roster + picks drill-down (`/league/teams/:rosterId`)
- League › Overview team cards also drill into the same view; the back button
  returns to wherever you came from with filters preserved

#### Sorting and filtering (league-wide)

- **Default sort:** Total roster value, high to low
- **Sort toggle:** Overall value / Pick capital / FAAB remaining
- **Position filter:** Tap QB / RB / WR / TE at top →
  teams re-sort and display horizontally as a swipeable ranking
  showing that position’s strength across all 10 teams

#### Pick capital rules

- Show the **live three-season pick window** — the upcoming rookie draft plus
  the two after it, from `pickYears` on `LeagueContext` (see the Constants File
  section). It rolls itself the day a rookie draft completes; never hardcode a
  season list, and never take `PICK_YEARS` as the truth.
- Fetch `/traded_picks` to find all picks that have moved
- Any pick NOT in traded_picks is still owned by the original team
  (original team = the roster_id that matches the pick’s season/round)
- Picks in traded_picks belong to `owner_id` in that record
- **Exact slot resolution:** `useSleeper` also fetches `/league/{id}/drafts`
  (best-effort — a failure just falls back to round medians). For the upcoming
  rookie-draft season, `useLeague` resolves each pick to its exact slot from
  the draft order — `slot_to_roster_id` once Sleeper builds the board, else
  `draft_order` (set in `pre_draft`, so slots are known a month early) — via
  `buildDraftSlots` + `slotForRound` (honors snake/linear). A pick sits at its
  **original owner's** slot. Each enriched pick then carries `slot` +
  `slotLabel` ("1.09") and is priced at FantasyCalc's exact-slot value
  (`findExactSlotValue`, e.g. "2026 Pick 1.09"), falling back to the round
  median when the slot is unknown or has no slot entry (future seasons). This
  flows to every roster-derived surface — pick badges, roster/team-value
  totals, and the Trade Analyzer. (League Activity and the Manager ledger price
  *historical*-trade picks at round medians, as before — they're at today's
  prices anyway.)

-----

### Feature 2 — Trade Partner Finder

**Purpose:** Identify which teams are the best trade targets before building an offer.
Answers “who do I call?” — not “what do I offer?”

#### Position filter bar

At the top of the screen: **QB · RB · WR · TE · Picks**

- Tap a position to re-rank all teams based on that specific need
- Default (no filter): rank by overall roster fit match

#### Analysis logic

For each of the 9 opponent teams, compute:

1. **Positional strength scores** — top players at each position, summed FantasyCalc value
1. **Nix Cage surpluses** — positions where my value is above league average
1. **Nix Cage deficits** — positions where my value is below league average
1. **Their surpluses / deficits** — same calculation per opponent team
1. **Match score** — how well their surplus covers my deficit, and vice versa
1. **Pick capital score** — weighted sum of all future picks they own
   (2026 picks worth 3×, 2027 worth 2×, 2028 worth 1×)
1. **Win window tier** — see calculation below

#### Win window tier calculation

Score = (total roster value × 0.5) + (pick capital score × 0.3) + (youth score × 0.2)

Youth score = inverted average age of starters (younger = higher score)

- Top 3 teams by score = **Contending**
- Bottom 3 = **Rebuilding**
- Middle 4 = **Middle**

#### Output — ranked list of all 9 opponents

Each team card shows:

- **Tier badge:** 🎯 Priority / ✅ Good Fit / ⚪ Poor Fit
- What they need (their deficit positions)
- What they have (their surplus you could target)
- Pick capital status: Rich / Neutral / Depleted
- Win window tier badge: Contending / Middle / Rebuilding
- ⚠️ Win window mismatch warning if their tier differs from Nix Cage’s
  (e.g. *“They’re rebuilding — expect them to ask for picks, not players”*)
  Show the warning but still show the team — do not hide or deprioritize them.
- Buyer/seller read from live playoff odds (in-season): a long-shot opponent
  (< 35% odds) is flagged "likely seller", a near-lock (≥ 70%) "buying
  win-now". From `usePlayoffOdds`; hidden in the offseason.
- Multi-year value-direction read from the Dynasty Trajectory model
  (`getTrajectoryRead`, Feature 17): a team whose projected value is sliding
  ("selling vets"), climbing ("building"), or holding ("balanced window") —
  always available (zero extra fetch), and distinct from the this-season
  playoff-odds flag.
- **Tap → opens Trade Analyzer pre-loaded with this team selected**
- **"See their targets →"** footer button (a sibling *below* the card, never
  nested inside its `<button>`) → Trade › Targets scoped to that team. Two
  exits per partner, matching the two questions: the card answers "build an
  offer", the footer answers "what do I even ask for?"

-----

### Feature 3 — Trade Analyzer

**Purpose:** Evaluate any trade proposal with a verdict, then build or refine offers.

#### Setup

- Nix Cage always pre-loaded as “Your team”
- Other team: selected from dropdown, OR pre-loaded when tapping from Trade
  Partner Finder. The dropdown isn't a blind list of names — options are
  grouped by trade fit (Priority / Good Fit / Poor Fit, from `rankTradePartners`)
  and each carries the team's win-window tier + record, so "who do I call?" is
  answerable in the picker itself.
- A context strip under the selector carries the partner intelligence into the
  build: their needs / surpluses, pick capital status, win-window tier, and the
  mismatch warning (all from `rankTradePartners`)
- Two columns: **“You give”** and **“You get”** — each has an **+ Add** button
  that opens a roster-browser bottom sheet pre-pointed at the right roster

#### Building the trade

- Players must come from actual Sleeper rosters only — no searching all NFL players
- The add sheet has search + position chips (All/QB/RB/WR/TE/Picks) and a
  "Draft Picks" section; its header shows live Give ⇄ Get totals + % diff so
  every tap gives instant feedback. Tap toggles, sheet stays open for multi-add.
- Picks must come from actual pick inventories only
  (derived from traded_picks data — only show picks each team actually owns)
- Running FantasyCalc value total updates live on both sides as assets are added
- A **sticky summary bar** (Give ⇄ Get totals, % diff, verdict chip) pins below
  the sub-tabs while a trade is in progress
- Show 30-day trend arrow on every player added to the trade
- The in-progress trade persists in sessionStorage (`dynastyedge_trade_draft`)
  so navigating away and back doesn't lose it. Navigation state (from Partners
  or Targets) takes priority over the draft. "× Clear trade" resets it.

#### Analysis — three layers, always shown together

**Layer 1 — Raw value**
Simple FantasyCalc math. Side A total vs. Side B total.
Show the % difference clearly: “You’re getting 12% more value” or “You’re overpaying by 8%.”

**Layer 2 — Roster fit (post-trade lineup simulation)**
Fit is judged against the **actual resulting starting lineup**, not a bare
position-tag match. `analyzeTrade` re-simulates my optimal starting lineup by
dynasty value (`buildValueLineup`, the shared slot-fill engine in
`utils/lineupBuild.js` — the same `ROSTER_SLOTS` fill the in-season Optimizer
uses, but fed **dynasty value** instead of weekly points, so it works
year-round) *before* and *after* the swap:

- **A need is filled only by a player who would actually START post-trade** at a
  position where I'm below league average. A player I acquire who'd sit on the
  bench does **not** count as filling the gap — he's surfaced as depth
  (`benchNote`: "Sutton projects as WR depth in your lineup — not a starting
  upgrade").
- **Giving a player hurts only when it actually weakens the position** — i.e.
  the trade drops that position below league average (post-trade delta < 0 and
  strictly worse than before). So dealing a starter out of a surplus that then
  falls below the line registers as a hurt, while shedding a benchwarmer that
  changes nothing does not.
- **Shipping a lineup regular that does *not* crater the position** is a
  heads-up note, not a hurt (`starterLossNote`: "You're dealing a starter
  (Brown) from your best lineup … make sure the return replaces the
  production").

The league-relative deficit/surplus (top-N-by-value vs league average, shared
with Trade Partner Finder) is still the yardstick for what counts as a "need";
the lineup sim adds the "…and does this specific player actually start?" gate.

**Depth context BOTH ways** (`analyzeTrade`'s `giveContext` + `getContext`,
rendered as two blocks under Roster Fit): so "what am I actually surrendering?"
is concrete,
for every position I'm dealing from the panel shows my roster's positional
pecking order by dynasty value — a mini depth chart marking the piece(s)
leaving (`OUT`), who currently starts (`ST`, from the same `buildValueLineup`
sim), and each dealt player's standing (e.g. "Gunnar Helm — your TE3 of 4 ·
depth"). Grouped by position (dealing two TEs shows one chart), taxi/IR excluded
(they can't start), capped at 6 rows. Unranked players show `—`.

**"Coming In" is the same chart for the players I'm ACQUIRING** (2026-09-07,
owner ask). The panel used to draw the full pecking order for every piece
leaving and a one-line landing spot for every piece arriving — the roster cost
was concrete and the roster gain was a sentence. `buildDepthContext` now takes a
`marker` (`out` | `in`) and is called twice; the arrival is highlighted `IN` in
success green, the departure `OUT` in amber. **`getContext` reads the POST-trade
roster on purpose** — the arrival's rank has to count the players actually left
at the position, so trading a WR for a WR still reads true (pinned by test; the
pre-trade reading ranks him behind a player who is no longer on the team).
Picks carry no position and are excluded, exactly as they are from the landing
spots.

Both charts are descriptive context, not a verdict input — they never change the
score, they just make the roster cost and the roster gain legible before you
confirm.

**Layer 3 — Win window fit**
Are you acquiring the right type of asset for where Nix Cage is now?

- Buyer / Contending → favor proven players, not picks or unproven youth
- Seller / Rebuilding → favor picks and young players, not aging veterans

**Live playoff odds decide the lean in season; the win-window tier is the
offseason fallback (2026-09-07).** `analyzeTrade` exposes `windowBasis`
(`'odds'` | `'tier'`) so the panel can name what actually scored the layer.
The asset-type tests above are unchanged — only what *selects* them moved.

- **Why.** The tier is a RANKING of accumulated assets (50% total roster value
  including bench and picks · 30% pick capital · 20% youth; top 3 Contending,
  bottom 3 Rebuilding). Measured live 2026-09-07 it tracks total assets at
  Spearman **0.952** but the actual **starting lineup at only 0.721**. Playoff
  odds track the starting lineup at **0.988** — which is the question this
  layer asks. Two live mislabels the swap fixes: roster 5 has the **2nd-best
  starting lineup and 87.7% odds** yet reads `Rebuilding` (top-heavy, picks
  spent — in fact the most win-now team in the league, and the old read told
  you to expect them to ask for picks); Jake & Bake has the **9th-best lineup
  and 8.3% odds** yet reads `Middle` because hoarding picks props up their tier.
- **`Middle` was a dead branch and that was the sharper bug.** The tier has no
  `Middle` case at all, and top-3/bottom-3 makes `Middle` a **fixed-size bucket
  of four teams every season** — 40% of the league, this owner included. Live
  effect on the 20-target board: `windowScore` was **0 on 20 of 20** trades and
  the panel printed "Neutral — fits your current win window" every time; on
  odds it reads **15 aligned / 5 conflicting**. "On the bubble" is a *measured*
  state that can hold any number of teams, including none.
- **The verdicts did not move on that board** (17 Counter · 1 Decline ·
  2 Accept, before and after) — `windowScore` only reaches the ladder via the
  clean-Accept gate and the "winning value but off-window" Counter branch. The
  gain here is a layer that says something true instead of a placeholder; it
  will change verdicts when odds fall and win-now buying turns into a mistake.
- **`getDeadlineVerdict` stays the ONE definition of buyer/seller** (shared with
  League › Playoffs, Trade Partner Finder and The Edge) and is now called
  **once** per analysis, feeding both the score and the printed stance — so the
  badge can never contradict the note. Its thresholds (≥70% Buyer, <35% Seller)
  are unchanged; note that **6 of 10 teams make these playoffs, so 60% is
  baseline** and the middle of the league compresses. Recalibrating them is a
  separate, unmeasured change that would ripple to three other surfaces.
- **Offseason / odds-not-yet-loaded** ⇒ `windowBasis: 'tier'` and the exact
  pre-existing tier behavior, pinned by test. The fallback copy deliberately
  does **not** say "offseason" — odds are also null while the simulation loads,
  and asserting the wrong reason is worse than naming the basis.
- **Scope.** Only Layer 3's *score* moved. `assignWinWindowTiers` still backs
  the other eight consumers (League Overview, Managers, Movers, Playoffs,
  Optimizer, rookie fit, keep-scores, The Edge) — changing the tier itself
  would ripple through all of them and is NOT part of this change.
- When you're acquiring the partner's players, Layer 3 also adds a **partner
  trajectory** line from the Dynasty Trajectory model (Feature 17, via
  `analyzeTrade`'s optional `opponentTrajectoryRead`): a declining team reads
  as a buy window ("their value slides through {year} — they may move win-now
  talent"), an ascending team as a caution ("they're building — may resist
  parting with youth"). Always available (no extra fetch); hidden for a
  balanced-window partner.
- **My-side trajectory lens** (`analyzeTrade`'s optional `curves` from
  `buildAgeCurves`): a forward-looking read on *my own* pieces, distinct from
  raw value. Dynasty value already prices age in, so this never rewrites Layer
  1 — it's a note. Selling a player the model projects to keep **climbing**
  (`myTrajectoryNote`: "you may be selling an ascending asset before its peak")
  is the sharpest flag; acquiring one projected to **decline** reads as a
  win-now add, not a long-term hold. Per-player direction via
  `projectPlayerSeries` + `seriesDirection`; hidden without curves.
- **Draft-grade confidence nudge** (`analyzeTrade`'s optional `myDraftGrade`,
  from my Manager Scouting report card — `useManagerProfiles().my.draft`):
  when I'm **acquiring picks**, my rookie-draft hindsight record adjusts
  confidence in that capital (never the raw value). Keyed to **hit rate** — the
  share of my rookie picks now worth starting-caliber dynasty value (≥ 1000):
  ≥ 70% hits gets "your recent rookie picks have hit … this pick capital has
  tended to pan out for you"; ≤ 35% gets "value this capital at market, not on
  upside". **Gated at ≥ 5 graded picks**; the copy states the record as fact,
  not durable skill, because the sample is small. (Hit rate replaced the earlier
  avg-slot-beat trigger: on this league's ~7-picks-per-owner sample, slot-delta
  is noise — it flips sign year-to-year for most owners and mislabels a
  9-of-11-hit drafter "weak" for taking good players at their slot — while hit
  rate is steadier and closer to what "will this pick capital pan out?" asks.
  See `docs/analysis/trajectory-calibration-2026-07.md`, Item 3.) Best-effort
  (renders only once the lazy league-history fetch lands).

**Layer 4 — Their side (would they even want this?)**
Layers 1–3 are entirely my-side; a verdict that never asks what the deal does
for the team being asked to accept it produces green ACCEPTs on offers that go
unanswered. Layer 4 is Layer 2 **run on the partner's roster** — their
positional deltas against league average, and their optimal lineup
(`buildValueLineup`) simulated before and after the swap:

- **`startersDelta`** — the change in the value of their best startable lineup,
  which is the one honest measure of "does this help them". A player who only
  stacks their bench moves it by 0 however much he's worth.
- **`fills`** — a deficit position where an arriving player would *start* for
  them. **`stacks`** — arriving at a position they're already above league
  average at. **`weakens`** — a position the trade drops them below average at
  (the same test Layer 2 applies to me, so "they can't replace him" reads the
  same in both directions).
- **`landingSpots`** — where each arriving player lands on their post-trade
  depth chart (`{position}{rank} of {count}`, whether he starts, and the slot).
  The mirror, `myLandingSpots`, does the same for the players I'm acquiring and
  renders inside Roster Fit — the "Fills WR need" chip names the position, the
  landing spot names the actual spot.
- **`giveContext`** — their depth chart at the position I'm asking from, so
  "he's their WR2 of 10" is on screen before you send the offer.
- **`appeal`** (Strong / Fair / Weak) from a small signed score over those
  facts plus the win-window lean on picks (a rebuilder wants them; a contender
  offered only picks does not).

**A stack scores against the deal ONLY when the player can't crack their
lineup.** When he does start, the upgrade is merely marginal and
`startersDelta` already measures exactly how marginal — penalising it twice
would also put the weaker of the two sentences in front of the verdict gate
(observed live: Jordan Love → Password Is Taco, where he starts at their SFLX
and their lineup still *loses* 1,183).

**The same rule now holds on the POSITIVE side (2026-09-07).** A `fill` is
defined as an arriving player who *starts* at a position they're below average
in — which is precisely what raises `startersDelta`. Scoring both charged one
event the 2 points that mean `Strong`, the identical double-count already
removed from the `stacks` branch above. The point is awarded once, by the
lineup delta; the fill adds its own point only when the delta did not already
score it. **Both sentences still render** — naming *where* the hole is, is
information the delta alone doesn't carry. Live effect on the 20-target board:
`Strong` 7 → 5, which is the bar for "a clear reason to say yes" returning to
two independent facts (they profit on value **and** their lineup improves).

**ONE engine, both seats (`buildSideFit`) — 2026-09-07, owner ask.** Layer 4's
body is now the seat-agnostic `buildSideFit(incoming, outgoing, roster,
allRosters, opts)`, and `buildPartnerFit` is a thin wrapper passing
`seat: 'them'` — so the partner read is unchanged **by construction**, not by
inspection (pinned: `buildPartnerFit(…) deepEqual buildSideFit(…, {seat:'them'})`).
`analyzeTrade` calls the same function a second time from my seat →
**`myFit`**, carrying the same `appeal` / `summary` / `reasons` / `concerns` /
`startersDelta`, plus `lineupNote` (the lineup sentence as its own field — it is
the one measure the verdict gate quotes).

- **Why.** The Analyzer graded the partner and nothing graded me. Every
  suggestion read "Fair for them" while my own side was scattered across chips,
  and `myStartersDelta` — the exact mirror of the number the partner was
  credited with — **printed only when it was bad enough to downgrade a
  verdict.** The engine mentioned my lineup only as bad news.
- **`myFit` is DISPLAY ONLY.** It never enters `baseTradeVerdict` or either
  gate: my side is already scored by Layers 1–3 plus the `myStartersDelta` gate,
  and a second my-side score would charge the ladder twice. **Verified
  byte-identical verdicts, reasoning strings, selected packages, partner appeal
  and totals across the live 20-target board** — 0 differences on every
  pre-existing field; pinned synthetically across the whole ladder too.
- **Copy is spelled out per seat (`SEAT_VOICE`), not stitched from pronouns.**
  The partner's sentences must stay byte-identical (the verdict gate quotes them
  and `buildTradePitch` is built from them).
- **My seat scores on the odds stance, theirs on the tier.** Layer 3 moved to
  live playoff odds; the fit engine's pick lean reads a tier. My seat is passed
  the `buying`/`selling` Layer 3 actually scored on, so two adjacent blocks
  can't print different answers to one question.
- **"Weak for me" on 17 of 20 was the BOARD OVERPAYING, and it is fixed
  (2026-09-21, OPEN-10).** The finding recorded here on 2026-09-07 was that the
  grader discriminates and the board's offers sat outside the band:
  `suggestFairPackage` assembled inside `[0.9×, 1.15×]` while `buildFairBand`
  calls fair **±5%**, so my seat took a −1 on value that their seat took as +1.
  That diagnosis was right and reproduced exactly two weeks later — with one
  number it had not measured: **0 of 20 suggestions landed inside the fair
  band**, 35 of 180 across all ten seats.
  **The mechanism was never the window — it was the price of an appeal step.**
  Crossing 1.05 hands the partner a whole appeal point, phase 2 prices a
  Weak→Fair step at 1.0 keep-pain, and the distance penalty resisting it is
  `0.3 × 0.09 ≈ 0.027`. The overpay was ~37× cheaper than what it bought, which
  is why the `APPEAL_BONUS` sweep is flat over the shipped band: the lever
  moving the board was not the one that had been tuned.
  **The fix is a split, not a narrowing** — see the two-phase section below. The
  board now reads **18 Fair · 2 Weak** from my seat and every suggestion lands
  in the band. The my-side concern line still prints when a `Weak` survives, but
  it now names a roster objection rather than a price the app chose to pay. See
  `docs/analysis/trade-fair-band-2026-09.md` (supersedes §4 of
  `trade-my-side-read-2026-09.md`).

**Layer 4 is exported as `buildPartnerFit` and shared with the recommenders.**
`suggestFairPackage` scores its candidate packages with this exact function, so
the package the app suggests and the appeal the Analyzer shows for it are
computed by one piece of code and cannot disagree. It is extracted rather than
reached by calling `analyzeTrade` because the package search runs it hundreds of
times per board — measured on the live league, scoring the full candidate set
through `analyzeTrade` takes 1.5s against 78ms through this alone, and the rest
of `analyzeTrade` (trajectory, scarcity, weekly points, the draft nudge) answers
questions a package search never asks. `leagueAverages` / `winWindowTiers` are
accepted as options so a caller in a loop computes them once; both are derived
from `allRosters` when omitted, and injecting them can never change the answer.

**This is roster logic, never a prediction that they will accept.** Per-manager
behavioral profiling was pre-registered, tested on this league's full 4-season
corpus (95 trades / 176 sides) and **DISCONFIRMED** — the own-manager profile
scored *below* the league baseline
(`docs/analysis/trade-structure-stability-2026-08.md`, standing ruling). Layer 4
models the roster and the copy says so.

#### The pitch (`buildTradePitch`)

The message you actually send, stated entirely from **their** side of the table
— an argument for why the trade is good for you is not a pitch. Rendered as a
"Pitch It" card under the analysis with a Copy button, it names what they get
and give, the value from their seat, where each incoming piece lands in *their*
lineup, and why the piece you're asking for is one they can spare (or, when
`weakens` fires, honestly says it isn't and asks what it would take). Every line
is a number Layer 4 already computed, so it can never oversell. Needs both sides
of the trade; returns null otherwise.

#### The negotiating layer (five signals — none of them moves the verdict)

Owner call 2026-09-06: verdict provenance stays **raw value / lineup-sim fit /
win window / partner appeal**. These five change what you understand and how you
negotiate, not the call — the same discipline that keeps usage stats, camp
movement and combine numbers out of every score in this app. All five are
best-effort: each degrades to `null` and its block simply doesn't render.

- **Fair band** (`buildFairBand`, in `utils/fairBand.js`) — the ±5% window of "you give" totals that
  lands the deal fair for what you're getting, rendered as a track in THE CALL
  with a marker for the current offer. A point estimate says the offer is
  wrong; a band says how much room you have, which is what you need at the
  table. Carries `gapToBand` — what closing it actually costs.
- **Scarcity / value over replacement** (`utils/positionalValue.js`) — a sum of
  raw values across positions quietly assumes a point of QB value and a point of
  WR value are interchangeable, and in a 10-team Superflex they are not.
  Replacement level is **derived from the league, never hardcoded** (same
  discipline as the trajectory age curves): run the shipped slot-fill over all
  10 rosters, count the starters at each position, and the (S+1)-th best
  rostered player there is the replacement. Measured live 2026-09-06 — QB 3,086
  · RB 1,806 · WR 1,883 · TE 1,946, against 19/32/38/11 starters. The
  counter-intuitive result is that *mid* QBs are the least scarce thing on the
  board (everyone already rosters a startable QB2); the scarcity is in elite
  QBs only. **The flag speaks ONLY when the two scales disagree** — by 10
  percentage points or a different winner — because a second number that agrees
  is noise. FantasyCalc stays the headline everywhere so the pitch quotes a
  total the other manager can look up.
- **Roster space** (`utils/rosterSpace.js`) — nine of ten teams were at or over
  the 24-man active cap the week after the rookie draft, so this is a binding
  constraint on almost every trade here, and a real lever: a team carrying more
  players than slots *wants* a 2-for-1. **It is never a legality check** — being
  over the cap post-draft is a normal transient state (teams are simply owed
  drops before the season), so it reports headroom and owed drops and never
  refuses a trade. Taxi/IR players occupy no active slot, so dealing one frees
  nothing while every arrival costs one.
- **Weekly lineup impact** — the roster-fit question in the other currency:
  both teams' optimal lineups re-solved on this week's Sleeper projections
  (`selectOptimalStarters` fed points instead of dynasty value, via the shared
  `weeklyProjections` session cache — no extra fetch). In-season only; the
  offseason yields no `projMap` and the block hides. Labelled in-panel as one
  week of context, never the reason for a dynasty call.
- **Partner recent moves** (`utils/partnerActivity.js`) — a 21-day window over
  the already-cached transaction feed, resolved to names and positions. A TE
  surplus they just went out and bought is not spare depth. Descriptive only:
  modelling manager *behavior* was tested on the full corpus and disconfirmed
  (`docs/analysis/trade-structure-stability-2026-08.md`).

#### Panel layout — THE CALL, then three acts

The verdict used to sit at the **bottom** of ~7 sections of evidence, making the
Analyzer the only surface in the app that doesn't lead with its answer (the
Optimizer's moves card, The Edge's hero and Playoff Odds all do). With twelve
signals feeding the panel, reading to the end to find out what to do stopped
being viable at 390px. So:

- **THE CALL** (`components/trade/TheCall.jsx`) — verdict + reasoning, the fair
  band, the counter with its Apply button, and three tappable summary rows
  (`FOR YOU` · `FOR THEM` · `ROSTER`) that scroll to their act. Injury alerts
  ride directly beneath it. `FOR YOU` and `FOR THEM` both read
  *"{appeal} for you/them — …"* off the one fit engine, so the two seats are
  phrased alike (before 2026-09-07 only `FOR THEM` carried a graded read).
- **YOUR SIDE** (`#act-yours`) — **"Is it good for you?"** (`myFit`'s badge,
  summary and reasons — the mirror of "Would they want it?"), raw value
  (+ scarcity flag), roster fit + landing spots (+ weekly lineup), **Coming In**
  then **Giving Up** depth charts, roster space, win window. The reasons list
  restates facts the blocks below also carry, deliberately: a `Weak` above a
  "+3,702 lineup gain" reads as a contradiction until you can see it is paying
  for a 6% overpay.
- **THEIR SIDE** (`#act-theirs`) — Layer 4's appeal read, landing spots, their
  depth chart, their roster space, their recent moves, their weekly lineup and
  trajectory (which previously sat oddly under *my* win window).
- **CLOSING IT** (`#act-closing`) — the pitch, then Live Intelligence.

**Nothing collapses and nothing hides** — the summary rows just tell you whether
you need to scroll. Anchors carry `scroll-mt-28` so a jump clears the fixed
header, sub-tabs and sticky summary (verified: the act lands 112px from the top).

#### Verdict

- **✅ Accept** / **❌ Decline** / **🔄 Counter**
- One plain-English sentence explaining the reasoning
- When contextual verdict (Layers 2–3) conflicts with raw value (Layer 1), flag it explicitly:

> *“✅ Accept — you’re overpaying 8% on raw value, but this directly fills your WR2 gap
> which is your roster’s most critical weakness right now.”*
> *“❌ Decline — raw value slightly favors you, but you’d be selling QB depth you
> genuinely need in Superflex.”*
- The verdict only renders once **both** sides have at least one asset — until
  then a quiet "add assets to both sides" hint shows instead (totals still show)
- **TWO gates sit on the verdict, and both only ever downgrade an Accept.**
  - **My lineup (`myStartersDelta`) — the mirror of Layer 4's measure, applied
    to my own roster (2026-09-07).** Layer 2 grades fit by *counting* positions
    filled against positions hurt, which ties whenever a trade swaps one
    position for another — measured live, `fitScore` was **0 on 18 of 20**
    suggested trades, and two Accepts sat on top of a starting lineup that got
    *worse* while the reasoning read "this fills your WR need". Layer 4 had
    computed exactly this number for the partner all along and called it "the
    single honest measure of does this help them"; both lineups were already
    built here, so my own side was one subtraction from having it. A drop
    clearing **`MY_LINEUP_MATERIAL_PCT` (1%) of my current starting lineup**
    turns a clean **Accept** into a **Counter** ("…your best starting lineup
    drops N in value — the position count balances, the players don't").
    - **Proportional, never absolute** — the live league's lineups span
      27,000–63,000, so a fixed threshold would be noise on one roster and a
      hair-trigger on another.
    - **It gates; it does NOT feed `fitScore`.** `fitScore < 0` is a hard
      *Decline* branch, and a rebuild trade that ships a starter for youth and
      picks *should* lower today's lineup. Declining those would be a worse
      error than the one being fixed.
  - **Layer 4 (partner appeal).** A `Weak`-appeal deal turns an otherwise-clean
    **Accept** into a **Counter**, quoting the specific objection ("…but there's
    little in it for them. Their best starting lineup loses 1,183 in value.").
  - Neither ever upgrades: a trade that's bad for me doesn't become good because
    they'd love it — their enthusiasm is evidence *against* it, not for it.
    Nothing below Accept is touched by either.
- **Counter:** Name a specific player or pick (never vague) that would make the trade fair.
  Show what needs to move to which side to get within ~5% raw value.
  The suggestion is structured (`getCounterSuggestion` returns `{side, type, item, text}`)
  with an **Apply** button that adds the named asset to the right column directly.
  Assets already in the trade are never suggested.

#### “What’s fair” (Targets sub-tab + scale icon)

There is no separate "mode" — What's Fair is a starting point that pre-fills
the trade, reachable two ways:

- The **Targets** sub-tab (top suggested trade targets ranked by need × value) —
  tap a target → Analyzer pre-fills You Get with the target and You Give with a
  suggested fair package from Nix Cage's actual roster
- The **scale icon** on any player row in the "their roster" add sheet does the
  same in place
- Apply all three analysis layers to the suggested package too
- The callout card above the analysis is dismissible (×)

##### The package search runs off the render path

Pricing every candidate for 20 targets is ~730ms, and it used to run in a
`useMemo` — which executes **during** render, so it blocked the very paint that
would have shown a loading state and the tab simply sat blank. `WhatsFair` now
walks the targets **one per tick in an effect**: the board (and the cash-out
block) paints immediately, each card shows *"Working out what it would cost…"*
until its own package lands, and a line above the list counts down *"Pricing
every package the targets could cost you — N to go."* The longest the main
thread is ever held is a single target (109ms worst case on this roster). A team
switch or data refresh cancels the walk in flight rather than letting a stale
run write over the new board. **This is what makes the untruncated search
affordable** — if a much deeper roster ever makes it bite, chunk *within* a
target rather than truncating, which is what this replaced.

##### Targets has two modes — league-wide and team-scoped

A **team selector** (`PartnerSelect`, the same control the Analyzer uses —
options grouped by trade fit, each carrying win-window tier + record) sits
between the header and the position chips. It turns one fixed list into two
modes; the position chips compose with both.

- **All teams (default)** — the league-wide board: every opponent's players at
  a position where I'm below league average, ranked by
  `need × value × movability`, top 20.
- **One team ("scout this team")** — `getTopTradeTargets`'s `ownerRosterId`
  option scopes the ranking to that opponent **and keeps their non-deficit
  pieces**, ranked below the need-matched ones and tagged `Depth` (need-matched
  rows tag `Your need`). **The filter must push into the ranking, not sit on
  top of it:** the league-wide list is sliced to 20 before anything sees it, so
  filtering that slice client-side would leave most opponents showing zero or
  one row. Keeping their whole board is also why an explicitly chosen team
  never renders empty just because they hold nobody at a deficit position —
  a line above the list states the split honestly ("6 of 14 fill a positional
  deficit; the rest are their most valuable pieces", or "Nothing on {team}
  fills a positional deficit — these are their most valuable movable pieces").
- Scoping also renders the **`PartnerContextStrip`** (their needs / surpluses,
  pick capital, win-window tier, mismatch warning) — the same strip the
  Analyzer carries under its opponent selector, so the mode reads as scouting
  rather than filtering. Row 2 of each card swaps by mode: league-wide shows
  the owning team (the thing you can't infer), team-scoped shows the
  need/depth tag (the owner is already in the header and selector, and
  league-wide *every* row fills a need, so the tag would carry no information
  there).
- Selection persists in sessionStorage `dynastyedge_targets_team`, and nav
  state (Partners → "See their targets →") takes priority over it — the same
  precedence the Analyzer uses for its pre-fills. A stale or foreign roster id
  (identity switch, departed team) silently falls back to the league-wide list.

##### The board is two-sided too — movability, and a package they'd take

Both halves of a suggestion used to be computed entirely from my own roster,
which produced a loop worth naming: tap a target → the app pre-fills a package →
the Analyzer grades it `Weak` appeal and downgrades its own suggestion to
Counter. **Measured against the live league before the fix: 19 of 20 suggested
packages graded `Weak`, none graded `Strong`, and every verdict came back
Counter or Decline.** The app proposed and then argued with itself.

- **`getTopTradeTargets` ranks by `need × value × movability`.** Movability
  (`assetMovability`) is three **roster facts** about the team that holds him —
  his depth rank on their chart, whether he cracks their optimal lineup
  (`buildValueLineup`), and whether dealing him would drop them below league
  average. `need × value` alone ranks the most expensive player at my thinnest
  position first, every time, which put an untouchable WR1 at the top of a list
  answering "who should I call about?".
  - **It is a TILT, not a co-equal factor.** `MOVABILITY_RANGE` is
    `[0.70, 1.35]` — max/min is 1.93, so a player must be worth less than half
    as much to be outranked on movability alone. A first cut at `[0.35, 1.6]`
    failed that on live data: a 2,174 WR5 outranked a 4,395 WR2 purely for being
    available, which is not a better target, only a cheaper one. Same discipline
    as the rookie board's age tilt.
  - **It multiplies, it never gates.** A player his team would hate to lose
    stays on the board, ranked below the ones they can spare. Nothing is hidden
    by it, and the team-scoped contract above is untouched.
- **`suggestFairPackage` is two-phase.** Phase 1 enumerates every package in the
  **assembly window** (`PACKAGE_BAND`, `[0.9×, 1.15×]` of the target) and ranks
  them by what they cost **me** — surplus and depth first, core starters never
  auto-included (`PROTECT_THRESHOLD`), win-window lean.
  Phase 2 scores **every** one of those with **`buildPartnerFit`** — the same
  Layer 4 the Analyzer will grade the suggestion with — then takes the best
  appeal, breaking ties by my own cost. It is deliberately **not** truncated:
  phase 1 orders by what a package costs *me* and knows nothing about them, so
  cutting its output hides packages they would actually want. Measured on the
  live 20-target board — cheapest 40: 102ms, **Weak 2** · cheapest 150: 211ms,
  **Weak 1** · all: 731ms, **Weak 0**. Only the full search leaves no target
  whose best offer the other manager has no reason to accept.
  - Phase 1's objective alone selects, by construction, the pieces a partner has
    least use for: the cheapest asset by keep-score was a third quarterback, and
    nobody in a Superflex league needs one. The packages that work were inside
    the same band the whole time — an exhaustive search found a Fair-or-better
    package for **all 20** targets (8 Strong, 12 Fair) without touching a
    protected asset. Phase 1 simply never looked at their side. After the fix
    the live board reads **Strong 4 · Fair 13 · Weak 3**, with 5 Accepts.
  - **Phase 2 reorders candidates; it never widens the pool.** The assembly
    window and the protected-asset rule are unchanged, so the builder still
    never reaches for a core starter to make a deal palatable.
  - **THE SUGGESTION MUST LAND INSIDE `buildFairBand` — the assembly window only
    feeds `alternative` (2026-09-21, OPEN-10).** The two windows answer
    different questions and §4e-iv is right that they may differ; what they may
    not do is let the *suggestion* leave the band the Analyzer grades in.
    Measured live, it always did: **0 of 20** on the owner's board and **35 of
    180** across all ten seats landed inside ±5%, at a mean of **1.0965× the
    target**. So the card proposed an offer and THE CALL, one tap later, called
    it an overpay — the "app argues with itself" loop that phase 2 exists to
    close, returning in a new place.
    - **Asked of `buildFairBand`, never re-derived** from a 0.95/1.05 literal —
      the Targets card hands its package straight to the Analyzer, so it is
      precisely the surface §4e-iv's standing ruling names.
    - **The overpay is not deleted; it becomes the `alternative`**, now carrying
      `premiumPct`. A fairly-priced offer gives the other manager no edge on
      value, so the package they would say yes to is usually an overpay —
      *"To get a yes: 2027 2nd + Jonathan Taylor (+7% over fair) — fair for
      them"*. That keeps the read the two-phase search exists to produce without
      letting it silently pick the offer. Shown on **88 of 180** rows, against 8
      before; **75 of the 106 `Weak for them`** carry one.
    - **Measured, all four axes together** (the only honest way to report it —
      they trade against each other). Owner's board: keep-pain **17.24 → 15.19**,
      value sent **106,195 → 98,444 (−7.3%)**, inside the band **0/20 → 20/20**,
      my-side appeal **3 Fair/17 Weak → 18 Fair/2 Weak**, verdicts
      **3A/16C/1D → 8A/12C/0D**. All ten seats: keep **198.0 → 191.5**, value
      **979,546 → 934,876 (−4.6%)**, in band **35/180 → 161/180**, Weak-for-me
      **74 → 9**.
    - **The price, stated rather than buried: `Weak for them` rises 31 → 106 of
      180.** It is a *different* Weak from §4e-v's — that one was about
      composition (a third quarterback nobody needs), this one is about price —
      and it is **not a search failure**: across all 176–597 in-band candidates
      per target, the best achievable partner appeal is exactly what phase 2
      chose on **20 of 20**. At fair value those partners cannot be interested by
      anything the owner can spare, which is the literal thing a surviving
      `Weak` has always been documented to mean.
    - **`APPEAL_BONUS` was re-swept jointly and NOT moved.** Its 0.40
      mid-plateau setting is unchanged; the sweep is the evidence for leaving it
      alone rather than an assumption. If the assembly window is ever changed,
      sweep them together again — they are one measurement.
    - **A near-miss still gets an answer.** When nothing reaches the band the
      search falls back to the assembly window and returns `inFairBand: false`,
      and the card says so rather than implying an agreement the Analyzer will
      not give.
    - `PACKAGE_BAND` and `requireFairBand` are exported **sweep hooks**; nothing
      in `src/` passes them. Full method:
      `docs/analysis/trade-fair-band-2026-09.md`.
  - **Phase 2 is a TRADE-OFF, not an override (2026-09-07 — supersedes the
    2026-09-06 owner call recorded below, on the owner's explicit later ask).**
    It used to be lexicographic: best appeal won outright and my own cost only
    broke ties, so the search bought their enthusiasm at any price inside the
    band. Candidates are now ranked on **`APPEAL_BONUS[appeal] − my keep-pain`**,
    one scale, both roster facts.
    - `APPEAL_BONUS` = **Weak −1 · Fair 0 · Strong +0.4**, deliberately
      asymmetric. A `Weak` package is a real failure (the offer goes
      unanswered — the whole reason phase 2 exists), so it is priced as a
      near-prohibitive guard. `Strong` over `Fair` is negotiating comfort, so it
      is a nudge: it is bought only when it is nearly free.
    - **Set mid-plateau, not at a step edge.** Swept over the live 20-target
      board, keep-pain paid across all 20 suggestions: w ≤ 0.20 → 17.79 (5/20
      changed) · **0.30–0.50 → 18.46 (2/20)** · 0.70 → 19.02 (1/20) · 1.00 →
      19.84 (0/20, i.e. the old rule). Three flat plateaus; 0.40 is the middle
      of the selected one, so a small mis-estimate changes nothing.
    - Upgrading Fair → Strong costs −0.63, 0.08, 0.23, 0.28, 0.73 and 0.85
      keep-pain on the six live targets where both tiers exist — so 0.40 takes
      the first four and refuses the last two.
    - **Measured effect: 2 of 20 suggestions changed, −1.38 total keep-pain, and
      raw value sent essentially unmoved (−13 across all 20).** Both changed
      targets had been reaching for an asset just under `PROTECT_THRESHOLD`
      (TreVeyon Henderson at 0.85 keep) when a Fair package at ~0.4 keep-pain
      was available. The fix is narrow because the **fair band already bounds
      the damage** — the old rule could only overpay within `[0.9×, 1.15×]`.
    - These are **preference weights, not measured constants** — same status as
      `AGE_TILT_BY_TIER`. They break near-ties; the fair band and the protect
      threshold still bind first, and the search is still untruncated (§4e-v).
  - **A SUGGESTED PICK CARRIES ITS IDENTITY, and that is load-bearing
    (2026-09-22).** `pickLabel` is `"{season} {suffix}"` — it drops the original
    owner, and **a roster can hold several picks under one label**. Measured on
    the live league: **6 of 10 rosters** do, one holding *three* 2027 2nds. So
    a consumer that recovers a pick by rebuilding its label is not doing a
    lookup, it is tossing a coin between real, distinct assets.
    `suggestFairPackage`'s pick assets therefore carry `season` +
    `originalOwner` alongside `round`, and every consumer matches on the triple.
    **`TradeAnalyzer.jsx`'s `mapPackageToAssets` did rebuild the label and
    `.find` the first match**, which loaded the Analyzer with a **different real
    asset** than the search had chosen. Measured across all ten seats' boards:
    **13 of 142 pick handoffs (9%) loaded the wrong pick** — and **0 of them on
    the owner's own seat**, because he currently holds no twins, which is
    exactly why it was invisible. It was also value-neutral *today* (twins share
    a round-median price, so totals stayed right and nothing looked broken) and
    stops being so the moment slots resolve, since the draft season prices picks
    per slot. 92657ae's ruling — *a preload must resolve to what the add sheet
    produces* — is unchanged; what this adds is that **identity, not a rendered
    label, is what it must resolve by.**
  - **A surviving `Weak` is real information, not a failure** — it means nothing
    you can spare interests them at this price. The card says so rather than
    hiding the row.
  - Without a partner roster it degrades to phase 1 and reports `appeal: null`;
    no read is invented.
  - **The `rationale` is CHECKED against the lineup, not asserted (2026-09-22,
    SMALL-1).** It said *"protects your starters"* unconditionally whenever a
    package drew from a surplus. What it meant was "touched nothing scoring ≥
    `PROTECT_THRESHOLD`", which is a weaker and different claim — a core
    starter lands on exactly **0.85**, and only a deficit or a cliff crosses
    0.9. Measured on the live board it said so on **11 of the owner's 20**
    suggestions and **77 of 180** across all ten seats *while sending a player
    who actually starts* (Jonathan Taylor, Bo Nix, Chase Brown, TreVeyon
    Henderson). `packageRationale` now takes
    `buildValueLineup(myRoster.players).starterIds` and **names the starter**
    instead — *"Drawn from your RB surplus — but Jonathan Taylor starts in your
    best lineup."* Both counts are **0** after; the claim still prints where it
    is true (103 of 180), so this is a check rather than a blanket suppression.
    The `bestUnder` copy lost *"without dealing a core starter"* for the same
    reason — it was the identical unchecked claim, and it would have
    contradicted the corrected sentence on the same line.
    **It is a copy fix over a fact the engine already had**: no keep-score, no
    `PROTECT_THRESHOLD`, no search behaviour moved, and **all 180 selected
    packages across all ten seats are byte-identical** on assets, totals,
    keep-pain, both appeals, `inFairBand` and `alternative`. That equality is
    the acceptance test — a package that changed would mean the search moved,
    and the screen looks plausible either way.
  - **`alternative` — the road not taken, and it now points the OTHER way
    (2026-09-07, widened 2026-09-21).** While appeal won outright the suggestion
    was always the most agreeable package, so the useful footnote was the
    *cheaper* one. Now that the winner already weighs my cost — and, since
    OPEN-10, is held inside the fair band — the card names the package they'd
    like **more** that it declined to pay for, and that is this field's main
    job: *"To get a yes: 2027 2nd + Jonathan Taylor (+7% over fair) — fair for
    them."* It is drawn from the **whole assembly window**, so it is usually the
    overpay the suggestion no longer makes.
    **It still never reorders anything** — it is information beside the pick.
    - **`ALTERNATIVE_MIN_SAVING` (0.25) keeps its value but gained an OR: the
      alternative must cost more in EITHER currency** (keep-pain or value sent).
      The keep-pain test alone was written when both packages were selectable,
      and it hid the most useful row on the card — an upgrade that leaves the
      band for a few hundred points of value while barely touching keep-pain.
      Verified across all ten seats: **not one alternative sends less value than
      the suggestion**, so "costs more" is unconditionally true. Effect: 85 → 88
      of 180.
    - **Historical note.** Making appeal trade off against my own cost was
      proposed and **declined by the owner on 2026-09-06** (reasoning: knowing
      whether they would accept is the information the search exists to
      produce). The owner **reversed that on 2026-09-07** after the review above
      measured what the lexicographic rule was costing. The earlier ruling is
      superseded, not forgotten — if the trade-off is ever revisited, the
      original objection is the thing to answer.
- Each target is a **ruled row, not a card** (law 5): the board is an
  enumeration of twenty, and twenty bordered rectangles is exactly the shape
  finding B7 named. It sits under a **neutral ink band** — the board mixes
  positions, so the hue rides on a 7px swatch per row instead.
  **The hierarchy is inverted from what finding B2 measured.** B2: "the loudest
  element on every one is the player's *name* … the least decision-relevant
  field on the card (you know who Ja'Marr Chase is). The most decision-relevant
  fields, the two appeal reads, are the smallest text on the card." So the name
  drops out of display uppercase into body text, the value becomes a
  **`Magnitude`** (size is the quantity), and the appeals come up out of 9px
  badges into labelled `YOU` / `THEM` lines.
- Each target row carries **both** reads — `YOU {appeal}` above
  `THEM {appeal}` plus one short line. **Only `Strong` and `Weak` are
  `Mark`ed** (success / warning): `Fair` is the null result, and marking all
  three would put forty coloured blocks down a twenty-row board and scan as
  noise. Marking the two decisive tiers leaves a readable pattern of "gettable"
  and "they won't bite" down the list, which is the question the board answers.
  Never brand red — that is reserved for "you" accents. The board no longer hands over an
  offer without saying what it is worth to the team being asked to accept it —
  or to mine. `myAppeal` / `mySummary` / `myStartersDelta` / `myConcern` are
  computed **once, for the winning package, after phase 2 has chosen it**, so
  the measured ranking (`APPEAL_BONUS − keep-pain`) is untouched and the
  untruncated search stays affordable. A `Weak for you` prints the concern
  itself — *"you'd be giving up 7% more value than you get back"* — because that
  is a counter you can make; see Layer 4's note on why 17 of 20 read that way.
- **The five negotiating signals stay out of all of this.** The rule the app
  runs on is *roster facts may score; second opinions describe* (owner call,
  2026-09-06) — one rule for verdicts and rankings alike. Layer 4 and movability
  are arithmetic over a roster, so they score; scarcity, roster space, weekly
  points and a partner's recent moves are unbacktested second opinions about
  value or intent, so they describe and never reorder a recommendation.

**No saved history.** The in-progress trade survives the session via
sessionStorage, but there is no multi-trade history — that lives in Sleeper.

-----

### Feature 4 — Lineup Optimizer

**Purpose:** answer one question every week — **"what should I change, and what
does it cost me if I don't?"** Not a status board: a start/sit engine that
solves the whole lineup, names the moves, and lets you build the result.

*The Optimizer is the **Lineup** view under **Squad** (`/my-team/lineup`),
a sibling of My Roster, Season Review (Feature 9), and Trajectory. The
standalone Lineup section is gone — `/lineup` redirects here.*

*This feature is hidden entirely during the offseason.*
*Detect via `/state/nfl` → `season_type !== 'regular'`. In the offseason the
Optimizer tab shows a placeholder (biggest roster need, rookie draft capital,
win window); Season Review remains available on its own tab.*

#### Data sources for this feature

|Data                        |Source                                                                                            |
|----------------------------|--------------------------------------------------------------------------------------------------|
|Weekly point projections    |Sleeper `/projections/nfl/regular/{year}/{week}`                                                  |
|Injury / availability status|Sleeper player data (injury_status field)                                                         |
|Bye weeks **and game locks** |Sleeper `/schedule/nfl/regular/{year}` (off `/v1` — `SLEEPER_ROOT`; fields `home`/`away`, **plus `status`** — see Game locks)|
|Points already scored        |`players_points` on `/league/{id}/matchups/{week}` — already fetched by `useSleeper`, so no extra request|
|Matchup quality             |Sleeper `/stats/nfl/regular/{year}/{week}` for points, joined to the player DB (position + team) and the schedule (opponent) — those stats carry no `pos`/`opp`/`tm`|
|Dynasty value (secondary)   |FantasyCalc (already cached)                                                                      |

**Sleeper's projections payload carries no floor/ceiling** (verified against the
live 2026 W1 endpoint — only `pts_half_ppr` plus stat components). So there is
no boom/bust or confidence read here, and inventing one would be fabrication.

#### The engine (`utils/lineupMoves.js`, pure)

`buildLineupMoves` solves the **whole lineup at once** with the shared slot-fill
(`selectOptimalStarters` — the same engine Season Review uses in hindsight, fed
weekly points), then **diffs** the optimal starter set against the one you're
actually starting. The set difference is the move list.

This replaced a per-slot check ("is any bench player projecting higher than this
starter?"), which was not an optimization and was wrong in two ways:

1. **Gains double-counted.** One bench player who outprojected two starters
   flagged *both* slots, advertising his points twice for a player who can only
   fill one.
2. **Cascading moves were structurally invisible** — promoting a WR out of FLEX
   into WR2 so a better RB takes the FLEX is the most common real optimization,
   and no single-slot comparison can see it.

The diff has the property the old math lacked: **the per-move gains sum exactly
to the headline** ("points sitting on your bench"), because shuffling a player
between slots changes no total. `tests/lineupMoves.test.mjs` pins that
invariant, both original bugs, and the swap algebra.

#### Game locks — the difference between "best lineup" and "best lineup you can still reach"

**Sleeper seals a player's slot the moment his NFL game kicks off.** The engine
did not know that, and the failure was not cosmetic. Measured live on
2026-09-20 (Week 2, Sunday lunchtime), it told the owner:

> `[MUST FIX] SIT DJ Moore → START TreVeyon Henderson · +8.5` · "DJ Moore is
> listed Out and will likely score 0" · **8.4 points sitting on your bench**

Moore's game (DET @ BUF) had finished on **Thursday**. Three of those claims
were false at once: he could not be benched, he had not scored 0 — he had
banked **−0.1** before leaving with an AC joint sprain — and the 8.5 points
were reported as recoverable when nothing could recover them. The schedule
payload had carried `status: "complete"` for that game the whole time.

So the question the engine answers narrows, and the narrower question is the
better one:

- **`parseLockedTeams`** (`utils/projections.js`) reads the `status` field.
  `getAvailability` gains **`locked`**, which is **orthogonal to `blocked`**:
  `blocked` is a forward-looking claim ("he will score 0, take him out"),
  `locked` is a claim about the transaction ("you cannot take him out at all").
  Moore was both, and conflating them is what produced the advice.
- **Locked starters are PINNED to their slots** (`selectOptimalStarters`'s new
  `pinned` option) at their real score. **Locked bench players leave the
  eligible pool** — you cannot start a player whose game is over. Neither can
  produce a move.
- **The Σ-gains invariant survives by construction**: a locked contribution
  appears identically in the current total and the optimal total, so it cancels
  out of the difference. Pinned by test.
- **A played game is FACT, and it outranks both the projection and the
  blocked-scores-0 rule.** Actual points come from `players_points` on the
  current week's matchups — which the app **already fetches** (`useSleeper`),
  so the phone pays nothing; `useLeague` exposes them as `weeklyPlayerPoints`.
  A locked player with no live score falls back to his **projection, never
  0** — "he will score 0" is a claim about the future and his game is not in
  the future, so guessing 0 re-manufactures the same overstatement.
- **An empty locked set means "locks unknown", never "everything locked"** —
  the same discipline an empty `playingTeams` keeps about byes. An absent or
  unrecognised `status` does not lock: over-locking would pin a player you can
  still move and hide a real move, while under-locking merely degrades to the
  behaviour that shipped before locks existed.
- **The UI drops the swap handle on a locked row**, refuses to arm or target
  it, and **replaces the matchup pill with a `FINAL` / `LOCKED` badge** — a
  matchup rating forecasts the defense a player is due to face, and after
  kickoff that is not a stale number but a meaningless one. That is also a
  layout fix: carrying both squeezed the name column hard enough to break
  "DJ Moore" into **seven lines** at 390px. **`--overflow` cannot see this** —
  the name *wraps*, it does not clip, so the truncation instrument reports
  nothing. Look at the screenshot.
- The moves card reads **"Nothing left to change · 6 slots locked · 9.2
  banked"** rather than "Lineup is optimal", which would claim credit for a
  lineup the rules froze, and its figure is labelled **Live total** rather than
  **Projected** once any slot is sealed.

Measured on the live league, same roster, minutes apart: **`128.5 → 136.9,
8.4 left on bench, 1 must-fix`** became **`76.4 total, 0.0 left, 0 must-fix,
6 slots locked, 9.1 banked`**.

Two contracts worth stating:

- **A blocked player is dropped from the eligible pool outright**, not handed a
  0 metric — a 0-metric player still gets *placed* when nothing else is
  eligible, which would quietly "optimize" a bye-week player back into your
  lineup. An unfillable slot stays empty; that's the truthful outcome, and it
  surfaces as "no eligible replacement on your bench".
- **A blocked starter contributes 0 to the current total**, whatever projection
  Sleeper still carries for him. An "Out" starter holding 12.4 would otherwise
  inflate the total and hide the exact gap this tool exists to surface.

**`getAvailability` (`utils/projections.js`) is the one availability verdict** —
`{ blocked, status, label, short, locked }` for bye / IR / Out / Questionable /
ok, taking `(player, playerStatuses, playingTeams, lockedTeams)`. `locked` is
orthogonal to `blocked` (see Game locks); omitting the fourth argument means
"locks unknown" and reproduces the pre-lock behaviour exactly.
`label` is the full word for prose ("is listed Questionable"); `short` is the
fantasy shorthand for a row chip, because a full-width badge at 390px squeezes
the player's own name to "Rach…".

**The DEF slot is part of the lineup.** The old view skipped it entirely, so an
unset or bye-week DEF was invisible — verified live on 2026-09-04, when roster 6
had an empty DEF slot, a rostered Chiefs DEF on the bench, and the Optimizer
reporting no changes needed.

#### Main view

- **Moves card (top, the red score-bug hero):** projected **points sitting on
  your bench** as the headline, `now → optimal` totals, and a must-fix /
  upgrades / coin-flips count. When nothing needs changing it flips to the green
  "Lineup is optimal — no changes needed" state.
- **The move list:** one card per move — `SIT <player>` / `START <player>` with
  its own gain, a Must fix / Upgrade badge, a **confidence line**, and a
  plain-English reason ("Rachaad White is on bye and will score 0"). A move
  whose one-for-one pairing isn't directly legal is labelled part of a
  multi-player reshuffle rather than implying an illegal swap.

#### Confidence — how much to believe the recommendation

A "+2.3 pts" upgrade shown with the same authority as a "+9" one is a lie of
presentation: residual weekly scoring noise is 5.6–7.3 points per player, so a
two-point edge is nearly a coin flip. `utils/lineupConfidence.js` ships the
**measured** hit-rate curve — "how often does the higher-projected player
actually outscore the lower, as a function of the gap?" — and every non-must-fix
move renders it: *"61% likely to be the right call."*

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

- **N = 666,026 FLEX-eligible same-week pairs (2022–25), monotone across every
  bin.** Regenerate with `scripts/dev/optimizer-signal-backtest.mjs` §3 and copy
  the "FLEX-eligible" block — **never hand-edit the numbers.** The file carries
  the command and the last regeneration date.
- **One curve, not three.** The same run measures it independently for QB and
  DEF and they track within ~3 points at every bin, so the gap — not the
  position — is what drives it. What is *not* measured is a cross-position
  slot-fill (a QB winning Superflex over a WR); the file says so.
- **A must-fix carries NO confidence.** A bye/Out/empty slot scores 0 by rule,
  not by projection — there is no "higher-projected player" question to be 61%
  sure about, and borrowing the curve's authority for it would misstate what it
  measured.
- **Sub-1-point moves are demoted out of the move list** into a collapsed
  "N swaps with no meaningful edge" group that states the 52% figure. They are
  **demoted, never dropped**: the headline is optimal − current, and hiding a
  move outright would leave points in that number with nothing on screen
  explaining them. The invariant "per-move gains sum exactly to the headline"
  still holds over *all* moves, and `tests/lineupMoves.test.mjs` pins it.
- **Starting lineup + bench**, both rendered by the shared `LineupRow` so a
  player reads identically wherever he sits: slot/position lead, name, status
  chip, NFL team, projection, matchup pill, and an optimal tick.

#### The sandbox — swapping

Sleeper's API is **read-only**; a lineup can never be written back. So the
lineup here is a **local scratchpad** seeded from Sleeper's actual starters:

- Tapping a row **body** opens the `PlayerProfileDrawer`, like every other
  player row in the app. The **⇄ handle** arms a swap.
- While a swap is armed the **whole row becomes the target hit-area** (a 24px
  handle is not a mobile tap target for the action you're mid-way through), and
  only **legal** targets highlight — the rest mute. A starter↔starter swap is
  legal only when **both** players can occupy the other's slot; a bench player
  only needs to be eligible for the armed slot.
- **Apply N moves** writes the optimal lineup; **Reset** restores Sleeper's.
  While edited, a line says plainly that this is a local preview and the real
  lineup is set in the Sleeper app.
- An **empty slot** carries its own "Tap to fill" affordance — it's the one row
  you must act on and the only one with nothing to tap.
- The armed banner also offers **Waiver options** for that slot, which is the
  moment you're actually asking "who else can play here?" — the free-agent list
  is an explicit action, never the accidental result of tapping a flagged
  player (which is what it used to be).

**Free agents are deliberately NOT folded into the optimal lineup** (owner
decision, 2026-09-04): the headline must stay honest, and you can't start a
player you don't own.

#### Status flags — shown on every player

- 🔴 **Hard block:** Out, IR, Suspended, PUP, or on bye. Scores 0, excluded from
  the optimal pool, always a **Must fix** move.
- 🟡 **Soft flag:** Questionable / Doubtful — startable, still counted, but
  surfaced on the row and named in any move that involves them.
- 🟢 **Confirmed:** healthy and in the optimal lineup — a green tick, no action.

#### Free agent layer

- The armed-slot **Waiver options** action opens a drawer of available players at
  that slot's eligible positions, sorted by weekly projection
- Each free agent shows **both** values side by side:
  - Weekly projected points (from Sleeper)
  - FantasyCalc dynasty value (from cached FantasyCalc data)
- Reason: if two free agents project similarly this week, prefer the one with
  higher dynasty value. Both numbers must be visible to make this call.
- **The list is NEVER gated on FantasyCalc.** It used to be (`if (!fc) return
  null`), and since FantasyCalc ranks **zero** defenses that emptied the DEF
  slot completely: 0 rows against 14 available defenses, behind the one row the
  Optimizer marks "Tap to fill". Unranked players — every defense, plus deep
  stashes — resolve from the shared `usePlayerDB` cache and show `—` for value,
  exactly as rule 7 requires everywhere else. The list itself is built by the
  pure, tested `utils/freeAgents.js` (`buildWaiverOptions`), which also carries
  the `TEAM_*` guard.
- **Framed honestly for the DEF slot:** the drawer says this is for filling an
  empty slot or covering a bye, **not** a weekly streaming edge. Streaming
  defenses on Sleeper's projection was measured over **408 team-weeks
  (2023–25) at −0.00 pts/wk** (one season significantly negative) — the
  original single-season "+0.91, significant" result did not replicate. This is
  a correctness bug worth a few points a year, not a feature.

#### Matchup quality indicator

Shown on players in both the starting lineup and the bench:

- 🟢 **Easy** — opponent defense ranks bottom third against this position
- 🔴 **Tough** — top third
- Middle third shows **nothing** — a column of "Neutral" pills is noise

Rankings are computed fresh each week by `computeDefenseRankings`
(`utils/projections.js`) from the previous week's stats: **total** half-PPR
points each defense allowed to each position — totalled, not averaged over the
players faced, since the stats payload includes every rostered player and an
average would punish a defense merely for facing a deep bench of zero-point
players. The stats endpoint carries no position/team/opponent, so those come
from the shared player DB and the schedule (see the Critical stats note).
Update when the user manually refreshes or opens the Lineup tab.

**Week 1 degrades honestly:** no prior week has been played, so Sleeper returns
`{}`. Rather than rating every player "Neutral" off an empty sample, the pills
**hide entirely** and a line explains that matchup ratings start in Week 2. The
schedule and prior-week stats are both **best-effort** — either failing leaves
byes/matchup quality degraded but must never blank the Optimizer behind an
`ErrorState` (it renders that check *before* the offseason check, so a rejected
fetch would take the whole tab down for the season).

### Feature 5 — League-Wide Overview

**Purpose:** State-of-the-league dashboard. Understand the full competitive
landscape before making any move. **This is the single all-10-teams list** —
the old Roster › All Teams view was fused in here (it was a strict subset of
this richer dashboard); the old `/roster/teams` list route now redirects to
`/league`, and the drill-down lives at `/league/teams/:rosterId`.

#### Top section — Current matchups *(in-season only)*

- Show all 5 games this week across the league
- Each matchup: both team names, projected scores if available
- Hidden entirely in offseason

#### League health banner *(always visible)*

Three tappable tier chips — “3 Contending · 4 Middle · 3 Rebuilding” — plus
a “You: <tier>” readout. Tapping a chip filters the team list to that tier
(tap again to clear). The tier filter persists in sessionStorage
(`dynastyedge_league_tier`) and applies to both the team list and the
position-ranking view (ranks stay league-wide; the filter only hides rows).

#### Team list

**Default:** Vertical list, all 10 teams sorted by total roster value (high to low).
Every card shows its rank ordinal for the current sort (computed before the
tier filter, so ranks always reflect true league-wide standing). Nix Cage's
card is highlighted (accent border + “You” chip) in both the team list and
the position-ranking view.

**Sort toggle:** Overall value / Record / Pick capital / FAAB remaining
(Record sorts by wins, then points for; FAAB mode shows remaining + spent of
budget). The Record option is hidden entirely when no team has played a game
yet (offseason) — a persisted `record` sort silently falls back to value.

**Position filter:** Tap QB / RB / WR / TE →
List switches to a ranked list (1–10) sorted by that position's strength.
Sort and position filters persist in sessionStorage so drilling into a team
and coming back doesn't reset them.

**Divergence badges:** when records exist, teams whose roster-value rank and
record rank differ by ≥ 4 places get a badge — **Underperforming** (amber:
talented roster, bad record — a frustrated owner is a buy window) or
**Overachieving** (blue: record outruns talent — regression candidate).

**Each team card shows:**

- Team name + owner username
- Win window tier badge (Contending / Middle / Rebuilding)
- Total roster value
- Positional read: QB · RB · WR · TE — each letter **lit in its position hue
  when the team is above league average there, muted when below**, with the
  30-day trend arrow beside it. This replaced a fill bar that clamped at twice
  league average (see law 2's bar test); the binary is what this line always
  meant.
- Pick capital: 2026 / 2027 / 2028 — show count of picks owned per year
- FAAB remaining (from Sleeper roster data, format as `$XXX`)
- Win/loss record next to the owner username (when the season has records)
- **Tap → full roster + picks detail (same as Roster + Picks Viewer drill-down)**

-----

### Feature 6 — League Activity (League › Activity)

Season-wide transaction feed: trades, waiver claims (with winning FAAB bid),
and free-agent moves, newest first.

- **Filter chips:** All / Trades / Waivers / FA / My Moves (My Moves = any
  transaction involving roster 6). Changing the filter resets pagination.
- Trades show each side's full haul: players, picks (with original owner), FAAB
- **Every asset shows its current FantasyCalc value** with a per-side total
  next to each "X gets" header; when two sides' totals differ by more than
  5%, the larger haul renders green. FAAB dollars display but don't count
  toward totals. A header note says values are at today's prices, not at
  trade time. Unranked players show `—`.
- **A pick spent in the same season it was traded is priced in three tiers,
  best first** — the same ladder the manager scouting ledger uses, from the
  same two shared helpers in `utils/pickCapital.js`, so a trade can never read
  differently on the two screens that both show it:
  1. **What it became** (`buildDraftPickIndex`) — the player actually drafted
     at that slot, at his value today, rendered `2026 1.10 → Jonah Coleman` and
     **tappable** into his profile. The exact slot replaces the usual "(via X)"
     here: it says more and costs a third of the width, and the label truncates
     at 390px where the player's name is the new information.
  2. **The market price** (`findPickValue`, median of round) for a pick whose
     draft hasn't happened.
  3. **The generic round median** (`buildGenericRoundValues`, across every
     season FantasyCalc lists) marked with a **≈** — "a 2nd is a 2nd".
  `—` is reached only when FantasyCalc lists no picks at all.
  **Why this is not cosmetic:** FantasyCalc retires a season's pick entries the
  moment its draft completes, so before this the current season's own trades
  priced their spent picks at **0** — and the per-side totals, and therefore the
  green larger-haul flag, were computed from those zeros. Verified live
  2026-09-07 on this league's one 2026 trade: 1,620 vs 858 (wrong) became
  2,095 vs 2,798 (the other side is the larger haul).
  The draft's pick list comes from `useSleeperDraft` — session-cached and
  shared with the Draft section, and after a completed draft it is holding
  exactly that draft. Best-effort: a failure drops the feed to tier 2/3, never
  an error.
- **Player names are tappable** (dotted underline) and open the
  PlayerProfileDrawer — only for FantasyCalc-ranked players; unranked
  fallback names are plain text. A pick resolved to its drafted player is
  tappable on the same terms.
- Transactions involving Nix Cage get an accent border + “You” chip.
- Player names resolve via FantasyCalc playerMap, falling back to the player DB
  (so dropped players still show names)
- 25 entries per page with a "Show more" button
- Data: all 18 weekly `/transactions/{week}` buckets fetched in parallel,
  filtered to `status === 'complete'`, cached per session

-----

### Feature 7 — Market Movers (League › Movers)

30-day dynasty value trends, turned into actionable lists:

- **Watching** (top section) — every watchlisted player, sorted by absolute
  trend, shown regardless of trend size. Hidden when the watchlist is empty.
- **Buy-Low Targets** — falling players (trend < −50) at my deficit positions,
  not on my roster, value ≥ 1000. A rebuilding owner is flagged as a prime target.
- **Sell-High Candidates** — my rising players (trend > +50) at my surplus positions
- **Top Risers / Top Fallers** — league-wide, rostered players plus free agents
  with value ≥ 500 (filters out deep-FA noise)
- **Trend shows both absolute and %** (vs the value 30 days ago) — +120 on an
  800 player reads very differently than on a 7,500 one.
- **Buy-Low and Sell-High never vanish silently** — when empty they render a
  one-line hint explaining why (no deficit/surplus positions, or no movers
  matching them). Watching/Risers/Fallers still hide when empty.
- Every rostered player's row has a **Trade button** that deep-links into the
  Trade Analyzer: an opponent's player arrives as a What's Fair target
  (opponent + fair package pre-filled); my own player arrives pre-loaded in
  You Give. Free agents get no button.
- **The row SPLITS around that button — it is a sibling, never a child.** The
  Trade action used to sit inside `Row`'s own `<button>` with a
  `stopPropagation`, i.e. a `<button>` nested in a `<button>`: invalid HTML,
  and React warned on every render of the page. `MoverRow` now renders `Row`
  as a plain `<div>` (which is what `Row` does with no `onClick`) holding two
  real sibling buttons — the content, which opens the profile, and the action.
  **This deliberately does NOT follow the Partners-card precedent** ("a sibling
  *below* the card"), and the difference is **cardinality**, which is law 5's
  own test. Partners is nine tall cards, so a full-width footer button costs
  one row of height each. Movers is up to ~30 dense rows across six sections;
  the footer treatment was built and measured at 390px and it adds **752px
  (+24%)**, turning a list you SCAN into a wall of buttons whose CTA out-shouts
  the value and the trend. The split row costs nothing — measured **3,020px
  against the nested version's 3,175px**, i.e. 155px *shorter*, with 0 nested
  interactive elements and 0 React warnings in both themes. Both targets carry
  `.focus-ring` and `.press`.
- Rows show a **sparkline** when the values-history feed has ≥ 4 snapshots
  for the player (see Value history pipeline).
- Tap any row → Player Profile drawer
- Zero extra API calls beyond the lazy once-per-session history fetch:
  computed from cached FantasyCalc data

-----

### Feature 8 — Watchlist

Star any player from the Player Profile drawer (star icon in the header).

- Stored in `localStorage` key `dynastyedge_watchlist_v1` via the `useWatchlist`
  hook (a shared external store — all components update together)
- Trade Partner Finder shows "Watching: …" on any partner card whose roster
  holds watched players

-----

### Feature 9 — Lineup Efficiency (Squad › Season Review)

"How many points did I leave on the bench?" — actual vs optimal lineup for
every completed week.

- Optimal lineup computed from `players_points` in past matchups, filling
  single-position slots first, then FLEX, then Superflex (`utils/lineupHistory.js`,
  which delegates to the shared slot-fill in `utils/lineupBuild.js`)
- Summary card: efficiency % + total points left on bench
- Per-week rows: actual, optimal, delta (green ✓ when optimal, amber/red otherwise)
- Shows during the offseason too (it reviews the completed season)
- Data: `/matchups/{week}` for completed weeks, read from the shared
  matchup-weeks cache (`src/hooks/matchupWeeks.js`, shared with Playoff Odds —
  one fetch per week per session across both). If every week fails to load,
  the page shows an error + retry instead of "no data"
- **Its own view** under **Squad** (`/my-team/season-review`), a sibling of
  My Roster, the Optimizer, and Trajectory — not stacked inside the Optimizer's
  scroll. It renders as a standalone padded page with its own header.
  (`/lineup/season-review` redirects here.)
- **Reached from the Optimizer** (a footer link on Squad › Lineup), which is
  where the question gets asked: you have just been told what *this* week's
  lineup is costing you, and this is the season-long version of that number.
  Before 2026-09-11 it had no content-level inbound link at all.

-----

### Feature 10 — Draft (Draft › Board · Tracker)

Rookie draft prep plus a live draft-day companion, synced with Sleeper's
real draft.

**Board:** the full rookie class (Sleeper `years_exp === 0`) enriched with
FantasyCalc values, grouped in value tiers. Two modes — FantasyCalc order and
**My Board** (drag-to-reorder, persisted). Per-prospect notes are shared with
the Tracker. Search box + position chips. A pre-loaded FantasyPros CSV column
plus user-uploaded CSV ranking columns (syncable across devices via
`public/rankings.json`). When a synced Sleeper draft exists, drafted players
grey out and amber badges show the latest of my remaining picks where each
prospect is still projected available (by derived rookie ADP).

**Tracker — synced via `useSleeperDraft`:** the 2026 rookie draft comes from
`/league/{id}/drafts` → `/draft/{draft_id}` + `/draft/{draft_id}/picks` +
`/draft/{draft_id}/traded_picks`.
**The single-draft call is load-bearing:** `/league/{id}/drafts` **omits
`slot_to_roster_id` entirely** (verified 2026-08-08), and only `/draft/{draft_id}`
carries it. Without it `buildDraftOrder` returns `null`, which silently disables
the entire order-driven live path — on-the-clock banner, "N picks until yours",
Best Available, and slot-accurate capital all vanish with no error. The fetch
merges the single-draft object over the listed one and falls back to
`draft_order` + rosters (same two-tier contract as pick capital, Feature 1) so
the board still resolves in `pre_draft`.
All live-path derivation is **pure logic in `utils/draftLive.js`**
(`deriveDraftState`, `buildBestAvailable`, `buildMyCapital`, `buildRecap`) —
extracted from the component so `tests/draftLive.test.mjs` can replay a real
past draft pick by pick.
Real draft order (`slot_to_roster_id` + in-draft pick trades), live pick feed,
on-the-clock banner, "N picks until yours", a My Draft Capital card (real pick
slots + FantasyCalc pick values + taxi usage), and an on-the-clock **Best
Available** card (best overall + top prospect at each deficit position). The
undrafted list has search, position chips, and a My Board / ADP sort toggle so
board prep carries into draft day. Rows open the Player Profile drawer (with
notes). When the draft completes: the recap below, biggest steals/reaches
(pick slot vs rookie ADP), and full results.

**Draft recap — the standing is Value Over Expected, not value drafted.**
Raw value drafted ranks *volume*: a team holding 8 picks out-drafts a team
holding 3 by picking more often, which is what the original table measured and
called a result. Verified on the real 2026 recap — the 7-pick team led on raw
total (15,113) and sits **3rd** on the grade. Each row now carries three
numbers, strongest first:

- **Value over expected** (the sort) — value drafted minus what that team's
  pick *slots* were owed. The expected curve is built from the class itself:
  sort every drafted player by value descending, and the k-th best value is
  the expected return of the k-th pick of the board. `Σ expected == Σ actual`
  by construction, so **VOE sums to exactly zero league-wide** (pinned by
  `tests/draftLive.test.mjs`) and pick count cancels out of the ranking.
  Colored as a verdict outside a `VOE_NEUTRAL` (100) noise band — a hundred
  points on the 0–10000 scale is less than one FantasyCalc tick.
- **Value per pick** — the weaker efficiency read, biased toward whoever
  picked least, kept as a secondary column rather than a sort.
- **Hits** — picks already worth `DRAFT_HIT_VALUE` (1000, starter-caliber),
  the same bar Manager Scouting grades rookie picks against and now **exported
  from `managerAnalysis.js`** so the two can't drift. Immune to one stud
  inflating a total.

**The expected curve deliberately does NOT come from FantasyCalc's pick
entries, because they don't survive the draft.** Verified against the live feed
2026-09-06: all 24 pick entries on the board covered 2027–2029 only — a
season's picks are retired the moment its draft completes, so a recap opened
the day after would have had nothing to price slots against. Pricing slots off
a *later* season's picks (the only ones that exist post-draft) prices them a
year further out, i.e. cheap, which re-introduces the exact "more picks =
better draft" artifact this replaces.

With no priced player anywhere in the class, every expectation is 0 and a
"+0" grade would be fabricated confidence: `graded` goes false, `voe` and
`expected` are `null`, the header falls back to "Value Drafted by Team", and
the raw total takes the column (rule 7). The card states in-page what the
number means and closes with the honest caveat that it grades at *today's*
prices, pointing at Trade › Managers, which regrades the same picks in
hindsight every season.

**Rookie Research** is the third Draft view — see Feature 19. The Board links
to it directly (a footer link): the Board ranks the class by dynasty *value*,
which prices consensus, and Research answers the question that ordering cannot
— which of them will actually play. Before 2026-09-11 Research had no inbound
link anywhere and was also missing from global search.

**Refresh model:** Board and Tracker share one session-cached fetch
(`useSleeperDraft` module cache). A manual Refresh button refetches on demand;
the hook also refetches when the tab regains focus (aggressively while the
draft is live — exactly the flip-back-from-the-Sleeper-app moment — gently
otherwise) and polls every 30s while status is `drafting` and the tab is
visible.

**Which draft the Tracker shows** is resolved from live data by
`selectTrackedDraft` (`utils/seasonWindow.js`): the **upcoming** rookie draft
whenever Sleeper has one, otherwise the **most recent completed** one, so a
finished draft's recap stays on screen through the months before next year's
board exists rather than the tab collapsing to an empty placeholder. The
Tracker reads its season off the draft it is actually rendering; the manual
fallback below uses `pickYears[0]`.

**Manual fallback:** until the league creates the rookie draft in Sleeper, the
Tracker offers manual pick logging (slots provisionally assume roster-ID order
— labelled as such) plus a "Check" button to re-poll for the draft. Manual log
stored in `dynastyedge_draft_tracker_{season}`, keyed by season so one draft's
log can't leak into the next.

Draft-section storage keys live in `src/components/draft/boardStorage.js`:
`dynastyedge_board_order` (My Board order) · `dynastyedge_prospect_notes`
(notes, shared Board ↔ Tracker) · `dynastyedge_csv_rankings` (uploaded CSVs).

-----

### Feature 11 — Manager Scouting (Trade › Managers)

Behavioral trading profiles for every manager, built from **every season of
league history** — the intel layer behind "who do I call?". Plus a report
card on me: how am I actually doing, and what should I work on?

> **Location:** lives under **Trade › Managers** (`/trade/managers`) — it's
> trade intel, so it sits with the trade tools. `/league/managers` redirects
> here. The component files remain in `src/components/league/`.
> **Reached from Trade › Partners** (a footer link), which is where it belongs:
> the partner cards answer "who do I call?" from their *roster*, and the next
> question is how that owner has actually traded before. Before 2026-09-11 it
> had no content-level inbound link at all.

**League history walking (`useLeagueHistory`):** every Sleeper league carries
`previous_league_id` — the same league's prior season. The hook walks the
renewal chain (capped at 8 hops), and for each past season fetches users,
rosters, all 18 transaction buckets, and every draft with its full pick list.
It also fetches the **current** league's drafts (with picks) so traded picks
from completed rookie drafts resolve into players. Lazy (first consumer
mount) + session-cached — past seasons are frozen, so one fetch per session.
If the league was ever recreated instead of renewed, the chain just ends
there and profiles cover fewer seasons.

**Analysis (`utils/managerAnalysis.js`, composed via `useManagerProfiles`):**

- **Identity:** managers are keyed by `owner_id` (stable across seasons) —
  roster IDs are only resolved within their own season. Profiles exist for
  current owners; departed owners still appear as named counterparties.
- **Trade ledger:** every completed trade, recorded per participant from
  their perspective (got / gave / net / win-loss-even at ±5% of trade size).
- **Hindsight valuation:** everything is graded at *today's* FantasyCalc
  prices — did the move age well? Traded picks whose draft has since
  happened resolve to the actual player drafted at that slot
  ("2026 1st → Player Name") via `slot_to_roster_id` + the draft's pick
  list (falling back to `draft_order` + that season's user → roster map
  when Sleeper omits `slot_to_roster_id`). Future picks use today's market
  pick value (`findPickValue`); past picks that can't be resolved use the
  median of that round across FantasyCalc's listed picks (shown with ≈) —
  never 0 just because the draft year passed. FAAB in trades displays but
  counts 0, same as League › Activity.
- **Tendencies:** pick accumulator/shipper, buys youth/veterans (avg age of
  players acquired vs given), position chasing, FAAB aggression vs league
  average — rendered as chips.
- **FAAB efficiency — measured in BUDGETS, never in raw dollars**
  (fixed 2026-09-20). `budgetsCommitted` (a **multiple**: 1.73 = one and three
  quarter budgets), `valuePerBudget` (today's value of waiver pickups per one
  **full budget** committed), `avgBidPct` (a **percent** — a single bid really
  is a share of the budget it drew against), claims, FA move count. Every bid
  is divided by **its own season's `waiver_budget`** before it is aggregated.
  - **The total is a COUNT, not a percent, because the budget resets twice a
    league year** (see League Context). "173%" invites *"of what?"*, and with
    two resets a year across four seasons the honest denominator is ~8 budgets,
    not one — a number whose unit misreads is the exact bug this fix exists to
    remove. The per-bid percent is untouched: both periods carry the same
    `waiver_budget`, so no period split is needed and the bidder tendencies
    compare like with like.
  - **Why a dollar is not a unit here.** This league's budget went **$100
    (2023–25) → $1000 (2026)**, so a cross-season dollar total is a number in
    no unit at all. The bug was live, not theoretical: measured against the
    live league on 2026-09-20 (four seasons, 287 bid-bearing claims, 2026 top
    bid **$695**), summing raw dollars moved **four of ten** tendency chips and
    **inverted two** — the league's largest raw spender ($1,071, avg bid 26.1)
    wore "Aggressive bidder" while actually bidding **10.7%** of budget,
    *below* the league's 12.5%; and a manager whose raw $132 read mid-pack was
    in truth a 4.8%-average **"Bargain hunter"**. His FAAB efficiency was
    understated **4.6×** (832 → 3,853).
  - **`valuePerBudget` is the successor to the old "value per $100", and it is
    continuous with it.** On a $100 budget a full budget *was* $100, so the two
    are the same number and the fix **restates no pre-2026 history** — verified
    live: all four managers with no 2026 spend scored byte-identically either
    way. Only 2026's dollars stop being counted at 10×.
  - The `budgetsCommitted >= 0.2` coaching gate now means what it always said
    it meant — "committed ≥20% of a budget". On raw dollars it tripped at **2%**
    of 2026's $1000.
  - **No raw-dollar field is carried out of `buildFaabStats`**, deliberately
    (`dollars`, `avgBid` and `valuePer100` are gone, not deprecated). Leaving a
    mixed-scale total on the object is what put one on screen for three
    seasons; a test pins their absence, and pins that no `budgetPct` comes back
    either.
  - A season with no `waiver_budget` falls back to **100**, matching
    `leagueState.js`'s own `?? 100`. Absence of a budget is not evidence of a
    scale.
  - The UI reads **"Budgets Used · 1.7×"** and **"Value / Full Budget"**. Over
    1× is normal and correct — it is a multi-season total across two budgets a
    year, and the sheet header states the seasons covered directly above it.
  - See `docs/analysis/faab-bid-corpus-2026-08.md`, which works in percent of
    budget throughout for exactly this reason.
- **Rookie draft grades:** every rookie pick scored as slot vs the player's
  current-value rank within that draft class (delta ≥ +5 = Steal, ≤ −5 =
  Reach; value ≥ 1000 today = "hit"). Startup drafts (> 6 rounds) excluded.
- **Head-to-head:** per-opponent trade count + my cumulative net vs them.

**UI (League › Managers):**

- **My Report Card** pinned on top: trade record / net value / rookie hits /
  FAAB efficiency stat grid, then generated **"Your Edge"** (green) and
  **"Work On"** (amber) coaching bullets from league-relative ranks.
- **Scouting report cards** for all 9 opponents, sorted by trade activity:
  activity label, record + net, tendency chips, head-to-head line.
- Tap any card (or the report card's ledger button) → **scouting bottom
  sheet** (`ManagerScoutingSheet`): stat grid, tendencies, head-to-head,
  full rookie draft record with steal/reach badges, and the complete
  multi-season trade ledger (paginated, player names open the
  PlayerProfileDrawer, picks show what they became). Each ledger card
  groups assets by receiving team ("X got · total" sections, one per
  partner in multi-team trades). Assets the manager re-traded in a later
  deal carry an "↪ flipped" marker — the value washes out across the two
  trades, leaving only the true profit/loss on the flip in the cumulative
  net. Zero-value assets (FAAB, unranked players, unpriced 3rd/4th picks)
  display `—`, never a raw 0.
- **Trade Partner Finder integration:** each partner card gets a one-line
  behavioral read ("6 trades · 4W-1L · +2,140 · Accumulates picks", or
  "Hasn't completed a trade — cold call"). Best-effort — renders only once
  the lazy history fetch lands.

**Trade-time value archive (best-effort second lens):**
`scripts/snapshot-trade-values.mjs` runs in the same daily workflow as the
values snapshot and permanently records asset values for any trade completed
in the last 8 days into `trade-values.json` on the `values-history` branch
(never pruned, never overwritten — trades are immutable). If the script
fails, the publish step carries the previous archive forward from the branch
via git, and aborts the publish rather than push without it, so a bad run
can't erase it. The app loads it lazily via `useTradeTimeValues` (whose "is
this entry complete?" rule is `tradeTimeTotals` in `utils/managerAnalysis.js`,
shared with the MCP server's `scout_managers`); when a ledger
trade has a complete archive entry, the scouting sheet shows an
"At trade time: got X ⇄ gave Y" line under the hindsight numbers. Missing
file/entries ⇒ the line simply hides — never an error or loading state.

-----

### Feature 12 — The Edge (home screen / daily briefing)

**Purpose:** the assistant-GM landing page — "what happened since I last
looked, and is there a move to make?" Synthesizes everything the app already
caches into one prioritized, tappable morning briefing. **This is the app's
default route** (`/` → `/edge`), useful in season and offseason alike.

**Zero new data sources.** Everything composes existing session caches:
league/FantasyCalc (LeagueContext), transactions (`useTransactions`), the
news feed (`useLeagueNews`, same aggregated feed as the profile drawer),
value history (`useValueHistory`), and draft sync (`useSleeperDraft`). Pure
logic lives in `utils/edgeBriefing.js`.

**Sections (top to bottom, staggered `edge-rise` entrance animation):**

- **Hero (red score-bug):** a `.bug-red` cap bar (team name · "Franchise
  Report", short dateline) over the dark hero panel: time-of-day greeting, a
  generated assistant-GM summary line ("2 items on your desk · 3 new league
  moves"), team value in white mono with a 30-day trend (sum of player
  `trend30Day`, % vs baseline) and a team-value sparkline (per-player history
  rows summed with last-known-value carry-forward — best-effort, hides
  without history). A divider-separated stat strip closes it: value rank
  (medal gold in top 3), record (when it exists), win-window tier, FAAB.
  Value taps to My Roster; rank/window cells tap to League.
- **Action Items:** the shared `RosterActionItems` component, reused as-is
  (dismissals included).
- **Roster Analysis shortcut:** a `NavRow` opening the same
  `RosterAnalysisSheet` as My Roster — surfaced here so the age-curve /
  win-window tool is discoverable from the home screen.
- **Your Briefing:** up to 5 prioritized items from `buildBriefing`, each a
  **`Lede`** — eyebrow, a display headline with the finding in a `Mark`, prose,
  and a solid ink CTA. Each was a tinted lucide medallion beside a title and a
  one-liner, which is **two of the twelve slop markers in one component**
  ("lucide icons throughout" and "identical cards in the icon + title +
  one-line-description pattern"). The eyebrow does the medallion's job better
  because it can *say* the thing: a downward arrow gestures at "something fell";
  "Buy low" is the instruction. Items carry two optional presentational fields
  for this, `mark` (the substring of `title` to reverse out) and `cta` — they
  live in `edgeBriefing.js` for the same reason `icon` and `tone` always have,
  that only the builder knows which fact each item turned on. `markedHeadline`
  degrades to a plain headline when a `mark` no longer occurs in its title, so
  copy can change without breaking one. Each item still
  deep-links somewhere: live/paused rookie draft → Tracker; trade deadline
  ≤ 2 weeks → Trade; `pre_draft` rookie draft → Board; N league moves since
  last visit → Activity; best buy-low (falling player at my deficit position,
  rebuilding-owner note) → Analyzer pre-filled as a What's Fair target; best
  sell-high (my riser at a surplus position) → Analyzer pre-loaded in You
  Give; biggest watchlist mover → profile drawer; biggest underperforming
  opponent (record rank trails value rank by ≥ 4, same gap as League
  Overview) → their roster drill-down; **closing-window opponent** (the most
  valuable team whose Dynasty Trajectory is declining — likely to move win-now
  talent) → their `/league/trajectory/:rosterId`; playoff-odds standing
  (in-season, "N% · Buyer/Seller" from `usePlayoffOdds`) → League › Playoffs.
- **Headlines:** news-feed items matched to my roster + watchlist players
  (≤ 5), "New" badge when published after the last visit; tap opens the
  player's profile drawer. Hides entirely when nothing matches — never an
  error (standard news contract).
- **Market Radar:** the primary daily entry point into League › Movers.
  Watchlist movers + my roster's movers (> ±50 trend) lead, deduped, then the
  list **backfills with my roster's biggest remaining movers** (any non-zero
  trend) up to ≤ 6 rows — so the section stays useful even with a thin
  watchlist. Rows carry sparklines; tap → profile drawer; prominent footer
  link to League › Movers. Empty state (no roster movement at all) hints at
  starring players.
- **Around the League:** compact one-line transaction summaries — moves since
  the last visit, or the latest 3 — with "You"/"New" badges; everything links
  to League › Activity.
- **League pulse footer:** the three tier-count chips; tapping one writes
  `dynastyedge_league_tier` and opens League Overview pre-filtered.

**Last-visit model (`useLastVisit`):** localStorage key
`dynastyedge_edge_last_visit`. The previous timestamp is read once per
session (stable all session, so navigating away and back doesn't clear the
diff) and the stored value is bumped to now on that first read. First-ever
visit ⇒ no "New" badges, activity shows the latest moves instead.

-----

### Feature 13 — Pick Trade Calculator (Trade › Pick Trades)

> **Location:** lives under **Trade › Pick Trades** (`/trade/pick-trades`) — it
> builds a trade, so it belongs with the trade tools. `/draft/trades` redirects
> here. The component file remains in `src/components/draft/`
> (`PickTradeCalculator.jsx`) — route-only move.


**Purpose:** "What does it cost to move up — and what should moving down
bring back?" Rookie-draft pick-swap planning for the weeks before and during
the draft. Zero new data sources: composes LeagueContext (rosters, pick
ownership, FantasyCalc pick entries) with `useSleeperDraft`'s draft order.
Pure logic lives in `utils/pickTrades.js`.

**Discoverability:** the Trade Partners view carries a footer button —
"Planning a pick swap? Open the Pick Trade Calculator →" — that deep-links
here (a sibling Trade sub-tab), so the planner is reachable from the start of
the trade workflow, not just its own tab.

**It plans the NEXT draft, always.** The season it trades in is `pickYears[0]`
— the upcoming rookie draft — not whichever draft `useSleeperDraft` has on
screen, which after a completed draft is last season's (kept there for the
Tracker's recap). It also **refuses to borrow a draft board from another
season**: a board prices slots only for its own draft, so applying the finished
one's order to next year's picks would stamp the wrong slots on them. Round
medians are the honest price until Sleeper sets the new order, and the in-page
note says so.

**Slot-level pricing:** FantasyCalc lists exact-slot picks as "2026 Pick 1.09"
(round.slot, zero-padded) once a draft season's order is known — the old
Early/Mid/Late tier naming was dropped in 2026-07. Picks arrive already
resolved to their exact slot by `useLeague` (from the draft order —
`slot_to_roster_id` once Sleeper builds the board, else `draft_order` in
`pre_draft`, so slots are known a month early) and priced at their exact-slot
value (`findExactSlotValue`). `buildPickMarket` reads that enrichment directly,
falling back to a live draft board (`buildDraftOrder`) when one exists so
in-draft pick trades are honored. When no order exists at all, picks fall back
to round-level medians (`findPickValue`) with a note that prices upgrade
automatically. A price-board card shows each round's reference (round-median)
price on top; the exact per-slot price lives on each pick row.

**Move Up:** every opponent-owned pick of the draft season in draft order;
tap one → up to 3 suggested packages from my pick inventory (this season's
picks at slot prices + future-year picks at medians). Packages are 1–3
picks, each strictly worth less than the target (equal value = a swap, not
a move), totaling 80–145% of the target; undershoot is penalized 1.6× over
overshoot (sellers don't take light offers; buyers may pay a premium).

**Move Down:** my picks; tap one → the best return package from each
opponent's inventory (top 4 partners by closeness).

**Analyzer handoff:** every package has a "Build →" button →
`navigate('/trade/analyze', { state: { preloadTrade: { opponentRosterId,
give, get } } })`. Assets are the owner's actual roster pick objects (same
id as the add sheet, so toggles dedupe) but priced at slot precision and
carrying `slotLabel`, so the Analyzer's totals match the calculator's math
and the builder displays "'26 1.02". `preloadTrade` joins the Analyzer's
nav-state inputs (takes priority over the sessionStorage draft, like the
others). Picks added later via the add sheet use round-median values —
mixed precision is accepted.

**Empty states:** no package reaches fair value → one-line hint ("add a
player in the Analyzer to bridge the gap") — never silently empty.

-----

### Feature 14 — Playoff Odds (League › Playoffs)

**Purpose:** "Am I making the playoffs, and should I be buying or selling?"
A rest-of-season Monte Carlo simulation turned into one plain-English page.
Built to be correct and self-explanatory for someone who's never used playoff
odds before — every number is defined on the page, no outside lookup needed.

**One new data source, lazy + session-cached (`usePlayoffOdds`):** the only
fetch is every regular-season week's matchups (weeks 1 … `playoff_week_start − 1`
from league settings, in parallel) via the **shared matchup-weeks cache**
(`src/hooks/matchupWeeks.js`) — one session-cached fetch per week, shared
with the Season Review's lineup history so visiting both features never
refetches the overlapping weeks. A failed week degrades to empty entries
(the per-week `.catch(() => [])` contract), but when **every** requested week
fails the load rejects, so the Playoffs page shows `ErrorState` + retry
instead of masquerading as preseason during a total outage (retry clears the
shared cache and refetches). That single pass
yields *both* the remaining schedule (future pairings, grouped by `matchup_id`)
*and* every completed week's actual per-team score — no separate history call.
A week counts as **complete** only when *every* team in it has scored, so a
partially-played current week is simulated fresh instead of contaminating the
model. The fetch waits until league settings / NFL state have loaded (The Edge
mounts the hook before they exist) — otherwise it would guess the week range
from the default `playoff_week_start` instead of the league's real setting. Everything else (rosters, records, points-for, FantasyCalc values,
win-window tiers) comes from `LeagueContext`. The **derived results (model +
sim) are memoized at module scope** too, keyed by the schedule and league
references, so the four odds consumers (The Edge, Trade Analyzer, Partner
Finder, the Playoffs page) share one ~50–200 ms simulation per data load
instead of each re-running it on mount; only the cheap `myOdds` lookup stays
per-instance.

**The model + sim (`utils/playoffOdds.js`, pure):**

- **Scoring model (`buildScoringModel`):** each team's weekly score is
  `Normal(mean, std)`. The mean is a shrinkage blend (4-game pseudo-count) of
  a **roster-strength prior** — the team's best-lineup FantasyCalc value mapped
  onto a points scale around a league baseline — and its **actual** completed-week
  scores. Early-season the prior dominates; as games pile up the empirical mean
  (and, at ≥3 games, empirical std) takes over. This is the "seeded from
  projections early, real data later" behavior.
- **Monte Carlo (`simulatePlayoffs`):** plays the remaining schedule out 10,000
  times with a **fixed-seed RNG** (mulberry32 + Box–Muller) so the page never
  reshuffles its numbers across renders. Each iteration draws scores, decides
  the real matchups, accumulates wins + points-for on top of current standings,
  seeds the field by Sleeper's default tiebreaker (wins, then points-for), and
  records who lands in the top `playoff_teams`. Returns per team: playoff %,
  #1-seed %, average seed, full seed distribution, and projected final record.
- **`getDeadlineVerdict(playoffPct, tier)`** → Buyer / On the bubble / Seller
  with a one-sentence rationale. Exported for the planned Trade/Edge reuse.
- **`buildStrengthPreview`** → the preseason fallback: projected seeding ranked
  purely by roster strength (clearly labelled a preview, not odds).

**Three page states (`PlayoffOdds.jsx`):**

- **Preseason** (no games *and* no posted schedule — the deep-offseason case):
  a clear "odds activate when the Week 1 schedule posts" hero plus the
  strength-ranked projected seeding preview.
- **Active** (games remain): my-team hero (big playoff %, projected record,
  projected seed, Buyer/Seller verdict chip in the red score-bug treatment),
  a basis line ("Based on N completed weeks + M remaining games"), then every
  team ranked by playoff % with a likelihood-colored odds bar, projected
  record, average seed, and win-window badge.
- **Complete** (all weeks played, none remaining): same layout, deterministic
  100%/0% odds, with a "regular season complete" note.

**Always explained:** a collapsible **"How this works"** panel defines playoff
odds, seed, projected record, the early-season strength lean, and Buyer/Seller
in plain language — plus inline one-liners under the key numbers. Standard
loading / `ErrorState` + retry; mobile-first at 390px.

**Odds consumers (wired via `getDeadlineVerdict` + `usePlayoffOdds`):**

- **Trade Analyzer Layer 3** (`analyzeTrade` takes an optional `myPlayoffPct`):
  the odds **SCORE** the Win Window layer in season — they are not a line
  printed under a tier read any more (2026-09-07, see Feature 3 Layer 3 for the
  measurement). `getDeadlineVerdict`'s stance selects the buyer/seller branch;
  the win-window tier is the offseason fallback and rides along as context.
  This is the only consumer where the odds affect a **score** rather than
  display — everywhere else they describe.
- **Trade Partner Finder:** each opponent card flags a likely **seller**
  (< 35% odds) or **buyer** (≥ 70% odds) from their live odds.
- **The Edge:** a "Playoff odds: N% · stance" briefing item (Trophy icon) deep-
  links to League › Playoffs.

All three read `usePlayoffOdds`'s `oddsByRoster` / `myOdds` and **degrade
silently in the offseason** (no odds yet → the flag/item simply doesn't render,
and Layer 3 falls back to the tier-only read).

**Baseline caveat, unaddressed:** this league seats **6 of 10** teams in the
playoffs, so 60% is the coin-flip baseline and the ≥70% Buyer threshold sits
only modestly above it — measured at 2026 Week 1, five teams bunched between
76% and 88%. The thresholds separate the top and bottom of the league cleanly
and compress the middle. Recalibrating them relative to
`playoff_teams / numTeams` is a real option but would move three surfaces at
once and has not been measured; do not change them casually.

-----

### Feature 15 — News (top-level drawer section)

**Purpose:** a browsable, filterable view of the **entire** aggregated news
feed — the "show me everything" companion to the per-player news in the
Profile drawer and the roster-scoped Headlines slice on The Edge. Its own
top-level drawer section (`/news`, violet identity), single view (no
sub-tabs).

**Zero new data sources.** It reads the same once-per-session aggregated feed
(`loadNewsFeed` → the `news-data` branch's `news.json`, up to ~1,280 items
since the player cap went to 1200) used everywhere else — see the Player news
pipeline. **The page renders 50 rows at a time with a "Show more"**, the same
pattern as League › Activity; each date band's count is the full bucket, not
the rendered slice, so paging never understates how much news there is.

**`useNewsFeed` hook:** returns `{ items, loading }` — the *full* feed
(newest-first), each item enriched with the best-matched FantasyCalc-ranked
player (so a tap opens that player's profile) and an `isMine` flag. Matching
builds two memoized indices from `values.playerMap` + `playerDB`:
`espn_id → player` (primary, via the item's `athleteIds`) and a
normalized-full-name → player fallback (sorted longest-first so a more
specific name wins). Unlike `useLeagueNews` — which filters to a player set
and drops the rest — this keeps unmatched general NFL items too (shown with
an "NFL" tag). Same best-effort contract: any failure yields `[]`.

**`NewsView` page:**
- Search box (headline text + player name) + `All / My Players / Watchlist`
  filter chips (My Players = roster ∪ watchlist; Watchlist = watchlisted
  players only).
- Light date grouping (Today / Yesterday / Earlier); rows show source · time,
  the matched player + position color (or "NFL"), a "You" chip for my-roster
  items, the headline, and a 2-line story snippet.
- Tap a row → `NewsArticleSheet` (reused); its "View profile" →
  `PlayerProfileDrawer` (reused).
- **States:** standard loading spinner; a friendly empty state ("No news
  right now") when the feed is empty/unreachable, or "No stories match your
  filter" when filtered to nothing — never an error or retry-loop (a full
  page can't silently hide like the inline news surfaces do).

**The Edge integration:** the Headlines section gains an "All headlines →"
footer link to `/news` (same treatment as "All market movers →").

-----

### Feature 16 — Global Player & Feature Search

**Purpose:** find any player — or any section/feature — from anywhere in the
app and jump straight to it, without first navigating to the section that
happens to list it. The single global accelerant for a feature-dense app.

- **Entry point:** a search icon in the **fixed app header** (top-right, every
  screen) — always visible, so it works within the side-drawer paradigm
  without a bottom nav. Lives in `App.jsx`'s `AppShell`.
- **`PlayerSearchSheet`** (`components/shared/`): a standard bottom sheet
  (`useScrollLock` + `useSheetDrag` + `overscroll-contain` + safe-area
  bottom pad, same contract as every sheet). Auto-focuses the input on open.
- **Zero new data sources.** Searches the cached FantasyCalc dataset
  (`values.playerMap` from `LeagueContext`) by normalized name (≥ 2 chars),
  ranked by `overallRank`, capped at 40 results. Each row shows name · team ·
  position (identity color) · value · trend arrow.
- **Feature jump (`DESTINATIONS`):** the same query is matched against a static
  list of every navigable section/feature by recognizable name (label +
  section, so typing "league" surfaces its views) — **names only, no
  verb/keyword synonym map yet**. Matches render in a **"Jump to"** group
  *above* the player results (capped at 8), each with a section-colored dot and
  its section name; tap → `navigate(to)` + close. When both groups have
  results a "Players" subheading separates them.
- **Tap a player result → `PlayerProfileDrawer`**, rendered by the sheet itself
  at the same `z-50` *after* the results in the DOM, so it paints on top (the
  same stacking trick The Edge uses for its drawer + article sheet). Closing the
  profile returns to the search results. Nested scroll-locks unwind correctly
  via `useScrollLock`'s save/restore of the previous value.
- Picks (named like "2026 1st" / "2026 Pick 1.09", with a non-numeric
  `sleeperId`) aren't in `playerMap`, so player search covers players only —
  by design.

-----

### Feature 17 — Dynasty Trajectory (Squad › Trajectory)

**Purpose:** the app's one forward-looking lens. Everything else is a snapshot
of *now* (current values, current odds, *historical* trade grades); a dynasty
is a multi-*year* horizon. Trajectory turns a roster from a value snapshot into
a value curve over the next few seasons and answers the core dynasty question:
**"when does my window peak — am I a buy-now or a build team?"** Works in season
and offseason alike. **Zero new data sources** — pure logic over caches
`LeagueContext` already holds.

**Location:** a **Squad view** (My Roster · Lineup · Season Review ·
**Trajectory**, `/my-team/trajectory`), and **roster-agnostic** — `RosterView`
carries a "Dynasty Trajectory →" card **on both seats**: my own roster opens
`/my-team/trajectory`, a drill-down (`:rosterId`) opens
`/league/trajectory/:rosterId`, so you can scout an opponent's window ("this
contender's value slams shut after 2026 — they'll sell"). The card used to be
gated on the drill-down, which left **my own** trajectory with no inbound link
anywhere in the app (fixed 2026-09-11, DESIGN-3) — "is this roster aging out?"
is the obvious next question from the roster you are looking at, and nothing on
the screen answered it.

**Consumers (all via `getTrajectoryRead`, zero extra fetch):**
- **Trade Partner Finder:** each opponent card carries a one-line trajectory
  read — "Value slides through {year} — selling vets" / "Value climbing toward
  {year} — building" / "Value holds near {year} — balanced window". Distinct
  from the this-season playoff-odds buyer/seller flag.
- **Trade Analyzer Layer 3** (`analyzeTrade`'s optional `opponentTrajectoryRead`):
  when acquiring the partner's players, a declining team reads as a buy window,
  an ascending one as a caution (see Feature 3).
- **The Edge:** a "closing-window opponent" briefing item — the most valuable
  team whose trajectory is declining — deep-links to their
  `/league/trajectory/:rosterId` (see Feature 12).

**The model (`utils/dynastyTrajectory.js`, pure):**

- **Market age curve per position (`buildAgeCurves`)** — for each position,
  learn what the dynasty market pays at every age *straight from today's
  FantasyCalc pool*: a Gaussian-kernel-smoothed (bandwidth 2.5y) weighted
  *median* of value by age, blended toward a `peakWindows.js`-shaped prior
  (pseudo-count 3) so thin age bins stay sane. No hardcoded decay rates — it
  recalibrates every load as the market moves, matching the "never hardcode
  values" rule. (The pseudo-count was 4 before 2026-07; lowered to 3 because the
  well-sampled 21–31 core over-weighted the shape prior and inflated the young-QB
  curve, flattening its real ascent — the thin 35+ tails still lean
  majority-prior. See `docs/analysis/trajectory-calibration-2026-07.md`, P3.)
  - **The curve is a CROSS-SECTION, so it must never feed a score, a ranking,
    or a recommendation** — it is descriptive shape only, which is all this
    feature and its `getTrajectoryRead` consumers use it for. Measured
    2026-09-06: the only 33-year-old TE still carrying value is the one who
    didn't decline, so the curve reads survivorship as aging (TE 31 = 641 vs
    TE 33 = 1,020; QB 25–26 = 790 vs QB 30–31 = 2,255). Fed into a keep-score
    tilt it projected a 31-year-old Mark Andrews **+47%** and a 26-year-old Bo
    Nix **+64%** (the latter just the `YEAR_RATIO_CEIL ** 3` clamp) — which is
    why the shipped aging signal is the longitudinal one in
    `docs/analysis/asset-aging-and-pick-value-2026-09.md` §2, not this. The
    real fix is curves rebuilt from `values-archive.json` once it holds enough
    months; until then this ruling stands.
- **Projection** — a player's value `n` seasons out is
  `currentValue × curve(age + n) / curve(age)`, clamped per year (0.55×–1.18×).
  The talent residual cancels, so a stud and a scrub ride the same proportional
  curve; a 27-yo RB sheds value faster than a 24-yo WR. Unranked / no-age
  players hold flat (we never invent a curve the market hasn't priced) and
  contribute 0, same contract as everywhere.
- **Picks mature into rookies** — a pick holds at its current FantasyCalc value
  until its draft year, then converts to a rookie-aged (22) young asset that
  ages on a generic cross-position blended curve. So a 2027 first starts paying
  into the +1/+2 outlook.
- `buildRosterTrajectory` sums player + pick projections into a
  current→+1→+2→+3 team series plus per-position sub-series.
  `getTrajectoryVerdict` and `getTrajectoryRead` read the **net 3-yr change** of
  that team total into a plain-English window call: **declining** (net change
  < −1% → "selling vets"), **ascending** (net change > +5% → "building"), else
  **balanced**. The cuts are keyed to how a *roster total* behaves, not a single
  player: aging decliners and pre-peak risers largely cancel in the sum and
  every pick matures upward, so real 3-yr team totals compress into a narrow,
  slightly-positive band (~−2% … +10% on this league). Hence the asymmetry
  (−1% vs +5%) — pick maturation lifts every roster ~+2–3%, so a *net-negative*
  total is a stronger aging signal than an equal-magnitude gain — and hence the
  classification is on **net** change, not on when the interim peak lands (pick
  maturation routinely pushes the peak to +1/+2 even for an eroding roster, so
  an earlier "peak-is-now" gate left "selling vets" unable to fire). The
  per-player and per-position tags use `seriesDirection` (symmetric ±5%,
  unchanged — a single player's curve swings far more than a whole roster's) and
  `peakStatusShort`.

**UI (`components/roster/TrajectoryView.jsx`):**
- **Window verdict** — a `Lede`: "Window peaks {year}" as the eyebrow, then
  "Value *climbing* / *sliding* / *holding* through {year}" with the direction
  `Mark`ed, then the one-sentence buy/hold/sell read. It was a card with a 3px
  tone-coloured rail down its left edge — the banned rail, which survived step
  4's sweeps because it was a raw `border-l-[3px]` rather than `Card`'s deleted
  `accent` prop (see the Design System status block; audit for the shape, not
  the API).
- **Forward value chart** — inline SVG line of the team's current→+3 value with
  a gradient area fill, peak year ringed + labeled, and a dashed
  **league-average** line for context (built across all rosters).
- **Stat cards:** value now, projected final year, peak season, 3-yr change %.
- **By Position** rows: each position's now→+3 with a `Sparkline`, Rising /
  Holding / Falling tag, and delta %.
- **Player Projections** table: now→+3 per player with a sparkline, delta %, and
  peak-window status; tap → `PlayerProfileDrawer`.
- Collapsible **"How this works"** — states plainly it's a model/estimate, not a
  forecast (can't know breakouts, injuries, trades) — read the *shape*.
- Mobile-first at 390px; standard loading / `ErrorState` + retry.

-----

### Feature 18 — Sign-in & Identity

**Purpose:** answer "which team am I?" at runtime instead of at build time, so
the app is no longer hardcoded to roster 6. Gates the entire app — nothing
renders until an identity is set.

**Zero new data sources.** Sign-in reads `useLeague`'s Sleeper-only
`signInRosters` (rosters + owners), plus one `/user/{username}` lookup on
submit. **Never gate sign-in on FantasyCalc** — a FantasyCalc outage must not
be able to lock the owner out of his own app (rule 4).

**"Login" is read-only identity resolution** against a public Sleeper
endpoint — no password, no token, no OAuth; it never touches the user's Sleeper
account.

**`LoginScreen`** (`components/auth/`): enter a Sleeper username → resolve to a
`user_id` → match it against this league's rosters. Two failure messages, both
recoverable rather than dead ends — unknown username ("Check the spelling or
pick your team below") and valid-but-not-in-this-league ("Pick your team
below") — because the **tap-to-pick team list is always shown as a fallback**.
The screen owns its own full-viewport scroller (the document body never
scrolls, so it would otherwise clip below the fold) and carries the
`.login-bg` sweep.

**`useIdentity`** (hook): a tiny `useSyncExternalStore` store (same pattern as
`useWatchlist`) so the App gate and the side drawer re-render together the
moment identity is set or cleared. Persisted in `dynastyedge_identity_v1` as
`{ userId, rosterId }`; a stored value is only valid with a **numeric
`rosterId`** — that's the join key every "is this me?" check uses — and
anything else reads as logged-out. Storage failures degrade to an in-memory
identity rather than crashing.

**Switching identity wipes roster-scoped state.** `setIdentity` and
`clearIdentity` both clear `dynastyedge_action_dismissals` (localStorage) and
`dynastyedge_trade_draft` (sessionStorage), so a teammate signing in on the
same device never inherits dismissed action items or a half-built trade.
League-wide caches (transactions, history, draft) are **not** roster-specific
and are deliberately left alone.

**Sign out / Switch team** lives at the bottom of the side drawer.

`MY_ROSTER_ID` / `MY_USERNAME` / `MY_TEAM_NAME` in `constants.js` remain only
as the league's original-owner reference — nothing reads them as the source of
truth. Use `myRosterId` from `LeagueContext` / `useIdentity`.

-----

### Feature 19 — Rookie Research (Draft › Research)

**Purpose:** "which rookies become something?" — the question a dynasty
*value* number can't answer, because value prices consensus, not opportunity.
Sits between the Board (what do I think?) and the Tracker (what's happening
now?) as the **Research** sub-tab (`/draft/research`).

**One new data source** — the rookie intel feed above; everything else
composes `LeagueContext` and the existing `useRookieADP` rookie class.

**The model (`utils/rookieResearch.js`, pure):** an **opportunity score**
(0–100 on screen, 0–1 internally) blending **30% depth-chart standing / 70%
NFL draft capital**. Calibrated in
`docs/analysis/rookie-research-signals-2026-08.md` against **n=396 drafted
skill rookies, 2021–2025** (`node scripts/dev/rookie-signal-backtest.mjs`,
which **imports the shipped constants** so the analysis and the app cannot
drift):

- Draft capital alone rho **+0.598**, depth rank alone **+0.541**, blended
  **+0.664**. The blend curve is flat from w=0.2–0.5, so `DEPTH_WEIGHT` is not
  knife-edge and needs no annual re-tuning.
- `DEPTH_VALUE` is the measured median rookie-season half-PPR by position ×
  depth rank — observed medians, not hand-tuned weights. **Re-derive them from
  the back-test rather than nudging by feel**; the script prints a drift check.
- **All depth scores share ONE points scale** (`DEPTH_MAX`, the largest cell).
  Scaling per-position was tried and is wrong: it made a TE2 (41 median pts)
  score 0.40 while a WR2 (43 — the same outcome) scored 0.28, which put five
  backup tight ends in the top six of the undervalued list.
- Off the depth chart folds into the rank-4+ bucket — for a rookie, "not
  listed" and "listed fourth" are the same fact.
- Undrafted floors at `UDFA_SCORE` rather than 0, so a rank-1 UDFA still
  outranks a buried day-three pick.

**Market vs Model** is the product: market rank (FantasyCalc value) against
model rank, **computed WITHIN POSITION**. Cross-position ranking is not a fair
comparison — a FantasyCalc value already prices Superflex QB scarcity and the
shallow TE pool, while the model prices expected points, so comparing the two
orderings across positions measures the difference between *yardsticks* and
flags every tight end as undervalued. Default `minGap` is 5, tuned to
within-position group sizes (~8–30 players).

**Camp movement is shown, not scored** — a rookie's depth-chart climb since
March is computable for the current class but **could not be back-tested**
(nflverse's 2025 depth charts begin 2025-08-03, so the historical window has
no pre-camp baseline). Display it; don't let it move the score until a season
of it exists.

**Age at draft and combine athleticism are shown, not scored either — and here
the reason is a measured null, not missing evidence.** Tested over n=866
drafted skill rookies (2013–2023) against years 2–3 production in
`docs/analysis/rookie-longterm-signals-2026-09.md`
(`node scripts/dev/rookie-longterm-backtest.mjs`, which imports the shipped
constants so it cannot drift): athleticism buys **+0.002** held-out Spearman;
a long-term score built on age and athleticism correlates **0.934** with the
shipped opportunity score, *loses* to it at predicting years 2–3 (+0.602 vs
+0.632), and the "low impact now / high upside later" quadrant that a two-axis
UI would exist to surface held **0 rookies across nine real classes**. So
**there is no second axis and Draft › Research keeps one score.**
`COMBINE_BASELINE` is a display baseline only — never a score input.
`AGE_BASELINE` is the exception: it feeds the age tilt below.

**The age tilt — the one thing Phase 3 shipped into a score.** The board number
is `dynastyOpportunityScore`: the back-tested year-1 `opportunityScore`, tilted
**10% toward youth measured within position** (a 22-year-old QB is normal, a
22-year-old WR is not). Measured over n=712 drafted skill rookies, classes
2015–2023, with 2015–2020 entirely outside the window the year-1 core was
calibrated on:

|                | per-class delta at w=0.10 | t | classes improved |
|----------------|---------------------------|---|------------------|
| vs **years 2+3** | **+0.0183** | **+3.35** | **8 of 9** |
| vs year 1        | −0.0023 | −0.37 | 4 of 9 |

Clearly better at the three-year question, no measurable cost at year 1.
Three contracts hold it together, all pinned by tests:

1. **`opportunityScore` still means exactly what it always meant** — the
   year-1 core `scripts/dev/rookie-signal-backtest.mjs` grades at rho +0.664.
   The tilt is a separate function layered on top; the old back-test stays
   valid.
2. **An unknown age is a no-op, not an imputed average.** The shipped form is
   written re-centred (`base + 0.0278·z`) rather than as the measured blend
   (`0.9·base + 0.1·(0.5+0.25z)`). The two are a positive affine transform of
   each other and **rank rookies identically** — the back-test asserts it live
   at Spearman **0.999946**, and the only residual is the 0–1 clamp saturating.
   Re-centring matters because only **78 of the 237** published 2026 rookies
   carry an age and the rest are almost all undrafted: the blended form would
   pull them toward 0.5 and more than double a buried UDFA's score.
3. **It is a tilt, not a second axis.** The two-axis rookie UI was tested twice
   and rejected twice (below). A tilted board correlates 0.971 with the
   untilted one on the back-test frame — showing both would be showing the same
   list twice.

Live behaviour on the 2026 class: score changes are small (max 8 points of 100,
median 0), and among **drafted** rookies — the population the tilt was
validated on — the board moves at Spearman 0.946, median 5 spots. Whole-board
rank movement looks far larger, but that is a ties artifact and not signal: 172
of 237 rookies share just 26 distinct scores under 6/100, so a sub-point change
vaults past dozens of players who all read "thin opportunity" anyway.

**College production was tested too, and it is also a null.** With the owner's
`CFBD_API_KEY` in place, dominator rating and breakout age were back-tested in
`docs/analysis/rookie-college-production-2026-09.md`
(Actions → *Snapshot rookie intel* → `mode: college-backtest`, run 33931139020).
Dominator is genuinely **orthogonal to draft capital** (r = +0.05…+0.09, against
age's +0.36) and it does produce a materially different ranking (0.725 vs the
shipped score, where age managed only 0.934) — but being different is not being
better: the long-term score built on it predicts years 2–3 **worse than the
shipped score and worse than draft capital alone** (+0.543 vs +0.608 vs +0.576),
it adds only +0.011 at t = 1.71 on top of the shipped score, and the two-axis
"taxi stash" quadrant holds 6 of 391. **So Draft › Research keeps one score, the
app calls no college endpoint, and the two-axis question is closed.** Note the
frame: CFBD's `playerId` is only ESPN-aligned from college season ~2015, so only
draft classes 2019+ are usable (n = 391) — the memo's §2 carries that cliff.

**Roster fit (`buildTeamFit` / `topTargets`)** answers the second question — the
model above is league-agnostic ("which rookies become something?"), this is
"which of them should *I* take?". It is a **re-ranking over the back-tested
score, never a change to it**: `fit` blends the opportunity score with the
market price (`FIT_MARKET_WEIGHT` 0.45 — opportunity alone leads the board with
a well-placed day-three flier over a consensus 1.01, a fine *divergence*
finding and a bad *draft plan*), then adds bonuses for a position I'm below
league average at (`FIT_NEED_BONUS`), a ≥5-spot model-over-market gap, and a
win-window lean (a contender wants a rookie already listed first; a rebuilder
can let top-64 capital develop). Deficits come from `getDeficitPositions` and
the tier from `getWinWindowTier`, so "you need a TE" means exactly what it
means in Free Agents and the Trade Analyzer. An **unscored rookie gets
`fit: null` and never appears as a target** — same contract as the score:
absence of feed data is not evidence of a bad fit — but `fitsNeed` still marks
his position, so the need badge survives the degraded state.

**UI (`components/draft/RookieResearchView.jsx`):** an always-visible
"Scout the rookie class" explainer (what an opportunity score is, plus the
three-step read order — this page shipped without one and was unusable),
**Your Targets** (the roster-fit shortlist, stating my deficits and win window
in plain English, with per-card fit reasons), the Market vs Model divergence
cards (corner-cut, tone edge bar, plain-English reasons plus a sentence
spelling out the rank gap), then an Opportunity Board with search, position
chips, a score legend, and a sort toggle (Best for me / Opportunity / Dynasty
value / Camp risers, default **Best for me**) with a line under it naming what
the active sort means. Rows show the score, a position-aware depth read
("Backup behind Kirk Cousins"), capital, alignment slot, a movement chip, and a
"Your need" badge; tap → `PlayerProfileDrawer`. Dynasty value sorts as the
tiebreaker, which is what keeps the board useful in the degraded state. A
collapsible "How this works" states the model, its back-test, that the fit
re-ranking is a judgement call rather than a back-tested one, and why preseason
stats are absent. Unranked rookies show `—` and are never dropped.

**The drawer carries the research read — everywhere a rookie is opened, not
just here.** The card used to render only when `RookieResearchView` passed its
`research` prop, so the same rookie opened from League › Free Agents, My
Roster, Movers, News, the Draft Board or global search showed nothing but
dynasty framing ("D — Deep Stash" on a rookie with a starting job). The
composition now lives in **`useRookieResearch`** (`hooks/`), which both this
page and `PlayerProfileDrawer` read, so the class is built once per data load
and there is no second copy to drift. Since 2026-09-22 the hook holds only the
**memo**: the composition is `buildRookieBoard` in `utils/rookieResearch.js`
(and the class rule `buildRookieMap` in `utils/rookieAdp.js`), which the MCP
server's `research_rookies` calls too — so there is no second copy there either. The drawer resolves its own row via
`useRookieResearchFor(sleeperId)`; an explicit `research` prop still wins, so
this page keeps handing over the exact row you tapped.
- **The intel fetch stays lazy at a second level.** `useRookieIntel(enabled)`
  doesn't load until a consumer will actually render a rookie — the drawer
  passes `false` until the player is in the `useSleeperRookies` map (read from
  the shared player DB cache, no extra request), so opening a veteran costs
  nothing.
- **Outside this page a rookie the feed has no entry for renders no card.**
  `useRookieResearchFor` returns null without a score: an empty "no draft
  record in the feed" card on every deep stash in the app is noise. Draft ›
  Research still shows that state, where the player is on screen because you
  tapped him on this board.

`PlayerProfileDrawer` renders the row as a **Rookie
Opportunity** card at the top of the sheet (score/100 + tier, depth read, NFL
capital, camp move, a **"Measurables · context, not scored"** block — age at
the draft read against his position, height/weight, and the combine drills each
banded within position — the score's reasons, the within-position
market-vs-model sentence, and the roster-fit reasons) — a value number alone doesn't answer
"is he going to play?", which is why the user opened the sheet. The row shape
therefore also carries `positionRank` and `age`, which the model itself does
not use: the drawer grades from `positionRank ?? 99`, so the first shipped
shape (which dropped both) stamped **every** rookie opened from this page
"D — Deep Stash" with no age, no position rank, and no peak-window line.

-----

### The recommendation engine (`utils/recommendations.js`)

**Purpose:** the assistant-GM "brain" — the one place that decides *how willing
we should be to part with each asset*, so every recommendation surface reasons
about the roster the same way. It is not a screen; it is shared pure logic.
**Zero new data sources** — composes caches `LeagueContext` already holds.

**The core idea — a keep score, not a value.** `assetKeepScore` returns 0
(very expendable) → 1 (untouchable core) for each of my assets, built from
`buildGivabilityContext` (my positional surpluses/deficits, my win-window
tier, and each player's depth rank within his position). The rules that
matter:

- **`CORE_DEPTH` = QB 2 · RB 3 · WR 3 · TE 1** — the starters protected
  hardest in this 10-team Superflex Half-PPR league (QB doubles up via the
  Superflex slot; 3 FLEX spots make RB/WR depth matter). Beyond that rank, a
  player decays toward expendable.
- **A deficit protects everyone at the position; a surplus only unlocks the
  depth pieces** (rank ≥ `CORE_DEPTH`). A surplus must *never* discount a core
  starter — one elite player (a top-1 TE with no backup) inflates the
  position's summed value and makes a thin spot read as deep. We don't trade
  the stud because he makes the bin look full.
- **Cliff protection:** my best at a position with a steep drop to the
  next-best is protected regardless of how the summed positional value reads.
  This is what keeps an elite, backup-less starter out of auto-suggested
  packages.
- **Picks are priced by ROUND, not flat (`PICK_ROUND_KEEP` = 1st 0.65 · 2nd
  0.50 · 3rd 0.40 · 4th 0.30).** The old flat 0.5 made a 2027 1st and a 2029
  4th equally spendable. Measured over all 120 rookie picks this league has
  made, valued at today's prices: a class's round-1 median beat the **dearest**
  future 1st on the board in **3 of 3** classes (30/30 became starter-caliber),
  while no class's round-4 median reached the **cheapest** future 4th (8/30).
  Hype flattens the pick curve and resolution steepens it — the market prices a
  1st at 3.5× a 4th; the most-resolved class delivered **8.0×**. An unknown
  round falls back to `PICK_KEEP_DEFAULT` (0.5) rather than the cheapest —
  absence of a round is not evidence a pick is cheap (rule 7's discipline).
  `PICK_KEEP_CAP` (0.85) holds every pick below `PROTECT_THRESHOLD` at every
  tier: that threshold exists for irreplaceable *players*, and a rebuilder's
  +0.3 on a first would otherwise strip the builder of the currency it builds
  with. Re-derive with `scripts/dev/asset-aging-backtest.mjs` (needs the diagnostics resolver hook); revisit
  once the 2027 class resolves. See
  `docs/analysis/asset-aging-and-pick-value-2026-09.md` §3.
- **Win-window lean on age:** a contender cashes picks and young fliers; a
  rebuilder hoards youth. These are *window* preferences (what do I want when
  my window opens), distinct from the aging tilt below.
- **Past-peak age tilt (`pastPeakTilt`)** — an asset past its
  `peakWindows.js` window gets more expendable, saturating `AGE_TILT_SPAN` (3)
  years past it. **Decline-only:** protecting players *younger* than their
  window was proposed and disconfirmed — absent at RB (−0.02, p=0.853), the
  position the tilt exists for, with one near-hit in four tests. **Weighted per
  position** (`AGE_TILT_BY_POSITION` = RB 1.00 · WR 0.65 · QB 0.40 · TE 0.15),
  because the penalty is: past-peak retention falls 0.94 → 0.66 for RB
  (p=0.0001) and 0.84 → 0.67 for WR (p=0.0016), while QB and TE are not
  distinguishable from zero and take their measured relative effect **halved**
  — unproven is not the same as known-small. Magnitude by tier
  (`AGE_TILT_BY_TIER` = Contending 0.04 · Middle 0.10 · Rebuilding 0.16) is the
  one knob no measurement sets: it is a preference weight, bounded so the tilt
  breaks near-ties rather than arguing with a market that already prices age.
  Being decline-only it can only ever make an asset **more** available — it can
  never protect one, so it cannot reach past `PROTECT_THRESHOLD` or undo cliff
  protection. An unknown age or a position with no window is a **no-op**, never
  an imputed average. This replaced a flat `age >= 28 → −0.2` that fired only
  for a rebuilder — 28 is two years past an RB's peak and mid-window for a QB,
  and a **Middle** team got no age opinion at all. Measured over n=762
  player-seasons (2020–2025) following the same player year over year, a
  departed player counted as 0; the peak windows themselves are **not**
  re-tuned (RB 26 and WR 28 both test significant at the shipped boundary). See
  `docs/analysis/asset-aging-and-pick-value-2026-09.md` §2.
- **`PROTECT_THRESHOLD` = 0.9** — assets at or above this keep score are never
  *auto-*included in a suggested package. The user can still add them manually.

**Consumers:**
- **Feature 1 / Feature 12 — Action Items:** `suggestSellMove` turns "you have
  a surplus" into the actual move, and its partner pick is **two-sided**. It
  used to take whichever opponent's positional delta was most negative and then
  hope a return existed on their roster — so the neediest team won the call even
  holding nothing I wanted, and the move degraded to a bare "shop him to X".
  Every opponent is now scored on three roster facts: do they need the position,
  would he actually **start** for them (`buildValueLineup` — a player who only
  stacks their bench is not a sale, however thin their summed value reads), and
  do they own a comparable-value player at one of **my** deficit positions. A
  partner with a real return beats a needier one without, because the two-sided
  move is the thing worth surfacing; it still falls back to the neediest team
  when nobody has a return. Returns nav-ready `preloadTrade` state for the
  Analyzer, plus `startsForThem`.
- **League › Free Agents (Feature 1) and The Edge's `pickup` briefing item
  (Feature 12):** `recommendFreeAgents` ranks available players by what they'd
  do for *my* roster — fill a deficit, beat my replacement level at the
  position (my `CORE_DEPTH`-th best), ride a rising trend, fit my win window —
  and returns only players that genuinely move the needle, each with reasons.
- **Feature 3 — Trade Analyzer:** `buildGivabilityContext`, `assetKeepScore`,
  and `getDeficitPositions` back the "Giving Up" depth context and the fair
  package suggestions.
- **Feature 3 — Trade › Targets, the cash-out board (`buildCashOutBoard`):**
  the one move the Targets board structurally cannot surface. Targets ranks
  opponents' players by **my positional deficits**, so a roster thin at WR sees
  WRs priced around that deficit and never a target sized to its most valuable
  aging asset — and `suggestFairPackage` won't bridge it either, since it never
  offers an asset worth far more than its target. Measured live 2026-09-06: the
  owner's 27.6-year-old RB1 (5,752) and the 23.1-year-old WR1 he'd want for him
  (6,484) could not appear together on any surface in the app.
  `pickCashOutAsset` names the asset bleeding most **value at risk** —
  `value × how far past its peak window`, which is neither "my oldest" (a
  38-year-old QB4 is worth nothing to cash) nor "my most valuable" (that is
  just my best player) — excluding anything at `PROTECT_THRESHOLD`. Then it
  lists younger targets (`CASH_OUT_MIN_YEARS_YOUNGER` = 2) around his price,
  each tilted by the same `assetMovability` the Targets board uses (extracted
  as `buildMovabilityIndex` so the two cannot drift) and **labelled with how it
  misses fair**: above the band, what to add; below it, the premium you'd pay.
  **The band and every gap come from `fairBand.js`, not from
  `suggestFairPackage`'s package-building window** — the first cut borrowed the
  latter and told the owner a deal needed "~84 more" that THE CALL then scored
  **408 light** on the very next screen. Tapping a row hands the Analyzer a
  two-sided `preloadTrade` built from the **full roster objects** (92657ae's
  lesson: a preload must resolve to what the add sheet produces). Renders in
  league-wide mode only — while a team is scoped the page is a scouting view of
  one roster. No past-peak asset ⇒ no block, never an invented one.

-----

### Trade deadline banner

The Trade section shows a persistent banner under the sub-tabs during the
regular season (deadline week comes from league settings — Week 13):

- More than 2 weeks out: neutral "Trade deadline: Week 13 · N weeks away"
- 2 weeks or less: amber urgency styling; deadline week says "THIS WEEK"
- After the deadline: muted "Trade deadline passed"
- Hidden entirely in the offseason

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
> direction 2026-07-19, spec: `docs/design/phase3-design-brief.md` + reference
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
│   ├── build-plan-2026-09.md        ← owner-approved four-phase build plan (Sept 2026) — per-phase kickoff prompts, gates, and the four measured NOT-to-build decisions
│   ├── project-status-2026-08.md    ← dated status snapshot (superseded by newer dated files)
│   ├── repo-review-2026-07.md       ← full read-only audit + ranked backlog (all items landed)
│   ├── analysis/                    ← model calibration + research notes (incl. optimizer-data-sources-2026-09.md: the Optimizer data-source feasibility study; asset-aging-and-pick-value-2026-09.md: THE keep-score calibration — player aging + pick realization; trade-my-side-read-2026-09.md: the one-engine-both-seats change, whose §4 is SUPERSEDED by trade-fair-band-2026-09.md: which of the two "fair" windows is allowed to answer which question — the suggestion is held inside buildFairBand and the wider assembly window is demoted to feeding `alternative`)
│   ├── design/                      ← Phase 3 "Primetime Blackout" brief + reference render (SUPERSEDED — see below)
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
honestly:** instead of "cannot find module" it prints `# tests 765 / # pass 760
/ # fail 5`, which reads like a code regression. A file that cannot load never
runs its tests, so the count silently drops from **808** to 765.
`npm run build` in the same state fails with `sh: 1: vite: not found`.
**If the test count isn't 808, run `npm ci` before debugging anything.**

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
count: **the gap between them is 43 and has not moved.** 808 − 765 = 43,
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
> `docs/build-plan-2026-09.md` was the active queue through 2026-09; **all four
> of its phases are now resolved** (1 shipped · 2 shipped-with-a-recorded-miss ·
> 3 partial, 3b/3c null · 4 cut), so it is history plus the standing rules in
> its §0 and §8 — not the queue.
> Read it before proposing next steps. Some items are **not** ready work and
> say so explicitly (rolling `PICK_YEARS` before the rookie draft runs actively
> breaks the Draft Tracker). The list below is the longer-horizon feature
> backlog; `open-items.md` is the near-term one.

These are noted so the codebase is structured to support them later.
Do not implement them until explicitly asked.

- FAAB bid recommender for waiver pickups — **research done, build still
  gated.** The bid corpus, the "failed ≠ outbid" finding, and a proposed rule
  spec live in `docs/analysis/faab-bid-corpus-2026-08.md` (re-runnable via
  `node scripts/dev/faab-corpus.mjs`). Do not build it without an explicit ask.
  Note for whoever does: the league's FAAB budget changed **$100 → $1000 for
  2026**, so all historical bids must be normalized to percent-of-budget — the
  app's own aggregation was fixed that way on 2026-09-20 (Feature 11). And the
  budget **resets twice a league year** (League Context), so a recommender must
  know which period it is bidding in: unspent offseason money is lost, which
  changes the whole "preserve budget" half of §6's Part A.
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
- Claude Design visual refresh → the "Primetime Blackout" rebrand
  (Navigation Refactor Phase 3, shipped 2026-07-20) — see Design System