# Trade-structure profiling — DISCONFIRMED at this league's N (2026-08-14)

**Frontier Item 3** (`dynastyedge-research-frontier`) asked whether the app could
answer "what offer will this specific human accept?" by profiling the *shape* of
each manager's accepted trades. This is the step-2 stability test the item
required before any build. **It disconfirms the hypothesis**, and the item is
parked with evidence.

Nothing in `src/` changed. The experiment ran as a scratch script driving the
**shipped** `buildManagerProfiles`, per the research methodology's offline-experiment
stage.

-----

## The claim that was tested

Pre-registered in full before any feature was computed (note reproduced verbatim at the end of this file).

> A structure profile fit on a manager's EARLIER trades describes their LATER
> trades better than the league-average profile does.

**Framing limit, carried from the frontier item:** Sleeper never exposes rejected
or pending offers, so this is structure profiling of **accepted** trades — one-class
data. Nothing here could have licensed a claim of the form "predicts they will
accept," and nothing here does.

## Corpus (better than the item feared)

Live Sleeper + FantasyCalc, frozen once to `corpus.json` and reused byte-identical
across runs.

|  |  |
|---|---|
| Seasons walked (`previous_league_id` chain) | 2026, 2025, 2024, 2023 |
| Unique completed trades | 95 |
| Manager trade *sides* | 176 (42/25/25/16/15/15/14/13/11/4) |
| Qualifying managers (≥ 8 sides) | 9 of 10 |
| Fit sides / holdout sides | 85 / 91 |
| Sides missing a timestamp | 0 |

The frontier item warned that "some managers have 1–2 trades." That is not this
league: only one manager (4 sides) fell below the inclusion bar. The test was
**powered** — the pre-registered guard of ≥ 60 holdout sides was cleared by 91.
This is a real negative, not an underpowered one.

## Features (3, fixed in advance)

Per trade side, from that manager's perspective; FAAB excluded.

| | Feature | Reads as |
|---|---|---|
| F1 | `\|got\| / (\|got\|+\|gave\|)` | consolidating < 0.5 < spreading |
| F2 | pick value received / total value received | pick appetite |
| F3 | value-weighted mean age got − gave | negative = got younger |

Position flow was computed but deliberately **not scored** — keeping dimensionality
low at this N was part of the pre-registration.

Profile = per-feature **median** of the manager's fit sides. Baseline = pooled
median of all qualifying managers' fit sides. Distance = mean per-feature absolute
deviation, scaled by pooled-fit IQR. Win = holdout side closer to own profile than
to league baseline.

## Result

| Metric | Predicted | Measured | In band? |
|---|---|---|---|
| Overall win rate | 58% ± 7 (null 50%) | **39.0%** | **No — below the null** |
| Permutation p (10k shuffles, seed 20260814) | < 0.05 | **0.4239** | No |
| Managers individually ≥ 50% | ≥ 6 of 9 | **2 of 9** | No |
| Holdout sides (power guard) | ≥ 60 | 91 | Yes |

**Verdict: DISCONFIRMED** on all three pre-registered criteria, in the same
direction. The own-manager profile did not merely fail to beat the league
baseline — it was **worse than it**.

## Why it failed — one mechanism, covering every observation

A profile is only useful if managers' profiles differ. They do not, at this N:

| Feature | Between-manager MAD | Within-manager MAD | Signal / noise |
|---|---|---|---|
| F1 | **0.000** | 0.087 | 0.00 |
| F2 | **0.000** | 0.261 | 0.00 |
| F3 | 1.138 | 2.006 | 0.57 |

**Seven of the nine managers have identical fit medians** (F1 = 0.50, F2 = 0.00).
The median trade side in this league is a value-symmetric swap containing no
received picks, for almost everyone — the differences between managers live in the
tails, not the center. F3 (age gradient) has some between-manager spread, but
within-manager spread is nearly double it.

That single fact explains all four observations:

1. **Overall below 50%** — where the own-median differs from the pooled median at
   all, it is a noisier estimate (4–21 sides) of the same shared central tendency,
   so it sits *further* from a typical holdout side.
2. **League baseline closer on all three features** — measured directly: F1 0.103
   vs 0.115, F2 0.344 vs 0.348, F3 2.619 vs 3.097.
3. **7 of 9 managers below 50%** — the same penalty applies to nearly everyone.
4. **The 2 above 50% follow no pattern** — see below.

**A false pattern, recorded because it was tempting.** The two managers who scored
≥ 50% looked at first like the two pick-heavy ones (a real trait beating the noise
penalty). They are not. The two pick-heavy managers (F2 = 0.70 and 0.76) scored
67% and **29%**; the second above-50% manager has F2 = 0.00. There is no pattern —
it is noise, exactly as the permutation test's p = 0.42 says. Writing this down
because narrating it as a finding is the specific failure mode the pre-registration
discipline exists to prevent.

## What this does and does not establish

**Does:** the *median-centroid-over-three-structure-features* operationalization is
not merely unstable but actively harmful at this league's N. Wiring it into
`suggestFairPackage` / `getCounterSuggestion` would have made suggestions worse
than ignoring the manager entirely.

**Does not:** prove managers have no structural tendencies. `buildTendencies`
(`managerAnalysis.js`) computes its chips differently — means and thresholds
relative to the league average, not medians — and those chips remain descriptive
labels backed by their own logic. This test says nothing about them.

**Live lead for any future attempt** (a hypothesis, not a result): the between-manager
signal is absent *in the median* while within-manager spread is large. If a
structural trait exists here it lives in the distribution's shape or tails — mean
pick share, or the frequency of extreme sides — not its center. Any such attempt
needs its own pre-registration and faces the same N.

## Standing ruling

**Do not re-attempt manager structure profiling as a per-manager centroid scored by
distance to a pooled baseline.** It was tested on the full 4-season corpus and it
loses to the baseline. Revisit only if (a) the corpus roughly doubles, or (b) the
operationalization changes to a distribution-shape statistic, pre-registered
separately.

## Reproduction

`scripts/dev/trade-structure-backtest.mjs` — analysis-only, nothing imports it,
deliberately outside `src/` per the offline-experiment stage. It builds the corpus
by driving the **shipped** `buildManagerProfiles`, so this memo and the app's own
ledger logic cannot drift apart (same discipline as
`scripts/dev/rookie-signal-backtest.mjs`).

```bash
SKILL=./.claude/skills/dynastyedge-diagnostics-and-tooling
node --import $SKILL/scripts/reg.mjs scripts/dev/trade-structure-backtest.mjs --refetch
```

The loader hook is required (`src/utils` use extensionless imports), and its
leading `./` is required too — node reads a bare relative `--import` as a package
name. First run needs network and freezes the corpus to `.cache/`; later runs
reuse it. Fixed seed 20260814, so the permutation p is deterministic: verified
2026-08-14 to reproduce every number above from a cold refetch.

**Adversarial-refutation pass (Law 3) was NOT run** — no subagent was spawned this
session. It is not a gate here, because nothing graduates to `src/`: the result is
a negative that closes a path. If a future session revives Item 3 on the lead
above, the refutation pass becomes mandatory before anything lands.

-----

## Appendix — the pre-registration note, verbatim

Written 2026-08-14T14:32:32Z, before any feature value was computed. Reproduced
unedited, per the research methodology (Law 1).

```markdown
# PRE-REGISTRATION — Item 3 step 2: are per-manager trade-STRUCTURE profiles stable?
(2026-08-14, session 01UrjGNW; frontier Item 3, analysis-only)

HYPOTHESIS: A manager's accepted-trade *structure* (shape, not value) is a stable
personal trait. A structure profile fit on a manager's EARLIER trades describes
their LATER trades better than the league-average profile does.

MECHANISM: Managers have durable strategic preferences (consolidator vs. depth
collector, pick accumulator vs. win-now, youth buyer vs. vet buyer). Those
preferences constrain which offers they say yes to, so the shape of their
accepted trades should repeat across seasons even as the specific assets change.

FRAMING LIMIT (carried from the frontier item): Sleeper never exposes rejected or
pending offers. This is structure profiling of ACCEPTED trades — one-class data.
No claim of the form "predicts they will accept" is licensed by this design.

## Data
Frozen snapshot: scratchpad/corpus.json, built 2026-08-14 by corpus.mjs driving
the SHIPPED buildManagerProfiles (no src/ changes). Live Sleeper + FantasyCalc.
4 seasons (2026, 2025, 2024, 2023), 95 unique trades, 10 managers.
Known already (descriptive, not outcome): per-manager trade-side counts
42/25/25/16/15/15/14/13/11/4.

## Features (fixed now; 3 primary dims, chosen before any were computed)
Per trade side, from that manager's perspective. FAAB assets excluded (value 0).
  F1 countRatio  = |got| / (|got| + |gave|)          consolidating <0.5< spreading
  F2 pickShareGot= pick value received / total value received      0..1
  F3 ageGradient = value-weighted mean age of players GOT
                   minus value-weighted mean age of players GAVE   (negative = got younger)
Sides where a feature is undefined (e.g. no aged players on either leg) are
dropped for that feature only, and the count of drops is reported.
Position flow (QB/RB/WR/TE share) is computed and reported DESCRIPTIVELY ONLY —
deliberately not scored, to keep dimensionality low at this N.

## Design (chronological split, per manager)
Order each manager's sides oldest→newest by (date ?? season+week fallback).
First half = FIT, second half = HOLDOUT. Managers with <8 total sides are
EXCLUDED as insufficient data (the UI already calls these "cold call").
Profile = per-feature MEDIAN of that manager's FIT sides (robust at small N).
League baseline = per-feature median of ALL qualifying managers' FIT sides pooled.
Feature scale s_i = IQR of feature i over pooled FIT sides ONLY (never holdout).
Distance d(x, p) = mean_i |F_i(x) - p_i| / s_i  over the features defined for x.

## Test statistic
WIN RATE = share of holdout sides where d(x, ownProfile) < d(x, leagueProfile).
Ties count as 0.5. Reported overall AND per manager with counts, never rates alone.

Significance: permutation test, 10000 shuffles, fixed seed 20260814. Under the
null, reassign which manager's profile scores each holdout side (shuffling the
profile labels across qualifying managers). p = share of shuffles with win rate
>= observed.

## PREDICTIONS (before running)
  - Overall win rate: null 50% -> predicted 58% +/- 7 (i.e. 51-65)
  - Permutation p-value: predicted < 0.05
  - Guard: at least 6 of the 9 qualifying managers individually >= 50%
    (a result driven by one 42-trade manager is not a league-wide trait)
  - Guard: total holdout sides >= 60 (else the test is underpowered; report and stop)

## DISCONFIRMED IF
  Overall win rate <= 52.5%, OR permutation p >= 0.05, OR fewer than 5 of 9
  managers individually >= 50%. Any of these parks Item 3 with evidence
  ("profiles unstable at this N"), which the frontier item names as a valid result.

## EVALUATION FENCE
The holdout (later half of each ledger) is touched exactly once, by the scoring
script, after this note is written. Features, distance, baseline, exclusion rule,
and thresholds are all fixed above. No feature will be added or dropped after
seeing the win rate; if the result disconfirms, it is recorded as disconfirmed.
```
