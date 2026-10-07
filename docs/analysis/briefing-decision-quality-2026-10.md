# Briefing decision-quality — the recording, and the scoring plan fixed before any data (2026-10)

**Open item:** `docs/open-items.md` §0 #10 · `dynastyedge-research-frontier` Item 1
**Recorder:** `scripts/record-briefing.mjs` (policy: `scripts/briefingLedger.mjs`, pinned by `tests/briefingLedger.test.mjs`)
**Record:** `briefing-ledger.json` on the `values-history` branch — permanent, daily, the app never fetches it
**Status:** recording from the first `main` run after merge. **Scoring is NOT built.** First scoring pass on or after **2026-12-15** (§4.6). This file was written before a single recorded day existed. Nothing in §3–§4 may be edited after the first scoring pass reads the ledger; corrections go in a dated addendum at the bottom, the way the buy-low study handled its two.

---

## 1. In plain English

**The question.** Every morning The Edge's briefing makes claims. "Buy this falling player." "Sell your riser." "Pick up this free agent." "This team's window is closing." "This owner is underperforming." Nobody has ever checked whether those claims were right. This work starts writing them down, one day at a time, so they can be checked later.

**Why record now and score later.** A claim can only be judged after time passes (did the player bounce back over the next month?), and a day not written down can never be recovered. So the recording ships first and the scoring waits for the record to mature.

**What gets recorded each day.** The five briefing items that make a checkable claim, each with the player or team named, the prices and numbers it was based on, and a **comparison group**: the other players who also qualified that day, or every other team. "He went up" proves nothing on its own. The real question is whether he did better than the alternatives the app passed over.

**What we expect to find, written down now.** The buy-low study (`buylow-timing-2026-10.md`) found that falling players worth 1,000+ beat comparable players by only about 2% over 30 days, which isn't certain and is smaller than the ±5% the app treats as "even". So the honest expectation for the buy-low item is **no detectable edge**. If that's what we measure, it's a real finding, and it would mean the buy-low card reminds you of the market rather than finding bargains.

**How long it takes.** A reliable answer on buy-low needs about 75 separate calls (§4.5). The briefing changes its buy-low pick only a few times a month, so that is years, not months. Early passes are labelled **indicative**, and the rules below stop anyone (human or AI) from reading a verdict into them.

---

## 2. What is recorded, and what is not

One entry per UTC day (run at ~09:41 UTC by `values-history.yml`). Each day carries the date, the code version (commit), the as-of stamp of every source, the NFL week and season stage, my tier, value rank, deficits and surpluses, and the briefing's item list in order. The five checkable items:

| item | claim | subject recorded | comparison group recorded |
|---|---|---|---|
| `buyLow` | this falling player is worth buying | player (id, value, 30-day trend, age, position rank), owner team + tier | every player who passed the buy-low rule that day, steepest fall first (≤ 10 rows + true count) |
| `sellHigh` | my riser will give some back | player | my other qualifying risers (≤ 10 + count) |
| `pickup` | this free agent helps my roster | player, the reasons shown, the engine's score | the same-position runners-up the engine carries (≤ 3) |
| `closingWindow` | this team will sell veterans | team (roster id, **owner id**, value, record, tier), its 3-year projected change, peak and last season | every opponent's projection read |
| `underperformer` | this frustrated owner is a buy window | team, value rank, record rank, the gap | every team's two ranks |

**It records the app's code, never a copy.** The claims are `computeEdgeSignals`' output and the order is `buildBriefing`'s, imported from `src/utils/edgeBriefing.js`. The league comes from the same `buildLeagueState` assembly the MCP tools read. `computeEdgeSignals` now also returns the full pools its picks are taken from (`buyLowCandidates`, `sellHighCandidates`, `opponentTrajectories`, `rankGaps`), so the comparison groups are selected by the same rule as the picks. A test fails if a selection rule appears in the recorder.

**Null, never 0.** An unpriced player's value and trend are `null`. A day the recorder could not read is still written, with `status: 'unreadable'` and the reason. A quiet signal is `fired: false`, which is a different statement from "unreadable".

**What a server copy cannot see, and why that is acceptable.** The watchlist, the last-visit time and live playoff odds live on the phone. None of them changes **who** an item names. They only add cards (watchlist mover, "N moves since your last visit", playoff odds) that can push a later item past the 5-card cut on the phone. So all five claims are recorded whether or not they would have shown, and `slot` is the position among the items a server can build (`null` = past the cut even then). **We score the advice, not the screen layout.**

**Other known limits.** The run happens around 5:41 am ET, and FantasyCalc can move between then and when the owner opens the app. A player outside FantasyCalc's top 500 has no archived outcome and drops from scoring (the count of drops is reported). The recorded identity is roster 6 (`DYNASTYEDGE_ROSTER_ID` overrides).

---

## 3. Definitions (pre-registered)

- **Outcome prices** come from `values-consensus.json`'s `fantasycalc` column, the one permanent home of daily FantasyCalc values. **+30 days is primary; +90 is secondary** (possible because that archive is permanent).
- **Episode (the unit of analysis).** A run of recorded days on which an item names the same subject (same `sleeperId`, or same `ownerId` for team items). An unreadable day does not end an episode; a quiet day or a different subject does. **An episode is scored once, from its first day `t0`, at the price recorded on `t0`.** Fifty days of "buy Maye" is one call.
- **Matched controls** (buy-low and sell-high), exactly as the buy-low study defined them: same position, same value tier at `t0` (< 1000 · 1000–2999 · 3000–5999 · 6000+), not moving (|trend| ≤ 50) on `t0`. Fewer than 3 controls → the episode is dropped from that comparison (count reported).
- **Excess return** `e = r_subject − mean(r_controls)`, with `r = (v(t0+30) − v(t0)) / v(t0)`.
- **Statistics.** Mean `e` with a 95% bootstrap CI over episodes (10,000 resamples, fixed seed), **always reported beside the median and the change in points**. The buy-low study's lesson: on near-zero values a % return is dominated by a few cheap players.
- **Delisted** (no price at `t0+30`): excluded from the primary result; sensitivity re-run with delisted = 0.
- **Regimes.** A day's `codeVersion` changes on every deploy. If a change touches `computeEdgeSignals` / `buildBriefing` / the rules they call (market trend, pickup engine, trajectory, tiers), the series is **split at that commit** and each regime is scored separately. Pooling across a rule change is not allowed.
- **"Paid" for a league move** (§4.6): a trade where a side came out ahead at +30 days under the ledger's existing symmetric hindsight rule (`hindsightResult`, ±5% of the larger side, `utils/fairBand.js`); a waiver or free-agent add whose player's `e` ≥ +5% at +30 days.

---

## 4. The scoring plan (pre-registered)

### 4.1 Buy-low

- **Primary:** `e` versus matched controls. **Expected: ≈ +2%, CI spanning 0** (the study's app-population result).
- **Selection test (the one that matters):** `e_pool = r_pick − mean(r over that day's recorded eligible pool, pick excluded)`. This asks whether choosing the steepest faller beats choosing any eligible faller. **Expected: ≈ 0.**
- **Reading:** if `e` < 0 with the CI excluding 0 at n ≥ 75, the item is buying falling knives and should be demoted (a proposal to the owner, not an automatic change). If `e_pool` > 0 with the CI excluding 0 at n ≥ 75, the selection rule adds skill. Anything else is a dated null.

### 4.2 Sell-high

- **Primary:** `e` versus matched controls; a hit is `e < 0` (the riser gave back relative to comparable players). **Expected: ≈ −2%, CI spanning 0** (the study's app-population rises).
- The pool comparison is usually impossible (my qualifying risers are 0–2 a day); the pool size is reported, not tested.

### 4.3 Pickup

- **Value:** `e_alt = r_pick − mean(r_alternatives)` at +30 days.
- **Revealed preference:** was the player added by **any** team (waiver or free agent, from the league's transactions) within 14 days of `t0`, compared with the same rate for his recorded alternatives?
- **No prior expectation is registered**; nothing has measured this before. Indicative only below n = 20 episodes.

### 4.4 Closing window and underperformer (team claims)

- **Closing window:** within 30 days of `t0`, did the named team complete a trade in which it sent out more current value in players at or past their peak window (`peakWindows.js`) than it received? This is compared with the same rate over the other 8 opponents (`opponents`) in the same window. Secondary: was the team's own total-value change over +90 days below the opponents' median (did the projected decline happen)?
- **Underperformer:** within 30 days, did the named team trade at all (rate versus the other teams), and in its trades did the counterparty come out ahead at +30 days under `hindsightResult`?
- **The trade deadline (Week 13) truncates both windows.** An episode with fewer than 14 trading days before the deadline is excluded from the trade measures (count reported).
- **N is tiny by construction** (10 teams, a handful of episodes a season). Indicative only below 20 episodes; **no verdict is expected this season.**

### 4.5 Sample size (why 75)

The buy-low study's app population gave a 95% CI half-width of 2.5 points at n = 144, which implies a per-event SD of ≈ 15 points. To detect a 5-point edge (the size of the Analyzer's "even" band) with 80% power at α = 0.05 two-sided: n ≈ (1.96 + 0.84)² × 15² / 5² ≈ **75 episodes per item**.

- **n < 20:** "indicative only", with no direction claimed.
- **20 ≤ n < 75:** report the estimate and CI as "no verdict at this sample size", even if the CI excludes 0.
- **n ≥ 75:** the decision rules in §4.1–4.2 apply.

The same thresholds apply to every item. A smaller effect than 5 points is not worth acting on, since it sits inside the Analyzer's own idea of "even".

### 4.6 League hit rate, and when to score

- **Hit rate H:** of the paid league moves (§3) in the recorded period, the share where an acquired player, or the counterparty team, was named by a scored item in the 14 days before the move.
- **Chance baseline B:** distinct players named by buy-low / sell-high / pickup in those 14-day windows ÷ FantasyCalc-priced players. Report H against B, and precision (the share of named items followed within 30 days by a paid move involving them). **Needs ≥ 30 paid moves before H is reported as more than indicative.**
- **When:** the first pass runs **on or after 2026-12-15**, when episodes starting 2026-10-08 … 11-14 have matured at +30 days. It is labelled indicative whatever it shows. After that, re-run quarterly, and read a verdict only when an item crosses n ≥ 75.

### 4.7 The fence

Until a scoring pass has read the ledger, no change to the briefing's selection rules is tuned against it. The scoring script reads the ledger **once per pass**, following this document. A metric not listed here may be explored, but it must be labelled "not pre-registered", as the study labelled its date-resampled CI.

---

## 5. Cost

One step in the daily values job, about 10 seconds and roughly 8 requests to free APIs. Measured on the first local run (2026-10-07): **8.2KB raw / 2.0KB on the wire** for one day, so about 3MB raw a year (~0.7MB on the wire). The phone pays nothing; it never fetches the file. After publishing, an alarm (`scripts/check-briefing-ledger.mjs`) fails the run when the newest readable day is 2+ days old (one missed run is a blip), and a missing file is itself an alarm.
