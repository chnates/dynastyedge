# Rookie Long-Term Signals — the Phase 3c gate, September 2026

**Date:** 2026-09-04. **Verdict: the two-axis rookie module is NOT built.**
Phase 3a (age + measurables in the feed) shipped as displayed context. Phase 3b
was skipped — see §7. **Phase 3d is stopped**, on the result in §4.

**Reproduce every number here:**
`node scripts/dev/rookie-longterm-backtest.mjs --bootstrap`
(zero dependencies, read-only, public data; caches ~50MB of nflverse CSVs).
The script **imports the shipped constants** from `src/utils/rookieResearch.js`,
the same discipline as `scripts/dev/rookie-signal-backtest.mjs`, so the analysis
and the app cannot drift apart. It also re-derives `COMBINE_BASELINE` and
`AGE_BASELINE` from raw nflverse data and diffs them against what ships.

**The question Phase 3 asked** (`docs/build-plan-2026-09.md` §4): the shipped
opportunity score answers "will this rookie play *this season*". A dynasty
manager also needs "is he worth a taxi spot for three years". The plan proposed
a second score built from **age at draft, combine athleticism, and college
production**, gated on beating NFL draft capital alone out of sample.

---

## 1. Frame

| | |
|---|---|
| Population | nflverse `draft_picks.csv`, every drafted skill player (QB/RB/WR/TE) |
| Classes | **2013–2023**, n = **866** (a class needs seasons S+1 and S+2 fully played) |
| Outcome | combined half-PPR points in his **2nd + 3rd NFL seasons** |
| Missing | a drafted rookie absent from a season's stats file scores **0.0** — busts stay in the denominator |
| Coverage | age 865/866 · forty 658/866 · vertical 635/866 · broad jump 613/866 |

**The join is ID-based end to end and never name-matches.**
`draft_picks.pfr_player_id` → `combine.pfr_id` is an exact match on both sides.
In the pipeline the same chain runs `pfr_id → gsis_id → sleeper_id` (the roster
crosswalk the feed already had) with `pfr_id → espn_id → Sleeper's espn_id` as a
second ID hop for undrafted combine invitees, who have no draft row. This is
what CLAUDE.md's Jordan Love / Jeremiyah Love note demands, and the live run
confirms it: Jeremiyah Love (RB, ARI) carries his own 4.36, not a quarterback's.

**`draft_picks.csv`'s career columns are unusable as labels.** `games`,
`w_av`, `seasons_started`, `rec_yards` are **career totals as of the file's last
refresh** — not season-scoped — so they leak straight across the year-1 /
years-2-3 boundary this test depends on. Per-season nflverse stats are used
instead. (The build plan named those columns as the label source; this is a
correction, not a shortcut.)

---

## 2. Univariate signal

Spearman vs years 2+3 half-PPR, pooled, in-sample:

| Signal | rho | n |
|---|---|---|
| NFL draft capital | **+0.595** | 866 |
| Age at draft (younger = better, z within position) | +0.303 | 865 |
| Combine athleticism (mean drill z within position) | +0.177 | 684 |

Collinearity with capital: age +0.360, athleticism +0.192. Draft capital
dominates, which is the same story the year-1 back-test told.

Age is measured **within position** because the spread is tiny — every position
sits within a year of 22.2 with an sd under 1.1 (QB 22.75, RB 22.09, WR 22.15,
TE 22.45). That narrowness is itself a reason age cannot carry a score.

---

## 3. The gate as written — long-term score vs draft capital alone

Clean temporal split. **Every choice — which inputs, what weight — is made on
the 2013–2019 training classes.** The test classes are never looked at while
fitting.

```
weights chosen on 555 training rookies:  capital 0.90 · age 0.05 · athleticism 0.05
HELD OUT 2020–2023 (n=311):   capital alone 0.571    long-term 0.583    +0.0122
    2020 (n=77)   capital 0.602   long-term 0.622   +0.020
    2021 (n=75)   capital 0.618   long-term 0.618   +0.000
    2022 (n=79)   capital 0.435   long-term 0.445   +0.010
    2023 (n=80)   capital 0.590   long-term 0.613   +0.023
bootstrap over held-out players (fixed seed, B=3000):
    delta +0.0119    95% CI [-0.0020, +0.0260]    P(>0) = 0.956
```

**The gate as literally written passes — and it passes by a hair.** +0.012 rho,
with a 95% confidence interval that **includes zero**. For scale, the DEF
streaming result this repo already rejected had t = 2.22 (§0 of the build plan);
this is weaker than that.

**Combine athleticism is null.** On the held-out classes, its best weight buys
+0.002:

```
w_ath = 0.00  →  0.581      w_ath = 0.10  →  0.583
w_ath = 0.05  →  0.583      w_ath = 0.15  →  0.581
```

Coverage compounds the problem: only **49 of the 2026 class's 237 published
rookies have a 40 time**. nflverse publishes combine results only, and the best
prospects increasingly skip the drill or run at a pro day. A signal worth +0.002
on 60% of the historical population and ~20% of the live one is not a feature.

---

## 4. The product gate — is there a second axis at all?

The gate above compares the candidate to *draft capital*. The comparison that
decides whether to build a **two-axis UI** is against **the score already
shipped**. Frame: 2015–2023, n = 712, 550 located on a week-1 depth chart.
**2015–2020 sits entirely outside the 2021–2025 window the shipped opportunity
score was calibrated on**, so the shipped score gets no in-sample advantage.

```
                        vs YEAR-1 pts     vs YEARS 2+3 pts
  capital alone            +0.609            +0.591
  impact-now (shipped)     +0.692            +0.632
  long-term (candidate)    +0.612            +0.602
```

**The long-term score loses at its own outcome.** The score the app already
ships predicts years 2+3 better (+0.632) than the score built specifically to
predict years 2+3 (+0.602). Depth-chart standing carries more three-year
information than age and athleticism do.

```
Spearman(impact-now, long-term) = 0.934
```

Both scores are ~90% draft capital, so they are near-duplicate rankings. The
joint quartile distribution, ranked within each class:

```
      long Q1   Q2   Q3   Q4      (Q1 = best)
now Q1   158   21    2    0
now Q2    23  125   29    1
now Q3     0   31  110   38
now Q4     0    1   38  135
```

531 of 712 (75%) sit on the diagonal. And the two cells the product actually
depends on:

- **"Year-1 impact low, long-term upside elite — a taxi stash": 0 of 712.**
  Zero, across nine real draft classes.
- **"High now, low later — a win-now rental": 2 of 712.**

Those two quadrants *are* the two-axis product. They are empty. A two-axis UI
here would show the same list twice under two headings and invite the reader to
find a disagreement that the data does not contain.

**Decision: stop before 3d.** Reported as a null, per the build plan's
instruction that 3c is a gate and not a formality.

---

## 5. The one positive by-product — a long-term *tilt*, not a second axis

The long-term question is real even though the second axis is not. Adding a
small age weight **on top of the shipped score** — one number, one ranking —
does move the right way:

```
vs YEARS 2+3 (n=712)      2015–2020        2021–2023        pooled
  w_age = 0.00              0.651            0.586           0.632
  w_age = 0.05              0.659            0.603           0.641
  w_age = 0.10              0.659            0.615           0.644   <-
  w_age = 0.15              0.649            0.615           0.638
  per-class delta at w_age = 0.10:  mean +0.0183  t = +3.35  improved 8/9

vs YEAR 1
  per-class delta at w_age = 0.10:  mean -0.0023  t = -0.37  improved 4/9
```

A 0.10 age tilt gains +0.018 rho on years 2+3, replicating in 8 of 9 independent
classes at t = 3.35, and costs nothing measurable on year 1. It moves 241 of 712
rookies ≥ 5 spots within their class (Spearman 0.971 with the shipped order) —
a real reordering, not a rounding.

**Not shipped.** It is a change to a back-tested model that was not asked for,
it belongs to the 3d work this memo just stopped, and t = 3.35 on nine classes
is the sort of result this repo's own rules say to replicate before ranking on.
Recorded here as the concrete follow-up if the owner wants one.

---

## 6. What shipped instead (3a)

`rookie-intel.json` now carries, per rookie: **age at the NFL draft**, height,
weight, and the three well-covered combine drills (40, vertical, broad jump).
Live run 2026-09-04: 237 rookies, 66KB, **78 with age, 77 with combine data, 49
with a 40 time**.

They are rendered on the Player Profile drawer's Rookie Opportunity card under
a **"Measurables · context, not scored"** heading, in the same voice as camp
movement. `tests/rookieResearch.test.mjs` pins the null directly: two rookies
identical in position, depth rank and draft capital score identically however
they tested, both through `opportunityScore` and end to end through
`buildRookieResearch`. Cone and shuttle are deliberately not carried — both are
missing for more than half the population.

---

## 7. Phase 3b was not attempted

`CFBD_API_KEY` could not be verified from this environment: the agent proxy
blocks the GitHub Actions API (`/repos/{owner}/{repo}/actions/secrets` returns
403 "Access to this GitHub Actions path is not permitted through this proxy"),
and nothing in the repo references the secret. Per the instruction to build 3b
only if the secret exists, it was skipped. The pipeline reads no key and is
unaffected by its absence.

**College production remains the one untested input**, and §4 is the reason it
matters more than it did before: age and athleticism cannot separate a
long-term axis from the shipped one because both are dominated by draft capital.
Dominator rating and breakout age are the only proposed inputs that are *not*
a restatement of where a player was drafted. If a second axis exists at all,
that is where it would come from — and it stays untested until the key exists.

---

## 8. What this does NOT establish

- **It does not clear the shipped score for years 2+3.** +0.632 is measured, not
  designed; the score was fitted to rookie-season points and merely happens to
  transfer.
- **Draft capital is partly tautological over three years**, the same caveat the
  2026-08 memo made about depth rank: teams keep giving snaps to the players
  they spent on. The claim is narrower and still useful — nothing else free
  beats it.
- **Athleticism is null *as measured here*.** A composite built on pro-day
  numbers, or a position-specific construct (speed score, RAS), was not tested;
  neither is free and CORS-reachable today.
- **n = 712 across nine classes is a small sample for a quadrant claim.** 0 of
  712 is a strong result, but the quadrant boundaries (bottom half / top
  quartile) are a choice; a looser cut would find a handful and still leave two
  rankings correlated at 0.934.
- **Nothing here validates a UI**, exactly as the 2026-08 memo said. These are
  signal correlations.
