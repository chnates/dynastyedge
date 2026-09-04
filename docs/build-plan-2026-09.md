# DynastyEdge build plan — September 2026

**Status:** approved by owner 2026-09-04. **Phase 1 shipped 2026-09-04**
(see §2); Phases 2–3 not started, Phase 4 cut (§9).
**Origin:** the Optimizer data-source study
(`docs/analysis/optimizer-data-sources-2026-09.md`, incl. its REVISION block).
**How to use this file:** each phase below has a **kickoff prompt** — paste it
into a fresh session. Phases are ordered so each one ships on its own.

The governing principle, in the owner's words: *every feature must function like
a GM, not regurgitate data already visible in Sleeper.* If a phase's output could
be read off the Sleeper app, it has failed its acceptance test.

---

## 0. What is already settled (do not re-litigate)

These were measured. Re-running them is waste; the scripts are committed.

| Question | Answer | Evidence |
|---|---|---|
| Pull projections from more sites? | **No.** ESPN and Sleeper agree at r=0.966; blending gains 0.013 pts | study §3 |
| Boom/bust score to pick starters? | **No.** Costs ~0.07 wins/season, negative at every margin | study §4 |
| Usage as a *predictive* model? | **No.** 0.026 MAE gain, unstable coefficients | study §5 |
| Stream defenses weekly? | **No.** Pooled −0.00 pts/wk over 408 team-weeks | study R1 |
| Is the projection gap→hit-rate curve real? | **Yes.** N>500k pairs, monotone 52%→87% | study §4 |
| Do breakouts arrive unflagged? | **Yes.** 79% of waiver breakouts had no projection bump | study R2 |

**Usage data is approved for DISPLAY ONLY** (owner call, 2026-09-04) — as
research context on rookies, player profiles, and free agents. It must never
feed a projection, a score, or a recommendation ranking.

---

## 1. Verified facts the next session should NOT re-derive

All probed live 2026-09-04. Re-verify only if something breaks.

**News feed (why it feels sparse — now quantified):**
- `https://www.fantasypros.com/nfl/rss/player-news.php` returns **HTTP 404**.
  It is dead and has been contributing nothing. It was the most player-focused
  source in `scripts/fetch-news.mjs`.
- Live feed: 100 items spanning only **~20 hours** (capped at 100, flooded by
  general-interest sources).
- Only **24 of 100 items** name an active skill player. The rest is general NFL
  content ("What uniform combination should the Lions wear?").
- Only **3 of the owner's 25 rostered players** appear anywhere in the feed.
- Only **19 of 100** items carry `athleteIds`; the other 81% must be matched by
  name, which is why coverage is fragile.

**Rookie data (nflverse — free, CC-BY, already used by `rookie-intel.yml`):**
- `combine/combine.csv` — 2,076 rows since 2021, columns `forty bench vertical
  broad_jump cone shuttle ht wt`, plus `pfr_id`. **71%** carry a 40 time.
- `players/players.csv` — carries `pfr_id`, `espn_id`, `birth_date`,
  `college_name`, `college_conference`, `draft_year/round/pick`.
- `draft_picks/draft_picks.csv` — carries `age` at draft **and career outcome
  columns** (`games`, `seasons_started`, `rec_yards`, `rush_yards`, `w_av`) —
  these are the labels that make a back-test possible.
- **The ID join is clean and needs no name matching:**
  `combine.pfr_id` → `players.pfr_id` → `players.espn_id` → Sleeper's
  `espn_id` (already cached in `usePlayerDB`) → `sleeperId`.
  **74%** of combine rows join; **99.7%** of those carry an `espn_id`.
- nflverse publishes **no college production asset** — `player_stats_college.csv`
  and `ff_playerids.csv` both 404.

**College production (approved by owner, needs a key):**
- `api.collegefootballdata.com` returns **HTTP 401** without a key.
- **OWNER ACTION REQUIRED:** register a free key at collegefootballdata.com and
  add it as GitHub repo secret `CFBD_API_KEY`. Phase 3b is blocked until this
  exists. Everything else in Phase 3 proceeds without it.

**Usage/snap data (free — no new fetch):**
- `/stats/nfl/regular/{year}` — **already fetched once per session by
  `usePlayerIntel`** — carries `off_snp`, `tm_off_snp`, `rec_tgt`, `rec_rz_tgt`,
  `rush_att`. 947 entries carry `off_snp`. Snap share is a field read, not a
  request.

**Traps (one is not yet in CLAUDE.md):**
- `/stats/nfl/regular/{y}/{w}` carries **both** `ARI` (the team defense, ≈ −4…20
  pts) and `TEAM_ARI` (team offense totals, ≈110–120 pts). Any `!id.isdigit()`
  check that means "defense" will sweep in a 110-point row.
  `computeDefenseRankings` survives only because `TEAM_*` is absent from the
  player DB. **Add this to CLAUDE.md's Critical stats note in Phase 1.**
- `/projections/nfl/regular/{y}/{w}` is **rewritten in place** (6 of 9,419
  entries moved across two fetches ten hours apart). Historical projections are
  the last value held, not a pre-kickoff snapshot.
- FantasyCalc ranks **zero** defenses (473 entries: RB/WR/QB/TE/PICK only).

---

## 2. Phase 1 — Surface what we already have  *(app-only, no pipelines)*

> **SHIPPED 2026-09-04.** All four items landed. Notes on what the build
> settled that the plan left open:
> - **1a** — the table below reproduced exactly on regeneration. The same run
>   measures the curve independently for QB and DEF and they track the
>   FLEX curve within ~3 points at every bin, so **one** curve ships rather
>   than three; cross-position slot-fills remain unmeasured and the code says
>   so. A must-fix carries **no** confidence (its outgoing side scores 0 by
>   rule, not by projection). Sub-1-point moves are **demoted, not dropped** —
>   dropping one would leave points in the "sitting on your bench" headline
>   with nothing on screen explaining them, breaking the Σ-gains invariant's
>   *meaning* even though the arithmetic still held.
> - **1b** — verified live: the DEF drawer returns 14 defenses (LV 7.7, TEN
>   7.3, DAL 6.8), matching §1's probe. Fixing it also exposed two rule-7
>   defects the drawer had been hiding — a defense opened from Free Agents was
>   graded "D — Deep Stash" off a `positionRank ?? 99` default, and unvalued
>   comparison rows rendered `0` — both now show `—`.
> - **1c** — needed a shared `/projections` session cache
>   (`hooks/weeklyProjections.js`) so Free Agents and the Optimizer don't each
>   pull the ~1–2MB payload.
> - **1d** — target/rush share needs a `TEAM_{team}` row as its denominator,
>   which is the one legitimate read of those keys; the trap note says so.

Four changes that share one theme: the data is already in the app and is either
hidden or presented without confidence. No new fetches except one.

### 1a. Confidence on every lineup recommendation  ← highest value in the plan

`buildLineupMoves` emits a projected gain. Ship the measured hit-rate curve as a
constant table in `src/utils/lineupMoves.js` (or a sibling) and render it on the
move card: **"+2.3 pts · 61% likely to be the right call."**

| gap | right |
|---|---|
| 0–1 | 52% |
| 1–2 | 57% |
| 2–3 | 61% |
| 3–4 | 65% |
| 4–5 | 69% |
| 5–8 | 75% |
| 8–12 | 83% |
| 12+ | 87% |

Moves under ~1 point should be **demoted out of the move list** (they are coin
flips) — surfaced, if at all, as "no meaningful edge". Regenerate the table with
`scripts/dev/optimizer-signal-backtest.mjs` §3 rather than copying numbers by
hand; cite the N in a comment.

### 1b. Fix the defense blind spot  *(a bug, not a feature)*

`FreeAgentDrawer.jsx:17-18` drops every player FantasyCalc doesn't rank, and
FantasyCalc ranks no defenses — so the DEF slot's waiver list renders **0 rows
against 14 available defenses**. Fall back to `usePlayerDB` for name/position and
show `—` for value, exactly as rule 7 already requires everywhere else. Also add
DEF to `FreeAgentsView.jsx:151`'s position filter.

Frame it honestly in the UI: this is *"your slot is empty / your defense is on
bye"* help, **not** a weekly streaming edge — that was measured at zero.

### 1c. Weekly projection in the free-agent list

`League › Free Agents` sorts by dynasty value and never shows this week's
projection — right now three of its top ten project **0.0 points**. Add the
projection as a second column and a sort mode. In-season only; hide in the
offseason like every other weekly surface.

Why it matters, and the line to put in the UI: among waiver-tier players, a
0–2 projection means a **0.9%** chance of a 15+ game; 6–8 means **10.6%**.

### 1d. Snap share + target share on the player profile drawer

`usePlayerIntel` already holds the response containing `off_snp` / `tm_off_snp` /
`rec_tgt`. Render snap share and target share as **descriptive context**, clearly
labelled as "how he's being used", with no predictive claim attached.

**Verification for Phase 1:** `npm run lint`, `npm test` (must read **152+**;
if it reads 104, run `npm ci` first), `npm run build`, plus a 390px screenshot of
each changed surface via the `dynastyedge-visual-capture` skill. The DEF fix must
be shown returning a non-empty list against live data.

### Kickoff prompt — Phase 1

```
Read CLAUDE.md, then docs/build-plan-2026-09.md (sections 0, 1, 2), then
docs/analysis/optimizer-data-sources-2026-09.md including its REVISION block.

Implement Phase 1 (1a-1d). Work on branch claude/phase1-surface-what-we-have.

Constraints:
- All UI comes from src/components/ui. Run /design-review before committing.
- Regenerate the 1a hit-rate table by running
  scripts/dev/optimizer-signal-backtest.mjs; do not hand-copy numbers.
- Usage data (1d) is DISPLAY ONLY. It must not feed any score or ranking.
- Also add the TEAM_* stats trap from section 1 to CLAUDE.md's Critical stats
  note, in the same commit as the code that touches defenses.
- Update CLAUDE.md's affected Feature sections in the same commit.

Verify before declaring done: npm run lint, npm test (expect 152+ tests --
if it says 104, run npm ci first), npm run build, and a 390px screenshot of
each changed surface. Show me the DEF drawer returning a non-empty list
against live data.

Do not open a PR until I ask.
```

---

## 3. Phase 2 — Make the news feed actually about my players

Self-contained: one script, one workflow. Touches no app logic beyond what
already reads the feed.

**The problem, measured:** 3 of 25 rostered players covered; 76% of items are
general NFL content; the whole feed is 20 hours deep because 100 general-interest
items flush the player news out.

**The work:**
1. **Replace the dead FantasyPros URL.** Find its current player-news endpoint
   or drop it and replace with an equivalent player-focused source.
2. **Add sources.** Candidates to probe server-side (each must be verified
   reachable, parseable, and reasonable to link to before adoption):
   Rotowire, NFL.com, PFT, The Athletic RSS, team beat feeds, Sleeper's own
   trending-players endpoint. Prefer feeds that name individual players.
3. **Rank for relevance, then cap.** Score each item by whether it names a real
   player (join to the player DB, ID-first via `athleteIds`, name-match second).
   Keep player-relevant items preferentially so a roster player is never flushed
   by a uniform-combo article. Keep general items too — the News tab still wants
   them — but they lose the tiebreak.
4. **Raise the retention window** so the feed spans days, not 20 hours.
5. **Publish a relevance/source breakdown** in the feed JSON so the side drawer's
   data-status block can show feed health, and so this is measurable next time.

**Acceptance test (pre-registered — write it down before changing the fetcher):**
after the change, **≥ 12 of the owner's 25 rostered players** are mentioned in a
fresh feed pull, versus 3 today. If it lands below that, report the number and
say which sources failed rather than declaring success.

**Contract that must not break:** news is best-effort. Any failure hides the
section. It never blocks a panel, shows an error, or retry-loops.

### Kickoff prompt — Phase 2

```
Read CLAUDE.md (Player news pipeline section), then
docs/build-plan-2026-09.md section 3.

Fix and expand the news pipeline. Branch: claude/phase2-news-coverage.

Start by re-verifying the section 1 findings still hold (FantasyPros 404, 3 of
25 rostered players covered, 24% of items naming a skill player) -- these were
measured 2026-09-04 and may have moved.

Probe every candidate source server-side with curl BEFORE writing code. Report
which ones are reachable and parseable. Do not adopt a source you have not
successfully parsed.

Pre-register the acceptance test before changing the fetcher: >= 12 of my 25
rostered players mentioned in a fresh pull (baseline 3). Report the real number
even if it misses.

Keep the best-effort contract: any failure hides the news section, never errors.
Update CLAUDE.md's news pipeline section in the same commit.

Do not open a PR until I ask.
```

---

## 4. Phase 3 — Rookie research that answers "impact now vs. stash"

The largest build. The owner's framing is the product: **distinguish a rookie who
will help this season from one worth a taxi spot.** Today `rookieResearch.js`
produces a single opportunity score (draft capital 70% / depth chart 30%,
back-tested at rho 0.664 on n=396) — good, but one number cannot answer a
two-part question.

### What competitors have that we don't

Surveyed 2026-09-04. Industry-standard rookie inputs are **draft capital,
college production (dominator rating, yards per route run, breakout age),
athleticism (RAS / speed score), age, and landing spot.**

We currently have **draft capital + landing spot** and nothing else. The gap is
**age, athleticism, and college production** — and, notably, nobody sells the
two-axis "now vs. later" split, which is the part that is actually GM-shaped.

### 3a. Add age + athleticism  *(no key needed — do this first)*

Extend `scripts/snapshot-rookie-intel.mjs` to pull `combine.csv`,
`players.csv` and `draft_picks.csv`, join via the verified `pfr_id → espn_id →
sleeperId` chain (§1), and publish per rookie: age at draft, height/weight, and
the combine drills, plus a derived athleticism score computed **within position**
(a 4.5 forty means different things for a WR and a TE).

Coverage will be partial (~71% have a 40 time). Missing data shows `—` and the
player is never dropped — same contract as everything else.

### 3b. Add college production  *(blocked on the owner's CFBD key)*

With `CFBD_API_KEY` present, pull college receiving/rushing production and derive
**dominator rating** (share of his team's production) and **breakout age** (how
young he was when he first dominated). Join via `cfb_id` where available.

The workflow must **degrade cleanly when the secret is absent** so the pipeline
still publishes 3a's data. Never hard-fail the feed on a missing key.

### 3c. Back-test both scores before shipping either

Non-negotiable, and the repo already has the pattern —
`scripts/dev/rookie-signal-backtest.mjs` grades the shipped model against
2021–2025 by **importing the shipped constants so analysis and app cannot
drift.** Do the same here.

Build **two separate scores** and test them against two different outcomes:
- **Impact-now score** → does it predict *rookie-season* fantasy points?
  (This is roughly today's model; the back-test already exists.)
- **Long-term score** → does it predict *years 2–3* production?
  Labels come from `draft_picks.csv`'s career columns plus Sleeper season stats.

**Gate: if the long-term score does not beat draft capital alone out of sample,
do not ship it.** Report the null and stop. That is a legitimate outcome — the
FAAB and trade-structure items in `dynastyedge-research-frontier` are both parked
on exactly that basis.

### 3d. The two-axis UI

Only after 3c passes. Each rookie gets **two readings, not one ranking**:

- **Impact now** — will he play and produce this season (draft capital, depth
  chart, snap share once the season starts)
- **Long-term** — is he worth a taxi spot (age, athleticism, college production,
  draft capital)

The output a GM wants is the *combination*: "Year-1 impact low, long-term
upside elite — this is a taxi stash, not a starter." A rookie who is high on both
is a genuine steal; high-now/low-later is a win-now rental; low on both is a
pass. Show snap share here too (Phase 1d's display-only rule applies).

### Kickoff prompt — Phase 3

```
Read CLAUDE.md (Feature 19 + the Rookie intel pipeline section), then
docs/build-plan-2026-09.md section 4, then
docs/analysis/rookie-research-signals-2026-08.md (the existing back-test).

Build Phase 3 in order: 3a, then 3c, then 3d. Do 3b only if the repo secret
CFBD_API_KEY exists -- check first and tell me if it is missing.

Branch: claude/phase3-rookie-research.

Hard rules:
- The pfr_id -> espn_id -> sleeperId join is verified and ID-based. Do NOT
  name-match. CLAUDE.md documents why (Jordan Love vs Jeremiyah Love).
- Every name-based fallback, if you use one at all, must be position-guarded.
- 3c is a GATE, not a formality. If the long-term score does not beat draft
  capital alone out of sample, report the null and STOP before 3d.
- Write the back-test so it imports the shipped constants, the same way
  scripts/dev/rookie-signal-backtest.mjs does, so analysis cannot drift.
- The pipeline must publish successfully even when CFBD_API_KEY is absent.
- Follow the publish contract of the existing feeds: recover a missing output
  from the branch via git, and abort rather than force-push an empty feed.

Write findings to docs/analysis/ as a dated note. Do not open a PR until I ask.
```

---

## 5. Phase 4 — The breakout alert  **— CUT 2026-09-04, see §9**

> **Do not build this.** When this plan was written the mechanism was untestable
> because Sleeper keeps no historical injury status. It turned out **nflverse
> publishes historical injury reports** (§9), so it was tested — and it is null.
> The original reasoning is kept below for the record.

**Why:** 79% of waiver-tier breakouts arrive with no bump in Sleeper's
projection. The plausible mechanism is the one thing Sleeper's number lags —
*the starter ahead of him just got ruled out.*

**Why it is labelled an experiment:** it could not be validated.
- Sleeper keeps **no historical injury status**, so it cannot be back-tested at all.
- A naive join returned **22 hits, all projecting 0.0** — third-string tight ends
  behind injured fourth-stringers.
- A tightened join (immediate backup to a depth-order-1 starter, own projection
  ≥ 3) returned **0 hits** in the preseason, because nobody is ruled out yet.

**The data needs no new source:** `usePlayerDB` already caches `injury_status`,
`depth_chart_position` and `depth_chart_order`, and depth-chart coverage is
complete (32/32 teams list an RB1).

**Build it as:** a labelled experimental card on the free-agent surface and a
briefing item — *"Experimental: <player> is next up behind <starter>, who is
listed Out"* — with the word **Experimental** visible in the UI, per the owner's
instruction.

**Measure it from day one.** Log every alert fired (player, week, reason) so that
at season's end the question "did the alerted players actually produce?" is
answerable. An unmeasured experiment is just a guess with a badge.

**Kill criterion, set now:** if by Week 10 the alerted players do not outproduce
same-projection non-alerted players, remove it.

### Kickoff prompt — Phase 4

```
Read docs/build-plan-2026-09.md section 5 and the REVISION block of
docs/analysis/optimizer-data-sources-2026-09.md.

Build the breakout alert as a LABELLED EXPERIMENT. Branch:
claude/phase4-breakout-alert.

Design the filter carefully -- my two earlier attempts produced either 22
garbage hits or 0 hits. Show me what it fires on against live data BEFORE
wiring any UI. If it fires on nothing useful in-season, say so and stop.

The word "Experimental" must be visible in the UI.

Build the logging from the start: every alert records player, week and reason,
so the Week 10 kill criterion can actually be evaluated.

Do not open a PR until I ask.
```

---

## 6. Sequencing, and why

| Phase | Why here | Blocked by |
|---|---|---|
| 1 — Surface what we have | App-only, no pipelines, highest confidence-per-hour. Ships in days. | nothing |
| 2 — News | Self-contained pipeline work, independent of Phase 1, and it improves the briefing every other feature reads. | nothing |
| 3 — Rookie research | Largest build. 3b needs the owner's CFBD key; 3a/3c do not. Rookie draft is the deadline. | owner's key (3b only) |
| ~~4 — Breakout alert~~ | **CUT.** Back-tested against nflverse injury reports and found null (§9). | — |
| 4 — Valuation consensus (§10) | Removes the app's single-source dependency, and 4a should ship early because it starts the clock on the only test that can settle which source leads. | nothing |

Phases 1 and 2 touch disjoint files and can run in either order, or in parallel
sessions if desired.

---

## 7. Owner action items

1. **Register a free CollegeFootballData API key** (collegefootballdata.com) and
   add it to the repo as secret `CFBD_API_KEY`. Blocks Phase 3b only.
2. Nothing else — every other source in this plan is already reachable.

---

## 8. Standing rules for every phase

Carried from the study's methodology lessons (§R6) and the repo's own gates:

1. **Never rank a recommendation on one season.** The DEF result had n=136 and
   a t of 2.22 and did not replicate. Multi-season replication is a gate before
   ranking, not a caveat after it.
2. **A filter chosen for one population invalidates claims about another.**
   `proj ≥ 5` was right for start/sit and silently wrong for waivers.
3. **State what a back-test's "cheater" knows**, and check it can represent the
   phenomenon in question.
4. **Test an endpoint's mutability before back-testing it.**
5. `npm run lint` + `npm test` + `npm run build` all pass before any commit.
   **If the test count is not 152+, run `npm ci` before debugging anything.**
6. CLAUDE.md updated in the **same commit** as the change it describes.
7. All UI from `src/components/ui`; `/design-review` before committing UI work.
8. Every new number in the app must be traceable to a committed, re-runnable
   script — never hand-copied.


---

## 9. Source survey — where a keyed source would actually help  *(added 2026-09-04)*

Asked before merging: *where else in this app could a paid/keyed source help, and
where was the option never surfaced?* Everything below was probed live, and the
falsifiable parts were tested against the corpus.

**Headline: the gap was never secrets.** Exactly one keyed source is worth having
(CollegeFootballData, already in Phase 3b). The genuinely missed opportunity was
**nflverse** — which this repo already uses for one narrow purpose and which
publishes far more, all free and CC-licensed.

### 9a. Tested and rejected

| Candidate | Needs a key? | Result |
|---|---|---|
| **Vegas lines** (implied team total, from nflverse `games.csv`) | No — free | Holdout MAE 5.228 → **5.205**, a 0.023 gain against a 0.05 floor. Sleeper's projection already prices game environment. |
| **Weather** (wind/temp) | For a *forecast*, **yes** — nflverse weather is historical only (0 of 272 upcoming 2026 games carry wind) | Wind is a real but small effect. Learned on 2022–24: passers in 15+ mph average **−0.81** vs projection (n=301). Applying that haircut to the 2025 replay moved **+0.13 pts/team-week** and changed **4 of 140 lineups**. Pre-registered bar was ≥1 pt. **Not worth a key.** |
| **The breakout alert** (Phase 4's mechanism) | No | See §9c — null. |

**A discipline note on the weather result.** On the 2025 season alone the wind
effect measured **−3.10** pts, which looks compelling. Learned properly on
2022–24 it is **−0.81**. That is the same single-season trap that produced the
retracted DEF result, caught this time because §8 rule 1 was applied *before*
recommending anything.

### 9b. Free sources we should have been using — the real finding

| Source | What it gives | Why it matters |
|---|---|---|
| **nflverse `roster_weekly_{season}.csv`** | Per-week `team` + `position` keyed by **both `sleeper_id` and `gsis_id`** | **This is infrastructure.** It is the crosswalk that lets any nflverse dataset join to this app with no name matching. 132,590 player-week rows across 2022–25. Everything else in this table depends on it. |
| **nflverse `injuries_{season}.csv`** | Weekly injury AND practice reports — `report_status` (Out/Questionable/Doubtful), `practice_status`, injury descriptions | Makes every injury-based hypothesis **back-testable**. It is what killed Phase 4 (§9c) — which is precisely its value. 3,782 "Out" designations joined to Sleeper IDs. |
| **nflverse `games.csv`** | `total_line`, `spread_line`, `roof`, `surface` (+ historical `temp`/`wind`) | Vegas lines **are** published for upcoming games (112 of 272 for 2026 already). Useless as a model input (9a), but legitimate as *context* on a matchup pill — "this is a 51-point game" is something Sleeper's app does not tell you. |
| **nflverse `combine.csv` / `players.csv` / `draft_picks.csv`** | Athleticism, age, career outcomes | Already adopted as Phase 3a. |
| **Sleeper `/players/nfl/trending/add`** | League-wide add/drop counts across all Sleeper users | **Free, on an API the app already calls, and entirely unused.** 560,352 managers added Roschon Johnson in 24 hours. It is crowd behaviour, not a prediction — but "the market is moving on this player" is real GM information and it is one request away. Untested: there is no historical archive of it, so it can only be validated live. |

### 9c. Phase 4 back-test — the breakout alert is null

Now testable via `injuries_{season}.csv`. Population: waiver-tier RB/WR/TE
(projected < 8), 2022–2025. Question: does a same-position teammate being ruled
**Out** predict that player beating his projection?

| condition | n | avg proj | avg actual | beat proj by | 15+ rate |
|---|---|---|---|---|---|
| a **starter** at his position is Out (that man's own season avg ≥ 10) | 318 | 4.22 | 5.35 | **+1.13** | 4.7% |
| a mid-tier teammate is Out (5–10) | 645 | 4.21 | 4.94 | +0.74 | 3.4% |
| a scrub teammate is Out (< 5) | 831 | 4.08 | 4.83 | +0.74 | 4.2% |
| **nobody at his position is Out** | 8,730 | 3.90 | 4.88 | **+0.98** | 4.6% |

The starter-out group beats its projection by +1.13 against a control of +0.98 —
a **0.15-point difference on n=318**, with an essentially identical breakout rate
(4.7% vs 4.6%). No signal.

**The mechanism is visible in the projections column:** the starter-out group is
projected **4.22** against the control's **3.90**. Sleeper *already raised* those
players. The alert would have told you what the number in front of you had
already said. This is the same finding as everywhere else in the study.

This does not contradict the earlier "79% of breakouts arrive unflagged" result.
Both are true: breakouts are largely unpredictable, **and** the injury mechanism
does not isolate them. The 79% figure describes how hard the problem is; this
result says one specific proposed solution does not work.

### 9d. The one real single-point-of-failure — now Phase 4 (§10)

**FantasyCalc is the app's only valuation source.** Every trade verdict, roster
total, trajectory curve, pick price, market-mover and briefing item traces back
to one opinion from one provider. If it changes methodology or goes away, the
app has no second reading.

**Superseded by §10.** A follow-up probe found KeepTradeCut's rankings page
embeds its full value table as JSON, and DynastyProcess publishes both free
Superflex values and a universal ID crosswalk. Three sources are obtainable
without a key. The owner approved building the consensus — see Phase 4 (§10).

### 9e. Verdict

- **Keys needed: one.** `CFBD_API_KEY`, already in Phase 3b.
- **A weather key is not worth buying** — the signal is 0.13 pts and 4 lineups a
  season.
- **The real correction is to treat nflverse as a first-class source** rather
  than a rookie-intel-only one. The `roster_weekly` crosswalk should be
  documented in `dynastyedge-data-contracts` when Phase 3 lands, since every
  future nflverse join depends on it.

---

## 10. Phase 4 — A real valuation consensus  *(added 2026-09-04, owner-approved)*

**The problem.** FantasyCalc is the app's only valuation source. Every trade
verdict, roster total, trajectory curve, pick price, market-mover and briefing
item traces back to one provider's opinion. That is both a single point of
failure and a single point of view.

**Three sources are obtainable, all free, all ID-joinable.** Verified live
2026-09-04 — no key, no scraping of a rendered page, no name matching.

| Source | What it measures | How to get it | Coverage |
|---|---|---|---|
| **FantasyCalc** *(in use)* | **Actual completed trades** in real leagues — revealed preference | `api.fantasycalc.com/values/current` | 397 players |
| **DynastyProcess** | **FantasyPros expert consensus rankings** — stated preference | `raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv` (`value_2qb` = Superflex). Also `values-picks.csv`, which carries **high/low ranges** FantasyCalc has no equivalent for. | 631 players |
| **KeepTradeCut** | **Crowdsourced "would you rather" votes** from its userbase | `keeptradecut.com/dynasty-rankings` embeds `var playersArray = [...]` with `superflexValues`. Server-side only (CORS) — the news-pipeline pattern applies. | 450 players |

**The join is ID-based end to end.** DynastyProcess publishes
`files/db_playerids.csv`, a universal crosswalk carrying `sleeper_id`,
`ktc_id`, `fantasypros_id`, `gsis_id`, `espn_id`, `pfr_id`, `mfl_id` and more.
Verified: 4,850 fantasypros→sleeper and 456 ktc→sleeper mappings; 450 of KTC's
500 players resolve to a Sleeper ID. **No name matching anywhere.** This
crosswalk is independently valuable and should be documented in
`dynastyedge-data-contracts` when this lands.

### The finding that shapes the design

Pairwise rank agreement, on the 376 players all three price:

| pair | top 25 | top 100 | all |
|---|---|---|---|
| FantasyCalc vs KeepTradeCut | **0.975** | 0.976 | 0.969 |
| FantasyCalc vs DynastyProcess | **0.513** | 0.902 | 0.960 |
| DynastyProcess vs KeepTradeCut | **0.472** | 0.896 | 0.945 |

**This is not three independent opinions.** FantasyCalc and KeepTradeCut agree
almost perfectly even among elite assets — both are *market* measures (completed
trades, and user votes). **DynastyProcess is the lone outlier**, and it is the
only *expert* measure.

So the real structure is **market consensus (2 sources) vs expert view (1)** —
and because two market sources independently agree, the market/expert divergence
is a consistent phenomenon rather than one provider behaving oddly. Directionally,
DynastyProcess prices **QBs higher** and **RB/TE lower** than both market sources.

Note also that all three agree at ~0.95+ *overall* and diverge only at the top.
**The top of the board is the only place this matters** — and it is exactly where
trades happen. Any evaluation of this feature must be run on the top 100–150, not
pooled across every ranked player, or the effect disappears into the tail.

### What to build

**4a. Archive all three, daily — do this first and immediately.**
Extend `.github/workflows/values-history.yml`, which already runs daily and
already publishes to the `values-history` branch. Add DynastyProcess and
KeepTradeCut columns alongside the existing FantasyCalc snapshot.

Do this **before** any UI work, because it starts the clock on the question
nobody can answer today: **when the sources disagree, which one do the others
move toward?** With ~3 months of archive that becomes a real test. Without an
archive it is unanswerable forever.

Follow the existing publish contract exactly: recover a missing output from the
branch via git, abort rather than force-push an empty file, and treat each source
as best-effort so one failure never erases the others.

**4b. Solve the scale problem properly — this is the hard part.**
The three use different scales *and different distribution shapes*. Naive
max-scaling (what my throwaway analysis used) distorts the comparison: it made
KeepTradeCut look systematically higher at every position, which is a scale
artifact, not a real bias. **Do not ship max-scaling.** Use rank-based
normalization or distribution matching (map each source onto a common quantile
scale), and validate that a source with no genuine bias shows none after the
transform.

**4c. Surface the disagreement — do not blend it away.**
- **Do not replace FantasyCalc.** Every model in the app — trajectory age
  curves, trade verdicts, pick pricing, recommendation keep-scores — is
  calibrated on its scale. Swapping means recalibrating all of it.
- **Do not average the sources into one number.** At ~0.96 overall the average
  is essentially FantasyCalc, and averaging destroys the disagreement, which is
  the entire product.
- **Do show the spread where it is wide**, in the Trade Analyzer and the player
  profile drawer: *"trade market 6,907 · expert consensus 4,444"*. A contested
  asset is a different thing to trade than an agreed one, and no other tool
  tells you which is which.
- Use the broader coverage (631 vs 397) to **fill in players that currently show
  `—`**, clearly labelled as to source. Rule 7 still applies: never drop a
  rostered player.

**4d. The forward test (runs later, needs the 4a archive).**
Once ~3 months of three-source history exists: when sources disagree by more
than X%, does the gap close, and **which source moves?** If the expert view
leads the market, its divergences are buy signals. If the market leads, they are
noise. Pre-register the threshold and the window before looking.

### Honest limits

- **Nobody knows which source is right**, and this phase does not claim to. It
  ships *"these disagree"*, not *"this one is wrong"*. 4d is what would change
  that.
- **KeepTradeCut is page-embedded JSON, not an API.** It can change shape without
  notice. Treat it as strictly best-effort: if the parse fails, the pipeline
  publishes the other two and the UI hides KTC. Never let it fail a run.
- Check each source's terms before publishing its values to a public branch. We
  are storing derived numeric values for personal single-user use, which is a
  lighter footprint than republishing an article, but it is worth a look.

### Kickoff prompt — Phase 4

```
Read CLAUDE.md (the Value history pipeline section), then
docs/build-plan-2026-09.md section 10.

Build Phase 4 in order: 4a first (archive all three sources daily), then 4b
(scale normalization), then 4c (surface the disagreement). 4d is later.

Branch: claude/phase4-valuation-consensus.

Start by re-verifying all three sources are still reachable and parseable --
these were probed 2026-09-04 and KeepTradeCut in particular is page-embedded
JSON that can change shape without notice.

Hard rules:
- The join is ID-based via dynastyprocess db_playerids.csv (sleeper_id,
  ktc_id, fantasypros_id). Do NOT name-match.
- Ship 4a before any UI. It starts the clock on the 4d test, which is
  unanswerable without an archive.
- Do NOT replace FantasyCalc and do NOT average the sources. Read section 4c
  for why.
- Do NOT use max-scaling to normalize. It produces a fake position bias. Show
  me your normalization validated on a source you expect to be unbiased.
- Every source is best-effort. One failing must never erase the others or
  fail the workflow.
- Evaluate on the top 100-150 assets. The sources agree in the tail; pooling
  across all ranked players hides the entire effect.

Update CLAUDE.md's Value history pipeline section and add the db_playerids
crosswalk to the data-contracts skill, in the same commit.

Do not open a PR until I ask.
```
