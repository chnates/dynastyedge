// THE motion helpers — the JavaScript half of the reduced-motion guard.
//
// `index.css`'s global `@media (prefers-reduced-motion: reduce)` block covers
// every CSS animation and transition in the app. It CANNOT cover a programmatic
// scroll: `scrollIntoView({ behavior: 'smooth' })` takes its behaviour from the
// argument, and the CSS `scroll-behavior` property does not override it. A
// long smooth scroll is one of the more reliable vestibular triggers, so the
// two places that jump the page read the setting here instead.

// True when the viewer has asked for reduced motion. Read at call time rather
// than cached: the setting can change mid-session (iOS Control Centre, macOS
// System Settings), and a stale answer would be wrong in the direction that
// matters. Guarded for a non-browser environment so the module stays importable
// under plain Node.
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Scroll an element to the top of the viewport — smoothly, unless the viewer
// asked otherwise, in which case it jumps. The destination is identical either
// way; only the journey is skipped.
export function scrollToTopOf(el) {
  if (!el) return
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
}

// ── The jittered stagger ────────────────────────────────────────────────────
//
// A linear 0 / 100 / 200ms stagger is itself one of the twelve researched
// slop markers, and The Edge shipped the textbook version of it:
// `Math.min(riseIndex++ * 60, 360)`. Evenly-spaced delays read as a machine
// counting; a press run reads as sheets coming off a press at a rate that
// isn't quite regular.
//
// Two properties this needs that `Math.random()` does not have:
//
//  - **A pure function of the index.** React re-renders; a random delay would
//    hand the same block a different number on every pass, and an
//    animation-delay that changes mid-flight is a bug waiting for a slow
//    device to find it.
//  - **A stable answer regardless of call ORDER.** The mock advanced one shared
//    LCG per call, which is fine for a template rendered top to bottom and
//    wrong here — conditional sections mean block 5 is not always the fifth
//    call. Hashing the index instead means a block's delay depends only on
//    where it sits.
//
// The shape is a CUMULATIVE SUM OF JITTERED GAPS, not the mock's
// `i * base * jitter`. Measured on the way in: the multiplicative form
// produces delays 15 / 52 / 123 / 176 / **145** / 270 / 361 / 420 / **398** —
// two inversions in nine blocks, where a later block lands before an earlier
// one. That does not read as an irregular press, it reads as broken. Summing
// gaps is monotonic by construction and gives more irregularity, not less,
// because every gap is drawn independently.
function hash(n) {
  let h = Math.imul(n + 1, 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

const frac = n => (hash(n) % 10000) / 10000

// `base` is the nominal gap between blocks and each real gap lands within
// 0.6x-1.45x of it; `cap` stops a long page from leaving its last block blank
// for a second. Both are in milliseconds. O(index) per call, which is nothing
// at the ~10 blocks a screen actually has.
export function stagger(index, { base = 46, cap = 420 } = {}) {
  let total = 0
  for (let k = 0; k < index; k++) total += base * (0.6 + frac(k) * 0.85)
  return Math.round(Math.min(total, cap))
}
