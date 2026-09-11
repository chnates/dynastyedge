import { cn } from './cn'

// THE value figure — and the app's answer to finding B2, the finding the whole
// design review is about.
//
// B2, measured: on My Roster, "Bo Nix (4,867) and Xavier Legette (365) — a 13x
// spread — are visually indistinguishable", because value is encoded only as a
// four-digit number you must read and rank yourself. Playoff Odds was the one
// screen that encoded magnitude (its odds bar) and the one screen that scanned.
//
// Matchday's answer is NOT to promote that bar. A progress meter is a component
// from a different design language, and the direction was chosen partly for
// refusing it. In a publication, MAGNITUDE IS TYPE SIZE: a bigger number is set
// bigger. So similar values look similar and the tail of a list visibly shrinks
// (directions.md revision 1, change 2).
//
//   <Magnitude value={4867} />        // 23.6px
//   <Magnitude value={365} />         // 15.1px
//   <Magnitude value={null} />        // an em dash at the base size (rule 7)
//
// THE SCALE IS ABSOLUTE ACROSS THE APP. It is deliberately not derived from the
// list being rendered: a per-list maximum would make one player's figure change
// size because a DIFFERENT player's value changed, and 4,867 would read as huge
// on a thin board and ordinary on a deep one. The point of the encoding is that
// a number means the same thing on every screen.
//
// WHERE THE REFERENCE COMES FROM — pinned, and pinned to a CONTRACT rather than
// to a snapshot. The mock used 9365, which was the top-of-market dynasty value
// on the day it was drawn; that goes stale as the market moves, and any asset
// above it would run off the top of the ramp. FantasyCalc's scale is documented
// in CLAUDE.md as 0-10000, so the ceiling is the reference. The two differ by
// less than a pixel across the whole range (at 4,867: 23.6px against the mock's
// 24.1px), so this buys stability at no visual cost.

// FantasyCalc's documented dynasty-value ceiling (CLAUDE.md -> Data Sources).
export const MAGNITUDE_REFERENCE = 10000

// 14px floor, 30px ceiling. The 0.7 exponent is the mock's: a linear ramp would
// leave the bottom two thirds of the market — where most of a roster lives —
// crushed into three pixels of difference, and a log ramp flattens the top,
// which is where the decisions are.
export const MAGNITUDE_MIN = 14
export const MAGNITUDE_SPAN = 16
const MAGNITUDE_EXP = 0.7

// Exported separately so a caller that must size something other than a <span>
// (an SVG label, a table cell) uses the same curve rather than re-deriving it.
export function magnitudeSize(value, reference = MAGNITUDE_REFERENCE) {
  if (value == null || !Number.isFinite(value) || value <= 0) return MAGNITUDE_MIN
  const t = Math.min(value / reference, 1)
  return MAGNITUDE_MIN + MAGNITUDE_SPAN * Math.pow(t, MAGNITUDE_EXP)
}

export default function Magnitude({
  value,
  reference = MAGNITUDE_REFERENCE,
  className,
  ...rest
}) {
  // Rule 7: an unranked asset is shown, never dropped, and never as a 0. It
  // renders at the base size, which is also the truthful size for "no value".
  const known = value != null && Number.isFinite(value)
  return (
    <span
      className={cn(
        'font-mono font-bold tabular-nums leading-none tracking-[-0.035em]',
        known ? 'text-text-primary' : 'text-text-tertiary',
        className,
      )}
      style={{ fontSize: `${magnitudeSize(known ? value : null, reference).toFixed(1)}px` }}
      {...rest}
    >
      {known ? value.toLocaleString() : '—'}
    </span>
  )
}
