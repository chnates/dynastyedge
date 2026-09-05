<!--
  Fill in what applies and delete the rest — a short PR should stay short.
  Two rules this repo does not bend:
    • A claim of improvement needs a measured before AND after. No number, no
      claim — write "expected to improve X, unmeasured" instead.
    • Behavior changes update CLAUDE.md in the SAME commit. There is no team
      and no wiki; CLAUDE.md is the whole institutional memory.
-->

## What and why

<!-- One paragraph. What was wrong or missing, and what this does about it.
     Link the issue / docs/open-items.md item / build-plan section it comes from. -->

## Changes

<!-- Bullets, one per meaningful change. Name the file or feature that owns each.
     Cite feature numbers the way CLAUDE.md does — "(Feature 14)". -->

## Measured result

<!-- Only for changes that claim to make something better: coverage, accuracy,
     speed, bundle size, package quality. Give the before and after from the
     same script on the same input, and name the script so it can be re-run.
     If a target was pre-registered, report the real number even when it misses —
     a recorded miss is worth more than a moved goalpost. Delete this section
     for changes that don't claim an improvement. -->

| | Before | After |
|---|---|---|
|  |  |  |

## Evidence

Highest rung this PR reaches (see `dynastyedge-validation-and-qa` §1):
<!-- 1 = numbers from a scripted run on REAL league data · 2 = scripted run on a
     synthetic fixture · 3 = green build + code reading (the minimum bar, never
     the finish line for data logic) · "it renders in my head" is not evidence. -->

Machine gates — all three must pass before merge, and CI enforces them:

- [ ] `npm run lint` exits 0
- [ ] `npm test` — **177 passing**. A count near 115 means `node_modules` is
      missing; run `npm ci` before debugging anything.
- [ ] `npm run build` ends `✓ built in …s`, bundle not wildly larger

Applicable checks:

- [ ] **UI diff** → `/design-review` run; nothing hand-rolled outside `src/components/ui`
- [ ] **Rendered at 390px** → screenshots below (`scripts/dev/screenshot-app.mjs`)
- [ ] **Data / computation logic** → real-data spot-check, or marked NETWORK REQUIRED for the owner
- [ ] **Best-effort feed touched** (news · values-history · trade-values · rookie-intel)
      → degradation verified: on any failure the section **hides**, never errors, never retry-loops
- [ ] **No new dependencies** — `git diff package.json` empty, or owner-approved
- [ ] **No new raw `fetch()`** — every network call goes through `src/utils/fetchJSON.js`

<!-- Paste screenshots for UI changes. Dark and light if the change touches color. -->

## Docs

- [ ] **CLAUDE.md updated in the same commit** as the behavior change
      <!-- Which sections? dynastyedge-docs-and-writing §1 maps change type → sections. -->
- [ ] `docs/open-items.md` — anything deferred is recorded with the **trigger**
      that makes it ready, and anything closed is moved with its date
- [ ] `docs/analysis/` note added for a measurement or model change
- [ ] Skills in `.claude/skills/` that assert a fact this PR invalidates

Sections touched:

## Risk and rollback

<!-- What breaks if this is wrong, and who notices. Rollback here is a revert on
     main (it redeploys automatically). Call out anything a revert would NOT
     undo — a force-pushed data branch, a published feed, a storage-key change
     already written to the owner's phone. -->

## Owner-required

<!-- Things no sandbox can verify. Delete if none.
     The iOS class especially: PWA metas, standalone status bar, safe-area
     insets, sheet gestures, rubber-banding, the iOS keyboard — headless
     Chromium is blind to all of it. Also anything gated on a repo secret or a
     scheduled workflow that hasn't run yet. -->
