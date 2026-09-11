#!/usr/bin/env node
// Analysis-only: THE accessibility-floor instrument.
//
// CLAUDE.md's accessibility floor states that any change to a ground colour
// must re-check --text-tertiary and --text-secondary in BOTH themes against
// that theme's WORST-CASE ground — which is a different surface in each (in
// dark the LIGHTEST ground gives the least contrast, in light the DARKEST
// does). That rule was set in DESIGN-2 and then immediately put at risk by
// DESIGN-1, which moved every ground in the app.
//
// This script reads the tokens straight out of src/index.css and measures them,
// so the numbers quoted in CLAUDE.md and in a PR cannot drift from the shipped
// values the way a hand-typed table would. It also checks the two reversal
// cases the Matchday repaint introduced, which a text-on-ground audit misses
// entirely:
//   - paper/ink type REVERSED OUT of each position band (the full-bleed
//     section band is now small display type on a saturated hue);
//   - type on an ink field and on the brand field (hero poster, tab bar, Mark,
//     CTA).
//
// Run:  node scripts/dev/contrast-audit.mjs
// Exit: 0 when every row clears its bar, 1 when any row fails.
//
// WCAG 2.1 contrast formula; AA body text needs 4.5:1, AA large (>=18.66px
// bold or >=24px) needs 3:1. Band labels are small bold display type, NOT
// large text, so 4.5 is the bar for them too.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')

// ── token parsing ────────────────────────────────────────────────────────
// Tokens are "R G B" channel triples so Tailwind's opacity modifier works.
function block(selector) {
  const i = css.indexOf(selector + ' {')
  if (i < 0) throw new Error(`no ${selector} block in index.css`)
  return css.slice(i, css.indexOf('\n}', i))
}
function tokens(selector) {
  const out = {}
  for (const m of block(selector).matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}
const LIGHT = tokens(':root')
const DARK = tokens('.dark')

// ── WCAG ─────────────────────────────────────────────────────────────────
const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (a, b) => {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
  return (hi + 0.05) / (lo + 0.05)
}
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()

// WHITE is literal in .brand-field — crimson is the one field that keeps white
// type in both themes, so it is not a token.
const WHITE = [255, 255, 255]

const GROUNDS = ['bg-primary', 'bg-secondary', 'bg-card']
// The worst-case ground is whichever of the three is CLOSEST in luminance to
// the text — derived, not hardcoded, so a future ground swap can't strand it.
function worstGround(t, fg) {
  return GROUNDS
    .map(g => ({ g, r: ratio(t[fg], t[g]) }))
    .sort((a, b) => a.r - b.r)[0]
}

const rows = []
const add = (theme, what, fg, bg, need, note) => {
  const r = ratio(fg, bg)
  rows.push({ theme, what, fg: hex(fg), bg: hex(bg), r, need, pass: r >= need, note })
}

for (const [theme, t] of [['dark', DARK], ['light', LIGHT]]) {
  // 1. Text ramp against the worst-case ground.
  for (const fg of ['text-primary', 'text-secondary', 'text-tertiary', 'accent', 'alt',
                    'brand-bright', 'success', 'warning', 'danger',
                    'tier-contend', 'tier-middle', 'tier-rebuild']) {
    const { g, r } = worstGround(t, fg)
    add(theme, `--${fg}`, t[fg], t[g], 4.5, `worst ground --${g} (${r.toFixed(2)}:1)`)
  }
  // 2. Band labels: the page ground reversed OUT of each position hue.
  for (const pos of ['qb', 'rb', 'wr', 'te', 'def']) {
    add(theme, `band label on --pos-${pos}`, t['bg-primary'], t[`pos-${pos}`], 4.5, 'small bold display type')
  }
  // 3. Fields.
  add(theme, 'type on .ink-field', t['bg-primary'], t['text-primary'], 4.5, 'hero poster, tab bar, Mark, CTA')
  add(theme, 'white on .brand-field', WHITE, t.brand, 4.5, '"you" treatments')
  // 4. A rule has to be visible, which is a 3:1 non-text bar (WCAG 1.4.11) —
  //    measured on its own worst-case ground, same as the text ramp, because a
  //    table-head rule sits on a card as often as on the page.
  {
    const { g, r } = worstGround(t, 'border-strong')
    add(theme, '--border-strong', t['border-strong'], t[g], 3, `worst ground --${g} (${r.toFixed(2)}:1), non-text`)
  }
}

const w = Math.max(...rows.map(r => r.what.length))
let failed = 0
for (const theme of ['dark', 'light']) {
  console.log(`\n${theme.toUpperCase()}`)
  for (const r of rows.filter(x => x.theme === theme)) {
    if (!r.pass) failed++
    console.log(
      `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.what.padEnd(w)}  ${r.fg} on ${r.bg}  ` +
      `${r.r.toFixed(2).padStart(6)}:1  (needs ${r.need})  ${r.note}`,
    )
  }
}
console.log(`\n${rows.length - failed}/${rows.length} pass.`)
process.exit(failed ? 1 : 0)
