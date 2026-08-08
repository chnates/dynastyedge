# DynastyEdge — Open Items

**This file is the answer to "what's next?"** It is a **living list**, not a
dated snapshot: unlike `docs/project-status-2026-*.md` (which gets superseded
by a newer dated file), this one is edited in place forever. Anything deferred
with a reason belongs here, or it will be forgotten.

**Last reviewed:** 2026-08-08.

**How to use it:**
- Each item states its **trigger** — the condition that makes it ready. An item
  whose trigger hasn't fired is **not** ready work; doing it early is a bug
  (see OPEN-2, where acting early actively breaks the app).
- Items marked **[owner ask required]** must not be built without an explicit
  request, per CLAUDE.md's Future Features gate.
- When you close an item, move it to §3 with the date and commit. Don't delete
  it — the record is why nobody re-litigates it.

---

## 1. Active

### ACTIVE-1 — Season-readiness tests (draft day + Week 1)

**Status:** next up. **Trigger:** fired — the rookie draft is imminent and Week
1 is ~5 weeks out (as of 2026-08-08).

The app's entire live/in-season half has only ever been code-read, never
executed against real data (`docs/repo-review-2026-07.md` §4, item 5). Two
one-shot deadlines:

1. **Draft day.** The 2026 rookie draft is set up but unfired (`pre_draft`, 0
   picks, order set). `useSleeperDraft` and the Tracker's live path — polling,
   on-the-clock banner, "N picks until yours", Best Available, in-draft pick
   trades, the completion recap — have never run against a real Sleeper draft.
   It is the Draft section's one live moment per year; there is no second
   chance until 2027. **22 of 40 2026 picks have been traded**, so pick
   ownership resolution and slot pricing carry unusual weight that day.
2. **Week 1.** Everything gated on `season_type === 'regular'` switches on for
   the first time: Lineup Optimizer, matchup quality from live defensive
   stats, weekly projections, the deadline banner, League Overview matchups,
   and Playoff Odds' *active* state (the Monte Carlo has never simulated a
   real remaining schedule).

**First step:** align on test strategy for each before writing anything —
replay a past draft, synthetic fixtures, or a mocked-fetch harness in the style
of `tests/matchupWeeks.test.mjs`. Evidence bar: `dynastyedge-validation-and-qa`.

---

## 2. Deferred — waiting on a trigger

### OPEN-1 — Normalize FAAB stats to percent-of-budget

**Status:** known bug, documented, deliberately not fixed.
**Trigger:** enough 2026 waiver history to verify against — roughly 4–6 weeks
of regular-season waivers. (11 claims existed as of 2026-08-08, far too few.)

The league's FAAB budget changed **$100 → $1000 for 2026**. `useLeague` reads
it from league settings, so roster-level FAAB display is correct. But
`buildFaabStats` (`src/utils/managerAnalysis.js`) aggregates **raw dollars
across seasons with no normalization** (`e.dollars += bid`), so as 2026 waiver
spend accumulates:

| Symptom | Mechanism |
|---|---|
| "Value / $100 FAAB" collapses ~10× for active managers | `valuePer100 = valueAcquired / dollars × 100` — denominator now 10× larger |
| "Aggressive bidder" / "Bargain hunter" chips misfire | `avgBid` mixes $100- and $1000-scale bids against a mixed `leagueAvgBid` |
| Coaching gate trips 10× too easily | `me.faab.dollars >= 20` meant "spent ≥20% of a budget"; on the new scale that's 2% |

**Fix:** normalize each bid to percent-of-budget using that season's
`waiver_budget` before aggregating, then re-express the derived stats
(`valuePer100`, `avgBid`, the tendency thresholds, the `>= 20` gate) on the
normalized scale.

**Why deferred:** it is a behavior change, so CLAUDE.md's same-commit doctrine
plus real-data verification apply — and there is no meaningful 2026 waiver
history to verify against yet. Fixing it blind risks trading a known
distortion for an unknown one.

**Acceptance:** Manager Scouting's FAAB stats and tendency chips are stable
across the 2025→2026 boundary (a manager's efficiency doesn't jump 10× on the
same behavior); `npm test` green; verified against the live league, not
fixtures. Context: `docs/analysis/faab-bid-corpus-2026-08.md`; documented in
CLAUDE.md Feature 11.

### OPEN-2 — Roll `PICK_YEARS` forward after the rookie draft

**Status:** scheduled maintenance. **Trigger:** the 2026 rookie draft completes
**and** its picks are spent.
**⚠ Do NOT do this early** — rolling before the draft runs points
`useSleeperDraft`'s `DRAFT_SEASON = PICK_YEARS[0]` at a draft that doesn't
exist and breaks the Tracker during the one event it's built for.

`PICK_YEARS = ['2026', '2027', '2028']` in `src/constants.js` is a
hand-maintained, season-scoped constant. It drives pick capital across every
roster-derived surface, and `DRAFT_SEASON` reads its first element. Once 2026's
picks are spent it must become `['2027', '2028', '2029']`, or the app keeps
showing a dead season and never surfaces the new third year.

**Acceptance:** pick capital shows 2027/2028/2029 on every surface (roster
badges, TeamCard grids, Trade Analyzer, Pick Trade Calculator); the Draft
Tracker points at the 2027 draft; `npm test` green. Documented in CLAUDE.md's
Constants File section.

### OPEN-3 — FAAB bid recommender **[owner ask required]**

**Status:** research complete, build gated.
**Trigger:** an explicit owner ask, ideally after ~6 weeks of live 2026 waiver
data on the $1000 scale (the first evidence that tests the rule spec without
hindsight).

Research is done: corpus, the "failed ≠ outbid" finding, held-out backtest,
and a proposed two-part rule spec live in
`docs/analysis/faab-bid-corpus-2026-08.md` (re-runnable via
`node scripts/dev/faab-corpus.mjs`). The recommender itself remains under
CLAUDE.md's **Future Features (Do Not Build Yet)**. Note OPEN-1 is effectively
a prerequisite — both need percent-of-budget normalization.

### OPEN-4 — Accepted-risk findings from the July 2026 review

**Status:** recorded as accepted, not oversights. Re-flagging them as new
findings wastes a session. Full detail in `docs/repo-review-2026-07.md`.

- **F12** — client-side news-link scheme validation (defense-in-depth only;
  pipeline-side validation is correct and exploiting it needs repo write
  access).
- **F15** — exact standings ties resolve by roster-array order (vanishingly
  rare with fractional scoring; the code comments the behavior).
- **F16b** — the "↪ flipped" ledger marker needs strictly-greater timestamps,
  so date-less trade pairs miss it (the net-value wash is arithmetic-invariant
  and unaffected).

### OPEN-5 — Model calibration (open research)

**Status:** open. **Trigger:** live regular-season data — Week 1 starts the
clock.

The models are verified *correct* (deterministic, threshold-accurate) but not
verified *accurate*: nobody can yet say whether 72% playoff odds means 72%.
Owned by `dynastyedge-model-quality-campaign`; the multi-season trajectory
back-test additionally needs ~a year of the monthly values archive
(`values-archive.json`, started 2026-07). Related open frontier items (briefing
decision-quality, buy-low timing) are in `dynastyedge-research-frontier`.

---

## 3. Closed

| Item | Closed | How |
|---|---|---|
| July 2026 repo-review backlog B1–B11 | 2026-07/08 | All eleven landed — mapping in `docs/repo-review-2026-07.md`'s status banner |
| Navigation Refactor Phases 1–3 | 2026-07-20 | Consolidation → `/my-team` + `/league` rename → "Primetime Blackout" visual pass |
| Frontier Item 2 blocking question (are losing FAAB bids visible?) | 2026-08-08 | Verified yes; see `docs/analysis/faab-bid-corpus-2026-08.md`. Superseded by OPEN-3 |
