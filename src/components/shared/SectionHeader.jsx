// THE section header — a running head with a rule under it, not a score-bug.
//
// It replaced Primetime Blackout's silver "lower-third": a gradient-filled
// block with an 8px angled trailing cut and a small skewed identity slash
// beside it. Three things in that description left with the repaint — the
// gradient (Matchday is flat colour), the angled clip (hard edges), and the
// decorative slash (an orphaned mark that carried no information the label
// didn't already carry).
//
// What remains is the print convention it was imitating badly: the label, the
// count, and a RULE. Colour moves onto the rule, where a position group still
// reads as its position without the header itself becoming a coloured object.
//
//   <SectionHeader label="Headlines" count={5} />
//   <SectionHeader label="WR" count={6} accentBar={POS_BG.WR} />
//   <SectionHeader label="Quiet swaps" accentBar={null} />   // bare, no rule
//
// For a POSITION GROUP inside a list, prefer <PositionBand> — the full-bleed
// field is the direction's signature and says more. This stays the right
// component for a section of a page that is not a position group.
export const BRAND_TICK = 'bg-text-primary'

export default function SectionHeader({ label, count, accentBar = BRAND_TICK, accentText }) {
  return (
    <div className="pt-5 pb-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`font-display text-[12px] font-extrabold uppercase tracking-[0.06em] leading-none ${
            accentBar ? 'text-text-primary' : (accentText ?? 'text-text-secondary')
          }`}
        >
          {label}
        </span>
        {count != null && (
          <span className="font-mono text-[10px] font-medium tabular-nums tracking-[0.12em] text-text-tertiary">
            {count}
          </span>
        )}
      </div>
      {accentBar && (
        <span className={`block h-[2px] w-full mt-1.5 ${accentBar}`} aria-hidden="true" />
      )}
    </div>
  )
}
