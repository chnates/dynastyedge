---
name: dynastyedge-model-quality-campaign
description: >
  Executable, decision-gated campaign for DynastyEdge's hardest live problem:
  making the app's analytical models measurably calibrated and back-testable
  instead of plausible-looking. Load when asked to improve, validate,
  calibrate, backtest, audit, or tune the playoff odds (playoffOdds.js /
  simulatePlayoffs / buildScoringModel), the Dynasty Trajectory projections
  (dynastyTrajectory.js / age curves / projectPlayer), trade verdicts
  (tradeAnalysis.js / analyzeTrade / getTradeVerdict), or manager hindsight
  grading (managerAnalysis.js) — or for any "is this model right?", "are the
  odds accurate?", "can we trust the trajectory?", "Brier score",
  "reliability / calibration", "backtest", or "replay past seasons" question.
---

# DynastyEdge Model-Quality Campaign

**Mission:** turn three models that currently *look* right — playoff odds,
dynasty trajectory, trade verdicts — into models whose accuracy is a measured
number with an error bar. Success in this campaign is always a number
(Brier delta, reliability-gap delta, sign-agreement rate), never "looks
better".

Code facts below were verified against the repo on **2026-07-05**. Every
harness run quoted as *measured* was actually executed offline in the
authoring sandbox on **2026-07-06**; the command and output are shown.
Anything labeled *illustrative* was not measured — it exists to show you what
a result shape looks like. Anything labeled *expected range, verify on first
run* is a prediction you must confirm.

## When NOT to use this skill

- **UI/UX work on the odds/trajectory/trade pages** (layout, copy, colors) —
  that's ordinary feature work; see `dynastyedge-architecture-contract` and
  `/design-review`. This campaign is about the numbers underneath.
- **A bug** ("odds show NaN", "trajectory chart blank", "verdict never
  renders") — that's `dynastyedge-debugging-playbook`. Come back here only if
  the numbers render fine but might be *wrong*.
- **Explaining what the models do** to the owner — `dynasty-fantasy-reference`
  (domain terms) and the "How this works" panels already in the app.
- **Statistical derivations from first principles** — the theory lives in
  `dynastyedge-analysis-toolkit`; this skill states each obligation and
  cross-references, it does not re-derive.
- **Building a new model/feature** — this campaign measures and improves the
  three that exist. New models go through normal feature work + this skill's
  measurement discipline afterward.

## Ground rules (owner's laws — non-negotiable)

1. **Real-data verification.** A model change ships only with a measured
   improvement on real league data, via the Phase 1–3 artifacts.
2. **`main` auto-deploys** — every commit must leave the app shippable
   (`npm run build` green). Measurement scripts live in this skill's
   `scripts/` dir, never in `src/`.
3. **CLAUDE.md same-commit** for ANY behavior change (thresholds, blend
   weights, iteration counts). Where CLAUDE.md is silent about the behavior,
   the same commit ADDS the documentation.
4. **NO new npm dependencies.** All statistics (Brier, binomial CIs,
   reliability tables) are plain JS — already written in `scripts/`.
5. **Sandbox honesty.** Fantasy APIs are blocked in CCR sandboxes
   (proxy 403). Everything you RUN must be offline/synthetic; every
   network-dependent step below is explicitly labeled **RUNBOOK (network)**.
   Never claim you ran what you didn't.

## The models under test (verified 2026-07-05 — read each file fully anyway)

| File | Key functions | Verified constants/thresholds |
|---|---|---|
| `src/utils/playoffOdds.js` | `buildScoringModel`, `simulatePlayoffs`, `teamStartingStrength`, `buildStrengthPreview`, `getDeadlineVerdict` | `BASELINE_MEAN=115`, `BASELINE_STD=24`, `STRENGTH_SENSITIVITY=0.40`, `PRIOR_GAMES=4`, `ITERATIONS=10000`, default `seed=0x5eed` (mulberry32 + Box–Muller — determinism is load-bearing for UI stability); verdict: Buyer at `pct ≥ 0.70`, bubble at `≥ 0.35`, Seller below; mean floored at 40, std floored at 8; empirical std only enters at `g ≥ 3` |
| `src/utils/dynastyTrajectory.js` | `buildAgeCurves`, `projectPlayer`, `projectPlayerSeries`, `buildRosterTrajectory`, `getTrajectoryVerdict`, `getTrajectoryRead` | `KERNEL_BW=2.5`y Gaussian kernel over a **weighted median**, prior pseudo-count `PRIOR_WEIGHT=4` shaped by `peakWindows.js`; per-year ratio clamps `0.55–1.18`; picks hold value until draft year then age from `ROOKIE_ENTRY_AGE=22` on the generic curve; horizon 3 seasons; unranked/no-age assets hold flat |
| `src/utils/tradeAnalysis.js` | `analyzeTrade` (3 layers), `getTradeVerdict`, `getCounterSuggestion`, `suggestFairPackage` | "even" at `valuePct ≤ 5` (pct of the LARGER side, rounded); hard Decline when losing `> 15%`; Accept-despite-overpay allowed up to 15% when fit is positive; Counter when winning `> 5%` but window score negative; fair package band `FLOOR=0.9×`, `CAP=1.15×` target; counter-bridger seeks an asset worth `0.8–1.5×` the gap |
| `src/utils/managerAnalysis.js` | `buildManagerProfiles` trade ledger | win/loss when `|net| / max(gotValue, gaveValue) > TRADE_EDGE=0.05`, else even; everything graded at *today's* FantasyCalc prices (hindsight) |

Shrinkage arithmetic you will use repeatedly (inline math, not measured):
the prior's weight in the blended mean is `PRIOR_GAMES/(g+PRIOR_GAMES) = 4/(g+4)`
→ 100% at g=0, **50% at g=4, 25% at g=12, 23.5% at g=13** (a full 14-week
regular season never washes the prior below ~1/4 — a candidate finding for
Phase 4 item 3).

## The harness

`src/utils/*` are pure ESM with Vite-style extensionless imports; plain Node
needs the resolver hook. This skill ships a self-contained copy (identical to
`dynastyedge-diagnostics-and-tooling`'s):

```
cd /home/user/dynastyedge
node --import ./.claude/skills/dynastyedge-model-quality-campaign/scripts/reg.mjs <script.mjs>
```

(The `./` prefix is required — a bare relative path throws
`ERR_INVALID_MODULE_SPECIFIER`. Verified 2026-07-06.)

Scripts in `scripts/` (all repo-read-only):

- `loader.mjs` + `reg.mjs` — resolver hook (never import loader directly).
- `fixture.mjs` — deterministic synthetic 10-team league/season generator.
- `phase0-baseline.mjs` — Gate 0 checks. **Run offline; passing output below.**
- `phase1-replay.mjs` — walk-forward calibration replay. **Run offline in
  `--synthetic` mode; real mode consumes season files.**
- `fetch-season.mjs` — **RUNBOOK (network)**: downloads past seasons into
  season files. Syntax-checked only (`node --check` clean 2026-07-06);
  never executed in the sandbox.

---

## PHASE 0 — Baseline instrumentation (no model changes; fully offline)

Purpose: prove the measurement tooling itself before trusting any number it
produces, and pin the invariants a later change must not break.

```
cd /home/user/dynastyedge
node --import ./.claude/skills/dynastyedge-model-quality-campaign/scripts/reg.mjs \
     ./.claude/skills/dynastyedge-model-quality-campaign/scripts/phase0-baseline.mjs
```

**Measured output (executed 2026-07-06, exit 0):**

```
fixture strengths (optimal-lineup value, team 1→10):
  52232 47784 46342 43997 43686 39295 37324 33320 29545 27664
model means (team 1→10):
  128.9 123.8 122.1 119.4 119.1 114.1 111.8 107.2 102.9 100.7
PASS  A determinism (same seed ⇒ identical results)
PASS  B Σ playoffPct = playoffTeams — Σ = 6
PASS  B Σ topSeedPct = 1 — Σ = 1
PASS  B every seedDist sums to 1
PASS  C strongest team odds ≥ weakest team odds — team1 97.5% vs team10 11.4%
  playoffPct by team: 1:97.5% 2:90.8% 3:88.3% 4:82.1% 5:79.2% 6:59.4% 7:47.3% 8:30.0% 9:13.9% 10:11.4%
PASS  D g=0 ⇒ mean = priorMean
PASS  D g=4 ⇒ mean = midpoint(emp, prior) — mean 124.444 vs hand math 124.444
E noise floor: bubble team 7, mean 46.62%, empirical sd 0.60pp across 20 seeds, analytic SE sqrt(p(1-p)/10000) = 0.50pp
PASS  E empirical seed-to-seed sd within 2× analytic SE — 0.60pp vs bound 1.00pp
PASS  F 0.349 ⇒ Seller
PASS  F 0.35 ⇒ On the bubble
PASS  F 0.699 ⇒ On the bubble
PASS  F 0.70 ⇒ Buyer
PASS  F null ⇒ Wait
GATE 0: ALL CHECKS PASS
```

Monte Carlo noise floor (inline arithmetic): with `ITERATIONS=10000`, the
1σ standard error of a probability estimate is `sqrt(p(1-p)/10000)` —
**±0.50pp at p=0.5, ±0.30pp at p=0.9**. Consequence: any odds movement
smaller than ~1pp between two *differently seeded* runs is noise; between two
same-seed runs any difference at all is a bug (Check A).

### GATE 0 — must hold before anything else

| If you see | It means | Go |
|---|---|---|
| All PASS (as above) | Tooling trusted; invariants pinned | Phase 1 |
| A FAILS (two same-seed runs differ) | The fixed-seed determinism contract broke — something introduced `Math.random`, iteration-order nondeterminism, or async into the sim. This also breaks the UI's "never reshuffles" promise. **Stop the campaign.** | `dynastyedge-failure-archaeology`, then `dynastyedge-debugging-playbook`; fix before measuring anything |
| B FAILS (Σ playoffPct ≠ playoffTeams) | Seeding/accounting bug in the sim or in your fixture (odd team count, roster missing from `model`) | Fix harness first; if the sim itself is at fault, that's a shipped bug — file through change-control |
| E FAILS (seed-to-seed sd ≫ 1pp at 10k iterations) | RNG quality or a variance bug | Debug before Phase 1 — calibration numbers would be swamped |
| Import errors (`ERR_MODULE_NOT_FOUND`) | Resolver hook not loaded, or you forgot the `./` prefix | Re-read "The harness" above |

---

## PHASE 1 — Historical replay calibration (playoff odds)

**The question:** when the model said "70%", did teams in that bucket make
the playoffs ~70% of the time?

**Method (walk-forward, no peeking):** for each past season and each cutoff
week k = 0…W−1, feed **only weeks ≤ k** into `buildScoringModel` (standings +
completed scores rebuilt as-of week k) and simulate weeks k+1…W with
`simulatePlayoffs`. Record every team's predicted `playoffPct` against the
realized playoff field (top `playoff_teams` by wins-then-points-for over the
full season — the same tiebreaker the sim uses).

### Step 1 — RUNBOOK (network): fetch the corpus

From a machine with open egress (NOT a CCR sandbox — Sleeper is proxy-403
there):

```
node .claude/skills/dynastyedge-model-quality-campaign/scripts/fetch-season.mjs /tmp/seasons
```

Walks the `previous_league_id` chain (cap 8, same as `useLeagueHistory.js`),
writes one `season-<YYYY>.json` per past season:
`{ season, playoffTeams, rosterIds, weeks: [{ week, matchups, points }] }` —
completed weeks only, using the same every-team-scored completeness rule as
`usePlayoffOdds.js processWeeks()`. Read-only, ~17 calls/season, far under
Sleeper's 1,000/min. **If it prints "NONE": the league has no completed prior
season on this chain and Phase 1 is blocked until one exists — record that
honestly and proceed to Phase 2/3; do not substitute synthetic results for
real calibration.**

### Step 2 — replay (offline once files exist)

```
node --import ./.claude/skills/dynastyedge-model-quality-campaign/scripts/reg.mjs \
     ./.claude/skills/dynastyedge-model-quality-campaign/scripts/phase1-replay.mjs \
     /tmp/seasons/season-*.json
```

Artifact (`replay-results-<ts>.json`) format — **this is the canonical
calibration artifact; later phases and change-control diffs compare these**:

```json
{
  "generatedAt": "...", "seasons": ["2025"], "playoffTeams": 6,
  "note": "flat roster-strength prior ...",
  "samples": 140,
  "brierModelAll": 0.0,  "brierModelWeek2Plus": 0.0,  "brierClimatology": 0.0,
  "reliabilityWeek2Plus": [ { "bucket": "0–20%", "n": 0, "avgPred": 0, "hitRate": 0, "ci": 0 } ],
  "predictions": [ { "asOfWeek": 0, "rosterId": 1, "pred": 0.62, "made": 1, "season": "2025" } ]
}
```

**Known limitation you must state in every Phase 1 report:** historical
FantasyCalc rosters don't exist (`values-history.json` is a 90-day rolling
window), so the roster-strength **prior cannot be reconstructed** for past
seasons. The replay feeds flat strengths → `priorMean = BASELINE_MEAN` for
everyone → asOfWeek 0 is climatology *by construction*. The replay therefore
validates the empirical-score blending + simulation, not the preseason
prior. That's why the artifact reports `brierModelWeek2Plus` separately.
(Prior validation becomes possible prospectively: snapshot current-season
strengths now, score them at season's end.)

### Harness self-validation (measured, synthetic — executed 2026-07-06)

```
node --import ./.claude/skills/dynastyedge-model-quality-campaign/scripts/reg.mjs \
     ./.claude/skills/dynastyedge-model-quality-campaign/scripts/phase1-replay.mjs --synthetic
```

Output (deterministic — re-run 2026-07-06 reproduced it exactly):

```
season synthetic: 14 weeks, playoff field = [2, 1, 4, 7, 5, 3]
samples: 140 team-week predictions (120 at asOfWeek ≥ 2)
Brier (model, all weeks):      0.2099
Brier (model, asOfWeek ≥ 2):   0.1982
Brier (climatology p=0.6):   0.2400  [analytic: p(1-p) = 0.2400 when field is balanced]
reliability table (asOfWeek ≥ 2):
  bucket     n     avgPred   hitRate   ±95%CI
  0–20%     24       9.6%     25.0%   ±17.3pp
  20–40%    17      31.0%     58.8%   ±23.4pp
  40–60%    13      46.9%     46.2%   ±27.1pp
  60–80%    19      70.6%     42.1%   ±22.2pp
  80–100%   47      95.6%     89.4%   ±8.8pp
Brier by asOfWeek: w0:0.242 w1:0.318 w2:0.323 w3:0.273 w4:0.235 w5:0.277
  w6:0.196 w7:0.197 w8:0.220 w9:0.173 w10:0.186 w11:0.156 w12:0.072 w13:0.070
```

Read this correctly: it validates the **harness** (Brier beats climatology,
per-week Brier trends down, late weeks approach determinism), NOT the model's
real-world calibration — the "season" was generated from Normal draws, i.e.
the model's own assumption family. Note the CIs: **one season of a 10-team
league gives ±17–27pp buckets. A single season can NEVER certify
calibration.** Also note the real diagnostic it surfaced: w1–w2 Brier
(0.318/0.323) is *worse* than the w0 climatology floor (0.242) — with 1–2
games the empirical mean already carries 20–33% weight (`g/(g+4)`) while std
stays at BASELINE until g≥3, so early noisy scores over-steer the mean. This
is expected-range behavior to verify on real data, and it feeds Phase 4
items 2–3.

### GATE 1 — pass/fail criteria

- **Baseline to beat (inline arithmetic):** climatology — always predict
  `playoff_teams/10 = 0.6` — scores Brier `0.6×0.4 = 0.2400`. The model's
  pooled `brierModelWeek2Plus` on REAL seasons **must be < 0.24**. If it
  isn't, the model is worse than a constant and Phase 4 item 1 (report
  honestly) is the only permitted ship until fixed.
- **Sample floor:** report calibration buckets only when the pooled corpus
  has ≥ 30 predictions per bucket, and state that team-weeks within one
  team-season are correlated (one outcome serves ~14 predictions — the
  effective independent sample is closer to *team-seasons*, 10/season).
  With ≤ 2 past seasons, report Brier + the reliability table with CIs and
  the words "insufficient data to certify calibration"; never the word
  "calibrated".
- **What shapes mean** (ILLUSTRATIVE numbers, not measured):
  - *Well-calibrated:* every bucket's hitRate within its CI of avgPred, e.g.
    avgPred 9% → hitRate 12%, 70% → 67%, 94% → 91%.
  - *Overconfident (the common failure):* tail buckets regress toward the
    base rate, e.g. avgPred 6% → hitRate 18% and avgPred 95% → hitRate 80%.
    Fix direction: variance too small or shrinkage too weak → Phase 4
    items 2–3.
  - *Underconfident:* hitRates more extreme than predictions (0–20% bucket
    hits 2%, 80–100% hits 99%) → model wastes information; usually variance
    too large.

---

## PHASE 2 — Trajectory validation (honest scope)

**Data-limits statement (verified against the pipelines 2026-07-05 — repeat
it verbatim in any trajectory report):** `values-history.json` is a 90-day
ROLLING window (older columns pruned), so no data exists to test 1–3-year
projections today. Multi-year validation becomes possible only by archiving
snapshots from now on: the first 1-year test lands mid-2027, the first
full-horizon (3-year) test in 2029. `trade-values.json` is permanent but
only accumulates since ~mid-June 2026 and only for traded assets. Do not let
anyone claim the trajectory model is "validated" before those dates.

**What CAN be measured now — 90-day direction test:**

1. Take the oldest column of `values-history.json` (date T₀, up to 90 days
   ago) and the newest (T₁). **RUNBOOK (network):** fetch the branch file
   from `raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json`
   plus a current FantasyCalc pull for ages/positions; both are proxy-403 in
   sandboxes.
2. For every player with a value at both dates and age+position known:
   compute `projectPlayer(p, 1, curves)` with curves built from the T₀-dated
   pool (approximation: today's pool — note it), and record
   `sign(projected₁ − value₀)` vs `sign(value₀₊₉₀d − value₀)` with a ±3%
   dead-band on both (below 3% counts as "flat").
3. Score: sign-agreement rate vs the null. The correct null here is NOT 50%:
   "always predict the majority direction" (or "always flat") can beat 50%
   when the market drifts. Compute the best constant-prediction rate on the
   same sample and require the model to beat *that*.
4. Statistical bar: with n paired signs, a one-sided binomial test at
   α=0.05 (arithmetic: at n=200, beating a 50% null needs ≥ 112 agreements,
   i.e. 56%; recompute for the actual null and n — see
   `dynastyedge-analysis-toolkit` for the derivation pattern).

**Caveat to state:** a 90-day horizon tests ~0.25 of one projection year of a
3-year model, during one offseason regime (rookie-fever repricing). Passing
is *necessary, not sufficient*; failing hard is genuinely disqualifying.

**Measured mechanical probes (executed 2026-07-06, flat synthetic pool of
3000-value players at every age 21–36):**

```
flat-pool RB27 +1yr: 2949   WR24 +1yr: 2984   unranked: 0   noAge holds: 3000
RB33 +3yr: 2778  (clamp floor would be 499)
```

Confirms: dense empirical data flattens the prior (a flat market yields
near-flat projections — the model doesn't hallucinate decay the market
doesn't price, ratios 0.98–0.99); unranked contributes 0; no-age holds flat.
These are contract checks, not accuracy checks.

### GATE 2

- Direction test only counts with **n ≥ 150** paired observations and the
  constant-prediction null computed on the same sample.
- Pass: agreement beats the null with p < 0.05 → the age-curve machinery has
  short-horizon signal; proceed to Phase 4 item 4 refinements when justified.
- Fail: agreement ≤ null → do NOT retune curves against the same 90-day
  window (that's fitting noise); instead ship Phase 4 item 1 wording changes
  (label trajectory more strongly as a model) and start the snapshot archive
  for a real test later.
- Either way: **start archiving** — copy today's `values-history.json` to a
  dated file somewhere permanent (a `model-quality/` dir on the
  values-history branch is the natural home; route through change-control
  since it edits a workflow).

---

## PHASE 3 — Trade-verdict audit

**The question:** when `getTradeVerdict` says Accept/Decline, does the
accepting side actually win in hindsight?

**Corpus:** every completed league trade (all seasons, via the
`previous_league_id` chain — same fetch pattern as `useLeagueHistory.js`).
**RUNBOOK (network)** to fetch transactions + `trade-values.json` +
current FantasyCalc.

**Two-stage design — be honest about which stage you ran:**

- **Stage A (feasible now): value-layer audit.** For each trade, price both
  sides at trade time — from `trade-values.json` where an entry exists
  (trades since ~mid-June 2026), else at today's prices with the row marked
  `hindsightContaminated: true`. Compute Layer 1's call (`valuePct`,
  `valueWinner`, thresholds: even ≤5%, hard-decline >15%) per side. Grade
  each side's call against the hindsight result computed *exactly* as
  `managerAnalysis.js` does: win/loss when `|net|/max(got,gave) > 0.05` at
  today's prices, else even.
- **Stage B (stretch): full 3-layer verdict audit.** Layers 2–3 need each
  side's *roster at trade time* (`getPositionalDeltas`,
  `assignWinWindowTiers`). Rosters-as-of-date are not archived; they must be
  reconstructed by rewinding the transaction log from current rosters. Doable
  but fragile (waivers, drafts, drops). Only attempt after Stage A ships,
  and validate the rewind by checking a few reconstructed rosters against
  remembered reality with the owner.

**Artifact — confusion matrix framing** (counts, one row per side-of-trade):

```json
{ "generatedAt": "...", "stage": "A",
  "n": 0, "nTradeTimePriced": 0, "nHindsightContaminated": 0,
  "matrix": {
    "valueFavored":  { "win": 0, "even": 0, "loss": 0 },
    "even":          { "win": 0, "even": 0, "loss": 0 },
    "valueDisfavored":{ "win": 0, "even": 0, "loss": 0 } },
  "rows": [ { "txId": "...", "season": "...", "ownerId": "...",
              "valuePctAtTrade": 0, "callAtTrade": "favored",
              "netToday": 0, "resultToday": "win",
              "hindsightContaminated": false } ] }
```

### GATE 3

- **Precision claim to test:** sides the value layer favored by >5% at trade
  time should land "win" more often than "loss". Report the win:loss ratio in
  the `valueFavored` row with a binomial CI.
- **Sample honesty:** a young 10-team league may have only dozens of trades,
  and rows priced at today's values are circular (the grader and the
  predictor share the same prices — expect inflated agreement; that's why
  `nHindsightContaminated` is a first-class field). If
  `nTradeTimePriced < 20`, report directionally and wait — the
  trade-values archive grows with every trade.
- Fail (favored sides lose as often as they win on trade-time-priced rows,
  n ≥ 20): the ±5%/15% thresholds are candidates for Phase 4 item 5 — but
  first check whether losses concentrate in pick-heavy trades (pick pricing
  uses round-medians — see `dynastyedge-failure-archaeology` before touching
  pick valuation).

---

## PHASE 4 — Solution menu (RANKED — do them in this order)

Every item: expected effect, theory obligation (derivations in
`dynastyedge-analysis-toolkit` — cross-ref, don't duplicate), effort, risk,
promotion path. **No item starts until the phase that measures it has run on
real data.**

1. **Report calibration without changing models** (always safe — do first).
   Surface the measured Brier/reliability in the "How this works" panels
   ("verified against N past seasons…") and correct any overclaiming copy.
   Effect: honesty, zero regression risk. Effort: S. Risk: none. Promotion:
   normal change-control; UI copy only.
2. **Variance-model fixes.** Today `std` is `BASELINE_STD=24` until `g ≥ 3`,
   then a linear blend — but the *mean's* uncertainty isn't in the score
   variance at all. Theory obligation: a team's predictive variance should be
   score-variance + mean-uncertainty ≈ `σ² + σ²/(g+PRIOR_GAMES)`; derive
   properly in analysis-toolkit terms before coding. Expected effect:
   softens early-season tails → fixes the measured w1–w2 Brier bump pattern
   (0.318/0.323 vs 0.242 climatology in the synthetic run) if it reproduces
   on real data. Effort: S code, M validation (full Phase 1 re-run; Brier
   must drop). Risk: low — pure function, Gate 0 invariants must all re-pass.
3. **Shrinkage pseudo-count tuning** (`PRIOR_GAMES=4`) via replay
   grid-search over e.g. {2,3,4,6,8}. **Fence: never tune on the season you
   evaluate on** — leave-one-season-out only, which requires ≥ 2 real past
   seasons; with fewer, this item is BLOCKED (small-sample overfit is
   guaranteed, not merely possible). Expected effect: unknown until measured;
   also evaluates the "prior never falls below ~24% weight" question from
   the shrinkage arithmetic above. Effort: M. Risk: medium (silent behavior
   change across the app — odds feed Trade Analyzer, Partner Finder, The
   Edge). Promotion: change-control + CLAUDE.md same-commit (PRIOR_GAMES is
   documented behavior).
4. **Age-curve validation/refinement.** Only after Gate 2 produces a real
   direction-test number. Candidates: bandwidth (2.5y), prior pseudo-count
   (4), clamp bounds (0.55/1.18), the age-22 pick-maturation assumption.
   Theory obligation: any change must state what market behavior it encodes
   and be tested on the (growing) snapshot archive — not on the same 90-day
   window that motivated it. Effort: M–L. Risk: medium — trajectory feeds
   Partner Finder reads, Analyzer Layer 3, The Edge closing-window item.
5. **Verdict-threshold recalibration** (5%/15% bands, `TRADE_EDGE=0.05`,
   Buyer/Seller 0.70/0.35). Only after Gate 3's confusion matrix, and only
   with ≥ 20 trade-time-priced rows. Theory obligation: thresholds should
   fall out of the measured value-noise floor (what % gap is
   indistinguishable from pricing noise?), not taste. Effort: S code, L
   evidence. Risk: medium — verdict copy is user-facing advice; CLAUDE.md
   documents the bands (same-commit rule).

## FENCED WRONG PATHS — do not do these

- **Eyeball-tuning on one season** ("2025 says the model was low on team X,
  bump the prior"). One 10-team season = 10 correlated outcomes. You will
  fit noise with certainty. Grid-search only with leave-one-season-out
  (item 3's fence).
- **Changing `FANTASYCALC_PARAMS`** (`numQbs=2`, `ppr=0.5`, `numTeams=10`,
  `isDynasty=true`) to "get better values". They encode the league's actual
  format; CLAUDE.md marks them immutable. Changing them re-prices the entire
  app to a league that doesn't exist.
- **Breaking seed determinism** — adding `Math.random`, reseeding from
  `Date.now()`, or reordering RNG draws in `simulatePlayoffs`. The fixed
  draw order (week → matchup → A then B) is a documented bit-identical
  contract; the UI must never reshuffle. Any refactor must re-pass Gate 0
  Check A.
- **Adding stats libraries** (jstat, simple-statistics, scipy-alikes). No new
  npm deps — owner's law. Everything needed is ~20 lines of plain JS and
  already exists in this skill's scripts.
- **Claiming calibration from < 30 samples** — or from any count without
  noting team-week correlation. Wide-CI tables get published WITH their CIs
  and the words "insufficient data", or not at all.
- **Touching UI before measurement is done.** No odds-page redesigns, no new
  verdict copy, no "confidence badges" until Phases 1–3 have real-data
  artifacts. (Exception: Phase 4 item 1's honesty copy, which *follows* the
  measurement.)
- **Presenting synthetic-run numbers as model validation.** The synthetic
  season is drawn from the model's own assumption family; it can only
  validate the harness. This file's measured numbers are labeled that way —
  keep it so.

## PROMOTION PROTOCOL

Any change to `playoffOdds.js`, `dynastyTrajectory.js`, `tradeAnalysis.js`,
or `managerAnalysis.js` routes through **`dynastyedge-change-control`**:

1. **Before:** run Gate 0 (must pass bit-identical determinism) and capture
   the current Phase 1/2/3 artifact as the baseline.
2. **The change** ships with a re-run artifact and a stated **number**:
   "Brier (week≥2, pooled seasons) 0.21 → 0.18" or "reliability gap in the
   80–100% bucket 14pp → 5pp" — never "looks better", never a screenshot.
3. **Real-data verification** (owner's law): the artifact must come from real
   season files / real trade corpus, not synthetic.
4. **CLAUDE.md same-commit** for ANY constant/threshold/behavior change — if
   CLAUDE.md doesn't yet document the changed behavior, the same commit adds
   that documentation; `npm run build` green; `main` stays shippable.
5. Verify determinism survived: two same-seed `simulatePlayoffs` runs
   identical, and the UI odds page stable across re-renders (see
   `dynastyedge-validation-and-qa` for the evidence bar).

## Provenance and maintenance

- Authored 2026-07-06 against repo state of 2026-07-05 (branch `main`).
  Ground truth: full reads of `src/utils/playoffOdds.js`,
  `dynastyTrajectory.js`, `tradeAnalysis.js`, plus `managerAnalysis.js`
  (ledger/grading sections), `rosterAnalysis.js`, `lineupHistory.js`,
  `peakWindows.js`, `src/hooks/usePlayoffOdds.js`, `useLeagueHistory.js`.
- **Measured in-sandbox 2026-07-06:** `phase0-baseline.mjs` (all checks PASS,
  output quoted verbatim above), `phase1-replay.mjs --synthetic` (run twice,
  bit-identical output), and the Phase 2 flat-pool probes. `fetch-season.mjs`
  is `node --check`-clean but **never executed** (network blocked). No real
  league data has been fetched or scored by this campaign yet — Phases 1–3
  real-data runs are open work.
- **Update this file when:** any constant in the verified-thresholds table
  changes (same commit); a real-data Phase 1/2/3 artifact is produced for the
  first time (replace "open work" with the measured numbers + artifact path);
  the values-history pipeline starts keeping permanent snapshots (revisit the
  Phase 2 timeline); a Phase 4 item ships (record the before/after number
  here and in `dynastyedge-failure-archaeology` if anything was tried and
  reverted).
- Scripts are pinned to absolute `/home/user/dynastyedge` paths in imports;
  if the repo moves, fix the import paths in `scripts/*.mjs` first.
- Siblings: theory → `dynastyedge-analysis-toolkit`; gate/landing →
  `dynastyedge-change-control`; evidence bar → `dynastyedge-validation-and-qa`;
  API shapes → `dynastyedge-data-contracts`; loader origin →
  `dynastyedge-diagnostics-and-tooling`; settled dead ends →
  `dynastyedge-failure-archaeology`.
