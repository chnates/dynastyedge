# DynastyEdge — Project Status, August 2026

**Date:** 2026-08-08. **Tree:** `main` at `d471b86`.
**Purpose:** a dated snapshot of where the project actually is — what's
shipped, what's closed, and what the calendar is about to force. Durable
architecture facts live in CLAUDE.md; this file is the perishable layer, kept
in `docs/` deliberately so it can't rot inside the doc of record.

> **Looking for "what's next?" → `docs/open-items.md`.** That is the *living*
> backlog with trigger conditions, edited in place forever. This file is a
> point-in-time snapshot and will be superseded; open work must not live here
> alone. The two items §4 and §5 describe are tracked there as **OPEN-2** and
> **OPEN-1**.

---

## 1. Shipped surface

18 documented features, all live: The Edge (home/briefing) · Roster + Picks ·
Trade Partner Finder · Trade Analyzer · Lineup Optimizer · League Overview ·
League Activity · Market Movers · Watchlist · Lineup Efficiency · Draft
(Board + Tracker) · Manager Scouting · Pick Trade Calculator · Playoff Odds ·
News · Global Search · Dynasty Trajectory · Sign-in & Identity. Plus the
shared recommendation engine (`utils/recommendations.js`) behind Action Items,
Recommended Pickups, and the Analyzer's package suggestions.

The Navigation Refactor is **complete** (all three phases: consolidation →
`/my-team` + `/league` URL rename with full redirects → the "Primetime
Blackout" visual pass). That section of CLAUDE.md is now a historical record,
not a plan.

## 2. The July 2026 repo review is fully closed

`docs/repo-review-2026-07.md` shipped a ranked backlog B1–B11. **All eleven
landed.** See that file's status banner for the item-by-item mapping and for
the findings deliberately left open (accepted risk, not oversight).

The two guardrails that didn't exist in July now do: a zero-dependency
`tests/` suite on `node:test` (13 files, 107 tests) and an ESLint 9 flat
config, both enforced by `ci.yml` on every branch push/PR and by `deploy.yml`
before anything publishes.

## 3. Where the season actually is

Verified against `/state/nfl` and the league endpoints on 2026-08-08:

| Fact | Value | Source |
|---|---|---|
| NFL `season_type` | `pre` | `/state/nfl` |
| Season | 2026, `display_week` 1 | `/state/nfl` |
| League status | `pre_draft` | `/league/{id}` |
| 2026 rookie draft | **not yet held** — 0 picks, `last_picked: null`, `start_time: null` | `/draft/1313933520720138240/picks` |
| Draft order | set (10 teams, 4 rounds, linear) | `/league/{id}/drafts` |
| 2026 picks traded | 22 of 40 | `/league/{id}/traded_picks` |
| Games played | none (all rosters 0-0) | `/league/{id}/rosters` |

Two consequences:

1. **The rookie draft is imminent and unfired.** It is the Draft section's one
   live moment per year, and with 22 traded picks it leans hard on pick
   ownership resolution and slot pricing. Rehearsed 2026-08-08 by replaying
   the real 2025 draft through the Tracker
   (`node scripts/dev/replay-live.mjs --scenario draft`).
2. **The app is still in offseason mode**, but the in-season branches are no
   longer unexercised. Everything gated on `season_type === 'regular'` —
   Lineup Optimizer, matchup quality, weekly projections, the deadline banner,
   League Overview matchups, and Playoff Odds' *active* (simulating) state —
   is still hidden in the live app, but is now driven end-to-end by
   `scripts/dev/replay-live.mjs` and pinned by tests.

   **Doing that on 2026-08-08 found three live-API contract breaks** that the
   July review's code-reading audit had missed (it flagged exactly this risk
   in unverified-hypotheses item 5): the schedule endpoint's base URL *and*
   field names were both wrong (which would have taken the Lineup Optimizer
   down for the entire season, since it renders `ErrorState` before its
   offseason check), `/league/{id}/drafts` omits `slot_to_roster_id` (which
   silently disabled the Draft Tracker's whole live path), and weekly stats
   carry no `pos`/`opp`/`tm` (so matchup quality had never worked). All three
   are fixed; detail in `docs/open-items.md` §1.

## 4. Known season-rollover item

`PICK_YEARS = ['2026', '2027', '2028']` is a hand-maintained constant, and
`useSleeperDraft`'s `DRAFT_SEASON = PICK_YEARS[0]` points the Draft Tracker at
it. Once the 2026 rookie draft completes and those picks are spent, the
constant needs rolling to `['2027', '2028', '2029']` or the app will keep
showing a dead season and never surface the new third year. **Not yet stale —
do not roll it before the draft runs.** Documented in CLAUDE.md's Constants
File section.

## 5. Known issue found this session — FAAB scale mixing (not yet fixed)

The league's FAAB budget changed **$100 → $1000 for 2026**.
`useLeague` reads it from league settings correctly, so roster-level FAAB
display is fine. But `managerAnalysis.js`'s `buildFaabStats` aggregates **raw
dollars across seasons with no budget normalization**, which breaks three
things as 2026 waiver spend accumulates:

| Symptom | Mechanism |
|---|---|
| "Value / $100 FAAB" collapses ~10× for active managers | `valuePer100 = valueAcquired / dollars × 100`, denominator now 10× larger |
| "Aggressive bidder" / "Bargain hunter" chips misfire | `avgBid` mixes $100- and $1000-scale bids, compared against a mixed `leagueAvgBid` |
| Coaching gate trips 10× too easily | `me.faab.dollars >= 20` meant "spent ≥20% of budget"; on the new scale that's 2% |

**Fix:** normalize each bid to percent-of-budget using that season's
`waiver_budget` before aggregating. **Deliberately not done in this pass** — it
is a behavior change needing its own commit and real-data verification, and
there are only 11 2026 waiver claims so far to verify against. Documented in
CLAUDE.md Feature 11.

## 6. Open research

The forward map is `dynastyedge-research-frontier` (Items 1–5), plus
`dynastyedge-model-quality-campaign` for calibration. Almost all of it is
gated on live season data that does not exist yet — Week 1 starts that clock.

**Item 2 (FAAB bid recommender) is the exception** — it moved *open →
measured* this session. Its blocking question is resolved (Sleeper *does*
return failed waiver claims with intact bids), but the follow-on finding
matters more: **`status: failed` is not "outbid"** — 81% of failed claims sit
in a waiver run where the same manager also won, i.e. they are batch/roster-
capacity casualties. Genuine head-to-head auctions are rarer than expected (81
contested of 238 clean), the pre-registered acceptance bar failed *and was
mis-specified*, and a corrected rule spec now exists. Full write-up:
`docs/analysis/faab-bid-corpus-2026-08.md`; re-runnable via
`node scripts/dev/faab-corpus.mjs`. The recommender itself remains under
CLAUDE.md's **Future Features (Do Not Build Yet)** — research only until an
explicit owner ask.

---

## 7. Maintenance

Supersede this file with a new dated snapshot rather than editing it in place
once its facts age (a new season, a completed draft, a closed research item).
**Before superseding it, check that every open item it mentions is already
tracked in `docs/open-items.md`** — that list is the one that persists.
Re-verify §3 with:

```bash
curl -s 'https://api.sleeper.app/v1/state/nfl'
curl -s 'https://api.sleeper.app/v1/league/1313933520715907072' | head -c 400
curl -s 'https://api.sleeper.app/v1/draft/1313933520720138240/picks' | head -c 200
```

Re-verify the fragile API contracts (they changed once already, silently) with
the three commands in `docs/open-items.md` §1.
