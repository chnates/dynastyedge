---
name: dynastyedge-architecture-contract
description: >
  The load-bearing architecture of DynastyEdge — the design decisions with
  their WHY, the invariants that must hold, and the honest known-weak-points
  list. Load this BEFORE any structural change, new feature, new data source,
  new hook, new cache, new storage key, identity/auth work, or whenever you
  are asking "why is it built this way?" or "can I add a backend / dependency
  / fetch here?". Also load when a change touches fetchJSON, LeagueContext,
  useLeague, useFantasyCalc, usePlayerDB, useIdentity, the src/utils purity
  boundary, or the GitHub-Actions data branches (news-data, values-history).
---

# DynastyEdge Architecture Contract

Every claim below was verified against source on **2026-07-05** (file paths
cited inline). If code and this skill disagree, the code wins — then update
this skill (see Provenance at the bottom).

**What DynastyEdge is:** a personal, single-user dynasty fantasy football SPA
(React 19 + Vite 6 + Tailwind 3 + React Router 7) for one Sleeper league
(`1313933520715907072`, 10-team Superflex (QB-eligible flex slot — see
dynasty-fantasy-reference) Half-PPR). Static site on GitHub
Pages, live at https://chnates.github.io/dynastyedge/. `CLAUDE.md` at the repo
root is the doc of record for features; this skill is the doc of record for
*why the structure is what it is and what you must not break*.

## When NOT to use this skill

- **Feature-level behavior questions** ("what does the Trade Analyzer verdict
  say?") — read `CLAUDE.md`'s Features section instead.
- **API response shapes / field semantics** — that's `dynastyedge-data-contracts`.
- **Build, deploy, sandbox/proxy issues** — `dynastyedge-build-and-env`.
- **Bug hunts** — `dynastyedge-debugging-playbook` (and
  `dynastyedge-failure-archaeology` for "has this broken before?").
- **Commit/PR/process rules** — `dynastyedge-change-control`.
- **Pixel-level UI review** — the repo's `/design-review` skill + CLAUDE.md's
  Design System section. Section 7 here covers only structural UI invariants.
- **Fantasy-football terms or domain reasoning** (Superflex, FAAB, taxi,
  pick values…) — `dynasty-fantasy-reference`.
- Pure content edits (copy, colors, one component's layout) that touch no
  data flow, cache, route, or storage key.

---

## 1. The prime constraint chain

Every architectural oddity in this repo traces back to one fact. Follow the
chain; each link **forces** the next:

1. **One user** (the league owner, on iPhone Safari). No revenue, no team →
   the app must cost $0 to run and require zero operations.
2. **$0 + zero ops → free static hosting** → **GitHub Pages** (auto-deploy on
   push to `main` via `.github/workflows/deploy.yml`).
3. **GitHub Pages is static-only → no backend, no server code, no place to
   keep secrets.** Consequences:
   - Every API the client calls must be **free, public, and unauthenticated**
     (Sleeper, FantasyCalc — see `src/constants.js`).
   - No server rewrites → the SPA uses **`HashRouter`**, not BrowserRouter
     (`src/App.jsx` line 260). Deep links are `/#/trade/analyze`. Do not
     "upgrade" to BrowserRouter; refreshes would 404 on Pages.
   - No push, no cron, no proxy the client can lean on at runtime.
4. **No backend + browser CORS → some data is unreachable client-side.** News
   sources (ESPN/FantasyPros/Yahoo/CBS RSS) block browser origins, and
   FantasyCalc exposes no value time-series at all. The workaround that keeps
   the no-backend architecture:
5. **GitHub Actions as the "server", static JSON as the "database".**
   Scheduled workflows (`.github/workflows/news.yml` twice-hourly,
   `values-history.yml` daily) run Node scripts (`scripts/fetch-news.mjs`,
   `scripts/snapshot-values.mjs`, `scripts/snapshot-trade-values.mjs`) and
   **force-push single-commit orphan branches** (`news-data`,
   `values-history`) whose files the client fetches from
   `raw.githubusercontent.com` (which sends `Access-Control-Allow-Origin: *`).
   URLs live in `src/constants.js` (`NEWS_FEED_URL`, `VALUES_HISTORY_URL`,
   `TRADE_VALUES_URL`).
6. **Anything published this way is inherently best-effort** (a branch can be
   missing, a cron can be disabled, a run can fail) → the client contract for
   these feeds is *degrade silently, never error* (section 5).

**The rule this chain implies:** never propose a backend, a paid API, an
authenticated API, or a runtime server dependency. If data is CORS-blocked or
needs accumulation over time, the answer is another Actions-published static
file with a silent-degradation client. If it can't be done that way, it goes
in CLAUDE.md's "Future Features (Do Not Build Yet)" with the blocker named.

Related owner's laws (as of 2026-07-05): `main` auto-deploys so it must always
be shippable; no new npm dependencies without demonstrated need; CLAUDE.md is
updated in the same commit as the behavior it documents.

---

## 2. The data-flow map

```
network ── fetchJSON (the ONLY fetch path) ── hook layer (all caching) ──▶
  useLeague() composes ──▶ LeagueContext.Provider (one instance, in App) ──▶
    components (presentation only; may also mount lazy hooks directly)
```

### fetchJSON — the single network gate

`src/utils/fetchJSON.js`: wraps `fetch` with an **AbortController hard
timeout** (default 15 000 ms, per-call override), throws on non-2xx with a
labeled message, parses JSON. **Invariant: no raw `fetch()` anywhere in app
code.** The timeout exists so a hung API can never leave the app on a
permanent spinner — a real failure mode on mobile Safari. (Sanctioned
non-fetchJSON network surfaces: static `<img>` avatar tags in
`TeamAvatar.jsx` — images, not API calls — plus two same-origin raw
`fetch()` static-asset loads in `src/components/draft/DraftBoard.jsx`
(~lines 540, 560: `rankings.json` and the bundled FantasyPros CSV under
`BASE_URL`). Nothing else; a raw fetch hitting an API is a violation.)

### The hook layer — every cache, verified

All cross-mount caching uses **module-scope variables** (`let moduleCache`,
`let fetchPromise`) — a deliberate poor-man's cache with an in-flight promise
latch so concurrent mounts share one request. There is no query library and
none is wanted (no-new-deps law). "Session" below = JS module lifetime, i.e.
until a full page reload.

| Cache | File | Scope | Fetch trigger | Invalidation / refresh |
|---|---|---|---|---|
| FantasyCalc values (`{playerMap, pickEntries}`) | `src/hooks/useFantasyCalc.js` | module | App load (via `useLeague`) | `retry()` forces refetch; **stale-while-revalidate**: cached values stay on screen (loading only flips on when nothing is cached) |
| Sleeper core (league, rosters, users, traded_picks, nflState, matchups) | `src/hooks/useSleeper.js` | React state in the **single** App-level `useLeague()` call (no module cache — App mounts it once) | App load | `retry` refetches all |
| **30-min focus refresh** for both of the above | `src/App.jsx` (`STALE_AFTER_MS = 30*60*1000`) | — | `visibilitychange` + `focus` listeners call the combined `retry()` when data older than 30 min | silent; SWR keeps UI populated |
| Player DB (trimmed `/players/nfl`, ~5–8 MB raw) | `src/hooks/usePlayerDB.js` | module, **once per session** | first consumer (`useLeague` mounts it eagerly, non-blocking) | never (retry only on error) |
| Season transactions (18 weekly buckets, parallel, each `.catch(()=>[])`) | `src/hooks/useTransactions.js` | module | lazy, first consumer | `force` param exists |
| League history (walks `previous_league_id` chain ≤ 8 seasons: users/rosters/tx/drafts+picks per season) | `src/hooks/useLeagueHistory.js` | module | lazy (Managers / Partner Finder) | never — past seasons are frozen |
| Player intel (season stats per year, weekly stats per year-week, ESPN per-player news, aggregated news feed) | `src/hooks/usePlayerIntel.js` | module (promise maps: `seasonStatsPromises`, `weekStatsPromises`, `espnNewsCache`, `newsFeedPromise`) | lazy, first profile open / first news consumer | never |
| Value history (daily snapshots, columnar) | `src/hooks/useValueHistory.js` | module + **`historyFailed` latch** | lazy, first sparkline consumer | never; one failure = silent give-up for the session |
| Trade-time value archive | `src/hooks/useTradeTimeValues.js` | module + `archiveFailed` latch | lazy (scouting ledger) | same latch pattern |
| Playoff schedule/scores (all regular-season matchup weeks) | `src/hooks/usePlayoffOdds.js` | module, keyed by season | lazy (Playoffs page + odds consumers) | refetches only if season changes |
| Playoff odds derived results (model + 10k-iteration sim) | `src/hooks/usePlayoffOdds.js` (`derivedCache`) | module, keyed by `league`/`perWeek` reference identity + `playoffTeams`/`firstPlayoffWeek` | computed on first consumer with data; the four consumers share one sim run | recomputes when the league or schedule reference changes (new fetch / identity switch); `myOdds` stays per-instance |
| Rookie draft sync | `src/hooks/useSleeperDraft.js` | module `{data, fetchedAt}` | lazy (Board/Tracker share it) | manual Refresh; focus refetch (10 s threshold while `drafting`, 5 min idle); 30 s poll while live + visible |

**Player DB trimmed fields** (verified in `usePlayerDB.js` — the raw 5–8 MB
response is discarded, only these survive): `name`, `position`, `team`, `age`,
`years_exp`, `injury_status`, `espn_id`, `depth_chart_position`,
`depth_chart_order`, `news_updated`. If a feature needs another field, add it
to this trim list — do not fetch `/players/nfl` a second time anywhere.

### LeagueContext composition

`src/context/LeagueContext.jsx` is trivially thin (a `createContext` + a
`useLeagueContext()` accessor). The real composition is
**`src/hooks/useLeague.js`**, whose memoized return object *is* the provider
value (set once in `App.jsx`). It exposes, verified:

- `league` → `{ allRosters, myRoster, userMap, leagueInfo }` — `allRosters`
  are fully resolved rosters: players joined to FantasyCalc + player DB (see
  section 4), owned picks with values (`resolvePickOwnership` +
  `findPickValue` from `src/utils/pickCapital.js`), `totalValue`, FAAB
  (free-agent bidding budget) fields,
  `record`/`hasRecord`, points for/against, `pickCapitalScore`,
  `avgStarterAge`, `starterOrder`.
- `nflState`, `isOffseason` (`season_type !== 'regular'`), `leagueInfo`,
  `tradeDeadline`, `matchups` (current week, paired by `matchup_id`).
- `myRosterId` (from `useIdentity` — runtime state, see section 3).
- `loading`, `error`, `retry` (combined Sleeper+FC), `sleeperFetchedAt`,
  `fcFetchedAt`, `values` (the raw FantasyCalc cache: `playerMap` keyed by
  string sleeperId + `pickEntries`).
- `signInRosters`, `sleeperLoading`, `sleeperError`, `sleeperRetry` —
  Sleeper-only inputs for the login screen (section 3).

The return object is memoized with an explicit comment explaining why: a fresh
literal per render would cascade re-renders through every context consumer.
**Preserve that memoization when adding fields.**

**Invariant:** components never fetch. New data needs = new/extended hook with
one of the cache disciplines above, composed either into `useLeague` (if
league-core) or consumed lazily where needed (if feature-scoped).

---

## 3. Identity architecture

Verified in `src/hooks/useIdentity.js`, `src/constants.js`,
`src/hooks/useLeague.js`, `src/App.jsx`:

- **"Who am I" is runtime state, not a constant.** `useIdentity` is a tiny
  external store (`useSyncExternalStore`, same pattern as `useWatchlist`)
  persisted at localStorage key **`dynastyedge_identity_v1`**. A valid
  identity requires a **numeric `rosterId`**; anything else reads as
  logged-out. `App.jsx` gates the whole shell: `rosterId == null` →
  `LoginScreen`.
- **`MY_ROSTER_ID = 6` in `src/constants.js` is legacy-reference-only.** The
  comment above it (verified) says these constants "remain only as the
  league's original-owner reference — nothing reads them as the source of
  truth anymore." All "is this me?" checks use `myRosterId` from
  LeagueContext / `useIdentity`. **Never reintroduce `MY_ROSTER_ID` into
  runtime logic.**
- **Sign-in must never depend on FantasyCalc.** Verified: `useLeague.js`
  builds `signInRosters` from `sleeperData` alone (rosters + users → owner,
  record) so a FantasyCalc outage cannot lock the user out. Any change to
  LoginScreen must keep reading `signInRosters` / `sleeperError`, never
  `league` (which requires both sources).
- **Identity switch wipes roster-scoped state.** Verified in `useIdentity.js`:
  both `setIdentity` and `clearIdentity` call `clearRosterScoped()`, which
  removes localStorage `dynastyedge_action_dismissals` and sessionStorage
  `dynastyedge_trade_draft` — and *only* those. League-wide caches (theme,
  watchlist, draft board, module caches) deliberately survive. **If you add a
  storage key whose meaning depends on which roster is "me", add it to
  `ROSTER_SCOPED_LOCAL` / `ROSTER_SCOPED_SESSION` in the same commit.**

---

## 4. The join invariant (Sleeper ↔ FantasyCalc)

Sleeper roster endpoints return **numeric player IDs only** — no names.
FantasyCalc entries carry `player.sleeperId`. That field is the bridge.
Verified mechanics:

- **Normalize to `String` at ingestion, everywhere.** `useFantasyCalc.js`
  keys `playerMap` by `String(sid)`; `useLeague.js`'s `resolveRoster`
  stringifies every roster/starter/taxi/reserve ID (and filters `'0'` — 
  Sleeper's empty-slot sentinel) before any Set lookup. All downstream joins
  assume string IDs. A numeric-keyed lookup is a bug.
- **Unranked players are never dropped.** A rostered player missing from
  `playerMap` falls back to the trimmed player DB for name/position/team/age,
  gets `value: 0`, `unranked: true`, and displays `—` for value. A player is
  skipped only when *neither* source knows them (which self-heals once the
  player DB loads — it arrives in the background, non-blocking). Any new
  roster-consuming view must honor this: show the player, show `—`, count 0.
- **FantasyCalc entries without a `sleeperId` are picks** ("2026 Mid 1st") —
  collected into `pickEntries`, priced via `findPickValue`
  (`src/utils/pickCapital.js`), and absent from `playerMap` (hence absent
  from player search — by design).
- `useFantasyCalc.js` also guards against silent API shape drift: a non-array
  response or an empty `playerMap` **throws** (core source → loud failure,
  see section 5).

---

## 5. The degradation contract

Two hard classes. Confusing them is the classic way to break this app.

**Class A — core. Must show loading state, then `ErrorState` + retry on
failure. Never a blank screen.**

| Source | Where it errors loudly |
|---|---|
| Sleeper core (league/rosters/users/picks/state) | `useSleeper.js` → `error` through `useLeague` → e.g. `RosterView.jsx` `<ErrorState message onRetry={retry}>` |
| FantasyCalc values | `useFantasyCalc.js` (throws on bad shape / empty map) → same path |
| Sleeper player DB | `usePlayerDB.js` exposes `error` + `retry` (but loads in background; league renders without it) |
| Playoff odds page fetch | `usePlayoffOdds.js` (its page shows ErrorState; per-week buckets individually `.catch(()=>[])`) |

**Class B — best-effort. Must NEVER error, block a panel, show a spinner
forever, or retry-loop. On any failure the UI surface simply hides.**

| Source | File | Mechanism (verified) |
|---|---|---|
| Aggregated news feed | `usePlayerIntel.js` `loadNewsFeed()` | `.catch(() => [])`, single cached promise |
| News matched to roster/watchlist | `useLeagueNews.js` / `useNewsFeed.js` | consume `loadNewsFeed`; empty ⇒ section hides |
| ESPN per-player fallback endpoints | `usePlayerIntel.js` (`espnNewsCache`) | unofficial, CORS-blocked in practice; degrades silently |
| Value history / sparklines | `useValueHistory.js` | `historyFailed` latch → `getSeries` returns `null`; < 4 points also `null` (a 2-point "line" reads as broken) |
| Trade-time value archive | `useTradeTimeValues.js` | `archiveFailed` latch; missing entry ⇒ "at trade time" line hides |
| Per-week transaction buckets | `useTransactions.js`, `useLeagueHistory.js`, `usePlayoffOdds.js` | each week `.catch(() => [])` so one bad bucket can't sink the set |

**Rule for new work:** anything fed by an Actions-published branch or an
unofficial endpoint is Class B by construction (section 1, link 6). Anything
the app is useless without is Class A. Decide the class *before* writing the
hook, and copy the matching existing pattern (including the failure latch for
Class B — it prevents retry storms).

---

## 6. The purity boundary (load-bearing — do not erode)

Verified 2026-07-05: **no file in `src/utils/` imports React** (grep for
`from 'react'` returns nothing there). The layering is:

- **`src/utils/`** — pure, framework-free, deterministic ESM logic
  (extensionless relative imports). Trade math, playoff Monte Carlo, age
  curves, pick pricing, briefing composition, lineup optimization. Exception
  by nature: `fetchJSON.js` (browser `fetch`/`AbortController`, still
  React-free) and the color-class maps (data, not logic).
- **`src/hooks/`** — fetching, caching discipline, React state.
- **`src/components/`** — presentation only.

**Why this is an invariant, not a style preference:** the pure utils run
directly under Node (with the ESM resolver hook shipped in
`dynastyedge-diagnostics-and-tooling`, since Node needs help with
extensionless imports). That is what makes offline analysis, backtesting, and
model-quality work possible without a browser — see
`dynastyedge-model-quality-campaign`. Putting a React import, a fetch call, or
a `window` reference into a util silently kills that capability.

**Determinism is load-bearing too:** `src/utils/playoffOdds.js` uses a
fixed-seed RNG (`mulberry32`, default seed `0x5eed`, Box–Muller normals) so
the 10,000-iteration simulation returns identical numbers every render — the
UI must never reshuffle its odds as React re-renders, and offline runs must
reproduce the app's numbers exactly. Never swap in `Math.random()` or make the
seed time-based. New models should follow the same pattern: pure function,
injectable/fixed seed.

---

## 7. UI architecture invariants (brief — depth lives in `/design-review` + CLAUDE.md)

- **All UI routes through the design-system barrel** `src/components/ui`
  (`Button`, `IconButton`, `Card`, `Sheet`/`SheetHeader`, `Modal`, `Chip`,
  `Badge`, `Input`/`SearchInput`, `cn`, plus re-exported shared primitives).
  Never hand-roll these inline. Run the repo's `/design-review` skill before
  committing component work.
- **Exactly two sanctioned hand-rolled sheets** (verified: the only components
  referencing `window.visualViewport` are
  `src/components/shared/PlayerSearchSheet.jsx` and
  `src/components/trade/TradeBuilder.jsx`): keyboard-aware sheets can't use
  `Sheet` (which sizes to the layout viewport). Any third keyboard-aware sheet
  must copy their contract, and its sanctioning should be documented.
- **`<main>` is the app's only scroll container** (`App.jsx`: fixed, 
  `bottom: 0`, safe-area clearance as *inside* padding). The body never
  scrolls; bottom sheets use `useScrollLock` + `useSheetDrag` +
  `overscroll-contain`. Never shorten `<main>` with a bottom offset.
- **No bottom nav — ever.** Navigation is the side drawer (`SideDrawer.jsx`
  `NAV_TREE`, always-expanded hierarchical map) + `SubTabBar` within sections.
  This was re-affirmed in a usability review; it's a settled decision.
- **Route redirect policy:** any moved/renamed path keeps a `<Navigate>` (or
  param-aware `RedirectParam`) redirect — see the redirect block at the bottom
  of `App.jsx`'s `<Routes>` (`/roster*` → `/my-team*`/`/league*`, `/lineup*`,
  `/draft/trades`, `/league/managers`). Deep links live in saved bookmarks and
  in The Edge's briefing items; moving a route without a redirect breaks both.
  Follow the pattern for any future move, and note route-only moves (component
  file stays put) explicitly in CLAUDE.md, as was done for Manager Scouting.
- Mobile-first at **390px** (iPhone 15 Pro); dark mode default; theme in
  localStorage `dynastyedge_theme` via `useTheme` only.

---

## 8. Known weak points — stated plainly (as of 2026-07-05)

Do not "discover" these as bugs; they are known trade-offs. Do fix them when a
task legitimately touches them.

1. **No automated tests, lint, or typecheck.** `npm run build` is the only
   gate before auto-deploy to the live site. Verification is manual /
   real-data (owner's law). See `dynastyedge-validation-and-qa` before
   shipping anything risky.
2. **CLAUDE.md rule 16 is stale on the status-bar meta.** It says "No
   `apple-mobile-web-app-status-bar-style` meta"; `index.html` (line 18)
   ships `content="black-translucent"`, restored deliberately in commit
   `78b6c29` after a revert cycle (`cfd9ad0` → `3083f0c` → `78b6c29`).
   **Code + git history win.** The `App.jsx` safe-area strip (the fixed
   `#0D0D0F` div behind the status bar in light mode) exists *because of*
   black-translucent — don't remove either half alone.
3. **GitHub cron workflows auto-disable after ~60 days without repo
   activity.** Both data pipelines (news twice-hourly, values daily) die
   silently in a quiet offseason. Any push re-enables them. Symptom: stale
   `news.json` / no new value columns — check the Actions tab before
   debugging client code.
4. **The ESPN per-player endpoints are unofficial and CORS-blocked in
   practice.** Kept only because they cost nothing and degrade silently
   (Class B). Never build anything that *depends* on them working.
5. **FantasyCalc is a single point of failure for all pricing.** Every value,
   rank, trend, pick price, trade verdict, trajectory, and playoff prior
   traces to one unauthenticated endpoint. The only mitigation is at sign-in
   (`signInRosters` is Sleeper-only). An outage degrades the whole app to
   ErrorState; a silent *shape* change is guarded only by the two throws in
   `useFantasyCalc.js`. Treat any FantasyCalc schema drift as a P1; see
   `dynastyedge-data-contracts`.
6. **The data branches are force-pushed single commits.** `news-data` and
   `values-history` have no git history of their own — the server-side
   "history of the history" is exactly the 90-day rolling window inside
   `values-history.json` plus the permanent (never-pruned) `trade-values.json`
   archive. A buggy snapshot run can corrupt the rolling file with no branch
   history to revert to (the workflow's re-fetch-previous-archive step
   protects only `trade-values.json`). Be paranoid when touching
   `scripts/snapshot-*.mjs`.
7. **localStorage schema has no migration story.** Verified key inventory:
   only `dynastyedge_identity_v1` and `dynastyedge_watchlist_v1` are
   versioned; `dynastyedge_theme`, `_action_dismissals`, `_edge_last_visit`,
   `_board_order`, `_prospect_notes`, `_csv_rankings`, `_draft_tracker_*`,
   and the sessionStorage keys (`_league_sort/_pos/_tier`, `_trade_draft`)
   are not. If you change a stored shape, either bump to a `_vN` key (and
   read-migrate or ignore the old one) or make the reader tolerant of the old
   shape — a JSON.parse of a stale shape must never white-screen the app
   (readers currently wrap in try/catch; keep that).
8. **Module-scope caches never expire within a session** (except the 30-min
   Sleeper/FC focus refresh and the draft hook's polling). A day-long Safari
   tab shows day-old transactions/history/news until the drawer's manual
   Refresh or a reload. Accepted for a one-user app; don't add per-render
   refetching to "fix" it — that violates the caching discipline.

---

## Provenance and maintenance

Written 2026-07-05 against the working tree at that date, by direct reading of:
`src/utils/fetchJSON.js`, `src/hooks/useFantasyCalc.js`,
`src/hooks/usePlayerDB.js`, `src/hooks/useIdentity.js`,
`src/hooks/useLeague.js`, `src/hooks/useSleeper.js`,
`src/context/LeagueContext.jsx`, `src/App.jsx`, `src/constants.js`,
`src/hooks/useValueHistory.js`, `src/hooks/useTradeTimeValues.js`,
`src/hooks/useTransactions.js`, `src/hooks/useLeagueHistory.js`,
`src/hooks/usePlayerIntel.js`, `src/hooks/usePlayoffOdds.js`,
`src/hooks/useSleeperDraft.js`, `src/hooks/useLeagueNews.js`,
`src/utils/playoffOdds.js`, `index.html`, plus `git log` for `78b6c29`.

Re-verify before trusting volatile claims (all commands read-only; network
calls to the fantasy APIs are **blocked in the CI sandbox** — proxy 403 — so
verify shapes from code, not live calls, when sandboxed):

```bash
# Purity boundary: must print nothing
grep -l "from 'react'" src/utils/*.js

# No raw fetch outside fetchJSON (TeamAvatar <img> excepted):
grep -rn "fetch(" src --include='*.js*' | grep -v fetchJSON

# Identity constants still legacy-only:
sed -n '1,12p' src/constants.js

# Roster-scoped wipe list:
grep -n "ROSTER_SCOPED" src/hooks/useIdentity.js

# Storage key inventory (check versioning claims):
grep -rhoE "dynastyedge_[a-z0-9_]+" src | sort -u

# Rule-16 divergence still present:
grep -n "status-bar-style" index.html && git log --oneline -1 78b6c29

# Redirect block + HashRouter:
grep -n "HashRouter\|Navigate to=" src/App.jsx | head -25

# Fixed-seed RNG intact:
grep -n "mulberry32\|0x5eed" src/utils/playoffOdds.js

# Data-branch URLs:
grep -n "raw.githubusercontent" src/constants.js
```

Update this skill when: a hook's caching discipline changes, LeagueContext
gains/loses fields, the identity store or wipe list changes, a route moves, a
new Actions data branch ships, or any weak point above is actually fixed.
