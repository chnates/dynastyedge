# DynastyEdge — Project Status, August 2026

**Date:** 2026-08-08. **Tree:** `main` at `d471b86`.
**Purpose:** a dated snapshot of where the project actually is — what's
shipped, what's closed, and what the calendar is about to force. Durable
architecture facts live in CLAUDE.md; this file is the perishable layer, kept
in `docs/` deliberately so it can't rot inside the doc of record.

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
`tests/` suite on `node:test` (10 files) and an ESLint 9 flat config, both
enforced by `ci.yml` on every branch push/PR and by `deploy.yml` before
anything publishes.

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
   ownership resolution and slot pricing.
2. **The app is still in offseason mode.** Everything gated on
   `season_type === 'regular'` — Lineup Optimizer, matchup quality, weekly
   projections, the deadline banner, League Overview matchups, and Playoff
   Odds' *active* (simulating) state — is hidden and has never executed
   against live regular-season data. The July review flagged exactly this in
   its unverified-hypotheses appendix (item 5): those branches were audited by
   code-reading only.

## 4. Known season-rollover item

`PICK_YEARS = ['2026', '2027', '2028']` is a hand-maintained constant, and
`useSleeperDraft`'s `DRAFT_SEASON = PICK_YEARS[0]` points the Draft Tracker at
it. Once the 2026 rookie draft completes and those picks are spent, the
constant needs rolling to `['2027', '2028', '2029']` or the app will keep
showing a dead season and never surface the new third year. **Not yet stale —
do not roll it before the draft runs.** Documented in CLAUDE.md's Constants
File section.

## 5. Open research

The forward map is `dynastyedge-research-frontier` (Items 1–5), plus
`dynastyedge-model-quality-campaign` for calibration. Almost all of it is
gated on live season data that does not exist yet — Week 1 starts that clock.

**Item 2 (FAAB bid recommender) is the exception**, and its blocking question
was resolved this session: Sleeper *does* expose failed waiver claims with
their bid amounts, so the losing side of the auction is observable. See
`docs/analysis/faab-bid-corpus-2026-08.md`. The recommender itself remains
under CLAUDE.md's **Future Features (Do Not Build Yet)** — research only until
an explicit owner ask.

---

## Maintenance

Supersede this file with a new dated snapshot rather than editing it in place
once its facts age (a new season, a completed draft, a closed research item).
Re-verify §3 with:

```bash
curl -s 'https://api.sleeper.app/v1/state/nfl'
curl -s 'https://api.sleeper.app/v1/league/1313933520715907072' | head -c 400
curl -s 'https://api.sleeper.app/v1/draft/1313933520720138240/picks' | head -c 200
```
