---
name: web-design-guidelines
description: Audit UI code against Vercel's Web Interface Guidelines (accessibility, focus states, forms, animation, typography, touch targets, safe areas, dark mode). Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or before merging any UI-heavy change.
metadata:
  author: vercel (vendored)
  upstream-version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines (vendored)

Audit files for compliance with Vercel's Web Interface Guidelines.

> **Vendored (2026-07-19):** adapted from `vercel-labs/agent-skills` →
> `skills/web-design-guidelines/SKILL.md` (MIT). The upstream skill fetches
> its rules from a remote URL at runtime; that is a live remote-instruction
> channel and also fails in network-restricted sessions, so this vendored
> copy **pins a reviewed snapshot** of the rules instead:
> `references/web-interface-guidelines.md` (from
> `vercel-labs/web-interface-guidelines` → `command.md`, MIT — license in
> `references/LICENSE`). To refresh the rules: re-fetch `command.md` from
> upstream, re-read every line, re-commit — never fetch at audit time.

## How to run an audit

1. Read `references/web-interface-guidelines.md` (in this skill's directory).
2. Read the files under review (the argument, the current diff's files, or
   ask which files if neither is given).
3. Check them against every rule section; output findings in the terse
   `file:line` format the rules file specifies.

## DynastyEdge local notes

- Findings are advisory. Where a rule conflicts with a documented DynastyEdge
  decision, **CLAUDE.md wins** — flag the conflict instead of "fixing" it.
  Known standing conflicts: heading/button case (house style is
  sentence-case UI text and uppercase section labels, not Chicago Title
  Case); URL-reflects-state (League filters deliberately persist in
  sessionStorage, not query params); `autocomplete="off"` guidance (login is
  a Sleeper username field, not an auth credential).
- Rules that map straight onto known iOS pain points here (treat findings in
  these areas as high-signal): `overscroll-behavior: contain` in sheets,
  `env(safe-area-inset-*)`, `touch-action: manipulation`,
  `prefers-reduced-motion`, tabular-nums for value columns, text truncation
  with `min-w-0` on flex children.
- This audit complements `/design-review` (design-*system* compliance —
  primitives, tokens); this skill covers design *quality* (a11y, interaction,
  robustness). UI-heavy changes should pass both.
