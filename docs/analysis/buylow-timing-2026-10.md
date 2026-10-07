# Buy-low timing — do the app's dips bounce back? (2026-10)

**Open item:** `docs/open-items.md` §0 #7 · `dynastyedge-research-frontier` Item 4
**Script:** `scripts/dev/buylow-timing-backtest.mjs` (`--frozen` reproduces every number here — verified from the archive after #77)
**Data:** daily FantasyCalc values 2026-07-09 → 10-06 from the permanent archive (`values-consensus.json`, `fantasycalc` source; values-history.json sha256 at analysis time `e32a25535acd3baa…`) + the frozen player DB `docs/analysis/data/players-2026-10-07.json.gz`
**Status:** measured once, one 30-day window. **Re-run on or after 2026-11-06** (see §7).

---

## 1. In plain English

**The question.** The app flags a player as "falling" when his value has dropped
more than 50 points in 30 days, and it suggests buying such players (Buy-Low in
Market Movers and on Today) and selling your own risers (Sell-High). That only
makes sense if fallers tend to bounce back and risers tend to give some of it
back. If fallers keep falling, "buy low" means catching a falling knife.

**How it was tested.** For every player who crossed the line between 8 Aug and
6 Sep 2026, I compared his value 30 days later against players of the same
position and similar value who *didn't* move that day. A player is compared
with his own kind on the same day, so a market-wide shift (the rookie draft,
preseason news) cancels out.

**What we found — for the players the app actually shows you (worth 1,000+):**

- **Fallers did not keep falling.** Over the next 30 days they did about
  **2% better** than comparable players (+23 value points on average). That
  number is small and **not quite certain** — the plausible range runs from
  −0.1% to +4.9%. So: not a falling knife, but no reliable bounce either.
- **The clearest bounce is in the 1,000–3,000 range:** fallers there beat
  comparable players by about **4% (≈70 points)**, and this one is clear of
  zero. For players worth 3,000–6,000 there was no bounce (slightly negative,
  not certain). Stars worth 6,000+ almost never qualify, so we can't say.
- **Risers gave a little back:** about **2% worse** than comparable players
  (−61 points), again not quite certain (−4.8% to +0.3%).
- **Age made no difference.** The expectation was that young players' dips
  bounce back and older players' don't. Among 1,000+ players, young fallers did
  +1.6% and post-peak fallers +2.1% — no gap.

**Below 1,000 the picture is louder.** Cheap players' risers gave back a lot
(about −37% relative), much of it rookies whose August hype deflated. Cheap
fallers mostly kept sinking (the typical one did 13% worse), though a few
near-zero veterans rebounded so sharply in percentage terms that they distort
the averages (see §5).

**What it means for the advice.** "Buy low" is safe in the sense that matters
— it isn't systematically buying knives — but the evidence says it's a
fair-price move, not a bargain that reliably rebounds. The effect is a few
percent, smaller than the ±5% the Trade Analyzer already treats as "even".
**Nothing in the app should change on this evidence:** it is one month of data
from one stretch of the year, and the repo's rule is that a recommendation is
never re-ranked on one window. The November re-run doubles the sample and adds
regular-season weeks.

**One thing worth considering later (not now):** the line is a flat 50 points.
For a 9,000-point star that's half a percent — noise — while for an 800-point
player it's a 6% swing. A percentage line would treat both alike. That would be
a change to every arrow and list in the app, so it waits for more evidence.

---

## 2. Pre-registration (written before any forward return was computed)

Quoted as approved by the owner on 2026-10-07, with two disclosed corrections
made **before outcomes were looked at**:

> **HYPOTHESIS (H1):** players whose trailing-30-day value change crosses below
> −50 mean-revert: their +30-day forward return beats matched non-dippers.
> Competing (H2, "falling knife"): they keep underperforming. Same pair for
> the +50 side (sell-high: H1 = risers give back, H2 = momentum).
>
> **MECHANISM:** dynasty markets overreact to short-horizon news; the dip is
> noise around a stable valuation. The dynasty prior says this holds for
> pre-peak players and fails for post-peak ones.
>
> **EVENT:** trend(t) = v(t) − v(t−30) from the snapshots; the first day trend
> crosses below −50 (above +50), 30-day refractory per player. Threshold read
> from the shipped source. Eligible t: 2026-08-08 … 2026-09-06.
>
> **FORWARD WINDOWS:** +30 days (primary). +60 is impossible on this file
> (30 back + 60 forward > 89 available steps).
>
> **NULL / STATISTIC:** excess return e = r_i − mean r_j over controls j, where
> r = (v(t+30) − v(t)) / v(t) and controls are same position, same value tier
> at t, same date, |trend_j(t)| ≤ 50. Mean e with a 95% bootstrap CI over
> events (10,000 resamples, fixed seed). Secondary: absolute points; median.
> Tiers: <1000 · 1000–2999 · 3000–5999 · 6000+. Fewer than 3 controls → dropped.
>
> **FORWARD NULLS:** delisted events/controls excluded from the primary;
> sensitivity re-run with delisted = 0.
>
> **SPLITS:** age phase from `getPeakStatus` (primary); position; value tier;
> the app population (value ≥ 1000).
>
> **MINIMUM N:** a cell with < 30 events reports "no detectable signal at this
> corpus size". A cell ≥ 30 whose CI spans 0 reports "no detectable signal".
>
> **DECISION RULE:** REVERTS if overall dip mean e > 0 with CI excluding 0;
> KNIFE if < 0 with CI excluding 0. The age claim is accepted only if both
> cells have ≥ 30 events and the difference's CI excludes 0. Otherwise a dated
> null.
>
> **KNOWN LIMITS:** one 30-day event window in one market regime; events share
> dates; mean reversion is partly mechanical (regression to the mean of
> measurement noise).

**Corrections, both before outcomes:**
1. **Threshold source.** Nothing exported the ±50 (it was written out in ten
   places). On the owner's call the rule got one home first —
   `src/utils/marketTrend.js` (PR #75) — and the script imports it from there.
2. **Event counts.** The pre-registration quoted 359 dips / 327 rises. Those
   counted **88 draft-pick rows** still in the file from before the 2026-09-21
   classifier fix. Players only, before the control and delisting rules: 352
   dips / 306 rises (302 / 260 survive those rules).

---

## 3. Data integrity (checked before trusting any event)

| check | result |
|---|---|
| Daily columns | 90, 2026-07-09 → 2026-10-06, **no gaps**, no repeated columns |
| Pick rows (non-numeric ids) | **88 of 619 rows** — dropped. Written before the 09-21 fix; they age out of the file by ~2026-12-19 on their own. They cost the phone ~10% of this file today (81.5 KB → 73.2 KB on the wire, measured) |
| Players per day | **393–399**, steady. The coverage "drops" on 09-05 and 09-21 were pick rows leaving, not players |
| Top-500 cap | **never binds** — FantasyCalc lists fewer than 500 players, so a blank means FantasyCalc stopped listing him |
| `trend30Day` proxy | FantasyCalc doesn't archive its own trend. Rebuilt v(t) − v(t−30) vs today's live `trend30Day`: r = 0.978, same side of ±50 for 298 of 357 players (83%) |
| `values-consensus.json` FantasyCalc column | **identical to this file on all 5,924 overlapping cells** — a permanent daily copy from 2026-09-22 |
| `trade-values.json` | **2 trades, 2 player prices** — unusable as a long-horizon anchor; not used |
| Player position / age | Sleeper `/players/nfl`, age computed **at the event date** from `birth_date`; 1 dip event has no birth date (excluded from the age split only) |

---

## 4. Results (`--frozen`, all pre-registered unless marked)

Excess = the player's 30-day % change minus the average of matched
non-movers. Positive on the dip side = bounced back.

### Dips (trend < −50), +30 days, delisted excluded

| cell | n | mean excess | 95% CI | median | points | verdict |
|---|---|---|---|---|---|---|
| **overall** | 302 | +12.8% | −4.4% … +33.3% | +0.2% | +25 | no detectable signal |
| **value ≥ 1000 (app)** | 144 | **+2.4%** | −0.1% … +4.9% | +2.1% | +23 | no detectable signal |
| ascending (pre-peak) | 100 | −15.5% | −27.0% … −4.7% | −6.6% | −34 | trails |
| peak | 120 | +7.0% | −17.5% … +40.2% | +0.8% | +36 | no signal |
| declining (post-peak) | 81 | +57.9% | +10.7% … +118.3% | +2.9% | +82 | beats |
| QB | 55 | +9.3% | −8.8% … +31.3% | +4.0% | +51 | no signal |
| RB | 84 | +42.2% | +3.4% … +91.7% | +0.8% | +34 | beats |
| WR | 108 | +0.9% | −19.2% … +24.7% | +0.1% | +12 | no signal |
| TE | 55 | −5.0% | −49.5% … +66.4% | −14.7% | +9 | no signal |
| < 1000 | 158 | +22.4% | −10.3% … +61.6% | −12.9% | +26 | no signal |
| **1000–2999** | 106 | **+4.2%** | **+1.1% … +7.4%** | +3.2% | +68 | **beats** |
| 3000–5999 | 37 | −2.8% | −5.9% … +0.2% | −0.3% | −101 | no signal |
| 6000+ | 1 | — | — | — | — | n < 30 |

Age contrast (ascending − declining): −73.4%, CI −134.3% … −24.1% (n 100 / 81)
— **the pre-registered rule fires**, in the opposite direction to the prior.
See §5: it is an artefact of the statistic, not a finding about age.

Dropped: 21 delisted, 29 with < 3 controls. Sensitivity (delisted = 0):
overall +14.9% (−1.1 … +34.2), app population unchanged at +2.4% — **no
conclusion moves.** Robustness, *not pre-registered*, resampling whole event
dates instead of events: overall CI −15.3% … +32.5%.

### Rises (trend > +50), +30 days, delisted excluded

| cell | n | mean excess | 95% CI | median | points | verdict |
|---|---|---|---|---|---|---|
| **overall** | 260 | **−15.6%** | **−23.1% … −8.5%** | −6.0% | −48 | **trails (gives back)** |
| **value ≥ 1000 (app)** | 161 | **−2.3%** | −4.8% … +0.3% | −1.5% | −61 | no detectable signal |
| ascending | 72 | −26.1% | −39.0% … −14.6% | −15.5% | −152 | trails |
| peak | 116 | −15.7% | −26.2% … −6.2% | −6.1% | −33 | trails |
| declining | 72 | −5.0% | −20.9% … +11.5% | −0.1% | +32 | no signal |
| QB | 44 | −20.8% | −37.1% … −7.4% | −4.1% | −115 | trails |
| RB | 72 | −12.7% | −23.9% … −1.6% | −7.8% | −87 | trails |
| WR | 104 | −18.3% | −30.7% … −7.2% | −5.2% | −17 | trails |
| TE | 40 | −8.2% | −29.8% … +17.7% | −10.0% | +15 | no signal |
| < 1000 | 99 | −37.3% | −54.8% … −19.1% | −43.7% | −28 | trails |
| 1000–2999 | 122 | −2.0% | −5.2% … +1.2% | −1.7% | −42 | no signal |
| 3000–5999 | 38 | −3.4% | −6.4% … −0.6% | −1.2% | −133 | trails |
| 6000+ | 1 | — | — | — | — | n < 30 |

Age contrast: −21.2%, CI −42.3% … −0.8% (72 / 72) — young risers give back
more. Sensitivity (delisted = 0): overall −13.3% (−20.0 … −6.7); the age
contrast loses significance (CI −37.6 … +0.3). Date-resampled CI (*not
pre-registered*): −31.6% … −7.5% — **the overall give-back survives**.

### +60 days

**Infeasible** on both sides: it needs 91 daily columns and the file has 90.
See §6.

---

## 5. Explaining the negatives (one mechanism, and where it fails)

**The average % excess is dominated by players worth almost nothing.** A
player valued at 32 who returns to 567 has "risen 1,672%". The five largest
dip excesses are all under 100 points of value (Darren Waller 32, Roschon
Johnson 16, Kendrick Bourne 21, Samaje Perine 26, Emari Demercado 84). One
mechanism — **percent returns on near-zero denominators** — explains every
anomaly in the tables:

- The **overall dip mean** (+12.8%) sits far from its **median** (+0.2%).
- **"Declining dips beat ascending"** is carried by the declining < 1000 cell
  (exploratory: n 37, mean **+124%**, median **−0.1%**). Inside the app
  population the two are level: ascending **+1.6%** (n 42) vs declining
  **+2.1%** (n 44). The same pattern explains the RB "beats" cell.
- The **< 1000 tier** has a positive mean and a −12.9% median.

The pre-registered statistic was a poor choice for the < 1000 tier; the
median, the absolute-points column and the ≥ 1000 rows don't share the
problem. **The registered age verdict is recorded as it fired, and is not
accepted as a finding about age.** The lesson for the next pre-registration:
register a median or a points statistic alongside the mean whenever the
population includes near-zero values.

**What is NOT explained by it:** the rise-side give-back. It holds in the
median (−6.0%), in absolute points (−48), under date resampling, and in the
3000–5999 tier (−3.4%, CI clear of 0). Exploratory: rookies (`years_exp ≤ 1`)
risers −34% (n 89) — consistent with August hype deflating. Whether this is a
real give-back or partly mechanical regression to the mean (controls are
selected for *not* moving, so they carry less noise) **cannot be separated with
one window** — that limit was registered in advance.

**Two more checks (exploratory, not pre-registered):**
- **Left-censoring.** 121 of 302 dip events land on the first eligible day
  (2026-08-08), when "crossing" can't be told apart from "already falling".
  Splitting them out, app-population dips are +1.5% (first day) and +3.0%
  (true crossings); rises −1.2% and −3.3%. Same direction, same size.
- **Clustering.** Events fall on 27 distinct dates, 75% of them in 8–15 Aug.
  The date-resampled intervals above are the honest width for the overall
  numbers.

**Adversarial refutation (methodology Law 3):** done in this session only —
the tail, censoring, clustering and delisting attacks above. **No independent
second session has tried to break it.** That is recommended before any app
change rests on the November re-run.

---

## 6. The 90-day window binds — resolved by #77 (2026-10-07)

**The window binds:** +60 days is infeasible, and +30 has only 30 eligible
event days.

**What was found:** `values-consensus.json` has kept a **permanent** daily
FantasyCalc column since 2026-09-22, identical to `values-history.json` on
every overlapping cell. But the days *before* it (2026-07-09 … 09-21) lived
only in the rolling file, which was deleting one per morning.

**The fix (owner-approved, shipped in #77):** the archive is now the one
permanent home of daily FantasyCalc values. Every nightly run carries any day
the rolling file holds and the archive lacks into it (`backfillFantasyCalc`).
The first run, dispatched on `main` on 2026-10-07, added the 75 missing days —
**all 35,788 values identical to the rolling file** — so the archive runs
unbroken from **2026-07-09**. That was the same morning the rolling file
dropped 07-09. This study reads the archive; the frozen copy that bridged the
gap during the work was deleted once the archive was verified.

**Cost:** the archive grew 37 KB → 102 KB on the wire. **Zero bytes on the
phone** (the app never fetches it), no workflow-file change, and the rolling
file stays at 90 days.

**Alternative considered and rejected:** raising `MAX_DAYS` in
`snapshot-values.mjs`. The phone fetches that file for every sparkline;
today it is **81.5 KB on the wire for 90 days** (measured), so each extra day
costs roughly **0.9 KB per sparkline load** (linear estimate, not measured).
180 days ≈ +80 KB for every user forever, to serve an analysis the app never
runs. It would also need a workflow change and change control.

---

## 7. When to re-run, and what would change the answer

**Re-run on or after 2026-11-06**, when the merged series reaches 120 days:

- the +30 event window doubles (30 → 60 event days), adding September–October
  **regular-season** events — a second market regime, which standing rule 1
  requires before anything is ranked on this;
- **+60 days becomes measurable** for the first time (30 event days);
- that is still ahead of the Week 13 trade deadline.

```bash
git fetch origin values-history
node scripts/dev/buylow-timing-backtest.mjs          # everything archived so far
```

**What would justify a change to the app** (pre-register before the re-run):
the app-population dip excess clears zero in **both** windows, with the same
sign — or comes out negative in both, which would mean Buy-Low should carry a
caution. Until then the advice stands as shipped.
