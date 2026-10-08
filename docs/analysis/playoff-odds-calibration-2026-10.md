# Playoff odds and lineup confidence — are the percentages honest? (2026-10)

**Open item:** `docs/open-items.md` §0 #11 (OPEN-5, first half)
**Script:** `scripts/dev/odds-calibration-backtest.mjs`
**Status:** §2 pre-registered 2026-10-08, **before any replay was run**. Results follow in §3 onward.

---

## 2. Pre-registration (written before looking at any result)

### What is being tested

Two percentages the app shows as fact:

1. **Playoff odds** (League › Playoffs; and the Buyer / Seller label that feeds
   Trade Partners, the Analyzer's win-window layer and Today). Question: when
   the model says 70%, do teams make it about 70% of the time?
2. **Lineup confidence** (Squad › Lineup: *"61% likely to be the right call"*).
   Its curve was measured on 2022–25. Question: does it hold on 2026, a season
   it has never seen?

### Playoff odds — corpus and method

- **Seasons:** 2023, 2024, 2025 — every completed season of this league (the
  `previous_league_id` chain). All three: 10 teams, 6 make it, playoffs start
  Week 15, no divisions, no median game — the same format as 2026.
- **The app's code, not a copy:** each prediction is
  `buildPlayoffOutlook` (`src/utils/playoffOdds.js`) fed the real matchups with
  every week after the cutoff blanked to "not yet played" — exactly what the
  app sees mid-season. Standings (wins, points-for) are rebuilt from the
  matchups up to the cutoff.
- **Cutoffs:** after k completed weeks, k = 0 … 13. **Primary window: k = 2 …
  12** — after Week 2 through after Week 12, i.e. the trade-deadline window,
  when the odds drive buy/sell advice. 3 seasons × 10 teams × 11 cutoffs =
  **330 predictions**.
- **Truth:** the six teams in each season's real winners bracket
  (`/league/{id}/winners_bracket`). The standings rebuilt from matchups must
  name the same six; any disagreement is reported, not silently resolved.
- **Known gap, stated up front:** past rosters' dynasty values do not exist,
  so the **roster-strength prior is flat** in this replay (every team starts
  at the league-average 115 pts). The app's real prior is informative. So this
  replay grades the *score-blending and simulation*, not the preseason prior;
  the prior's share of the estimate is 4/(k+4) — 67% after Week 2, 25% after
  Week 12. Early-window results are therefore a **lower bound** on the app's
  real skill if the prior is good, and say nothing if it is bad.

### Playoff odds — the questions and their pass rules

- **Q1. Better than knowing nothing?** Baseline: "every team 60%" (6 of 10).
  Its Brier score is 0.240. **Pass:** the model's pooled Brier (primary
  window) is below 0.240 **and** the 95% interval on the difference excludes
  zero.
- **Q2. Do the scores add anything beyond the standings?** Baseline: the same
  simulation with every team given identical scoring (record + remaining
  schedule only). **Pass:** model Brier below it, 95% interval on the
  difference excludes zero.
- **Q3. Reliability.** Five buckets (0–20 … 80–100%): n, average prediction,
  hit rate, 95% Wilson interval. **Wording rule:** with 30 team-seasons the
  word "calibrated" is not used. If every bucket's interval covers its average
  prediction the finding is "consistent with calibration, not certified"; a
  bucket whose interval misses names the direction (over- or under-confident).
- **Q4. The labels that drive advice.** Buyer (≥ 70%), On the bubble,
  Seller (< 35%): how often each label's teams made the playoffs, primary
  window.
- **Intervals:** predictions within one team-season share one outcome, so
  intervals for Q1/Q2 come from a **bootstrap over team-seasons** (30 blocks,
  10,000 resamples, fixed seed), never from counting team-weeks as
  independent. Q3/Q4 Wilson intervals are naive (too narrow) and labelled so.
- **Reported, not scored:** Brier by cutoff week (k = 0 … 13), and per season.

### Lineup confidence — method and pass rule

- **Data:** 2026 Weeks 1–4 (all completed weeks), Sleeper projections and
  actual half-PPR points, rebuilt exactly as `scripts/dev/optimizer-signal-backtest.mjs`
  §3 builds the shipped curve (same-week FLEX-eligible pairs, both projected ≥ 5).
- **Pass:** in every gap bin with ≥ 1,000 pairs, the 2026 hit rate is within
  **±5 points** of the shipped `CONFIDENCE_CURVE`, and the 2026 curve rises
  across bins (with one non-rise allowed among bins under 2,000 pairs).
  Pairs within a week are correlated, so the ±5-point band — not a naive
  interval — is the bar.
- **Known gap, stated up front:** Sleeper rewrites projections in place
  (optimizer study R3), so "the projection" is the last one Sleeper held, not
  necessarily the one on screen before kickoff. This is the same bias the
  shipped curve carries; 2026 is out-of-season data, not a fix for it.

### What this pass may and may not change

- **No model constant changes from this pass.** `PRIOR_GAMES`, the variance
  model and the 70% / 35% lines are not retuned: a flat-prior replay cannot
  tune shrinkage toward a prior it does not contain, and three seasons are
  too few (the campaign's fence).
- **Allowed outcomes:** (a) a plain statement of measured accuracy in the
  Playoffs page's "How this works" and in CLAUDE.md, if the results support
  one; (b) recording the app's real weekly odds (with its real prior) so
  §0 #14 can grade 2026 out of sample; (c) a named follow-up, if a result
  points at a specific defect.
