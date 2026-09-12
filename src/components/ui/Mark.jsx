import { cn } from './cn'

// THE editorial highlight — a word set in reverse out of a solid block.
//
// This is what REPLACED `Card`'s `accent` prop. A thin coloured rail down a
// container's left edge is named in the research as "one of the most specific
// visual tells in AI-generated interfaces" (slop-checklist.md), and it was a
// documented primitive here. The replacement is not a different rail: it moves
// the colour off the container and onto the WORD THAT MATTERS, which is
// Matchday's own idiom — "Five QUARTERBACKS, one dead weight", where only the
// noun carrying the finding is marked.
//
//   <Mark>quarterbacks</Mark>                  // ink — the default emphasis
//   <Mark tone="warning">12%</Mark>            // a real warning
//   <Mark tone="alt">buy window</Mark>         // the secondary hue
//
// THE ONE RULE: a Mark never takes a POSITION hue. Position colour means
// "this is a WR" everywhere else in the app, so marking "down 12%" in RB teal
// would make a loss read as a position — the same exclusivity that keeps a TE
// tag from reading as danger. Position hues are painted as <PositionBand>, and
// only there.
//
// `tone="ink"` inside an .ink-field would paint ink on ink; use `tone="ground"`
// there, which reverses a second time back to the page's own colours.

const TONES = {
  ink:     'bg-text-primary text-bg-primary',
  // Reverses a second time — for use INSIDE an .ink-field, where the field is
  // already ink and the page's colours are what stand out against it.
  ground:  'bg-bg-primary text-text-primary',
  // The secondary hue, 176° from the brand spot. This is the non-semantic
  // highlight: emphasis that is neither a status nor "you".
  alt:     'bg-alt text-bg-primary',
  brand:   'bg-brand text-white',
  success: 'bg-success text-bg-primary',
  warning: 'bg-warning text-bg-primary',
  danger:  'bg-danger text-bg-primary',
}

export default function Mark({ tone = 'ink', className, children, ...rest }) {
  return (
    <span
      className={cn('px-1 py-px', TONES[tone] ?? TONES.ink, className)}
      // `box-decoration-break: clone` so a Mark that wraps across two lines
      // paints its block on both, instead of leaving the second line bare.
      style={{ WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}
      {...rest}
    >
      {children}
    </span>
  )
}
