import { cn } from './cn'

// THE DENSE REGISTER — and half of the app's answer to finding B7.
//
// B7, measured: "Every screen is a vertical stack of full-width, evenly-spaced,
// 1px-bordered rectangles. There is no second density register… an Action Item
// you must act on today and a Market Radar row you'll never tap have the same
// padding, the same border and the same width."
//
// The fix is NOT to tune padding until two rectangles differ. It is to DELETE
// THE RECTANGLE. Matchday's mock has zero bordered boxes in its content area;
// it has exactly two registers, and this is the tight one:
//
//   RuledList  — many things you SCAN. Rows in a shared column, separated by a
//                hairline, no box and no per-row ground. Identity comes from
//                the <PositionBand> above, not from a border around each row.
//   Lede       — one thing you ACT ON. See ./Lede.jsx.
//
// The register is chosen by CARDINALITY AND CONSEQUENCE, never by taste: an
// enumeration (26 players, 10 teams, 20 targets) is a ruled list; a single
// decision is a Lede. `Card` survives only for a genuinely standalone panel
// that is neither — a chart, an explainer, a form.
//
//   <PositionBand position="WR" count={5} total={16219} />
//   <RuledList>
//     {wrs.map(p => <PlayerCard key={p.sleeperId} player={p} … />)}
//   </RuledList>
//
// Rows own their own `border-b` (that is what makes them reusable outside a
// list), so this draws the CLOSING rule and strips the last row's, which is
// what stops a group ending on a double hairline against the next band.
//
// `flush` cancels the host page's 16px gutter for a list that should run to the
// screen edge under a full-bleed band. Off by default: most lists sit inside a
// padded page and should stay aligned with its other content.

export default function RuledList({
  as: Tag = 'div',
  flush = false,
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cn(
        // The closing rule belongs to the list; each row's own bottom border
        // draws the separators between them.
        'border-b border-border-default [&>*:last-child]:border-b-0',
        flush && '-mx-4 px-4',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
