---
name: dynastyedge-failure-archaeology
description: >-
  Historical record of every significant DynastyEdge investigation, dead end,
  rejected fix, and revert — so no session re-fights a settled battle. Load
  this BEFORE: touching bottom sheets / useSheetDrag / useScrollLock / scroll
  containers or anything iOS-gesture related; touching index.html PWA metas,
  theme-color, or status-bar styling; touching pick valuation code
  (managerAnalysis.js, pickTrades.js, findPickValue, makePickPricer); touching
  Trade Analyzer preload / nav-state / sessionStorage-draft wiring or fair
  package suggestions; adding dark-mode glow effects to cards; changing taxi
  rules, sparkline thresholds, or the drafted trade UX. Also load when a bug
  "smells familiar" or before re-attempting any fix that might have been tried
  and reverted already.
---

# DynastyEdge Failure Archaeology

The chronicle of settled battles in this repo. Each entry: **Symptom → Root
cause → Evidence (commits + files) → Status → Standing ruling**. Every commit
cited below was inspected with `git show <hash>` on 2026-07-05; the narrative
is derived from actual diffs and commit messages, not memory.

**Prime directive: do not re-fight a settled battle.** If your planned change
contradicts a Standing ruling below, stop and tell the user which entry it
conflicts with before proceeding.

## When NOT to use this skill

- **Live triage of a new bug** → use `dynastyedge-debugging-playbook`. This
  skill is the historical record you consult to avoid repeating history, not
  a diagnostic procedure.
- **Understanding how systems are supposed to work** → use
  `dynastyedge-architecture-contract` and `dynastyedge-data-contracts`.
- **Process for landing a change safely** → `dynastyedge-change-control`.
- **Fantasy-football terms or domain reasoning** (taxi, FAAB, Superflex,
  pick tiers…) → `dynasty-fantasy-reference`.
- Don't cite this file as a substitute for reading the current code — code
  has moved since some entries; verify line numbers before editing.

## Reading this repo's history (important caveats, as of 2026-07-05)

The local clone is **shallow with two graft points**: `dc0afdc` (2026-05-31)
and `4f31aad` (2026-06-12). Consequences:

- `git show dc0afdc` and `git show 4f31aad` display the **entire tree as if
  newly added** — their true parents (`4f31aad`'s parent is `b7d738f`) are
  absent. Their real diffs are NOT reconstructable locally. Entries citing
  them are grounded in the commit message plus the current code (which still
  carries the fix), and are marked accordingly.
- There is a **history gap**: commits between 2026-06-01 (`55a4a66`) and
  2026-06-12 are missing from this clone entirely.
- History spans 2026-05-31 → 2026-06-20, ~69 commits, all but one
  Claude-authored (`ce25b04` "Add files via upload" by chnates — the
  FantasyPros rookie-rankings CSV).
  Only two true reverts exist: `3083f0c` (status bar) and `aa0892b` (neon
  glow) — both covered below.

---

## 1. The iOS status bar saga (SETTLED — highest recurrence risk)

**Symptom:** Installed home-screen (standalone PWA) app showed a black bar /
mismatched strip where the iOS status bar sits — in light mode especially.

**The full arc (all three commits inspected, same night 2026-06-16):**

1. `cfd9ad0` "Fix PWA status-bar color in installed app (light + dark)" —
   diagnosed the manifest's static `theme_color: #16161A` as overriding the
   live per-theme `<meta name="theme-color">`; removed it from
   `public/manifest.webmanifest` and aligned light theme-color to `#E9ECF5`
   in `src/hooks/useTheme.js`. **This diagnosis was wrong for standalone
   mode.** 30 minutes later:
2. `3083f0c` — clean `git revert` of cfd9ad0.
3. `78b6c29` "Restore black-translucent status bar (seamless, both themes)" —
   the real fix. The app had *always* worked because it used
   `apple-mobile-web-app-status-bar-style=black-translucent` (transparent
   bar; page + ambient glow paint under it edge-to-edge, no solid band). A
   prior commit had removed that meta in favor of the theme-color approach,
   which on iOS-that-doesn't-honor-live-theme-color-in-standalone paints a
   solid black band. Restored the meta in `index.html`, plus a
   **light-mode-only dark strip** (`dark:hidden bg-[#0D0D0F]`, height
   `env(safe-area-inset-top)`, `aria-hidden`) behind the always-white iOS
   status text in both `src/App.jsx` (AppShell) and
   `src/components/auth/LoginScreen.jsx`.

**Root cause of the late discovery (the trap):** PWA meta changes only take
effect after the user **removes and re-adds** the home-screen app. The
regression shipped silently and only surfaced when the app was re-added —
long after the offending commit. Never assume a status-bar/meta change is
verified until a remove+re-add cycle on the actual phone.

**Status:** SETTLED. **Standing ruling:**
- `black-translucent` + the light-mode dark strips is the settled design. Do
  not remove the `apple-mobile-web-app-status-bar-style` meta, do not remove
  the two `dark:hidden` safe-area strips, do not re-attempt the
  "theme-color drives the standalone bar" approach — it was tried (`cfd9ad0`)
  and reverted (`3083f0c`) same night.
- **CLAUDE.md rule 16 is STALE on this point as of 2026-07-05**: it still
  says "No `apple-mobile-web-app-status-bar-style` meta", but `index.html`
  line ~18 has one, deliberately (`78b6c29`). The correct future action is a
  **doc fix to CLAUDE.md**, never "fixing" index.html to match the doc.

---

## 2. Bottom-sheet / scroll / gesture family (SETTLED — owner-flagged as costliest)

Six distinct battles. The architecture that emerged: **`<main>` is the app's
only scroller; the document never scrolls; every sheet obeys one shared
contract** (now codified in the `ui/Sheet` primitive and CLAUDE.md rule 17).

### 2a. Sheets wouldn't close on swipe-down — `5b8668f` (2026-06-12)

- **Symptom:** Swiping down on RosterAnalysisSheet (and most sheets) just
  rubber-banded the content on iOS; sheet stayed open despite the grabber
  handle implying dismissal.
- **Root cause + mechanism (from the diff):** only PlayerProfileDrawer had a
  drag gesture. Extracted into `src/hooks/useSheetDrag.js`:
  **native non-passive touch listeners** (React's synthetic touchmove is
  passive, so `preventDefault()` is a no-op there and iOS rubber-bands);
  **drag arms only when `scrollRef.scrollTop === 0` and finger moves down
  > 8px**; closes past 120px or a quick flick (velocity > 0.4 px/ms), else
  springs back. Wired into every sheet; FreeAgentDrawer also gained the
  missing `useScrollLock` + overscroll containment + safe-area padding.
- **Ruling:** never duplicate gesture logic locally. Any sheet gets
  `useSheetDrag(onClose)` with `sheetRef` on the panel and `scrollRef` on
  the scroll container. The at-scroll-top arming condition is load-bearing —
  without it, in-sheet scrolling breaks or the sheet can't close.

### 2b. Dead bar above the home indicator — `86903a7` (2026-06-12)

- **Symptom:** black strip clipping content on every screen just above the
  home indicator.
- **Root cause:** `<main>` ended at `bottom: env(safe-area-inset-bottom)`.
- **Fix (src/App.jsx):** `<main>` runs to `bottom: 0` and carries the
  clearance as `paddingBottom: env(safe-area-inset-bottom)` **inside** the
  scroll container.
- **Ruling:** never shorten `<main>` with a bottom offset; safe-area
  clearance lives inside the scroller as padding. (Now in CLAUDE.md rule 15.)

### 2c. Page scrolled the background gradient — `8929f74` (2026-06-14)

- **Symptom:** drags starting where `<main>` sat at a scroll edge scrolled /
  rubber-banded the *document*, sliding the `.app-bg` gradient layer while
  content stayed put ("gradient ends mid-card").
- **Root cause:** architecture assumed `<main>` was the only scroller, but
  nothing actually locked the body.
- **Fix:** `src/index.css` locked `html, body, #root` to
  `height:100%; overflow:hidden; overscroll-behavior:none`; `<main>` got
  `overscrollBehavior: contain`.
- **…which caused 2d the next day.**

### 2d. Black bar over home indicator, round two — `e8cd044` (2026-06-15)

- **Symptom:** after 2c, fixed header/main/drawer stopped short of the
  physical bottom edge; home-indicator strip showed as a black bar.
- **Root cause (iOS quirk, from the diff):** `overflow:hidden` on the ROOT
  elements (`html`/`#root`) **clips position:fixed descendants above the
  bottom safe-area inset** on iOS.
- **Fix:** lock scrolling with `overflow:hidden` on `<body>` ONLY (fixed
  children escape that clip); `html/#root` keep `height:100%` +
  `overscroll-behavior:none` but stay unclipped.
- **Ruling:** the exact current split in `src/index.css` is deliberate. Do
  not "clean up" by moving `overflow:hidden` back to `html` or `#root`.

### 2e. Keyboard-aware sheets — `781599c`, `18d0a13` (2026-06-13), `ba75c67` (2026-06-16)

- **Symptom (781599c):** global player search sheet — a `fixed inset-0`
  overlay with `max-h-[70vh]` list — hid its bottom behind the iOS keyboard
  and overflowed off the top; the search header scrolled out of view.
- **Root cause:** `fixed` + `vh` size against the **layout viewport**, which
  does not shrink when the iOS keyboard opens; only `window.visualViewport`
  does.
- **Fix:** size/position the overlay to `visualViewport`
  (`top: vv.offsetTop, height: vv.height`, tracking `resize` + `scroll`
  events), sheet becomes a flex column `max-h-full min-h-0` with pinned
  header (`shrink-0`) and `flex-1` scrolling results. Degrades gracefully
  when visualViewport is unavailable.
- **Follow-up (18d0a13):** the visual viewport extends UNDER the status bar
  in standalone mode — a full result list tucked the handle + input behind
  the notch. Fix: `paddingTop: calc(env(safe-area-inset-top) + 8px)` on the
  overlay.
- **ba75c67:** identical treatment applied to the Trade Analyzer's
  AddAssetSheet in `src/components/trade/TradeBuilder.jsx` (including a
  latent flexbox fix: results container needed `flex-1 min-h-0`).
- **Ruling:** `PlayerSearchSheet` and TradeBuilder's `AddAssetSheet` are the
  **two sanctioned hand-rolled overlays** — they cannot use the `ui/Sheet`
  primitive because Sheet is sized to the layout viewport. Do not "migrate"
  them onto Sheet without solving keyboard-awareness in Sheet itself; do not
  hand-roll a third overlay — any new keyboard-hosting sheet must copy this
  exact visualViewport pattern or extend Sheet properly.

### 2f. iOS focus-zoom — `e98260f` (2026-06-13)

- **Symptom:** tapping any search/input zoomed the whole page.
- **Root cause:** Mobile Safari zooms when a focused form control's
  font-size is < 16px; every control renders at `text-sm` (14px).
- **Fix (src/index.css):** `@media (pointer: coarse)` forces
  `font-size: 16px !important` on input/select/textarea. Deliberately does
  NOT set `maximum-scale` (pinch-zoom stays intact); desktop keeps 14px.
- **Ruling:** keep inputs at `text-sm` in components — the global guard
  handles iOS. Never fix focus-zoom per-component or via viewport
  `maximum-scale`.

Related smaller entry: `0b15ca3` (2026-06-16) — LoginScreen renders before
AppShell, so the body scroll-lock left it unscrollable/clipped; it became its
own fixed full-viewport scroller. Any future pre-shell screen must do the
same.

---

## 3. Pick valuation family (SETTLED — owner-flagged)

**The invariant that emerged from both battles:**
> **A pick's value is never 0 just because its market listing is missing.**
> FantasyCalc only prices *future/generic* picks; a past-season pick, or a
> current-season pick after the NFL draft retired the generic entries, is
> still a real asset. Every valuation path must have an explicit fallback
> chain, ending in a round-median approximation — displayed with `≈`/"—"
> semantics, never a raw 0.

### 3a. Manager scouting priced every traded pick at 0 — `4f31aad` (2026-06-12)

- **Caveat:** this commit is a shallow-clone graft point — its true diff is
  unavailable locally. Entry reconstructed from its commit message + the
  current code in `src/utils/managerAnalysis.js` (verified 2026-07-05,
  `buildPickIndex` ~line 86, `buildGenericRoundValues` ~line 129,
  `pickAsset` ~line 161), which still carries the fix.
- **Symptom:** every traded pick in the manager-scouting ledger showed 0,
  skewing all hindsight trade grades.
- **Two compounding root causes:**
  1. Pick→player resolution required `draft.slot_to_roster_id`, which
     Sleeper **often omits on older drafts**. Fix: build the index directly
     from the pick list; fall back to `draft_order` (user→slot) joined with
     that season's user→roster map.
  2. Unresolved past-season picks priced via `findPickValue`, but
     FantasyCalc only lists future drafts → 0. Fix: fall back to the median
     value of that round across FantasyCalc's listed picks
     (`buildGenericRoundValues`), flagged `approx: true` and rendered with
     an `≈` marker in the ledger.

### 3b. Pick Trade Calculator priced current-season picks at 0 — `1ef480a` (2026-06-13)

- **Symptom:** every current-season pick showed "—" and every target said
  "No pick package from your inventory gets close".
- **Root cause (from the diff):** once the **NFL** rookie draft passes,
  FantasyCalc retires its generic current-season pick entries (picks become
  named rookies) — but the **dynasty league** hasn't held its rookie draft
  yet, so those picks are live assets. `findPickValue` returned 0, and
  `suggestPickPackages` bailed on its first guard (`if (!targetValue)
  return []`).
- **Fix:** `makePickPricer` in `src/utils/pickTrades.js` — in that window,
  price a current-season pick by the rookie projected at its slot (derived
  rookie ADP), or the median rookie in its round when the order isn't set;
  other seasons keep the generic market price. Threaded through
  `buildPickMarket` and `buildPriceBoard`.
- **Latent bug fixed in the same commit:** future-year sweetener picks were
  valued as `p.value ?? 0` — roster pick objects carry **no `.value`
  field**, so they were always 0. All pick pricing now goes through the
  pricer.
- **Ruling:** never read `.value` off a roster pick object; always price
  through `makePickPricer` / `findPickValue`-with-fallback. When adding any
  new pick-consuming feature, test the three calendar windows: before NFL
  draft, between NFL draft and league rookie draft, after league draft.

---

## 4. Trade preload / state wiring family (SETTLED — owner-flagged)

The Trade Analyzer accepts FOUR navigation-state inputs plus a
sessionStorage draft. The precedence rule (verified in
`src/components/trade/TradeAnalyzer.jsx` ~lines 144–172, as of 2026-07-05):

> `hasNavState = opponentRosterId || whatsFairTarget || preloadGivePlayer ||
> preloadTrade` — **any nav state wins; the sessionStorage draft
> (`dynastyedge_trade_draft`) is only restored when there is no nav state.**
> Within nav state, `preloadTrade.opponentRosterId` beats `opponentRosterId`.
> All initial state is computed in lazy `useState` initializers from
> `draftRef` (read once via `useRef`) — not in effects.

### 4a. Analyzer opened empty from What's Fair — `92657ae` (2026-05-31)

- **Symptom:** navigating from a What's Fair card showed the opponent +
  target banner but both trade columns empty.
- **Root cause:** `fairPackage` was computed but only passed to TradeVerdict
  for display — it never seeded the asset lists.
- **Fix:** one-shot `useEffect` gated on `assetsPreloaded` that seeds
  `getAssets` with the target (looked up from the opponent's actual roster)
  and `giveAssets` with fair-package items **matched back to full
  player/pick objects from myRoster** (picks matched by reconstructed
  "season + round-suffix" label).
- **Lesson:** a preload payload must resolve to the same asset objects the
  add sheet produces (same `id`), or toggles/dedupe/totals silently break.

### 4b. Analyzer opened empty from PlayerProfileDrawer — `a18fdef` (2026-05-31)

- **Symptom:** "Trade" from my own player's profile opened a blank Analyzer.
- **Root cause:** the drawer navigated with no state for own-roster players,
  and `handleOpponentChange` unconditionally cleared `giveAssets` on first
  opponent selection.
- **Fix:** pass `preloadGivePlayer` in nav state; Analyzer holds it in a
  **ref** (`preloadGiveRef`) and consumes it exactly once inside
  `handleOpponentChange` — on first opponent pick the player is placed into
  `giveAssets` instead of clearing to empty, then the ref is nulled.
- **Lesson:** any "pre-load an asset before the opponent is chosen" flow
  must survive the opponent-change reset path; the consume-once ref is the
  established pattern.

### 4c. Fair packages reached for elite backup-less starters — `ff116ba` (2026-06-15)

- **Symptom:** the package builder kept suggesting an irreplaceable starter
  (canonical case: a top-1 TE with no depth behind him) as a "give".
- **Root cause:** positional surplus was computed from **summed** position
  value, so one elite player inflated the bin and made a thin position read
  as a surplus — which then *discounted* that very player's keep-score.
- **Fix (src/utils/recommendations.js + tradeAnalysis.js):**
  1. Surplus discount applies only to depth pieces (`rank >= coreN`), never
     a core starter.
  2. **Cliff protection:** my #1 at a position where #2 is worth < 50% of #1
     gets `keep = max(keep, 0.95)`.
  3. `PROTECT_THRESHOLD = 0.9`: assets at/above it are excluded from
     `suggestFairPackage`'s candidate pool entirely (user can still add
     manually).
  4. When depth alone can't reach fair value, return an honest partial with
     a "covers ~X% — add a piece" note instead of reaching for a stud
     (`bestUnder` path).
  - Commit notes it was verified against a synthetic Bowers scenario
    (keep 0.95 → excluded).
- **Ruling:** never let summed positional value alone mark a position
  tradable; keep the protect-threshold/cliff logic intact in any
  recommendation rework.

### 4d. Later additions that respect the same contract

- `preloadTrade` (two-sided prefill from Pick Trade Calculator, landed with
  `77714b1`/`1ef480a` era): assets are the owner's actual roster pick
  objects (same `id` as the add sheet) but priced at slot precision with
  `slotLabel`. Mixed precision with round-median add-sheet picks is
  accepted by design.
- **Ruling for any new entry point into the Analyzer:** add it to the
  `hasNavState` disjunction, seed via lazy initializers or a consume-once
  mechanism, and hand over asset objects the builder already understands.
  Never bypass or reorder the nav-state-over-draft precedence.

---

## 5. Design-taste rulings (SETTLED)

### 5a. Dark-mode neon glow on cards — `e31deaf` → `aa0892b` (both 2026-06-12, 2 minutes apart)

- `e31deaf` added `tone-glow-*` classes: an inset box-shadow bleeding the
  3px edge-bar color into briefing cards in dark mode.
- `aa0892b` reverted it the same session: "The inset glow bled into the card
  background and read muddy next to light mode's clean bar."
- **Standing ruling:** the crisp 3px tone-colored left edge bar, no glow, in
  both themes. Do not re-propose inset/neon glows on content cards. (The
  saturated neon on the **LoginScreen** (`0b15ca3`) and the hero-card
  "stadium lights" treatment are different, deliberate surfaces — the ruling
  is specifically about tinted edge-bar content cards.)

---

## 6. Smaller settled items

| Item | Evidence | Ruling |
|---|---|---|
| **Taxi (developmental-player stash — see dynasty-fantasy-reference) duration is 2 years, not 1.** Action items flagged `years_exp === 1`; league settings allow rookie + 2nd-year seasons on taxi. | `24ed7cf` (2026-06-12), `src/components/roster/RosterActionItems.jsx` + CLAUDE.md | Taxi alerts flag `years_exp >= 2` only. Never "restore" the 2nd-year flag. |
| **Sparklines hide below 4 points.** With the daily pipeline 2 days old, every sparkline was a straight diagonal that read as broken. | `31a7b32` (2026-06-12), `MIN_SPARKLINE_POINTS = 4` in `src/hooks/useValueHistory.js`, shared by `buildTeamValueSeries` | Keep the shared threshold; do not lower to 2 "to show more data". Lines reappear automatically as history accumulates. |
| **FantasyPros CSV column quirks.** Header shortened to "FP", column made sortable, FP TIERS field drives tier grouping when FP-sorted; tiers captured during the fuzzy-match phase. | `0b977be` (2026-05-31), `src/components/draft/DraftBoard.jsx` | CSV parsing is positional (`cols[0]` rank, `cols[1]` tier, `cols[2]` name…); position strings like "RB1" are stripped of digits. Changing the CSV format breaks this silently — check `parseFantasyProsCsv` first. |
| **Integration-review sweep.** Draft views used hand-rolled error UI; Tracker pick modals violated the sheet contract; LeagueActivity joined player IDs without `String()`. | `6ad6e24` (2026-06-12) | All joins normalize IDs with `String()`; all error UI is shared `ErrorState`; every bottom-docked panel honors the sheet contract — no exceptions for "small" modals. |
| **Sign-in must not depend on FantasyCalc.** UX audit found a values-API outage could lock the user out. | `a3a34dc` (2026-06-20), `useLeague`'s Sleeper-only `signInRosters` | Never route LoginScreen data through FantasyCalc. Also from the same commit: sub-tab rows are the shared `SubTabBar` (fixes 390px label wrapping) — never hand-roll a sub-tab row. |

---

## 7. Open sores (as of 2026-07-05 — open, NOT settled)

1. **CLAUDE.md rule 16 is stale** (says no `apple-mobile-web-app-status-bar-style`
   meta; `index.html` deliberately has `black-translucent` per `78b6c29`).
   Pending action: a docs commit updating CLAUDE.md rule 16 to describe the
   black-translucent + light-mode-strip design. Do NOT change index.html.
2. **GitHub Actions cron auto-disable risk** (pipeline ops canonical:
   `dynastyedge-run-and-operate`). `news.yml` (twice-hourly) and
   `values-history.yml` (daily) are disabled by GitHub after ~60 days
   without repo activity. Last commit is `6fb85f3` (2026-06-20), so the
   window closes around **late August 2026** if nothing is pushed. Any push
   re-enables them. If sparklines/news/trade-time values go stale, check the
   Actions tab for disabled workflows before debugging client code.
   Re-verify the projection before quoting it — last repo push date:
   `git log -1 --format=%cd` (the ~60-day clock runs from repo activity).
3. **Shallow history.** The true diffs of `dc0afdc` and `4f31aad`, and all
   commits between 2026-06-01 and 2026-06-12, are unrecoverable locally
   (`git fetch --unshallow` would need network + remote access). Entry 3a is
   the only entry in this file reconstructed without its diff.
4. **`slotTier` Early/Mid boundary — the SECOND live doc/code divergence.**
   CLAUDE.md Feature 13 and the inline comment at `src/utils/pickTrades.js`
   ~line 14 say Early = slots 1–3 / Mid = 4–7; the code
   (`slot <= Math.ceil(teams/3)`, ceil(10/3)=4) computes Early = 1–4 /
   Mid = 5–7 / Late = 8–10. Status: open. Evidence:
   `dynastyedge-validation-and-qa`'s worked test (§6 there) asserts the code
   behavior and passes. Pending action: a doc fix, owner-gated via
   `dynastyedge-change-control` — do NOT silently "fix" either the doc or
   the code.
5. **Beyond rule 16 (#1) and the slotTier boundary (#4), no other doc/code
   divergences were found** in this pass — but the doc-of-record contract
   ("CLAUDE.md updated same commit as behavior changes") means any future
   divergence you find should be treated as a bug and added here.

---

## Provenance and maintenance

Written 2026-07-05 against local HEAD `6fb85f3` (2026-06-20). Every hash
above was inspected via `git show <hash>` in that session; sandbox had no
network access, so no live-API or on-device claims are made here.

Re-verification one-liners:

- New commits since this file: `git log --oneline 6fb85f3..HEAD`
- New reverts to archive: `git log --grep='Revert' --format='%h %ad %s' --date=short`
- Repeat-fix candidates: `git log --format='%h %s' | grep -iE 'fix|again|restore|revert'`
- Rule-16 staleness check: `grep -n 'status-bar-style' index.html CLAUDE.md`
- Precedence rule still intact: `grep -n 'hasNavState' src/components/trade/TradeAnalyzer.jsx`
- Shallow state: `git rev-parse --is-shallow-repository && cat .git/shallow`

When a new battle settles (a fix is reverted, or a bug is fixed twice), add
an entry in the same Symptom → Root cause → Evidence → Status → Standing
ruling format, and date-stamp any volatile claims.
