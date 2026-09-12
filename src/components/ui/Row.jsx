import { Link } from 'react-router-dom'
import { cn } from './cn'

// THE TAPPABLE ROW — the member of a <RuledList>.
//
// Step 4 rolled the ruled-list register through eleven screens and, in doing
// so, hand-rolled the same row eleven times. /design-review's mechanical
// detectors passed the diff clean (no inline Button, Card, Chip or Sheet), but
// the judgement pass caught what they could not: the eleven copies had DRIFTED.
// Some carried `.focus-ring` and some did not, which is an accessibility-floor
// gap, not a style nit — the floor says `.focus-ring` is the ONE focus
// definition and lives in the primitives so no screen can opt out. Several also
// carried `dark:border-border-default` (the token is already theme-aware) and
// `last:border-0` (RuledList strips the last border itself).
//
// So the row is a primitive now, and the drift is unrepeatable by construction.
//
//   <RuledList>
//     {players.map(p => <Row key={p.id} onClick={…}>…</Row>)}
//   </RuledList>
//
// `onClick` renders a <button>, `to` a <Link>, neither a plain <div> — a row
// that is not tappable should not announce itself as a control.

const PADDINGS = {
  sm: 'py-2.5',   // dense enumerations — 26 players, a news feed
  md: 'py-3',     // the default
  lg: 'py-4',     // a row carrying two or three lines of its own
}

export default function Row({
  to = null,
  onClick = null,
  padding = 'md',
  className,
  children,
  ...rest
}) {
  const interactive = !!(to || onClick)
  const Tag = to ? Link : onClick ? 'button' : 'div'
  const tagProps = to ? { to } : onClick ? { type: 'button', onClick } : {}
  return (
    <Tag
      {...tagProps}
      className={cn(
        'block w-full text-left border-b border-border-default',
        PADDINGS[padding] ?? padding,
        interactive && 'focus-ring press',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}
