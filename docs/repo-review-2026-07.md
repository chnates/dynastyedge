# DynastyEdge Repository Review — July 2026

**Scope:** full read-only audit — performance & network efficiency, model math,
correctness, dependencies & CI security, plus guardrail-gap proposals.
**Date:** 2026-07-17, against branch `claude/dynastyedge-repo-audit-bjh1oi`
(same tree as `main` at `36620db`).
**Method:** four parallel workstreams (model-math validation, bundle/perf
measurement, dependency & workflow audit, correctness sweep), evidence
produced in-session (runnable reproductions, measurements, live feed checks),
top findings re-checked by an independent fresh-context verification pass.
Everything already settled in `dynastyedge-failure-archaeology` (status-bar
meta, slotTier doc drift, sparkline threshold, taxi rule, pick-value
fallbacks) was re-verified as still in place and deliberately **not**
re-flagged here.

---

## 1. Executive summary

**Overall verdict: this is a healthy, unusually disciplined codebase.** The
review went looking for hidden bugs, wasted bandwidth, and untrustworthy
numbers — and mostly found the opposite. The architecture rules written in
CLAUDE.md are actually followed in the code: every network call goes through
the one timeout-protected fetch wrapper, every cache behaves the way the
documentation says it does, the app is properly split into lazy-loaded
chunks, and the statistical models passed every first-principles test we
could run offline, including bit-identical determinism of the playoff
simulation. No critical defects were found anywhere.

The three to five things that actually matter:

1. **The daily value-history pipeline can silently destroy its own data.**
   If the script that appends each day's snapshot hits a temporary network
   error while loading the existing 90-day history, it treats that the same
   as "first run", builds a one-day file, and force-pushes it over the
   accumulated history. A related hole can permanently erase the trade-time
   value archive. Neither has fired yet (both feeds were verified alive and
   fresh on 2026-07-16), but both are one bad network moment away, and the
   fix is a few lines. These are the top two backlog items.
2. **There is no safety net.** No tests, no lint, no CI check beyond "it
   builds" — and every push to `main` deploys straight to the phone. The
   model math is correct *today*; nothing prevents a future session from
   quietly breaking it. Three guardrail proposals (a zero-dependency test
   suite, a lint + CI gate, and pipeline-health visibility) are specified in
   the backlog, ready to paste into future sessions.
3. **Every cold app open wastes about 14 network requests.** The playoff-odds
   hook starts fetching the season's matchup schedule before it knows what
   season it is, caches the result under the key `'unknown'`, then fetches
   everything again once the real season arrives. Reproduced with a script;
   an easy fix with a real cellular payoff, since The Edge (the default
   screen) triggers it every time.
4. **The models are verified correct, but not yet verified *accurate*.**
   The Monte Carlo engine, age curves, trade verdicts, pick pricing, and
   hindsight grading all do exactly what they claim, deterministically. What
   nobody can say yet is whether 72% playoff odds means 72% in reality —
   that calibration work (already scoped in the model-quality-campaign
   skill) needs real season data and remains open.

**What's genuinely solid** (each item verified this session, not assumed):
code splitting is real and effective (115 KB gzipped main bundle, the
drag-and-drop library correctly isolated to the Draft Board chunk); the
5–8 MB Sleeper player database is fetched once, trimmed immediately to
~2.6 MB in memory, and never blocks first render; sign-in provably cannot be
locked out by a FantasyCalc outage; the news pipeline's client rendering has
no XSS surface; production dependencies have zero known vulnerabilities;
both GitHub Actions data pipelines are alive and current; and the fixed-seed
random number generator passed 2-million-draw statistical tests.

---

## 2. Findings

Severity reflects user-visible impact. Every finding carries evidence
produced this session. Findings marked **[verified ✓]** were additionally
re-checked by the independent fresh-context verification pass.

### HIGH

**F1 — A transient network error can wipe the 90-day value history. [verified ✓]**
`scripts/snapshot-values.mjs:55-63`, `.github/workflows/values-history.yml:24-39`
The snapshot script's catch block treats *any* failure loading the existing
`values-history.json` — including a 500, a rate-limit, or a timeout from
`raw.githubusercontent.com` — as "no existing history, starting fresh". The
script then exits 0 and the workflow force-pushes a one-day file over the
rolling 90-day window. The data branch is a single-commit orphan, so there is
no history to revert to. The proof this is a bug and not a choice: the
sibling script `scripts/snapshot-trade-values.mjs:46-61` implements exactly
the correct pattern — `err.status === 404` starts fresh, anything else
aborts with "aborting to avoid data loss". The workflow's publish step also
has a re-fetch fallback for `trade-values.json` but none for
`values-history.json`.
**User impact:** all sparklines and The Edge's team-value line silently lose
their shape and take up to 90 days to rebuild (one day per day); the future
model-calibration work loses its data.

### MEDIUM

**F2 — The "permanent" trade-time archive can be erased by one correlated outage. [verified ✓]**
`.github/workflows/values-history.yml:31-37`
The publish step's protection chain is
`cp trade-values.json || curl <previous archive> || true`. If the archive
script failed (it aborts on any non-404 fetch error, and the workflow
continues past it via `continue-on-error`) *and* the fallback `curl` to
raw.githubusercontent.com also fails, `|| true` swallows the failure, the
`[ -f trade-values.json ]` guard silently skips the file, and the force-push
publishes the branch without it. The next day's run gets a legitimate 404
and starts a fresh archive. The two required failures are correlated — both
hit the same host, so a single CDN outage window suffices. Verifier note:
this needs a *double* failure in one run — the curl fallback was clearly
added as the mitigation, so this is residual risk, lower likelihood than F1
but with the same permanent, invisible consequence. Fetching the existing
branch with `git fetch` instead of an HTTP request to the same flaky host
would close it completely.
**User impact:** the manager-scouting ledger's "at trade time" lines vanish
permanently for all previously archived trades (the archive is documented as
never-pruned precisely because trades are immutable).

**F3 — Every cold app load fetches all matchup weeks twice. [verified ✓]**
`src/hooks/usePlayoffOdds.js:82` + `:14-37` + `:93-109`;
`src/components/edge/EdgeView.jsx:131`
The schedule cache is keyed by season, but The Edge (the default route)
mounts `usePlayoffOdds()` before league data arrives, so the season resolves
to the fallback `'unknown'` and 14 `/matchups/{week}` requests fire
immediately. When the real season lands, the cache key mismatches and all 14
fire again. Reproduced with the verbatim cache logic and a mocked fetch
counter (`scratchpad/repro-playoffodds-doublefetch.mjs`): 28 requests in both
timing sequences (league arrives mid-flight or after), where 14 suffice.
When the league arrives mid-flight, the second batch fires on the next
consumer mount (any Trade/Playoffs navigation or Edge remount) rather than
instantly — same 2× cost either way. The stale-keyed batch also always uses
the default `playoff_week_start` of 15, since league settings aren't loaded
yet. Independently corroborated by the performance workstream and re-run by
the verifier (script confirmed a faithful copy of the source logic).
**User impact:** ~14 wasted requests contending with the core league fetches
during first paint, on every app open, on cellular.

**F4 — The 10,000-iteration playoff simulation re-runs for every consumer. [verified ✓]**
`src/hooks/usePlayoffOdds.js:111-153`; consumers at `EdgeView.jsx:131`,
`TradeAnalyzer.jsx:141`, `TradePartnerFinder.jsx:207`, `PlayoffOdds.jsx:177`
Only the fetched schedule is module-cached; the Monte Carlo itself runs in a
per-hook-instance `useMemo`, so navigating The Edge → Trade Partners →
Analyzer → Playoffs runs four independent simulations, and each re-runs when
the league object's identity changes (e.g. when the player DB arrives
mid-session). Measured at 48.7 ms per run under desktop Node (10k iterations,
9 remaining weeks); plausibly 100–200 ms of main-thread jank per mount on an
iPhone (multiplier not measured — see appendix). Dormant right now: in the
offseason the `preseason` status skips the simulation entirely. In-season
only.
**User impact:** perceptible stutter on section navigation during the season.

### LOW

**F5 — Duplicate matchup-week fetching across three hooks.**
`usePlayoffOdds.js:19-24` (weeks 1–14), `useLineupHistory.js:16-23`
(weeks 1–17 in the offseason), `useSleeper.js:25-28` (current week,
in-season). Same endpoint family, three separate caches, zero sharing.
Visiting The Edge plus My Team › Season Review in one session costs ~17
redundant requests (~31 with F3 unfixed).

**F6 — The LeagueContext provider memoization is silently defeated. [verified ✓]**
`useFantasyCalc.js:96-100` declares `retry` as a plain function (new identity
every render) → `useLeague.js:191-194` folds it into the combined `retry`
callback → the provider-value `useMemo` at `useLeague.js:200-210` lists
`retry` in its deps and therefore produces a **new object on every App
render**, contradicting both its own explanatory comment and the
architecture contract's "preserve that memoization" invariant. Impact today
is bounded (App currently re-renders only when data actually changes, so
consumers would re-render anyway), but it is a loaded tripwire: any future
App-level state would cascade re-renders through all 24 `useLeagueContext`
consumer files. Documented side effect: the focus/visibility listeners in
`App.jsx:90-102` detach and re-attach on every App render (cleanup is
correct — churn, not a leak).

**F7 — A total API outage is indistinguishable from "no data" on two pages.**
`useTransactions.js:20`, `usePlayoffOdds.js:22`
Each weekly bucket is wrapped in `.catch(() => [])` — deliberate and correct
for *one* bad bucket, but when **all** buckets fail (offline device, Sleeper
outage, with core league data already cached) the hooks resolve successfully
with empty data and their error paths can never fire. League › Activity then
shows "No transactions yet this season" and League › Playoffs shows the
preseason "odds activate when the schedule posts" hero — both during a
transient outage, instead of the contract's ErrorState + retry. Cheap
detection: if every bucket rejected, throw.

**F8 — The trade counter-suggestion can leave the trade outside the promised ~5% band.**
`src/utils/tradeAnalysis.js:210-216`
The bridging-asset picker takes the *cheapest* asset in its
`[0.8×gap, 1.5×gap]` window rather than the one closest to the gap.
Reproduced (`scratchpad/model-math/a3b-bridger-suboptimal.mjs`): with a 2000
gap it suggests a 1600 asset (post-apply gap still 8%, verdict still
"overpaying") when a 1900 asset on the same roster would land at 2%. In a
38-scenario sweep only 16 landed within ±5% after applying the counter.
CLAUDE.md Feature 3 promises the counter gets "within ~5% raw value". The
suggestion is never *invalid* — just measurably suboptimal. One-line fix:
pick `argmin |value − gap|` within the window.

**F9 — In-flight fetch race can show the wrong roster's lineup history.**
`src/hooks/useLineupHistory.js:12-15`
`loadHistory(rosterId, …)` returns the module-level in-flight promise
regardless of which roster it was started for. Switching identity and opening
Season Review within one fetch window (~seconds) displays the previous
roster's efficiency numbers. Self-corrects on the next mount. Narrow but
real; the same latent pattern in `usePlayoffOdds.loadSchedule` is unreachable
in practice (single league).

**F10 — Two storage accesses violate the "storage must never crash the app" contract.**
`src/main.jsx:7` reads localStorage bare, before React mounts — in a browser
where storage access throws (Safari with "Block all cookies"), the app
white-screens before first render. Every other storage read in the codebase
is try/catch-wrapped (grep-verified: `useIdentity`, `useWatchlist`,
`useLastVisit`, `RosterActionItems`' reader). Second instance:
`RosterActionItems.jsx:17` writes without a guard (read at line 12 *is*
guarded); thrown from a tap handler it only breaks that dismissal, no crash.

**F11 — No `concurrency` guards on any workflow.**
`deploy.yml`, `news.yml`, `values-history.yml` — overlapping runs (cron +
manual dispatch, or a hung run into the next cron) each rebuild and
force-push; last write wins and discards the loser's data. Practical risk is
low (short runs, offset crons); the fix is a three-line `concurrency` block
per workflow.

**F12 — Client never validates news-link URL scheme (defense-in-depth).**
Pipeline-side validation exists and is correct
(`scripts/fetch-news.mjs:54-57` enforces `^https?://` or null), but the
client passes `item.link` straight to `<a href>`
(`usePlayerIntel.js:110`, `useNewsFeed.js:75`, `useLeagueNews.js:52` →
`NewsArticleSheet.jsx:55`), and the client-side ESPN fallback parser
(`usePlayerIntel.js:125`) accepts any string. Exploiting this requires repo
write access or ESPN itself serving a `javascript:` URL — a hardening gap,
not an active vulnerability. `rel="noopener noreferrer"` is present.

**F13 — `npm audit`: one high-severity advisory, not reachable.**
vite ≤6.4.2 (dev-server-only, Windows-only advisories GHSA-v6wh-96g9-6wx3 /
GHSA-fx2h-pf6j-xcff). `npm audit --omit=dev`: **0 vulnerabilities**. Fix is
a patch bump (`npm audit fix` → vite 6.4.3). Do *not* take vite 7/8 or
Tailwind 4 — majors with no benefit for a no-test repo (Tailwind 4 is a
config rewrite the design system isn't built for).

**F14 — Small duplicate endpoint fetches across hooks.**
`/league/{id}` fetched by both `useSleeper.js:16` and
`useLeagueHistory.js:78`; `/drafts` + `/draft/{id}/picks` by both
`useLeagueHistory.js:44-56,94` and `useSleeperDraft.js:17-34`; `/state/nfl`
by both `useSleeper.js:20` and `useLineupData.js:34`. All small responses; a
few redundant round-trips per session.

**F15 — Exact standings ties resolve 100/0 by roster-array order.**
`src/utils/playoffOdds.js:180-183`. Two teams with identical wins *and*
points-for get seeded by list position, not split 50/50
(repro: `scratchpad/model-math/a1-playoffodds-edges.mjs`). Negligible in
practice — fractional points make exact ties vanishingly rare, and the code
comments the behavior — recorded so it's known, not to demand a fix.

**F16 — Three cosmetic/doc-drift items.**
(a) `tradeAnalysis.js:38-43` `hurtStrengths` actually flags giving from
*deficit* positions — which matches CLAUDE.md's own worked example ("selling
QB depth you genuinely need") but not its Layer-2 phrase "hurt a position of
strength"; the verdict copy shown to the user is truthful; doc-phrasing fix
only. (b) `managerAnalysis.js:293-296` — the "↪ flipped" ledger marker
requires strictly-greater timestamps, so date-less trade pairs never get it;
the net-value wash itself was verified arithmetic-invariant and unaffected.
(c) `useTheme.js:7-11` sets the light-mode `theme-color` meta to `#F4F4F8`
while its own comment says it matches `bg-secondary`, which is `#E9ECF5`
(`index.css:11`). **Caution for the fixer:** this sits at the edge of the
settled status-bar battle (failure-archaeology entry 1) — any change needs
an on-device light-mode check in both regular Safari and standalone mode.

---

## 3. Ranked backlog

Ordered by impact ÷ effort. Each item is written as a **ready-to-paste
prompt** for a future session. Items B1–B2 close data-loss holes; B3–B5 are
the guardrail proposals; the rest are ordered fixes.

---

**B1 — Stop the values-history pipeline from wiping its own data (fixes F1)**

> In the DynastyEdge repo, `scripts/snapshot-values.mjs` (~lines 55–63)
> treats ANY failure loading the existing history from the values-history
> branch as "first run — starting fresh", so a transient network error would
> cause the workflow to force-push a one-day file over the 90-day rolling
> history. Copy the guard pattern already used in
> `scripts/snapshot-trade-values.mjs` (~lines 46–61): give the fetch helper
> an `err.status`, start fresh ONLY on 404, and `process.exit(1)` with a
> "aborting to avoid data loss" message on any other error. Additionally, in
> `.github/workflows/values-history.yml`, add a curl re-fetch fallback for
> `values-history.json` in the publish step, mirroring the one that exists
> for `trade-values.json`. Read the `dynastyedge-change-control` skill before
> committing. Acceptance: a simulated non-404 failure (point HISTORY_URL at
> an invalid host locally) exits non-zero without writing values-history.json;
> a 404 still starts fresh; a normal run appends today's column exactly as
> before (run the script locally and diff the JSON shape).

**B2 — Make the trade-archive preservation fallback fail loudly (fixes F2)**

> In `.github/workflows/values-history.yml` (publish step, ~lines 31–37),
> the chain `cp trade-values.json || curl <previous archive> || true` can
> silently force-push the values-history branch WITHOUT trade-values.json
> when both the archive script and the curl fallback fail (correlated —
> same host), permanently erasing the never-pruned trade-time archive.
> Preferred fix: replace the HTTP re-fetch with a `git fetch` of the
> existing `values-history` branch (different failure domain than the CDN)
> and copy the previous `trade-values.json` from it; at minimum, replace the
> `|| true` with a hard step failure (e.g.
> `|| { echo "cannot preserve trade archive — aborting publish"; exit 1; }`)
> so the branch stays untouched on that day; it self-heals the next run.
> While in the file, add a `concurrency: { group: values-history }` block
> (and equivalents in `news.yml` and `deploy.yml` — for deploy use GitHub's
> recommended `group: pages`) to prevent overlapping-run force-push races
> (fixes F11). Acceptance: workflow YAML is valid (`actions` linter or a
> dry `workflow_dispatch` run), and the failure path is exercised by
> temporarily pointing the curl at a 404 URL in a scratch copy of the step
> logic locally.

**B3 — Guardrail: zero-dependency regression tests for the pure utils**

> In the DynastyEdge repo, create a `tests/` directory at the repo root with
> plain `node:assert/strict` test scripts (NO new npm dependencies — this is
> the sanctioned pattern in the `dynastyedge-validation-and-qa` skill, §6,
> which also documents the module-resolver hook at
> `.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs` that
> makes `src/utils`' extensionless imports work under Node). Add a
> package.json script:
> `"test": "node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs --test tests/"`
> (Node's built-in `node:test` runner; zero installs). Cover, in priority
> order: (1) `playoffOdds.js` — fixed-seed determinism (two runs
> deep-equal), threshold boundaries 0.70/0.35, Σ playoffPct = playoffTeams,
> projWins+projLosses = games; (2) `pickCapital.js` + `pickTrades.js` —
> `resolvePickOwnership`, `findPickValue` fallback chain, `slotTier`
> (assert the CODE's behavior: Early = slots 1–4 in a 10-team league — a
> known doc divergence, do not "fix" it here), `suggestPickPackages`
> constraints (1–3 picks, each strictly < target, totals 80–145%);
> (3) `managerAnalysis.js` — unpriced past pick falls back to round median
> with `approx: true` and is never 0, ±5%-of-trade-size win/loss banding is
> strictly-greater; (4) `tradeAnalysis.js` — verdict ladder, % computed
> against the larger side, counter never suggests an asset already in the
> trade; (5) `dynastyTrajectory.js` — per-year clamp 0.55–1.18, unranked/
> no-age players hold flat, picks mature at their draft year;
> (6) `lineupHistory.js` — optimal-lineup slot filling order (single-
> position slots, then FLEX, then Superflex). Creating `tests/` is a
> structural change: update CLAUDE.md's File Structure section in the same
> commit and note the new `npm test` command (read
> `dynastyedge-change-control` first). Acceptance: `npm test` green; every
> assertion cites which documented behavior it pins.

**B4 — Guardrail: ESLint + CI quality gate**

> In the DynastyEdge repo, add a lint + CI gate so pushes to `main` are
> checked for real mistakes before the auto-deploy publishes them. This
> requires TWO new devDependencies — `eslint` (v9, flat config) and
> `eslint-plugin-react-hooks` — which the repo's no-new-deps law reserves
> for owner sign-off: this backlog item IS that sign-off if you approve it.
> (`react-hooks/exhaustive-deps` is the single highest-value rule for this
> codebase: this review found a defeated context memoization and a
> stale-closure-prone memo it would have flagged.) Steps: `.eslintrc` flat
> config (`eslint.config.js`) with recommended + react-hooks rules, scoped
> to `src/` and `scripts/`; fix or explicitly disable-with-comment any
> existing violations; add `"lint": "eslint src scripts"` to package.json;
> then add lint + `npm test` (from the tests backlog item, if landed) as
> steps in `.github/workflows/deploy.yml` BEFORE the build step, so a broken
> push fails before publishing. Update CLAUDE.md (rules section + workflows)
> in the same commit. Acceptance: `npm run lint` exits 0 locally; a
> deliberately introduced unused variable fails CI in a test push on a
> branch; deploy on main is unchanged when checks pass.

**B5 — Guardrail: pipeline-health visibility (how you find out a feed died)**

> In the DynastyEdge app, the two GitHub Actions data feeds (news.json,
> values-history.json) can die silently: the client hides stale feeds by
> design, `updatedAt` is never surfaced, and GitHub disables cron workflows
> after ~60 days without repo activity (both pipelines die together; pushes
> by the workflows themselves do NOT reset that clock). Two changes,
> proposals approved by this backlog item: (1) CLIENT — in
> `src/components/shared/SideDrawer.jsx`'s data-freshness block, show the
> age of each feed using the `updatedAt` field both feeds already carry
> (they're already fetched and session-cached via `useValueHistory` and
> `loadNewsFeed` — zero new requests; read the hooks, don't add fetches).
> Render e.g. "News 26m · Values 12h", amber-tinted when news > 2h or
> values > 36h stale, hidden entirely when a feed never loaded (Class B
> degradation contract — never an error). (2) WORKFLOW — add a keepalive
> step to `.github/workflows/values-history.yml`: if the last commit on
> `main` is older than 45 days, push an empty commit (github-actions bot
> commits to the DEFAULT branch do reset the 60-day clock; this is the
> documented mechanism of the keepalive-workflow pattern). Read
> `dynastyedge-architecture-contract` (Class B contract) and
> `dynastyedge-change-control` first; update CLAUDE.md in the same commit.
> Acceptance: drawer shows both ages at 390px without layout breakage;
> feeds failing to load produce no error UI; keepalive step is a no-op when
> main is fresh (verify by reading the step's date logic and running its
> shell condition locally).

**B6 — Fetch the playoff schedule once, not twice (fixes F3)**

> In the DynastyEdge repo, `src/hooks/usePlayoffOdds.js` starts fetching all
> regular-season matchup weeks before the season is known: EdgeView (default
> route) mounts the hook while `leagueInfo` is null, so `season` falls back
> to `'unknown'` (line ~82), 14 requests fire and cache under that key, and
> everything refetches when the real season arrives — 28 requests where 14
> suffice. Reproduce it first: copy `loadSchedule` (lines ~11–37) into a
> scratch script with a mocked, counting fetchJSON and replay
> `loadSchedule('unknown', 15)` then `loadSchedule('2026', 15)`. The fetch
> effect is at lines ~93–109. Fix: bail out of the fetch effect while
> `leagueInfo == null && nflState == null` (no request until the season and
> `playoff_week_start` are known); keep the module cache keyed by season.
> Do NOT change the sim or its fixed seed. Acceptance: a Node script that
> replays the mount sequence against the (extracted or imported) cache logic
> shows exactly 14 requests; `npm run build` green; League › Playoffs, The
> Edge briefing item, Trade Analyzer Layer 3, and Partner Finder flags all
> still render (offseason: preseason preview state).

**B7 — Run the Monte Carlo once per data change, not once per consumer (fixes F4)**

> In the DynastyEdge repo, `src/hooks/usePlayoffOdds.js` runs the
> 10,000-iteration `simulatePlayoffs` inside a per-hook-instance `useMemo`
> (lines ~111–153), so each of the four consumers (EdgeView,
> TradeAnalyzer, TradePartnerFinder, the PlayoffOdds page) pays ~50–200 ms
> of main-thread work on mount during the season. Add a module-level memo of
> the derived results keyed by the inputs' identities (the schedule
> `perWeek` reference, the `league` reference, playoffTeams, myRosterId can
> stay per-instance — only the expensive sim + model need sharing), so
> navigating between sections reuses one simulation. Keep the sim pure and
> the fixed seed 0x5eed untouched; determinism (identical numbers across
> renders AND across consumers) must hold. Acceptance: add a temporary
> counter/log proving `simulatePlayoffs` executes once when visiting
> Edge → Trade → Playoffs in one session (remove it before commit), and a
> before/after timing note; `npm run build` green.

**B8 — Trivial hygiene batch: vite patch, retry identity, preconnects, storage guards (fixes F13, F6, F10, part of F8's neighborhood)**

> In the DynastyEdge repo, four small isolated fixes in one session:
> (1) run `npm audit fix` — takes vite 6.4.2 → 6.4.3 (patch; clears the only
> audit finding, dev-server-only). Do not touch any other version.
> (2) In `src/hooks/useFantasyCalc.js`, wrap `retry` (~line 96) in
> `useCallback` with stable deps so the LeagueContext provider `useMemo` in
> `src/hooks/useLeague.js` (~200–210) actually holds one object identity
> across renders as its comment claims (the unstable identity currently
> defeats it; same pattern already used in `useSleeper.js`'s `fetchData`).
> (3) In `index.html`, add `<link rel="preconnect">` for
> `https://api.sleeper.app`, `https://api.fantasycalc.com`, and
> `https://raw.githubusercontent.com` next to the existing font preconnects
> — these origins gate first data paint on cellular.
> (4) Wrap the bare `localStorage.getItem` in `src/main.jsx:7` and the bare
> `setItem` in `src/components/roster/RosterActionItems.jsx:17` in
> try/catch, matching the storage contract every other access follows.
> Acceptance: `npm run build` green; `npm audit` clean; a React DevTools
> highlight-updates pass (or a render-count probe) confirms LeagueContext
> consumers no longer re-render on unrelated App renders; app boots with
> DevTools' storage blocked (simulate by overriding localStorage getter to
> throw in the console).

**B9 — Counter-suggestion picks the closest bridging asset (fixes F8)**

> In the DynastyEdge repo, `src/utils/tradeAnalysis.js` (~lines 210–216,
> `bestBridger`): the counter-offer bridging asset is chosen as the CHEAPEST
> asset inside the `[0.8×gap, 1.5×gap]` window, which can leave the applied
> counter outside the ±5% "fair" band CLAUDE.md Feature 3 promises (e.g. gap
> 2000 → suggests 1600 → 8% residual, when a 1900 asset would land at 2%).
> Change the selection to minimize `|value − gap|` within the same window
> (keep the window, the never-suggest-in-trade-assets exclusion, and the
> side logic untouched). Acceptance: a node:assert script (pattern:
> validation-and-qa skill §6) showing (a) the 2000-gap case now selects the
> 1900 asset, (b) a sweep where the share of post-apply residuals ≤5%
> strictly improves over the current build, (c) zero suggestions of assets
> already in the trade across randomized trades. Update CLAUDE.md only if
> the visible behavior wording changes.

**B10 — Share one matchup-weeks fetch between playoff odds and lineup history (fixes F5)**

> In the DynastyEdge repo, `src/hooks/usePlayoffOdds.js` (weeks
> 1..playoff_week_start−1) and `src/hooks/useLineupHistory.js` (weeks 1..17
> offseason / 1..current−1 in-season) independently fetch the same
> `/league/{id}/matchups/{week}` endpoints into separate module caches
> (~17 redundant requests when both features are visited). Extract one
> shared module-cached loader (suggested: a new `src/hooks/` helper or an
> export from usePlayoffOdds) that fetches a week range once and lets
> lineup history derive "my entries" from the full-entries cache — playoff
> odds already keeps full entries. Preserve both hooks' public APIs and
> degradation behavior (per-week `.catch(() => [])`). While there, make the
> shared loader reject when EVERY week failed, so League › Playoffs and the
> Season Review show ErrorState instead of masquerading as "preseason"/
> "no data" during a total outage (fixes F7 for these consumers; apply the
> same all-buckets-failed check to `useTransactions.js` for League ›
> Activity). Acceptance: a mocked-fetch Node script proving one fetch per
> week across both consumers and an all-fail rejection; `npm run build`
> green; offseason UI unchanged.

**B11 — Documentation truth-up batch (fixes F16a/c + two known drifts)**

> In the DynastyEdge repo, a docs-only commit (read
> `dynastyedge-change-control` and `dynastyedge-docs-and-writing` first —
> CLAUDE.md edits are owner-gated; this backlog item is the owner's ask):
> (1) CLAUDE.md rule 16: remove the stale "No
> apple-mobile-web-app-status-bar-style meta" claim and describe the actual
> settled design (black-translucent meta + light-mode safe-area strips, per
> commit 78b6c29 and failure-archaeology entry 1). Do NOT touch index.html.
> (2) CLAUDE.md Feature 13 + the inline comment at
> `src/utils/pickTrades.js:14`: state the code's real slot tiers for a
> 10-team league (Early = 1–4, Mid = 5–7, Late = 8–10; ceil(teams/3)). Do
> NOT change the code.
> (3) CLAUDE.md Feature 3 Layer-2 phrasing: "does what you're giving hurt a
> position of strength" → describe the implemented check (giving from a
> below-average position — selling depth you need), matching the code
> (`tradeAnalysis.js:38-43`) and CLAUDE.md's own worked example.
> (4) `src/hooks/useTheme.js` comment (~line 6): either correct the comment
> (the light value is deliberately #F4F4F8, near but not equal to
> bg-secondary #E9ECF5) or — only if the owner wants visual alignment —
> change the value to #E9ECF5 WITH an on-device light-mode check in regular
> Safari and standalone (this sits at the edge of settled battle #1; the
> comment-only fix is the safe default).
> (5) Add `useLineupData` (per-mount fetch, no module cache — deliberate) to
> the architecture-contract skill's cache table so the one undocumented
> fetch-y hook is documented.
> Acceptance: no behavior diffs (`git diff` touches only .md files and
> comments); each edit cites its evidence commit/line in the commit message.

---

## 4. Unverified hypotheses appendix

Plausible, worth checking later, but **not demonstrated this session** —
none of these are findings:

1. **Live wire sizes.** `api.sleeper.app` and `api.fantasycalc.com` are
   proxy-blocked in this sandbox (CONNECT 403), so the documented ~5–8 MB
   `/players/nfl` size, the FantasyCalc payload size (likely hundreds of KB,
   on the first-data-paint path), and the possibly MB-scale
   `/stats/nfl/regular/{year}` season-stats response are unmeasured.
   Recipes to measure them are in `dynastyedge-validation-and-qa` §3
   (owner-runnable).
2. **iPhone multiplier on the 48.7 ms simulation measurement** — assumed
   2–4×, not measured on device.
3. **Playoff-odds calibration.** The engine is deterministic and
   mathematically correct, but whether its probabilities are *accurate*
   (Brier score vs the ~0.24 climatology floor, reliability curves) needs
   real past-season replays — the open Phase 1 of
   `dynastyedge-model-quality-campaign`. Related: the variance model keeps
   `std` at the baseline until 3 games are played and carries no
   mean-uncertainty term; a synthetic replay suggested weeks 1–2 odds are
   overconfident. Suggestive, not real-data evidence.
4. **Age-curve accuracy on the real FantasyCalc pool** and any multi-year
   trajectory accuracy — first honestly testable ~mid-2027 when the
   snapshot archive is a year deep.
5. **In-season UI branches unexercised.** It is the offseason; matchups,
   lineup optimizer, deadline banner, and live playoff-odds surfaces were
   audited by code-reading only.
6. **Prototype-pollution via hostile keys in the pipeline scripts** — no
   exploit constructible (per-object bracket assignment, no global
   pollution); `Object.create(null)` would remove even the theoretical case.
7. **GitHub-side recoverability of a force-push-erased data branch** (via
   support/events API) — unknown; B1/B2 must not rely on it.
8. **GitHub Pages serving the 174 KB rookie CSV gzipped on the wire** —
   likely (gzip potential measured), unverified from this sandbox.

---

## 5. What was reviewed

**Examined in full** (read line-by-line this session): CLAUDE.md; the
architecture-contract, failure-archaeology, data-contracts, and
validation-and-qa skills; all of `src/hooks/` (21 hooks); `src/App.jsx`,
`src/main.jsx`, `src/utils/fetchJSON.js`, `src/utils/edgeBriefing.js`,
`src/utils/rosterAnalysis.js` (tier math); `src/components/edge/EdgeView.jsx`
and `src/components/league/LeagueActivity.jsx`; all three
`.github/workflows/` files and all three `scripts/*.mjs` pipeline scripts;
`package.json` / lockfile versions.

**Measured / executed:** `npm ci`, `npm run build` (matches the documented
baseline: main chunk 368.6 KB raw / 114.7 KB gzip; dist total 912 KB /
425 KB gzip), sourcemap-based main-chunk attribution (react-dom 48.7%, app
code 34%), `npm audit` (+ production-only), `npm outdated`, live freshness
checks of all three static feeds (fresh as of 2026-07-16), retained-memory
estimate of the trimmed player DB (~2.6 MB), `simulatePlayoffs` timing
(48.7 ms / 10k iterations), and the full model-math battery: RNG uniformity
(2M draws), Box–Muller normality (1M draws), fixed-seed determinism
(byte-identical SHA-256), Monte Carlo convergence vs binomial error,
shrinkage-blend exactness, trajectory curve recovery on synthetic pools with
planted outliers, clamp exactness, 2000-inventory pick-package property
check against a brute-force reference, 500-trade counter-suggestion
exclusion check, and hindsight-grading band/fallback/flip-wash checks.
Scripts referenced by findings live in the session scratchpad and are
reproduced in each finding's description; the reusable recipes they were
built from are in `dynastyedge-analysis-toolkit`.

**Verified but not re-flagged** (settled items from failure archaeology,
confirmed still in place): black-translucent status-bar meta + light-mode
strips; `slotTier` Early/Mid doc divergence (folded into backlog B11 as the
pending doc fix it was already known to need); `MIN_SPARKLINE_POINTS = 4`;
taxi flags at `years_exp >= 2`; pick-valuation fallback chains; the trade
preload precedence contract; the two sanctioned keyboard-aware sheets.

**Deliberately skipped:** pixel-level UI / design-system compliance (the
repo's `/design-review` skill owns that); on-device iOS behaviors (focus
zoom, visualViewport sheets, swipe-dismiss arming, standalone status bar —
untestable from a sandbox, flagged owner-required where relevant);
live-API spot checks (proxy-blocked — the §3 recipes in validation-and-qa
are the owner's runbook); component files not listed above were covered by
targeted greps (storage keys, raw fetch, position-color usage) rather than
full reads.

**Independent verification pass:** findings F1, F2, F3, F4, F6 were
re-checked by a fresh-context verifier against the cited evidence before
inclusion. The model-math and dependency findings carry their own runnable
evidence produced by their respective workstreams.
