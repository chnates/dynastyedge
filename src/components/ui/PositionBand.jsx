import { POS_FIELD } from '../../utils/positionColors'
import { cn } from './cn'

// THE section band — Matchday's signature, and the reason the direction was
// worth the risk: the app's five position hues promoted from 9px tags to
// FULL-BLEED FIELDS with the type reversed out of them. A position group header
// stops being a label with a coloured dot and becomes a solid block of colour,
// which is a palette no template produces and is built entirely from tokens the
// app already owned.
//
//   <PositionBand position="WR" count={5} total={16219} />
//   <PositionBand label="Your targets" count={20} />        // neutral ink band
//
// THE BAND CARRIES THE GROUP TOTAL, and that is load-bearing rather than
// decorative. Magnitude is encoded as type SIZE on each row (see <Magnitude>),
// which lets you read SHAPE within a position — but size alone cannot tell you
// that your five quarterbacks are collectively worth more than your six
// receivers. The band's total is how you read WEIGHT ACROSS positions
// (directions.md revision 1, change 2).
//
// A BOARD THAT MIXES POSITIONS TAKES THE NEUTRAL BAND. Colouring a mixed list
// with one position's hue would lie about what is in it, so `position` may be
// omitted and the band falls back to ink (the mock's `.mix`). Never pick a hue
// to make a mixed board look colourful.
//
// BLEED: the band is full-width by design and the screens that host it render
// inside a 16px gutter, so it cancels that gutter with `-mx-4 px-4` by default.
// Pass `bleed={false}` inside a container that has no horizontal padding.

export default function PositionBand({
  position = null,
  label,
  count = null,
  total = null,
  bleed = true,
  className,
  ...rest
}) {
  const field = position ? POS_FIELD[position] : null
  const text = label ?? position ?? ''
  // The count/total line only renders what it was given, so a band above a list
  // of unpriced assets shows "5" rather than "5 · 0" (rule 7's discipline: an
  // absent value is never printed as a zero).
  //
  // A total of 0 is treated as absent for the same reason, and it is a real
  // case rather than a hypothetical: the DEF group holds exactly one defense,
  // FantasyCalc ranks zero defenses, so the group total is genuinely 0 and the
  // band read "1 · 0". Every row under it already shows the honest em dash.
  const meta = [
    count != null ? String(count) : null,
    total ? total.toLocaleString() : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      className={cn(
        'flex items-baseline gap-2 py-1.5',
        bleed ? '-mx-4 px-4' : 'px-4',
        field ?? 'bg-text-primary text-bg-primary',
        className,
      )}
      {...rest}
    >
      <span className="font-display text-[13px] font-extrabold uppercase tracking-[0.01em] leading-none">
        {text}
      </span>
      {meta && (
        <span className="ml-auto font-mono text-[9px] font-medium uppercase tracking-[0.14em] tabular-nums leading-none">
          {meta}
        </span>
      )}
    </div>
  )
}
