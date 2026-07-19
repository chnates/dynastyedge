---
name: dynastyedge-validation-and-qa
description: >
  How to VERIFY work in the DynastyEdge repo — the evidence hierarchy, the
  pre-commit checklist, real-data spot-check recipes, the 390px mobile
  discipline, degradation-contract QA, and the sanctioned no-dependency test
  pattern. Load this BEFORE declaring any change "done", "fixed", "verified",
  or "working"; BEFORE committing anything; when the user asks "is this
  verified?" or "did you test this?"; when adding or proposing tests; and when
  deciding what counts as proof for a claimed improvement. Companion to
  dynastyedge-change-control (which gates the commit; this skill defines the
  evidence those gates demand).
---

# DynastyEdge Validation & QA

This repo has **no test suite, no lint, no typecheck**. `npm run build` is the
only machine gate (verified in `package.json` — scripts are `dev`/`build`/
`preview` only, as of 2026-07-06). That means the burden of proof is on YOU,
and this skill defines what proof means here. The app is a static React SPA
for one real Sleeper dynasty league, used daily on an iPhone at 390px. A wrong
number ships straight to the owner's phone: every push to `main` auto-deploys.

## When NOT to use this skill

- **Deciding whether a change is allowed at all, or how to land it** — that is
  `dynastyedge-change-control` (gates, classification, CLAUDE.md same-commit
  rule). This skill supplies the *evidence* those gates demand.
- **Diagnosing why something is broken** — `dynastyedge-debugging-playbook`.
- **UI design-system compliance review** — run the `/design-review` skill
  (it is one line-item on the checklist below, not replaced by this skill).
- **Understanding API payload shapes** — `dynastyedge-data-contracts`.
- **Judging model output quality** (playoff odds calibration, trajectory
  accuracy) — `dynastyedge-model-quality-campaign`. This skill can prove a
  model is *deterministic and unchanged*; it cannot prove it is *good*.
- **Writing or running measurement/probe scripts** — the scripts and the Node
  loader live in `dynastyedge-diagnostics-and-tooling`; this skill only tells
  you when to reach for them.
- **Fantasy-football terms or domain reasoning** (Superflex, FAAB, taxi,
  pick tiers, win windows…) — `dynasty-fantasy-reference`.

---

## 1. The evidence hierarchy

Strongest to weakest. Always state which rung your evidence sits on.

1. **Numeric before/after from a scripted run on REAL league data.**
   E.g. "roster 6 total value was 48,213 before my change and 48,213 after;
   the one traded pick I touched moved from 0 to 2,850, matching FantasyCalc's
   `2027 Mid 2nd` entry." This is the gold standard. (Network-required — see
   the recipes in §3; in a sandbox where fantasy APIs are proxy-blocked, say
   so explicitly and mark the check as owner-required.)
2. **Scripted run on a synthetic fixture** with `node:assert` (pattern in §6).
   Proves the pure logic does what you claim, on inputs you control. Weaker
   than (1) because the fixture may not resemble real league data.
3. **Green `npm run build` + careful code reading.** Proves it compiles and
   you believe it's right. This is the *minimum* bar, never the finish line
   for data-logic changes.
4. **"Looks right" / "it renders in my head".** This is NOT evidence. It is a
   hypothesis. Never present it as verification, and never write "verified"
   or "tested" in a commit message on the strength of it.

**Hard rule: the gate for ANY claim of improvement is a number.** "Faster",
"more accurate", "better packages" — each requires a measured before and
after, from the same script on the same input. No number, no claim; write
"expected to improve X, unmeasured" instead.

**Never claim you ran what you didn't.** Network posture **varies per
session — probe before assuming either way** (2026-07-06: both fantasy APIs
proxy-blocked, feeds reachable; 2026-07-19: live site + both APIs fully
reachable, and the built app was rendered and driven in headless Chromium
with live data). The canonical home for the current posture and the
browser-driving recipe is `dynastyedge-diagnostics-and-tooling`. Label
blocked steps **NETWORK REQUIRED** and hand them to the owner rather than
pretending.

**Browser-driven checks are real evidence — for the right claims.** When
network allows, a headless-Chromium run of the built app on real league data
(recipe in `dynastyedge-diagnostics-and-tooling`) substantiates rendering,
navigation, and on-screen numbers — rung-1-grade for those claims. It is
NEVER evidence for the iOS-specific class: PWA metas / status bar (iOS
chrome, invisible to any browser screenshot), standalone mode, safe-area
insets (0 in emulation), sheet gestures, rubber-banding, or the iOS
keyboard. Those still require the owner's physical iPhone.

---

## 2. The pre-commit checklist

Run every item that applies. All commands from repo root
(`/home/user/dynastyedge`). Cross-ref: `dynastyedge-change-control` decides
*whether* you may commit; this list is the evidence bundle it expects.

- [ ] **Build is green:** `npm run build` — must end `✓ built in …s` with no
  errors. Baseline (2026-07-06, Node v22.22.2, Vite 6): builds in ~7s, main
  bundle `dist/assets/index-*.js` ≈ 369 kB (115 kB gzip; canonical baseline:
  run `dynastyedge-diagnostics-and-tooling`'s `bundle-report.mjs`). A wildly
  larger bundle or new build warnings = investigate before committing.
- [ ] **UI diff?** → run the `/design-review` skill on the diff. Any
  hand-rolled button/card/sheet/chip/badge/input outside
  `src/components/ui` is a finding.
- [ ] **Behavior change?** → CLAUDE.md updated **in the same commit**.
  Check: `git diff --cached --stat | grep CLAUDE.md` — if the behavior diff
  is staged and this comes back empty, stop.
- [ ] **Data/computation logic changed?** → real-data spot-check (§3), or an
  explicit "NETWORK REQUIRED — owner to verify" note in the commit/PR body.
- [ ] **Touched sheets, scrolling, PWA metas, safe-areas, or `index.html`?**
  → the iOS on-device list in §4; flag untestable items for owner testing.
- [ ] **No new dependencies:** `git diff package.json` must be empty (or
  owner-signed-off — route through change-control). This includes dev deps;
  vitest/jest are NOT sanctioned without owner approval.
- [ ] **No new raw `fetch()`:**
  `grep -rn "fetch(" src --include="*.js*" | grep -v fetchJSON`
  Baseline (2026-07-06): exactly 2 sanctioned hits, both in
  `src/components/draft/DraftBoard.jsx` (lines ~540/560) fetching same-origin
  static assets under `BASE_URL`. Any *new* hit hitting an API is a
  violation — all network calls go through `src/utils/fetchJSON.js`.
- [ ] **No hardcoded player names/values:** eyeball the diff for quoted proper
  names and suspicious 3–5 digit literals near value math. Helper:
  `git diff | grep -nE "'[A-Z][a-z]+ [A-Z][a-z]+'" | grep -v -i "nix cage"`
  (team/owner constants in `constants.js` are the only sanctioned names).
  Tuning constants with a comment explaining them (e.g. `BASELINE_MEAN = 115`
  in `playoffOdds.js`) are fine; a specific player's value is never fine.
- [ ] **Storage keys prefixed:** any new `localStorage`/`sessionStorage` key
  in the diff must start `dynastyedge_`. Check:
  `git diff | grep -nE "(setItem|getItem)"` and inspect the key constants.
- [ ] **Nothing committed from `dist/`, scratchpads, or `/tmp`.**

---

## 3. Real-data spot-check recipes — **NETWORK REQUIRED**

All of these hit the live public APIs (no auth). They are copy-pasteable but
**cannot run in a proxy-blocked sandbox** — if `curl` returns 403 from the
proxy, label the step owner-required; do not fake output. League ID
`1313933520715907072`, my roster is `roster_id 6`.

The diagnostics sibling (`dynastyedge-diagnostics-and-tooling`) owns richer
probes: `scripts/probe-league.mjs` and `scripts/check-feeds.mjs` — prefer
those for broad health checks; use the recipes below for verifying a
*specific* changed computation by hand.

### Recipe A — changed pick valuation (`pickCapital.js` / `pickTrades.js`)

Verify one traded pick's price against FantasyCalc's raw entry:

```bash
# 1. Who owns which traded picks?
curl -s "https://api.sleeper.app/v1/league/1313933520715907072/traded_picks" \
  | jq '[.[] | select(.owner_id == 6)] | .[0:5]'

# 2. FantasyCalc's raw pick entries for that season/round:
curl -s "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5" \
  | jq '[.[] | select(.player.name | test("2027 .* 2nd")) | {name: .player.name, value}]'

# 3. Round-median check (findPickValue = median of the round's Early/Mid/Late
#    entries). Compute the median of the values from step 2 by hand and
#    compare to what the app / your changed function returns for that pick.
```

Slot-tier note (verified in source 2026-07-06): `slotTier` in
`src/utils/pickTrades.js` uses `slot <= Math.ceil(teams/3)`, so a 10-team
league prices slots **1–4 as Early**, 5–7 Mid, 8–10 Late. CLAUDE.md and the
inline comment say "1–3 / 4–7" — a known doc/code mismatch. Verify against
the CODE, and if you touch this area, surface the mismatch to the owner via
change-control rather than silently "fixing" either side.

### Recipe B — changed roster totals / standings / records

Compute roster 6's record and points independently, then compare with what
the app displays (League › Overview and the Edge hero):

```bash
curl -s "https://api.sleeper.app/v1/league/1313933520715907072/rosters" \
  | jq '.[] | select(.roster_id == 6) | {wins: .settings.wins,
        losses: .settings.losses, ties: .settings.ties,
        fpts: .settings.fpts, faab_used: .settings.waiver_budget_used,
        player_count: (.players | length)}'
```

Then: `npm run dev`, open the app in devtools at 390px, and check the
displayed record/FAAB (free-agent bidding budget)/player list against the
curl output. FAAB remaining =
league `waiver_budget` (from `/league/{id}`) minus `waiver_budget_used`, and
must display as `$XXX`.

### Recipe C — changed a per-player value join or trend display

Pick one player you can see in the app (e.g. any QB on roster 6) and trace
the join by hand:

```bash
# Sleeper IDs on my roster:
curl -s "https://api.sleeper.app/v1/league/1313933520715907072/rosters" \
  | jq '.[] | select(.roster_id == 6) | .players[0:10]'

# The FantasyCalc row for one of those IDs (join key = sleeperId as string):
curl -s "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5" \
  | jq '.[] | select(.player.sleeperId == "4046")
        | {name: .player.name, value, overallRank, trend30Day}'
```

The app must show that exact whole-number `value`, that rank, and the trend
arrow per the ±50 rule. If the player is missing from FantasyCalc, the app
must still show them with `—` (never dropped) — that is Recipe C's negative
case, and it's also a degradation contract (§5).

---

## 4. The 390px discipline

"Test mentally at 390px" means running this checklist, not vibing:

- [ ] **Longest realistic strings**: player names like
  "Marquez Valdes-Scantling" / "Amon-Ra St. Brown"; user-set team names can
  be long and emoji-laden. Does the row truncate/ellipsize instead of
  wrapping or pushing the value off-card?
- [ ] **One-row player-card constraint** (CLAUDE.md design rule): name + team
  + value fit one row at 390px.
- [ ] **No horizontal page scroll** — ever — except lists explicitly designed
  as swipeable horizontal rows (League position ranking). Wide content
  scrolls inside its own container.
- [ ] **Sub-tab overflow**: multi-word tabs ("Season Review", "Pick Trades")
  must not wrap — `SubTabBar` handles this; if you bypassed it, that's also
  a design-review finding.
- [ ] **Safe areas**: content isn't hidden behind the home indicator; sheets
  pad bottom with `env(safe-area-inset-bottom)`; `<main>` is never shortened
  with a bottom offset.
- [ ] **Numbers at real magnitude**: 5-digit values (48,213), $XXX FAAB,
  "100%" odds — not the 2-digit placeholders your head renders.

**How to actually test:** `npm run dev`, open Chrome/Safari devtools, device
toolbar → iPhone 15 Pro preset (393×852; 390 is close enough) and click
through every screen your diff touches, with real data if the network allows.

**What devtools CANNOT test — be honest about this.** These need a real
iPhone (the owner's device):

- iOS focus-zoom on inputs (< 16px font triggers zoom; repo handles globally)
- keyboard-driven `visualViewport` resize (PlayerSearchSheet, trade add sheet)
- scroll chaining / rubber-banding into the page behind a sheet, and the
  `useSheetDrag` swipe-down arm-at-scroll-top behavior
- home-indicator clearance and notch insets on the physical device
- status-bar color from the `theme-color` meta in standalone PWA mode
- any change to `apple-mobile-web-app-*` metas or `manifest.webmanifest`
  (requires remove + re-add of the home-screen app to even take effect)

An AI session cannot do on-device testing. When a diff touches any of the
above, write **"Needs owner on-device check: <specific items>"** in the
commit/PR message. That's a required output, not an apology.

---

## 5. Degradation-contract QA ("break it on purpose")

The app's contracts split into two classes — verify the SOURCE location
first (all confirmed 2026-07-06), then simulate the failure and observe.

**How to simulate:** in devtools → Network tab, right-click → "Block request
URL/domain", then hard-reload. Blocking is per-URL, so you can fail one feed
while the rest load.

| Break this | Where the contract lives (verified) | Required behavior | Fail = |
|---|---|---|---|
| Block `raw.githubusercontent.com/.../news.json` | `loadNewsFeed` in `src/hooks/usePlayerIntel.js` (`.catch(() => [])`, ~line 86) | NO error anywhere; news sections (drawer, Edge Headlines) simply hide; `/news` page shows the friendly empty state | any error text, retry loop, or blocked panel |
| Block `values-history.json` | `src/hooks/useValueHistory.js` `.catch` ~line 25 | sparklines and the Edge team-value line silently hide; no loading state lingers | spinner that never resolves, or an error |
| Block `trade-values.json` | `src/hooks/useTradeTimeValues.js` `.catch` ~line 28 | "At trade time" line in the scouting sheet simply absent | error or placeholder junk |
| Block `api.fantasycalc.com` | `signInRosters` in `src/hooks/useLeague.js` (~line 146, Sleeper-only memo); consumed by `LoginScreen.jsx` (contract canonical: `dynastyedge-architecture-contract`) | **Login still works** (team list from Sleeper alone); rosters render every player with `—` values contributing 0; core views show ErrorState only where values are essential | login blocked, players dropped, crash on null value |
| Block `api.sleeper.app` | core load path in `useLeague` / `LeagueContext` | `ErrorState` component (`src/components/shared/ErrorState.jsx`) with a retry button — never a blank screen | blank screen or unstyled error |
| Sparse value history (< 4 points for a player) | `MIN_SPARKLINE_POINTS = 4`, `src/hooks/useValueHistory.js` line 38 | `getSeries` returns null → sparkline hides | a 2-point "line" rendering |
| Offseason | `isOffseason = nflState?.season_type !== 'regular'` in `useLeague.js` | matchups, lineup optimizer flags, weekly projections, deadline banner, playoff-odds consumers all hide/degrade; everything else fully works | in-season UI showing stale/empty in-season data |

**Offseason honesty note:** you cannot easily fake `/state/nfl` (it's live
data through `fetchJSON`). Practical options: (a) it IS the offseason as of
2026-07-06, so the offseason branch is what live testing exercises anyway —
the *in-season* branches are the untestable ones right now; (b) for a quick
check, devtools → Overrides (local response override) on the `/state/nfl`
response to flip `season_type`. If you didn't do either, say "offseason/
in-season branch unexercised" in your report.

The rule of thumb (from CLAUDE.md, restated): **best-effort feeds (news,
value history, trade-time archive) must never error, block, or retry-loop —
they hide. Core loads (Sleeper league data, FantasyCalc values) must show
ErrorState + retry — never a blank screen. Sign-in must survive a
FantasyCalc outage.**

---

## 6. How to add tests HERE (the sanctioned no-deps pattern)

**Owner's law: no new npm dependencies.** No vitest, no jest, no testing
library — without explicit owner sign-off (route through
`dynastyedge-change-control`). The sanctioned pattern is **plain `.mjs`
scripts using `node:assert/strict`** run directly with `node`, importing the
repo's pure utils.

Two mechanics make this work (both verified 2026-07-06):

1. `package.json` has `"type": "module"` — the repo's `.js` files are ESM.
2. But `src` uses Vite-style **extensionless** relative imports
   (`import { findPickValue } from './pickCapital'`), which plain Node
   rejects. The canonical fix is the loader owned by
   `dynastyedge-diagnostics-and-tooling`:
   `node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs your-test.mjs`
   A test can also self-register an equivalent hook from a `data:` URL to be
   fully self-contained (as the worked example below does).

**What belongs in these tests — pure utils only** (no React, no fetches):
`playoffOdds` (fixed-seed determinism, verdict thresholds), `tradeAnalysis`
(verdict/counter thresholds), `pickTrades` (slot pricing, package rules),
`managerAnalysis` (steal/reach grading), `lineupHistory` (optimal-lineup
slot-filling math), `rosterAnalysis`, `pickCapital`, `dynastyTrajectory`
(clamps, monotonicity). Do NOT try to test hooks or components this way.

**Where they live:** propose a `tests/` dir at repo root — but **creating it
is a structural change requiring owner sign-off + a CLAUDE.md file-structure
update (route through dynastyedge-change-control)**. Until then, write test
scripts in your session scratchpad, run them, and paste code + output into
your report. Do not commit stray test files into `src/`.

### Worked example — actually run here 2026-07-06 (Node v22.22.2), passing

File (written and executed in the session scratchpad, NOT in the repo):

```js
// test-playoffOdds.mjs — no-deps validation of pure utils (node:assert only).
// Run: node test-playoffOdds.mjs   (from any cwd; uses absolute repo paths)
import { register } from 'node:module'
import assert from 'node:assert/strict'

// Self-contained loader: retry extensionless relative imports with ".js".
const LOADER = `
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\\.(js|mjs|json)$/.test(spec)) {
    try { return await next(spec + '.js', ctx) } catch {}
  }
  return next(spec, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(LOADER), import.meta.url)

const REPO = '/home/user/dynastyedge'
const { simulatePlayoffs, getDeadlineVerdict } = await import(`${REPO}/src/utils/playoffOdds.js`)
const { slotTier, findSlotPickValue } = await import(`${REPO}/src/utils/pickTrades.js`)

// ── 1. getDeadlineVerdict thresholds (<35% Seller, ≥70% Buyer) ──
assert.equal(getDeadlineVerdict(0.80, 'Contending').stance, 'Buyer')
assert.equal(getDeadlineVerdict(0.70, 'Middle').stance, 'Buyer')       // boundary
assert.equal(getDeadlineVerdict(0.50, 'Middle').stance, 'On the bubble')
assert.equal(getDeadlineVerdict(0.35, 'Rebuilding').stance, 'On the bubble') // boundary
assert.equal(getDeadlineVerdict(0.20, 'Rebuilding').stance, 'Seller')
assert.equal(getDeadlineVerdict(null, 'Middle').stance, 'Wait')

// ── 2. simulatePlayoffs: fixed-seed determinism + sanity (synthetic fixture) ──
const teams = [1, 2, 3, 4].map(id => ({
  rosterId: id, record: { wins: 0, losses: 0, ties: 0 }, pointsFor: 0,
}))
const model = {
  1: { mean: 130, std: 20 }, 2: { mean: 115, std: 20 },
  3: { mean: 110, std: 20 }, 4: { mean: 95, std: 20 },
}
const schedule = [
  { matchups: [[1, 2], [3, 4]] },
  { matchups: [[1, 3], [2, 4]] },
  { matchups: [[1, 4], [2, 3]] },
]
const args = { allRosters: teams, model, remainingSchedule: schedule, playoffTeams: 2, iterations: 10000 }
const runA = simulatePlayoffs(args)
const runB = simulatePlayoffs(args)
assert.deepEqual(runA, runB, 'fixed seed must give bit-identical results across runs')

const pct = Object.fromEntries(runA.map(r => [r.rosterId, r.playoffPct]))
assert.ok(pct[1] > pct[4], 'stronger team must have higher odds')
const totalMade = runA.reduce((s, r) => s + r.playoffPct, 0)
assert.ok(Math.abs(totalMade - 2) < 1e-9, 'exactly playoffTeams make it each iteration')
runA.forEach(r => assert.ok(Math.abs(r.projWins + r.projLosses - 3) < 1e-9, '3 games each'))

// ── 3. pickTrades slot pricing ──
// NOTE: code is ceil(teams/3) → 10-team is Early 1-4 / Mid 5-7 / Late 8-10;
// CLAUDE.md says "1-3 / 4-7". Assert what the code actually does.
assert.equal(slotTier(1), 'Early'); assert.equal(slotTier(4), 'Early')
assert.equal(slotTier(5), 'Mid');   assert.equal(slotTier(7), 'Mid')
assert.equal(slotTier(8), 'Late')

const entries = [
  { name: '2026 Early 1st', value: 5200 },
  { name: '2026 Mid 1st', value: 4100 },
  { name: '2026 Late 1st', value: 3300 },
]
assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: 2 }, entries), 5200)
assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: 9 }, entries), 3300)
// no slot → round-median fallback (findPickValue): median of the three = 4100
assert.equal(findSlotPickValue({ season: '2026', round: 1, slot: null }, entries), 4100)

console.log('OK — all assertions passed')
console.log('  team1 playoffPct:', pct[1], ' team4 playoffPct:', pct[4])
```

Actual output from this session (2026-07-06):

```
OK — all assertions passed
  team1 playoffPct: 0.8948  team4 playoffPct: 0.1035
```

Instructive detail: the first draft of this test asserted `slotTier(4) ===
'Mid'` per CLAUDE.md — and **failed** (`'Early' !== 'Mid'`), exposing the
doc/code mismatch noted in §3 Recipe A. That is exactly what these tests are
for: they arbitrate between the doc and the code with a number.

---

## 7. Golden / certified inventory — what counts as known-good

As of 2026-07-06:

- **The live site as deployed from `main`**
  (https://chnates.github.io/dynastyedge/) — the owner uses it daily; it is
  the behavioral reference. If your change makes a number differ from what
  the live site shows for the same input data, you must explain why.
- **The green-build baseline:** `npm run build` on current `main`
  (HEAD `6fb85f3`) completes clean in ~7s; main bundle ≈ 369 kB / 115 kB gzip
  (canonical baseline: `dynastyedge-diagnostics-and-tooling`'s
  `bundle-report.mjs`).
- **CLAUDE.md's documented behaviors** — the doc of record, EXCEPT where a
  code check contradicts it (one known instance: `slotTier` Early boundary,
  §3/§6). On conflict: the code is what ships; flag the conflict via
  change-control rather than assuming either side.
- **The worked test in §6** — the only scripted, passing assertion set that
  exists for this repo so far.

**Where there is NO golden data:**

- **Model outputs are uncalibrated** (as of 2026-07-05): playoff-odds
  accuracy, dynasty-trajectory projections, trade-verdict quality, fair-
  package suggestions — no ground truth exists for any of them. You can
  verify they are deterministic, threshold-correct, and unchanged; you
  cannot verify they are *right*. See `dynastyedge-model-quality-campaign`.
- **No visual regression baseline** — no screenshots, no snapshot suite.
- **No recorded API fixtures** — every real-data check hits the live APIs
  fresh (and league data mutates: trades, waivers, records).

---

## Provenance and maintenance

Everything above was verified against source / executed on 2026-07-06 at
`main` = `6fb85f3`. Re-verify before trusting:

- Build baseline: `npm run build` (expect `✓ built`; note time + bundle size).
- No test/lint scripts still true: `cat package.json` (scripts block).
- Best-effort catches still in place: `grep -n "catch" src/hooks/useValueHistory.js src/hooks/useTradeTimeValues.js` and `grep -n "catch(() => \[\])" src/hooks/usePlayerIntel.js`.
- Sign-in independence: `grep -n signInRosters src/hooks/useLeague.js src/components/auth/LoginScreen.jsx`.
- Sparkline threshold: `grep -n MIN_SPARKLINE_POINTS src/hooks/useValueHistory.js` (expect 4).
- Raw-fetch baseline (2 DraftBoard static-asset hits): `grep -rn "fetch(" src --include="*.js*" | grep -v fetchJSON`.
- slotTier doc/code mismatch still open: `sed -n '15,19p' src/utils/pickTrades.js` vs CLAUDE.md Feature 13.
- Deadline-verdict thresholds: `grep -n "0.7\|0.35" src/utils/playoffOdds.js`.
- Loader still at: `ls .claude/skills/dynastyedge-diagnostics-and-tooling/scripts/` (expect `loader.mjs`, `reg.mjs`).
- Worked example still passes: re-run it from a scratchpad (code in §6).
