---
name: dynastyedge-debugging-playbook
description: >
  Symptom-to-triage playbook for debugging the DynastyEdge app. Load when a
  symptom is reported or observed: app stuck on spinner, blank screen, infinite
  loading, sign-in / login broken, player shows "—" instead of a value, player
  missing from roster view, wrong numbers, pick valued at 0, trade totals look
  wrong, FAAB not counted, sparkline missing, news section gone, stale news or
  values as an in-app symptom (this playbook is the first stop for symptom
  triage; operating/re-running the pipelines is dynastyedge-run-and-operate,
  measuring feed freshness is dynastyedge-diagnostics-and-tooling), section
  disappeared, offseason weirdness, iOS-only bugs (black status
  bar, dead bar above home indicator, keyboard covers input, page zooms on
  focus, background scrolls, sheet won't swipe-dismiss), cache confusion, or
  "works on desktop but not on the phone". Contains discriminating experiments
  to split API-side vs app-side vs device-side causes.
---

# DynastyEdge Debugging Playbook

Symptom → first check → fix location, for this app's *actual* recurring
failure modes. Every claim below was verified against source and `git show`
on 2026-07-05.

**30-second orientation** (full domain glossary: `dynasty-fantasy-reference`):
DynastyEdge is a one-user React 19 + Vite SPA on GitHub Pages (no backend),
used on iPhone Safari / installed home-screen PWA at 390px. It joins two free
APIs — Sleeper (league/rosters, numeric player IDs) and FantasyCalc (dynasty
trade values, carries `sleeperId` as the join key) — plus static JSON feeds
built by GitHub Actions on the `news-data` and `values-history` branches.
There are **no tests, no linter**; the only machine check is `npm run build`
(verified green 2026-07-05, ~3.4s). `CLAUDE.md` at repo root is the doc of
record *except where code demonstrably diverges* — one known divergence is
documented in §5 below.

## When NOT to use this skill

- **Making a change / shipping a fix** → `dynastyedge-change-control`
  (main auto-deploys to the owner's phone; every push must be shippable;
  behavior changes update CLAUDE.md in the same commit).
- **Deep history of a past incident** ("why is this code the way it is") →
  `dynastyedge-failure-archaeology`. This skill carries the *triage*; that
  one carries the full sagas and commit chains.
- **What a field/endpoint/storage key means, full key inventory** →
  `dynastyedge-data-contracts`.
- **Build errors, dev-server, Node/Vite environment, sandbox proxy issues** →
  `dynastyedge-build-and-env`.
- **Running utils in Node, harnesses, resolver hooks** →
  `dynastyedge-diagnostics-and-tooling` (referenced throughout; §8 has an
  inline fallback if its scripts are absent).
- **Verifying a fix before ship** → `dynastyedge-validation-and-qa`.
- **Model quality (trajectory/odds outputs look "dumb" but not broken)** →
  `dynastyedge-model-quality-campaign` / `dynastyedge-analysis-toolkit`.
- **Architecture rules you'd be tempted to violate while fixing** →
  `dynastyedge-architecture-contract`.

## 1. Master triage table

| Symptom | First check | Likely cause | Discriminating experiment | Fix location | Sibling |
|---|---|---|---|---|---|
| Spinner forever on app load | Wait 15–45s: does it flip to an error card? | If it flips → an API is down/hung (fetchJSON timeout worked). If truly forever → someone bypassed `fetchJSON` or broke `loading` state | `curl` the API directly (§8.1, needs open network); grep for raw `fetch(` in `src/` | `src/utils/fetchJSON.js`, offending hook | `dynastyedge-architecture-contract` |
| Blank screen (no spinner, no error) | Browser console for a JS throw; `npm run build` | Render crash or lazy-chunk failure — *never* an intended state ("every API call needs loading + error state") | Desktop browser with devtools open; check the route in `src/App.jsx` | The throwing component | `dynastyedge-change-control` |
| Can't sign in / login list empty | Is it Sleeper or FantasyCalc that's failing? | Login must depend on Sleeper **only** — `signInRosters` in `src/hooks/useLeague.js:146` | Block `api.fantasycalc.com` in devtools; login must still work. If it doesn't, someone rewired LoginScreen to `league`/`values` | `src/components/auth/LoginScreen.jsx` (reads `signInRosters`, `sleeperError`) | `dynastyedge-architecture-contract` |
| Player shows `—` for value | Is the player in FantasyCalc's response? | **By design**: unranked-player contract — name from player DB, value `—`, contributes 0 | §8.2: check `playerMap[String(id)]` in Node/console | Only a bug if the player *is* FantasyCalc-ranked → join bug, `src/hooks/useLeague.js:44-93` | `dynastyedge-data-contracts` |
| Player entirely missing from roster | Has the ~5–8MB player DB loaded yet? | `useLeague.js:65` skips players unknown to *both* FantasyCalc and the (still-loading) player DB — they appear when the DB lands | Wait/refresh; if still missing check ID string normalization (`String(pid)`) | `src/hooks/useLeague.js`, `src/hooks/usePlayerDB.js` | `dynastyedge-data-contracts` |
| Pick valued 0 / `—` | Which season is the pick? | Pick-valuation trap family — FantasyCalc only lists *future* generic picks; entries retire after the NFL draft | §3: run `findPickValue` in Node against live `pickEntries` | `src/utils/pickCapital.js:53`, `src/utils/pickTrades.js` (`makePickPricer`), `src/utils/managerAnalysis.js` | `dynastyedge-failure-archaeology` |
| Trade totals "wrong" | Are you expecting trade-time prices? | **By design**: Activity + manager ledgers grade at *today's* prices; FAAB displays but counts 0 | Compare against the "At trade time" line (only if archived) | `src/components/league/LeagueActivity.jsx:73`, `src/utils/managerAnalysis.js:243` | `dynasty-fantasy-reference` |
| Sparkline missing | How many snapshots does the player have? | **By design**: hidden under 4 points (`MIN_SPARKLINE_POINTS`) | Fetch `values-history.json` raw URL, count non-null entries for that sleeperId | `src/hooks/useValueHistory.js:38` | — |
| News section vanished | Nothing — this is the contract | **By design**: news hides on *any* failure, never errors | Fetch `news.json` raw URL yourself | `loadNewsFeed` in `src/hooks/usePlayerIntel.js:82` (`.catch(() => [])`) | — |
| News/values stale for days | Commit date on `news-data` / `values-history` branches | GitHub cron auto-disabled after ~60 days repo inactivity; or workflow failing | `git ls-remote` + raw-URL `updatedAt` (§6, needs network) | `.github/workflows/news.yml`, `values-history.yml`; any push re-enables cron | `dynastyedge-run-and-operate` |
| Matchups / Lineup optimizer / projections gone | `season_type` from `/state/nfl` | **By design**: offseason hides in-season UI (`isOffseason = season_type !== 'regular'`) | Check `nflState.season_type` in console/curl | `src/hooks/useLeague.js:166` + consumers (LineupOptimizer, EdgeView, TradeLayout, LeagueOverview) | — |
| "Record" sort option gone | Has any team played a game? | **By design**: hidden when no records; persisted `record` sort silently falls back to value | `roster.settings.wins/losses/ties` all 0? | `src/components/league/LeagueOverview.jsx:123-125,196` | — |
| Bug only on the installed home-screen app | Reproduce in desktop Safari responsive mode | iOS-PWA family: safe-areas, visualViewport, status-bar meta, scroll architecture | §5 + §8.3 | `index.html`, `src/App.jsx`, sheet components | `dynastyedge-failure-archaeology` |
| Data won't refresh / stale in-app | What layer of cache? | Session module caches vs 30-min SWR vs local/sessionStorage | §7 cache map; targeted key clear, not blanket | Various hooks | `dynastyedge-data-contracts` |
| Sheet won't swipe-dismiss | Is the sheet's content scrolled to top? | **By design**: drag arms only at `scrollTop === 0` (commit 5b8668f) | Scroll sheet content to top, then swipe | `src/hooks/useSheetDrag.js` | — |

## 2. Spinner / blank-screen family

Load order (verified in source):

1. `useSleeper` (`src/hooks/useSleeper.js`) — `Promise.all` of 5 endpoints
   (league, rosters, users, traded_picks, `/state/nfl`), then matchups only if
   in-season. **One rejection fails the whole batch** → `error` set, ErrorState
   + retry renders.
2. `useFantasyCalc` (`src/hooks/useFantasyCalc.js`) — one big fetch, module
   cache. Throws deliberately on non-array response **and on an empty
   `playerMap`** (line 52 guard: a silently-empty map would blank every roster).
3. `usePlayerDB` — background; app renders without it, unranked players pop in
   when it lands.

Key facts:

- `loading = sleeperLoading || fcLoading`; `league` is `null` until **both**
  `sleeperData && fcValues` exist (`useLeague.js:20,24`). A FantasyCalc outage
  therefore blocks the main app (by design — values are the product) but must
  **never** block sign-in: `signInRosters` (`useLeague.js:146-163`) derives
  from Sleeper data alone, and `LoginScreen.jsx` reads only
  `signInRosters/sleeperLoading/sleeperError/sleeperRetry`. If a values outage
  locks the login screen, someone broke this contract.
- `fetchJSON` (`src/utils/fetchJSON.js`) hard-aborts at **15s default**;
  FantasyCalc overrides to 30s, player DB to 45s. So "spinner forever" is
  structurally impossible *if* every call routes through `fetchJSON` — a
  permanent spinner means either a raw `fetch()` snuck in
  (`grep -rn "fetch(" src/ | grep -v fetchJSON`) or a hook forgot to flip
  `loading` in a catch path.
- Blank (no spinner, no error) = render crash. This app has no error
  boundary around routes; a throw inside a lazy chunk blanks `<main>`. Check
  console first, then `npm run build`.

## 3. "Numbers look wrong" — the pick-valuation trap family

This is the most re-offending bug family in the repo. Root mechanism:
**FantasyCalc only prices *generic future* picks** ("2026 Mid 1st" as pseudo-
players with no `sleeperId`). `findPickValue` (`src/utils/pickCapital.js:53`)
does a string match — `name.includes(season) && name.includes('1st'|…)` —
and takes the **median** of matches. No match → **returns 0**, and a 0 sails
silently through every sum.

Two documented incidents (run `git show <sha>` for the full story; deep
narrative in `dynastyedge-failure-archaeology`):

- **4f31aad** (2026-06-12) — Manager scouting priced every traded *past*
  pick at 0 (FantasyCalc lists no past drafts) and pick→player resolution
  required `slot_to_roster_id`, which Sleeper often omits on older drafts.
  Fix: resolve from the draft's pick list, falling back to `draft_order` +
  that season's user→roster map; unresolved past picks fall back to the
  **median of that round** across listed picks, flagged `approx`
  (`src/utils/managerAnalysis.js:187`) and shown with `≈`.
- **1ef480a** (2026-06-13) — After the *NFL* draft, FantasyCalc retires
  current-season generic pick entries (they became named rookies), but the
  *league's* rookie draft hadn't happened, so live picks priced 0 →
  `suggestPickPackages` bailed on `if (!targetValue) return []` → every pick
  showed "no package gets close". Fix: `makePickPricer` in
  `src/utils/pickTrades.js` — prices a current-season pick by the rookie
  projected at its slot (derived rookie ADP) or the round-median rookie.
  Same commit fixed a latent `p.value ?? 0` on roster pick objects (they
  carry no `.value`).

**Triage rule:** any 0/`—` pick value → ask *which season* and *which pricing
path* (generic `findPickValue`, slot-level `findSlotPickValue`, rookie-class
`makePickPricer`, or manager-ledger median fallback). The calendar matters:
the danger window is between the NFL draft (late April) and the league's
rookie draft.

Other "wrong numbers" that are contracts, not bugs:

- **FAAB counts 0** in trade totals everywhere — displayed as `$X FAAB` but
  `value: null` (`LeagueActivity.jsx:73-75`) / `value: 0`
  (`managerAnalysis.js:243-247`).
- **All hindsight totals are at today's prices**, not trade-time. The
  trade-time line appears only when the best-effort archive
  (`useTradeTimeValues`) has a **complete** entry — partial entries return
  null rather than mislead.
- **Unranked players contribute 0** to roster totals (see §4).
- Trend arrows: green/red only past **±50** on `trend30Day`.

## 4. "By design, not a bug" — read before chasing ghosts

Silent-hide contracts. If the symptom is on this list, close the ticket.

| Observation | Contract | Source |
|---|---|---|
| News section/headlines absent, no error | News must never block a panel, error, or retry-loop; any failure → hide | `loadNewsFeed` `.catch(() => [])`, `src/hooks/usePlayerIntel.js:82-86`; `useLeagueNews.js` |
| Sparkline missing on some/all players | Hidden until ≥ 4 non-null snapshots (straight-segment "graphs" read as broken) — commit 31a7b32 | `MIN_SPARKLINE_POINTS = 4`, `src/hooks/useValueHistory.js:38-57` |
| No team-value sparkline on The Edge | Same threshold via `buildTeamValueSeries` | `src/utils/edgeBriefing.js:395` |
| "At trade time" line absent in scouting ledger | Best-effort archive; missing/partial entry → line hides | `src/hooks/useTradeTimeValues.js` |
| Value history missing entirely | Best-effort; bad shape / missing branch → `historyFailed`, silent | `src/hooks/useValueHistory.js:14-33` |
| Matchups / weekly projections / lineup optimizer gone | Offseason (`season_type !== 'regular'`); Optimizer shows a placeholder | `src/hooks/useLeague.js:166`; `LineupOptimizer.jsx:170` |
| "Record" sort option missing | No games played yet; persisted `record` sort → value | `LeagueOverview.jsx:123-125,196` |
| Player value shows `—`, roster total ignores them | Unranked-player contract: FantasyCalc has no entry; name from player DB, `value: 0`, `unranked: true` | `src/hooks/useLeague.js:60-92` |
| Buy-Low / Sell-High sections show a one-line hint | Deliberate: these two *never* vanish silently; Risers/Fallers/Watching *do* hide when empty | `src/components/league/MarketMovers.jsx` |
| Playoff-odds buyer/seller flags absent | Odds consumers degrade silently offseason | `usePlayoffOdds` consumers (Analyzer L3, Partner cards, Edge) |
| Rookie "Rk ADP" shows `—` | Rookie with no FantasyCalc rank sorts to bottom by design | `src/utils/rookieAdp.js` |

## 5. iOS-PWA symptom family

Only reproducible (or reproducible *differently*) on the installed
home-screen app. Two iron rules first:

1. **PWA meta changes only apply after the user removes and re-adds the app
   to the home screen.** A "fix didn't work" report may just mean the app
   wasn't re-added (that's exactly how 78b6c29's regression stayed hidden).
2. **Known CLAUDE.md divergence (as of 2026-07-05):** CLAUDE.md rule 16 says
   *no* `apple-mobile-web-app-status-bar-style` meta; `index.html:18` ships
   `content="black-translucent"`. **Code + git history win.** Saga:
   cfd9ad0 (theme-color approach) → 3083f0c (revert) → 78b6c29 (restore
   black-translucent + the light-mode-only dark strip behind the always-white
   status text, `src/App.jsx` `dark:hidden bg-[#0D0D0F]` div). Do not "fix"
   index.html to match CLAUDE.md.

| Symptom (installed app) | Root cause + commit | Where |
|---|---|---|
| Black band / unreadable status bar | Status bar is black-translucent; page paints under it; light mode needs the dark strip div | `index.html:18`, `src/App.jsx` strip; 78b6c29, cfd9ad0, 3083f0c |
| Dead black bar above home indicator | (a) `<main>` must run to `bottom: 0` with the inset as *inner* `paddingBottom` — never shorten `<main>` (86903a7); (b) `overflow:hidden` on html/#root clips fixed descendants on iOS — lock **body only** (e8cd044) | `src/App.jsx` `<main>` styles; `src/index.css` |
| Background gradient scrolls, content doesn't | `<main>` is the app's *only* scroller; body must be locked (`height:100%; overflow:hidden; overscroll-behavior:none`) — 8929f74 | `src/index.css`, `src/App.jsx` |
| Keyboard covers sheet input / list runs behind keyboard | `fixed` + `vh` use the *layout* viewport; keyboard shrinks only the *visual* viewport. The two keyboard-aware sheets size to `window.visualViewport` — 781599c, ba75c67; top-padded by `env(safe-area-inset-top)+8px` so the header stays below the notch — 18d0a13 | `PlayerSearchSheet.jsx:77-95`, `TradeBuilder.jsx:207+` (the two *sanctioned* hand-rolled sheets; every other sheet uses `Sheet` from `src/components/ui`) |
| Page zooms when focusing an input | iOS zooms on focus if control font < 16px; guarded app-wide via `@media (pointer: coarse)` forcing 16px — e98260f | `src/index.css:179-184`; keep components at `text-sm`, never re-fix locally |
| Sheet won't swipe-dismiss / rubber-bands | Drag arms **only** when sheet content is at `scrollTop === 0` and finger moves down > 8px; closes past 120px or flick > 0.4 px/ms; requires native non-passive listeners (React's synthetic touchmove is passive) — 5b8668f | `src/hooks/useSheetDrag.js` — never duplicate the gesture |
| Page behind a sheet scrolls | Every sheet must call `useScrollLock()` (freezes `<main>`) + `overscroll-contain` | `src/hooks/useScrollLock.js` |

Full incident narratives: `dynastyedge-failure-archaeology`.

## 6. Data-pipeline staleness (news / values / trade archive)

Feeds are static JSON on orphan branches, force-pushed by Actions
(as of 2026-07-05): `news-data/news.json` (cron `17,47 * * * *`),
`values-history/{values-history.json,trade-values.json}` (cron `41 9 * * *`).
URLs in `src/constants.js:20,25,30` (raw.githubusercontent.com).

Triage stale feeds — **these need network; posture varies per session
(probe first — restricted sandboxes 403 the fantasy APIs, open sessions
reach them; canonical posture: `dynastyedge-diagnostics-and-tooling`).
Never claim you ran one if it failed:**

```bash
# Branch tips — when did the pipeline last publish? (requires open network)
git ls-remote https://github.com/chnates/dynastyedge.git news-data values-history

# Feed self-reported freshness (requires open network; ~5-min CDN cache on raw URLs)
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json | head -c 200
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json | head -c 300
```

Likely causes, in order:

1. **GitHub disables cron workflows after ~60 days without repo activity.**
   Any push to the repo re-enables them; or trigger manually
   (`workflow_dispatch` on both workflows).
2. Workflow failing: check Actions runs. News only hard-fails when *all five*
   sources return nothing (keeps previous feed). The trade-archive step is
   `continue-on-error` and the publish step re-fetches the previous archive
   on script failure — a bad run can't erase it.
3. You're seeing the ~5-minute CDN cache on raw.githubusercontent.com, or the
   in-app once-per-session cache (§7). Not a bug.

## 7. Cache map — what to clear when debugging

| Layer | What | Lifetime / refresh |
|---|---|---|
| Module cache (JS memory) | FantasyCalc values (`useFantasyCalc`), player DB (`usePlayerDB`), value history, trade archive, news feed, transactions, league history, draft sync | Per *session* (page load). FantasyCalc alone gets 30-min stale-while-revalidate on tab focus (`STALE_AFTER_MS`, `src/App.jsx:55,88-101` — silent, keeps stale data on screen). Draft sync refetches on focus at 10s (live) / 5min (idle) and polls 30s while drafting (`useSleeperDraft.js:9-10`). Hard reset = reload the page. |
| sessionStorage | `dynastyedge_trade_draft` (in-progress trade), `dynastyedge_league_sort/pos/tier` (League filters) | Tab lifetime. A "stuck" trade builder or pre-filtered League view is usually one of these. |
| localStorage | `dynastyedge_theme`, `dynastyedge_watchlist_v1`, `dynastyedge_identity_v1` (login — clear to force the LoginScreen), `dynastyedge_action_dismissals`, `dynastyedge_edge_last_visit`, `dynastyedge_board_order`, `dynastyedge_prospect_notes`, `dynastyedge_csv_rankings`, `dynastyedge_draft_tracker_2026` | Persistent. Full key contract + shapes: `dynastyedge-data-contracts`. |

**Reset surgically** — clear the one key implicated, never
`localStorage.clear()` (it nukes the owner's board order, notes, and CSV
rankings, which have no backup). Example, in the console:
`sessionStorage.removeItem('dynastyedge_trade_draft')`.

Note `useIdentity` already wipes roster-scoped keys on identity switch — a
"lost my dismissals after switching teams" report is by design.

## 8. Discriminating experiments

### 8.1 API-side vs app-side

Curl the source of truth, compare with what the app renders.
**Requires open network — varies per session, probe first (restricted
sandboxes 403 api.sleeper.app / api.fantasycalc.com; open sessions reach
both — verified 2026-07-19). If blocked, run on a machine with egress or
ask the owner; never fabricate output.**

```bash
# Sleeper (league 1313933520715907072; my roster_id = 6)
curl -s https://api.sleeper.app/v1/state/nfl
curl -s https://api.sleeper.app/v1/league/1313933520715907072/rosters | head -c 2000
curl -s https://api.sleeper.app/v1/league/1313933520715907072/traded_picks | head -c 2000

# FantasyCalc — params must never change (Superflex, 10-team, half-PPR)
curl -s 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5' | head -c 2000
```

If the API returns what you expect and the app doesn't show it → app-side
(join, cache, or contract). If the API is wrong/down → not your bug; verify
the app degrades per its contracts (§4). The owner's law: verify against the
**real live league**, never mocks.

### 8.2 Logic vs render

Every model lives in pure utils (`src/utils/*.js` — no React, no fetches).
Run the suspect function in Node against captured JSON before touching any
component. Trap (verified): utils use **extensionless ESM imports**
(`import { findPickValue } from './pickCapital'`), so plain `node` fails with
`ERR_MODULE_NOT_FOUND`. Use the canonical resolver hook owned by
`dynastyedge-diagnostics-and-tooling` — `scripts/reg.mjs` + `loader.mjs` in
that skill's directory (both exist on disk; verified 2026-07-07):

```bash
# With the diagnostics skill's hook:
node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
  -e "const m = await import('/home/user/dynastyedge/src/utils/pickCapital.js'); \
      console.log(m.findPickValue({season:'2027', round:1}, JSON.parse(require('fs').readFileSync('/tmp/pickEntries.json'))))"
```

Emergency fallback ONLY if the skill dir is ever missing — a minimal loader
that appends `.js` (write to your scratchpad, not the repo; the diagnostics
copy is canonical):

```js
// scratch/loader.mjs
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) }
  catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && spec.startsWith('.')) return next(spec + '.js', ctx)
    throw e
  }
}
// scratch/reg.mjs
import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
```

Same output in Node as on screen → the util is fine, bug is in wiring/props/
cache. Different → you've isolated pure logic with a reproducible input.

### 8.3 Device vs code (iOS)

1. **Desktop browser, responsive mode 390×844.** Reproduces layout math,
   *not* iOS behaviors (visualViewport keyboard shrink, safe-area insets,
   scroll chaining, focus-zoom, status-bar meta).
2. **iPhone Safari (tab).** Adds real touch + keyboard + rubber-banding.
   Safe-area insets are ~0 in-tab; `env()` bugs still hide here.
3. **Installed home-screen app.** The only place status-bar meta, standalone
   safe-areas, and manifest behavior exist — and metas only update after
   **remove + re-add** (§5).

If it reproduces at level 1 → ordinary CSS/JS, fix normally. Only at 2–3 →
you're in §5's family; check the relevant commit before inventing a new fix —
most of these were fixed once already, and regressions here have a history of
coming from "cleanups".

## Provenance and maintenance

Verified 2026-07-05 against working tree @ `git log -1 --format=%h` and
commits 4f31aad, 1ef480a, 31a7b32, 5b8668f, 86903a7, e8cd044, 8929f74,
e98260f, 781599c, 18d0a13, ba75c67, 78b6c29, cfd9ad0, 3083f0c (all confirmed
ancestors of HEAD). Not verifiable from this sandbox (network-blocked):
live API responses, feed-branch freshness, the ~60-day cron-disable behavior
(documented in CLAUDE.md + GitHub docs). Re-verify volatile facts:

- Timeouts: `grep -n TIMEOUT src/utils/fetchJSON.js; grep -n timeoutMs src/hooks/useFantasyCalc.js src/hooks/usePlayerDB.js`
- Sign-in contract: `grep -n signInRosters src/hooks/useLeague.js src/components/auth/LoginScreen.jsx`
- Sparkline threshold: `grep -n MIN_SPARKLINE_POINTS src/hooks/useValueHistory.js`
- Status-bar divergence still live: `grep -n status-bar-style index.html` (vs CLAUDE.md rule 16)
- Pick pricing paths: `grep -n "makePickPricer\|findPickValue" src/utils/pickTrades.js src/utils/pickCapital.js`
- SWR window: `grep -n STALE_AFTER_MS src/App.jsx`
- Storage keys: `grep -rhoE "dynastyedge_[a-z_0-9]+" src | sort -u`
- Build still the only gate: `npm run build` (and confirm no test/lint scripts in `package.json`)
