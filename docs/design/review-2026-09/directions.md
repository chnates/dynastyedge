# Three directions

Live comparison (both themes, working motion):
**https://claude.ai/code/artifact/b9e5532d-d2c5-4758-a59b-c04ceec6fc51**

Source: `mocks/directions.html` (standalone, self-contained — the real app was
not touched). Stills: `.screenshots/mocks/`. Motion recording:
`.screenshots/mocks/motion-all-three.webm`.

Each direction mocks the same three screens — The Edge, a dense analytical
screen (Trade Targets / the verdict), and its own navigation in the open state
— at 390px, in dark and light, with real values from the live app.

All three drop Anton, keep the five position hues and the three status colors
with their current exclusive meanings, honor `prefers-reduced-motion`, and keep
the sheet gesture contract untouched.

---

## A — Instrument

**The opinion:** this is a precision instrument for reading a market, so every
quantity should carry its **magnitude**, not just its number.

The signature is a hairline **magnitude track** under every value, showing where
that player sits in his position's distribution — and colored *by position*, so
the bar does two jobs at once. This is not invented: it is the app's own
Playoff Odds bar, which is the single most scannable thing you have, promoted
from one screen to the system (finding B2).

Hairlines give way to **elevation** — layered surfaces, real shadow, 14px
radius. The ground takes a hue (`#0b0f14`, blue-black) so black stops reading as
"no decision made". Display moves to Archivo's upper weights; every number goes
to IBM Plex Mono. **Zero new font families.**

Navigation becomes a floating **5-tab bar** (Edge · Team · Trade · League ·
More), with the eight low-frequency destinations behind More.

| | |
|---|---|
| **Signature motion** | **The readout.** Values roll up from zero while magnitude tracks wipe in, staggered 52ms per row — the instrument powering on. Because the tracks are position-colored, the wipe teaches the position palette as it runs. |
| Other moments (3) | Press depress (scale .985 + shadow drop) · sheet backdrop-blur ramp · delta chip that rises and fades when a value changes. |
| Optimizes for | Scanning 26 rows and knowing instantly which three matter. |
| Costs | Each track needs a per-position max — cheap (a reduce over a list you already hold) but it is new derived state on every row. |
| Breaks | `rounded-none` leaves the system; every `Card` gains radius + shadow. The silver/red ration is gone. |
| Build | **Lowest.** Token swap + `Card`/`Button` restyle + one new `<MagnitudeRow>` + the tab bar. The component library survives largely intact. |

## B — Dispatch

**The opinion:** you are one person with one team, and the app already knows
what you should do — so it should **write to you**, not lay out a dashboard and
make you infer.

The real departure from broadcast graphics. Prose leads; data appears inline,
set as display type. A variable serif (Fraunces) at editorial scale, warm ink
ground, old-gold rules. Cards largely disappear — the page becomes a column of
text with hairline rules, plus an indexed table where ranking genuinely matters.

Navigation is the most radical part: **there isn't any.** One "Go anywhere" bar
opens a jump palette that reaches all 21 destinations by name, grouped *Your
week* / *Everything*. The brief is the app.

| | |
|---|---|
| **Signature motion** | **The brief sets.** Rules draw left→right, lines rise in sequence, and the lead figure lands *last* at 520ms — the page composing itself like type being set. |
| Other moments (3) | Palette spring-rise · link underline draws on press · section expand. |
| Optimizes for | The weekly "what changed and what do I do" read. Fastest of the three to an actual decision. |
| Costs | **Density.** A 26-man roster does not want to be prose, and the mock shows the cost — three items fill a screen. B needs a second tabular register for those views. One new font family. |
| Breaks | Most of the component library. `Card`, `Chip`, `Badge`, `SectionHeader` all lose their jobs. |
| Build | **Highest**, and the riskiest: every dense screen needs a second design pass B doesn't naturally supply. |

## C — Control

**The opinion:** sections are **places.** You should know where you are from how
it looks, not from reading a header label.

Each section owns a hue in an atmospheric field behind translucent glass.
Generous 20–26px radii, blur, depth. This is the iOS 26 idiom — floating glass
bar, minimize-on-scroll — rendered in the app's own palette rather than
borrowed. The spatial switcher shows all six places at once with live context
on each ("20 targets · deadline in 12 wks"), which answers "what is in this
app" better than any list of labels.

| | |
|---|---|
| **Signature motion** | **Arrival.** The field blooms from a desaturated 1.14× scale while glass cards lift and de-blur in sequence — you land somewhere rather than load a page. Paired with shared-element expansion from a row into the profile sheet. |
| Other moments (4) | Nav minimizes on scroll · card press scale · tab switch cross-fades the field hue · pull-to-refresh. |
| Optimizes for | Orientation and delight. |
| Costs | **Real, unmeasured risk.** Stacked `backdrop-filter` layers are the most expensive thing on this list for an iPhone PWA. I have not measured it on device and it must not be assumed free. Light-mode glass over a pale field is also the hardest contrast problem of the three. |
| Breaks | The flat-background rule, the no-gradient rule and the square-card rule simultaneously. |
| Build | Medium — but gated on a device performance test before anyone commits. |

---

# Recommendation

**Ship A — Instrument — and fold in one idea from each of the others.**

Why A:

1. **It fixes the measured problem structurally, not cosmetically.** B2 is the
   finding that costs you most, and the magnitude track is a direct answer to
   it. Bo Nix at 4,867 and Xavier Legette at 365 stop looking identical because
   the encoding changes, not because the palette did.
2. **It promotes a pattern you already proved.** Playoff Odds is the best screen
   in the app for exactly this reason. A generalizes your own best work instead
   of importing someone else's.
3. **Lowest cost and lowest risk.** No new fonts, no performance gamble, no
   density loss, and the component library survives — you restyle primitives
   rather than replace them.
4. **The navigation change carries the strongest outside evidence.** NN/g
   measured hidden navigation at a **20%+ drop in content discoverability**, used
   in **57% of cases vs 86%** for visible navigation, and **15% slower** task
   times on mobile. Apple's HIG and the iOS 26 tab bar both assume 2–5 visible
   tabs. Your four weekly sections fit that exactly — and a bottom bar puts them
   in the thumb zone instead of the top-left corner.

What to take from the others:

- **From B: the voice, on The Edge only.** Your briefing engine already writes
  good sentences ("Down 508 (−12%) in 30 days and fills your WR gap") and then
  sets them at 12px grey. Set the lead item at editorial scale. This is a type
  change, not an architecture change.
- **From C: per-section identity, and the spatial switcher as the "More"
  screen.** A's More tab should look like C's nav screen — six places with live
  context — not a list of labels. It is the best answer in the three mocks to
  "what is even in this app".

Not chosen, honestly: **B is the best-looking of the three** and I'd want it if
this were a reading app. It isn't — a 26-row roster and a 20-target board are
the app's real work, and B is worst at those. **C is the most delightful**, and
the one I'd revisit if a device test shows the glass is cheap.

## Sequence (if you take this)

1. **Accessibility + truncation fixes first** — X1 (tertiary contrast, 525
   uses), X2 (focus rings), X3 (44px targets), B3 (the elided trade price).
   These are bugs, they are independent of direction, and they ship in a day.
2. **IA: bottom tab bar + kill the duplicate sub-tabs** (A2), re-home Draft and
   News (A5), fix section colors stealing status tokens (A6), add Rookie
   Research to search (A1).
3. **Tokens + primitives** — ground hue, elevation, radius, type scale.
4. **The magnitude track** — one component, then roll it through roster, targets,
   free agents, movers.
5. **Motion last**, to the 3–5 budget, widening the `prefers-reduced-motion`
   guard from one class to a global rule as the first step.

---

# Round two (2026-09-11, after owner feedback)

**Owner's read on round one:** A and C are AI slop; B is the direction; the
number animation is worth keeping; nav-wise A and B both work, C doesn't; B's
open question is whether it's practical to use.

That read was correct and is now measured, not conceded — see
`slop-checklist.md`. Scored against the researched marker list, **round-one A
failed 10 of 12 and C failed 11 of 12**; B failed 2, which is exactly why it
was the one that didn't read as generated. The shipped app fails 8 of 12, and
the single most-cited tell in the research — a thin coloured accent rail down a
container's left edge — is a **documented primitive** in the design system
(`Card`'s `accent` prop).

Round two: **https://claude.ai/code/artifact/9ac20b94-855a-4c22-96f1-763fa64491c7**
(round one stays at `b9e5532d-…` as the record.)
Source `mocks/directions-2.html`; stills `.screenshots/mocks2/`; motion
`.screenshots/mocks2/motion-round-two.webm`.

All three are built to the same house rules: **radius 0, no shadows, no icon
set anywhere, text navigation, two faces each (none on the default list),
asymmetric grids, jittered stagger, clip-and-wipe entrances, a secondary hue
60°+ from the primary, styled `::selection`, semantic tags.** All keep the
number roll. All score **0 of 12**.

## 1 · Almanac — *round-one B, made practical*

A reference work about your franchise, in print conventions: running heads, a
marginalia rail with section marks, rules instead of boxes, and **real tables**.
Instrument Serif + Newsreader, ink and paper, oxblood spot with a slate teal
168° away.

The density answer is the point. 26 rows is a *table*, not a stack of cards —
and a table is denser **and** more scannable than what ships today, because
tabular figures align and hairline rules carry the eye. On the Analysis screen
it fits the verdict, a printed fair-value scale and **seven full targets with
their complete, untruncated cost strings** — the field that currently elides
(finding B3).

## 2 · Blueprint — *a drawing of your franchise*

A draughtsman's sheet: title block, sheet numbers, a real grid, leader-line
callouts. Magnitude returns from round-one A, but as **measurement** — a
hairline dimension line with end caps and a terminator tick, annotated
"GAP 432" — not a rounded progress meter. Archivo across its width axis
(62–125) plus mono annotation: **zero new font families.**

## 3 · Matchday — *a publication about a competition*

Poster type, flat colour, hard edges. The idea worth the risk: **your five
position hues become full-bleed bands** instead of 9px tags — a position group
header is a solid field with the type reversed out. That is a colour world no
template produces, built from tokens you already own, with no gradients
anywhere. The team-value hero is deliberately **ink, not a position hue**;
editorial highlights take a semantic colour or plain ink, never a position
colour (a green "down 12%" would break the status rule).

---

## Recommendation, round two

**Almanac.** It is the direction you already picked, with its one real
objection answered in the mock rather than argued away. It is the densest of
the three, the best at both "what do I do today" and "show me all 26", and the
only one whose dense screen is genuinely *more* legible than what ships now.

Take **Blueprint's dimension line** into it as the magnitude encoding — an
almanac already wants measured rules, and it's the one idea worth rescuing from
round one. Keep **Matchday's position bands** in reserve; if Almanac reads too
quiet after a week on the phone, the bands are the dial to turn up.

Honest costs: two new font families, and serif body text on a sports app is a
taste bet that will feel unusual for about a week. Blueprint is the low-risk
pick if that bet feels wrong — zero new fonts, and its callout/spec-row
vocabulary maps closely onto the components you already have.

---

## Matchday, revision 1 (owner picked it, 2026-09-11)

Seven changes, in order of how much they cost:

1. **The verdict poster led with the wrong thing.** It set `432` — the gap — at
   64px with `COUNTER` as a tiny eyebrow. `432` is meaningless without its
   label; the decision is what you need. **This is the same hierarchy inversion
   I flagged on the shipped app's hero and then repeated.** Now `Counter` is the
   poster and "432 short of fair — ask them to add a 2027 2nd" is the subtitle.
2. **Matchday did not solve finding B2.** Every value rendered at 19px, so Bo
   Nix (4,867) and Xavier Legette (365) looked identical — the exact problem the
   whole review is about. Fixed in the direction's own language: **type size is
   the magnitude.** Each figure is sized from its value on an absolute scale
   (`14 + 16·(v/9365)^0.7`, ~16–30px), so similar values look similar and the
   tail visibly shrinks. The **band carries the group total** ("5 · 16,219"), so
   you read shape within a position and weight across them.
3. **The targets board had dropped the cost.** Name, team, owner, value, gap —
   but not what the trade actually costs you, which is the most actionable
   field on the board and the one the live app truncates (finding B3). Restored
   in full, untruncated.
4. **The band rule only worked because this owner's deficit is WR.** A real
   targets board is mixed. The board now groups by position with a band each,
   and a `.mix` neutral-ink band exists for boards that can't be grouped.
5. **The index used position hues as section colours** — a blue square meant
   "Squad" there and "WR" everywhere else. That is finding A6 committed in a new
   place. Position colour is load-bearing here, so the index now carries **no
   swatches at all**; the poster type is the identity, which is truer to the
   idiom anyway.
6. **The hero had an orphaned stats row** — explicitly on the slop list I wrote
   ("fold metrics into narrative"). Now one caption sentence: "4th of ten ·
   window Middle · 74% to the playoffs · $1000 left to spend".
7. **Bricolage was set at `wdth 104` with default optical size**, which landed
   it on a neutral grotesk and defeated the point of choosing it. Pushed to
   `wdth 125` with `opsz` set per role.

Also: the mock said "five quarterbacks" and showed three. The roster now carries
all five, which is what gives the size ramp a tail to ramp across.

### Known costs, stated plainly

- **It is the least dense of the three** — about 3–4 targets a screen against
  Almanac's 7, now that the cost line is back. That is the real price of poster
  type and it is the thing to weigh.
- **Bricolage still reads fairly neutral** even pushed onto its axes. If it
  doesn't earn its keep on device, the swap candidate is Big Shoulders Display.
- **Open question, owner's call:** the home hero still leads with team value at
  62px — the same inversion fixed on the verdict poster in change 1, and the
  thing named first in `unasked.md`. Leading with "You're a buyer. Five things
  need you today." and demoting 87,397 to the caption would be consistent. Left
  alone deliberately: the big figure is what makes the hero read as a cover.
