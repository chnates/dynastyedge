# The two "fair" windows: which one is allowed to answer which question

**Date:** 2026-09-21 · **Branch:** `claude/open10-fair-band-7rvx50` · **Closes:** OPEN-10
**Question:** `suggestFairPackage` assembles inside `[0.9×, 1.15×]` of the target;
`buildFairBand` — THE definition of fair, shared with the Analyzer's verdict —
is ±5%. So the app proposes an offer and then grades its own proposal an
overpay. Does the band move?

**Answer:** the *assembly* window does not move. What moves is which window is
allowed to pick the **suggestion**: it must now land inside `buildFairBand`,
and the wider window is demoted to feeding `alternative` — the pricier package
the partner would actually prefer. Measured live, that sends **4.6% less
value** and costs **6.5 less keep-pain** league-wide while bringing the board
into agreement with the Analyzer on **161 of 180** rows instead of 35.

It is a trade, not a free win, and §3 states the price in full: a fairly-priced
offer gives the other manager no edge on value, so `Weak for them` rises from
31 to 106 of 180. §4 is the argument for paying it, and §5 is what a future
session should re-open if it disagrees.

Everything below was measured against the **live league** (2026 regular season,
Week 2, Sleeper + FantasyCalc, one cached league state for the whole sweep) by
driving the **shipped** `suggestFairPackage` under plain Node via the
diagnostics resolver hook. No fixtures.

Re-runnable:

```
node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
  scripts/dev/trade-fair-band-sweep.mjs [--board | --seats | --rows]
```

---

## 1. Reproducing the board first

The owner's live 20-target board, unchanged code, before anything was touched.
The 2026-09-07 distributions reproduce **exactly** — 17 Weak / 3 Fair on my
seat, 16 Counter / 1 Decline / 3 Accept — on a different roster state two weeks
later, which is a stronger reproduction than the item asked for.

One number the original write-up did not have, and it is the sharpest one:

> **0 of 20 suggestions landed inside the fair band.** Mean give/target ratio
> **1.0965**; every single row sat **5.8%–13.2%** over. Across all ten seats,
> **35 of 180**.

Two corrections to OPEN-10's own text, both from reading the code rather than
the note:

- **The "undershoot penalised 1.6×" belongs to `pickTrades.js`**, not to
  `suggestFairPackage`. This search rejects an undershoot below `FLOOR`
  outright and penalises distance **symmetrically** at 0.3.
- **The floor never binds.** `[0.90, 1.15]` and `[0.95, 1.15]` produce
  byte-identical boards, as do `[0.90, 1.10]` and `[0.95, 1.10]`. Only the cap
  was ever doing anything.

### The mechanism is not the band — it is the price of an appeal step

`buildSideFit` scores raw value as ±1 and calls it *even* at ≤5%, which is
`FAIR_BAND_PCT` by construction. So crossing 1.05 hands the partner a **whole
appeal point**, and phase 2 prices an appeal step at **1.0 keep-pain** from
Weak to Fair. The distance penalty resisting it is `0.3 × 0.09 ≈ 0.027`.

**The overpay was ~37× cheaper than the thing it bought.** The window merely
permitted it; `APPEAL_BONUS` paid for it. That is why the `Strong`-weight sweep
is *flat* over the shipped band (w = 0.3 … 1.0 give identical boards): the
lever that was moving the board was never the one that had been tuned.

---

## 2. The joint sweep

Band × `APPEAL_BONUS.Strong`, both swept together because they were tuned
together (failure-archaeology §4e-vi) — 7 bands × 7 weights on the owner's
board, then the cap at 0.01 resolution. `keep` is the plain sum of
`assetKeepScore` (what it cost me); `obj` is the search's own objective, which
also carries a per-piece and a distance term and therefore **can rise while the
package sends less**.

| cap (floor 0.95) | keep | obj | value sent | ratio | in band | them S/F/W | you S/F/W | verdict A/C/D |
|---|---|---|---|---|---|---|---|---|
| 1.03 | 14.80 | 17.48 | 97,562 | 1.001 | 20/20 | 0/6/14 | 0/20/0 | 6/14/0 |
| **1.05** | **15.36** | **17.83** | **98,246** | **1.011** | **20/20** | **0/8/12** | **0/18/2** | **8/12/0** |
| 1.06 | 15.57 | 19.22 | 100,076 | 1.029 | 13/20 | 0/13/7 | 0/14/6 | 9/10/1 |
| 1.07 | 17.77 | 21.21 | 101,537 | 1.044 | 9/20 | 0/18/2 | 0/12/8 | 12/6/2 |
| 1.08 | 17.23 | 20.95 | 102,214 | 1.051 | 7/20 | 0/19/1 | 0/11/9 | 11/8/1 |
| 1.10 | 16.29 | 19.94 | 104,013 | 1.066 | 3/20 | 1/18/1 | 0/7/13 | 8/11/1 |
| 1.12 | 16.46 | 19.75 | 105,410 | 1.087 | 0/20 | 4/15/1 | 0/3/17 | 3/16/1 |
| **1.15 (shipped)** | **17.24** | **20.58** | **106,195** | **1.096** | **0/20** | **5/15/0** | **0/3/17** | **3/16/1** |

The `Strong` weight changes nothing anywhere at or below 1.05 (no `Strong`
package exists inside the fair band at all) and nothing at 1.15 above w = 0.3.
**`APPEAL_BONUS` is therefore untouched, and the sweep is the evidence for
leaving it alone rather than an assumption.** Its 0.40 mid-plateau setting
still holds on the shipped assembly window, which is where `alternative` is now
chosen.

**1.06–1.08 is a peak, not a plateau, and it is not on offer.** It buys partner
appeal back (them 0/18/2 at 1.07) by *paying more of my roster* — `keep` 17.77
against the shipped 17.24 and against 15.36 at 1.05 — because hitting a narrow
off-centre window with discrete assets needs more pieces. Picking a cap there
because one board likes it is exactly the step-edge fit §4e-vi warns against.

---

## 3. What ±5% actually costs, and why it is not a search failure

The headline objection to reconciling: `Weak for them` goes **31 → 106** of 180.
§4e-v's standing finding is that a `Weak` suggestion is a real failure — the
offer goes unanswered — and that is the whole reason phase 2 exists.

**It is a different `Weak`, and the difference is measurable.** §4e-v's Weak was
about **composition** (the cheapest asset by keep-score was a third quarterback,
and nobody in a Superflex league needs one). This one is about **price**. The
decisive test is whether a better package existed and the search missed it:

> For every one of the owner's 20 targets, the **best achievable** partner
> appeal across all 176–597 candidates inside ±5% is **exactly what phase 2
> chose**. It settled for less on **0 of 20**.

So at fair value, twelve of those twenty partners cannot be interested by
anything the owner can spare. That is not a search failure — it is the literal
statement CLAUDE.md already makes about a surviving Weak: *"nothing you can
spare interests them at this price."* Before this change the board could never
say it, because the overpay was always available to score the point instead.

For contrast, at `[0.95, 1.10]` the best achievable is 4 Strong / 15 Fair / 1
Weak and phase 2 settles for less on 3 — there the appeal is genuinely
purchasable, with value.

---

## 4. What shipped, and the before/after

**Not a narrower band. A split.**

- **`PACKAGE_BAND` is unchanged at `[0.90, 1.15]`** and still bounds the
  candidate pool, so the untruncated search (§4e-v) and its cost are untouched.
- **The suggestion must land inside `buildFairBand`** — asked of that function,
  never re-derived from a literal, because the Targets card hands its package
  straight to the Analyzer and is therefore exactly the kind of surface §4e-iv's
  standing ruling covers.
- **`alternative` is drawn from the whole assembly window** and now carries
  `premiumPct`. This is the field's main job: a fairly-priced offer gives the
  partner no edge on value, so the package they would say yes to is usually an
  overpay — and naming it keeps the information the two-phase search exists to
  produce without letting it silently pick the offer.
- **`ALTERNATIVE_MIN_SAVING` keeps its value but gains an OR.** It required the
  alternative to cost ≥0.25 more *keep-pain*, a test written when both packages
  were selectable. An upgrade that leaves the fair band for a few hundred points
  of value but barely touches keep-pain is now the most useful row on the card,
  and the pain test was hiding it. Verified across all ten seats: **not one
  alternative sends less value than the suggestion**, so "costs more" is
  unconditionally true. Effect: 85 → 88 of 180.
- **`inFairBand: false`** when no combination reaches the band — the board still
  answers, and the card says it is a near-miss rather than implying an agreement
  the Analyzer will not give.

### The owner's board, all four axes together

| | keep | obj | value sent | ratio | in band | them S/F/W | you S/F/W | verdict A/C/D | alt shown |
|---|---|---|---|---|---|---|---|---|---|
| **before** | 17.24 | 20.58 | 106,195 | 1.0965 | 0/20 | 5/15/0 | 0/3/17 | 3/16/1 | 0 |
| **after** | **15.19** | **17.68** | **98,444** | **1.0135** | **20/20** | 0/8/12 | **0/18/2** | **8/12/0** | **16** |

### All ten seats (180 target-package decisions)

| | keep | value sent | in band | Weak for them | Weak for me | Accepts | alt shown |
|---|---|---|---|---|---|---|---|
| **before** | 198.0 | 979,546 | 35/180 | 31 | 74 | 53 | 8 |
| **after** | **191.5** | **934,876** | **161/180** | 106 | **9** | 46 | **88** |

Of the 106 `Weak for them`, **75 carry an alternative** naming the premium that
would change it. The remaining 31 are the honest case: no package anywhere in
`[0.9×, 1.15×]` reads better to that partner.

The nine other seats are a genuine robustness check, not decoration — the
owner's roster turns out to be the *worst* served by the old window (0/20 in
band, 17/20 Weak for me, against a median seat's 4/20 and 7/20), so a fix
validated only on it would have been fitted to an outlier.

### The handoff, which is where §4e-iv says to look

Tapping Justin Jefferson on the live board, before → after:

| | before | after |
|---|---|---|
| sticky bar | `Give 7,436 ⇄ Get 6,918` | `Give 6,996 ⇄ Get 6,918 · ≈ even` |
| package total | `7,436 (+7%)` | `6,996 (+1%)` |
| THE CALL | *"You're overpaying 7% — adjust the terms to get closer to fair value."* | *"Value is roughly even and this fills your WR need. But there's little in it for them… Expect this one to go unanswered as offered."* |
| fair range | — | **"You're sending 6,996 — inside the fair window."** |
| `FOR YOU` | `Weak for you — Fills WR · Weakens RB` | **`Fair for you — Fills WR · Weakens RB`** |
| counter | *"Ask them to add Chris Brazzell (446)"* | — (nothing to close) |

The verdict is `Counter` both times, and that is the point rather than a
shortfall: it is now `Counter` for the **true** reason — the partner has no
reason to say yes — instead of for a manufactured overpay the app itself chose
to make. And the card that sent you there already names the fix:
**"TO GET A YES 2027 2nd + Jonathan Taylor (+7% over fair) — fair for them."**

---

## 5. Honest limits

- **Neither appeal grade is a validated predictor.** Partner appeal and `myFit`
  are both arithmetic over roster facts; per-manager acceptance modelling is
  disconfirmed (`trade-structure-stability-2026-08.md`). This change trades one
  unvalidated display grade against the other, and the tiebreak goes to
  `buildFairBand` because that one is a *documented contract* — the Analyzer's
  actual verdict tolerance — rather than a model output.
- **`Weak for them` now appears on 59% of rows** (106/180) against 17% before.
  It still discriminates (74 rows read Fair), but a future session that finds
  the marker too loud should re-open §3's decision, not re-open the band: the
  question is how the board *renders* an honest Weak, not whether it should
  price fairly.
- **League-wide Accepts fall 53 → 46** even though the owner's rise 3 → 8. That
  is the Layer 4 gate doing its job: a Weak partner appeal downgrades a clean
  Accept, and there are more of them now.
- **`APPEAL_BONUS` was re-swept and not moved.** If the assembly window is ever
  changed, it must be swept again with it — the two are one measurement.
- **Measured at Week 2 of 2026 with the owner's board all-WR** (the deepest
  deficit). Behaviour on a board spanning more positions is not established,
  though the nine other seats span four.
- **`requireFairBand` is a sweep hook, not a feature flag.** It exists so the
  before/after in this memo is one command. Nothing in `src/` passes it.

## Verification

- `npm run lint` clean · `npm test` **719/719** (from 714; 5 added) ·
  `npm run build` clean.
- **Three of the five new tests fail against the pre-change behaviour** (checked
  by flipping the default and re-running: 3 failures), and one of them is an
  executable statement of the bug itself, so the fixture cannot silently stop
  exercising OPEN-10.
- Live board before/after on all ten seats, four axes reported together (§4).
- Rendered at 390px in headless Chromium against live data, **dark and light**;
  `--overflow` reports **0 clipped elements** on `/trade/whats-fair`.
- The handoff into the Analyzer captured with `--click`, per §4e-iv's method
  note (a component screenshot would have shown a perfectly good card).
