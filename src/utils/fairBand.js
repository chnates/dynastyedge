// THE definition of "fair" for a trade, in one place.
//
// Extracted from tradeAnalysis.js so the surfaces that PREDICT what the
// Analyzer will say compute it with the same code the Analyzer uses. The
// cash-out board (recommendations.js) tells you what a swap would still need
// to land fair; THE CALL then renders that number on the next screen. When the
// two were computed separately they disagreed on live data — the board said a
// target needed ~84 more while the Analyzer it handed off to said 408 — because
// the board had borrowed suggestFairPackage's package-building window
// ([0.9x, 1.15x]) instead of this one.
//
// Note the asymmetry that makes them different questions: the package builder's
// window is about what to ASSEMBLE (undershooting gets rejected, overshooting
// guts the roster), while this band is the VERDICT's tolerance around the value
// being received. Do not conflate them again.
//
// They are still different questions, and since 2026-09-21 the builder asks
// this one before it answers its own: a SUGGESTION has to land inside this
// band, because the Targets card hands its package straight to the Analyzer
// and so is a surface that predicts the verdict. The wider assembly window now
// only feeds `alternative` — the pricier package the partner would prefer.
// Before that split, 20 of 20 suggestions on the owner's live board and 145 of
// 180 across all ten seats landed outside this band, so the app proposed an
// offer and then graded its own proposal an overpay.
// See docs/analysis/trade-fair-band-2026-09.md.

// A trade is fair when the give total lands within this fraction of the get.
export const FAIR_BAND_PCT = 0.05

export function buildFairBand(giveTotal, getTotal) {
  if (!getTotal && !giveTotal) return null
  const low  = Math.round(getTotal * (1 - FAIR_BAND_PCT))
  const high = Math.round(getTotal * (1 + FAIR_BAND_PCT))
  return {
    low, high, target: getTotal, current: giveTotal,
    inside: giveTotal >= low && giveTotal <= high,
    // Signed distance to the near edge — what closing it actually costs.
    gapToBand: giveTotal < low ? low - giveTotal : giveTotal > high ? giveTotal - high : 0,
    // Rendering bounds, padded so the band never sits flush against an end.
    axisLow:  Math.round(Math.min(low, giveTotal) * 0.9),
    axisHigh: Math.round(Math.max(high, giveTotal) * 1.1),
  }
}

// ── The OTHER "even": a completed trade, judged in hindsight ─────────────────
//
// The manager-scouting ledger (W-L-E per manager) and League › Activity's
// "bigger haul" highlight ask a different question from the Analyzer: not "is
// what I give within 5% of what I get?" (one seat, the band above) but "did
// either side come out clearly ahead?" — and the answer must be the SAME from
// both seats, or one manager's loss could be the other's "even".
//
// So the gap is measured against the LARGER side, which is symmetric by
// construction. The owner chose to keep the two rules separate on 2026-10-07
// (docs/analysis/code-review-2026-10.md, decision on #5): the fair band
// applied to both seats can grade one side a loss and the other even, which
// would break the ledger. This is the one home for the hindsight rule;
// tests/fairBand.test.mjs fails if a copy reappears.
export const HINDSIGHT_EDGE_PCT = 0.05

// 'win' | 'loss' | 'even' for the side that got `gotValue` and gave `gaveValue`.
export function hindsightResult(gotValue, gaveValue) {
  const size = Math.max(gotValue, gaveValue)
  if (!(size > 0)) return 'even'
  const net = gotValue - gaveValue
  return Math.abs(net) / size > HINDSIGHT_EDGE_PCT ? (net > 0 ? 'win' : 'loss') : 'even'
}

// Is the spread between the sides' totals big enough to call one the bigger
// haul? Same rule, any number of sides. Zero-value sides are ignored.
export function hindsightGapIsMeaningful(totals) {
  const t = (totals ?? []).filter(v => v > 0)
  if (t.length < 2) return false
  const max = Math.max(...t)
  return (max - Math.min(...t)) / max > HINDSIGHT_EDGE_PCT
}
