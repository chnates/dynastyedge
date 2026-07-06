---
name: dynastyedge-research-frontier
description: >
  The open research problems where DynastyEdge can advance its state of the art —
  load when asked "what should we build next", "how do we make this smarter",
  "where's the biggest win", or BEFORE starting any new intelligence,
  recommendation, briefing, bidding, or trade-suggestion feature. Defines 6
  frontier items (briefing decision-quality measurement, FAAB bid research,
  trade-acceptance modeling, buy-low timing, proactive delivery, multi-league
  non-goal) with verified repo assets, analysis-only first steps, and falsifiable
  result criteria. Nothing here is a promise to build; every build is gated by
  owner ask and change control.
---

# DynastyEdge Research Frontier

**North star (owner's words): assistant-GM autonomy — the app proactively
surfaces the right move at the right time. Decision quality, not more
dashboards.**

This skill exists so future sessions invest effort where it compounds. It is a
map of open problems, not a backlog. Every item below is labeled **open** (or
**parked**); none is promised, scheduled, or pre-approved. All facts and file
references were verified against the repo **as of 2026-07-05**.

## When NOT to use this skill

- **Routine feature work** (a new view, a UI fix, a data-contract change) →
  CLAUDE.md is the doc of record; gate the change through
  `dynastyedge-change-control`.
- **Validating or calibrating models that already exist** (trend thresholds,
  playoff-odds accuracy, trajectory curve sanity, pick pricing) → that is the
  sibling **`dynastyedge-model-quality-campaign`**. Calibration is a
  *prerequisite* several items below reference — do not duplicate it here.
- **How to run an analysis** (harness conventions, offline replay mechanics) →
  `dynastyedge-analysis-toolkit`. **How to do research honestly** (nulls,
  held-out data, pre-registered thresholds) → `dynastyedge-research-methodology`.
  Every item below must follow that discipline.
- Anything that would contradict CLAUDE.md's **Future Features** section:
  the FAAB bid recommender is explicitly *do-not-build-yet* (research is fine;
  the build needs an explicit owner ask), and push notifications are noted as
  blocked on Sleeper's read-only API + the no-backend architecture. Item 5
  below explores the honest edges of that constraint — it does not override it.

## The constraint envelope (what "advancing SOTA" means here)

Verified as of 2026-07-05:

- **No backend, no secrets in the client.** Static SPA on GitHub Pages. The
  only server-side compute is GitHub Actions cron publishing static JSON to
  data branches (`news-data`, `values-history` — see
  `.github/workflows/news.yml`, `values-history.yml`).
- **Sleeper API is read-only** and (per CLAUDE.md's Future Features note) does
  not expose *pending* trade offers. We observe only completed transactions.
- **One user, one league** (`src/constants.js`: league `1313933520715907072`,
  roster 6). No A/B tests, tiny N — statistical claims must be humble and
  every threshold pre-registered before looking at outcomes.
- **No new npm deps** for the app; the Actions scripts (`scripts/*.mjs`) use
  Node built-ins only.
- **All builds are gated.** CLAUDE.md: do not implement future features until
  explicitly asked. Items below therefore specify *analysis-only* first steps,
  and anything that would touch shipped code, a workflow, or CLAUDE.md is
  flagged **[owner sign-off]**.

What makes this project's frontier real: commercial dynasty tools
(KeepTradeCut, DynastyProcess, FantasyCalc itself) publish *market-wide*
values and generic advice. None of them has what this repo has — **a complete,
multi-season, per-manager behavioral corpus for one specific league**
(`useLeagueHistory` walks the `previous_league_id` chain; `managerAnalysis.js`
already ledgers every trade, bid, and rookie pick) **plus a daily price
archive** (`values-history` branch) that makes advice *replayable after the
fact*. The edge is league-specific and self-measuring; that is the whole
thesis.

---

## Item 1 — Briefing decision-quality measurement: did The Edge call it?

**Status: open.** The single highest-leverage item — it converts the north
star from a vibe into a number, and it is the acceptance test for every other
item on this list.

**Problem.** The Edge (`src/utils/edgeBriefing.js` → `buildBriefing`,
`computeEdgeSignals`) ranks up to 5 briefing items every morning. Nobody knows
whether those items were the moves that mattered. Concretely: of the
value-positive moves that actually happened in the league in a window
(trades and waiver pickups whose acquired assets appreciated at today's
prices), what fraction did the briefing surface *beforehand*?

**Why current SOTA fails.** No commercial dynasty tool measures its own
advice. KTC/DynastyProcess publish values, never "we told you to buy X on
date D and here is how that aged." The app's own heuristics are equally
unmeasured: `computeEdgeSignals` picks buy-low as *the single most-negative
`trend30Day` player ≥ 1000 value at a deficit position* (verified,
`edgeBriefing.js` lines ~50–62) — a plausible rule with zero evidence it
selects players who subsequently recover.

**This project's specific asset (verified).**
- `buildBriefing` / `computeEdgeSignals` are **pure functions** — replayable
  with historical inputs, no fetches inside.
- `useTransactions.js` caches the full season transaction log with
  `status_updated` timestamps (completed only); `useLeagueHistory.js` extends
  that to every past season.
- `values-history.json` (daily per-player prices, 90-day rolling,
  `scripts/snapshot-values.mjs`) gives price-at-date and price-30-days-later.
- `trade-values.json` (permanent trade-time archive,
  `scripts/snapshot-trade-values.mjs`) anchors trade valuations at execution
  time, forever.
- `useLastVisit.js` documents the visit-diff model the briefing already uses.

**First three concrete steps (analysis-only).**
1. Read `edgeBriefing.js` end to end and write down, in the analysis notes,
   the exact selection rule for each of the 9 item types (verified ids:
   `draft-live`, `deadline`, `playoff-odds`, `draft-prep`, `fresh-tx`,
   `buy-low`, `sell-high`, `pickup`, `watch-mover`, `underperformer`,
   `closing-window`) and which of them make a *falsifiable claim* (buy-low,
   sell-high, pickup, closing-window, underperformer do; deadline/draft
   reminders don't — score only the falsifiable ones).
2. Define the metric precisely before touching data (pre-register per
   `dynastyedge-research-methodology`): e.g. **hit rate** = fraction of
   league moves in window W whose acquiring side gained ≥ X% at +30 days
   (from `values-history.json`) that appeared in the briefing top-5 on any
   day in the 14 days before the move; plus **advice return** = +30-day price
   change of the specific buy-low/sell-high player vs. the median same-position
   player.
3. Build a replay harness (per `dynastyedge-analysis-toolkit` conventions —
   scratch script, not committed without sign-off) that feeds historical
   snapshots into `computeEdgeSignals`. Practical hurdle, noted honestly:
   `edgeBriefing.js` imports `getTeamName` from `../hooks/useLeague` and a
   constant from `../hooks/useValueHistory` — importing under Node works
   (react is installed; those imports don't execute fetches) but verify, and
   reconstruct historical `trend30Day` from the values-history columns
   (today's cached `trend30Day` is current-only). The 90-day rolling window
   caps the replayable period — see Item 4's data-limit note.

**You have a result when** you can state, from a script anyone can re-run:
"over window W (dates), the briefing's falsifiable items had hit rate H
against N qualifying league moves, and its buy-low picks returned R% at +30
days vs. B% for the positional baseline" — including if H and R are bad.
A measured *negative* result is a result; it redirects Items 2–4.

**Depends on:** `dynastyedge-model-quality-campaign` (if `trend30Day` and the
value scale aren't trustworthy, this metric measures noise — check the
campaign's findings first).

---

## Item 2 — FAAB bid recommender: the research track (build is gated)

**Status: open (research only).** CLAUDE.md lists the FAAB bid recommender
under Future Features — **do not build the feature without an explicit owner
ask**. The research below is analysis-only and is exactly what should exist
*before* anyone builds it.

**Problem.** When a player worth bidding on hits waivers, what's the smallest
bid that wins? Overbid and you starve future claims; underbid and you lose the
player for nothing.

**Why current SOTA fails.** Commercial advice is generic percent-of-budget
tiers ("bid 15–20% for a starting RB") calibrated on thousands of leagues'
averages. It knows nothing about *this* 10-team league's actual clearing
prices or which specific opponents chase which positions. The app itself
currently offers no bid guidance at all.

**This project's specific asset (verified).**
- `managerAnalysis.js` → `buildFaabStats` already aggregates, per owner across
  every season: dollars spent, claims, `avgBid`, hindsight `valueAcquired`,
  `valuePer100`; `buildTendencies` derives "Aggressive bidder" /
  "Bargain hunter" labels vs. league average.
- The raw material is richer than the aggregate: every completed waiver claim
  with its winning `settings.waiver_bid`, timestamp, and player, across all
  seasons (`useLeagueHistory.js` + `useTransactions.js`).
- `values-history.json` gives the player's market value near claim time (for
  claims after the pipeline started), so bids can be normalized to value tier.

**Known data gap (flag prominently).** Both `useTransactions.js` and
`useLeagueHistory.js` filter to `tx.status === 'complete'` at ingestion
(verified) — **losing bids are invisible to the app today**. Sleeper's
transaction buckets may include *failed* waiver claims (status `failed`) with
their bid amounts; if true, that's the difference between modeling only
clearing prices and modeling the full bid distribution. **This is unverified
— confirm against the live API** (this sandbox blocks fantasy APIs; a session
with network access should hit
`/league/1313933520715907072/transactions/{week}` and inspect non-complete
entries before designing anything around them).

**First three concrete steps (analysis-only).**
1. Extract the historical winning-bid table: for every waiver claim in league
   history, record (season, week, bid, player, player's value tier at claim
   time where values-history covers it, winning owner). Pure read of existing
   caches/feeds; no app changes.
2. Characterize the market: winning-bid distribution by value tier; per-owner
   aggression profiles (does owner X systematically pay 2× median for RBs?);
   budget-depletion curves over the season (late-season bids should clear
   cheaper).
3. **[live-data check]** Verify whether failed claims with bids are available
   (see gap above). Then define the backtest: a bid rule
   `f(value tier, week, remaining budgets of aggressive owners)` evaluated by
   replaying historical claims.

**You have a result when** a candidate bid rule, backtested on held-out
seasons, **would have won ≥ K% of the claims that were historically won at ≤
the median dollars actually spent** (pre-register K — 80% is a reasonable
opening ask), with the caveat honestly stated if only winning bids were
observable (a clearing-price model, not a full auction model). That memo —
not code — is what the owner sees before any build decision.

---

## Item 3 — Trade-acceptance modeling: what offer structure does each manager say yes to?

**Status: open.**

**Problem.** The Trade Analyzer answers "is this trade good for me?"
(`tradeAnalysis.js` → `analyzeTrade`). The assistant-GM question is one step
earlier: **"what offer will this specific human accept?"** A fair-value offer
in the wrong *shape* (three depth pieces to a consolidator; players to a pick
accumulator) dies in their inbox.

**Why current SOTA fails.** KTC-style calculators score value symmetry and
stop. They cannot know that the owner of roster 3 has accepted five
pick-heavy offers and zero player-for-player ones. The app is already ahead —
`buildTendencies` (`managerAnalysis.js`) derives "Accumulates picks" /
"Buys youth" / "Chases WRs" chips — but those are descriptive labels shown to
the user, not applied to shape the Analyzer's suggestions
(`getCounterSuggestion` and `suggestFairPackage` in `tradeAnalysis.js`
optimize value fit only; verified).

**Hard limit, stated up front.** Sleeper never shows rejected or pending
offers (CLAUDE.md Future Features note; the API is read-only). We observe
**accepted trades only** — a one-class problem. Honest framing: this is
*structure profiling of accepted trades*, not acceptance-probability
modeling. Claims must be phrased as "matches what they have accepted," never
"predicts they will accept."

**This project's specific asset (verified).**
- `buildTradeLedgers` (`managerAnalysis.js`) — every completed trade in
  league history, per participant, with full asset composition (players with
  ages/positions, picks, FAAB), net value, win/loss/even at ±5%
  (`TRADE_EDGE`), flip-tracking, and partner ids.
- `buildManagerProfiles` composes ledgers + tendencies + FAAB + draft records
  into per-owner profiles already consumed by the Managers view and the Trade
  Partner Finder one-liners.
- `trade-values.json` gives trade-time (not just hindsight) valuations for
  trades since the archive started.

**First three concrete steps (analysis-only).**
1. Define a structure taxonomy for each historical accepted trade side:
   consolidation (2+-for-1) vs. spread; pick share of value received; age
   gradient (got younger vs. older); position flow. Compute it per manager
   from the existing ledgers — a pure transform, no new data.
2. Test stability: split each manager's ledger chronologically; does the
   structure profile from the first half describe the second half better than
   the league-average profile does? (Tiny N per manager — report counts, not
   just rates; some managers have 1–2 trades and get "insufficient data,"
   which the UI already handles as "cold call".)
3. **[owner sign-off]** Only if step 2 shows stability: propose (do not
   build) wiring the profile into `suggestFairPackage` /
   `getCounterSuggestion` as a package-shape preference — e.g. prefer
   pick-inclusive packages when the partner accumulates picks. Route the
   proposal through `dynastyedge-change-control`.

**You have a result when** per-manager offer-structure templates, fit on the
first half of each ledger, **match the structure of held-out accepted trades
better than the league-average baseline** on a pre-registered similarity
measure — or when step 2 shows profiles are unstable at this N, which parks
the item with evidence.

---

## Item 4 — Timing intelligence: do buy-low windows actually pay?

**Status: open.**

**Problem.** The entire buy-low/sell-high apparatus (Market Movers, The
Edge's briefing items, `computeEdgeSignals`) rests on one untested premise:
that `trend30Day < −50` on a good player is a *dip that mean-reverts* rather
than the start of a permanent repricing. If falling players keep falling,
"buy-low" advice is systematically buying knives.

**Why current SOTA fails.** FantasyCalc/KTC show trend arrows; none publish
whether their own dips revert. DynastyProcess sells historical value data but
no timing signal. The app's threshold (±50, `TREND_THRESHOLD` in
`edgeBriefing.js`; same rule in CLAUDE.md's display spec) is a display
convention, not a measured signal.

**This project's specific asset (verified) — and its honest limit.**
- `values-history.json`: daily per-player prices — but a **90-day rolling
  window** (`MAX_DAYS = 90`, `snapshot-values.mjs`) over the **top 500**
  players. That is roughly two non-overlapping 30-day-event → 30-day-outcome
  windows per player *today*. The corpus grows daily; the analysis gets more
  powerful every month it's deferred, which is fine — the harness can be
  built now and re-run.
- `trade-values.json` is **permanent** (never pruned) — sparse but
  ever-lasting price anchors at trade dates, usable as long-horizon
  checkpoints beyond the 90-day window.
- `useValueHistory.js` → `getSeries(sleeperId)` is the app-side reader;
  the analysis should read the branch JSON directly (schema in
  `dynastyedge-data-contracts`).

**First three concrete steps (analysis-only).**
1. Event-study harness: from the values-history columns, find all
   (player, date) events where the trailing-30-day change crossed −50 (and
   separately +50), then measure forward 30- and 60-day returns where the
   window allows. Null hypothesis: forward return of dippers = forward return
   of matched same-position, same-value-tier non-dippers over the same dates.
2. Condition on the variables the app already has: age vs. peak window
   (`utils/peakWindows.js`), position, value tier. The dynasty prior says
   young-player dips revert and post-peak dips don't (`buildAgeCurves` in
   `dynastyTrajectory.js` encodes the cross-sectional version of this; the
   event study is its longitudinal test).
3. **[owner sign-off]** Draft (do not apply) a one-line workflow proposal if
   the 90-day window proves binding: e.g. additionally archive one column per
   month permanently, or raise `MAX_DAYS` with a measured file-size cost
   (mobile payload is the stated reason for 90/500 — respect it). Route
   through `dynastyedge-change-control`; it touches a GitHub Actions data
   contract.

**You have a result when** you can report a **signed forward-return statistic
with a confidence interval for trend<−50 events vs. the hold-everything
null**, split by age-vs-peak-window — including "no detectable signal at
current corpus size, re-run after N more months," which is a legitimate,
dated finding that should be recorded so no session re-fights it
(cf. `dynastyedge-failure-archaeology`).

**Depends on:** the model-quality campaign's verdict on values-history data
integrity (gaps, replaced columns, top-500 churn) before trusting event
detection.

---

## Item 5 — Proactive delivery: how does the right move reach the owner without a backend?

**Status: open (feasibility memo, not a build).** The north star says
*proactively surfaces* — today The Edge is pull-only: intelligence exists
only when the owner opens the app. CLAUDE.md already rules that push
notifications for trade offers are blocked (read-only Sleeper API + no
backend). This item maps what *is* honestly possible for the briefing itself.

**Why current SOTA fails.** Sleeper pushes raw events (trade completed,
waiver won) with zero judgment. No dynasty tool pushes *analysis* ("buy-low
window on X opened yesterday"). The blocker here isn't intelligence — the
briefing already exists — it's delivery within a static-site architecture.

**The real options, enumerated honestly (as of 2026-07-05):**

| Option | Mechanism | Needs | Honest status |
|---|---|---|---|
| A. Precomputed briefing JSON | Actions cron runs briefing-shaped logic server-side, publishes `briefing.json` to a data branch; PWA reads it on open | Porting/refactoring parts of `edgeBriefing.js` for Node reuse (it's already pure); a new workflow | Still pull, but makes the briefing timestamped and instant-on-open; also the substrate for B/C. **[owner sign-off]** — new workflow + code moves |
| B. GitHub-native notification | The cron workflow opens/updates a GitHub issue when the briefing has a high-priority item; GitHub emails the owner | Only the built-in `GITHUB_TOKEN` — **zero new secrets** | Most honest near-term push path; spam risk needs a priority threshold; owner must want GitHub email. **[owner sign-off]** |
| C. Email via Actions | Cron sends mail through an SMTP provider | An SMTP secret in repo settings | Violates the spirit of "no secrets" only mildly (repo secrets ≠ client secrets — CLAUDE.md bans a backend, not Actions secrets; still a policy call for the owner). **[owner sign-off]** |
| D. iOS PWA Web Push | Home-screen web apps can receive Web Push on iOS 16.4+; Actions sends the push | VAPID keypair (secret), a place to store the push subscription (no backend — single-user hack: commit the subscription JSON to the repo), and Web Push encryption in a dep-free Node script (nontrivial) | **Most speculative — every clause needs verification** (iOS support specifics for this PWA config, subscription persistence, payload crypto without new deps). Do not present to the owner as feasible until a spike proves it |

**This project's specific asset (verified).** `edgeBriefing.js` is pure and
fetch-free (its inputs arrive resolved), so option A is a refactor, not a
rewrite; the two existing workflows (`news.yml`, `values-history.yml`) are
the proven template for cron → static JSON, including the 60-day cron
auto-disable caveat documented in CLAUDE.md.

**First three concrete steps (analysis-only).**
1. Inventory exactly which `computeEdgeSignals` inputs are reproducible in
   Node from public APIs (rosters, values, transactions: yes — the snapshot
   scripts already fetch them) vs. client-only (watchlist, last-visit
   localStorage: no — a server-side briefing is watchlist-blind; note it).
2. Write the feasibility memo comparing A–D on: secrets required, failure
   modes (silent-cron-death), spam risk, and what fraction of briefing items
   each can carry. Recommend an order (A → B is the low-risk path).
3. **[owner sign-off]** Present the memo. Build nothing until the owner picks
   an option — and record the decision in change-control.

**You have a result when** the memo exists with every "needs verification"
box either verified or explicitly left open, and the owner has accepted or
rejected a path. The result is a decision, not a feature.

---

## Item 6 — Cross-league generalization

**Status: parked (explicit non-goal).**

**The question.** Should the app support other leagues / other users?

**The reasoning for parking it (recorded so it isn't re-litigated).**
- The app is single-league *by design*: `src/constants.js` hardcodes league,
  roster, username; every model recalibrates from live data (age curves from
  the FantasyCalc pool, tiers from live rosters) so the *math* would port —
  but the plumbing (identity, per-league storage keys, Actions pipelines
  parameterized per league) is a large tax with **one user and zero demand**.
- The one real research argument for multi-league — more data for
  calibration — is weak here: FantasyCalc values are already market-wide;
  the league-specific corpora (manager behavior, FAAB clearing prices) are
  valuable *because* they're this league's. Other leagues' managers don't
  inform bids against these ten.
- Every hour spent generalizing is an hour not spent on Items 1–5, which
  advance the actual north star.

**Unpark only if** the owner explicitly asks for a second league, or an item
above hits a data-size wall that another league's history would genuinely
solve (none currently would). Until then, treat any "make it configurable"
impulse as scope creep and cite this section.

---

## How these items relate

Item 1 is the keystone: it is the measurement layer that makes Items 2–4
evaluable and Item 5 worth delivering. The recommended order for any session
picking this up: check `dynastyedge-model-quality-campaign` findings first
(calibration underlies everything) → Item 1 harness → whichever of 2/3/4 the
owner's questions point at → Item 5 memo when there is something measured
worth pushing. Run every analysis under `dynastyedge-research-methodology`
discipline and `dynastyedge-analysis-toolkit` mechanics; record dead ends in
`dynastyedge-failure-archaeology`.

## Provenance and maintenance

- **Authored 2026-07-06** from direct reads of, as of repo state 2026-07-05:
  `src/utils/edgeBriefing.js`, `managerAnalysis.js`, `playoffOdds.js`,
  `dynastyTrajectory.js`, `tradeAnalysis.js`, `recommendations.js`,
  `src/hooks/useLeagueHistory.js`, `useTransactions.js`, `useValueHistory.js`,
  `useTradeTimeValues.js`, `useLastVisit.js`,
  `scripts/snapshot-values.mjs`, `scripts/snapshot-trade-values.mjs`, and
  CLAUDE.md (Features 11, 12, 14, 17; Future Features).
- **Marked speculative in the text and to be re-verified live:** whether
  Sleeper returns failed waiver claims with bid amounts (Item 2); every
  clause of the iOS Web Push row (Item 5, option D). This sandbox could not
  reach fantasy APIs; nothing in this file was prototyped against live data.
- **Maintain this file when:** an item produces a result (change its Status
  to *measured* with a one-line finding + date, or move the write-up to the
  analysis notes and link it); the owner green-lights or rejects a build
  (record it); a constraint changes (Sleeper API surface, pipeline windows,
  the Future Features list); or a new frontier item earns a slot (it must
  arrive with verified assets and a falsifiable result criterion, like the
  others). Do not let this file accumulate promises — it describes open
  problems, and its value is that every claim in it is checkable.
