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
|Navigation|React Router v7 |Side drawer menu, 7 sections       |
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
|My team name         |Nix Cage                                       |
|My Sleeper username  |chnates                                        |
|My roster ID         |**6** — always use this when fetching my roster|
|My owner ID          |965787707299430400                             |

### Roster slots

QB · RB · RB · WR · WR · TE · FLEX × 3 (RB/WR/TE) · Superflex (QB/WR/RB/TE) · DEF
12 bench · 5 taxi · 2 IR

**Taxi rules (Sleeper settings):** only rookies can be *added*, but taxi
duration is **2 years** — a player may stay through their rookie and 2nd-year
seasons. Players entering their 3rd NFL season (`years_exp >= 2`) must be
activated before the regular season starts (taxi deadline: start of regular
season). Taxi action items flag `years_exp >= 2`, never 2nd-year players.

**No kicker in this league.**

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
|NFL schedule                   |`/schedule/nfl/regular/{year}`                   |
|League drafts (rookie draft sync)|`/league/1313933520715907072/drafts`           |
|Live draft picks / in-draft pick trades|`/draft/{draft_id}/picks` · `/draft/{draft_id}/traded_picks`|
|League history (manager scouting)|`/league/{id}` → `previous_league_id` chain, then per past season: users · rosters · transactions · drafts + picks (lazy, once per session, via `useLeagueHistory`)|

**Critical Sleeper note:** Roster endpoints return **numeric player IDs only** —
not names. Player names are resolved by matching Sleeper IDs against FantasyCalc
data (which includes a `sleeperId` field). This is the bridge between the two APIs.
Always use `sleeperId` as the join key (normalized to strings). Players FantasyCalc
doesn't rank fall back to the shared player DB for name/position and display `—`
as their value.

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
- **Peak window:** `utils/peakWindows.js` (shared with Roster Analysis).
- All fetches are lazy (first profile open) and session-cached — nothing at
  app load.

-----

### Player news pipeline (GitHub Actions + multi-source aggregation)

News sources (ESPN, FantasyPros, Yahoo, CBS) block browser/CORS access, so
news is aggregated **server-side in GitHub Actions** and served as a static
file — keeping the no-backend architecture:

- `.github/workflows/news.yml` runs twice an hour (cron `17,47 * * * *`,
  plus manual `workflow_dispatch`). It runs `scripts/fetch-news.mjs`, which
  tries five sources (ESPN news API, FantasyPros player-news RSS, Yahoo RSS,
  ESPN RSS, CBS RSS), merges + dedupes to ≤100 items, and **force-pushes a
  single-commit `news-data` branch** containing `news.json`. Each item
  carries `headline`, `story` (≤600 chars), `published`, `source`,
  `link` (validated http(s) article URL or null), and `athleteIds`.
- Every source is best-effort; the script only fails (keeping the previous
  feed) when all sources return nothing.
- The app fetches `NEWS_FEED_URL`
  (`raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json` —
  sends CORS `*`, ~5 min CDN cache) once per session in `usePlayerIntel`.
- **Player matching:** ESPN API items carry `athleteIds` (matched against
  `espn_id` from the Sleeper player DB); all other items match by normalized
  full player name in the headline. ESPN tags roundup columns with *every*
  athlete mentioned, so a multi-player article can surface on a player the
  headline isn't about — by design (we'd rather show the buried blurb than
  miss it). The article sheet flags this case explicitly.
- **News items are tappable everywhere they appear** (profile drawer
  "Latest News", The Edge "Headlines") → `NewsArticleSheet`, a bottom sheet
  (z-60, layers above the profile drawer) with the full stored story, a
  "Read full article" link when the item has one (opens the source site —
  in-app Safari sheet on the home-screen app), a multi-player-roundup note
  when `athleteIds.length > 2`, and (from The Edge) a "View profile" action.
  Full articles are never embedded — sources block cross-origin framing.
- If the feed has no items for a player, the client falls back to ESPN's
  unofficial per-player endpoints (`site.api.espn.com/apis/fantasy/v2/...`,
  `site.web.api.espn.com/apis/common/v3/...`) — these are CORS-blocked in
  practice but cost nothing and degrade silently.
- **News must never block a panel, show an error, or retry-loop.** On any
  failure the news section simply hides.
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
- Pick values also come from FantasyCalc — they appear as players with names
  like “2026 Mid 1st” — include them in the dataset

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
  same logic as the Rookie badge)
- Tap any team card → full roster + picks drill-down (`/roster/teams/:rosterId`)
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

**Layer 2 — Roster fit**
Does what you’re getting fill an actual need (a deficit position)?
Does what you’re giving come from a position where you’re already below
league average — selling depth you genuinely need?
Uses the same positional surplus/deficit logic as Trade Partner Finder.

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

**No saved history.** The in-progress trade survives the session via
sessionStorage, but there is no multi-trade history — that lives in Sleeper.

-----

### Feature 4 — Lineup Optimizer

**Purpose:** Optimize the weekly starting lineup using live projections,
injury status, bye weeks, and matchup quality.

*The Optimizer is the **Lineup** sub-tab under **My Team** (`/roster/lineup`),
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
|Bye weeks                   |Sleeper `/schedule/nfl/regular/{year}`                                                            |
|Matchup quality             |Computed from Sleeper `/stats/nfl/regular/{year}/{week}` — rank each NFL defense vs. each position|
|Dynasty value (secondary)   |FantasyCalc (already cached)                                                                      |

#### Main view

- Current starting lineup displayed with projected points per slot
- Bench displayed with projected points per player
- The gap between starter and best bench option is visible at a glance
- Slots sorted by: starters first, then bench by projected points
- An inline **legend** spells out the matchup pills (Easy / Tough) and status
  dots (set / review / must start) — the `title` tooltips alone aren't legible
  on touch
- When no slot needs action the header shows a positive **"Lineup is optimal —
  no changes needed"** confirmation, so "nothing to do" reads differently from
  "didn't load"

#### Status flags — shown on every player

- 🔴 **Hard block:** Player is Out, on IR, or on bye. Must be replaced. Non-negotiable.
- 🟡 **Soft flag:** Player is Questionable, OR any bench player projects
  higher than the current starter at that slot (flag any positive difference — no minimum threshold).
- 🟢 **Confirmed:** Healthy, highest projected at their slot. No action needed.

#### Free agent layer

- Tap any flagged slot → drawer opens showing top available free agents at that position
- Sort: weekly projection (primary)
- Each free agent shows **both** values side by side:
  - Weekly projected points (from Sleeper)
  - FantasyCalc dynasty value (from cached FantasyCalc data)
- Reason: if two free agents project similarly this week, prefer the one with
  higher dynasty value. Both numbers must be visible to make this call.

#### Matchup quality indicator

Shown on every player in both starting lineup and bench:

- 🟢 **Easy** — opponent defense ranks bottom third against this position
- ⚪ **Neutral** — middle third
- 🔴 **Tough** — top third

Compute rankings fresh each week from Sleeper defensive stats.
Update when the user manually refreshes or opens the Lineup tab.

-----

### Feature 5 — League-Wide Overview

**Purpose:** State-of-the-league dashboard. Understand the full competitive
landscape before making any move. **This is the single all-10-teams list** —
the old Roster › All Teams view was fused in here (it was a strict subset of
this richer dashboard); its `/roster/teams` list route now redirects to
`/league`, while the `/roster/teams/:rosterId` drill-down stays.

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

### Feature 9 — Lineup Efficiency (Lineup › Season Review)

"How many points did I leave on the bench?" — actual vs optimal lineup for
every completed week.

- Optimal lineup computed from `players_points` in past matchups, filling
  single-position slots first, then FLEX, then Superflex (see `utils/lineupHistory.js`)
- Summary card: efficiency % + total points left on bench
- Per-week rows: actual, optimal, delta (green ✓ when optimal, amber/red otherwise)
- Shows during the offseason too (it reviews the completed season)
- Data: `/matchups/{week}` for completed weeks, read from the shared
  matchup-weeks cache (`src/hooks/matchupWeeks.js`, shared with Playoff Odds —
  one fetch per week per session across both). If every week fails to load,
  the page shows an error + retry instead of "no data"
- **Its own sub-tab** under **My Team** (`/roster/season-review`), a sibling of
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
`/league/{id}/drafts` → `/draft/{draft_id}/picks` + `/draft/{draft_id}/traded_picks`.
Real draft order (`slot_to_roster_id` + in-draft pick trades), live pick feed,
on-the-clock banner, "N picks until yours", a My Draft Capital card (real pick
slots + FantasyCalc pick values + taxi usage), and an on-the-clock **Best
Available** card (best overall + top prospect at each deficit position). The
undrafted list has search, position chips, and a My Board / ADP sort toggle so
board prep carries into draft day. Rows open the Player Profile drawer (with
notes). When the draft completes: recap with per-team value drafted, biggest
steals/reaches (pick slot vs rookie ADP), and full results.

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
  talent) → their `/roster/trajectory/:rosterId`; playoff-odds standing
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

**Slot-level pricing:** FantasyCalc lists picks as "2026 Early 1st" /
"Mid" / "Late". When Sleeper has set the draft order (`slot_to_roster_id`,
via `buildDraftOrder` — including in-draft pick trades), every pick maps to
its exact slot (1.01–4.10) and is priced by its round's Early (slots 1–4) /
Mid (5–7) / Late (8–10) tier entry — tiers are ceil-thirds of the round
(`slotTier`: Early runs through `ceil(teams/3)`, i.e. slot 4 in a 10-team
league). Before the order exists, the market
falls back to round-level picks at round medians (`findPickValue`) with a
note that prices upgrade automatically. A price-board card shows each
round's E/M/L prices on top.

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
- Picks (named like "2026 Mid 1st", no `sleeperId`) aren't in `playerMap`, so
  player search covers players only — by design.

-----

### Feature 17 — Dynasty Trajectory (Roster › Trajectory)

**Purpose:** the app's one forward-looking lens. Everything else is a snapshot
of *now* (current values, current odds, *historical* trade grades); a dynasty
is a multi-*year* horizon. Trajectory turns a roster from a value snapshot into
a value curve over the next few seasons and answers the core dynasty question:
**"when does my window peak — am I a buy-now or a build team?"** Works in season
and offseason alike. **Zero new data sources** — pure logic over caches
`LeagueContext` already holds.

**Location:** a **My Team sub-tab** (My Roster · Lineup · Season Review ·
**Trajectory**, `/roster/trajectory`), and **roster-agnostic** — the team
drill-down (`RosterView` for `:rosterId`) carries a "Dynasty Trajectory →" card
that opens `/roster/trajectory/:rosterId`, so you can scout an opponent's window
("this contender's value slams shut after 2026 — they'll sell").

**Consumers (all via `getTrajectoryRead`, zero extra fetch):**
- **Trade Partner Finder:** each opponent card carries a one-line trajectory
  read — "Value peaks now, slides through {year} — selling vets" / "Value
  climbing toward {year} — building" / "Value holds near {year} — balanced
  window". Distinct from the this-season playoff-odds buyer/seller flag.
- **Trade Analyzer Layer 3** (`analyzeTrade`'s optional `opponentTrajectoryRead`):
  when acquiring the partner's players, a declining team reads as a buy window,
  an ascending one as a caution (see Feature 3).
- **The Edge:** a "closing-window opponent" briefing item — the most valuable
  team whose trajectory is declining — deep-links to their
  `/roster/trajectory/:rosterId` (see Feature 12).

**The model (`utils/dynastyTrajectory.js`, pure):**

- **Market age curve per position (`buildAgeCurves`)** — for each position,
  learn what the dynasty market pays at every age *straight from today's
  FantasyCalc pool*: a Gaussian-kernel-smoothed (bandwidth 2.5y) weighted
  *median* of value by age, blended toward a `peakWindows.js`-shaped prior
  (pseudo-count 4) so thin age bins stay sane. No hardcoded decay rates — it
  recalibrates every load as the market moves, matching the "never hardcode
  values" rule.
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
  `getTrajectoryVerdict` reads the peak year + 3-yr change into a plain-English
  window call (ascending / balanced / declining); `seriesDirection` and
  `peakStatusShort` drive the per-position and per-player tags.

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

### Trade deadline banner

The Trade section shows a persistent banner under the sub-tabs during the
regular season (deadline week comes from league settings — Week 13):

- More than 2 weeks out: neutral "Trade deadline: Week 13 · N weeks away"
- 2 weeks or less: amber urgency styling; deadline week says "THIS WEEK"
- After the deadline: muted "Trade deadline passed"
- Hidden entirely in the offseason

-----

## Navigation

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
|5  |Draft   |Board · Tracker                                          |
|6  |News    |League-wide aggregated news feed (browsable — leaf)      |

Sections with multiple views use a sub-tab bar pinned under the app header —
the shared `SubTabBar` component (`src/components/shared/SubTabBar.jsx`), never
a hand-rolled row. It's an adaptive horizontal strip: tabs are `flex-1
min-w-max`, so the row fills the width when the tabs fit and scrolls
horizontally when they don't (long labels never wrap to a second line). The
active tab scrolls into view on navigation, and a right-edge fade appears only
while the row overflows.
The drawer also holds: data freshness timestamp, a feed-age line for the two
Actions-published feeds ("News 26m · Values 12h", from each feed's
`updatedAt` — amber when news > 2h or values > 36h stale, a segment hides
entirely when its feed never loaded; reads the session caches via
`loadNewsFeed` / `loadHistory` on drawer open, zero extra requests), manual
Refresh, and the theme toggle.
The app header shows the active section name.

**Route map (post-refactor).** My-squad views live under `/my-team`
(`/my-team` = My Roster, `/my-team/lineup`, `/my-team/season-review`,
`/my-team/trajectory`). The market / everyone-else views live under `/league`
(`/league` = Overview, `/league/free-agents`, `/league/activity`,
`/league/movers`, `/league/playoffs`). Team **scouting drill-downs** are
standalone routes (no sub-tab bar; header reads "League"):
`/league/teams/:rosterId` (any roster) and `/league/trajectory/:rosterId` (any
team's trajectory). Trade adds `/trade/pick-trades`; Draft is just
`/draft/board` + `/draft/tracker`. Every moved/renamed path keeps a redirect
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
|Draft     |Board · Tracker                                            |
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
│   └── workflows/
│       ├── deploy.yml          ← GitHub Actions auto-deploy (lint + test gate before build)
│       ├── ci.yml              ← lint + test + build on branch pushes / PRs (no deploy)
│       ├── news.yml            ← twice-hourly news aggregation → news-data branch
│       └── values-history.yml  ← daily value snapshot + trade archive → values-history branch
├── scripts/
│   ├── fetch-news.mjs          ← multi-source news fetcher (runs in Actions)
│   ├── snapshot-values.mjs     ← daily FantasyCalc snapshot appender (runs in Actions)
│   └── snapshot-trade-values.mjs ← permanent trade-time value archiver (runs in Actions)
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
│   │   │   └── WhatsFair.jsx
│   │   ├── lineup/                  ← rendered as "My Team" sub-tabs (no own layout)
│   │   │   ├── LineupOptimizer.jsx  ← My Team › Lineup
│   │   │   ├── LineupEfficiency.jsx ← My Team › Season Review: actual vs optimal points
│   │   │   ├── StarterSlot.jsx
│   │   │   └── FreeAgentDrawer.jsx
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
│   │   ├── useLineupData.js     ← projections, statuses, schedule, def stats
│   │   ├── useWatchlist.js      ← starred players (localStorage-backed store)
│   │   ├── useLastVisit.js      ← The Edge's "since your last visit" anchor
│   │   ├── useLeagueNews.js     ← news feed matched to my roster + watchlist
│   │   ├── useNewsFeed.js       ← full aggregated feed for the News section
│   │   ├── useValueHistory.js   ← daily value snapshots for sparklines (best-effort)
│   │   ├── usePlayerIntel.js    ← production stats + depth chart + ESPN news
│   │   ├── useScrollLock.js     ← freezes <main> while a bottom sheet is open
│   │   ├── useSheetDrag.js      ← swipe-down-to-dismiss gesture for bottom sheets
│   │   ├── useTheme.js          ← dark/light toggle
│   │   ├── usePlayerNews.js     ← per-player injury status
│   │   ├── useSleeperRookies.js ← rookie map derived from usePlayerDB
│   │   ├── useSleeperDraft.js   ← live rookie draft sync (order, picks, refresh/polling)
│   │   └── useRookieADP.js
│   ├── utils/
│   │   ├── fetchJSON.js         ← shared fetch wrapper with timeout — use everywhere
│   │   ├── positionColors.js    ← position identity color class maps — use everywhere
│   │   ├── roundColors.js       ← pick round color classes (PickBadge, TeamCard)
│   │   ├── tierColors.js        ← win-window tier colors (badge + banner chips)
│   │   ├── rankColors.js        ← gold/silver/bronze medal colors for rank ordinals
│   │   ├── tradeAnalysis.js     ← trade scoring, verdict logic
│   │   ├── edgeBriefing.js      ← The Edge: signals, briefing items, GM line
│   │   ├── managerAnalysis.js   ← manager scouting: ledgers, tendencies, draft grades
│   │   ├── rosterAnalysis.js    ← positional strength, win window tiers
│   │   ├── dynastyTrajectory.js ← forward value projection: market age curves + pick maturation
│   │   ├── pickCapital.js       ← pick ownership resolution logic
│   │   ├── rookieAdp.js         ← derived rookie-class ADP for the Draft section
│   │   ├── pickTrades.js        ← pick trade calculator: slot pricing + packages
│   │   ├── peakWindows.js       ← position peak-age windows + status helper
│   │   ├── lineupHistory.js     ← optimal-lineup math for efficiency review
│   │   ├── playoffOdds.js       ← scoring model + Monte Carlo + deadline verdict
│   │   └── projections.js       ← lineup optimization, matchup quality
│   ├── context/
│   │   └── LeagueContext.jsx
│   ├── constants.js             ← league ID, my roster ID, API base URLs
│   ├── App.jsx
│   └── main.jsx
├── tests/                       ← plain-Node test suite (node:test + node:assert/strict, zero deps)
│   ├── playoffOdds.test.mjs         ← fixed-seed determinism, Σ odds = playoff teams, verdict thresholds
│   ├── pickCapital.test.mjs         ← pick ownership resolution, round-median pick values, year weights
│   ├── pickTrades.test.mjs          ← slot tiers (as coded), slot pricing fallback, package constraints
│   ├── managerAnalysis.test.mjs     ← past-pick ≈ round-median fallback, ±5% win/loss banding
│   ├── tradeAnalysis.test.mjs       ← verdict ladder, % vs larger side, counter never re-suggests
│   ├── dynastyTrajectory.test.mjs   ← per-year clamps, hold-flat contract, pick maturation
│   ├── lineupHistory.test.mjs       ← optimal-lineup slot-fill order (singles → FLEX → SFLX)
│   ├── matchupWeeks.test.mjs        ← mocked-fetch: one fetch/week across both consumers, all-fail rejection
│   └── transactions.test.mjs        ← mocked-fetch: all-18-buckets-failed rejection, per-bucket degradation
├── index.html
├── eslint.config.js             ← ESLint 9 flat config (recommended + react-hooks, src/ + scripts/)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

**Tests:** `npm test` runs the `tests/` suite — plain `.mjs` scripts on Node's
built-in `node:test` runner with `node:assert/strict`, zero new dependencies
(the sanctioned no-deps pattern). The script registers the module-resolver hook
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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
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
      - uses: actions/deploy-pages@v4
        id: deployment
```

### Vite config

File: `vite.config.js` — set `base` to your repo name:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/dynastyedge/',   // must match your GitHub repo name exactly
})
```

### GitHub Pages setting (one-time, done manually)

In GitHub repo → Settings → Pages → Source: **GitHub Actions**
This only needs to be set once. After that, every push auto-deploys.

-----

## Constants File

`src/constants.js` — never hardcode these values anywhere else:

```js
export const LEAGUE_ID = '1313933520715907072'
export const MY_ROSTER_ID = 6
export const MY_USERNAME = 'chnates'
export const MY_TEAM_NAME = 'Nix Cage'

export const SLEEPER_BASE = 'https://api.sleeper.app/v1'
export const FANTASYCALC_BASE = 'https://api.fantasycalc.com'

export const FANTASYCALC_PARAMS = {
  isDynasty: true,
  numQbs: 2,       // Superflex
  numTeams: 10,
  ppr: 0.5,        // Half PPR
}

export const PICK_YEARS = ['2026', '2027', '2028']
export const POSITIONS = ['QB', 'RB', 'WR', 'TE']
```

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
   **`apple-mobile-web-app-status-bar-style` meta set to
   `black-translucent`**: the bar is transparent, so app content paints
   under it seamlessly — no solid colored band. iOS
   forces white status text in this mode, so in light mode a fixed dark
   strip (`dark:hidden`, height `env(safe-area-inset-top)`, in both
   `App.jsx`'s AppShell and `LoginScreen.jsx`) sits behind the bar to keep
   the clock/battery readable. The meta and the strips are one design —
   never remove either half alone, and never switch the standalone bar to
   the theme-color approach (tried and reverted: iOS standalone doesn't
   honor the live per-theme `theme-color`, so the bar rendered as a solid
   black band). The `theme-color` meta (synced to the app theme by
   `useTheme`) still colors regular Safari's bar area. The fixed header
   still pads with `env(safe-area-inset-top)`. Changes to these metas only
   take effect after the user removes and re-adds the home-screen app.
   Icon link tags carry a `?v=N` query — bump it to bust Safari's per-site
   icon cache when the logo changes.
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
   `dynastyedge_theme` (theme) · `dynastyedge_watchlist_v1` (starred players) ·
   `dynastyedge_action_dismissals` (roster action items) ·
   `dynastyedge_edge_last_visit` (The Edge's last-visit timestamp) ·
   `dynastyedge_draft_*` (manual draft tracker) ·
   `dynastyedge_board_order` / `dynastyedge_prospect_notes` /
   `dynastyedge_csv_rankings` (draft board — see Feature 10) ·
   sessionStorage `dynastyedge_league_sort` / `dynastyedge_league_pos` /
   `dynastyedge_league_tier` (League tab filters, preserved across drill-downs) ·
   sessionStorage `dynastyedge_trade_draft` (in-progress trade).
1. **Shared components:** `ErrorState`, `SectionHeader`, and `SubTabBar` live in
   `src/components/shared/` — import them, never redefine them locally. Section
   sub-navigation is always `SubTabBar` (pass it a `tabs` array); never
   hand-roll a sub-tab row.
1. **Design System library:** All new UI comes from `src/components/ui`
   (`Button`, `IconButton`, `Card`, `Sheet`/`SheetHeader`, `Chip`, `Badge`,
   `Input`/`SearchInput`, `cn`, plus the re-exported shared primitives) — import
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

These are noted so the codebase is structured to support them later.
Do not implement them until explicitly asked.

- FAAB bid recommender for waiver pickups
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
- Lineup efficiency season review → Lineup › Season Review
- Playoff odds / rest-of-season simulator (engine + page) → League › Playoffs
  (Feature 14); strength-of-schedule outlook is subsumed by it. Odds feed
  Trade Analyzer Layer 3, Trade Partner Finder (buyer/seller flags), and The
  Edge (briefing item)
- League-wide news feed page → News section (Feature 15)
- Claude Design visual refresh → the "Primetime Blackout" rebrand
  (Navigation Refactor Phase 3, shipped 2026-07-20) — see Design System