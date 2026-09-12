import Mark from './Mark'
import { cn } from './cn'

// THE OPEN REGISTER — the other half of the answer to finding B7, and the
// replacement for the pattern the slop research names twice over.
//
// The Edge's briefing items were "identical cards in the icon + title +
// one-line-description pattern" (slop-checklist.md -> Components) rendered with
// "lucide icons throughout" in tinted medallions — two of the twelve markers in
// one component, and two of the three the shipped app still failed. The mock's
// `.md-e` replaces both with a newspaper entry:
//
//   eyebrow  — the small mono kicker that says what KIND of item this is; it
//              does the job the icon medallion was doing, in text, and it can
//              say "Act today" where a triangle could only say "warning".
//   headline — display type, with a <Mark> on the word carrying the finding.
//              "Five QUARTERBACKS, one dead weight", not "QB Surplus".
//   prose    — the actual sentence. Not a truncated one-liner.
//   action   — a solid ink CTA, or nothing.
//   aside    — an optional control on the eyebrow line (a dismiss X's job).
//
//   <Lede
//     eyebrow="Buy low"
//     headline={<>Carnell Tate is down <Mark tone="warning">12%</Mark></>}
//     action={{ label: 'Build this trade', onClick: … }}
//   >
//     Off 508 in thirty days at a position you're below league average in.
//   </Lede>
//
// NO BOX. Like RuledList, separation is a hairline and the surrounding space —
// the density difference between the two registers is real (a Lede is roughly
// three times the height of a ruled row) precisely because neither is drawing a
// rectangle to sit inside.
//
// THE MARK IS THE CALLER'S JOB, and deliberately so: only the caller knows
// which word carries the finding, and law 4 says a Mark may never take a
// position hue. Pass the headline as a node with the <Mark> already in it.
//
// `onClick` makes the whole entry pressable (the block IS the target — a 44px
// affordance inside a 90px block would be a smaller hit area than the thing the
// user is already aiming at). A pressable Lede renders as a <button>, so it can
// never contain another control: pass `action` as a STRING there and it is set
// as a nested <span> styled like the CTA. An entry that needs real controls
// (a dismiss, a Button that navigates elsewhere) leaves `onClick` unset and
// passes them as nodes to `action` / `aside`.

// Build a headline node from a plain title and the substring to mark. Kept
// here rather than at each call site because the "mark not found" path is the
// one that matters: a builder that changes its copy without changing its
// `mark` must degrade to a plain headline, never to a crash or a blank.
export function markedHeadline(title, mark, tone = 'ink') {
  if (!title) return null
  if (!mark) return title
  const at = title.indexOf(mark)
  if (at === -1) return title
  return (
    <>
      {title.slice(0, at)}
      <Mark tone={tone}>{mark}</Mark>
      {title.slice(at + mark.length)}
    </>
  )
}

export default function Lede({
  eyebrow = null,
  headline,
  action = null,
  aside = null,
  onClick = null,
  className,
  children,
  ...rest
}) {
  const Tag = onClick ? 'button' : 'article'
  return (
    <Tag
      onClick={onClick ?? undefined}
      className={cn(
        'block w-full text-left py-4 border-b border-border-default',
        onClick && 'press focus-ring',
        className,
      )}
      {...rest}
    >
      {(eyebrow || aside) && (
        <div className="flex items-start gap-3">
          <span className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-text-tertiary leading-none">
            {eyebrow}
          </span>
          {aside && <span className="ml-auto -mt-1.5 shrink-0">{aside}</span>}
        </div>
      )}
      <h3
        className={cn(
          'font-display text-lg font-bold uppercase text-text-primary text-balance',
          (eyebrow || aside) ? 'mt-2.5' : '',
        )}
      >
        {headline}
      </h3>
      {children && (
        <p className="mt-1.5 font-body text-[13.5px] leading-[1.55] text-text-secondary text-balance">
          {children}
        </p>
      )}
      {/* A string is the CTA of a pressable Lede (a <span>, never a nested
          <button>); a node is a real control the caller owns. */}
      {typeof action === 'string' ? (
        <span className="mt-3 inline-block ink-field font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] px-3 py-2.5">
          {action}
        </span>
      ) : action ? (
        <div className="mt-3">{action}</div>
      ) : null}
    </Tag>
  )
}
