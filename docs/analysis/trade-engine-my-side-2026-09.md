# Trade engine: is it weighted toward the partner and away from the owner?

**Date:** 2026-09-07 · **Branch:** `claude/trade-analysis-engine-review-icz0ha`
**Question (owner):** "Did we make it to where it cares too much about the other
team and not enough about me?"
**Answer:** Yes, in three specific places. All three are fixed. The largest one
is smaller in practice than the mechanism suggests, and this memo says by how
much.

Everything below was measured against the **live league** (2026 regular season,
Sleeper + FantasyCalc, roster 6, 20-target board from `getTopTradeTargets`) by
running the shipped functions under plain Node via the diagnostics resolver
hook. Fixtures were not used for any number quoted here.

---

## 1. Phase 2 of `suggestFairPackage` bought their appeal at any price

**Mechanism.** Phase 1 ranks packages by what they cost *me* (keep-pain). Phase 2
re-ranked them by partner appeal **lexicographically** — best appeal won
outright, my cost only broke ties. Inside the fair band, my side had no vote.

**A false start worth recording.** The first measurement compared each
suggestion against *the cheapest fair package overall* and reported "18 of 20
suggestions overpay, 11,293 excess value." **That framing was wrong.** The
cheapest package overall is almost always `Weak`, and choosing `Weak` is a
genuine failure the two-phase design exists to prevent (failure-archaeology
§4e-v). The correct baseline is the cheapest package *at an acceptable appeal
tier*. Against that baseline the old rule was overpaying on **2 of 20** targets,
not 18.

**The fix.** One scale: `netScore = APPEAL_BONUS[appeal] − keep-pain`, with
`APPEAL_BONUS = { Weak: −1, Fair: 0, Strong: +0.4 }`. Asymmetric on purpose — a
`Weak` package means the offer goes unanswered (a real failure, so a
near-prohibitive guard); `Strong` over `Fair` is negotiating comfort (a nudge,
bought only when nearly free).

**Sensitivity.** `Strong` weight swept over the live board — total keep-pain
across all 20 suggestions, and how many differ from the old rule:

| w | 0.00 | 0.10 | 0.20 | **0.30** | **0.40** | **0.50** | 0.70 | 1.00 |
|---|---|---|---|---|---|---|---|---|
| pain | 17.79 | 17.79 | 17.79 | 18.46 | **18.46** | 18.46 | 19.02 | 19.84 |
| changed | 5/20 | 5/20 | 5/20 | 2/20 | **2/20** | 2/20 | 1/20 | 0/20 |

Three flat plateaus; w = 1.00 reproduces the old rule exactly, which is the
sanity check that the sweep is wired correctly. **0.40 is the middle of the
selected plateau**, so a small mis-estimate in either direction changes nothing
— the same "not knife-edge" discipline `DEPTH_WEIGHT` was set under.

Cost of upgrading Fair → Strong on the six live targets where both tiers exist:
**−0.63, 0.08, 0.23, 0.28, 0.73, 0.85** keep-pain. w = 0.40 takes the first four
and refuses the last two.

**Measured effect.** 2 of 20 suggestions changed · total keep-pain 19.84 → 18.46
(**−1.38**) · raw value sent 112,013 → 112,000 (**−13**). Both changed targets
had been reaching for TreVeyon Henderson (keep 0.85, just under the 0.90 protect
line) when a Fair package at ~0.4 keep-pain existed.

**Why the fix is narrow: the fair band already bounded the damage.** The package
window is `[0.9×, 1.15×]` of the target, so the old rule could only ever overpay
by ~15%. That is also why a synthetic Fair-vs-Strong divergence fixture is
fragile to build (see `tests/tradeAnalysis.test.mjs`'s `divergentScenario`).

**Guardrails unchanged:** the fair band, `PROTECT_THRESHOLD`, and the untruncated
search (§4e-v) all still bind first. Phase 2 reorders; it never widens the pool.

---

## 2. My own starting lineup was never measured

Layer 4 computes the change in the partner's best startable lineup and the code
calls it *"the single honest measure of does this help them."* **The same number
was never computed for me** — though `beforeLineup` and `afterLineup` were both
already built in `analyzeTrade`, one subtraction away.

My side was graded instead by `fitScore`: a −1/0/+1 dial that **counts**
positions filled against positions hurt. Measured live, **`fitScore` was 0 on 18
of 20** suggested trades — giving a back and getting a receiver fills one and
hurts one whatever the sizes. Two Accepts sat on top of a starting lineup that
got worse, reasoning *"Value is roughly even and this fills your WR need"*
(Rome Odunze −146, Nico Collins −40).

**The fix.** `myStartersDelta` is computed and exposed, and **gates** the
verdict: a drop clearing `MY_LINEUP_MATERIAL_PCT` (1% of my current starting
lineup) downgrades a clean Accept to Counter.

- **Proportional, not absolute** — live lineups span 27,031–62,850, so a fixed
  threshold would be noise on one roster and a hair-trigger on another. On this
  roster (45,226) the two cases above are 0.3% and 0.1% — correctly *not*
  material, and the gate leaves them alone.
- **It gates; it does not feed `fitScore`.** `fitScore < 0` is a hard *Decline*
  branch, and a rebuild trade that ships a starter for youth and picks *should*
  lower today's lineup. Declining those would be a worse error than the one
  being fixed.

**Honest scope:** on the current board this changes no verdict — the drops that
exist are below the materiality floor, and the larger ones (Zay Flowers −542,
A.J. Brown −418) already read Counter for other reasons. Its value is that the
class of bug is now closed: a large lineup drop can no longer hide behind
balanced position counts.

---

## 3. Layer 4 counted one fact twice, in the partner's favour

A `fill` is defined as an arriving player who **starts** at a position they are
below average in — which is exactly what raises `startersDelta`. Both scored
`+1`, so a single event earned the 2 points that mean `Strong`. This is the
identical double-count that had already been found and removed on the *negative*
side (the `stacks` branch says so in as many words); the positive side was never
checked.

**The fix.** The point is awarded once, by the lineup delta; the fill adds its
own point only when the delta did not already score it. Both sentences still
render — naming *where* the hole is, is information the delta doesn't carry.

**Effect:** live appeal mix `Strong 7 → 5`. `Strong` now requires two
independent facts (they profit on value **and** their lineup improves), which is
the right bar for "a clear reason to say yes."

---

## Verification

- `npm run lint` clean · `npm test` **264/264** · `npm run build` clean.
- Six tests added to `tests/tradeAnalysis.test.mjs`. **All three fixes were
  reverted in place and the suite re-run to confirm the new tests fail against
  the old behaviour** (3 failures) and pass against the new — a test that passes
  either way pins nothing.
- Two pre-existing tests were updated, not deleted: they pinned the old
  lexicographic contract and the old `alternative` direction, both deliberately
  changed here.

## Supersession

The 2026-09-06 owner call **declining** an appeal-vs-cost trade-off is
superseded by the owner's explicit ask on 2026-09-07, after this review measured
what the lexicographic rule cost. The original objection — *knowing whether they
would accept is the information the search exists to produce* — is preserved in
CLAUDE.md and is the thing to answer if this is ever revisited. It is addressed
here rather than dismissed: the appeal read still appears on every card, and the
higher-appeal package the search passed over is now named explicitly.

## Not done

- `fitScore` remains a position **count**, so it still ties on most trades. The
  gate covers the dangerous case; making fit magnitude-aware end to end is a
  larger change and was not attempted.
- Layer 3 (win window) scores **0 for a Middle team on every trade**, which is
  this owner's tier — so the layer is currently inert for him. Untouched.
- The deficit test is pass/fail, so being 200 below average at a position pulls
  as hard as being 4,000 below. Untouched.

---

# 4. Layer 3: the win-window tier was measuring the wrong thing

**Date:** 2026-09-07 (same branch, owner-approved follow-up)
**Question (owner):** "Measure whether swapping in playoff odds holds up."
**Answer:** It holds up. Shipped, scoped to Layer 3's score only.

## The tier scores what you OWN; the odds score the team you FIELD

Measured across the live 10-team league (Spearman rank correlation):

| pairing | rho |
|---|---|
| playoff odds ↔ **starting lineup** value | **0.988** |
| win-window tier ↔ **total assets** (bench + picks) | **0.952** |
| win-window tier ↔ starting lineup value | 0.721 |
| win-window tier ↔ youth | 0.018 |

The tier is 50% total roster value / 30% pick capital / 20% youth, ranked, with
the top 3 Contending and bottom 3 Rebuilding. That is a measure of accumulated
assets. "Should I buy or sell **this season**" is a question about the lineup
that actually plays, and the odds answer it almost exactly.

Note the last row: the youth term is 20% of the formula and correlates **0.018**
with the resulting order. It is very nearly inert.

## Two teams the tier flatly mislabels

| team | starting lineup | pick capital | playoff odds | tier says |
|---|---|---|---|---|
| roster 5 | **2nd of 10** | **10th of 10** | **87.7%** | `Rebuilding` |
| Jake & Bake | 9th of 10 | 4th of 10 | **8.3%** | `Middle` |

Roster 5 is the most win-now team in the league — strong starters, thin depth,
picks already spent. The old read told the owner to expect them to ask for
picks. Jake & Bake are rebuilding and the tier would not say so, because
hoarding picks props up their score.

## The sharper bug: `Middle` is a dead branch AND a fixed-size bucket

`analyzeTrade`'s Layer 3 had cases for Contending and Rebuilding and **none for
Middle**. Top-3/bottom-3 means `Middle` always holds exactly four teams — 40% of
the league, every season, this owner included. So for four owners the layer was
permanently inert.

Live, on the owner's 20-target board: `windowScore` was **0 on 20 of 20** and
the panel printed "Neutral — fits your current win window" every single time.
On odds it reads **15 aligned / 5 conflicting**.

"On the bubble" is a *measured* state that can hold any number of teams,
including zero. `Middle` is a bucket of four by construction.

## What shipped

- Odds select the branch in season (`getDeadlineVerdict`'s stance); the tier
  selects it in the offseason. `windowBasis` (`'odds'`|`'tier'`) is exposed so
  the panel names what scored the layer.
- **The asset-type tests are untouched.** Only the selector moved.
- `getDeadlineVerdict` is called **once** and feeds both the score and the
  printed stance, so the badge cannot contradict the note.
- The panel swaps its tier badge for the playoff stance when odds drive it, and
  the odds line is reworded from a footnote to the stated basis, carrying the
  tier as parenthetical context.

## Honest limits

- **Verdicts did not change on the live board** (17 Counter · 1 Decline ·
  2 Accept, before and after). `windowScore` reaches the ladder only via the
  clean-Accept gate and the "winning value but off-window" Counter branch. The
  win here is a layer that says something true rather than a placeholder; it
  bites when odds fall and win-now buying becomes a mistake.
- **Measured at Week 1 with zero games played**, so today's odds are the
  roster-strength prior plus schedule, not observed performance. What is
  established is that the odds ask the *right question* — not that they are
  well-calibrated. That needs a season.
- **6 of 10 teams make these playoffs**, so 60% is baseline and the ≥70% Buyer
  threshold sits only modestly above it; five teams bunched 76–88% at Week 1.
  Recalibrating the thresholds relative to `playoff_teams / numTeams` is a live
  option, would ripple to three other surfaces, and was **not** measured here.
- **Scope held to Layer 3's score.** `assignWinWindowTiers` still backs eight
  other consumers; the tier itself was not touched.

## Verification

- `npm run lint` clean · `npm test` **269/269** · `npm run build` clean.
- Five tests added. The three that pin the new selection were confirmed to
  **fail** against a tier-only revert; the offseason-fallback test pins that the
  old behaviour is byte-for-byte intact.
- Rendered at 390px in headless Chromium against live data — the block reads:
  `WIN WINDOW [BUYER] · "Proven players fit your 78% playoff odds" · "Scored on
  live playoff odds: 78% · Buyer — … (roster tier: Middle)"`.
- Fixture note: the first Layer 3 fixture used six teams, where top-3/bottom-3
  leaves **no `Middle` bucket at all** and the case under test could not exist.
  Widened to eight.
