# DynastyEdge — Open Items

**This file is the answer to "what's next?"** It is a **living list**, not a
dated snapshot: unlike `docs/project-status-2026-*.md` (which gets superseded
by a newer dated file), this one is edited in place forever. Anything deferred
with a reason belongs here, or it will be forgotten.

**Last reviewed:** 2026-09-04 (owner approved a four-phase build plan — see
`docs/build-plan-2026-09.md`, now the active work queue).

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

### ACTIVE-3 — the September 2026 build plan (owner-approved 2026-09-04)

**`docs/build-plan-2026-09.md` is the active work queue.** It carries four
phases, each with its own kickoff prompt, verification criteria, and — where the
evidence didn't support building — an explicit decision not to. It came out of
`docs/analysis/optimizer-data-sources-2026-09.md`; read that study's REVISION
block before touching any of it, because two of its original conclusions were
overturned.

- **Phase 1** — surface what the app already has: confidence percentages on
  lineup moves, the DEF free-agent fix, weekly projections in the free-agent
  list, snap share on player profiles. App-only, no pipelines.
- **Phase 2** — news coverage: FantasyPros' feed is dead (HTTP 404) and only
  3 of 25 rostered players appear in the live feed. Pre-registered target: ≥12.
- **Phase 3** — rookie research split into "impact now" vs "long-term stash",
  adding age + athleticism from nflverse and (gated on a key) college
  production. **3c is a hard gate:** if the long-term score doesn't beat draft
  capital out of sample, report the null and stop.
- **Phase 4** — the breakout alert, explicitly labelled experimental in the UI,
  with logging from day one and a Week 10 kill criterion.

**Blocked, owner action:** Phase 3b needs a free CollegeFootballData API key
stored as repo secret `CFBD_API_KEY`. Nothing else in the plan is blocked.

**Do not** re-test multi-source projections, a boom/bust score, weekly defense
streaming, or usage-as-prediction. All four were measured and rejected; §0 of
the plan carries the numbers.

The previously-listed deferred items below are unchanged — every trigger was
re-checked 2026-08-14 and none has fired. The calendar-driven ones (the rookie
draft, OPEN-2; Week 1, OPEN-5) still have no date.

### Verified 2026-08-14 — ACTIVE-2 closed: the rookie-intel pipeline's first run

`rookie-intel.yml` published for the first time on **2026-08-14 11:12Z**, which
fired ACTIVE-2's trigger. All three verification steps pass.

**1 — Feed shape.** `meta` = `{ rookieClass: 440, published: 235, withCapital:
80, withDepth: 234 }`, matching the 2026-08-08 local dry run (~236 / ~80). 22
weekly columns, `2026-03-16` … `2026-08-10`; `asOf: 2026-08-14`; 53,740 bytes
(the ~52KB the pipeline was sized for).

**2 — Market vs Model populates.** Replaying the shipped path under Node
(`buildRookieProspects` → `buildRookieResearch` → `splitDivergence`) against
the live feed + live Sleeper/FantasyCalc: 440 prospects → 235 scored → 71
divergence-eligible (the FantasyCalc-valued subset). **8 undervalued / 7
overvalued** raw at the default `minGap` 5, displayed as 6/6 (`splitDivergence`'s
`limit`). The gap distribution is exactly what the calibration memo predicted
for within-position ranking: median |gap| 2, max 12.

The rendered page agrees value-for-value with the Node replay — Nate
Boerkircher +10, Sam Roush +10, Caleb Douglas +7, Mike Washington +6, Brenen
Thompson +6, Colbie Young +6; Cyrus Allen −12, Malik Benson −6, Justin Joly −6.
Your Targets resolves against real deficits (WR, Contending): Carnell Tate,
Jeremiyah Love, Jordyn Tyson, Fernando Mendoza. No backup tight ends lead the
undervalued list — the shared-points-scale trap the model was built to avoid
stayed avoided on live data.

**3 — Drawer status row.** The **Rookies** row reads `just now · feed 8h`.

Health: `npm ci` → **126/126 tests**, lint clean.

> ⚠ **Capture artifact — do not chase it as a bug.** In that same drawer
> capture, **News and History read `—`** while Rookies resolves, and it persists
> at a 9s settle. It is the screenshot harness, not the app: `screenshot-app.mjs`
> serves external requests with **synchronous** `execFileSync` curl calls, so
> the multi-MB `/players/nfl` fetch blocks Node's event loop past `fetchJSON`'s
> 10s AbortController timeout for the feeds racing it on The Edge. `loadNewsFeed`
> memoizes the *promise* and a failure resolves to `[]` with `newsFeedFetchedAt`
> never set, so the drawer's later call gets the cached empty result and the row
> stays `—` for the session. Discriminator: `/news` renders the feed normally
> (97 fresh items), and the drawer's Refresh button passes `force`. Recorded as
> gotcha 5 in the `dynastyedge-visual-capture` skill.

**Next season's chore** (unchanged): re-run the back-test and reconcile
`DEPTH_VALUE` against its drift output. Combine athleticism stays unused (the
2026 `combine.csv` ships with empty `forty`/`vertical`), and **camp movement
stays displayed-but-not-scored** — but its blocker now has an end date. The
reason it could not be scored was that nflverse's 2025 depth charts begin
2025-08-03, leaving no pre-camp baseline to validate a climb against. The 2026
feed carries weekly columns from **2026-03-16**, so this class is accumulating
exactly that baseline; a camp-movement signal becomes back-testable once the
2026 rookie season's outcomes exist (i.e. during the 2027 pre-draft window).

### ACTIVE-1 — closed

ACTIVE-1 closed 2026-08-08; it is retained
below in full because what it found — three silent live-API contract breaks —
is the durable part, and the re-verification commands are needed again next
season.

### Trigger sweep — 2026-08-14

Re-run against the live API. **None has fired**, so there is still no ready
work beyond the ACTIVE-2 verification above.

| Item | Trigger | State on 2026-08-14 |
|---|---|---|
| OPEN-1 | ~4–6 weeks of 2026 waivers | `/state/nfl` → `season_type: pre`, `week: 1` — no regular-season waivers exist |
| OPEN-2 | 2026 rookie draft done + picks spent | draft still `pre_draft`, **0 picks made**, `start_time: null` |
| OPEN-3 | owner ask + live 2026 waiver data | neither |
| OPEN-5 | Week 1 | still preseason (`season_start_date: 2026-08-06` is *preseason*) |

All four published feeds live and fresh on the day: `news.json` (2026-08-14
19:16Z), `values-history.json` (10:39Z), `trade-values.json` (10:39Z — 172
bytes, correct: it archives only trades completed in the last 8 days, and there
have been none), `rookie-intel.json` (11:12Z, first run).

### Trigger sweep — 2026-08-08

Every deferred item's trigger checked against the live API. **None has fired**,
so there is no ready work. Re-run this sweep rather than re-deriving it.

| Item | Trigger | State on 2026-08-08 |
|---|---|---|
| OPEN-1 | ~4–6 weeks of 2026 waivers | `/state/nfl` → `season_type: pre` — no regular-season waivers exist |
| OPEN-2 | 2026 rookie draft done + picks spent | draft `status: pre_draft`, **0 picks made** — rolling now breaks the Tracker |
| OPEN-3 | owner ask + live 2026 waiver data | neither |
| OPEN-5 | Week 1 | ~1 month out (`season_start_date: 2026-08-06` is *preseason*) |

Health at sweep time: `npm ci` → **107/107 tests**, lint clean. All four
published feeds live — `news.json` (100 items, 3 sources), `values-history.json`
(59 days / 579 players), `trade-values.json`, `values-archive.json`
(2026-07, 2026-08). The three ACTIVE-1 contract fixes still hold (commands in
ACTIVE-1 below; all three returned the expected results).

### Verified 2026-08-08 — exact-slot pick pricing, against a real draft order

**Why this was worth doing once:** the 2026 rookie draft order was only just
set, so `useLeague`'s exact-slot pricing path — and in particular
`buildDraftSlots`' **second** tier — had never run against real data. Until
now the `draft_order` fallback existed only under synthetic fixtures, and it is
the tier that carries the app for the weeks before Sleeper builds the board.

Live state: draft `pre_draft`, `type: linear`, 4 rounds, 22 in-draft traded
picks, 0 picks made, **`start_time: null`** — the draft is imminent but
unscheduled, so the Tracker's one day a year can arrive without warning.

Replaying `useLeague`'s enrichment (`resolvePickOwnership` → `buildDraftSlots`
→ `slotForRound` → `findExactSlotValue`) under plain Node against live Sleeper
+ FantasyCalc:

- **Both slot-resolution tiers agree on all 10 rosters** — `slot_to_roster_id`
  and the `draft_order`-through-`owner_id` fallback produce identical maps.
  The fallback is real-data validated for the first time.
- **All 40 of the 2026 picks priced at their exact slot**; zero fell back to a
  round median. FantasyCalc carries 48 slot-level entries (`DP_0_0` …) plus
  round-level entries for 2026–2029.
- Round-1 slot prices are monotonically non-increasing (7169 → 2581), and pick
  counts reconcile: 40 = 10 teams × 4 rounds.

So slot-accurate pick capital is correct on every roster-derived surface today.

Note for OPEN-2: FantasyCalc already lists 2029 round-level picks, but
`PICK_YEARS` must still not roll until the 2026 draft runs and its picks are
spent.

### Verified 2026-08-08 — draft render rehearsal

The data layer above proves the numbers; this proves the *components render
them*. Both halves were run, because they answer different questions.

**Half 1 — the real 2026 order, no overrides.** Screenshotting the running app
against live APIs, all three slot-consuming surfaces agree with the Node
replay, value for value:

| Surface | Rendered |
|---|---|
| Draft Tracker › My Draft Capital | `1.06 3,413` · `3.06 1,158` · `4.06 870` · `4.10 803` · `Taxi 2/5` |
| My Team › Pick Capital | 2026 as `1.06 · 3.06 · 4.10 (via Ministry Of Touchdowns) · 4.06`; 2027/2028 fall back to `1st…4th` — correct, no order exists for those seasons |
| Trade › Pick Trades | every opponent pick at its exact slot (`1.01` = 7,169, matching FantasyCalc); my own picks correctly absent from "picks you could target" |

**Half 2 — the synthetic walk** (`replay-live.mjs --scenario draft`), covering
the three states that cannot exist yet: **7/7 assertions passed** across
`pre` → `clock` → `mid` → `complete`. On-the-clock banner ("YOU'RE ON THE
CLOCK · 1.04"), Best Available (best overall + top-need), the picks-until-yours
countdown, and the completion recap (team totals, my row in brand red with the
You chip, full results) all render.

> ⚠ **Replay artifact — do not chase it as a bug.** In the `clock`/`mid`
> captures the capital card shows `2.04` and `2.09` with **no value**, while
> `1.04` shows one. Cause: the replay overrides `/league/{id}/drafts`, so
> `useLeague` prices off the 2025 fixture board — but pick *ownership* still
> comes from real 2026 `traded_picks`. The fixture says I hold two 2nd-rounders;
> my real 2026 inventory has none, so `buildMyCapital`'s join on
> `round` + `originalOwner` (`utils/draftLive.js`) misses and falls to
> `value: 0`, which `DraftTracker.jsx:120` renders as blank via
> `{c.value > 0 && …}`. The real-order capture (Half 1) joins all four picks
> correctly — that is the discriminator. Any future replay mixing a fixture
> board with live ownership will show this.

**Remaining gap, honestly stated:** the rehearsal proves the components render
the live path; it does not prove Sleeper will behave on the day. The API
contracts are the fragile part (they changed once already, unannounced) — so
re-run the ACTIVE-1 curl checks above if draft day looks wrong.

### ACTIVE-1 — Season-readiness tests (draft day + Week 1)

**Status:** ✅ closed 2026-08-08 — see §3. Kept here in expanded form because
what it *found* is the durable part.

The exercise was not academic: running it turned up **three live contract
breaks** that months of code-reading had missed, all of which would have fired
for the first time on the two deadlines themselves.

| # | Break | Would have surfaced as |
|---|---|---|
| P0 | `/v1/schedule/nfl/regular/{y}` **404s for every season**; the endpoint lives off `/v1` and uses `home`/`away`, not `home_team`/`away_team` | Unguarded in a `Promise.all`, so Week 1 flipped the Lineup Optimizer to `ErrorState` (rendered *before* the offseason check) — no lineup, all season |
| P0 | `/league/{id}/drafts` **omits `slot_to_roster_id`**; only `/draft/{draft_id}` carries it, and the hook read only the list endpoint | `buildDraftOrder` returned `null` always → no on-the-clock banner, no "N picks until yours", no Best Available, no slot-accurate capital, on the one day they exist |
| P1 | `/v1/stats/nfl/regular/{y}/{w}` carries **no `pos`/`opp`/`tm`** (null in 2022–2026) | `computeDefenseRankings` returned `{}` → every player's matchup quality read ⚪ Neutral forever, silently |

All three are fixed and pinned. The general lesson is worth keeping: **every one
of them degraded silently or was gated behind a flag that had never flipped**,
which is exactly the class of bug a green build and a careful read cannot catch.

**What now guards them**

- `tests/projections.test.mjs`, `tests/draftLive.test.mjs`,
  `tests/sleeperDraft.test.mjs` — suite went 72 → 107.
- `tests/fixtures/draft-2025.json` — the league's real 2025 rookie draft
  (board + 40 picks + 24 traded picks). Truncating its pick list synthesizes
  every mid-draft state, so the live path is tested on real payload shapes.
- `scripts/dev/replay-live.mjs` — drives the real app in headless Chromium
  against a synthetic draft / regular season. Re-runnable any time.

**Re-verify the API contracts before next season** (they are the fragile part —
Sleeper changed them once already, without notice):

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'https://api.sleeper.app/schedule/nfl/regular/2026'   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' 'https://api.sleeper.app/v1/schedule/nfl/regular/2026' # expect 404
curl -s 'https://api.sleeper.app/v1/league/1313933520715907072/drafts' | grep -c slot_to_roster_id # expect 0
```

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
| ACTIVE-1 — season-readiness tests (draft day + Week 1) | 2026-08-08 | Three live contract breaks found and fixed (schedule endpoint, draft `slot_to_roster_id`, stats `pos`/`opp`); 35 new tests (72 → 107) + `scripts/dev/replay-live.mjs`. Detail retained in §1 |
| ACTIVE-2 — Draft › Research: verify the first pipeline run | 2026-08-14 | Pipeline published 2026-08-14 11:12Z; feed shape, Market vs Model output, and the drawer's Rookies row all verified against live data. Detail retained in §1 |
