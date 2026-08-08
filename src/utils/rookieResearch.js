// Rookie research model — the pure logic behind Draft › Research.
//
// Answers "which rookies become something?" from the two signals that a
// dynasty VALUE number does not already price: where a rookie sits on his
// NFL depth chart, and what his team spent to get him.
//
// Everything here is calibrated in docs/analysis/rookie-research-signals-2026-08.md
// against n=396 drafted skill rookies, 2021-2025 (reproduce with
// `node scripts/dev/rookie-signal-backtest.mjs`). Three results are load-bearing:
//
//   1. Draft capital alone: Spearman rho +0.598 vs rookie-season half-PPR.
//      Depth rank alone: +0.541. Blended 0.3 depth / 0.7 capital: +0.664.
//      The blend curve is flat from w=0.2-0.5, so DEPTH_WEIGHT is not
//      knife-edge and does not need re-tuning each season.
//   2. A depth rank means completely different things by position (QB is
//      binary, RB degrades gently, WR falls off a cliff after rank 1). A
//      position-BLIND score returns a top-8 "undervalued" list of eight
//      backup tight ends — this was actually observed while calibrating.
//   3. Preseason production is a TRAP (rho -0.195): good rookies sit in
//      August, so preseason usage measures job insecurity. Nothing here is
//      derived from preseason stats, deliberately.

// Median rookie-season half-PPR points by position x week-1 depth rank,
// measured over 2021-2025. Rank 4 is the "4+ or off the chart" bucket. These
// are observed medians, not hand-tuned weights — re-derive them from the
// back-test rather than nudging them by feel.
export const DEPTH_VALUE = {
  QB: { 1: 212, 2: 55, 3: 19, 4: 0 },
  RB: { 1: 120, 2: 76, 3: 38, 4: 3 },
  WR: { 1: 154, 2: 43, 3: 17, 4: 4 },
  TE: { 1: 102, 2: 41, 3: 23, 4: 0 },
}

export const DEPTH_WEIGHT = 0.3
// Undrafted is not "pick 261" — it is a different kind of asset. The back-test
// scored UDFAs at a small floor rather than zero so a rank-1 UDFA still ranks
// above a buried day-3 pick, which is what actually happens.
export const UDFA_SCORE = 0.05
const LAST_PICK = 260

// Off the depth chart entirely folds into the 4+ bucket: for a rookie, "not
// listed" and "listed fourth" are the same fact about his opportunity.
export function depthBucket(rank) {
  if (rank == null || rank >= 4) return 4
  return rank < 1 ? 1 : rank
}

// The single largest cell in DEPTH_VALUE (a rank-1 QB, 212 points). Every
// depth score is scaled against THIS, not against its own position's row.
//
// Scaling per-position was tried first and is wrong: it divides each row by
// its own maximum, so a TE2 (41 median points) scored 0.40 while a WR2 (43
// median points — the same outcome) scored 0.28. The distortion put five
// backup tight ends in the top six of the "undervalued" list, which is the
// exact failure the calibration memo warned about, arriving by a subtler
// route. A depth rank has to be priced in points, and points are points
// regardless of position.
const DEPTH_MAX = Math.max(...Object.values(DEPTH_VALUE).flatMap(row => Object.values(row)))

// 0 (no path to snaps) -> 1 (a starting QB), on one shared points scale, so
// scores are comparable across positions.
export function depthScore(position, rank) {
  const row = DEPTH_VALUE[position]
  if (!row) return 0
  return row[depthBucket(rank)] / DEPTH_MAX
}

// 0 (undrafted) -> 1 (1.01). Log-scaled: the gap between picks 1 and 20 is
// worth far more than the gap between 200 and 220.
export function capitalScore(pick) {
  if (pick == null) return UDFA_SCORE
  if (pick <= 1) return 1
  return Math.max(0, 1 - Math.log(pick) / Math.log(LAST_PICK))
}

// The headline number: 0-1, higher = better chance of becoming something.
export function opportunityScore({ position, rank, pick }) {
  return DEPTH_WEIGHT * depthScore(position, rank) + (1 - DEPTH_WEIGHT) * capitalScore(pick)
}

// How a rookie's depth standing moved across the published window.
// DELIBERATELY NOT SCORED: camp movement is computable for the current class
// but could not be back-tested (nflverse's 2025 depth charts only begin
// 2025-08-03, so there is no pre-camp baseline in the historical window).
// Show it as context; do not let it move the score until a season of it exists.
export function campMove(ranks) {
  if (!Array.isArray(ranks)) return null
  const points = ranks.filter(r => r != null)
  if (points.length < 2) return null
  const from = points[0]
  const to = points[points.length - 1]
  if (from === to) return null
  // Climbing means the rank NUMBER falls, so invert for a readable delta.
  return { from, to, delta: from - to, direction: to < from ? 'up' : 'down' }
}

// Plain-English read of a depth standing, position-aware because the same
// ordinal means different things (a QB2 is a backup; an RB2 is a committee).
export function depthLabel(position, rank, ahead = []) {
  if (rank == null) return 'Not on the depth chart'
  const blocker = ahead.length ? ahead[ahead.length - 1] : null
  if (rank === 1) return 'Listed first at his spot'
  if (rank === 2) {
    if (position === 'QB') return blocker ? `Backup behind ${blocker}` : 'Listed second'
    if (position === 'RB') return blocker ? `Splitting behind ${blocker}` : 'Listed second'
    return blocker ? `One spot behind ${blocker}` : 'Listed second'
  }
  if (rank === 3) return 'Third at his spot'
  return 'Buried on the depth chart'
}

const tierOf = score => (score >= 0.62 ? 'strong' : score >= 0.38 ? 'fair' : 'weak')

// Reasons the score is what it is — shown on the card so the number is never
// a black box.
export function scoreReasons({ position, rank, pick, round }) {
  const out = []
  if (pick != null) {
    if (pick <= 32) out.push({ tone: 'good', text: `First-round capital (pick ${pick})` })
    else if (pick <= 100) out.push({ tone: 'good', text: `Day-two capital (round ${round ?? '2-3'}, pick ${pick})` })
    else out.push({ tone: 'flat', text: `Day-three capital (pick ${pick})` })
  } else {
    out.push({ tone: 'bad', text: 'Undrafted — no capital invested' })
  }
  const bucket = depthBucket(rank)
  if (bucket === 1) out.push({ tone: 'good', text: `Starting-caliber ${position} snaps in reach` })
  else if (bucket === 2) out.push({ tone: 'flat', text: 'One move from a starting role' })
  else if (bucket === 3) out.push({ tone: position === 'RB' ? 'flat' : 'bad', text: 'Third on the depth chart' })
  else out.push({ tone: 'bad', text: 'No clear path to snaps yet' })
  return out
}

// ── The board ────────────────────────────────────────────────────────────────
// Joins the published intel feed to the rookie prospects the Draft section
// already builds, and ranks the class two ways: by the market (FantasyCalc
// dynasty value) and by this model. The gap between those ranks IS the
// product — it is the only thing here the market has not already priced.
//
// A prospect with no intel entry is returned with `noData` and is excluded
// from both rankings: absence may be a feed gap, and scoring him at the
// bottom would invent information we do not have.
export function buildRookieResearch(prospects, intel) {
  if (!Array.isArray(prospects) || !prospects.length) return []
  const feed = intel?.players ?? null

  const rows = prospects.map(p => {
    const entry = feed?.[String(p.sleeperId)] ?? null
    const position = p.position ?? entry?.pos ?? null
    const rank = entry?.rank ?? null
    const pick = entry?.pick ?? null
    const base = {
      sleeperId: String(p.sleeperId),
      name: p.name ?? entry?.name ?? 'Unknown',
      position,
      team: p.maybeTeam ?? p.team ?? entry?.team ?? null,
      value: p.value ?? null,
      overallRank: p.overallRank ?? null,
      trend30Day: p.trend30Day ?? null,
      adp: p.adp ?? null,
      rank,
      slot: entry?.slot ?? null,
      pick,
      round: entry?.round ?? null,
      ahead: entry?.ahead ?? [],
      move: campMove(entry?.ranks),
      noData: !entry,
    }
    if (!entry || !position) return { ...base, score: null, reasons: [], tier: null, depthText: null }
    const score = opportunityScore({ position, rank, pick })
    return {
      ...base,
      score,
      tier: tierOf(score),
      reasons: scoreReasons({ position, rank, pick, round: base.round }),
      depthText: depthLabel(position, rank, base.ahead),
    }
  })

  // Market rank vs model rank, both computed WITHIN POSITION.
  //
  // Ranking across the whole class was tried first and is not a fair
  // comparison: a FantasyCalc value is already positional — it prices
  // Superflex quarterback scarcity and the shallow tight-end pool — while
  // this model prices expected points. Comparing those two orderings across
  // positions measures the difference between the two YARDSTICKS, not a
  // disagreement about players, and it systematically flags every tight end
  // as "undervalued". Within a position both sides are ranking the same
  // players on the same terms, so a gap is a real disagreement.
  const eligible = rows.filter(r => r.score != null && r.value != null && r.value > 0 && r.position)
  const marketRank = new Map()
  const modelRank = new Map()
  const byPosition = new Map()
  for (const r of eligible) {
    if (!byPosition.has(r.position)) byPosition.set(r.position, [])
    byPosition.get(r.position).push(r)
  }
  for (const group of byPosition.values()) {
    [...group].sort((a, b) => b.value - a.value).forEach((r, i) => marketRank.set(r.sleeperId, i + 1));
    [...group].sort((a, b) => b.score - a.score).forEach((r, i) => modelRank.set(r.sleeperId, i + 1))
  }

  return rows.map(r => {
    const mkt = marketRank.get(r.sleeperId) ?? null
    const mod = modelRank.get(r.sleeperId) ?? null
    return {
      ...r,
      marketRank: mkt,
      modelRank: mod,
      // Positive = the model likes him more than the market does, among the
      // other rookies at his position.
      divergence: mkt != null && mod != null ? mkt - mod : null,
    }
  })
}

// Rookies the model rates well above their market price, and vice versa.
//
// `minGap` keeps the lists to genuine disagreements rather than rounding.
// 5 is tuned to within-position ranking: position groups run ~8-30 players,
// so ranks compress and the observed gap distribution on a live class peaks
// at 12 with a median of 2. A gap of 5 is roughly the top quartile — it
// yields a handful of names per side rather than a wall of noise (minGap 8,
// carried over from cross-position ranking, surfaced only three players).
export function splitDivergence(rows, { minGap = 5, limit = 6 } = {}) {
  const scored = rows.filter(r => r.divergence != null)
  const undervalued = scored
    .filter(r => r.divergence >= minGap)
    .sort((a, b) => b.divergence - a.divergence)
    .slice(0, limit)
  const overvalued = scored
    .filter(r => r.divergence <= -minGap)
    .sort((a, b) => a.divergence - b.divergence)
    .slice(0, limit)
  return { undervalued, overvalued }
}
