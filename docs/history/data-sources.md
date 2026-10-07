# History — Data Sources

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

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
  **Re-measured 2026-09-25, and the cadence got worse: ~5.5 runs/day at a
  4.39h mean gap** over runs 1239–1253 (gaps 2.4h to **6.0h**). The two
  measurements differ by 35% four days apart, so treat delivered cadence as
  a **range (~5.5–7.4/day)**, not a constant, and do not re-derive a number
  from a single window.
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
  pre-registered target of 12 (`docs/archive/build-plan-2026-09.md` §3) and is
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
instrument (see `docs/archive/open-items-2026.md` **NEWS-6**).

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
  news feed after **12** — **~1.6–2.2 days** across the delivered ~5.5–7.4
  runs/day (measured 2026-09-21 and 2026-09-25), not the 48 the cron asks for.
  Both mean "roughly a day or more of total silence". **12 was deliberately
  NOT retuned when the cadence fell** (2026-09-25): the threshold still reads
  "a day or more" at both measured rates, and resizing it on every window
  would chase noise in GitHub's scheduler. Revisit only if delivered cadence
  settles below ~4/day, where 12 runs would pass three days.
  **Its first live week was quiet, correctly:** on 2026-09-25 all ten news
  sources carried `sourceMisses: 0`, every news and values run since the alarm
  shipped concluded `success`, and the consensus archive had no null column.
  The one real change that week (DynastyProcess coverage dropping 485 → 344,
  PIPE-3) was upstream board depth. The column was not empty, so the alarm
  correctly stayed silent.
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
  (`docs/archive/build-plan-2026-09.md` §10 4d) — needs history, and a day not archived
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


