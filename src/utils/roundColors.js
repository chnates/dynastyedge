// Pick round colours — the single source of truth, used by PickBadge (roster)
// and TeamCard (league). Never redefine locally.
//
// MATCHDAY RE-CUT (step 4). Primetime Blackout gave the four rounds four
// UNRELATED HUES — silver-on-charcoal, blue, violet, grey — eight hardcoded
// hexes tuned to a palette the app no longer has (the 1st went silver when
// Contending did). Two things were wrong with it beyond the stale values:
//
//   1. A ROUND IS ORDINAL, NOT CATEGORICAL. A 1st is worth more than a 2nd is
//      worth more than a 3rd. Four unrelated hues encode four KINDS of thing,
//      so the one fact the badge exists to carry — the ordering — had to be
//      read off the label instead of the colour.
//   2. Hardcoded hexes cannot invert with the theme, and Matchday's grounds
//      moved under all of them.
//
// The replacement is an INK-DENSITY RAMP: a 1st is a solid ink field, a 2nd a
// strong rule, a 3rd and 4th progressively quieter hairlines. It is built
// entirely from existing tokens, so it inverts with the theme by construction
// (a cream chip on black, an ink chip on paper) and inherits the contrast the
// accessibility floor already measures for those tokens — nothing here needs
// its own audit row. It also spends no hue at all, which keeps the five
// position colours the only colour world on a roster screen (law 4).

export const ROUND_CLASSES = {
  1: 'bg-text-primary text-bg-primary border border-text-primary',
  2: 'bg-transparent text-text-primary border-2 border-text-primary',
  3: 'bg-transparent text-text-secondary border border-border-strong',
  4: 'bg-transparent text-text-tertiary border border-border-default',
}

// The same ramp where there is no chip to draw — a bare slot label in a table.
// Weight carries the top of the ramp, since 1st and 2nd would otherwise be the
// same ink.
export const ROUND_TEXT = {
  1: 'text-text-primary font-bold',
  2: 'text-text-primary',
  3: 'text-text-secondary',
  4: 'text-text-tertiary',
}

export const ROUND_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
