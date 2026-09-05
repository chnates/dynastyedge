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

**Identity is runtime state, not a constant.** The signed-in roster comes from
the `useIdentity` store (set on the login screen — see Feature 18), so
`MY_ROSTER_ID` is no longer the source of truth. Every "is this me?" check
reads `myRosterId` from `LeagueContext` / `useIdentity`; the constants above
remain only as this league's original-owner reference.

### Roster slots

QB · RB · RB · WR · WR · TE · FLEX × 3 (RB/WR/TE) · Superflex (QB/WR/RB/TE) · DEF
12 bench · 5 taxi · 2 IR

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
|League history (manager scouting)|`/league/{id}` → `previous_league_id` chain, then per past season: users · rosters · transactions · drafts + picks (lazy, once per session, via `useLeagueHistory`)|

**Critical Sleeper note:** Roster endpoints return **numeric player IDs only** —
not names. Player names are resolved by matching Sleeper IDs against FantasyCalc
data (which includes a `sleeperId` field). This is the bridge between the two APIs.
Always use `sleeperId` as the join key (normalized to strings). Players FantasyCalc
doesn't rank fall back to the shared player DB for name/position and display `—`
as their value.

**Critical schedule note:** the NFL schedule is the ONE Sleeper endpoint that
does **not** live under `/v1` — ``/v1/schedule/nfl/regular/{year}`` 404s for every
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

- `.github/workflows/news.yml` runs twice an hour (cron `17,47 * * * *`,
  plus manual `workflow_dispatch`). It runs `scripts/fetch-news.mjs`, which
  pulls **eleven** sources, merges them into the **previously published
  feed**, resolves each item to the players it names, ranks player news above
  general news, and **force-pushes a single-commit `news-data` branch**
  containing `news.json`. Each item carries `headline`, `story` (≤600 chars),
  `published`, `source`, `link` (validated http(s) article URL or null),
  `athleteIds`, `playerIds`, and `isPlayerNews`.
- **Sources, in priority order** (each probed and parsed server-side before
  adoption — see `docs/analysis/news-sources-2026-09.md` for the full probe,
  including the ten rejected candidates): ESPN news API (the only source that
  ships `athleteIds`), **RotoWire's news page**, RotoWire RSS, Yardbarker,
  PFF, The Athletic, ESPN RSS, PFT, CBS, Sporting News, Yahoo. The percentage
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
  retaining **player items 7 days (240 max)** and **general items 48 hours
  (80 max)** — around 100KB, pulled once per session. This is what makes a
  source like RotoWire (25 player items per pull) compound across 48 runs a
  day. The workflow therefore reads the previous `news.json` off the
  `news-data` branch **via git, not the raw.githubusercontent CDN** (which
  caches ~5 minutes and would hand a run back its own grandparent); a branch
  that exists but won't yield the file fails the job **before** the publish
  step, so the accumulated window is never force-pushed away.
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
- **`coverage` block.** The feed carries `{ total, playerItems, withPlayerIds,
  withAthleteIds, spanHours, sources }` next to `updatedAt`, so feed health is
  inspectable and the next measurement of this pipeline has a baseline.
  `node scripts/dev/news-coverage.mjs` reports it against the live feed (or a
  local file) along with how many of the owner's rostered players the app
  actually resolves — that is the pipeline's acceptance metric.
  **The drawer's data-status block does not read it yet** — publish age already
  surfaces a *dead* pipeline; this block would surface a *degraded* one (a run
  that publishes on time with `playerItems` quietly collapsed). Open item
  `NEWS-2`.
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
  failure the news section simply hides. Verified end to end: with all eleven
  sources AND the player DB unreachable the script republishes the retained
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
  file over the rolling window. The publish step recovers any missing output
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
  session via `useValueHistory`. `getSeries(sleeperId)` returns the non-null
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
  `workflow_dispatch`). It runs `scripts/snapshot-rookie-intel.mjs`, which
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

**Rookie ADP rule:** FantasyCalc has no rookie-specific ADP field, and its
`rookiesOnly` endpoint returns non-rookies — never use it. The Draft section's
"Rk ADP" is derived locally (`utils/rookieAdp.js`): the Sleeper-verified rookie
class re-ranked 1..N by FantasyCalc overall rank. Rookies with no FantasyCalc
rank show `—` and sort to the bottom.

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
- **Action Items** (`RosterActionItems`, shared with The Edge — see Feature 12):
  generated roster alerts, each with an urgency tone and an optional deep-link
  action. Four types, all derived from live data:
  1. **Taxi deadline** (red) — any taxi player with `years_exp >= 2` must be
     activated before the regular season (see League Context taxi rules).
  2. **Bloated QB room** (amber) — 4+ rostered QBs. Names the most expendable
     QB (lowest dynasty value) and, via `suggestSellMove`, a concrete partner
     and return; the action deep-links into the Analyzer with `preloadTrade`
     already filling both sides.
  3. **IR slot opportunity** (blue) — an active player whose `injury_status`
     is `Out` or `PUP` and who isn't on IR yet.
  4. **Missing future 1st** (red) — no 1st-round pick in a `PICK_YEARS` season
     later than the current one; deep-links to Trade Partners.

  Items are **dismissible**, persisted in `dynastyedge_action_dismissals`
  against a `conditionSnapshot` — a dismissal only holds while the condition
  is unchanged, so a re-bloated QB room or a newly injured player re-surfaces
  rather than staying silently hidden forever.
- **Roster Analysis button** (below Action Items) → bottom sheet
  (`RosterAnalysisSheet`): age chart with one lane per position (QB/RB/WR/TE),
  each lane shaded with its position-specific peak window (RB 23–26, WR 24–28,
  TE 25–29, QB 26–33); dots are tappable (detail row below the chart) and a
  position filter expands a single lane. Stat cards: avg starter age, league
  avg, core win window years, direction (Ascending / At Peak / Declining).
  Plus per-position age table vs league average and a collapsible
  "How to read this" explainer. All data from LeagueContext — no extra fetches.
  Win-window years derive from `nflState.season`, never hardcoded.

#### League-wide view

- **My Roster** lives in the **My Team** section sub-tabs (My Roster · Lineup ·
  Season Review · Trajectory). The all-10-teams list lives in **League ›
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

- Show picks for 2026, 2027, 2028
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

**"Giving Up" depth context** (`analyzeTrade`'s `giveContext`, rendered as its
own block under Roster Fit): so "what am I actually surrendering?" is concrete,
for every position I'm dealing from the panel shows my roster's positional
pecking order by dynasty value — a mini depth chart marking the piece(s)
leaving (`OUT`), who currently starts (`ST`, from the same `buildValueLineup`
sim), and each dealt player's standing (e.g. "Gunnar Helm — your TE3 of 4 ·
depth"). Grouped by position (dealing two TEs shows one chart), taxi/IR excluded
(they can't start), capped at 6 rows. Unranked players show `—`. This is
descriptive context, not a verdict input — it never changes the score, it just
makes the roster cost legible before you confirm.

**Layer 3 — Win window fit**
Are you acquiring the right type of asset for where Nix Cage is now?

- Contending → favor proven players, not picks or unproven youth
- Rebuilding → favor picks and young players, not aging veterans
- When live playoff odds exist (in-season), Layer 3 adds a real
  "Playoff odds: N% · Buyer/Seller — …" line (via `analyzeTrade`'s optional
  `myPlayoffPct` + `getDeadlineVerdict`); offseason falls back to the tier read.
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

##### Targets has two modes — league-wide and team-scoped

A **team selector** (`PartnerSelect`, the same control the Analyzer uses —
options grouped by trade fit, each carrying win-window tier + record) sits
between the header and the position chips. It turns one fixed list into two
modes; the position chips compose with both.

- **All teams (default)** — the league-wide board: every opponent's players at
  a position where I'm below league average, ranked by `need × value`, top 20.
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

**No saved history.** The in-progress trade survives the session via
sessionStorage, but there is no multi-trade history — that lives in Sleeper.

-----

### Feature 4 — Lineup Optimizer

**Purpose:** answer one question every week — **"what should I change, and what
does it cost me if I don't?"** Not a status board: a start/sit engine that
solves the whole lineup, names the moves, and lets you build the result.

*The Optimizer is the **Lineup** sub-tab under **My Team** (`/my-team/lineup`),
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
|Bye weeks                   |Sleeper `/schedule/nfl/regular/{year}` (off `/v1` — `SLEEPER_ROOT`; fields `home`/`away`)          |
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
`{ blocked, status, label, short }` for bye / IR / Out / Questionable / ok.
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
- Positional strength bars: QB · RB · WR · TE — each shown relative to league average
  (above average = filled, below average = unfilled)
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
  5%, the larger haul renders green. Pick values use the same median-of-round
  logic as pick capital (`findPickValue`). FAAB dollars display but don't
  count toward totals. A header note says values are at today's prices, not
  at trade time. Unranked players show `—`.
- **Player names are tappable** (dotted underline) and open the
  PlayerProfileDrawer — only for FantasyCalc-ranked players; unranked
  fallback names are plain text.
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

### Feature 9 — Lineup Efficiency (My Team › Season Review)

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
- **Its own sub-tab** under **My Team** (`/my-team/season-review`), a sibling of
  My Roster, the Optimizer, and Trajectory — not stacked inside the Optimizer's
  scroll. It renders as a standalone padded page with its own header.
  (`/lineup/season-review` redirects here.)

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
notes). When the draft completes: recap with per-team value drafted, biggest
steals/reaches (pick slot vs rookie ADP), and full results.

**Rookie Research** is the third Draft sub-tab — see Feature 19.

**Refresh model:** Board and Tracker share one session-cached fetch
(`useSleeperDraft` module cache). A manual Refresh button refetches on demand;
the hook also refetches when the tab regains focus (aggressively while the
draft is live — exactly the flip-back-from-the-Sleeper-app moment — gently
otherwise) and polls every 30s while status is `drafting` and the tab is
visible.

**Manual fallback:** until the league creates the rookie draft in Sleeper, the
Tracker offers manual pick logging (slots provisionally assume roster-ID order
— labelled as such) plus a "Check" button to re-poll for the draft. Manual log
stored in `dynastyedge_draft_tracker_2026`.

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
- **FAAB efficiency:** dollars spent vs today's value of waiver pickups
  (value per $100), claims, FA move count.
  > ⚠ **Known issue — activates during 2026.** `buildFaabStats` sums **raw
  > dollars across seasons with no budget normalization**
  > (`managerAnalysis.js` — `e.dollars += bid`). The league's budget went
  > $100 → $1000 for 2026, so as 2026 waiver spend accumulates, `valuePer100`
  > collapses ~10× for active managers, `avgBid` (and the "Aggressive bidder"
  > / "Bargain hunter" tendency chips that compare against `leagueAvgBid`)
  > mixes two scales, and the `faab.dollars >= 20` coaching gate — meant as
  > "spent ≥20% of a budget" — now trips at 2%. **Fix is to normalize bids to
  > percent-of-budget** using each season's `waiver_budget` before
  > aggregating. Not yet done; no live 2026 waiver history to verify against
  > yet (11 claims as of 2026-08-08).
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
can't erase it. The app loads it lazily via `useTradeTimeValues`; when a ledger
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
- **Roster Analysis shortcut:** a one-tap card (accent edge bar + `ScanSearch`
  medallion) that opens the same `RosterAnalysisSheet` as My Roster — surfaced
  here so the age-curve / win-window tool is discoverable from the home screen.
- **Your Briefing:** up to 5 prioritized items from `buildBriefing`, each
  deep-linking somewhere: live/paused rookie draft → Tracker; trade deadline
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
  the Win Window layer shows a real "Playoff odds: N% · Buyer/Seller — …" line
  under the tier read.
- **Trade Partner Finder:** each opponent card flags a likely **seller**
  (< 35% odds) or **buyer** (≥ 70% odds) from their live odds.
- **The Edge:** a "Playoff odds: N% · stance" briefing item (Trophy icon) deep-
  links to League › Playoffs.

All three read `usePlayoffOdds`'s `oddsByRoster` / `myOdds` and **degrade
silently in the offseason** (no odds yet → the line/flag/item simply doesn't
render, and Layer 3 falls back to the tier-only read).

-----

### Feature 15 — News (top-level drawer section)

**Purpose:** a browsable, filterable view of the **entire** aggregated news
feed — the "show me everything" companion to the per-player news in the
Profile drawer and the roster-scoped Headlines slice on The Edge. Its own
top-level drawer section (`/news`, violet identity), single view (no
sub-tabs).

**Zero new data sources.** It reads the same once-per-session aggregated feed
(`loadNewsFeed` → the `news-data` branch's `news.json`, ≤100 items) used
everywhere else — see the Player news pipeline.

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

### Feature 17 — Dynasty Trajectory (My Team › Trajectory)

**Purpose:** the app's one forward-looking lens. Everything else is a snapshot
of *now* (current values, current odds, *historical* trade grades); a dynasty
is a multi-*year* horizon. Trajectory turns a roster from a value snapshot into
a value curve over the next few seasons and answers the core dynasty question:
**"when does my window peak — am I a buy-now or a build team?"** Works in season
and offseason alike. **Zero new data sources** — pure logic over caches
`LeagueContext` already holds.

**Location:** a **My Team sub-tab** (My Roster · Lineup · Season Review ·
**Trajectory**, `/my-team/trajectory`), and **roster-agnostic** — the team
drill-down (`RosterView` for `:rosterId`) carries a "Dynasty Trajectory →" card
that opens `/league/trajectory/:rosterId`, so you can scout an opponent's window
("this contender's value slams shut after 2026 — they'll sell").

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
- **Window verdict card** (tone-colored edge bar) — "Window peaks {year}" + a
  one-sentence buy/hold/sell read.
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
and there is no second copy to drift. The drawer resolves its own row via
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
- **Win-window lean on age:** a contender cashes picks and young fliers; a
  rebuilder hoards youth and picks and sells aging vets.
- **`PROTECT_THRESHOLD` = 0.9** — assets at or above this keep score are never
  *auto-*included in a suggested package. The user can still add them manually.

**Consumers:**
- **Feature 1 / Feature 12 — Action Items:** `suggestSellMove` turns "you have
  a surplus" into the actual move — the partner who most needs that position
  (or, if nobody is below average, the team weakest there), plus a concrete
  one-for-one when they own a comparable-value player at one of my deficit
  spots. Returns nav-ready `preloadTrade` state for the Analyzer.
- **League › Free Agents (Feature 1) and The Edge's `pickup` briefing item
  (Feature 12):** `recommendFreeAgents` ranks available players by what they'd
  do for *my* roster — fill a deficit, beat my replacement level at the
  position (my `CORE_DEPTH`-th best), ride a rising trend, fit my win window —
  and returns only players that genuinely move the needle, each with reasons.
- **Feature 3 — Trade Analyzer:** `buildGivabilityContext`, `assetKeepScore`,
  and `getDeficitPositions` back the "Giving Up" depth context and the fair
  package suggestions.

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

**There is NO bottom tab bar.** Navigation is a side drawer (hamburger menu, top-left),
opened by tap or by swiping right from the left screen edge. This is a deliberate
design decision — do not add a bottom nav. (Re-evaluated in the usability review:
the drawer stays; the wins were in fixing the information architecture *within*
this paradigm, not replacing it.)

The drawer is an **always-expanded hierarchical map** (docs-sidebar pattern, see
`SideDrawer.jsx`'s `NAV_TREE`): every destination is visible and one tap away.
Parent rows are both the group anchor and a destination (tap → the section's
default view), rendered with the section's identity-color icon + label;
children sit indented beneath on a thin section-colored guide rail, muted until
active (active child = section color + tinted background + edge bar). Leaf
sections (The Edge, News) are plain single rows with no children/rail.

Side drawer sections:

|#  |Section |Sub-views                                                |
|---|--------|---------------------------------------------------------|
|1  |The Edge|Daily briefing home screen (default route — leaf)        |
|2  |My Team |My Roster · Lineup · Season Review · Trajectory          |
|3  |Trade   |Partners · Analyzer · Targets · Managers · Pick Trades (+ deadline banner)|
|4  |League  |Overview · Free Agents · Activity · Movers · Playoffs    |
|5  |Draft   |Board · Research · Tracker                               |
|6  |News    |League-wide aggregated news feed (browsable — leaf)      |

Sections with multiple views use a sub-tab bar pinned under the app header —
the shared `SubTabBar` component (`src/components/shared/SubTabBar.jsx`), never
a hand-rolled row. It's an adaptive horizontal strip: tabs are `flex-1
min-w-max`, so the row fills the width when the tabs fit and scrolls
horizontally when they don't (long labels never wrap to a second line). The
active tab scrolls into view on navigation, and a right-edge fade appears only
while the row overflows.
The drawer also holds a **per-source data-status block**, manual Refresh, and
the theme toggle.

**Data status — five rows** (Rosters · Values · News · History · Rookies), each showing
the app-side "last refreshed" age of that source. The three Actions-published
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
standalone routes (no sub-tab bar; header reads "League"):
`/league/teams/:rosterId` (any roster) and `/league/trajectory/:rosterId` (any
team's trajectory). Trade adds `/trade/pick-trades`; Draft is just
`/draft/board` + `/draft/research` + `/draft/tracker`. Every moved/renamed path keeps a redirect
(see Navigation Refactor below) so saved deep-links and Edge briefing items
keep working: `/roster*` → `/my-team*` (or `/league*` for the team list /
drill-downs / free agents), `/lineup*` → `/my-team/*`, `/draft/trades` →
`/trade/pick-trades`, `/league/managers` → `/trade/managers`.

**Global search** lives in the fixed app header (search icon, top-right, on
every screen) — opens `PlayerSearchSheet`, a bottom sheet that searches the
cached FantasyCalc dataset by name (opening the matched player's
`PlayerProfileDrawer`) *and* matches section/feature names, surfacing a
"Jump to" group that deep-links to any view. See Feature 16.

**Manager Scouting moved from League to Trade** (it's trade intel — "who do I
call?"). The old `/league/managers` path redirects to `/trade/managers` so saved
deep-links and briefing items keep working. The component files still live in
`src/components/league/` (`ManagersView.jsx`, `ManagerScoutingSheet.jsx`) — only
the route changed.

-----

## Navigation Refactor (Planned — phased, not yet built)

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
> the brief. Both drawer watch-items were handled in the primitive pass
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
  neighbors. Replaced by the shared `SubTabBar` (`components/shared/`): an
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

### Design System Component Library

All UI routes through the shared library at **`src/components/ui`** (barrel
`index.js`). **Never hand-roll a button, card, bottom sheet, filter chip,
badge, or input inline** — extend a primitive instead. Class strings inside the
primitives are kept literal (no runtime color interpolation) so Tailwind's
content scan always picks them up. The `/design-review` skill audits every diff
for bypasses and is the enforcement mechanism — run it before committing
component work.

Import everything from the one barrel: `import { Button, Card, Sheet } from '../ui'`
(path relative to the importing file).

**Core primitives (new in the design system):**

|Primitive|What it is|
|---------|----------|
|`Button`|THE button. Variants `primary` (solid accent CTA) · `secondary` (bordered) · `tinted` (accent-tinted footer/link) · `ghost` (quiet) · `danger`; sizes `sm`/`md`/`lg`; `fullWidth`, `icon`/`iconRight`, polymorphic `as`/`href` (renders `<a>`).|
|`IconButton`|THE icon-only control — the close/affordance button in every sheet/drawer header (`w-9 h-9 rounded-lg … hover:bg-black/5`). Always pass `label` (→ aria-label); sizes `sm`/`md`.|
|`Card`|THE surface container (`rounded-none bg-bg-card border border-border-default` — broadcast panels are square). Optional `accent` color class renders the left **edge bar**; `cut` clips the 10px bottom-left corner (the action-card angle); `padding` `none`/`sm`/`md` or a raw class; `interactive`/`onClick` makes it a button.|
|`Sheet` + `SheetHeader`|THE bottom sheet. Owns the whole sheet contract (`useScrollLock`, `useSheetDrag` swipe-to-dismiss, `overscroll-contain`, safe-area bottom pad, Escape + overlay-tap close, drag handle); `zIndex` is a Tailwind z class so sheets stack. `SheetHeader` adds eyebrow/title/subtitle + the `IconButton` close. **Exception:** a *keyboard-aware* sheet driven by `window.visualViewport` (PlayerSearchSheet, TradeBuilder's add sheet) can't use `Sheet` (which is sized to the layout viewport) — those two are the sanctioned hand-rolled overlays.|
|`Modal`|THE centered dialog — confirm prompts and small forms that sit mid-screen rather than docking to the bottom (draft "Reset?" confirms, the CSV-name dialog). Owns overlay, `useScrollLock`, Escape + overlay-tap close; `maxWidth`/`surface` props. The bottom-docked counterpart is `Sheet`.|
|`Chip`|THE filter chip — the QB/RB/WR/TE/All/Picks toggle, square, in the mono score-bug voice. Inactive is quiet; `active` defaults to solid silver with near-black text; pass `activeClass={POS_CHIP_ACTIVE[pos]}` for position-tinted active states. Sizes `sm`/`md`.|
|`Badge`|THE small status/label badge, square, mono uppercase — `tone` (accent/brand/success/warning/danger/neutral) and `soft` tinted variants; `pill` for rounded. Solid accent (silver) carries near-black text; **`brand` is the rationed red, reserved for "you" labels** (You-chips). (Win-window tiers use `WinWindowBadge`; position tags use `POS_TAG`.)|
|`Select`|THE dropdown field — a native `<select>` in the `Input` field voice, with the mono micro-`label`, optional `hint`, and the ▾ affordance. Native is deliberate: iOS renders it as the system wheel picker (better than any custom sheet for a one-of-N choice) and `<optgroup>` gives grouped options for free.|
|`Input` / `SearchInput`|THE text field + search-box variant. Consistent field styling across all search/filter boxes; `SearchInput` adds the leading magnifier. Both `forwardRef`. Keep at `text-sm` (iOS focus-zoom is handled globally).|
|`cn`|The one styling primitive — a tiny `className` joiner that drops falsy values. Never pull in a heavier classnames dep.|

**Adopted shared primitives** are re-exported from the same barrel so the
library is the single import surface (the files stay in `src/components/shared/`):
`ErrorState`, `Spinner` (LoadingSpinner), `SectionHeader` + `BRAND_TICK`,
`SubTabBar`, `TrendArrow`, `WinWindowBadge`, `Sparkline`, `TeamAvatar`. Import
these from `'../ui'` going forward. `NewsArticleSheet.jsx` is the canonical
"migrated to the library" example (`Sheet` + `SheetHeader` + `Button`).

### Theme

- **Default:** Dark mode
- **Toggle:** Always accessible (top-right corner of app, every screen)
- **Preference stored in:** `localStorage` key `dynastyedge_theme`

The visual language is **"Primetime Blackout"** (Phase 3, owner-approved
2026-07-19 — full brief: `docs/design/phase3-design-brief.md`): NFL primetime
broadcast graphics, blacked out, on the Falcons palette — **silver leads,
red is scarce**. The design law that resolves every argument:

1. **Red is rationed.** Falcons brand red appears ONLY on the hero's
   score-bug cap bar, the owner's own card/row treatments ("you" accents:
   border, You-chip, my-pick highlights), and the active sub-tab underline.
   Everything else that wants an accent is **silver** (structure) or keeps
   its semantic color. If a surface feels like it wants red, the answer is
   silver.
2. **Trend/status semantics are untouchable.** Brand red (`--brand`,
   crimson) and trend/status red (`--danger`, bright salmon) are different
   values and never swap roles.
3. **The angle is the one structural flourish** — lower-third headers,
   score-bug caps, action-card corner cuts. No glows, and no gradients
   beyond the two sanctioned score-bugs below.
4. **Boldness is spent in the hero.** The red score-bug hero is the one loud
   moment per screen; everything else is flat panels and 1px borders.

**The two sanctioned gradients** (`index.css`): red score-bug `.bug-red`
(`linear-gradient(90deg,#C8102E,#7E0E22)` dark / `#A71930→#711022` light,
white text) and silver score-bug `.bug-silver`
(`linear-gradient(90deg,#C9CDD1,#8F949B)`, near-black text, both themes).
**Silver fills always carry near-black text** — solid-accent primitives use
`text-bg-primary`, never white.

### Color palette

Tokens live in `index.css` (`:root` light / `.dark` dark) and are exposed via
Tailwind (`bg-accent`, `text-brand-bright`, `bg-tier-middle/10`, …).

#### Dark mode

|Role                |Value                    |
|--------------------|-------------------------|
|Background primary  |`#0B0B0D`                |
|Background secondary|`#101013`                |
|Background card     |`#141417`                |
|Border              |`#28282E`                |
|Text primary        |`#F4F5F7`                |
|Text secondary      |`#8A9096`                |
|Text tertiary       |`#54565C`                |
|Accent (structure)  |`#C9CDD1` (silver)       |
|Brand red (rationed)|`--brand #C8102E` · gradient partner `--brand-deep #7E0E22` · text-on-dark `--brand-bright #D81E3C`|
|Success green       |`#37C878`                |
|Warning amber       |`#F59E0B`                |
|Danger red (trend/status)|`#FF5C5C` (salmon — never the brand red)|
|Tier: Contending    |`--tier-contend #C9CDD1` (silver — gold left the system)|
|Tier: Middle        |`--tier-middle #57C4E8` (cyan)|
|Tier: Rebuilding    |`--tier-rebuild #8F9BF2` (indigo)|

#### Light mode

|Role                                 |Value    |
|-------------------------------------|---------|
|Background primary                   |`#F0F1F3`|
|Background secondary                 |`#E7E9EC`|
|Background card                      |`#FFFFFF`|
|Border                               |`#D9DCE1`|
|Text primary                         |`#101013`|
|Text secondary                       |`#54565C`|
|Text tertiary                        |`#8A9096`|
|Accent (structure)                   |`#5C6470` ("silver" reads as slate on white)|
|Brand red                            |`#A71930` (deepened for contrast on white; `--brand-bright` = same)|
|Success green                        |`#1F9D5C`|
|Danger red (trend/status)            |`#D8383F`|
|Warning amber                        |`#F59E0B` (unchanged)|
|Tiers                                |Contending `#4A5560` · Middle `#0E7C9E` · Rebuilding `#5560CE`|

### Position identity colors (consistent across entire app)

Every position has its own identity color — this is what keeps the app from
feeling monochrome. Tokens live in `index.css` (`--pos-*`), are exposed via
Tailwind (`text-pos-qb`, `bg-pos-rb/15`, …), and all class maps live in
`src/utils/positionColors.js` (`POS_TEXT`, `POS_BG`, `POS_TAG`,
`POS_CHIP_ACTIVE`, `POS_SVG`). **Never hand-roll position colors locally, and
never reuse status colors (success/warning/danger) to mean a position.**

|Position|Dark mode          |Light mode         |
|--------|-------------------|-------------------|
|QB      |`#F2758F` (pink)   |`#C4335A`          |
|RB      |`#3AD0A4` (teal)   |`#0F8A66`          |
|WR      |`#57A9F2` (sky)    |`#1F6FC0`          |
|TE      |`#F0964E` (orange) |`#C05F1A`          |
|DEF     |`#9AA3EE` (violet) |`#5A64C8`          |

Where they apply:

- Position labels on player rows (roster, free agents, movers, draft, drawers)
- Position rank (`#3 WR`) on PlayerCard and in the Player Profile drawer
- Active position filter chips everywhere (tinted style: `bg-pos-x/15 text-pos-x
  border-pos-x/40`); the All / Picks chips keep the solid accent style
- Positional strength bars + labels on TeamCard (above-average = position color)
- Position group headers in RosterView (the lower-third's trailing slash via
  `SectionHeader`'s `accentBar` prop — the bug itself stays silver)
- Roster Analysis age-chart lanes (`POS_SVG` for SVG fill/stroke)
- Lineup slot labels (FLEX / Superflex slots keep accent)
- Position tags in the trade builder / What's Fair / lineup FA drawer (`POS_TAG`)

Status colors (success/warning/danger) keep their exclusive meanings:
health/verdicts/flags — a TE label must never read as "danger".

### Pick round colors (consistent across entire app)

Class maps live in `src/utils/roundColors.js` (`ROUND_CLASSES`, `ROUND_TEXT`,
`ROUND_LABELS`) — shared by PickBadge and TeamCard, never redefined locally.

**1st round is silver-on-charcoal** — the old gold-amber collided with the
warning color once Contending went silver; 2nd/3rd/4th keep their hue
families, tuned to the Blackout palette.

|Round|Dark bg  |Dark text|Light bg    |Light text  |
|-----|---------|---------|------------|------------|
|1st  |`#26262C`|`#C9CDD1`|`#E4E6EA`   |`#3E444C`   |
|2nd  |`#10263C`|`#5FA8E8`|`blue-100`  |`blue-800`  |
|3rd  |`#252047`|`#8F9BF2`|`violet-100`|`violet-800`|
|4th  |`#1A1A1E`|`#8A9096`|`gray-100`  |`gray-700`  |

### Status / verdict colors (consistent throughout)

|Status                |Color        |When used                                     |
|----------------------|-------------|----------------------------------------------|
|🔴 Hard block / Decline|Danger red   |Out, IR, bye, decline verdict                 |
|🟡 Soft flag / Counter |Warning amber|Questionable, projection flag, counter verdict|
|🟢 Confirmed / Accept  |Success green|Healthy, optimal, accept verdict              |
|🎯 Priority            |Accent silver|Top trade partner tier                        |
|✅ Good Fit            |Muted green  |Second trade partner tier                     |
|⚪ Poor Fit            |Text tertiary|Lowest trade partner tier                     |

Verdict blocks (Accept/Decline/Counter) use a **flat tint** of their status
color (`bg-x/10`) — the old diagonal gradients left with Phase 3 (only the
two score-bug gradients exist).

### Win window tier colors

Every tier has an identity color — maps live in `src/utils/tierColors.js`
(`TIER_BADGE`, `TIER_TEXT`), shared by `WinWindowBadge` and the League health
banner chips. Never redefine locally.

|Tier      |Color                                   |
|----------|----------------------------------------|
|Contending|Silver (`--tier-contend` — gold left the system in Phase 3)|
|Middle    |Cyan (`--tier-middle`)                  |
|Rebuilding|Indigo (`--tier-rebuild`)               |

Rank medals (below) keep gold/silver/bronze — they are ordinal semantics,
not brand.

### Rank medals

Ranking ordinals (league value rank, position rank cards, the League team
list) color the top 3 as medals — gold/silver/bronze — via `rankClass(rank)` in
`src/utils/rankColors.js`. Everyone else stays text-tertiary.

### Team avatars

`src/components/shared/TeamAvatar.jsx` shows the owner's Sleeper avatar
everywhere teams appear (team cards, position rankings, the League team list,
matchups, roster hero header, side drawer). Sources, in order: custom team avatar URL
(`user.metadata.avatar`), Sleeper CDN thumb
(`https://sleepercdn.com/avatars/thumbs/{user.avatar}`), then a deterministic
gradient initial circle (hash of team name). Static `<img>` tags only — this
is not an API call, so it doesn't go through `fetchJSON`. Always render the
fallback on image error; never let a broken avatar break a card.

### Ambient background (flat blackout)

The app shell's `.app-bg` (`index.css`) is **flat** — the old blue/violet
radial glows left with Phase 3. The ONE sanctioned ambient device is a faint
red conic sweep (`.hero-sweep`, `rgba(216,30,60,.06)`, **dark mode only** —
on light backgrounds it read as a pink cast) applied to the roots of the
screens that carry a score-bug hero (The Edge, RosterView; the login screen
bakes the same sweep into `.login-bg`). The fixed app header stays
translucent (`bg-bg-secondary/85 backdrop-blur-md`). Bottom sheets and
drawers keep their opaque backgrounds.

### Score-bug heroes + the angle language

The one loud moment per screen. The Edge's hero, the Roster view's team
header, and the Playoff Odds summary are **red score-bug heroes**: a
`.bug-red` cap bar (Anton label, e.g. "{team} · Franchise Report", short
mono dateline right) over a flat near-black `.hero-card` panel (`#101013`,
1px border) that is **deliberately dark in BOTH themes** — hero content is
white-on-dark: white text at varying opacities, `bg-white/15
border-white/20` chips, the marquee value in white mono (no text glow — no
glows anywhere). The Edge's hero closes with a divider-separated **stat
strip** (rank / record / window / FAAB, mono micro-labels); tier dots there
pin the dark-theme tier literals since the panel never changes theme. Top-3
value rank shows in `text-amber-300` (medal gold).

The angle language rolls through the app:

- **Section headers are silver lower-thirds** — `SectionHeader` renders the
  label in a `.bug-silver` block with a hard 8px angled trailing cut
  (`.lower-third`) plus a small identity-colored trailing slash. The bug is
  ALWAYS silver (structure never takes identity color); `accentBar` (e.g.
  `POS_BG[pos]`, default `BRAND_TICK` = silver) colors only the slash;
  `null` renders a bare muted label.
- **TeamCard carries a score-bug caption bar**: rank ordinal (zero-padded) +
  Anton team name + tier label; the owner's card's cap goes `.bug-silver`
  with the red You-badge (and a `border-brand/60` card border — "you" is
  red).
- **Action cards cut the bottom-left corner** (10px, `.corner-cut` /
  `Card`'s `cut` prop) — RosterActionItems, the Trade counter callout.
- Briefing items (The Edge) and the Roster Analysis button are cards with a
  3px left edge bar + tinted icon medallion in their tone color.
- Trend chips (The Edge, Market Movers) render as filled tinted pills, not
  bare colored text.
- **"New" badges are solid silver with near-black text; "You" badges are
  solid brand red with white text** — everywhere.
- Footer/link buttons ("All market movers →", "Full activity feed →",
  manager ledger buttons, the Movers row Trade button) are accent-tinted
  (`border-accent/25 bg-accent/5`), not gray-bordered.
- **The active sub-tab underline is brand red** (`SubTabBar`, Anton tabs) —
  the third and last of red's sanctioned surfaces.

### Section identity colors (side drawer)

Each nav section has an identity hue (defined inline in `SideDrawer.jsx`'s
`NAV_TREE`): The Edge accent silver · My Team sky · Trade green · League gold ·
Draft pink · News violet. Icons always wear the section color; the active child
gets the matching tinted background and edge bar, and children hang off a
section-colored guide rail. These are navigation identity only — they carry no
status meaning.

### Logo — the Crown Crest

The mark is a crown built from analytics: three ascending rounded bars
(a rising chart) as the crown's prongs, a jewel dot floating above each tip,
and a detached base band as the circlet. Phase 3 cut: **red crown, silver
EDGE** — the crown wears the brand-red ramp (`#D81E3C→#7E0E22` dark /
`#A71930→#711022` light), the app icon grounds it in silver on the red
score-bug gradient.

- **In-app lockup:** `src/components/shared/DynastyEdgeLogo.jsx` — red-ramp
  crown + "DYNASTY**EDGE**" wordmark in Anton ("EDGE" in the silver
  structure gradient). Used in the side drawer.
- **App icon / favicons:** generated by `node scripts/generate-icons.mjs`
  (sharp + png-to-ico, devDependencies) into `public/`:
  `apple-touch-icon.png` (180px, **full-bleed red gradient + silver crown,
  no border, no pre-rounded corners** — iOS applies its own mask),
  `favicon-32x32.png`, `favicon-16x16.png`, `favicon.ico`, `logo.svg`
  (rounded gradient square).
- The crown geometry lives in both the component and the script — keep them
  in sync and re-run the script after any change. Never ship an app icon
  with its own border or baked-in rounding (it clips badly on iOS).

### Typography

- **Display / headers:** `Anton` — **400 only** (it ships one weight; never
  pair it with `font-bold`, the synthesized bold distorts it). Uppercase,
  tracked. Display-only — never body text.
- **Body / UI:** `Archivo` (400/500/600/700)
- **Numbers / values:** `IBM Plex Mono` for FantasyCalc values and scores;
  also the **micro-label "score-bug" voice** — stat eyebrows, badges, chips
  are IBM Plex Mono 500–600 uppercase with wide tracking

Load from Google Fonts (`index.html`). Barlow Condensed and IBM Plex Sans
left the font request in Phase 3.

### Spacing and layout

- Content padding: `16px` left/right on mobile
- Card border radius: **0** (broadcast panels are square). **Sheets, modals,
  and the drawer keep their radii** and full gesture contract — the Phase 3
  repaint never touched sheet mechanics.
- Side drawer width: `80vw`, max `300px`; respects iPhone safe-area insets
- Section headers: the silver lower-third bug — Anton, 11px, wide tracking
- Player cards: compact — name + team + value must fit in one row at 390px

### Motion

- Tab transitions: fade (150ms)
- Drawer open (free agents, team drill-down): slide up (250ms ease-out)
- Value updates in trade builder: brief flash highlight on the total when it changes
- No heavy animations — this is a utility app, not a showcase

-----

## File Structure

```
dynastyedge/
├── .github/
│   ├── pull_request_template.md ← THE PR body layout (measured-result + evidence + docs + rollback gates)
│   └── workflows/
│       ├── deploy.yml          ← GitHub Actions auto-deploy (lint + test gate before build)
│       ├── ci.yml              ← lint + test + build on branch pushes / PRs (no deploy)
│       ├── news.yml            ← twice-hourly news aggregation (accumulates into the feed) → news-data branch
│       ├── values-history.yml  ← daily value snapshot + trade archive → values-history branch
│       └── rookie-intel.yml   ← daily rookie depth-chart + draft-capital feed → rookie-intel branch; `mode` input also runs the two CFBD analyses (probe · college-backtest), which publish nothing
├── scripts/
│   ├── fetch-news.mjs          ← multi-source news fetcher (runs in Actions)
│   ├── snapshot-values.mjs     ← daily FantasyCalc snapshot appender (runs in Actions)
│   ├── snapshot-values-archive.mjs ← permanent MONTHLY values archive for trajectory back-testing (app never fetches it)
│   ├── snapshot-trade-values.mjs ← permanent trade-time value archiver (runs in Actions)
│   ├── snapshot-rookie-intel.mjs ← daily nflverse → Sleeper rookie intel feed (runs in Actions)
│   └── dev/
│       ├── screenshot-app.mjs  ← headless-Chromium screenshotter for the running app (390px UI verification; --route, --player, --drawer, --seed-session, --click — see the dynastyedge-visual-capture skill)
│       ├── replay-live.mjs     ← drives the running app against a SYNTHETIC draft / regular season, so the two once-a-year surfaces can be rehearsed on demand
│       ├── faab-corpus.mjs     ← analysis-only: pulls the league's full FAAB bid corpus (see docs/analysis/faab-bid-corpus-2026-08.md); nothing imports it
│       ├── rookie-signal-backtest.mjs ← analysis-only: grades the SHIPPED rookie model against 2021–2025 (imports src/utils/rookieResearch.js so it cannot drift)
│       ├── rookie-longterm-backtest.mjs ← analysis-only: THE Phase 3c gate — a two-axis "long-term" rookie score, tested against years 2–3 and REJECTED; see docs/analysis/rookie-longterm-signals-2026-09.md
│       ├── cfbd-probe.mjs        ← analysis-only, RUNS IN ACTIONS (needs CFBD_API_KEY): proves CFBD's athlete id IS the ESPN athlete id, so college data joins by ID and never by name
│       ├── rookie-college-backtest.mjs ← analysis-only, RUNS IN ACTIONS: THE Phase 3b gate — dominator rating + breakout age vs years 2–3, also REJECTED; see docs/analysis/rookie-college-production-2026-09.md
│       ├── trade-structure-backtest.mjs ← analysis-only: the DISCONFIRMED trade-structure profiling test (frontier Item 3); drives the shipped buildManagerProfiles so it cannot drift
│       ├── optimizer-signal-backtest.mjs ← analysis-only: measures whether a better weekly PROJECTION is obtainable (it is not) and what DEF streaming is worth; see docs/analysis/optimizer-data-sources-2026-09.md
│       └── news-coverage.mjs ← analysis-only: THE news-pipeline acceptance metric — how many of my rostered players the app can actually resolve in the feed (no arg = live feed); see docs/analysis/news-sources-2026-09.md
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── ui/                      ← Design System library — route ALL UI through it (barrel index.js)
│   │   │   ├── index.js             ← the single import surface (re-exports every primitive)
│   │   │   ├── Button.jsx           ← THE button (primary/secondary/tinted/ghost/danger · sm/md/lg)
│   │   │   ├── IconButton.jsx       ← THE icon-only/close control (pass `label`)
│   │   │   ├── Card.jsx             ← THE surface container (+ optional accent edge bar)
│   │   │   ├── Sheet.jsx            ← THE bottom sheet + SheetHeader (owns scroll-lock/drag/safe-area)
│   │   │   ├── Modal.jsx            ← THE centered dialog (confirms / small forms)
│   │   │   ├── Chip.jsx             ← THE filter chip (toggle pill, position-tinted active)
│   │   │   ├── Badge.jsx            ← THE small status/label badge (New/You, tone/soft)
│   │   │   ├── Input.jsx            ← THE text field + SearchInput variant
│   │   │   ├── Select.jsx           ← THE dropdown field (native select + label/hint)
│   │   │   └── cn.js                ← tiny className joiner (the one styling primitive)
│   │   ├── auth/
│   │   │   └── LoginScreen.jsx      ← Sleeper-username sign-in + team-picker fallback (gates the app)
│   │   ├── edge/
│   │   │   └── EdgeView.jsx         ← The Edge: daily briefing home screen
│   │   ├── roster/
│   │   │   ├── RosterLayout.jsx     ← "My Team" sub-tabs: My Roster / Lineup / Season Review / Trajectory (renders ../lineup views)
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
│   │   │   ├── PartnerContextStrip.jsx ← THE partner intelligence strip — Analyzer + Targets
│   │   │   └── WhatsFair.jsx        ← Targets: league-wide board + per-team scouting mode
│   │   ├── lineup/                  ← rendered as "My Team" sub-tabs (no own layout)
│   │   │   ├── LineupOptimizer.jsx  ← My Team › Lineup: the swap sandbox + orchestration
│   │   │   ├── LineupMovesCard.jsx  ← the start/sit hero + move list ("what do I change?")
│   │   │   ├── LineupRow.jsx        ← THE lineup row — starters AND bench, so a player reads the same either side of the line
│   │   │   ├── LineupEfficiency.jsx ← My Team › Season Review: actual vs optimal points
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
│   │       ├── SideDrawer.jsx       ← the app's only navigation
│   │       ├── SubTabBar.jsx        ← THE section sub-nav (adaptive scroll strip) — never duplicate it
│   │       ├── ErrorState.jsx       ← THE error component — never duplicate it
│   │       ├── SectionHeader.jsx    ← THE section header — never duplicate it
│   │       ├── PlayerProfileDrawer.jsx
│   │       ├── NewsArticleSheet.jsx    ← tappable news reader bottom sheet
│   │       ├── PlayerSearchSheet.jsx   ← global player search (header icon → profile)
│   │       ├── WinWindowBadge.jsx
│   │       ├── TrendArrow.jsx
│   │       ├── DynastyEdgeLogo.jsx
│   │       ├── TeamAvatar.jsx       ← Sleeper avatar + gradient-initial fallback
│   │       ├── Sparkline.jsx        ← tiny SVG trend line for value history
│   │       └── LoadingSpinner.jsx
│   ├── hooks/
│   │   ├── useSleeper.js        ← league/rosters/users/picks/state fetch
│   │   ├── useFantasyCalc.js    ← FantasyCalc fetch + module cache
│   │   ├── usePlayerDB.js       ← shared /players/nfl cache (one fetch/session)
│   │   ├── useLeague.js         ← combined league state, player resolution (+ Sleeper-only `signInRosters` for login)
│   │   ├── useIdentity.js       ← logged-in roster identity (localStorage store); wipes roster-scoped keys on switch
│   │   ├── useTransactions.js   ← season-wide transaction feed
│   │   ├── useLeagueHistory.js  ← walks previous_league_id chain: past seasons' tx/drafts
│   │   ├── useManagerProfiles.js← composes history + current season into scouting profiles
│   │   ├── useTradeTimeValues.js← trade-time value archive for the ledger (best-effort)
│   │   ├── matchupWeeks.js      ← shared /matchups/{week} session cache (playoff odds + lineup history)
│   │   ├── useLineupHistory.js  ← my past matchups for efficiency review (reads matchupWeeks)
│   │   ├── usePlayoffOdds.js    ← regular-season schedule (via matchupWeeks) + Monte Carlo sim
│   │   ├── weeklyProjections.js ← shared /projections + /state session cache (Optimizer + Free Agents)
│   │   ├── useLineupData.js     ← projections (via weeklyProjections), statuses, schedule, def stats
│   │   ├── useWatchlist.js      ← starred players (localStorage-backed store)
│   │   ├── useLastVisit.js      ← The Edge's "since your last visit" anchor
│   │   ├── useLeagueNews.js     ← news feed matched to my roster + watchlist
│   │   ├── useNewsFeed.js       ← full aggregated feed for the News section
│   │   ├── useValueHistory.js   ← daily value snapshots for sparklines (best-effort)
│   │   ├── useRookieIntel.js    ← rookie depth-chart + draft-capital feed (best-effort; `enabled` keeps it unfetched for a consumer with no rookie to show)
│   │   ├── useRookieResearch.js ← THE rookie board, composed once: Draft › Research AND the profile drawer's per-player row
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
│   │   ├── appVersion.js        ← pure reload-URL builder for the version self-heal
│   │   ├── positionColors.js    ← position identity color class maps — use everywhere
│   │   ├── roundColors.js       ← pick round color classes (PickBadge, TeamCard)
│   │   ├── tierColors.js        ← win-window tier colors (badge + banner chips)
│   │   ├── rankColors.js        ← gold/silver/bronze medal colors for rank ordinals
│   │   ├── tradeAnalysis.js     ← trade scoring, verdict logic
│   │   ├── edgeBriefing.js      ← The Edge: signals, briefing items, GM line
│   │   ├── managerAnalysis.js   ← manager scouting: ledgers, tendencies, draft grades
│   │   ├── rosterAnalysis.js    ← positional strength, win window tiers
│   │   ├── recommendations.js   ← THE assistant-GM brain: keep/givability scores, FA pickups, sell moves
│   │   ├── dynastyTrajectory.js ← forward value projection: market age curves + pick maturation
│   │   ├── pickCapital.js       ← pick ownership resolution logic
│   │   ├── rookieAdp.js         ← derived rookie-class ADP for the Draft section
│   │   ├── rookieResearch.js    ← rookie opportunity model: depth × capital, market-vs-model divergence
│   │   ├── pickTrades.js        ← pick trade calculator: slot pricing + packages
│   │   ├── peakWindows.js       ← position peak-age windows + status helper
│   │   ├── draftLive.js         ← THE rookie draft live path (on the clock, countdown, Best Available, capital, recap) — pure, extracted from DraftTracker so it is testable
│   │   ├── lineupBuild.js       ← THE optimal starting-lineup slot-fill (metric-agnostic); fed points (Optimizer) or dynasty value (Trade Analyzer fit sim)
│   │   ├── lineupMoves.js       ← THE weekly start/sit engine: solves the lineup, diffs it against yours, emits the move list (gains sum to the headline)
│   │   ├── lineupConfidence.js  ← the MEASURED hit-rate curve behind "61% likely to be the right call" — regenerate, never hand-edit
│   │   ├── freeAgents.js        ← THE waiver-options list (never gated on FantasyCalc; carries the TEAM_* guard)
│   │   ├── lineupHistory.js     ← optimal-lineup POINTS math for efficiency review (delegates to lineupBuild)
│   │   ├── playoffOdds.js       ← scoring model + Monte Carlo + deadline verdict
│   │   └── projections.js       ← lineup optimization, matchup quality
│   ├── context/
│   │   └── LeagueContext.jsx
│   ├── constants.js             ← league ID, API base URLs, feed URLs, PICK_YEARS, ROSTER_SLOTS
│   ├── App.jsx
│   └── main.jsx
├── docs/                        ← durable analysis + design records (not shipped)
│   ├── open-items.md                ← THE living "what's next" backlog — deferred work + trigger conditions
│   ├── build-plan-2026-09.md        ← owner-approved four-phase build plan (Sept 2026) — per-phase kickoff prompts, gates, and the four measured NOT-to-build decisions
│   ├── project-status-2026-08.md    ← dated status snapshot (superseded by newer dated files)
│   ├── repo-review-2026-07.md       ← full read-only audit + ranked backlog (all items landed)
│   ├── analysis/                    ← model calibration + research notes (incl. optimizer-data-sources-2026-09.md: the Optimizer data-source feasibility study)
│   └── design/                      ← Phase 3 "Primetime Blackout" brief + reference render
├── tests/                       ← plain-Node test suite (node:test + node:assert/strict, zero deps)
│   ├── fixtures/
│   │   └── draft-2025.json          ← this league's REAL 2025 rookie draft (board, 40 picks, 24 traded picks) — replayed by truncation to synthesize every mid-draft state
│   ├── draftLive.test.mjs           ← draft live path: order resolution (both tiers), real traded-pick replay, on-the-clock/countdown at all 40 board positions, Best Available, capital, recap steal/reach banding
│   ├── sleeperDraft.test.mjs        ← mocked-fetch: single-draft endpoint merged over the list (slot_to_roster_id), session cache, best-effort sub-fetch degradation
│   ├── projections.test.mjs         ← Week 1 lineup engine: defense rankings joined via player DB + schedule, home/away fields, Week-1 empty-stats contract, red/yellow/green flags, best bench
│   ├── playoffOdds.test.mjs         ← fixed-seed determinism, Σ odds = playoff teams, verdict thresholds
│   ├── pickCapital.test.mjs         ← pick ownership resolution, round-median pick values, year weights
│   ├── pickTrades.test.mjs          ← slot tiers (as coded), slot pricing fallback, package constraints
│   ├── managerAnalysis.test.mjs     ← past-pick ≈ round-median fallback, ±5% win/loss banding
│   ├── appVersion.test.mjs          ← reload URL: ?v= before the hash (HashRouter), encoding, null build id
│   ├── tradeTargets.test.mjs        ← Targets ranking: deficit gate + value floor league-wide, team-scoped mode keeps depth (never empty), fillsNeed flag
│   ├── tradeAnalysis.test.mjs       ← verdict ladder, % vs larger side, counter never re-suggests, lineup-sim fit (bench ≠ fill, starter-loss hurt), trajectory lens, draft nudge
│   ├── dynastyTrajectory.test.mjs   ← per-year clamps, hold-flat contract, pick maturation
│   ├── lineupBuild.test.mjs         ← slot-fill order (singles → FLEX → SFLX), IR/taxi excluded, who-starts identity
│   ├── lineupMoves.test.mjs         ← start/sit engine: Σ gains = headline invariant, the two superseded per-slot bugs (double-count, missed cascade), hard-block exclusion, empty DEF slot, swap algebra, confidence lookup + coin-flip demotion (demoted moves still sum to the headline)
│   ├── freeAgents.test.mjs          ← waiver options: the DEF blind spot (FantasyCalc must not gate the list), TEAM_* offense-totals guard, rule-7 `—` for unranked, rostered exclusion, and the one-defense rule (a skill slot never returns a DEF, however it projects)
│   ├── lineupHistory.test.mjs       ← optimal-lineup slot-fill order (singles → FLEX → SFLX)
│   ├── matchupWeeks.test.mjs        ← mocked-fetch: one fetch/week across both consumers, all-fail rejection
│   ├── rookieResearch.test.mjs      ← opportunity blend, shared points scale (the backup-TE trap), within-position divergence, roster-fit re-ranking (need/window bonuses, score untouched), drawer hand-off fields, best-effort feed degradation, and the measurables NULL (age/combine can never move a score)
│   └── transactions.test.mjs        ← mocked-fetch: all-18-buckets-failed rejection, per-bucket degradation
├── index.html
├── eslint.config.js             ← ESLint 9 flat config (recommended + react-hooks, src/ + scripts/)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

**Install dependencies first: `npm ci`** (never `npm install` — it can rewrite
the lockfile). A fresh clone has no `node_modules`, and every session on a
remote/cloud runner starts from one. **`npm test` does not report that
honestly:** instead of "cannot find module" it prints `# tests 130 / # pass 125 /
# fail 5`, which reads like a code regression. The five files that fail are the
ones transitively importing `react` (`tradeAnalysis.js` → `recommendations.js`
→ `useLeague.js`, plus `matchupWeeks`, `transactions`, `sleeperDraft`, and
`draftLive` loading their hooks) — the file fails to load, so its tests never
run and the count silently drops from **178** to 130. `npm run build` in the
same state fails with `sh: 1: vite: not found`. **If the test count isn't 178,
run `npm ci` before debugging anything.** (Both numbers re-measured 2026-09-05
by renaming `node_modules` aside; re-measure them whenever the suite grows —
the pair had drifted to 177/115 by the time it was next checked.)

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

**Lint:** `npm run lint` runs ESLint 9 (flat config, `eslint.config.js`) over
`src/` and `scripts/` — `@eslint/js` recommended rules plus
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

export const PICK_YEARS = ['2026', '2027', '2028']
export const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// Ordered roster slots — indices match Sleeper's `starters` array positions.
// The shared slot-fill engine (utils/lineupBuild.js) reads this.
export const ROSTER_SLOTS = [ /* QB · RB×2 · WR×2 · TE · FLEX×3 · SFLX · DEF */ ]
```

(The four feed URLs are elided above for width — they are full
`raw.githubusercontent.com/chnates/…` URLs in the real file.)

**`PICK_YEARS` is a manual, season-scoped constant.** It drives pick capital
everywhere, and `useSleeperDraft`'s `DRAFT_SEASON = PICK_YEARS[0]` points the
Draft Tracker at the upcoming rookie draft. It must be rolled forward by hand
once a rookie draft completes and its picks are spent — otherwise the app keeps
showing a dead season and never surfaces the new third year.

-----

## Rules Claude Code Must Always Follow

1. **Read this entire file before writing any code in a new session.**
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
   bar above the home indicator. There is no bottom nav — do not add one.
1. **Standalone web app (Add to Home Screen):** `index.html` declares
   `apple-mobile-web-app-capable` + `manifest.webmanifest` (display
   standalone, icons 192/512) so iOS draws the app edge-to-edge instead of
   letterboxing it with black bars. The standalone status bar uses the
   **`apple-mobile-web-app-status-bar-style` meta set to `default`**: iOS
   draws an opaque status bar and **auto-contrasts the clock/battery text to
   the appearance** (black on a light appearance, white on dark), so the bar
   matches the header in both themes with no hand-drawn strip. The bar color
   comes from **two static `prefers-color-scheme` `theme-color` metas** (light
   `#E7E9EC`, dark `#101013` — each matching the header). They must be static:
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
1. **Shared components:** `ErrorState`, `SectionHeader`, and `SubTabBar` live in
   `src/components/shared/` — import them, never redefine them locally. Section
   sub-navigation is always `SubTabBar` (pass it a `tabs` array); never
   hand-roll a sub-tab row.
1. **Design System library:** All new UI comes from `src/components/ui`
   (`Button`, `IconButton`, `Card`, `Sheet`/`SheetHeader`, `Chip`, `Badge`,
   `Input`/`SearchInput`, `Select`, `cn`, plus the re-exported shared
   primitives) — import
   from the `'../ui'` barrel. Never reintroduce a hand-rolled button, card,
   bottom sheet, filter chip, badge, or input inline; extend a primitive
   instead. Run `/design-review` before committing component work.
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

-----

## Future Features (Do Not Build Yet)

> **"What's next?" is answered by `docs/open-items.md`** — which currently points
> at `docs/build-plan-2026-09.md`, the owner-approved active work queue. It is
> the living backlog
> of deferred work, each item with the trigger condition that makes it ready.
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
  2026**, so all historical bids must be normalized to percent-of-budget.
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
- Lineup efficiency season review → My Team › Season Review
- Playoff odds / rest-of-season simulator (engine + page) → League › Playoffs
  (Feature 14); strength-of-schedule outlook is subsumed by it. Odds feed
  Trade Analyzer Layer 3, Trade Partner Finder (buyer/seller flags), and The
  Edge (briefing item)
- League-wide news feed page → News section (Feature 15)
- Claude Design visual refresh → the "Primetime Blackout" rebrand
  (Navigation Refactor Phase 3, shipped 2026-07-20) — see Design System