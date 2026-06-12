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
|CI/CD     |GitHub Actions  |Triggers on every push to `main`   |

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
Waiver claims include the winning FAAB bid in `settings.waiver_bid`.

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
  activity — any push re-enables it.

-----

### Value history pipeline (GitHub Actions + daily snapshots)

FantasyCalc only exposes a single `trend30Day` scalar — no time series. Real
per-player value history is accumulated by a daily snapshot, same
architecture as the news pipeline:

- `.github/workflows/values-history.yml` runs daily (cron `41 9 * * *`, plus
  `workflow_dispatch`). It runs `scripts/snapshot-values.mjs`, which fetches
  FantasyCalc, appends today's column to the rolling history, and
  force-pushes a single-commit `values-history` branch containing
  `values-history.json`.
- **Format is columnar** to stay mobile-sized:
  `{ updatedAt, dates: ['YYYY-MM-DD', …], players: { sleeperId: [v|null, …] } }`
  — arrays aligned to `dates`. Rolling window: 90 days, top 500 players by
  current value (players already tracked keep their row until it's all-null).
  One column per UTC day; re-runs on the same day replace that column.
- The app fetches `VALUES_HISTORY_URL` lazily (first consumer mount) once per
  session via `useValueHistory`. `getSeries(sleeperId)` returns the non-null
  points, or `null` when fewer than 2 exist.
- **Strictly best-effort:** history starts accumulating the day the pipeline
  ships. Missing branch / bad shape / fetch failure ⇒ sparklines simply hide.
  Never show an error or a loading state for history.
- `Sparkline` (shared component) renders the series as a tiny SVG polyline —
  green when net-up over the window, red when net-down, muted when flat.
- The same workflow also runs `scripts/snapshot-trade-values.mjs`
  (`continue-on-error`), which archives asset values for trades completed in
  the last 8 days into `trade-values.json` on the same branch — permanent
  (never pruned), read lazily via `useTradeTimeValues` for the manager
  scouting ledger's "at trade time" line (see Feature 11). The publish step
  re-fetches the previous archive when the script fails so it's never erased.

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

- Lives in the Roster section sub-tabs: **My Roster · All Teams · Free Agents**
- All Teams: all 10 teams ranked by total value, with record and win-window badge
- Free Agents: search + position filter + **Upgrades Only** and **Hide Rookies**
  toggles (both default off; rookie detection = Sleeper `years_exp === 0` with
  the age≤25 fallback, same logic as the Rookie badge)
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
- **Tap → opens Trade Analyzer pre-loaded with this team selected**

-----

### Feature 3 — Trade Analyzer

**Purpose:** Evaluate any trade proposal with a verdict, then build or refine offers.

#### Setup

- Nix Cage always pre-loaded as “Your team”
- Other team: selected from dropdown, OR pre-loaded when tapping from Trade Partner Finder
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
Does what you’re giving hurt a position of strength?
Uses the same positional surplus/deficit logic as Trade Partner Finder.

**Layer 3 — Win window fit**
Are you acquiring the right type of asset for where Nix Cage is now?

- Contending → favor proven players, not picks or unproven youth
- Rebuilding → favor picks and young players, not aging veterans

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

*This feature is hidden entirely during the offseason.*
*Detect via `/state/nfl` → `season_type !== 'regular'`.*

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
landscape before making any move.

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
- Rows show a **sparkline** when the values-history feed has ≥ 2 snapshots
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
- Data: `/matchups/{week}` for completed weeks, cached per session

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

### Feature 11 — Manager Scouting (League › Managers)

Behavioral trading profiles for every manager, built from **every season of
league history** — the intel layer behind "who do I call?". Plus a report
card on me: how am I actually doing, and what should I work on?

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
(never pruned, never overwritten — trades are immutable). The publish step
re-fetches the previous archive if the script fails, so a bad run can't
erase it. The app loads it lazily via `useTradeTimeValues`; when a ledger
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

- **Hero (gradient card):** time-of-day greeting + dateline, a generated
  assistant-GM summary line ("2 items on your desk · 3 new league moves"),
  team value in the brand gradient with a 30-day trend (sum of player
  `trend30Day`, % vs baseline) and a team-value sparkline (per-player history
  rows summed with last-known-value carry-forward — best-effort, hides
  without history). Chips: value rank (medal colors), win-window tier badge,
  record (when it exists), FAAB. Value taps to My Roster; chips tap to League.
- **Action Items:** the shared `RosterActionItems` component, reused as-is
  (dismissals included).
- **Your Briefing:** up to 5 prioritized items from `buildBriefing`, each
  deep-linking somewhere: live/paused rookie draft → Tracker; trade deadline
  ≤ 2 weeks → Trade; `pre_draft` rookie draft → Board; N league moves since
  last visit → Activity; best buy-low (falling player at my deficit position,
  rebuilding-owner note) → Analyzer pre-filled as a What's Fair target; best
  sell-high (my riser at a surplus position) → Analyzer pre-loaded in You
  Give; biggest watchlist mover → profile drawer; biggest underperforming
  opponent (record rank trails value rank by ≥ 4, same gap as League
  Overview) → their roster drill-down.
- **Headlines:** news-feed items matched to my roster + watchlist players
  (≤ 5), "New" badge when published after the last visit; tap opens the
  player's profile drawer. Hides entirely when nothing matches — never an
  error (standard news contract).
- **Market Radar:** watchlist movers + my roster's movers (> ±50 trend),
  deduped, ≤ 5 rows with sparklines; tap → profile drawer; footer link to
  League › Movers. Empty state hints at starring players.
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
design decision — do not add a bottom nav.

Side drawer sections:

|#  |Section |Feature                                                  |
|---|--------|---------------------------------------------------------|
|1  |The Edge|Daily briefing home screen (default route)               |
|2  |Roster  |My Roster · All Teams · Free Agents                      |
|3  |Trade   |Partners · Analyzer · Targets (+ deadline banner)        |
|4  |Lineup  |Lineup Optimizer + Season Review (lineup efficiency)     |
|5  |League  |Overview · Activity · Movers · Managers                  |
|6  |Draft   |Rookie draft board · Draft pick tracker                  |

Sections with multiple views use a sub-tab bar pinned under the app header.
The drawer also holds: data freshness timestamp, manual Refresh, and the theme toggle.
The active section is highlighted in the drawer; the app header shows the section name.

-----

## Design System

### Theme

- **Default:** Dark mode
- **Toggle:** Always accessible (top-right corner of app, every screen)
- **Preference stored in:** `localStorage` key `dynastyedge_theme`

The app should feel like a premium sports analytics tool — not a spreadsheet,
not a generic dashboard. Think ESPN app meets Bloomberg terminal: data-dense
but organized, purposeful use of color, confident typography.

### Color palette

#### Dark mode

|Role                |Value                    |
|--------------------|-------------------------|
|Background primary  |`#0D0D0F`                |
|Background secondary|`#16161A`                |
|Background card     |`#1C1C21`                |
|Border              |`#2A2A30`                |
|Text primary        |`#F0F0F5`                |
|Text secondary      |`#8A8A95`                |
|Text tertiary       |`#55555F`                |
|Accent              |`#4F7FFF` (electric blue)|
|Success green       |`#22C55E`                |
|Warning amber       |`#F59E0B`                |
|Danger red          |`#EF4444`                |
|Contending gold     |`#F59E0B`                |
|Middle cyan         |`#22D3EE` (dark) / `#0891B2` (light)|
|Rebuilding indigo   |`#818CF8` (dark) / `#4F46E5` (light)|

#### Light mode

|Role                                 |Value    |
|-------------------------------------|---------|
|Background primary                   |`#F2F4FA` (cool tint so white cards lift)|
|Background secondary                 |`#E9ECF5`|
|Background card                      |`#FFFFFF`|
|Border                               |`#E0E4EE`|
|Text primary                         |`#0D0D0F`|
|Text secondary                       |`#55555F`|
|Text tertiary                        |`#8A8A95`|
|Accent                               |`#3B6FEF`|
|(All status colors same as dark mode)|         |

### Position identity colors (consistent across entire app)

Every position has its own identity color — this is what keeps the app from
feeling monochrome. Tokens live in `index.css` (`--pos-*`), are exposed via
Tailwind (`text-pos-qb`, `bg-pos-rb/15`, …), and all class maps live in
`src/utils/positionColors.js` (`POS_TEXT`, `POS_BG`, `POS_TAG`,
`POS_CHIP_ACTIVE`, `POS_SVG`). **Never hand-roll position colors locally, and
never reuse status colors (success/warning/danger) to mean a position.**

|Position|Dark mode          |Light mode         |
|--------|-------------------|-------------------|
|QB      |`#F472B6` (pink)   |`#DB2777`          |
|RB      |`#2DD4BF` (teal)   |`#0D9488`          |
|WR      |`#38BDF8` (sky)    |`#0284C7`          |
|TE      |`#FB923C` (orange) |`#EA580C`          |
|DEF     |`#A78BFA` (violet) |`#7C3AED`          |

Where they apply:

- Position labels on player rows (roster, free agents, movers, draft, drawers)
- Position rank (`#3 WR`) on PlayerCard and in the Player Profile drawer
- Active position filter chips everywhere (tinted style: `bg-pos-x/15 text-pos-x
  border-pos-x/40`); the All / Picks chips keep the solid accent style
- Positional strength bars + labels on TeamCard (above-average = position color)
- Position group headers in RosterView (accent bar via `SectionHeader`'s
  `accentBar` prop)
- Roster Analysis age-chart lanes (`POS_SVG` for SVG fill/stroke)
- Lineup slot labels (FLEX / Superflex slots keep accent)
- Position tags in the trade builder / What's Fair / lineup FA drawer (`POS_TAG`)

Status colors (success/warning/danger) keep their exclusive meanings:
health/verdicts/flags — a TE label must never read as "danger".

### Pick round colors (consistent across entire app)

Class maps live in `src/utils/roundColors.js` (`ROUND_CLASSES`, `ROUND_TEXT`,
`ROUND_LABELS`) — shared by PickBadge and TeamCard, never redefined locally.

|Round|Dark bg  |Dark text|Light bg |Light text|
|-----|---------|---------|---------|----------|
|1st  |`#3D2E00`|`#F59E0B`|`#FEF3C7`|`#92400E` |
|2nd  |`#0C2A4A`|`#60A5FA`|`#DBEAFE`|`#1E40AF` |
|3rd  |`#2A1A4A`|`#A78BFA`|`#EDE9FE`|`#5B21B6` |
|4th  |`#1F1F25`|`#9CA3AF`|`#F3F4F6`|`#374151` |

### Status / verdict colors (consistent throughout)

|Status                |Color        |When used                                     |
|----------------------|-------------|----------------------------------------------|
|🔴 Hard block / Decline|Danger red   |Out, IR, bye, decline verdict                 |
|🟡 Soft flag / Counter |Warning amber|Questionable, projection flag, counter verdict|
|🟢 Confirmed / Accept  |Success green|Healthy, optimal, accept verdict              |
|🎯 Priority            |Accent blue  |Top trade partner tier                        |
|✅ Good Fit            |Muted green  |Second trade partner tier                     |
|⚪ Poor Fit            |Text tertiary|Lowest trade partner tier                     |

Verdict blocks (Accept/Decline/Counter) use a soft diagonal gradient of their
status color (`from-x/20 via-x/10 to-transparent`), not a flat tint.

### Win window tier colors

Every tier has an identity color — maps live in `src/utils/tierColors.js`
(`TIER_BADGE`, `TIER_TEXT`), shared by `WinWindowBadge` and the League health
banner chips. Never redefine locally.

|Tier      |Color                                   |
|----------|----------------------------------------|
|Contending|Gold (warning amber)                    |
|Middle    |Cyan (`cyan-600` light / `cyan-400` dark)|
|Rebuilding|Indigo (`indigo-600` light / `indigo-400` dark)|

### Rank medals

Ranking ordinals (league value rank, position rank cards, All Teams) color the
top 3 as medals — gold/silver/bronze — via `rankClass(rank)` in
`src/utils/rankColors.js`. Everyone else stays text-tertiary.

### Team avatars

`src/components/shared/TeamAvatar.jsx` shows the owner's Sleeper avatar
everywhere teams appear (team cards, position rankings, All Teams, matchups,
roster hero header, side drawer). Sources, in order: custom team avatar URL
(`user.metadata.avatar`), Sleeper CDN thumb
(`https://sleepercdn.com/avatars/thumbs/{user.avatar}`), then a deterministic
gradient initial circle (hash of team name). Static `<img>` tags only — this
is not an API call, so it doesn't go through `fetchJSON`. Always render the
fallback on image error; never let a broken avatar break a card.

### Ambient background glow

The app shell uses the `.app-bg` class (`index.css`): the flat background plus
two radial glows at the top (accent blue left, violet right) and a fainter
accent glow lower on the screen, all stronger in dark mode. The fixed app
header is translucent (`bg-bg-secondary/85 backdrop-blur-md`) so the glow
reads through it. Bottom sheets and drawers keep their opaque backgrounds.

### Hero cards ("stadium lights" treatment)

The Edge's hero and the Roster view's team header are **full brand-gradient
cards** (`.hero-card` in `index.css`): deep electric blue → violet base with
a violet bloom (top-right) and a cyan hint (bottom-left), plus an accent glow
shadow (stronger in dark mode). All hero content is white-on-gradient: white
text at varying opacities, `bg-white/15 border-white/20` chips, the marquee
value in white with a soft text glow (`.hero-value`), trend deltas as
`bg-white/15` pills with emerald-200/rose-200 text, and the win-window tier
as a white chip with a tier-colored dot (the standard tinted `TIER_BADGE`
doesn't read on the gradient). Top-3 value rank shows in `text-amber-300`
(medal gold).

The treatment rolls through the whole app:

- **Section headers carry a brand-gradient tick by default** —
  `SectionHeader`'s `accentBar` prop defaults to its exported `BRAND_TICK`;
  pass a position/identity color class to override, or `null` for a bare
  header.
- Briefing items (The Edge) and the Roster Analysis button are cards with a
  3px left edge bar + tinted icon medallion in their tone color.
- Trend chips (The Edge, Market Movers) render as filled tinted pills, not
  bare colored text.
- "New"/"You" badges are solid accent with white text everywhere.
- Footer/link buttons ("All market movers →", "Full activity feed →",
  manager ledger buttons, the Movers row Trade button) are accent-tinted
  (`border-accent/25 bg-accent/5`), not gray-bordered.

### Section identity colors (side drawer)

Each nav section has an identity hue (defined inline in `SideDrawer.jsx`):
The Edge accent blue · Roster sky · Trade green · Lineup orange · League gold ·
Draft pink. Icons
always wear the section color; the active item gets the matching tinted
background and edge bar. These are navigation identity only — they carry no
status meaning.

### Logo — the Crown Crest

The mark is a crown built from analytics: three ascending rounded bars
(a rising chart) as the crown's prongs, a jewel dot floating above each tip,
and a detached base band as the circlet. Brand gradient: `#4F7FFF → #A78BFA`
(accent blue → violet, same as the hero cards).

- **In-app lockup:** `src/components/shared/DynastyEdgeLogo.jsx` — gradient
  crown + "DYNASTY**EDGE**" wordmark in Barlow Condensed ("EDGE" in gradient
  text). Used in the side drawer.
- **App icon / favicons:** generated by `node scripts/generate-icons.mjs`
  (sharp + png-to-ico, devDependencies) into `public/`:
  `apple-touch-icon.png` (180px, **full-bleed gradient, no border, no
  pre-rounded corners** — iOS applies its own mask), `favicon-32x32.png`,
  `favicon-16x16.png`, `favicon.ico`, `logo.svg` (rounded gradient square).
- The crown geometry lives in both the component and the script — keep them
  in sync and re-run the script after any change. Never ship an app icon
  with its own border or baked-in rounding (it clips badly on iOS).

### Typography

- **Display / headers:** `Barlow Condensed` (bold, uppercase for section labels)
- **Body / data:** `IBM Plex Sans` (clean, monospace-adjacent, great for numbers)
- **Numbers / values:** `IBM Plex Mono` for FantasyCalc values and scores

Load from Google Fonts. Both are free.

### Spacing and layout

- Content padding: `16px` left/right on mobile
- Card border radius: `12px`
- Side drawer width: `80vw`, max `300px`; respects iPhone safe-area insets
- Section headers: uppercase, 11px, letter-spacing 0.08em, text-secondary color
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
│       ├── deploy.yml          ← GitHub Actions auto-deploy
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
│   │   ├── edge/
│   │   │   └── EdgeView.jsx         ← The Edge: daily briefing home screen
│   │   ├── roster/
│   │   │   ├── RosterLayout.jsx     ← sub-tabs: My Roster / All Teams / Free Agents
│   │   │   ├── RosterView.jsx       ← own roster + drill-down for any team
│   │   │   ├── AllTeamsView.jsx     ← all 10 teams, tap → roster drill-down
│   │   │   ├── FreeAgentsView.jsx
│   │   │   ├── RosterActionItems.jsx
│   │   │   ├── RosterAnalysisSheet.jsx  ← age-lane chart + win window bottom sheet
│   │   │   ├── PlayerCard.jsx
│   │   │   └── PickBadge.jsx
│   │   ├── trade/
│   │   │   ├── TradeLayout.jsx      ← sub-tabs + trade deadline banner
│   │   │   ├── TradePartnerFinder.jsx
│   │   │   ├── TradeAnalyzer.jsx
│   │   │   ├── TradeBuilder.jsx
│   │   │   ├── TradeVerdict.jsx
│   │   │   └── WhatsFair.jsx
│   │   ├── lineup/
│   │   │   ├── LineupOptimizer.jsx
│   │   │   ├── LineupEfficiency.jsx ← season review: actual vs optimal points
│   │   │   ├── StarterSlot.jsx
│   │   │   └── FreeAgentDrawer.jsx
│   │   ├── league/
│   │   │   ├── LeagueLayout.jsx     ← sub-tabs: Overview / Activity / Movers / Managers
│   │   │   ├── LeagueOverview.jsx
│   │   │   ├── LeagueActivity.jsx   ← transaction feed (trades, waivers, FAAB bids)
│   │   │   ├── MarketMovers.jsx     ← risers/fallers, buy-low / sell-high
│   │   │   ├── ManagersView.jsx     ← manager scouting: my report card + opponent profiles
│   │   │   ├── ManagerScoutingSheet.jsx ← per-manager sheet: ledger, drafts, tendencies
│   │   │   ├── TeamCard.jsx
│   │   │   └── MatchupCard.jsx
│   │   ├── draft/
│   │   │   ├── DraftLayout.jsx
│   │   │   ├── DraftBoard.jsx       ← rookie board: tiers, My Board, CSV columns
│   │   │   ├── DraftTracker.jsx     ← Sleeper-synced live tracker + manual fallback
│   │   │   └── boardStorage.js      ← shared draft-section localStorage keys
│   │   └── shared/
│   │       ├── SideDrawer.jsx       ← the app's only navigation
│   │       ├── ErrorState.jsx       ← THE error component — never duplicate it
│   │       ├── SectionHeader.jsx    ← THE section header — never duplicate it
│   │       ├── PlayerProfileDrawer.jsx
│   │       ├── NewsArticleSheet.jsx    ← tappable news reader bottom sheet
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
│   │   ├── useLeague.js         ← combined league state, player resolution
│   │   ├── useTransactions.js   ← season-wide transaction feed
│   │   ├── useLeagueHistory.js  ← walks previous_league_id chain: past seasons' tx/drafts
│   │   ├── useManagerProfiles.js← composes history + current season into scouting profiles
│   │   ├── useTradeTimeValues.js← trade-time value archive for the ledger (best-effort)
│   │   ├── useLineupHistory.js  ← my past matchups for efficiency review
│   │   ├── useLineupData.js     ← projections, statuses, schedule, def stats
│   │   ├── useWatchlist.js      ← starred players (localStorage-backed store)
│   │   ├── useLastVisit.js      ← The Edge's "since your last visit" anchor
│   │   ├── useLeagueNews.js     ← news feed matched to my roster + watchlist
│   │   ├── useValueHistory.js   ← daily value snapshots for sparklines (best-effort)
│   │   ├── usePlayerIntel.js    ← production stats + depth chart + ESPN news
│   │   ├── useScrollLock.js     ← freezes <main> while a bottom sheet is open
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
│   │   ├── pickCapital.js       ← pick ownership resolution logic
│   │   ├── rookieAdp.js         ← derived rookie-class ADP for the Draft section
│   │   ├── peakWindows.js       ← position peak-age windows + status helper
│   │   ├── lineupHistory.js     ← optimal-lineup math for efficiency review
│   │   └── projections.js       ← lineup optimization, matchup quality
│   ├── context/
│   │   └── LeagueContext.jsx
│   ├── constants.js             ← league ID, my roster ID, API base URLs
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

-----

## GitHub Pages Deployment

Every push to `main` triggers an automatic build and deploy. No manual steps ever.

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
          node-version: 20
          cache: npm
      - run: npm ci
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
   letterboxing it with black bars. **No `apple-mobile-web-app-status-bar-style`
   meta** — modern iOS colors the standalone status bar from the
   `theme-color` meta (synced to the app theme by `useTheme`) and picks
   readable text automatically, so the bar matches the header in both
   themes. The fixed header still pads with `env(safe-area-inset-top)` as a
   harmless fallback. Changes to these metas only take effect after the
   user removes and re-adds the home-screen app. Icon link tags carry a
   `?v=N` query — bump it to bust Safari's per-site icon cache when the
   logo changes.
1. **Bottom sheets:** The app's scroll container is `<main>` — the body never
   scrolls. Every bottom sheet (PlayerProfileDrawer, RosterAnalysisSheet,
   trade add sheet, and any future sheet) must: call `useScrollLock()` while
   mounted (prevents iOS scroll chaining to the page behind), set
   `overscroll-behavior: contain` on its scroll container, and pad its bottom
   with `env(safe-area-inset-bottom)`.
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
1. **Shared components:** `ErrorState` and `SectionHeader` live in
   `src/components/shared/` — import them, never redefine them locally.
1. **The app name is DynastyEdge.** Use it in the page `<title>`,
   the header, and any loading/splash screen.

-----

## Future Features (Do Not Build Yet)

These are noted so the codebase is structured to support them later.
Do not implement them until explicitly asked.

- League-wide news feed page (per-player ESPN news is built into the
  Player Profile drawer; a browsable all-news feed is not)
- FAAB bid recommender for waiver pickups
- Claude Design visual refresh
- Playoff strength-of-schedule view (Weeks 15–17 matchup outlook for starters)
- Push notifications for trade offers (requires backend — out of scope for v1)

### Already built (formerly future features)

- Rookie draft board and ADP tracker → Draft section
- Injury-status player news → PlayerProfileDrawer + trade analysis
- Player intelligence panel (production, depth chart, peak window, ESPN news)
  → PlayerProfileDrawer + trade Live Intelligence (`usePlayerIntel`)
- League transaction feed with FAAB bids → League › Activity
- Market movers / buy-low / sell-high → League › Movers
- Watchlist (star players, surfaced in Trade Partners) → `useWatchlist`
- Lineup efficiency season review → Lineup › Season Review