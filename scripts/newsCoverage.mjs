// The news feed's DEPTH metric, pure and pinned by tests/newsCoverage.test.mjs.
//
// WHY THIS EXISTS. `coverage.spanHours` is max − min over every item's
// publish time, so a HANDFUL of stragglers sets it. That was invisible while
// the player cap was binding, because newest-first eviction threw the oldest
// items away first. The moment the cap was raised (NEWS-4, 2026-09-22) it
// stopped being invisible: one run moved spanHours 54h → 147h on the strength
// of three week-old items from The Athletic's current pull (it returns 100
// items reaching back days), while the p90 age of the player window barely
// moved (51h → 52h). The drawer rendered spanHours as "Nd deep", so it would
// have read "6d deep" on a feed that was two days deep — the 2026-09
// collapse's failure (a health number that looks fine while depth is wrong)
// arriving from the other direction.
//
// `depthHours` answers the question spanHours was being read as answering:
// how far back does the PLAYER window genuinely reach? The q-quantile of
// player-item age, measured from the newest player item, so under
// (1 − q) of the window's items can move it. Player items only — they are
// what the cap and the 7-day window govern; general items age out at 48h
// regardless.

export const DEPTH_QUANTILE = 0.9

export function windowDepthHours(items, q = DEPTH_QUANTILE) {
  const times = (items ?? [])
    .filter(i => i?.isPlayerNews)
    .map(i => Date.parse(i.published ?? ''))
    .filter(t => !Number.isNaN(t))
  if (!times.length) return 0
  const newest = Math.max(...times)
  const ages = times.map(t => (newest - t) / 36e5).sort((a, b) => a - b)
  const idx = Math.min(ages.length - 1, Math.max(0, Math.ceil(q * ages.length) - 1))
  return Math.round(ages[idx])
}
