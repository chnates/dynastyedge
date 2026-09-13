# Next-session prompt — Matchday cleanup + the sub-tab decision

Paste the block below into a fresh session. Assumes PR #49 (the four focus
fixes) is merged.

Two of the five items are **owner-only** and are marked as such in the prompt so
the agent doesn't fake them.

---

```
Finish the Matchday cleanup. This is the debt the rebuild deliberately handed on,
plus one finding from the post-merge review.

READ FIRST
1. CLAUDE.md in full. The Design System section is now the LIVE law — Matchday
   shipped, all five steps. Do not restyle away from it.
2. docs/open-items.md → the DESIGN-1 record (closed 2026-09-12). Its "What step 5
   hands on" list is items 1-4 below, and its "Three lessons" are the gates you
   work under. Read both.
3. docs/design/review-2026-09/slop-checklist.md — the rules any new UI passes.
   RE-SCORE from scratch when you are done. Do not inherit the 0-of-12.
4. Skills: dynastyedge-failure-archaeology (BEFORE touching sheets, scroll
   containers, safe areas or PWA metas), dynastyedge-change-control,
   dynastyedge-validation-and-qa, dynastyedge-visual-capture.

THE THREE VERIFICATION GATES STEP 5 PAID FOR — use them, they each caught a real bug
- ROUTE SWEEP. Neither lint nor build catches an undefined component: eslint-scope
  does not resolve a JSXIdentifier and a bad element type is a runtime throw. Step
  4 shipped League › Activity to main as a WHITE SCREEN with lint, tests and build
  all green. Load every one of the 18 routes and assert it rendered before you
  call anything done.
- RE-SCORE, DON'T INHERIT. Step 4 recorded 0 of 12 while two raw `border-l-2`
  accent rails were live in Pick Trades the whole time. Grep for the SHAPE
  (`border-l-`, `borderLeft`, gradient functions, `backdrop-`), not for the API.
- A RULE NEEDS AN INSTRUMENT. The `--overflow` sweep found a player's name on the
  Draft Board clipped by 4px that no amount of looking at screenshots had caught.
  If you assert "nothing truncates", write the probe that proves it.

WORK, IN THIS ORDER

1. The 21 hand-rolled panels (mechanical, do this first — it is the biggest
   consistency gap and the lowest risk).
   `bg-bg-card border` panels that never routed through `Card`, across nine files:
   TrajectoryView (4), RosterAnalysisSheet (4), ManagerScoutingSheet (4),
   LineupOptimizer (3), ManagersView (2), and one each in LineupEfficiency,
   PlayoffOdds, LeagueActivity, PickTradeCalculator.
   Fix is `<Card padding="sm">` plus a tag balancer for the closes. Step 5 already
   did the three densest screens (profile drawer, draft tracker, draft board — 17
   panels) so follow that diff's shape.
   NOTE: this is an accessibility debt as well as a visual one. PR #49 fixed four
   fields that stripped their focus ring precisely because they bypassed the
   primitives. Assume the same class of bug hides in these nine files and check
   for it while you are in there.

2. MarketMovers nests a <button> inside a <button>.
   `MoverRow` in src/components/league/MarketMovers.jsx — the Trade action sits
   inside the tappable row. Invalid HTML, React warns, and it predates the rebuild
   (reproduces on clean main).
   CLAUDE.md already records the answer used on the Partners card: the action is
   "a sibling BELOW the card, never nested inside its <button>". Follow that
   precedent unless it looks wrong at 390px, in which case show me both and let me
   pick — this one needs a layout decision, not just a fix.

3. The sub-tab row wraps to two lines, and it may not need to exist.
   DESIGN-3 renamed SubTabBar to SectionContents and made it WRAP instead of
   scroll, which fixed "Pick Trades" clipping. But on My Team (4 entries) and
   Trade (5) it now spends two header rows on every screen in those sections.
   The original review recommended retiring this layer entirely; the rebuild kept
   it. That was defensible — the drawer now carries zero destinations, so it is no
   longer a duplicate of anything — but it is worth one deliberate decision rather
   than inheriting.
   Three options, my recommendation is (b):
     (a) Leave it. It wraps, it is honest, it costs ~44px on two sections.
     (b) Keep one row, no wrap, no scroll: show the section's views on the
         section's own landing screen (where there is room) and let the header
         carry only the ACTIVE view's name. /index already exists as the complete
         map, so nothing becomes unreachable.
     (c) Drop it entirely and rely on /index plus the tab bar.
   Whichever you pick: measure the header height before and after at 390px, and
   check both themes. Do NOT move any route — DESIGN-3 moved none, so there are
   no redirects to maintain, and adding some now would be a regression.

4. Consider a Textarea primitive.
   PlayerProfileDrawer's scout-note textarea is the only field in the app that
   cannot route through a primitive, so PR #49 gave it `.focus-ring` directly.
   It is correct but structurally unprotected. One small `ui/Textarea.jsx`
   carrying the same contract as `Input` (ruled, `.focus-ring`, text-sm) closes
   the recurrence risk. Only do this if it stays genuinely small.

OWNER-ONLY — DO NOT ATTEMPT, JUST REMIND ME
5. The PWA metas and the app icon need verifying on device, carried from step 4.
   A meta or icon change is SILENT until the home-screen app is removed and
   re-added (failure-archaeology §1). index.html's icon `?v=` is at 4.
6. Bricolage Grotesque has to earn its keep on a real phone. Step 3 measured that
   the spec's `wdth 125` is not executable — the axis tops out at 100. If it reads
   flat on glass the recorded swap candidate is Big Shoulders Display.
   Neither of these can be checked in headless Chromium. Do not report them as
   verified; surface them to me at the end.

CONSTRAINTS
- 390px iPhone Safari first, home-screen PWA. Dark and light in the same pass.
- Safe-area insets and the sheet gesture contract stay intact (useScrollLock,
  useSheetDrag, env(safe-area-inset-*), <main> is the only scroller). The sheet
  family is six settled battles deep and none of them is visible to headless
  Chromium — read failure-archaeology §2 before touching any of it.
- Data contracts, hooks, caches and model logic are OUT OF SCOPE. If a change
  seems to need one, stop and ask.
- No new dependencies.

GATES — every PR
- npm ci first. If npm test does not report 284 passing, node_modules is missing.
- npm run lint, npm test, npm run build all pass.
- The route sweep above.
- Screenshot every changed screen at 390px in BOTH themes
  (scripts/dev/screenshot-app.mjs) and put them in the PR.
- Re-score slop-checklist.md from scratch and state the number.
- Update CLAUDE.md in the SAME commit as any behaviour change, and move closed
  items to §3 of docs/open-items.md with their date.

Land items 1, 2 and 3 as SEPARATE PRs — 2 and 3 each carry a layout decision and
should be reviewable on their own. Show me screenshots before moving on.
```
