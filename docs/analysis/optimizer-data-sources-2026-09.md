# Lineup Optimizer — data-source feasibility study

**Date:** 2026-09-04 · **Status:** investigation complete, nothing built
**Re-run the numbers:** `node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scripts/dev/optimizer-signal-backtest.mjs`
**Pre-registration:** hypotheses H1–H6 were written with predicted values and
named disconfirming outcomes *before* each run (reproduced in §8).

Owner's question: the Optimizer reasons entirely off Sleeper's own projection,
so its only edge over the Sleeper app is doing the slot math correctly. What
would let it say things Sleeper cannot?

**Answer in one line: not a better projection — a better-stated one, plus the
defenses the app currently refuses to show you.**

Four of six hypotheses were disconfirmed. Those nulls are the finding: they say
where *not* to spend effort, and they are consistent with one mechanism.

---

## REVISION — 2026-09-04, later same day (owner review)

The owner challenged two things. Both challenges were correct, and one of them
**reverses a headline recommendation.** Original text is left intact below so the
error is visible; this block is the corrected reading.

### R1. The DEF streaming result did NOT replicate. It is dead.

I reported +0.91 pts/wk (t = 2.22, "significant at 95%") from **one season** and
ranked it the #1 thing to build, while flagging the single season as a caveat. I
should have run the other seasons *before* ranking it. Extended to the full
league history:

| season | n | started | best owned | streamed | gain |
|---|---|---|---|---|---|
| 2023 | 137 | 8.81 | 8.99 | 9.07 | +0.26 |
| 2024 | 135 | 7.99 | 8.30 | 6.80 | **−1.19** |
| 2025 | 136 | 8.22 | 8.29 | 9.13 | +0.91 |
| **pooled** | **408** | | | | **−0.00** (95% CI −0.60…+0.59, t = −0.01) |

A clean null, with one season significantly *negative*. **Streaming defenses by
Sleeper's projection is worth nothing** — unsurprising in hindsight, since that
projection is the weakest of any position (r = 0.213). Holding a good defense is
just as good as churning.

The narrower case survives but is small: across 2023–25 there were only **8
team-weeks** where a DEF slot could not be filled from the roster at all (nothing
rostered, or the only rostered defense on bye). Those weeks score **0**; the best
available defense averaged **3.5 pts** (95% CI −0.95…+7.95 — n = 8, so this is an
observation, not a result).

**Corrected verdict:** the empty-drawer bug (§2) is still real and still worth
fixing — you cannot add a defense at all, and in KC's bye week (2026 W5) that slot
scores 0 with no in-app remedy. But fix it as a **correctness bug worth a few
points a year**, not as a +12.8-point feature. The original ranking oversold it.

### R2. The ceiling test was the wrong instrument for the waiver question.

The owner's objection: season averages can't represent "this backup will go off
this week because the starter is out," so a cheater built from season averages
understates what a weekly-aware model could do. **Correct.**

Two compounding flaws in the original design:

1. The cheater used each player's **season average**, which by construction
   smooths away mid-season role changes — exactly the event in question. It
   measures how much of scoring is explained by *stable* talent, not how much is
   knowable before kickoff.
2. Every accuracy and ceiling table filtered to **projected ≥ 5**, which excludes
   the waiver population outright. A backup projected 3 who scores 18 never
   entered the sample. So those tables describe **starters**, and I used them to
   argue about **pickups**.

On the owner's follow-up ("what if the cheater knew each week?"): a predictor
that knows the exact weekly score has zero error by definition — that is the
answer sheet, not a ceiling, and it proves nothing about what is *knowable*.
The right question is the tail, measured directly:

**Waiver-tier RB/WR/TE (projected < 8), 2022–25: 8,072 player-weeks, 402 scored 15+ (5.0%).**

| Sleeper projected | count | chance of a 15+ game |
|---|---|---|
| 0–2 pts | 1,657 | **0.9%** |
| 2–4 pts | 2,147 | 2.4% |
| 4–6 pts | 2,087 | 5.0% |
| 6–8 pts | 2,181 | **10.6%** |

So the projection **level** sorts this tier extremely well — a 12× spread. But the
week-over-week **bump** does not warn you: of the 402 actual breakouts, Sleeper
had raised the projection by ≥1 point for only **83 (21%)**. **Roughly four in five
breakouts arrive with no advance signal in the projection.**

That is a real gap, and the original note's "Sleeper already absorbs everything"
claim was too strong. It holds for *average accuracy across starters*; it does
**not** hold for the waiver tail.

**Is the missing 79% recoverable?** Unknown, and I could not test it. The obvious
mechanism — "the man ahead of him on the depth chart is Out" — is buildable from
data the app **already caches**: `usePlayerDB` keeps `injury_status`,
`depth_chart_position` and `depth_chart_order`, and depth-chart coverage is
complete (32/32 teams list an RB1). But:

- A naive join (any free agent behind any injured player) returns **22 hits on
  live data, all projecting 0.0** — third-string tight ends behind injured
  fourth-stringers. Noise.
- A tightened join (immediate backup to a depth-order-1 starter, own projection
  ≥ 3) returns **0 hits today**, because in Week 1 preseason no starters carry an
  Out designation yet.
- There is **no historical `injury_status`** in the Sleeper API, so this cannot be
  back-tested at all. Only a live in-season trial can settle it.

**Corrected verdict on Q3:** the provable win is still the one already
identified — put the weekly projection in the free-agent list and sort by it,
which moves the top of that list from a 0.9% breakout tier to a 10.6% one. The
injury/depth-chart alert is a *promising, untested* idea, not a measured one, and
should be built (if at all) as an explicitly experimental surface with a plan to
measure it during the season.

### R3. New caveat — the projections endpoint is mutable

`/projections/nfl/regular/{y}/{w}` is **rewritten in place**. Two fetches of 2026
W1 about ten hours apart differed on 6 of 9,419 entries (PIT 8.01→7.97, ATL
5.93→5.91, …). Small drift in the preseason, but it establishes the mechanism.

Consequence: every historical projection used in this note is the **last value
Sleeper held for that week**, not necessarily what was on screen before kickoff.
This makes the accuracy figures **optimistic** (they may embed late-week news a
Wednesday reader never saw) — and it makes the 21% breakout-flag rate
**conservative**: even with late news possibly baked in, Sleeper still failed to
flag four out of five breakouts.

### R4. What still stands, unchanged

- The **ceiling on average accuracy for starters** (4.4–13.4%) and the ESPN
  agreement (r = 0.966) — both still argue against multi-source projections for
  the start/sit case. R2 narrows their scope to starters; it does not overturn them.
- The **calibration curve** (§4). N > 500k pairs, monotone 52% → 87%. Unaffected by
  any of the above and still the strongest single finding.
- The **empty free-agent drawer** (§2) — a live, reproduced bug.
- H1, H2, H3 and H6 all remain disconfirmed *as posed*. R2's point is that H6
  posed the wrong question (lagged usage predicting next week), not that its
  answer was wrong.

### R5. Corrected ranking

| # | Item | Status after revision |
|---|---|---|
| **1** | **Confidence / calibration curve** | **Promoted to first.** Strongest evidence in the study, unaffected by the revision. |
| **2** | **Weekly projection in the free-agent list, sorted by it** | Promoted. 0.9% → 10.6% breakout rate across the sort. |
| **3** | Fix the empty DEF drawer | Still do it — a correctness bug, not a points feature. Demoted from #1. |
| **4** | Injury/depth-chart breakout alert | **New, unproven.** Data exists and is already cached; mechanism untested and un-backtestable. Build only as a measured experiment. |
| 5–7 | Multi-source projections · boom/bust score · lagged-usage model | Still don't build. |

### R6. Standing methodology lessons

1. **Never rank a recommendation on one season.** The DEF result had n = 136 and
   t = 2.22 — precisely the marginal zone that fails to replicate. Multi-season
   replication should be a gate *before* ranking, not a caveat after it.
2. **A filter chosen for one population invalidates claims about another.**
   `proj ≥ 5` was right for start/sit and silently wrong for waivers.
3. **A ceiling is only as good as the cheater's information set.** State what the
   cheater knows, and check it can represent the phenomenon in question.
4. **Test the endpoint's mutability before back-testing it.** Two fetches hours
   apart is a five-minute check that should have run first.

---

## 1. What the data actually is (verified, not assumed)

All probed live on 2026-09-04. NFL state: **2026, week 1, `season_type` regular,
season opens 2026-09-09** — so no 2026 game has been played.

| Claim | Verified how |
|---|---|
| Sleeper's projection payload has **no floor/ceiling/variance** | Enumerated all **92 distinct fields** across all 9,419 entries of `/projections/nfl/regular/2026/1`. The only regex matches for floor/ceiling/variance are `pts_allow`, `yds_allow` and the defensive *points-allowed bucket* flags (`pts_allow_28_34`) — bucket indicators, not a distribution. Owner's finding confirmed. |
| Sleeper **does** project all 32 team defenses | 32 non-numeric keys (`ARI`…`WAS`) carrying `pts_half_ppr` plus `pts_allow`, `sack`, `int`, `ff`, `fum_rec`, `def_td`, `blk_kick`. |
| **FantasyCalc ranks ZERO defenses** | `/values/current` returns 473 entries: RB 106, WR 156, QB 68, TE 67, PICK 76. No DEF, and no entry whose `sleeperId` is a team abbreviation. |
| Roster 6's DEF slot is empty, and it owns KC | `starters` = `[…, '11563', '0']` — index 10 (DEF) is Sleeper's `'0'` padding. `players` contains `KC`. |
| 14 defenses are unrostered right now | 18 of 32 sit on the league's 10 rosters. |
| Weekly DEF scoring history is real and wide | 2025 W5 ranged **−4.0 (LV) to +20.0 (NO)**. |
| Historical projections are genuinely pre-game | Correlations with actuals are r = 0.21–0.46. A hindsight-regenerated feed would sit near r ≈ 0.9. |

### New data-contract trap, not currently in CLAUDE.md

`/stats/nfl/regular/{y}/{w}` contains **two different kinds of team key**:

- `ARI` — the **team defense**, a real fantasy asset (`pts_half_ppr` ≈ −4…20)
- `TEAM_ARI` — **team offensive totals**, `pts_half_ppr` ≈ **110–120**

Both are non-numeric, so any `!id.isdigit()` test that means "this is a defense"
silently sweeps in a 110-point row. The shipped `computeDefenseRankings` is
**safe by accident**: `TEAM_ARI` is absent from the player DB (verified), so its
`playerDB[id]` lookup drops it. Anything new touching defenses must exclude the
`TEAM_` prefix explicitly. This belongs in CLAUDE.md's Critical stats note if
any DEF work proceeds.

---

## 2. A live bug that blocks question 4 entirely

`FreeAgentDrawer.jsx:17-18` builds the waiver list from the projections payload
and then gates every row on FantasyCalc:

```js
const fc = fcPlayerMap[id]
if (!fc) return null
```

FantasyCalc ranks no defenses (§1). Therefore **every defense is dropped**.
Reproduced against live data with the component's exact logic:

```
DEF slot rows returned by FreeAgentDrawer:  0
WR  slot rows returned (control):          25
Unrostered DEFs Sleeper projects:          14   (LV 7.66, TEN 7.32, DAL 6.82 …)
```

So today: the DEF slot is empty, it is the one row the Optimizer marks "Tap to
fill", and the drawer behind that tap renders *"No free agents with projections
this week."* — while Sleeper is publishing projections for 14 available
defenses. `League › Free Agents` has the same blind spot by a different route:
`FreeAgentsView.jsx:151` filters to `['QB','RB','WR','TE']`.

This is a shipped defect, not a missing feature.

---

## 3. Question 1 — multiple projection sources

### Availability and licensing

| Source | Reachable server-side? | Licence / ToS reality |
|---|---|---|
| **Sleeper** | yes (in use) | No published redistribution grant; documented ≤1000 calls/min. Already the app's backbone. |
| **ESPN** `lm-api-reads.fantasy.espn.com` | **yes — verified**, 691 KB JSON, 1,536 players with `statSourceId: 1` (projection) blocks for 2026 W1 | **Undocumented/unofficial.** The documented-looking `fantasy.espn.com/apis/v3/...` path now 302s to a marketing page (a plain `curl` returns HTTP 200 with the body `Redirecting` — easy to mistake for success). ESPN's Terms prohibit automated collection and redistribution. |
| **nflverse** | yes (`player_stats.csv`, 33 MB) | CC-BY — the only cleanly licensed option. But it publishes **actuals and historical** data; `ff_opportunity`, `ff_playerids` and `projections` release paths all **404**. It is not a forward-projection source. *(Caveat: I could not enumerate every release tag — the GitHub API is scoped in this session — so this rests on probed paths, not a full listing.)* |
| FantasyPros / Yahoo / CBS | not probed | Paid API key / OAuth respectively; neither permits republishing. |

The architectural point matters more than the availability one. The existing
pipelines publish *headlines with attribution links* (news) and *FantasyCalc-derived
aggregates* (values). Force-pushing a third party's proprietary projections to a
**public** branch is materially different — it is redistribution, and it would be
the first pipeline in this repo doing it.

### Would a blend even help? — H1, disconfirmed

Tuned on 2022–24, evaluated once on 2025, blending Sleeper with each player's own
trailing form:

```
tuned:   k = 5 prior weeks, w = 0.90 on Sleeper
holdout: Sleeper MAE 5.236 → blend 5.222   (gain 0.013 pts)
guard:   TE −0.005, DEF −0.024  ← blend is WORSE for two positions
```

Predicted ≥ 0.20, disconfirmation floor 0.10. **Result 0.013, and the guard
failed.** Sleeper's projection already absorbs recent form.

### The ceiling — why no source can rescue this

A predictor that *cheats*, knowing each player's full-season average in advance,
is an upper bound on any honest pre-game estimate:

| pos | Sleeper MAE | hindsight MAE | max possible improvement |
|---|---|---|---|
| QB | 6.273 | 5.435 | **13.4%** |
| WR | 4.979 | 4.649 | **6.6%** |
| TE | 4.262 | 4.064 | **4.6%** |
| RB | 5.341 | 5.106 | **4.4%** |
| DEF | 4.491 | 4.464 | **0.6%** |

Everything a second, third or tenth source could ever buy lives inside those
percentages. Weekly fantasy scoring is mostly irreducible noise.

Consistent with that ceiling: **ESPN and Sleeper agree at r = 0.966** across 347
matched players (mean absolute difference 1.13 pts). Two near-identical
predictors do not make a meaningfully better ensemble.

### The one real, persistent bias — and why it still doesn't matter

Sleeper over-projects QBs **every season**: +3.80, +2.19, +1.77, +2.85 (2022–25).
ESPN's largest disagreements run the same direction (Purdy −4.6, Darnold −4.6,
Caleb Williams −4.3), suggesting ESPN is better calibrated on QBs.

Tempting in Superflex — the SFLX slot compares a QB against RB/WR/TE. So I tested
it, learning the bias on 2022–24 and replaying **this league's real 2025 lineups
through the shipped `selectOptimalStarters`**:

```
140 team-weeks (14 weeks × 10 rosters), scored on ACTUAL points
  Sleeper-projection lineup : 131.95 pts/team-week
  bias-corrected lineup     : 131.94 pts/team-week   (−0.006)
  lineups actually changed  : 2/140 (1.4%)
```

Within-position ordering is unchanged by a within-position constant, and QBs win
the SFLX slot on merit anyway. **H2 disconfirmed.**

**Verdict on Q1: don't build it.** It is the most expensive option (a new
pipeline, a new licensing posture) and the measured ceiling on its benefit is
~5% of an error that is itself mostly noise.

---

## 4. Question 2 — boom/bust probability

### Is volatility even a stable trait? — H4, mixed

Split-half correlation of residual volatility within a player-season:

| pos | n player-seasons | r |
|---|---|---|
| WR | 312 | **0.357** |
| RB | 209 | **0.235** |
| DEF | 128 | 0.136 |
| TE | 105 | 0.062 |
| QB | 131 | 0.054 |

Pooled r = 0.260, and **0.231 after removing position means** — so it is mostly a
genuine per-player signal, not a position artifact. Predicted ≥ 0.20: **met for
WR and RB, failed for QB, TE and DEF.**

So boom/bust is *learnable*, for two positions. The next question is whether it
is *useful*.

### Does it change a lineup for the better? — H5, no

Coin-flip slots (top two options within 1.5 projected points) are **21.9% of all
slots** — common enough to matter. I applied the textbook rule: as an underdog
take the higher-variance option, as a favourite the lower-variance one, using
causally-estimated volatility (prior weeks only, shrunk toward the position mean).

Realized 2025 wins: 70 → 68 (n = 140, well inside noise). So I measured it the
powerful way instead — expected win probability via fixed-seed Monte Carlo
(mulberry32 + Box–Muller, the `playoffOdds.js` pattern), 4,000 sims per team-week:

```
baseline (max projection) : 49.99%
variance-aware tiebreak   : 49.47%
                    delta : −0.52 pct pts  →  −0.07 wins per season
```

And the steelman — restricting to genuinely lopsided matchups, where swinging for
variance is supposed to pay — is **negative at every threshold**:

```
min |projected margin|   0     5     10    15    20    25 pts
delta in win probability −0.59 −0.46 −0.58 −0.67 −0.35 −0.27 %
```

Mechanism: the tiebreak trades a *certain* mean loss for a *tail-only* variance
gain, and at these margins that trade never clears.

### What variance IS good for — the surviving, and best, idea

The distribution's real job is not picking starters. It is **saying how much to
believe the recommendation you already made.** Residual sd per player is 5.6–7.3
points, so a "+2 point upgrade" is inside the noise — and the app currently
presents it with the same confidence as a +9 one.

Every same-slot pair, four seasons, **N in the hundreds of thousands**:

**FLEX-eligible (RB/WR/TE) — "start the higher-projected player" is right:**

| projection gap | pairs | right | avg realized gain |
|---|---|---|---|
| 0–1 pts | 124,433 | **52.0%** | 0.47 |
| 1–2 pts | 110,582 | 56.9% | 1.41 |
| 2–3 pts | 95,400 | 61.2% | 2.39 |
| 3–4 pts | 81,785 | 65.3% | 3.36 |
| 4–5 pts | 69,627 | 69.4% | 4.32 |
| 5–8 pts | 125,765 | 74.7% | 5.95 |
| 8–12 pts | 51,487 | 82.5% | 8.73 |
| 12+ pts | 6,947 | **87.2%** | 12.18 |

Monotone, huge N, and it holds for QB and DEF too. This turns
*"START Player X (+2.3 pts)"* into *"**61% likely to be the right call**"* — and
tells you that a sub-1-point "upgrade" is a coin flip that isn't worth a
notification.

The same pattern appears in this league's own 2025 moves (n = 145 recommended
swaps): swaps projected under 3 points realized **negative** average gain, while
those projected 3–5 hit 71% and 5+ hit 89%. Small n per bin, so the large-N
table above is the load-bearing evidence — but they agree.

**Verdict on Q2: kill "boom/bust score"; build the calibration curve.** It needs
no new data source, it is derived from a corpus this session already assembled,
and it is exactly the kind of thing Sleeper will never tell you about its own
numbers.

---

## 5. Question 3 — free agents held to the same standard

### The two surfaces answer different questions, and neither answers both

- **`League › Free Agents`** ranks by **FantasyCalc dynasty value** and shows **no
  weekly projection at all**.
- **`Lineup › Waiver options`** shows projection *and* value — but drops anyone
  FantasyCalc doesn't rank (§2).

Live 2026 W1, across 143 available skill players, the two orderings correlate at
only **r = 0.427**, and the top-10 lists share **5 of 10**. Three of the current
dynasty top 10 project **0.0 points** (Fernando Mendoza, Jordyn Tyson, Ty
Simpson — rookies who won't play). Sorting a *waiver* list by dynasty value puts
players who cannot score at the top.

### Can we predict breakouts better than Sleeper? — H6, disconfirmed

Sleeper's stats payload carries genuinely rich usage: `off_snp`, `tm_off_snp`,
`rec_tgt`, `rec_rz_tgt` (red-zone targets), `rush_att`. The classic waiver thesis
is that a snap-share spike front-runs the projection. Waiver-tier players
(next-week projection < 10), trained 2022–24, evaluated on 2025:

```
proj                              MAE 3.652
proj + snap-share delta           MAE 3.653
proj + snap share                 MAE 3.635
proj + delta + share + tgt + rush MAE 3.626   (gain 0.026)
```

Predicted ≥ 0.15, floor 0.05. **Result 0.026, and the share-delta coefficient
flips sign between specifications** — the exact instability the pre-registration
named as disconfirming. Sleeper already prices usage in.

**Verdict on Q3: PARTLY SUPERSEDED — see R2.** The presentational gap is real,
but "not predictive" was too strong: 79% of waiver breakouts arrive unflagged.
Original reasoning follows.

**Original verdict: the gap is presentational, not predictive.** The additive move
is to give the Free Agents view its missing second axis — the weekly projection
next to the dynasty value, plus the roster context the app uniquely has
(`recommendations.js` already computes replacement level and deficits, but scores
purely on dynasty value). "Would start for you this week *and* holds dynasty
value" is a claim Sleeper cannot make, because Sleeper has no idea what your
other ten teams look like. Do **not** build a usage-based breakout model.

---

## 6. Question 4 — defense streaming

### A better DEF model? — H3, disconfirmed

Sleeper's DEF projection is its weakest (r = 0.213). The obvious replacement is
opponent quality: how many fantasy points opposing defenses have scored against
this week's opponent, season-to-date. Trained 2022–24, evaluated on 2025:

| predictor | holdout r | MAE | streaming top-1 |
|---|---|---|---|
| Sleeper projection | **0.268** | 4.583 | **11.39 pts/wk** |
| opponent-allowed only | 0.155 | 4.717 | 7.83 |
| proj + opponent-allowed | 0.254 | 4.565 | 10.28 |
| proj + opponent + home | 0.257 | 4.570 | 10.28 |

**Adding opponent context makes it worse.** Sleeper's DEF projection already
encodes matchup; my feature is a noisier version of what's inside it.

### But the streaming edge is real, and the app can't act on it

Decisions made on **projection only**, scored on actuals, this league's real 2025
rosters and weekly ownership, all 10 teams:

```
n = 136 team-weeks
  actually started          8.22 pts/wk
  best defense already owned 8.29 pts/wk
  stream best AVAILABLE      9.13 pts/wk

  gain +0.91 pts/wk   95% CI [+0.11, +1.72]   t = 2.22   (significant at 95%)
  over a 14-week season: +12.8 points
```

Modest but statistically real — and note *where* it comes from: not from a
cleverer model, but from **considering the 14 defenses the app never displays.**
Sleeper's own number, on players the app hides, is the entire edge.

**Verdict on Q4: SUPERSEDED — see R1.** The streaming gain below is a
single-season artifact that does not replicate; the bug is still worth fixing.

---

## 7. Ranking, and where I'd start

| # | Item | Evidence | Effort | Verdict |
|---|---|---|---|---|
| **1** | **Fix the DEF blind spot.** Stop gating the waiver drawer on FantasyCalc; resolve unranked players (DEF included) from the player DB, as every other surface already does per rule 7. | Live: 0 rows vs 14 available. +0.91 pts/wk, CI excludes 0. | **Very low** — a fallback in one `map`, plus DEF in the Free Agents filter. | **Start here.** A shipped bug, on a live empty slot, with a measured payoff. |
| **2** | **Confidence on every recommendation.** Ship the calibration curve as a constant table: each move card reads "61% likely to be right"; sub-1-point moves stop being presented as moves. | N > 500k pairs, monotone 52% → 87%, holds for QB and DEF. | **Low–moderate** — a lookup table plus copy; the numbers are already computed. | **Do this second.** Highest ratio of "says something Sleeper can't" to cost. |
| **3** | **Free Agents' missing second axis** — weekly projection alongside dynasty value, with roster-relative framing. | Orderings correlate only 0.427; 3 of the dynasty top-10 project 0.0. | **Moderate** — new data into an existing view. | Worth doing; do it after 1 and 2. |
| **4** | Multi-source projections (Q1) | Ceiling 0.6–13.4%; ESPN vs Sleeper r = 0.966; blend gain 0.013. | **High** — new pipeline, redistribution posture. | **Don't build.** |
| **5** | Boom/bust score (Q2, as originally framed) | Volatility persists only for WR/RB; variance tiebreak worth **−0.07 wins/season**, negative at every margin. | Moderate | **Don't build.** Its useful half is item 2. |
| **6** | Usage-based breakout model (Q3) | MAE gain 0.026, coefficient signs unstable. | Moderate | **Don't build.** |

**[SUPERSEDED — see R5 for the corrected ranking.]** **Start with #1.** It is the smallest change, it is a defect rather than a
feature, the owner's DEF slot is empty *right now* with Week 1 five days out, and
it is the only item with a statistically significant measured payoff. #2 is the
one that actually changes what the app is — it makes the Optimizer honest about
its own confidence, which no competitor does.

### What remains genuinely uncertain

- **Item 2's threshold copy is not yet calibrated per-slot.** The curve is
  measured across same-position pairs; the app's real decisions are slot-fills
  where the alternatives are sometimes cross-position. *Experiment that resolves
  it:* rerun the pairing restricted to actual FLEX/SFLX slot alternatives from
  the 2025 replay, and check the bins still sit within ~2 points of the table.
- **The DEF result is one season, n = 136, CI [+0.11, +1.72] — the lower bound is
  near zero.** *Experiment:* extend the streaming replay to 2023 and 2024 via the
  `previous_league_id` chain; the corpus is already cached and the chain is
  verified two hops back (2025 → `1053439750847287296`).
- **Whether ESPN's `lm-api-reads` host is stable** is unknown; the documented path
  already broke. Irrelevant unless Q1 is revived, which I don't recommend.

---

## 8. Pre-registration (written before each run)

| H | Hypothesis | Predicted | Measured | Verdict |
|---|---|---|---|---|
| H1 | trailing-form blend beats Sleeper | ≥ 0.20 MAE, floor 0.10 | **0.013**, guard failed | **disconfirmed** |
| H2 | accuracy gain changes lineups | ≥ 1 pt/week | **−0.006**, 1.4% changed | **disconfirmed** |
| H3 | opponent model beats Sleeper on DEF | r ≥ 0.25, MAE ≤ | r 0.254 vs **0.268** | **disconfirmed** |
| H4 | volatility is persistent | within-pos r ≥ 0.20 | WR 0.357, RB 0.235; QB/TE/DEF < 0.14 | **partial** |
| H5 | coin-flip slots are common enough | ≥ 10% of slots | **21.9%** | supported |
| H5b | variance tiebreak helps | positive Δ win prob | **−0.52 pct pts** | **disconfirmed** |
| H6 | usage adds signal for waivers | ≥ 0.15 MAE, floor 0.05 | **0.026**, signs flip | **disconfirmed** |

### One mechanism explains all seven

**Sleeper's weekly projection is already a competently-built model that absorbs
recent form, usage and matchup — and weekly fantasy scoring is dominated by
variance that no pre-game estimate can remove.** That single sentence predicts
H1, H2, H3 and H6 failing; predicts the small ceiling; predicts ESPN agreeing at
r = 0.97; and predicts that the profitable moves are the two that *don't* try to
out-predict Sleeper — showing data it publishes but the app hides (DEF), and
stating how much to trust the number (calibration).

The one observation this does **not** cover, disclosed rather than explained away:
QB volatility barely persists (r = 0.054) while WR volatility clearly does
(0.357). I have no mechanism for that asymmetry; it does not affect any
recommendation above, since neither item 1 nor item 2 uses per-player volatility.

### Method notes and limits

- 221,483 player-weeks (2022–25) built from `/stats` + `/projections`; 20,791 carry
  both a projection and an actual at the startable threshold.
- Every tuned parameter was fit on 2022–24 and evaluated **once** on 2025.
- Position comes from the **current** player DB, so a player who changed position
  since 2022 is mislabelled historically. Rare, and it cannot favour any
  hypothesis over another.
- **One contamination caught and fixed mid-investigation:** the first DEF
  streaming pass chose between "best owned" and "best free" by *actual* points,
  inflating the gain to +3.08 pts/wk. Corrected to decide on projection only,
  which is the +0.91 figure reported here. The uncorrected number appears
  nowhere in this note's conclusions.
- Nothing in `src/` was modified. `npm test` 152/152, `npm run lint` clean.
