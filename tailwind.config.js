/** @type {import('tailwindcss').Config} */

/* MATCHDAY TYPE SCALE — a custom ladder on a 1.25 ratio, anchored at 14px.
 *
 * Tailwind's DEFAULT type scale is itself a marker (slop-checklist.md →
 * Typography), and the shipped app used it unmodified: 12 / 14 / 16 / 18 / 20 /
 * 24 / 30 / 36 / 48, which is not a ratio at all — the steps run 1.17, 1.14,
 * 1.13, 1.11, 1.20, 1.25, 1.20, 1.33. A scale with no constant ratio cannot
 * establish a hierarchy, which is the mechanical half of finding B5 ("the scale
 * is not doing enough work").
 *
 * The anchor is `sm` = 14px — the single most-used size in the app — so it is
 * UNCHANGED and the blast radius of the repaint falls on the display end, where
 * Matchday actually wants bigger type. `2xl` (page titles) moves 24 → 34.18px,
 * which is the mock's own `.md-lead h1` size.
 *
 * Each step also carries its own line-height and letter-spacing, because
 * "default line-height and letter-spacing" is a separate marker: the ladder
 * tightens from 1.5 at body to 0.92 at poster scale, and tracking runs from
 * +0.01em at caption to -0.05em at the marquee figure. A `tracking-*` utility
 * at the call site still wins (Tailwind emits letterSpacing after fontSize), so
 * the small uppercase labels keep their positive tracking.
 */
const SCALE = {
  '2xs':  ['0.56rem',    { lineHeight: '1.45', letterSpacing: '0.01em' }],   //  8.96px
  xs:     ['0.7rem',     { lineHeight: '1.45', letterSpacing: '0.004em' }],  // 11.20px
  sm:     ['0.875rem',   { lineHeight: '1.55', letterSpacing: '0em' }],      // 14.00px — the anchor
  base:   ['1.09375rem', { lineHeight: '1.5',  letterSpacing: '-0.008em' }], // 17.50px
  lg:     ['1.3672rem',  { lineHeight: '1.28', letterSpacing: '-0.018em' }], // 21.88px
  xl:     ['1.709rem',   { lineHeight: '1.16', letterSpacing: '-0.026em' }], // 27.34px
  '2xl':  ['2.1362rem',  { lineHeight: '1.06', letterSpacing: '-0.032em' }], // 34.18px
  '3xl':  ['2.6703rem',  { lineHeight: '1.0',  letterSpacing: '-0.038em' }], // 42.72px
  '4xl':  ['3.3379rem',  { lineHeight: '0.96', letterSpacing: '-0.044em' }], // 53.40px
  '5xl':  ['4.1723rem',  { lineHeight: '0.9',  letterSpacing: '-0.05em' }],  // 66.76px
}

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    // Replaced, not extended — an extended scale would leave Tailwind's own
    // steps in place under the same names.
    fontSize: SCALE,
    extend: {
      fontFamily: {
        // Bricolage Grotesque replaced Anton (Matchday, DESIGN-1). Anton ships
        // ONE weight, so every display size carried the same stroke and the
        // scale had to do its work through size alone (findings.md B5) — and
        // the house rules ask for 300–800. Bricolage is variable across weight,
        // width and optical size — but its `wdth` axis tops out at 100, which
        // is also its default, so the spec's "push it to 125" is not
        // executable. `.font-display` in index.css carries that measurement
        // and drives `opsz` and `wght` instead.
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        body: ['Archivo', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      // ── MOTION: one curve, and durations scaled to element size ──
      //
      // Setting DEFAULT (rather than adding named curves) is the point: it
      // reaches all 69 `transition-*` utilities in the app at once, without a
      // call-site change and without any screen being able to miss it. Before
      // this the app carried three explicit timing values in total, so almost
      // every transition ran Tailwind's own `cubic-bezier(.4,0,.2,1)` — the
      // mechanical half of "there is no easing curve in this app that anyone
      // chose" (findings.md → Motion).
      transitionTimingFunction: {
        DEFAULT: 'var(--ez)',
      },
      // Duration is a function of how far the thing travels, which in practice
      // means how big it is. A 2px chip tint and a 300px drawer crossing the
      // screen should not share a number; they did.
      //
      // DEFAULT stays 150ms — the same value Tailwind ships, restated as a
      // deliberate choice so the diff is honest about what actually changed
      // here (the curve, not the speed of a colour tint).
      transitionDuration: {
        DEFAULT: '150ms',
        tap:   '90ms',   // press feedback: must read as instantaneous
        mark:  '150ms',  // small ink — a chip, a badge, a row tint, a link
        panel: '240ms',  // a block or an overlay resolving
        sheet: '340ms',  // a full-width surface crossing the screen
      },
      colors: {
        'bg-primary':    'rgb(var(--bg-primary) / <alpha-value>)',
        'bg-secondary':  'rgb(var(--bg-secondary) / <alpha-value>)',
        'bg-card':       'rgb(var(--bg-card) / <alpha-value>)',
        'border-default':'rgb(var(--border-default) / <alpha-value>)',
        // The masthead / table-head rule. Matchday separates with rules rather
        // than boxes, so it needs a second, stronger weight of line.
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        'text-primary':  'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary':'rgb(var(--text-secondary) / <alpha-value>)',
        'text-tertiary': 'rgb(var(--text-tertiary) / <alpha-value>)',
        accent:          'rgb(var(--accent) / <alpha-value>)',
        // The secondary hue, 176° from the primary spot — the round-2 house
        // rule that "a single accent doing every job" breaks. Its shipped job
        // is the non-semantic editorial Mark.
        alt:             'rgb(var(--alt) / <alpha-value>)',
        // Brand crimson is the rationed primary spot ("you" treatments, the
        // brand field) — never a substitute for danger/trend red.
        brand:           'rgb(var(--brand) / <alpha-value>)',
        'brand-deep':    'rgb(var(--brand-deep) / <alpha-value>)',
        'brand-bright':  'rgb(var(--brand-bright) / <alpha-value>)',
        'tier-contend':  'rgb(var(--tier-contend) / <alpha-value>)',
        'tier-middle':   'rgb(var(--tier-middle) / <alpha-value>)',
        'tier-rebuild':  'rgb(var(--tier-rebuild) / <alpha-value>)',
        success:         'rgb(var(--success) / <alpha-value>)',
        warning:         'rgb(var(--warning) / <alpha-value>)',
        danger:          'rgb(var(--danger) / <alpha-value>)',
        'pos-qb':        'rgb(var(--pos-qb) / <alpha-value>)',
        'pos-rb':        'rgb(var(--pos-rb) / <alpha-value>)',
        'pos-wr':        'rgb(var(--pos-wr) / <alpha-value>)',
        'pos-te':        'rgb(var(--pos-te) / <alpha-value>)',
        'pos-def':       'rgb(var(--pos-def) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
