// Dynasty Trajectory — forward value projection (Feature 17).
//
// Everything in the rest of the app is a snapshot of *now*. This turns a
// roster into a value curve over the next few seasons by aging every player
// along a position-specific market curve that is derived live from the
// FantasyCalc dataset — no hardcoded decay rates.
//
// The model, in three steps:
//   1. buildAgeCurves() learns, per position, "what does the dynasty market
//      pay for a player of age N right now" — a kernel-smoothed curve over the
//      whole FantasyCalc pool, blended toward a peak-window-shaped prior so
//      sparse age bins stay sane.
//   2. A player's projected value n seasons out is simply
//      currentValue × curve(age + n) / curve(age) — the talent residual
//      cancels, so a stud and a scrub both ride the same proportional curve.
//   3. Picks hold at their FantasyCalc value until their draft year, then
//      convert to a rookie-aged young asset and ride a generic blended curve.
//
// Pure logic only — composes caches LeagueContext already holds. Labeled an
// estimate everywhere it surfaces; it is a model, not a prophecy.

import { PEAK_WINDOWS, getPeakStatus } from './peakWindows'

const POSITIONS = ['QB', 'RB', 'WR', 'TE']
export const TRAJECTORY_HORIZON = 3 // seasons projected beyond the current one

const AGE_MIN = 21
const AGE_MAX = 39
const KERNEL_BW = 2.5      // smoothing bandwidth (years) for the market curve
const PRIOR_WEIGHT = 4     // pseudo-count pulling sparse bins toward the prior
const ROOKIE_ENTRY_AGE = 22

// A single season can't plausibly swing one asset's value beyond these bounds;
// clamps keep a thin age bin from producing a wild projection.
const YEAR_RATIO_FLOOR = 0.55
const YEAR_RATIO_CEIL = 1.18

// Team-level direction cuts (getTrajectoryRead / getTrajectoryVerdict). These
// classify a whole roster's now→+3 value curve, NOT a single player — and a
// roster total behaves very differently from a player. Aging decliners and
// pre-peak risers largely cancel in the sum, and every pick matures UPWARD, so
// a real 10-team league's 3-yr team totals compress into a narrow, slightly
// positive band (measured range on this league: −1.9% … +10.2%). The old
// absolute gates (ascending on peak-year≥+2 OR >+5%; declining on peak-now AND
// <−8%) were set for a wider swing than roster aggregation ever produces: the
// −8% floor was unreachable so "selling vets" never fired, and the peak-year≥+2
// clause fired on nearly every roster (picks alone push the peak to +3), so
// "building" over-fired. These cuts are keyed to the aggregation instead, on the
// NET change across the whole horizon (not on when the interim peak lands — pick
// maturation routinely pushes a roster's peak to +1/+2 even when its core is
// aging, so the old peak-is-now requirement excluded genuinely-eroding teams):
//   • DECLINING = the total ends the horizon below today past a small deadband
//     → the window is genuinely closing (a sell-vets signal).
//   • ASCENDING = growth clears the structural pick-maturation drift (~+2–3%
//     that lifts every roster) by a clear margin → genuinely building.
//   • else BALANCED.
// Asymmetric (−1% vs +5%) on purpose: picks bias every roster's drift positive,
// so a NET-negative total after that uplift is a stronger aging signal than an
// equal-magnitude gain. (seriesDirection's ±5% is unchanged — it classifies
// individual players, where the symmetric band tests calibrated.)
const TEAM_DECLINE_CUT = -0.01
const TEAM_ASCEND_CUT = 0.05

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function weightedMedian(items) {
  const sorted = [...items].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((s, d) => s + d.w, 0)
  let cum = 0
  for (const d of sorted) {
    cum += d.w
    if (cum >= total / 2) return d.value
  }
  return sorted[sorted.length - 1]?.value ?? 0
}

// Shape prior: dynasty value crests near the *front* of the production peak
// (the market pays for the years ahead) and fades after it. Used only to
// stabilize ages with thin samples — empirical data dominates where it exists.
function priorShape(position, age) {
  const [s, e] = PEAK_WINDOWS[position]
  if (age <= s) {
    const t = clamp((age - (s - 6)) / 6, 0, 1) // ramp 0.72 → 1.0 into the peak
    return 0.72 + 0.28 * t
  }
  if (age <= e) {
    const t = (age - s) / Math.max(1, e - s) // gentle ease across the window
    return 1.0 - 0.12 * t
  }
  const t = clamp((age - e) / 7, 0, 1) // decline 0.88 → 0.22 over ~7 years
  return 0.88 - 0.66 * t
}

function buildPositionCurve(samples, position) {
  const [s, e] = PEAK_WINDOWS[position]
  const peakSamples = samples.filter(d => d.age >= s - 1 && d.age <= e + 1)
  const peakRef = peakSamples.length
    ? median(peakSamples.map(d => d.value))
    : samples.length
      ? median(samples.map(d => d.value))
      : 1000

  const curve = {}
  for (let age = AGE_MIN; age <= AGE_MAX; age++) {
    const weighted = []
    let wsum = 0
    samples.forEach(d => {
      const w = Math.exp(-((d.age - age) ** 2) / (2 * KERNEL_BW * KERNEL_BW))
      if (w > 0.01) {
        wsum += w
        weighted.push({ value: d.value, w })
      }
    })
    const emp = wsum > 0 ? weightedMedian(weighted) : null
    const prior = priorShape(position, age) * peakRef
    // Blend: empirical weighted by its own sample density, prior by a fixed
    // pseudo-count. Dense ages read ~pure market; thin ages lean on the shape.
    const numerator = (emp != null ? emp * wsum : 0) + prior * PRIOR_WEIGHT
    const denom = (emp != null ? wsum : 0) + PRIOR_WEIGHT
    curve[age] = numerator / denom
  }
  return curve
}

// Generic positionless curve (picks-as-rookies ride this). Only its *shape*
// matters — magnitude cancels in the ratio — so a simple cross-position mean
// is enough.
function buildGenericCurve(curves) {
  const g = {}
  for (let age = AGE_MIN; age <= AGE_MAX; age++) {
    let sum = 0
    let n = 0
    POSITIONS.forEach(p => {
      if (curves[p]) { sum += curves[p][age]; n++ }
    })
    g[age] = n ? sum / n : 1
  }
  return g
}

function curveAt(curve, age) {
  if (!curve) return null
  const a = clamp(age, AGE_MIN, AGE_MAX)
  const lo = Math.floor(a)
  const hi = Math.ceil(a)
  if (lo === hi) return curve[lo]
  const t = a - lo
  return curve[lo] * (1 - t) + curve[hi] * t
}

export function buildAgeCurves(playerMap) {
  const samplesByPos = { QB: [], RB: [], WR: [], TE: [] }
  Object.values(playerMap || {}).forEach(p => {
    if (!POSITIONS.includes(p.position)) return
    if (p.age == null || p.age <= 0) return
    if (!p.value || p.value <= 0) return
    samplesByPos[p.position].push({ age: p.age, value: p.value })
  })
  const curves = {}
  POSITIONS.forEach(pos => { curves[pos] = buildPositionCurve(samplesByPos[pos], pos) })
  return { curves, generic: buildGenericCurve(curves) }
}

// Project one player n seasons forward. Unranked / no-age players hold flat —
// we never invent a curve for an asset the market hasn't priced.
export function projectPlayer(player, n, curves) {
  const value = player.value || 0
  if (n <= 0) return value
  if (!value || player.unranked) return value
  if (player.age == null || !curves?.[player.position]) return value
  const curve = curves[player.position]
  const base = curveAt(curve, player.age)
  const future = curveAt(curve, player.age + n)
  if (!base) return value
  const ratio = clamp(future / base, YEAR_RATIO_FLOOR ** n, YEAR_RATIO_CEIL ** n)
  return Math.round(value * ratio)
}

export function projectPlayerSeries(player, curves) {
  const out = []
  for (let n = 0; n <= TRAJECTORY_HORIZON; n++) out.push(projectPlayer(player, n, curves))
  return out
}

// A pick holds at its FantasyCalc value until its draft year, then converts to
// a rookie-aged young asset that ages on the generic curve.
function projectPick(pick, targetSeasonYear, genericCurve) {
  const v = pick.value || 0
  if (!v) return 0
  const pickYear = Number(pick.season)
  if (!pickYear || targetSeasonYear < pickYear) return v // not yet conveyed
  const yearsIn = targetSeasonYear - pickYear
  if (yearsIn <= 0) return v
  const base = curveAt(genericCurve, ROOKIE_ENTRY_AGE)
  const future = curveAt(genericCurve, ROOKIE_ENTRY_AGE + yearsIn)
  if (!base) return v
  const ratio = clamp(future / base, YEAR_RATIO_FLOOR ** yearsIn, YEAR_RATIO_CEIL ** yearsIn)
  return Math.round(v * ratio)
}

export function buildRosterTrajectory(roster, currentSeasonYear, curves, genericCurve) {
  const ns = []
  for (let n = 0; n <= TRAJECTORY_HORIZON; n++) ns.push(n)

  const playerByYear = ns.map(n =>
    roster.players.reduce((s, p) => s + projectPlayer(p, n, curves), 0)
  )
  const pickByYear = ns.map(n =>
    roster.picks.reduce((s, pk) => s + projectPick(pk, currentSeasonYear + n, genericCurve), 0)
  )
  const totalByYear = ns.map(n => playerByYear[n] + pickByYear[n])
  const seasons = ns.map(n => currentSeasonYear + n)

  const byPosition = {}
  POSITIONS.forEach(pos => {
    const group = roster.players.filter(p => p.position === pos)
    byPosition[pos] = ns.map(n => group.reduce((s, p) => s + projectPlayer(p, n, curves), 0))
  })

  return { seasons, totalByYear, playerByYear, pickByYear, byPosition }
}

export function seriesDirection(series) {
  if (!series?.length || !series[0]) return 'stable'
  const pct = (series[series.length - 1] - series[0]) / series[0]
  if (pct > 0.05) return 'ascending'
  if (pct < -0.05) return 'declining'
  return 'stable'
}

export function getTrajectoryVerdict(trajectory) {
  const { totalByYear, seasons } = trajectory
  const now = totalByYear[0]
  if (!now) return { tone: 'stable', peakSeason: seasons[0], headline: 'Not enough market data to project this roster yet.' }

  let peakIdx = 0
  totalByYear.forEach((v, i) => { if (v > totalByYear[peakIdx]) peakIdx = i })
  const endPct = (totalByYear[totalByYear.length - 1] - now) / now
  const peakSeason = seasons[peakIdx]
  const lastSeason = seasons[seasons.length - 1]

  if (endPct < TEAM_DECLINE_CUT) {
    return {
      tone: 'declining',
      peakSeason,
      headline: `Your roster value is set to slide through ${lastSeason}. Your window is open — spend future picks on win-now help and sell aging veterans before their value drops.`,
    }
  }
  if (endPct > TEAM_ASCEND_CUT) {
    return {
      tone: 'ascending',
      peakSeason,
      headline: `Your value keeps climbing toward ${peakSeason}. You're ascending — bank youth and picks and let the core mature.`,
    }
  }
  return {
    tone: 'stable',
    peakSeason,
    headline: `Your value holds near its peak around ${peakSeason} before easing off — a balanced window. Add youth on the margins without mortgaging the future.`,
  }
}

// Compact one-line trajectory read for a roster — used on Trade Partner Finder
// cards. Distinct from the playoff-odds buyer/seller flag (that's this-season
// win-now); this is the multi-year value direction: a team whose value is
// sliding tends to sell veterans, a team whose value is climbing is building.
export function getTrajectoryRead(trajectory) {
  const { totalByYear, seasons } = trajectory
  const now = totalByYear[0]
  if (!now) return null

  let peakIdx = 0
  totalByYear.forEach((v, i) => { if (v > totalByYear[peakIdx]) peakIdx = i })
  const endPct = (totalByYear[totalByYear.length - 1] - now) / now
  const lastSeason = seasons[seasons.length - 1]
  const peakSeason = seasons[peakIdx]

  if (endPct < TEAM_DECLINE_CUT) {
    return { direction: 'declining', pct: endPct, peakSeason, lastSeason, label: `Value slides through ${lastSeason} — selling vets` }
  }
  if (endPct > TEAM_ASCEND_CUT) {
    return { direction: 'ascending', pct: endPct, peakSeason, lastSeason, label: `Value climbing toward ${peakSeason} — building` }
  }
  return { direction: 'stable', pct: endPct, peakSeason, lastSeason, label: `Value holds near ${peakSeason} — balanced window` }
}

// Short peak-window tag for a single player's table row.
export function peakStatusShort(position, age) {
  const status = getPeakStatus(position, age)
  if (!status) return null
  if (status.phase === 'ascending') return 'Pre-peak'
  if (status.phase === 'peak') return 'In peak'
  return 'Past peak'
}
