# The my-side read: why every trade was graded "for them" and none "for me"

**Date:** 2026-09-07 · **Branch:** `claude/trade-analyzer-depth-chart-rhuuco`
**Question (owner):** *"All trades are talked about in the context of my trade
partner, but not me. It makes me feel as if the engine is working against me.
The trades all say 'strong for them' or 'fair for them', but what about strong
for me? No trades show strong for me."*

**Answer:** The observation was exactly right, and it had two separate causes —
one a missing feature, one a real property of the suggestion engine that the
app had no way to tell him about.

1. **Layer 4 graded the partner and nothing graded me.** `buildPartnerFit`
   produced an appeal band, a summary sentence, a reasons list and a
   starting-lineup delta for the other manager. My side had no equivalent
   object; its facts were scattered across chips, and `myStartersDelta` — the
   exact mirror of the number the partner was credited with — **was printed
   only when it was bad enough to downgrade a verdict.** The engine mentioned
   my lineup only as bad news.
2. **"Strong for me" is genuinely unreachable on the Targets board**, because
   the packages that board suggests are priced 6–11% in the partner's favour.
   That is a property of `suggestFairPackage`, not of the grader — and it is
   information the owner should have, not an artifact to tune away. §4.

A third, smaller asymmetry sat next to them: the panel drew a **full positional
depth chart** for every player leaving (`giveContext`) and a **one-line landing
spot** for every player arriving.

Everything below was measured against the **live league** (2026 regular season,
Sleeper + FantasyCalc, roster 6, the 20-target board from `getTopTradeTargets`)
by running the shipped functions under plain Node via the diagnostics resolver
hook. No fixtures.

---

## 1. What shipped

**One engine, two seats.** `buildPartnerFit`'s body became the seat-agnostic
`buildSideFit(incoming, outgoing, roster, allRosters, opts)`; `buildPartnerFit`
is now a thin wrapper that passes `seat: 'them'`, so the partner read is
unchanged **by construction** rather than by inspection.
`analyzeTrade` calls the same function a second time from my seat →
`analysis.myFit`, with the same `appeal` / `summary` / `reasons` / `concerns` /
`startersDelta`, plus a new `lineupNote` (the lineup sentence as its own field,
since it is the one measure the verdict gate quotes).

Copy is spelled out per seat in `SEAT_VOICE` rather than stitched from pronoun
fragments — the partner's sentences must stay byte-identical (the verdict gate
quotes them and `buildTradePitch` is built from them), and shared templates are
how a sentence ends up grammatical on one side and not the other.

**Stance, not tier, on my seat.** Layer 3 moved to live playoff odds on
2026-09-07; the fit engine's pick lean reads a win-window tier. My seat is
therefore passed `stance` explicitly — the same `buying`/`selling` Layer 3
scored on — so the two adjacent blocks cannot print different answers to one
question. The partner keeps the tier-derived lean, unchanged.

**The second depth chart.** `buildDepthContext` gained a `marker` (`out` | `in`)
and `analyzeTrade` calls it a second time for the arriving players, read off the
**post-trade** roster. Post-trade is load-bearing: trade a WR for a WR and a
pre-trade reading ranks the arrival behind a player who is no longer on the
team. Pinned by test.

**Surfaces:** THE CALL's `FOR YOU` row (now `"{appeal} for you — Fills WR ·
Weakens RB"`, mirroring `FOR THEM`, which was reworded from "{appeal} appeal");
an `IS IT GOOD FOR YOU?` block at the top of YOUR SIDE mirroring
`WOULD THEY WANT IT?`; a `COMING IN` chart above `GIVING UP`; and paired badges
on the Targets cards.

---

## 2. `myFit` is DISPLAY ONLY, and the gate proves it

My side is already scored by Layers 1–3 plus the `myStartersDelta` verdict gate.
A second my-side score would charge the ladder twice for facts it already
weighs, so `myFit` never enters `baseTradeVerdict` or either gate.

**Acceptance gate, pre-registered before the code was written: verdicts must be
byte-identical across the live 20-target board.** Result, comparing the shipped
board against `HEAD` on the same live data, same minute:

| field | differences across 20 targets |
|---|---|
| verdict | **0** |
| verdict reasoning (full string) | **0** |
| selected package (asset names) | **0** |
| partner appeal | **0** |
| give / get totals, value winner, value % | **0** |

Distribution unchanged either way: **16 Counter · 1 Decline · 3 Accept**;
partner appeal **16 Fair · 4 Strong**. `tests/tradeAnalysis.test.mjs` pins the
same contract synthetically across the whole ladder (swap `myFit` for its
opposite, or remove it — the verdict is `deepEqual`).

---

## 3. The distribution, and the thing it exposed

My-side appeal across the 20 suggested packages: **17 Weak · 3 Fair · 0 Strong.**

That is degenerate on its face, and the first read was that the partner's
appeal scale simply doesn't transfer to my seat. The score decomposition says
otherwise. Ja'Marr Chase, the sharpest case:

```
You'd be giving up 6% more value than you get back.      −1
Your best starting lineup gains 3,702 in value.          +1
It covers your WR deficit with a player who starts …      0   (suppressed: the
                                                               lineup delta
                                                               already scored it)
Making it drops you below league average at RB and QB.   −1
                                                        ────
                                                          −1  → Weak
```

Every branch is correct. The **−1 on value is present on all 20 suggestions**,
because `suggestFairPackage` searches `[0.9×, 1.15×]` of the target and
penalises undershoot 1.6×, so the package it proposes is reliably at or above
the target's price. The partner takes the matching **+1**. That 2-point swing,
on a scale where `Strong` is 2, is the whole story.

**So is `Strong for you` reachable at all?** Swept every 1- and 2-piece package
from my movable assets across 55–130% of each target's value, scored from my
seat. On the first 8 targets, **all 8** reach `Strong` — at **58–94%** of the
target's price:

| target | best my-side appeal | at % of target value |
|---|---|---|
| Malik Nabers | Strong | 78% |
| Justin Jefferson | Strong | 75% |
| Ja'Marr Chase | Strong | 80% |
| Drake London | Strong | 94% |
| Puka Nacua | Strong | 62% |
| Jaxon Smith-Njigba | Strong | 58% |
| Amon-Ra St. Brown | Strong | 68% |
| A.J. Brown | Strong | 61% |

The scale discriminates cleanly. It reads `Weak` on the board because **the
board's own offers overpay**, and it reads `Fair` or better the moment the offer
doesn't. Confirmed on a user-built trade: Jonathan Taylor → Malik Nabers (+8%
of value my way) renders **Fair for you** / **Weak for them**.

**Decision: ship the grade as measured, and make the Weak say why.** The Targets
card prints the sharpest my-side concern instead of a generic line — *"Weak for
you · you'd be giving up 7% more value than you get back"* — because that is a
counter the owner can make, and "little here for your roster" is not. Hiding the
Weak, or recalibrating the thresholds until the board looked friendlier, would
have been dressing an artifact as a finding.

---

## 4. Open item — the two "fair" windows disagree

`suggestFairPackage` builds inside `[0.9×, 1.15×]` of the target. `buildFairBand`
— THE definition of fair, shared with the Analyzer's verdict — is **±5%**. So
the search routinely proposes packages the Analyzer then scores as an overpay.
That is why 16 of 20 suggestions come back `Counter`, and it is now also why 17
of 20 read `Weak for you`.

This was **not** changed here. Narrowing the search band would move package
selection on every surface that consumes it and needs its own measurement
against the phase-2 sweep (`APPEAL_BONUS` was tuned at the current band). Filed
as the next question for this engine, not as a defect fixed in passing.

---

## 5. Honest limits

- **Measured at Week 1 of a 2026 season with the board all-WR** (my deepest
  deficit). The appeal distribution on a board spanning more positions is not
  established.
- **`myFit.appeal` is a display grade, not a back-tested predictor.** It is
  arithmetic over roster facts, like Layer 4 — it says what the trade does, not
  whether it works out. Per-manager behavioural modelling remains disconfirmed
  (`trade-structure-stability-2026-08.md`).
- **The `weakens` / lineup-delta overlap was noticed and deliberately left
  alone.** Suppressing `weakens` when the starting lineup still comes out ahead
  is arguable on the same grounds the `stacks` and `fills` suppressions already
  shipped on — but it is one engine, so it would move the partner's appeal too,
  and with it verdicts and package selection. That is a model change with its
  own measurement, not a display change.
- The one-word grade is deliberately **not** the only thing on screen: the block
  carries the full reasons list, because a `Weak` above a "+3,702 lineup gain"
  reads as a contradiction until you can see it is paying for a 6% overpay.

## Verification

- `npm run lint` clean · `npm test` **275/275** (from 269; 6 added) ·
  `npm run build` clean.
- Live-data board diff before/after: 0 differences on every pre-existing field
  (§2).
- Rendered at 390px in headless Chromium against live data, **dark and light**,
  on the owner's own screenshot case (Taylor ⇄ Nabers): the `IS IT GOOD FOR
  YOU?` block, the `COMING IN` chart with the arrival marked `IN`, the reworded
  `FOR YOU` / `FOR THEM` rows, and the paired Targets badges.
- `/design-review` on the diff: **PASS**, 0 primitive bypasses.
