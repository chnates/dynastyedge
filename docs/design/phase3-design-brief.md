# Phase 3 Design Brief — "Primetime Blackout"

> **Status: ACTIVE — owner-approved 2026-07-19.** This is the brief for the
> Phase 3 visual refresh (CLAUDE.md → Navigation Refactor → Phase 3). Per the
> vendored `frontend-design` skill, this brief's words win over the skill's
> generic guidance. The authoritative visual reference is
> `phase3-b2-reference.png` in this directory (390px render of The Edge +
> League Overview in the approved direction).

## The decision

Three directions were mocked and reviewed by the owner (Crown Jewel /
Primetime / Trading Floor), then the two finalists were re-cut in Atlanta
Falcons colors (the owner's team). **Chosen: "B2 — Primetime Blackout"** — a
broadcast-graphics rebrand on the Falcons palette where **silver leads and
red is scarce**.

The one-sentence thesis: *NFL primetime broadcast graphics, blacked out —
silver score-bugs and angled lower-thirds carry the structure; Falcons red
appears only where it means "the marquee number" or "you."*

## Design law (the rules that resolve every argument)

1. **Red is rationed.** Falcons red appears ONLY on: the hero's score-bug
   cap bar, the owner's own card/row treatments ("you" accents: border,
   avatar, You-chip), and the active sub-tab underline. Everything else that
   used to be accent-blue becomes **silver** (structure) or stays its
   semantic color. If a surface feels like it wants red, the answer is
   silver.
2. **Trend/status semantics are untouchable.** Green = rising/healthy,
   red-salmon = falling/blocked, amber = caution — exactly the surfaces that
   use them today. Brand red (#C8102E family, dark crimson) and trend red
   (#FF5C5C, bright salmon) must never be the same value and never swap
   roles. This is why Blackout won over the red-everywhere variant.
3. **Position identity colors survive the rebrand** (tuned hues below).
   Status colors still never mean positions and vice versa (CLAUDE.md rule).
4. **The signature is the angle.** Section headers become silver
   "lower-thirds" with a hard 8px angled trailing cut; hero and team cards
   carry score-bug caption bars; action-item cards get a bottom-left corner
   cut. Angles are the ONE structural flourish — do not add glows, gradients
   (beyond the two sanctioned ones below), or new decorative devices.
5. **Boldness is spent in the hero.** The red score-bug hero is the one loud
   moment per screen. Everything else: flat panels, 1px borders, disciplined.

## Token system

### Dark mode (default)

| Role | Old | New |
|---|---|---|
| Background primary | `#0D0D0F` | `#0B0B0D` |
| Background secondary | `#16161A` | `#101013` |
| Background card | `#1C1C21` | `#141417` |
| Border | `#2A2A30` | `#28282E` |
| Text primary | `#F0F0F5` | `#F4F5F7` |
| Text secondary | `#8A8A95` | `#8A9096` |
| Text tertiary | `#55555F` | `#54565C` |
| **Accent (structure)** | `#4F7FFF` blue | **`#C9CDD1` silver** |
| **Brand red (rationed)** | — | **`#C8102E`**, gradient partner `#7E0E22`, bright text-on-dark variant `#D81E3C` |
| Success green | `#22C55E` | `#37C878` |
| Danger red (trend/status) | `#EF4444` | `#FF5C5C` |
| Warning amber | `#F59E0B` | `#F59E0B` (unchanged) |
| Ambient glow | blue/violet radials | none — flat black; the old `.app-bg` glows are removed. A single faint red conic sweep behind the hero area only (`rgba(216,30,60,.06)`) is sanctioned. |

Sanctioned gradients (the only two): red score-bug `linear-gradient(90deg,#C8102E,#7E0E22)`
(white text) and silver score-bug `linear-gradient(90deg,#C9CDD1,#8F949B)` (near-black text `#101013`).

### Light mode (starting points — verify on-screen during execution)

Background `#F0F1F3` · secondary `#E7E9EC` · card `#FFFFFF` · border
`#D9DCE1` · text `#101013`/`#54565C`/`#8A9096` · structure "silver" becomes
slate `#5C6470` · brand red deepens to `#A71930` (contrast on white) ·
success `#1F9D5C` · danger `#D8383F` · silver score-bugs keep dark text; red
score-bugs keep white text. Light mode ships in the same pass as dark for
every screen — never as a follow-up.

### Position identity (dark / light)

QB `#F2758F` / `#C4335A` · RB `#3AD0A4` / `#0F8A66` · WR `#57A9F2` /
`#1F6FC0` · TE `#F0964E` / `#C05F1A` · DEF `#9AA3EE` / `#5A64C8`.
Same application surfaces as today (`positionColors.js` maps).

### Tier, medals, rounds

Contending **silver `#C9CDD1`** (was gold — gold leaves the system) · Middle
cyan `#57C4E8` · Rebuilding indigo `#8F9BF2` (light-mode: `#4A5560` /
`#0E7C9E` / `#5560CE`). Rank medals (top-3 ordinals) keep gold/silver/bronze
— they are ordinal semantics, not brand. Pick-round colors (`roundColors.js`)
re-tune to the new palette in execution; 1st-round moves from gold-amber to
silver-on-charcoal so it can't collide with the warning amber.

### Typography

| Role | Old | New |
|---|---|---|
| Display / section headers | Barlow Condensed | **Anton** (400 only — it has one weight; uppercase, tracked) |
| Body / UI | IBM Plex Sans | **Archivo** (400/500/600/700) |
| Numbers / values | IBM Plex Mono | IBM Plex Mono (unchanged) |

Google Fonts, same loading path as today. Barlow Condensed and IBM Plex Sans
are removed from the font request when the migration completes. Anton is
display-only — never body text; micro-labels (stat eyebrows, badges) are IBM
Plex Mono 500–600 uppercase with wide tracking (the "score-bug label" voice).

### Shape

Card radius drops from 12px to **0** (broadcast panels are square). The
angled cuts: lower-third headers `clip-path: polygon(0 0,100% 0,calc(100% -
8px) 100%,0 100%)`; action cards cut the bottom-left corner (10px). Sheets
and the drawer keep their current radii and full sheet contract — the
gesture/scroll architecture is untouchable (see failure-archaeology).

## What this pass does NOT touch

- No IA, routes, component structure, or copy changes — repaint only.
- No new npm dependencies. Fonts are a Google Fonts URL change.
- `useSheetDrag` / `useScrollLock` / sheet mechanics / `<main>` layout: frozen.
- **PWA metas: values-only.** `theme-color` values in `useTheme` update to
  the new backgrounds; the `black-translucent` status-bar meta + light-mode
  strip architecture is NEVER touched (see CLAUDE.md rule 16 and the PWA
  saga). Icon `?v=N` bumps only when the logo ships.
- Trend-arrow thresholds, FAAB formatting, all display rules: unchanged.

## Execution order (each step = one reviewable commit, branch-only)

1. **Token pass:** `index.css` vars + `tailwind.config.js` + fonts +
   `positionColors.js` / `tierColors.js` / `roundColors.js` / `rankColors.js`.
   App is fully usable after this commit alone (old shapes, new skin).
2. **Primitive pass:** `src/components/ui` (Card to square+cut variants,
   Chip, Badge, Button, SectionHeader → lower-third, SubTabBar restyle) —
   this is where the drawer-hierarchy watch-item gets its rail/type rework.
3. **Hero/score-bug pass:** The Edge hero + RosterView team header (the old
   `.hero-card` stadium-lights treatment is replaced by the red score-bug).
4. **Per-section sweeps:** My Team → Trade → League → Draft → News → login →
   drawer, each screenshot-verified at 390px in BOTH themes.
5. **Logo/icons:** crown crest re-cut in red/silver, `generate-icons.mjs`
   re-run, `?v` bump. Owner eyeballs before merge.
6. **Docs:** CLAUDE.md Design System section rewritten to match, same
   commits as the changes they describe (change-control rule).

**Gates per commit:** lint + test + build green · `/design-review` on every
UI diff · `web-design-guidelines` audit on the section sweeps · 390px
screenshot in dark AND light before a section is called done. Nothing merges
to `main` until the owner has seen rendered results and approved.
