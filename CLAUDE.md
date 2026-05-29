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
|Navigation|React Router v6 |Bottom tab bar, 4 tabs             |
|Build tool|Vite            |Outputs to `dist/` for GitHub Pages|
|Deployment|GitHub Pages    |Auto-deploys via GitHub Actions    |
|CI/CD     |GitHub Actions  |Triggers on every push to `main`   |

### Non-negotiable rules

- Always use **functional React components with hooks**. Never class components.
- All API calls live in **custom hooks** (`/src/hooks/`) or utility files. Never call APIs directly inside a component render.
- **Mobile-first always.** Every component must look correct at 390px before anything else.
- **FantasyCalc data is fetched once per app load and cached in memory.** Never re-fetch on every render — it is a large response.
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
12 bench · 5 taxi (rookies/2nd-year only) · 2 IR

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
|All rosters + player IDs       |`/league/1313933520715907072/rosters`            |
|All users + team names         |`/league/1313933520715907072/users`              |
|Traded picks                   |`/league/1313933520715907072/traded_picks`       |
|Matchups (week N)              |`/league/1313933520715907072/matchups/{week}`    |
|Transactions (week N)          |`/league/1313933520715907072/transactions/{week}`|
|NFL state (current week/season)|`/state/nfl`                                     |
|Weekly projections             |`/projections/nfl/regular/{year}/{week}`         |
|Weekly stats                   |`/stats/nfl/regular/{year}/{week}`               |
|NFL schedule                   |`/schedule/nfl/regular/{year}`                   |

**Critical Sleeper note:** Roster endpoints return **numeric player IDs only** —
not names. Player names are resolved by matching Sleeper IDs against FantasyCalc
data (which includes a `sleeperId` field). This is the bridge between the two APIs.
Always use `sleeperId` as the join key.

**Offseason detection:** Call `/state/nfl` on app load. If `season_type !== 'regular'`,
hide all in-season UI: current matchups, weekly projections, lineup optimizer flags.
The app still works fully in the offseason — it just hides irrelevant weekly features.

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

#### League-wide view

- Toggle between “My Team” and “All Teams” at top of screen
- All 10 teams displayed, each with the same detail as your own team view
- Tap any team card → full roster + picks drill-down

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
- Two columns: **“You give”** and **“You get”**

#### Building the trade

- Players must come from actual Sleeper rosters only — no searching all NFL players
- Show the other team’s full roster with a search bar to filter within it
- Picks must come from actual pick inventories only
  (derived from traded_picks data — only show picks each team actually owns)
- Running FantasyCalc value total updates live on both sides as assets are added
- Show 30-day trend arrow on every player added to the trade

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
- **Counter:** Name a specific player or pick (never vague) that would make the trade fair.
  Show what needs to move to which side to get within ~5% raw value.

#### “What’s fair” mode

- User taps a target player on the other team’s roster
- App calculates: what would Nix Cage need to give to make this trade fair?
- Surfaces specific players/picks from Nix Cage’s actual roster as the suggested return
- Apply all three analysis layers to the suggested package too

**No save / no history.** Live analysis only. Trade history lives in Sleeper.

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

> “3 Contending · 4 Middle · 3 Rebuilding”

Single line, always at the top. Immediate landscape read.

#### Team list

**Default:** Vertical list, all 10 teams sorted by total roster value (high to low)

**Sort toggle:** Overall value / Pick capital / FAAB remaining

**Position filter:** Tap QB / RB / WR / TE →
List switches to a **horizontal swipeable ranking** sorted by that position’s
strength across all 10 teams. Swipe left/right through teams ranked 1–10 at that position.

**Each team card shows:**

- Team name + owner username
- Win window tier badge (Contending / Middle / Rebuilding)
- Total roster value
- Positional strength bars: QB · RB · WR · TE — each shown relative to league average
  (above average = filled, below average = unfilled)
- Pick capital: 2026 / 2027 / 2028 — show count of picks owned per year
- FAAB remaining (from Sleeper roster data, format as `$XXX`)
- **Tap → full roster + picks detail (same as Roster + Picks Viewer drill-down)**

-----

## Navigation

Bottom tab bar — 4 tabs, always visible:

|Tab|Icon|Label |Feature                                     |
|---|----|------|--------------------------------------------|
|1  |🏈   |Roster|Roster + Picks Viewer (defaults to Nix Cage)|
|2  |🔄   |Trade |Trade Partner Finder → Trade Analyzer       |
|3  |📋   |Lineup|Lineup Optimizer                            |
|4  |🏆   |League|League-Wide Overview                        |

Tab bar stays fixed at the bottom. Content scrolls above it.
Active tab is clearly highlighted.

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
|Rebuilding slate    |`#6B7280`                |

#### Light mode

|Role                                 |Value    |
|-------------------------------------|---------|
|Background primary                   |`#FFFFFF`|
|Background secondary                 |`#F4F4F8`|
|Background card                      |`#FAFAFA`|
|Border                               |`#E4E4E8`|
|Text primary                         |`#0D0D0F`|
|Text secondary                       |`#55555F`|
|Accent                               |`#3B6FEF`|
|(All status colors same as dark mode)|         |

### Pick round colors (consistent across entire app)

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

### Typography

- **Display / headers:** `Barlow Condensed` (bold, uppercase for section labels)
- **Body / data:** `IBM Plex Sans` (clean, monospace-adjacent, great for numbers)
- **Numbers / values:** `IBM Plex Mono` for FantasyCalc values and scores

Load from Google Fonts. Both are free.

### Spacing and layout

- Content padding: `16px` left/right on mobile
- Card border radius: `12px`
- Tab bar height: `64px` (includes safe area for iPhone home indicator)
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
│       └── deploy.yml          ← GitHub Actions auto-deploy
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── roster/
│   │   │   ├── RosterView.jsx
│   │   │   ├── PlayerCard.jsx
│   │   │   └── PickBadge.jsx
│   │   ├── trade/
│   │   │   ├── TradePartnerFinder.jsx
│   │   │   ├── TradeAnalyzer.jsx
│   │   │   ├── TradeBuilder.jsx
│   │   │   └── TradeVerdict.jsx
│   │   ├── lineup/
│   │   │   ├── LineupOptimizer.jsx
│   │   │   ├── StarterSlot.jsx
│   │   │   └── FreeAgentDrawer.jsx
│   │   ├── league/
│   │   │   ├── LeagueOverview.jsx
│   │   │   ├── TeamCard.jsx
│   │   │   └── MatchupCard.jsx
│   │   └── shared/
│   │       ├── BottomNav.jsx
│   │       ├── ThemeToggle.jsx
│   │       ├── WinWindowBadge.jsx
│   │       ├── TrendArrow.jsx
│   │       └── LoadingSpinner.jsx
│   ├── hooks/
│   │   ├── useSleeper.js        ← all Sleeper API calls
│   │   ├── useFantasyCalc.js    ← FantasyCalc fetch + cache
│   │   └── useLeague.js         ← combined league state, player resolution
│   ├── utils/
│   │   ├── tradeAnalysis.js     ← trade scoring, verdict logic
│   │   ├── rosterAnalysis.js    ← positional strength, win window tiers
│   │   ├── pickCapital.js       ← pick ownership resolution logic
│   │   └── projections.js       ← lineup optimization, matchup quality
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
1. **Tab bar safe area:** Bottom nav must account for iPhone home indicator.
   Use `pb-safe` or `padding-bottom: env(safe-area-inset-bottom)`.
1. **Error states:** Every API call needs a loading state and an error state.
   Never show a blank screen. If an API call fails, show a message and a retry button.
1. **Theme toggle:** Stored in `localStorage` key `dynastyedge_theme`.
   Default to `dark` if no preference is stored. Apply theme class to `<html>` element.
1. **The app name is DynastyEdge.** Use it in the page `<title>`,
   the header, and any loading/splash screen.

-----

## Future Features (Do Not Build Yet)

These are noted so the codebase is structured to support them later.
Do not implement them until explicitly asked.

- Player news feed (injury reports, beat reporter updates)
- FAAB bid recommender for waiver pickups
- Claude Design visual refresh
- Rookie draft board and ADP tracker
- Push notifications for trade offers (requires backend — out of scope for v1)