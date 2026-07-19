---
name: dynastyedge-diagnostics-and-tooling
description: Measurement tools for DynastyEdge — load when you need to measure app behavior instead of eyeballing it. Run the pure analytical models (playoff Monte Carlo, dynasty trajectory, trade analysis) outside the browser under plain Node; probe the live Sleeper league for sanity; measure feed freshness (the news / values-history / trade-values static feeds); quantify bundle size before/after a change. Owns THE Node resolver hook that makes src/utils' extensionless ESM imports work under node — siblings that need to import repo modules use it too.
---

# DynastyEdge diagnostics & tooling

**Doctrine: never eyeball what you can measure.** Any claim about model
behavior, feed freshness, league state, or bundle size must come with numbers
from these tools — a before/after pair for any perf or model-quality claim.
"Looks right" is not evidence; a PASS line is.

All scripts live in `scripts/` next to this file and use **Node builtins only**
(no npm installs, ever — owner's law). Repo verified against Node v22.22.2.

```
SKILL=/home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling
```

Network reality — **it varies per session; probe, never assume.** The egress
policy is set per environment, so two sessions in the "same" repo can differ.
Probe first:
`curl -sS -o /dev/null -w '%{http_code}\n' https://api.sleeper.app/v1/state/nfl`.
Observed postures: 2026-07-06 (restricted CCR sandbox) — both fantasy APIs
proxy-blocked (403), `raw.githubusercontent.com` reachable, so only
`check-feeds.mjs` worked; 2026-07-19 (Claude Code on the web) — the live
GitHub Pages site, `api.sleeper.app`, AND `api.fantasycalc.com` all returned
200, so `probe-league.mjs` and `run-model.mjs --live` can run for real.
Never claim a network script "passed" when it printed its NETWORK FAILURE
block.

## Driving the app in a headless browser (when network allows)

Verified 2026-07-19: the built app can be rendered AND driven end-to-end in
this environment's pre-installed Chromium (`/opt/pw-browsers`), signed in as
a real team with live league data on screen at 390×844. The working recipe —
each step exists for a reason:

1. `npm run build && npm run preview -- --port 4173` — serve `dist/` on
   localhost. Localhost is on the proxy's no-proxy list, so the browser
   reaches it directly. App URL: `http://127.0.0.1:4173/dynastyedge/`.
2. Install `playwright-core` in the session **scratchpad, never the repo**
   (the no-new-deps law governs `package.json`, not throwaway tooling), and
   launch with `executablePath` pointing at the pre-installed Chromium.
3. **Chromium cannot traverse the egress proxy's HTTPS itself** (TLS reset
   on every host, even ones curl reaches — verified 2026-07-19). Intercept
   the app's external calls with `context.route()` and fulfill them via
   Node's fetch, which does work through the proxy: run the script with
   `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`, and
   add `access-control-allow-origin: *` to fulfilled responses.

**What this evidence is and is not.** It proves rendering, data flow, and
navigation against real league data — real screenshots, real numbers. It is
**NOT iPhone evidence**: emulated Chromium shows the page only, never iOS
chrome (the status bar the PWA metas control is invisible here),
`env(safe-area-inset-*)` resolves to 0, and iOS Safari's standalone mode,
scroll rubber-banding, sheet gestures, and keyboard/visualViewport behavior
are not reproduced. The PWA-meta/manifest change class still requires the
owner's physical phone (see `dynastyedge-change-control`).

## When NOT to use this skill

- **Editing UI / design-system work** — use `/design-review` and the
  `dynastyedge-architecture-contract` skill; nothing here renders components.
- **Deploying, running dev server, or fixing the GitHub Actions pipelines** —
  that's `dynastyedge-run-and-operate`.
- **Looking up feed/API JSON shapes** — `dynastyedge-data-contracts` has the
  schemas; this skill only measures liveness/freshness against them.
- **Debugging a broken build or dependency problem** — `dynastyedge-build-and-env`.
- **Fantasy-football terms or domain reasoning** (taxi, FAAB, Superflex, pick
  tiers…) — `dynasty-fantasy-reference`.
- **Judging whether model outputs are *good*** (calibration, tuning) — this
  skill produces the numbers; `dynastyedge-model-quality-campaign` judges them.
- Don't run `bundle-report.mjs` for changes that can't affect the bundle
  (docs, workflows, scripts outside `src/`).

---

## Tool 0 — The Node loader hook (`reg.mjs` + `loader.mjs`)

**What it solves:** `src/utils/*.js` are pure ESM analysis modules but use
Vite-style extensionless relative imports (`import x from './lineupHistory'`).
Plain `node` throws `ERR_MODULE_NOT_FOUND` on those. The hook appends `.js` to
relative extensionless specifiers when the target file exists.

**Usage — register via `--import`, works from any cwd:**

```bash
node --import $SKILL/scripts/reg.mjs your-script.mjs
```

After registration, `await import('/home/user/dynastyedge/src/utils/playoffOdds.js')`
works, along with every other `src/utils` module. Verified 2026-07-06:

```
playoffOdds exports: buildScoringModel, buildStrengthPreview, getDeadlineVerdict, simulatePlayoffs, teamStartingStrength
```

Requires Node ≥ 18.19 (`module.register`). Sibling skills importing repo
modules under Node should point at this pair rather than copying it.

---

## Tool 1 — `run-model.mjs` (model harness; `--fixture` offline · `--live` network)

**What it measures:** runs `simulatePlayoffs` (10,000-iteration fixed-seed
Monte Carlo), `buildRosterTrajectory` (+3-season value projection), and
`analyzeTrade`/`getTradeVerdict` outside the browser, with built-in
invariant checks:

- sum of `playoffPct` across teams == `playoffTeams` (exactly — each simulated
  season seats exactly that many teams)
- fixed-seed determinism: two runs produce byte-identical results
- trajectory shape: 4 seasons, 4 position sub-series, totals = players + picks
- trade analysis returns a complete Accept/Decline/Counter verdict

**Invocation (loader hook is mandatory):**

```bash
node --import $SKILL/scripts/reg.mjs $SKILL/scripts/run-model.mjs --fixture   # offline, deterministic
node --import $SKILL/scripts/reg.mjs $SKILL/scripts/run-model.mjs --live      # NETWORK REQUIRED
```

**Expected output (`--fixture`, real run 2026-07-06, exit 0 — deterministic, so
yours must match byte-for-byte):**

```
=== run-model --fixture (synthetic 10-team league, deterministic) ===

-- simulatePlayoffs (9 remaining weeks, playoffTeams=6) --
team                    record  playoff%  top-seed%  avgSeed  projRecord
Team 1                  3-2       99.8%     44.4%     2.01  9.8-4.2
Team 2                  3-2       99.5%     30.3%     2.32  9.6-4.4
Team 3                  4-1       97.6%     13.2%     3.20  9.1-4.9
Team 4                  4-1       97.6%     11.5%     3.26  9.0-5.0
Team 6                  2-3       54.3%      0.2%     6.35  6.3-7.7
Team 7                  2-3       45.9%      0.2%     6.68  6.1-7.9
Team 5                  1-4       39.2%      0.1%     6.97  5.5-8.5
Team 9                  3-2       37.1%      0.1%     7.02  6.1-7.9
Team 8                  2-3       28.7%      0.1%     7.41  5.5-8.5
Team 10                 1-4        0.4%      0.0%     9.80  2.9-11.1

CHECK sum(playoffPct) = 6.000000 (expect 6): PASS
CHECK fixed-seed determinism (two runs identical): PASS
Roster 6 deadline verdict: On the bubble — You're on the bubble — one well-aimed move at your biggest weakness could decide your season.

-- buildRosterTrajectory (roster 6, horizon +3) --
seasons:     2026  2027  2028  2029
totalByYear: 32,930  32,750  32,694  31,417
players:     29,471  29,291  29,253  27,748
picks:       3,459  3,459  3,441  3,669
  QB: 4,824  5,145  5,736  6,408
  RB: 7,665  7,513  7,335  6,284
  WR: 9,244  8,914  8,232  7,759
  TE: 7,738  7,719  7,950  7,297
CHECK series shape (4 seasons, 4 position rows, totals = players+picks): PASS
verdict: [stable] peak 2026 — Your value holds near its peak around 2026 before easing off — a balanced window. Add youth on the margins without mortgaging the future.
read:    Value holds near 2026 — balanced window

-- analyzeTrade (sample: my 2nd-best RB+WR for their best WR) --
give: RB_t6_2 (523) + WR_t6_1 (1,948)  → total 2,471
get:  WR_t1_0 (5,375)  → total 5,375
raw value: winner=you diff=2,904 (54%)
fit: filledNeeds=[] hurtStrengths=[] fitScore=0
window: myTier=Middle windowScore=0 — Neutral — fits your current win window
VERDICT: Accept — You're winning 54% on raw value.
CHECK analyzeTrade returns a complete verdict: PASS

Done. All checks passed.
```

**Graceful-failure path (`--live` in this sandbox, real output, exit 1):**

```
NETWORK FAILURE — could not fetch live data.
  HTTP 403 from https://api.sleeper.app/v1/league/1313933520715907072
--live requires outbound HTTPS to api.sleeper.app + api.fantasycalc.com.
Sandboxed sessions typically get proxy 403s — use --fixture offline instead.
```

**Interpretation:**

- Any `*** FAIL ***` on the sum or determinism check after you touched
  `playoffOdds.js` means you broke the deterministic-seed contract or the
  seeding logic — open `dynastyedge-failure-archaeology` /
  `dynastyedge-change-control` before proceeding. The fixture output changing
  *at all* (values, not just PASS/FAIL) after a `src/utils` edit is itself a
  measured behavior change — justify it or revert.
- Trajectory `totalByYear` should move smoothly (per-year clamp is 0.55×–1.18×);
  a wild swing means a broken age curve.
- The trade sample is a smoke test of the full 3-layer pipeline, not a
  fairness benchmark. For model-quality judgments, hand these numbers to
  `dynastyedge-model-quality-campaign`.
- `--live` in the offseason prints a `buildStrengthPreview` seeding instead of
  odds — that is correct behavior, not a failure. Live picks are omitted
  (`pickCapitalScore: 0`) — player-only totals; don't compare live trajectory
  pick rows against the app.

---

## Tool 2 — `check-feeds.mjs` (feed freshness; network — reachable even in this sandbox)

**What it measures:** the three static JSON feeds served from orphan branches
(URLs read from `src/constants.js`, falling back to hardcoded copies):
news item count + newest-item age vs the twice-hourly cron; values-history
date range / column count / player count vs the daily 09:41 UTC cron;
trade-values archive entry count. Per-feed graceful failure; exits 1 only if
all three are unreachable.

```bash
node $SKILL/scripts/check-feeds.mjs
```

**Expected output (real run, 2026-07-06 ~04:40 UTC, exit 0):**

```
=== news.json (news-data branch) ===
items:        100 (pipeline caps at 100)
newest item:  2026-07-05T22:55:47.000Z (5.7h ago)
with links:   100 · sources: Yahoo, ESPN, CBS
verdict:      STALE — newest item 5.7h old (>2h). Check .github/workflows/news.yml runs.

=== values-history.json (values-history branch) ===
updatedAt:    2026-07-05T11:19:35.048Z
columns:      25 (rolling window is 90 days)
date range:   2026-06-11 → 2026-07-05
players:      518 (top 500 by value + carried rows)
verdict:      OK-ish — has yesterday but not today (normal before ~09:41 UTC; stale after)

=== trade-values.json (values-history branch) ===
entries:      1 (permanent archive — only ever grows)
updatedAt:    2026-07-05T11:19:35.507Z
verdict:      no staleness rule — archive only gains entries when trades happen.
```

**Interpretation:**

- News STALE (>2h) with the workflow cron at `:17`/`:47` usually means the
  cron stopped — GitHub disables scheduled workflows after ~60 days without
  repo activity, or every source returned nothing (script then keeps the old
  feed). In the deep July offseason a quiet overnight window can also read
  stale. To *fix*, open `dynastyedge-run-and-operate` (pipeline operations).
- Values verdict STALE (missing today *and* yesterday) → the daily
  `values-history.yml` run failed or was disabled — same sibling.
- `FEED UNREACHABLE` on all three → no network; on one → that branch/file is
  missing (the app hides the dependent UI silently by design — see
  `dynastyedge-data-contracts` for expected shapes).

---

## Tool 3 — `probe-league.mjs` (Sleeper league sanity; NETWORK REQUIRED — blocked in this sandbox)

**What it measures:** live league ground truth in one shot — league name/season,
`season_type` (drives all offseason-hidden UI), team count (expect 10), roster
sizes / taxi (developmental-player stash — see dynasty-fantasy-reference) /
IR / records / fpts per team, playoff settings, trade deadline,
and that roster 6 (Nix Cage) exists. Constants read from `src/constants.js`;
league ID `1313933520715907072` hardcoded as fallback.

```bash
node $SKILL/scripts/probe-league.mjs
```

**Tested here (2026-07-06): the graceful-failure path — real output, exit 1**
(the success path could not be run from this sandbox and is therefore unverified):

```
NETWORK FAILURE — could not reach api.sleeper.app.
  HTTP 403 from https://api.sleeper.app/v1/league/1313933520715907072
This script requires outbound HTTPS to api.sleeper.app.
Sandboxed sessions typically get a proxy 403 here — run it in an
environment with real network access; nothing is wrong with the repo.
```

**Interpretation (when run with network):** team count ≠ 10 or roster 6 missing
means the league changed shape — stop and re-read CLAUDE.md's League Context.
`season_type !== 'regular'` (expected in July) means matchups/projections/
optimizer UI is *supposed* to be hidden. Roster sizes ~23 (starters+bench)
excluding taxi/IR; anything wildly off suggests you're reading the wrong league.

---

## Tool 4 — `bundle-report.mjs` (bundle size; offline, runs `npm run build`)

**What it measures:** every file in `dist/` after a fresh Vite build, raw +
gzip, sorted, with totals and a main-chunk baseline comparison. Use
`--skip-build` to re-measure an existing `dist/`.

```bash
node $SKILL/scripts/bundle-report.mjs
```

**Expected output (real run 2026-07-06, exit 0; chunk hashes vary — table
trimmed to the head, full run lists ~46 files):**

```
Running `npm run build` (vite)…

=== dist/ size report (sorted by raw size) ===
        raw        gzip  file
   368.6 KB   114.7 KB  assets/index-l46Y-Aek.js
   174.2 KB        n/a  FantasyPros_2026_Rookies_OP_Rankings.csv
    66.1 KB    21.5 KB  assets/DraftBoard-C9Mk6U5Y.js
    41.6 KB     7.8 KB  assets/index-D4QRRyyx.css
    33.1 KB     8.9 KB  assets/TradeAnalyzer-siWBfb1Y.js
    28.2 KB     7.3 KB  assets/DraftTracker-uWpeCYgv.js
    ...
------------------------------------------------------------
   912.0 KB   424.9 KB  TOTAL (gzip col counts binaries at raw size)

Main chunk: assets/index-l46Y-Aek.js — 369 KB raw / 115 KB gzip
Baseline (measured 2026-07-06): 369 KB raw / 115 KB gzip. A jump of >10%
after your change means you added weight — find it before shipping.
```

**Interpretation:** the app is route-split — feature views are their own
chunks (DraftBoard 66 KB, TradeAnalyzer 33 KB, …). A new feature bloating the
*main* chunk instead of getting its own chunk means you imported it eagerly —
check the route's `lazy()` wiring. Always report before AND after numbers in
any PR that claims/denies size impact. Baseline as of 2026-07-06: main chunk
369 KB raw / 115 KB gzip, dist total 912 KB raw. (The prompt-era 2026-07-05
estimate of ~377/~117 was re-measured down to these numbers.)

---

## Provenance and maintenance

- Loader hook: re-verify with
  `node --import $SKILL/scripts/reg.mjs -e "import('/home/user/dynastyedge/src/utils/playoffOdds.js').then(m=>console.log(Object.keys(m)))"`.
- Function signatures were read from `src/utils/{playoffOdds,dynastyTrajectory,tradeAnalysis,rosterAnalysis,lineupHistory}.js`
  on 2026-07-05/06 — if those files change exported signatures, update
  `run-model.mjs` fixtures and re-run `--fixture` (must end `All checks passed.`).
- Fixture output above is deterministic — after ANY `src/utils` model edit,
  re-run `--fixture` and update the pasted block here if the change was intended.
- Feed URLs / league ID: re-verify against `src/constants.js` (scripts import
  it live, so drift only matters for the hardcoded fallbacks).
- Bundle baseline: re-run `bundle-report.mjs` after dependency or route
  changes and refresh the numbers here and in the script's header comment.
- Network posture ("sleeper/fantasycalc blocked, raw.githubusercontent
  reachable") was observed 2026-07-06 in the CCR sandbox — re-test with a
  quick `check-feeds.mjs` run before assuming it still holds.
