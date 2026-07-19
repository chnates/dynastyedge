---
name: dynastyedge-analysis-toolkit
description: First-principles analysis recipes for DynastyEdge's hand-written statistical code. Load when verifying model math in src/utils (playoffOdds, dynastyTrajectory, tradeAnalysis, pickTrades, managerAnalysis), deriving or reviewing a statistical method, checking RNG/simulation correctness (mulberry32, Box–Muller, Monte Carlo), sizing samples or iteration counts, measuring calibration (Brier, reliability), reasoning about shrinkage/pseudo-counts, kernel smoothing, weighted medians, fair-value bands, or proving fixed-seed determinism — or reviewing ANY change to src/utils analytical code. Every recipe has a runnable worked example against this repo's actual code.
---

# DynastyEdge Analysis Toolkit

**Prove it, don't just install it.** DynastyEdge's owner's law: **no new npm dependencies** — every statistical method in `src/utils/` is hand-written plain JS. Your job when touching that code is to *derive* the math, *verify* the implementation against the derivation, and *quantify* the uncertainty — never to import a stats library. This skill gives you seven recipes, each grounded in the actual repo code and each with a worked example that was executed (outputs below are real, from runs on 2026-07-05).

## Running the examples (the harness)

`src/utils/*.js` are pure ESM but use Vite-style extensionless imports (`from './lineupHistory'`), which plain Node rejects. Use the verified resolver hook:

```bash
node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs  your-script.mjs
```

All seven worked examples live in this skill's `scripts/` dir (`01-…` through `07-…`); each file's header comment carries its exact run command. Everything runs **offline by design** — examples use synthetic data fed into the repo's real functions, so they work in any session regardless of network posture (which varies; probe first — see `dynastyedge-diagnostics-and-tooling`). If the harness files are ever missing, the hook is 12 lines: a `resolve()` that appends `.js` to extensionless relative specifiers when the file exists (see the header of any script here, or `dynastyedge-diagnostics-and-tooling`).

## When NOT to use this skill

- **UI/component work, styling, navigation** — this skill covers the pure-math layer only. Use `dynastyedge-architecture-contract` and the design-system rules in CLAUDE.md.
- **Data-shape questions** ("what fields does Sleeper return?") — `dynastyedge-data-contracts`.
- **Debugging a broken screen/fetch** — `dynastyedge-debugging-playbook`.
- **Fantasy-domain semantics** ("what is Superflex / why are QBs valuable?") — `dynasty-fantasy-reference`.
- **Deciding whether a model change should land** — the recipes here produce the evidence; the campaign of improving model quality end-to-end is `dynastyedge-model-quality-campaign` (it consumes these recipes), and landing rules are `dynastyedge-change-control`.
- Don't use it to justify adding a stats/RNG/math npm package. The answer is no; the recipe shows you how to hand-roll and verify instead.

---

## Recipe 1 — Verifying a PRNG + normal transform

**WHEN:** any change near `mulberry32` or `normalSample` in `src/utils/playoffOdds.js`; any new use of random draws; any suspicion the simulation's randomness is biased ("team X's odds look too stable/streaky").

**The math.** A correct uniform generator on [0,1) has mean 1/2, variance 1/12 ≈ 0.08333 (∫₀¹(x−½)²dx), a flat histogram (chi-square vs equal bin counts), and no serial correlation. Box–Muller maps two independent uniforms to a standard normal via `z = √(−2·ln u)·cos(2πv)`; correct output has mean 0, variance 1, skew 0, excess kurtosis 0, and P(|z|≤1) ≈ 0.68269. Test each moment against its sampling SE: mean SE = 1/√N, skew SE ≈ √(6/N), kurtosis SE ≈ √(24/N). A statistic more than ~3 SEs from its expectation is a red flag; within 2 SEs is a pass.

**Repo fact (as of 2026-07-05):** `mulberry32` (lines 23–31) and `normalSample` (lines 34–41) are **module-internal, not exported** from `playoffOdds.js` — the export list is `teamStartingStrength`, `buildScoringModel`, `simulatePlayoffs`, `buildStrengthPreview`, `getDeadlineVerdict`. So the test replicates them verbatim and adds a **drift guard**: it reads the real source at runtime and fails if the load-bearing tokens (`0x6d2b79f5`, the two `Math.imul` mix steps, `/ 4294967296`, the Box–Muller line) have changed — so the replica can never silently go stale.

**Worked example:** `scripts/01-rng-normal-check.mjs` (plain `node`, no hook needed). Real output:

```
drift guard: all 5 load-bearing tokens present in playoffOdds.js — replica is current

uniformity over N=2,000,000 draws, seed=0x5eed:
  mean     = 0.500339   (expect 0.500000, SE = 0.000204)
  variance = 0.083451   (expect 1/12 = 0.083333)
  chi2(20 bins, 19 df) = 17.28   (5% critical value = 30.14 — pass if below)
  lag-1 autocorrelation = 7.31e-4   (pass if |rho| < 2/sqrt(N) = 1.41e-3)

Box–Muller normality over M=1,000,000 draws of normalSample(rng, 0, 1):
  mean      = 0.00003   (expect 0, SE = 0.00100)
  variance  = 0.99926   (expect 1)
  skew      = 0.00182   (expect 0, SE ≈ sqrt(6/M) = 0.00245)
  ex.kurt   = -0.00087   (expect 0, SE ≈ sqrt(24/M) = 0.00490)
  P(|z|<=1) = 0.68285   (expect 0.68269)
```

**Interpretation:** mean is 1.7 SEs high — unremarkable. Every statistic sits within 2 SEs of theory; the histogram chi-square (17.28 on 19 df) is comfortably below the 5% critical value. mulberry32 + this Box–Muller are fit for the simulation's purpose.

**Pitfalls:**
- The repo's Box–Muller uses only the cosine branch (discards the sine partner) — statistically fine, half as draw-efficient; do not "fix" it, that changes the draw order and breaks byte-identical determinism (Recipe 7).
- The `while (u === 0)` guards matter: `ln(0) = −∞`. If you re-derive a normal sampler, keep them.
- `seed |= 0` coerces to int32 — passing a float seed silently truncates; pass integers.
- Never validate a replica without a drift guard; a stale copy passing tests proves nothing about the repo.

---

## Recipe 2 — Monte Carlo error analysis (is a change signal or noise?)

**WHEN:** interpreting playoff-odds differences ("odds moved 1% after my refactor — did I break something?"), choosing an iteration count, or reviewing any change to `ITERATIONS`.

**The math.** A simulated probability is a mean of N Bernoulli draws, so its standard error is `SE = √(p(1−p)/N)`. At the repo's `ITERATIONS = 10000` (playoffOdds.js line 19), a 95% CI is ±1.96·SE. For a target half-width h, `N = (1.96/h)² · p(1−p)` — worst case p = 0.5.

**Worked example:** `scripts/02-mc-error.mjs` — prints the analytic budget, then runs the repo's **real `simulatePlayoffs`** on a fixed 10-team toy league under 20 different seeds and compares the empirical spread of one team's odds to the binomial prediction. Real output:

```
SE = sqrt(p(1-p)/N) at N=10000:
  p=0.1: SE = 0.30pp  →  95% CI ≈ ±0.59pp
  p=0.5: SE = 0.50pp  →  95% CI ≈ ±0.98pp
iterations needed for a ±1pp 95% CI at p=0.5: 9,604

team 5 playoffPct across 20 seeds (real simulatePlayoffs, 10000 iters each):
  values: 42.3, 44.1, 43.6, 43.2, 43.6, 43.5, 42.4, 43.7, 43.3, 44.3, 44.0, 42.2, 43.3, 43.4, 44.5, 43.6, 43.4, 43.5, 43.9, 43.8
  mean = 43.47%
  observed sd across seeds = 0.60pp
  binomial SE prediction   = 0.50pp   (should be same order, ratio ≈ 1)
  ratio observed/predicted = 1.22
```

**Interpretation:** `ITERATIONS = 10000` is almost exactly the count that buys a ±1pp 95% CI at worst case — a defensible, derivable choice, not a magic number. The observed cross-seed sd (0.60pp) matches the binomial prediction to within the noise of estimating an sd from 20 samples (that estimate itself has ~±16% relative SE, so 1.22 is consistent with 1).

**Decision rule:** with the **same seed**, output is deterministic — ANY change is caused by your code change (see Recipe 7). Across **different seeds/inputs**, a Δ below ~2·√2·SE ≈ 1.4pp (difference of two independent estimates at p≈0.5) is noise; a 1% odds shift between two different-seed runs means nothing, a 5% shift is real.

**Pitfalls:**
- Don't compare same-seed runs to estimate noise — same seed ⇒ zero spread by construction; vary the seed.
- Seed distributions (`seedDist`) split the same 10000 iterations over n·n cells — per-cell SE is far worse than the headline playoffPct SE. Don't over-read a 2% cell.
- Raising ITERATIONS 10× buys only √10 ≈ 3.2× precision and costs 10× compute on the phone's main thread — this is the app's heaviest path (see perf commit `6fb85f3` "perf: speed up playoff Monte Carlo + cut redundant league recompute"). Justify with the formula, not vibes.

---

## Recipe 3 — Shrinkage estimators (the pseudo-count blend)

**WHEN:** touching `buildScoringModel`, `PRIOR_GAMES`, or the trajectory prior blend; or designing any new estimator that must work with few observations (early-season anything).

**Derivation.** With few games, a team's empirical mean is noisy (SE = σ/√g ≈ 24 points at g=1); the roster-strength prior is biased but stable. The Bayesian conjugate-normal posterior mean is a precision-weighted average; parameterizing prior precision as "worth k games" gives:

```
posterior = (n·data + k·prior) / (n + k)
```

The weight on data is n/(n+k): at n=k it's exactly 50/50 — **the pseudo-count is the crossover point**. The repo's actual code, `src/utils/playoffOdds.js` lines 74–77 (as of 2026-07-05), quoted:

```js
const empMean = g ? scores.reduce((s, v) => s + v, 0) / g : 0
const mean = g
  ? (g * empMean + PRIOR_GAMES * priorMean) / (g + PRIOR_GAMES)
  : priorMean
```

with `PRIOR_GAMES = 4` (line 18), and the prior itself `priorMean = BASELINE_MEAN * (1 + STRENGTH_SENSITIVITY * (strength − meanStrength)/meanStrength)` — 115 points ± 0.40× the team's relative roster strength (lines 15–17, 68–70). The std gets the same blend once g ≥ 3 (lines 79–84). `dynastyTrajectory.js` uses the identical pattern with `PRIOR_WEIGHT = 4`, weighting the empirical side by kernel mass instead of game count (lines 99–101).

**Worked example:** `scripts/03-shrinkage.mjs` calls the **real `buildScoringModel`** (strengths 60k/40k → hand-computed prior 115·1.08 = 124.2; team then scores 140 every week) and checks every step against the hand formula. Real output:

```
prior mean (hand): 124.20  |  empirical scoring: 140 every week

 g | repo mean | hand mean | weight on data g/(g+4)
---+-----------+-----------+-----------------------
 0 |   124.200 |   124.200 |   0.00   MATCH
 1 |   127.360 |   127.360 |   0.20   MATCH
 2 |   129.467 |   129.467 |   0.33   MATCH
 4 |   132.100 |   132.100 |   0.50   MATCH
 8 |   134.733 |   134.733 |   0.67   MATCH
13 |   136.282 |   136.282 |   0.76   MATCH
```

**Interpretation:** week 1, one hot 140-point game moves the model only 20% of the way off the prior (127.4, not 140) — by design; a single game is mostly noise. By week 8 the data carries 67%; even at g=13 (a late-season example — the table's last row) the prior retains 4/17 ≈ 24% weight, and at the full 14-week regular season (`playoff_week_start` default 15 ⇒ 14 weeks) still 4/18 ≈ 22%. If you want real results to dominate faster, lower `PRIOR_GAMES`; the number IS the knob, with an exact interpretation ("the prior is worth k games of evidence").

**Pitfalls:**
- A shrinkage estimator is deliberately biased toward the prior. Don't "fix" the week-8 mean not equaling the raw average — that's the feature.
- The prior must be on the same scale as the data (points here). If you change `BASELINE_MEAN`, re-derive `STRENGTH_SENSITIVITY`'s effect: the prior spread across teams is ±0.40× relative strength deviation.
- The output clamps (`Math.max(40, mean)`, `Math.max(8, std)`, lines 87–88) sit AFTER the blend — synthetic tests with tiny values will hit them and "MISMATCH" for the wrong reason.
- g=0 must special-case to the pure prior (the formula handles it, but `empMean=0` would poison a naive refactor that always multiplies by g... which is exactly why the ternary exists).

---

## Recipe 4 — Kernel-smoothed weighted medians (the age curve)

**WHEN:** touching `buildAgeCurves` / `buildPositionCurve` in `src/utils/dynastyTrajectory.js`, `KERNEL_BW`, `PRIOR_WEIGHT`, `priorShape`, or evaluating whether trajectory projections look sane.

**The math and the three design choices (verify each in the code, as of 2026-07-05):**
1. **Median, not mean** (`weightedMedian`, lines 47–56): dynasty values are heavy-tailed — a handful of 8000–10000 studs among a sea of sub-1500 players. A mean age-bin center gets dragged toward whichever superstar happens to be that age; the median is robust to the tail. The curve estimates "what the market pays a *typical* player of age N", and the projection ratio `curve(age+n)/curve(age)` (line 156) only makes sense on a typical-player center.
2. **Gaussian kernel, bandwidth 2.5y** (line 89: `w = exp(−(Δage)²/(2·2.5²))`): single-year bins are thin (sometimes 2–5 ranked players per position-age); the kernel pools neighbors with smoothly decaying weight (a player 2.5y away counts e^(−½) ≈ 0.61) instead of hard bin edges producing a jagged curve. Weights below 0.01 are dropped (line 90) — an effective window of ±~7.6y.
3. **Prior blend for thin bins** (lines 99–101): `curve[age] = (emp·wsum + prior·4)/(wsum + 4)` — Recipe 3's pseudo-count formula, with kernel mass `wsum` playing the role of sample size. Ages with lots of kernel mass read ≈ pure market; a bin with wsum ≈ 1 (e.g. age 38 QBs) is 80% the `priorShape` (a peak-window-shaped curve from `peakWindows.js`: QB [26,33], RB [23,26], WR [24,28], TE [25,29]). No hardcoded decay rates — the curve recalibrates every load, per the "never hardcode values" rule.

**Worked example:** `scripts/04-age-curve.mjs` feeds the **real `buildAgeCurves`** a synthetic market (12 players per position-age, lognormal noise, true peaks RB 24 < WR 26 < TE 27 < QB 28, plus three 9000-value outlier studs planted at age ~31 per position). Real output (excerpt):

```
curve peak age per position (synthetic truth in parens):
  QB: peaks at age 29 (truth 28), curve value 1859
  RB: peaks at age 24 (truth 24), curve value 1845
  WR: peaks at age 26 (truth 26), curve value 1918
  TE: peaks at age 28 (truth 27), curve value 2078
sanity: RB peak (24) < WR peak (26) <= QB peak (29) → PASS

 age |   RB  |   WR
  26 |  1833 |  1918
  28 |  1472 |  1867
  30 |  1021 |  1471
  32 |   567 |  1069

curve at age 31 despite three 9000-value outliers there:
  RB: curve(31) = 713 vs curve(peak) = 1845 — outliers did NOT create a second peak

one age bin [800,900,1000,1100,1200,9000]: mean = 2333 (dragged 2x by one stud), median = 1050 (stable)
```

**Interpretation:** the curve recovers each position's true peak within ±1 year, preserves the RB-before-WR ordering, and — the key robustness check — three 9000-value outliers at age 31 do not bend the curve upward there (713 vs peak 1845 for RB). The inline bin shows why: one stud doubles the mean but leaves the median at 1050. If a proposed change to this code fails the planted-outlier test or the peak-ordering test, it's wrong.

**Pitfalls:**
- Bandwidth trades bias for variance: BW→0 gives a jagged overfit curve; BW→∞ flattens the peak away entirely (RB would stop declining). 2.5y ≈ the half-width of the RB peak window — about the largest BW that can't smear a peak flat. Re-run this script's peak-recovery check after any BW change.
- The prior blend means curve shape is NOT purely empirical at extreme ages — don't cite curve(38) as "market evidence".
- The projection clamps (`YEAR_RATIO_FLOOR/CEIL` = 0.55/1.18 per year, lines 35–36) are a separate safety net in `projectPlayer` — a curve bug can hide behind them; test the curve directly, as here.
- Weighted median has a step discontinuity when mass crosses 50%; the kernel smooths this in practice, but tiny synthetic samples can show jumps — use dense synthetic bins when testing curve *shape*.

---

## Recipe 5 — Calibration measurement (Brier score + reliability)

**WHEN:** asserting the playoff-odds model is "accurate"; comparing model variants; any claim of the form "these probabilities are good".

**The math.** For probability forecasts p_i of binary outcomes o_i, the **Brier score** = mean((p_i − o_i)²); lower is better. It decomposes (Murphy) into *reliability* (are the probabilities honest? predicted 70% events should happen ~70% of the time) − *resolution* (does the model separate haves from have-nots?) + *uncertainty* (base-rate variance, model-independent). The floor for a skillless forecaster is **climatology**: always predict the base rate. **For this league that baseline is exact and computable in your head:** base rate = `playoff_teams` / 10. `playoff_teams` is API-sourced (the code default is 6 — `?? 6` in `src/hooks/usePlayoffOdds.js`), so the default baseline is 0.6 ⇒ climatology Brier = mean((0.6 − o)²) = **0.2400 for every possible outcome set** (with k of 10 in: `k·(1−k/10)² + (10−k)·(k/10)²` all over 10). Confirm the live `playoff_teams` setting before quoting a bar. Any model claiming skill must beat the climatology Brier computed from the LIVE `playoff_teams` on real end-of-season outcomes. A **reliability table** buckets predictions and compares mean predicted vs observed frequency per bucket, each with SE = √(p(1−p)/n_bucket).

**Worked example:** `scripts/05-calibration.mjs` (plain `node`; synthetic because real playoff outcomes accrue 10 per season). Three forecasters over 5000 events: calibrated, climatology, overconfident (probabilities stretched 1.6× from 0.5). Real output (excerpt):

```
Brier scores over N=5000 synthetic events (lower is better):
  calibrated (predicts true p)   0.1766
  climatology (always 0.5)       0.2500
  overconfident (stretch 1.6x)   0.1856

reliability table, overconfident forecaster (5 buckets):
  bucket    | n    | mean predicted | observed freq | gap
  0.0–0.2   | 1489 |          0.057 |         0.173 | +0.116 (bucket SE ±0.010)
  0.2–0.4   |  674 |          0.300 |         0.364 | +0.063 (bucket SE ±0.019)
  0.4–0.6   |  725 |          0.506 |         0.497 | -0.009 (bucket SE ±0.019)
  0.6–0.8   |  658 |          0.698 |         0.616 | -0.082 (bucket SE ±0.019)
  0.8–1.0   | 1454 |          0.940 |         0.839 | -0.101 (bucket SE ±0.010)
```

**Interpretation:** the overconfident forecaster still beats climatology on Brier (0.1856 < 0.25) because resolution can mask bad reliability — **a decent Brier does not prove calibration**. The reliability table exposes it: low buckets observe higher than predicted, high buckets lower (gaps of 6–12 SEs). A calibrated model's gaps sit within ~2 bucket-SEs.

**Sample-size rule of thumb:** to resolve a 5pp miscalibration, bucket SE ≤ ~2.5pp ⇒ n ≈ 0.25/0.025² = **400 events per bucket** (at p≈0.5), i.e. ~2000 events for a 5-bucket table. One DynastyEdge season yields **10** playoff outcomes — never build a 5-bucket reliability table from that. Options: 2–3 coarse buckets over several seasons, or reframe to week-ahead game-winner forecasts (each remaining game each week is an event ⇒ ~5 games × ~13 weeks = 65+/season) and pool.

**Pitfalls:**
- Comparing Brier across different outcome sets/base rates is meaningless — the uncertainty term differs. Compare on the same events, or report the Brier *skill* score 1 − BS/BS_climatology.
- Don't grade the model on the same completed weeks its shrinkage blend already consumed — that's in-sample. Grade forecasts frozen *before* the outcomes.
- Extreme predictions (0%/100%) from `simulatePlayoffs` late in the season are legitimately near-deterministic; exclude decided teams or they inflate apparent skill.

---

## Recipe 6 — Fair-value band arithmetic (and asymmetric penalties)

**WHEN:** touching any % threshold in `tradeAnalysis.js`, `pickTrades.js`, or `managerAnalysis.js`; reviewing "let's widen the fair band" proposals.

**The repo's conventions, verified in code as of 2026-07-05:**
- `tradeAnalysis.js` line 22: `valueWinner = valuePct <= 5 ? 'even' : …` — **±5% is "even"**; line 140: `valueWinner === 'them' && valuePct > 15` → hard **Decline above 15%**. Note the denominator: `valuePct = |get − give| / max(give, get, 1)` (lines 19–21) — percent of the *larger* side, so it's symmetric under swapping sides.
- `managerAnalysis.js` line 16: `const TRADE_EDGE = 0.05` — hindsight win/loss only when `|net|/size > 5%` of trade size; inside that band a trade grades "even".
- `pickTrades.js` lines 158–162 (quoted):

```js
const FLOOR = targetValue * 0.8
const CAP   = targetValue * 1.45
const score = total =>
  total >= targetValue ? total - targetValue : (targetValue - total) * 1.6
```

Packages live in **[80%, 145%]** of the target, and undershoot is penalized **1.6×** per point vs overshoot. (Don't confuse with `suggestFairPackage` in tradeAnalysis.js, which uses its own [0.9, 1.15] band for player packages, line 343–344.)

**Why asymmetric — the derivation.** The two miss directions have different loss functions. Undershoot risks *rejection*: the seller declines a light package and the trade never happens (total loss of the move-up opportunity, plus the social cost of a lowball). Overshoot costs a known, bounded *premium* the buyer consciously chooses. When failure-cost > premium-cost per unit of miss, weight undershoot more; 1.6× encodes "a 10% light offer is as bad as a 16% overpay". The asymmetric band edges (−20%/+45%) follow the same logic: the market tolerates far more overpay than lowball before a package stops being worth suggesting.

**Worked example:** `scripts/06-bands.mjs` runs the **real `suggestPickPackages`** (target 3000) and the **real `getTradeVerdict`** at the band edges. Real output (excerpt):

```
suggestPickPackages(target=3000) — band is [2400, 4350] = [0.8x, 1.45x]:
  '27 2nd + '26 late 2nd + '27 1st   total 3000  diff   0%  score 0
  '27 2nd + '26 mid 1st              total 3100  diff   3%  score 100
  '27 2nd + '26 late 2nd + '26 mid 2nd total 2900  diff  -3%  score 160
  '26 mid 2nd + '26 late 1st         total 3200  diff   7%  score 200
  '26 late 2nd + '26 mid 1st         total 3300  diff  10%  score 300
  '26 late 2nd + '26 late 1st        total 2800  diff  -7%  score 320

asymmetry check: total 2700 (−10%): score = 480 · total 3300 (+10%): score = 300

getTradeVerdict at the band edges (neutral fit/window):
  give 1000 / get 960 → pct 4% even → Accept: Value is roughly even.
  give 1000 / get 880 → pct 12% them → Counter: You're overpaying 12% — adjust the terms…
  give 1000 / get 840 → pct 16% them → Decline: You're giving up 16% more in raw value…
```

**Interpretation:** the ranking makes the asymmetry visible live — a **+10% package (score 300) outranks a −7% package (score 320)**; equal-magnitude misses score 480 (light) vs 300 (heavy). The verdict ladder confirms the 5/15 band edges: 4% → even/Accept, 12% → Counter, 16% → Decline.

**How to sanity-check a band change:** the ±5% band's real meaning is "the share of completed trades we call even". Pull the historical distribution of `|net|/size` across the league's real trade ledger (`useManagerProfiles` composes it; each ledger entry already carries `net`, `gotValue`, `gaveValue`) and compute what fraction of actual trades falls inside the proposed band. If widening 5% → 10% flips a third of graded wins/losses to "even", you've erased the scouting signal; if the current band calls 95% of trades a win or loss, it's too tight relative to FantasyCalc's own valuation noise (±few % day to day — see the values-history feed). Set the band where it separates deliberate value moves from pricing jitter.

**Pitfalls:**
- These constants appear in prose in CLAUDE.md — change code and doc together (`dynastyedge-change-control`).
- `valuePct` is `Math.round`ed before comparison; a raw 15.4% gap rounds to 15 and is NOT a hard decline. Boundary tests must account for the rounding.
- Three different band systems coexist (5/15 verdicts, 0.9–1.15 player packages, 0.8–1.45 picks). They serve different failure modes; do not "unify" them without re-deriving each loss function.

---

## Recipe 7 — Determinism testing (fixed-seed reproducibility)

**WHEN:** before landing ANY change to `simulatePlayoffs` or anything it calls — refactors, performance work, loop reordering — and whenever the UI shows odds "reshuffling".

**Why this repo requires it:** `simulatePlayoffs` defaults to `seed = 0x5eed` (playoffOdds.js line 113) precisely so the Playoff Odds page never reshuffles its numbers across renders — a UI-stability contract, stated in the code comment at lines 21–22 and reiterated at lines 99–106 (a past optimization preserved "the exact RNG draw order (week order, then matchup order, sample A then B) … results stay bit-identical"). The test is brutal and simple: **same inputs + same seed ⇒ byte-identical serialized output.** And prove the test has power: a different seed must produce different output (otherwise you're accidentally ignoring the seed and "determinism" is vacuous).

**Worked example:** `scripts/07-determinism.mjs` — real output:

```
run A (seed 0x5eed): sha256 97a18168f7e9a130  (2069 bytes)
run B (seed 0x5eed): sha256 97a18168f7e9a130
run C (seed 0x5eee): sha256 1ff0a526e10082dd
A === B (byte-identical): PASS
A !== C (test has power): PASS

spot check, roster 1: playoffPct=0.0491, avgSeed=8.859, projWins=2.752
```

**Regression procedure for a refactor:** run this script on the PRE-change code and record the seed-0x5eed hash; apply the change; re-run. If the change is supposed to be behavior-preserving (perf/refactor), the hash must be **identical** — a changed hash means you altered the RNG draw order even if every number "looks close". If the change intentionally alters the model, the hash *should* change; then Recipe 2 tells you whether the magnitude of the odds shift is what you intended.

**Pitfalls (the ways determinism actually breaks):**
- **Draw-order changes:** hoisting a `normalSample` call out of a branch, swapping matchup iteration order, or early-exiting a loop consumes the RNG stream differently. The single shared `rng` is a sequential resource.
- **Discarded partner draws:** switching Box–Muller to return both sin/cos values halves consumption — every downstream number changes.
- `Math.random()` anywhere in the path, object-key iteration order (avoided in the current code via dense arrays — keep it that way), unstable sorts (the code relies on ES2019+ stable `Array.prototype.sort`, line 181–183), and `Date.now()`/locale formatting inside serialized output.
- Compare **serialized** output (JSON), not `===` on objects; hash it so diffs are one line.

---

## Which recipe for which claim

| The claim under review | Recipe |
|---|---|
| "The randomness is fine / biased" · any new sampler | 1 — PRNG + normal transform |
| "Odds changed by X — is that real?" · "10000 iterations is (not) enough" | 2 — Monte Carlo error |
| "The model overreacts / underreacts to early results" · any few-observations estimator | 3 — shrinkage |
| "The age curve looks wrong" · bandwidth/prior/median changes · trajectory sanity | 4 — kernel-smoothed medians |
| "The playoff odds are accurate" · comparing model variants | 5 — calibration / Brier |
| "Widen/tighten the fair band" · any % threshold change · "why 1.6×?" | 6 — fair-value bands |
| "This refactor doesn't change behavior" (in playoffOdds) · "odds reshuffle in the UI" | 7 — determinism |
| Combination: refactor for perf | 7 first (must be byte-identical), else 2 (quantify the drift) |
| New model feature end-to-end | 3 or 4 to derive → 7 to pin → 2 to size → 5 to grade (see `dynastyedge-model-quality-campaign`) |

## Provenance and maintenance

- **Authored 2026-07-05** against the repo at that date. Every constant cited was read from source that day: `ITERATIONS=10000`, `PRIOR_GAMES=4`, `BASELINE_MEAN=115`, `BASELINE_STD=24`, `STRENGTH_SENSITIVITY=0.40`, seed `0x5eed` (playoffOdds.js); `KERNEL_BW=2.5`, `PRIOR_WEIGHT=4`, clamps `0.55/1.18`, `ROOKIE_ENTRY_AGE=22` (dynastyTrajectory.js); `±5%`/`>15%`, package band `0.9–1.15` (tradeAnalysis.js); `TRADE_EDGE=0.05` (managerAnalysis.js); `0.8/1.45/1.6×` (pickTrades.js); tier weights `0.5/0.3/0.2` (rosterAnalysis.js); peak windows QB 26–33 · RB 23–26 · WR 24–28 · TE 25–29 (peakWindows.js).
- **Every output block above is a real, pasted run** from 2026-07-05 (Node v22.22.2, offline, synthetic inputs into the repo's actual exported functions). Scripts live in `scripts/` beside this file; re-run them any time — 01, 03, 06, 07 self-verify (drift guard / MATCH / PASS markers).
- **When source constants change**, this file's quoted lines and numbers go stale: re-read the cited lines, re-run the scripts, update quotes and outputs. Script 01's drift guard will fail loudly if the RNG changes; the others exercise live exports and track code automatically, but their *expected* commentary may need edits.
- Line numbers cited are as of 2026-07-05 and will drift with edits — the quoted code text is the anchor, not the number.
- The examples depend on the resolver hook in `dynastyedge-diagnostics-and-tooling/scripts/` (reg.mjs + loader.mjs). If that skill moves, update the run commands in the script headers and above.
