// THE market-trend rules — one home, read by every surface that shows or acts
// on a 30-day value move: the ↑/↓ arrows, Market Movers, The Edge, the pickup
// recommender and the MCP server's sell-high / roster / free-agent answers.
//
// Until 2026-10-07 the ±50 threshold was written out in ten places and the
// buy-low / sell-high eligibility rule in three, so changing one copy could
// leave an arrow saying "falling" beside a buy-low list that disagreed with
// it. Pure, no imports, so the test suite loads it without node_modules.

// A 30-day move larger than this (FantasyCalc points, 0–10000 scale) is a
// "move"; anything inside ±TREND_THRESHOLD is flat. CLAUDE.md rule 11.
export const TREND_THRESHOLD = 50

// Buy-low and sell-high only name players worth a phone call.
export const MIN_TARGET_VALUE = 1000

// 'up' | 'down' | 'flat'. A missing trend is flat.
export function trendDirection(trend) {
  if (trend > TREND_THRESHOLD) return 'up'
  if (trend < -TREND_THRESHOLD) return 'down'
  return 'flat'
}

export const isRising = trend => trendDirection(trend) === 'up'
export const isFalling = trend => trendDirection(trend) === 'down'
export const isMoving = trend => trendDirection(trend) !== 'flat'

// % change against the value 30 days ago — a +120 move means a lot more on an
// 800 player than on a 7,500 one. Null when there is no positive baseline.
export function trendPct(trend, value) {
  const baseline = (value ?? 0) - trend
  return baseline > 0 ? Math.round((trend / baseline) * 100) : null
}

// Buy low: falling, worth targeting, at one of my deficit positions, and not
// already mine. `ownerRosterId` is the holder's roster id (null for a free agent).
export function isBuyLowCandidate(p, { deficits, ownerRosterId, myRosterId }) {
  return isFalling(p.trend30Day) &&
    (p.value ?? 0) >= MIN_TARGET_VALUE &&
    deficits.includes(p.position) &&
    ownerRosterId !== myRosterId
}

// Sell high: one of mine, rising, worth a call, at a position I'm already
// above league average at.
export function isSellHighCandidate(p, { surpluses }) {
  return isRising(p.trend30Day) &&
    (p.value ?? 0) >= MIN_TARGET_VALUE &&
    surpluses.includes(p.position)
}

// The plain-text arrow tag the MCP server prints after a value: " ↑83",
// " ↓-120", or '' when flat. TrendArrow.jsx is the in-app equivalent.
export function trendTag(trend) {
  const dir = trendDirection(trend)
  if (dir === 'up') return ` ↑${trend}`
  if (dir === 'down') return ` ↓${trend}`
  return ''
}
