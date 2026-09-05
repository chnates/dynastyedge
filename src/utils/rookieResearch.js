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

// The year-1 core: 0-1, higher = better chance of landing a real role as a
// rookie. This is the function `scripts/dev/rookie-signal-backtest.mjs` grades
// against rookie-season points (rho +0.664) and it must keep meaning exactly
// that. The number the BOARD shows is `dynastyOpportunityScore` below.
export function opportunityScore({ position, rank, pick }) {
  return DEPTH_WEIGHT * depthScore(position, rank) + (1 - DEPTH_WEIGHT) * capitalScore(pick)
}

// ── The age tilt ─────────────────────────────────────────────────────────────
// A dynasty manager is not asking "will he play in September", he is asking
// "is he worth a roster spot for three years". The year-1 core above answers
// the first question. Tilting it 10% toward youth answers the second measurably
// better, and that is the only measured, replicating improvement to come out of
// the whole Phase 3 investigation:
//
//   vs YEARS 2+3   per-class delta at w=0.10:  mean +0.0183  t=+3.35  8 of 9
//   vs YEAR 1      per-class delta at w=0.10:  mean -0.0023  t=-0.37  4 of 9
//
// (n=712 drafted skill rookies, classes 2015-2023, and 2015-2020 sits entirely
// outside the 2021-2025 window the year-1 core was calibrated on. Reproduce
// with `node scripts/dev/rookie-longterm-backtest.mjs` §4, which imports the
// constants below so the analysis and the app cannot drift.)
//
// So: clearly better at the three-year question, no measurable cost at year 1.
// It is a TILT and not a second axis on purpose — the two-axis rookie UI was
// tested twice and rejected twice (docs/analysis/rookie-longterm-signals-2026-09.md
// and rookie-college-production-2026-09.md). A tilted board correlates 0.971
// with the untilted one; showing both would be showing the same list twice.
export const AGE_TILT_WEIGHT = 0.10

// The blended form the back-test measured: `(1-w)*base + w*ageTiltScore`, with
// age mapped to 0-1 (younger = higher) against his own position — a 22-year-old
// QB is normal, a 22-year-old WR is not. Exported so
// `scripts/dev/rookie-longterm-backtest.mjs` blends exactly what ships.
// Returns null when the age is unknown.
// Deliberately UNCLAMPED: the back-tested spec is a bare `0.5 + 0.25z`, and a
// clamp here is not a harmless safety rail — it silently disagrees with the
// centered form below at |z| > 2, which on the live class moved 17 of 78
// tilted rookies by up to 9 spots. Ship the spec that was measured.
export function ageTiltScore(position, age) {
  const z = ageAtDraftZ(position, age)
  if (z == null) return null
  return 0.5 + 0.25 * z
}

// The SHIPPED form is the same tilt written so a neutral age is a no-op.
//
//   measured:  0.9*base + 0.1*(0.5 + 0.25z)  =  0.9*base + 0.05 + 0.025z
//   shipped:   base + 0.0278z
//   and       measured = 0.9 * (shipped + 0.0556)
//
// — a positive affine transform, so the two rank rookies IDENTICALLY. The
// measured result carries over exactly; `tests/rookieResearch.test.mjs` pins
// that equivalence rather than trusting this comment.
//
// Why bother rewriting it: the blended form pulls every scored rookie toward
// 0.5, which is harmless when everyone is tilted (the back-test frame had an
// age for 865 of 866) and actively wrong when only some are. Live, only 78 of
// the 237 published 2026 rookies carry an age, and the ones missing it are
// almost entirely UNDRAFTED — already sitting on the 0.05 capital floor.
// Blending a buried UDFA toward 0.5 would take him from 0.041 to 0.087, more
// than doubling the score of exactly the player we know least about. That is
// the same shape of bug as the `?? 99` positional-rank default that once
// stamped every rookie "D — Deep Stash".
//
// In this form an unknown age gives z = null, the tilt is skipped, and the
// rookie keeps his year-1 score untouched — which is also the conservative
// reading of the evidence, since the back-test frame was DRAFTED rookies only
// and the tilt is not validated outside it.
const AGE_Z_COEFF = 0.25 * AGE_TILT_WEIGHT / (1 - AGE_TILT_WEIGHT)

export function dynastyOpportunityScore({ position, rank, pick, age }) {
  const base = opportunityScore({ position, rank, pick })
  const z = ageAtDraftZ(position, age)
  if (z == null) return base
  return Math.max(0, Math.min(1, base + AGE_Z_COEFF * z))
}

// ── Measurables: age at draft + the combine drills ───────────────────────────
// DISPLAYED, NEVER SCORED. Phase 3 proposed a second "long-term" score built
// from age and combine athleticism; docs/analysis/rookie-longterm-signals-2026-09.md
// tested it against years 2+3 production over n=871 drafted skill rookies
// (2013-2023) and killed it:
//
//   - COMBINE ATHLETICISM IS NULL. Adding it to a capital+age score moved the
//     held-out Spearman by +0.004, inside the noise, and only ~half of a
//     current rookie class has a 40 time at all (38 of 80 in 2026 — the best
//     prospects skip the drill or run at a pro day nflverse does not publish).
//   - AGE at draft is a real but small signal, and it is NOT a second axis:
//     a long-term score built on it correlates 0.923 with the score already
//     shipped, is a WORSE predictor of years 2+3 than that score (+0.610 vs
//     +0.634), and the "low impact now / high upside later" quadrant the
//     two-axis product depended on held 0 rookies across nine real classes.
//
// So these are rendered as context on the profile drawer, in the same voice as
// camp movement: a fact about the player, with no claim that it predicts.
// Regenerate the baselines with `node scripts/dev/rookie-longterm-backtest.mjs`,
// which diffs them against a fresh measurement — never hand-edit them.

// Feed key -> the nflverse combine column it comes from. Only the three
// well-covered drills are carried: cone and shuttle are missing for more than
// half the population, so a band computed from them would mostly be absent.
export const COMBINE_DRILLS = { forty: 'forty', vert: 'vertical', broad: 'broad_jump' }

// Mean and sd per position over every 2013+ combine invitee at that position
// (n = 1,597 skill players). `higherIsBetter` is false for a timed drill.
export const COMBINE_BASELINE = {
  QB: {
    forty: { mean: 4.79, sd: 0.16, higherIsBetter: false },
    vert:  { mean: 31.46, sd: 3.14, higherIsBetter: true },
    broad: { mean: 113.64, sd: 6.69, higherIsBetter: true },
  },
  RB: {
    forty: { mean: 4.55, sd: 0.11, higherIsBetter: false },
    vert:  { mean: 34.49, sd: 3.18, higherIsBetter: true },
    broad: { mean: 120.09, sd: 5.27, higherIsBetter: true },
  },
  WR: {
    forty: { mean: 4.50, sd: 0.10, higherIsBetter: false },
    vert:  { mean: 35.54, sd: 3.21, higherIsBetter: true },
    broad: { mean: 122.84, sd: 5.88, higherIsBetter: true },
  },
  TE: {
    forty: { mean: 4.74, sd: 0.14, higherIsBetter: false },
    vert:  { mean: 33.66, sd: 3.06, higherIsBetter: true },
    broad: { mean: 118.00, sd: 5.57, higherIsBetter: true },
  },
}

// Age at the NFL draft, per position, over the 2013-2023 drafted skill classes
// (n = 869). The spread is narrow — every position sits within a year of 22.2
// with an sd under 1.1 — which is itself why age cannot carry a score.
export const AGE_BASELINE = {
  QB: { mean: 22.75, sd: 1.06 },
  RB: { mean: 22.09, sd: 0.88 },
  WR: { mean: 22.15, sd: 0.89 },
  TE: { mean: 22.45, sd: 0.88 },
}

export const DRILL_LABEL = { forty: '40-yard dash', vert: 'Vertical', broad: 'Broad jump' }

// Signed z against the position baseline, POSITIVE = better than his position
// group. Returns null when the drill or the position has no baseline — the
// caller renders `—`, it never substitutes a zero (rule 7's spirit: an absent
// measurement is shown as absent, not as average).
export function measurableZ(position, drill, value) {
  const b = COMBINE_BASELINE[position]?.[drill]
  if (!b?.sd || value == null || !Number.isFinite(value)) return null
  const z = (value - b.mean) / b.sd
  return b.higherIsBetter ? z : -z
}

// Age at draft as a signed z, POSITIVE = younger than his position group.
export function ageAtDraftZ(position, age) {
  const b = AGE_BASELINE[position]
  if (!b?.sd || age == null || !Number.isFinite(age)) return null
  return (b.mean - age) / b.sd
}

// A z turned into a plain-English band. Deliberately coarse: the underlying
// signal is weak, and four buckets say what a decimal would overstate.
export function bandOf(z) {
  if (z == null) return null
  if (z >= 1) return 'elite'
  if (z >= 0.35) return 'above average'
  if (z > -0.35) return 'average'
  return 'below average'
}

// The drawer's "Measurables" readout: one row per drill the feed actually has.
// A rookie with no combine entry returns [] and the card hides — nothing is
// invented, and he is never dropped from any list for it.
export function measurables(row) {
  if (!row?.position) return []
  return Object.keys(COMBINE_DRILLS)
    .map(drill => {
      const value = row[drill]
      if (value == null || !Number.isFinite(value)) return null
      const z = measurableZ(row.position, drill, value)
      return { drill, label: DRILL_LABEL[drill], value, z, band: bandOf(z) }
    })
    .filter(Boolean)
}

// "an RB", "a WR" — only RB is read as a vowel sound ("ar-bee"). Exported so
// the drawer's drill lines use the same article as the age line.
export function positionArticle(position) {
  return position === 'RB' ? 'an' : 'a'
}

// "22.1 at the draft — young for a WR". Age is the one measurable that carried
// any measured signal, so it gets a sentence of its own; the sentence still
// makes no prediction.
export function ageAtDraftRead(position, age) {
  if (age == null || !Number.isFinite(age)) return null
  const z = ageAtDraftZ(position, age)
  const forPos = `for ${positionArticle(position)} ${position}`
  const qualifier = z == null ? null
    : z >= 0.75 ? `young ${forPos}`
    : z <= -0.75 ? `old ${forPos}`
    : `typical ${forPos}`
  return { age, z, text: qualifier ? `${age.toFixed(1)} at the NFL draft — ${qualifier}` : `${age.toFixed(1)} at the NFL draft` }
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
export function scoreReasons({ position, rank, pick, round, age }) {
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
  // The age tilt, surfaced only when it actually moved the score in a
  // direction worth naming — a typical-age rookie gets no line, because
  // "he is exactly the normal age" is not a reason.
  const ageZ = ageAtDraftZ(position, age)
  if (ageZ != null && ageZ >= 0.75) {
    out.push({ tone: 'good', text: `Young for a ${position} at ${age.toFixed(1)} — more upside years` })
  } else if (ageZ != null && ageZ <= -0.75) {
    out.push({ tone: 'bad', text: `Old for a ${position} at ${age.toFixed(1)} — fewer upside years` })
  }
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
      // positionRank and age are not used by the model — they are carried so a
      // row can be handed straight to PlayerProfileDrawer, which grades and
      // labels a player from them. Dropping them (the shape shipped first) made
      // the drawer read `positionRank ?? 99` and stamp every rookie opened from
      // this page "D — Deep Stash", with no age in the header.
      positionRank: p.positionRank ?? null,
      age: p.age ?? null,
      trend30Day: p.trend30Day ?? null,
      adp: p.adp ?? null,
      rank,
      slot: entry?.slot ?? null,
      pick,
      round: entry?.round ?? null,
      ahead: entry?.ahead ?? [],
      move: campMove(entry?.ranks),
      // Measurables ride along untouched from the feed. They are DISPLAY ONLY
      // (see the null above) — nothing below reads them, and `opportunityScore`
      // is not passed them, so a feed that starts or stops carrying them can
      // never move a single score.
      ageAtDraft: entry?.age ?? null,
      height: entry?.ht ?? null,
      weight: entry?.wt ?? null,
      forty: entry?.forty ?? null,
      vert: entry?.vert ?? null,
      broad: entry?.broad ?? null,
      noData: !entry,
    }
    if (!entry || !position) {
      return { ...base, score: null, reasons: [], tier: null, depthText: null, ageTilted: false }
    }
    const score = dynastyOpportunityScore({ position, rank, pick, age: base.ageAtDraft })
    return {
      ...base,
      score,
      // Whether the age tilt actually applied. The UI says so rather than
      // implying every score is on the same basis — an untilted rookie is
      // scored on year-1 opportunity alone.
      ageTilted: ageAtDraftZ(position, base.ageAtDraft) != null,
      tier: tierOf(score),
      reasons: scoreReasons({ position, rank, pick, round: base.round, age: base.ageAtDraft }),
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
// ── Roster fit ───────────────────────────────────────────────────────────────
// Everything above is league-agnostic: it answers "which rookies become
// something?" This layer answers the question that actually decides a pick —
// "which of them should *I* take?" — by weighing the opportunity score against
// what my roster is short of and where my win window is.
//
// This is a RANKING over the back-tested score, not a new predictive claim.
// Nothing here changes `score`; the bonuses only reorder the board for one
// roster. The deficit definition is the same one every other recommendation
// surface uses (recommendations.js → getDeficitPositions), so "you need a TE"
// means the same thing here as it does in Free Agents and the Trade Analyzer.

// Half the ranking is the market's price. Opportunity alone would lead the
// board with a well-placed day-three flier over a consensus 1.01, which is a
// fine *divergence* finding and a bad *draft plan* — you still have to spend a
// real pick, and the market prices talent this model deliberately ignores.
export const FIT_MARKET_WEIGHT = 0.45
export const FIT_NEED_BONUS = 0.22
export const FIT_DIVERGENCE_BONUS = 0.1
export const FIT_WINDOW_BONUS = 0.08
// Day one and two of the NFL draft — the capital a rebuilder can afford to let
// develop behind a starter.
const EARLY_CAPITAL = 64

export function buildTeamFit(rows, { deficits, tier } = {}) {
  if (!Array.isArray(rows)) return []
  const needs = deficits instanceof Set ? deficits : new Set(deficits ?? [])
  const maxValue = rows.reduce((m, r) => Math.max(m, r.value ?? 0), 0)

  return rows.map(row => {
    const fitsNeed = row.position != null && needs.has(row.position)
    // An unscored rookie (no intel entry) gets no fit — same contract as the
    // score itself: absence of data is not evidence of a bad fit.
    if (row.score == null) return { ...row, fit: null, fitReasons: [], fitsNeed }

    const market = maxValue > 0 ? (row.value ?? 0) / maxValue : 0
    let fit = (1 - FIT_MARKET_WEIGHT) * row.score + FIT_MARKET_WEIGHT * market
    const fitReasons = []

    if (fitsNeed) {
      fit += FIT_NEED_BONUS
      fitReasons.push(`Fills your ${row.position} need`)
    }
    if (row.divergence != null && row.divergence >= 5) {
      fit += FIT_DIVERGENCE_BONUS
      fitReasons.push(`Model rates him ${row.divergence} spots above the market`)
    }
    if (tier === 'Contending' && depthBucket(row.rank) === 1) {
      fit += FIT_WINDOW_BONUS
      fitReasons.push('In line to play right away — you\'re contending')
    } else if (tier === 'Rebuilding' && row.pick != null && row.pick <= EARLY_CAPITAL) {
      fit += FIT_WINDOW_BONUS
      fitReasons.push('Early NFL capital worth developing — you\'re rebuilding')
    }

    return { ...row, fit, fitReasons, fitsNeed }
  })
}

// The shortlist: who to target with the picks you actually hold.
export function topTargets(rows, { limit = 4 } = {}) {
  return rows
    .filter(r => r.fit != null)
    .sort((a, b) => b.fit - a.fit || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, limit)
}

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
