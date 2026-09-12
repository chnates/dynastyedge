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
