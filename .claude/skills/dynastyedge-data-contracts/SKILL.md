---
name: dynastyedge-data-contracts
description: >
  The definitive catalog of every data contract in DynastyEdge: all Sleeper API
  endpoints the app calls (URL templates, owning hooks, cache discipline,
  fields consumed, quirks), the FantasyCalc /values/current contract and its
  four immutable query params, the static JSON feeds published by GitHub
  Actions (news.json, values-history.json, trade-values.json,
  rookie-intel.json — exact schemas),
  the unofficial ESPN endpoints, every dynastyedge_* localStorage/sessionStorage
  key, constants.js, and runtime static assets (public/rankings.json). Load
  this when touching any fetch, hook, or feed; adding or changing a data
  source; changing FANTASYCALC_PARAMS or any URL; checking what shape a feed
  or endpoint is SUPPOSED to have when debugging wrong/missing data, blank
  rosters, missing sparklines, or news that won't show; writing or
  editing scripts/*.mjs that produce the feeds; adding/renaming a storage key;
  or working on sign-in/identity (useIdentity). This is the WHAT (schemas and
  contracts); the architecture-contract skill is the WHY.
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
| `/league/{id}/drafts` | `useSleeperDraft` · `useLeagueHistory` | useSleeperDraft: session cache + manual refresh + focus refetch (stale > 10 s while `drafting`/`paused`, > 5 min otherwise) + 30 s poll while `drafting` and tab visible. **Omits `slot_to_roster_id` — see below** |
| `/draft/{draft_id}` | `useSleeperDraft` | Best-effort `.catch(() => null)`, merged OVER the listed object. **The only source of `slot_to_roster_id`** |
| `/draft/{draft_id}/picks` | `useSleeperDraft` · `useLeagueHistory` | Best-effort `.catch(() => [])` |
| `/draft/{draft_id}/traded_picks` | `useSleeperDraft` | Best-effort `.catch(() => [])` |
| `/players/nfl` (~5–8 MB) | `usePlayerDB` (`loadPlayerDB`) | **Once per session**, module cache; raw response trimmed then discarded (see field list below). Never fetch anywhere else |
| `/players/nfl/{playerId}` | `usePlayerNews` (`fetchPlayerNews`) | Per-player Map cache; failure → green flag, silent |
| `/user/{username}` | `LoginScreen.jsx` (sign-in only) | On submit only; reads `user_id` |
| `/projections/nfl/regular/{season}/{week}` | `useLineupData` | Per-mount, in-season only |
| `/schedule/nfl/regular/{season}` | `useLineupData` | Per-mount, in-season only. **`SLEEPER_ROOT` — NOT under `/v1`** (the `/v1` path 404s for every season). Best-effort `.catch(() => [])` |
| `/stats/nfl/regular/{year}` | `usePlayerIntel` (`loadSeasonStats`) | Lazy (first profile open), session cache per year |
| `/stats/nfl/regular/{year}/{week}` | `useLineupData` (prev week, defense ranks) · `usePlayerIntel` (last 3 weeks) | useLineupData per-mount, best-effort `.catch(() => ({}))`; usePlayerIntel session cache per `${year}-${week}`. **Carries no `pos`/`opp`/`tm` — see below** |

### Response fields the code actually consumes

- **`/league/{id}`**: `settings.waiver_budget` (default 100; **$1000 for 2026,
  $100 for 2023–25 — always read it, never assume**, and note it **RESETS
  TWICE A LEAGUE YEAR**: offseason, then again at the regular-season start,
  unspent offseason money lost. Sleeper exposes ONE number for both periods,
  so `bid ÷ waiver_budget` is exact either side of the reset, but a season
  TOTAL spans two budgets — see CLAUDE.md League Context),
  `settings.trade_deadline`, `settings.playoff_week_start` (default 15),
  `settings.playoff_teams` (default 6), `previous_league_id`, `season`.
- **`/rosters`**: `roster_id`, `owner_id`, `players[]`, `starters[]`
  (order matters — indices match `ROSTER_SLOTS` in constants.js),
  `reserve[]` (IR), `taxi[]`, and `settings.{wins, losses, ties, fpts,
  fpts_decimal, fpts_against, fpts_against_decimal, waiver_budget_used}`.
  **Records and points come from `roster.settings` — no extra call.**
  **`waiver_budget_used` is the CURRENT PERIOD ONLY**, which is why
  `leagueState.js`'s `faabRemaining = waiver_budget − waiver_budget_used` is
  correct and must never be "reconciled" against a transaction-log total.
  Measured live 2026-09-20: one owner had spent **$703** in the offseason and
  his `waiver_budget_used` read **$0** — both true, different questions.
  Points-for = `fpts + fpts_decimal/100`.
- **`/users`**: `user_id`, `username`, `display_name`, `avatar`,
  `metadata.team_name`, `metadata.avatar` (custom team avatar URL).
  Team name resolution: `metadata.team_name || display_name || username`
  (title-cased) — `getTeamName` in `useLeague.js`.
- **`/traded_picks`**: `season`, `round`, `roster_id` (**original** owner),
  `owner_id` (**current** owner). One entry per moved pick (current state,
  not a history). Any pick absent from this list is still owned by its
  original roster. Resolution lives in `utils/pickCapital.js`
  (`resolvePickOwnership`, key format `"season-round-originalRosterId"`) and
  takes the **live** pick window as an argument — it has no season default,
  deliberately (see `PICK_YEARS` in the constants table).
  **Sleeper never removes a spent season's entries**: `/traded_picks` still
  carried 2026 rows after the 2026 draft completed. It is the window, not this
  endpoint, that decides which seasons are live.
- **`/state/nfl`**: `season_type` (`!== 'regular'` ⇒ offseason mode),
  `week`, `season`. usePlayerIntel also checks `season_type === 'post'`.
- **`/matchups/{week}`**: `matchup_id` (groups the two sides), `roster_id`,
  `points`, `players[]`, `players_points{}` (per-player scores — **also the
  live box score the Lineup Optimizer prices a LOCKED slot at**, exposed as
  `weeklyPlayerPoints` on `LeagueContext` and fetched by `mcp/liveScores.js` on
  the server; a played game is fact and outranks both the projection and the
  blocked-scores-0 rule. The raw
  material for lineup efficiency), `starters[]`. usePlayoffOdds treats a
  week as complete only when **every** entry has `points > 0`.
- **`/transactions/{week}`**: only `status === 'complete'` kept; `type`
  (`'trade'`/waiver/free_agent), `status_updated` (epoch ms, sort key),
  `transaction_id`, `adds{}` (playerId → rosterId), `drops{}`,
  `draft_picks[]` (`{season, round, roster_id, owner_id, previous_owner_id}`),
  `settings.waiver_bid` (winning FAAB bid), `roster_ids[]`.
- **`/drafts`**: `draft_id`, `season`, `type` (`'snake'`/`'auction'` —
  useSleeperDraft skips auctions), `status` (`pre_draft`/`drafting`/`paused`/
  `complete`), `slot_to_roster_id` (**absent from the `/drafts` LIST endpoint
  entirely** — only `/draft/{draft_id}` carries it),
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
  `depth_chart_order`, `news_updated`. The **MCP server's** trim
  (`mcp/snapshot.js`) is a smaller mirror and additionally keeps
  **`injury_body_part`** and **`injury_notes`** — the two fields that turn a
  bare "Doubtful" into "Doubtful · Knee - Meniscus · Surgery". **If you need another field, add it
  to this trim list — consumers never see the raw response.**
- **`/players/nfl/{playerId}`** (usePlayerNews only): `injury_status`,
  `injury_body_part`, `injury_notes` → three-tier flag (red: out/ir/
  doubtful/pup/sus; yellow: questionable; green otherwise).
- **`/stats/nfl/regular/{year}[/{week}]`**: `pts_half_ppr`, `gp`,
  `gms_active`, `pass_att`, `rush_att`, `rec_tgt`. Positional finishes are
  ranked **client-side** from `pts_half_ppr`.
- **`/projections/nfl/regular/{season}/{week}`**: `pts_half_ppr` (present for
  ~1,000 of ~9,400 entries — the rest are ADP-only rows).
- **`/schedule/nfl/regular/{season}`**: `week`, **`home`, `away`**, **`status`**,
  `date`, `game_id`. `home`/`away` are NOT `home_team`/`away_team`, and it is
  NOT under `/v1`. **`status` is `pre_game` → `in_game` → `complete`, and it is
  load-bearing**: Sleeper seals a lineup slot at kickoff, so `parseLockedTeams`
  (`utils/projections.js`) reads it to stop the Optimizer offering moves that
  cannot be made. Both `parseByeTeams` implementations discarded it until
  2026-09-20 — see the failure-archaeology skill. Bye detection = teams absent
  from that week's games. Consumed by `useLineupData` / `utils/projections.js`.

### Sleeper quirks that cause real bugs

- **The schedule endpoint is not under `/v1`.** `/v1/schedule/nfl/regular/{y}`
  404s for every season (verified 2026-08-08 against 2024/2025/2026); the
  working path is `https://api.sleeper.app/schedule/...` (`SLEEPER_ROOT`). Its
  fields are `home`/`away`. Both mistakes fail *silently* — wrong field names
  just yield "no games" — and together they took out bye detection, opponent
  lookup, and (because the fetch was unguarded) the whole Lineup Optimizer.
- **Weekly stats carry no `pos`/`opp`/`tm`.** All three are `null` on every
  entry in every season checked (2022–2026). Anything needing a player's
  position, team, or opponent must join to `usePlayerDB` (which keeps
  `position` + `team`) and to the schedule. `computeDefenseRankings` does
  exactly this; keying off the stats fields returns an empty ranking and every
  matchup silently reads "Neutral".
- **`/league/{id}/drafts` omits `slot_to_roster_id`.** Only `/draft/{draft_id}`
  has it, so `useSleeperDraft` fetches both and merges. Without it
  `buildDraftOrder` returns `null`, which disables the Tracker's entire live
  path (on-the-clock banner, pick countdown, Best Available, slot pricing) with
  no error anywhere.

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

The hook splits the response into `playerMap` (**numeric** sleeperId →
player) and `pickEntries` (picks — entries whose `sleeperId` is non-numeric,
like `FP_2027_1`/`DP_0_8`, or absent). The split is by **ID shape, not mere
presence**: FantasyCalc began stamping synthetic ids on picks, and splitting
on presence dumped every pick into `playerMap` and priced all picks at 0.

Pick pricing uses median-of-round via `utils/pickCapital.js` `findPickValue`.
**A season's pick entries are RETIRED the moment its rookie draft completes**
— verified live 2026-09-07, three days after this league's 2026 draft: all 24
pick entries were 2027/2028/2029. So `findPickValue` legitimately returns 0
for a spent pick, and any surface showing one must fall back rather than print
a blank: `buildDraftPickIndex` (what the pick became) then
`buildGenericRoundValues` (round median across every listed season, marked ≈).
Both live in `pickCapital.js` and are shared by League › Activity and the
manager scouting ledger.

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

All four **app-read** URLs live in constants.js. The `values-history` branch
also carries two files the app **never fetches** — `values-archive.json`
(§3e) and `values-consensus.json` (§3f) — which exist only for offline
analysis and so have no constant and cost the phone nothing.
raw.githubusercontent.com sends
`Access-Control-Allow-Origin: *` and has a **~5-minute CDN cache** — a
just-pushed feed can serve stale for a few minutes. All four readers are
**strictly best-effort**: fetch failure / missing branch / bad shape ⇒
`null`/`[]`, UI hides, no error, no retry, and a per-session `failed` flag
prevents re-fetch loops.

### 3a. `NEWS_FEED_URL` → news.json (branch `news-data`)

Writer: `scripts/fetch-news.mjs`, run by `.github/workflows/news.yml`
(cron `17,47 * * * *` + `workflow_dispatch`, as of 2026-07-05; schedules +
60-day auto-disable ops canonical: `dynastyedge-run-and-operate`);
force-pushes a single-commit branch.

**The feed ACCUMULATES (rewritten 2026-09-04).** It is no longer a snapshot of
one fetch: the workflow checks the previously published `news.json` out of the
`news-data` branch **via git** (not the raw CDN — that caches ~5 min and would
hand a run back its own grandparent) into `news-prev.json`, and the script
merges into it. Retention: **player items 7 days / 240 max, general items 48
hours / 80 max** (`PLAYER_MAX`, `PLAYER_MAX_AGE_MS`, `GENERAL_MAX`,
`GENERAL_MAX_AGE_MS`) — roughly 100 KB. Dedupe by normalized headline; **later
copies win on content, but the first `published` we recorded stands**, so an
item cannot float back to the top by being re-listed. Exits 1 (keeping the
published feed) only when no source returned anything AND nothing was retained.

Ten sources as of 2026-09-22 — ESPN news API, RotoWire *page*, RotoWire
RSS, Yardbarker, PFF, The Athletic, PFT, CBS, Sporting News, Yahoo.
FantasyPros was removed (all three endpoints dead); ESPN RSS was removed
2026-09-22 (it answers GitHub's runners with an empty HTTP 202). Adoption rationale and the
ten rejected candidates: `docs/analysis/news-sources-2026-09.md`.

Schema (verified against writer and readers, 2026-09-04):

```json
{
  "updatedAt": "ISO-8601",
  "coverage": {
    "total": 207,
    "playerItems": 127,
    "withPlayerIds": 120,
    "withAthleteIds": 62,
    "spanHours": 159,
    "sources": { "ESPN API": 50, "RotoWire page": 25, "ESPN RSS": 0 },
    "sourceMisses": { "ESPN RSS": 14 }
  },
  "items": [
    {
      "headline": "string (required, non-empty)",
      "story": "string, ≤ 600 chars (MAX_STORY), HTML stripped",
      "published": "ISO-8601 | null",
      "source": "ESPN | RotoWire | Yardbarker | PFF | The Athletic | PFT | CBS | Sporting News | Yahoo",
      "link": "validated http(s) URL | null",
      "athleteIds": [123456],
      "playerIds": ["4984"],
      "isPlayerNews": true
    }
  ]
}
```

**`playerIds` is the join, not `athleteIds`.** The writer resolves every item
against Sleeper's player DB server-side (ESPN athlete id first, then
normalized full name across headline **and** story) and stamps the matched
**Sleeper** ids. This exists because **`espn_id` is null for 17 of the owner's
26 rostered spots** — the old id-first design could not reach most of a
dynasty roster by anything but a headline name. `athleteIds` is still enriched
from name matches, so a consumer predating `playerIds` keeps working; RSS
items with no resolvable player still get `[]`.

`coverage` is published for diagnostics and as a baseline for the next
measurement. **No app code reads it yet** (open item `NEWS-2`);
`scripts/dev/news-coverage.mjs` does.

Readers: `loadNewsFeed` in `usePlayerIntel.js` (one fetch/session, 10 s
timeout, `.catch(() => [])`), consumed by `usePlayerIntel`, `useLeagueNews`,
`useNewsFeed`. **Player matching order in all three:** `playerIds` →
`athleteIds` ↔ playerDB `espn_id` → normalized full name (≥ 6 chars, must
contain a space) in the headline, longest name wins.

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
      "picks": { "<season>-<round>-<originalRosterId>": 900 or null }
    }
  }
}
```

Pick key format matches `pickCapital.js` ownership keys. Pick values walk the
app's ladder at archive time — that season's round median, then the generic
round median across every season listed, then **`null`**.

> **A pick value is NEVER 0, and a 0 you find in this file is a known bug's
> output.** Classification and pricing live in `scripts/fantasyCalcValues.mjs`
> (shared by all three snapshot scripts, pinned by
> `tests/fantasyCalcValues.test.mjs`). Before 2026-09-21 this script
> classified FantasyCalc entries by `if (sid)`, which stopped recognising
> picks the moment FantasyCalc gave them synthetic non-numeric ids — so every
> pick archived as 0 for two months. The reader's "any missing asset hides the
> line" guard catches a `null` and **does not catch a 0**, so a 0 renders as a
> confident wrong total. The script now rewrites any archived 0 to null on the
> next run. See failure-archaeology §3d.

Reader:
`useTradeTimeValues.getTradeTimeTotals(trade)` returns `{gotThen, gaveThen}`
or `null` when the trade isn't archived **or any non-FAAB asset is missing**
(partial totals would mislead). FAAB assets skip valuation.

### 3d. `ROOKIE_INTEL_URL` → rookie-intel.json (branch `rookie-intel`)

Writer: `scripts/snapshot-rookie-intel.mjs`
(`.github/workflows/rookie-intel.yml`, daily `23 10 * * *`). Reader:
`src/hooks/useRookieIntel.js` → Draft › Research (Feature 19) and the side
drawer's data-status block.

**Upstream is nflverse, not an API the app can call.** Three GitHub release
CSVs — `draft_picks.csv`, `roster_{season}.csv`, `depth_charts_{season}.csv`
(~39MB) — plus Sleeper `/state/nfl` and `/players/nfl`. They are CORS-blocked
and far too large for a phone, which is the whole reason the workflow exists.

**The nflverse→Sleeper join is resolved in the writer**, so the app only ever
sees Sleeper player IDs:

1. `roster_{season}.csv`'s **`sleeper_id` column** is authoritative (covers
   the drafted class; UDFAs lack it).
2. Normalized-name fallback, with suffixes stripped (`Jr`/`II`/…) and an
   initial+surname key for nicknames (`Matthew Hibner` → `Matt Hibner`).
3. **Every name-based match is position-guarded.** The name indices are built
   from rookies only, so a veteran sharing a surname and first initial looks
   unambiguous — Jordan Love (QB, GB) resolved onto Jeremiyah Love (RB, ARI)
   before the guard existed. A gsis hit needs no guard.

Schema (columnar, one column per **ISO week**; ~52KB for a full class):

```json
{
  "updatedAt": "ISO-8601",
  "season": "2026",
  "asOf": "YYYY-MM-DD",
  "dates": ["YYYY-MM-DD", "..."],
  "players": {
    "<sleeperId>": {
      "name": "Jeremiyah Love", "pos": "RB", "team": "ARI",
      "round": 1, "pick": 3,
      "rank": 1, "slot": "RB",
      "ranks": [2, 2, 1, null],
      "ahead": ["Trey Benson"]
    }
  },
  "meta": { "rookieClass": 439, "published": 236, "withCapital": 80, "withDepth": 235 }
}
```

`ranks` is aligned to `dates` (null = no snapshot that week); `rank`/`slot`
are the latest observed standing; `ahead` lists up to 3 teammates ranked above
him at his alignment slot. `pick`/`round` are null for undrafted players — the
model floors them at `UDFA_SCORE`, not 0. A rookie carrying neither a
depth-chart row nor a draft pick is omitted entirely rather than padding the
file.

**Deliberately absent: preseason stats.** Sleeper exposes them at
`/stats/nfl/pre/{year}/{week}` (real box scores, 217 fields), but they predict
a rookie season at **rho −0.195** — the best rookies sit in August. See
`docs/analysis/rookie-research-signals-2026-08.md`. Do not add them here.

**`sources` vs `sourceMisses`, and why the second exists.** `sources` is this
run's per-source item count — a `0` there means the source threw or returned
nothing. `sourceMisses` counts **consecutive** runs of that, carried forward
inside the feed because a force-pushed feed has no history of its own to count
from. `scripts/check-source-health.mjs` reads it after publish and **fails the
workflow** once a source passes `DARK_AFTER.feed` (12 runs, ~1.5 days at the
measured ~7.4 runs/day).

It exists because a `0` in `sources` was previously invisible: measured
2026-09-21, **ESPN RSS had been contributing 0 items** to the live feed while
returning 25 to anyone who asked from elsewhere, and nothing said so — the
second time a source died silently here (FantasyPros was the first). A reader
checking feed health should look at `sourceMisses` before `total`: the item
count stays healthy while a source is dark, exactly as it stayed pinned at its
cap during the 2026-09 retention collapse.

### 3e. values-archive.json (same `values-history` branch) — *not app-read*

Writer: `scripts/snapshot-values-archive.mjs` (same workflow,
`continue-on-error`). Permanent **monthly** FantasyCalc archive — format
mirrors §3b but keyed by `months: ["YYYY-MM", ...]`, `MAX_PLAYERS = 500`,
columns never pruned by time (rows age out after `INACTIVE_MONTHS = 24`
all-null). Exists so the multi-*season* trajectory model can eventually be
back-tested against realized value, which the 90-day rolling file cannot do.
**No constant, no reader** — nothing in `src/` fetches it.

### 3f. values-consensus.json (same `values-history` branch) — *not app-read*

Writer: `scripts/snapshot-consensus.mjs` (same workflow,
`continue-on-error`). **Phase 4a**, added 2026-09-21. Permanent **daily**
archive of all three valuation sources, so §10 4d — *when they disagree,
which one moves toward the others?* — becomes answerable. A day not archived
cannot be recovered, which is why it shipped before any UI.

```json
{
  "updatedAt": "ISO-8601",
  "dates": ["YYYY-MM-DD", "..."],
  "sources": {
    "fantasycalc":    { "asOf": [null, "..."],         "coverage": [395, "..."], "players": { "<sleeperId>": [347, null, "..."] } },
    "dynastyprocess": { "asOf": ["2026-09-18", "..."], "coverage": [485, "..."], "players": { "<sleeperId>": [2, "..."] } },
    "keeptradecut":   { "asOf": [null, "..."],         "coverage": [460, "..."], "players": { "<sleeperId>": [827, "..."] } }
  }
}
```

- Every array is index-aligned to `dates`. `MAX_PLAYERS = 500` **per source,
  by that source's own value** — the three scales are not comparable, so a
  cross-source top-N would be meaningless before 4b exists. Columns are
  **never pruned by time**; a row ages out only once **every** source has been
  null for it across `INACTIVE_COLUMNS = 120` days (pruning per-source would
  leave the three maps holding different id sets, defeating the comparison).
- Same-day re-run **replaces** that column (idempotent).
- **A source that could not be read is an all-null column with `asOf: null`
  and `coverage: null` — never a 0.** *"We did not observe"* and *"the source
  priced nobody"* are different statements; a 0 reads to 4d as a real collapse
  in value. Same for an unpriceable asset: absent, never 0.
- `asOf` carries the source's **own** stated as-of where it has one.
  DynastyProcess ships `scrape_date` and **repeats** (live 2026-09-21 it read
  `2026-09-18`, three days stale), so five identical columns are one reading,
  not five — the stamp is what makes that visible.
- Size, by **wire** bytes: 6.7KB day one, **43KB at 90 days, 53KB at a year**
  (2.5MB raw — columnar integers gzip hard). That is what makes daily
  affordable.
- **No constant, no reader.** 4b (scale normalization) and 4c (surfacing the
  spread) are not built; §10 4c forbids replacing FantasyCalc or averaging the
  sources.

### 3g. The valuation sources and the universal ID crosswalk

The three sources §3f archives, and the crosswalk that joins them. Readers are
pure and shared in **`scripts/valuationSources.mjs`**, tested by
`tests/valuationSources.test.mjs`. **The join is ID-based end to end — rule 2
forbids name-matching, and nothing here does it.**

| Source | URL | Value field | Join key |
|---|---|---|---|
| FantasyCalc | `api.fantasycalc.com/values/current` (§2) | `value` | native `player.sleeperId` — no crosswalk |
| DynastyProcess | `raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv` | `value_2qb` (Superflex; `value_1qb` is not this league) | `fp_id` → `fantasypros_id` |
| KeepTradeCut | `keeptradecut.com/dynasty-rankings` | `superflexValues.value` | `mflid` → `mfl_id` |

**`files/db_playerids.csv` is the universal crosswalk** — DynastyProcess
publishes it, and it is independently valuable to any future join (it carries
`mfl_id`, `sportradar_id`, `fantasypros_id`, `gsis_id`, `pff_id`,
`sleeper_id`, `nfl_id`, `espn_id`, `yahoo_id`, `fleaflicker_id`, `cbs_id`,
`pfr_id`, `cfbref_id`, `rotowire_id`, `rotoworld_id`, `ktc_id`, `stats_id`,
`fantasy_data_id`, `swish_id`, plus name/position/team/birthdate/draft).
Measured live 2026-09-21: **12,502 rows, 6,399 with a real `sleeper_id`**.

**Two traps, both measured, both silently corrupting:**

1. **`"NA"` is the null sentinel, not an id.** dynastyprocess writes from R, so
   a missing id is the literal string `"NA"` — on **6,103 of 12,502** rows in
   `sleeper_id`. Read as a value it is one valid key that every unmapped
   player collapses onto (four distinct players landed on it in the first
   probe). `crosswalkCell()` maps `"NA"` and `""` to null everywhere. Treat it
   exactly as rule 8 treats Sleeper's `'0'`.
2. **Join KTC on `mfl_id`, never `ktc_id`.** The crosswalk carries **6,399**
   mfl→sleeper mappings against **434** ktc→sleeper, joining **464 of KTC's
   464** players against 433. And where the two disagree — exactly once —
   `ktc_id` is **wrong**: **Frank Gore Jr.** resolves to Sleeper `232`, Frank
   Gore **Sr.** (17 years exp, no team), where `mfl_id` gives `11573` (BUF).
   `ktc_id` remains only as a fallback for an entry shipping no `mflid`.

**KeepTradeCut is a page, not an API, and has already changed shape once.**
Probed 2026-09-04 as `var playersArray = [ … ]`; by 2026-09-21 that literal
was gone, replaced by a typed JSON island the page parses itself:

```html
<script type="application/json" id="ktc-players">[ … 500 entries … ]</script>
<script>var playersArray = JSON.parse(document.getElementById('ktc-players').textContent);</script>
```

More stable than a JS literal, still a page. `extractKtcPlayers()` returns
**null** on every failure (missing tag, bad JSON, the old shape) so the source
goes absent rather than throwing the run. Read `superflexValues.value` — the
sibling `tep` / `tepp` / `teppp` trees are the same board under **TE-premium**
scoring, which this league does not play. `position: 'RDP'` entries are draft
picks, not players.

**Live coverage, 2026-09-21** (the numbers to re-measure against):

| source | entries | joined to Sleeper |
|---|---|---|
| FantasyCalc | 419 (395 players + 24 picks) | 395 (100%) |
| DynastyProcess | 494 players | 485 (98.2%) |
| KeepTradeCut | 500 (464 players + 36 picks) | 460 (99.1%) |

Union **540** against FantasyCalc's 395. The 9 + 4 unjoined are deep rookies
genuinely absent from the crosswalk — **not** a matching failure to fix with
names.

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
| `dynastyedge_draft_tracker_{season}` | local | `DraftTracker.jsx` (`manualStorageKey(season)`; season = `pickYears[0]`, the upcoming rookie draft — **derived**, see `utils/seasonWindow.js`) | JSON array of manually logged picks | Never — but the key changes with the season, so one draft's log can't leak into the next |
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
| `NEWS_FEED_URL` / `VALUES_HISTORY_URL` / `TRADE_VALUES_URL` / `ROOKIE_INTEL_URL` | The four static feeds (section 3) |
| `FANTASYCALC_PARAMS` | The four immutable market params (section 2) |
| `PICK_YEARS` | **SEED ONLY.** The live pick-capital horizon is `pickYears` on LeagueContext, derived per load by `utils/seasonWindow.js` from `/state/nfl` + the drafts list (no extra request): the upcoming rookie draft plus the two after it, rolling itself the moment a season's non-auction draft reports `status: "complete"`. This constant is only what renders before NFL state resolves. Do not write new code against it, and never key anything on a literal year |
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
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-consensus.json | head -c 400

# The two extra valuation sources + the universal crosswalk (§3g). These WERE
# run, 2026-09-21, and the numbers in §3g are what they returned.
curl -s https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv | head -2
curl -s https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv | head -1
# KTC is a PAGE — confirm the JSON island still exists before trusting a parse
curl -s https://keeptradecut.com/dynasty-rankings | grep -o 'id="ktc-players"' | head -1
```

-----

## Provenance and maintenance

Everything above was read from repo source on 2026-07-05; §3e–3g were added
2026-09-21 from repo source plus a live probe of all three valuation sources
and the crosswalk. Before relying on a volatile fact, re-verify in seconds
(all local, no network):

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
grep -n "PLAYER_MAX\|GENERAL_MAX\|MAX_STORY\|playerIds\|isPlayerNews" /home/user/dynastyedge/scripts/fetch-news.mjs
grep -n "MAX_DAYS\|MAX_PLAYERS" /home/user/dynastyedge/scripts/snapshot-values.mjs
grep -n "MIN_SPARKLINE_POINTS" /home/user/dynastyedge/src/hooks/useValueHistory.js
grep -n "RECENT_DAYS\|picks\[" /home/user/dynastyedge/scripts/snapshot-trade-values.mjs
grep -n "MAX_PLAYERS\|INACTIVE_COLUMNS\|_URL =" /home/user/dynastyedge/scripts/snapshot-consensus.mjs

# The crosswalk's NA sentinel and KTC's join key — the two §3g traps, in code
grep -n "NA\|byMfl\|byKtc\|superflexValues" /home/user/dynastyedge/scripts/valuationSources.mjs

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
