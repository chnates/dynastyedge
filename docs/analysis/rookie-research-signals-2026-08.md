# Rookie Research Signals — Back-Test, August 2026

**Date:** 2026-08-08. **Status: RESEARCH ONLY.** No app code was written. The
owner approved the *shape* of a Draft › Research module (new sub-tab, backed by
a third GitHub Actions pipeline) and directed that this back-test land **first**,
so the numbers on screen would be defensible rather than fitted to one season.

**Reproduce every number here:**
`node scripts/dev/rookie-signal-backtest.mjs --preseason`
(zero dependencies, read-only, public data; caches ~70MB of nflverse CSVs).

**The question:** which rookies become something, for reasons a dynasty *value*
number does not already capture — landing spot, depth chart, team situation,
camp performance.

---

## 1. What is actually available

Probed live on 2026-08-08, not recalled:

| Source | Carries | Reachable from the browser? |
|---|---|---|
| Sleeper `/players/nfl` | `depth_chart_position` (LWR/SWR/RWR), `depth_chart_order`, college, age | **Yes — already cached** by `usePlayerDB`, zero new fetch |
| Sleeper `/stats/nfl/pre/{yr}/{wk}` | Real preseason box scores: 217 fields incl. `off_snp`, `tm_off_snp`, `rec_tgt`, `rush_att`, `rec_rz_tgt` | Yes (undocumented in CLAUDE.md until now) |
| Sleeper `/projections/nfl/pre/{yr}/{wk}` | Preseason projections | Yes |
| nflverse `depth_charts_{yr}.csv` | **Daily** depth-chart snapshots; the 2026 file runs 2026-03-22 → today | No — no CORS, and 39MB |
| nflverse `draft_picks.csv` | Complete NFL draft: round, overall pick, team, college | No — no CORS |
| nflverse `roster_{yr}.csv` | **A `sleeper_id` column**, plus `draft_number` | No — no CORS |
| nflverse `combine.csv` | 2026 class present (319 rows) but `forty`/`vertical` **empty** | No — and not useful this year |
| Structured training-camp performance (reps, beat reports as data) | — | **Does not exist free.** PFF camp grades are paid |

There is no free feed of what happens at practice. The two honest proxies are
**depth-chart movement** (nflverse, daily) and **camp text** in the news feed
the app already aggregates.

## 2. Population frame — why not Sleeper

Sleeper prunes inactive players from `/players/nfl`: its 2021 skill-rookie
cohort retains 120 players against 2025's 241. Building the cohort there would
quietly drop the busts and inflate every correlation.

The frame is therefore **nflverse `draft_picks.csv`** — every drafted skill
player of each class — joined on `gsis_id` to nflverse season stats. A drafted
rookie missing from the stats file scores **0.0**, so busts stay in the
denominator. **n = 396 drafted skill rookies, 2021–2025.**

Depth charts changed schema mid-window and both eras are harmonized to one
"where did he sit when the games started" rank:

- **2021–2024:** `depth_team` (1–3) on the Week-1 REG offensive chart.
- **2025+:** `pos_rank` within alignment slot, last snapshot before the opener.
  Rank 1 at LWR, RWR *or* SWR all mean starter — the same thing `depth_team=1`
  meant in the old schema.

Off the chart entirely is folded into rank 4+; it is the same fact.

## 3. Finding 1 — preseason production is a trap

The intuitive build ("show me who is balling in August") is **actively
misleading**:

```
preseason snap share vs rookie-season half-PPR, drafted 2025 rookies
  rho = -0.195   (n = 84)
```

It is negative, and the mechanism is visible in the data: Quinshon Judkins
played **0%** of preseason snaps and scored 156.8; TreVeyon Henderson played 8%
and scored 188.7. Established rookies are protected in August. **Preseason snap
share measures job insecurity, not talent.**

A pooled all-rookies figure looks mildly positive (~+0.13) only because UDFAs
who never play have both zero snaps and zero points — it is an "is he an NFL
player at all" filter, not a talent signal.

**Do not ship a preseason leaderboard.** This is the most valuable finding here,
because it is the feature a reasonable person would have built first.

## 4. Finding 2 — the week-1 depth chart is the signal

```
Spearman vs rookie-season half-PPR points, pooled 2021–2025 (n = 396)
  week-1 depth rank (inverted)   rho = +0.541
  NFL draft capital (inverted)   rho = +0.598
```

Both are strong, and both are **stable across five independent classes**:

| Season | depth | capital | n |
|---|---|---|---|
| 2021 | +0.601 | +0.576 | 75 |
| 2022 | +0.364 | +0.504 | 79 |
| 2023 | +0.552 | +0.657 | 80 |
| 2024 | +0.575 | +0.599 | 77 |
| 2025 | +0.595 | +0.625 | 85 |

2022 is the weak year for depth rank (+0.364) and sets the realistic floor.

Depth rank is **not** a talent detector — it is an *opportunity* detector. That
is precisely the gap worth exploiting, because dynasty ADP prices draft capital
almost immediately and prices opportunity slowly.

## 5. Calibration — a rank means different things by position

Median rookie-season half-PPR points, position × week-1 depth rank:

| | rank 1 | rank 2 | rank 3 | 4+ / off chart |
|---|---|---|---|---|
| **QB** | 212 (n=10) | 55 (n=14) | 19 (n=19) | 0 (n=15) |
| **RB** | 120 (n=9) | 76 (n=21) | 38 (n=53) | 3 (n=21) |
| **WR** | 154 (n=15) | 43 (n=62) | 17 (n=35) | 4 (n=49) |
| **TE** | 102 (n=8) | 41 (n=25) | 23 (n=25) | 0 (n=15) |

Reading it:

- **QB is binary.** Rank 1 is worth 212; rank 2 is worth 55. Nothing else in the
  table has that cliff.
- **RB degrades gently.** A rank-3 RB still returns 38 — handcuff value is real,
  and RB is the most forgiving position to draft into a crowded room.
- **WR falls off hard after rank 1** (154 → 43). A rank-2 WR is not "almost a
  starter."
- **TE rank 1 or nothing** (102 → 41).

**This table is why the back-test was worth doing.** A single-season pass
(2025 only) put WR rank 3 at ~102 points on n=4 — noise. Five seasons put it at
17 on n=35. A position-blind score built on the one-season read produced a
"most undervalued rookies" list that was **eight backup tight ends**, because it
rewarded TE2s for an ordinal that means nothing at that position.

## 6. The blend

Depth score = the position's own calibration row normalized to its own maximum
(so a rank is scored by what it is *worth* at that position, not by its
ordinal). Capital score = `1 − log(pick)/log(260)`.

```
  w_depth=0.0   rho=0.598      w_depth=0.6   rho=0.645
  w_depth=0.1   rho=0.639      w_depth=0.7   rho=0.631
  w_depth=0.2   rho=0.659      w_depth=0.8   rho=0.611
  w_depth=0.3   rho=0.664  ←   w_depth=0.9   rho=0.591
  w_depth=0.4   rho=0.661      w_depth=1.0   rho=0.530
  w_depth=0.5   rho=0.655
```

**Best: 0.3 depth / 0.7 capital → rho = +0.664**, against +0.598 for capital
alone. The curve is **flat from w=0.2 to w=0.5** (0.655–0.664), so the weight is
not knife-edge and does not need re-tuning annually.

An earlier single-season pass independently landed on the same 0.3 weight
(rho +0.689 on 2025 alone). The weight replicating across a five-season frame is
the reason to trust it.

## 7. Plumbing

- **Join:** nflverse `roster_2026.csv` carries a **`sleeper_id`** column —
  111/227 of the 2026 skill rookies (essentially all the drafted ones), and
  **100% of those resolve** against the Sleeper player DB. Name-matching covers
  the UDFA remainder: **85/86 (99%)** on 2025 drafted skill players, the single
  miss being a suffix mismatch (Oronde Gadsden II).
  This is the same two-tier pattern the app already uses for draft-slot
  resolution — no fragile single join.
- **Pipeline:** nflverse is CORS-blocked and the depth-chart file is 39MB, so
  this needs a third Actions workflow publishing a small derived JSON to a data
  branch, identical in shape to `values-history.yml`. The app never fetches the
  CSVs.
- **Camp movement** (a rookie climbing from RB3 in March to RB1 in August) is
  computable for 2026 — the file has daily snapshots back to 2026-03-22 — but
  is **not back-tested**: nflverse's 2025 depth charts begin 2025-08-03, so
  there is no pre-camp baseline in the historical window. Ship it as displayed
  context, not as a scored input, until a season of it exists.

## 8. What this does NOT establish

- **It predicts rookie-*season* points, not dynasty outcomes.** A three-year
  hit rate is the metric a dynasty manager actually wants; that needs the
  monthly `values-archive.json` to accumulate (see the trajectory calibration
  memo) or a multi-year outcome frame.
- **Depth rank is partly tautological.** "He is the starter" obviously predicts
  production. The claim is narrower and still useful: this is knowable *before*
  the rookie draft and is not fully priced into rookie ADP.
- **Cell counts at rank 1 are thin** (n=8–15 per position). The *ordering* is
  solid; the exact medians are not precise.
- **Era mismatch in coverage.** 2021–2024 charts locate 75–84% of drafted
  rookies; the 2025 schema locates 99%. Missing players are scored as rank 4+,
  which is right on average but wrong for a specific player the old feed simply
  did not list.
- **Nothing here validates a UI.** These are signal correlations, not evidence
  that a screen built on them improves draft decisions.

## 9. Proposed module shape (approved in outline, not built)

Draft becomes **Board · Research · Tracker**. Research shows, per rookie: the
opportunity score and its two inputs, position-aware depth-chart standing with
its camp movement, NFL draft capital, and **divergence from FantasyCalc's rookie
rank** — the "market has not caught up" list, which is the actual product.

Explicitly out of v1: any preseason production leaderboard (§3), combine
athleticism (no 2026 data), and camp-buzz text scoring (the news feed force-
pushes ≤100 items and never accumulates, so it would need its own rolling
archive first).
