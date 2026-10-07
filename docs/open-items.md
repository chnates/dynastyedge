# DynastyEdge — Open Items

**This file is the answer to "what's next?"** It is a **living list**, not a
dated snapshot: unlike the old dated status snapshots (now in `docs/archive/`), this one is edited in place forever. Anything deferred
with a reason belongs here, or it will be forgotten.

**Last reviewed:** 2026-10-07 (**§0 #8 done** — proactive delivery note; recommends a scheduled Claude routine, blocked on refresh tokens in the MCP server, #9 waits on the owner. Earlier: **CODE-REVIEW-1 DONE** — 16 fixes, PRs #79–#94, tests 902 / 859, gap 43; **§0 #7 first pass done** — buy-low timing measured, no app change, re-run #7b from 2026-11-06; the ±50 trend rule given one home in `src/utils/marketTrend.js` (#75); `values-consensus.json` made the one permanent home of daily values, unbroken from 2026-07-09 (#77); **CODE-REVIEW-1 added as #7c, next in line**. Tests 841 / 798, gap 43. Earlier: **CLEANUP-3 added** — owner-approved dedupe of CLAUDE.md, triggered after §0 #12; spec + kickoff prompt in §2. **CLEANUP-2 done** — CLAUDE.md slimmed 7,123 → 3,586 lines, 482KB → 229KB, every rule kept and the dated evidence moved verbatim to `docs/history/`; on the owner's review before merge. It missed its ~2,000-line target — see §3. Previously the same day: CLEANUP-1 executed and OPEN-3 shipped. Tests 828 / 785 with no `node_modules`, gap 43.)

**How to use it:**
- Each item states its **trigger** — the condition that makes it ready. An item
  whose trigger hasn't fired is **not** ready work; doing it early is a bug.
  (OPEN-2 was the canonical example — rolling the pick window before the draft
  ran broke the Tracker during the one event it exists for. It is now closed,
  and closed in the way to prefer: the trigger was designed out rather than
  waited on.)
- Items marked **[owner ask required]** must not be built without an explicit
  request, per CLAUDE.md's Future Features gate.
- When you close an item, add a one-row summary to §3's table and move its full
  record to `docs/archive/open-items-2026.md`. Never delete it: the record is
  why nobody re-litigates it.
- **An item carrying a `Kickoff prompt` block is ready-to-run work with the
  owner's sign-off already on it** — paste it into a fresh session. The
  convention came from the September build plan
  (`docs/archive/build-plan-2026-09.md`), whose four phases are all resolved. A prompt is **dated and quotes measurements**, so treat its numbers
  as a starting point to re-measure, not as facts to trust: the whole point of
  the item it sits in is that the board moved.

---

## 0. The plan (set 2026-10-06, owner-approved — read this first)

**One ordered list for everything still open, through 2028.** The owner
approved the order on 2026-10-06. It is ordered **deadline first, then
value**: the trade deadline (Week 13) and the playoffs (Week 15) are this
season's only clocks, so work that helps the owner act before them goes first.
The 2026-09-21 week plan and its follow-ons are **all done**. Their records
live in `docs/archive/open-items-2026.md` under each item's own ID (PIPE-1, OPS-1, PIPE-2, OPEN-10, SMALL-1,
MCP-CARRY, NEWS-4/7, PIPE-3).

**Effort is in working sessions and is an estimate.** "Owner" items need a
login, a phone or a decision that no sandbox can supply.

### Now (week of 2026-10-06)

| # | Item | Who | Effort | Why here |
|---|---|---|---|---|
| 1 | **This roadmap + the repo-cleanup scan** (CLEANUP-1's inventory) — **DONE by the PR that wrote this table** | Me | <1 | Every later session starts from this file, and it was 11 days stale |
| 2 | **OPEN-3: FAAB bid recommender** — **DONE 2026-10-07.** `src/utils/faabBid.js` feeds League › Free Agents and `recommend_free_agents`; floor dropped to $2 on the owner's call; grading bars pre-registered in the memo's §10 | Me | 1–2 | Owner-asked 2026-09-25. Its live grading (#13) started the day it shipped |
| 3 | **MCP connector re-check on the phone** — all 13 tools in the connector's list; one question each to the five added since 2026-09-20 (see MCP-CARRY) | Owner | 15 min | No sandbox can do it |
| 4 | **The two DESIGN-4 device checks** — re-add the home-screen app (icon + both `theme-color` metas), and Bricolage Grotesque on glass | Owner | 15 min | Same reason; do it alongside #3 |
| 5 | **CLEANUP-1: mechanical cleanup** — **DONE 2026-10-07.** 113 branches deleted (9 unmerged tips tagged `archive/*` first), spent docs in `docs/archive/`, this file cut to the live items, five dead exports removed, skill drift fixed | Me | 1 | Right after the FAAB build: cleanup does not decay, FAAB does. It goes before the research queue, because every session after it reads less stale material. **Branch deletion needs the owner's yes first** |
| 6 | **CLEANUP-2: slim CLAUDE.md** — **DONE 2026-10-07** (owner reviews before merge). 7,123 → 3,586 lines, 482KB → 229KB; every rule, contract and trap kept, the dated evidence moved verbatim to `docs/history/` (one file per section). Missed the ~2,000-line target — see §3 | Me | 1–2 | The largest cleanup lever, and the riskiest (it is the doc of record). After CLEANUP-1, so the archive layout it moves material into already exists |

### Before the trade deadline (by ~Week 12)

| # | Item | Who | Effort | Why here |
|---|---|---|---|---|
| 7 | **Buy-low timing research** (`dynastyedge-research-frontier` Item 4) — **FIRST PASS DONE 2026-10-07.** For players worth 1,000+ (what Buy-Low/Sell-High show), dips beat matched non-movers by **+2.4%** over 30 days (CI −0.1 … +4.9) and risers trailed by **−2.3%** (CI −4.8 … +0.3): not falling knives, no reliable bounce, no age effect. **No app change** on one window. Write-up `docs/analysis/buylow-timing-2026-10.md`; the ±50 got one home first (`src/utils/marketTrend.js`) | Me | 1 | It decides whether the buy-low/sell-high advice should be trusted for deadline trading |
| 7b | **Re-run the buy-low timing study** — `node scripts/dev/buylow-timing-backtest.mjs`. Doubles the +30 sample, adds regular-season events, and makes **+60 days** measurable for the first time. **Pre-register the decision rule first** (memo §7): a change to the app needs the same sign, clear of zero, in both windows. Also worth an independent refutation pass before anything rests on it | Me | <1 | **Trigger: on or after 2026-11-06** (the merged series reaches 120 days). Still ahead of the Week 13 deadline |
| 7c | **CODE-REVIEW-1: the "proper over convenient" review** — **DONE 2026-10-07.** 16 findings, all fixed in PRs #79–#94 (one each, every one with a test that fails if a copy returns); outcome table in `docs/analysis/code-review-2026-10.md` | Me | 1–2 | — |
| 8 | **Proactive delivery feasibility note** (frontier Item 5) — **DONE 2026-10-07.** Recommends option E (a scheduled Claude routine calling the MCP connector, Claude-app push), **but it cannot work today**: the MCP server issues no refresh tokens (live `grant_types_supported: ["authorization_code"]`, 1-hour passes), so an unattended run finds the connector signed out — it is in `needs_reconnect` now. A dry-run routine with no connector still reported **SUCCEEDED**. Waivers measured at noon ET daily, Wednesday the big run. Fallback: B (GitHub issue). Note: `docs/analysis/proactive-delivery-2026-10.md`; four owner decisions in its §6 | Me | <1 | — |
| 9 | **Build the scheduled brief** — **waits on the owner's four answers** (note §6). If yes: refresh tokens on the MCP server (the OAuth lock), a league-calendar field on an existing tool, then the owner creates the routine in claude.ai/code/routines (connectors can't be attached from a coding session in this org), prompt written to notify on failure too. If the lock answer is no: option B instead | Me + owner | 1 | Every Tuesday-night waiver brief before it exists is missed |
| 10 | **Briefing decision-quality** (frontier Item 1): start recording what The Edge surfaced each day, so it can be scored against the moves that paid | Me | 1 | A week not recorded can never be scored |
| 11 | **OPEN-5: calibration** — replay 2023–25 through the playoff-odds model (Brier / reliability); check the lineup confidence curve against 2026 weeks | Me | 1–2 | Before a deadline buy/sell call rests on "58% odds" |
| 12 | **Close NEWS-4**: re-read `depthHours` around 2026-10-10 | Me | 15 min | Live 2026-10-06: 140h of the 168h target, 595 / 1200 player items — the cap no longer binds |

### Season end (Weeks 13–17)

| # | Item | Who | Effort | Why here |
|---|---|---|---|---|
| 13 | **Grade the FAAB recommender** against its pre-registered bars (wins ≥ 75% of contested auctions it enters; cost per contested win ≤ league median). **The protocol is fixed in `docs/analysis/faab-bid-corpus-2026-08.md` §10** — population, seat, "enters", tie rule, n < 8 = indicative. Follow it as written | Me | <1 | Bids drop to ~0.3× from Week 15, so the in-season sample is essentially complete |
| 14 | **Grade the playoff odds on 2026 itself**, once the regular season ends | Me | <1 | The first real out-of-sample test |
| 15 | **Phase 4d: "when the sources disagree, which one moves?"** (spec: §2 PHASE-4BCD) | Me | 1 | `values-consensus.json` holds 15 unbroken daily columns since 09-22; ~3 months makes it answerable (~2026-12) |
| 16 | **Phase 4b/4c: normalize the three sources and surface the disagreement** (spec: §2 PHASE-4BCD) | Me | 2 | The largest unbuilt approved item. It gets better by waiting, so it waits for #15 |

### 2027 offseason and later

| # | Item | Who | Effort | Trigger |
|---|---|---|---|---|
| 17 | **2027 rookie-draft rehearsal** (`scripts/dev/replay-live.mjs --scenario draft`) and the 2027 class landing in `rookie-intel.json` | Me | <1 | A few weeks before the 2027 rookie draft |
| 18 | **OPEN-9: rebuild the trajectory age curves longitudinally** | Me | 1–2 | ~2027-07, when `values-archive.json` holds ~12 monthly columns |
| 19 | **OPEN-5, second half: the multi-season trajectory back-test** | Me | 1 | After #18 |
| 20 | **OPEN-8: re-derive `PICK_ROUND_KEEP`** | Me | 1 | Autumn 2028 (the 2027 class has played a season) |

### Only when something triggers it

| Item | Trigger |
|---|---|
| NEWS-5 option 2 (make the news cron hourly so the line stops implying 48 runs/day) | Any time. Cosmetic only; GitHub delivers ~5.5–7.4 runs/day whatever we ask |
| VALUE-1 (FantasyCalc top value 10,758 > the documented 10,000) | Next time `Magnitude` or the FantasyCalc contract is touched |
| `restKvStore` against a live KV (MCP-CARRY) | Owner decision. It may cost money and buys cold-start latency, not correctness. **Recommended: skip** |
| Retune `DARK_AFTER.feed` | Only if delivered news cadence settles below ~4 runs/day |
| MCP connector re-check | After any new MCP tool deploys |
| Replace `public/FantasyPros_2026_Rookies_OP_Rankings.csv` | When a 2027 rookie ranking exists (CLEANUP-1 §F, archived) |
| **CLEANUP-3** — dedupe CLAUDE.md (one home per rule; target ~185KB) | After §0 #12, in a quiet week. Spec + kickoff prompt: §2 CLEANUP-3 |

### Deliberately NOT doing (settled — do not reopen)

Push notifications (Sleeper is read-only, no backend) · per-manager trade-acceptance modelling (tested on the full 95-trade corpus, disconfirmed) · multi-league (frontier Item 6, a non-goal) · a two-axis rookie score (rejected twice: 3c and the college-production back-test) · the breakout alert (tested null) · averaging the valuation sources or replacing FantasyCalc (destroys the disagreement, which is the product) · tightening the news cron (GitHub already throttles it 6×) · OPEN-4's three accepted-risk findings.

### Settled measurements and standing rules (lifted from `build-plan-2026-09.md` §0 and §8)

That plan is archived (`docs/archive/build-plan-2026-09.md`); these two
sections of it are still cited, so they live here now.

**Settled — do not re-measure.** The scripts are committed; re-running them is
waste. "Study" is `docs/analysis/optimizer-data-sources-2026-09.md`.

| Question | Answer | Evidence |
|---|---|---|
| Pull projections from more sites? | **No.** ESPN and Sleeper agree at r=0.966; blending gains 0.013 pts | study §3 |
| Boom/bust score to pick starters? | **No.** Costs ~0.07 wins/season, negative at every margin | study §4 |
| Usage as a *predictive* model? | **No.** 0.026 MAE gain, unstable coefficients | study §5 |
| Stream defenses weekly? | **No.** Pooled −0.00 pts/wk over 408 team-weeks | study R1 |
| Is the projection gap→hit-rate curve real? | **Yes.** N>500k pairs, monotone 52%→87% | study §4 |
| Do breakouts arrive unflagged? | **Yes.** 79% of waiver breakouts had no projection bump | study R2 |

**Usage data is DISPLAY ONLY** (owner call, 2026-09-04): research context on
rookies, player profiles and free agents. It never feeds a projection, a score
or a recommendation ranking.

**Standing rules for any research or build** (from the study's §R6 lessons and
the repo's gates):

1. **Never rank a recommendation on one season.** The DEF result had n=136 and
   t=2.22 and did not replicate. Multi-season replication is a gate before
   ranking, not a caveat after it.
2. **A filter chosen for one population invalidates claims about another.**
   `proj ≥ 5` was right for start/sit and silently wrong for waivers.
3. **State what a back-test's "cheater" knows**, and check it can represent the
   phenomenon in question.
4. **Test an endpoint's mutability before back-testing it.**
5. `npm run lint` + `npm test` + `npm run build` all pass before any commit.
   **If the test count does not match CLAUDE.md's `npm ci` block, run `npm ci`
   before debugging anything.**
6. CLAUDE.md updated in the **same commit** as the change it describes.
7. All UI from `src/components/ui`; `/design-review` before committing UI work.
8. Every new number in the app must be traceable to a committed, re-runnable
   script — never hand-copied.

---

## 1. Active

Nothing is active. #8 is done and **#9 waits on the owner's decisions** (the four questions in `docs/analysis/proactive-delivery-2026-10.md` §6 — chiefly whether the MCP server may issue refresh tokens). Until then the next ready item is #10 (briefing decision-quality). #7b waits on its 2026-11-06 trigger.

---

## 2. Deferred — waiting on a trigger

### CLEANUP-3 — dedupe CLAUDE.md (one home per rule) **[owner-approved 2026-10-07; trigger: after §0 #12]**

**Why.** CLEANUP-2 cut CLAUDE.md to 3,586 lines / 229KB and missed its line
target: what remains is mostly contract. But some contracts live in **two to
five places**, and this repo's most repeated lesson is that two copies of a
rule drift (the pick classifier, the FAAB scale, "protects your starters").
One home per rule is a correctness gain as well as a size gain.

**Scope (and only this):**
1. **MCP tool sections** — keep what is server-specific (ids only, as-of stamp,
   bounded output, closed zod schema, Class B degradation, TTLs); replace each
   restated domain rule (one defense, the three odds states, FAAB in budgets,
   the fair band…) with a pointer to its Feature. ~150–250 lines.
2. **File Structure annotations** — the file's role plus a pointer; drop
   restated contracts. The tree stays one line per file. ~15–20KB.
3. **The FAAB budget rules** (League Context, Feature 11, the recommendation
   engine, two MCP tools) and **the pick window** (Feature 1, Feature 2,
   Constants) — one home each, pointers elsewhere. ~50 lines.

**Out of scope:** Features and the Design System — what is left there is
contract, not repetition, and it is where a session lands.

**Measure in bytes, not lines** — bytes are what every session pays. Target
**~185KB** (from 229KB). Report the real number even if it misses.

**Done when:** each deduped rule exists in exactly one section, every pointer
resolves, and the CLEANUP-2 rule audit (every never/always/must/do-not/trap
sentence of the pre-change file still present in CLAUDE.md) passes.

**Kickoff prompt** (dated 2026-10-07 — re-measure its numbers):

```
Do CLEANUP-3 in docs/open-items.md §2: dedupe CLAUDE.md so each rule has one
home. Read CLAUDE.md, the CLEANUP-3 entry, and load dynastyedge-change-control
and dynastyedge-docs-and-writing first.

Scope is exactly the entry's three items: MCP tool sections point to Features
for domain rules; File Structure annotations become role + pointer; the FAAB
budget rules and the pick window get one home each. Do not touch the Features
or the Design System beyond adding pointers.

Step 0: list every rule you plan to collapse, its current homes, the home it
keeps, and the expected byte saving. Show me and wait for my OK.

Rules: a pointer replaces a restatement only when the target section states the
rule fully. Move nothing to docs/history unless it is dated evidence. Re-run the
CLEANUP-2 rule audit (every never/always/must/do-not/trap sentence) against the
result. One docs: commit per area. Gates: npm ci, lint + test + build, test
count unchanged. Report bytes before/after. Open a PR, watch it, do not merge.
Close CLEANUP-3 in open-items as part of the PR.
```

---

### PHASE-4BCD — the valuation consensus, still to build (spec lifted from `build-plan-2026-09.md` §10)

**Status:** deferred. 4a, the daily three-source archive, shipped as PIPE-2.
**Triggers:** §0 #15 (4d, ~2026-12, once ~3 months of `values-consensus.json`
exist), then §0 #16 (4b + 4c). The owner approved the phase on 2026-09-04.
Source table, crosswalk traps and the agreement measurement:
`docs/archive/build-plan-2026-09.md` §10 and CLAUDE.md's consensus-archive
bullet.

**The structure that shapes it.** Rank agreement on the 376 players all three
price: FantasyCalc vs KeepTradeCut **0.975** in the top 25, FantasyCalc vs
DynastyProcess **0.513**, DynastyProcess vs KeepTradeCut **0.472**. So it is
**market consensus (two sources) vs expert view (one)**, not three opinions.
All three agree at ~0.95+ overall and diverge only at the top, where trades
happen, so **evaluate on the top 100–150, never pooled**.

- **4b. Normalize properly.** The sources differ in scale *and* distribution
  shape. Naive max-scaling made KeepTradeCut look systematically higher at
  every position, a scale artifact. **Do not ship max-scaling.** Use rank-based
  or quantile matching, and check that a source with no real bias shows none
  after the transform.
- **4c. Surface the disagreement; do not blend it away.** Do not replace
  FantasyCalc, because every model is calibrated on its scale. Do not average
  the sources: at ~0.96 the average *is* FantasyCalc with the disagreement
  destroyed. Do show the spread where it is wide, in the Trade Analyzer and the
  profile drawer (*"trade market 6,907 · expert consensus 4,444"*). Use the
  broader coverage to fill players that show `—`, labelled by source, and
  rule 7 still applies.
- **4d. The forward test.** When sources disagree by more than X%, does the gap
  close, and which source moves? If the expert view leads, its divergences are
  buy signals; if the market leads, they are noise. **Pre-register the
  threshold and the window before looking.** Compare only players every source
  priced that day (PIPE-3: a DynastyProcess null means off the board, not a
  value collapse).

**Honest limits.** Nobody knows which source is right, and this does not claim
to: it ships *"these disagree"*, and 4d is what could change that.
KeepTradeCut is a page, not an API, so it is strictly best-effort. Check each
source's terms before publishing its values to a public branch.

### OPEN-5 — Model calibration (open research)

**Status:** open. **Trigger: FIRED** — the regular season is under way
(2026 Week 3 as of this review), so the clock Week 1 started is running and
completed weeks are accumulating.

The models are verified *correct* (deterministic, threshold-accurate) but not
verified *accurate*: nobody can yet say whether 72% playoff odds means 72%.
Owned by `dynastyedge-model-quality-campaign`; the multi-season trajectory
back-test additionally needs ~a year of the monthly values archive
(`values-archive.json`, started 2026-07). Related open frontier items (briefing
decision-quality, buy-low timing) are in `dynastyedge-research-frontier`.

### NEWS-4 — the news item cap is binding again, at 78h **CLOSED 2026-09-22 — cap raised 400 → 1200; the 7-day claim is PENDING, not met**

**Re-measured first, as the entry asked.** Live 2026-09-22 22:14Z (run 1230):
`playerItems 400 / playerCap 400`, `spanHours 56` (was 78 the day before),
`distinctPlayers 207`, 480 items, **53,957 B on the wire** (211,241 raw —
~112 B/item gzipped, matching the ~114 recorded 2026-09-12). The log read
*"dropped 106 redundant player items (over 3/player); 0 cap slots spare"*.
Still cap-bound, still shrinking, breadth still healthy — so the decision was
the one the evidence favoured.

**Raised to 1200.** The window held ~7.1 player items/h after diversity
eviction (400 over 56h); 168h at that rate is ~1200 (the 2026-09-12 memo's
pre-diversity figure was ~1357). Projected wire size at 1200+80: **~144KB**,
against ~54KB at 400+80 — a fraction of the 5–8MB player DB the phone
already pulls once a session. KV entries on the MCP side are gzipped, so it
costs the same there; tool output is filtered per player, so bounded output
is unaffected. `newsRetention.mjs` and `PER_PLAYER_MAX` are untouched.

**One consequence the entry did not anticipate, and it is fixed:** Feature
15's News page rendered *every* item — 480 rows, going to ~1,280. It now pages
50 at a time with "Show more" (League › Activity's pattern), and each date
band's count stays the full bucket. Verified at 390px against the live feed:
50 rows → 150 after two taps, TODAY reading the true 195 throughout, 0 clipped
elements.

**A second consequence, and it is the finding worth keeping: `spanHours` was
the wrong number to watch.** The first run at 1200 (run 1234) published
`spanHours 147` — 54 → 147 in one run with **three** more items. Evicted items
do not come back, so that is not depth. It was **three week-old The Athletic
items** from the current pull (it returns 100 per pull, reaching back days),
which newest-first eviction used to throw away first and could now keep. The
player window's p90 age went **51h → 52h**. `spanHours` is max − min over every
item, so a handful of stragglers set it; the pinned cap had been hiding that
by evicting them. The drawer renders it as "Nd deep", so it would have read
**"6d deep" on a two-day window** — the 2026-09 collapse's shape (a health
number reading fine while depth is wrong) from the other direction.

**Fixed with `coverage.depthHours`** — p90 age of the player items, measured
from the newest one (`scripts/newsCoverage.mjs`, 5 tests). The drawer and
`news-coverage.mjs` read it; `spanHours` still ships unchanged.

**Before → after on the PUBLISHED feed** (runs 1230 → 1235, read from the
`news-data` branch):

| | 1230 (before) | 1235 (after) |
|---|---|---|
| total | 480 | 484 |
| playerItems / playerCap | 400 / **400** | 404 / **1200** |
| spanHours | 56 | 147 (three stragglers) |
| depthHours | — (p90 51h, computed) | **52** |
| distinctPlayers | 207 | 216 |
| wire bytes | 53,957 | ~54,100 |
| sources | 11 (ESPN RSS 0) | 10, all non-zero |
| sourceMisses | ESPN RSS 7, rest 0 | all 0 |

**How those runs were made, and why it can't happen again.** Runs 1231–1235
were `workflow_dispatch`es on the feature branch, and because `news.yml`'s
publish step had no default-branch guard, **each one force-pushed that
branch's unreviewed code to the live `news-data` feed.** That was the second
time (the 2026-09-12 retention fix did the same). Both `news.yml` and
`values-history.yml` now carry `rookie-intel.yml`'s guard, so a branch dispatch
is a dry run. **Post-merge check (owed):** dispatch `news.yml` on `main` and
read the published file; expect `playerCap 1200`, a `depthHours` field, ten
sources, and no `ESPN RSS` key. Until the PR merges, scheduled runs on `main`
publish the old code (cap 400, ESPN RSS back in), which is correct: the feed
is `main`'s.

**What is NOT verified, stated plainly:** that the 7-day window binds. The cap
fills by accumulation and evicted items don't come back, so depth can only grow
at the arrival rate: ~7 retained items/h, several days to reach 1200. **Trigger
to re-measure: 2026-09-29.** Read `depthHours` (not `spanHours`, not
`playerItems`). If it is near 168h, the claim is met. If the cap has pinned
again below 168h, correct CLAUDE.md's 7-day line to the measured depth rather
than raising the cap a third time on the same argument.

**Read 2026-10-06 (a week past the trigger, live feed):** `depthHours` **140**,
`spanHours` 167, `playerItems` **595 / 1200**, 269 distinct players, all ten
sources at `sourceMisses: 0`. The cap has **not** pinned again; depth is still
climbing toward 168h. Close this item with one more read around 2026-10-10
(§0 #12).

### NEWS-5 — the news cron is delivered at ~7.4 runs/day, not 48

**Status:** open. **Trigger: fired** — measured 2026-09-21 while verifying
OPS-1's fix. The verification is how it was found: the next cron window simply
did not arrive.

`news.yml` asks for `17,47 * * * *` — twice an hour, 48 runs a day. **GitHub
delivers ~7.4 runs a day at a 3.26h mean gap**, range 1.8h–5.0h, measured over
runs **1205–1220** (consecutive run numbers, so nothing is missing from the
list). **Not one run fired at :17 or :47**; the observed minutes are scattered
across the hour. GitHub defers scheduled workflows under load and does not make
up the skipped occurrences.

**This is not a new regression** — the run history shows the same pattern going
back as far as it was sampled. It is a **long-standing gap between the cron
line and reality that every doc reading the cron line inherited.** Three
claims were sized off it and are corrected in place:

| Claim | Was | Is |
|---|---|---|
| Feed staleness worst case near kickoff | ~35 minutes | **hours** (3.26h mean, 5.0h worst observed) |
| Vercel junk builds from data branches (OPS-1) | ~48/day | **~9/day** |
| "news alone would add ~48 commits/day" (ops skill) | ~48/day | one per run, ~7/day |

**The staleness one is the only one that changes a decision.**
`staleForKickoff` and the tools' "confirm against a live source" instruction
were written as a hedge against a ~35-minute gap; at a 3–5 hour gap they are
load-bearing. Nothing needs to change in the code — the warning already
exists and already fires — but the *copy* around it was calibrated to a
freshness the pipeline does not have.

**Options, none of them obviously right** *(still true after the
2026-09-25 re-measure: option 1 stands)*:

1. **Accept it and keep the docs honest** (what this PR does). Costs nothing.
   The feed is a best-effort surface and the tools already warn.
2. **Reduce the cron's ambition to match reality** (e.g. hourly). Does not
   *improve* anything — GitHub is already declining to run it 6× more often —
   but it stops the cron line from lying to the next reader. Cheap, cosmetic.
3. **Trigger the run some other way** if freshness near kickoff ever matters
   enough: a `repository_dispatch` from something that already runs, or
   accepting the gap only outside game windows. Unmeasured, and worth doing
   only if the warning proves insufficient in practice.

**What NOT to do: tighten the cron.** The requested cadence is already 6×
what is delivered; asking for more of something being throttled is not a fix,
and it is the obvious wrong move for the next person who reads this.

**Re-measured 2026-09-25: worse, ~5.5 runs/day.** Runs 1239–1253 (15
consecutive, 2026-09-23 05:14 → 09-25 18:40 UTC) came at a **4.39h mean
gap**, range **2.4h–6.0h**. Two windows four days apart differ by 35%, so the
docs now state the cadence as a **range, ~5.5–7.4/day**, and the staleness
worst case as **6.0h observed**. The values-history daily cron (`41 9 * * *`)
shows the same deferral: its last four runs started at 14:10–16:00 UTC,
**4.5–6.3h late**. That is harmless there, because a column is keyed by UTC
day.

**What this means for the alarm (`DARK_AFTER.feed = 12`):** at 5.5/day, 12
consecutive misses is ~2.2 days of silence rather than ~1.5. **Not retuned**,
deliberately. The threshold's contract is "a day or more of total silence",
and it still holds at both measured rates. Resizing it on every window would
be tuning to noise in GitHub's scheduler. **Retune only if delivered cadence
settles below ~4/day**, where 12 runs would pass three days, which is too slow
for a feed people read on game day.

**Status of the alarm itself, first live week (2026-09-21 → 09-25):** every
`news.yml` and `values-history.yml` run concluded `success`; the live feed
carries `sourceMisses: 0` for all ten sources, and no consensus column was
null. It has not fired, and nothing happened that should have made it fire.
PIPE-3's DynastyProcess drop was a smaller column, not an empty one.

**How to re-measure:** list `news.yml`'s recent runs and diff the
`run_started_at` timestamps. **Never read the cadence off the cron line** —
that is the mistake this item exists to prevent.

### VALUE-1 — FantasyCalc's scale now exceeds the documented 0–10000

**Measured live 2026-09-21** while probing for PIPE-2: the top FantasyCalc
value is **10758**. CLAUDE.md's FantasyCalc contract says "Dynasty trade value
(0–10000 scale)", and `Magnitude`'s reference is **pinned to 10000** precisely
so a figure means the same thing on every screen — CLAUDE.md's own words:
"any asset above it runs off the top of the ramp."

**Impact is small and entirely cosmetic**, which is why this is a note and not
a fix: `Magnitude` clamps at a 30px ceiling, so the handful of assets over
10000 render at the same size as one at exactly 10000 rather than breaking.
Nothing miscounts; no total is wrong.

**The question is which number is the contract.** 10000 was chosen over the
mock's 9365 because it was documented rather than a snapshot — if FantasyCalc
has no ceiling at all, that reasoning needs redoing, and the honest answer may
be a high percentile of the live board rather than a stated maximum. Needs a
look at FantasyCalc's own docs before changing anything.

**Trigger:** next time anyone touches `Magnitude` or the FantasyCalc contract.
Do not raise the reference casually — it resizes every figure in the app.

### MCP-CARRY — what the MCP server still owes

**Status:** open, consolidated 2026-09-21 from the tails of MCP-2a/2b/2c,
which had scattered it across three items. Nothing here is a correctness bug;
it is the honest remainder.

**SHIPPED 2026-09-22: the trade-targets tool**, with SMALL-1 as its
prerequisite commit. `find_trade_targets` is the ninth tool and the first of
§5's three deferred phase-two tools. Measured live over the real transport
(2026 Week 3): **927ms cold / 268ms cached at the default 8 targets,
17,240B**; 722ms / 36,297B at `limit: 20`; 132ms for a scoped scout; 18ms to
refuse an unknown team name with all ten candidates. Top of the owner's board:
Malik Nabers for Gunnar Helm + Rachaad White + Jordan Love (6,260, inside the
fair band), with *"to get a yes: 2029 2nd + Jonathan Taylor (+7% over fair)"*.

Two things worth carrying forward from building it:

- **It is the only layer in `mcp/` with NO TTL, and that is a decision rather
  than an omission.** The other four cache layers each own a FETCH; this one
  owns none — the ~730ms is CPU over a snapshot already fetched, cached and
  stamped, so its freshness domain IS the snapshot's and a number of its own
  could only be a second clock. A derived cache was considered and **rejected
  on a measurement**: `getSnapshot` assembles a fresh object every call
  (`generatedAt` is `now`), so a cache keyed on snapshot identity would never
  hit. Cost is bounded by how many *targets* are priced (~32ms each), never by
  truncating the candidate search inside one (§4e-v).
- **A pick can be ambiguous, and the app was guessing — FIXED the same day
  (owner ask).** `pickLabel` is `"{season} {suffix}"` and drops the original
  owner, so a roster can hold several picks under one label.
  `TradeAnalyzer.jsx`'s `mapPackageToAssets` rebuilt the label and `.find`-ed
  the first match, loading the Analyzer with a **different real asset** than the
  search had chosen.
  **It was recorded here as "narrow" and that was wrong — measuring it is what
  showed how wrong.** Live: **6 of 10 rosters** hold at least one colliding
  label (one holds *three* 2027 2nds), and across all ten seats' boards **13 of
  142 pick handoffs (9%) loaded the wrong pick**. **Zero of them on the owner's
  own seat** — he holds only his own picks — which is precisely why nobody ever
  hit it. It was also value-neutral *today*, because twins share a round-median
  price, so totals stayed right and nothing looked broken; that ends the moment
  slots resolve and the draft season prices picks per slot.
  **Fixed at the root rather than at the consumer:** `suggestFairPackage`'s pick
  assets now carry `season` + `originalOwner` beside `round`, so identity
  travels with the asset and no consumer reverses a label. The MCP tool dropped
  its label index with it — the ambiguity is now *impossible* rather than
  *detectable*. **The lesson generalises past picks:** "narrow" was an estimate,
  and the estimate was off by an order of magnitude because the owner's own seat
  is the one place the bug cannot appear. Measure the blast radius on every
  seat, not the one you are looking at.

**SHIPPED 2026-09-22: the rookie research tool.** `research_rookies` is the
tenth tool and the second of §5's deferred three. Prerequisite E lifted the
board composition out of `useRookieResearch` (→ `buildRookieBoard`) and the
class rule out of `useSleeperRookies` (→ `buildRookieMap`); the hooks keep the
memo. Equivalence **proved on live data**, not inspected: both pre-extraction
bodies lifted verbatim from git, `deepStrictEqual` on all 14 cases (444-rookie
class, all ten identities, no identity, no feed, no FantasyCalc). Measured over
the real transport: **943ms cold / 40ms cached, 25,888B**, 9 upstream requests
cold and 0 cached; 236 of 444 rookies scored, 208 with no feed entry and
therefore null. It turned up **ROOKIE-1** (§2) — found, measured at 0 live
occurrences, not fixed in a tool commit.

**SHIPPED 2026-09-22: the manager-scouting tool.** `scout_managers` is the
eleventh tool and closes §5's deferred list. The history walk was widened **in
the open**: `getLedgerHistory` is its own function, built on top of the narrow
`getLeagueHistory` (whose 14 requests and zero-transactions assertion are
untouched), adding users + transaction weeks 1..`last_scored_leg` per past
season. Measured: **68 requests cold, 508ms, 0 cached** — and every past
season's week-18 bucket is empty, which is why it stops at `last_scored_leg`.
Stated honestly, the app's walk over the same four seasons is ~72, so the
economy is the per-season frozen cache, not a smaller fetch. Over the real
transport: **1,219ms cold / 34ms cached, 10,041B** (80 upstream requests cold).
The "never traded" contract is pinned from both directions. `tradeTimeTotals`
moved out of `useTradeTimeValues` so the tool reads the trade-time archive by
the phone's rule — and the archive's two trades both carry a null pick, so **0**
ledger rows print the line today, which the notes say.

**SHIPPED 2026-09-22: "who won our league in 2023?"** — `get_league_results`,
the twelfth tool, and the first call this repo has made to
`/league/{id}/winners_bracket`. The shape was probed live before writing
against it; the `p: 1` game's winner matched each past league's own
`metadata.latest_league_winner_roster_id` on all three complete seasons. **Its
own tool, not a field on `scout_managers`**: a different question at a third of
the cost — it reads the narrow walk plus a bracket and a users call per season
(**29 requests cold**, 0 cached, no transaction bucket) where the ledger costs
80. Over the real transport: **1,165ms cold / 27ms cached, 10,089B**. Answer:
**Post Mahomes (today Mahomes Depot) won 2023**, Ministry Of Touchdowns 2024 and
2025; titles are credited by owner, so the rename does not orphan the title.

**SHIPPED 2026-09-25: the MCP-CARRY closeout.** ROOKIE-1 (§2, closed),
`get_value_history` (the capability bullet below), `Retry-After` (the known
limit below, closed) and `restKvStore` (explicitly deferred below). Pre-flight
before it: `main` (e96b280, PR #67) carried a `Vercel: success` commit status
and a Production deployment, and the production alias answered an
unauthenticated POST with **401 + `WWW-Authenticate: Bearer
resource_metadata=…`** — the integration is intact.

**Owed on the phone (the owner's, since no sandbox can do it):** the connector
re-check for the five tools added since the last one on 2026-09-20 —
`find_trade_targets`, `research_rookies`, `scout_managers`,
`get_league_results`, `get_value_history` — i.e. confirm all **thirteen** appear in the connector's
own tool list after this deploys, and ask each one question. That is the end of
the chain no probe reaches.

**Capability not built:**
- **Nothing on `MCP_DISCOVERY.md` §5's list remains** (trade targets, rookie
  research and manager scouting shipped 2026-09-22, and so did the question §5
  called unanswerable).
- ~~**One of the four static feeds is still unread** — `values-history`.~~
  **Closed 2026-09-25** by `get_value_history`, the thirteenth tool: all four
  static feeds are now read (`news` by `get_player_news`, `rookie-intel` by
  `research_rookies`, `trade-values` by `scout_managers`, `values-history` by
  `get_value_history`). The sparkline rule was extracted from the hook into
  `src/utils/valueHistory.js` first (`getValueSeries`, equivalence proved on
  the live feed, 2,314 cases). Its own tool rather than a `get_roster` field —
  an ~82KB wire fetch behind every roster question is the wrong cost. Measured
  live over the real transport: **1,372ms cold / 26ms cached, 8,100B**, 9
  upstream requests cold and 0 cached; a single player 5,084B.
- ~~`/league/{id}/winners_bracket` has still never been called~~ — **closed
  2026-09-22** by `get_league_results` (above).

**Known limits, stated rather than hidden:**
- ~~**`mcp/limit.js` backs off on a fixed schedule.**~~ **Closed
  2026-09-25.** `fetchJSON` now attaches `status` and the raw `retryAfter` to
  the `Error` it already threw — message byte-identical, no retry added there,
  and all 801 pre-existing test results identical with the change in place.
  `limit.js` honours both RFC 9110 forms, capped at 4s, falling back to the
  jittered schedule when the header is absent or unparseable; a 404 is never
  retried, advice or not. Seven new tests pin 429-with-header, 429-without, the
  HTTP-date form, an absurd value (86,400s → capped, still bounded by
  `MAX_ATTEMPTS`), a 404 carrying the header, and the attached fields.
- **`restKvStore` has never been verified against a live store — EXPLICITLY
  DEFERRED 2026-09-25, owner's call.** Checked read-only: **no KV is in use,
  and none can be from the current code** — `vercelEntry.js` calls
  `createApp()` with no `store`, and nothing reads a KV environment variable,
  so production runs `memoryStore()` in the warm instance. (CLAUDE.md said
  "HTTP passes a KV-backed store"; corrected.) Whether a store is *provisioned*
  could not be confirmed: this session's Vercel connector sees the team but
  returns 404 for the project and 403 for integrations, so neither env var
  names nor Marketplace installs were readable. **Nothing was provisioned.**
  What closing it would take, in order:
  1. **Owner:** provision a Redis-over-HTTP store for the `dynastyedge-mcp`
     project (Upstash via the Vercel Marketplace is the shape `restKvStore`
     speaks — `POST <url>` with `["GET", key]`). This may cost money; check the
     plan's per-value limit against the numbers below.
  2. **Code, ~5 lines:** in `vercelEntry.js`, pass
     `restKvStore({ url, token })` to `createApp` when both env vars are set,
     `memoryStore()` otherwise (so an unset store degrades to today's
     behaviour, never to a failed boot).
  3. **Verify over the real HTTP transport**, three checks: `fetchedAt`
     round-trips byte-for-byte (a cold instance's `asOf` must quote the
     *writer's* fetch time, not its own); the largest entry fits — measured
     2026-09-25, the player DB is **303 KB** as the stored gzip+base64 string
     (2.0 MB raw) and value history **108 KB**; and a KV that rejects writes
     (revoke the token) leaves answers correct and merely slower, which
     `loadSource`'s guard already promises and `tests/mcpStore.test.mjs` pins
     synthetically.
  Why it can wait: one user on one warm instance measured a 21ms second
  request; KV buys cold-start latency, not correctness.
- **The news feed can trail a wire report by HOURS near kickoff — not the
  ~35 minutes previously recorded.** It *asks* to publish twice an hour
  through a ~5-minute CDN cache, but GitHub delivers ~5.5–7.4 runs/day at a
  3.3–4.4h mean gap and 6.0h worst observed (NEWS-5, re-measured 2026-09-25). `staleForKickoff` marks the
  condition and the tools tell the reader to confirm against a live source,
  which matters a great deal more at this cadence than at the one the docs
  assumed. **Tightening `news.yml`'s cron is NOT the fix** — the requested
  cadence is already 6× what is delivered.

### DESIGN-4 — ~~finish the Matchday cleanup~~ **CLOSED 2026-09-21 (code); two DEVICE checks remain**

**Closed on paper by an audit, not by new work — every code item had already
shipped 2026-09-13 while this file still called three of them "pending".**
Verified in the tree 2026-09-21: `MarketMovers` renders the split row (no
nested `<button>`), `SectionContents` carries `railLabel` and stays
`flex-wrap`, `src/components/ui/Textarea.jsx` exists, and a static probe over
every `<button>`/`<input>`/`<select>`/`<textarea>` in `src` finds **no control
missing `.focus-ring`** (item 5's 46 are all fixed). That drift is the lesson
worth keeping: **this file is only as good as its last review, and a "pending"
that shipped a week ago costs the next session a wasted investigation.**

**What genuinely remains, and it is the owner's to run — neither is checkable
in any sandbox:**

1. **Verify the PWA metas and the app icon on device.** Carried since step 4.
   A meta or icon change is **silent** until the home-screen app is removed
   and re-added (failure-archaeology §1). `index.html`'s icon `?v=` is at 4.
   Note the Matchday repaint moved both `theme-color` metas (light `#E8E5DC`,
   dark `#141413`), so this is checking a real change, not a no-op.
2. **Bricolage Grotesque on glass.** Step 3 measured that the spec's
   `wdth 125` is not executable (the axis tops out at 100), so the face has
   never been seen doing what the brief asked. If it doesn't earn its keep on
   a real phone, the recorded swap candidate is **Big Shoulders Display**.

The original entry is kept below as the record.

**Status (original):** in progress. **Trigger: fired** — the owner asked for
it directly after the post-merge review. Four items, landing as separate PRs
so the two carrying a layout decision stay reviewable.

1. **The hand-rolled panels — DONE 2026-09-13.** 27 converted (the handoff said
   21; the sweep found six more the note never named). Detail in §3.
2. **`MarketMovers`' nested `<button>`** — pending; needs a layout call at
   390px, because the Partners-card precedent (a sibling *below*) costs a row
   of height and Movers is a dense list of up to ~30 rows across six sections.
3. **The contents rail wrapping to two lines** — pending; one deliberate
   decision rather than an inherited default, measured at 390px in both themes.
4. **A `Textarea` primitive** — pending; only if it stays genuinely small.

**Found while doing (1), and worth more than (1):** see §3's record — three more
`<lowercase.Uppercase />` lucide leftovers, one of them a live white screen on
`main`, plus a seventh truncation of a load-bearing value that the crash had
been hiding.

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

### OPEN-4 — Accepted-risk findings from the July 2026 review

**Status:** recorded as accepted, not oversights. Re-flagging them as new
findings wastes a session. Restated here in full so the source review
(`docs/archive/repo-review-2026-07.md`) is history only. File:line references
are as of 2026-07-17.

- **F12 — the client never validates a news link's URL scheme.** The pipeline
  does (`scripts/fetch-news.mjs` keeps `^https?://` or null), but the client
  passes `item.link` straight to `<a href>` (`usePlayerIntel`, `useNewsFeed`,
  `useLeagueNews` → `NewsArticleSheet`), and the client-side ESPN fallback
  parser accepts any string. Exploiting it needs repo write access or ESPN
  itself serving a `javascript:` URL, so it is a hardening gap, not a live
  vulnerability. `rel="noopener noreferrer"` is present.
- **F15 — exact standings ties resolve 100/0 by roster-array order**
  (`src/utils/playoffOdds.js`, the seeding sort). Two teams with identical wins
  *and* points-for are seeded by list position, not split 50/50. Fractional
  scoring makes an exact tie vanishingly rare, and the code comments the
  behaviour.
- **F16b — the "↪ flipped" ledger marker needs strictly-greater timestamps**
  (`managerAnalysis.js`), so date-less trade pairs never get it. The net-value
  wash itself is arithmetic-invariant and unaffected.

---

## 3. Closed

| Item | Closed | How |
|---|---|---|
| CODE-REVIEW-1 — the "proper over convenient" review | 2026-10-07 | Review (`docs/analysis/code-review-2026-10.md`) ranked 16 shortcuts by risk to the owner's decisions; the owner answered three questions (Doubtful = a note in trades; two "even" rules on purpose; unknown FAAB budget = `—`) and set the order. All 16 fixed in PRs #79–#94, each with a guard test; tests 841 → 902, gap 43. Found along the way: the MCP trade grader skipped injuries, the IR suggestion ignored full slots. Pipelines now import `src/utils` via the resolver hook (outputs byte-identical, verified on `main`). Phone check owed: ESPN per-player news (#89). Detail in the archive |
| CLEANUP-2 — slim CLAUDE.md | 2026-10-07 | **7,123 → 3,586 lines, 482KB → 229KB (−52%)**, in one `docs:` commit per section. Every rule, contract, invariant and trap stays with its one-line WHY; each section's pre-slim text is preserved **verbatim** in `docs/history/<section>.md` with a pointer at the cut. **Missed the ≤ ~2,000-line target** (and the ~2,250 revised in-session): the contracts alone carry ~3,500 lines once their measurements are gone, and the rule was "when in doubt, it stays". A mechanical audit of all 376 rule-bearing sentences found four dropped clauses, restored. Counts re-verified 828 / 785. Navigation Refactor heading renamed "(complete — history)". Detail in the archive |
| CLEANUP-1 — the repo-wide cleanup | 2026-10-07 | `archive-branches.yml` (run 37556571494) deleted **113** `claude/*` branches and tagged the **9** whose tips `main` lacked as `archive/*`. The dry run's "68" was a shallow-clone artifact: `--is-ancestor` fails behind a graft. Spent docs moved to `docs/archive/` after their still-cited rules and specs were lifted (build plan §0/§8 → §0, §10 → PHASE-4BCD, OPEN-4 restated). This file cut 3,137 → ~800 lines, closed records archived verbatim. `assetGivability` + four `reset*Cache()` deleted (tests unchanged 828 / 785). Four skill drifts + OPEN-3's fixed. Detail in the archive |
| OPEN-3 — the FAAB bid recommender | 2026-10-07 | Shipped as `src/utils/faabBid.js`, one util behind League › Free Agents and `recommend_free_agents` (zod schema extended, verified through a real MCP client). Floor $2 on $1000 (owner's call, dropping the spec's $10); ladder 11/16/23% of the full budget capped at the current period's remainder; no contest prediction, because value barely moves the contest rate. Budget read from settings, never assumed; null for a defense or an unpriced player. Grading bars and protocol pre-registered in the memo's §10 for §0 #13. Detail in the archive |
| NEWS-7 — ESPN RSS gave Actions nothing | 2026-09-22 | The recorded diagnosis ("catch branch, so it throws — 403 or timeout") was wrong on every count: the log read `0 items` in ~95ms, not `FAILED`. The script was made to print what a zero-item 2xx returned, and the next run read **HTTP 202 · text/html · 0 bytes** — a bot-manager deferral, which `res.ok` accepts. Same URL + UA from outside Actions: 200, 29 items. **Removed** at 8 of 12 consecutive misses; the zero-item diagnostic stays. Detail in the archive |
| OPS-2 — a branch dispatch could publish production data | 2026-09-22 | Found by the owner's review question. `news.yml` and `values-history.yml` had no default-branch guard on their publish steps (`rookie-intel.yml` did), so NEWS-4/NEWS-7's verification runs, and the 2026-09-12 retention verification before them, force-pushed feature-branch code to the live `news-data` feed. Both now carry `if: github.ref_name == github.event.repository.default_branch`; a branch dispatch is a dry run. **Post-merge check done 2026-09-22:** `news.yml` dispatched on `main` (run 1237) and the PUBLISHED `news.json` read via git off `news-data`: `playerCap` 1200, `depthHours` 53, ten sources, no `ESPN RSS` key, every `sourceMisses` 0. |
| NEWS-4 — the news cap was binding at 400 | 2026-09-22 | Cap-bound at 56h with breadth healthy (207 players), so raised to **1200** (~7.1 retained/h × 168h; ~144KB wire projected vs 54KB). News page now paged at 50. The raise exposed that **`spanHours` is set by stragglers** (54 → 147h on three items while p90 depth went 51 → 52h), so `coverage.depthHours` was added and the drawer reads it. The 7-day claim is **pending**: re-read `depthHours` 2026-09-29. Detail in §2 |
| ROOKIE-1 — the rookie name fallback could borrow a namesake's value | 2026-09-25 | Dropped rather than position-guarded. `playerMap` is keyed by FantasyCalc's own `sleeperId`, so a name hit could only land on an entry attached to a *different* Sleeper player; live, 0 of 444 rookies joined by name and all 395 FantasyCalc ids resolve to the same name in the player DB, while 7 rookies share name *and* position with someone (a guard would have missed them). All four Draft consumers' input `deepStrictEqual` before/after. Detail in the archive |
| MCP-CARRY: `Retry-After` unreachable from the limiter | 2026-09-25 | `fetchJSON` attaches `status` + `retryAfter` to the error it already threw (message unchanged; 801 pre-existing test results identical); `limit.js` honours both forms, capped at 4s, schedule fallback otherwise, 404 never retried |
| MCP-CARRY: `values-history.json` unread | 2026-09-25 | `get_value_history`, tool 13 — 1,372ms cold / 26ms cached, 8,100B, 9 upstream cold / 0 cached |
| SMALL-1 — the package rationale claimed what it hadn't checked | 2026-09-22 | *"Protects your starters"* printed on **180 of 180** suggestions and was false on **11 of the owner's 20** and **77 of 180** league-wide — it meant "touched nothing ≥ `PROTECT_THRESHOLD`", and a core starter sits at 0.85. `packageRationale` now takes `buildValueLineup(...).starterIds` and names the starter instead; 0 and 0 after, with the claim surviving on 103 of 180 where it is true. Every one of the 180 selected packages is byte-identical, which was the acceptance test — a changed package would mean the search moved, not the copy. Shipped as the prerequisite to MCP-CARRY's trade-targets tool. Detail in the archive |
| OPEN-10 — the two "fair" windows disagreed | 2026-09-21 | The board proposed an offer and the Analyzer, one tap later, called it an overpay: **0 of 20** suggestions on the owner's board and **35 of 180** across all ten seats landed inside `buildFairBand`, at a mean of 1.0965× the target. The mechanism was not the window but the price of an appeal step — crossing 1.05 hands the partner a whole appeal point (worth 1.0 keep-pain) against a ~0.027 distance penalty. Fixed by a **split**, not a narrowing: the suggestion must land inside `buildFairBand` (asked of that function, never a literal), the assembly window feeds `alternative`, which now carries its premium. Owner's board: keep-pain 17.24 → 15.19, value sent −7.3%, in band 0/20 → 20/20, my-side 3 Fair/17 Weak → 18 Fair/2 Weak, verdicts 3A/16C/1D → 8A/12C/0D. All ten seats: value −4.6%, in band 35 → 161 of 180, Weak-for-me 74 → 9. The price: Weak-for-them 31 → 106, stated rather than buried. `APPEAL_BONUS` re-swept and unmoved. Detail in the archive |
| NEWS-6 — a dead source was invisible in both pipelines | 2026-09-21 | Owner asked whether anything warns us when a source changes shape. Zeros were never the risk (nulls, by design) but the silence was real: three snapshot steps are `continue-on-error` and a failed news source is a logged `0`. Checking turned up a LIVE case — **ESPN RSS contributing 0 while returning 25 items to a hand probe** — the second after FantasyPros. Shipped a shared, tested alarm that fails the workflow after a **persistent** gap (never a blip), runs after publish so it cannot cost data, and treats a missing file as an alarm. Detail in the archive |
| PIPE-2 — Phase 4a: the three-source valuation archive | 2026-09-21 | Build-plan §10 4a, approved 2026-09-04 and unbuilt for 17 days — the one item whose cost was permanent. Daily archive of FantasyCalc + DynastyProcess + KeepTradeCut into `values-consensus.json` on the existing `values-history` branch, joined ID-only through db_playerids. Re-probing found KTC had changed shape (JS literal → JSON island) and two crosswalk traps: `"NA"` as a null sentinel on 6,103 rows, and `ktc_id` mapping Frank Gore Jr. onto Frank Gore Sr. Best-effort per source; a failed source is an all-null column, never a 0. 4b/4c not built. Detail in the archive |
| PIPE-1 — the trade-value archive priced every pick at 0 | 2026-09-21 | The snapshot scripts kept the `if (sid)` classifier the app fixed in 2026-07, so `pickEntries` was empty and every pick archived as 0 into a **permanent** file. One shared `scripts/fantasyCalcValues.mjs` (pure, 10 tests), a ladder ending in **null not 0**, and a self-heal that rewrites the archived zeros through the normal publish path. Found by reading the published feed, not the code. Detail in the archive |
| OPS-1 — Vercel built every data-branch push | 2026-09-21 | MCP-2b's integration fix started ~9 junk preview builds a day (first drafted as ~48 from the cron line — corrected by NEWS-5). Fixed with a project-level Ignored Build Step; `git.deploymentEnabled` in `vercel.json` was written and **reverted** as a dead no-op (Vercel reads that file from the pushed branch, and the data branches carry only JSON). Detail in the archive |
| NEWS-3 — re-measure coverage at a 7-day window | 2026-09-21 | **PASS, 18 of 31** against a ≥12 target and a 9–11 prediction. Matching still saturated (achieved == ceiling); volume was the lever, as NEWS-1 ruled. Surfaced NEWS-4. Detail in the archive |
| DESIGN-4 — finish the Matchday cleanup | 2026-09-21 | Closed by audit: all four code items (plus item 5's 46 focus rings) had shipped 2026-09-13 while this file still said "pending". Two owner-only device checks remain. Detail in §2 |
| NEWS-1 — re-measure news coverage after accumulation | 2026-09-12 | **Measured, and it was a REGRESSION: 6 of 30, worse than the 10 of 26 it was opened on, with span collapsed 159h → 27.5h.** Cause was retention, not coverage: eviction was recency-only, so the 240-item cap bound at ~30h and the 7-day window had never once bound; the cap was also spent on redundancy (240 items → just 97 distinct players, one carrying 23). Fixed with diversity-aware eviction (≤3 per player, soft) + cap 240 → 400, sized off **wire** bytes (37KB gzipped, not the 141KB raw the docs assumed). One published run: span **112h**, cap unpinned **186/400**, distinct players **97 → 119**, feed *smaller* on the wire, acceptance **6 → 8 of 30**. Still a MISS; matching is saturated (achieved = ceiling) and the residual is source-*kind*, not source-count. Re-measure at 7 days = **NEWS-3**. Detail in the archive |
| DESIGN-1 — build the "Matchday" visual direction | 2026-09-12 | All five steps shipped. Step 5 (motion) landed the GLOBAL `prefers-reduced-motion` guard first, one easing token (`--ez`) emitted as Tailwind's DEFAULT so all 69 transitions moved at once, a duration ladder scaled to element size, the press run replacing `.edge-rise`'s fade-up and linear stagger, `.press` as the third control-level contract (one definition replacing 41 `active:` states at three values across 20 files), `Loading` replacing every spinner, the sheet entrance, and a written four-moment budget. **0 of 12 slop markers**, re-scored from scratch. Detail in the archive |
| DESIGN-3 — the navigation rebuild | 2026-09-11 | Primary navigation is a bottom tab bar (Today · Squad · Trade · League · Index); the drawer keeps its utilities and carries zero destinations. `SubTabBar` → `SectionContents`, which wraps instead of scrolling, so "Pick Trades" no longer clips. New `/index` route is the complete map and holds the four consulted views. All three copies of the nav payload collapsed into `src/navigation.js`. Draft and News lost top-level rank, not reachability. The four orphans each got a content-level inbound link, and Rookie Research entered global search. No path moved, so no redirect was needed. Detail in the archive |
| DESIGN-2 — four ready-now accessibility/truncation bugs | 2026-09-11 | All four fixed in the primitives and tokens, not at 525 call sites: `--text-tertiary` re-derived to clear WCAG AA in both themes (dark 2.51→4.53:1, light 3.23→4.51:1); `.focus-ring` added as the one focus definition and `Input`/`Select`'s `focus:outline-none` removed; `.tap-target` guarantees a 44px hit area with no layout cost (`IconButton` `md` made a real 44px box) — deliberately NOT on `Chip`, where it would cause the bug it fixes; `Est. cost` and the lineup player name now wrap instead of eliding. Detail in the archive |
| Trade engine over-weighted the partner (3 fixes) | 2026-09-07 | Phase 2 made a cost/appeal trade-off (weight set mid-plateau from a sweep); `myStartersDelta` added and gating the verdict; Layer 4's fill/lineup double-count removed. Detail in the archive |
| Layer 3 scored on a tier that measured the wrong thing | 2026-09-07 | Live playoff odds now score the win window in season (0.988 vs the starting lineup, against the tier's 0.721); tier is the offseason fallback. Killed the dead `Middle` branch that left 40% of the league with no read. Detail in the archive |
| OPEN-2 — roll `PICK_YEARS` after the rookie draft | 2026-09-07 | Removed the annual chore instead: the pick window is derived from `/state/nfl` + the drafts list (`utils/seasonWindow.js`, zero extra fetches). Killed 40 ghost 0-value picks and surfaced 2029 league-wide. Detail in the archive |
| OPEN-7 — the keep-score had no opinion about age or about which pick is which | 2026-09-06 | Measured both (n=762 player-seasons; all 120 of this league's rookie picks), then shipped `PICK_ROUND_KEEP`, `pastPeakTilt`, the cash-out board, the cheaper-`alternative` line, and the untruncated package search. Detail in the archive |
| OPEN-6 — push Layer 4 into Targets and the fair-package builder | 2026-09-06 | Layer 4 extracted as `buildPartnerFit` and shared; `suggestFairPackage` made two-phase; Targets ranked by `need × value × movability`; `suggestSellMove` partner pick made two-sided. Detail in the archive |
| July 2026 repo-review backlog B1–B11 | 2026-07/08 | All eleven landed — mapping in `docs/archive/repo-review-2026-07.md`'s status banner |
| Navigation Refactor Phases 1–3 | 2026-07-20 | Consolidation → `/my-team` + `/league` rename → "Primetime Blackout" visual pass |
| OPEN-1 — FAAB stats mixed two budget scales | 2026-09-20 | The $100 → $1000 change went live, so the trigger fired. Bids are now normalized to percent-of-budget per season; `valuePerBudget` replaces "value per $100" and is continuous with it, so no pre-2026 history is restated. Measured on the live league: four of ten tendency chips corrected, two inverted. Detail in the archive |
| Frontier Item 2 blocking question (are losing FAAB bids visible?) | 2026-08-08 | Verified yes; see `docs/analysis/faab-bid-corpus-2026-08.md`. Superseded by OPEN-3 |
| ACTIVE-1 — season-readiness tests (draft day + Week 1) | 2026-08-08 | Three live contract breaks found and fixed (schedule endpoint, draft `slot_to_roster_id`, stats `pos`/`opp`); 35 new tests (72 → 107) + `scripts/dev/replay-live.mjs`. Detail in the archive |
| ACTIVE-2 — Draft › Research: verify the first pipeline run | 2026-08-14 | Pipeline published 2026-08-14 11:12Z; feed shape, Market vs Model output, and the drawer's Rookies row all verified against live data. Detail in the archive |

Full records for every row: `docs/archive/open-items-2026.md`.
