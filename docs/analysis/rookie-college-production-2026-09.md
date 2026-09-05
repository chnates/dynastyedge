# College Production — the Phase 3b gate, September 2026

**Date:** 2026-09-04. **Verdict: NULL for the product. Nothing ships. 3d stays
dead, and the two-axis rookie question is now closed.**

Companion to `docs/analysis/rookie-longterm-signals-2026-09.md`, which stopped
the two-axis UI on age and combine athleticism and named college production as
the one untested candidate. This is that test.

**Reproduce:** Actions → *Snapshot rookie intel* → Run workflow → `mode:
college-backtest` (it needs the `CFBD_API_KEY` repo secret, which a dev machine
cannot read). Script: `scripts/dev/rookie-college-backtest.mjs`, which imports
the shipped constants so the analysis and the app cannot drift.
Run of record: **33931139020**.

---

## 1. The plumbing worked, and the build plan's join was wrong

The plan said to join on `cfb_id`. That is a dead end: nflverse's
`cfb_player_id` is a **sports-reference slug** (`ashton-jeanty-1`), while CFBD
keys athletes numerically. The real bridge is **ESPN's athlete id**, which we
already carry in Sleeper's player DB and in nflverse `players.csv`.

Verified in run **33930109784** (`scripts/dev/cfbd-probe.mjs`):

- CFBD's `playerId` on `/stats/player/season` **is** the ESPN athlete id —
  12/12 named spot-checks return the right human at the right position and the
  right college; 5,353 of 5,364 distinct ids sit in ESPN's range.
- 85/85 of the 2025 draft class resolve in the 2024 payload, by id.
- **No name matching anywhere**, which is the standard the rest of this
  pipeline holds.

Cost is trivial: omitting `team` returns the whole FBS for a year in one call
(~20k receiving rows in ~5s), so 28 calls covers 2009–2022. Querying *by* team
returns zero rows — CFBD's team names are its own ("Miami", not nflverse's
"Miami (FL)") — which would have been a name-matched **team** join, no better
than a name-matched player one.

## 2. The coverage cliff — and why the first run's numbers were thrown out

The first full run (33930694653) produced a tidy-looking result that is
**confounded**, and its own coverage table is the evidence:

| class | covered | | class | covered | | class | covered |
|---|---|---|---|---|---|---|---|
| 2013 | 0/79 (0%) | | 2017 | 25/83 (30%) | | 2021 | 72/75 (96%) |
| 2014 | 0/75 (0%) | | 2018 | 59/83 (71%) | | 2022 | 76/79 (96%) |
| 2015 | 0/78 (0%) | | 2019 | 77/80 (96%) | | 2023 | 80/80 (100%) |
| 2016 | 3/77 (4%) | | 2020 | 75/77 (97%) | | | |

**CFBD's `playerId` is only ESPN-aligned from college season ~2015 onward.** So
a fit on classes ≤2019 is mostly fitting the *missing-value fallback*, while the
held-out classes carry the variable at 96–100% — two different populations, and
a delta across that boundary is not an out-of-sample estimate. Worse, the median
fallback turns the "long-term" score into a compressed restatement of draft
capital for a third of the frame.

Everything below is therefore restricted to classes clearing **80% coverage**:
**2019–2023, n = 391**, split at 2021. That is the honest size of the evidence.
The script still prints the full-frame numbers, labelled CONFOUNDED, so the
cliff stays visible rather than being quietly dropped.

Even inside the good era, coverage is only ~half a class, permanently — FCS,
JUCO and transfer players are not in CFBD's FBS data:

| | QB | RB | WR | TE |
|---|---|---|---|---|
| covered | 63/125 | 133/233 | 186/350 | 85/158 |
| median final-season dominator | 0.000 | 0.232 | 0.280 | 0.149 |

The QB median of 0.000 is a limitation of the metric, not of the data: a
dominator built on receiving and rushing share does not describe a quarterback.

## 3. Q1 — does it beat draft capital alone? Yes, thinly.

```
CLEAN FRAME (2019-2023), weight chosen on 232 training rookies (<= 2021):
    w_college = 0.15   (train rho 0.624)
  HELD OUT > 2021 (n=159):  capital 0.521    +college 0.543    delta +0.0216
      2022 (n=79):  0.435 -> 0.456   +0.020
      2023 (n=80):  0.590 -> 0.599   +0.009
```

Univariate vs years 2+3: final-season dominator **+0.138** (n=467), best-season
**+0.142**, breakout age **+0.262** (n=306), against draft capital's **+0.595**.

**The structurally interesting result is the collinearity: dominator vs capital
is +0.088 / +0.048 — essentially orthogonal.** Age was +0.360 and athleticism
+0.192. This is the first input tested that is genuinely *not* a restatement of
where a player was drafted.

But the test is two held-out classes and n=159. Treat +0.022 as directional.

## 4. Q2 — does it add anything on top of the shipped score? No.

```
vs YEAR 1     per-class delta at w=0.15:  mean +0.0034   t=+0.39   improved 3/5
vs YEARS 2+3  per-class delta at w=0.15:  mean +0.0109   t=+1.71   improved 4/5
```

t = 1.71 on five classes clears nothing. For calibration, this repo already
**rejected** weekly defense streaming at t = 2.22, and the age tilt recorded in
the companion memo is **stronger** on every axis: +0.018, t = +3.35, 8 of 9
classes. College production is the weaker of the two add-ons.

## 5. Q3 — a separable second axis? No. This closes the question.

```
                        vs YEAR-1 pts    vs YEARS 2+3 pts
  capital alone           +0.604            +0.576
  impact-now (shipped)    +0.673            +0.608
  long-term (+college)    +0.559            +0.543
```

**The long-term score is a worse predictor of years 2-3 than the score already
shipped, and worse than draft capital alone.** A "long-term" axis that loses at
predicting the long term cannot be defended, whatever else is true about it.

It *is* a genuinely different ranking — `Spearman(impact-now, long-term) =
0.725`, against 0.934 for age + athleticism. That is real decorrelation. It is
also the trap: **being different is not being better.** Decorrelation without
accuracy is noise, and noise is exactly what an orthogonal-but-weak signal
injects when you weight it heavily enough to move the ranking.

The quadrants the two-axis product depends on:

```
      long Q1   Q2   Q3   Q4
now Q1    71   21    6    1
now Q2    22   35   24   17
now Q3     4   27   38   29
now Q4     2   15   30   49

  "taxi stash"     (low now / high later):  6/391  (1.5%)
  "win-now rental" (high now / low later):  7/391  (1.8%)
```

Up from 0 and 2 of 712 with age + athleticism — but a two-axis UI whose
distinguishing cases apply to roughly **one rookie in 65** is not a product,
and half of them would be unscored anyway on coverage.

## 6. Decision

- **Nothing ships from 3b.** No college production in the feed, the model, or
  the UI. Draft › Research keeps one score.
- **3d stays dead**, now for the second time and on the stronger of the two
  candidate inputs. The two-axis rookie question is closed.
- **The standing recommendation is unchanged and is not a college one:** the
  only measured, replicating improvement available is the **0.10 age tilt** on
  the shipped opportunity score (+0.018 rho on years 2+3, t = 3.35, 8 of 9
  classes, no measurable cost to year 1). Still not shipped — it changes a
  back-tested model and needs an explicit owner ask.
- `CFBD_API_KEY` now exists and works. **The app uses nothing from it.** The
  `probe` and `college-backtest` workflow modes are kept as the re-runnable
  record; the daily snapshot never calls CFBD.

## 7. What this does NOT establish

- **n = 391 across 5 classes, 2 of them held out.** This is a small test and
  the write-up should not be read as a decisive null on college production in
  general — only on *this* construction of it, at *this* coverage.
- **The dominator here is a simple one**: share of team receiving yards and TDs
  (rushing + receiving for RBs). Target share, yards per route run, and
  air-yards constructions were not tested and are not free.
- **Breakout age was measured but never got its own gate** (n=306, univariate
  +0.262, the strongest single college number here). It is dated off age at the
  draft rather than a true birthday, which is coarse. If anything from 3b
  deserves a second look, it is this — not the dominator.
- **The coverage cliff may move.** If CFBD backfills ESPN ids for pre-2015
  seasons, the usable frame roughly doubles and every number here is worth
  re-running.
