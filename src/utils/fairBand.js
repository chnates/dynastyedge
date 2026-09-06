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
