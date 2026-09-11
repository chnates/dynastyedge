# DynastyEdge — Open Items

**This file is the answer to "what's next?"** It is a **living list**, not a
dated snapshot: unlike `docs/project-status-2026-*.md` (which gets superseded
by a newer dated file), this one is edited in place forever. Anything deferred
with a reason belongs here, or it will be forgotten.

**Last reviewed:** 2026-09-11 (UX/IA + visual review — `docs/design/review-2026-09/`.
The owner approved a replacement visual direction ("Matchday") and the Phase 3
"Primetime Blackout" law is superseded; the audit also turned up four
independent, ready-now bugs. New: **DESIGN-1**, **DESIGN-2**, **DESIGN-3**.
Previously 2026-09-07: the my-side read: one fit engine, both seats —
the Analyzer and the Targets board now grade what a trade is worth to *me* in
the same words they always used for the partner, and acquired players get the
same depth chart departing ones always had. Measuring it opened **OPEN-10**.
Earlier the same day, trade-engine review: the package search now
weighs my own cost against the partner's appeal, my starting lineup is measured
and gates the verdict, and Layer 3 is scored on live playoff odds instead of the
win-window tier. One 2026-09-06 owner ruling reversed — marked in place, not
deleted. The active work queue remains `docs/build-plan-2026-09.md`).

**How to use it:**
- Each item states its **trigger** — the condition that makes it ready. An item
  whose trigger hasn't fired is **not** ready work; doing it early is a bug.
  (OPEN-2 was the canonical example — rolling the pick window before the draft
  ran broke the Tracker during the one event it exists for. It is now closed,
  and closed in the way to prefer: the trigger was designed out rather than
  waited on.)
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

- **Phase 1 — SHIPPED 2026-09-04.** Confidence percentages on lineup moves
  (`utils/lineupConfidence.js`, table regenerated from
  `scripts/dev/optimizer-signal-backtest.mjs` §3) with sub-1-point swaps
  demoted; the DEF free-agent fix (`utils/freeAgents.js` — the waiver drawer
  returns 14 defenses against live data, and DEF is a Free Agents filter);
  weekly projections + a Proj sort in League › Free Agents
  (`hooks/weeklyProjections.js`, shared with the Optimizer); snap/target/rush
  share on the player profile drawer, DISPLAY ONLY. The `TEAM_*` stats trap is
  now in CLAUDE.md's Critical stats note. Owner correction on review: defenses
  are reachable only through the DEF chip/slot and carry no dynasty framing —
  you roster exactly one, so the app must never suggest adding them (now
  League Context doctrine in CLAUDE.md). 163 tests, lint + build clean.
- **Phase 2 — SHIPPED 2026-09-04, acceptance test MISSED (10 of 25 vs a target
  of 12) — see NEWS-1 below and `docs/analysis/news-sources-2026-09.md`.**
  FantasyPros dropped (all three endpoints dead); ten sources probed and
  adopted, ten rejected; the feed now accumulates across runs (7d player / 48h
  general) instead of being a 20-hour snapshot; and items carry `playerIds`
  (Sleeper ids resolved server-side) because `espn_id` is null for 17 of the
  owner's 26 rostered spots. Coverage doubled, 5 → 10.
- **Phase 3** — rookie research split into "impact now" vs "long-term stash",
  adding age + athleticism from nflverse and (gated on a key) college
  production. **3c is a hard gate:** if the long-term score doesn't beat draft
  capital out of sample, report the null and stop.
- **Phase 4** — a real valuation consensus. FantasyCalc is currently the app's
  only valuation source. Three are obtainable free and ID-joinable: FantasyCalc
  (actual trades), DynastyProcess (FantasyPros expert consensus), KeepTradeCut
  (crowdsourced votes). **FantasyCalc and KTC agree at 0.975 even among the top
  25; DynastyProcess is the lone outlier at ~0.51** — market view vs expert
  view. Archive all three daily first (starts the clock on "which source
  leads?"), then surface the disagreement. Do not average them; do not replace
  FantasyCalc. See the plan's §10.

- ~~**Phase 4 (original)** — the breakout alert~~ **CUT 2026-09-04.** It became testable
  when nflverse's historical injury reports were found, and it tested null:
  players whose position-mate was ruled Out beat their projection by +1.13
  against a +0.98 control (n=318). Sleeper had already raised their projections.
  See the plan's §9c.

### DESIGN-2 — four ready-now bugs the design review surfaced

**Trigger: fired.** These are independent of any visual direction, cost nothing
to fix, and should land *before* the rebuild so the rebuild isn't carrying them.
Evidence: `docs/design/review-2026-09/findings.md` §X1–X3, B3.

1. **`--text-tertiary` fails WCAG AA in both themes** — dark `#54565C` on
   `--bg-card #141417` = **2.5:1**; light `#8A9096` on `#FFFFFF` = **3.2:1**
   (AA body needs 4.5:1). It is used **525 times** and carries real content:
   the meta line on every player row, timestamps, trade-target reasons. Fix is
   a token change in `src/index.css`, not 525 edits.
2. **No `focus-visible` anywhere in the design system.** `Button`,
   `IconButton`, `Card` (interactive), `Chip`, `Badge` define no focus ring;
   `Input`/`Select` actively remove the outline
   (`focus:outline-none focus:border-accent`).
3. **Touch targets under 44px.** `IconButton` is 32/36px and is the close
   control in every sheet header; `Button` `sm` (~30px) and `md` (~36px) are
   also under. The app header's own buttons are correctly `w-11 h-11`, so the
   rule is known and broken elsewhere.
4. **The trade price truncates.** `WhatsFair.jsx:198` sets `truncate min-w-0`
   on the `Est. cost:` value; live at 390px it elides on **5 of 11** target
   cards — the most actionable field on the board. `LineupRow` has the same
   class of bug on long player names ("TreVeyon He…").

### DESIGN-3 — the navigation rebuild

**Trigger: fires with DESIGN-1** (they touch the same files; doing them apart
means migrating twice). Measured in `review-2026-09/inventory.md`:

- **Four destinations have zero content-level inbound links** — Season Review,
  my own Trajectory, Manager Scouting, Rookie Research. Rookie Research is also
  **missing from `PlayerSearchSheet.jsx`'s `DESTINATIONS`**, so it is the one
  view that cannot be found by searching its own name. That one is a two-line
  fix and can ship immediately.
- **All 17 sub-tabs are byte-identical duplicates of the drawer's children** —
  two navigation systems over one payload.
- **Section colours reuse the status tokens**: `SideDrawer.jsx:74,85` assign
  Trade `text-success` and League `text-warning`, the same tokens used for
  actual status in the same file. Violates CLAUDE.md's own exclusivity rule.
- **"Pick Trades" is clipped off its own sub-tab row** at 390px.
- The **"no bottom tab bar" rule is re-litigable** — the owner reopened it for
  this review. NN/g measures hidden navigation at a 20%+ discoverability drop
  and 15% slower mobile tasks; the four weekly sections fit a 2–5 tab bar.

### NEWS-1 — re-measure news coverage after a week of accumulation

**Trigger:** `news.yml` has been running with the accumulating feed for ~7 days
(i.e. on or after **2026-09-11**).

Phase 2's pre-registered acceptance test — ≥12 of 25 rostered players resolved
in a fresh pull — **missed at 10**. It was measured on a *cold* feed, before
any accumulation had happened, which is not the shipped design: the window
holds 240 player items and a single cold pull only produces 127.

Two facts bound what more work could buy, and both argue for measuring before
building:

- The app now resolves **every** player the matcher can find (achieved =
  ceiling). No further matching work can move the number.
- All 15 misses are **genuine absence** — each was verified present in the
  player index and absent from the feed's entire text. There simply was no
  news about Jordan James or Jalen Royals in any of eleven sources on
  2026-09-04, in the preseason.

**Do this:** run `node scripts/dev/news-coverage.mjs` (no argument reads the
live feed). If a saturated window clears 12, close this item. If it doesn't,
the honest read is that free NFL news does not cover a 26-deep dynasty roster
carrying taxi-squad rookies, and the **target should move rather than the
sources** — do not bolt on low-signal feeds to chase the number. Record
whichever way it goes.

### NEWS-2 — wire the feed's `coverage` block into the drawer's data-status row

**Trigger:** ready now; small, and gated only on whether it earns its screen
space. Owner call.

Phase 2's step 5 asked for a relevance/source breakdown "in the feed JSON so
the side drawer's data-status block can show feed health". **The data shipped;
the UI did not.** `news.json` now carries
`{ total, playerItems, withPlayerIds, withAthleteIds, spanHours, sources }`
next to `updatedAt`, and nothing in the app reads it — the drawer still shows
only the News row's refresh age and publish age.

What it would add: a dead pipeline is already visible through publish age, but
a **degraded** one is not. A run where RotoWire's markup changed, or where the
player DB fetch failed and every new item landed in the general bucket, still
publishes a fresh `updatedAt` while `playerItems` quietly collapses. That is
the failure this block was published to make visible.

Keep it to one line under the existing News row — the drawer is already dense,
and this is diagnostic, not daily information.

**Blocked, owner action:** Phase 3b needs a free CollegeFootballData API key
stored as repo secret `CFBD_API_KEY`. Nothing else in the plan is blocked.

### 2026-09-04 — Phase 3 landed partial: 3a shipped, 3c a null, 3b and 3d NOT built

Full memo: `docs/analysis/rookie-longterm-signals-2026-09.md`.

- **3a shipped.** `rookie-intel.json` now carries age at the NFL draft,
  height/weight and the three well-covered combine drills, joined **by ID only**
  (`pfr_id` → `gsis_id`/`espn_id` → `sleeperId`). Rendered on the profile
  drawer as *"Measurables · context, not scored"*.
- **3b NOT attempted — still the open owner action.** `CFBD_API_KEY` could not
  be verified from the session: the agent proxy blocks the GitHub Actions API
  (`/actions/secrets` → 403), and nothing in the repo references the secret.
  Per the instruction to build 3b only if the secret exists, it was skipped.
  The pipeline reads no key and publishes fine without one.
- **3c is a null and 3d is stopped.** A "long-term" score from age +
  athleticism beats *draft capital alone* out of sample by only +0.012 rho
  (95% CI includes zero), is a **worse** predictor of years 2–3 than the score
  already shipped (+0.602 vs +0.632), and correlates **0.934** with it. The
  "low impact now / high upside later" quadrant a two-axis UI exists to surface
  held **0 rookies across nine real draft classes**. Combine athleticism
  specifically is null (+0.002).

**RESOLVED 2026-09-04 — the key arrived and college production was tested. It
is also a null.** See `docs/analysis/rookie-college-production-2026-09.md`
(run 33931139020). Dominator rating IS orthogonal to draft capital
(r = +0.05…+0.09) and does produce a different ranking (0.725 vs the shipped
score), but the long-term score built on it predicts years 2–3 **worse than the
shipped score and worse than capital alone**, adds +0.011 at t = 1.71 on top of
the shipped score, and populates the taxi-stash quadrant with 6 of 391. Nothing
ships; **the two-axis rookie question is closed.**

The one thing from 3b that did not get its own gate and might deserve one:
**breakout age** (n = 306, univariate +0.262 vs years 2–3, the strongest single
college number measured). It is currently dated off age at the draft rather than
a real birthday, which is coarse. Also worth re-running everything if CFBD ever
backfills ESPN ids before college season 2015 — that roughly doubles the usable
frame.

**One measured follow-up — SHIPPED 2026-09-05 on the owner's ask.** The 0.10
age tilt (+0.018 rho against years 2–3, t = 3.35, 8 of 9 classes, no measurable
cost to year 1) is now the board score, as `dynastyOpportunityScore`. See §5 of
the long-term memo for the implementation contracts — in particular that an
unknown age is a no-op rather than an imputed average, which matters because
only 78 of 237 published rookies carry one.

**Open, and worth a look eventually:** the board's bottom is dense — 172 of 237
rookies share just 26 distinct scores under 6/100 — so tiny score differences
produce enormous *rank* movement among players who all read "thin opportunity".
That predates the tilt and is a presentation problem, not a model one. If the
Opportunity sort ever feels jumpy, this is why.

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
spent. *(Superseded 2026-09-07 — the window now derives itself from the draft's
own `status`, so "not until the draft runs" is enforced by the code rather than
by a note. OPEN-2 closed.)*

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

### DESIGN-1 — build the "Matchday" visual direction **[owner-approved 2026-09-11]**

**Trigger: fired — the owner selected the direction and asked for the build to
start in a fresh session.** Not started here: the review was scoped as
diagnosis + mocks only, and the app was deliberately left untouched.

**What was decided.** Six directions were mocked across two rounds. Round one
(Instrument / Dispatch / Control) was rejected — scored against a researched
AI-slop marker list, two of the three failed **10 and 11 of 12**. Round two
(Almanac / Blueprint / Matchday) was built to that checklist and all three
score 0. **The owner chose Matchday.**

Matchday in one line: *a publication about a competition* — poster type
(Bricolage Grotesque on its width/optical axes), flat colour with hard edges,
zero radius, no shadows, no icon set, text navigation, and **the five position
hues promoted from 9px tags to full-bleed section bands**. Magnitude is encoded
as **type size**, not a bar, with the band carrying the group total.

**Where the spec lives:** `docs/design/review-2026-09/directions.md` (the
direction, its two revisions, and the build sequence) ·
`slop-checklist.md` (the rules any new UI must pass) · `mocks/directions-2.html`
(the working mock — standalone, never imported by the app).

**Known costs, already measured and accepted:** it is the least dense of the
three (~3–4 targets per screen against Almanac's 7); it needs one new font
family; and Bricolage may not earn its keep on device, in which case the swap
candidate recorded is Big Shoulders Display.

**Settled during review, do not re-litigate:** the home hero keeps team value
as its marquee figure. Leading with the instruction instead was built, reviewed
and **reverted on the owner's call (2026-09-11)** — he preferred the look. The
argument for the swap is still recorded in `unasked.md` §1 if it is ever
revisited.

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

### OPEN-2 — ~~Roll `PICK_YEARS` forward after the rookie draft~~ **CLOSED 2026-09-07**

**Closed by removing the chore, not by doing it.** The 2026 rookie draft
completed 2026-09-04 (`status: "complete"`), and the owner reported the Trade
Analyzer still offering 2026 picks. Rather than roll the constant and re-book
the same maintenance for next September, the window is now **derived from live
data** by `src/utils/seasonWindow.js` — `/state/nfl` plus the league's drafts
list, both already in the `useSleeper` payload, so **zero extra requests**. It
reaches the app as `pickYears` on `LeagueContext`; `PICK_YEARS` survives only as
the pre-resolution seed.

**What the stale window actually cost, measured on the live league the day it
was fixed:** FantasyCalc retires a season's pick entries the moment its draft
completes (all 24 of its pick entries were 2027/2028/2029 three days after the
draft), so the app was generating **40 spent picks priced at 0** across the ten
rosters, and **2029's 40 picks — four per team, a 1st worth 1,933 — were
invisible everywhere**. After: 120 picks, **0 priced at 0**.

Three traps the roll exposed, all now pinned by tests:

1. `computePickCapitalScore`'s weights were keyed by literal year
   (`{ '2026': 3, '2027': 2, '2028': 1 }`), so the newly surfaced third season
   would have scored **0** — silently deflating the pick-capital ranking that
   drives Trade Partner Finder and the League sort. Now keyed by distance from
   the upcoming draft.
2. Pointing the Draft Tracker at the next season would have replaced a
   completed recap with an empty "no 2027 draft yet" placeholder for ~10
   months. `selectTrackedDraft` prefers the upcoming draft and falls back to
   the most recent completed one.
3. Trade › Pick Trades must plan the **next** draft (`pickYears[0]`) while the
   Tracker shows the finished one — and must not borrow the finished draft's
   board to price next year's slots.

**Verified:** live pick window resolves `['2027','2028','2029']`; per-roster
pick counts and capital scores recomputed against the live Sleeper +
FantasyCalc payloads; League Overview TeamCards render `'27 · '28 · '29`
matching those counts team for team; Pick Trades targets 2027 at round medians
with the correct "Sleeper hasn't set the 2027 draft order yet" note; the Draft
Tracker still renders the completed 2026 recap with VOE summing to zero.
`npm run lint` clean, `npm test` 253/253, `npm run build` clean. Documented in
CLAUDE.md's Constants File section and Features 1, 10 and 13.

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

### 2026-09-07 — the trade engine's two sides rebalanced, and Layer 3 rebased

Opened by an owner question: *"did we make it to where it cares too much about
the other team and not enough about me?"* Yes, in three places, all measured
against the live league and all fixed. Memo:
`docs/analysis/trade-engine-my-side-2026-09.md`. PR: see the branch
`claude/trade-analysis-engine-review-icz0ha`.

**A false start worth keeping.** The first measurement compared each suggestion
against the *cheapest fair package overall* and reported "18 of 20 overpay,
11,293 excess value". That framing was wrong — the cheapest package is almost
always `Weak`, and picking those is the failure the two-phase search exists to
prevent (§4e-v of `dynastyedge-failure-archaeology`). Against the correct
baseline — the cheapest package at an *acceptable* appeal tier — the old rule
overpaid on **2 of 20**. The mechanism was real; the magnitude was not. Recorded
because the wrong baseline made a small bug look like a large one.

**Shipped:**

1. **Phase 2 of `suggestFairPackage` is a trade-off, not an override.** It
   ranked by partner appeal lexicographically, so inside the fair band my own
   cost had no vote. Now `APPEAL_BONUS[appeal] − keep-pain`, asymmetric on
   purpose: `Weak −1` (a near-prohibitive guard — an unanswered offer is a real
   failure), `Fair 0`, `Strong +0.4` (a nudge, bought only when nearly free).
   The weight is **mid-plateau from a sweep**, not chosen: w ≤ 0.20 → 17.79
   keep-pain (5/20 changed) · 0.30–0.50 → 18.46 (2/20) · 1.00 → 19.84 (0/20,
   the old rule). Effect: 2 of 20 suggestions changed, −1.38 keep-pain, raw
   value sent unmoved (−13). Both changed targets had reached for an asset at
   0.85 keep — just under `PROTECT_THRESHOLD` — when a Fair package at ~0.4 was
   available. Narrow because **the fair band already bounded the damage**.
2. **My own starting lineup is measured.** `analyzeTrade` computed the change in
   the *partner's* best startable lineup and called it "the single honest
   measure of does this help them", and never computed it for me — though both
   lineups were already built. My side was graded by a position COUNT that was
   **0 on 18 of 20** trades, and two Accepts sat on a lineup that got worse
   while reading "this fills your WR need". `myStartersDelta` now **gates** the
   verdict (a drop clearing `MY_LINEUP_MATERIAL_PCT` = 1% of my current lineup
   downgrades a clean Accept to Counter). Proportional because live lineups span
   27k–63k. **It gates rather than feeding `fitScore`**, whose negative branch is
   a hard Decline — a rebuild trade *should* lower today's lineup.
3. **Layer 4 scored one fact twice.** A `fill` is by definition an arriving
   player who starts at a hole, which is exactly what raises `startersDelta`;
   both scored +1, so one event earned the two points that mean `Strong`. This
   is the identical double-count already removed from the `stacks` branch and
   never checked on the positive side. Scored once now; both sentences still
   render. Live: `Strong` 7 → 5.
4. **Layer 3 is rebased on live playoff odds** (owner-approved after a separate
   measurement). The win-window tier tracks **total assets at 0.952** but the
   **starting lineup at only 0.721**; playoff odds track the starting lineup at
   **0.988**, which is the question the layer asks. Two live mislabels fixed:
   roster 5 (2nd-best lineup, 87.7% odds) read `Rebuilding`; Jake & Bake (9th
   lineup, 8.3% odds) read `Middle`. The sharper bug: **`Middle` had no branch
   at all** and top-3/bottom-3 makes it a fixed bucket of four teams every
   season — so `windowScore` was **0 on 20 of 20** and the panel printed the
   same placeholder every time. On odds: 15 aligned / 5 conflicting. Tier is
   the offseason fallback, pinned byte-for-byte by test.

**Honest limits, all recorded:**

- **Verdicts did not move on the live board** for #4 (17 Counter · 1 Decline ·
  2 Accept before and after). `windowScore` reaches the ladder only via the
  clean-Accept gate and the winning-value-but-off-window branch. The gain is a
  layer that says something true; it bites when odds fall.
- **#2 flips no current verdict either** — the live drops are below the
  materiality floor. What is closed is the *class* of bug.
- Measured at **Week 1 with zero games played**, so the odds are a
  roster-strength prior plus schedule. Established: they ask the right
  question. Not established: that they are calibrated. **Re-run in November.**

**Scope deliberately held.** `assignWinWindowTiers` still backs its eight other
consumers; only Layer 3's *score* moved.

**Owner ruling reversed this session:** the 2026-09-06 "appeal stays
lexicographically first" call, above. Marked in place rather than deleted.

**Left alone, with reasons (each is a bigger win than what shipped):**

1. **`fitScore` is still a position count**, so it ties on most trades. The gate
   covers the dangerous case; making fit magnitude-aware end to end would
   redefine every verdict at once and is a separate job.
2. **The deficit test is binary** (`delta < 0`) in the verdict and in
   `getDeficitPositions`, which also feeds free agents, rookie fit, keep-scores
   and the cash-out board. Note the Targets board *does* scale by magnitude —
   an earlier claim that the whole app was binary was too broad.
3. **`getDeadlineVerdict`'s thresholds are uncalibrated for this league.** 6 of
   10 teams make these playoffs, so 60% is baseline and ≥70% Buyer sits only
   modestly above it; five teams bunched 76–88% at Week 1. Making them relative
   to `playoff_teams / numTeams` is a real option that would move three
   surfaces at once. **[owner ask required]**

### 2026-09-06 — OPEN-6 closed: the recommendation surfaces are two-sided

The Analyzer went two-sided in PR #36; the surfaces that *suggest* a trade did
not, which produced a loop worth naming — tap a target, the app pre-fills a
package, the Analyzer grades it `Weak` and downgrades its own suggestion.

**Measured on the live league before the change: 19 of 20 suggested packages
graded `Weak` appeal, none graded `Strong`, and all 20 verdicts came back
Counter or Decline.** The board did not recommend a single trade its own panel
would stand behind. Root cause was `suggestFairPackage`'s objective, not the
ranking: minimizing my own pain selects, by construction, the pieces a partner
has least use for — my cheapest asset by keep-score was a third quarterback, and
it appeared in 11 of the 20 packages.

An exhaustive search proved the ceiling: **a Fair-or-better package existed for
all 20 targets (8 Strong, 12 Fair) inside the same fair band, without touching a
protected asset.** Phase 1 never looked at their side. After the fix the live
board reads **Strong 4 · Fair 13 · Weak 3** with 5 Accepts; the surviving Weaks
are the two targets I genuinely cannot pay for, which is information rather than
a failure.

What shipped: `buildPartnerFit` extracted from `analyzeTrade` and shared;
`suggestFairPackage` two-phase (cheap enumeration → 40-candidate shortlist →
exact Layer 4 appeal — **the shortlist is gone as of the 2026-09-06 keep-score
work below; do not reintroduce it**); `getTopTradeTargets` ranked by `need × value ×
movability`; `suggestSellMove`'s partner pick made two-sided; the appeal read
surfaced on each target card. 219 tests (up from 204), lint + build clean, all
of it verified against the live league.

**Owner ruling, 2026-09-06 — the rule is now "roster facts may score; second
opinions describe."** This replaces the narrower "the five negotiating signals
never move a verdict" with one rule covering verdicts and rankings alike. Layer
4 and movability are arithmetic over a roster, so they score. Scarcity, roster
space, weekly lineup impact and a partner's recent moves are unbacktested second
opinions about value or intent, so they describe and never reorder a
recommendation. Roster space was considered as an exception and rejected: "they
are 3 over the cap" is a fact, but "so they want a 2-for-1" is a guess about
behavior, and behavioral modelling is disconfirmed here.

**Two findings recorded but NOT acted on:**

1. **The league-wide board is single-position by construction.** `need` is a
   per-position constant, so `need × value` collapses to a value sort within
   whichever position I'm thinnest at — today that is WR, and all 20 rows are
   WRs. Owner call 2026-09-06: **keep the deficit gate.** That is the board's
   job; converting a surplus is `suggestSellMove`'s, and the team-scoped mode
   already shows non-deficit pieces.
2. **Movability's band is load-bearing and was tuned once already.** The first
   cut, `[0.35, 1.6]`, let a 2,174 WR5 outrank a 4,395 WR2 on live data. If it
   is ever widened past a 2× swing, that inversion comes back —
   `tests/tradeTargets.test.mjs` pins the ratio.

### OPEN-8 — Re-derive `PICK_ROUND_KEEP` once the 2027 class resolves

**Status:** deferred. **Trigger:** the 2027 rookie draft has happened *and* that
class has played a season — realistically autumn 2028.

The shipped keep-scores (1st 0.65 · 2nd 0.50 · 3rd 0.40 · 4th 0.30) rest on
three classes of this league's own picks, n=10 per round per class, and the
newest of them has not resolved at all. Every class points the same way — round
1 beat the dearest future 1st on the board 3/3, round 4 missed the cheapest 4th
0/3 — but three classes cannot distinguish "the market underprices firsts" from
"this league drafts well".

`node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs scripts/dev/asset-aging-backtest.mjs`
re-runs it and prints a drift check; the script imports the shipped constants,
so it fails loudly if the measured ordering stops matching them. **If round 1
ever stops beating its price in a resolved class, re-derive rather than nudge.**
Full method: `docs/analysis/asset-aging-and-pick-value-2026-09.md` §3.

### OPEN-10 — The two "fair" windows disagree

**Status:** deferred, and it is the reason 17 of 20 suggested packages read
`Weak for you`. **Trigger:** an owner ask, or the next deliberate pass over
`suggestFairPackage`'s tuning — it is not a bug to fix in passing.

`suggestFairPackage` builds inside **`[0.9×, 1.15×]`** of the target, with
undershoot penalised 1.6× (sellers don't take light offers). `buildFairBand` —
THE definition of fair, shared with the Analyzer's verdict and every surface
that predicts it — is **±5%**. So the search routinely proposes packages the
Analyzer then scores as an overpay. Measured live 2026-09-07 on the 20-target
board: every suggestion landed **6–11% in the partner's favour**, which is why
16 of 20 come back `Counter` and why the new my-side read grades 17 of 20
`Weak` (my seat takes −1 on value; theirs takes +1).

**The grader is not the problem.** Swept across price, 8 of the first 8 targets
reach `Strong for you` at 58–94% of the target's value, and a user-built trade
winning 8% on value renders `Fair for you`. The board's *offers* are what sit
outside the band.

**Why it wasn't touched:** narrowing the search band moves package selection on
every surface that consumes it, and `APPEAL_BONUS` (Weak −1 · Fair 0 · Strong
+0.4) was swept and set at the current band — changing one without re-measuring
the other invalidates the sweep. Whoever picks this up should re-run the
20-target board before and after and report the keep-pain / appeal / verdict
deltas together, exactly as `docs/analysis/trade-engine-my-side-2026-09.md` §1
did. Full context: `docs/analysis/trade-my-side-read-2026-09.md` §3–4.

### OPEN-9 — Rebuild the trajectory age curves longitudinally

**Status:** deferred, and it blocks a standing prohibition. **Trigger:**
`values-archive.json` holds ~12 monthly columns (started 2026-07, so around
2027-07).

`buildAgeCurves` learns what the market pays at each age from *today's*
FantasyCalc pool — a cross-section. The only 33-year-old TE still carrying value
is the one who didn't decline, so the curve reads survivorship as aging: TE 31 =
641 against TE 33 = 1,020, QB 25–26 = 790 against QB 30–31 = 2,255. Fed into a
keep-score tilt it projected a 31-year-old Mark Andrews **+47%**.

**Standing ruling until this is fixed: `projectPlayer` / `buildAgeCurves` are
descriptive shape only and must never feed a score, a ranking, or a
recommendation** (recorded in CLAUDE.md Feature 17 and
`dynastyedge-failure-archaeology`). Feature 17's own UI is fine — it reads the
shape and says so. The aging signal that *does* score is the longitudinal one in
`asset-aging-and-pick-value-2026-09.md` §2, built from production rather than
price. Rebuilding the curves from the monthly archive would let the trajectory
model itself be scored, and is a prerequisite for OPEN-5's multi-season
back-test.

### 2026-09-06 — OPEN-7 closed: the keep-score learns age and pick rounds

Opened by an owner question about a live board: *"it wants me to give up Chase
Brown for A.J. Brown — why him and not Jonathan Taylor?"* The answer was that
`assetKeepScore` scored both at **exactly 0.85** — every player inside
`CORE_DEPTH` got a flat rate, age only entered the function inside the
Contending and Rebuilding branches (this roster is Middle), and every pick
scored 0.5 regardless of round or year. Taylor was never a candidate at all: at
5,705 against a 4,106 target he is a 39% overpay, excluded by the band before
scoring. Nothing was broken; the function had never been given the facts.

**Measured before changing anything** (`scripts/dev/asset-aging-backtest.mjs`,
memo `docs/analysis/asset-aging-and-pick-value-2026-09.md`):

- **Aging, longitudinally** — n=762 player-seasons 2020–2025, same player year
  over year, a player who required a real season and then left the league
  counted as 0 rather than dropped. RB past 26 retains 0.66 vs 0.94
  (p=0.0001); WR past 28, 0.67 vs 0.84 (p=0.0016); QB and TE not significant.
  **`PEAK_WINDOWS` survives at the boundaries it already shipped** — do not
  re-tune it.
- **Picks** — all 120 rookie picks this league has made, at today's prices.
  Round 1 beat the dearest future 1st on the board in 3/3 classes (30/30 hits);
  round 4 missed the cheapest 4th in 3/3 (8/30). Hype flattens the pick curve,
  resolution steepens it: the market prices a 1st at 3.5× a 4th, the
  most-resolved class delivered **8.0×**.

**Three things the evidence killed, recorded so they stay dead:**

1. **The obvious implementation.** Tilting the keep-score with the shipped
   `dynastyTrajectory` curves projects a 31-year-old Mark Andrews **+47%** —
   they are a survivorship-biased cross-section. See OPEN-9; the prohibition on
   scoring off them stands until the curves are rebuilt longitudinally.
2. **The pre-peak half of the age tilt.** Protecting players *younger* than
   their window is absent at RB (−0.02, p=0.853) — the position the tilt exists
   for — with one near-hit in four tests. The tilt is decline-only.
3. **A single 30-day trend snapshot as an aging signal.** It puts old RBs
   rising and young QBs falling; one September window measures Week 1 news.
   `§1` of the back-test reproduces the null so nobody re-runs it.

**Shipped:** `PICK_ROUND_KEEP` (1st 0.65 · 2nd 0.50 · 3rd 0.40 · 4th 0.30, with
`PICK_KEEP_CAP` holding every pick below `PROTECT_THRESHOLD` at every tier);
`pastPeakTilt` (decline-only, per-position RB 1.00 / WR 0.65 / QB 0.40 / TE
0.15, saturating over 3 years, magnitude by tier); `buildCashOutBoard`;
`suggestFairPackage`'s cheaper `alternative`; and the removal of
`PACKAGE_SHORTLIST`. 242 tests (up from 219), lint + build clean, every change
verified against the live league.

**Owner rulings this session:**

- **Appeal stays lexicographically first in the package search.**
  ⚠️ **SUPERSEDED 2026-09-07 — see the entry below.** Making it trade off
  against my own cost was proposed and declined here: knowing whether they
  would accept is the information the search exists to produce, and a package
  needing a pick to bridge it is a different trade rather than a cheaper one.
  The `alternative` line adds that information beside the suggestion instead.
  The owner reversed this the next day, after the review measured what the
  lexicographic rule was costing (18 of 20 suggestions were not the cheapest
  fair package; 2 of 20 were genuine overpays). The original objection is
  preserved because it is the thing to answer if the trade-off is revisited —
  and it *is* answered: the appeal read still renders on every card, and the
  higher-appeal package the search passed over is now named explicitly.
- **`CORE_DEPTH` stays rank-blind.** Making it rank-sensitive would protect the
  *older* RB1 hardest, which is backwards for the question that opened this.
  The age tilt addresses the same ordering from the correct direction.

**Two findings recorded but NOT acted on:**

1. **`packageRationale` still says "protects your starters" unconditionally**
   whenever a package draws from a surplus. On the live board it said that
   while spending the owner's RB2 — who starts in `buildValueLineup`. It means
   "touched nothing scoring ≥ 0.9", which is not what it says. The honest fix
   is to check the package against `buildValueLineup(myRoster).starterIds` and
   name the starter when one is in it. Small, and not blocked on anything.
2. **`PROTECT_THRESHOLD` (0.9) protects almost nothing on a healthy roster.**
   Core starters land on exactly 0.85; only a position in deficit (+0.22, which
   clamps to 1.0) or a cliff (0.95) ever crosses it. That is *by design* —
   ff116ba's ruling is about the irreplaceable starter — but it means the
   threshold is doing less work than its name suggests, and anyone reading
   "protected" should know it means "deficit or cliff", not "starter".

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
| Trade engine over-weighted the partner (3 fixes) | 2026-09-07 | Phase 2 made a cost/appeal trade-off (weight set mid-plateau from a sweep); `myStartersDelta` added and gating the verdict; Layer 4's fill/lineup double-count removed. Detail retained in §1 |
| Layer 3 scored on a tier that measured the wrong thing | 2026-09-07 | Live playoff odds now score the win window in season (0.988 vs the starting lineup, against the tier's 0.721); tier is the offseason fallback. Killed the dead `Middle` branch that left 40% of the league with no read. Detail retained in §1 |
| OPEN-2 — roll `PICK_YEARS` after the rookie draft | 2026-09-07 | Removed the annual chore instead: the pick window is derived from `/state/nfl` + the drafts list (`utils/seasonWindow.js`, zero extra fetches). Killed 40 ghost 0-value picks and surfaced 2029 league-wide. Detail retained in §2 |
| OPEN-7 — the keep-score had no opinion about age or about which pick is which | 2026-09-06 | Measured both (n=762 player-seasons; all 120 of this league's rookie picks), then shipped `PICK_ROUND_KEEP`, `pastPeakTilt`, the cash-out board, the cheaper-`alternative` line, and the untruncated package search. Detail retained in §1 |
| OPEN-6 — push Layer 4 into Targets and the fair-package builder | 2026-09-06 | Layer 4 extracted as `buildPartnerFit` and shared; `suggestFairPackage` made two-phase; Targets ranked by `need × value × movability`; `suggestSellMove` partner pick made two-sided. Detail retained in §1 |
| July 2026 repo-review backlog B1–B11 | 2026-07/08 | All eleven landed — mapping in `docs/repo-review-2026-07.md`'s status banner |
| Navigation Refactor Phases 1–3 | 2026-07-20 | Consolidation → `/my-team` + `/league` rename → "Primetime Blackout" visual pass |
| Frontier Item 2 blocking question (are losing FAAB bids visible?) | 2026-08-08 | Verified yes; see `docs/analysis/faab-bid-corpus-2026-08.md`. Superseded by OPEN-3 |
| ACTIVE-1 — season-readiness tests (draft day + Week 1) | 2026-08-08 | Three live contract breaks found and fixed (schedule endpoint, draft `slot_to_roster_id`, stats `pos`/`opp`); 35 new tests (72 → 107) + `scripts/dev/replay-live.mjs`. Detail retained in §1 |
| ACTIVE-2 — Draft › Research: verify the first pipeline run | 2026-08-14 | Pipeline published 2026-08-14 11:12Z; feed shape, Market vs Model output, and the drawer's Rookies row all verified against live data. Detail retained in §1 |
