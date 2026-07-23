# Dynasty Trajectory & Trade-Threshold Calibration Audit

**Date:** 2026-07-23 · **Branch:** `claude/dynasty-trajectory-calibration-3v66k9`
**Scope:** Validate whether the Dynasty Trajectory model (`utils/dynastyTrajectory.js`)
is *calibrated* — not just plausible — and whether the thresholds the Trade Analyzer
now leans on (post PR #14) are set at defensible values.
**Posture:** analysis-only. Nothing in `src/` or any threshold was changed. Every
proposed change is routed through change-control below as a **proposal**, applied only
on owner approval.

## TL;DR verdict table

| # | What was tested | Verdict |
|---|---|---|
| 1a | Age-curve prior blend distorting dense bins (PRIOR_WEIGHT=4) | **Mild mis-set** — young-QB ascent understated ~12pp; else fine |
| 1b | Prior stabilising thin bins only | **Calibrated** — prior touches tails only, never peak windows |
| 1c | Per-year clamps 0.55 / 1.18 binding on real players | **Calibrated** — floor never binds; ceil only guards small-sample jumps |
| 2 · team | Direction thresholds on real rosters (`getTrajectoryRead` −8% / `seriesDirection` ±5%) | **Mis-set** — "declining" is **unreachable**; "ascending" over-fires; flip-zone crowded |
| 2 · player | `seriesDirection` ±5% per player (my-side trajectory note) | **Calibrated** — clean 3-way split |
| 3 | Draft-grade nudge (avgDelta ≥ +2 / ≤ −2 over count ≥ 3) | **Gate fires, but ±2 is noise** at this sample size |
| BT | 41-day back-test of curve direction vs realized drift | **No short-horizon signal** (expected); multi-year **unfalsifiable** until ~2027 |

**Evidence rung:** this session had full network egress (Sleeper / FantasyCalc / values-history
all 200), so every number below is from the **real league** — live FantasyCalc pool (462
entries), the live 10 rosters, the real league-history draft chain (2023–2025), and the real
`values-history.json` feed (41 daily columns). That is rung-1 evidence for the cross-sectional
and short-horizon claims. Multi-*season* projection accuracy cannot be tested with 41 days of
history and is labelled unfalsifiable, not faked.

Pre-registration (hypotheses + named disconfirming outcomes, written before any compute) is at
`scratchpad/prereg-trajectory-calibration.md`; scripts at `scratchpad/item{1,2,2b,3}-*.mjs` and
`backtest.mjs`, all run against the repo's real exported functions via the diagnostics resolver hook.

---

## Item 1 — Market age curves

### Method
Rebuilt the exact pool `buildAgeCurves` consumes (numeric-`sleeperId` players with age+value),
then for every position×age bin compared the shipped `curves[pos][age]` against the **pure
kernel-weighted median with no prior**, recording kernel mass `wsum` and the prior's weight
share `4/(wsum+4)`. Clamp check: counted how many realistic `(pos, age∈22..31)` pairs hit
`[0.55ⁿ, 1.18ⁿ]` at n=1 and n=3. Output check: projected a synthetic 3000-value QB with the
shipped curve vs a no-prior curve.

Pool sizes: QB 64 · RB 111 · WR 157 · TE 65 aged+ranked players.

### 1a — Does the prior distort dense bins? **Mildly, at the age extremes only.**
Peak-window bins are essentially pure market (prior share 4–6%, distortion < 1.5%):

```
RB peak 23–26:  wsum 64–77   distort −0.2 … −1.3%
WR peak 24–28:  wsum 75–110  distort  0.0 … −0.8%
```

The disconfirming condition (a bin with `wsum ≥ 12` shifted > 10% by the prior) **did trigger,
but only at 6 bins, all at the edges** of the age range:

```
QB 21  wsum 12.6  +21.4%     RB 32  wsum 17.0  −13.7%
QB 22  wsum 19.2  +15.7%     WR 34  wsum 13.1  −14.6%
QB 23  wsum 26.1  +13.5%     TE 32  wsum 14.6  −10.8%
```

One mechanism explains all six: `PRIOR_WEIGHT=4` still carries **≥ 20% weight until wsum ≈ 16**,
and the prior *most disagrees with the market exactly at the extremes* — it thinks young players
should be higher (pre-peak ramp) and old players lower (survivorship-corrected decline). So it
pulls the young-QB curve **up** and the old-RB/WR/TE curves **down**.

The old-end pull is **defensible** (the surviving 34-yo WRs are elite outliers; median-of-survivors
overstates a typical 34-yo, so pulling it toward the shape prior is a *feature*). The young-QB
pull is the one worth flagging. Output impact, a 3000-value QB projected +3 seasons:

```
age  shipped(+3)  no-prior(+3)   shipped 3yr%   no-prior 3yr%
 21     3285          3649           +9.5%          +21.6%   ← non-monotonic: 3002→2947→3285
 22     4199          4649          +40.0%          +55.0%
 23     4300          4649          +43.3%          +55.0%
 24     4012          4210          +33.7%          +40.3%
 25     3187          3204           +6.2%           +6.8%   ← prior share negligible, converges
```

The prior **understates a young QB's 3-year ascent by ~12 percentage points** and creates a
**non-monotonic blip at age 21** (dips at +1 before recovering). In Superflex, young QBs are the
crown-jewel asset class, so this is the most consequential spot for the distortion. It changes
*magnitude*, not the direction label (a 22-yo QB reads "ascending" either way).

**Verdict: mostly calibrated; one mild, defensible-either-way mis-set** at the young-QB end.
I can measure the sensitivity but cannot certify a "correct" `PRIOR_WEIGHT` without multi-year
data — the no-prior curve is not ground truth, just the unregularised alternative.

### 1b — Prior stabilising thin bins? **Yes — calibrated.**
**Zero** prior-dominated bins (`wsum < 4`) fall inside any peak window. Peak windows are
data-dense (wsum 25–110); the prior only carries the majority weight at ages 35+ (and QB/TE 21),
exactly where it is designed to. The pool is thick enough for the method.

### 1c — Clamps binding on real players? **No — calibrated.**
```
n=1:  3/40 pairs clamp — all CEILING (QB24 1.279, QB28 1.356, TE25 1.188), zero floor
n=3:  0/40 pairs clamp
RB 27→28 / 28→29 (the case flagged in pre-reg): raw ratio 0.99 — well inside
```
The floor (0.55) **never** binds on realistic players. The ceiling (1.18) binds only where the
small-sample QB/TE curve has an implausible one-year jump (the age-28→29 QB curve leaps +36% off
64 players) — i.e. the clamp is **doing its job**, suppressing small-sample lumpiness, not
flattening real market decline. Well-set.

---

## Item 2 — Direction thresholds

### Method
Assembled all 10 real rosters exactly as `useLeague` does (players joined to FantasyCalc/DB,
picks via `resolvePickOwnership` priced with `findExactSlotValue`), ran the real
`buildRosterTrajectory` + `getTrajectoryRead` + `seriesDirection`. Split team totals into
player-only vs pick contribution to find the mechanism.

**First finding — two different definitions of "direction" for the same concept:**

| Function | Rule | Drives |
|---|---|---|
| `getTrajectoryRead` | ascending = `peakIdx≥2 OR endPct>+5%`; declining = `peakIdx==0 AND endPct<−8%` | **Team-facing:** Partner Finder cards, Analyzer Layer 3 (`opponentTrajectoryRead`), Edge closing-window item |
| `seriesDirection` | ±5% net over horizon | **Player-facing:** Trajectory rows, `analyzeTrade` my-side note (`ascendingGiven`/`decliningGotten`), By-Position rows |

CLAUDE.md and this task describe the direction cut as "**±5%**", but the team-level buy/sell logic
actually keys on `getTrajectoryRead`'s **−8% / peakIdx** gates. That doc/code divergence is itself
a finding.

### Team-level (the real consumer, `getTrajectoryRead`) — **mis-set**
```
roster   now      +3yr    3yr%    getTrajectoryRead   seriesDirection(±5%)
   8     77084    75601   −1.9%   stable              stable
   5     70517    70173   −0.5%   stable              stable
   4     53845    54171   +0.6%   ascending           stable
   3     87010    87931   +1.1%   ascending           stable
  10     60767    62743   +3.3%   ascending           stable
   7     60348    62514   +3.6%   ascending           stable
   9     76070    79051   +3.9%   ascending           stable
   1    113455   118513   +4.5%   ascending           stable
   6     82632    90700   +9.8%   ascending           ascending
   2     84860    93500  +10.2%   ascending           ascending
——————————————————————————————————————————————————————————————————————
getTrajectoryRead:  8 ascending · 2 stable · 0 DECLINING
seriesDirection:    2 ascending · 8 stable · 0 declining
```

Three problems, **one mechanism**:

1. **"Declining" is unreachable.** Every team's real 3-yr change lands in **[−1.9%, +10.2%]**.
   Nothing reaches the −8% (`getTrajectoryRead`) or even −5% (`seriesDirection`) gate, so the
   entire *"declining opponent → they'll sell win-now talent → buy window"* logic in Trade Partner
   Finder, Analyzer Layer 3, and The Edge **never fires on this league**.
2. **"Ascending" over-fires.** 8/10 read ascending — but **6 of those 8 have < +5% growth** and
   qualify only through the loose `peakIdx≥2` clause (their peak year is +2/+3 because picks mature
   upward). Nearly any roster with monotonically-rising totals is labelled "building."
3. **Flip-zone crowded.** 4/10 teams sit within ±3pp of the ±5% cut (rosters 10, 7, 9, 1 at
   +3.3…+4.5%) — labels there flip with normal FantasyCalc jitter.

**The mechanism (covers all three):** a team total is a sum of ~26 players + picks. Aging
decliners and pre-peak risers largely **cancel at the roster level**, compressing 3-yr change into
a narrow band, and pick maturation adds a **uniform positive nudge** on top. Confirmed by the
player-only split — even ignoring picks, **0/10 teams decline > 5%** (worst −3.9%); picks then push
the borderline teams positive:

```
roster  players 3yr%   +picks → total 3yr%
   8       −3.9%              −1.9%
  10       −0.4%              +3.3%   (picks flip the sign)
```

Absolute thresholds of ±5% / −8% were set as if team totals swing widely; they don't.

### Player-level (`seriesDirection` ±5%) — **calibrated**
Across 257 aged+ranked rostered players: **77 ascending · 106 stable · 74 declining** (41% stable
— a clean 3-way split, well short of the >70%-stable disconfirming bar). By position it is
sensible: QB mostly ascending, RB/TE mixed, WR almost never ascending (its market curve is nearly
flat 21–31, so age alone rarely moves a WR > 5% in 3 years — a real, defensible property). The
±5% cut is **fine where it is applied per player** — which is what the Analyzer's my-side
trajectory note actually uses.

**Verdict: player-level ±5% calibrated; team-level direction thresholds mis-set** (declining
unreachable, ascending over-triggered, boundary unstable).

---

## Item 3 — Draft-grade nudge

### Method
The league-history chain has exactly **two gradable rookie drafts** — 2024 and 2025, both
4-round (2023 is a 28-round startup, excluded by `STARTUP_ROUNDS`; 2026 not yet drafted).
Replicated `buildDraftRecords` grading (`delta = pick_no − valueRank-by-today's-value within
class`) on the real picks, then **split each owner's record by draft year** to test whether ±2
measures persistent skill or single-season variance.

### 3a — Does the `count ≥ 3` gate fire? **Yes — it is live, not dead code.**
80 graded picks total; **9/10 owners clear the gate** (the 10th traded most rookie picks away, 1
graded pick). My own owner: 7 picks. But the ±2 band classifies only **2/10** owners as
strong/weak — the other 7 gate-passers land in the neutral (−2, +2) band, so the nudge rarely
shows at all.

### 3b — Is ±2 meaningful at this N? **No — it is noise-dominated.**
Per-owner `avgDelta` **flips sign between 2024 and 2025 for 6 of 9 owners**; only 3/9 are stable
(same sign, within 2) — far below the ≥7 that would argue for a persistent signal:

```
owner                2024        2025        stable?
462425264408752128   −4.4 (5)    +3.7 (3)    FLIP  (Δ 8.1)
981376018160177152   +5.0 (3)    −1.8 (6)    FLIP
985778048240852992   +0.8 (6)    −2.3 (3)    FLIP
986315464764620800    0.0 (5)    −2.8 (5)    FLIP
984934444081434624   −3.6 (5)    +0.7 (6)    FLIP
986873604987994112   −1.0 (4)    +3.7 (3)    FLIP
*ME* 965787707299430400  +3.3 (4)   +4.7 (3)   same
986480505954672640   +1.3 (3)    +0.7 (3)    same
981412612976025600   −3.2 (4)    −1.6 (7)    same
```

**Mechanism:** with ~7 picks over two classes, `avgDelta` is an average of a handful of integer
deltas that each range roughly ±(class size ~35). One hit or bust swings `avgDelta` by 1–1.5 whole
spots, so its standard error is on the order of ±2–3 at N≈7 — **the ±2 threshold sits inside the
noise band**, and the year-split confirms it empirically (sign is ~uncorrelated year to year).
This one story explains everything: why only 2/10 get labelled, why the labels are unstable, and
why the graded deltas swing so wildly (they are also computed at *today's* prices — the 2025 class
is 1 year into rookie-fever repricing, adding more noise).

### 3c — What do *I* actually see?
My nudge is **STRONG(+)** — *"6 of 7 rookie picks hit and you beat your slot by 3.9 spots on
average — draft capital projects above market in your hands."* Factually my two drafts *were* good:

```
2024 1.07 #7   +5  HIT  Brock Bowers (7497)
2024 2.05 #15  +9  HIT  Bo Nix (4685)
2024 2.10 #20 −10       Xavier Legette (485)
2024 4.03 #33  +9  HIT  Troy Franklin (1030)
2025 1.04 #4   −5  HIT  TreVeyon Henderson (3823)
2025 2.04 #14 +11  HIT  Jaxson Dart (5133)
2025 2.09 #19  +8  HIT  Luther Burden (3518)
```

But the label rests on ~7 hindsight-graded outcomes dominated by three hits (Bowers/Dart/Burden).
It cannot distinguish skill from a hot streak — and for 6 of my 9 opponents the same metric would
flip sign if you looked at a different single year. The `hit`-rate (6/7 worth >1000 today) is a
firmer factual statement than the `avgDelta` the nudge actually triggers on.

**Verdict: the gate fires, but ±2 over count≥3 is mis-set as a *skill* signal at this sample
size — it measures variance.**

---

## 41-day back-test (strongest test the data supports)

### Method
Built curves from today's pool; for every player tracked in `values-history.json` with a value at
both the first (2026-06-11) and last (2026-07-22) column and known age+position, compared the
model's **directional lean** (local age-curve slope sign at the player's age) against **realized
drift** sign, both with a ±3% deadband. 397 paired players.

```
realized dir:  up 160 · flat 96 · down 141        (offseason drift skews UP)
model    dir:  up 95  · flat 249 · down 53        (aging is slow ⇒ mostly flat)

Test 1 — three-way agreement:   model 31.0%  vs best-constant "always up" 40.3%   (model loses)
Test 2 — sign test, movers only: 58/117 = 49.6%,  binomial p = 0.57               (coin flip)
Test 3 — by position (movers):   QB 47% · RB 51% · WR 38% · TE 57%                (all noise)

context: median |model lean| 2.1% (below deadband) · median realized |move| 8.6%
```

**Result: no detectable short-horizon signal.** The age-curve lean predicts 41-day direction at
**49.6% (p=0.57)** — indistinguishable from a coin flip — and loses the three-way test to a naive
"always up." **Mechanism:** 41 days ≈ 0.1 of one projection year; a player barely ages, so the
model's lean (median 2.1%) is dwarfed by news/rookie-repricing that drives realized moves (median
8.6%), and the realized distribution even drifts *up* (offseason hype) — exactly the regime the age
model cannot see.

**Interpretation — read this carefully.** This is **necessary-not-sufficient** and does **not
falsify** the multi-year model: aging genuinely does not move six-week prices, so a null result
here is *expected*, not disqualifying for a multi-*season* claim. What it *does* establish:

1. The app has **zero empirical confirmation** that the curves predict realized movement on any
   horizon we can currently measure. The only positive evidence is cross-sectional (Item 1: the
   curves match the market's *current* age structure).
2. Per the campaign's Gate 2, the correct response to "agreement ≤ null" is **do NOT retune curves
   against this window** (that is fitting 41 days of offseason noise) — ship honesty copy and start
   archiving snapshots for a real test later.
3. **Multi-season accuracy remains unfalsifiable** until permanent snapshots accumulate: the first
   1-year test lands ~mid-2027, the first full 3-year horizon test ~2029.

---

## Recommendations (proposals — route through `dynastyedge-change-control`, not applied)

Ranked by impact / confidence. None applied; each needs owner approval and a same-commit CLAUDE.md
update because all four constants are documented behaviour.

### P1 — Team-level direction thresholds (highest impact) · Item 2
The −8% "declining" gate is below the entire realized 3-yr range, so the buy-window logic never
fires; the ascending `peakIdx≥2` clause over-fires. **Two candidate directions, owner to choose:**
- **(a) League-relative** — label a team declining/ascending by where its 3-yr change ranks *within
  the league* (e.g. bottom third = "selling vets"), instead of absolute ±5% / −8%. Robust to the
  aggregation compression; always produces a spread. *Preferred — it is self-calibrating, matching
  the "never hardcode" ethos.*
- **(b) Recalibrate the absolute gates** to the observed distribution (e.g. declining < −2%,
  ascending > +6%, drop the `peakIdx≥2` escape). Simpler, but re-freezes constants that will drift.
- Either way, **reconcile the two definitions** (`getTrajectoryRead` −8%/peakIdx vs `seriesDirection`
  ±5%) so one concept has one threshold, and fix the CLAUDE.md "±5%" description to match code.
- *Evidence:* range [−1.9%, +10.2%], 0/10 declining, 6/8 "ascending" via peakIdx only, 4/10 in flip-zone.

### P2 — Draft-grade nudge · Item 3
±2 over count≥3 measures variance, not skill, at N≈7. **Options (owner to choose):**
- Trigger on the **hit-rate** (e.g. ≥ 70% of ≥ 5 picks are hits) rather than `avgDelta` — hits are
  a far more stable statement than the noisy slot-delta average.
- And/or raise the gate to `count ≥ 8` **and** widen to `avgDelta ≥ ±3` — though this league won't
  reach a genuinely skill-distinguishing N for years, so this only reduces false positives.
- **Soften the copy** so it never asserts drafting "skill" from a hot streak (e.g. "your recent
  rookie picks have hit — you may value this capital above market", framed as a tendency not a verdict).
- *Evidence:* 6/9 owners' `avgDelta` flips sign 2024↔2025; only 2/10 ever labelled.

### P3 — Young-QB prior weight (low priority, cannot certify) · Item 1
`PRIOR_WEIGHT=4` understates young-QB 3-yr ascent ~12pp and creates an age-21 non-monotonicity.
A sensitivity worth *exploring* (lower `PRIOR_WEIGHT`, or weight the prior by inverse kernel
density so it fades faster where data exists) — but **do not apply blind**: the no-prior curve is
not ground truth, and the same prior correctly fixes old-age survivorship. Hold until multi-year
data can adjudicate. *Evidence:* young-QB +40% vs +55% at age 22; distortion −11…−15% at old RB/WR/TE.

### P4 — Honesty copy (safest, do first) · campaign Phase 4 item 1
Zero model-risk, pure UI copy: the Trajectory "How this works" panel should state plainly that the
model has **no validated short-horizon signal** and that multi-year accuracy is **unverified until
snapshots accumulate (~2027)**. This follows the measurement and corrects any overclaim without
touching a single threshold. It is the highest-confidence recommendation here.

### P0 — Start the snapshot archive (enabler for everything future)
Nothing above can become a *real* multi-year calibration until permanent value snapshots exist
(`values-history.json` is a 90-day rolling window that prunes the past). Recommend archiving dated
snapshots to a permanent location (campaign Phase 2) so the first true projection back-test is
possible in 2027 rather than never.

---

## What remains unfalsifiable (stated honestly)
- **Multi-season projection accuracy** — the model's actual claim. 41 days of rolling history
  cannot test a 3-year projection. First testable ~2027 (1-yr) / ~2029 (3-yr), and only if P0 ships.
- **Whether the young-QB prior weight is "right"** — measurable sensitivity, no ground truth today.
- **Trade-verdict / draft-grade hindsight correctness** — graded at today's prices, inherently
  circular until a trade-time value archive (Feature 11 / `trade-values.json`) accumulates entries.

## Reproduce
```
# resolver hook + frozen real data in scratchpad/data/
node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scratchpad/item1-curves.mjs
node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scratchpad/item2-directions.mjs
node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scratchpad/item2b-mechanism.mjs
node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scratchpad/item3-draftgrade.mjs
node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scratchpad/backtest.mjs
```
