import { cn } from './cn'

// THE surface container — never hand-roll `bg-bg-card border
// border-border-default` inline. Square corners, separated by rule and tone,
// never by shadow.
//
//   <Card>…</Card>
//   <Card tone="bg-warning" as="button" onClick={open}>…</Card>
//   <Card padding="p-4" interactive onClick={…}>…</Card>
//
// `accent` BECAME `tone`, AND IT MOVED FROM THE LEFT EDGE TO THE TOP.
// A thin coloured rail down a container's left edge is named in the research as
// "one of the most specific visual tells in AI-generated interfaces"
// (slop-checklist.md -> Components), and it was a documented primitive here,
// riding under Action Items, The Edge's briefing items, the Roster Analysis
// shortcut, the Trajectory card, the Optimizer's move cards, Free Agents'
// recommendation note, the cash-out callout and three Rookie Research cards —
// eleven consumers in all.
//
// It is now a 2px rule across the TOP of the card. That is a kicker rule, a
// print convention, and it reads as the card's masthead rather than as a
// decorative bar bolted to its side. The prop keeps a colour class as its
// value, so every one of those eleven consumers keeps working unchanged; the
// four that should become real Matchday posters or bands (Action Items, the
// briefing items, and the two shortcut cards) are converted in step 4.
//
// `cut` is gone with `.corner-cut`. The angled corner was Primetime Blackout's
// one structural flourish; Matchday is hard edges throughout.

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
}

export default function Card({
  tone = null,
  padding = 'md',
  interactive = false,
  as,
  className,
  children,
  ...rest
}) {
  const Tag = as ?? (rest.onClick ? 'button' : 'div')
  const pad = PADDINGS[padding] ?? padding // allow a raw class override
  return (
    <Tag
      className={cn(
        'relative w-full rounded-none bg-bg-card border border-border-default overflow-hidden',
        (interactive || rest.onClick) && 'text-left active:opacity-80 transition-opacity focus-ring',
        !tone && pad,
        className,
      )}
      {...rest}
    >
      {tone ? (
        <>
          <span className={cn('block h-[2px] w-full', tone)} aria-hidden="true" />
          <div className={pad}>{children}</div>
        </>
      ) : (
        children
      )}
    </Tag>
  )
}
