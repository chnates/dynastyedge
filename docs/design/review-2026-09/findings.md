# DynastyEdge — UX/UI + IA review: findings

Every finding is tagged **[MEASURED]** (verifiable from source or a screenshot,
cited) or **[JUDGMENT]** (my taste, argued but not proven). Ranked by what it
costs you, not by how easy it is to fix.

Evidence base: 40 captures of every destination in both themes + 8 special
states (drawer, profile drawer, a loaded Analyzer, a bottom sheet, global
search), all at 390px against live data, in `.screenshots/audit/`.
Destination inventory: `inventory.md`.

---

## Part A — Information architecture

### A1. Four real features are invisible. [MEASURED]
Season Review, my own Dynasty Trajectory, Manager Scouting and Rookie Research
have **zero content-level inbound links** — no screen in the app points at
them. Rookie Research is additionally **absent from global search**
(`PlayerSearchSheet.jsx:27-46` lists 18 destinations and omits
`/draft/research`), so it is the one view that cannot be found by searching
for its own name.

These are not small features. Manager Scouting walks every season of league
history; Trajectory is the app's only forward-looking model. They are as
discoverable as a keyboard shortcut nobody documented.

**Cost:** you paid for four features and can only reach them by remembering
they exist.

### A2. The sub-tab bar is a byte-identical second copy of the drawer. [MEASURED]
All 17 sub-tab entries are the same label→route pairs as the drawer's children:

| Section | `SUB_TABS` | Drawer children |
|---|---|---|
| My Team | My Roster · Lineup · Season Review · Trajectory | identical |
| Trade | Partners · Analyzer · Targets · Managers · Pick Trades | identical |
| League | Overview · Free Agents · Activity · Movers · Playoffs | identical |
| Draft | Board · Research · Tracker | identical |

The app runs two navigation systems over one payload. The drawer's only
advantage over a bottom bar — that it shows children — is spent duplicating a
layer that is already on screen once you arrive.

### A3. Depth is flat at 2 taps. The cost is context, not taps. [MEASURED]
The always-expanded drawer puts all 21 destinations exactly 2 taps from The
Edge. "Too deep" is the wrong diagnosis. What it actually costs:

- Both taps go through a **full-screen overlay that hides the screen you were
  reading** — so moving between two views always means losing sight of the
  first. This is the thing you feel as "context-wiping".
- The drawer is the **only map**. Nothing on any content screen tells you the
  other 20 views exist (A1 is the acute case of this).
- Reaching it means a **top-left** tap on a 390px phone — the corner furthest
  from your thumb, on a one-handed device with no OS back button.

### A4. "Pick Trades" is clipped off its own nav row. [MEASURED — screenshot]
`.screenshots/audit/trade-targets-dark.png`: the Trade sub-tab row at rest
reads `PARTNERS ANALYZER TARGETS MANAGERS PICK TRA…`. `SubTabBar` is
`overflow-x-auto` with a right fade, so the fifth destination in the section
sits off-screen until you scroll a nav bar sideways. CLAUDE.md records the
sub-tab crowding issue as "RESOLVED"; it was converted from wrapping to
clipping, which is quieter but not better.

### A5. Two of six sections are weekly; two are not. [MEASURED inventory + owner input]
You named The Edge, Trade, My Team and League as the weekly four. Draft and
News hold the same top-level rank. Draft is three seasonal views (its two
linked entry points only fire during draft season); News is a browse that
already surfaces its best items on The Edge under Headlines. **A third of
top-level navigation is spent on things you don't open in a normal week.**

### A6. Section colors reuse the status tokens. [MEASURED]
`SideDrawer.jsx:74,85` assign Trade `text-success` and League `text-warning` —
literally the success-green and warning-amber tokens, used in the *same file*
for actual status at lines 383, 404, 417, 453. CLAUDE.md's own rule is that
status colors keep exclusive meanings ("a TE label must never read as
danger"). A green TRADE icon above an amber LEAGUE icon reads as
"good / caution" before it reads as navigation.

### A7. The workflow that breaks across sections. [MEASURED]
The trade workflow is well-linked (7 inbound routes to the Analyzer). The one
that isn't: **evaluating your own team over time.** My Roster (`/my-team`) →
"is this roster aging out?" lives in Trajectory, a sibling sub-tab with no
link from the roster; → "who should I call?" lives in Trade; → "how has that
owner traded before?" lives in Manager Scouting with no link from anywhere.
Three sections, no connective tissue, and you have to know all three exist.

---

## Part B — Visual design

### B1. The current look lands on two of the three named AI-default aesthetics. [MEASURED against the skill's own calibration]
Anthropic's `frontend-design` skill names the three clusters AI-generated
design defaults to. DynastyEdge is simultaneously:

- **#2** — "a near-black background with a single bright acid-green or
  vermilion accent": `--bg-primary #0B0B0D` + a rationed `--brand #C8102E`.
- **#3** — "hairline rules, zero border-radius": `Card` is literally
  `rounded-none … border border-border-default`.

This is the answer to "why does it look AI-built even though it was designed":
**the Phase 3 brief specifies the generic outcome.** Compliance cannot fix it
because compliance is what produces it. That is a finding about the brief, not
about the execution — the execution of that brief is competent throughout.

### B2. Extraordinary content is rendered at uniform weight — mostly. [MEASURED — screenshots]
Your hypothesis, tested on three screens:

- **My Roster** (`myteam-dark.png`) — **confirmed, badly.** 26 player rows,
  identical height, type size and layout. **Bo Nix (4,867) and Xavier Legette
  (365) — a 13× spread — are visually indistinguishable.** Value is encoded
  only as a four-digit number you must read and rank yourself. No bar, no size
  ramp, no weight ramp, no color ramp anywhere on the screen.
- **Trade Targets** (`trade-targets-dark.png`) — **confirmed.** 11 identical
  cards. The loudest element on every one is the player's *name*, set in Anton
  uppercase — the least decision-relevant field on the card (you know who
  Ja'Marr Chase is). The most decision-relevant fields, the two appeal reads
  (`WEAK FOR YOU` / `FAIR FOR THEM`), are the smallest text on the card.
- **Playoff Odds** (`league-playoffs-dark.png`) — **disconfirmed, and this is
  the useful part.** This screen *does* differentiate: the odds bars vary in
  length and shift green → amber → red, rank ordinals carry medals, your row
  gets a red border. It is by a distance the most scannable screen in the app.

**The real finding is sharper than "everything is flat": the app already
contains exactly one good magnitude encoding and uses it on exactly one
screen.** The playoff bar is the pattern. Nothing else reuses it.

### B3. The trade price is truncated. [MEASURED — source + screenshot]
`WhatsFair.jsx:198` sets `truncate min-w-0` on the `Est. cost:` value. Live at
390px this renders `Jordan James + Jordan Love + Jonatha…` on 5 of 11 target
cards. The single most actionable field on the board — what the trade costs
you — is the one that elides.

### B4. Light mode's hero is a foreign object. [MEASURED — screenshot]
`edge-light.png`: the score-bug hero is "deliberately dark in BOTH themes" per
the brief, so in light mode a near-black slab sits at the top of a white page
belonging to nothing else on it. The section-header bugs are dark grey blocks
for the same reason. Light mode reads *more* generic than dark mode, not less
— it is white cards, 1px borders, even spacing, almost no color.

### B5. Typography: three faces, one voice. [JUDGMENT, with a measured part]
Measured: Anton ships **one weight**, so every display size is the same
stroke; the type scale does its work through size alone. Archivo carries body
at 3–4 sizes. IBM Plex Mono carries numbers.

Judgment: the scale is not doing enough work. A 46px hero number and a 15px
row value are the same *idea* at two sizes — there is no weight, width or
optical contrast between them, and no face on the screen has any personality
that isn't "condensed sportscast". The one real typographic decision in the
app — Anton uppercase — is also the most generic possible sports choice.

### B6. Color: the ration produces grey. [JUDGMENT]
Red appears on three surfaces (hero cap, "you" accents, active sub-tab). Silver
does everything else. The result is that **structure is achromatic**, so the
only color on most screens is semantic (green/amber/red trends) and positional
(the five position hues on small tags). Restraint was the goal; the outcome is
that the app has no color identity of its own — it borrows all of its color
from data. That is why it reads as grey even though five hues are on screen.

### B7. Density and rhythm are uniform by construction. [JUDGMENT — screenshots]
Every screen is a vertical stack of full-width, evenly-spaced,
1px-bordered rectangles. There is no second density register: nothing is a
tight table, nothing is a wide open moment, nothing is two-up. On The Edge, an
Action Item you must act on today and a Market Radar row you'll never tap have
the same padding, the same border and the same width.

### B8. Depth and atmosphere were removed, and it cost more than it saved. [JUDGMENT]
Phase 3 flattened the background, removed all gradients and glows, and set
every radius to 0. That was a correct reaction to a real problem (the reverted
neon-glow experiment, failure-archaeology §5a). But the fix over-corrected:
with no elevation, no radius and no ground, **nothing on screen can be "above"
anything else**, so the only hierarchy tool left is size — which B2 shows isn't
being used either.

---

## Motion

Measured across the whole codebase:

| | count | note |
|---|---|---|
| `@keyframes` | **1** | `edge-rise`, 0.35s, The Edge only |
| `transition-*` utilities | **78** | see breakdown |
| — `transition-opacity` | 40 | fades |
| — `transition-colors` | 34 | tints |
| — `transition-transform` | **3** | |
| — `transition-shadow` | 1 | |
| `animate-spin` / `-pulse` | 10 | 8 spinners + 1 pulse |
| explicit `duration-*` / `ease-*` | **6 total** | everything else is Tailwind's default |

**The sharpest fact: 74 of 78 transitions animate opacity or color. Only 3
animate `transform`.** The app fades and tints; it never *moves*. That is the
mechanical reason it feels inert, and it is a more precise diagnosis than
"there's no animation".

Second: with 6 explicit timing values in the entire app, virtually every
transition runs Tailwind's default 150ms `cubic-bezier(.4,0,.2,1)`. **There is
no easing curve anywhere in this app that anyone chose.** Default easing is to
motion what Inter is to type.

Third: `prefers-reduced-motion` is honored, but the guard covers exactly one
class (`.edge-rise`, `index.css:182`). It is adequate today because nothing
else moves. **Any direction that adds motion must widen that guard** — it is
not a general rule today.

---

## Accessibility pass (`web-design-guidelines`)

Cheap to include, and real bugs fell out.

### X1. `--text-tertiary` fails WCAG AA in both themes. [MEASURED — computed]
- Dark: `#54565C` on `--bg-card #141417` = **2.5:1** (AA body needs 4.5:1; even
  large text needs 3:1).
- Light: `#8A9096` on `#FFFFFF` = **3.2:1**.

It is used **525 times** across components, and not for decoration — it carries
the meta lines on every player row (`#271 OVR · #109 WR · Age 25`), timestamps,
and the reason lines under trade targets.

### X2. No focus-visible state anywhere in the design system. [MEASURED]
`Button`, `IconButton`, `Card` (interactive), `Chip` and `Badge` define no
focus ring. `Input` and `Select` actively *remove* the outline
(`focus:outline-none focus:border-accent`) and replace it with a 1px border
tint. Low practical cost on a touch-only PWA; a real gap nonetheless, and the
cheapest thing on this list to fix.

### X3. Sheet close buttons are under the 44px minimum. [MEASURED]
`IconButton` is `w-8 h-8` (32px) / `w-9 h-9` (36px) — and it is the close
control in every sheet and drawer header. `Button` `sm` (~30px) and `md`
(~36px) are also under; only `lg` reaches 44px. The app header's own buttons
are `w-11 h-11` (44px), so the rule is known and broken elsewhere.

### X4. `touch-action: manipulation` appears 0 times. [MEASURED]
Minor on modern Safari, but it is the standard guard against double-tap zoom
on controls.

### X5. Done well, worth saying. [MEASURED]
`tabular-nums` is used 145 times — number columns line up correctly
throughout. The sheet gesture contract (`useScrollLock` + `useSheetDrag` +
`overscroll-contain` + safe-area padding) is applied consistently and is
genuinely good work; failure-archaeology §2 shows what it cost to get there.

---

## What I could not verify

- **Real-device feel.** Everything here is headless Chromium at 390px. Scroll
  inertia, `backdrop-filter` cost, and the PWA status bar can only be judged on
  the phone. Direction C's glass in particular is a **performance risk I have
  not measured** and must not be shipped on the assumption that it's free.
- **The drawer's data-status "News —" row** in `drawer-dark.png` is a known
  capture artifact (visual-capture skill, gotcha 5), not a dead pipeline. Not
  reported as a bug.
- **Whether uniform density actually slows you down.** B2 and B7 are argued
  from the screenshots, not from a timed task. I believe them; they are not
  measured.
