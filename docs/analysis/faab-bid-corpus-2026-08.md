# FAAB Bid Corpus & Proposed Bid Rule — August 2026

**Date:** 2026-08-08. **Status: RESEARCH ONLY.** The FAAB bid recommender
remains under CLAUDE.md's **Future Features (Do Not Build Yet)**. This document
is the memo the `dynastyedge-research-frontier` skill (Item 2) specifies should
exist *before* any build decision. §6 is a proposed rule spec, drafted at the
owner's request — it is a proposal, not an approved build.

**Reproduce every number here:** `node scripts/dev/faab-corpus.mjs`
(zero dependencies, read-only, public Sleeper endpoints).

---

## 1. What was pulled

The full league-history chain via `previous_league_id`, four seasons deep:

| Season | League ID | FAAB budget | Bid-bearing claims | Won | Failed |
|---|---|---|---|---|---|
| 2026 | `1313933520715907072` | **$1000** | 11 | 10 | 1 |
| 2025 | `1180943706723041280` | $100 | 247 | 152 | 95 |
| 2024 | `1053439750847287296` | $100 | 129 | 65 | 64 |
| 2023 | `962504692288806912` | $100 | 84 | 49 | 35 |

**471 bid-bearing waiver claims total.**

> **The budget changed for 2026: $100 → $1000.** Every historical dollar figure
> is on the old scale. All analysis below is therefore expressed as **percent
> of budget**, which is the only portable unit. A 10× budget also means 10×
> finer granularity, which may shift bidding behavior on its own — flagged as
> an unquantified risk in §7.

## 2. Finding 1 — the frontier's open question is resolved: losing bids ARE visible

The research-frontier skill flagged as **unverified** whether Sleeper exposes
failed waiver claims with their bid amounts, calling it "the difference between
modeling only clearing prices and modeling the full bid distribution."

**It does.** 194 failed claims across the three completed seasons carry intact
`settings.waiver_bid` values. Both `useTransactions.js` and
`useLeagueHistory.js` filter to `status === 'complete'` at ingestion, so the app
discards this today — but it is there in the API, for every past season.

## 3. Finding 2 — but `status: failed` is NOT "we were outbid"

This is the load-bearing caveat, and it substantially downgrades the naive
excitement of Finding 1.

**81% of failed claims (158 of 194) sit in a waiver run where the same manager
also won something that week.** Sleeper processes a manager's claims as an
ordered batch; once roster spots or budget are consumed, the remaining claims
fail regardless of their bid size.

The clearest single example — one manager, 2025 week 1, 25 claims in one run:

```
bid 91  complete        bid 51  failed         bid 41  failed
bid  7  complete        bid 31  failed         bid 16  failed
bid  1  complete        bid  7  failed         bid  0  failed
bid  0  complete  (×11)
```

Bids of 51 and 41 failed while bids of 7, 1, and 0 succeeded. That is not an
auction outcome; it is roster capacity.

**Consequence:** a failed claim's bid tells you what someone was *willing* to
pay, but its failure does not tell you they lost an auction. Any model that
treats `failed` as "outbid" will be fitting noise. Ten failed claims across the
corpus even exceed the winning bid on the same player; only 2 of those are
explained by insufficient remaining budget.

## 4. Reconstructing genuine auctions

The clean unit is a **(season, week, player)** group — a real head-to-head only
exists when two managers claimed the same player in the same run. Auctions
where a loser outbid the winner are dropped as unclean (their failure came from
budget or the batch effect, not the auction).

| | count |
|---|---|
| player-week auctions | 302 |
| dropped as unclean | 64 |
| **clean** | **238** |
| — contested (2+ managers) | **81 (34%)** |
| — uncontested | 157 (66%) |

**Two-thirds of waiver claims are uncontested**, and their median winning bid
is **1% of budget**. The dominant question is not "how much?" but "will anyone
else bid?"

## 5. Clearing prices, and the pre-registered bar

**Contested clearing prices** (winning bid, % of budget, n=81):

| percentile | % of budget | on 2026's $1000 |
|---|---|---|
| p50 | 11% | $110 |
| p60 | 15% | $150 |
| p70 | 20% | $200 |
| p80 | 23% | $230 |
| p90 | 36% | $360 |

**Runner-up bids** — the bar a bid must actually clear (n=81):
p50 **2%** · p75 **11%** · p80 **15%** · p90 **22%**.

### The pre-registered bar FAILED

The frontier skill pre-registered: *a bid rule should win ≥80% of contested
claims at ≤ the median dollars actually spent.* Held-out test on 2025
(fit on 2023–24, tested on 2025, n=40 contested, median actual winning bid
8.5%):

| flat rule | wins | of which at ≤ median cost |
|---|---|---|
| 5% | 65% | 26 |
| 8% | 73% | 29 |
| 12% | 83% | **0** |
| 16% | 83% | **0** |
| 25% | 90% | **0** |

No flat rule clears both halves. **Reported as failed, per pre-registration
discipline** — the result is not quietly re-baselined.

**However, the bar itself was mis-specified**, and that is the more useful
finding. In a sealed-bid auction you cannot both win 80% of the time and spend
at-or-below the median *winner's* price: the median winner is by definition the
50th percentile of outcomes, so an 80%-win rule must sit above it. The bar
demanded a contradiction. §6 proposes a corrected pair of bars.

### Conditioning did not rescue it

Two candidate conditioning variables were tested:

- **Player value tier** (today's FantasyCalc value — **hindsight-contaminated**
  by 1–3 years for these claims, so a signal check only): contest *rate* rises
  with value (34% → 48% → 53% across tiers), but the clearing *price* does not
  move monotonically (5 → 6 → 2), with only 19–70 observations per bin.
- **Week** (hindsight-free): contested clearing prices firm through the season
  — wk1 7%, wk2–4 7%, wk5–9 12%, wk10–14 15% — then collapse to ~1% in
  wk15–18 as budgets empty and the season ends.

The week effect is real and directionally sensible; the value effect predicts
*whether* a player draws a fight but not *how much* it costs. Neither produced
a rule beating flat-percent at this sample size.

## 6. Proposed rule spec (PROPOSAL — not an approved build)

A two-part rule, because §4 shows the binary contest question dominates:

**Part A — will this be contested?** Bid the floor when it won't.
- Default posture: **1% of budget** ($10 on the 2026 scale) for a player nobody
  else plausibly wants. This is the observed uncontested median and it
  preserves budget.
- Escalate to Part B when the player is a plausible league-wide target. Best
  available live signal is the player's current FantasyCalc value + whether he
  fills a deficit position on multiple rosters — both already computed by
  `recommendations.js` and `rosterAnalysis.js`, so no new data source.

**Part B — contested bid ladder**, as % of remaining budget, from §5:

| intent | bid | wins ≈ | 2026 $ |
|---|---|---|---|
| Value play — take it if it's cheap | **11%** | ~50% | $110 |
| **Default contested bid** | **16%** | **~83%** | **$160** |
| Must-win (league-winner, thin position) | **23%** | ~85–90% | $230 |
| Blank check | 36%+ | ~90%+ | $360+ |

**Part C — seasonal adjustment** (from the week effect): scale Part B by
roughly **0.8× in weeks 1–4**, **1.0× weeks 5–14**, and **0.3× from week 15**,
where budgets are spent and prices collapse.

**Part D — the batch trap.** Because Sleeper fails a manager's remaining claims
once a run's capacity is consumed (§3), the recommender must warn that
**stacking many claims in one run silently kills the high bids at the bottom of
the queue**. Ordering claims by priority matters as much as the bid. This is a
genuine, non-obvious insight the corpus surfaced, and it costs nothing to
surface in UI.

### Corrected acceptance bars for the next round

Replacing the contradictory pre-registered bar with two separable ones:

1. **Efficiency:** across a season, total FAAB spent per contested player *won*
   is ≤ the league's median cost-per-contested-win.
2. **Win rate:** the rule wins ≥75% of contested auctions it chooses to enter.

Both are measurable against live 2026 data with no hindsight.

## 7. Limitations — read before trusting any of this

- **Small N.** 81 contested auctions across three seasons; per-bin conditioning
  drops to 19–70. Treat all percentiles as indicative, not precise.
- **Budget scale change.** All history is $100; 2026 is $1000. Percentages
  port; *behavior* may not. 10× granularity could compress or spread the bid
  distribution in ways this corpus cannot predict.
- **Value tiers are hindsight-contaminated.** FantasyCalc exposes only current
  values, and `values-history.json` is a 90-day rolling window — so a 2023
  pickup can only be tiered by what the player is worth *today*. §5's value
  analysis is a signal check, not evidence.
- **Uncontested ≠ uncontestable.** A player nobody else claimed may simply have
  been unwanted; the corpus cannot distinguish "I read the market well" from
  "nobody cared".
- **One league, one bidding culture.** Ten specific managers. Nothing here
  generalizes, and per frontier Item 6 that is by design.

## 8. What this changes

- **Frontier Item 2's blocking question is answered** (§2) and its framing is
  corrected (§3): we have the bid distribution, not clean auction outcomes.
- **A rule spec now exists** (§6) with corrected, falsifiable acceptance bars.
- **Nothing ships.** The recommender stays behind the Future Features gate
  until the owner explicitly asks. The natural moment to revisit is after ~6
  weeks of live 2026 waiver data on the new $1000 scale, which is the first
  data that tests §6 without hindsight.
