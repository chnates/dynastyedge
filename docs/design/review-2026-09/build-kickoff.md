# Build kickoff prompt — "Matchday"

Paste the block below into a fresh session. It assumes PR #42 is merged to
`main`.

---

```
Build the "Matchday" visual direction and the navigation rebuild for DynastyEdge.

READ FIRST, IN THIS ORDER
1. CLAUDE.md in full — it is the source of truth for what the app DOES. Note
   the status block on the Design System section: that section is still the
   law for anything you do not rebuild, but its direction is superseded.
2. docs/design/review-2026-09/directions.md — the decision, the Matchday spec,
   its three revisions, and the build sequence at the bottom.
3. docs/design/review-2026-09/slop-checklist.md — the researched rules any new
   UI must pass. This replaces the Phase 3 design law.
4. docs/design/review-2026-09/findings.md — the audit the rebuild answers.
5. docs/design/review-2026-09/inventory.md — all 21 destinations, measured.
6. docs/design/review-2026-09/mocks/directions-2.html — the working mock. Open
   it, switch to direction 3 (Matchday), and look at all three screens in both
   themes before writing code. It is a standalone file; never import from it.
7. Skills: dynastyedge-failure-archaeology (BEFORE touching sheets,
   useSheetDrag, useScrollLock, safe areas, or PWA metas — these have been
   broken and fixed before), dynastyedge-change-control, dynastyedge-validation-and-qa,
   dynastyedge-visual-capture.

ALREADY DECIDED — DO NOT RE-LITIGATE
- The direction is Matchday. Three other directions were mocked and rejected.
- A bottom tab bar replaces the drawer as primary navigation. CLAUDE.md's old
  "There is NO bottom tab bar" rule was reopened by the owner for this review
  and is dead; update that text rather than obeying it.
- The home hero keeps team value (87,397) as its marquee figure. Leading with
  the instruction instead was built, reviewed and reverted on the owner's call.
- The verdict poster leads with the decision ("Counter"), not the gap number.
- Position colours become full-bleed section bands. Magnitude is encoded as
  TYPE SIZE plus a group total on the band — never a progress bar.
- Status colours (green/amber/red) and position colours keep separate,
  exclusive meanings. An editorial highlight takes a semantic colour or plain
  ink, never a position hue.

SEQUENCE — land these as separate PRs, in this order
1. docs/open-items.md DESIGN-2 — four ready-now bugs, independent of the
   redesign, so the rebuild is not carrying them:
   a. --text-tertiary fails WCAG AA in both themes (dark 2.5:1, light 3.2:1),
      used 525x. Fix the token in src/index.css, not the call sites.
   b. No focus-visible anywhere in src/components/ui. Input/Select actively
      remove the outline.
   c. IconButton is 32/36px against a 44px minimum, and it is the close control
      in every sheet. Button sm/md are also under.
   d. WhatsFair.jsx:198 truncates the Est. cost value — the most actionable
      field on the board. LineupRow has the same class of bug on long names.
2. DESIGN-3 — navigation. Bottom tab bar; retire the duplicated sub-tab layer
   (all 17 entries are byte-identical to the drawer's children); add
   /draft/research to PlayerSearchSheet's DESTINATIONS (a two-line fix that can
   ship on its own); stop SideDrawer using text-success / text-warning as
   section colours; give the four orphaned destinations real inbound links.
   Keep a redirect for every path that moves — the existing redirect block in
   App.jsx is the pattern.
3. Tokens and primitives — ground, type scale, radius 0, the position bands.
   Expect to edit src/components/ui itself; that is the one time it is in scope.
4. Roll the new components through the screens, densest first (My Roster,
   Trade Targets, League Overview) so density problems surface early.
5. Motion last. Budget 3-5 choreographed moments, one signature ("the press
   run": colour bands wipe, then type drops in). Keep the number roll. FIRST
   widen the prefers-reduced-motion guard in src/index.css — today it covers
   exactly one class (.edge-rise) and that is not a general rule.

CONSTRAINTS
- 390px iPhone Safari first, running as a home-screen PWA. Dark and light ship
  in the same pass — not a follow-up.
- Safe-area insets and the bottom-sheet gesture contract stay intact
  (useScrollLock, useSheetDrag, env(safe-area-inset-*), main is the only
  scroller). Read failure-archaeology section 2 before touching any of it.
- The app stays fully usable in the offseason.
- Data contracts, hooks, caches and model logic are OUT OF SCOPE. If a change
  seems to need one, stop and ask.
- One new font family is approved (Bricolage Grotesque). If it does not earn
  its keep on device, the recorded swap candidate is Big Shoulders Display.
  No other new runtime dependencies.

GATES — every PR
- npm ci first. If npm test does not report 275 passing, node_modules is
  missing; fix that before debugging anything.
- npm run lint, npm test, npm run build must all pass.
- Screenshot every changed screen at 390px in BOTH themes with
  scripts/dev/screenshot-app.mjs, and put them in the PR.
- Score new UI against slop-checklist.md and say so in the PR.
- Run /design-review on consumers, not on src/components/ui while you are
  editing the primitives themselves.
- Update CLAUDE.md in the SAME commit as the behaviour change. The sections
  this work touches: Design System, Navigation, Navigation Refactor, File
  Structure, and rule 15/17 if sheets or safe areas move. Move DESIGN-1/2/3 to
  section 3 of docs/open-items.md as they close.

Work incrementally, commit as you go, and show me screenshots before moving to
the next step in the sequence.
```
