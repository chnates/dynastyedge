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
