# UX/UI + IA Review — progress log

Branch: `claude/dynastyedge-design-review-95nyej`
2026-09-11. Scope: diagnosis + three mocked directions. **The real app was not
modified** — no changes to `src/`, `CLAUDE.md`, `docs/design/phase3-design-brief.md`,
or `src/components/ui`.

## Suspended for this review (owner-granted)
1. Phase 3 "Primetime Blackout" design law — historical, not binding.
2. The "no bottom tab bar" rule — re-litigable.
3. `/design-review` not run as a gate (read only, to understand what exists).

## Deliverables
- `findings.md` — the audit. Part A (IA), Part B (visual), motion inventory,
  accessibility pass, and an explicit "what I could not verify".
- `inventory.md` — all 21 destinations: route, taps, entry points, search presence.
- `directions.md` — the three directions + the recommendation and a build sequence.
- `unasked.md` — six things outside the brief, ranked.
- `mocks/directions.html` — standalone comparison mock, published as an artifact.

## Evidence
- 48 captures of the running app at 390px against live data —
  every destination in both themes, plus drawer, profile drawer, a loaded
  Analyzer, a bottom sheet and global search (`.screenshots/audit/`).
- 19 mock captures, both themes + a mid-animation frame (`.screenshots/mocks/`).
- Motion recording: `.screenshots/mocks/motion-all-three.webm`.

## Status
- [x] Env: `npm ci`, 275/275 tests pass, playwright-core in /tmp/pw, dev server up
- [x] Part A — destination inventory + IA diagnosis
- [x] Part A — external navigation research (live: NN/g, Apple HIG, iOS 26)
- [x] Part B — visual audit from screenshots
- [x] Motion inventory (measured) + accessibility pass
- [x] Part C — three directions, built + captured with working motion
- [x] Recommendation + "what you didn't ask about"
- [x] Round 2 — AI-slop research, checklist, three new directions
- [x] **Owner decision: Matchday** (2026-09-11), after two mock rounds
- [x] Matchday rev 1 (seven fixes) · rev 2 (hero swap, reverted) · rev 3 (final)
- [x] Repo documentation updated — CLAUDE.md, the Phase 3 brief, `open-items.md`,
      the `design-review` skill, and the PR template's stale test count
- [ ] **PR open — owner merges. Build happens in a fresh session.**

## Log
- Env verified; read CLAUDE.md, visual-capture, failure-archaeology
  (§1 iOS bar, §2 sheets/gestures, §5 design taste), frontend-design,
  web-design-guidelines, artifact-design.
- Captured every destination before writing any finding; two claims
  (sub-tab clipping, `Est. cost` truncation) were spotted in pixels and then
  confirmed in source before being recorded.
- Known capture artifact honored: the drawer's "News —" row is visual-capture
  gotcha 5, not a dead pipeline. Not reported as a bug.
