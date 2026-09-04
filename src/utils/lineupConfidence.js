// lineupConfidence.js — how much to believe a start/sit recommendation.
//
// The Optimizer's move card says "+2.3 pts". That number is presented with the
// same authority as a +9 one, and it should not be: residual weekly scoring
// noise is 5.6–7.3 points per player, so a two-point edge is close to a coin
// flip. This table is the measured answer to "how often is the higher-projected
// player actually the right start?", as a function of the projection gap.
//
// It is the one thing the app can say that Sleeper never will — not a better
// projection (measured: unobtainable, see the study), but a better-stated one.
//
// ── Provenance ──────────────────────────────────────────────────────────────
// Source: docs/analysis/optimizer-data-sources-2026-09.md §4 (calibration).
// Regenerate — do NOT hand-edit these numbers:
//
//   node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//        scripts/dev/optimizer-signal-backtest.mjs
//
// and copy §3's "FLEX-eligible (RB/WR/TE)" block. Last regenerated 2026-09-04
// against 20,791 player-weeks (2022–25); the values below reproduced the
// study's table exactly.
//
// ── Scope, stated honestly ──────────────────────────────────────────────────
// The pairs are same-week, same-eligibility, both projected >= 5. N = 666,026
// FLEX-eligible pairs. The curve is monotone across every bin.
//
// It generalizes across positions rather than describing RB/WR/TE alone — the
// same run measured the same curve independently for QB and DEF and it tracks
// within ~3 points at every bin:
//
//        gap   FLEX    QB     DEF
//        0-1   52.0%  51.6%  51.6%
//        1-2   56.9%  56.7%  59.2%
//        2-3   61.2%  57.9%  62.5%
//        3-4   65.3%  61.2%  63.6%
//        5-8   74.7%  71.5%    —      (DEF has too few pairs past 4 pts)
//       8-12   82.5%  80.7%    —
//
// So one curve is shipped, not three. What is NOT measured: cross-position
// slot-fills (a QB winning a Superflex slot over a WR). Those are scored on the
// same curve because the evidence above says the gap, not the position, drives
// it — but that specific pairing has not been replayed. Treat the percentage as
// a calibrated read on the projection gap, not a per-slot guarantee.
//
// Pure — no React, no fetching.

// [minGap, maxGap) → share of pairs where the higher-projected player won.
export const CONFIDENCE_CURVE = [
  { min: 0,  max: 1,        pct: 52.0, pairs: 124433 },
  { min: 1,  max: 2,        pct: 56.9, pairs: 110582 },
  { min: 2,  max: 3,        pct: 61.2, pairs: 95400 },
  { min: 3,  max: 4,        pct: 65.3, pairs: 81785 },
  { min: 4,  max: 5,        pct: 69.4, pairs: 69627 },
  { min: 5,  max: 8,        pct: 74.7, pairs: 125765 },
  { min: 8,  max: 12,       pct: 82.5, pairs: 51487 },
  { min: 12, max: Infinity, pct: 87.2, pairs: 6947 },
]

// Below this the swap is a coin flip (52% at 0–1 pts) and does not belong in a
// list of things to do. Moves under it are demoted, never silently dropped —
// the headline "points sitting on your bench" has to keep summing over ALL
// moves or it stops being true.
export const MIN_MEANINGFUL_GAIN = 1

// The measured chance that starting the higher-projected player is the right
// call, for a gap of `gap` points. Returns null for a gap of 0 or less — there
// is no recommendation to be confident about.
export function confidenceForGap(gap) {
  if (!Number.isFinite(gap) || gap <= 0) return null
  const bin = CONFIDENCE_CURVE.find(b => gap >= b.min && gap < b.max)
  return bin ? bin.pct : null
}
