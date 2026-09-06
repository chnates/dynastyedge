# Keep-score calibration — asset aging and pick realization

**Date:** 2026-09-06 · **Status:** measurement complete; pick tilt building, age tilt specced
**Re-run every number here:** `node scripts/dev/asset-aging-backtest.mjs`
(the script imports the shipped constants it grades — `PEAK_WINDOWS`, and
`PICK_ROUND_KEEP` once §3 lands — so the analysis and the app cannot drift)

Owner's question, from a live Trade › Targets board: *"the engine wants me to
give up Chase Brown for A.J. Brown — why him and not Jonathan Taylor?"*

**Answer in one line: `assetKeepScore` has no opinion about age or about which
pick is which, so it never had a way to prefer one over the other.**

Tracing it produced three findings, two of them measured here and one of them a
correction to a model the app already ships.

---

## 0. What the board was actually doing

Reproduced against the live league, 2026-09-06 (roster 6, Middle tier):

- Chase Brown and Jonathan Taylor **score identically at keep 0.85.**
  `assetKeepScore` gives every player inside `CORE_DEPTH` a flat 0.85, and
  `CORE_DEPTH.RB` is 3 — so RB1, RB2 and RB3 are equally expendable.
- Taylor was never a candidate at all: `suggestFairPackage`'s band is
  `[0.9×, 1.15×]` the target, and Taylor (5,705) against A.J. Brown (4,106) is a
  39% overpay. He is excluded before scoring, not protected by it.
- **`PROTECT_THRESHOLD = 0.9` protects almost nothing on a healthy roster.**
  Core starters land on exactly 0.85. Only a position in deficit (+0.22 → clamps
  to 1.0) or a cliff (0.95) ever crosses the line. Every WR on roster 6 is
  protected; no RB, TE or QB is.
- The card's `packageRationale` says *"protects your starters"* unconditionally
  whenever it drew from a surplus. Chase Brown is the **RB2 of that roster's own
  `buildValueLineup`** — he starts. The copy is false as written.
- Age is ignored entirely for this roster: the existing age rules in
  `assetKeepScore` sit inside the `Contending` and `Rebuilding` branches, and
  roster 6 is **Middle**.

None of that is a bug in the sense of a broken line. It is a scoring function
that was never given the two facts below.

---

## 1. The shipped trajectory model cannot be used for this (correction)

The obvious implementation was to tilt the keep score with
`dynastyTrajectory.js`, which already labels Taylor "declining". Run across the
whole roster it produces:

| player | age | 3-yr projection |
|---|---|---|
| Bo Nix | 26.5 | **+64%** |
| Juwan Johnson | 30.0 | +55% |
| Mark Andrews | 31.0 | **+47%** |
| Jonathan Taylor | 27.6 | −12% |

**A 31-year-old tight end is not a riser.** `buildAgeCurves` learns "what does
the market pay at each age" from **today's FantasyCalc pool**, which is a
cross-section: the only 33-year-old TE still carrying value is the one who
didn't decline, so the curve reads survivorship as aging. Measured curve values
confirm it — TE 31 = 641, TE 33 = 1,020; QB 25–26 = 790, QB 30–31 = 2,255. The
+64% figures are the projection clamping at `YEAR_RATIO_CEIL ** 3` (1.643).

**Standing ruling: `projectPlayer` / `buildAgeCurves` must not feed a score, a
ranking, or a recommendation.** They remain correct for what Feature 17 uses
them for — a descriptive shape, read for its direction, on a page that says in
its own "How this works" that it is a model and not a forecast.

The real fix is longitudinal curves off `values-archive.json` (the permanent
monthly archive exists for exactly this — see
`trajectory-calibration-2026-07.md`), which needs roughly another year of
accumulation. Until then, aging evidence comes from production, below.

---

## 2. Aging, measured longitudinally

**Frame:** n=762 player-seasons, 2020→2025, Sleeper season stats joined to the
player DB for position and birth date. A player must have scored **≥100 half-PPR
in year Y** to enter; his year Y+1 total is measured, and **a player who is out
of the league counts as 0** rather than leaving the sample. Following the same
player over time is what makes this immune to the survivorship problem in §1.

**Selection caveat:** requiring a real prior season means regression to the mean
drags every figure below 1.0. That bias is constant across age bands, so bands
are compared **to each other**, never to 1.0.

Median next-year points as a share of this-year:

| pos | 23 | 24 | 25 | 26 | 27 | 28 | 29 |
|---|---|---|---|---|---|---|---|
| RB | 0.92 | 0.87 | 0.85 | 0.79 | 0.74 | **0.40** | **0.25** |
| WR | 0.78 | 0.94 | 0.70 | 0.88 | 0.64 | 0.59 | 0.64 |
| QB | 0.79 | 0.83 | 0.79 | 1.00 | 0.85 | 0.53 | 0.72 |
| TE | 0.78 | 0.97 | 0.69 | 0.84 | 0.92 | 0.67 | — |

Past-peak penalty at the **shipped** `PEAK_WINDOWS` boundary, two-sided
permutation test (20,000 iterations, fixed seed):

| test | past peak | in/below | diff | p | verdict |
|---|---|---|---|---|---|
| RB > 26 | 0.66 (n=80) | 0.94 (n=133) | −0.28 | **0.0001** | significant |
| WR > 28 | 0.67 (n=66) | 0.84 (n=230) | −0.18 | **0.0016** | significant |
| QB > 33 | 0.67 (n=28) | 0.89 (n=138) | −0.22 | 0.0769 | not significant |
| TE > 29 | 0.76 (n=22) | 0.84 (n=65) | −0.08 | 0.3700 | not significant |

Spearman(age, retention): QB −0.234 · RB −0.266 · WR −0.267 · TE −0.109.

### 2a. `PEAK_WINDOWS` survives — do not re-tune it

RB ending at 26 and WR ending at 28 both test significant **at the boundary the
app already ships**. WR cuts marginally cleaner at 27 (−0.18, p=0.0001) but the
difference from 28 is inside the noise and is not worth churning a shipped
constant that three features read.

### 2b. The tilt must be per-position, and QB/TE must be small

Relative effect, RB = 1.00: **QB 0.78 · WR 0.64 · TE 0.29** — but QB and TE are
not significant. **Rule adopted: a significant position uses its measured
relative effect; a non-significant one is halved**, because an unproven effect
should be small, and "unproven" is not the same as "known to be small".

| position | shipped weight | derivation |
|---|---|---|
| RB | 1.00 | measured, p=0.0001 |
| WR | 0.65 | measured 0.64, p=0.0016 |
| QB | 0.40 | measured 0.78, halved (p=0.077) |
| TE | 0.15 | measured 0.29, halved (p=0.370) |

### 2c. The pre-peak bonus is DEAD

The proposal included protecting players *younger* than their window. Tested
separately:

| pos | pre-peak | in-window | diff | p |
|---|---|---|---|---|
| WR | 0.92 (n=93) | 0.80 (n=137) | +0.12 | 0.032 |
| TE | 0.94 (n=24) | 0.78 (n=41) | +0.17 | 0.063 |
| QB | 0.93 (n=74) | 0.84 (n=64) | +0.09 | 0.363 |
| RB | 0.92 (n=30) | 0.94 (n=103) | **−0.02** | 0.853 |

Four positions tested, one hit at p=0.032 — about what chance produces at that
family size — and **the effect is absent at RB, the position the whole tilt
exists for.** The tilt is decline-only: a player past his window gets easier to
trade, a player inside or below it is untouched. This also removes an artifact
seen in the prototype, where a 23-year-old Jaxson Dart became *protected* purely
for being young.

### 2d. `SPAN = 3` years, and the one knob no data sets

The RB fall runs 0.79 → 0.74 → 0.40 → 0.25 across the three years past 26, so a
tilt that saturates three years past the window matches the shape.

The **base magnitude** (±0.10 of keep score for a Middle team, ±0.04
Contending, ±0.16 Rebuilding) is **not** derived from anything here. It is a
preference weight — how much the owner leans toward youth when the market prices
two assets identically — and it is deliberately bounded so the tilt can only
break near-ties, never unlock a protected asset. **Honest objection on the
record:** FantasyCalc arguably prices age already, so tilting a keep score risks
double-counting it. The defense is that keep score is *reluctance*, not value:
given two assets the market prices the same, which do I want in three years.
That is a legitimate owner preference and it is stated as one.

---

## 3. Picks: firsts beat their price, fourths miss theirs

`assetKeepScore` gives **every pick 0.5**, adjusted only by win-window tier. A
2027 1st and a 2029 4th are equally spendable. Measured against all 120 rookie
picks this league has ever made (2024, 2025, 2026 — the 2023 startup excluded,
same >6-round rule `managerAnalysis.js` uses), valued at today's prices:

| round | 2024 | 2025 | 2026 | market (2027/28/29) | hits ≥1000 |
|---|---|---|---|---|---|
| 1 | **5,138** | **3,417** | **3,098** | 2,992 / 2,194 / 1,934 | **30/30** |
| 2 | 1,468 | 2,593 | 1,655 | 1,597 / 1,359 / 1,294 | 26/30 |
| 3 | 141 | 631 | 1,182 | 1,124 / 1,001 / 972 | 11/30 |
| 4 | 653 | 549 | 652 | 859 / 817 / 796 | 8/30 |

**Every class's round-1 median beats the dearest future 1st on the board (3/3).
No class's round-4 median reaches the cheapest future 4th (0/3).**

The strongest pattern is what **resolution** does. Reading the classes oldest to
newest, round 1 goes 3,098 → 3,417 → 5,138 while round 3 goes 1,182 → 631 →
141. Hype flattens the pick curve; reality steepens it. The market prices a 1st
at 3.5× a 4th; the most-resolved class delivered **8.0×**.

Adopted, replacing the flat 0.5:

| round | keep | why |
|---|---|---|
| 1st | **0.65** | beat the dearest future price in 3/3 classes; 30/30 hits |
| 2nd | **0.50** | tracks its price (2/3); unchanged from today |
| 3rd | **0.40** | 11/30 hits, and it degrades as the class resolves |
| 4th | **0.30** | missed the cheapest price in 3/3 classes; 8/30 hits |

Win-window tier adjustment (±0.3) still applies on top, unchanged, so a
rebuilder still hoards and a contender still cashes — they now do it with the
right relative preference between rounds.

**Caveats, stated rather than buried:** n=10 per round per class, one league,
three classes, and 2026 has not resolved. Three classes cannot distinguish *"the
market underprices firsts"* from *"this league drafts well"* — but every class
points the same direction, and a 30/30 versus 8/30 hit-rate spread is not
subtle. Re-run after the 2027 draft; if round 1 stops beating its price in a
resolved class, revisit these four numbers.

---

## 4. The null worth recording

**A single 30-day value-trend snapshot cannot calibrate anything.** Bucketing
the live FantasyCalc pool's `trend30Day` by age produced RB 26–28 at **+7.7%**
and RB 22–24 at **−2.0%**, QB 22–24 at **−12.1%** and QB 32–40 at **+7.2%** —
i.e. old backs rising and young quarterbacks falling. One 30-day window in early
September measures Week 1 news, not aging, and the cells hold 5–20 players.
`§1` of the script reproduces it so nobody spends another session on it.

---

## 5. Build order

1. **Pick tilt** (§3) — strongest evidence, smallest diff, no interaction.
2. **Age tilt** (§2) — per-position, decline-only, `SPAN = 3`.
3. **Cash-out board** — surface the trade §0 could not: my most expendable
   declining asset against younger targets inside its own price band. On
   2026-09-06 that is Taylor (27.6) against Malik Nabers (6,480, age 23.1) —
   a WR, this roster's deficit position, at a price Taylor can legally reach.
4. **Alternative-package line** — show the cheaper Fair package beside the
   chosen Strong one, including a pick-bridged version.

**Explicitly NOT adopted.** Making `suggestFairPackage`'s phase 2 trade partner
appeal off against my own cost was proposed and **rejected by the owner**:
knowing whether the other manager would accept is the information the package
search exists to produce, and a Fair package needing a pick to bridge it is a
different trade, not a cheaper one. Appeal stays lexicographically first; item 4
adds information beside it instead of reordering it.

Also not adopted: making `CORE_DEPTH` rank-sensitive so an RB1 outranks an RB3.
It would protect **Taylor** hardest, which is backwards for this roster's actual
question. The age tilt addresses the same ordering from the correct direction.
