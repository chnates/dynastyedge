---
name: design-review
description: Review a diff/PR for DynastyEdge Design System compliance — ensures new UI routes through the src/components/ui library (Button, IconButton, Card, Sheet, Chip, Badge, Input/SearchInput…) instead of hand-rolled Tailwind. Use when reviewing UI changes, auditing a PR, or before committing component work.
---

# Design System review

Audit a diff for **Design System compliance**. The rule (CLAUDE.md → Design
System Component Library): **route ALL new UI through `src/components/ui`** —
never hand-roll a button, card, bottom sheet, filter chip, badge, or input
inline. Extend a primitive instead. This skill flags every bypass with its
`file:line` and the library replacement, then prints a pass/fail verdict.

Work only from the **added/changed** lines in the diff — pre-existing code that
the diff didn't touch is out of scope.

## 1 — Resolve the diff under review

Pick the scope (default to the first that has changes):

```bash
git diff                         # unstaged working tree (default)
git diff --staged                # staged changes (pre-commit)
git diff <base>...HEAD           # vs a base branch, e.g. main...HEAD for a PR
```

List the changed UI files so the rest of the review is scoped to them:

```bash
git diff --name-only | rg '\.(jsx|tsx)$'
```

## 2 — Grep the added lines for bypass patterns

Restrict to **added** lines (`^\+`, excluding the `+++` header) so you only flag
new code. Run each pattern and record `file:line → fix`. Use ripgrep with line
numbers; pipe the diff in, or grep the changed files directly.

Get the added lines once:

```bash
git diff -U0 | rg '^\+' | rg -v '^\+\+\+'
```

Then run each detector over the changed `.jsx`/`.tsx` files (replace
`$FILES` with the list from step 1, or grep the whole `src` tree and ignore
hits inside `src/components/ui/`):

```bash
# Hand-rolled bottom-sheet overlay  → <Sheet> / <SheetHeader>
rg -n 'fixed inset-0.*bg-black/[0-9]' $FILES
rg -n 'useSheetDrag|useScrollLock'   $FILES   # outside components/ui/ = bypass

# Inline primary button  → <Button>
rg -n 'bg-accent text-white.*rounded|rounded.*bg-accent text-white' $FILES

# Inline close / icon button  → <IconButton>
rg -n 'w-9 h-9.*rounded-lg|w-8 h-8.*rounded-lg' $FILES
rg -n 'hover:bg-black/5|dark:hover:bg-white/5'  $FILES

# Inline card surface  → <Card>
rg -n 'rounded-xl bg-bg-card border border-border-default' $FILES

# New/You (and other) inline badges  → <Badge>
rg -n 'bg-accent text-white.*(text-\[9px\]|text-\[10px\]|uppercase)' $FILES

# Raw input styling  → <Input> / <SearchInput>
rg -n '<input' $FILES
rg -n 'border-border-default.*focus:border-accent' $FILES

# Duplicate filter-chip ladders  → <Chip>
rg -n 'rounded-full.*uppercase tracking|bg-accent text-white border border-transparent' $FILES

# Reimplemented shared primitives  → import from '../ui'
rg -n 'function (ErrorState|SectionHeader|SubTabBar|Spinner|LoadingSpinner)\b' $FILES
```

For every hit, the replacement is:

| Bypass pattern (in added lines)                                              | Library replacement |
|------------------------------------------------------------------------------|---------------------|
| `fixed inset-0 … bg-black/60` overlay, or `useSheetDrag`/`useScrollLock` outside `ui/` | `<Sheet>` + `<SheetHeader>` |
| `bg-accent text-white` + `rounded*` clickable                                | `<Button>` (variant `primary`/`secondary`/`tinted`/`ghost`/`danger`) |
| `w-9 h-9 … rounded-lg … hover:bg-black/5` close/affordance                    | `<IconButton label="…">` |
| `rounded-xl bg-bg-card border border-border-default` surface                  | `<Card>` (add `accent` for the edge bar) |
| `bg-accent text-white` small uppercase "New"/"You" label                      | `<Badge>` (`tone`/`soft`) |
| raw `<input>` with field styling                                             | `<Input>` / `<SearchInput>` |
| `rounded-full uppercase` toggle pill / chip ladder                            | `<Chip active activeClass={POS_CHIP_ACTIVE[pos]}>` |
| re-declared `ErrorState`/`SectionHeader`/`SubTabBar`/`Spinner`                | `import { … } from '../ui'` |

## 3 — Exclude legitimate exceptions

A hit is **not** a violation when:

- The file is **inside `src/components/ui/`** — those files *are* the primitives
  (they're allowed the raw Tailwind). Drop any hit whose path starts with
  `src/components/ui/`.
- It's an **intentionally bespoke branded element** — the `.neon-cta` / brand
  CTA, `.hero-card` "stadium lights" hero, `.app-bg` glow, or another documented
  one-off in `index.css`. These are deliberately not primitives; note them but
  don't fail the review.
- It's a **position/status color or layout class** that a primitive accepts via
  prop (e.g. `POS_BG[pos]` passed to `<Card accent=…>`), not a re-implementation.
- It's a **keyboard-aware sheet** — a sheet whose overlay is driven by
  `window.visualViewport` (so it stays above the iOS keyboard) genuinely can't
  use `<Sheet>`, which is sized to the layout viewport. The two sanctioned cases
  are `shared/PlayerSearchSheet.jsx` and the `AddAssetSheet` in
  `trade/TradeBuilder.jsx`; both still use library primitives for their inner
  content. A *new* keyboard-aware sheet should extend `<Sheet>` (add the option)
  rather than re-roll the overlay — flag that as a warning.

When unsure, flag it as a **warning** (not a hard fail) so the reviewer decides.

## 4 — Report

Print a tight report:

1. **Verdict line:** `Design System: PASS` or `Design System: FAIL — N violation(s)`.
2. **Violations table** (only if any), one row per finding:

   | Pattern | Location (file:line) | Fix |
   |---------|----------------------|-----|

3. **Exceptions noted** (bulleted, if any bespoke/`ui/` hits were skipped).
4. Optionally, a suggested fix per violation (the exact `<Button>`/`<Card>`/…
   swap), and offer to apply them.

**Pass/fail rule:** FAIL if any hard violation remains in non-`ui/`, non-bespoke
added lines; otherwise PASS. Keep the output operational — `file:line` + the
named primitive, nothing vague.
