---
name: dynastyedge-data-contracts
description: >
  The definitive catalog of every data contract in DynastyEdge: all Sleeper API
  endpoints the app calls (URL templates, owning hooks, cache discipline,
  fields consumed, quirks), the FantasyCalc /values/current contract and its
  four immutable query params, the static JSON feeds published by GitHub
  Actions (news.json, values-history.json, trade-values.json — exact schemas),
  the unofficial ESPN endpoints, every dynastyedge_* localStorage/sessionStorage
  key, constants.js, and runtime static assets (public/rankings.json). Load
  this when touching any fetch, hook, or feed; adding or changing a data
  source; changing FANTASYCALC_PARAMS or any URL; debugging wrong/missing/stale
  data, blank rosters, missing sparklines, or news that won't show; writing or
  editing scripts/*.mjs that produce the feeds; adding/renaming a storage key;
  or working on sign-in/identity (useIdentity). This is the WHAT; the
  architecture-contract skill is the WHY.
---

# DynastyEdge Data Contracts

Everything in this file was derived from the repo source on **2026-07-05**
(src/constants.js, every src/hooks/*.js, scripts/*.mjs, cross-checked against
CLAUDE.md's Data Sources section). Where CLAUDE.md and code disagree, code
wins and the divergence is flagged. Re-verify with the greps at the bottom
before trusting volatile facts.

## When NOT to use this skill

- Deciding **whether** a change is allowed, how to land it, or CLAUDE.md
  update policy → `dynastyedge-change-control`.
- Understanding **why** the caching/no-backend architecture is shaped this
  way → `dynastyedge-architecture-contract`.
- Running/triggering the GitHub Actions pipelines, force-push mechanics of
  the orphan branches → `dynastyedge-run-and-operate` (this skill documents
  the *formats* those pipelines write).
- Pure UI work that doesn't touch a fetch, hook, feed, or storage key →
  `design-review` skill and the Design System section of CLAUDE.md.
- Fantasy-football domain concepts (Superflex, taxi, FAAB) →
  `dynasty-fantasy-reference`.

## Non-negotiable rules (the whole catalog in five lines)

1. **Every network call goes through `src/utils/fetchJSON.js`** — default
   timeout **15000 ms**, AbortController-backed, throws
   `"{label} {status}: {url}"` on HTTP error and `"{label} timed out — …"` on
   abort. Never call raw `fetch()` for an API. (Two sanctioned raw-`fetch`
   exceptions: `DraftBoard.jsx` loading same-origin static assets
   `rankings.json` and the FantasyPros CSV via `import.meta.env.BASE_URL`,
   both `.catch(() => {})` best-effort.)
2. **All player IDs are strings at ingestion.** Sleeper returns numbers or
   strings depending on endpoint; `useLeague.js` normalizes with `String(id)`
   and drops `'0'` placeholders. Every lookup/join key is a string sleeperId.
3. **Join key between Sleeper and FantasyCalc is `player.sleeperId`.** Sleeper
   gives numeric IDs only; names come from FantasyCalc, falling back to the
   trimmed player DB. Unranked players show value `—` and contribute 0.
4. **Sleeper rate limit: stay under 1,000 calls/minute.** The heaviest burst
   is `useLeagueHistory` (≈ 18 tx buckets + users + rosters + drafts per past
   season, up to 8 seasons) — still far under the limit, but don't add loops
   that fetch per-player against Sleeper.
5. **Best-effort feeds (news, value history, trade archive, ESPN) must never
   show an error, loading state, or retry loop.** They resolve to `[]`/`null`
   and the UI section hides. Core data (Sleeper league + FantasyCalc) gets
   loading + `ErrorState` + retry.

## fetchJSON timeout overrides in use (as of 2026-07-05)

| Call | timeoutMs |
|---|---|
| Default (everything unlisted) | 15000 |
| FantasyCalc `/values/current` (`useFantasyCalc`) | 30000 |
| Sleeper `/players/nfl` (`usePlayerDB`) | 45000 |
| Sleeper season stats (`usePlayerIntel`) | 30000 |
| Sleeper weekly stats (`usePlayerIntel`) | 20000 |
| News feed (`loadNewsFeed`) | 10000 |
| ESPN per-player news (`loadEspnNews`) | 8000 |

-----

## 1. Sleeper API catalog

Base: `SLEEPER_BASE = 'https://api.sleeper.app/v1'`. No auth. Read-only.
League ID: `1313933520715907072` (constant `LEAGUE_ID`).

### Endpoints, owners, cache discipline

| Endpoint (URL template) | Owning hook(s) / caller | Cache discipline |
|---|---|---|
| `/league/{LEAGUE_ID}` | `useSleeper` · `useLeagueHistory` | Once per app load; App.jsx refetches on tab focus when data > 30 min old (`STALE_AFTER_MS = 30*60*1000`, stale-while-revalidate) |
| `/league/{prevId}` (chain) | `useLeagueHistory` | Lazy, once/session; walks `previous_league_id` until `null`/`'0'`, capped at `MAX_SEASONS_BACK = 8` hops |
| `/league/{id}/rosters` | `useSleeper` (current) · `useLeagueHistory` (past) | Same as owner |
| `/league/{id}/users` | `useSleeper` · `useLeagueHistory` | Same as owner |
| `/league/{LEAGUE_ID}/traded_picks` | `useSleeper` | Once/load + 30-min SWR |
| `/state/nfl` | `useSleeper` · `useLineupData` | Once/load (useSleeper); per-mount (useLineupData) |
| `/league/{LEAGUE_ID}/matchups/{week}` | `useSleeper` (current week, in-season only) · `useLineupHistory` (weeks 1..lastWeek) · `usePlayoffOdds` (weeks 1..`playoff_week_start`−1) | useSleeper: once/load. useLineupHistory: session cache keyed `${rosterId}:${lastWeek}`. usePlayoffOdds: session cache keyed by season; each week `.catch(() => [])` |
| `/league/{id}/transactions/{week}` | `useTransactions` (current league) · `useLeagueHistory` (past seasons) | All 18 buckets in parallel, each `.catch(() => [])`; session module cache |
| `/league/{id}/drafts` | `useSleeperDraft` · `useLeagueHistory` | useSleeperDraft: session cache + manual refresh + focus refetch (stale > 10 s while `drafting`/`paused`, > 5 min otherwise) + 30 s poll while `drafting` and tab visible |
| `/draft/{draft_id}/picks` | `useSleeperDraft` · `useLeagueHistory` | Best-effort `.catch(() => [])` |
| `/draft/{draft_id}/traded_picks` | `useSleeperDraft` | Best-effort `.catch(() => [])` |
| `/players/nfl` (~5–8 MB) | `usePlayerDB` (`loadPlayerDB`) | **Once per session**, module cache; raw response trimmed then discarded (see field list below). Never fetch anywhere else |
| `/players/nfl/{playerId}` | `usePlayerNews` (`fetchPlayerNews`) | Per-player Map cache; failure → green flag, silent |
| `/user/{username}` | `LoginScreen.jsx` (sign-in only) | On submit only; reads `user_id` |
| `/projections/nfl/regular/{season}/{week}` | `useLineupData` | Per-mount, in-season only |
| `/schedule/nfl/regular/{season}` | `useLineupData` | Per-mount, in-season only |
| `/stats/nfl/regular/{year}` | `usePlayerIntel` (`loadSeasonStats`) | Lazy (first profile open), session cache per year |
| `/stats/nfl/regular/{year}/{week}` | `useLineupData` (prev week, defense ranks) · `usePlayerIntel` (last 3 weeks) | useLineupData per-mount; usePlayerIntel session cache per `${year}-${week}` |

### Response fields the code actually consumes

- **`/league/{id}`**: `settings.waiver_budget` (default 100),
  `settings.trade_deadline`, `settings.playoff_week_start` (default 15),
  `settings.playoff_teams` (default 6), `previous_league_id`, `season`.
- **`/rosters`**: `roster_id`, `owner_id`, `players[]`, `starters[]`
  (order matters — indices match `ROSTER_SLOTS` in constants.js),
  `reserve[]` (IR), `taxi[]`, and `settings.{wins, losses, ties, fpts,
  fpts_decimal, fpts_against, fpts_against_decimal, waiver_budget_used}`.
  **Records and points come from `roster.settings` — no extra call.**
  Points-for = `fpts + fpts_decimal/100`.
- **`/users`**: `user_id`, `username`, `display_name`, `avatar`,
  `metadata.team_name`, `metadata.avatar` (custom team avatar URL).
  Team name resolution: `metadata.team_name || display_name || username`
  (title-cased) — `getTeamName` in `useLeague.js`.
- **`/traded_picks`**: `season`, `round`, `roster_id` (**original** owner),
  `owner_id` (**current** owner). One entry per moved pick (current state,
  not a history). Any pick absent from this list is still owned by its
  original roster. Resolution lives in `utils/pickCapital.js`
  (`resolvePickOwnership`, key format `"season-round-originalRosterId"`).
- **`/state/nfl`**: `season_type` (`!== 'regular'` ⇒ offseason mode),
  `week`, `season`. usePlayerIntel also checks `season_type === 'post'`.
- **`/matchups/{week}`**: `matchup_id` (groups the two sides), `roster_id`,
  `points`, `players[]`, `players_points{}` (per-player scores — the raw
  material for lineup efficiency), `starters[]`. usePlayoffOdds treats a
  week as complete only when **every** entry has `points > 0`.
- **`/transactions/{week}`**: only `status === 'complete'` kept; `type`
  (`'trade'`/waiver/free_agent), `status_updated` (epoch ms, sort key),
  `transaction_id`, `adds{}` (playerId → rosterId), `drops{}`,
  `draft_picks[]` (`{season, round, roster_id, owner_id, previous_owner_id}`),
  `settings.waiver_bid` (winning FAAB bid), `roster_ids[]`.
- **`/drafts`**: `draft_id`, `season`, `type` (`'snake'`/`'auction'` —
  useSleeperDraft skips auctions), `status` (`pre_draft`/`drafting`/`paused`/
  `complete`), `slot_to_roster_id` (null until Sleeper sets the order),
  `settings.rounds` (default 4), `settings.teams`, `draft_order` (fallback
  when `slot_to_roster_id` missing — used by managerAnalysis).
- **`/draft/{id}/picks`**: pick list with `round`, `draft_slot`, `pick_no`,
  `roster_id`, `player_id`, `metadata` — consumed by useSleeperDraft (live
  feed) and managerAnalysis (resolving traded picks into drafted players).
- **`/draft/{id}/traded_picks`**: in-draft pick trades — `season`, `round`,
  `roster_id` (original), `owner_id` (current); merged into
  `buildDraftOrder`.
- **`/players/nfl`** — `usePlayerDB` keeps exactly these 10 fields per
  player and discards the rest (verified in `usePlayerDB.js`):
  `name` (joined `first_name` + `last_name`), `position`, `team`, `age`,
  `years_exp`, `injury_status`, `espn_id`, `depth_chart_position`,
  `depth_chart_order`, `news_updated`. **If you need another field, add it
  to this trim list — consumers never see the raw response.**
- **`/players/nfl/{playerId}`** (usePlayerNews only): `injury_status`,
  `injury_body_part`, `injury_notes` → three-tier flag (red: out/ir/
  doubtful/pup/sus; yellow: questionable; green otherwise).
- **`/stats/nfl/regular/{year}[/{week}]`**: `pts_half_ppr`, `gp`,
  `gms_active`, `pass_att`, `rush_att`, `rec_tgt`. Positional finishes are
  ranked **client-side** from `pts_half_ppr`.
- **`/projections/nfl/regular/{season}/{week}`** and
  **`/schedule/nfl/regular/{season}`** (`week`, `home_team`, `away_team` —
  bye detection = teams absent from that week's games): consumed by
  `useLineupData` / `utils/projections.js`.

### Sleeper quirks that cause real bugs

- **IDs flip between string and number by endpoint.** Always `String(id)`
  at ingestion. `useLeague.resolveRoster` also filters out `'0'` (empty
  starter slot placeholder) and dedupes.
- **`roster_id` vs `owner_id`**: roster IDs are per-season; `owner_id`
  (user_id) is stable across seasons — manager identity is keyed by
  `owner_id` (see `useManagerProfiles`).
- **Rookie detection**: `years_exp === 0` is authoritative; fallback
  `years_exp == null && age <= 25` catches freshly drafted players
  (`useSleeperRookies`).
- **`previous_league_id`** may be `null` or the string `'0'` — both end the
  history chain.

-----

## 2. FantasyCalc contract

Base: `FANTASYCALC_BASE = 'https://api.fantasycalc.com'`. One endpoint:

```
GET /values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5
```

**The four params (`FANTASYCALC_PARAMS` in constants.js) are immutable:
`isDynasty=true`, `numQbs=2` (Superflex), `numTeams=10`, `ppr=0.5` (Half
PPR). Changing any one silently reprices every player and pick in the whole
app — forbidden without explicit owner sign-off.** The same literal query
string is duplicated in `scripts/snapshot-values.mjs` and
`scripts/snapshot-trade-values.mjs` — if params ever change (they shouldn't),
all three places must change together.

Fetched once per app load via `useFantasyCalc` (module cache, 30 s timeout),
refreshed by App.jsx's 30-min stale-while-revalidate focus refetch. Response
is a flat **array**; the hook throws if it isn't an array or produces an
empty playerMap (guards against silent shape change → blank rosters).

Fields read per entry (verified in `useFantasyCalc.js`):

| Field | Use |
|---|---|
| `player.sleeperId` | **Join key** — present ⇒ player row; absent ⇒ pick row |
| `player.name` | Display name (also the pick's name, e.g. `"2026 Mid 1st"`) |
| `player.position` | QB/RB/WR/TE |
| `player.maybeTeam` | NFL team abbr (may be missing → `''`) |
| `player.maybeAge` | Decimal age (may be missing → `null`) |
| `player.experience` | Years of experience — **read by code but NOT listed in CLAUDE.md's field table** (used for rookie detection in FreeAgentsView; code wins) |
| `value` | 0–10000 dynasty value, `Math.round`ed — display whole numbers only |
| `overallRank` / `positionRank` | Ranks |
| `trend30Day` | 30-day delta; arrows: > 50 ↑ green, < −50 ↓ red, else → grey |

The hook splits the response into `playerMap` (string sleeperId → player)
and `pickEntries` (`{name, value}` for entries with no sleeperId — picks like
"2026 Early 1st"). Pick pricing uses median-of-round via
`utils/pickCapital.js` `findPickValue`.

**Bans and gotchas (as of 2026-07-05):**

- **Never use FantasyCalc's `rookiesOnly` endpoint** — it returned
  non-rookies (verified comment in `src/hooks/useRookieADP.js`). Rookie ADP
  is derived locally: Sleeper `years_exp === 0` class re-ranked by
  FantasyCalc `overallRank` (`utils/rookieAdp.js`).
- FantasyCalc has no rookie-specific ADP field and no per-player time series
  (only the `trend30Day` scalar) — that's why the values-history pipeline
  exists.
- **Sign-in must never depend on FantasyCalc**: `useLeague` exposes
  Sleeper-only `signInRosters` so a FantasyCalc outage can't lock the user
  out.

-----

## 3. Static feeds (GitHub Actions → orphan branches → raw.githubusercontent.com)

All three URLs live in constants.js. raw.githubusercontent.com sends
`Access-Control-Allow-Origin: *` and has a **~5-minute CDN cache** — a
just-pushed feed can serve stale for a few minutes. All three readers are
**strictly best-effort**: fetch failure / missing branch / bad shape ⇒
`null`/`[]`, UI hides, no error, no retry, and a per-session `failed` flag
prevents re-fetch loops.

### 3a. `NEWS_FEED_URL` → news.json (branch `news-data`)

Writer: `scripts/fetch-news.mjs`, run by `.github/workflows/news.yml`
(cron `17,47 * * * *` + `workflow_dispatch`, as of 2026-07-05); force-pushes
a single-commit branch. Exits 1 (keeping the previous feed) only when ALL
five sources (ESPN news API, FantasyPros RSS, Yahoo RSS, ESPN RSS, CBS RSS)
return nothing. Dedupe by normalized headline, newest first,
`MAX_ITEMS = 100`.

Schema (verified against writer and readers):

```json
{
  "updatedAt": "ISO-8601",
  "items": [
    {
      "headline": "string (required, non-empty)",
      "story": "string, ≤ 600 chars (MAX_STORY), HTML stripped",
      "published": "ISO-8601 | null",
      "source": "ESPN | FantasyPros | Yahoo | CBS",
      "link": "validated http(s) URL | null",
      "athleteIds": [123456]
    }
  ]
}
```

`athleteIds` is populated only by the ESPN API source (from article
`categories` with `type === 'athlete'`); RSS items get `[]`. Readers:
`loadNewsFeed` in `usePlayerIntel.js` (one fetch/session, 10 s timeout,
`.catch(() => [])`), consumed by `usePlayerIntel`, `useLeagueNews`,
`useNewsFeed`. Player matching: ESPN athlete id ↔ playerDB `espn_id` first,
then normalized full name (≥ 6 chars, must contain a space) in the headline,
longest name wins.

### 3b. `VALUES_HISTORY_URL` → values-history.json (branch `values-history`)

Writer: `scripts/snapshot-values.mjs`, run by
`.github/workflows/values-history.yml` (cron `41 9 * * *` +
`workflow_dispatch`, as of 2026-07-05). Columnar format, verified in both
writer and reader:

```json
{
  "updatedAt": "ISO-8601",
  "dates": ["YYYY-MM-DD", "..."],
  "players": { "<sleeperId>": [4200, null, 4310, "..."] }
}
```

- Each player array is index-aligned to `dates`; `null` = no snapshot that
  day (player outside top-500, or missed run).
- Rolling window `MAX_DAYS = 90`; `MAX_PLAYERS = 500` by current value —
  already-tracked players keep their row until it is all-null.
- One column per UTC day; a re-run on the same day **replaces** that column
  (idempotent).
- Reader: `useValueHistory` (lazy first-consumer-mount, session cache).
  Shape guard: `Array.isArray(data.dates) && data.players`.
  `getSeries(sleeperId)` strips nulls and returns `null` below
  **`MIN_SPARKLINE_POINTS = 4`** (exported from `useValueHistory.js`) —
  fewer points draw as a misleading straight segment, so sparklines hide.

### 3c. `TRADE_VALUES_URL` → trade-values.json (same `values-history` branch)

Writer: `scripts/snapshot-trade-values.mjs` (same workflow,
`continue-on-error`). Archives asset values for trades completed in the last
`RECENT_DAYS = 8`; **never pruned, never overwrites an existing trade entry**
(trades are immutable). The script aborts (exit 1) if it can't load the
previous archive for any reason other than 404 — data-loss guard; the
workflow's publish step re-fetches the old file when the script fails.

Schema (verified in writer + `useTradeTimeValues`):

```json
{
  "updatedAt": "ISO-8601",
  "trades": {
    "<transaction_id>": {
      "date": "YYYY-MM-DD",
      "players": { "<sleeperId>": 3550 },
      "picks": { "<season>-<round>-<originalRosterId>": 900 }
    }
  }
}
```

Pick key format matches `pickCapital.js` ownership keys. Pick values are
median-of-round from named FantasyCalc pick entries at archive time. Reader:
`useTradeTimeValues.getTradeTimeTotals(trade)` returns `{gotThen, gaveThen}`
or `null` when the trade isn't archived **or any non-FAAB asset is missing**
(partial totals would mislead). FAAB assets skip valuation.

-----

## 4. ESPN unofficial endpoints (best-effort bonus only)

`ESPN_BASE = 'https://site.api.espn.com'`,
`ESPN_WEB_BASE = 'https://site.web.api.espn.com'`. Used only in
`usePlayerIntel.loadEspnNews` as a fallback when the aggregated feed has no
items for a player:

- Primary: `{ESPN_BASE}/apis/fantasy/v2/games/ffl/news/players?playerId={espnId}&limit=3`
- Fallback: `{ESPN_WEB_BASE}/apis/common/v3/sports/football/nfl/athletes/{espnId}/news?limit=3`

Both are **CORS-blocked in practice from the browser** — they cost nothing
and degrade silently (`.catch(() => [])`, 8 s timeout, per-espnId session
cache). `parseEspnItems` handles both response shapes (`{feed}` v2 and
`{articles}` v3). Never build a feature that depends on these succeeding.
The server-side news script also hits
`https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50`
(works there — no CORS in Actions).

-----

## 5. Browser storage registry (definitive, as of 2026-07-05)

Derived from `grep -rn "dynastyedge_" src`. All keys prefixed `dynastyedge_`.

| Key | Store | Owner | Shape | Wiped when |
|---|---|---|---|---|
| `dynastyedge_theme` | local | `useTheme` (also read pre-React in `main.jsx`) | `'dark'` \| `'light'` | Never |
| `dynastyedge_identity_v1` | local | `useIdentity` | `{userId: string\|null, rosterId: number}` — invalid unless `rosterId` is a number | On logout (`clearIdentity`) |
| `dynastyedge_watchlist_v1` | local | `useWatchlist` | JSON array of string sleeperIds | Never |
| `dynastyedge_action_dismissals` | local | `RosterActionItems.jsx` | JSON object map | **Wiped on identity switch** (`ROSTER_SCOPED_LOCAL` in useIdentity.js) |
| `dynastyedge_edge_last_visit` | local | `useLastVisit` | epoch-ms number as string | Never (bumped on first read each session) |
| `dynastyedge_board_order` | local | `DraftBoard.jsx` (keys in `draft/boardStorage.js`) | JSON array (My Board order) | Never |
| `dynastyedge_prospect_notes` | local | `DraftBoard.jsx` + `DraftTracker.jsx` (shared) | JSON object map (sleeperId → note) | Never |
| `dynastyedge_csv_rankings` | local | `DraftBoard.jsx` | `{version: 1, savedAt: epoch-ms, columns: [...]}` | Removed when last CSV column deleted |
| `dynastyedge_draft_tracker_2026` | local | `DraftTracker.jsx` (template `dynastyedge_draft_tracker_${DRAFT_SEASON}`, DRAFT_SEASON = `PICK_YEARS[0]`) | JSON array of manually logged picks | Never |
| `dynastyedge_trade_draft` | **session** | `TradeAnalyzer.jsx` | in-progress trade object | **Wiped on identity switch** (`ROSTER_SCOPED_SESSION`); nav-state preloads take priority over it |
| `dynastyedge_league_sort` | **session** | `LeagueOverview.jsx` | sort mode string | Session end |
| `dynastyedge_league_pos` | **session** | `LeagueOverview.jsx` | position filter string | Session end |
| `dynastyedge_league_tier` | **session** | `LeagueOverview.jsx` (also **written** by `EdgeView.jsx` tier chips) | tier string | Session end |

**Identity-switch wipe (verified in `useIdentity.js`):** exactly two keys are
roster-scoped and cleared by both `setIdentity` and `clearIdentity` —
`dynastyedge_action_dismissals` (local) and `dynastyedge_trade_draft`
(session). League-wide caches and all other keys survive a switch. If you
add a new key that encodes "which team I am," add it to
`ROSTER_SCOPED_LOCAL`/`ROSTER_SCOPED_SESSION` in the same commit.

All storage access is wrapped in try/catch (private-mode Safari) — keep that
pattern; storage failure must degrade to in-memory behavior, never crash.

### Runtime static assets (same-origin, in `public/`)

| Asset | Reader | Shape / notes |
|---|---|---|
| `public/rankings.json` | `DraftBoard.jsx` via raw `fetch(BASE_URL + 'rankings.json')` | `{version: 1, savedAt?: epoch-ms, columns: []}` — synced CSV ranking columns; remote wins only when `remote.savedAt > local.savedAt`; committed via Claude Code to sync devices |
| `public/FantasyPros_2026_Rookies_OP_Rankings.csv` | `DraftBoard.jsx` raw `fetch` | Pre-loaded FantasyPros rookie ranking column |
| Sleeper avatar CDN `https://sleepercdn.com/avatars/thumbs/{avatar}` | `TeamAvatar.jsx` | Static `<img>` only — not a fetch, never goes through fetchJSON; must render gradient-initial fallback on error |

-----

## 6. constants.js walkthrough (src/constants.js)

| Export | Role |
|---|---|
| `LEAGUE_ID` | `'1313933520715907072'` — the one league; also hardcoded (deliberately, no imports in Actions scripts) in `scripts/snapshot-trade-values.mjs` |
| `MY_ROSTER_ID` (6) / `MY_USERNAME` / `MY_TEAM_NAME` | **Legacy — original-owner reference only.** Runtime identity comes from `useIdentity` (localStorage `dynastyedge_identity_v1`, set on the login screen); "am I this team?" checks use `myRosterId` from LeagueContext. Do not write new code against `MY_ROSTER_ID` |
| `SLEEPER_BASE` / `FANTASYCALC_BASE` | API bases |
| `ESPN_BASE` / `ESPN_WEB_BASE` | Unofficial ESPN bases (best-effort news only) |
| `NEWS_FEED_URL` / `VALUES_HISTORY_URL` / `TRADE_VALUES_URL` | The three static feeds (section 3) |
| `FANTASYCALC_PARAMS` | The four immutable market params (section 2) |
| `PICK_YEARS` | `['2026','2027','2028']` — pick-capital horizon; `PICK_YEARS[0]` is `DRAFT_SEASON` (useSleeperDraft, DraftTracker storage key). Rolls forward once a year |
| `POSITIONS` | `['QB','RB','WR','TE']` |
| `ROSTER_SLOTS` | Ordered starting-slot spec — **indices match Sleeper's `starters` array positions**: QB, RB, RB, WR, WR, TE, FLEX×3, SFLX, DEF |

-----

## 7. "Add a new data source" checklist

1. **Fetch through `fetchJSON` only** (default 15 s timeout; pass a `label`
   and, for big payloads, a higher `timeoutMs`). Raw `fetch` is allowed only
   for same-origin static assets in `public/`.
2. **Pick the cache discipline deliberately** (match an existing tier):
   - *Once/load + 30-min SWR focus refresh* — core league data
     (useSleeper/useFantasyCalc pattern, wired in App.jsx).
   - *Lazy once/session module cache* — expensive or frozen data
     (usePlayerDB, useTransactions, useLeagueHistory, useValueHistory,
     usePlayoffOdds schedule). Module-level `cache` + `promise` +
     (for best-effort) `failed` flag.
   - *Per-mount* — cheap weekly data (useLineupData).
   - *Session cache + polling* — only live drafts (useSleeperDraft).
3. **Decide the failure contract up front**: core data → loading state +
   shared `ErrorState` + retry (never a blank screen). Enrichment feeds →
   strictly best-effort: `.catch(() => null/[])`, UI section hides, never an
   error/retry/spinner.
4. **Normalize IDs to strings at ingestion** (`String(id)`), join on
   sleeperId only.
5. **Handle offseason**: check `nflState.season_type !== 'regular'` and skip
   in-season-only fetches (useLineupData pattern).
6. **CORS reality check**: browsers can only reach APIs that send CORS
   headers (Sleeper, FantasyCalc, raw.githubusercontent.com do). Anything
   else must go server-side via a GitHub Actions script → orphan branch →
   raw URL (news/values pattern) — there is no backend, ever.
7. **No new npm dependencies** (owner's law).
8. **Same-commit doc updates**: CLAUDE.md's Data Sources section AND the
   catalog in this skill file. If the source is a new pipeline, also update
   `dynastyedge-run-and-operate`.
9. **Real-data verification** before claiming done: hit the endpoint with
   curl (or in-app) and confirm the fields you consume actually exist —
   never code against imagined response shapes.

-----

## 8. Live-endpoint spot checks (requires open network)

**The Claude Code sandbox proxy may 403 these hosts — these commands were
NOT run to produce this file; run them from an unrestricted environment.
Never claim you ran them if you didn't.**

```bash
# Sleeper — state, league, rosters (records live in settings)
curl -s https://api.sleeper.app/v1/state/nfl | head -c 300
curl -s https://api.sleeper.app/v1/league/1313933520715907072 | head -c 400
curl -s https://api.sleeper.app/v1/league/1313933520715907072/rosters | head -c 400
curl -s https://api.sleeper.app/v1/league/1313933520715907072/traded_picks | head -c 300

# FantasyCalc — the exact production query (params immutable)
curl -s 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5' | head -c 500

# Static feeds (~5-min CDN cache; 404 = branch/pipeline not yet run)
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json | head -c 400
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json | head -c 400
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/values-history/trade-values.json | head -c 400
```

-----

## Provenance and maintenance

Everything above was read from repo source on 2026-07-05. Before relying on
a volatile fact, re-verify in seconds (all local, no network):

```bash
# Storage-key registry still complete?
grep -rn "dynastyedge_" /home/user/dynastyedge/src --include="*.js" --include="*.jsx"

# Endpoint catalog still complete? (every consumer of every base/URL constant)
grep -rn "SLEEPER_BASE}\|FANTASYCALC_BASE\|ESPN_BASE\|ESPN_WEB_BASE\|NEWS_FEED_URL\|VALUES_HISTORY_URL\|TRADE_VALUES_URL" /home/user/dynastyedge/src | grep -v import

# Any raw fetch() bypassing fetchJSON? (only DraftBoard static assets + TeamAvatar <img> are sanctioned)
grep -rn "fetch(" /home/user/dynastyedge/src --include="*.jsx" --include="*.js" | grep -v fetchJSON

# Constants + immutable market params
sed -n '1,56p' /home/user/dynastyedge/src/constants.js
grep -n "FANTASYCALC_PARAMS\|values/current" /home/user/dynastyedge/src/hooks/useFantasyCalc.js /home/user/dynastyedge/scripts/snapshot-values.mjs /home/user/dynastyedge/scripts/snapshot-trade-values.mjs

# Feed schemas: writers vs readers
grep -n "MAX_ITEMS\|MAX_STORY\|athleteIds" /home/user/dynastyedge/scripts/fetch-news.mjs
grep -n "MAX_DAYS\|MAX_PLAYERS" /home/user/dynastyedge/scripts/snapshot-values.mjs
grep -n "MIN_SPARKLINE_POINTS" /home/user/dynastyedge/src/hooks/useValueHistory.js
grep -n "RECENT_DAYS\|picks\[" /home/user/dynastyedge/scripts/snapshot-trade-values.mjs

# playerDB trim list (fields kept from /players/nfl)
sed -n '24,40p' /home/user/dynastyedge/src/hooks/usePlayerDB.js

# Identity wipe list
grep -n "ROSTER_SCOPED" /home/user/dynastyedge/src/hooks/useIdentity.js

# History chain cap + tx buckets
grep -n "MAX_SEASONS_BACK\|TX_WEEKS" /home/user/dynastyedge/src/hooks/useLeagueHistory.js

# Pipeline crons
grep -n "cron" /home/user/dynastyedge/.github/workflows/news.yml /home/user/dynastyedge/.github/workflows/values-history.yml

# rookiesOnly ban rationale
sed -n '1,10p' /home/user/dynastyedge/src/hooks/useRookieADP.js
```

If any grep output disagrees with this catalog, **the code wins** — update
this file (and CLAUDE.md if its Data Sources section drifted) in the same
commit as the change that caused the drift.
