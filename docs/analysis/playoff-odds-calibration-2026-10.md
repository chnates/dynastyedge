# Playoff odds and lineup confidence — are the percentages honest? (2026-10)

**Open item:** `docs/open-items.md` §0 #11 (OPEN-5, first half)
**Script:** `scripts/dev/odds-calibration-backtest.mjs`
**Data:** Sleeper matchups + winners brackets for 2023–25; 2026 Weeks 1–4 projections and stats. Frozen in `docs/analysis/data/odds-calibration-2026-10.json.gz` (read 2026-10-08 01:46 UTC); `--frozen` reproduces every number here
**Status:** §2 pre-registered and committed (`8e09dc9`) **before any replay was run**; measured the same day. **No app change.** Second half of OPEN-5 (the trajectory back-test) waits on `values-archive.json`; the 2026 odds are graded out of sample at §0 #14.

---

## 1. In plain English

**Playoff odds — better than guessing, and the big numbers hold up.** I
replayed the last three seasons week by week through the app's own odds code,
as if each week were "now", and checked the predictions against who actually
made the playoffs.

- **Much better than guessing.** On the standard accuracy score (Brier, lower
  is better) the odds scored **0.148** from Week 2 to the trade deadline, against
  **0.240** for "everybody has a 60% chance". That gap is clear of chance.
- **When the app says Buyer (70%+), believe it:** those teams made it **92%** of
  the time (the app said 94%).
- **The low end is too gloomy.** Teams the app put **under 20%** averaged 7% but
  made it **22%** of the time; teams labelled **Seller** (under 35%) made it
  **24%** of the time, twice what the app said. In a league where 6 of 10 get
  in, a bad start is more survivable than the model thinks. The clearest
  example is your own 2025 team: **12% at 1–3, in the playoffs at 9–4.** This
  rests on only three comebacks in 30 team-seasons, so it is a lean, not a
  proof — but it is the direction to watch.
- **The weekly scores add nothing measurable beyond the standings.** A
  stripped-down version that knows only each team's record and remaining
  schedule scored the same (0.149). That's not a flaw so much as a finding: in
  this league, the record and the schedule are carrying the odds.
- **One honest caveat.** Past rosters' dynasty values no longer exist, so the
  replay could not use the app's "how good is this roster" starting guess. It
  tested everything else. The real 2026 odds, starting guess included, get
  graded when this season ends (§0 #14).

**Lineup confidence — it holds on a season it has never seen.** The "61% likely
to be the right call" figures were measured on 2022–25. On 2026's first four
weeks every figure landed within **one point** of the shipped number (e.g.
2–3 point gap: 60.8% vs 61.2%). The one bin with too few pairs to judge (12+
points) came in higher, not lower.

**What changes in the app:** nothing yet, by design (§2). Two follow-ups are
proposed in §6.

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

---

## 3. Results — playoff odds

Run: `node --import ./scripts/register.mjs scripts/dev/odds-calibration-backtest.mjs --frozen`.

**Truth check.** Every season's real bracket field matched the standings rebuilt
from matchups (wins, then points-for): 2023 and 2024 `[1, 3, 5, 7, 8, 10]`,
2025 `[1, 3, 5, 6, 8, 10]`. The two identical fields are real (different league
ids, different scores).

**Primary window** (after Week 2 … after Week 12): 330 predictions, 30
team-seasons.

| | Brier | difference from model, 95% interval (team-season bootstrap) | Verdict |
|---|---|---|---|
| **Model** | **0.1483** | — | — |
| Always 60% | 0.2400 | model −0.092 [−0.162, −0.010] | **Q1 PASS** |
| Record + schedule only | 0.1494 | model −0.001 [−0.023, +0.023] | **Q2 FAIL** — no measurable gain |

**Q3 — reliability** (Wilson intervals naive: team-weeks are correlated)

| Bucket | n | Avg prediction | Made it | 95% interval | Covers? |
|---|---|---|---|---|---|
| 0–20% | 72 | 6.9% | 22.2% | 14–33% | **No — model too low** |
| 20–40% | 34 | 29.1% | 32.4% | 19–49% | yes |
| 40–60% | 46 | 50.0% | 34.8% | 23–49% | **No — model too high** |
| 60–80% | 38 | 69.2% | 60.5% | 45–74% | yes |
| 80–100% | 140 | 95.6% | 94.3% | 89–97% | yes |

Per the wording rule: **not consistent with calibration at the bottom and the
middle; consistent at the top.** Not certified either way (30 team-seasons).

**Q4 — the advice labels**

| Label | n | Avg prediction | Made it |
|---|---|---|---|
| Buyer (≥ 70%) | 154 | 93.8% | 92.2% (87–95%) |
| On the bubble | 77 | 53.7% | 41.6% (31–53%) |
| Seller (< 35%) | 99 | 12.4% | 24.2% (17–34%) |

**By cutoff** (model / always-60% / record-only): after Week 0 0.239 / 0.240 /
0.239 · Week 1 **0.256** / 0.240 / 0.247 · Week 2 0.186 · Week 3 0.216 / — /
0.204 · Week 4 0.216 / — / 0.207 · Week 6 0.133 · Week 9 0.124 · Week 12 0.086 /
— / 0.070 · Week 13 0.067. After Week 1 the model is **worse than guessing**, the
pattern the campaign's synthetic run predicted (one game already moves the mean
20% of the way while the spread stays fixed).

**By season** (primary window): 2023 0.116 / 0.240 / 0.094 · 2024 0.120 / 0.240 /
0.159 · 2025 0.208 / 0.240 / 0.195. The model beats guessing every season; it
beats record-only only in 2024.

## 4. Results — lineup confidence

2026 Weeks 1–4: 584 startable FLEX player-weeks.

| Gap | Pairs | 2026 | Shipped | Diff |
|---|---|---|---|---|
| 0–1 | 7,841 | 51.4% | 52.0% | −0.6 |
| 1–2 | 7,074 | 57.0% | 56.9% | +0.1 |
| 2–3 | 5,881 | 60.8% | 61.2% | −0.4 |
| 3–4 | 4,640 | 64.5% | 65.3% | −0.8 |
| 4–5 | 4,022 | 68.7% | 69.4% | −0.7 |
| 5–8 | 8,201 | 75.7% | 74.7% | +1.0 |
| 8–12 | 3,882 | 83.5% | 82.5% | +1.0 |
| 12+ | 846 | 95.2% | 87.2% | too few to judge |

**PASS** — every judged bin within ±1.0 point (the bar was ±5), rising
throughout. The projection-rewrite bias (§2) applies to both curves equally;
this does not remove it.

## 5. Exploratory (not pre-registered — read as leads, not findings)

The bottom-bucket miss is three team-seasons, all of which made it:

| Team-season | Lowest odds in the window | Finished |
|---|---|---|
| 2025 roster 6 (Nix Cage) | 12% at 1–3 | 9–4 after Week 13, in |
| 2025 roster 10 | 1% at 2–7 | in at 5–9 |
| 2023 roster 7 | 13% at 4–8 | in at 5–9 |

With 6 of 10 teams qualifying, a 5–9 record got in twice in three seasons. Two
mechanisms are plausible and untested: (1) **the simulation's spread omits
uncertainty about each team's true level** — it draws scores around a fixed
mean, so a team's bad start is treated as better-known than it is (the
campaign's Phase 4 item 2, which predicts both the Week-1 bump and a too-gloomy
tail); (2) the comebacks are ordinary luck at n = 3. Telling them apart needs
the fix tested out of sample, not more replays of these three seasons.

## 6. What this changes, and what is proposed

**App: nothing** (pre-registered). Proposed follow-ups, each needing the
owner's go:

1. **Say it on the Playoffs page.** One line in "How this works": *tested on
   2023–25, teams the model put above 70% made it 92% of the time; teams under
   20% still made it about 1 in 5 times.* This is the campaign's Phase 4 item 1
   and changes no number.
2. **Grade the real 2026 odds with the starting guess included (§0 #14).** The
   replay's gap is the roster-value prior. 2026 can be reconstructed rather
   than recorded: Sleeper's weekly matchups carry each roster's players, and
   `values-consensus.json` holds every day's FantasyCalc values since
   2026-07-09. Verify taxi/IR flags reconstruct before relying on it.
3. **Test the spread fix (Phase 4 item 2) only against 2026**, pre-registered,
   once #14 has the season — never tuned on these three seasons.
