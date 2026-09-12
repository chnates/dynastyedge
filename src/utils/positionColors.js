// Position identity colors (see CLAUDE.md → Design System → Position colors).
// Class strings must stay literal so the Tailwind content scan picks them up.
// Every component that colors anything by position imports from here —
// never hand-roll position colors locally.

export const POS_TEXT = {
  QB: 'text-pos-qb',
  RB: 'text-pos-rb',
  WR: 'text-pos-wr',
  TE: 'text-pos-te',
  DEF: 'text-pos-def',
}

export const POS_BG = {
  QB: 'bg-pos-qb',
  RB: 'bg-pos-rb',
  WR: 'bg-pos-wr',
  TE: 'bg-pos-te',
  DEF: 'bg-pos-def',
}

// Active state for position filter chips: tinted fill + colored text/border.
// Non-position chips (ALL / Picks / toggles) keep the solid accent style.
export const POS_CHIP_ACTIVE = {
  QB: 'bg-pos-qb/15 text-pos-qb border border-pos-qb/40',
  RB: 'bg-pos-rb/15 text-pos-rb border border-pos-rb/40',
  WR: 'bg-pos-wr/15 text-pos-wr border border-pos-wr/40',
  TE: 'bg-pos-te/15 text-pos-te border border-pos-te/40',
  DEF: 'bg-pos-def/15 text-pos-def border border-pos-def/40',
}

// Small position tag shown on player rows (tinted pill).
export const POS_TAG = {
  QB: 'text-pos-qb bg-pos-qb/15',
  RB: 'text-pos-rb bg-pos-rb/15',
  WR: 'text-pos-wr bg-pos-wr/15',
  TE: 'text-pos-te bg-pos-te/15',
  DEF: 'text-pos-def bg-pos-def/15',
}

// THE section band (Matchday): the position hue painted at full bleed with the
// PAGE GROUND reversed out of it. This is the direction's one idea worth the
// risk — the five hues promoted from 9px tags to solid fields — and the reason
// light --pos-rb / --pos-te were deepened in index.css: paper type on the
// shipped values read 3.87:1 and 3.83:1. Used by <PositionBand>; never
// hand-rolled.
export const POS_FIELD = {
  QB: 'bg-pos-qb text-bg-primary',
  RB: 'bg-pos-rb text-bg-primary',
  WR: 'bg-pos-wr text-bg-primary',
  TE: 'bg-pos-te text-bg-primary',
  DEF: 'bg-pos-def text-bg-primary',
}

// Fill for positional strength bars. Flat, not a gradient — Matchday is flat
// colour and hard edges, and the only two gradients the app ever had left with
// Primetime Blackout's score-bugs.
// CSS color values for SVG fill/stroke (resolve via the theme variables).
export const POS_SVG = {
  QB: 'rgb(var(--pos-qb))',
  RB: 'rgb(var(--pos-rb))',
  WR: 'rgb(var(--pos-wr))',
  TE: 'rgb(var(--pos-te))',
  DEF: 'rgb(var(--pos-def))',
}
