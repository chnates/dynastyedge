# History — Design System

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Design System

> **Status: "Matchday" is the live direction, and all five steps have landed
> (2026-09-12).** Step 1 was the accessibility floor (DESIGN-2), step 2 the
> navigation rebuild (DESIGN-3), step 3 the token + primitive layer, step 4 the
> component roll-through (law 5's three block registers, B2's inversion on Trade
> Targets, law 2's bar ruling, **lucide removed entirely** — 51 icons, 32 files,
> dependency uninstalled — the radius sweep, and all three inherited Blackout
> artefacts), and **step 5 the motion layer** (see the Motion section: the global
> reduced-motion guard, one easing curve, the press run, `.press`, the press bar,
> the sheet entrance, and a four-moment budget).
>
> **The app fails 0 of `slop-checklist.md`'s 12 markers** — 8 at the review, 3
> entering step 4, 2 entering step 5.
>
> **The same lesson has now bitten three times, so read it as a rule: deleting a
> primitive does not delete the pattern, and a grep for an API cannot find a
> shape.** `Card`'s banned left accent rail was removed in step 3. A raw
> `border-l-[3px]` on Trajectory's verdict survived every sweep of step 4. Two
> more raw `border-l-2` rails in Pick Trades survived step 4 *and* step 5's own
> component work, and were caught only by re-scoring the checklist from scratch
> at the end. **Audit for the shape, and re-score rather than inheriting a
> score.**
>
> It replaced **"Primetime Blackout"** (Phase 3, 2026-07-20), which shipped
> competently and was then rejected on review. The reason is worth keeping,
> because it is a lesson about briefs rather than about execution: Blackout's
> own law specified **two of the three aesthetics the research names as AI
> defaults** — a near-black ground with one scarce accent, and hairline rules at
> zero radius — and the shipped app failed **8 of 12** researched slop markers,
> the worst being the thin coloured accent rail that `Card`'s `accent` prop made
> a first-class primitive. **Compliance could not have fixed it, because
> compliance was what produced it.**
>
> Spec: `docs/design/review-2026-09/directions.md` (the direction and its two
> revisions) · `slop-checklist.md` (the rules any new UI passes) ·
> `findings.md` (what was measured) · `mocks/directions-2.html`, direction 3
> (the authority on palette and type — standalone, never imported by the app).

**Matchday in one line: a publication about a competition.** Poster type, flat
colour, hard edges, no shadows, no icon set in navigation, and the five position
hues promoted from 9px tags to **full-bleed section bands**.

### The five laws

1. **Colour is a FIELD, not a rail.** Ink and the position hues are painted as
   solid blocks with the type reversed out — the masthead, the hero poster, the
   section band, the inline `Mark`, the CTA, the active chip, the tab bar. **A
   thin coloured rail down a container's left edge is banned**: it is the single
   most-cited tell in the research and it was a documented primitive here. When
   something wants a colour, it either becomes a field or the colour moves onto
   the *word* that carries the finding.
2. **Magnitude is TYPE SIZE.** Never a progress bar — a meter belongs to a
   different design language, and refusing it is part of why this direction was
   chosen. A figure is sized from its own value (`<Magnitude>`); the band above
   the group carries the group total. Size reads shape *within* a position, the
   total reads weight *across* positions.

   **A bar survives only where the number is a genuine proportion of a bounded
   whole** — decided 2026-09-12, and argued from what each number *is* rather
   than from consistency. The test has three parts, all three required:
   a **real complement** (the empty track means something), **no clamp**, and
   an **absolute mapping** (a fixed reference, not one that moves).
   - **League › Playoffs' odds bar passes and STAYS.** A probability is a
     proportion of 100%; the empty track is the chance you miss; `width:
     playoffPct * 100%` never clamps and 100% genuinely means certainty. B2
     called it "by a distance the most scannable screen in the app" and it is.
   - **TeamCard's positional strength bars FAILED all three and are gone.**
     They computed `min(100, strength / (leagueAvg * 2) * 100)`, so: they
     **clamped** — anything at twice league average pinned at 100%, and the two
     strongest QB rooms rendered identically while differing by thousands
     (finding B2 re-created inside the encoding meant to fix it, visible on the
     live board); the **complement was meaningless**, since twice-league-average
     is not a whole anyone is a fraction of; and the **reference moved**, so a
     team's own bar changed length when a *different* team traded. What replaced
     them is what Feature 5 always actually specified — "above average = filled,
     below average = unfilled", a **binary**: the position letter takes its hue
     when the team is above average there and mutes when below, with the 30-day
     trend beside it.

   **`Magnitude` needs a contract reference, and a quantity without one does not
   get sized.** The player scale is FantasyCalc's documented 0–10000. A **team
   total is a different quantity** — a sum of ~26 players, live range
   58,000–118,000 — and passing it the player reference clamped all ten teams to
   the 30px ceiling. `MAGNITUDE_TEAM_REFERENCE` is the second contract:
   `MAGNITUDE_REFERENCE × ROSTER_SLOTS.length` (110,000), i.e. a lineup of
   maximum-value players, both factors constants the app already owns. A
   positional sum likewise takes `MAGNITUDE_REFERENCE × POSITION_DEPTH[pos]`,
   derived from the same depth `getPositionalStrength` sums over. **Where no
   contract ceiling exists, use a plain figure** — inventing a reference is the
   per-list-maximum failure the primitive exists to prevent.
3. **Separation is a rule, never a shadow and never a radius.** Panels are
   square with a 1px hairline (`--border-default`) or a 2px masthead rule
   (`--border-strong`, or ink for the strongest). **Sheets, modals and the side
   drawer keep their radii and their full gesture contract** — radius 0 is for
   panels, and the sheet mechanics are untouchable (failure-archaeology §2).
4. **Status colours and position colours keep separate, exclusive meanings, and
   navigation may borrow neither.** An editorial highlight takes a semantic
   colour or plain ink — never a position hue, or "down 12%" reads as a
   position. Navigation carries no colour, no swatch and no icon at all.
5. **A block is a RULED ROW, a LEDE, or a DOOR — a rectangle is the last
   resort.** This is the answer to finding **B7**, and it is not a padding
   scale. B7 measured that "every screen is a vertical stack of full-width,
   evenly-spaced, 1px-bordered rectangles… an Action Item you must act on today
   and a Market Radar row you'll never tap have the same padding, the same
   border and the same width." Matchday's mock contains **zero bordered boxes
   in its content area**, so the second density register is reached by deleting
   the rectangle, not by tuning it:

   | Register | For | Shape |
   |---|---|---|
   | **`RuledList`** of rows | many things you SCAN — 26 players, 10 teams, 20 targets | a shared column, hairline separators, no box, ~10px rhythm; the `PositionBand` above carries the group |
   | **`Lede`** | ONE thing you ACT ON | eyebrow · display headline with a `Mark` · prose · ink CTA; no box; ~3× a row's height |
   | **`NavRow`** | a way OUT of this screen | display title · detail · hairline; no icon, no chevron |

   **The register is chosen by cardinality and consequence, never by taste.**
   The corollary is the load-bearing half: an enumeration must never be built
   from `Lede`s. Three IR alerts rendered as three `Lede`s reproduce the exact
   icon+title+one-liner pattern the direction exists to kill — so repeated items
   of one kind **aggregate into a single `Lede`** (Feature 1's action items).
   `Card` survives only for a genuinely standalone panel that is none of the
   three: a chart, an explainer, a form.

### Design System Component Library

All UI routes through the shared library at **`src/components/ui`** (barrel
`index.js`). **Never hand-roll a button, card, bottom sheet, filter chip, badge,
band, value figure, or input inline** — extend a primitive instead. Class
strings inside the primitives are kept literal (no runtime colour
interpolation) so Tailwind's content scan always picks them up. The
`/design-review` skill audits every diff for bypasses and is the enforcement
mechanism — run it on the **consumers**, not on `src/components/ui` while the
primitives themselves are being edited.

Import everything from the one barrel: `import { Button, Card, Sheet } from '../ui'`
(path relative to the importing file).

|Primitive|What it is|
|---------|----------|
|`Button`|THE button, set in **mono uppercase, tracked** (the mock's `.cta`) — the same voice as every other small label in the app. Variants `primary` (the ink field) · `secondary` (2px rule) · `tinted` (quiet rule, the footer/link idiom) · `ghost` · `danger`; sizes `sm`/`md`/`lg`; `fullWidth`, `icon`/`iconRight`, polymorphic `as`/`href`. Labels **wrap** (`text-balance`) — `whitespace-nowrap` never stopped a long label overflowing 390px, it only stopped it wrapping well. `sm`/`md` render under 44px, so every Button carries `tap-target`.|
|`IconButton`|THE icon-only control — the close/affordance button in every sheet/drawer header. Always pass `label` (→ aria-label). **`md` is a real 44px box** (`w-11 h-11`); **`sm` stays 36px** (`w-9 h-9`) for the one place without room — the swap handle inline in a `LineupRow` — and borrows `tap-target`'s 44px hit area. Square.|
|`Card`|THE surface container (`rounded-none bg-bg-card border border-border-default`). Optional `tone` colour class renders a **2px kicker rule across the TOP** — a print convention, and what replaced the banned left rail. `padding` `none`/`sm`/`md` or a raw class; `interactive`/`onClick` makes it a button.|
|**`Mark`**|THE editorial highlight — a word set in reverse out of a solid block ("Five **quarterbacks**, one dead weight"). The real replacement for `Card`'s rail: colour moves off the container and onto the word that carries the finding. Tones `ink` (default) · `ground` (a second reversal, for use **inside** an ink field) · `alt` · `brand` · status. **Never a position hue.**|
|**`PositionBand`**|THE section band — a position hue at **full bleed** with the page ground reversed out, carrying the group's count and **total**. The direction's signature. A board that mixes positions takes the neutral ink band (`position` omitted) — picking a hue to make a mixed list colourful would lie about what is in it. Cancels the 16px page gutter by default (`bleed`).|
|**`Magnitude`**|THE value figure, sized from its own value. See law 2 and the note below on the reference. `null` renders `—` at the base size (rule 7).|
|**`RuledList`**|THE DENSE register — many things you SCAN. Rows on the page's own ground, separated by a hairline, **no box and no per-row background**; it draws the closing rule and strips the last row's. Identity comes from the `PositionBand` above, not from a border around each row. `flush` cancels the page gutter.|
|**`Lede`**|THE OPEN register — one thing you ACT ON. Eyebrow · headline (with a `Mark` on the word carrying the finding) · prose · a solid ink CTA. No box. A pressable `Lede` is a `<button>`, so `action` takes a **string** there; an entry needing real controls leaves `onClick` unset and passes nodes to `action` / `aside` (the dismiss slot on the eyebrow line).|
|**`Row`**|THE member of a `RuledList` — the tappable row itself. **Always carries `.focus-ring`**; renders a `<button>` for `onClick`, a `<Link>` for `to`, a plain `<div>` for neither (a row that is not tappable must not announce itself as a control). Paddings `sm`/`md`/`lg`. Extracted after `/design-review`'s judgement pass caught **eleven hand-rolled copies that had drifted apart on the focus ring** — an accessibility-floor gap the nine mechanical detectors could not see.|
|**`NavRow`**|THE DOOR — a row that takes you somewhere. Display-type title, small detail, optional mono hint, hairline, **no icon and no chevron**. Extracted from the Index's row so shortcuts stop being `Card`s with a lucide medallion.|
|**`Loading`**|THE loading indicator — a rule that prints and clears (`.press-bar`) under a mono label. **There is no spinner in this app.** `inline` for a section inside a card or drawer; the block form carries the page gutter (`padded={false}` when the caller already has one). Never render it without a label — the label is the information, the movement is only liveness.|
|`Sheet` + `SheetHeader`|THE bottom sheet. Owns the whole sheet contract (`useScrollLock`, `useSheetDrag` swipe-to-dismiss, `overscroll-contain`, safe-area bottom pad, Escape + overlay-tap close, drag handle); `zIndex` is a Tailwind z class so sheets stack. **Exception:** a *keyboard-aware* sheet driven by `window.visualViewport` (PlayerSearchSheet, TradeBuilder's add sheet) can't use `Sheet` (which is sized to the layout viewport) — those two are the sanctioned hand-rolled overlays.|
|`Modal`|THE centered dialog — confirm prompts and small forms. Owns overlay, `useScrollLock`, Escape + overlay-tap close. The bottom-docked counterpart is `Sheet`.|
|`Chip`|THE filter chip — square, mono uppercase. Inactive is quiet; `active` defaults to the **ink field**; pass `activeClass={POS_CHIP_ACTIVE[pos]}` for position-tinted active states.|
|`Badge`|THE small status/label badge — square, mono uppercase; `tone` (accent/brand/alt/success/warning/danger) and `soft` tinted variants. Solid `accent` is the ink field; **`brand` is the rationed crimson, reserved for "you" labels.** (Win-window tiers use `WinWindowBadge`; position tags use `POS_TAG`; an emphasis inside a sentence is a `Mark`.)|
|`Select`|THE dropdown field — a native `<select>` in the ruled-field voice. Native is deliberate: iOS renders it as the system wheel picker, and `<optgroup>` gives grouped options for free.|
|`Input` / `SearchInput`|THE text field + search-box variant — **ruled, not boxed** (a line under a label, the print convention). The focus affordance is the rule thickening to ink; `.focus-ring` still fires, because browsers always treat a text field as focus-visible. Keep at `text-sm` (iOS focus-zoom is handled globally).|
|`Textarea`|THE multi-line field — `Input`'s sibling, same ruled contract (bottom rule thickens to ink on focus, `.focus-ring`, `text-sm`). `resize-none` by default: `<main>` is the app's one scroller and a user-resizable box inside a bottom sheet fights the sheet's drag contract. It exists because the scout-note field was the one control in the app that **could not** route through a primitive — PR #49 found it with `focus:outline-none` and nothing in its place, and fixing it at the call site left the gap structurally open.|
|`cn`|The one styling primitive — a tiny `className` joiner that drops falsy values. Never pull in a heavier classnames dep.|

**Adopted shared primitives** are re-exported from the same barrel so the
library is the single import surface (the files stay in
`src/components/shared/`): `ErrorState`,
`SectionHeader` + `BRAND_TICK`, `SectionContents`, `TrendArrow`,
`WinWindowBadge`, `Sparkline`, `TeamAvatar`. Import these from `'../ui'`.

#### `Magnitude`'s reference is PINNED, and pinned to a contract

`14 + 16·(v/10000)^0.7`, clamped, floor 14px and ceiling 30px.

- **Pinned, not derived per list.** A per-list maximum would resize one player's
  figure because a *different* player's value moved, and 4,867 would read as
  huge on a thin board and ordinary on a deep one. The encoding only works if a
  number means the same thing on every screen.
- **10000, not the mock's 9365.** 9365 was the top-of-market dynasty value on
  the day the mock was drawn — it goes stale, and any asset above it runs off
  the top of the ramp. FantasyCalc's scale is documented as **0–10000**, so the
  ceiling is a contract rather than a snapshot. The two differ by under a pixel
  across the whole range (4,867 → 23.6px against the mock's 24.1px).
- The 0.7 exponent is the mock's: linear crushes the bottom two thirds of the
  market, where most of a roster lives, into three pixels; log flattens the top,
  where the decisions are.

### The accessibility floor (non-negotiable, enforced in the primitives)

Three rules, set in DESIGN-2 (2026-09-11) and re-derived against Matchday's
grounds the same week. They live in the primitives and in `index.css`, never at
the call site, so no screen can opt out.

- **Contrast is a contract.** `--text-tertiary` carries real content — the meta
  line on every player row, timestamps, the reason line under every trade
  target, **525 uses** — so it must clear WCAG AA body text (4.5:1). The ratio
  on each token is measured against that theme's **worst-case ground, which is a
  different surface in each**: in dark the *lightest* ground (`--bg-card`) gives
  the least contrast, in light the *darkest* (`--bg-secondary`) does.
  **ANY CHANGE TO A GROUND COLOUR MUST RE-MEASURE BOTH TEXT TOKENS IN BOTH
  THEMES** — Matchday moved every ground, which invalidated every ratio the
  floor had been set against.
  Run **`node scripts/dev/contrast-audit.mjs`**: it reads the tokens straight
  out of `index.css`, so the numbers here cannot drift from the shipped values,
  and it covers the two reversal cases a text-on-ground audit misses (paper type
  on a position band; type on an ink field). **40 of 40 pass.**
- **`.focus-ring` is the one focus definition** (`index.css`), carried by
  `Button`, `IconButton`, `Chip`, interactive `Card`, `Row`, `Input`,
  `Textarea` and `Select`.
  `:focus-visible`, not `:focus`, so a plain tap stays unmarked while
  keyboard focus and text fields render the ring. Inside an `.ink-field` the
  ring flips to the field's own ground, or it disappears into the block.
  **A control that bypasses the primitives must carry it explicitly, and 46 of
  them weren't** (measured 2026-09-13 by a static probe over every `<button>`,
  `<input>`, `<select>` and `<textarea>` in `src`; all fixed across three PRs).
  The distribution is the lesson: `DraftBoard` 10 · `DraftTracker` 10 ·
  `TradeBuilder` 7 · `EdgeView` 4, and because most sit on a **repeated row**,
  those 46 source sites were **~700 unfocusable controls in the live DOM** —
  470 on the Draft Board alone. **Run the probe, not a reading of the diff:**
  a single missed row component is two orders of magnitude of real controls.
  The only deliberate omission is `DraftBoard`'s hidden `<input type="file">`
  (`className="hidden"` ⇒ `display:none` ⇒ not focusable); its visible trigger
  carries the ring.
  **And a control that carries it at the CALL SITE is not covered — it is one
  refactor from losing it again.** That is why the scout note became a
  primitive rather than staying a hand-rolled `<textarea>` with the class
  pasted on: the floor holds because the primitives hold it, and the eleven
  divergent copies of `Row` are what the other arrangement looks like.
- **`.press` is the one press definition** (see Motion) — the third sibling of
  these two, carried by every primitive so no screen ships a control that
  doesn't answer a finger.
- **`.tap-target` guarantees a 44px hit area without moving the ink** — a
  centered pseudo-element sized `max(100%, 44px)`, so it never shrinks a target
  that is already larger and costs no layout. It is deliberately **NOT** on
  `Chip`: filter chips sit ~8px apart in a scrolling row, so a 44px hit area on
  a 40px chip would let neighbours steal each other's taps — the fix would cause
  the bug. It also carries `touch-action: manipulation`.

**Truncation is not a layout strategy for a load-bearing value.** Five fixed so
far: Trade › Targets' `Est. cost` (eliding the package on 5 of 11 live cards),
`LineupRow`'s player name ("TreVeyon He…" on the row whose whole job is telling
you who to start), `PlayerCard`'s name (which lost `truncate` when the value
column became variable-width), Market Movers' owner + reason line
("Aaronreg… · Rebuilding owner — prime tar…", where the *reason* is the point of
the row), and a free agent's name clipping by 3px. All wrap instead.

**The rule now has an instrument, because five recurrences means it needs one:**
`node scripts/dev/screenshot-app.mjs --route <path> --overflow` reports every
element actually being clipped, measured geometrically
(`scrollWidth > clientWidth`) against live data. Neither of the obvious
alternatives works — `--text` reads `innerText`, which returns the element's
FULL string because a CSS ellipsis is painted and never in the DOM, and a tall
capture downscales past it. Sweep every route with it before claiming a screen
is clean; the last full sweep found exactly one clip across 18 routes.

### Theme

- **Default:** Dark mode
- **Toggle:** In the side drawer's utility surface
- **Preference stored in:** `localStorage` key `dynastyedge_theme`

### The ink field

`.ink-field` / `.ink-field-cap` (`index.css`) is Matchday's **one structural
device**: a solid block of `--text-primary` with `--bg-primary` reversed out.
It **inverts with the theme by construction** — a cream poster on a black page
in dark, an ink poster on paper in light.

That is the resolution to **finding B4**. The old hero was `background-color:
#101013` in *both* themes, so light mode carried a near-black slab at the top of
a white page belonging to nothing else on it. An ink field belongs to
everything: the masthead rule, the section band, the CTA, the active chip and
the **bottom tab bar** are all made of it. (The tab bar is inverted in **both**
themes — the owner's call, 2026-09-11, when asked whether a cream slab reads
badly at night.)

**Content inside a field addresses the field, not the page.** Text is
`text-bg-primary`, fills are `bg-bg-primary/10`, rules are
`border-bg-primary/20`. Three rules:

- **Never `text-white`** — on the cream field dark mode paints, it is invisible.
- **The alpha floor on a field is `/60`.** Measured: the ground over the ink is
  4.92:1 in dark and 6.54:1 in light at 60%, and 4.19:1 at 55%. The old hero's
  `text-white/45` micro-labels were under it and got away with it only because
  the panel was always dark.
- **A status, tier or medal hue cannot live on a field.** The field inverts, so
  no single green/amber/cyan clears AA against both versions of it. On a field,
  direction and rank are carried by **weight, by the sign, or by a second
  reversal** (`<Mark tone="ground">`, the page's own colours, always legible).
  This is why the hero's trend chip drops its status hue, the top-3 rank medal
  becomes a Mark, and the tier dot is gone.

### Colour palette

Tokens live in `index.css` (`:root` light / `.dark` dark) and are exposed via
Tailwind (`bg-accent`, `text-brand-bright`, `bg-tier-middle/10`, …). **The
ground and every neutral carry a hue** (warm paper / warm ink, ~45–55°) —
zero-saturation greys are a named marker, and achromatic structure is why the
old palette read grey with five position hues on screen (finding B6).

**Two hues, 176° apart**, as the round-2 house rules require: the primary spot
is Falcons crimson (~350°), the secondary is **`--alt`**, a slate teal (~174°),
whose shipped job is the non-semantic editorial `Mark` — emphasis that is
neither a status nor "you". The five position hues (165–285°) are the colour
world on top of that.

#### Dark mode

|Role                     |Value                                   |
|-------------------------|----------------------------------------|
|Background primary       |`#0E0E0D` (warm near-black, not `#000`) |
|Background secondary     |`#141413` — header, rails, sunken rows  |
|Background card          |`#171716` — **the worst-case ground**   |
|Border (hairline)        |`#302F2C`                               |
|Border strong (rule)     |`#67655D` — 3.07:1, non-text bar        |
|Text primary             |`#F6F4EE` — 16.31:1                     |
|Text secondary           |`#A8A49A` — 7.21:1                      |
|Text tertiary            |`#888377` — 4.75:1                      |
|Accent (structure)       |`#E4E0D6` — warm near-ink               |
|Alt (secondary hue)      |`#6FB3AC` — slate teal, 7.45:1          |
|Brand crimson (rationed) |`--brand #C8102E` · `--brand-deep #7E0E22` · text-on-ink `--brand-bright #EA465B` (4.72:1)|
|Success                  |`#5CC98C` — 8.70:1                      |
|Warning                  |`#E3AA42` — 8.62:1                      |
|Danger (trend/status)    |`#EE7A72` — 6.55:1, never the brand red |
|Tier: Contending         |`#E4E0D6` (the ink family)              |
|Tier: Middle             |`#57C4E8`                               |
|Tier: Rebuilding         |`#9AA3EE`                               |

#### Light mode

|Role                     |Value                                   |
|-------------------------|----------------------------------------|
|Background primary       |`#F4F2EC` (paper)                       |
|Background secondary     |`#E8E5DC` — **the worst-case ground**   |
|Background card          |`#FBFAF6` — lifts by tone, never shadow |
|Border (hairline)        |`#CDC9BD`                               |
|Border strong (rule)     |`#868274` — 3.05:1, non-text bar        |
|Text primary             |`#111110` — 15.00:1                     |
|Text secondary           |`#4C4941` — 7.14:1                      |
|Text tertiary            |`#686456` — 4.70:1                      |
|Accent (structure)       |`#2E2C27`                               |
|Alt (secondary hue)      |`#2C6760` — 5.18:1                      |
|Brand crimson            |`#A71930` (`--brand-bright` the same)   |
|Success                  |`#147247` — 4.73:1                      |
|Warning                  |`#7A5606` — 5.27:1                      |
|Danger                   |`#AB3831` — 4.99:1                      |
|Tiers                    |Contending `#2E2C27` · Middle `#0E6E8C` · Rebuilding `#4A55BE`|

### Position identity colors (consistent across entire app)

Every position has its own identity colour — under Matchday this is the app's
colour world, not a decorative tag. Tokens live in `index.css` (`--pos-*`), are
exposed via Tailwind (`text-pos-qb`, `bg-pos-rb/15`, …), and all class maps live
in `src/utils/positionColors.js` (`POS_TEXT`, `POS_BG`, **`POS_FIELD`**,
`POS_TAG`, `POS_CHIP_ACTIVE`, `POS_SVG`). **Never
hand-roll position colours locally, and never reuse status colours
(success/warning/danger) to mean a position.**

|Position|Dark mode          |Light mode                         |
|--------|-------------------|-----------------------------------|
|QB      |`#F2758F` (pink)   |`#C4335A`                          |
|RB      |`#3AD0A4` (teal)   |`#0D7A5A` — deepened for the band  |
|WR      |`#57A9F2` (sky)    |`#1F6FC0`                          |
|TE      |`#F0964E` (orange) |`#AA5417` — deepened for the band  |
|DEF     |`#9AA3EE` (violet) |`#5A64C8`                          |

**Light RB and TE are deepened from their pre-Matchday values** (`#0F8A66`,
`#C05F1A`). A `PositionBand` reverses **paper type out of the hue**, and on the
old values that read **3.87:1** and **3.83:1** — under the AA body bar, and band
labels are small bold display type, not "large text". Every band label now
clears 4.5:1 in both themes (dark ones clear 7.1:1 or better, so that side
needed no change).

Where they apply:

- The **`PositionBand`** — a full-bleed field with the label and the group total
  reversed out. This is the primary use.
- Position labels and position rank (`#3 WR`) on player rows and in drawers
- Active position filter chips (`POS_CHIP_ACTIVE`, the tinted identity style);
  All / Picks chips keep the ink field
- The positional read on a League row — the position letter itself, lit or
  muted (`POS_TEXT`). `POS_BAR` / `POS_BAR_DIM` are **gone with the bars**
- Roster Analysis age-chart lanes (`POS_SVG` for SVG fill/stroke)
- Position tags in the trade builder / What's Fair / lineup FA drawer (`POS_TAG`)

### Pick round colors (consistent across entire app)

Class maps live in `src/utils/roundColors.js` (`ROUND_CLASSES`, `ROUND_TEXT`,
`ROUND_LABELS`) — shared by PickBadge and TeamCard, never redefined locally.

**A round is ORDINAL, so the encoding is an INK-DENSITY RAMP** (re-cut in step
4). Blackout gave the four rounds four *unrelated hues* — silver-on-charcoal,
blue, violet, grey, eight hardcoded hexes tuned to a palette the app no longer
has. Two things were wrong beyond the stale values: four unrelated hues encode
four *kinds* of thing, so the one fact the badge exists to carry (a 1st is worth
more than a 4th) had to be read off the label; and hardcoded hexes cannot invert
with the theme.

|Round|Treatment                                    |
|-----|---------------------------------------------|
|1st  |solid ink field, ground reversed out         |
|2nd  |2px ink rule, transparent                    |
|3rd  |1px `--border-strong`, `--text-secondary`    |
|4th  |1px `--border-default`, `--text-tertiary`    |

Built entirely from existing tokens, so it inverts by construction and inherits
the contrast the accessibility floor already measures — it needs no audit row of
its own. It also spends **no hue at all**, which keeps the five position colours
the only colour world on a roster screen (law 4).

### Status / verdict colors (consistent throughout)

|Status                |Color        |When used                                     |
|----------------------|-------------|----------------------------------------------|
|🔴 Hard block / Decline|Danger red   |Out, IR, bye, decline verdict                 |
|🟡 Soft flag / Counter |Warning amber|Questionable, projection flag, counter verdict|
|🟢 Confirmed / Accept  |Success green|Healthy, optimal, accept verdict              |
|🎯 Priority            |Ink          |Top trade partner tier                        |
|✅ Good Fit            |Muted green  |Second trade partner tier                     |
|⚪ Poor Fit            |Text tertiary|Lowest trade partner tier                     |

Verdict blocks (Accept/Decline/Counter) use a **flat tint** of their status
colour (`bg-x/10`). Status colours never appear on an ink field (see above) and
never mean a position or a section.

### Win window tier colors

Every tier has an identity colour — maps live in `src/utils/tierColors.js`
(`TIER_BADGE`, `TIER_TEXT`), shared by `WinWindowBadge` and the League health
banner chips. Never redefine locally. Contending takes the **ink family**:
under Matchday the structural colour is ink, not a metal.

### Rank medals

Ranking ordinals (league value rank, position rank cards, the League team list)
colour the top 3 as medals — gold/silver/bronze — via `rankClass(rank)` in
`src/utils/rankColors.js`. Everyone else stays text-tertiary. **A medal cannot
be used on an ink field** (amber vanishes on the cream one); there, top-3 is a
`<Mark tone="ground">`.

### Team avatars

`src/components/shared/TeamAvatar.jsx` shows the owner's Sleeper avatar
everywhere teams appear (team cards, position rankings, the League team list,
matchups, roster hero header). Sources, in order: custom team avatar URL
(`user.metadata.avatar`), Sleeper CDN thumb
(`https://sleepercdn.com/avatars/thumbs/{user.avatar}`), then a deterministic
**flat** initial circle (hash of team name), drawn from the app's own position
hues plus `--alt`, `--brand` and ink, with the page ground reversed out. It was
eight two-stop Tailwind gradients — the last gradient anywhere in the app, and
Matchday has none; flat also fixed a `text-white` sitting over a mid-weight ramp.
Static `<img>` tags only — this is
not an API call, so it doesn't go through `fetchJSON`. Always render the
fallback on image error; never let a broken avatar break a card.

### Ambient background — there isn't one

`.app-bg` and `.login-bg` are **flat**. Matchday is flat colour and hard edges:
no gradients anywhere (Blackout's two sanctioned score-bug gradients are gone),
no glows, no radial washes, and no `.hero-sweep` red conic — the hero is a
**field**, which needs no atmosphere behind it. The fixed app header is opaque
(`bg-bg-secondary`, no translucency or backdrop-blur — see rule 16) and closes
with a 2px ink masthead rule.

**Never re-propose an inset or neon glow on a tinted content card** — it was
built and reverted two minutes later for reading muddy (failure-archaeology
§5a). Matchday's answer to "this needs depth" is **size and ground**, never
elevation.

### Heroes, mastheads and bands

The loud moments, all made of the same ink:

- **The poster hero** — The Edge's franchise report, the Roster view's team
  header, the Optimizer's moves card, the Playoff Odds summary and the login
  screen. An `.ink-field-cap` strip (display label left, mono dateline right)
  closed by a hairline in its own ink, over an `.ink-field` panel, so cap and
  body read as one block. **The Edge's hero keeps team value as its marquee
  figure** — leading with the instruction instead was built, reviewed and
  **reverted on the owner's call (2026-09-11)**; the argument for the swap is
  recorded in `review-2026-09/unasked.md` §1 if it is ever revisited.
- **The app masthead** — the fixed header, display uppercase, closed by a 2px
  ink rule. The contents rail under it carries the same rule.
- **`SectionHeader`** — label, count, and a rule. It replaced Blackout's silver
  "lower-third": a gradient block with an 8px angled trailing cut and a small
  skewed identity slash. All three left — the gradient (flat colour), the clip
  (hard edges), and the slash (a decorative mark carrying nothing the label
  didn't). Colour moves onto the rule.
- **`PositionBand`** — the full-bleed position field. For a position group
  inside a list, prefer this over `SectionHeader`: the field is the direction's
  signature and the total says more.
- **`Mark`** — the reversed-out word inside a sentence.

### Section identity colors — GONE (2026-09-11, DESIGN-3)

**Navigation carries no colour at all.** The side drawer used to give each
section an identity hue defined inline in its `NAV_TREE` — and two of the six
were **status tokens**: Trade `text-success`, League `text-warning`, the same
values used for real success/error state in the same file. A green TRADE above
an amber LEAGUE read as "good / caution" before it read as navigation, in direct
breach of law 4.

The fix was structural, not a re-hue: navigation is **text**, in the Matchday
idiom — the tab bar, the contents rails and the Index carry no icons, no
swatches and no section hues. The Index deliberately carries no swatch either: a
section colour there would collide with the five position hues, which are
load-bearing on every other screen.

**Red is still rationed**, to two surfaces only: the "you" treatments (the
You-chip, my-row borders, my-pick highlights) and the **active contents-rail
underline**. The tab bar deliberately does not spend it — the bar is already an
ink field, and its active marker is ink in the bar's own colour.

### Logo — the Crown Crest

The mark is a crown built from analytics: three ascending bars (a rising chart)
as the crown's prongs, a jewel above each tip, and a detached base band as the
circlet. **Re-cut flat in step 4** — it wore a red-ramp gradient over a silver
crown with rounded bars, and its wordmark was set in Anton, a family the app
stopped loading in step 3 (so the in-app lockup had been falling back to a
system font).

It is now **two flat colours and one reversal**: a solid crimson field with the
crown reversed out in warm paper — the same move the hero, the band and the tab
bar make, in the brand spot rather than in ink — and the wordmark in the `Mark`
idiom, "DYNASTY" in plain ink with "EDGE" reversed out of a crimson block. Every
rect is square; the jewels were circles and the bars carried `rx="5"`.

- **In-app lockup:** `src/components/shared/DynastyEdgeLogo.jsx` — crown +
  "DYNASTY**EDGE**" wordmark.
- **App icon / favicons:** generated by `node scripts/generate-icons.mjs`
  (sharp + png-to-ico, devDependencies) into `public/`:
  `apple-touch-icon.png` (180px, **full-bleed, no border, no pre-rounded
  corners** — iOS applies its own mask), `favicon-32x32.png`,
  `favicon-16x16.png`, `favicon.ico`, `logo.svg`.
- The crown geometry lives in both the component and the script — keep them in
  sync and re-run the script after any change. Never ship an app icon with its
  own border or baked-in rounding (it clips badly on iOS).

### Typography

- **Display / headers:** **`Bricolage Grotesque`**, variable — `wght` 200–800
  (the app uses 700/800), `opsz` 12–96 driven **automatically** from font-size,
  `wdth` 75–100. Uppercase, negative tracking at display sizes. Display-only —
  never body text.
- **Body / UI:** `Archivo` (400–700, **plus italic** — the `.aside` voice)
- **Numbers / values:** `IBM Plex Mono` for FantasyCalc values and scores; also
  the **micro-label voice** — stat eyebrows, badges, chips and now **buttons**
  are IBM Plex Mono 500–600 uppercase with wide tracking.

Loaded from Google Fonts (`index.html`). Three families, as before the swap:
**Anton is gone.**

> **Why Anton went.** It ships **one weight**, so every display size carried the
> same stroke and the scale could only work through size (finding B5) — and the
> house rules ask for 300–800. Its uppercase was also, in the review's words,
> "the most generic possible sports choice".

> **MEASURED CORRECTION TO THE SPEC.** `directions.md` rev 1 change 7 pushes
> Bricolage to **`wdth 125`**. Google Fonts' Bricolage Grotesque has no such
> setting: its `wdth` axis runs **75–100 with a default of 100** (probed
> 2026-09-11 — `css2?family=Bricolage+Grotesque:wdth@75..125` returns HTTP 400,
> `@75..100` returns 200). **100 is both the maximum and the default, so the
> mock's declaration was a no-op** — which explains the recorded complaint that
> it "still reads fairly neutral even pushed onto its axes". It was never
> pushed. `font-stretch` is therefore **not** set (it would clamp silently and
> mislead the next reader); the work moves to `opsz` and `wght`. **If Bricolage
> doesn't earn its keep on device, the recorded swap candidate is Big Shoulders
> Display** — and the reason to swap is now evidence-backed, not taste.

#### The type scale

A **custom ladder on a 1.25 ratio**, replacing Tailwind's default in
`tailwind.config.js`. The default scale is itself a marker, and it is not a
ratio at all — its steps run 1.17 / 1.14 / 1.13 / 1.11 / 1.20 / 1.25 / 1.20 /
1.33. Anchored at **`sm` = 14px**, the app's most-used size, so that step is
unchanged and the blast radius falls on the display end.

|Key|px|Key|px|
|---|---|---|---|
|`2xs`|8.96|`xl`|27.34|
|`xs`|11.20|`2xl`|34.18|
|`sm`|**14.00**|`3xl`|42.72|
|`base`|17.50|`4xl`|53.40|
|`lg`|21.88|`5xl`|66.76|

Each step carries **its own line-height and letter-spacing** — default values
for both are a separate marker. The ladder tightens from 1.55 at body to 0.90 at
poster scale, and tracking runs +0.01em at caption to −0.05em at the marquee
figure. A `tracking-*` utility at the call site still wins (Tailwind emits
letterSpacing after fontSize), so the small uppercase labels keep their positive
tracking.

#### Italic, and `text-wrap: balance`

Both are on the marker list precisely because generated UI never reaches for
them.

- **`.aside`** (`index.css`) is italic, and it is **one specific voice: the
  app's honest caveat** — "values are at today's prices", "this is a local
  preview", the reason a section is empty. Never decoration, never emphasis
  (emphasis is a `Mark`). Carried by `ErrorState` and `Select`'s hint today.
- **`text-balance`** is on `Button`, `SheetHeader`'s title, `ErrorState`, the
  Index rows and the player name.
- **`::selection`** is styled as the ink field — the browser's default blue is a
  hue this palette does not contain.

### Spacing and layout

- Content padding: `16px` left/right on mobile. A `PositionBand` **cancels it**
  (`-mx-4 px-4`) to bleed.
- Panel border radius: **0**. **Sheets, modals and the drawer keep their radii**
  and their full gesture contract.
- Side drawer width: `80vw`, max `300px`; respects iPhone safe-area insets
- Section headers: Bricolage extra-bold, 12px, wide tracking, over a rule
- Player rows: compact, and **nothing load-bearing truncates** — the value
  column is variable-width, so a long name wraps

### Motion

> **Step 5 shipped 2026-09-12 and this section is the live truth.** The measured
> starting point, for reference: **one** `@keyframes`
> (`.edge-rise`, a fade-up on The Edge), 69 `transition-*` utilities of which
> **67 animate opacity or colour and one animates `transform`**, and **3**
> explicit timing values in the whole app — so virtually every transition ran
> Tailwind's default 150ms `cubic-bezier(.4,0,.2,1)`. There was no easing curve
> in this app that anyone chose. The app faded and tinted; it never moved.

#### The reduced-motion guard is GLOBAL, and it landed first

`index.css` closes with a `@media (prefers-reduced-motion: reduce)` block over
`*`, `*::before` and `*::after`. It zeroes animation and transition **duration
and delay**, caps `animation-iteration-count` at 1, and sets `scroll-behavior:
auto`. `!important` throughout: the point is that no screen and no future
primitive can opt out.

**It was written before any motion was added, deliberately.** The old guard
covered exactly one class (`.edge-rise`) — adequate only while nothing else
moved, and a trap the moment that stopped being true, because a class-scoped
guard has to be extended by whoever adds the next animation and the failure is
silent for everyone who doesn't have the setting on.

Three details are load-bearing:

- **Duration goes to 0.01ms, not 0.** Zero makes some engines skip the animation
  entirely, which also skips its `end` event; 0.01ms runs it in one frame and
  still fires.
- **Delay goes to 0 as well.** Zeroing only the duration of a jittered stagger
  leaves the delays intact, so the last row of a list would still sit blank for
  400ms — a *slower* first paint than no motion at all, the exact opposite of
  what the setting asks for.
- **CSS cannot reach a programmatic smooth scroll.** `scroll-behavior: auto`
  does not override a `scrollIntoView({ behavior: 'smooth' })` argument, and a
  long smooth scroll is a reliable vestibular trigger. The two places that jump
  the page — THE CALL's act anchors and Rookie Research's board jump — go
  through **`scrollToTopOf`** in `components/ui/motion.js`, which reads the
  media query at call time (not cached: the setting can change mid-session).

**`useSheetDrag`'s spring-back is caught by the duration rule and that is
correct** — a released sheet snaps home instead of easing. The gesture itself is
direct manipulation rather than animation and is untouched.

#### One curve, and durations scaled to element size

**`--ez: cubic-bezier(.16, 1, .3, 1)`** (`index.css`, on `:root` — motion does
not invert with the theme) is the app's only easing token, and Tailwind emits it
as the **DEFAULT `transition-timing-function`**. That is the point of setting
DEFAULT rather than adding named curves: it reaches all 69 `transition-*`
utilities at once, with no call-site change and no way for a screen to miss it.

It is an **expo-out**, and its profile is worth knowing precisely because
**nominal duration is not perceived duration on this curve**. Measured by
solving the bezier:

|fraction of duration|0.10|0.20|**0.33**|0.42|0.62|1.00|
|---|---|---|---|---|---|---|
|`--ez` travelled|49%|75%|**88%**|95%|99%|100%|
|Tailwind's default|3%|13%|41%|64%|89%|100%|

So a 620ms band wipe is 95% done in **264ms** and a 340ms sheet in **145ms** —
which is why the numbers in the ladder below look larger than they feel, and why
the press run can afford 620ms without reading as slow. Set a duration by the
*perceived* travel you want and then roughly double it.

**Duration is a function of how far a thing travels, which in practice means how
big it is.** A chip tint and a 300px drawer crossing the screen shared one number
before this. The ladder (`tailwind.config.js` → `transitionDuration`):

|token|ms|for|
|---|---|---|
|`duration-tap`|90|press feedback — must read as instantaneous|
|`duration-mark`|150|small ink: a chip, a badge, a row tint, a link|
|`duration-panel`|240|a block, or an overlay resolving|
|`duration-sheet`|340|a full-width surface crossing the screen|

`DEFAULT` stays **150ms** — the value Tailwind already shipped, restated as a
chosen one so the diff is honest about what actually changed here: the curve,
not the speed of a colour tint. An un-suffixed `transition-colors` is therefore
`mark`-speed by definition and needs no class.

**The one deliberate exception is `useSheetDrag`'s spring-back**, which sets an
inline `transform 0.25s ease-out`. It is left exactly as it is: it belongs to the
sheet-gesture family (failure-archaeology §2, six settled battles), the release
is the tail of a direct manipulation rather than an entrance, and nothing about
it is improved by a house curve.

#### The press run — the signature entrance

*"Flat colour bands wipe across the page, then type drops in behind them. Ink
hitting paper."* Three keyframes in `index.css`, fired in that order:

|class|what|duration|
|---|---|---|
|`.press-band`|a solid field prints left to right (`clip-path` inset from the right)|620ms|
|`.press-ink`|the type lands behind the band — a short drop from above with a slight vertical over-scale, `transform-origin: top`|580ms|
|`.press-set`|a row sets under a downward clip, opacity floor **0.2**, never 0|440ms|

It replaced **`.edge-rise`**, a 0.35s fade-up on Tailwind's default ease — two of
the twelve researched slop markers in one animation (a fade-up entrance, and at
the call site a linear 0/60/120/180ms stagger), and the only keyframe in the app.

Every property is compositor-cheap (`clip-path`, `opacity`, `transform`).
**Nothing animates layout** — motion must not cost a paint.

**The fill mode is `backwards`, and both alternatives are wrong.** With no fill a
delayed block paints at full opacity through its delay and then jumps to the
start of its own animation — a flash. With `both` the block keeps its final
keyframe forever, which for a wipe is a permanent `clip-path: inset(0 0 0 0)`:
visually identical, and it silently clips **`.tap-target`'s 44px hit area** back
to the element box at the block's edges, because clip-path clips hit-testing as
well as paint.

#### The stagger is jittered, and monotonic by construction

**`stagger(index)`** (`components/ui/motion.js`) is a **cumulative sum of
independently-drawn gaps**, each within 0.6×–1.45× of a 46ms base, capped at
420ms. Two properties it needs and the obvious implementations don't have:

- **Pure in the index, not `Math.random()`.** React re-renders; a random delay
  would hand a block a different number on each pass.
- **Independent of call ORDER.** The mock advanced one shared LCG per call,
  which is right for a template rendered top to bottom and wrong here —
  conditional sections mean block 5 is not always the fifth call. Hashing the
  index means a block's delay depends only on where it sits.

**Summing gaps rather than scaling a linear base is a measured choice.** The
mock's multiplicative form (`i * base * jitter`) produces 15 / 52 / 123 / 176 /
**145** / 270 / 361 / 420 / **398** on nine blocks — two inversions, where a
later block lands *before* an earlier one. That reads as broken, not irregular.
The shipped form gives 0 / 57 / 107 / 145 / 189 / 248 / 292 / 348 / 399: gaps of
38–59ms, no two alike, never out of order.

#### The press — `.press`, the third control-level contract

**`.press` (`index.css`) is the one definition of "this control answers a
finger": a 90ms dip to 60%, on `--ez`.** It is the sibling of `.focus-ring`
(focus) and `.tap-target` (hit area), and it exists for the same reason both of
those do — a control-level contract belongs in one place, not at forty call
sites. **Every pressable in the app carries it**, and the primitives carry it so
no screen can miss it.

The audit it came out of: **41 `active:` opacity states across 20 files at three
different values for one gesture** — `Button` dipped to 70%, `Card` to 80%,
everything else to 60% — plus five consumers restating `Button`'s own
`active:opacity-70` on a `Button`, and roughly a dozen real pressables with no
press state at all (the header's Menu and Find, the Playoff Odds and Roster
Analysis explainer toggles, the action-item Dismiss, the roster Back link, the
Index rows, four drawer rows, the tab bar, the contents rail, Pick Trades' mode
toggle). That is the same drift `/design-review`'s nine greps sailed past on
`.focus-ring` in step 4.

**The dip is `filter: opacity()`, not `opacity`, and that is what lets one rule
cover the app.** A flat `opacity: 0.6` is *absolute*, so it is wrong on any
control whose resting opacity already means something — and there are two: an
inactive tab-bar item sits at 55%, a drafted prospect row at 50%. Pressing
either would have moved it to 60%, i.e. **brighter**. `filter` composes:
1 × 0.6 on an ordinary control, 0.55 × 0.6 = 0.33 on the faded tab. Same
proportion, no exceptions needed.

**`.press` owns the whole transition**, colour properties included, so an
element carrying it takes no `transition-*` utility — a Tailwind
`transition-colors` sits in the utilities layer and would replace the shorthand
outright, silently dropping the dip. `:not(:disabled)` so a disabled control
does not answer at all.

**Deliberately not `.press`**, because their press already says something more
specific: the trade builder's remove controls flash `danger`/`warning`, the
login team rows tint their background, the draft board's drag handle swaps its
cursor.

**Verified by probe, not by eye** — every pressable on every route, counted in
the live DOM: The Edge 42/42, My Team 49/49, Lineup 61/61, Trade Analyzer 15/15,
Targets 43/43, Managers 15/15, Pick Trades 53/53, League 36/36, Movers 84/84,
Free Agents 155/155, Playoffs 15/15, Season Review 14/14, Trajectory 44/44,
Draft Board 486/486, Research 484/484, Tracker 60/60, News 333/333, Index 21/21.

#### There is no spinner — `Loading` and the press bar

**The app has no loading spinner.** It carried four `animate-spin` circles and
one `animate-pulse`, both on the researched marker list; the circles were also,
with the avatar and the sheet grabbers, the last radius in an app whose law 3 is
square-with-a-hairline.

**`Loading`** (`components/ui/`) replaced all five, and the replacement is not a
stock indeterminate progress bar either. There is no track and no segment
travelling along one: the rule **prints** from the left, holds, and **clears**
from the left — `.press-bar`, the press run's own wipe, looped. Waiting reads as
the press running rather than as a widget borrowed from elsewhere. Flat ink,
square, no gradient, no radius.

**The label is the information; the movement is only liveness** — which is why
the indicator never renders without one. A spinning circle answers "the app is
alive" and answers it identically for a 200ms wait and a 20s one. The app
already shipped the better idiom in WhatsFair's *"Working out what it would
cost… — N to go"*, and that is text.

That split is what makes it degrade correctly: under reduced motion the global
guard caps iterations at 1 and duration at 0.01ms, and with no fill mode the
rule reverts to its base state — **a solid, still ink rule under its label**.
Nothing throbs and nothing is lost.

Two variants. The **block** form (a view-level state) carries the page's own
16px gutter, because nearly every caller is an early `return` that replaces a
view *before* its padding wrapper exists; `padded={false}` is for the one caller
already inside one. The predecessor was centred, which is why it never exposed
this — a centred spinner cannot touch the screen edge, a full-width rule can.
The **`inline`** form (a section inside a card or drawer) is a 16px rule beside
its label, because a full-width rule there reads as a divider.

`animate-pulse` was a green dot beside the words "Live Intelligence". It is gone
rather than restyled: the dot said nothing the label did not.

#### The sheet arriving

A sheet used to appear between one frame and the next, which on a surface
covering most of the screen reads as a glitch rather than a transition. It now
**prints up from the bottom edge** (`.sheet-print`, 340ms — 95% of the travel by
145ms) while the scrim inks in behind it (`.overlay-ink`, 240ms). Carried by
`Sheet`, `Modal`, and both sanctioned hand-rolled overlays (`PlayerSearchSheet`,
`TradeBuilder`'s add sheet).

**It animates `clip-path`, never `transform`, and that is not a style choice.**
`transform` on the sheet panel belongs to `useSheetDrag`, which writes it inline
during a drag and again for the spring-back; an entrance animating the same
property would fight the gesture for it. The sheet family is six settled battles
deep (failure-archaeology §2) and none of them is visible to headless Chromium,
so the entrance was built to stay out of the gesture's way by construction.
**Nothing about `useSheetDrag`, `useScrollLock`, the arming condition, the
overscroll containment or the safe-area padding was touched.**

`backwards` again, and here for a second reason on top of the flash: the panel
is `rounded-t-2xl`, and a lingering `inset(0 0 0 0)` would leave a square clip
sitting on a rounded box forever. During the wipe the rounded corners are simply
the last thing revealed, which is correct.

#### The moment budget — four moments, and everything else is instant

| moment | where | why it earns a place |
|---|---|---|
| **the press run** | The Edge's entrance, and nowhere else | the signature |
| **the press** | every pressable, 90ms | the app answering a finger |
| **the sheet** | a sheet printing up from the bottom edge | the one surface that arrives |
| **the press bar** | loading | the app saying it is working |

**The press run is on the home screen only, and the budget is what decides
that.** A 620ms wipe on every navigation is a wipe you see forty times a day,
and it delays reading a screen you navigated to *deliberately* — you already
know what you want. The Edge is the opposite case: it is the default route, you
arrive without a target, and you read it top to bottom. **The signature stays
app-wide by being a MATERIAL rather than a page transition** — the same band
wipe carries the sheet and the loading bar, so the idiom appears on every screen
while exactly one screen animates its entrance.

Considered and cut, with the reason each failed:

- **An entrance on every screen** — see above.
- **A number roll-up on `Magnitude`.** It re-renders on every data refresh and
  every trade-builder toggle, so it would fire constantly; and law 2 says type
  size *is* the quantity, so animating the size puts the wrong quantity on
  screen while it animates.
- **A sliding tab-bar marker.** The marker would be briefly under the wrong tab,
  and a tab change should read as instant.
- **A verdict reveal on THE CALL.** It recomputes on every asset toggle — dozens
  of times per trade.

-----


